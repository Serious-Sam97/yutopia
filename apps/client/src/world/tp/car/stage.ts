import type { AvatarLayers } from "@yutopia/shared";
import { groundAt } from "@yutopia/shared/grounds";
import type * as THREE_NS from "three";
import { buildSedan, type Lights, type Sedan, type SedanOpts } from "./sedan";
import { windscreenSnow } from "./textures";
import type { Cluster } from "./vfd";

// The sedan on the Grounds for a still (docs/plan/28-the-car.md, phase 0):
// placed and posed, its people in their seats, its lamps lit for real at
// night, the tracks it left, the snow it throws, its exhaust in the cold.
// Used by the Grounds' stills (grounds-shots.ts: a shot's `cars`).

type THREE = typeof THREE_NS;
type Chars = typeof import("../../chars");

export interface CarIn {
  x: number;
  z: number;
  /** which way the nose points: atan2(dz, dx), as the server's vehicles */
  a: number;
  y?: number;
  colour: number;
  kind?: SedanOpts["kind"];
  snowy?: number;
  sink?: number; // sunk into deep snow
  roll?: number; // leaning to its right (+), radians
  pitch?: number; // nose down (+)
  steer?: number; // the road wheels (+: to the left)
  spin?: number;
  doors?: [number, number, number, number];
  lights?: Partial<Lights>;
  cluster?: Partial<Cluster>;
  radio?: ["FM" | "AM" | "TAPE", number, number];
  wipers?: [number, number];
  screenSnow?: number;
  driver?: AvatarLayers;
  passenger?: AvatarLayers;
  rear?: AvatarLayers[];
  cockpit?: boolean; // the camera is the driver's eyes: the driver drawn as arms only
  /** the tracks it left; `local`: the path in the car's own frame (x back from the nose, z its left) */
  tracks?: { path: [number, number][]; kind: "snow" | "deep" | "ice"; local?: boolean };
  spray?: number; // snow thrown up by the rear wheels, 0..1
  sprayTo?: number; // which way it flies (an angle as `a`)
  exhaust?: number;
  freshener?: [number, number];
}

/** How big people are in a car's seat (the world's people are drawn with big heads). */
export const SEATED = 0.92;

/** A car's local point (model coords) in the world. */
export function carToWorld(c: CarIn, lx: number, ly: number, lz: number): [number, number, number] {
  const th = Math.PI - c.a;
  const y = (c.y ?? groundAt(c.x, c.z)) - (c.sink ?? 0);
  return [c.x + lx * Math.cos(th) + lz * Math.sin(th), y + ly, c.z - lx * Math.sin(th) + lz * Math.cos(th)];
}

interface Ctx {
  night: number;
  storm: boolean;
  lit: boolean;
  f: InstanceType<Chars["CharFactory"]>;
  C: Chars;
  bodyMat: THREE_NS.Material;
  flatMat: THREE_NS.Material;
  env: THREE_NS.Texture | null;
}

