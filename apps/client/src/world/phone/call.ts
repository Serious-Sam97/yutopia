"use client";

import type { ServerMessages } from "@yutopia/shared";
import {
  createLocalAudioTrack,
  createLocalVideoTrack,
  LocalAudioTrack,
  LocalVideoTrack,
  type RemoteAudioTrack,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
  Room,
  RoomEvent,
  Track,
} from "livekit-client";
import { tr } from "@/lib/i18n";
import { mixer } from "../audio";
import { hud } from "../store";
import type { Phone } from ".";
import { LineTone, Ringer, ui } from "./sounds";
import { type CallView, phone, top } from "./store";

// Calls (docs/plan/21-cellphone.md § 5). The world-server rings people and
// keeps who's on the line (features/phone.ts); the line itself is its own
// LiveKit room ("call-<id>"), so it reaches anyone in Yutopia, in any space,
// through any wall. The far voice comes through a phone filter; Speaker opens
// it up and lets the people near me hear it too (relayed into the space's
// room as my "phone-speaker" track, so it's positional, from me).

interface Chain {
  track: RemoteAudioTrack;
  nodes: AudioNode[];
  an: AnalyserNode;
  el: HTMLMediaElement;
}

export class Calls {
  private room: Room | null = null;
  private ringer: Ringer | null = null;
  private tone: LineTone | null = null;
  private chains = new Map<string, Chain>(); // uid → the far voice
  private videos = new Map<string, HTMLVideoElement>(); // uid → their camera
  private myVideo: HTMLVideoElement | null = null;
  private camTrack: LocalVideoTrack | null = null;
  private relay: MediaStreamAudioDestinationNode | null = null;
  private relayTrack: LocalAudioTrack | null = null;
  private clearTimer: ReturnType<typeof setTimeout> | null = null;
  private levelBuf = new Uint8Array(256);
  version = 0; // bumps when a video comes or goes (the call screen redraws)
  private videoSubs = new Set<() => void>();

  constructor(private readonly ph: Phone) {}

  destroy() {
    this.stopSounds();
    void this.hangupLocal();
  }

  private set(patch: Partial<CallView>) {
    phone.set((s) => (s.call ? { call: { ...s.call, ...patch } } : {}));
    this.ph.pose();
  }

  // ── from me ──────────────────────────────────────────────────────────────
  start(uids: number[], video = false) {
    if (phone.get().call) return;
    if (uids.length === 1 && uids[0] === 0) return this.ph.vortex.call();
    const ctl = this.ph.ctl;
    if (!ctl.media.room || hudOffline()) return this.ph.note(tr("phNoLine"), 3500);
    const peers = uids.map((uid) => ({
      uid,
      name: this.ph.nameOf(uid),
      avatar: this.ph.avatarOf(uid),
      space: this.ph.contact(uid)?.space ?? "",
      state: "ringing" as const,
    }));
    phone.set({
      call: {
        id: "",
        phase: "dialing",
        outgoing: true,
        video,
        from: phone.get().me.uid,
        peers,
        startedAt: 0,
        muted: false,
        speaker: false,
        camOn: video,
        level: 0,
      },
    });
    this.showCall();
    ctl.send("call:start", { to: uids, video });
  }

  answer() {
    const c = phone.get().call;
    if (!c || c.phase !== "incoming") return;
    if (c.vortex) return this.ph.vortex.answer();
    this.stopSounds();
    this.ph.ctl.send("call:answer", { id: c.id });
    this.set({ phase: "live", startedAt: Date.now(), camOn: c.video });
    ui("connect", 0.6);
  }

  decline(text?: string) {
    const c = phone.get().call;
    if (!c || c.phase !== "incoming") return;
    if (c.vortex) return this.ph.vortex.decline();
    this.stopSounds();
    this.ph.ctl.send("call:decline", { id: c.id });
    if (text)
      void this.ph.openThreadWith([c.from]).then(() => {
        const t = phone.get().threads.find((x) => x.kind === "direct" && x.members[0] === c.from);
        if (t) void this.ph.send(t.id, text);
      });
    this.ended("declined");
  }

