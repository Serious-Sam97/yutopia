import { hangOf, hangPoint, TEXT_FACE, type WorldObjectDef } from "@yutopia/shared";
import { GAME_ASPECT } from "@yutopia/shared/games";
import { GLASS, glassCorners } from "@yutopia/shared/media";
import {
  type Camera,
  CanvasTexture,
  type Color,
  DoubleSide,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  NoBlending,
  PlaneGeometry,
  SRGBColorSpace,
  type Texture,
  Vector3,
  VideoTexture,
} from "three";
import { isNative, wordsOf } from "../furn/native";
import { CLOCK_FACE } from "../furn/walls";
import { drawFlaps, drawTicker, FLAPS_PX, TICKER_PX } from "../furn/words";
import type { WorldModel } from "../model";

// Live pictures in 3D: what plays on TVs and big screens, the board walls'
// VU meters, whiteboard miniatures, the consoles on the game-room TVs: their
// canvases (and videos) on a quad over the item's face.

export interface Live {
  key: string;
  src: HTMLCanvasElement | HTMLVideoElement;
  tl: [number, number]; // the picture's top-left / top-right corners (world tiles)
  tr: [number, number];
  zTop: number; // m
  zBot: number;
  version: number; // what's on the canvas (counts its redraws; uploaded when it moves)
  live?: boolean; // redrawn as it plays: further than NEAR it keeps its last frame
  glow: boolean; // a screen (its own light) or not (paper, cork)
  fit?: number; // fit this aspect inside (a video with its own shape)
  // a real player (YouTube's iframe, world/media) laid behind the canvas onto this glass:
  // told each frame where the glass is on the page (its corners in CSS px), null when
  // it can't be seen whole enough (behind me, off the screen, faded) — then it isn't there
  glass?: (q: GlassQuad | null) => void;
}

// the glass's corners on the page (CSS px): top-left, top-right, bottom-right, bottom-left
export type GlassQuad = [[number, number], [number, number], [number, number], [number, number]];

const PLANE = new PlaneGeometry(1, 1);
const NEAR = 18; // tiles: pictures further away keep their last frame
// A glass a player shows through: drawn last of the solid things, with what's in front
// of it depth-tested as ever, and a clear hole (alpha 0) left in the frame — the page
// under the canvas (the iframe) shows there; whatever is nearer covers it
const HOLE = new MeshBasicMaterial({
  color: 0x000000,
  opacity: 0,
  blending: NoBlending,
  side: DoubleSide,
  toneMapped: false,
  polygonOffset: true,
  polygonOffsetFactor: -2,
  polygonOffsetUnits: -2,
});
const CORNERS = [
  [-0.5, 0.5],
  [0.5, 0.5],
  [0.5, -0.5],
  [-0.5, -0.5],
] as const;
const _v = new Vector3();

interface Shown {
  mesh: Mesh;
  mat: MeshBasicMaterial;
  tex: Texture;
  src: Live["src"];
  version: number;
  place: string;
  glass?: Live["glass"];
}

export class LiveSurfaces {
  readonly root = new Group();
  private shown = new Map<string, Shown>();

  // Everything showing now (call every frame); `cam`: the camera (plan tiles).
  // `wallAlpha`: how faded the wall at a point is (a picture on a cut-down wall goes with it)
  set(list: Live[], camX: number, camY: number, tint: Color, wallAlpha: (x: number, y: number) => number = () => 1) {
    const keep = new Set<string>();
    for (const l of list) {
      keep.add(l.key);
      let s = this.shown.get(l.key);
      if (s && s.src !== l.src) {
        this.drop(l.key, s);
        s = undefined;
      }
      if (!s) {
        const tex =
          l.src instanceof HTMLVideoElement ? new VideoTexture(l.src) : new CanvasTexture(l.src as HTMLCanvasElement);
        tex.colorSpace = SRGBColorSpace;
        const mat = new MeshBasicMaterial({
          map: tex,
          transparent: true,
          alphaTest: 0.02,
          side: DoubleSide,
          toneMapped: false,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        });
        const mesh = new Mesh(PLANE, mat);
        mesh.matrixAutoUpdate = false;
        mesh.renderOrder = 2;
        this.root.add(mesh);
        s = { mesh, mat, tex, src: l.src, version: Number.NaN, place: "" };
        this.shown.set(l.key, s);
      }
      // where (only when it moved)
      const place = `${l.tl}|${l.tr}|${l.zTop}|${l.zBot}|${l.fit ?? ""}|${sizeOf(l.src)}`;
      if (place !== s.place) {
        s.place = place;
        placeQuad(s.mesh, l);
      }
      if (s.glass && !l.glass) {
        this.unhole(s);
        s.glass(null);
      }
      s.glass = l.glass;
      // what: canvases when they're redrawn (live ones only near enough, after their first)
      const near = Math.hypot((l.tl[0] + l.tr[0]) / 2 - camX, (l.tl[1] + l.tr[1]) / 2 - camY) < NEAR;
      if (
        !(l.src instanceof HTMLVideoElement) &&
        l.version !== s.version &&
        (!l.live || near || Number.isNaN(s.version))
      ) {
        s.version = l.version;
        s.tex.needsUpdate = true;
      }
      // screens give their own light; paper takes the room's
      if (l.glow) s.mat.color.setRGB(1, 1, 1);
      else s.mat.color.copy(tint);
      const a = wallAlpha((l.tl[0] + l.tr[0]) / 2, (l.tl[1] + l.tr[1]) / 2);
      s.mat.opacity = a;
      s.mesh.visible = a > 0.02;
    }
    for (const [k, s] of this.shown) if (!keep.has(k)) this.drop(k, s);
  }

