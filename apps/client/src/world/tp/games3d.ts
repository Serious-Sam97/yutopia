import {
  BoxGeometry,
  BufferGeometry,
  CatmullRomCurve3,
  Group,
  type Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  type Object3D,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from "three";
import { zt } from "./kit3d";
import { mergeWith } from "./merge-static";
import { type PadLook, ps1Pad } from "./pads3d";

// The game room in 3D (world/games/room.ts draws the same in iso): consoles'
// cables to their TVs, the pads — lying by the console, or in a player's hands
// with the cord trailing back — and the red power LED of each one that's on.

type P = { x: number; y: number };
export interface GameScene3 {
  cables: { from: P; to: P; up: number }[]; // up: iso px it climbs at the end (a wall TV's screen)
  pads: {
    key: string;
    system: string;
    port: number;
    cord: P;
    rest: P;
    holder: string | null;
    sitting: boolean;
    analog?: boolean; // its LED lit (the disc console's pad)
  }[];
  leds: (P & { h?: number; color?: number })[]; // h: tiles up (default: a front LED's)
}

// where hands are, iso px up (the 3D drawings stand taller than iso's 30 / 21)
export const HAND_STAND = 44;
export const HAND_SIT = 32;
const CORD = 0.006; // tube radii, tiles
const CABLE = 0.011;

// each console's pad: its body colour, its size (tiles)
const PADS: Record<string, { color: number; w: number; d: number }> = {
  "2600": { color: 0x1c1a18, w: 0.12, d: 0.12 },
  nes: { color: 0xbdb8ae, w: 0.17, d: 0.075 },
  gb: { color: 0x8d877a, w: 0.17, d: 0.075 },
  ps1: { color: 0xb9b6af, w: 0.21, d: 0.1 },
  snes: { color: 0xc7c3bb, w: 0.19, d: 0.085 },
  md: { color: 0x1c1b1a, w: 0.18, d: 0.09 },
};

interface Tube {
  mesh: Mesh;
  key: string;
}

export class GamesIn3D {
  readonly root = new Group();
  private dark: MeshLambertMaterial;
  private red = new MeshBasicMaterial({ color: 0xff4a2a, toneMapped: false });
  private green = new MeshBasicMaterial({ color: 0x7dff7a, toneMapped: false });
  private ledOff = new MeshLambertMaterial({ color: 0x4a1d18 });
  private padLook: PadLook | null = null; // the disc console's pad's materials
  private padMats = new Map<string, MeshLambertMaterial>();
  private tubes: Tube[] = [];
  private pads = new Map<string, { g: Group; system: string }>();
  private leds: Mesh[] = [];
  private ledGeo = new SphereGeometry(0.012, 8, 6);
  // What stands still — the cables, the pads at rest with their cords, the LEDs — drawn
  // merged, a mesh per material (docs/plan/38-the-lag.md, round 4), made again only when
  // any of it changes; the pieces wait out of the scene (`held`) or, inside a pad partly
  // merged, hidden. A pad in someone's hands, and its cord, are drawn themselves.
  private stillKey = "";
  private stillMerged: Mesh[] = [];
  private stillOut: Object3D[] = []; // (moved to `held`)
  private stillHidden: Mesh[] = []; // (merged, inside a pad still in the scene)
  private held = new Group();
  private unmerged = false;

  constructor(private patch: (m: Material) => void) {
    this.dark = this.lit(0x15120f);
  }

  private lit(color: number): MeshLambertMaterial {
    const m = new MeshLambertMaterial({ color });
    this.patch(m);
    return m;
  }

  // Everything now; `hand(id, port, sitting)`: where someone's hands are (null: not
  // drawn); `face`: the way the camera looks (held pads turn to it, as people do).
  set(s: GameScene3, hand: (id: string, port: number, sitting: boolean) => Vector3 | null, face: number) {
    let n = 0;
    const still: string[] = [];
    const stillTubes: Tube[] = [];
    const moving: Object3D[] = [];
    const restPads: Group[] = [];
    const tube = (pts: Vector3[], r: number, moves = false) => {
      const key = `${r}|${pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}`).join(";")}`;
      let t = this.tubes[n++];
      if (!t) {
        t = { mesh: new Mesh(new BufferGeometry(), this.dark), key: "" };
        t.mesh.castShadow = true;
        this.root.add(t.mesh);
        this.tubes.push(t);
      }
      t.mesh.visible = true;
      if (moves) moving.push(t.mesh);
      else {
        stillTubes.push(t);
        still.push(key);
      }
      if (t.key === key) return;
      t.key = key;
      t.mesh.geometry.dispose();
      t.mesh.geometry = new TubeGeometry(new CatmullRomCurve3(pts), Math.max(8, pts.length * 8), r, 5);
    };
    const floor = (p: P, h = 0.012) => new Vector3(p.x, h, p.y);
    const mix = (a: P, b: P, t: number): P => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

    // the cables: along the floor, sagging sideways a touch; up the wall to a wall TV
    for (const c of s.cables) {
      const mid = mix(c.from, c.to, 0.5);
      const pts = [floor(c.from, 0.03), floor({ x: mid.x + 0.12, y: mid.y + 0.1 }), floor(c.to)];
      if (c.up > 0) pts.push(new Vector3(c.to.x, zt(c.up) - 0.02, c.to.y));
      tube(pts, CABLE);
    }

    // the pads
    const seen = new Set<string>();
    for (const p of s.pads) {
      seen.add(p.key);
      let v = this.pads.get(p.key);
      if (!v || v.system !== p.system) {
        if (v) this.dropPad(v.g);
        v = { g: this.padMesh(p.system), system: p.system };
        this.pads.set(p.key, v);
        this.root.add(v.g);
      }
      const led = v.g.getObjectByName("led") as Mesh | undefined;
      if (led) led.material = p.analog ? this.red : this.ledOff;
      const at = p.holder ? hand(p.holder, p.port, p.sitting) : null;
      if (at) {
        v.g.position.copy(at);
        v.g.rotation.set(0.5, Math.PI / 2 - face, 0, "YXZ"); // to the camera, tipped up, as held
        // the cord: down to the floor near their feet, back to the console
        const feet = { x: at.x, y: at.z };
        tube(
          [floor(p.cord, 0.03), floor(mix(p.cord, feet, 0.85)), new Vector3(at.x, at.y * 0.35, at.z), at],
          CORD,
          true,
        );
        moving.push(v.g);
      } else {
        v.g.position.set(p.rest.x, 0.012, p.rest.y);
        v.g.rotation.set(0, 0, 0);
        tube([floor(p.cord, 0.03), floor(mix(p.cord, p.rest, 0.5), 0.008), floor(p.rest, 0.015)], CORD);
        restPads.push(v.g);
        still.push(`${p.key}|${p.system}|${p.rest.x},${p.rest.y}|${!!p.analog}`);
      }
    }
    for (const [k, v] of this.pads)
      if (!seen.has(k)) {
        this.dropPad(v.g);
        this.pads.delete(k);
      }
    for (let i = n; i < this.tubes.length; i++) this.tubes[i].mesh.visible = false;

    // power LEDs
    s.leds.forEach((l, i) => {
      let m = this.leds[i];
      if (!m) {
        m = new Mesh(this.ledGeo, this.red);
        this.root.add(m);
        this.leds.push(m);
      }
      m.visible = true;
      m.material = l.color === 0x7dff7a ? this.green : this.red;
      m.position.set(l.x, l.h ?? 0.045, l.y);
      still.push(`L${l.x},${l.y},${l.h},${l.color}`);
    });
    for (let i = s.leds.length; i < this.leds.length; i++) this.leds[i].visible = false;

    const key = still.join(";");
    if (key !== this.stillKey) {
      this.stillKey = key;
      this.restill(
        stillTubes.map((t) => t.mesh),
        restPads,
        this.leds.slice(0, s.leds.length),
      );
    }
    // (what moves is drawn itself: back in the scene if it was merged a moment ago)
    for (const o of moving) if (o.parent !== this.root) this.root.add(o);
  }

  // the still pieces merged again: everything back first, then merged and put away
  private restill(tubes: Mesh[], pads: Group[], leds: Mesh[]) {
    this.showAll();
    for (const m of this.stillMerged) {
      m.removeFromParent();
      m.geometry.dispose();
    }
    const xf = new Map<Mesh, Matrix4>();
    const list: Mesh[] = [];
    for (const m of [...tubes, ...leds]) {
      m.updateMatrix();
      xf.set(m, m.matrix);
      list.push(m);
    }
    for (const g of pads) {
      g.updateMatrix();
      for (const c of g.children)
        if ((c as Mesh).isMesh) {
          c.updateMatrix();
          xf.set(c as Mesh, new Matrix4().multiplyMatrices(g.matrix, c.matrix));
          list.push(c as Mesh);
        }
    }
    const { meshes, used } = mergeWith(list, this.root, (m) => xf.get(m) as Matrix4);
    this.stillMerged = meshes;
    const gone = new Set(used);
    this.stillOut = [...tubes, ...leds].filter((m) => gone.has(m));
    this.stillHidden = [];
    for (const g of pads) {
      const kids = g.children.filter((c) => (c as Mesh).isMesh) as Mesh[];
      if (kids.every((c) => gone.has(c))) this.stillOut.push(g);
      else for (const c of kids) if (gone.has(c)) this.stillHidden.push(c);
    }
    this.hideStill();
  }

  // a pad gone (or a new console's): out of the scene, and out of what's merged
  private dropPad(g: Group) {
    g.removeFromParent();
    this.stillOut = this.stillOut.filter((o) => o !== g);
    for (const c of g.children) this.stillHidden = this.stillHidden.filter((m) => m !== c);
    this.stillKey = ""; // (merged again on this frame's end)
  }

  private showAll() {
    for (const o of this.stillOut) this.root.add(o);
    for (const m of this.stillHidden) m.visible = true;
    for (const m of this.stillMerged) m.visible = false;
  }

  private hideStill() {
    if (this.unmerged) return;
    for (const o of this.stillOut) this.held.add(o);
    for (const m of this.stillHidden) m.visible = false;
    for (const m of this.stillMerged) m.visible = true;
  }

  /** (tests) Drawn the old way, piece by piece, or merged: the same picture. */
  setUnmerged(on: boolean) {
    this.unmerged = on;
    if (on) this.showAll();
    else this.hideStill();
  }

  // a pad: its body, a dark strip, two red buttons (a stick on the 2600's)
  private padMesh(system: string): Group {
    const spec = PADS[system] ?? PADS.nes;
    if (system === "ps1") {
      this.padLook ??= {
        body: this.lit(spec.color),
        dark: this.dark,
        colors: [this.lit(0x5fae8a), this.lit(0xd0524a), this.lit(0x6f8fd0), this.lit(0xd889b8)],
        led: this.red,
      };
      return ps1Pad(this.padLook, spec.w);
    }
    let body = this.padMats.get(system);
    if (!body) {
      body = this.lit(spec.color);
      this.padMats.set(system, body);
    }
    const g = new Group();
    const add = (w: number, h: number, d: number, x: number, y: number, z: number, m: Material) => {
      const mesh = new Mesh(new BoxGeometry(w, h, d), m);
      mesh.position.set(x, y + h / 2, z);
      g.add(mesh);
    };
    add(spec.w, 0.025, spec.d, 0, 0, 0, body);
    if (system === "2600") add(0.014, 0.07, 0.014, 0, 0.025, 0, this.dark);
    else {
      add(spec.w * 0.96, 0.004, spec.d * 0.3, 0, 0.025, 0, this.dark);
      add(0.018, 0.008, 0.018, spec.w * 0.22, 0.025, 0.012, this.red);
      add(0.018, 0.008, 0.018, spec.w * 0.36, 0.025, 0.012, this.red);
    }
    return g;
  }

  dispose() {
    for (const o of this.stillOut) this.root.add(o);
    this.root.traverse((o) => {
      if (o instanceof Mesh && o.geometry !== this.ledGeo) o.geometry.dispose();
    });
    this.ledGeo.dispose();
    this.dark.dispose();
    this.red.dispose();
    this.green.dispose();
    this.ledOff.dispose();
    if (this.padLook) for (const m of [this.padLook.body, ...this.padLook.colors]) m.dispose();
    for (const m of this.padMats.values()) m.dispose();
  }
}
