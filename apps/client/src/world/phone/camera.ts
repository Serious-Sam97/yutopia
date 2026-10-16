"use client";

import { PHOTO_MAX_PX } from "@yutopia/shared/phone";
import { Track } from "livekit-client";
import { tr } from "@/lib/i18n";
import { mixer } from "../audio";
import { hud } from "../store";
import type { Phone } from ".";
import { phoneApi } from "./data";
import { ui } from "./sounds";
import { type CameraState, type PhotoRef, phone } from "./store";

// The camera (docs/plan/21-cellphone.md § 6). The screen becomes the
// viewfinder: the world's own view, framed by the camera's controls (the HUD
// hides). In 3D, Photo looks through your eyes (the wheel zooms) and Selfie
// puts a camera at arm's length facing you (Q / E walk it round you); in iso,
// Photo frames the view as it is and Selfie leans in on you. The shot is the
// world's own frame, filtered, saved in Yondra (the Gallery), and everyone
// near you sees the arm up and the flash.

export const FILTERS = ["none", "film", "vhs", "bw", "polaroid"] as const;
export const POSES = ["", "peace", "point", "thumbs", "wave", "heart", "laugh", "fire"] as const;
const EMOTE_POSES = new Set(["wave", "heart", "laugh", "fire"]);

export class Camera {
  private countTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly ph: Phone) {}

  private set(patch: Partial<CameraState>) {
    phone.set((s) => (s.camera ? { camera: { ...s.camera, ...patch } } : {}));
  }

  open(mode: CameraState["mode"] = "photo") {
    const p = phone.get();
    if (!p.open) this.ph.setOpen(true);
    phone.set({
      camera: {
        mode,
        video: p.camera?.video ?? false,
        rec: 0,
        filter: p.camera?.filter ?? "none",
        pose: "",
        flash: p.camera?.flash ?? false,
        timer: 0,
        count: 0,
        zoom: 1,
        last: p.photos[0] ?? null,
        busy: false,
      },
    });
    hud.set((s) => ({ phone: { ...s.phone, camera: true } }));
    // the last photo in the corner (once the Gallery's in)
    void this.ph.loadPhotos().then(() => {
      const c = phone.get().camera;
      const first = phone.get().photos.find((x) => x.id > 0);
      if (c && !c.last && first) this.set({ last: first });
    });
    this.ph.ctl.photoMode(mode);
    this.ph.pose();
    ui("open", 0.6);
  }

  close() {
    if (!phone.get().camera) return;
    if (this.rec) void this.stopRec();
    if (this.countTimer) clearInterval(this.countTimer);
    this.countTimer = null;
    this.ph.ctl.photoMode(null);
    this.ph.ctl.send("phone:pose", { pose: "" });
    phone.set({ camera: null });
    hud.set((s) => ({ phone: { ...s.phone, camera: false } }));
    this.ph.pose();
  }

  setMode(mode: CameraState["mode"]) {
    if (phone.get().camera?.mode === mode) return;
    this.set({ mode, zoom: 1 });
    this.ph.ctl.photoMode(mode);
    this.ph.pose();
    ui("toggle", 0.5);
  }
  setFilter(filter: string) {
    this.set({ filter });
    ui("tap", 0.5);
  }
  setPose(pose: string) {
    const c = phone.get().camera;
    const next = c?.pose === pose ? "" : pose;
    this.set({ pose: next });
    // the 8 emotes are the world's own gestures; the rest are phone poses
    if (EMOTE_POSES.has(next)) {
      const i = ["wave", "heart", "laugh", "clap", "fire", "question", "coffee", "tape"].indexOf(next);
      this.ph.ctl.emote(i);
      this.ph.ctl.send("phone:pose", { pose: "" });
    } else this.ph.ctl.send("phone:pose", { pose: next });
    ui("tap", 0.5);
  }
  toggleFlash() {
    this.set({ flash: !phone.get().camera?.flash });
    ui("toggle", 0.5);
  }
  cycleTimer() {
    const t = phone.get().camera?.timer ?? 0;
    this.set({ timer: t === 0 ? 3 : t === 3 ? 10 : 0 });
    ui("toggle", 0.5);
  }
  zoom(k: number) {
    const c = phone.get().camera;
    if (!c) return;
    const zoom = Math.max(1, Math.min(3, c.zoom * k));
    this.set({ zoom });
    this.ph.ctl.photoZoom(zoom);
  }

  // The keys while the viewfinder is up.
  key(e: KeyboardEvent): boolean {
    const k = e.key.toLowerCase();
    if (k === "escape" || k === "backspace") {
      this.close();
      return true;
    }
    if (k === "p") {
      this.close();
      this.ph.setOpen(false);
      return true;
    }
    if (e.repeat) return k === " " || k === "enter";
    if (k === " " || k === "enter") void this.shoot();
    else if (k === "v") this.setVideo(!phone.get().camera?.video);
    else if (k === "tab" || k === "c") this.setMode(phone.get().camera?.mode === "selfie" ? "photo" : "selfie");
    else if (k === "f") this.toggleFlash();
    else if (k === "t") this.cycleTimer();
    else if (k === "+" || k === "=") this.zoom(1.2);
    else if (k === "-") this.zoom(1 / 1.2);
    else if (k >= "1" && k <= "8") this.setPose(POSES[Number(k) - 1] ?? "");
    else if (k === "arrowleft" || k === "q") this.ph.ctl.photoTurn(-1);
    else if (k === "arrowright" || k === "e") this.ph.ctl.photoTurn(1);
    else if (k === "arrowup") this.ph.ctl.photoTilt(-1);
    else if (k === "arrowdown") this.ph.ctl.photoTilt(1);
    else return false;
    return true;
  }

  // Take it (after the self-timer, if one's set).
  // Photo or Video (the record button)
  setVideo(on: boolean) {
    const c = phone.get().camera;
    if (!c || c.video === on || c.rec) return;
    this.set({ video: on, timer: 0 });
    ui("toggle", 0.5);
  }

  async shoot() {
    const c = phone.get().camera;
    if (!c || c.busy || c.count) return;
    if (c.video) return c.rec ? this.stopRec() : this.startRec();
    if (c.timer) {
      this.set({ count: c.timer });
      this.countTimer = setInterval(() => {
        const n = (phone.get().camera?.count ?? 1) - 1;
        if (n <= 0) {
          if (this.countTimer) clearInterval(this.countTimer);
          this.countTimer = null;
          this.set({ count: 0 });
          void this.take();
        } else {
          this.set({ count: n });
          ui("tap", 0.8);
        }
      }, 1000);
      ui("tap", 0.8);
      return;
    }
    await this.take();
  }

  // ── recording ─────────────────────────────────────────────────────────
  private rec: Recording | null = null;
  private recTimer: ReturnType<typeof setTimeout> | null = null;
  startRec() {
    const c = phone.get().camera;
    if (!c || this.rec || typeof MediaRecorder === "undefined") return;
    try {
      this.rec = new Recording(this.ph, c.filter, c.mode === "selfie");
    } catch (e) {
      console.warn("[phone] can't record", e);
      return this.ph.note(tr("phRecFailed"));
    }
    this.set({ rec: Date.now() });
    this.ph.ctl.send("phone:rec", { on: true });
    ui("toggle", 0.8);
    this.recTimer = setTimeout(() => void this.stopRec(), MAX_REC_S * 1000);
  }
  async stopRec() {
    const r = this.rec;
    if (!r) return;
    this.rec = null;
    if (this.recTimer) clearTimeout(this.recTimer);
    this.ph.ctl.send("phone:rec", { on: false });
    ui("end", 0.5);
    const c = phone.get().camera;
    this.set({ rec: 0, busy: true });
    const secs = Math.max(1, Math.round((Date.now() - r.startedAt) / 1000));
    const blob = await r.stop();
    const me = hud.get().me;
    const where = [me?.areaName, hud.get().spaceName].filter(Boolean).join(" · ");
    const local: PhotoRef = {
      id: -Date.now(),
      kind: "video",
      secs,
      owner: phone.get().me.uid,
      url: URL.createObjectURL(blob),
      w: r.canvas.width,
      h: r.canvas.height,
      filter: c?.filter ?? "none",
      where,
      at: Date.now(),
      selfie: c?.mode === "selfie",
    };
    this.set({ last: local });
    try {
      const saved = await phoneApi.uploadPhoto(blob, {
        filter: local.filter,
        selfie: local.selfie,
        where,
        spaceId: this.ph.ctl.session?.space.id ?? 0,
        video: { w: local.w, h: local.h, secs },
      });
      phone.set((s) => ({ photos: [saved, ...s.photos.filter((p) => p.id !== saved.id)] }));
      if (phone.get().camera) this.set({ last: saved, busy: false });
      this.ph.note(tr("phSavedVideo"), 1600);
    } catch {
      if (phone.get().camera) this.set({ busy: false });
      this.ph.note(tr("phSaveFailed"));
    }
  }

  private async take() {
    const c = phone.get().camera;
    if (!c) return;
    this.set({ busy: true });
    ui("shutter", 0.9);
    this.ph.ctl.send("phone:shot", {});
    if (c.flash) document.dispatchEvent(new CustomEvent("phone:flash"));
    // the frame as the world shows it right now
    const shot = this.ph.ctl.snapshot();
    if (!shot) {
      this.set({ busy: false });
      return this.ph.note(tr("phSaveFailed"));
    }
    const canvas = develop(shot, c.filter, c.flash, c.mode === "selfie" ? this.ph.ctl.selfieFrame() : null);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
    const thumb = canvas.toDataURL("image/jpeg", 0.6);
    const me = hud.get().me;
    const where = [me?.areaName, hud.get().spaceName].filter(Boolean).join(" · ");
    const local: PhotoRef = {
      id: -Date.now(),
      kind: "photo",
      secs: 0,
      owner: phone.get().me.uid,
      url: thumb,
      w: canvas.width,
      h: canvas.height,
      filter: c.filter,
      where,
      at: Date.now(),
      selfie: c.mode === "selfie",
    };
    this.set({ last: local });
    if (!blob) {
      this.set({ busy: false });
      return this.ph.note(tr("phSaveFailed"));
    }
    try {
      const saved = await phoneApi.uploadPhoto(blob, {
        filter: c.filter,
        selfie: c.mode === "selfie",
        where,
        spaceId: this.ph.ctl.session?.space.id ?? 0,
      });
      phone.set((s) => ({ photos: [saved, ...s.photos.filter((p) => p.id !== saved.id)] }));
      this.set({ last: saved, busy: false });
      this.ph.note(tr("phSaved"), 1600);
    } catch {
      this.set({ busy: false });
      this.ph.note(tr("phSaveFailed"));
    }
  }
}

