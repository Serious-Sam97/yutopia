import { hearingGain, TILE_H, TILE_W, topCentre, toScreen, type WorldObjectDef } from "@yutopia/shared";
import {
  displaySpot,
  GLASS,
  glassCorners,
  glassFacing,
  isDisplay,
  isRadio,
  type MediaState,
  mediaAt,
  mediaOf,
  positionAt,
  showsMedia,
  ytThumb,
} from "@yutopia/shared/media";
import { Container, Graphics, Matrix, Sprite, Texture } from "pixi.js";
import { lang } from "@/lib/i18n";
import { prefs } from "@/lib/prefs";
import { glowSprite, placeGlow } from "../art/glow";
import type { WorldController } from "../controller";
import { hud } from "../store";
import { MediaCard } from "./card";
import { serverNow, syncClock } from "./clock";
import { tvOn } from "./foley";
import { SyncedVideo } from "./jf";
import { SyncedYouTube, type Timeline } from "./youtube";

// Marks this chunk for `pnpm budget` (it loads lazily, outside the page's files).
export const MEDIA_CHUNK = "yutopia-media";

// Media on TVs and the radio, live (docs/plan/10-media.md). Nobody hosts it:
// each of us plays our own copy, kept to the server's clock.
//  · every TV shows what's on from anywhere in the space: YouTube's thumbnail
//    or a Jellyfin item's picture on its glass (the live picture for the one
//    Jellyfin TV in earshot), a progress line, ❚❚ when paused, a CRT's
//    scanlines, its light on the floor at night; projectors beam onto their
//    screen;
//  · in earshot, you hear it: the loudest YouTube TV (or the radio's YouTube)
//    plays in the "On TV" card; the loudest Jellyfin TV streams (one at a time);
//  · Watch makes the card big (YouTube) or shows the Jellyfin stream big.

const S = 36; // px along a wall per tile (engine.mountWall)
const PROJECTOR_REACH = 7;
const CARD_GRACE_MS = 2500;
const ON_MS = 520; // a CRT warming up
const OFF_MS = 380; // … collapsing

interface Glassed {
  def: WorldObjectDef;
  sig: string; // what it was mounted for (moved / turned / lifted: mount again)
  canvas: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  tex: Texture;
  roots: Container[];
  glow: Sprite; // its light on the floor at night
  wasOn: boolean;
  onAt: number; // performance.now() it came on (the CRT's warm-up), 0 = none
  offAt: number; // … went off (the collapse)
  img: { url: string; el: HTMLImageElement; ok: boolean } | null;
  drawn: string; // what's on the canvas now
  avg: number; // the picture's colour (its light at night)
  avgAt: number;
}

interface Source {
  id: string; // a TV's or a radio's object id
  m: MediaState;
  gain: number;
  radio: boolean;
}

const timeline = (m: MediaState): Timeline => ({
  at: m.at,
  dur: m.item?.dur ?? 0,
  loop: false,
  paused: m.paused,
  pos: m.pos,
});

export class MediaRoom {
  private screens = new Map<string, Glassed>();
  private beams = new Map<string, Graphics>();
  private card: MediaCard;
  private yt: SyncedYouTube | null = null;
  private ytStarting = false;
  private ytFailedAt = 0; // the YouTube script didn't load (offline): try again later
  private ytFor: string | null = null; // source id
  private ytIdleSince = 0;
  private jf: SyncedVideo | null = null;
  // volumes ease toward where they should be (walking up, a TV taking over):
  // no jumps; a stream being replaced fades out on its own
  private dt = 0;
  private ytLevel = 0;
  private jfLevel = 0;
  private jfFading: { p: SyncedVideo; level: number; until: number } | null = null;
  private jfFor: { id: string; ref: string } | null = null;
  private jfHolder: HTMLDivElement;
  private hidden = new Set<string>(); // sources I said "not now" to, until I walk away
  private reported = new Set<string>(); // lengths told to the server
  private watching: string | null = null;
  private cc = false; // subtitles on (watching a Jellyfin stream)
  private clockTimer = 0;
  private sample = document.createElement("canvas");
  private lastRef = new Map<string, string>(); // what each TV showed (a new thing near me: its sound)
  private noise = 0;