  // Before the frame's render, its matrices made: each glass a player shows through
  // gets its hole (and the player its corners on the page), or its picture back.
  // `off`: none this render (a photo of the frame: the canvas alone)
  // `page`: the canvas on the page (asked only when there's a glass: it's a layout read)
  holes(camera: Camera, page: () => DOMRect, off = false) {
    let at: DOMRect | null = null;
    for (const s of this.shown.values()) {
      if (!s.glass) continue;
      at ??= page();
      const q = off ? null : this.quadOf(s, camera, at);
      if (q) {
        s.mesh.material = HOLE;
        s.mesh.renderOrder = 999; // (after every solid thing it might be behind)
      } else this.unhole(s);
      s.glass(q);
    }
  }

  private unhole(s: Shown) {
    s.mesh.material = s.mat;
    s.mesh.renderOrder = 2;
  }

  private quadOf(s: Shown, camera: Camera, page: DOMRect): GlassQuad | null {
    if (!s.mesh.visible || s.mat.opacity < 0.98) return null;
    camera.updateMatrixWorld();
    const q: [number, number][] = [];
    let inX = false;
    let inY = false;
    for (const [x, y] of CORNERS) {
      _v.set(x, y, 0).applyMatrix4(s.mesh.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
      if (_v.z > -0.05) return null; // a corner behind the lens
      _v.applyMatrix4(camera.projectionMatrix);
      if (Math.abs(_v.x) < 1) inX = true;
      if (Math.abs(_v.y) < 1) inY = true;
      q.push([page.left + ((_v.x + 1) / 2) * page.width, page.top + ((1 - _v.y) / 2) * page.height]);
    }
    if (!inX || !inY) {
      // (no corner on the screen: off it, unless it's spread across it)
      const xs = q.map((p) => p[0]);
      const ys = q.map((p) => p[1]);
      if (Math.max(...xs) < page.left || Math.min(...xs) > page.right) return null;
      if (Math.max(...ys) < page.top || Math.min(...ys) > page.bottom) return null;
    }
    return q as GlassQuad;
  }

  private drop(k: string, s: Shown) {
    if (s.glass) s.glass(null);
    this.root.remove(s.mesh);
    s.tex.dispose();
    s.mat.dispose();
    this.shown.delete(k);
  }

  dispose() {
    for (const [k, s] of this.shown) this.drop(k, s);
  }
}

const sizeOf = (src: Live["src"]) =>
  src instanceof HTMLVideoElement ? `${src.videoWidth}x${src.videoHeight}` : `${src.width}x${src.height}`;

// A quad over the face: along tl → tr, from zTop down to zBot, a hair in front
// (the face looks to the left of tl → tr, seen from above: into the room).
function placeQuad(mesh: Mesh, l: Live) {
  const dx = l.tr[0] - l.tl[0];
  const dy = l.tr[1] - l.tl[1];
  const len = Math.hypot(dx, dy) || 1;
  let w = len;
  let h = l.zTop - l.zBot;
  if (l.fit) {
    // letterboxed inside the glass
    if (w / h > l.fit) w = h * l.fit;
    else h = w / l.fit;
  }
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const cx = (l.tl[0] + l.tr[0]) / 2 + nx * 0.014;
  const cy = (l.tl[1] + l.tr[1]) / 2 + ny * 0.014;
  const cz = (l.zTop + l.zBot) / 2;
  const m = new Matrix4().makeBasis(new Vector3(ux, 0, uy), new Vector3(0, 1, 0), new Vector3(nx, 0, ny));
  m.scale(new Vector3(w, h, 1));
  m.setPosition(cx, cz, cy);
  mesh.matrix.copy(m);
  mesh.matrixWorldNeedsUpdate = true;
}

// Where the pictures come from: the room's wall displays (world/model.ts), the media
// room's screens, the game room's TVs.
export interface LiveSources {
  model: Pick<WorldModel, "livePanels" | "getObject" | "shareVideo" | "panelCanvas" | "allObjects">;
  // (each picture's `version` counts its redraws)
  // (`glass`: the one whose YouTube plays in my card — the player on its glass when it's seen)
  screens: {
    pictures(): {
      def: WorldObjectDef;
      canvas: HTMLCanvasElement;
      on: boolean;
      version: number;
      glass?: Live["glass"];
    }[];
  } | null;
  games: {
    pictures(): {
      def: WorldObjectDef;
      canvas: HTMLCanvasElement;
      at?: { tl: [number, number]; tr: [number, number]; zTop: number; zBot: number };
      version: number;
    }[];
  } | null;
  // computers someone's at (world/os): VortexOS's picture on their glass
  os?: {
    pictures(): {
      def: WorldObjectDef;
      canvas: HTMLCanvasElement;
      at: { tl: [number, number]; tr: [number, number]; zTop: number; zBot: number };
      version: number;
    }[];
  } | null;
}

// a console's 4:3 picture on a wide TV: letterboxed
const wide = (o: WorldObjectDef) => ((GLASS[o.kind]?.aspect ?? GAME_ASPECT) > GAME_ASPECT ? GAME_ASPECT : undefined);

// Every live picture now: a console on a game-room TV wins over the TV's own
// media; media playing on a big screen wins over its board.
export class LiveFeed {
  private cache = new Map<string, { version: number; canvas: HTMLCanvasElement }>();

