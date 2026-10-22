import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Points,
  PointsMaterial,
  type Scene,
  Sprite,
  SpriteMaterial,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { tinted } from "./campus";
import { itemModel } from "./items3d";

// Guns and flares on screen (docs/plan/30-the-dark.md D6): a shot's flash at the
// muzzle and its tracers (the shotgun's eight), sparks where one meets a shield,
// a flare's arc through the air, and flares burning on the snow — a red stick
// spitting sparks (their light is the view's: a ground lamp's pool, red). The
// world's coords: x, up, z (the floor's y). No lights of its own: adding one
// would recompile every lit material.
// The feel (docs/plan/32-the-arms.md, phase 4): a star of a flash and a puff of
// smoke that drifts off, a moment's warm glow on the ground under it; tracers
// that fly (a short streak, not a line) and stop where the shot did — a wall,
// the ground — throwing up snow or dust there; spent brass and shells that
// bounce once and lie a while.

const MAX_TRACERS = 24;
const MAX_SPARKS = 160;
const MAX_FLARES = 8;
const MAX_DUST = 160;
const MAX_SMOKE = 10;
const MAX_BRASS = 24;
const TRACER_V = 170; // m/s: how fast a tracer's streak flies
const STREAK = 3; // m: its length
const BRASS_S = 8; // s: spent brass lies this long

interface Tracer {
  a: [number, number, number];
  d: [number, number, number]; // (unit)
  len: number;
  born: number;
  /** what stops it at its end: a puff there when it gets there */
  hit: "wall" | "ground" | null;
}
interface Dust {
  p: [number, number, number];
  v: [number, number, number];
  born: number;
  life: number;
  c: [number, number, number];
}
interface Puff {
  s: Sprite;
  born: number;
  v: [number, number, number];
  big: number;
}
interface Brass {
  m: Mesh;
  v: [number, number, number];
  spin: [number, number];
  ground: number;
  born: number;
  still: boolean;
}
interface Spark {
  p: [number, number, number];
  v: [number, number, number];
  born: number;
  life: number;
  hot: boolean;
}
interface Flight {
  x0: number;
  y0: number;
  z0: number;
  x: number;
  y: number;
  z: number;
  secs: number;
  born: number;
}