  constructor(private w: WorldController) {
    this.card = new MediaCard(lang() === "pt");
    this.card.onBig = (big) => {
      if (big && !this.watching) this.watching = this.ytFor ?? this.jfFor?.id ?? null;
      if (!big) this.watching = null;
    };
    this.card.onHide = () => {
      if (this.card.big) return this.card.setBig(false);
      if (this.ytFor) this.hidden.add(this.ytFor);
    };
    this.card.onSound = () => this.yt?.unmute();
    this.card.onCc = () => {
      if (!this.jf) return;
      this.cc = !this.cc;
      this.jf.setSubtitles(this.cc);
    };
    this.jfHolder = document.createElement("div");
    Object.assign(this.jfHolder.style, {
      position: "fixed",
      left: "0",
      bottom: "0",
      width: "4px",
      height: "3px",
      overflow: "hidden",
      opacity: "0.01",
      pointerEvents: "none",
    });
    document.body.append(this.jfHolder);
    this.sample.width = 8;
    this.sample.height = 6;
    const http = this.w.worldHttp;
    if (http) {
      void syncClock(http);
      this.clockTimer = window.setInterval(() => void syncClock(http, 3), 5 * 60_000);
    }
  }

  private get engine() {
    return this.w.engine;
  }

  // ── what's on (for panels) ─────────────────────────────────────────────
  stateOf(id: string): MediaState | null {
    return mediaAt(this.engine?.getObject(id));
  }

  watch(id: string | null) {
    this.watching = id;
    if (id) this.hidden.delete(id);
    else this.card.setBig(false);
  }
  get watchingId(): string | null {
    return this.watching;
  }

  // ── the space's things changed ─────────────────────────────────────────
  refresh() {
    const engine = this.engine;
    if (!engine) return;
    const keep = new Set<string>();
    for (const o of engine.allObjects()) {
      if (o.kind === "projector") {
        keep.add(o.id);
        continue;
      }
      if (!isDisplay(o.kind)) continue;
      keep.add(o.id);
      const had = this.screens.get(o.id);
      if (had) had.def = o;
      else this.screens.set(o.id, this.make(o));
    }
    for (const [id, s] of this.screens)
      if (!keep.has(id)) {
        this.unmount(s);
        s.glow.destroy();
        s.tex.destroy(true);
        this.screens.delete(id);
      }
    for (const [id, b] of this.beams)
      if (!keep.has(id)) {
        b.destroy();
        this.beams.delete(id);
      }
  }

  private make(def: WorldObjectDef): Glassed {
    const gl = GLASS[def.kind];
    // the canvas has the glass's own shape (1 tile ≈ 36 px along a face)
    const gw = Math.max(0.2, gl.x1 - gl.x0) * S;
    const gh = Math.max(4, gl.z1 - gl.z0);
    const W = 320;
    const H = Math.max(60, Math.round((W * gh) / gw));
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const g = canvas.getContext("2d", { willReadFrequently: false }) as CanvasRenderingContext2D;
    const glow = glowSprite();
    glow.zIndex = -0.4;
    this.engine?.mountLive(glow);
    return {
      def,
      sig: "",
      canvas,
      g,
      tex: Texture.from(canvas),
      roots: [],
      glow,
      wasOn: false,
      onAt: 0,
      offAt: 0,
      img: null,
      drawn: "",
      avg: 0x6080a0,
      avgAt: 0,
    };
  }

  private unmount(s: Glassed) {
    for (const r of s.roots) r.destroy({ children: true });
    s.roots = [];
    s.sig = "";
  }