  hangup() {
    const c = phone.get().call;
    if (!c) return;
    if (c.vortex) return this.ph.vortex.hangup();
    if (c.id) this.ph.ctl.send("call:end", { id: c.id });
    this.ended(c.phase === "live" ? "answered" : "cancelled");
  }

  add(uid: number) {
    const c = phone.get().call;
    if (c?.id && c.phase === "live") this.ph.ctl.send("call:add", { id: c.id, uid });
  }

  async toggleMute() {
    const c = phone.get().call;
    if (!c) return;
    const muted = !c.muted;
    this.set({ muted });
    await this.room?.localParticipant.setMicrophoneEnabled(!muted).catch(() => {});
    ui("toggle", 0.5);
  }

  toggleSpeaker() {
    const c = phone.get().call;
    if (!c) return;
    const speaker = !c.speaker;
    this.set({ speaker });
    for (const ch of this.chains.values()) this.wire(ch.track, ch, speaker);
    void this.setRelay(speaker);
    ui("toggle", 0.5);
  }

  async toggleCam() {
    const c = phone.get().call;
    if (!c || c.vortex) return;
    const camOn = !c.camOn;
    this.set({ camOn });
    if (c.id) this.ph.ctl.send("call:video", { id: c.id, on: camOn });
    await this.publishCam(camOn);
    ui("toggle", 0.5);
  }

  // ── from the world-server ────────────────────────────────────────────────
  onRing(m: ServerMessages["call:ring"]) {
    const cur = phone.get().call;
    if (cur && cur.phase !== "ended") return; // (the server keeps one call per person)
    if (this.clearTimer) clearTimeout(this.clearTimer);
    const me = phone.get().me.uid;
    phone.set({
      call: {
        id: m.id,
        phase: "incoming",
        outgoing: false,
        video: m.video,
        from: m.from,
        peers: m.members.filter((p) => p.uid !== me),
        startedAt: 0,
        muted: false,
        speaker: false,
        camOn: false,
        level: 0,
      },
    });
    if (!this.ph.sleeping())
      this.ringer = new Ringer(this.ph.ringtoneFor(m.from), 0.9, 0, phone.get().settings.vibrate);
    // the phone comes up by itself, GTA-style
    this.showCall();
  }

  onUpdate(m: ServerMessages["call:update"]) {
    const c = phone.get().call;
    if (!c || (c.id && c.id !== m.id)) return;
    const me = phone.get().me.uid;
    const peers = m.members.filter((p) => p.uid !== me);
    if (m.phase === "ended") return this.ended(m.end ?? "answered", peers);
    if (m.phase === "ringing" && c.phase === "dialing") {
      this.tone?.stop();
      this.tone = new LineTone("ringback");
    }
    const live = m.phase === "live";
    if (live && c.phase !== "live") {
      this.stopSounds();
      ui("connect", 0.6);
    }
    this.set({
      id: m.id,
      peers,
      phase: live ? "live" : c.phase === "incoming" ? "incoming" : "ringing",
      startedAt: live ? c.startedAt || Date.now() : 0,
    });
  }