  collect({ model, screens, games, os }: LiveSources): Live[] {
    const out: Live[] = [];
    const taken = new Set<string>();
    for (const p of os?.pictures() ?? [])
      out.push({ key: `o:${p.def.id}`, src: p.canvas, ...p.at, version: p.version, live: true, glow: true });
    const panels = model.livePanels();
    for (const p of games?.pictures() ?? []) {
      const c = p.at ?? glassCorners(p.def); // (a slim console's own screen brings its corners)
      if (!c) continue;
      out.push({
        key: `g:${p.def.id}`,
        src: p.canvas,
        ...c,
        version: p.version,
        live: true,
        glow: true,
        fit: p.at ? undefined : wide(p.def),
      });
      taken.add(p.def.id);
    }
    for (const p of screens?.pictures() ?? []) {
      if (taken.has(p.def.id) || (!p.on && panels.has(p.def.id))) continue;
      const c = glassCorners(p.def);
      if (!c) continue;
      out.push({
        key: `m:${p.def.id}`,
        src: p.canvas,
        ...c,
        version: p.version,
        live: true,
        glow: true,
        glass: p.glass,
      });
      taken.add(p.def.id);
    }
    for (const [id, p] of panels) {
      if (taken.has(id)) continue;
      const o = model.getObject(id) ?? p.def;
      // on the wall's face, from ox along it (any face, shifted along and raised: hang.ts)
      const S = 36;
      const len = p.pw / S;
      const tl = hangPoint(o, p.ox, p.oy + 0.1);
      const tr = hangPoint(o, p.ox + len, p.oy + 0.1);
      const up = hangOf(o).lift;
      const at = { tl, tr, zTop: p.zTop + up, zBot: p.zTop + up - p.h };
      const video = model.shareVideo(id);
      if (video) {
        const fit = (video.videoWidth || 16) / (video.videoHeight || 9);
        out.push({ key: `v:${id}`, src: video, ...at, version: 0, glow: true, fit });
        continue;
      }
      let c = this.cache.get(id);
      if (!c || c.version !== p.version) {
        const canvas = model.panelCanvas(id);
        if (!canvas) continue;
        c = { version: p.version, canvas };
        this.cache.set(id, c);
      }
      out.push({ key: `p:${id}`, src: c.canvas, ...at, version: c.version, glow: o.kind !== "whiteboard" });
    }
    for (const id of this.cache.keys()) if (!panels.has(id)) this.cache.delete(id);
    // the clocks' hands: the time where you are, on the kit's clock face (plan 67, world/furn/walls.ts)
    if (isNative("clock")) out.push(...this.clocks(model));
    // the signs' moving words (plan 68: the ticker's scroll, the split-flap's flaps)
    out.push(...this.words(model));
    return out;
  }