// ── video ──────────────────────────────────────────────────────────────────
export const MAX_REC_S = 30;
const FILTER_CSS: Record<string, string> = {
  film: "sepia(.35) saturate(1.3) contrast(1.05) brightness(1.03)",
  polaroid: "sepia(.3) saturate(1.15) brightness(1.06)",
  vhs: "saturate(1.6) contrast(1.12) hue-rotate(-10deg)",
  bw: "grayscale(1) contrast(1.22)",
};

// Records what the world shows (its own canvas, frame by frame right after
// it's drawn), with the filter, the world's sound and my mic.
class Recording {
  readonly canvas = document.createElement("canvas");
  private g: CanvasRenderingContext2D;
  private rec: MediaRecorder;
  private chunks: Blob[] = [];
  private off: () => void;
  private audio: { dest: MediaStreamAudioDestinationNode; nodes: AudioNode[] } | null = null;
  readonly startedAt = Date.now();
  readonly done: Promise<Blob>;

  constructor(
    private readonly ph: Phone,
    private readonly filter: string,
    private readonly selfie: boolean,
  ) {
    const src = ph.ctl.viewCanvas();
    const crop = this.cropOf(src);
    const k = Math.min(1, 1280 / Math.max(crop.w, crop.h));
    this.canvas.width = Math.round((crop.w * k) / 2) * 2;
    this.canvas.height = Math.round((crop.h * k) / 2) * 2;
    this.g = this.canvas.getContext("2d") as CanvasRenderingContext2D;
    const stream = this.canvas.captureStream(30);
    // the sound: the world's mix, and my voice
    const ctx = mixer.ensure();
    const dest = ctx.createMediaStreamDestination();
    const nodes: AudioNode[] = [];
    mixer.master.connect(dest);
    const mic = ph.ctl.media.room?.localParticipant.getTrackPublication(Track.Source.Microphone)?.track
      ?.mediaStreamTrack;
    if (mic && mic.readyState === "live") {
      const n = ctx.createMediaStreamSource(new MediaStream([mic]));
      n.connect(dest);
      nodes.push(n);
    }
    this.audio = { dest, nodes };
    for (const t of dest.stream.getAudioTracks()) stream.addTrack(t);
    const mime =
      [
        "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
        "video/mp4",
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
      ].find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? "";
    this.rec = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: 2_200_000 });
    this.rec.ondataavailable = (e) => {
      if (e.data.size) this.chunks.push(e.data);
    };
    this.done = new Promise((res) => {
      this.rec.onstop = () => res(new Blob(this.chunks, { type: this.rec.mimeType || "video/webm" }));
    });
    this.off = ph.ctl.onFrame(() => this.draw());
    this.draw();
    this.rec.start(1000);
  }

  private cropOf(src: HTMLCanvasElement) {
    const focus = this.selfie ? this.ph.ctl.selfieFrame() : null;
    if (focus) {
      const w = Math.min(src.width, Math.max(focus.w, focus.h * 0.8));
      const h = Math.min(src.height, w * 1.25);
      return {
        x: Math.max(0, Math.min(src.width - w, focus.x + focus.w / 2 - w / 2)),
        y: Math.max(0, Math.min(src.height - h, focus.y + focus.h / 2 - h / 2)),
        w,
        h,
      };
    }
    // 16:9 out of the middle
    let w = src.width;
    let h = src.height;
    if (w / h > 16 / 9) w = h * (16 / 9);
    else h = w / (16 / 9);
    return { x: (src.width - w) / 2, y: (src.height - h) / 2, w, h };
  }

  // (right after the world drew its frame: the drawing buffer still holds it)
  private draw() {
    const src = this.ph.ctl.viewCanvas();
    const c = this.cropOf(src);
    const g = this.g;
    const W = this.canvas.width;
    const H = this.canvas.height;
    if ("filter" in g) g.filter = FILTER_CSS[this.filter] ?? "none";
    g.drawImage(src, c.x, c.y, c.w, c.h, 0, 0, W, H);
    if ("filter" in g) g.filter = "none";
    if (this.filter === "vhs") {
      g.fillStyle = "rgba(0,0,0,.18)";
      for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
      g.font = `${Math.round(H * 0.05)}px monospace`;
      g.fillStyle = "rgba(255,255,255,.85)";
      g.fillText(`REC ● ${secsOf(Date.now() - this.startedAt)}`, W * 0.05, H * 0.1);
    }
    if (this.filter === "polaroid") {
      const b = Math.round(W * 0.03);
      g.fillStyle = "#f4efe4";
      g.fillRect(0, 0, W, b);
      g.fillRect(0, 0, b, H);
      g.fillRect(W - b, 0, b, H);
      g.fillRect(0, H - b * 2.5, W, b * 2.5);
    }
  }

  stop(): Promise<Blob> {
    this.off();
    if (this.rec.state !== "inactive") this.rec.stop();
    for (const n of this.audio?.nodes ?? []) n.disconnect();
    if (this.audio) {
      try {
        mixer.master.disconnect(this.audio.dest);
      } catch {}
    }
    return this.done;
  }
}
const secsOf = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

