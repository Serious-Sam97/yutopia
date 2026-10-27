import { depthOf, type MapDef, TILE_H, TILE_W, type WorldObjectDef, ZPX_TILE } from "@yutopia/shared";
import { BEAM, type Beam, beamAt, beamOf } from "@yutopia/shared/beam";
import type * as GroundsModule from "@yutopia/shared/grounds";
import { type Container, Matrix, Mesh, MeshGeometry, Container as PixiContainer, Sprite, Texture } from "pixi.js";

// The Grounds in the iso view (docs/plan/27-the-grounds.md, phase 1): the land
// round the ground floor, a mesh a chunk (32 tiles a side), each corner raised
// by the ground's height, its top-down picture baked once (the surfaces, the
// roads and trails, the hills shaded, the trees' shadows); the trees as drawn
// sprites sorted with everything else. Only the chunks round the camera are
// kept; a chunk is made a few milliseconds a frame, nearest first.

import { nearLift } from "../eyes";
import { type Footprints, printLeft } from "../footprints";
import type { LotIso, Thing } from "./grounds-items";
import { drawKartPark, kartLook } from "./kart-iso";
import { IsoWeather } from "./weather-iso";

type G = typeof GroundsModule;
const PX = 16; // the land's picture: px a tile
const LN = 65; // the chunk's height samples a side (shared grounds.ts: two a tile)
const SEE = 3; // chunks round the focus (a 7 × 7 block: more than the screen at the furthest zoom)
const KEEP = 90; // chunks kept before the furthest go
const HW = TILE_W / 2;
const HH = TILE_H / 2;

// the night's light: a lamp's pool (its radius, tiles, by kind); a flashlight's
// beam (its reach, tiles; half its opening, radians; its drawing, px long)
const POOL_R: Record<string, number> = { cobra: 7, town: 5.5, lone: 5, porch: 3.5, flood: 14 };
// the beam's picture is drawn wide (shared beam.ts BEAM.wide) and scaled to a focused one
const BEAM_LEN = BEAM.wide.len;
const BEAM_HALF = BEAM.wide.half;
const BEAM_PX = 160;
const FLARE_R = 6; // a flare's light (shared dark/arms.ts FLARE.radius)
// a car's headlamps on the snow ahead (docs/plan/44-the-night.md N2): how far, half how wide
const CAR_BEAM = { len: 13, half: 0.42 };
const LAMPS_ON = 1 | 2; // shared car/net.ts CAR_FLAGS.low | high (its module is the car's whole sim)
const BRAKE = 4; // CAR_FLAGS.brake
// the torch's light spills on past its reach (shared beam.ts: what it burns), fading
const SPILL = 1.3;
const FOCUS_ACROSS = (Math.tan(BEAM.focus.half) * BEAM.focus.len) / (Math.tan(BEAM_HALF) * BEAM_LEN);

const SURF: Record<string, [number, number, number]> = {
  snow: [236, 241, 246],
  deep: [228, 236, 244],
  path: [214, 211, 205],
  asphalt: [86, 90, 97],
  walk: [200, 199, 194],
  ice: [178, 196, 210],
  floor: [190, 186, 178],
  rock: [112, 117, 124],
};

interface Chunk {
  key: string;
  mesh: Mesh;
  tex: Texture;
  trees: Sprite[];
  used: number;
}

export class IsoGrounds {
  readonly land = new PixiContainer();
  private chunks = new Map<string, Chunk>();
  private treeTex = new Map<string, Texture>();
  private grain: HTMLCanvasElement;
  private tint = 0xffffff;
  private frame = 0;

  /** `ox, oy`: the ground floor's corner in the building's coords; `covered`: its own
   *  floor tiles (its coords) — no land drawn over them. */
  constructor(
    private G: G,
    private ox: number,
    private oy: number,
    private covered: (x: number, y: number) => boolean,
    private sortLayer: Container,
    // the Grounds' things (art/grounds-items.ts), set by the engine as items
    private items: {
      things: Thing[];
      add: (o: WorldObjectDef, lift: number) => void;
      remove: (id: string) => void;
      insideThings: (i: GroundsModule.Inside) => Thing[];
      /** Put a texture on the GPU now (else it goes up the frame it's first drawn). */
      upload: (t: Texture) => void;
      /** A thing's drawn parts (to slide one that moves). */
      roots: (id: string) => Container[];
    },
  ) {
    this.land.label = "grounds";
    this.land.addChild(this.printLayer);
    this.grain = grainCanvas();
    for (const t of items.things) {
      const k = `${Math.floor(t.cx / G.CHUNK)},${Math.floor(t.cz / G.CHUNK)}`;
      const l = this.thingsIn.get(k) ?? [];
      this.thingsIn.set(k, l);
      l.push(t);
    }
  }
  private thingsIn = new Map<string, Thing[]>();
  // things to show, a few a frame (their drawings go up to the GPU as they're
  // made: a town block's at once was a 100 ms frame)
  private toShow = new Map<string, Thing>();
  private showThings(key: string, on: boolean) {
    for (const t of this.thingsIn.get(key) ?? []) {
      if (!on) {
        this.toShow.delete(t.id);
        this.take(t.id);
        continue;
      }
      // (the building I'm in shows its inside, not its outside)
      if (this.inside && t.id === `gr:${this.inside.b.key}`) continue;
      this.toShow.set(t.id, t);
    }
  }
  private showSome(t0: number) {
    for (const [id, t] of this.toShow) {
      if (performance.now() - t0 > 5) return;
      this.toShow.delete(id);
      this.put(this.local(t), this.G.heightAt(t.cx, t.cz));
      if (this.faded.has(id)) this.fade(id, 0.3);
    }
  }

  /** The hour's light on the land (the daylight's ambient, 0..1 each). */
  setAmbient(rgb: [number, number, number]) {
    const c = (v: number) => Math.round(Math.min(1, v) * 255);
    this.tint = (c(rgb[0]) << 16) | (c(rgb[1]) << 8) | c(rgb[2]);
    this.amb = [Math.min(1, rgb[0]), Math.min(1, rgb[1]), Math.min(1, rgb[2])];
    for (const ch of this.chunks.values()) {
      ch.mesh.tint = this.tint;
      for (const t of ch.trees) t.tint = this.tint;
    }
    for (const b of this.bridge ?? []) b.m.tint = this.tint;
    for (const id of this.shownIds) for (const r of this.items.roots(id)) r.tint = this.tint;
    // (the prints are shadows in the snow: as dark as it, so none show in the pitch dark)
    this.printLayer.tint = this.tint;
  }

