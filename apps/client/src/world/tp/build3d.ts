import {
  entry,
  hangStrip,
  isFloor,
  type MapDef,
  placedFootprint,
  spanOf,
  WALL_H,
  type WorldObjectDef,
} from "@yutopia/shared";
import { cellOf } from "@yutopia/shared/structure";
import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineDashedMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  type Object3D,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  Vector2,
  Vector3,
} from "three";
import { cardTexture, type Pick3, type World3 } from "./build";

// Build mode in 3D: what it shows (the model's buildLook) — the things in your
// hand as see-through ghosts (green where they fit, red where not, lifted with a
// bob), their spot on the floor, a wall or a door about to go on an edge, a room
// being drawn, outlines round what you point at and what's selected, the tile
// grid, the arrival pin; and my own arrival pin, outside build mode too. The
// build controller works in world tiles, and the view hands it the floor under
// the pointer.

export interface BuildLook {
  ghosts: { def: WorldObjectDef; ok: boolean }[];
  lift: number;
  edges: { e: { x: number; y: number; dir: "h" | "v" }; ok: boolean; remove?: boolean }[];
  // wall faces pointed at / painted / selected (the Walls tool)
  faces: {
    p: { x: number; y: number; dir: "h" | "v"; side: 1 | -1 };
    mat: string | null;
    ok: boolean;
    sel?: boolean;
  }[];
  // walls drawn free (plan 72 phase 11) and where the pointer snapped
  segs: {
    a: [number, number];
    b: [number, number];
    h: number;
    ok: boolean;
    remove?: boolean;
    mat?: string;
    pts?: [number, number][];
    t?: number;
  }[];
  marks: { p: [number, number]; kind: string; from?: [number, number]; z?: number; fromZ?: number }[];
  // floors drawn free (phase 11.7) and the working height the cues stand at
  polys: {
    pts: [number, number][];
    holes?: [number, number][][];
    ok: boolean;
    closed: boolean;
    remove?: boolean;
    top?: string;
  }[];
  over: number;
  wallView: "up" | "cut" | "down" | null;
  rect: { x: number; y: number; w: number; h: number; ok: boolean } | null;
  spawn: { at: { x: number; y: number }; pick: { x: number; y: number; ok: boolean } | null } | null;
  // my own arrival point (olive), and the tile I'm picking (at far off while only picking)
  mine: { at: { x: number; y: number }; pick: { x: number; y: number; ok: boolean } | null } | null;
  outlines: { id: string; dress?: boolean; color: number; fill?: number }[];
  hidden: Set<string>;
  grid: boolean;
}

const OK = 0x6e7b3a; // olive
const BAD = 0xb5562f; // rust
const VFD = 0xffb35c;
const AMBER = 0xffa630;
const CREAM = 0xefe4cc;
// a wall material's face colour (the Walls tool's preview)
const MAT_COLOR: Record<string, number> = { p: 0xefe4cc, w: 0x6b4430, f: 0x9e4a36, b: 0x9a4a30, k: 0xc49a6c };

// a floor material's colour (the floors' swatches): a floor drawn free's preview
const FLOOR_COLOR: Record<string, number> = {
  ".": 0x8f6038,
  ",": 0x6b6a3a,
  _: 0xe6dcc4,
  ":": 0x7a3b2e,
  "~": 0x2f2620,
  x: 0x4a4740,
};

const cue = (color: number, opacity: number) =>
  new MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false, side: DoubleSide });

export class BuildLayer {
  readonly root = new Group();
  private ghosts = new Group();
  private cues = new Group(); // edge, rect, spawn, outlines (redrawn when they change)
  private grid: LineSegments | null = null;
  private ghostSig = "";
  private cueSig = "";
  private time = 0;

  constructor(private map: MapDef) {
    this.root.add(this.ghosts, this.cues);
  }

  setMap(map: MapDef) {
    this.map = map;
    this.clearGrid();
  }

  sync(look: BuildLook | null, world: World3, dt: number) {
    this.time += dt;
    this.root.visible = !!look;
    if (!look) {
      this.setGhosts(null, world);
      this.setCues(null, world);
      this.clearGrid();
      return;
    }
    this.setGhosts(look, world);
    this.setCues(look, world);
    if (look.grid && !this.grid) this.makeGrid();
    if (!look.grid) this.clearGrid();
    // what's in hand bobs gently
    this.ghosts.position.y = look.lift > 0 ? look.lift + Math.sin(this.time * 3) * 0.03 : 0;
  }

