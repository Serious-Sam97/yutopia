import {
  type DressItem,
  type DressKind,
  dressItems,
  entry,
  HALF_WALL,
  hasActions,
  hWall,
  isFloor,
  isWallEdge,
  type MapDef,
  placedFootprint,
  rotOf,
  tileAt,
  topCentre,
  vWall,
  type WorldObjectDef,
  wallRot,
} from "@yutopia/shared";
import {
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  type Object3D,
  PlaneGeometry,
  SRGBColorSpace,
  Texture,
} from "three";
import { FloorBake } from "../art/floors";
import { piece, WALL_H } from "../art/furniture";
import { INK } from "../art/items/kit";
import { type LightSource, lightSources } from "../art/light";
import { type Geo, MeshSketch, type Opts3, Out, zt } from "./kit3d";

// the item drawings: the same lazy chunk the iso engine loads (art/scene.ts)
export type Items = typeof import("../art/items");

// The Studio as a three.js scene, from the same data the iso engine draws:
// the floor bake (seen from above), walls on tile edges, every item drawn by
// its own sketch (in 3D), the rooms' clutter.
//   walls  — built once per layout; the upper part of each wall run (4 edges)
//            is its own group, to turn see-through when it hides you
//   areas  — furniture + clutter merged per 6×6-tile area; `update` redraws
//            only the areas whose things changed (a door swinging, someone
//            sitting down, a lamp switched on, build-mode edits)
//   tall   — furniture taller than 1.25 tiles stands on its own and fades too
//   floor  — baked again only when what stands on it moves

const AREA = 6; // tiles per merged area side
const TALL = 1.25; // tiles: furniture taller than this can fade
const RUN = 4; // wall edges per fade group
// props that change nothing drawn (what plays, how loud)
const QUIET_PROPS = new Set(["media", "radio", "volume", "playlists"]);

export interface FadeGroup {
  x0: number;
  y0: number;
  x1: number;
  y1: number; // plan AABB, tiles
  top: number; // tiles
  objects: Object3D[];
  alpha: number;
  own?: Map<Material, Material>; // per-group see-through copies, made on the first fade
  item?: boolean; // a tall piece of furniture (not a wall run)
}

// Something you can click: its 3D bounds (tiles; z = height).
export interface Pick3 {
  id: string;
  use: boolean; // something to use (live clicks); everything is picked in build mode
  dress?: { kind: string }; // a piece of the rooms' clutter
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
}

// One built piece: its meshes, cards, contact shadows and clickable bounds.
interface Built {
  objs: Object3D[];
  cards: Object3D[];
  soft: Out["soft"];
  picks: Pick3[];
  dispose: { dispose(): void }[];
}

