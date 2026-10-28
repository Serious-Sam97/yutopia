import { hangOf, hangPoint, type WorldObjectDef } from "@yutopia/shared";
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
import type { WorldModel } from "../model";
import { zt } from "./kit3d";

// Live pictures in 3D: what plays on TVs and big screens, the board walls'
// VU meters, whiteboard miniatures, the consoles on the game-room TVs: their
// canvases (and videos) on a quad over the item's face.

export interface Live {
  key: string;
  src: HTMLCanvasElement | HTMLVideoElement;
  tl: [number, number]; // the picture's top-left / top-right corners (world tiles)
  tr: [number, number];
  zTop: number; // iso px
  zBot: number;
  version: number; // what's on the canvas (counts its redraws; uploaded when it moves)
  live?: boolean; // redrawn as it plays: further than NEAR it keeps its last frame
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

// Where the pictures come from: the room's wall displays (world/model.ts), the media
// room's screens, the game room's TVs.
export interface LiveSources {
  model: Pick<WorldModel, "livePanels" | "getObject" | "shareVideo" | "panelCanvas">;
  // (each picture's `version` counts its redraws)
  screens: { pictures(): { def: WorldObjectDef; canvas: HTMLCanvasElement; on: boolean; version: number }[] } | null;
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
      out.push({ key: `m:${p.def.id}`, src: p.canvas, ...c, version: p.version, live: true, glow: true });
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
      const at = { tl, tr, zTop: p.zTop + up, zBot: p.zTop + up - p.ph };
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
    return out;
  }
}