  // ── what's in your hand ───────────────────────────────────────────────────
  private setGhosts(look: BuildLook | null, world: World3) {
    const sig = look ? JSON.stringify(look.ghosts) : "";
    if (sig === this.ghostSig) return;
    this.ghostSig = sig;
    this.ghostCards = [];
    clear(this.ghosts);
    for (const m of this.ghostFloor) disposeTree(m);
    this.ghostFloor = [];
    for (const g of look?.ghosts ?? []) {
      const out = world.drawObject(g.def).out;
      const mat = new MeshLambertMaterial({
        vertexColors: true,
        color: g.ok ? 0xffffff : 0xff9a80,
        transparent: true,
        opacity: g.ok ? 0.9 : 0.6,
        depthWrite: false,
      });
      if (!out.lit.empty || !out.glow.empty || !out.clear.empty) {
        const geo = new BufferGeometry();
        const pos = [...out.lit.pos, ...out.glow.pos, ...out.clear.pos];
        const nor = [...out.lit.nor, ...out.glow.nor, ...out.clear.nor];
        const col = [...out.lit.col, ...out.glow.col, ...out.clear.col];
        geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
        geo.setAttribute("normal", new Float32BufferAttribute(nor, 3));
        geo.setAttribute("color", new Float32BufferAttribute(col, 4));
        this.ghosts.add(new Mesh(geo, mat));
      }
      // its free-hand parts (leaves, a shade) as cards, see-through like the rest
      for (const c of out.cards) {
        const geo = new PlaneGeometry(c.u1 - c.u0, c.v1 - c.v0);
        geo.translate((c.u0 + c.u1) / 2, (c.v0 + c.v1) / 2, 0);
        const cm = new MeshBasicMaterial({
          transparent: true,
          opacity: g.ok ? 0.9 : 0.6,
          color: g.ok ? 0xffffff : 0xff9a80,
          depthWrite: false,
          side: DoubleSide,
        });
        const card = new Mesh(geo, cm);
        card.position.set(c.x, c.z, c.y);
        card.visible = false;
        this.ghosts.add(card);
        this.ghostCards.push(card);
        void cardTexture(c.svg).then((t) => {
          if (!t) return;
          cm.map = t;
          cm.needsUpdate = true;
          card.visible = true;
        });
      }
      // its spot on the floor (at floor level, not lifted): a strip along the wall for wall things
      const e = entry(g.def.kind);
      const { w, h } = placedFootprint(g.def);
      const r = e.wall ? hangStrip(g.def, 0.25) : { x0: g.def.x, y0: g.def.y, x1: g.def.x + w, y1: g.def.y + h };
      const [sw, sh] = [r.x1 - r.x0, r.y1 - r.y0];
      const spot = new Mesh(new PlaneGeometry(sw, sh).rotateX(-Math.PI / 2), cue(g.ok ? OK : BAD, 0.4));
      spot.position.set(r.x0 + sw / 2, 0.015, r.y0 + sh / 2);
      this.root.add(spot); // (on the floor: not lifted with the ghost)
      this.ghostFloor.push(spot);
    }
  }
  private ghostFloor: Mesh[] = [];
  ghostCards: Mesh[] = []; // turned to the camera with the room's cards