  private mount(s: Glassed) {
    const engine = this.engine;
    if (!engine) return;
    const o = s.def;
    const sig = `${o.x}|${o.y}|${o.rot ?? 0}|${o.props?.z ?? 0}|${JSON.stringify(o.props?.c ?? null)}`;
    if (sig === s.sig && s.roots.length) return;
    this.unmount(s);
    s.sig = sig;
    const gl = GLASS[o.kind];
    const W = s.canvas.width;
    const H = s.canvas.height;
    if (gl.wall) {
      const pw = (gl.x1 - gl.x0) * S;
      const ph = gl.z1 - gl.z0;
      s.roots = engine.mountWallLive(o, gl.x0, gl.y - 0.1, gl.z1, pw, ph, () => {
        const c = new Container();
        const sp = new Sprite(s.tex);
        sp.width = pw;
        sp.height = ph;
        c.addChild(sp);
        return c;
      });
      return;
    }
    const c = glassCorners(o);
    if (!c) return;
    const tl = toScreen(c.tl[0], c.tl[1]);
    const tr = toScreen(c.tr[0], c.tr[1]);
    const root = new Container();
    const sp = new Sprite(s.tex);
    sp.width = W;
    sp.height = H;
    root.addChild(sp);
    root.setFromMatrix(new Matrix((tr.x - tl.x) / W, (tr.y - tl.y) / W, 0, (c.zTop - c.zBot) / H, tl.x, tl.y - c.zTop));
    engine.mountLive(root);
    s.roots = [root];
  }

  // ── every frame ────────────────────────────────────────────────────────
  frame(dt: number, me: { x: number; y: number }) {
    this.dt = Math.min(0.25, Math.max(0, dt));
    const engine = this.engine;
    if (!engine) return;
    const now = serverNow();
    const night = engine.nightLevel();
    const ear = { x: me.x, y: me.y };
    const sources: Source[] = [];
    for (const s of this.screens.values()) {
      const o = s.def;
      const on = showsMedia(o) && !engine.showsShare(o.id);
      const m = on ? mediaOf(o) : null;
      if (m?.item) {
        const spot = displaySpot(o);
        const gain = hearingGain(this.w.map, ear, spot, true);
        sources.push({ id: o.id, m, gain, radio: false });
        const ref = m.item.ref;
        if (this.lastRef.has(o.id) && this.lastRef.get(o.id) !== ref && !m.paused) tvOn(GLASS[o.kind].look, gain);
        this.lastRef.set(o.id, ref);
      } else this.lastRef.set(o.id, "");
      this.drawScreen(s, m?.item ? m : null, now, night);
    }
    // radios and record players playing YouTube: each its own, heard from where it is
    for (const o of engine.allObjects()) {
      if (!isRadio(o.kind)) continue;
      const m = mediaAt(o);
      if (!m?.item) continue;
      sources.push({ id: o.id, m, gain: hearingGain(this.w.map, ear, topCentre(o), true), radio: true });
    }
    for (const src of sources) if (src.gain <= 0) this.hidden.delete(src.id);
    this.drawProjectors(night);
    this.playYouTube(sources);
    this.playJellyfin(sources);
  }