export function stageCars(T3: THREE, scene: THREE_NS.Scene, cars: CarIn[], ctx: Ctx) {
  const built: {
    c: CarIn;
    s: Sedan;
    people: { m: InstanceType<Chars["PersonModel"]>; seat: number; driver: boolean }[];
  }[] = [];
  const extra: THREE_NS.Object3D[] = [];
  const disposables: { dispose(): void }[] = [];
  for (const c of cars) {
    const s = buildSedan({ colour: c.colour, snowy: c.snowy ?? 0, kind: c.kind });
    const [x, y, z] = carToWorld(c, 0, 0, 0);
    s.root.position.set(x, y, z);
    s.root.rotation.y = Math.PI - c.a;
    s.body.rotation.x = -(c.roll ?? 0); // (the model's x runs nose → tail: about it, it rolls)
    s.body.rotation.z = c.pitch ?? 0;
    s.setSteer(c.steer ?? 0);
    for (const w of s.wheels) w.spin.rotation.z = c.spin ?? 0;
    for (const [i, a] of (c.doors ?? []).entries()) s.doors[i]?.open(a);
    s.setEnv(ctx.env);
    const l: Lights = {
      beams: "off",
      tail: false,
      brake: 0,
      reverse: false,
      ind: 0,
      dash: 0,
      dome: false,
      ...c.lights,
    };
    s.setLights(l);
    s.setCluster({
      kmh: 0,
      rpm: 850,
      gear: "N",
      fuel: 0.72,
      temp: 0.55,
      clock: "23:14",
      outside: -14,
      odo: 87412,
      beams: l.beams,
      ind: l.ind,
      hand: false,
      helps: false,
      ...c.cluster,
    });
    if (c.radio) s.setRadio(...c.radio);
    for (const [i, a] of (c.wipers ?? []).entries()) s.wipers[i].arm.rotation.z = a;
    if (c.freshener) {
      s.freshener.rotation.x = c.freshener[0];
      s.freshener.rotation.z = c.freshener[1];
    }
    if (c.screenSnow) {
      const t = windscreenSnow(
        s.screen.hw0,
        s.screen.len,
        c.screenSnow,
        s.wipers.map((w) => ({ z: w.pivot, arm: w.len, blade: w.blade, a0: w.sweep, a1: w.park })),
      );
      disposables.push(t);
      s.setScreenSnow(t);
    }
    scene.add(s.root);
    s.root.traverse((o) => {
      const m = o as THREE_NS.Mesh;
      if (m.isMesh && c.cockpit) m.frustumCulled = false;
    });
    // the people in their seats
    const people: (typeof built)[number]["people"] = [];
    const sit = (a: AvatarLayers | undefined, seat: number, driver: boolean) => {
      if (!a) return;
      const arms = driver && c.cockpit;
      const m = new ctx.C.PersonModel(
        ctx.f,
        a,
        0,
        { body: ctx.lit ? ctx.bodyMat : ctx.flatMat, ink: ctx.C.inkMaterial() },
        arms ? "arms" : "all",
      );
      const hip = s.seats[seat].hip;
      m.root.position.set(hip.x, 0, hip.z);
      m.root.rotation.y = -Math.PI / 2; // (people face +z; the car's nose is −x)
      m.root.scale.setScalar(SEATED); // (a touch smaller in a seat: the people's heads are big)
      s.body.add(m.root);
      people.push({ m, seat, driver });
    };
    sit(c.driver, 0, true);
    sit(c.passenger, 1, false);
    for (const [i, a] of (c.rear ?? []).entries()) sit(a, 2 + i, false);
    built.push({ c, s, people });

    const nose = new T3.Vector3(Math.cos(c.a), 0, Math.sin(c.a));
    // the headlamps: spot lights and, in the dark, their beams in the air
    if (l.beams !== "off" && ctx.night > 0.2) {
      for (const h of s.lamps.head) {
        const p = new T3.Vector3(...carToWorld(c, h.x, h.y, h.z));
        const high = l.beams === "high";
        const sp = new T3.SpotLight("#fff2da", high ? 220 : 110, high ? 120 : 80, high ? 0.36 : 0.5, 0.55, 1.25);
        sp.position.copy(p);
        sp.target.position
          .copy(p)
          .addScaledVector(nose, 30)
          .add(new T3.Vector3(0, high ? -0.4 : -1.3, 0));
        sp.castShadow = true;
        sp.shadow.mapSize.set(1024, 1024);
        sp.shadow.bias = -0.0008;
        scene.add(sp, sp.target);
        extra.push(sp, sp.target);
        if (ctx.night < 0.95) continue; // (the beams show in the air only in the dark)
        const Lc = high ? 34 : 24;
        const cone = beamCone(T3, Lc, high ? 0.3 : 0.42, ctx.storm ? 0.07 : 0.045);
        cone.position.copy(p);
        cone.lookAt(sp.target.position);
        scene.add(cone);
        extra.push(cone);
      }
    }
    // the tail lamps' red on the snow behind, at night
    if ((l.tail || l.beams !== "off" || l.brake > 0) && ctx.night > 0.2) {
      // (a spot aimed back and down: a point light would light the cabin red)
      const p = new T3.Vector3(...carToWorld(c, s.lamps.tail[0].x + 0.05, 0.72, 0));
      const red = new T3.SpotLight("#ff2a14", 6 + l.brake * 14, 9, 1.1, 0.8, 1.6);
      red.position.copy(p);
      red.target.position.set(...carToWorld(c, s.lamps.tail[0].x + 4, 0, 0));
      scene.add(red, red.target);
      extra.push(red, red.target);
    }
    // inside at night: the cluster's amber on the hands and the wheel, the dome lamp
    if (ctx.night > 0.2 && l.dash > 0) {
      const p = new T3.Vector3(...carToWorld(c, -0.32, 0.885, 0.42)); // (just off the cluster's glass)
      const glow = new T3.PointLight("#ffae52", 0.03 * l.dash, 0.6, 2);
      glow.position.copy(p);
      scene.add(glow);
      extra.push(glow);
      const p2 = new T3.Vector3(...carToWorld(c, -0.2, 0.66, 0));
      const g2 = new T3.PointLight("#ffae52", 0.015 * l.dash, 0.5, 2);
      g2.position.copy(p2);
      scene.add(g2);
      extra.push(g2);
    }
    if (l.dome) {
      const p = new T3.Vector3(...carToWorld(c, 0.5, 1.3, 0));
      const d = new T3.PointLight("#ffe6bf", 1.2, 2.6, 1.5);
      d.position.copy(p);
      scene.add(d);
      extra.push(d);
    }
    if (c.tracks) {
      const path = c.tracks.local
        ? c.tracks.path.map(([lx, lz]) => {
            const [wx, , wz] = carToWorld(c, lx, 0, lz);
            return [wx, wz] as [number, number];
          })
        : c.tracks.path;
      extra.push(...tracks(T3, scene, path, c.tracks.kind, ctx.night, c.y));
    }
    if (c.spray) extra.push(...spray(T3, scene, c, s, ctx.night));
    if (c.exhaust) extra.push(...plume(T3, scene, c, s, ctx.night, l));
  }

  // the rear-view mirror in a cockpit shows the road behind, for real
  const mirrors: { s: Sedan; rt: THREE_NS.WebGLRenderTarget; cam: THREE_NS.PerspectiveCamera }[] = [];
  for (const b of built) {
    if (!b.c.cockpit) continue;
    const rt = new T3.WebGLRenderTarget(512, 112);
    rt.texture.repeat.x = -1; // (a mirror: left and right swap)
    rt.texture.offset.x = 1;
    const cam = new T3.PerspectiveCamera(20, 0.235 / 0.05, 0.05, 600);
    b.s.rearView.material = new T3.MeshBasicMaterial({ map: rt.texture, color: "#c9ced4" });
    mirrors.push({ s: b.s, rt, cam });
    disposables.push(rt);
  }
  const v = new T3.Vector3();
  const back = new T3.Vector3();
  return {
    /** Before the frame: what each cockpit's mirror sees. */
    prerender(renderer: THREE_NS.WebGLRenderer) {
      for (const m of mirrors) {
        m.s.root.updateMatrixWorld(true);
        m.s.rearView.getWorldPosition(m.cam.position);
        back.set(1, -0.035, 0).transformDirection(m.s.body.matrixWorld);
        m.cam.position.addScaledVector(back, 0.04);
        m.cam.lookAt(m.cam.position.clone().addScaledVector(back, 20));
        m.s.rearView.visible = false;
        renderer.setRenderTarget(m.rt);
        renderer.render(scene, m.cam);
        renderer.setRenderTarget(null);
        m.s.rearView.visible = true;
      }
    },
    /** The cockpit's camera: the driver's own eyes, once they're posed (world). */
    eye(out: THREE_NS.Vector3): boolean {
      for (const b of built)
        for (const p of b.people)
          if (p.driver && b.c.cockpit && p.m.ready) {
            p.m.eyePosition(out);
            p.m.root.localToWorld(out);
            return true;
          }
      return false;
    },
    ready() {
      let n = 0;
      let all = 0;
      for (const b of built)
        for (const p of b.people) {
          all++;
          if (p.m.update()) n++;
        }
      return n === all;
    },
    pose() {
      for (const b of built)
        for (const p of b.people) {
          const seat = b.s.seats[p.seat];
          const pose = ctx.C.carPose(p.driver);
          p.m.setPose(pose, [0, p.m.sitDrop((seat.hip.y + 0.02) / SEATED), 0]);
          p.m.setFace(1, 0);
          if (p.driver) {
            b.s.root.updateMatrixWorld(true);
            // hands at ten to two, the wrists a little behind the rim
            for (const [side, phi] of [
              ["L", -1.0],
              ["R", 1.0],
            ] as const) {
              b.s.rim(phi, v);
              b.s.body.localToWorld(v);
              p.m.reachTo(side, v, 1, [-0.75, -1, -0.35]);
            }
          }
        }
    },
    dispose() {
      for (const b of built) b.s.dispose();
      for (const d of disposables) d.dispose();
      for (const e of extra) e.removeFromParent();
    },
  };
}

