import { elevOf } from "@yutopia/shared";
import {
  Box3,
  BoxGeometry,
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  type MeshLambertMaterial,
  type PlaneGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { paintMaterial } from "../../look/lit";
import { isLifeOut } from "../../look/look-mode";
import { carGeometry } from "../campus";
import { landLight, patchGrounds } from "../light3d";
import { Person3D } from "../person3d";
import { tailPatch } from "../tail-glow";
import { busModel, ploughModel } from "../vehicles3d";
import type { Body3, ThirdPersonView } from "../view";
import { hashId } from "./common";

/** What Vehicles reads of the ThirdPersonView (plan 72 phase 4: its dependencies, said). */
export type VehiclesHost = Pick<
  ThirdPersonView,
  | "around"
  | "breathAt"
  | "building"
  | "camera"
  | "fogAir"
  | "fx"
  | "lampFog"
  | "level"
  | "mood"
  | "nightLevel"
  | "scene"
  | "time"
>;

export class Vehicles {
  constructor(private readonly c: VehiclesHost) {}

  // ── what drives on the Grounds (docs/plan/27, phase 6): the visitor's car,
  // the shuttle; lit as the land is (dark at night), headlamps glowing ──
  veh3 = new Map<string, Group>();

  vehMat: MeshLambertMaterial | null = null;

  setVehicles(
    list: { id: string; kind: string; x: number; z: number; a: number; v?: number; shown: boolean; h?: number }[],
  ) {
    const g = this.c.around.grounds;
    const up = elevOf(0) - elevOf(this.c.level);
    const seen = new Set<string>();
    for (const v of list) {
      if (!g || !v.shown) continue;
      seen.add(v.id);
      let m = this.veh3.get(v.id);
      if (!m) {
        m = v.kind === "shuttle" ? this.busModel() : v.kind === "plough" ? this.ploughModel() : this.carModel(v.id);
        // (its headlamps, for car/cars.ts's real light: either side of its nose, −x)
        const box = new Box3().setFromObject(m);
        const w = (box.max.z - box.min.z) * 0.36;
        const y = m.userData.big ? 1.1 : 0.55;
        m.userData.heads = [new Vector3(box.min.x, y, -w), new Vector3(box.min.x, y, w)];
        // (and its tail lamps' red on the snow behind)
        const tail = tailPatch(box.max.x);
        m.add(tail);
        m.userData.tailGlow = tail;
        this.veh3.set(v.id, m);
        this.c.scene.add(m);
      }
      const px = v.x;
      const pz = v.z;
      // its wheels turn by how far it went (the shuttle's)
      const wheels = m.userData.wheels as Group[] | undefined;
      if (wheels && m.userData.at) {
        const [ax, az] = m.userData.at as [number, number];
        const d = Math.hypot(px - ax, pz - az);
        if (d < 5) for (const w of wheels) w.rotation.z -= d / 0.5;
      }
      m.userData.at = [px, pz];
      // (on the move: its headlamps a real light — car/cars.ts; parked, just their glow)
      m.userData.moving = Math.abs(v.v ?? 0) > 0.2;
      m.position.set(px, (v.h ?? g.heightAt(v.x, v.z)) + up + 0.03, pz);
      // (the models' noses point −x: turned to the heading)
      m.rotation.y = Math.PI - v.a;
      // (their lamps on in the morning fog as after dark)
      const n = Math.max(this.c.nightLevel, 0.6 * this.c.lampFog);
      for (const l of m.userData.glow as MeshBasicMaterial[]) l.opacity = Math.min(1, 0.25 + n * 1.2);
      for (const l of m.userData.tail as MeshBasicMaterial[]) l.opacity = Math.min(1, 0.35 + n * 1.1);
      const tg = m.userData.tailGlow as Mesh<PlaneGeometry, MeshBasicMaterial>;
      tg.material.opacity = 0.35 * n;
      tg.visible = n > 0.2;
      // (the plough's beacon: turning — a flash twice a second)
      const b = m.userData.beacon as MeshBasicMaterial | undefined;
      if (b) b.opacity = 0.35 + 0.65 * Math.max(0, Math.sin(performance.now() / 160)) ** 4;
    }
    for (const [id, m] of this.veh3)
      if (!seen.has(id)) {
        this.c.scene.remove(m);
        this.veh3.delete(id);
      }
  }

  /** The Grounds' own vehicles' headlamps (their lamps are on after dark), in the scene:
   *  car/cars.ts gives the nearest a real light. */
  vehicleLamps(): { a: Vector3; b: Vector3; fwd: Vector3 }[] {
    const out: { a: Vector3; b: Vector3; fwd: Vector3 }[] = [];
    for (const m of this.veh3.values()) {
      const h = m.userData.heads as Vector3[] | undefined;
      if (!h || !m.visible || !m.userData.moving) continue;
      m.updateMatrixWorld();
      out.push({
        a: h[0].clone().applyMatrix4(m.matrixWorld),
        b: h[1].clone().applyMatrix4(m.matrixWorld),
        fwd: new Vector3(-1, 0, 0).transformDirection(m.matrixWorld),
      });
    }
    return out;
  }

  vehicleMat(): MeshLambertMaterial {
    if (!this.vehMat) {
      // (the life look: paint, clearcoated — plan 73 phase 8.3; smooth, not the Grounds' faces)
      this.vehMat = paintMaterial({ vertexColors: true });
      patchGrounds(this.vehMat);
      if (isLifeOut()) this.vehMat.flatShading = false;
    }
    return this.vehMat;
  }

  lampsOf(xs: number, w: number, y: number): Mesh {
    const lamps = new MeshBasicMaterial({ color: 0xfff1cc, transparent: true, toneMapped: false });
    const geo = mergeGeometries(
      [-1, 1].map((s) => new BoxGeometry(0.06, 0.18, 0.3).translate(xs, y, (s * w) / 2)),
      false,
    );
    return new Mesh(geo, lamps);
  }

  /** The visitor's car: one of the town's colours and shapes (by its id), snow on it from the
   *  drive in, headlamps and tail lamps. */
  carModel(id: string): Group {
    const root = new Group();
    let h = 0;
    for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
    const colours = [0x4a5a73, 0x6b2430, 0x2f4a3b, 0xcbbd98, 0x1f2124, 0x6a4a35];
    const { solid, glass } = carGeometry((h & 4) !== 0, colours[Math.abs(h) % colours.length], true);
    root.add(new Mesh(solid, this.vehicleMat()), new Mesh(glass, this.vehicleMat()));
    const l = this.lampsOf(-2.52, 1.2, 0.55);
    root.add(l);
    const tail = new MeshBasicMaterial({ color: 0xff3a24, transparent: true, toneMapped: false });
    root.add(
      new Mesh(
        mergeGeometries(
          [-1, 1].map((s) => new BoxGeometry(0.05, 0.14, 0.5).translate(2.53, 0.68, s * 0.62)),
          false,
        ),
        tail,
      ),
    );
    root.userData.glow = [l.material];
    root.userData.tail = [tail];
    for (const c of root.children) c.castShadow = true;
    return root;
  }

  ploughModel(): Group {
    const b = ploughModel(this.vehicleMat());
    b.root.userData.big = true;
    b.root.userData.glow = [b.lamps];
    b.root.userData.tail = [b.tail];
    b.root.userData.beacon = b.beacon;
    b.root.userData.wheels = b.wheels;
    return b.root;
  }

  busModel(): Group {
    const b = busModel(this.vehicleMat());
    b.root.userData.big = true;
    b.root.userData.glow = [b.lamps, b.sign];
    b.root.userData.tail = [b.tail];
    b.root.userData.wheels = b.wheels;
    return b.root;
  }

  // a soft round puff (a sprite with no picture is a square)
  puffTex: CanvasTexture | null = null;

  puffMap(): CanvasTexture {
    if (this.puffTex) return this.puffTex;
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const g = c.getContext("2d") as CanvasRenderingContext2D;
    const r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    r.addColorStop(0, "rgba(255,255,255,1)");
    r.addColorStop(0.5, "rgba(255,255,255,0.55)");
    r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r;
    g.fillRect(0, 0, 32, 32);
    this.puffTex = new CanvasTexture(c);
    return this.puffTex;
  }

  // breath in the cold: a little cloud now and then from everyone out on the land (when the air's
  // cold: under 8 °C — docs/plan/65 W9)
  breathe(bodies: Body3[]) {
    if (Person3D.airCold < 0.05) return;
    const now = this.c.time;
    const cam = this.c.camera.position;
    for (const b of bodies) {
      if (
        b.npc ||
        b.pet ||
        b.busy === "ride:shuttle" ||
        !this.c.mood.onLand(b.x, b.y) ||
        Math.hypot(cam.x - b.x, cam.z - b.y) > 16
      )
        continue;
      const next = this.c.breathAt.get(b.id) ?? now + (hashId(b.id) % 100) / 40;
      if (now < next) {
        this.c.breathAt.set(b.id, next);
        continue;
      }
      // (quicker running)
      this.c.breathAt.set(b.id, now + (b.a === 1 ? 1.6 : 2.8) + Math.random() * 0.6);
      const a = b.angle ?? b.yaw;
      const feet = b.z ?? b.ground ?? 0;
      for (let i = 0; i < 3; i++) {
        const s = new Sprite(
          new SpriteMaterial({
            map: this.puffMap(),
            color: 0xf4f7fa,
            transparent: true,
            depthWrite: false,
            opacity: 0.32,
            toneMapped: false,
          }),
        );
        s.material.color.multiply(landLight.value).multiplyScalar(1.4);
        s.scale.setScalar(0.08);
        s.position.set(b.x + Math.cos(a) * 0.22, feet + 1.52, b.y + Math.sin(a) * 0.22);
        this.c.scene.add(s);
        const sp = 0.3 + Math.random() * 0.2;
        this.c.fx.push({
          s,
          vx: Math.cos(a) * sp + (Math.random() - 0.5) * 0.1,
          vy: Math.sin(a) * sp + (Math.random() - 0.5) * 0.1,
          vz: 0.1 + Math.random() * 0.08,
          t: -i * 0.06,
          // (it hangs in the morning fog's still, damp air)
          life: 1.3 * (1 + 1.2 * this.c.fogAir),
          g: -0.05,
          drag: 1.6 * (1 - 0.4 * this.c.fogAir),
          grow: 4,
          size: 0.08,
          op: 0.3,
        });
      }
    }
  }
}