  // ── the picture on the glass ───────────────────────────────────────────
  private drawScreen(s: Glassed, m: MediaState | null, now: number, night: number) {
    const o = s.def;
    const facing = glassFacing(o);
    const t = performance.now();
    const still = this.engine?.stillMotion() ?? false;
    if (!m || !facing) {
      // switched off: a CRT collapses to a line, then a dot; a flat screen fades
      if (s.wasOn) {
        s.wasOn = false;
        s.offAt = still || !facing ? 0 : t;
      }
      s.glow.visible = false;
      if (s.offAt && t - s.offAt < OFF_MS && s.roots.length) {
        this.paintOff(s, (t - s.offAt) / OFF_MS);
        s.tex.source.update();
        s.drawn = "";
        return;
      }
      s.offAt = 0;
      for (const r of s.roots) r.visible = false;
      return;
    }
    if (!s.wasOn) {
      s.wasOn = true;
      s.onAt = still ? 0 : t;
      s.offAt = 0;
    }
    const warm = s.onAt && t - s.onAt < ON_MS ? (t - s.onAt) / ON_MS : null;
    if (warm === null) s.onAt = 0;
    this.mount(s);
    const front = this.engine?.frontKey(o.id);
    const gl = GLASS[o.kind];
    const alpha = this.engine?.partAlpha(o.id) ?? 1;
    for (const r of s.roots) {
      r.visible = alpha > 0;
      r.alpha = alpha;
      if (!gl.wall && front != null) r.zIndex = front + 0.004;
    }
    const item = m.item;
    if (!item) return;
    // what goes on it: the live stream (the Jellyfin TV I'm near), or a picture
    const live = this.jf && this.jfFor?.id === o.id && this.jf.ready ? this.jf.video : null;
    const url =
      item.src === "yt"
        ? ytThumb(item.ref, "mq")
        : this.w.mediaKey
          ? `${this.w.worldHttp}/media/jf/img/${encodeURIComponent(this.w.mediaKey.key)}/${item.ref}?w=320`
          : "";
    if (url && s.img?.url !== url) {
      const el = new Image();
      el.crossOrigin = "anonymous";
      const img = { url, el, ok: false };
      el.onload = () => {
        img.ok = true;
        s.drawn = "";
      };
      el.src = url;
      s.img = img;
    }
    const pos = positionAt(m, now);
    const loading = item.src === "jf" && this.jfFor?.id === o.id && !live;
    const key =
      live || warm !== null
        ? `live|${t}`
        : `${item.ref}|${s.img?.ok ? 1 : 0}|${m.paused ? 1 : 0}|${Math.floor(pos)}|${loading ? (this.engine?.stillMotion() ? "snow" : Math.floor(performance.now() / 120)) : ""}`;
    if (key !== s.drawn) {
      s.drawn = key;
      this.paint(s, live ?? (s.img?.ok ? s.img.el : null), m, pos, loading, warm);
      s.tex.source.update();
    }
    // its light on the floor in front of it, at night (one soft sprite)
    if (night > 0.05) {
      if (t - s.avgAt > 400) {
        s.avgAt = t;
        s.avg = this.average(s.canvas, s.avg);
      }
      const spot = displaySpot(o);
      const c = toScreen(spot.x, spot.y + (gl.wall ? 0.4 : 0.6));
      const k = gl.look === "screen" ? 1.6 : gl.wall ? 1.2 : 1;
      const a = (m.paused ? 0.16 : 0.3) * night * alpha * (warm ?? 1);
      placeGlow(s.glow, c.x, c.y, TILE_W * 2.9 * k, TILE_H * 2.9 * k, s.avg, a);
    } else s.glow.visible = false;
  }