export class World3 {
  readonly root = new Group();
  readonly materials = {
    lit: new MeshLambertMaterial({ vertexColors: true }),
    glow: new MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    clear: new MeshLambertMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: DoubleSide }),
    ink: new LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }),
  };
  picks: Pick3[] = [];
  fades: FadeGroup[] = [];
  cards: Object3D[] = []; // turned to the camera every frame
  lights: LightSource[] = [];
  stats = { triangles: 0, meshes: 0, cards: 0, ms: 0, areas: 0 };

  private walls: Built[] = [];
  private wallFades: FadeGroup[] = [];
  private areas = new Map<string, { sig: string; built: Built }>();
  private tall = new Map<string, { sig: string; built: Built; fade: FadeGroup }>();
  private tallIds = new Set<string>(); // things known to stand tall (drawn on their own)
  private floor: { meshes: Mesh[]; sig: string } | null = null;
  private objects: WorldObjectDef[] = [];
  private cardN = 0;

  // `light`: how lit materials take the room's light (the iso light map)
  constructor(
    private items: Items,
    readonly map: MapDef,
    objects: WorldObjectDef[],
    private anisotropy = 4,
    private light: (m: Material) => void = () => {},
  ) {
    const t0 = performance.now();
    this.light(this.materials.lit);
    this.light(this.materials.clear);
    this.buildWalls();
    this.update(objects);
    this.stats.ms = performance.now() - t0;
  }

  // ── walls (once per layout) ────────────────────────────────────────────────
  private buildWalls() {
    const { post, wall, WALL_HALF_T } = this.items;
    const map = this.map;
    const low = new Map<string, Out>();
    const lowOf = (x: number, y: number) => getOr(low, areaKey(x, y), () => new Out());
    const runs = new Map<string, { out: Out; x0: number; y0: number; x1: number; y1: number; top: number }>();
    const runOf = (dir: "h" | "v", x: number, y: number, top: number) => {
      const k = dir === "h" ? `h|${y}|${Math.floor(x / RUN)}` : `v|${x}|${Math.floor(y / RUN)}`;
      const r = getOr(runs, k, () => ({ out: new Out(), x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9, top: 0 }));
      const [ax, ay, bx, by] = dir === "h" ? [x, y - 0.1, x + 1, y + 0.1] : [x - 0.1, y, x + 0.1, y + 1];
      r.x0 = Math.min(r.x0, ax);
      r.y0 = Math.min(r.y0, ay);
      r.x1 = Math.max(r.x1, bx);
      r.y1 = Math.max(r.y1, by);
      r.top = Math.max(r.top, top);
      return r;
    };
    const sketch = (o: Opts3) => new MeshSketch(o);
    // posts where walls turn, meet or end (a straight run of one height has none)
    const half = (c: string) => c === HALF_WALL;
    const posts = new Map<string, { height: number; ch: string; e: string; w: string; s: string }>();
    for (let Y = 0; Y <= map.height; Y++)
      for (let X = 0; X <= map.width; X++) {
        const w = hWall(map, X - 1, Y);
        const e = hWall(map, X, Y);
        const n = vWall(map, X, Y - 1);
        const s = vWall(map, X, Y);
        const touching = [w, e, n, s].filter(isWallEdge);
        if (!touching.length) continue;
        const straight =
          (isWallEdge(w) && isWallEdge(e) && !isWallEdge(n) && !isWallEdge(s) && half(w) === half(e)) ||
          (isWallEdge(n) && isWallEdge(s) && !isWallEdge(w) && !isWallEdge(e) && half(n) === half(s));
        if (straight) continue;
        const height = touching.every(half) ? 34 : WALL_H;
        posts.set(`${X},${Y}`, { height, ch: touching.find((c) => !half(c)) ?? touching[0], e, w, s });
      }
    const addWall = (dir: "h" | "v", x: number, y: number, ch: string) => {
      // a wall stops at the post's faces: running on to the joint, its faces
      // would lie in the post's own (in other colours) and flicker
      const [ax, ay, bx, by] = dir === "h" ? [x, y, x + 1, y] : [x, y, x, y + 1];
      const a0 = posts.has(`${ax},${ay}`) ? WALL_HALF_T : 0;
      const a1 = posts.has(`${bx},${by}`) ? 1 - WALL_HALF_T : 1;
      const clip = dir === "h" ? { x0: a0, x1: a1, y0: -1, y1: 1 } : { x0: -1, x1: 1, y0: a0, y1: a1 };
      const top = ch === HALF_WALL ? 34 : WALL_H;
      wall(sketch({ w: 1, h: 1, seed: 0.37, clip, at: [x, y], mirror: true, out: lowOf(x, y) }), dir, ch, "low");
      const run = runOf(dir, x, y, zt(top));
      wall(sketch({ w: 1, h: 1, seed: 0.37, clip, at: [x, y], mirror: true, out: run.out }), dir, ch, "high");
    };
    for (let y = 0; y <= map.height; y++)
      for (let x = 0; x < map.width; x++) {
        const ch = hWall(map, x, y);
        if (isWallEdge(ch)) addWall("h", x, y, ch);
      }
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x <= map.width; x++) {
        const ch = vWall(map, x, y);
        if (isWallEdge(ch)) addWall("v", x, y, ch);
      }
    for (const [key, { height, ch, e, w, s }] of posts) {
      const [X, Y] = key.split(",").map(Number);
      post(sketch({ w: 1, h: 1, at: [X, Y], out: lowOf(X, Y) }), height, "low", ch);
      // the upper part fades with the run it belongs to most (h first)
      const hx = isWallEdge(e) ? X : X - 1;
      const run =
        isWallEdge(e) || isWallEdge(w)
          ? runOf("h", Math.max(0, hx), Y, zt(height))
          : runOf("v", X, isWallEdge(s) ? Y : Y - 1, zt(height));
      post(sketch({ w: 1, h: 1, at: [X, Y], out: run.out }), height, "high", ch);
    }
    for (const out of low.values()) this.walls.push(this.mount(out));
    this.buildCeiling();
    for (const r of runs.values()) {
      const b = this.mount(r.out);
      this.walls.push(b);
      this.wallFades.push({ x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1, top: r.top, objects: b.objs, alpha: 1 });
    }
  }

  // Ceilings over every floor tile at the walls' height, facing down: seen
  // from below only (a low free camera, eye level), never from above.
  private buildCeiling() {
    const map = this.map;
    const z = zt(WALL_H);
    const pos: number[] = [];
    for (let y = 0; y < map.height; y++) {
      let x = 0;
      while (x < map.width) {
        if (!isFloor(tileAt(map, x, y))) {
          x++;
          continue;
        }
        let x1 = x;
        while (x1 < map.width && isFloor(tileAt(map, x1, y))) x1++;
        // a run of floor along x: one quad, wound to face down
        pos.push(x, z, y, x1, z, y, x1, z, y + 1, x, z, y, x1, z, y + 1, x, z, y + 1);
        x = x1;
      }
    }
    if (!pos.length) return;
    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    const mat = new MeshLambertMaterial({ color: 0xd9ccb0 });
    this.light(mat);
    const mesh = new Mesh(geo, mat);
    mesh.name = "ceiling";
    this.root.add(mesh);
    this.walls.push({ objs: [mesh], cards: [], soft: { rects: [], dots: [] }, picks: [], dispose: [geo, mat] });
  }

  // ── furniture + clutter (again where it changed) ────────────────────────────
  update(objects: WorldObjectDef[]) {
    this.objects = objects;
    const byArea = new Map<string, { objs: WorldObjectDef[]; dress: DressItem[]; sig: string[] }>();
    const area = (k: string) => getOr(byArea, k, () => ({ objs: [], dress: [], sig: [] }));
    const tallNow = new Map<string, { o: WorldObjectDef; sig: string }>();
    for (const o of objects) {
      const sig = objectSig(o);
      if (this.tallIds.has(o.id)) {
        tallNow.set(o.id, { o, sig });
        continue;
      }
      const at = anchorOf(o);
      const a = area(areaKey(at[0], at[1]));
      a.objs.push(o);
      a.sig.push(sig);
    }
    for (const d of dressItems(this.map, objects)) {
      const at = dressAt(d);
      const a = area(areaKey(at[0], at[1]));
      a.dress.push(d);
      a.sig.push(`d|${d.kind}|${d.x}|${d.y}|${d.z}|${bucket(d.seed)}`);
    }
    let changed = false;
    // areas: rebuilt when their things changed, dropped when empty
    for (const [k, a] of byArea) {
      const sig = a.sig.sort().join(";");
      const had = this.areas.get(k);
      if (had?.sig === sig) continue;
      changed = true;
      const out = new Out();
      const picks: Pick3[] = [];
      for (const o of a.objs) {
        const one = this.drawObject(o);
        if (one.tall) {
          // stands tall: on its own from now on (this area is redrawn without it)
          this.tallIds.add(o.id);
          tallNow.set(o.id, { o, sig: objectSig(o) });
          continue;
        }
        if (one.pick) picks.push(one.pick);
        append(out, one.out);
      }
      for (const d of a.dress) {
        const one = new Out();
        this.drawDress(d, one);
        const b = boundsOf(one);
        if (b) picks.push({ id: d.id, use: false, dress: { kind: d.kind }, ...b });
        append(out, one);
      }
      if (had) this.unmount(had.built);
      const built = this.mount(out);
      built.picks = picks;
      // a tall thing found while drawing changes this area's list: keep it from redrawing next time
      const left = a.objs.filter((o) => !this.tallIds.has(o.id)).map(objectSig);
      const keep = [...left, ...a.sig.filter((x) => x.startsWith("d|"))].sort().join(";");
      this.areas.set(k, { sig: keep, built });
    }
    for (const [k, had] of this.areas)
      if (!byArea.has(k)) {
        this.unmount(had.built);
        this.areas.delete(k);
        changed = true;
      }
    // tall furniture
    for (const [id, t] of tallNow) {
      const had = this.tall.get(id);
      if (had?.sig === t.sig) continue;
      changed = true;
      if (had) this.unmount(had.built);
      const one = this.drawObject(t.o);
      const built = this.mount(one.out);
      if (one.pick) built.picks = [one.pick];
      const { w, h } = placedFootprint(t.o);
      // a wall item: the strip along its wall (north edge, or west when turned)
      const hang = entry(t.o.kind).wall;
      const west = hang && wallRot(t.o.rot) === 3;
      const [fw, fh] = hang ? (west ? [0.3, h] : [w, 0.3]) : [w, h];
      const fade: FadeGroup = {
        x0: t.o.x - (hang ? 0.1 : 0),
        y0: t.o.y - (hang ? 0.1 : 0),
        x1: t.o.x + fw,
        y1: t.o.y + fh,
        top: hang ? zt(WALL_H) : one.top, // (a wall item fades exactly when its wall does)
        objects: built.objs,
        alpha: 1,
        item: true,
      };
      this.tall.set(id, { sig: t.sig, built, fade });
    }
    for (const [id, had] of this.tall)
      if (!tallNow.has(id)) {
        this.unmount(had.built);
        this.tall.delete(id);
        this.tallIds.delete(id);
        changed = true;
      }
    if (!changed && this.floor) return;
    this.collect();
    this.bakeFloor();
  }

  // what clicks, fades, cards and lights see: everything built, gathered
  private collect() {
    const all = [
      ...this.walls,
      ...[...this.areas.values()].map((a) => a.built),
      ...[...this.tall.values()].map((t) => t.built),
    ];
    this.picks = all.flatMap((b) => b.picks);
    this.cards = all.flatMap((b) => b.cards);
    this.fades = [...this.wallFades, ...[...this.tall.values()].map((t) => t.fade)];
    this.lights = lightSources(this.objects);
    this.stats.areas = this.areas.size;
  }

  // one thing drawn on its own (also build mode's ghosts)
  drawObject(o: WorldObjectDef): { out: Out; top: number; tall: boolean; pick: Pick3 | null } {
    const { door, drawItem, hasItemArt, itemSketchOpts } = this.items;
    const e = entry(o.kind);
    const out = new Out();
    if (o.kind === "door") {
      const rot = (o.rot ?? 0) % 2 === 1 ? 3 : 0;
      const st = String(o.props?.state ?? "open");
      const shut = (st === "closed" || st === "locked") && !o.props?.passing;
      for (const part of shut ? ["edge"] : ["edge", "leaf"]) {
        const s = new MeshSketch({ rot, w: 1, h: 1, at: [o.x, o.y], out });
        door(s, { ...(o.props ?? {}), _part: part });
        s.end();
      }
    } else {
      const rot = rotOf(o);
      const ref = { kind: o.kind, id: o.id, rot, props: o.props };
      const at = anchorOf(o);
      const lift = e.onSurface ? Number(o.props?.z) || 0 : 0;
      if (hasItemArt(o.kind)) {
        // things on a surface are drawn around the middle of a 1×1 tile
        const s = new MeshSketch({ ...itemSketchOpts(ref), ...(e.onSurface ? { w: 1, h: 1 } : {}), at, lift, out });
        drawItem(s, ref);
        s.end();
      } else {
        // no drawing yet: the old box art
        const p = piece(o.kind, o.props ?? {}, o.id);
        const s = new MeshSketch({ rot, w: e.w, h: e.h, at, lift, out });
        for (const b of p.boxes)
          s.box({
            x: b.x,
            y: b.y,
            w: b.w,
            d: b.d,
            z: b.z,
            h: b.h,
            glow: b.glow,
            mat: { c: hexStr(b.color), top: b.top !== undefined ? hexStr(b.top) : undefined },
            line: b.outline === false ? 0 : 1,
          });
      }
    }
    const top = topOf(out);
    // what clicks reach: in the live world (as iso) things to use, or with
    // something to do — a chair, my desk; in build mode, everything
    const b = boundsOf(out);
    return {
      out,
      top,
      // on their own (to fade): tall furniture, and what hangs on a wall (it goes with its wall)
      tall: o.kind !== "door" && !e.onSurface && (e.wall || top > TALL),
      pick: b ? { id: o.id, use: !!e.interact || hasActions(o), ...b } : null,
    };
  }

  private drawDress(d: DressItem, out: Out) {
    const seed = bucket(d.seed);
    const s = new MeshSketch({ w: 1, h: 1, seed, at: dressAt(d), out });
    this.items.dressing(s, d.kind as DressKind, d.z, seed);
    s.end();
  }

  // ── meshes ─────────────────────────────────────────────────────────────────
  private mount(out: Out): Built {
    const { lit, glow, clear, ink } = this.materials;
    const built: Built = { objs: [], cards: [], soft: out.soft, picks: [], dispose: [] };
    const tri = (g: Geo, mat: Material, shadow: boolean) => {
      if (g.empty) return;
      const geo = new BufferGeometry();
      geo.setAttribute("position", new Float32BufferAttribute(g.pos, 3));
      geo.setAttribute("normal", new Float32BufferAttribute(g.nor, 3));
      geo.setAttribute("color", new Float32BufferAttribute(g.col, 4));
      geo.computeBoundingSphere();
      built.dispose.push(geo);
      const m = new Mesh(geo, mat);
      m.castShadow = shadow;
      m.receiveShadow = shadow;
      m.userData.tris = g.pos.length / 9;
      built.objs.push(m);
    };
    tri(out.lit, lit, true);
    tri(out.glow, glow, false);
    tri(out.clear, clear, false);
    if (out.lines.length) {
      const geo = new BufferGeometry();
      geo.setAttribute("position", new Float32BufferAttribute(out.lines, 3));
      geo.setAttribute("color", new Float32BufferAttribute(out.lineCol, 4));
      geo.computeBoundingSphere();
      built.dispose.push(geo);
      built.objs.push(new LineSegments(geo, ink));
    }
    // decals: free-hand drawing on faces, stuck to them
    for (const dc of out.decals) {
      const geo = new BufferGeometry();
      geo.setAttribute("position", new Float32BufferAttribute(dc.pos, 3));
      geo.setAttribute("normal", new Float32BufferAttribute(dc.nor, 3));
      geo.setAttribute("uv", new Float32BufferAttribute(dc.uv, 2));
      geo.computeBoundingSphere();
      const common = {
        transparent: true,
        alphaTest: 0.02,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      };
      const mat = dc.glow ? new MeshBasicMaterial({ ...common, toneMapped: false }) : new MeshLambertMaterial(common);
      if (!dc.glow) this.light(mat);
      built.dispose.push(geo, mat);
      const m = new Mesh(geo, mat);
      m.visible = false;
      m.renderOrder = 1;
      built.objs.push(m);
      cardTexture(dc.svg).then((t) => {
        if (!t || !built.objs.length) return;
        mat.map = t;
        mat.needsUpdate = true;
        m.visible = true;
      });
    }
    // cards: free-hand drawing, turned to the camera
    for (const c of out.cards) {
      const geo = new PlaneGeometry(c.u1 - c.u0, c.v1 - c.v0);
      // cards all turn the same way: neighbours in a row would share one plane
      // when you look along it, so each stands a hair nearer or further
      geo.translate((c.u0 + c.u1) / 2, (c.v0 + c.v1) / 2, (this.cardN++ % 8) * 0.0015);
      // (a glow card stands where its lit card does: drawn a hair nearer, or the two flicker)
      const mat = c.glow
        ? new MeshBasicMaterial({
            transparent: true,
            depthWrite: false,
            toneMapped: false,
            side: DoubleSide,
            polygonOffset: true,
            polygonOffsetFactor: -1,
            polygonOffsetUnits: -4,
          })
        : new MeshLambertMaterial({ transparent: true, alphaTest: 0.04, side: DoubleSide });
      if (!c.glow) this.light(mat);
      built.dispose.push(geo, mat);
      const m = new Mesh(geo, mat);
      m.position.set(c.x, c.z, c.y);
      m.visible = false;
      m.renderOrder = c.glow ? 2 : 1;
      built.cards.push(m);
      built.objs.push(m);
      cardTexture(c.svg).then((t) => {
        if (!t || !built.objs.length) return;
        mat.map = t;
        mat.needsUpdate = true;
        m.visible = true;
      });
    }
    for (const m of built.objs) this.root.add(m);
    this.stats.triangles += built.objs.reduce((n, m) => n + ((m.userData.tris as number) ?? 0), 0);
    this.stats.meshes += built.objs.length;
    this.stats.cards += built.cards.length;
    return built;
  }

  private unmount(b: Built) {
    for (const m of b.objs) {
      this.root.remove(m);
      this.stats.triangles -= (m.userData.tris as number) ?? 0;
    }
    this.stats.meshes -= b.objs.length;
    this.stats.cards -= b.cards.length;
    for (const d of b.dispose) d.dispose();
    b.objs = [];
  }

  // After a lost WebGL context comes back: three uploads every texture again
  // from its source, and the floor's (one big, GPU-backed canvas) is the one
  // Chrome empties in a GPU reset — so it's drawn afresh.
  rebakeFloor() {
    if (this.floor) this.floor = { ...this.floor, sig: "" };
    this.bakeFloor();
  }

  // ── the floor, from above, with the items' contact shadows ────────────────
  // (baked again only when something on it moves or comes or goes)
  private bakeFloor() {
    const sig = this.objects
      .map((o) => `${o.id}|${o.kind}|${o.x}|${o.y}|${o.rot ?? 0}`)
      .sort()
      .join(";");
    if (this.floor?.sig === sig) return;
    const map = this.map;
    const px = Math.max(16, Math.min(64, Math.floor(4096 / Math.max(map.width, map.height))));
    // in pieces of at most 1024 px a side, as the iso view bakes it: a canvas
    // the size of the whole floor (12 M px on a big map) is slow in Chrome, and
    // on some of them comes out blank
    const CH = Math.max(1, Math.floor(1024 / px));
    const bake = new FloorBake(map, this.objects, 1);
    const softs = [...this.areas.values(), ...this.tall.values()].map((a) => a.built.soft);
    this.dropFloor();
    const meshes: Mesh[] = [];
    for (let cy = 0; cy < map.height; cy += CH)
      for (let cx = 0; cx < map.width; cx += CH) {
        const w = Math.min(CH, map.width - cx);
        const h = Math.min(CH, map.height - cy);
        // one quad per run of floor tiles (the void outside is cut by the
        // shape, never by the texture's alpha: a lost canvas can't take the floor away)
        const pos: number[] = [];
        const nor: number[] = [];
        const uv: number[] = [];
        for (let y = cy; y < cy + h; y++) {
          let x = cx;
          while (x < cx + w) {
            if (!isFloor(tileAt(map, x, y))) {
              x++;
              continue;
            }
            let x1 = x;
            while (x1 < cx + w && isFloor(tileAt(map, x1, y))) x1++;
            // (u along x, v down from the chunk's top row, as the canvas is laid)
            const u0 = (x - cx) / w;
            const u1 = (x1 - cx) / w;
            const v0 = 1 - (y - cy) / h;
            const v1 = 1 - (y + 1 - cy) / h;
            pos.push(x, 0, y, x, 0, y + 1, x1, 0, y + 1, x, 0, y, x1, 0, y + 1, x1, 0, y);
            uv.push(u0, v0, u0, v1, u1, v1, u0, v0, u1, v1, u1, v0);
            for (let i = 0; i < 6; i++) nor.push(0, 1, 0);
            x = x1;
          }
        }
        if (!pos.length) continue;
        const plan = bake.drawPlan(px, cx, cy, w, h);
        softShadows(plan, px, cx, cy, w, h, softs);
        const tex = new CanvasTexture(plan);
        tex.colorSpace = SRGBColorSpace;
        tex.anisotropy = this.anisotropy;
        const mat = new MeshLambertMaterial({ map: tex });
        this.light(mat);
        const geo = new BufferGeometry();
        geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
        geo.setAttribute("normal", new Float32BufferAttribute(nor, 3));
        geo.setAttribute("uv", new Float32BufferAttribute(uv, 2));
        geo.computeBoundingSphere();
        const mesh = new Mesh(geo, mat);
        mesh.receiveShadow = true;
        mesh.name = "floor";
        this.root.add(mesh);
        meshes.push(mesh);
      }
    this.floor = { meshes, sig };
  }

  private dropFloor() {
    for (const m of this.floor?.meshes ?? []) {
      this.root.remove(m);
      m.geometry.dispose();
      const mat = m.material as MeshLambertMaterial;
      mat.map?.dispose();
      mat.dispose();
    }
    this.floor = null;
  }

  dispose() {
    for (const b of this.walls) this.unmount(b);
    for (const a of this.areas.values()) this.unmount(a.built);
    for (const t of this.tall.values()) this.unmount(t.built);
    for (const f of [...this.wallFades, ...[...this.tall.values()].map((t) => t.fade)])
      for (const m of f.own?.values() ?? []) m.dispose();
    this.dropFloor();
    for (const m of Object.values(this.materials)) m.dispose();
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────
// The items' contact shadows on a floor piece (tiles cx, cy, w by h at `px`
// a tile), soft without a canvas filter (a filtered fill on a big canvas is
// what Chrome draws slowly, or not at all): a few fills of each shape, from a
// little inside its edge to a little outside, each as faint as the sum needs.
function softShadows(
  plan: HTMLCanvasElement,
  px: number,
  cx: number,
  cy: number,
  w: number,
  h: number,
  softs: Out["soft"][],
) {
  const g = plan.getContext("2d") as CanvasRenderingContext2D;
  g.save();
  g.globalCompositeOperation = "source-atop";
  g.setTransform(px, 0, 0, px, -cx * px, -cy * px);
  g.fillStyle = INK;
  const STEPS = 3;
  const blur = Math.max(1, px * 0.05) / px; // tiles
  const layer = (op: number) => 1 - (1 - op) ** (1 / STEPS);
  const inside = (x0: number, y0: number, x1: number, y1: number) =>
    x1 >= cx - 1 && x0 <= cx + w + 1 && y1 >= cy - 1 && y0 <= cy + h + 1;
  for (const soft of softs) {
    for (const r of soft.rects) {
      if (!inside(r.x0, r.y0, r.x1, r.y1)) continue;
      g.globalAlpha = layer(r.op * 0.8);
      for (let i = 0; i < STEPS; i++) {
        const d = blur * ((2 * i) / (STEPS - 1) - 1);
        const rw = r.x1 - r.x0 + 2 * d;
        const rh = r.y1 - r.y0 + 2 * d;
        if (rw <= 0 || rh <= 0) continue;
        const rad = Math.max(0, Math.min(r.round * 0.5 + d, rw / 2, rh / 2));
        g.beginPath();
        g.roundRect(r.x0 - d, r.y0 - d, rw, rh, rad);
        g.fill();
      }
    }
    for (const dot of soft.dots) {
      if (!inside(dot.x - dot.r, dot.y - dot.r, dot.x + dot.r, dot.y + dot.r)) continue;
      g.globalAlpha = layer(dot.op * 0.8);
      for (let i = 0; i < STEPS; i++) {
        const rr = dot.r + blur * ((2 * i) / (STEPS - 1) - 1);
        if (rr <= 0) continue;
        g.beginPath();
        g.arc(dot.x, dot.y, rr, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  g.restore();
}

const areaKey = (x: number, y: number) => `${Math.floor(x / AREA)},${Math.floor(y / AREA)}`;

function getOr<K, V>(m: Map<K, V>, k: K, make: () => V): V {
  let v = m.get(k);
  if (v === undefined) {
    v = make();
    m.set(k, v);
  }
  return v;
}

// where an object's sketch starts (things on a surface: around their spot on it)
function anchorOf(o: WorldObjectDef): [number, number] {
  if (entry(o.kind).onSurface) {
    const c = topCentre(o);
    return [c.x - 0.5, c.y - 0.5];
  }
  return [o.x, o.y];
}

// the clutter's sketch is centred on (0.5, 0.5); frames hang on the edge at y
const dressAt = (d: DressItem): [number, number] => [d.x - 0.5, d.kind === "frame" ? d.y : d.y - 0.5];
// seeds are bucketed (as in iso) so look-alike pieces share a drawing
const bucket = (seed: number) => (Math.floor(seed * 12) + 0.5) / 12;

// everything about a thing that changes how it's drawn
function objectSig(o: WorldObjectDef): string {
  const p = Object.entries(o.props ?? {})
    .filter(([k]) => !QUIET_PROPS.has(k))
    .sort(([a], [b]) => (a < b ? -1 : 1));
  return `${o.id}|${o.kind}|${o.x}|${o.y}|${o.rot ?? 0}|${JSON.stringify(p)}`;
}

// the highest point drawn (tiles)
function topOf(o: Out): number {
  let top = 0;
  for (const g of [o.lit, o.glow, o.clear])
    for (let i = 1; i < g.pos.length; i += 3) if (g.pos[i] > top) top = g.pos[i];
  return top;
}

// the 3D box around what's drawn (tiles), padded a little for easy clicking
function boundsOf(o: Out): Omit<Pick3, "id" | "use" | "dress"> | null {
  let x0 = 1e9;
  let y0 = 1e9;
  let z0 = 1e9;
  let x1 = -1e9;
  let y1 = -1e9;
  let z1 = -1e9;
  for (const g of [o.lit, o.glow, o.clear])
    for (let i = 0; i < g.pos.length; i += 3) {
      const x = g.pos[i];
      const h = g.pos[i + 1];
      const y = g.pos[i + 2];
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (h < z0) z0 = h;
      if (h > z1) z1 = h;
    }
  // free-hand cards (leaves, shades) count too: a box round each, as wide as it turns
  for (const c of o.cards) {
    const r = Math.max(Math.abs(c.u0), Math.abs(c.u1)) * 0.75;
    x0 = Math.min(x0, c.x - r);
    x1 = Math.max(x1, c.x + r);
    y0 = Math.min(y0, c.y - r);
    y1 = Math.max(y1, c.y + r);
    z0 = Math.min(z0, c.z + c.v0);
    z1 = Math.max(z1, c.z + c.v1);
  }
  if (x1 < x0) return null;
  const p = 0.04;
  return { x0: x0 - p, y0: y0 - p, z0: z0 - p, x1: x1 + p, y1: y1 + p, z1: z1 + p };
}

// add one sketch's buffers to another (no spread: these get long)
function append(dst: Out, src: Out) {
  const cat = (a: number[], b: number[]) => {
    for (let i = 0; i < b.length; i++) a.push(b[i]);
  };
  for (const k of ["lit", "glow", "clear"] as const) {
    cat(dst[k].pos, src[k].pos);
    cat(dst[k].nor, src[k].nor);
    cat(dst[k].col, src[k].col);
  }
  cat(dst.lines, src.lines);
  cat(dst.lineCol, src.lineCol);
  dst.cards.push(...src.cards);
  dst.decals.push(...src.decals);
  dst.soft.rects.push(...src.soft.rects);
  dst.soft.dots.push(...src.soft.dots);
}

const hexStr = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

// SVG → texture, shared between equal drawings (never disposed: other pieces may use it)
const cardCache = new Map<string, Promise<Texture | null>>();
export function cardTexture(svg: string): Promise<Texture | null> {
  let p = cardCache.get(svg);
  if (!p) {
    p = new Promise((resolve) => {
      const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      img
        .decode()
        .then(() => {
          const t = new Texture(img);
          t.colorSpace = SRGBColorSpace;
          t.needsUpdate = true;
          resolve(t);
        })
        .catch(() => resolve(null))
        .finally(() => URL.revokeObjectURL(url));
    });
    cardCache.set(svg, p);
  }
  return p;
}
