import { elevOf } from "@yutopia/shared";
import { landReady } from "@yutopia/shared/grounds";
import { CanvasTexture, type Group, Sprite, SpriteMaterial, Vector3 } from "three";
import type { Sedan } from "../car/model";
import { landLight } from "../light3d";
import { Person3D } from "../person3d";
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
  | "renderer"
>;

export class Vehicles {
  constructor(private readonly c: VehiclesHost) {}

  // ── what drives on the Grounds (docs/plan/27, phase 6): the visitor's car, the shuttle, the plough;
  // since docs/plan/92 their Blender models (car/glb.ts), fetched the first time one's out — lit as the
  // land is, their lamps on after dark ──
  veh3 = new Map<string, Group>();
  private models = new Map<string, Sedan>();
  private glb: typeof import("../car/glb") | null = null;
  private glbAsked = false;

  setVehicles(
    list: {
      id: string;
      kind: string;
      x: number;
      z: number;
      a: number;
      v?: number;
      shown: boolean;
      h?: number;
      pitch?: number;
      roll?: number;
      turn?: number;
      accel?: number;
    }[],
  ) {
    const g = this.c.around.grounds;
    const up = elevOf(0) - elevOf(this.c.level);
    const seen = new Set<string>();
    if (list.length && !this.glbAsked) {
      this.glbAsked = true;
      void import("../car/glb").then(async (m) => {
        await m.loadCarManifest();
        this.glb = m;
      });
    }
    const n = Math.max(this.c.nightLevel, 0.6 * this.c.lampFog);
    for (const v of list) {
      if (!g || !v.shown || !this.glb) continue;
      seen.add(v.id);
      let m = this.veh3.get(v.id);
      let car = this.models.get(v.id);
      if (!m || !car) {
        car = this.model(v.kind, v.id);
        m = car.root;
        // (its headlamps, for car/cars.ts's real light: the model's own; how big it is, for the camera)
        m.userData.heads = car.lamps.head;
        m.userData.big = v.kind !== "visitor";
        this.veh3.set(v.id, m);
        this.models.set(v.id, car);
        this.c.scene.add(m);
      }
      const px = v.x;
      const pz = v.z;
      // its wheels turn by how far it went
      if (m.userData.at) {
        const [ax, az] = m.userData.at as [number, number];
        const d = Math.hypot(px - ax, pz - az);
        if (d < 5) {
          m.userData.turn = ((m.userData.turn as number) ?? 0) + d / 0.45;
          for (const w of car.wheels) w.spin.rotation.z = (m.userData.turn as number) * (w.turnK ?? 1);
        }
      }
      m.userData.at = [px, pz];
      // (on the move: its headlamps a real light — car/cars.ts; parked, just their glow)
      m.userData.moving = Math.abs(v.v ?? 0) > 0.2;
      // (its land not made here yet — past the near land, out of sight —: where it was, not the land made now, on the
      // main thread, 6–50 ms a chunk as the long road's bus drove on: docs/plan/90-the-friends-machines.md phase 6)
      const known = v.h !== undefined || landReady(v.x, v.z) || !m.userData.placed;
      if (known) m.position.set(px, (v.h ?? g.heightAt(v.x, v.z)) + up + 0.02, pz);
      else m.position.set(px, m.position.y, pz);
      m.userData.placed = true;
      // (the models' noses point −x: turned to the heading — plan 98 phase 23: and on Jolt, its nose up and its lean as
      // the land and its springs have them (the model's +x its tail, +z its left))
      m.rotation.order = "YXZ";
      m.rotation.y = Math.PI - v.a;
      m.rotation.z = -(v.pitch ?? 0);
      m.rotation.x = v.roll ?? 0;
      // (plan 98 phase 23: its front wheels steered as it turns)
      const sp = Math.abs(v.v ?? 0);
      const steer = sp > 0.5 ? Math.atan((2.7 * (v.turn ?? 0)) / sp) : 0;
      for (const w of car.wheels) if (w.front) w.steer.rotation.y = Math.max(-0.6, Math.min(0.6, steer));
      // (their lamps on in the morning fog as after dark; the plough's beacon turning — plan 98 phase 23: the brake lamps
      // whenever it slows, by day too)
      const slowing = (v.accel ?? 0) < -0.8 && sp > 0.3;
      car.setLights({
        beams: n > 0.25 ? "low" : "off",
        tail: n > 0.15,
        brake: slowing ? 1 : Math.abs(v.v ?? 0) < 0.3 && m.userData.moving === false && n > 0.15 ? 0.4 : 0,
        reverse: (v.v ?? 0) < -0.2,
        ind: 0,
        dash: n > 0.15 ? 1 : 0.5,
        dome: false,
      });
      if (v.kind === "plough") car.setBeacon(true, this.c.time);
    }
    for (const [id, m] of this.veh3)
      if (!seen.has(id)) {
        this.c.scene.remove(m);
        this.models.get(id)?.dispose();
        this.models.delete(id);
        this.veh3.delete(id);
      }
  }

  /** A vehicle of the Grounds' own, from its Blender model: the shuttle bus, the plough truck, the
   *  visitor's car (a saloon GL in one of the town's colours, by its id). */
  private model(kind: string, id: string): Sedan {
    const G = this.glb as typeof import("../car/glb");
    let h = 0;
    for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
    const colours = [0x4a5a73, 0x6b2430, 0x2f4a3b, 0xcbbd98, 0x1f2124, 0x6a4a35];
    const variant = kind === "shuttle" ? "shuttle-bus" : kind === "plough" ? "ploughtruck" : "saloon-gl";
    const colour = kind === "shuttle" ? 0xe8e6df : kind === "plough" ? 0xd9a21b : colours[Math.abs(h) % colours.length];
    const car = G.buildCar({
      variant,
      look: { variant, colour, colour2: kind === "shuttle" ? 0x8e1c1c : undefined, extras: [], wheels: "steel" },
      level: "near",
      renderer: this.c.renderer,
    });
    car.setSnow(kind === "visitor" ? 0.6 : 0.2);
    car.setWear(0.3, [0, 0, 0, 0]);
    return car;
  }

  /** The Grounds' own vehicles' headlamps (their lamps are on after dark), in the scene:
   *  car/cars.ts gives the nearest a real light. */
  vehicleLamps(): { a: Vector3; b: Vector3; fwd: Vector3 }[] {
    const out: { a: Vector3; b: Vector3; fwd: Vector3 }[] = [];
    for (const m of this.veh3.values()) {
      const h = m.userData.heads as Vector3[] | undefined;
      if (!h?.length || !m.visible || !m.userData.moving) continue;
      m.updateMatrixWorld();
      out.push({
        a: h[0].clone().applyMatrix4(m.matrixWorld),
        b: (h[1] ?? h[0]).clone().applyMatrix4(m.matrixWorld),
        fwd: new Vector3(-1, 0, 0).transformDirection(m.matrixWorld),
      });
    }
    return out;
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