  private paint(
    s: Glassed,
    src: HTMLVideoElement | HTMLImageElement | null,
    m: MediaState,
    pos: number,
    loading: boolean,
    warm: number | null = null,
  ) {
    const g = s.g;
    const W = s.canvas.width;
    const H = s.canvas.height;
    const look = GLASS[s.def.kind].look;
    g.globalAlpha = 1;
    g.fillStyle = look === "screen" ? "#55524b" : "#050505";
    g.fillRect(0, 0, W, H);
    if (src) {
      const sw = src instanceof HTMLVideoElement ? src.videoWidth : src.naturalWidth;
      const sh = src instanceof HTMLVideoElement ? src.videoHeight : src.naturalHeight;
      if (sw && sh) {
        // YouTube's mq thumbnails are 16:9 already; fit inside the glass
        const k = Math.min(W / sw, H / sh);
        const dw = sw * k;
        const dh = sh * k;
        if (look === "screen") g.globalAlpha = 0.95;
        g.drawImage(src, (W - dw) / 2, (H - dh) / 2, dw, dh);
        g.globalAlpha = 1;
      }
    }
    if (loading) {
      // tuning in (a Jellyfin stream starting): snow
      this.noise = (this.noise + 1) % 1000;
      for (let i = 0; i < 260; i++) {
        g.fillStyle = `rgba(255,255,255,${0.08 + Math.random() * 0.22})`;
        g.fillRect(Math.random() * W, Math.random() * H, 3 + Math.random() * 4, 2);
      }
    }
    if (m.paused) {
      g.fillStyle = "rgba(0,0,0,0.45)";
      g.fillRect(0, 0, W, H);
      const u = Math.min(W, H) * 0.12;
      g.fillStyle = "rgba(242,232,210,0.9)";
      g.fillRect(W / 2 - u * 1.1, H / 2 - u * 1.4, u * 0.8, u * 2.8);
      g.fillRect(W / 2 + u * 0.3, H / 2 - u * 1.4, u * 0.8, u * 2.8);
    }
    // the progress line
    const dur = m.item?.dur ?? 0;
    if (dur > 0) {
      const bh = Math.max(3, Math.round(H * 0.03));
      g.fillStyle = "rgba(0,0,0,0.55)";
      g.fillRect(0, H - bh, W, bh);
      g.fillStyle = "#ffa630";
      g.fillRect(0, H - bh, W * Math.min(1, pos / dur), bh);
    }
    if (look === "crt") {
      g.fillStyle = "rgba(0,0,0,0.2)";
      for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
      const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
      v.addColorStop(0, "rgba(0,0,0,0)");
      v.addColorStop(1, "rgba(0,0,0,0.45)");
      g.fillStyle = v;
      g.fillRect(0, 0, W, H);
    } else if (look === "hd") {
      const r = g.createLinearGradient(0, 0, W * 0.6, H);
      r.addColorStop(0, "rgba(255,255,255,0.07)");
      r.addColorStop(0.4, "rgba(255,255,255,0)");
      g.fillStyle = r;
      g.fillRect(0, 0, W, H);
    } else {
      const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
      v.addColorStop(0, "rgba(255,240,210,0.05)");
      v.addColorStop(1, "rgba(0,0,0,0.3)");
      g.fillStyle = v;
      g.fillRect(0, 0, W, H);
    }
    if (warm !== null) this.warmUp(g, W, H, look, warm);
  }

  // Coming on: a tube's bright line opening up into the picture (with a
  // flash); a flat screen or a projector fading in.
  private warmUp(g: CanvasRenderingContext2D, W: number, H: number, look: string, p: number) {
    if (look !== "crt") {
      g.fillStyle = `rgba(0,0,0,${(1 - p).toFixed(3)})`;
      g.fillRect(0, 0, W, H);
      return;
    }
    if (p < 0.18) {
      g.fillStyle = "#000";
      g.fillRect(0, 0, W, H);
      const w = W * (p / 0.18);
      g.fillStyle = "rgba(240,250,255,0.95)";
      g.fillRect((W - w) / 2, H / 2 - 1, w, 2);
      return;
    }
    const q = (p - 0.18) / 0.82;
    const band = Math.max(2, H * (1 - (1 - q) ** 3));
    const top = (H - band) / 2;
    g.fillStyle = "#000";
    g.fillRect(0, 0, W, top);
    g.fillRect(0, top + band, W, H - top - band);
    g.fillStyle = `rgba(235,245,255,${((1 - q) * 0.55).toFixed(3)})`;
    g.fillRect(0, top, W, band);
  }

  // Going off: a tube collapses to a line, then a dot; a flat screen fades.
  private paintOff(s: Glassed, p: number) {
    const g = s.g;
    const W = s.canvas.width;
    const H = s.canvas.height;
    if (GLASS[s.def.kind].look !== "crt") {
      g.fillStyle = "rgba(0,0,0,0.25)";
      g.fillRect(0, 0, W, H);
      return;
    }
    g.fillStyle = "#000";
    g.fillRect(0, 0, W, H);
    g.fillStyle = "rgba(240,250,255,0.9)";
    if (p < 0.55) {
      const band = Math.max(2, H * (1 - p / 0.55) ** 2);
      g.fillRect(0, (H - band) / 2, W, band);
    } else {
      const r = Math.max(0.5, (1 - (p - 0.55) / 0.45) * Math.min(W, H) * 0.05);
      g.beginPath();
      g.arc(W / 2, H / 2, r, 0, Math.PI * 2);
      g.fill();
    }
  }

