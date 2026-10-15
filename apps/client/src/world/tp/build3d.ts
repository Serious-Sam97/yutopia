import { entry, hangStrip, isFloor, type MapDef, placedFootprint, tileAt, type WorldObjectDef } from "@yutopia/shared";
import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  type Object3D,
  PlaneGeometry,
  SphereGeometry,
} from "three";
import { WALL_H } from "../art/furniture";
import { cardTexture, type Pick3, type World3 } from "./build";
import { zt } from "./kit3d";

// Build mode in third person: what the iso engine shows while you build
// (engine.buildLook) drawn in 3D — the things in your hand as see-through
// ghosts (green where they fit, red where not, lifted with a bob), their spot
// on the floor, a wall or a door about to go on an edge, a room being drawn,
// outlines round what you point at and what's selected, the tile grid, the
// arrival pin. The build controller itself is the iso one: it works in world
// tiles, and the view hands it the floor under the pointer.

export interface BuildLook {
  ghosts: { def: WorldObjectDef; ok: boolean }[];
  lift: number;
  edge: { e: { x: number; y: number; dir: "h" | "v" }; ok: boolean } | null;
  rect: { x: number; y: number; w: number; h: number; ok: boolean } | null;
  spawn: { at: { x: number; y: number }; pick: { x: number; y: number; ok: boolean } | null } | null;
  outlines: { id: string; dress?: boolean; color: number; fill?: number }[];
  hidden: Set<string>;
  grid: boolean;
}

const OK = 0x6e7b3a; // olive
const BAD = 0xb5562f; // rust
const VFD = 0xffb35c;

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
    this.ghosts.position.y = look.lift > 0 ? zt(look.lift) + Math.sin(this.time * 3) * 0.03 : 0;
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
    const sig = look ? JSON.stringify([look.edge, look.rect, look.spawn, look.outlines, world.picks.length]) : "";
    if (sig === this.cueSig) return;
    this.cueSig = sig;
    clear(this.cues);
    if (!look) return;
    const ok = (b: boolean) => (b ? OK : BAD);
    if (look.edge) {
      const { e } = look.edge;
      const t = 0.1;
      const strip = new Mesh(
        new PlaneGeometry(e.dir === "h" ? 1 : 2 * t, e.dir === "h" ? 2 * t : 1).rotateX(-Math.PI / 2),
        cue(ok(look.edge.ok), 0.6),
      );
      strip.position.set(e.dir === "h" ? e.x + 0.5 : e.x, 0.016, e.dir === "h" ? e.y : e.y + 0.5);
      const face = new Mesh(new PlaneGeometry(1, zt(WALL_H)), cue(ok(look.edge.ok), 0.22));
      face.position.set(e.dir === "h" ? e.x + 0.5 : e.x, zt(WALL_H) / 2, e.dir === "h" ? e.y : e.y + 0.5);
      if (e.dir === "v") face.rotation.y = Math.PI / 2;
      const rim = new LineSegments(
        new EdgesGeometry(face.geometry),
        new LineBasicMaterial({ color: look.edge.ok ? VFD : BAD }),
      );
      rim.position.copy(face.position);
      rim.rotation.copy(face.rotation);
      this.cues.add(strip, face, rim);
    }
    if (look.rect) {
      const r = look.rect;
      const m = new Mesh(new PlaneGeometry(r.w, r.h).rotateX(-Math.PI / 2), cue(ok(r.ok), 0.25));
      m.position.set(r.x + r.w / 2, 0.016, r.y + r.h / 2);
      const rim = new LineSegments(new EdgesGeometry(m.geometry), new LineBasicMaterial({ color: r.ok ? VFD : BAD }));
      rim.position.copy(m.position);
      this.cues.add(m, rim);
    }
    if (look.spawn) {
      const tile = (x: number, y: number, color: number, o: number) => {
        const m = new Mesh(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), cue(color, o));
        m.position.set(Math.floor(x) + 0.5, 0.016, Math.floor(y) + 0.5);
        this.cues.add(m);
      };
      const pk = look.spawn.pick;
      if (pk) tile(pk.x, pk.y, ok(pk.ok), 0.35);
      const s = look.spawn.at;
      tile(s.x, s.y, 0xffa630, 0.25);
      // the pin: a pole and an amber head
      const pole = new Mesh(new CylinderGeometry(0.025, 0.025, 0.8, 8), new MeshLambertMaterial({ color: 0x2a1a12 }));
      pole.position.set(Math.floor(s.x) + 0.5, 0.4, Math.floor(s.y) + 0.5);
      const head = new Mesh(
        new SphereGeometry(0.16, 16, 12),
        new MeshBasicMaterial({ color: 0xffa630, toneMapped: false }),
      );
      head.position.set(pole.position.x, 0.92, pole.position.z);
      this.cues.add(pole, head);
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
    for (let y = 0; y < m.height; y++)
      for (let x = 0; x < m.width; x++) {
        if (!isFloor(tileAt(m, x, y))) continue;
        pts.push(x, 0.012, y, x + 1, 0.012, y, x, 0.012, y, x, 0.012, y + 1);
        if (!isFloor(tileAt(m, x + 1, y))) pts.push(x + 1, 0.012, y, x + 1, 0.012, y + 1);
        if (!isFloor(tileAt(m, x, y + 1))) pts.push(x, 0.012, y + 1, x + 1, 0.012, y + 1);
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
