import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
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
import { itemModel } from "./items3d";

// Guns and flares on screen (docs/plan/30-the-dark.md D6): a shot's flash at the
// muzzle and its tracers (the shotgun's eight), sparks where one meets a shield,
// a flare's arc through the air, and flares burning on the snow — a red stick
// spitting sparks (their light is the view's: a ground lamp's pool, red). The
// world's coords: x, up, z (the floor's y). No lights of its own: adding one
// would recompile every lit material.

const MAX_TRACERS = 24;
const MAX_SPARKS = 160;
const MAX_FLARES = 8;

interface Tracer {
  a: [number, number, number];
  b: [number, number, number];
  born: number;
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
  private dropped = new Map<string, { mesh: Mesh; glint: Sprite }>();
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
    for (const o of [this.lines, this.dots, ...this.flashes, ...this.sticks, ...this.stickHeads, this.flying])
      o.removeFromParent();
    this.lines.geometry.dispose();
    this.dots.geometry.dispose();
    this.tex.dispose();
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
        this.scene.add(mesh, glint);
        o = { mesh, glint };
        this.dropped.set(d.id, o);
      }
      o.mesh.position.set(d.x, d.z + 0.01, d.y);
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
        o.glint.removeFromParent();
        (o.glint.material as SpriteMaterial).dispose();
        this.dropped.delete(id);
      }
  }

  /** A shot: from the muzzle (the floor's x, y; z up), each pellet's way and how far it went. */
  shot(ox: number, oy: number, oz: number, rays: { yaw: number; pitch: number; len: number }[]): void {
    const now = this.time;
    for (const r of rays) {
      const c = Math.cos(r.pitch);
      const b: [number, number, number] = [
        ox + Math.cos(r.yaw) * c * r.len,
        oz + Math.sin(r.pitch) * r.len,
        oy + Math.sin(r.yaw) * c * r.len,
      ];
      this.tracers.push({ a: [ox, oz, oy], b, born: now });
    }
    while (this.tracers.length > MAX_TRACERS) this.tracers.shift();
    // the flash at the muzzle
    const i = this.flashAt.indexOf(Math.min(...this.flashAt));
    this.flashAt[i] = now;
    this.flashes[i].position.set(ox, oz, oy);
    // a few sparks out of the muzzle
    const r0 = rays[0];
    for (let k = 0; k < 4; k++) this.spark(ox, oy, oz, r0.yaw + (Math.random() - 0.5), 2 + Math.random() * 2, true);
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

  /** Every frame: `flares` burning (the floor's coords, feet z; `t` s lit). */
  update(dt: number, flares: { x: number; y: number; z: number; t: number }[]): void {
    this.time += dt;
    const now = this.time;
    // tracers: a moment's streak
    const lp = this.lines.geometry.attributes.position.array as Float32Array;
    const lc = this.lines.geometry.attributes.color.array as Float32Array;
    lp.fill(0);
    lc.fill(0);
    this.tracers = this.tracers.filter((t) => now - t.born < 0.09);
    this.tracers.forEach((t, i) => {
      const k = 1 - (now - t.born) / 0.09;
      lp.set([...t.a, ...t.b], i * 6);
      lc.set([1 * k, 0.85 * k, 0.55 * k, 0.5 * k, 0.4 * k, 0.25 * k], i * 6);
    });
    this.lines.geometry.attributes.position.needsUpdate = true;
    this.lines.geometry.attributes.color.needsUpdate = true;
    // flashes
    this.flashes.forEach((f, i) => {
      const age = now - this.flashAt[i];
      f.visible = age < 0.05;
      const s = 0.18 + 0.12 * Math.random();
      f.scale.set(s, s, s);
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