  private average(c: HTMLCanvasElement, fallback: number): number {
    try {
      const g = this.sample.getContext("2d", { willReadFrequently: true });
      if (!g) return fallback;
      g.drawImage(c, 0, 0, 8, 6);
      const d = g.getImageData(0, 0, 8, 6).data;
      let r = 0;
      let gg = 0;
      let b = 0;
      for (let i = 0; i < d.length; i += 4) {
        r += d[i];
        gg += d[i + 1];
        b += d[i + 2];
      }
      const n = d.length / 4;
      const lift = (v: number) => Math.min(255, Math.round((v / n) * 1.3 + 30));
      return (lift(r) << 16) | (lift(gg) << 8) | lift(b);
    } catch {
      return fallback;
    }
  }

  // Projectors light up and beam onto the nearest playing screen they reach.
  private drawProjectors(night: number) {
    const engine = this.engine;
    if (!engine) return;
    const playing = [...this.screens.values()].filter(
      (s) => s.def.kind === "projector_screen" && !!mediaOf(s.def)?.item,
    );
    for (const o of engine.allObjects()) {
      if (o.kind !== "projector") continue;
      const c = topCentre(o);
      let best: Glassed | null = null;
      let bestD = PROJECTOR_REACH;
      for (const s of playing) {
        const sp = displaySpot(s.def);
        const d = Math.hypot(sp.x - c.x, sp.y - c.y);
        if (d < bestD) {
          bestD = d;
          best = s;
        }
      }
      const on = !!best && !mediaOf(best.def)?.paused;
      if (!!o.props?.on !== on) engine.upsertObject({ ...o, props: { ...(o.props ?? {}), on } });
      let g = this.beams.get(o.id);
      if (!g) {
        g = new Graphics();
        engine.mountLive(g);
        this.beams.set(o.id, g);
      }
      g.clear();
      if (!on || !best) continue;
      const k = glassCorners(best.def);
      if (!k) continue;
      const lens = toScreen(c.x + 0.25, c.y);
      const z = (Number(o.props?.z) || 0) + 4;
      const tl = toScreen(k.tl[0], k.tl[1]);
      const tr = toScreen(k.tr[0], k.tr[1]);
      const pts = [
        lens.x,
        lens.y - z,
        tl.x,
        tl.y - k.zTop,
        tr.x,
        tr.y - k.zTop,
        tr.x,
        tr.y - k.zBot,
        tl.x,
        tl.y - k.zBot,
      ];
      // the beam: a wide soft cone, a brighter core toward the middle of the
      // picture, the lens glowing (stronger in the dark)
      const color = mixColor(0xfff3cf, best.avg || 0xfff3cf, 0.45);
      g.poly(pts).fill({ color, alpha: 0.05 + 0.13 * night });
      const mid = (ax: number, ay: number, bx: number, by: number) => [ax + (bx - ax) * 0.3, ay + (by - ay) * 0.3];
      const cx = (tl.x + tr.x) / 2;
      const cyTop = (tl.y + tr.y) / 2 - k.zTop;
      const cyBot = (tl.y + tr.y) / 2 - k.zBot;
      const core = [
        lens.x,
        lens.y - z,
        ...mid(cx, cyTop, tl.x, tl.y - k.zTop),
        ...mid(cx, cyTop, tr.x, tr.y - k.zTop),
        ...mid(cx, cyBot, tr.x, tr.y - k.zBot),
        ...mid(cx, cyBot, tl.x, tl.y - k.zBot),
      ];
      g.poly(core).fill({ color: 0xfffaf0, alpha: 0.04 + 0.12 * night });
      g.circle(lens.x, lens.y - z, 2.2).fill({ color: 0xfffaf0, alpha: 0.35 + 0.5 * night });
      g.zIndex = (engine.frontKey(o.id) ?? c.x + c.y) + 0.01;
    }
  }