  async onJoin(m: ServerMessages["call:join"]) {
    const c = phone.get().call;
    const s = this.ph.ctl.session;
    if (!c || c.id !== m.id || !s || !m.token) return;
    await this.hangupLocal();
    const ctx = mixer.ensure();
    const room = new Room({
      adaptiveStream: true,
      dynacast: true,
      webAudioMix: { audioContext: ctx },
      audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    this.room = room;
    room
      .on(RoomEvent.TrackSubscribed, (t, pub, p) => this.attach(t, pub, p))
      .on(RoomEvent.TrackUnsubscribed, (t, _pub, p) => this.detach(t, p))
      .on(RoomEvent.TrackMuted, (pub, p) => {
        if (pub.kind === Track.Kind.Video) this.setVideo(p.identity, null);
      })
      .on(RoomEvent.TrackUnmuted, (pub, p) => {
        if (pub.kind === Track.Kind.Video && pub.track)
          this.setVideo(p.identity, pub.track.attach() as HTMLVideoElement);
      });
    try {
      await room.connect(
        s.livekitUrl,
        m.token,
        s.iceServers?.length ? { rtcConfig: { iceServers: s.iceServers } } : {},
      );
      // my mic on the line: the same microphone the world hears (a copy of it)
      const mine = this.ph.ctl.media.room?.localParticipant.getTrackPublication(Track.Source.Microphone)?.track;
      const track = mine?.mediaStreamTrack
        ? new LocalAudioTrack(mine.mediaStreamTrack.clone(), undefined, false)
        : await createLocalAudioTrack({ echoCancellation: true, noiseSuppression: true });
      await room.localParticipant.publishTrack(track, { source: Track.Source.Microphone });
      if (c.muted) await room.localParticipant.setMicrophoneEnabled(false);
      if (phone.get().call?.camOn) await this.publishCam(true);
    } catch (e) {
      console.warn("[phone] call line", e);
      this.ph.note(tr("phNoLine"), 3500);
    }
  }

  // ── the far voices ───────────────────────────────────────────────────────
  private attach(track: RemoteTrack, _pub: RemoteTrackPublication, p: RemoteParticipant) {
    if (track.kind === Track.Kind.Video) {
      this.setVideo(p.identity, track.attach() as HTMLVideoElement);
      return;
    }
    if (track.kind !== Track.Kind.Audio) return;
    const ctx = mixer.ensure();
    const an = ctx.createAnalyser();
    an.fftSize = 256;
    const audio = track as RemoteAudioTrack;
    const el = audio.attach();
    el.muted = false;
    const ch: Chain = { track: audio, nodes: [], an, el };
    this.chains.get(p.identity)?.el.remove();
    this.chains.set(p.identity, ch);
    this.wire(audio, ch, !!phone.get().call?.speaker);
  }
  // through the phone (band-limited, a little crunch) or the speaker (full)
  private wire(audio: RemoteAudioTrack, ch: Chain, speaker: boolean) {
    const ctx = mixer.ensure();
    for (const n of ch.nodes) n.disconnect();
    const vol = ctx.createGain();
    vol.gain.value = mixer.voiceLevel() * (speaker ? 1.1 : 1);
    let nodes: AudioNode[];
    if (speaker) nodes = [vol];
    else {
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 320;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 3400;
      const sh = ctx.createWaveShaper();
      sh.curve = crunch();
      nodes = [hp, lp, sh, vol];
    }
    ch.nodes = nodes;
    vol.connect(ch.an);
    if (this.relay) vol.connect(this.relay);
    audio.setWebAudioPlugins(nodes);
  }
  private detach(track: RemoteTrack, p: RemoteParticipant) {
    if (track.kind === Track.Kind.Video) {
      for (const el of track.detach()) el.remove();
      this.setVideo(p.identity, null);
      return;
    }
    const ch = this.chains.get(p.identity);
    if (ch && ch.track === track) {
      ch.el.remove();
      for (const n of ch.nodes) n.disconnect();
      this.chains.delete(p.identity);
    }
  }

  // Speaker on: the far voices also go out into the room, from me.
  private async setRelay(on: boolean) {
    const space = this.ph.ctl.media.room;
    if (!on) {
      if (this.relayTrack && space) await space.localParticipant.unpublishTrack(this.relayTrack).catch(() => {});
      this.relayTrack?.stop();
      this.relayTrack = null;
      this.relay = null;
      return;
    }
    if (!space || this.relayTrack) return;
    const ctx = mixer.ensure();
    this.relay = ctx.createMediaStreamDestination();
    for (const ch of this.chains.values()) ch.nodes[ch.nodes.length - 1]?.connect(this.relay);
    const mst = this.relay.stream.getAudioTracks()[0];
    if (!mst) return;
    this.relayTrack = new LocalAudioTrack(mst, undefined, false);
    await space.localParticipant
      .publishTrack(this.relayTrack, { name: "phone-speaker", source: Track.Source.Unknown, dtx: false })
      .catch(() => {});
  }

  // ── video ────────────────────────────────────────────────────────────────
  private async publishCam(on: boolean) {
    const room = this.room;
    if (!room) return;
    if (!on) {
      if (this.camTrack) await room.localParticipant.unpublishTrack(this.camTrack).catch(() => {});
      this.camTrack?.stop();
      this.camTrack = null;
      this.myVideo = null;
      this.bump();
      return;
    }
    if (this.camTrack) return;
    try {
      const world = this.ph.ctl.media.room?.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
      this.camTrack =
        world?.mediaStreamTrack && world.mediaStreamTrack.readyState === "live"
          ? new LocalVideoTrack(world.mediaStreamTrack.clone(), undefined, false)
          : await createLocalVideoTrack({ resolution: { width: 640, height: 480 } });
      await room.localParticipant.publishTrack(this.camTrack, { source: Track.Source.Camera });
      const el = this.camTrack.attach() as HTMLVideoElement;
      el.muted = true;
      el.playsInline = true;
      this.myVideo = el;
    } catch {
      this.set({ camOn: false });
    }
    this.bump();
  }
  private setVideo(uid: string, el: HTMLVideoElement | null) {
    if (el) {
      el.muted = true;
      el.playsInline = true;
      this.videos.set(uid, el);
    } else this.videos.delete(uid);
    this.bump();
  }
  private bump() {
    this.version++;
    for (const f of this.videoSubs) f();
  }
  onVideos(f: () => void) {
    this.videoSubs.add(f);
    return () => {
      this.videoSubs.delete(f);
    };
  }
  videoOf(uid: number): HTMLVideoElement | null {
    return this.videos.get(String(uid)) ?? null;
  }
  myCamera(): HTMLVideoElement | null {
    return this.myVideo;
  }

  // ── the end ──────────────────────────────────────────────────────────────
  private ended(end: string, peers?: CallView["peers"]) {
    this.stopSounds();
    void this.hangupLocal();
    const c = phone.get().call;
    if (!c || c.phase === "ended") return;
    phone.set({ call: { ...c, phase: "ended", end, ...(peers ? { peers } : {}) } });
    this.ph.pose();
    if (end === "busy") {
      this.tone = new LineTone("busy");
      setTimeout(() => this.stopSounds(), 2400);
    } else ui("end", 0.7);
    if (this.clearTimer) clearTimeout(this.clearTimer);
    this.clearTimer = setTimeout(() => {
      if (phone.get().call?.phase !== "ended") return;
      const p = phone.get();
      phone.set({ call: null, stack: p.stack.filter((s) => s.app !== "call"), sel: 0 });
      if (
        p.stack.length <= 1 ||
        (top(p).app === "call" && p.stack.length === 2 && p.stack[0].app === "home" && !p.open)
      )
        phone.set({ stack: [{ app: "home" }] });
      this.ph.pose();
    }, 2200);
  }

  private stopSounds() {
    this.ringer?.stop();
    this.ringer = null;
    this.tone?.stop();
    this.tone = null;
  }

  private async hangupLocal() {
    await this.setRelay(false);
    this.camTrack?.stop();
    this.camTrack = null;
    this.myVideo = null;
    for (const ch of this.chains.values()) {
      ch.el.remove();
      for (const n of ch.nodes) n.disconnect();
    }
    this.chains.clear();
    this.videos.clear();
    const r = this.room;
    this.room = null;
    if (r) await r.disconnect().catch(() => {});
    this.bump();
  }

  // the call screen comes up (the phone opens if it was away)
  private showCall() {
    const p = phone.get();
    const stack = [...p.stack.filter((s) => s.app !== "call" && s.app !== "boot"), { app: "call" as const }];
    phone.set({ stack, sel: 0, booted: true });
    if (!p.open) this.ph.setOpen(true);
    else this.ph.pose();
  }

  // every frame: the far voice's level (the waveform)
  frame() {
    const c = phone.get().call;
    if (!c || c.phase !== "live" || c.vortex) return;
    let lvl = 0;
    for (const ch of this.chains.values()) {
      ch.an.getByteTimeDomainData(this.levelBuf);
      let peak = 0;
      for (const v of this.levelBuf) peak = Math.max(peak, Math.abs(v - 128));
      lvl = Math.max(lvl, peak / 128);
    }
    const level = Math.round(Math.min(1, lvl * 2.5) * 10) / 10;
    if (level !== c.level) phone.set({ call: { ...c, level } });
  }
}

let curve: Float32Array<ArrayBuffer> | null = null;
function crunch(): Float32Array<ArrayBuffer> {
  if (curve) return curve;
  const n = 1024;
  curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * 1.8) / Math.tanh(1.8);
  }
  return curve;
}

function hudOffline(): boolean {
  return hud.get().media.offline;
}
