import { entryWallItem, type WorldObjectDef, wallRot } from "@yutopia/shared";
import { GAME_ASPECT } from "@yutopia/shared/games";
import { GLASS, glassCorners } from "@yutopia/shared/media";
import {
  CanvasTexture,
  type Color,
  DoubleSide,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  type Texture,
  Vector3,
  VideoTexture,
} from "three";
import type { WorldEngine } from "../engine";
import { zt } from "./kit3d";

// Live pictures in 3D: what plays on TVs and big screens, the board walls'
// VU meters, whiteboard miniatures, the consoles on the game-room TVs — the
// same canvases (and videos) the iso view maps onto its glass, here on a quad
// over the item's face.

export interface Live {
  key: string;
  src: HTMLCanvasElement | HTMLVideoElement;
  tl: [number, number]; // the picture's top-left / top-right corners (world tiles)
  tr: [number, number];
  zTop: number; // iso px
  zBot: number;
  version: number; // what's on the canvas (redrawn when it changes); -1 = every frame
  glow: boolean; // a screen (its own light) or not (paper, cork)
  fit?: number; // fit this aspect inside (a video with its own shape)
}

const PLANE = new PlaneGeometry(1, 1);
const NEAR = 18; // tiles: pictures further away keep their last frame

interface Shown {
  mesh: Mesh;
  mat: MeshBasicMaterial;
  tex: Texture;
  src: Live["src"];
  version: number;
  place: string;
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
      // what: canvases when they change, videos and live canvases every frame (near enough)
      const near = Math.hypot((l.tl[0] + l.tr[0]) / 2 - camX, (l.tl[1] + l.tr[1]) / 2 - camY) < NEAR;
      if (!(l.src instanceof HTMLVideoElement) && (l.version !== s.version || (l.version < 0 && near))) {
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

  private drop(k: string, s: Shown) {
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
  let h = zt(l.zTop - l.zBot);
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
  const cz = zt((l.zTop + l.zBot) / 2);
  const m = new Matrix4().makeBasis(new Vector3(ux, 0, uy), new Vector3(0, 1, 0), new Vector3(nx, 0, ny));
  m.scale(new Vector3(w, h, 1));
  m.setPosition(cx, cz, cy);
  mesh.matrix.copy(m);
  mesh.matrixWorldNeedsUpdate = true;
}

// Where the pictures come from: the iso engine's wall displays, the media
// room's screens, the game room's TVs.
export interface LiveSources {
  engine: Pick<WorldEngine, "livePanels" | "getObject" | "shareVideo" | "panelCanvas">;
  screens: { pictures(): { def: WorldObjectDef; canvas: HTMLCanvasElement; on: boolean }[] } | null;
  games: { pictures(): { def: WorldObjectDef; canvas: HTMLCanvasElement }[] } | null;
}

// a console's 4:3 picture on a wide TV: letterboxed
const wide = (o: WorldObjectDef) => ((GLASS[o.kind]?.aspect ?? GAME_ASPECT) > GAME_ASPECT ? GAME_ASPECT : undefined);

// Every live picture now: a console on a game-room TV wins over the TV's own
// media; media playing on a big screen wins over its board.
export class LiveFeed {
  private cache = new Map<string, { version: number; canvas: HTMLCanvasElement }>();

  collect({ engine, screens, games }: LiveSources): Live[] {
    const out: Live[] = [];
    const taken = new Set<string>();
    const panels = engine.livePanels();
    for (const p of games?.pictures() ?? []) {
      const c = glassCorners(p.def);
      if (!c) continue;
      out.push({ key: `g:${p.def.id}`, src: p.canvas, ...c, version: -1, glow: true, fit: wide(p.def) });
      taken.add(p.def.id);
    }
    for (const p of screens?.pictures() ?? []) {
      if (taken.has(p.def.id) || (!p.on && panels.has(p.def.id))) continue;
      const c = glassCorners(p.def);
      if (!c) continue;
      out.push({ key: `m:${p.def.id}`, src: p.canvas, ...c, version: -1, glow: true });
      taken.add(p.def.id);
    }
    for (const [id, p] of panels) {
      if (taken.has(id)) continue;
      const o = engine.getObject(id) ?? p.def;
      // as the iso view mounts it (engine.mountWall): on the wall's face, from ox along it
      const S = 36;
      const tiles = entryWallItem(o.kind);
      const west = wallRot(o.rot) === 3;
      const len = p.pw / S;
      const tl: [number, number] = west ? [o.x + p.oy + 0.1, o.y + tiles - p.ox] : [o.x + p.ox, o.y + p.oy + 0.1];
      const tr: [number, number] = west ? [tl[0], tl[1] - len] : [tl[0] + len, tl[1]];
      const at = { tl, tr, zTop: p.zTop, zBot: p.zTop - p.ph };
      const video = engine.shareVideo(id);
      if (video) {
        const fit = (video.videoWidth || 16) / (video.videoHeight || 9);
        out.push({ key: `v:${id}`, src: video, ...at, version: -1, glow: true, fit });
        continue;
      }
      let c = this.cache.get(id);
      if (!c || c.version !== p.version) {
        const canvas = engine.panelCanvas(id);
        if (!canvas) continue;
        c = { version: p.version, canvas };
        this.cache.set(id, c);
      }
      out.push({ key: `p:${id}`, src: c.canvas, ...at, version: c.version, glow: o.kind !== "whiteboard" });
    }
    for (const id of this.cache.keys()) if (!panels.has(id)) this.cache.delete(id);
    return out;
  }
}