/** A headlamp's beam in the air: a soft additive cone, bright near the lamp. */
function beamCone(T3: THREE, len: number, half: number, k: number): THREE_NS.Mesh {
  const geo = new T3.ConeGeometry(Math.tan(half) * len, len, 32, 1, true)
    .translate(0, -len / 2, 0)
    .rotateX(-Math.PI / 2);
  return new T3.Mesh(
    geo,
    new T3.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: T3.AdditiveBlending,
      side: T3.DoubleSide,
      uniforms: { len: { value: len }, k: { value: k } },
      vertexShader:
        "varying float d; varying vec3 n; varying vec3 v; void main(){ d = -position.z; vec4 mv = modelViewMatrix * vec4(position,1.0); v = normalize(-mv.xyz); n = normalize(normalMatrix * normal); gl_Position = projectionMatrix * mv; }",
      fragmentShader:
        "uniform float len; uniform float k; varying float d; varying vec3 n; varying vec3 v; void main(){ float f = pow(1.0 - smoothstep(0.0, len, d), 1.6) * smoothstep(0.0, 4.0, d); float edge = pow(abs(dot(n, v)), 1.2); gl_FragColor = vec4(vec3(1.0, 0.95, 0.85) * k * f * edge, 1.0); }",
    }),
  );
}

