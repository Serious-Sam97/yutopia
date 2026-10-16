"use client";

import {
  type LocalTrackPublication,
  type Participant,
  type RemoteAudioTrack,
  type RemoteTrack,
  type RemoteTrackPublication,
  Room,
  RoomEvent,
  Track,
  type TrackPublication,
  VideoPresets,
} from "livekit-client";
import { prefs } from "@/lib/prefs";
import { mixer } from "./audio";

interface VoiceChain {
  track: RemoteAudioTrack;
  gain: GainNode; // distance
  pan: StereoPannerNode; // left/right
  vol: GainNode; // mixer: master × voices
  el: HTMLMediaElement;
}

export interface MediaEvents {
  onTracksChanged: (info: { mic: boolean; cam: boolean; screen: boolean; tracks: string[] }) => void;
  onVideo: (uid: string, el: HTMLVideoElement | null, kind: "camera" | "screen") => void;
  onSpeaking: (on: boolean) => void;
  onState: (s: { ready: boolean; offline: boolean; asleep: boolean }) => void;
  onQuality?: (q: string) => void;
  // a game room TV's picture (its LiveKit participant "tv-<console id>"), or null when it stops
  onTv?: (identity: string, el: HTMLVideoElement | null) => void;
}

// A game room TV: everyone takes its picture; its sound comes only to those the
// TV's host lets in (in earshot), its volume set like a voice's (setVoice).
const isTv = (identity: string) => identity.startsWith("tv-");

// The device picked in Settings, if this browser still has it (Firefox hands out
// new ids each session unless the permission is remembered): otherwise the default.
async function picked(kind: MediaDeviceKind, id: string): Promise<string | undefined> {
  if (!id) return undefined;
  const all = await navigator.mediaDevices?.enumerateDevices().catch(() => []);
  return all?.some((d) => d.kind === kind && d.deviceId === id) ? id : undefined;
}

// LiveKit wrapper. We never subscribe ourselves: the world-server subscribes us
// to the people in range (canSubscribe=false in our token). We only attach what
// arrives and give each voice its own gain + stereo pan.
export class Media {
  room: Room | null = null;
  private voices = new Map<string, VoiceChain>(); // uid → chain
  private videos = new Map<string, HTMLVideoElement>(); // "uid:camera" / "uid:screen" → element
  private speaking = false;
  private hearUids = new Set<string>();
  private heardBy: string[] = [];
  private screenStopped: (() => void) | null = null;

  private offPrefs: () => void;

  constructor(private readonly ev: MediaEvents) {
    this.offPrefs = mixer.onChange(() => {
      const ctx = mixer.ctx;
      if (!ctx) return;
      for (const v of this.voices.values()) v.vol.gain.setTargetAtTime(mixer.voiceLevel(), ctx.currentTime, 0.05);
    });
  }