// a muzzle flash's star: a hot core, spikes out of it
function star(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  g.translate(64, 64);
  for (let i = 0; i < 7; i++) {
    g.rotate((Math.PI * 2) / 7 + (i % 2) * 0.2);
    const l = i % 2 ? 40 : 62;
    const grad = g.createLinearGradient(0, 0, l, 0);
    grad.addColorStop(0, "rgba(255,240,200,1)");
    grad.addColorStop(1, "rgba(255,150,60,0)");
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(0, -7);
    g.lineTo(l, 0);
    g.lineTo(0, 7);
    g.fill();
  }
  const r = g.createRadialGradient(0, 0, 0, 0, 0, 26);
  r.addColorStop(0, "rgba(255,255,240,1)");
  r.addColorStop(1, "rgba(255,200,120,0)");
  g.fillStyle = r;
  g.fillRect(-32, -32, 64, 64);
  return new CanvasTexture(c);
}
// smoke: a soft, lumpy puff
function puff(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  for (const [x, y, r] of [
    [32, 32, 26],
    [22, 28, 16],
    [42, 36, 15],
    [34, 22, 14],
  ]) {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, "rgba(255,255,255,0.5)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  return new CanvasTexture(c);
}

function glow(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.3, "rgba(255,230,180,0.8)");
  r.addColorStop(1, "rgba(255,180,90,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

export class Arms3 {
  private time = 0;
  private tex = glow();
  private starTex = star();
  private puffTex = puff();
  private stars: Sprite[] = [];
  private dust: Dust[] = [];
  private dustPts: Points;
  private puffs: Puff[] = [];
  private glowDisc: Mesh;
  private glowAt = -9;
  private glowBig = 1;
  private brass: Brass[] = [];
  private brassGeo: Record<"case" | "shell", BufferGeometry> | null = null;
  private tracers: Tracer[] = [];
  private sparks: Spark[] = [];
  private flights: Flight[] = [];
  private lines: LineSegments;
  private dots: Points;
  private flashes: Sprite[] = [];
  private flashAt: number[] = [];
  private sticks: Mesh[] = [];
  private stickHeads: Sprite[] = [];
  private flying: Sprite;
  // what lies on the snow (D3: dropped), a small shape each and a glint
  private dropped = new Map<string, { mesh: Mesh; glint: Sprite; shadow: Mesh }>();
  // (a soft dark patch under each, so it lies on the snow, not over it)
  private shadowGeo: CircleGeometry | null = null;
  private shadowMat: MeshBasicMaterial | null = null;
  private itemMat: MeshLambertMaterial | null = null; // (what lies on the snow: tp/items3d.ts)
  private scene: Scene;

  constructor(scene: Scene) {
    this.scene = scene;
    const lg = new BufferGeometry();
    lg.setAttribute("position", new BufferAttribute(new Float32Array(MAX_TRACERS * 6), 3));
    lg.setAttribute("color", new BufferAttribute(new Float32Array(MAX_TRACERS * 6), 3));
    this.lines = new LineSegments(
      lg,
      new LineBasicMaterial({ vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false }),
    );
    this.lines.frustumCulled = false;
    const pg = new BufferGeometry();
    pg.setAttribute("position", new BufferAttribute(new Float32Array(MAX_SPARKS * 3), 3));
    pg.setAttribute("color", new BufferAttribute(new Float32Array(MAX_SPARKS * 3), 3));
    this.dots = new Points(
      pg,
      new PointsMaterial({
        size: 0.06,
        map: this.tex,
        vertexColors: true,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.dots.frustumCulled = false;
    const dg = new BufferGeometry();
    dg.setAttribute("position", new BufferAttribute(new Float32Array(MAX_DUST * 3), 3));
    dg.setAttribute("color", new BufferAttribute(new Float32Array(MAX_DUST * 3), 3));
    this.dustPts = new Points(
      dg,
      new PointsMaterial({
        size: 0.07,
        map: this.tex,
        vertexColors: true,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.dustPts.frustumCulled = false;
    // a moment's glow on the ground under the muzzle (the snow, the floor), warm
    this.glowDisc = new Mesh(
      new CircleGeometry(1, 20).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({
        map: this.tex,
        color: 0xffb060,
        blending: AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    );
    this.glowDisc.visible = false;
    scene.add(this.dustPts, this.glowDisc);
    const flash = () => {
      const s = new Sprite(
        new SpriteMaterial({
          map: this.tex,
          color: 0xffd9a0,
          blending: AdditiveBlending,
          depthWrite: false,
          transparent: true,
        }),
      );
      s.visible = false;
      scene.add(s);
      return s;
    };
    for (let i = 0; i < 4; i++) {
      this.flashes.push(flash());
      this.flashAt.push(-9);
      const st = flash();
      (st.material as SpriteMaterial).map = this.starTex;
      (st.material as SpriteMaterial).color.setHex(0xffe2b0);
      this.stars.push(st);
    }
    const stickGeo = new CylinderGeometry(0.03, 0.03, 0.3, 8);
    const stickMat = new MeshBasicMaterial({ color: 0xc8322a });
    for (let i = 0; i < MAX_FLARES; i++) {
      const m = new Mesh(stickGeo, stickMat);
      m.rotation.z = Math.PI / 2.4;
      m.visible = false;
      scene.add(m);
      this.sticks.push(m);
      const h = new Sprite(
        new SpriteMaterial({
          map: this.tex,
          color: 0xff5040,
          blending: AdditiveBlending,
          depthWrite: false,
          transparent: true,
        }),
      );
      h.visible = false;
      scene.add(h);
      this.stickHeads.push(h);
    }
    this.flying = flash();
    (this.flying.material as SpriteMaterial).color.setHex(0xff5040);
    scene.add(this.lines, this.dots);
  }

  dispose(): void {
    for (const o of [
      this.lines,
      this.dots,
      this.dustPts,
      this.glowDisc,
      ...this.flashes,
      ...this.stars,
      ...this.sticks,
      ...this.stickHeads,
      this.flying,
      ...this.puffs.map((p) => p.s),
      ...this.brass.map((b) => b.m),
    ])
      o.removeFromParent();
    this.lines.geometry.dispose();
    this.dots.geometry.dispose();
    this.dustPts.geometry.dispose();
    this.glowDisc.geometry.dispose();
    for (const g of Object.values(this.brassGeo ?? {})) g.dispose();
    this.shadowGeo?.dispose();
    this.shadowMat?.dispose();
    for (const o of this.dropped.values()) o.shadow.removeFromParent();
    this.tex.dispose();
    this.starTex.dispose();
    this.puffTex.dispose();
    this.itemMat?.dispose();
  }

  /** What's dropped on the snow (the floor's coords, ground z). */
  drops(list: { id: string; item: string; x: number; y: number; z: number }[]): void {
    const seen = new Set<string>();
    for (const d of list) {
      seen.add(d.id);
      let o = this.dropped.get(d.id);
      if (!o) {
        // its model (tp/items3d.ts), lit as the snow is; turned as it fell
        this.itemMat ??= new MeshLambertMaterial({ vertexColors: true });
        const mesh = new Mesh(itemModel(d.item), this.itemMat);
        mesh.rotation.y = ((d.id.length * 1.7 + d.x * 3.1) % (Math.PI * 2)) - Math.PI;
        const glint = new Sprite(
          new SpriteMaterial({
            map: this.tex,
            color: 0xfff2dc,
            blending: AdditiveBlending,
            depthWrite: false,
            transparent: true,
          }),
        );
        this.shadowGeo ??= new CircleGeometry(0.5, 16).rotateX(-Math.PI / 2);
        this.shadowMat ??= new MeshBasicMaterial({
          map: this.tex,
          color: 0x000000,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
        });
        const shadow = new Mesh(this.shadowGeo, this.shadowMat);
        mesh.geometry.computeBoundingBox();
        const b = mesh.geometry.boundingBox;
        if (b) shadow.scale.set((b.max.x - b.min.x) * 1.5, 1, (b.max.z - b.min.z) * 1.9);
        shadow.rotation.y = mesh.rotation.y;
        shadow.renderOrder = -1;
        this.scene.add(mesh, glint, shadow);
        o = { mesh, glint, shadow };
        this.dropped.set(d.id, o);
      }
      o.mesh.position.set(d.x, d.z + 0.01, d.y);
      o.shadow.position.set(d.x, d.z + 0.02, d.y);
      o.glint.position.set(d.x, d.z + 0.16, d.y);
      const k = 0.5 + 0.5 * Math.sin(this.time * 3 + d.x);
      // (a torch left on: its light, steady and big — seen from far off as the day goes)
      if (d.item === "cache:torch") {
        o.glint.scale.setScalar(1.4);
        (o.glint.material as SpriteMaterial).opacity = 0.75;
      } else {
        o.glint.scale.setScalar(0.18 + 0.1 * k);
        (o.glint.material as SpriteMaterial).opacity = 0.35 + 0.4 * k;
      }
    }
    for (const [id, o] of this.dropped)
      if (!seen.has(id)) {
        o.mesh.removeFromParent();
        o.shadow.removeFromParent();
        o.glint.removeFromParent();
        (o.glint.material as SpriteMaterial).dispose();
        this.dropped.delete(id);
      }
  }

  /** A shot: from the muzzle (the floor's x, y; z up), each pellet's way, how far it went and what
   *  stopped it there; `gun` for the flash's size, `ground` the ground's height under it. */
  shot(
    ox: number,
    oy: number,
    oz: number,
    rays: { yaw: number; pitch: number; len: number; hit?: "wall" | "ground" | null }[],
    gun = "revolver",
    ground = oz - 1.35,
  ): void {
    const now = this.time;
    const big = gun === "shotgun" ? 1.7 : 1;
    for (const r of rays) {
      const c = Math.cos(r.pitch);
      this.tracers.push({
        a: [ox, oz, oy],
        d: [Math.cos(r.yaw) * c, Math.sin(r.pitch), Math.sin(r.yaw) * c],
        len: r.len,
        born: now,
        hit: r.hit ?? null,
      });
    }
    while (this.tracers.length > MAX_TRACERS) this.tracers.shift();
    // the flash at the muzzle: a glow, a star turned any way
    const i = this.flashAt.indexOf(Math.min(...this.flashAt));
    this.flashAt[i] = now;
    this.flashes[i].position.set(ox, oz, oy);
    this.flashes[i].userData.big = big;
    this.stars[i].position.set(ox, oz, oy);
    this.stars[i].userData.big = big;
    (this.stars[i].material as SpriteMaterial).rotation = Math.random() * Math.PI * 2;
    // the ground lit under it a moment
    this.glowAt = now;
    this.glowBig = big;
    this.glowDisc.position.set(ox, ground + 0.02, oy);
    // smoke out of the muzzle, drifting on along the shot and up
    const r0 = rays[0];
    const f = [Math.cos(r0.yaw), Math.sin(r0.yaw)];
    for (let k = 0; k < (gun === "shotgun" ? 3 : 2); k++)
      this.smoke(
        ox + f[0] * 0.1 * k,
        oy + f[1] * 0.1 * k,
        oz,
        [f[0] * (0.6 + k * 0.3), 0.25, f[1] * (0.6 + k * 0.3)],
        big,
      );
    // a few sparks out of the muzzle
    for (let k = 0; k < 4; k++) this.spark(ox, oy, oz, r0.yaw + (Math.random() - 0.5), 2 + Math.random() * 2, true);
  }

  private smoke(x: number, y: number, z: number, v: [number, number, number], big: number) {
    let p = this.puffs.find((q) => this.time - q.born > 1.6);
    if (!p && this.puffs.length < MAX_SMOKE) {
      const s = new Sprite(
        new SpriteMaterial({ map: this.puffTex, color: 0xc8ccd2, transparent: true, depthWrite: false }),
      );
      this.scene.add(s);
      p = { s, born: 0, v: [0, 0, 0], big: 1 };
      this.puffs.push(p);
    }
    if (!p) p = this.puffs.reduce((a, b) => (a.born < b.born ? a : b));
    p.s.position.set(x, z, y);
    p.s.visible = true;
    (p.s.material as SpriteMaterial).rotation = Math.random() * Math.PI * 2;
    p.born = this.time;
    p.v = v;
    p.big = big;
  }

  /** Spent brass out of a gun at (x, y, z) — the revolver's cases (one a round loaded), the
   *  double-barrel's shells (the fired ones, broken open) — thrown aside of `yaw`, down to `ground`. */
  eject(x: number, y: number, z: number, yaw: number, kind: "case" | "shell", n: number, ground: number): void {
    this.itemMat ??= new MeshLambertMaterial({ vertexColors: true });
    this.brassGeo ??= {
      case: tinted(new CylinderGeometry(0.0055, 0.0055, 0.03, 8).rotateZ(Math.PI / 2), 0xc9a24a),
      shell: mergeGeometries([
        tinted(new CylinderGeometry(0.0095, 0.0095, 0.05, 10).rotateZ(Math.PI / 2).translate(0.01, 0, 0), 0x9c2b25),
        tinted(new CylinderGeometry(0.0102, 0.0102, 0.016, 10).rotateZ(Math.PI / 2).translate(-0.022, 0, 0), 0xc9a24a),
      ]),
    };
    for (let k = 0; k < n; k++) {
      let b = this.brass.length >= MAX_BRASS ? this.brass.shift() : undefined;
      if (b) b.m.geometry = this.brassGeo[kind];
      else {
        b = {
          m: new Mesh(this.brassGeo[kind], this.itemMat),
          v: [0, 0, 0],
          spin: [0, 0],
          ground,
          born: 0,
          still: false,
        };
        this.scene.add(b.m);
      }
      // (back and to the right of the gun, up a little: each its own way)
      const side = yaw - Math.PI / 2 + (Math.random() - 0.5) * 0.8;
      const sp = kind === "shell" ? 1.2 + Math.random() : 0.4 + Math.random() * 0.5;
      b.v = [
        Math.cos(side) * sp - Math.cos(yaw) * 0.4,
        1 + Math.random() * 1.2,
        Math.sin(side) * sp - Math.sin(yaw) * 0.4,
      ];
      b.spin = [(Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30];
      b.m.position.set(x, z, y);
      b.m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
      b.ground = ground;
      b.born = this.time + k * 0.05;
      b.still = false;
      this.brass.push(b);
    }
  }

  private puffAt(x: number, y: number, z: number, what: "wall" | "ground", big: number) {
    // snow thrown up out on the land (white), dust and splinters off a wall
    const c: [number, number, number] = what === "ground" ? [0.55, 0.58, 0.62] : [0.42, 0.36, 0.3];
    for (let k = 0; k < 7 * big; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 0.4 + Math.random() * 1.3;
      this.dust.push({
        p: [x, z + 0.02, y],
        v: [Math.cos(a) * sp, 0.8 + Math.random() * 1.6, Math.sin(a) * sp],
        born: this.time,
        life: 0.45 + Math.random() * 0.5,
        c,
      });
    }
    while (this.dust.length > MAX_DUST) this.dust.shift();
  }

  /** Where a shot met one of them: sparks off a shield (white), a wound (dark). */
  hit(x: number, y: number, z: number, kind: string): void {
    const n = kind === "spark" ? 14 : 6;
    for (let k = 0; k < n; k++)
      this.spark(x, y, z, Math.random() * Math.PI * 2, 1.5 + Math.random() * 3, kind === "spark");
  }

  /** A flare in the air: from the hand to where it lands, `secs` long. */
  throwFlare(x0: number, y0: number, z0: number, x: number, y: number, z: number, secs: number): void {
    this.flights.push({ x0, y0, z0, x, y, z, secs: Math.max(0.05, secs), born: this.time });
  }

  private spark(x: number, y: number, z: number, a: number, speed: number, hot: boolean) {
    this.sparks.push({
      p: [x, z, y],
      v: [Math.cos(a) * speed, 1 + Math.random() * 2.5, Math.sin(a) * speed],
      born: this.time,
      life: 0.25 + Math.random() * 0.35,
      hot,
    });
    while (this.sparks.length > MAX_SPARKS) this.sparks.shift();
  }

  /** (review shots: the show slowed down this much) */
  slow = 1;

  /** Every frame: `flares` burning (the floor's coords, feet z; `t` s lit). */
  update(step: number, flares: { x: number; y: number; z: number; t: number }[]): void {
    const dt = step * this.slow;
    this.time += dt;
    const now = this.time;
    // tracers: a streak flying out, gone past its end (a puff there, if something stopped it)
    const lp = this.lines.geometry.attributes.position.array as Float32Array;
    const lc = this.lines.geometry.attributes.color.array as Float32Array;
    lp.fill(0);
    lc.fill(0);
    this.tracers = this.tracers.filter((t) => {
      const head = Math.min(t.len, (now - t.born) * TRACER_V);
      if (t.hit && head >= t.len) {
        this.puffAt(t.a[0] + t.d[0] * t.len, t.a[2] + t.d[2] * t.len, t.a[1] + t.d[1] * t.len, t.hit, 1);
        t.hit = null;
      }
      return (now - t.born) * TRACER_V - STREAK < t.len;
    });
    this.tracers.forEach((t, i) => {
      const run = (now - t.born) * TRACER_V;
      const head = Math.min(t.len, run);
      const tail = Math.max(0, Math.min(t.len, run - STREAK));
      const k = 1 - Math.max(0, run - t.len) / STREAK;
      lp.set(
        [
          t.a[0] + t.d[0] * tail,
          t.a[1] + t.d[1] * tail,
          t.a[2] + t.d[2] * tail,
          t.a[0] + t.d[0] * head,
          t.a[1] + t.d[1] * head,
          t.a[2] + t.d[2] * head,
        ],
        i * 6,
      );
      lc.set([0.25 * k, 0.18 * k, 0.1 * k, 1 * k, 0.88 * k, 0.6 * k], i * 6);
    });
    this.lines.geometry.attributes.position.needsUpdate = true;
    this.lines.geometry.attributes.color.needsUpdate = true;
    // flashes: the glow and the star, a frame or three
    this.flashes.forEach((f, i) => {
      const age = now - this.flashAt[i];
      const on = age < 0.05;
      const big = (f.userData.big as number | undefined) ?? 1;
      f.visible = on;
      this.stars[i].visible = on;
      const s = (0.18 + 0.12 * Math.random()) * big;
      f.scale.set(s, s, s);
      const st = (0.3 + 0.15 * Math.random()) * big * (1 - age / 0.06);
      this.stars[i].scale.set(st, st, st);
    });
    // the ground's glow
    const ga = now - this.glowAt;
    this.glowDisc.visible = ga < 0.09;
    if (this.glowDisc.visible) {
      const r = 1.1 * this.glowBig;
      this.glowDisc.scale.set(r, 1, r);
      (this.glowDisc.material as MeshBasicMaterial).opacity = 0.35 * (1 - ga / 0.09);
    }
    // smoke drifting and spreading, thinning out
    for (const p of this.puffs) {
      const age = now - p.born;
      if (age > 1.5) {
        p.s.visible = false;
        continue;
      }
      p.s.position.x += p.v[0] * dt;
      p.s.position.y += p.v[1] * dt;
      p.s.position.z += p.v[2] * dt;
      p.v[0] *= 1 - dt * 1.5;
      p.v[2] *= 1 - dt * 1.5;
      const k = age / 1.5;
      const sc = (0.12 + 0.75 * Math.sqrt(k)) * p.big;
      p.s.scale.set(sc, sc, sc);
      (p.s.material as SpriteMaterial).opacity = 0.4 * (1 - k) * Math.min(1, age / 0.05);
    }
    // snow and dust thrown up, falling back
    const dp = this.dustPts.geometry.attributes.position.array as Float32Array;
    const dc = this.dustPts.geometry.attributes.color.array as Float32Array;
    dp.fill(0);
    dc.fill(0);
    this.dust = this.dust.filter((d) => now - d.born < d.life);
    this.dust.forEach((d, i) => {
      d.v[1] -= 6 * dt;
      d.v[0] *= 1 - dt * 2;
      d.v[2] *= 1 - dt * 2;
      d.p[0] += d.v[0] * dt;
      d.p[1] += d.v[1] * dt;
      d.p[2] += d.v[2] * dt;
      const k = 1 - (now - d.born) / d.life;
      dp.set(d.p, i * 3);
      dc.set([d.c[0] * k, d.c[1] * k, d.c[2] * k], i * 3);
    });
    this.dustPts.geometry.attributes.position.needsUpdate = true;
    this.dustPts.geometry.attributes.color.needsUpdate = true;
    // brass: flying, a bounce, lying still; gone after a while
    this.brass = this.brass.filter((b) => {
      if (now - b.born > BRASS_S) {
        b.m.removeFromParent();
        return false;
      }
      if (b.still || now < b.born) return true;
      b.v[1] -= 9.8 * dt;
      b.m.position.x += b.v[0] * dt;
      b.m.position.y += b.v[1] * dt;
      b.m.position.z += b.v[2] * dt;
      b.m.rotation.x += b.spin[0] * dt;
      b.m.rotation.y += b.spin[1] * dt;
      if (b.m.position.y <= b.ground + 0.01) {
        b.m.position.y = b.ground + 0.01;
        if (Math.abs(b.v[1]) > 1) {
          b.v = [b.v[0] * 0.45, -b.v[1] * 0.3, b.v[2] * 0.45];
          b.spin = [b.spin[0] * 0.4, b.spin[1] * 0.4];
        } else {
          // (lying on its side)
          b.still = true;
          b.m.rotation.set(0, b.m.rotation.y, 0);
        }
      }
      return true;
    });
    // flares burning: their sticks, a hot head, sparks spitting up
    this.sticks.forEach((m, i) => {
      const f = flares[i];
      m.visible = !!f;
      this.stickHeads[i].visible = !!f;
      if (!f) return;
      m.position.set(f.x, f.z + 0.04, f.y);
      const h = this.stickHeads[i];
      h.position.set(f.x + 0.12, f.z + 0.12, f.y);
      const s = 0.45 + 0.15 * Math.sin(now * 37 + i) + 0.1 * Math.random();
      h.scale.set(s, s, s);
      if (Math.random() < dt * 30)
        this.spark(f.x + 0.12, f.y, f.z + 0.1, Math.random() * Math.PI * 2, 0.4 + Math.random(), true);
    });
    // a flare in flight
    const fl = this.flights[0];
    this.flights = this.flights.filter((f) => now - f.born < f.secs);
    this.flying.visible = !!fl && now - fl.born < fl.secs;
    if (fl && this.flying.visible) {
      const k = (now - fl.born) / fl.secs;
      const up = Math.sin(k * Math.PI) * Math.max(0.6, fl.secs * 2.2);
      this.flying.position.set(fl.x0 + (fl.x - fl.x0) * k, fl.z0 + (fl.z - fl.z0) * k + up, fl.y0 + (fl.y - fl.y0) * k);
      this.flying.scale.set(0.35, 0.35, 0.35);
    }
    // sparks fall and fade
    const sp = this.dots.geometry.attributes.position.array as Float32Array;
    const sc = this.dots.geometry.attributes.color.array as Float32Array;
    sp.fill(0);
    sc.fill(0);
    this.sparks = this.sparks.filter((s) => now - s.born < s.life);
    this.sparks.forEach((s, i) => {
      s.v[1] -= 9 * dt;
      s.p[0] += s.v[0] * dt;
      s.p[1] += s.v[1] * dt;
      s.p[2] += s.v[2] * dt;
      const k = 1 - (now - s.born) / s.life;
      sp.set(s.p, i * 3);
      sc.set(s.hot ? [k, 0.75 * k, 0.4 * k] : [0.35 * k, 0.05 * k, 0.05 * k], i * 3);
    });
    this.dots.geometry.attributes.position.needsUpdate = true;
    this.dots.geometry.attributes.color.needsUpdate = true;
  }
}