/** The tracks the tyres left: two ruts behind (snow, deep snow) or pale scratches (ice). */
function tracks(
  T3: THREE,
  scene: THREE_NS.Scene,
  path: [number, number][],
  kind: "snow" | "deep" | "ice",
  night: number,
  level?: number, // on a flat surface (the pond's ice): its height
) {
  const out: THREE_NS.Object3D[] = [];
  const cv = document.createElement("canvas");
  cv.width = 64;
  cv.height = 256;
  const g = cv.getContext("2d") as CanvasRenderingContext2D;
  if (kind === "ice") {
    // (on the pond, the tyres wipe its dust of snow off: darker, polished ice, streaked)
    g.fillStyle = "rgba(92,112,138,0.45)";
    g.fillRect(0, 0, 64, 256);
    for (let i = 0; i < 16; i++) {
      g.strokeStyle = `rgba(${Math.random() < 0.5 ? "60,80,104" : "200,214,230"},${0.3 + Math.random() * 0.4})`;
      g.lineWidth = 1 + Math.random();
      const x = 6 + Math.random() * 52;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + (Math.random() - 0.5) * 6, 256);
      g.stroke();
    }
  } else {
    // the tread's print: chevrons pressed into the snow, the rut's walls lighter
    g.fillStyle = kind === "deep" ? "rgba(52,68,94,0.75)" : "rgba(60,78,104,0.6)";
    g.fillRect(0, 0, 64, 256);
    g.fillStyle = "rgba(30,42,62,0.5)";
    for (let y = 0; y < 256; y += 16) {
      g.beginPath();
      g.moveTo(8, y);
      g.lineTo(32, y + 8);
      g.lineTo(56, y);
      g.lineTo(56, y + 5);
      g.lineTo(32, y + 13);
      g.lineTo(8, y + 5);
      g.closePath();
      g.fill();
    }
    const edge = g.createLinearGradient(0, 0, 64, 0);
    edge.addColorStop(0, "rgba(255,255,255,0.55)");
    edge.addColorStop(0.12, "rgba(255,255,255,0)");
    edge.addColorStop(0.88, "rgba(255,255,255,0)");
    edge.addColorStop(1, "rgba(255,255,255,0.55)");
    g.fillStyle = edge;
    g.fillRect(0, 0, 64, 256);
  }
  const t = new T3.CanvasTexture(cv);
  t.wrapT = T3.RepeatWrapping;
  t.colorSpace = T3.SRGBColorSpace;
  const w = kind === "deep" ? 0.34 : kind === "ice" ? 0.3 : 0.24;
  for (const off of [-0.76, 0.76]) {
    const pos: number[] = [];
    const uv: number[] = [];
    let run = 0;
    for (let i = 0; i < path.length; i++) {
      const [x, z] = path[i];
      const [nx0, nz0] = path[Math.min(path.length - 1, i + 1)];
      const [px0, pz0] = path[Math.max(0, i - 1)];
      const dx = nx0 - px0;
      const dz = nz0 - pz0;
      const l = Math.hypot(dx, dz) || 1;
      const sx = -dz / l;
      const sz = dx / l;
      const cx = x + sx * off;
      const cz = z + sz * off;
      if (i > 0) run += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
      for (const e of [-1, 1]) {
        const ex = cx + sx * e * (w / 2);
        const ez = cz + sz * e * (w / 2);
        pos.push(ex, (level ?? groundAt(ex, ez)) + (kind === "ice" ? 0.012 : 0.07), ez);
        uv.push(e < 0 ? 0 : 1, run / 1.2);
      }
    }
    const idx: number[] = [];
    for (let i = 0; i < path.length - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const geo = new T3.BufferGeometry();
    geo.setAttribute("position", new T3.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new T3.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = new T3.Mesh(
      geo,
      new T3.MeshLambertMaterial({
        map: t,
        transparent: true,
        depthWrite: false,
        color: night > 0.5 ? "#6d7a90" : "#ffffff",
        polygonOffset: true,
        polygonOffsetFactor: -2,
        side: T3.DoubleSide,
      }),
    );
    m.renderOrder = 1;
    m.receiveShadow = true;
    scene.add(m);
    out.push(m);
  }
  return out;
}

/** Snow thrown up from the rear wheels: grains in an arc and a powder cloud. */
function spray(T3: THREE, scene: THREE_NS.Scene, c: CarIn, s: Sedan, night: number) {
  const out: THREE_NS.Object3D[] = [];
  const k = c.spray ?? 0;
  let seed = 9;
  const r = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const to = c.sprayTo ?? c.a + Math.PI;
  const dir = new T3.Vector3(Math.cos(to), 0, Math.sin(to));
  const n = Math.round(1800 * k);
  const pos = new Float32Array(n * 3);
  let j = 0;
  for (const w of s.wheels) {
    if (w.front) continue;
    const [wx, wy, wz] = carToWorld(c, w.rest.x, 0.05, w.rest.z);
    for (let i = 0; i < n / 2; i++) {
      const t = r() ** 0.8; // along its flight
      const spread = (r() - 0.5) * 0.9 * (0.4 + t);
      const d = 0.3 + t * 3.6 * k;
      const ux = dir.x * Math.cos(spread) - dir.z * Math.sin(spread);
      const uz = dir.x * Math.sin(spread) + dir.z * Math.cos(spread);
      const h = Math.sin(Math.min(1, t * 1.25) * Math.PI) * (0.6 + 1.1 * k) * (0.6 + r() * 0.6);
      pos[j * 3] = wx + ux * d + (r() - 0.5) * 0.2;
      pos[j * 3 + 1] = wy + h + r() * 0.1;
      pos[j * 3 + 2] = wz + uz * d + (r() - 0.5) * 0.2;
      j++;
    }
  }
  const geo = new T3.BufferGeometry();
  geo.setAttribute("position", new T3.BufferAttribute(pos, 3));
  const dot = soft(T3, 1);
  const pts = new T3.Points(
    geo,
    new T3.PointsMaterial({
      size: 0.065,
      map: dot,
      transparent: true,
      depthWrite: false,
      color: night > 0.5 ? "#bcc8da" : "#e3eaf2",
      opacity: 0.95,
    }),
  );
  scene.add(pts);
  out.push(pts);
  // the powder: a few big soft puffs
  const puff = soft(T3, 0.5);
  for (let i = 0; i < 12 * k; i++) {
    const w = s.wheels[2 + (i % 2)];
    const [wx, wy, wz] = carToWorld(c, w.rest.x, 0.2, w.rest.z);
    const t = r();
    const sp = new T3.Sprite(
      new T3.SpriteMaterial({
        map: puff,
        transparent: true,
        depthWrite: false,
        opacity: (0.12 + r() * 0.1) * (1 - t * 0.6),
        color: night > 0.5 ? "#9aa6b8" : "#f4f7fa",
      }),
    );
    const d = 0.5 + t * 3.2 * k;
    sp.position.set(
      wx + dir.x * d + (r() - 0.5) * 0.8,
      wy + 0.1 + t * 0.7 + r() * 0.2,
      wz + dir.z * d + (r() - 0.5) * 0.8,
    );
    const sc = 0.5 + t * 1.4;
    sp.scale.set(sc, sc * 0.8, 1);
    scene.add(sp);
    out.push(sp);
  }
  return out;
}

/** The exhaust's plume in the cold: soft puffs trailing back and up, torn by speed. */
function plume(T3: THREE, scene: THREE_NS.Scene, c: CarIn, s: Sedan, night: number, l: Lights) {
  const out: THREE_NS.Object3D[] = [];
  const puff = soft(T3, 0.45);
  const k = c.exhaust ?? 0;
  const e = s.lamps.exhaust;
  const red = night > 0.4 && (l.tail || l.beams !== "off");
  for (let i = 0; i < 14; i++) {
    const t = i / 13;
    const [x, y, z] = carToWorld(c, e.x + 0.15 + t * 2.6 * k, e.y + t * t * 0.9, e.z + Math.sin(t * 5) * 0.15 * t);
    const sp = new T3.Sprite(
      new T3.SpriteMaterial({
        map: puff,
        transparent: true,
        depthWrite: false,
        opacity: 0.45 * (1 - t) ** 1.2,
        color: red ? "#d9a49a" : night > 0.4 ? "#8b95a5" : "#eef1f4",
      }),
    );
    sp.position.set(x, y, z);
    const sc = 0.3 + t * 1.8;
    sp.scale.set(sc, sc, 1);
    scene.add(sp);
    out.push(sp);
  }
  return out;
}

const softs = new Map<number, THREE_NS.CanvasTexture>();
function soft(T3: THREE, hard: number): THREE_NS.CanvasTexture {
  const hit = softs.get(hard);
  if (hit) return hit;
  const cv = document.createElement("canvas");
  cv.width = cv.height = 64;
  const g = cv.getContext("2d") as CanvasRenderingContext2D;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(hard * 0.6, "rgba(255,255,255,0.6)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new T3.CanvasTexture(cv);
  softs.set(hard, t);
  return t;
}