  // ── sound ──────────────────────────────────────────────────────────────
  // my volume for it (TVs: "TV & video"; radios: music), turned down while
  // someone I can hear is talking
  private vol(radio: boolean): number {
    const v = prefs().vol;
    const talking = hud.get().people.some((p) => p.speaking && p.hearing);
    return v.master * (radio ? v.music : (v.tv ?? 0.8)) * (talking ? 0.5 : 1);
  }
  // one step of easing toward a level (τ seconds)
  private ease(from: number, to: number, tau: number): number {
    return from + (to - from) * (1 - Math.exp(-this.dt / tau));
  }

  // The loudest YouTube source in earshot (or the one I watch) plays in the card.
  private playYouTube(sources: Source[]) {
    const yts = sources.filter((s) => s.m.item?.src === "yt");
    let pick: Source | null = null;
    if (this.watching) pick = yts.find((s) => s.id === this.watching) ?? null;
    if (!pick) for (const s of yts) if (s.gain > 0 && !this.hidden.has(s.id) && (!pick || s.gain > pick.gain)) pick = s;
    if (!pick) {
      if (this.yt || this.card.visible) {
        if (!this.ytIdleSince) this.ytIdleSince = performance.now();
        // out of earshot: fade while the card lingers
        if (this.yt) {
          this.ytLevel = this.ease(this.ytLevel, 0, 0.3);
          this.yt.setVolume(this.ytLevel);
        }
        if (performance.now() - this.ytIdleSince > CARD_GRACE_MS || this.hidden.size) this.stopYouTube();
      }
      return;
    }
    this.ytIdleSince = 0;
    // another source took over: fade the one playing out first, then switch
    if (this.yt && this.ytFor && this.ytFor !== pick.id) {
      this.ytLevel = this.ease(this.ytLevel, 0, 0.12);
      this.yt.setVolume(this.ytLevel);
      if (this.ytLevel > 0.02) return;
      this.ytLevel = 0;
    }
    const item = pick.m.item;
    if (!item) return;
    const t = timeline(pick.m);
    this.ytFor = pick.id;
    const retryOk = !this.ytFailedAt || performance.now() - this.ytFailedAt > 30_000;
    if (!this.yt && !this.ytStarting && retryOk) {
      this.ytStarting = true;
      const host = document.createElement("div");
      this.card.body.prepend(host);
      const p = new SyncedYouTube(host, item.ref, t);
      void p
        .start()
        .then(() => {
          this.yt = p;
        })
        .catch(() => {
          host.remove();
          this.ytFailedAt = performance.now();
        })
        .finally(() => {
          this.ytStarting = false;
        });
    } else if (this.yt) {
      if (this.yt.video !== item.ref) this.yt.load(item.ref, t);
      else this.yt.setTimeline(t);
      const watched = this.watching === pick.id;
      this.ytLevel = this.ease(this.ytLevel, (watched ? 1 : pick.gain) * this.vol(pick.radio), 0.25);
      this.yt.setVolume(this.ytLevel);
      this.card.needsSound(this.yt.mutedByBrowser);
      // a length the server doesn't know yet
      const d = this.yt.duration();
      const tag = `${pick.id}|${item.ref}`;
      if (!item.dur && d > 0 && !this.reported.has(tag)) {
        this.reported.add(tag);
        this.w.send("media:dur", { id: pick.id, ref: item.ref, dur: d });
      }
    }
    if (this.jfFor && this.watching === this.jfFor.id) return; // the card shows the stream
    this.card.show({ title: item.title, sub: item.sub, radio: pick.radio });
    if (this.watching === pick.id && !this.card.big) this.card.setBig(true);
  }

  private stopYouTube() {
    this.yt?.destroy();
    this.yt = null;
    this.ytLevel = 0;
    this.ytFor = null;
    this.ytIdleSince = 0;
    for (const c of Array.from(this.card.body.children)) if (!c.classList.contains("ymc-sound")) c.remove();
    if (!this.jfFor || this.watching !== this.jfFor.id) this.card.hide();
  }