// ── developing the frame ───────────────────────────────────────────────────
// The world's frame, cropped to a photo's 3:2 (or around your face for a
// selfie), scaled to at most PHOTO_MAX_PX, and filtered by hand (pixel by
// pixel: ctx.filter isn't everywhere, and isn't reliable on big canvases).
export function develop(
  src: HTMLCanvasElement,
  filter: string,
  flash: boolean,
  focus: { x: number; y: number; w: number; h: number } | null,
): HTMLCanvasElement {
  let sx = 0;
  let sy = 0;
  let sw = src.width;
  let sh = src.height;
  if (focus) {
    // a selfie in iso: the box around you (canvas px), widened to 4:5
    const w = Math.min(src.width, Math.max(focus.w, focus.h * 0.8));
    const h = Math.min(src.height, w * 1.25);
    sx = Math.max(0, Math.min(src.width - w, focus.x + focus.w / 2 - w / 2));
    sy = Math.max(0, Math.min(src.height - h, focus.y + focus.h / 2 - h / 2));
    sw = w;
    sh = h;
  } else {
    // 3:2 out of the middle
    const want = 3 / 2;
    if (sw / sh > want) {
      const w = sh * want;
      sx = (sw - w) / 2;
      sw = w;
    } else {
      const h = sw / want;
      sy = (sh - h) / 2;
      sh = h;
    }
  }
  const k = Math.min(1, PHOTO_MAX_PX / Math.max(sw, sh));
  const w = Math.round(sw * k);
  const h = Math.round(sh * k);
  const out = document.createElement("canvas");
  const pad = filter === "polaroid" ? Math.round(w * 0.06) : 0;
  const foot = filter === "polaroid" ? Math.round(w * 0.2) : 0;
  out.width = w + pad * 2;
  out.height = h + pad + Math.max(pad, foot);
  const g = out.getContext("2d") as CanvasRenderingContext2D;
  if (filter === "polaroid") {
    g.fillStyle = "#f4efe4";
    g.fillRect(0, 0, out.width, out.height);
  }
  g.drawImage(src, sx, sy, sw, sh, pad, pad, w, h);
  const img = g.getImageData(pad, pad, w, h);
  const d = img.data;
  const lift = flash ? 1.18 : 1;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] * lift;
    let gg = d[i + 1] * lift;
    let b = d[i + 2] * lift;
    if (filter === "film" || filter === "polaroid") {
      // warm, a little faded, a little grain
      const n = (Math.random() - 0.5) * 14;
      r = r * 1.06 + 12 + n;
      gg = gg * 1.0 + 4 + n;
      b = b * 0.86 + 8 + n;
      if (filter === "polaroid") {
        r = r * 0.92 + 18;
        gg = gg * 0.92 + 14;
        b = b * 0.88 + 16;
      }
    } else if (filter === "vhs") {
      const y = Math.floor(i / 4 / w);
      const scan = y % 3 === 0 ? 0.82 : 1;
      r = Math.min(255, r * 1.15) * scan;
      gg = gg * 1.05 * scan;
      b = Math.min(255, b * 1.2) * scan;
    } else if (filter === "bw") {
      const l = 0.3 * r + 0.59 * gg + 0.11 * b;
      const c = (l - 128) * 1.25 + 128;
      r = c;
      gg = c;
      b = c;
    }
    d[i] = r;
    d[i + 1] = gg;
    d[i + 2] = b;
  }
  if (filter === "vhs") {
    // the colour bleeds to the right
    const copy = new Uint8ClampedArray(d);
    for (let i = 0; i < d.length; i += 4) {
      const j = Math.max(0, i - 4 * 3);
      d[i] = copy[j];
    }
  }
  g.putImageData(img, pad, pad);
  // a soft vignette (film, polaroid, vhs)
  if (filter !== "none" && filter !== "bw") {
    const v = g.createRadialGradient(
      pad + w / 2,
      pad + h / 2,
      Math.min(w, h) * 0.35,
      pad + w / 2,
      pad + h / 2,
      Math.max(w, h) * 0.7,
    );
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(30,10,20,.42)");
    g.fillStyle = v;
    g.fillRect(pad, pad, w, h);
  }
  if (filter === "vhs") {
    g.font = `${Math.round(h * 0.05)}px monospace`;
    g.fillStyle = "rgba(255,255,255,.85)";
    g.fillText("PLAY ▶", pad + w * 0.05, pad + h * 0.1);
    const now = new Date();
    g.fillText(
      `${now.toLocaleDateString("en-US", { month: "short", day: "2-digit" }).toUpperCase()} 1984`,
      pad + w * 0.05,
      pad + h * 0.94,
    );
  }
  return out;
}