  private wordList = { at: Number.NEGATIVE_INFINITY, list: [] as WorldObjectDef[] };
  private boards = new Map<
    string,
    { canvas: HTMLCanvasElement; text: string; since: number; version: number; key: string }
  >();
  private words(model: LiveSources["model"]): Live[] {
    const now = performance.now() / 1000;
    if (now * 1000 - this.wordList.at > 2000)
      this.wordList = {
        at: now * 1000,
        list: model
          .allObjects()
          .filter((o) => (o.kind === "vfd_ticker" || o.kind === "split_flap") && isNative(o.kind)),
      };
    const out: Live[] = [];
    const seen = new Set<string>();
    for (const o of this.wordList.list) {
      seen.add(o.id);
      const ticker = o.kind === "vfd_ticker";
      const f = TEXT_FACE[o.kind as keyof typeof TEXT_FACE];
      const text = wordsOf(o);
      let b = this.boards.get(o.id);
      if (!b) {
        const canvas = document.createElement("canvas");
        [canvas.width, canvas.height] = ticker ? TICKER_PX : FLAPS_PX;
        b = { canvas, text: "", since: now, version: 0, key: "" };
        this.boards.set(o.id, b);
      }
      if (b.text !== text) {
        b.text = text;
        b.since = now;
      }
      // what's on it now: a key that changes when it must be drawn again
      const key = ticker
        ? `${Math.floor(now * 30)}`
        : now - b.since < FLIP_S
          ? `${Math.floor(now * 14)}`
          : `${text}|still`;
      if (key !== b.key) {
        b.key = key;
        b.version++;
        if (ticker) drawTicker(b.canvas, text, now);
        else drawFlaps(b.canvas, text, now - b.since, o.id);
      }
      const up = hangOf(o).lift;
      out.push({
        key: `w:${o.id}`,
        src: b.canvas,
        tl: hangPoint(o, f.x0, f.z),
        tr: hangPoint(o, f.x1, f.z),
        zTop: f.y1 + up,
        zBot: f.y0 + up,
        version: b.version,
        live: true,
        glow: ticker,
      });
    }
    for (const id of this.boards.keys()) if (!seen.has(id)) this.boards.delete(id);
    return out;
  }

  private clockList = { at: Number.NEGATIVE_INFINITY, list: [] as WorldObjectDef[] };
  private hands: { minute: number; canvas: HTMLCanvasElement } | null = null;
  private clocks(model: LiveSources["model"]): Live[] {
    const now = Date.now();
    if (now - this.clockList.at > 2000)
      this.clockList = { at: now, list: model.allObjects().filter((o) => o.kind === "clock") };
    if (!this.clockList.list.length) return [];
    // one picture of the hands for them all, drawn again as the minute turns
    const minute = Math.floor(now / 60_000);
    if (this.hands?.minute !== minute) {
      const canvas = this.hands?.canvas ?? document.createElement("canvas");
      canvas.width = canvas.height = 128;
      const g = canvas.getContext("2d");
      if (!g) return [];
      const t = new Date(now);
      g.clearRect(0, 0, 128, 128);
      g.strokeStyle = "#2b2a26";
      g.lineCap = "round";
      const hand = (a: number, len: number, w: number) => {
        g.lineWidth = w;
        g.beginPath();
        g.moveTo(64 - Math.sin(a) * 8, 64 + Math.cos(a) * 8);
        g.lineTo(64 + Math.sin(a) * 64 * len, 64 - Math.cos(a) * 64 * len);
        g.stroke();
      };
      hand((((t.getHours() % 12) + t.getMinutes() / 60) / 12) * Math.PI * 2, 0.55, 6);
      hand((t.getMinutes() / 60) * Math.PI * 2, 0.82, 4);
      this.hands = { minute, canvas };
    }
    const { x, y, r, z } = CLOCK_FACE;
    return this.clockList.list.map((o) => {
      const up = hangOf(o).lift;
      return {
        key: `c:${o.id}`,
        src: this.hands?.canvas as HTMLCanvasElement,
        tl: hangPoint(o, x - r, z + 0.004),
        tr: hangPoint(o, x + r, z + 0.004),
        zTop: y + r + up,
        zBot: y - r + up,
        version: minute,
        glow: false,
      };
    });
  }
}

// ── the signs' words (plan 68 phase 1) ──────────────────────────────────────────────────────────────
const FLIP_S = 2.2; // a split-flap board turns its flaps over this long when its words change