  // The loudest Jellyfin TV in earshot (or the one I watch) streams: its
  // picture goes on its glass, its sound to me.
  private playJellyfin(sources: Source[]) {
    const key = this.w.mediaKey?.key;
    const jfs = sources.filter((s) => s.m.item?.src === "jf" && !s.m.paused);
    let pick: Source | null = null;
    if (this.watching) pick = jfs.find((s) => s.id === this.watching) ?? null;
    if (!pick) for (const s of jfs) if (s.gain > 0 && (!pick || s.gain > pick.gain)) pick = s;
    const item = pick?.m.item;
    this.fadeOld();
    if (!pick || !item || !key) {
      if (this.jf) this.stopJellyfin(true);
      return;
    }
    if (!this.jf || this.jfFor?.id !== pick.id || this.jfFor.ref !== item.ref) {
      this.stopJellyfin(true);
      const url = `${this.w.worldHttp}/media/jf/s/${encodeURIComponent(key)}/${encodeURIComponent(pick.id)}/${item.ref}/master.m3u8`;
      this.jf = new SyncedVideo(url, timeline(pick.m), this.jfHolder);
      this.jfFor = { id: pick.id, ref: item.ref };
      void this.jf.start();
    } else this.jf.setTimeline(timeline(pick.m));
    const watched = this.watching === pick.id;
    this.jfLevel = this.ease(this.jfLevel, (watched ? 1 : pick.gain) * this.vol(false), 0.25);
    this.jf.setVolume(this.jfLevel);
    // watching: the stream big in the card
    const v = this.jf.video;
    if (watched) {
      if (v.parentElement !== this.card.body) {
        this.yt?.destroy();
        this.yt = null;
        this.ytFor = null;
        this.card.body.prepend(v);
      }
      this.card.show({ title: item.title, sub: item.sub, radio: false, cc: this.jf.hasSubtitles });
      this.card.needsSound(false);
      if (!this.card.big) this.card.setBig(true);
    } else if (v.parentElement !== this.jfHolder) {
      this.jfHolder.append(v);
      if (!this.ytFor) this.card.hide();
    }
  }

  // fade: the stream keeps playing a moment, getting quieter, then goes
  private stopJellyfin(fade = false) {
    if (this.jf && fade && this.jfLevel > 0.02 && !this.jfFading) {
      this.jfFading = { p: this.jf, level: this.jfLevel, until: performance.now() + 900 };
      if (this.jf.video.parentElement !== this.jfHolder) this.jfHolder.append(this.jf.video);
    } else this.jf?.destroy();
    this.jf = null;
    this.jfFor = null;
    this.jfLevel = 0;
    this.cc = false;
  }
  private fadeOld() {
    const f = this.jfFading;
    if (!f) return;
    f.level = this.ease(f.level, 0, 0.2);
    f.p.setVolume(f.level);
    if (f.level < 0.01 || performance.now() > f.until) {
      f.p.destroy();
      this.jfFading = null;
    }
  }

  // what the panels show about the stream (tests read it too)
  get status() {
    return {
      yt: this.yt ? { for: this.ytFor, video: this.yt.video, stats: this.yt.stats } : null,
      jf: this.jf ? { for: this.jfFor, ready: this.jf.ready, drift: this.jf.drift, failed: this.jf.failed } : null,
      card: this.card.visible,
      big: this.card.big,
      watching: this.watching,
    };
  }

  dispose() {
    clearInterval(this.clockTimer);
    this.stopYouTube();
    this.stopJellyfin();
    this.jfFading?.p.destroy();
    this.card.destroy();
    this.jfHolder.remove();
    for (const s of this.screens.values()) {
      this.unmount(s);
      s.glow.destroy();
      s.tex.destroy(true);
    }
    for (const b of this.beams.values()) b.destroy();
    this.screens.clear();
    this.beams.clear();
  }
}

// a over b by t (0 = a, 1 = b), per channel
function mixColor(a: number, b: number, t: number): number {
  const ch = (sh: number) => Math.round(((a >> sh) & 255) * (1 - t) + ((b >> sh) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}