  // ── the lot's snow (docs/plan/42-the-lot.md): over the floor's asphalt as the roads have theirs
  // (tp/roads3d.ts lotCover, without the weather's fresh snow) — packed snow in blotches, worn
  // round the aisles' loop and down the tyres' tracks — and the marks the floor doesn't paint:
  // the accessible bays' blue and hatching, VISITOR. Drawn once; the engine sets it over the floor ──
  readonly cover = new PixiContainer();
  private coverMesh: Mesh | null = null;
  setLot(lot: LotIso) {
    if (this.coverMesh || this.coverDue) return;
    this.coverDue = true;
    void this.buildCover(lot);
  }
  private coverDue = false;
  private gone = false;
  /** (a few ms at a time, off the frame the Grounds come in on: all at once it was a long one) */
  private async buildCover({ l }: LotIso) {
    const later = () => new Promise((r) => setTimeout(r, 16));
    let t0 = performance.now();
    // (the snow worked out at 5 px a tile and stretched smooth; the marks drawn at 10)
    const Q = 10;
    const N = 5;
    const [x0, x1, z0, z1] = [l.dump.x1, l.pavement.x0, l.z0, l.z1];
    const W = Math.round((x1 - x0) * N);
    const H = Math.round((z1 - z0) * N);
    const sc = document.createElement("canvas");
    sc.width = W;
    sc.height = H;
    const sg = sc.getContext("2d") as CanvasRenderingContext2D;
    const im = sg.createImageData(W, H);
    const hash = (x: number, z: number) => {
      const h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
      return h - Math.floor(h);
    };
    const vn = (x: number, z: number) => {
      const ix = Math.floor(x);
      const iz = Math.floor(z);
      const fx = (x - ix) ** 2 * (3 - 2 * (x - ix));
      const fz = (z - iz) ** 2 * (3 - 2 * (z - iz));
      const a = hash(ix, iz) + (hash(ix + 1, iz) - hash(ix, iz)) * fx;
      const b = hash(ix, iz + 1) + (hash(ix + 1, iz + 1) - hash(ix, iz + 1)) * fx;
      return a + (b - a) * fz;
    };
    const fbm = (x: number, z: number) =>
      0.55 * vn(x, z) + 0.3 * vn(x * 2.3 + 11, z * 2.3 + 11) + 0.15 * vn(x * 5.1 + 3, z * 5.1 + 3);
    const sm = (a: number, b: number, v: number) => {
      const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };
    const [aw, ae] = l.aisles;
    const zs = [(l.cross[0].z0 + l.cross[0].z1) / 2, (l.cross[1].z0 + l.cross[1].z1) / 2];
    for (let py = 0; py < H; py++) {
      if (performance.now() - t0 > 4) {
        await later();
        if (this.gone) return;
        t0 = performance.now();
      }
      for (let px = 0; px < W; px++) {
        const x = x0 + (px + 0.5) / N;
        const z = z0 + (py + 0.5) / N;
        const inA = Math.max(1 - sm(2.8, 3.6, Math.abs(x - aw)), 1 - sm(2.8, 3.6, Math.abs(x - ae)));
        const dz = Math.min(Math.abs(z - zs[0]), Math.abs(z - zs[1]));
        const inZ = x > aw - 3.6 && x < ae + 3.6 ? 1 - sm(2.8, 3.6, dz) : 0;
        const aisle = Math.max(inA, inZ);
        const t = Math.min(
          Math.abs(Math.abs(x - aw) - 0.9),
          Math.abs(Math.abs(x - ae) - 0.9),
          inZ > 0 ? Math.abs(dz - 0.9) : 9,
        );
        const tracks = 1 - sm(0.25, 0.6, t + (vn(x * 0.5, z * 0.5) - 0.5) * 0.3);
        const cover =
          0.3 +
          (fbm(x * 0.07, z * 0.07) - 0.5) * 0.9 +
          (fbm(x * 0.6, z * 0.6) - 0.5) * 0.25 -
          aisle * 0.06 -
          tracks * aisle * 0.3;
        const k = fbm(x * 0.8, z * 0.8);
        const i = (py * W + px) * 4;
        im.data[i] = 133 + k * 61;
        im.data[i + 1] = 140 + k * 61;
        im.data[i + 2] = 150 + k * 62;
        im.data[i + 3] = sm(0.08, 0.55, cover) * 215;
      }
    }
    await later();
    if (this.gone) return;
    sg.putImageData(im, 0, 0);
    const c = document.createElement("canvas");
    c.width = W * 2;
    c.height = H * 2;
    const g = c.getContext("2d") as CanvasRenderingContext2D;
    g.imageSmoothingQuality = "high";
    g.drawImage(sc, 0, 0, W * 2, H * 2);
    // the marks over it (lot.ts): the accessible bays' blue and their figure's wheel, the hatching,
    // VISITOR
    const X = (x: number) => (x - x0) * Q;
    const Z = (z: number) => (z - z0) * Q;
    for (const b of l.bays) {
      if (b.kind === "plain") continue;
      const [bx, bz] = [X(b.x - l.bayL / 2 + 0.2), Z(b.z - l.bayW / 2 + 0.15)];
      if (b.kind === "accessible") {
        g.fillStyle = "rgba(47,95,158,0.85)";
        g.fillRect(bx, bz, (l.bayL - 0.4) * Q, (l.bayW - 0.3) * Q);
        g.strokeStyle = "rgba(240,242,244,0.9)";
        g.lineWidth = Q * 0.14;
        g.beginPath();
        g.arc(X(b.x), Z(b.z), Q * 0.45, 0, Math.PI * 2);
        g.stroke();
      } else {
        // (along the bay: it fits there, read from the aisle's side)
        g.fillStyle = "rgba(238,240,242,0.85)";
        g.font = `700 ${Math.round(Q * 0.8)}px Arial, sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText("VISITOR", X(b.x), Z(b.z));
      }
    }
    g.strokeStyle = "rgba(238,240,242,0.85)";
    g.lineWidth = Math.max(1, Q * 0.1);
    for (const h of l.hatches) {
      g.save();
      g.beginPath();
      g.rect(X(h.x0), Z(h.z0), (h.x1 - h.x0) * Q, (h.z1 - h.z0) * Q);
      g.clip();
      for (let d = -(h.z1 - h.z0); d < h.x1 - h.x0; d += 0.6) {
        g.moveTo(X(h.x0 + d), Z(h.z1));
        g.lineTo(X(h.x0 + d + (h.z1 - h.z0)), Z(h.z0));
      }
      g.stroke();
      g.restore();
    }
    await later();
    if (this.gone) return;
    const tex = Texture.from(c);
    this.items.upload(tex);
    const iso = (x: number, z: number) => [(x - this.ox - (z - this.oy)) * HW, (x - this.ox + (z - this.oy)) * HH];
    const geometry = new MeshGeometry({
      positions: new Float32Array([...iso(x0, z0), ...iso(x1, z0), ...iso(x1, z1), ...iso(x0, z1)]),
      uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });
    this.coverMesh = new Mesh({ geometry, texture: tex });
    // (untinted: it lies on the floor, under the floor's light map — tinted with the land's light
    // as well, the lamps' pools on the lot went twice as dark, and at night none showed)
    this.cover.addChild(this.coverMesh);
  }

  // a thing on the land drawn (the engine's), in the hour's light; and taken away
  private shownIds = new Set<string>();
  private put(o: WorldObjectDef, lift: number) {
    this.items.add(o, lift);
    this.shownIds.add(o.id);
    for (const r of this.items.roots(o.id)) r.tint = this.tint;
  }
  private take(id: string) {
    this.items.remove(id);
    this.shownIds.delete(id);
  }

  setVisible(on: boolean) {
    if (on === this.land.visible && this.shown) return;
    this.shown = true;
    this.land.visible = on;
    this.lights.visible = on;
    this.cover.visible = on;
    for (const ch of this.chunks.values()) {
      for (const t of ch.trees) t.visible = on;
      this.showThings(ch.key, on);
    }
    for (const b of this.bridge ?? []) b.m.visible = on && this.bridgeLevel > 0;
  }
  private shown = false;

  // inside one of the town's buildings: its drawing gives way to its inside
  private inside: GroundsModule.Inside | null = null;
  // a thing in the floor's coords (the engine's)
  private local(t: Thing): WorldObjectDef {
    return { id: t.id, kind: t.kind, x: t.x - this.ox, y: t.y - this.oy, rot: t.rot, props: t.props };
  }
  private goInside(i: GroundsModule.Inside | null) {
    if (i === this.inside) return;
    const swap = (ins: GroundsModule.Inside, on: boolean) => {
      const b = ins.b;
      const body = this.items.things.find((t) => t.id === `gr:${b.key}`);
      const lift = this.G.heightAt((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
      for (const t of this.items.insideThings(ins)) {
        if (on) this.put(this.local(t), lift);
        else this.take(t.id);
      }
      if (body) {
        this.toShow.delete(body.id);
        if (on) this.take(body.id);
        else this.put(this.local(body), lift);
      }
    };
    if (this.inside) swap(this.inside, false);
    this.inside = i;
    if (i) swap(i, true);
  }

  /** Round the focus (the floor's coords); `me`: whose view it is (trees in front fade). */
  update(fx: number, fy: number, me: { x: number; y: number; z?: number } | null) {
    const t0 = performance.now();
    this.frame++;
    if (me) {
      const bx = me.x + this.ox;
      const bz = me.y + this.oy;
      this.goInside(this.G.INSIDES.find((i) => bx >= i.b.x0 && bx < i.b.x1 && bz >= i.b.z0 && bz < i.b.z1) ?? null);
    }
    const bx = fx + this.ox;
    const by = fy + this.oy;
    const cx0 = Math.floor(bx / this.G.CHUNK);
    const cz0 = Math.floor(by / this.G.CHUNK);
    const want: [number, number][] = [];
    for (let dz = -SEE; dz <= SEE; dz++) for (let dx = -SEE; dx <= SEE; dx++) want.push([cx0 + dx, cz0 + dz]);
    want.sort((a, b) => Math.hypot(a[0] - cx0, a[1] - cz0) - Math.hypot(b[0] - cx0, b[1] - cz0));
    // one step a frame, nearest first: a chunk's land (and its neighbours',
    // its slopes reach into them: ~7 ms each), then its picture (~6 ms)
    let step = false;
    for (const [cx, cz] of want) {
      const k = `${cx},${cz}`;
      const ch = this.chunks.get(k);
      if (ch) {
        ch.used = this.frame;
        continue;
      }
      if (step || !this.inGrounds(cx, cz)) continue;
      step = true;
      const need = this.G.missingLand(cx, cz);
      if (need) this.G.groundsChunk(need[0], need[1]);
      else this.chunks.set(k, this.build(cx, cz));
    }
    // (the park's bridge, once its land's about)
    if (!step && !this.bridge && [...this.chunks.keys()].some((k) => this.overPark(k))) {
      step = true;
      this.parkBridge();
    }
    // the Kart Park's layout changed (docs/plan/47-the-track-changer.md): its chunks' pictures
    // painted again, one a frame, the old one shown till its new is
    const lay = this.G.kartLayoutNow();
    const id = `${lay.key}${lay.reverse ? "-r" : ""}`;
    if (id !== this.parkLayout) {
      // (the first layout seen: the bridge as it is, not faded from what was never drawn)
      const first = !this.parkLayout;
      this.parkLayout = id;
      this.bridgeWas = first ? this.G.kartBridged() : this.bridgeHas;
      this.bridgeHas = this.G.kartBridged();
      // (painted with the layout raced already, the first)
      if (!first) for (const ch of this.chunks.values()) if (this.overPark(ch.key)) this.parkStale.add(ch.key);
    }
    // (in the change's show, a chunk's painted again as a plough gets to it; the rest at its end)
    const show = this.G.kartShowNow();
    // the bridge comes and goes with the layout (there for one raced over it): in the show, faded
    // in or out as the ploughs go
    this.bridgeLevel =
      show >= 0 && this.bridgeWas !== this.bridgeHas ? (this.bridgeHas ? show : 1 - show) : this.bridgeHas ? 1 : 0;
    if (show >= 0 && this.parkStale.size) {
      const t = this.G.kartTrackNow();
      const C = this.G.CHUNK;
      for (let i = 0; i < this.G.KART_SHOW.ploughs; i++) {
        const p = this.G.kartPloughAt(t, i, show);
        for (const [dx, dz] of [
          [0, 0],
          [6, 0],
          [-6, 0],
          [0, 6],
          [0, -6],
        ]) {
          const k = `${Math.floor((p.x + dx) / C)},${Math.floor((p.z + dz) / C)}`;
          if (this.parkStale.has(k)) this.parkDue.add(k);
        }
      }
    }
    const due = this.parkDue.values().next().value ?? (show < 0 ? this.parkStale.values().next().value : undefined);
    if (!step && due) {
      step = true;
      const k = due as string;
      this.parkStale.delete(k);
      this.parkDue.delete(k);
      const ch = this.chunks.get(k);
      if (ch) {
        const C = this.G.CHUNK;
        const [cx, cz] = k.split(",").map(Number);
        const tex = Texture.from(this.picture(cx * C, cz * C, this.G.groundsChunk(cx, cz)));
        this.items.upload(tex);
        const old = ch.tex;
        ch.mesh.texture = tex;
        ch.tex = tex;
        old.destroy(true);
        // (its things again too: the board of the circuits shows the layout raced)
        if (this.land.visible) {
          this.showThings(k, false);
          this.showThings(k, true);
        }
      }
    }
    // (a chunk made this frame: its things wait for the next)
    if (!step) this.showSome(t0);
    // the furthest go once there are too many
    if (this.chunks.size > KEEP) {
      const old = [...this.chunks.values()].sort((a, b) => a.used - b.used).slice(0, this.chunks.size - KEEP);
      for (const ch of old) this.drop(ch);
    }
    // buildings and trees whose drawing covers you (and are in front of you): see-through
    if (me) this.fadeBuildings(me);
    const mx = me ? (me.x - me.y) * HW : 0;
    const my = me ? (me.x + me.y) * HH - (me.z ?? 0) * ZPX_TILE - 40 : 0;
    const md = me ? depthOf(me.x, me.y) : 0;
    if (me) {
      for (const ch of this.chunks.values()) {
        if (ch.used !== this.frame) continue;
        for (const t of ch.trees) {
          const w = (t.texture.width * Math.abs(t.scale.x)) / 2;
          const h = t.texture.height * t.scale.y;
          const over = t.zIndex > md && Math.abs(t.x - mx) < w * 0.75 && my < t.y && my > t.y - h * 0.97;
          t.alpha = over ? 0.25 : 1;
        }
      }
    }
    // (the bridge too, as much of it as there is)
    for (const b of this.bridge ?? []) {
      const over = !!me && b.m.zIndex > md && mx > b.x0 && mx < b.x1 && my > b.y0 && my < b.y1;
      b.m.visible = this.land.visible && this.bridgeLevel > 0;
      b.m.alpha = this.bridgeLevel * (over ? 0.35 : 1);
    }
  }

  // see-through (a building in front of you) or not (its parts and shadow)
  private fade(id: string, a: number) {
    for (const r of this.items.roots(id)) r.alpha = a;
  }

  // ── the weather over the land (weather-iso.ts): the snow, a storm's white ──
  readonly weather = new IsoWeather();
  private storm = 0;
  private wind = 0;
  /** How hard it's storming (shared weather.ts, eased), where the wind's from. */
  setWeather(storm: number, wind: number) {
    this.storm = storm;
    this.wind = wind;
  }
  /** A frame of the engine's (the view `W` × `H`, its camera and zoom). */
  weatherFrame(
    dt: number,
    W: number,
    H: number,
    zoom: number,
    cam: { x: number; y: number },
    animate: boolean,
    map: MapDef,
    amb: [number, number, number],
  ) {
    this.weather.frame(dt, this.storm, this.wind, W, H, zoom, cam, animate, map, this.land.visible, amb);
  }

  // a building's drawing over you: what of it is in front of your middle and head
  private faded = new Set<string>();
  // what's tall enough to hide you behind it: the buildings, and the Kart Park's stands, tower and gate
  private tall: { id: string; x0: number; z0: number; x1: number; z1: number; H: number }[] | null = null;
  private fadeBuildings(me: { x: number; y: number; z?: number }) {
    const now = new Set<string>();
    const d = me.x - me.y;
    if (!this.tall) {
      const G = this.G;
      this.tall = G.BUILDINGS.filter((b) => !b.stored && b.kind !== "hq").map((b) => ({
        id: `gr:${b.key}`,
        x0: b.x0,
        z0: b.z0,
        x1: b.x1,
        z1: b.z1,
        H: b.floors * 3.8 + 1.5,
      }));
      for (const [i, st] of G.KART_STANDS.entries())
        this.tall.push({
          id: `gr:k-stand${i}`,
          x0: Math.min(st.x0, st.x1),
          z0: st.z,
          x1: Math.max(st.x0, st.x1),
          z1: st.z + st.rows + 2,
          H: 5.6,
        });
      const T = G.KART_TOWER;
      this.tall.push({ id: "gr:k-tower", x0: T.x - 1.5, z0: T.z - 1, x1: T.x + 1.5, z1: T.z + 1, H: 12 });
      const K = G.KART_GATE;
      this.tall.push({ id: "gr:k-gate", x0: K.x - 7, z0: K.z, x1: K.x + 7, z1: K.z + 1, H: 7.5 });
    }
    for (const b of this.tall) {
      if (!this.items.things.length) break;
      const x0 = b.x0 - this.ox;
      const x1 = b.x1 - this.ox;
      const y0 = b.z0 - this.oy;
      const y1 = b.z1 - this.oy;
      // (quick out: well away from it)
      if (me.x < x0 - 40 || me.y < y0 - 40 || me.x > x1 + 2 || me.y > y1 + 2) continue;
      const H = b.H;
      const ground = this.G.heightAt((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
      const hit = [0.4, 1.6].some((up) => {
        // the column of the building's box that this point of you is drawn over:
        // the depth s (x + y) of each of its points that project here
        const lift = (me.z ?? 0) + up - ground;
        const k = ZPX_TILE / HH;
        const sLo = Math.max(2 * x0 - d, 2 * y0 + d, me.x + me.y - lift * k);
        const sHi = Math.min(2 * x1 - d, 2 * y1 + d, me.x + me.y + (H - lift) * k);
        // in front of you: deeper (nearer the viewer) than you stand
        return sHi >= sLo && sHi > me.x + me.y + 0.5;
      });
      if (hit) now.add(b.id);
    }
    for (const id of this.faded) if (!now.has(id)) this.fade(id, 1);
    for (const id of now) if (!this.faded.has(id)) this.fade(id, 0.3);
    this.faded = now;
  }

  // ── footprints in the snow (footprints.ts): a small sprite each, fading ──
  private printLayer = new PixiContainer();
  private printSprites = new Map<number, Sprite>();
  private printVersion = -1;
  private printFaded = 0;
  private printTex: Texture | null = null;
  drawPrints(f: Footprints, now: number) {
    if (!this.printTex) {
      const c = document.createElement("canvas");
      c.width = 20;
      c.height = 12;
      const g = c.getContext("2d") as CanvasRenderingContext2D;
      g.fillStyle = "rgba(70,86,110,0.55)";
      g.beginPath();
      g.ellipse(10, 6, 9, 5, 0, 0, Math.PI * 2);
      g.fill();
      this.printTex = Texture.from(c);
    }
    const fade = now - this.printFaded > 1000;
    if (f.version === this.printVersion && !fade) return;
    this.printVersion = f.version;
    const live = new Set<number>();
    for (const p of f.list) {
      live.add(p.id);
      let sp = this.printSprites.get(p.id);
      if (!sp) {
        sp = new Sprite(this.printTex);
        sp.anchor.set(0.5);
        sp.position.set((p.x - p.y) * HW, (p.x + p.y) * HH - p.z * ZPX_TILE);
        // the foot's direction, as the iso view squashes it
        sp.rotation = Math.atan2((Math.sin(p.a) + Math.cos(p.a)) * 0.5, Math.cos(p.a) - Math.sin(p.a));
        sp.scale.set(0.55, 0.42);
        this.printLayer.addChild(sp);
        this.printSprites.set(p.id, sp);
      }
      if (fade) sp.alpha = printLeft(p, now);
    }
    if (fade) this.printFaded = now;
    for (const [id, sp] of this.printSprites)
      if (!live.has(id)) {
        sp.destroy();
        this.printSprites.delete(id);
      }
  }

  // ── the night (docs/plan/27, the mood): the land truly dark off the lit ways;
  // the lamps' pools and the flashlights' beams are light added over it (and
  // on whoever stands in them: lightAt) ──
  readonly lights = new PixiContainer();
  private amb: [number, number, number] = [1, 1, 1];
  private night = 0;
  private pools = new Map<number, Sprite>();
  private beams: Sprite[] = [];
  /** Flares burning (world/dark gives them: the floor's coords): a red pool each, day or night. */
  flares: { x: number; y: number }[] = [];
  private flarePools: Sprite[] = [];
  private torches: (Beam & { at: { x: number; y: number } })[] = [];
  /** Vehicles out with their lamps on (setVehicles; the floor's coords, heading as a +x angle). */
  private carLamps: { x: number; y: number; a: number; half: number; brake: boolean }[] = [];
  private focus = { x: 0, y: 0 }; // where I am (setNight's fx, fy)
  /** How dark it is out under the sky (daylight.ts), for what's seen right round me (eyes.ts). */
  dark = 0;
  private carBeams: Sprite[] = [];
  private carTails: Sprite[] = [];
  private poolTex: Texture | null = null;
  private beamTex: Texture | null = null;

  /** How dark it is (0 day … 1 night); `torches`: flashlights on (the floor's
   *  coords; `angle` the way they face as they turned, else `d`, shared DIRS;
   *  focused or not), `fx, fy` the focus. */
  setNight(
    night: number,
    people: Iterable<{
      state: { x: number; y: number; d: number; torch?: boolean; angle?: number; focused?: boolean; mv?: number };
    }>,
    fx: number,
    fy: number,
  ) {
    this.night = night;
    this.focus.x = fx;
    this.focus.y = fy;
    // (a facing is a direction on screen: 0 down, clockwise; the beam's in the floor's x/y)
    // the beam itself: shared beam.ts, as 3D and the server have it
    this.torches = [...people]
      .filter((p) => p.state.torch)
      .map(({ state: t }) => {
        let a = t.angle;
        if (a === undefined) {
          const ang = (t.d * Math.PI) / 4;
          const sx = -Math.sin(ang) / HW;
          const sy = Math.cos(ang) / HH;
          a = Math.atan2(sy - sx, sx + sy);
        }
        const aiming = ((t.mv ?? 0) & 16) !== 0;
        return { ...beamOf(t.x, t.y, 0, a, aiming ? 0 : null, !!t.focused), at: { x: t.x, y: t.y } };
      });
    this.lights.blendMode = "add";
    const on = night > 0.05;
    // the lamps' pools round the focus
    const near = new Set<number>();
    if (on)
      for (const [i, l] of this.G.LAMPS.entries())
        if (Math.abs(l.x - this.ox - fx) < 70 && Math.abs(l.z - this.oy - fy) < 70) near.add(i);
    for (const [i, sp] of this.pools)
      if (!near.has(i)) {
        sp.destroy();
        this.pools.delete(i);
      }
    for (const i of near) {
      let sp = this.pools.get(i);
      if (!sp) {
        const l = this.G.LAMPS[i];
        const lx = l.x - this.ox;
        const ly = l.z - this.oy;
        const R = POOL_R[l.kind] ?? 5;
        sp = new Sprite(this.pool());
        sp.anchor.set(0.5);
        sp.position.set((lx - ly) * HW, (lx + ly) * HH - this.G.heightAt(l.x, l.z) * ZPX_TILE);
        sp.width = 2 * R * Math.SQRT2 * HW;
        sp.height = 2 * R * Math.SQRT2 * HH;
        sp.tint = 0xffd9a0;
        this.lights.addChild(sp);
        this.pools.set(i, sp);
      }
      sp.alpha = Math.min(1, night * 1.2) * 0.62;
    }
    // flares: red pools, flickering (docs/plan/30-the-dark.md D6)
    while (this.flarePools.length < this.flares.length) {
      const sp = new Sprite(this.pool());
      sp.anchor.set(0.5);
      sp.tint = 0xff4030;
      this.lights.addChild(sp);
      this.flarePools.push(sp);
    }
    const t = performance.now() / 1000;
    for (const [i, sp] of this.flarePools.entries()) {
      const f = this.flares[i];
      sp.visible = !!f;
      if (!f) continue;
      const R = FLARE_R;
      sp.position.set((f.x - f.y) * HW, (f.x + f.y) * HH - this.G.heightAt(f.x + this.ox, f.y + this.oy) * ZPX_TILE);
      sp.width = 2 * R * Math.SQRT2 * HW;
      sp.height = 2 * R * Math.SQRT2 * HH;
      sp.alpha = 0.75 + 0.2 * Math.sin(t * 23 + i);
    }
    // the beams, from each torch along the ground the way it points
    while (this.beams.length < this.torches.length) {
      const sp = new Sprite(this.beam());
      sp.anchor.set(0, 0.5);
      this.lights.addChild(sp);
      this.beams.push(sp);
    }
    for (const [i, sp] of this.beams.entries()) {
      const t = this.torches[i];
      sp.visible = !!t;
      if (!t) continue;
      // (along it and across: focused, longer and narrower; its light on past its reach)
      const ka = ((t.focus ? BEAM.focus.len : BEAM_LEN) / BEAM_PX) * SPILL;
      const kc = (BEAM_LEN / BEAM_PX) * (t.focus ? FOCUS_ACROSS : 1);
      const c = Math.cos(t.yaw);
      const sn = Math.sin(t.yaw);
      const { x, y } = t.at;
      const h = this.G.heightAt(x + this.ox, y + this.oy);
      // the plan's rotation and scale, then the iso projection
      sp.setFromMatrix(
        new Matrix(
          HW * ka * (c - sn),
          HH * ka * (c + sn),
          -HW * kc * (sn + c),
          HH * kc * (c - sn),
          (x - y) * HW,
          (x + y) * HH - h * ZPX_TILE,
        ),
      );
      sp.alpha = (0.25 + 0.6 * night) * (t.focus ? 1.25 : 1);
    }
    // cars' headlamps on the snow ahead, their tail lamps red behind (after dark only)
    const cars = night > 0.25 ? this.carLamps : [];
    while (this.carBeams.length < cars.length) {
      const b = new Sprite(this.beam());
      b.anchor.set(0, 0.5);
      b.tint = 0xfff2da;
      const t = new Sprite(this.pool());
      t.anchor.set(0.5);
      t.tint = 0xff2a14;
      this.lights.addChild(b, t);
      this.carBeams.push(b);
      this.carTails.push(t);
    }
    for (const [i, sp] of this.carBeams.entries()) {
      const c = cars[i];
      const tail = this.carTails[i];
      sp.visible = tail.visible = !!c;
      if (!c) continue;
      const ux = Math.cos(c.a);
      const uy = Math.sin(c.a);
      const h = this.G.heightAt(c.x + this.ox, c.y + this.oy) * ZPX_TILE;
      const nx = c.x + ux * c.half;
      const ny = c.y + uy * c.half;
      const ka = CAR_BEAM.len / BEAM_PX;
      const kc = ka * (Math.tan(CAR_BEAM.half) / Math.tan(BEAM_HALF));
      sp.setFromMatrix(
        new Matrix(
          HW * ka * (ux - uy),
          HH * ka * (ux + uy),
          -HW * kc * (uy + ux),
          HH * kc * (ux - uy),
          (nx - ny) * HW,
          (nx + ny) * HH - h,
        ),
      );
      sp.alpha = Math.min(1, night * 1.2);
      // (the red behind it: a small pool, brighter braking)
      const tx = c.x - ux * (c.half + 1.2);
      const ty = c.y - uy * (c.half + 1.2);
      tail.position.set((tx - ty) * HW, (tx + ty) * HH - h);
      tail.width = 2 * 2.2 * Math.SQRT2 * HW;
      tail.height = 2 * 2.2 * Math.SQRT2 * HH;
      tail.alpha = (c.brake ? 0.7 : 0.35) * Math.min(1, night * 1.2);
    }
  }

  /** The light on someone or something at (x, y) (the floor's coords) out on
   *  the land: the hour's, a lamp's pool, a beam (0xRRGGBB; `own`: not a torch held there). */
  lightAt(x: number, y: number, own = false): number {
    let [r, g, b] = this.amb;
    // (in the dark: right round me faintly seen — myself, someone a step away; eyes.ts)
    const near = nearLift(Math.hypot(x - this.focus.x, y - this.focus.y), this.dark);
    r += near;
    g += near;
    b += near * 1.1;
    if (this.night > 0.05) {
      for (const i of this.pools.keys()) {
        const l = this.G.LAMPS[i];
        const R = POOL_R[l.kind] ?? 5;
        const d = Math.hypot(l.x - this.ox - x, l.z - this.oy - y) / R;
        if (d >= 1) continue;
        const k = (1 - d * d) * Math.min(1, this.night * 1.2) * 0.75;
        r += k;
        g += k * 0.85;
        b += k * 0.62;
      }
    }
    for (const f of this.flares) {
      const d = Math.hypot(f.x - x, f.y - y) / FLARE_R;
      if (d >= 1) continue;
      const k = (1 - d * d) * 0.9;
      r += k;
      g += k * 0.3;
      b += k * 0.22;
    }
    // a car's headlamps: a cone from its nose, fading out ahead
    if (this.night > 0.25)
      for (const c of this.carLamps) {
        const ux = Math.cos(c.a);
        const uy = Math.sin(c.a);
        const dx = x - (c.x + ux * c.half);
        const dy = y - (c.y + uy * c.half);
        const along = dx * ux + dy * uy;
        if (along <= 0 || along >= CAR_BEAM.len) continue;
        const side = Math.abs(dx * uy - dy * ux);
        const half = 0.7 + along * Math.tan(CAR_BEAM.half);
        if (side >= half) continue;
        const k = (1 - along / CAR_BEAM.len) ** 2 * (1 - (side / half) ** 2) * 1.1;
        r += k;
        g += k * 0.95;
        b += k * 0.85;
      }
    for (const t of this.torches) {
      if (own && Math.hypot(t.at.x - x, t.at.y - y) < 0.4) continue;
      // (shared beam.ts: the same test 3D and the server make; a focused beam is the brighter)
      const k = beamAt(t, x, y) * (0.2 + 0.9 * this.night) * (t.focus ? 1.5 : 1);
      if (k <= 0) continue;
      r += k;
      g += k * 0.97;
      b += k * 0.9;
    }
    const c = (v: number) => Math.round(Math.min(1, v) * 255);
    return (c(r) << 16) | (c(g) << 8) | c(b);
  }

  // a soft disc (a lamp's pool) and a cone (a beam, pointing +x from its left middle)
  private pool(): Texture {
    if (this.poolTex) return this.poolTex;
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d") as CanvasRenderingContext2D;
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, "rgba(255,255,255,0.9)");
    grd.addColorStop(0.45, "rgba(255,255,255,0.45)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    this.poolTex = Texture.from(c);
    return this.poolTex;
  }
  private beam(): Texture {
    if (this.beamTex) return this.beamTex;
    const W = BEAM_PX;
    const H = Math.ceil(Math.tan(BEAM_HALF) * W * 2) + 4;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const g = c.getContext("2d") as CanvasRenderingContext2D;
    const img = g.createImageData(W, H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const dy = y - H / 2;
        const d = Math.hypot(x, dy);
        const off = Math.abs(Math.atan2(dy, x));
        if (d > W || off > BEAM_HALF) continue;
        const k = (1 - d / W) ** 1.3 * (1 - (off / BEAM_HALF) ** 2) * Math.min(1, d / 6);
        const i = (y * W + x) * 4;
        img.data[i] = 255;
        img.data[i + 1] = 248;
        img.data[i + 2] = 232;
        img.data[i + 3] = Math.round(k * 235);
      }
    g.putImageData(img, 0, 0);
    this.beamTex = Texture.from(c);
    return this.beamTex;
  }

  // ── what drives on the Grounds (docs/plan/27, phase 6): the visitor's car (the
  // lot's kind), the shuttle (gr_bus), drawn as things are; made again when it
  // turns or moves a tile, slid between ──
  private vehViews = new Map<
    string,
    {
      key: string;
      bx: number;
      by: number;
      fw: number;
      fh: number;
      lift: number;
      base: [number, number][];
      /** its parts' places in the sort, as put */
      z: number[];
    }
  >();
  /** The Kart Park's karts (kart/karts.ts): drawn with the vehicles, the next time they are. */
  private karts: {
    id: string;
    kind: string;
    x: number;
    z: number;
    a: number;
    shown: boolean;
    variant?: number;
    fl?: number;
    v?: number;
    h?: number;
  }[] = [];
  setKarts(
    list: { id: string; kind: string; x: number; z: number; a: number; shown: boolean; variant?: number; h?: number }[],
  ) {
    this.karts = list;
  }
  /** Where they are (the building's coords, `a` the heading); `fx, fy` the focus (the floor's). */
  setVehicles(
    list: {
      id: string;
      kind: string;
      x: number;
      z: number;
      a: number;
      shown: boolean;
      variant?: number;
      fl?: number;
      v?: number;
      /** the height it's at, when not the land's (a kart, the Kart Park's ploughs: on the bridge or
       *  under it) */
      h?: number;
    }[],
    fx: number,
    fy: number,
  ) {
    const G = this.G;
    const seen = new Set<string>();
    this.carLamps = [];
    // the way its nose points: rot 0 −x, 1 −y, 2 +x, 3 +y (the items' turns)
    const noses: [number, number][] = [
      [-1, 0],
      [0, -1],
      [1, 0],
      [0, 1],
    ];
    for (const v of [...list, ...this.karts]) {
      const cx = v.x - this.ox;
      const cy = v.z - this.oy;
      if (!this.land.visible || !v.shown || Math.hypot(cx - fx, cy - fy) > 90) continue;
      seen.add(v.id);
      const dot = (r: number) => noses[r][0] * Math.cos(v.a) + noses[r][1] * Math.sin(v.a);
      let rot = 0;
      for (let r = 1; r < 4; r++) if (dot(r) > dot(rot)) rot = r;
      const bus = v.kind === "shuttle";
      const plough = v.kind === "plough";
      const kart = v.kind === "kart";
      const [w, h] = bus ? [10, 3] : plough ? [9, 3] : kart ? [2, 2] : [5, 2];
      // (its lamps: the Grounds' own on the move after dark, a driven car's when they're switched on)
      const fl = v.fl ?? 0;
      if (((bus || plough || v.kind === "visitor") && Math.abs(v.v ?? 0) > 0.2) || fl & LAMPS_ON)
        this.carLamps.push({ x: cx, y: cy, a: v.a, half: w / 2, brake: (fl & BRAKE) !== 0 });
      const fw = rot % 2 ? h : w;
      const fh = rot % 2 ? w : h;
      const bx = Math.floor(cx - fw / 2);
      const by = Math.floor(cy - fh / 2);
      const key = `${rot}|${bx}|${by}`;
      const id = `veh:${v.id}`;
      let e = this.vehViews.get(v.id);
      if (!e || e.key !== key) {
        const lift = v.h ?? G.heightAt(v.x, v.z);
        this.put(
          {
            id,
            kind: bus ? "gr_bus" : plough ? "gr_plough" : kart ? "gr_k_kart" : "car",
            x: bx,
            y: by,
            // (a kart's drawn nosed +x: its turns two on from a car's)
            rot: kart ? (rot + 2) % 4 : rot,
            props: bus || plough ? {} : kart ? kartLook(v.variant ?? 0) : { variant: v.variant ?? 2 },
          },
          lift,
        );
        const roots = this.items.roots(id);
        e = { key, bx, by, fw, fh, lift, base: roots.map((r) => [r.x, r.y]), z: roots.map((r) => r.zIndex) };
        this.vehViews.set(v.id, e);
      }
      // slid from its tile to where it is, up or down with the ground
      const dx = cx - fw / 2 - e.bx;
      const dy = cy - fh / 2 - e.by;
      const dz = ((v.h ?? G.heightAt(v.x, v.z)) - e.lift) * ZPX_TILE;
      const b = e.base;
      // (under the Kart Park's bridge — a kart, a plough on the road under its span: behind its
      // pieces, sorted by their far corners — parkBridge)
      const deck = v.h === undefined ? null : G.deckAt(v.x, v.z);
      const under = deck !== null && v.h !== undefined && v.h < deck - 1.5;
      const z = e.z;
      this.items.roots(id).forEach((r, i) => {
        if (b[i]) r.position.set(b[i][0] + (dx - dy) * HW, b[i][1] + (dx + dy) * HH - dz);
        if (z[i] !== undefined) r.zIndex = z[i] - (under ? 30 : 0);
      });
    }
    for (const id of [...this.vehViews.keys()])
      if (!seen.has(id)) {
        this.take(`veh:${id}`);
        this.vehViews.delete(id);
      }
  }

  // the park's chunks to paint again (its layout changed), and the layout they show
  private parkStale = new Set<string>();
  private parkDue = new Set<string>();
  private parkLayout = "";
  /** the bridge there for the layout raced (and for the one before it: the show fades between) */
  private bridgeHas = true;
  private bridgeWas = true;
  /** how much of the bridge shows (0..1) */
  private bridgeLevel = 1;
  private overPark(key: string): boolean {
    const C = this.G.CHUNK;
    const F = this.G.KART_FENCE;
    const [cx, cz] = key.split(",").map(Number);
    return (cx + 1) * C > F.x0 - 40 && cx * C < F.x1 + 40 && (cz + 1) * C > F.z0 - 40 && cz * C < F.z1 + 40;
  }

  // ── the Kart Park's bridge (docs/plan/47-the-track-changer.md, phase 5): walked on, so drawn
  // up at its height (the land's picture keeps its shadow): a piece every ~1.5 m of it — its road,
  // centre line, parapets, the walls down to the ground on the camera's side (under the span, the
  // deck's edge: open below) —, each sorted with people and things by its far corner: whoever's on
  // it drawn over it, whoever's behind it (past its guard strip, as wide as a piece) under it ──
  private bridge: { m: Mesh; x0: number; x1: number; y0: number; y1: number }[] | null = null;
  private bridgeTex: Texture | null = null;
  private parkBridge() {
    const G = this.G;
    const t = G.kartTrack();
    const H = G.TRACK_W / 2;
    const up = t.pts.filter((p) => p.y > 0.05);
    const r0 = up[0].s;
    const r1 = up[up.length - 1].s;
    const span = (s: number) => {
      const p = G.trackAt(t, s);
      return t.pts.some(
        (q) =>
          Math.min(Math.abs(q.s - s), t.len - Math.abs(q.s - s)) > 60 &&
          Math.hypot(q.x - p.x, q.z - p.z) < G.TRACK_W + 3,
      );
    };
    // the swatches: road, line, parapet's top, wall lit, wall shaded, the deck's edge
    const SW = ["#5a6068", "#e6d69a", "#e2dccd", "#cfc8b8", "#aaa396", "#8f8a80"];
    const c = document.createElement("canvas");
    c.width = SW.length * 8;
    c.height = 8;
    const g = c.getContext("2d") as CanvasRenderingContext2D;
    for (const [i, col] of SW.entries()) {
      g.fillStyle = col;
      g.fillRect(i * 8, 0, 8, 8);
    }
    const tex = Texture.from(c);
    this.bridgeTex = tex;
    this.items.upload(tex);
    const out: NonNullable<typeof this.bridge> = [];
    const STEP = 1.5;
    for (let a = r0; a < r1; a += STEP) {
      const b = Math.min(r1, a + STEP);
      const ss = [a, (a + b) / 2, b];
      const ps = ss.map((s) => G.trackAt(t, s));
      const pos: number[] = [];
      const uv: number[] = [];
      const idx: number[] = [];
      let depth = Number.POSITIVE_INFINITY;
      // a point `off` across, `dy` over the road (or on the ground: `ground`)
      const at = (p: (typeof ps)[number], off: number, dy: number, ground = false): [number, number] => {
        const x = p.x + Math.sin(p.a) * off;
        const z = p.z - Math.cos(p.a) * off;
        const lx = x - this.ox;
        const ly = z - this.oy;
        depth = Math.min(depth, lx + ly);
        const h = G.terrainAt(x, z) + (ground ? 0 : p.y + 0.05 + dy);
        return [(lx - ly) * HW, (lx + ly) * HH - h * ZPX_TILE];
      };
      // a strip along the piece between two edges (each: across, over the road or on the ground),
      // one swatch
      type Edge = [number, number, boolean?];
      const strip = (e0: Edge, e1: Edge, sw: number) => {
        const n0 = pos.length / 2;
        for (const p of ps) {
          pos.push(...at(p, e0[0], e0[1], e0[2]), ...at(p, e1[0], e1[1], e1[2]));
          const u = (sw * 8 + 4) / c.width;
          uv.push(u, 0.5, u, 0.5);
        }
        for (let i = 0; i < ps.length - 1; i++) {
          const q = n0 + i * 2;
          idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2);
        }
      };
      // which side the camera sees (its walls): the one towards the viewer (depth up)
      const m = ps[1];
      const near = Math.sin(m.a) - Math.cos(m.a) > 0 ? 1 : -1;
      const open = span((a + b) / 2);
      const PE = H + 0.35;
      const PT = H + 0.6;
      const high = m.y >= 0.4;
      // the far parapet, the road and its line, the near parapet and wall
      const lit = near > 0 ? 3 : 4;
      if (high) strip([-near * PE, 0.9], [-near * PE, 0], 3);
      if (high) strip([-near * PT, 0.9], [-near * PE, 0.9], 2);
      // (to the parapets' feet: past them it'd cover the far one of the piece behind)
      strip(high ? [-PE, 0] : [-PT, 0], high ? [PE, 0] : [PT, 0], 0);
      if ((a - r0) % 8 < 3) strip([-0.08, 0.01], [0.08, 0.01], 1);
      if (open) strip([near * PT, 0], [near * PT, -0.8], 5);
      else strip([near * PT, 0], [near * PT, 0, true], lit);
      if (high) strip([near * PE, 0.9], [near * PT, 0.9], 2);
      if (high) strip([near * PT, 0.9], [near * PT, 0], lit);
      // where the span starts or ends: the ramp's end wall, if it faces the camera
      if (!open && (span(a - STEP) || span(b + STEP))) {
        const end = span(a - STEP) ? ps[0] : ps[2];
        const facing = span(a - STEP) ? -1 : 1;
        if (facing * (Math.cos(end.a) + Math.sin(end.a)) > 0) {
          const n0 = pos.length / 2;
          pos.push(...at(end, -PT, 0), ...at(end, PT, 0), ...at(end, -PT, 0, true), ...at(end, PT, 0, true));
          const u = (4 * 8 + 4) / c.width;
          uv.push(u, 0.5, u, 0.5, u, 0.5, u, 0.5);
          idx.push(n0, n0 + 1, n0 + 2, n0 + 1, n0 + 3, n0 + 2);
        }
      }
      const geometry = new MeshGeometry({
        positions: new Float32Array(pos),
        uvs: new Float32Array(uv),
        indices: new Uint32Array(idx),
      });
      const mesh = new Mesh({ geometry, texture: tex });
      mesh.zIndex = depth - 0.01;
      mesh.tint = this.tint;
      mesh.visible = this.land.visible && this.bridgeLevel > 0;
      mesh.alpha = this.bridgeLevel;
      this.sortLayer.addChild(mesh);
      const xs = pos.filter((_, i) => i % 2 === 0);
      const ys = pos.filter((_, i) => i % 2 === 1);
      out.push({ m: mesh, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) });
    }
    this.bridge = out;
  }

  private inGrounds(cx: number, cz: number): boolean {
    const C = this.G.CHUNK;
    const g = this.G.GROUNDS;
    return (cx + 1) * C > g.x0 && cx * C < g.x1 && (cz + 1) * C > g.z0 && cz * C < g.z1;
  }

  private drop(ch: Chunk) {
    this.chunks.delete(ch.key);
    this.showThings(ch.key, false);
    ch.mesh.destroy();
    ch.tex.destroy(true);
    for (const t of ch.trees) t.destroy();
  }

  // ── a chunk: its mesh, its picture, its trees ──
  private build(cx: number, cz: number): Chunk {
    const G = this.G;
    const C = G.CHUNK;
    const x0 = cx * C;
    const z0 = cz * C;
    const data = G.groundsChunk(cx, cz);
    const tex = Texture.from(this.picture(x0, z0, data));
    this.items.upload(tex);
    // the mesh: a vertex a tile corner, raised by the ground there
    const n = C;
    const positions = new Float32Array((n + 1) * (n + 1) * 2);
    const uvs = new Float32Array((n + 1) * (n + 1) * 2);
    for (let j = 0; j <= n; j++)
      for (let i = 0; i <= n; i++) {
        const lx = x0 + i - this.ox;
        const ly = z0 + j - this.oy;
        const h = data.h[j * 2 * LN + i * 2];
        const v = (j * (n + 1) + i) * 2;
        positions[v] = (lx - ly) * HW;
        positions[v + 1] = (lx + ly) * HH - h * ZPX_TILE;
        uvs[v] = i / n;
        uvs[v + 1] = j / n;
      }
    const idx: number[] = [];
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        if (this.covered(x0 + i - this.ox, z0 + j - this.oy)) continue;
        const p = j * (n + 1) + i;
        idx.push(p, p + 1, p + n + 1, p + 1, p + n + 2, p + n + 1);
      }
    const geometry = new MeshGeometry({ positions, uvs, indices: new Uint32Array(idx) });
    const mesh = new Mesh({ geometry, texture: tex });
    mesh.tint = this.tint;
    // (under the footprints, the land's last child)
    this.land.addChildAt(mesh, 0);
    // the trees: drawn standing where they are, sorted with people and things
    const trees: Sprite[] = [];
    for (const t of data.trees) {
      const lx = t.x - this.ox;
      const ly = t.z - this.oy;
      if (this.covered(Math.floor(lx), Math.floor(ly))) continue;
      const v = Math.floor(t.ry * 10) % 3;
      const s = new Sprite(this.treeTexture(t.kind, v));
      s.anchor.set(0.5, 0.96);
      const k = t.s * (t.kind === "pine" ? 1.45 : t.kind === "bare" ? 1.7 : 1) * TREE_K;
      s.scale.set(Math.cos(t.ry) > 0 ? k : -k, k);
      s.position.set((lx - ly) * HW, (lx + ly) * HH - t.y * ZPX_TILE);
      s.zIndex = depthOf(lx, ly);
      s.tint = this.tint;
      s.visible = this.land.visible;
      Object.assign(s, { lx, ly });
      this.sortLayer.addChild(s);
      trees.push(s);
    }
    if (this.land.visible) this.showThings(`${cx},${cz}`, true);
    return { key: `${cx},${cz}`, mesh, tex, trees, used: this.frame };
  }

  // The chunk's picture, top down (PX a tile): the surfaces blended, the hills
  // shaded, the grain, the roads and trails, the trees' shadows.
  private picture(x0: number, z0: number, data: ReturnType<G["groundsChunk"]>): HTMLCanvasElement {
    const G = this.G;
    const C = G.CHUNK;
    const S = C * PX;
    const c = document.createElement("canvas");
    c.width = S;
    c.height = S;
    const g = c.getContext("2d") as CanvasRenderingContext2D;
    g.imageSmoothingEnabled = true;
    // the surfaces at the tile corners, blended by stretching them
    const sc = document.createElement("canvas");
    sc.width = C + 1;
    sc.height = C + 1;
    const sg = sc.getContext("2d") as CanvasRenderingContext2D;
    const img = sg.createImageData(C + 1, C + 1);
    for (let j = 0; j <= C; j++)
      for (let i = 0; i <= C; i++) {
        const col = SURF[G.groundSurfaceAt(x0 + i, z0 + j)] ?? SURF.snow;
        const k = (j * (C + 1) + i) * 4;
        img.data[k] = col[0];
        img.data[k + 1] = col[1];
        img.data[k + 2] = col[2];
        img.data[k + 3] = 255;
      }
    sg.putImageData(img, 0, 0);
    g.drawImage(sc, -PX / 2, -PX / 2, (C + 1) * PX, (C + 1) * PX);
    // the hills, lit from the north-west
    const hc = document.createElement("canvas");
    hc.width = LN;
    hc.height = LN;
    const hg = hc.getContext("2d") as CanvasRenderingContext2D;
    const hi = hg.createImageData(LN, LN);
    const H = (i: number, j: number) =>
      data.h[Math.min(LN - 1, Math.max(0, j)) * LN + Math.min(LN - 1, Math.max(0, i))];
    for (let j = 0; j < LN; j++)
      for (let i = 0; i < LN; i++) {
        const dx = (H(i + 1, j) - H(i - 1, j)) * 2;
        const dz = (H(i, j + 1) - H(i, j - 1)) * 2;
        const v = Math.max(0, Math.min(255, 255 * (1 + (-dx - dz) * 0.22)));
        const k = (j * LN + i) * 4;
        hi.data[k] = v;
        hi.data[k + 1] = v;
        hi.data[k + 2] = Math.min(255, v + 6);
        hi.data[k + 3] = 255;
      }
    hg.putImageData(hi, 0, 0);
    g.globalCompositeOperation = "multiply";
    g.drawImage(hc, -PX / 4, -PX / 4, LN * (PX / 2), LN * (PX / 2));
    // grain (snow under the light)
    const pat = g.createPattern(this.grain, "repeat");
    if (pat) {
      g.fillStyle = pat;
      g.fillRect(0, 0, S, S);
    }
    // the trees' soft shadows (the sun low in the south)
    for (const t of data.trees) {
      const x = (t.x - x0) * PX;
      const z = (t.z - z0) * PX;
      const r = (t.kind === "pine" ? 2.4 : 1.4) * t.s * PX;
      const grd = g.createRadialGradient(x - r * 0.3, z - r * 0.6, 0, x - r * 0.3, z - r * 0.6, r * 1.3);
      grd.addColorStop(0, "rgba(120,135,160,0.55)");
      grd.addColorStop(1, "rgba(120,135,160,0)");
      g.fillStyle = grd;
      g.beginPath();
      g.ellipse(x - r * 0.3, z - r * 0.6, r * 1.3, r, -0.5, 0, Math.PI * 2);
      g.fill();
    }
    g.globalCompositeOperation = "source-over";
    // the ways
    const inChunk = (x: number, z: number, m: number) => x > x0 - m && x < x0 + C + m && z > z0 - m && z < z0 + C + m;
    // (in passes: the verges and pavements under every way, then the asphalt, then the paint —
    // where Church Street meets Main, Main's paint stays whole; docs/plan/33-the-look.md)
    const roadish = (w: (typeof G.WAYS)[number]) => w.kind !== "trail" && w.kind !== "walk";
    const pathOf = (w: (typeof G.WAYS)[number], from = 0, to = w.line.length - 1) => {
      const m = w.w + 6;
      if (!w.line.some(([x, z]) => inChunk(x, z, m))) return null;
      return () => {
        g.beginPath();
        let started = false;
        for (const [i, [x, z]] of w.line.entries()) {
          if (i < from || i > to) continue;
          if (!inChunk(x, z, m + 2)) {
            started = false;
            continue;
          }
          const px = (x - x0) * PX;
          const pz = (z - z0) * PX;
          if (!started || i === 0) g.moveTo(px, pz);
          else g.lineTo(px, pz);
          started = true;
        }
      };
    };
    const stroke = (path: () => void, colour: string, width: number, dash?: number[]) => {
      path();
      g.strokeStyle = colour;
      g.lineWidth = width * PX;
      if (dash) g.setLineDash(dash.map((d) => d * PX));
      g.stroke();
      if (dash) g.setLineDash([]);
    };
    const ASPHALT = "rgb(74,79,87)";
    // a way's sample i: its line's normal there
    const nrm = (w: (typeof G.WAYS)[number], i: number): [number, number] => {
      const L = w.line;
      const [px, pz] = L[Math.max(0, i - 1)];
      const [qx, qz] = L[Math.min(L.length - 1, i + 1)];
      const l = Math.hypot(qx - px, qz - pz) || 1;
      return [-(qz - pz) / l, (qx - px) / l];
    };
    // where a way flares (Main Street from the county road): from its start to `n` a band as
    // wide as it is there (`half(i)` out either side), the strokes from `n` on
    const flareTo = (w: (typeof G.WAYS)[number]) => (w.flare ? Math.min(w.line.length - 1, w.flare.n) : 0);
    const band = (w: (typeof G.WAYS)[number], half: (i: number) => number, colour: string) => {
      const n = flareTo(w);
      if (!n || !w.line.slice(0, n + 1).some(([x, z]) => inChunk(x, z, w.w + 6))) return;
      g.beginPath();
      for (let i = 0; i <= n; i++) {
        const [nx, nz] = nrm(w, i);
        const [x, z] = w.line[i];
        const p = [(x + nx * half(i) - x0) * PX, (z + nz * half(i) - z0) * PX] as const;
        if (i === 0) g.moveTo(...p);
        else g.lineTo(...p);
      }
      for (let i = n; i >= 0; i--) {
        const [nx, nz] = nrm(w, i);
        const [x, z] = w.line[i];
        g.lineTo((x - nx * half(i) - x0) * PX, (z - nz * half(i) - z0) * PX);
      }
      g.closePath();
      g.fillStyle = colour;
      g.fill();
    };
    g.lineJoin = "round";
    // 1: the verges' packed snow, the streets' pavements and kerbs (short of the Kart Park's
    // turning circle: its mouth's asphalt there, as the 3D's — tp/roads3d.ts intoTurn)
    g.lineCap = "butt";
    const T = G.KART_TURN;
    const shortOfTurn = (w: (typeof G.WAYS)[number]) => {
      let to = w.line.length - 1;
      while (to > 0 && Math.hypot(w.line[to][0] - T.x, w.line[to][1] - T.z) < T.r + 4) to--;
      return to;
    };
    for (const w of G.WAYS) {
      const path = pathOf(w, flareTo(w), shortOfTurn(w));
      if (!path || !roadish(w)) continue;
      if (w.kind === "street") {
        stroke(path, "rgb(190,189,184)", w.w + 2 * w.pave);
        stroke(path, "rgb(150,151,154)", w.w + 0.56);
        band(w, (i) => G.wayHalf(w, i) + G.wayPave(w, i), "rgb(190,189,184)");
        band(w, (i) => G.wayHalf(w, i) + 0.28 * Math.min(1, G.wayPave(w, i) / 0.8), "rgb(150,151,154)");
      } else stroke(path, "rgb(214,220,226)", w.w + 2);
    }
    // 2: the asphalt, and the trails and walks
    for (const w of G.WAYS) {
      const path = pathOf(w);
      if (!path) continue;
      g.lineCap = w.kind === "street" ? "butt" : "round";
      if (w.kind === "trail") {
        stroke(path, "rgba(205,201,193,0.95)", w.w + 0.4);
        // boot prints down the middle
        g.fillStyle = "rgba(150,148,142,0.35)";
        for (let i = 0; i < w.line.length; i += 1) {
          const [x, z] = w.line[i];
          if (!inChunk(x, z, 2)) continue;
          for (const s of [-1, 1]) {
            const [a, b] = w.line[Math.min(w.line.length - 1, i + 1)];
            const l = Math.hypot(a - x, b - z) || 1;
            g.beginPath();
            g.ellipse(
              (x - x0 + (-(b - z) / l) * s * 0.25) * PX,
              (z - z0 + ((a - x) / l) * s * 0.25) * PX,
              2.2,
              3.4,
              Math.atan2(b - z, a - x) + Math.PI / 2,
              0,
              Math.PI * 2,
            );
            g.fill();
          }
        }
        continue;
      }
      if (w.kind === "walk") {
        stroke(path, "rgb(196,195,190)", w.w);
        continue;
      }
      if (w.flare) {
        stroke(pathOf(w, flareTo(w)) ?? path, ASPHALT, w.w);
        band(w, (i) => G.wayHalf(w, i), ASPHALT);
      } else stroke(path, ASPHALT, w.kind === "street" ? w.w : w.w - 0.6);
      // the wheel paths, worn darker, two a lane
      for (const lane of [-1, 1])
        for (const o of [-0.78, 0.78]) {
          const at = lane * (w.kind === "street" && w.w >= 13 ? 1.75 : w.w / 4) + o;
          stroke(path, "rgba(30,32,36,0.18)", 2 * Math.abs(at) + 0.5);
          stroke(path, ASPHALT, Math.max(0, 2 * Math.abs(at) - 0.5));
        }
      stroke(path, ASPHALT, 0.9);
    }
    // 3: the paint (lines either side of the middle: a wide stroke, the asphalt over its middle)
    g.lineCap = "butt";
    for (const w of G.WAYS) {
      const path = pathOf(w);
      if (!path || !roadish(w)) continue;
      const e = w.kind === "street" ? (w.w >= 13 ? 3.5 : 0) : w.w / 2 - 0.75;
      if (e > 0) {
        // (the parking lanes' lines: from where it's done flaring)
        const ep = pathOf(w, w.flare ? w.flare.n + 2 : 0) ?? path;
        stroke(ep, "rgba(232,234,236,0.9)", 2 * e + 0.14);
        stroke(ep, ASPHALT, 2 * e - 0.14);
      }
      if (w.kind === "street") {
        stroke(path, "rgba(216,184,74,0.95)", 0.38);
        stroke(path, ASPHALT, 0.18);
      } else stroke(path, "rgba(216,184,74,0.9)", 0.14, [3, 6]);
    }
    // 4: the carriageway's cover over its paint (tp/roads3d.ts roadCover, without the weather's
    // fresh snow): packed snow by the way's kind in blotches by where it is, the asphalt showing
    // in the wheel ruts, whiter at the edges, slush by the kerbs; eased halfway into the next
    // way's at a join
    {
      const BASE: Record<string, number> = { street: 0.1, driveway: 0.38, road: 0.5 };
      const hash = (x: number, z: number) => {
        const h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
        return h - Math.floor(h);
      };
      const vnoise = (x: number, z: number) => {
        const ix = Math.floor(x);
        const iz = Math.floor(z);
        let fx = x - ix;
        let fz = z - iz;
        fx = fx * fx * (3 - 2 * fx);
        fz = fz * fz * (3 - 2 * fz);
        const a = hash(ix, iz) + (hash(ix + 1, iz) - hash(ix, iz)) * fx;
        const b = hash(ix, iz + 1) + (hash(ix + 1, iz + 1) - hash(ix, iz + 1)) * fx;
        return a + (b - a) * fz;
      };
      const sm = (a: number, b: number, v: number) => {
        const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
        return t * t * (3 - 2 * t);
      };
      // (a pixel a quarter tile, stretched smooth over the chunk: each pixel the nearest way's)
      const Q = 4;
      const N = C * Q;
      const cc = document.createElement("canvas");
      cc.width = N;
      cc.height = N;
      const cg = cc.getContext("2d") as CanvasRenderingContext2D;
      const im = cg.createImageData(N, N);
      let any = false;
      for (const w of G.WAYS) {
        if (!roadish(w) || !pathOf(w)) continue;
        const base0 = BASE[w.kind] ?? 0.3;
        const ends = [w.line[0], w.line[w.line.length - 1]];
        const joins = G.WAYS.flatMap((o) =>
          o === w || !roadish(o)
            ? []
            : ends
                .filter((p) =>
                  [o.line[0], o.line[o.line.length - 1]].some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1.5),
                )
                .map((p) => ({ p, base: BASE[o.kind] ?? 0.3 })),
        );
        const lane = w.kind === "street" && w.w >= 13 ? 1.75 : w.w / 4;
        const parkAt = w.kind === "street" && w.w >= 13 ? 3.5 : 99;
        // its samples in reach, and over the pixels about each the nearest one's across-offset
        const near: number[] = [];
        for (let i = 0; i < w.line.length; i++) if (inChunk(w.line[i][0], w.line[i][1], w.w)) near.push(i);
        if (!near.length) continue;
        // (only the pixels about them)
        const r = w.w / 2 + 1.5;
        const lo = (v: number) => Math.max(0, Math.floor(v * Q));
        const hi = (v: number) => Math.min(N, Math.ceil(v * Q));
        const ax = lo(Math.min(...near.map((i) => w.line[i][0])) - r - x0);
        const bx = hi(Math.max(...near.map((i) => w.line[i][0])) + r - x0);
        const az = lo(Math.min(...near.map((i) => w.line[i][1])) - r - z0);
        const bz = hi(Math.max(...near.map((i) => w.line[i][1])) + r - z0);
        // (the nearest sample walked to from the last pixel's: a pixel or two moves it a sample)
        const i0 = near[0];
        const i1 = near[near.length - 1];
        const d2 = (i: number, x: number, z: number) => (w.line[i][0] - x) ** 2 + (w.line[i][1] - z) ** 2;
        let bi = i0;
        for (let py = az; py < bz; py++)
          for (let px = ax; px < bx; px++) {
            const x = x0 + (px + 0.5) / Q;
            const z = z0 + (py + 0.5) / Q;
            if (px === ax) for (const i of near) if (d2(i, x, z) < d2(bi, x, z)) bi = i;
            let bd = d2(bi, x, z);
            for (let moved = true; moved; ) {
              moved = false;
              for (const j of [bi - 1, bi + 1])
                if (j >= i0 && j <= i1) {
                  const d = d2(j, x, z);
                  if (d < bd) {
                    bd = d;
                    bi = j;
                    moved = true;
                  }
                }
            }
            const hw = G.wayHalf(w, bi);
            if (bd > (hw + 1.5) ** 2) continue;
            const [nx, nz] = nrm(w, bi);
            const m = (x - w.line[bi][0]) * nx + (z - w.line[bi][1]) * nz;
            if (Math.abs(m) >= hw) continue;
            // (not past its ends: the next way's own there)
            const along = (x - w.line[bi][0]) * nz - (z - w.line[bi][1]) * nx;
            if ((bi === 0 && along < 0) || (bi === w.line.length - 1 && along > 0)) continue;
            const fl = w.flare ? sm(0, w.flare.n, bi) : 1;
            let base = base0;
            for (const j of joins) base += 0.5 * (j.base - base0) * (1 - sm(0, 25, Math.hypot(x - j.p[0], z - j.p[1])));
            const fine = vnoise(x * 0.8, z * 0.8);
            const wob = (vnoise(x * 0.09, z * 0.09) - 0.5) * 0.35;
            let rut = 0;
            for (const c of [-lane - 0.78, -lane + 0.78, lane - 0.78, lane + 0.78])
              rut = Math.max(rut, 1 - sm(0, 0.95, Math.abs(m - c - wob)));
            const edge = sm(hw - 1.7, hw - 0.15, Math.abs(m));
            const park = sm(parkAt - 0.2, parkAt + 0.6, Math.abs(m)) * fl;
            const big = 0.65 * vnoise(x * 0.07, z * 0.07) + 0.35 * vnoise(x * 0.16 + 11, z * 0.16 + 11);
            let cover = Math.min(1, Math.max(0, base + (big - 0.5) * 0.8 + park * 0.18));
            // (the ruts broad and soft: the picture's seen shrunk, a sharp line steps)
            cover *= 1 - rut * 0.75;
            cover = Math.max(cover, edge * 0.5 * sm(0.25, 0.6, fine + 0.2));
            const a = sm(0.08, 0.55, cover) * 0.95;
            const o = (py * N + px) * 4;
            if (a <= im.data[o + 3] / 255) continue;
            const k = 0.52 + 0.22 * fine;
            const dirty = Math.min(1, edge * 0.8 + park * 0.5);
            const slush = dirty > 0 ? dirty * sm(0.35, 0.75, vnoise(x * 0.4 + 5, z * 0.4 + 5)) * 0.65 : 0;
            im.data[o] = 255 * (k + (0.3 - k) * slush);
            im.data[o + 1] = 255 * (k + 0.03 + (0.27 - k - 0.03) * slush);
            im.data[o + 2] = 255 * (k + 0.07 + (0.23 - k - 0.07) * slush);
            im.data[o + 3] = 255 * a;
            any = true;
          }
      }
      if (any) {
        cg.putImageData(im, 0, 0);
        g.drawImage(cc, 0, 0, S, S);
      }
    }
    // the crossing: crosswalks either side of Church Street's mouth and across it, its stop line
    {
      const main = G.WAYS.find((u) => u.key === "main");
      const church = G.WAYS.find((u) => u.key === "church-st");
      if (main && church && inChunk(church.line[0][0], main.line[0][1], 20)) {
        const mz = main.line[0][1];
        const cx = church.line[0][0];
        const hm = main.w / 2;
        const hc = church.w / 2;
        g.fillStyle = "rgba(232,234,236,0.95)";
        const bar = (ax: number, az: number, bx: number, bz: number) =>
          g.fillRect((ax - x0) * PX, (az - z0) * PX, (bx - ax) * PX, (bz - az) * PX);
        for (const xa of [cx - hc - 3.6, cx + hc + 0.6])
          for (let z = mz - hm + 0.4; z < mz + hm - 0.5; z += 1.1) bar(xa, z, xa + 3, z + 0.55);
        const zc = mz - hm - main.pave - 0.6;
        for (let x = cx - hc + 0.3; x < cx + hc - 0.4; x += 1.1) bar(x, zc - 3, x + 0.55, zc);
        bar(cx - hc + 0.2, zc - 3.9, cx - 0.2, zc - 3.45);
      }
    }
    g.lineCap = "round";
    // the floors of the buildings you walk into
    for (const ins of G.INSIDES) {
      const b = ins.b;
      if (b.x1 < x0 || b.x0 > x0 + C || b.z1 < z0 || b.z0 > z0 + C) continue;
      g.fillStyle = ins.floor;
      g.fillRect((b.x0 - x0) * PX, (b.z0 - z0) * PX, (b.x1 - b.x0) * PX, (b.z1 - b.z0) * PX);
      g.strokeStyle = "rgba(0,0,0,0.12)";
      g.lineWidth = 1;
      for (let z = b.z0; z <= b.z1; z += 1) {
        g.beginPath();
        g.moveTo((b.x0 - x0) * PX, (z - z0) * PX);
        g.lineTo((b.x1 - x0) * PX, (z - z0) * PX);
        g.stroke();
      }
    }
    // the Kart Park, flat on its land (docs/plan/46-the-karts.md)
    drawKartPark(g, G, x0, z0, PX, C);
    return c;
  }

  // A tree as the iso view draws it (inked, lit from the left), cached a kind and a variant.
  private treeTexture(kind: string, v: number): Texture {
    const k = `${kind}${v}`;
    let t = this.treeTex.get(k);
    if (!t) {
      t = Texture.from(kind === "pine" ? pineCanvas(v) : kind === "birch" ? birchCanvas(v) : bareCanvas(v));
      this.treeTex.set(k, t);
    }
    return t;
  }

  destroy() {
    this.gone = true;
    for (const ch of [...this.chunks.values()]) this.drop(ch);
    for (const t of this.treeTex.values()) t.destroy(true);
    this.land.destroy({ children: true });
    this.lights.destroy({ children: true });
    this.coverMesh?.texture.destroy(true);
    this.cover.destroy({ children: true });
    this.weather.destroy();
    this.poolTex?.destroy(true);
    this.printTex?.destroy(true);
    this.beamTex?.destroy(true);
    for (const b of this.bridge ?? []) b.m.destroy();
    this.bridgeTex?.destroy(true);
    this.bridge = null;
  }
}

// ── the trees' drawings ─────────────────────────────────────────────────────
// Drawn at DRAW of their size on screen (sprites scaled up by TREE_K / DRAW).
const DRAW = 0.75;
const TREE_K = 1 / DRAW;
const INK = "#141a17";
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// A spruce, 10.5 tiles high and 2.7 tiles round at the foot (as the 3D one).
function pineCanvas(v: number): HTMLCanvasElement {
  const r = rng(101 + v * 7);
  const Hp = 10.5 * ZPX_TILE * DRAW;
  const Rp = 2.7 * HW * Math.SQRT2 * DRAW;
  const W = Math.ceil(Rp * 2.4);
  const Hc = Math.ceil(Hp + 20);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = Hc;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  const cx = W / 2;
  const foot = Hc - 6;
  // the trunk
  g.fillStyle = "#3a2e26";
  g.fillRect(cx - 3, foot - 2.2 * ZPX_TILE * DRAW, 6, 2.2 * ZPX_TILE * DRAW);
  const tiers = 7;
  for (let t = 0; t < tiers; t++) {
    const k = t / (tiers - 1);
    const yBase = foot - (1.1 + k * 7.9) * ZPX_TILE * DRAW;
    const h = (2.6 - k * 0.9) * ZPX_TILE * DRAW;
    const w = Rp * (1 - k * 0.82) * (0.92 + r() * 0.16);
    const apex = yBase - h;
    // the bough's skirt: ragged, drooping at the ends (an ellipse's front half, seen from above)
    const pts: [number, number][] = [[cx, apex]];
    const n = 12;
    for (let i = 0; i <= n; i++) {
      const a = Math.PI * (i / n);
      const j = 0.8 + r() * 0.35;
      pts.push([cx - Math.cos(a) * w * j, yBase + Math.sin(a) * w * 0.35 * j + (1 - Math.sin(a)) * 3]);
    }
    const grd = g.createLinearGradient(cx - w, 0, cx + w, 0);
    grd.addColorStop(0, "#3a4d43");
    grd.addColorStop(0.55, "#253229");
    grd.addColorStop(1, "#18211c");
    g.fillStyle = grd;
    g.beginPath();
    for (const [i, [x, y]] of pts.entries()) i ? g.lineTo(x, y) : g.moveTo(x, y);
    g.closePath();
    g.fill();
    g.strokeStyle = INK;
    g.lineWidth = 1.5;
    g.stroke();
    // snow on its shoulders: the upper half, lighter on the left
    const sg = g.createLinearGradient(cx - w, 0, cx + w, 0);
    sg.addColorStop(0, "#f6f9fb");
    sg.addColorStop(1, "#c9d3dc");
    g.fillStyle = sg;
    g.beginPath();
    g.moveTo(cx, apex - 1);
    for (let i = 0; i <= n; i++) {
      const a = Math.PI * (i / n);
      const j = 0.55 + r() * 0.2;
      g.lineTo(cx - Math.cos(a) * w * j, apex + h * (0.42 + r() * 0.12) + Math.sin(a) * w * 0.2 * j);
    }
    g.closePath();
    g.fill();
  }
  return c;
}
// A birch: a white trunk with dark marks, thin twigs.
function birchCanvas(v: number): HTMLCanvasElement {
  const r = rng(211 + v * 5);
  const Hp = 9 * ZPX_TILE * DRAW;
  const W = Math.ceil(3.2 * HW * DRAW * 2);
  const Hc = Math.ceil(Hp + 30);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = Hc;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  const cx = W / 2;
  const foot = Hc - 4;
  g.strokeStyle = "#3d322b";
  g.lineCap = "round";
  const branch = (x: number, y: number, a: number, l: number, w: number, d: number) => {
    const x2 = x + Math.cos(a) * l;
    const y2 = y - Math.sin(a) * l;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x2, y2);
    g.stroke();
    if (d <= 0) return;
    for (let i = 0; i < 2; i++) branch(x2, y2, a + (r() - 0.5) * 1.3, l * 0.65, w * 0.6, d - 1);
  };
  for (let i = 0; i < 7; i++)
    branch(cx, foot - Hp * (0.4 + i * 0.08), Math.PI / 2 + (r() - 0.5) * 1.6, Hp * 0.18, 1.6, 3);
  g.fillStyle = "#ece8df";
  g.fillRect(cx - 3, foot - Hp, 6, Hp);
  g.strokeStyle = INK;
  g.lineWidth = 1;
  g.strokeRect(cx - 3, foot - Hp, 6, Hp);
  g.fillStyle = "#26231f";
  for (let i = 0; i < 9; i++) g.fillRect(cx - 3 + r() * 3, foot - Hp * r(), 2 + r() * 2, 1.5 + r() * 2);
  return c;
}
// A bare tree: a dark trunk forking into branches.
function bareCanvas(v: number): HTMLCanvasElement {
  const r = rng(307 + v * 3);
  const Hp = 6 * ZPX_TILE * DRAW;
  const W = Math.ceil(3.6 * HW * DRAW * 2);
  const Hc = Math.ceil(Hp + 30);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = Hc;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  g.strokeStyle = "#3a4048";
  g.lineCap = "round";
  const branch = (x: number, y: number, a: number, l: number, w: number, d: number) => {
    const x2 = x + Math.cos(a) * l;
    const y2 = y - Math.sin(a) * l;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x2, y2);
    g.stroke();
    if (d <= 0) return;
    const n = 2 + (r() < 0.4 ? 1 : 0);
    for (let i = 0; i < n; i++) branch(x2, y2, a + (r() - 0.5) * 1.2, l * 0.7, w * 0.62, d - 1);
  };
  branch(W / 2, Hc - 4, Math.PI / 2, Hp * 0.36, 5, 5);
  return c;
}
// Fine grain for the snow: speckles, multiplied (wraps).
function grainCanvas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 128, 128);
  const r = rng(7);
  for (let i = 0; i < 900; i++) {
    const v = 225 + Math.floor(r() * 30);
    g.fillStyle = `rgb(${v},${v},${Math.min(255, v + 6)})`;
    g.fillRect(r() * 128, r() * 128, 1 + r() * 2, 1);
  }
  return c;
}