  // ── the line to the voice server, and its sleep ─────────────────────────
  // "on" while connected; "asleep" after a quiet spell (nothing of mine is
  // live, nobody's near: controller.superviseMedia) — the connection is closed
  // and opens again on demand (wake: someone near, I unmute, a call…);
  // "failed" when the server couldn't be reached at all (the old offline).
  private state: "idle" | "connecting" | "on" | "sleeping" | "asleep" | "failed" = "idle";
  private creds: { url: string; token: string; iceServers: RTCIceServer[] } | null = null;
  // (a fresh token when the one we have is getting old; set by the controller)
  refreshCreds: (() => Promise<{ url: string; token: string; iceServers: RTCIceServer[] } | null>) | null = null;
  private op: Promise<unknown> = Promise.resolve(); // opens / closes, one at a time
  private tvs = new Set<string>(); // game TVs whose picture I have
  private turningOn = 0; // a mic / camera / screen being switched on right now: no sleep meanwhile
  asleep(): boolean {
    return this.state === "asleep" || this.state === "sleeping";
  }
  on(): boolean {
    return this.state === "on";
  }
  private queue<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.op.then(fn, fn);
    this.op = p.catch(() => {});
    return p;
  }

  async connect(url: string, token: string, iceServers: RTCIceServer[] = []) {
    this.creds = { url, token, iceServers };
    return this.queue(() => this.open(false));
  }

  // Close the line for now (nothing of mine is live: mic, camera and screen are off).
  sleep(): Promise<void> {
    if (this.state !== "on" || this.turningOn > 0) return Promise.resolve();
    this.state = "sleeping";
    return this.queue(async () => {
      if (this.state !== "sleeping") return;
      // (something started switching on while this waited its turn: stay up)
      if (this.turningOn > 0) {
        this.state = "on";
        return;
      }
      await this.close();
      this.state = "asleep";
      this.ev.onState({ ready: true, offline: false, asleep: true });
    });
  }

  // Open it again (true once connected). Safe to call any time.
  wake(): Promise<boolean> {
    return this.queue(async () => {
      if (this.state === "on" || this.state === "connecting") return this.room !== null;
      if (this.state !== "asleep") return false;
      const fresh = (await this.refreshCreds?.().catch(() => null)) ?? null;
      if (fresh) this.creds = fresh;
      return this.open(true);
    });
  }

  private async open(fromSleep: boolean): Promise<boolean> {
    if (!this.creds) return false;
    const { url, token, iceServers } = this.creds;
    this.state = "connecting";
    const ctx = mixer.ensure();
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      webAudioMix: { audioContext: ctx },
      audioCaptureDefaults: {
        echoCancellation: true,
        noiseSuppression: prefs().noiseSuppression,
        autoGainControl: true,
      },
      videoCaptureDefaults: { resolution: VideoPresets.h360.resolution },
      publishDefaults: {
        simulcast: true,
        videoSimulcastLayers: [VideoPresets.h180],
        // (no stopMicTrackOnMute: re-opening the mic on every unmute failed in real
        // browsers; a muted mic is let go when the line sleeps instead)
      },
    });
    this.room = room;
    // (every handler belongs to this room only: a closed one says nothing more)
    const mine = () => this.room === room;
    room
      .on(RoomEvent.TrackPublished, (pub, p) => {
        if (mine()) pub.setSubscribed(isTv(p.identity) || this.hearUids.has(p.identity));
      })
      .on(RoomEvent.ParticipantConnected, () => {
        if (mine()) this.applySubscriptions();
      })
      .on(RoomEvent.TrackSubscribed, (t, pub, p) => {
        if (mine()) this.attach(t, pub, p);
      })
      .on(RoomEvent.TrackUnsubscribed, (t, _pub, p) => {
        if (mine()) this.detach(t, p);
      })
      // camera off = a muted track (still published): hide it until it's back on
      .on(RoomEvent.TrackMuted, (pub, p) => {
        if (mine()) this.videoMuted(pub, p, true);
      })
      .on(RoomEvent.TrackUnmuted, (pub, p) => {
        if (mine()) this.videoMuted(pub, p, false);
      })
      .on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
        if (!mine()) return;
        const on = speakers.some((s) => s.identity === room.localParticipant.identity);
        if (on !== this.speaking) {
          this.speaking = on;
          this.ev.onSpeaking(on);
        }
      })
      .on(RoomEvent.ConnectionQualityChanged, (q, p) => {
        if (mine() && p.identity === room.localParticipant.identity) this.ev.onQuality?.(String(q));
      })
      .on(RoomEvent.LocalTrackPublished, () => {
        if (mine()) this.report();
      })
      .on(RoomEvent.LocalTrackUnpublished, () => {
        if (mine()) this.report();
      })
      .on(RoomEvent.Reconnecting, () => {
        if (mine()) this.ev.onState({ ready: false, offline: false, asleep: false });
      })
      .on(RoomEvent.Reconnected, () => {
        if (!mine()) return;
        this.ev.onState({ ready: true, offline: false, asleep: false });
        this.report();
      })
      .on(RoomEvent.Disconnected, () => {
        if (!mine()) return;
        this.state = "failed";
        this.ev.onState({ ready: false, offline: true, asleep: false });
      });
    try {
      await room.connect(url, token, {
        autoSubscribe: false,
        // Ours replace LiveKit's own ICE servers, so only pass them when we have some.
        ...(iceServers.length ? { rtcConfig: { iceServers } } : {}),
      });
      if (!mine()) return false;
      this.state = "on";
      this.ev.onState({ ready: true, offline: false, asleep: false });
      this.report();
      this.applySubscriptions();
      void this.applyPermissions();
      return true;
    } catch (e) {
      console.warn("[media] LiveKit connect failed", e);
      if (!mine()) return false;
      this.room = null;
      void room.disconnect().catch(() => {});
      // waking up and the server's not there: stay asleep, try again later; at the start: offline
      this.state = fromSleep ? "asleep" : "failed";
      this.ev.onState(
        fromSleep ? { ready: true, offline: false, asleep: true } : { ready: false, offline: true, asleep: false },
      );
      return false;
    }
  }

  // Let go of the connection and of everything that came through it.
  private async close() {
    const room = this.room;
    if (!room) return;
    this.room = null;
    for (const v of this.voices.values()) {
      v.el.remove();
      v.gain.disconnect();
      v.pan.disconnect();
      v.vol.disconnect();
    }
    this.voices.clear();
    for (const key of [...this.videos.keys()]) {
      const [uid, kind] = key.split(":");
      this.ev.onVideo(uid, null, kind === "screen" ? "screen" : "camera");
    }
    this.videos.clear();
    for (const id of this.tvs) this.ev.onTv?.(id, null);
    this.tvs.clear();
    if (this.speaking) {
      this.speaking = false;
      this.ev.onSpeaking(false);
    }
    this.meter = null;
    this.screenStopped?.();
    this.screenStopped = null;
    await room.disconnect(true).catch(() => {});
    this.ev.onTracksChanged({ mic: false, cam: false, screen: false, tracks: [] });
  }

  private attach(track: RemoteTrack, pub: RemoteTrackPublication, p: Participant) {
    const uid = p.identity;
    if (track.kind === Track.Kind.Audio) {
      const ctx = mixer.ensure();
      const gain = ctx.createGain();
      const pan = ctx.createStereoPanner();
      const vol = ctx.createGain();
      gain.gain.value = 0;
      vol.gain.value = mixer.voiceLevel();
      const audio = track as RemoteAudioTrack;
      // LiveKit wires source → plugins → destination (and rewires on reconnect)
      audio.setWebAudioPlugins([gain, pan, vol]);
      const el = audio.attach();
      el.muted = false;
      if (prefs().speakerId && "setSinkId" in AudioContext.prototype) {
        (ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> })
          .setSinkId?.(prefs().speakerId)
          .catch(() => {});
      }
      // (a phone on speaker: the far side of their call, from where they stand — world/phone/call.ts)
      const key =
        pub.source === Track.Source.ScreenShareAudio
          ? `${uid}:screen`
          : pub.trackName === "phone-speaker"
            ? `${uid}:phone`
            : uid;
      this.voices.get(key)?.el.remove();
      this.voices.set(key, { track: audio, gain, pan, vol, el });
    } else if (track.kind === Track.Kind.Video) {
      const el = track.attach() as HTMLVideoElement;
      el.muted = true;
      el.playsInline = true;
      if (isTv(uid)) {
        this.tvs.add(uid);
        return this.ev.onTv?.(uid, el);
      }
      const kind = pub.source === Track.Source.ScreenShare ? "screen" : "camera";
      this.videos.set(`${uid}:${kind}`, el);
      this.ev.onVideo(uid, pub.isMuted ? null : el, kind);
    }
  }

  private videoMuted(pub: TrackPublication, p: Participant, muted: boolean) {
    if (pub.kind !== Track.Kind.Video || p === this.room?.localParticipant) return;
    const kind = pub.source === Track.Source.ScreenShare ? "screen" : "camera";
    const el = this.videos.get(`${p.identity}:${kind}`);
    if (el) this.ev.onVideo(p.identity, muted ? null : el, kind);
  }

  private detach(track: RemoteTrack, p: Participant) {
    const uid = p.identity;
    if (track.kind === Track.Kind.Audio) {
      for (const key of [uid, `${uid}:screen`, `${uid}:phone`]) {
        const v = this.voices.get(key);
        if (v && v.track === track) {
          v.el.remove();
          v.gain.disconnect();
          v.pan.disconnect();
          v.vol.disconnect();
          this.voices.delete(key);
        }
      }
    } else if (isTv(uid)) {
      for (const el of track.detach()) el.remove();
      this.tvs.delete(uid);
      this.ev.onTv?.(uid, null);
    } else {
      const isScreen = track.source === Track.Source.ScreenShare;
      this.videos.delete(`${uid}:${isScreen ? "screen" : "camera"}`);
      for (const el of track.detach()) el.remove();
      this.ev.onVideo(uid, null, isScreen ? "screen" : "camera");
    }
  }

  // From the world-server: whom I may listen to, and who may listen to me.
  setHearing(hear: Set<string>, heardBy: string[]) {
    this.hearUids = hear;
    const changed = heardBy.join(",") !== this.heardBy.join(",");
    this.heardBy = heardBy;
    this.applySubscriptions();
    if (changed) void this.applyPermissions();
  }

  private applySubscriptions() {
    if (!this.room) return;
    for (const p of this.room.remoteParticipants.values()) {
      const want = isTv(p.identity) || this.hearUids.has(p.identity);
      for (const pub of p.trackPublications.values()) if (pub.isDesired !== want) pub.setSubscribed(want);
    }
  }

  // Enforced at the SFU: nobody outside `heardBy` can subscribe to my tracks.
  private async applyPermissions() {
    const lp = this.room?.localParticipant;
    if (!lp || this.room?.state !== "connected") return;
    lp.setTrackSubscriptionPermissions(
      false,
      this.heardBy.map((id) => ({ participantIdentity: id, allowAll: true })),
    );
  }

  // The world's own audio context (voices, music): the game room's emulator
  // leaves it alone when it taps its console's sound.
  audioContext(): BaseAudioContext | null {
    return mixer.ctx;
  }

  // Called every frame-ish from the world: volume and stereo position per voice.
  setVoice(uid: string, gain: number, pan: number) {
    const ctx = mixer.ctx;
    if (!ctx) return;
    const spatial = prefs().spatial;
    for (const key of [uid, `${uid}:screen`, `${uid}:phone`]) {
      const v = this.voices.get(key);
      if (!v) continue;
      v.gain.gain.setTargetAtTime(gain, ctx.currentTime, 0.08);
      v.pan.pan.setTargetAtTime(spatial ? pan * 0.85 : 0, ctx.currentTime, 0.08);
    }
  }

  // My mic's level, 0…1 (the dock's meter): an analyser on the published track.
  private meter: { id: string; an: AnalyserNode; buf: Uint8Array<ArrayBuffer> } | null = null;
  micLevel(): number {
    const pub = this.room?.localParticipant.getTrackPublication(Track.Source.Microphone);
    const mst = pub && !pub.isMuted ? pub.track?.mediaStreamTrack : undefined;
    const ctx = mixer.ctx;
    if (!mst || !ctx || mst.readyState !== "live") return 0;
    if (this.meter?.id !== mst.id) {
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      ctx.createMediaStreamSource(new MediaStream([mst])).connect(an);
      this.meter = { id: mst.id, an, buf: new Uint8Array(an.fftSize) };
    }
    const { an, buf } = this.meter;
    an.getByteTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) sum += ((v - 128) / 128) ** 2;
    return Math.min(1, Math.sqrt(sum / buf.length) * 4);
  }

  async setMic(on: boolean): Promise<string | null> {
    if (on) this.turningOn++;
    try {
      return await this.setMicNow(on);
    } finally {
      if (on) this.turningOn--;
    }
  }
  private async setMicNow(on: boolean): Promise<string | null> {
    // asleep (or still waking): turning something on waits for the line first
    if (this.asleep() || this.state === "connecting") {
      if (!on) return null;
      if (!(await this.wake())) return "offline";
    }
    if (!this.room) return "offline";
    try {
      await mixer.resume();
      await this.room.localParticipant.setMicrophoneEnabled(on, {
        deviceId: on ? await picked("audioinput", prefs().micId) : undefined,
        noiseSuppression: prefs().noiseSuppression,
        echoCancellation: true,
        autoGainControl: true,
      });
      this.report();
      return null;
    } catch (e) {
      this.report();
      return (e as Error).name === "NotAllowedError" ? "blocked" : (e as Error).message;
    }
  }

  async setCam(on: boolean): Promise<string | null> {
    if (on) this.turningOn++;
    try {
      return await this.setCamNow(on);
    } finally {
      if (on) this.turningOn--;
    }
  }
  private async setCamNow(on: boolean): Promise<string | null> {
    // asleep (or still waking): turning something on waits for the line first
    if (this.asleep() || this.state === "connecting") {
      if (!on) return null;
      if (!(await this.wake())) return "offline";
    }
    if (!this.room) return "offline";
    try {
      await this.room.localParticipant.setCameraEnabled(on, {
        deviceId: on ? await picked("videoinput", prefs().camId) : undefined,
        resolution: VideoPresets.h360.resolution,
      });
      this.report();
      return null;
    } catch (e) {
      this.report();
      return (e as Error).name === "NotAllowedError" ? "blocked" : (e as Error).message;
    }
  }

  async setScreen(on: boolean): Promise<string | null> {
    if (on) this.turningOn++;
    try {
      return await this.setScreenNow(on);
    } finally {
      if (on) this.turningOn--;
    }
  }
  private async setScreenNow(on: boolean): Promise<string | null> {
    // asleep (or still waking): turning something on waits for the line first
    if (this.asleep() || this.state === "connecting") {
      if (!on) return null;
      if (!(await this.wake())) return "offline";
    }
    if (!this.room) return "offline";
    try {
      const pub: LocalTrackPublication | undefined = await this.room.localParticipant.setScreenShareEnabled(on, {
        audio: true,
        contentHint: "detail",
      });
      if (on && pub?.track) {
        const t = pub.track.mediaStreamTrack;
        const end = () => void this.setScreen(false);
        t.addEventListener("ended", end);
        this.screenStopped = () => t.removeEventListener("ended", end);
      } else {
        this.screenStopped?.();
        this.screenStopped = null;
      }
      this.report();
      return null;
    } catch (e) {
      this.report();
      // closing the picker is a NotAllowedError too: that one's not a problem.
      // The system refusing (macOS without Screen Recording for the browser)
      // says so in its message.
      const err = e as Error;
      if (err.name === "NotAllowedError") return /system/i.test(err.message) ? "system" : null;
      if (err.name === "NotReadableError") return "system";
      return err.message || err.name;
    }
  }

  localVideo(kind: "camera" | "screen"): HTMLVideoElement | null {
    const pub = this.room?.localParticipant.getTrackPublication(
      kind === "camera" ? Track.Source.Camera : Track.Source.ScreenShare,
    );
    if (!pub?.track) return null;
    const el = pub.track.attach() as HTMLVideoElement;
    el.muted = true;
    return el;
  }

  async switchDevice(kind: "audioinput" | "videoinput" | "audiooutput", id: string) {
    await this.room?.switchActiveDevice(kind, id).catch(() => {});
  }

  private report() {
    const lp = this.room?.localParticipant;
    if (!lp) return;
    const tracks = [...lp.trackPublications.values()].filter((p) => p.track && !p.isMuted).map((p) => p.trackSid);
    this.ev.onTracksChanged({
      mic: lp.isMicrophoneEnabled,
      cam: lp.isCameraEnabled,
      screen: lp.isScreenShareEnabled,
      tracks,
    });
  }

  async disconnect() {
    this.offPrefs();
    this.state = "idle";
    this.creds = null;
    await this.queue(() => this.close());
  }
}
