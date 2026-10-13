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
  onState: (s: { ready: boolean; offline: boolean }) => void;
  onQuality?: (q: string) => void;
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

  async connect(url: string, token: string, iceServers: RTCIceServer[] = []) {
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
      publishDefaults: { simulcast: true, videoSimulcastLayers: [VideoPresets.h180] },
    });
    this.room = room;
    room
      .on(RoomEvent.TrackPublished, (pub, p) => pub.setSubscribed(this.hearUids.has(p.identity)))
      .on(RoomEvent.ParticipantConnected, () => this.applySubscriptions())
      .on(RoomEvent.TrackSubscribed, (t, pub, p) => this.attach(t, pub, p))
      .on(RoomEvent.TrackUnsubscribed, (t, _pub, p) => this.detach(t, p))
      // camera off = a muted track (still published): hide it until it's back on
      .on(RoomEvent.TrackMuted, (pub, p) => this.videoMuted(pub, p, true))
      .on(RoomEvent.TrackUnmuted, (pub, p) => this.videoMuted(pub, p, false))
      .on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
        const on = speakers.some((s) => s.identity === room.localParticipant.identity);
        if (on !== this.speaking) {
          this.speaking = on;
          this.ev.onSpeaking(on);
        }
      })
      .on(RoomEvent.ConnectionQualityChanged, (q, p) => {
        if (p.identity === room.localParticipant.identity) this.ev.onQuality?.(String(q));
      })
      .on(RoomEvent.LocalTrackPublished, () => this.report())
      .on(RoomEvent.LocalTrackUnpublished, () => this.report())
      .on(RoomEvent.Reconnecting, () => this.ev.onState({ ready: false, offline: false }))
      .on(RoomEvent.Reconnected, () => {
        this.ev.onState({ ready: true, offline: false });
        this.report();
      })
      .on(RoomEvent.Disconnected, () => this.ev.onState({ ready: false, offline: true }));
    try {
      await room.connect(url, token, {
        autoSubscribe: false,
        // Ours replace LiveKit's own ICE servers, so only pass them when we have some.
        ...(iceServers.length ? { rtcConfig: { iceServers } } : {}),
      });
      this.ev.onState({ ready: true, offline: false });
      this.report();
      this.applySubscriptions();
      void this.applyPermissions();
    } catch (e) {
      console.warn("[media] LiveKit connect failed", e);
      this.ev.onState({ ready: false, offline: true });
    }
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
      const key = pub.source === Track.Source.ScreenShareAudio ? `${uid}:screen` : uid;
      this.voices.get(key)?.el.remove();
      this.voices.set(key, { track: audio, gain, pan, vol, el });
    } else if (track.kind === Track.Kind.Video) {
      const el = track.attach() as HTMLVideoElement;
      el.muted = true;
      el.playsInline = true;
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
      for (const key of [uid, `${uid}:screen`]) {
        const v = this.voices.get(key);
        if (v && v.track === track) {
          v.el.remove();
          v.gain.disconnect();
          v.pan.disconnect();
          v.vol.disconnect();
          this.voices.delete(key);
        }
      }
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
      const want = this.hearUids.has(p.identity);
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

  // Called every frame-ish from the world: volume and stereo position per voice.
  setVoice(uid: string, gain: number, pan: number) {
    const ctx = mixer.ctx;
    if (!ctx) return;
    const spatial = prefs().spatial;
    for (const key of [uid, `${uid}:screen`]) {
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
    if (!this.room) return "offline";
    try {
      await mixer.resume();
      await this.room.localParticipant.setMicrophoneEnabled(on, {
        deviceId: prefs().micId || undefined,
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
    if (!this.room) return "offline";
    try {
      await this.room.localParticipant.setCameraEnabled(on, {
        deviceId: prefs().camId || undefined,
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
    for (const v of this.voices.values()) v.el.remove();
    this.voices.clear();
    await this.room?.disconnect();
    this.room = null;
  }
}