  // ── edges, rooms, the arrival pin, outlines ────────────────────────────────
  private setCues(look: BuildLook | null, world: World3) {
    const sig = look
      ? JSON.stringify([
          look.edges,
          look.segs,
          look.marks,
          look.polys,
          look.over,
          look.faces,
          look.rect,
          look.spawn,
          look.mine,
          look.outlines,
          world.picks.length,
        ])
      : "";
    if (sig === this.cueSig) return;
    this.cueSig = sig;
    clear(this.cues);
    if (!look) return;
    // (at the working height: a mezzanine's — phase 11.7)
    this.cues.position.y = look.over ?? 0;
    const ok = (b: boolean) => (b ? OK : BAD);
    for (const g of look.edges) {
      const { e } = g;
      const good = g.ok && !g.remove;
      const t = 0.1;
      const strip = new Mesh(
        new PlaneGeometry(e.dir === "h" ? 1 : 2 * t, e.dir === "h" ? 2 * t : 1).rotateX(-Math.PI / 2),
        cue(ok(good), 0.6),
      );
      strip.position.set(e.dir === "h" ? e.x + 0.5 : e.x, 0.016, e.dir === "h" ? e.y : e.y + 0.5);
      const face = new Mesh(new PlaneGeometry(1, WALL_H), cue(ok(good), g.remove ? 0.12 : 0.22));
      face.position.set(e.dir === "h" ? e.x + 0.5 : e.x, WALL_H / 2, e.dir === "h" ? e.y : e.y + 0.5);
      if (e.dir === "v") face.rotation.y = Math.PI / 2;
      const rim = new LineSegments(
        new EdgesGeometry(face.geometry),
        new LineBasicMaterial({ color: good ? VFD : BAD }),
      );
      rim.position.copy(face.position);
      rim.rotation.copy(face.rotation);
      this.cues.add(strip, face, rim);
      if (g.remove) {
        // a cross on it: this wall goes
        const c = 0.3;
        const x = new LineSegments(
          new BufferGeometry().setFromPoints([
            new Vector3(-c, -c * 2, 0.12),
            new Vector3(c, c * 2, 0.12),
            new Vector3(c, -c * 2, 0.12),
            new Vector3(-c, c * 2, 0.12),
            new Vector3(-c, -c * 2, -0.12),
            new Vector3(c, c * 2, -0.12),
            new Vector3(c, -c * 2, -0.12),
            new Vector3(-c, c * 2, -0.12),
          ]),
          new LineBasicMaterial({ color: BAD }),
        );
        x.position.copy(face.position);
        x.rotation.copy(face.rotation);
        this.cues.add(x);
      }
    }
    // walls drawn free: a see-through wall (the material's colour) on a strip of its thickness,
    // rimmed; one about to go crossed out
    for (const g of look.segs) {
      const pts = g.pts ?? [g.a, g.b];
      const good = g.ok && !g.remove;
      const col = ok(good);
      const faceMat = cue(
        good && g.mat ? (MAT_COLOR[g.mat] ?? AMBER) : col,
        g.remove ? 0.12 : good && g.mat ? 0.5 : 0.25,
      );
      const stripMat = cue(col, 0.6);
      const rimMat = new LineBasicMaterial({ color: good ? VFD : BAD });
      let mid: Mesh | null = null;
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1];
        const [bx, by] = pts[i];
        const len = Math.hypot(bx - ax, by - ay);
        if (len < 1e-3) continue;
        const yaw = -Math.atan2(by - ay, bx - ax);
        const [cx, cy] = [(ax + bx) / 2, (ay + by) / 2];
        const th = g.t ?? 0.2;
        const strip = new Mesh(new PlaneGeometry(len, th).rotateX(-Math.PI / 2), stripMat);
        strip.position.set(cx, 0.016, cy);
        strip.rotation.y = yaw;
        const face = new Mesh(new BoxGeometry(len, g.h, th), faceMat);
        face.position.set(cx, g.h / 2, cy);
        face.rotation.y = yaw;
        this.cues.add(strip, face);
        if (i === Math.ceil(pts.length / 2)) mid = face;
        if (!g.pts) {
          // a straight wall: its box's edges
          const rim = new LineSegments(new EdgesGeometry(face.geometry), rimMat);
          rim.position.copy(face.position);
          rim.rotation.copy(face.rotation);
          this.cues.add(rim);
        }
      }
      if (g.pts) {
        // an arc: one rim along its top and its foot, and up its two ends
        const line: Vector3[] = [];
        for (let i = 1; i < pts.length; i++)
          for (const y of [0.02, g.h])
            line.push(new Vector3(pts[i - 1][0], y, pts[i - 1][1]), new Vector3(pts[i][0], y, pts[i][1]));
        for (const p of [pts[0], pts[pts.length - 1]])
          line.push(new Vector3(p[0], 0.02, p[1]), new Vector3(p[0], g.h, p[1]));
        this.cues.add(new LineSegments(new BufferGeometry().setFromPoints(line), rimMat));
      }
      if (g.remove && mid) {
        const c = 0.5;
        const x = new LineSegments(
          new BufferGeometry().setFromPoints([
            new Vector3(-c, -c, 0.12),
            new Vector3(c, c, 0.12),
            new Vector3(c, -c, 0.12),
            new Vector3(-c, c, 0.12),
            new Vector3(-c, -c, -0.12),
            new Vector3(c, c, -0.12),
            new Vector3(c, -c, -0.12),
            new Vector3(-c, c, -0.12),
          ]),
          new LineBasicMaterial({ color: BAD }),
        );
        x.position.copy(mid.position);
        x.rotation.copy(mid.rotation);
        this.cues.add(x);
      }
    }
    // floors drawn free: their outline (amber; rust when they don't fit, crossed when they go) and,
    // closed, a see-through fill in their material's colour
    for (const g of look.polys) {
      const good = g.ok && !g.remove;
      const col = good ? VFD : BAD;
      const line: Vector3[] = [];
      for (const r of [g.pts, ...(g.holes ?? [])]) {
        const n = r.length;
        for (let i = 0; i < n - (g.closed || r !== g.pts ? 0 : 1); i++)
          line.push(new Vector3(r[i][0], 0.03, r[i][1]), new Vector3(r[(i + 1) % n][0], 0.03, r[(i + 1) % n][1]));
      }
      this.cues.add(new LineSegments(new BufferGeometry().setFromPoints(line), new LineBasicMaterial({ color: col })));
      if (g.closed && g.pts.length >= 3) {
        const shape = new Shape(g.pts.map(([x, y]) => new Vector2(x, -y)));
        for (const h of g.holes ?? []) shape.holes.push(new Shape(h.map(([x, y]) => new Vector2(x, -y))));
        const fill = new Mesh(
          new ShapeGeometry(shape).rotateX(-Math.PI / 2),
          cue(g.remove ? BAD : good ? (FLOOR_COLOR[g.top ?? ""] ?? OK) : BAD, g.remove ? 0.25 : 0.45),
        );
        fill.position.y = 0.02;
        this.cues.add(fill);
      }
      for (const p of g.pts) {
        const dot = new Mesh(new CylinderGeometry(0.07, 0.07, 0.02, 12), cue(col, 0.9));
        dot.position.set(p[0], 0.035, p[1]);
        this.cues.add(dot);
      }
    }
    // the snap: a dot where it snapped (amber; an end or a middle cream), and for a line carried on
    // or square, a dashed guide back to where it's in line with
    for (const m of look.marks) {
      const col = m.kind === "end" || m.kind === "middle" ? CREAM : AMBER;
      const dot = new Mesh(new CylinderGeometry(0.12, 0.12, 0.02, 20), cue(col, 0.95));
      dot.position.set(m.p[0], (m.z ?? 0) + 0.03, m.p[1]);
      const ring = new Mesh(new CylinderGeometry(0.22, 0.22, 0.01, 28, 1, true), cue(col, 0.6));
      ring.position.copy(dot.position);
      this.cues.add(dot, ring);
      if (m.from || m.fromZ !== undefined) {
        const f = m.from ?? m.p;
        const line = new LineSegments(
          new BufferGeometry().setFromPoints([
            new Vector3(f[0], (m.fromZ ?? 0) + 0.04, f[1]),
            new Vector3(m.p[0], (m.z ?? 0) + 0.04, m.p[1]),
          ]),
          new LineDashedMaterial({ color: col, dashSize: 0.25, gapSize: 0.15 }),
        );
        line.computeLineDistances();
        this.cues.add(line);
      }
    }
    // wall faces: on the face (just off it), the material's colour as a preview,
    // an outline, and a strip on the floor with an arrow into the room
    for (const f of look.faces) {
      const p = f.p;
      const col = !f.ok ? BAD : f.sel ? VFD : AMBER;
      const top = WALL_H;
      const off = p.side * 0.106;
      const [cx, cy] = p.dir === "h" ? [p.x + 0.5, p.y + off] : [p.x + off, p.y + 0.5];
      const face = new Mesh(
        new PlaneGeometry(0.98, top),
        cue(f.mat && f.ok ? (MAT_COLOR[f.mat] ?? col) : col, f.mat && f.ok ? 0.72 : 0.2),
      );
      face.position.set(cx, top / 2, cy);
      if (p.dir === "v") face.rotation.y = Math.PI / 2;
      const rim = new LineSegments(new EdgesGeometry(face.geometry), new LineBasicMaterial({ color: col }));
      rim.position.copy(face.position);
      rim.rotation.copy(face.rotation);
      const d = 0.32;
      const strip = new Mesh(
        new PlaneGeometry(p.dir === "h" ? 0.92 : d, p.dir === "h" ? d : 0.92).rotateX(-Math.PI / 2),
        cue(col, 0.3),
      );
      const s = p.side * (d / 2);
      strip.position.set(p.dir === "h" ? cx : p.x + s, 0.017, p.dir === "h" ? p.y + s : cy);
      this.cues.add(face, rim, strip);
    }
    if (look.rect) {
      const r = look.rect;
      const m = new Mesh(new PlaneGeometry(r.w, r.h).rotateX(-Math.PI / 2), cue(ok(r.ok), 0.25));
      m.position.set(r.x + r.w / 2, 0.016, r.y + r.h / 2);
      const rim = new LineSegments(new EdgesGeometry(m.geometry), new LineBasicMaterial({ color: r.ok ? VFD : BAD }));
      rim.position.copy(m.position);
      this.cues.add(m, rim);
    }
    // a tile on the floor (an outline round it when asked)
    const tile = (x: number, y: number, color: number, o: number, rim?: number) => {
      const m = new Mesh(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), cue(color, o));
      m.position.set(Math.floor(x) + 0.5, 0.016, Math.floor(y) + 0.5);
      this.cues.add(m);
      if (rim === undefined) return;
      const r = new LineSegments(new EdgesGeometry(m.geometry), new LineBasicMaterial({ color: rim }));
      r.position.copy(m.position);
      this.cues.add(r);
    };
    // a pin on a tile: a pole and a head
    const pin = (x: number, y: number, color: number) => {
      const pole = new Mesh(new CylinderGeometry(0.025, 0.025, 0.8, 8), new MeshLambertMaterial({ color: 0x2a1a12 }));
      pole.position.set(Math.floor(x) + 0.5, 0.4, Math.floor(y) + 0.5);
      const head = new Mesh(new SphereGeometry(0.16, 16, 12), new MeshBasicMaterial({ color, toneMapped: false }));
      head.position.set(pole.position.x, 0.92, pole.position.z);
      this.cues.add(pole, head);
    };
    if (look.spawn) {
      const pk = look.spawn.pick;
      if (pk) tile(pk.x, pk.y, ok(pk.ok), 0.35);
      const s = look.spawn.at;
      tile(s.x, s.y, AMBER, 0.25);
      pin(s.x, s.y, AMBER);
    }
    // mine: an olive tile ringed in cream, an olive pin
    if (look.mine) {
      const pk = look.mine.pick;
      if (pk) tile(pk.x, pk.y, ok(pk.ok), 0.35);
      const s = look.mine.at;
      if (s.x > -1e3) {
        tile(s.x, s.y, OK, 0.25, CREAM);
        pin(s.x, s.y, OK);
      }
    }
    // outlines: the hovered / selected things' boxes, in their colour (a floor fill when asked)
    for (const o of look.outlines) {
      const p = world.picks.find((q: Pick3) => q.id === o.id && !!q.dress === !!o.dress);
      if (!p) continue;
      const box = new BoxGeometry(p.x1 - p.x0, p.z1 - p.z0, p.y1 - p.y0);
      const lines = new LineSegments(
        new EdgesGeometry(box),
        new LineBasicMaterial({ color: o.color, depthTest: false, transparent: true, opacity: 0.9 }),
      );
      lines.position.set((p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2, (p.y0 + p.y1) / 2);
      lines.renderOrder = 5;
      box.dispose();
      this.cues.add(lines);
      if (o.fill) {
        const f = new Mesh(new PlaneGeometry(p.x1 - p.x0, p.y1 - p.y0).rotateX(-Math.PI / 2), cue(o.color, o.fill));
        f.position.set((p.x0 + p.x1) / 2, 0.017, (p.y0 + p.y1) / 2);
        this.cues.add(f);
      }
    }
  }

  // ── the tile grid over the floor ──────────────────────────────────────────
  private makeGrid() {
    const pts: number[] = [];
    const m = this.map;
    const sp = spanOf(m);
    for (let y = sp.y0; y < sp.y1; y++)
      for (let x = sp.x0; x < sp.x1; x++) {
        if (!isFloor(cellOf(m, x, y))) continue;
        pts.push(x, 0.012, y, x + 1, 0.012, y, x, 0.012, y, x, 0.012, y + 1);
        if (!isFloor(cellOf(m, x + 1, y))) pts.push(x + 1, 0.012, y, x + 1, 0.012, y + 1);
        if (!isFloor(cellOf(m, x, y + 1))) pts.push(x, 0.012, y + 1, x + 1, 0.012, y + 1);
      }
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(pts, 3));
    this.grid = new LineSegments(
      g,
      new LineBasicMaterial({ color: 0xfff0d0, transparent: true, opacity: 0.22, depthWrite: false }),
    );
    this.root.add(this.grid);
  }
  private clearGrid() {
    if (!this.grid) return;
    this.root.remove(this.grid);
    disposeTree(this.grid);
    this.grid = null;
  }

  dispose() {
    clear(this.ghosts);
    clear(this.cues);
    for (const m of this.ghostFloor) disposeTree(m);
    this.clearGrid();
  }
}

function disposeTree(o: Object3D) {
  o.parent?.remove(o);
  o.traverse((c) => {
    const m = c as Mesh;
    m.geometry?.dispose();
    const mat = m.material as { dispose(): void } | { dispose(): void }[] | undefined;
    if (Array.isArray(mat)) for (const x of mat) x.dispose();
    else mat?.dispose();
  });
}

function clear(g: Group) {
  for (const c of [...g.children]) disposeTree(c);
}
