import {
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  IcosahedronGeometry,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

// The items as things (docs/plan/46-the-karts.md, the quality pass): the cassette crate, the
// snowball, black ice, the fax bomb, Vortex's drone, the umbrella, the plough's blade. Shared by the
// game (kart/karts.ts) and the stills (tp/karts3d.ts). Flat facets and the house's colours; what
// moves (a rotor, a light) is named so its owner can turn it.

const mats = new Map<string, Material>();
const mat = (key: string, make: () => Material) => {
  let m = mats.get(key);
  if (!m) {
    m = make();
    mats.set(key, m);
  }
  return m;
};
const std = (c: string, o: Partial<{ rough: number; metal: number; emissive: string; ei: number; op: number }> = {}) =>
  mat(
    `std|${c}|${JSON.stringify(o)}`,
    () =>
      new MeshStandardMaterial({
        color: c,
        flatShading: true,
        roughness: o.rough ?? 0.6,
        metalness: o.metal ?? 0,
        emissive: o.emissive ?? "#000000",
        emissiveIntensity: o.ei ?? (o.emissive ? 1 : 0),
        transparent: o.op !== undefined,
        opacity: o.op ?? 1,
      }),
  );
const glow = (c: string, op = 1) =>
  mat(
    `glow|${c}|${op}`,
    () => new MeshBasicMaterial({ color: c, toneMapped: false, transparent: op < 1, opacity: op, depthWrite: op >= 1 }),
  );
let qTex: CanvasTexture | null = null;
let labelTex: CanvasTexture | null = null;
let iceTex: CanvasTexture | null = null;
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d") as CanvasRenderingContext2D);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** The cassette crate: a glowing amber box framed in dark edges, a cassette inside turning, a
 *  "?" floating over it. `spin` (named "spin") is what turns. */
export function crate3d(): Group {
  const g = new Group();
  const s = 0.74;
  const box = new Mesh(
    new RoundedBoxGeometry(s, s, s, 2, 0.06),
    mat(
      "crate",
      () =>
        new MeshStandardMaterial({
          color: "#f0a63a",
          emissive: "#ff9a2a",
          emissiveIntensity: 0.35,
          roughness: 0.25,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
        }),
    ),
  );
  box.renderOrder = 2;
  g.add(box);
  // its frame: twelve dark edges
  const edge = std("#2a2018", { rough: 0.5 });
  const h = s / 2;
  for (const [x, y, z, w, hh, d] of [
    [0, h, h, s, 0.05, 0.05],
    [0, -h, h, s, 0.05, 0.05],
    [0, h, -h, s, 0.05, 0.05],
    [0, -h, -h, s, 0.05, 0.05],
    [h, 0, h, 0.05, s, 0.05],
    [-h, 0, h, 0.05, s, 0.05],
    [h, 0, -h, 0.05, s, 0.05],
    [-h, 0, -h, 0.05, s, 0.05],
    [h, h, 0, 0.05, 0.05, s],
    [-h, h, 0, 0.05, 0.05, s],
    [h, -h, 0, 0.05, 0.05, s],
    [-h, -h, 0, 0.05, 0.05, s],
  ]) {
    const e = new Mesh(new BoxGeometry(w, hh, d), edge);
    e.position.set(x, y, z);
    g.add(e);
  }
  // the cassette inside, turning
  const spin = new Group();
  spin.name = "spin";
  labelTex ??= canvasTex(256, 160, (c) => {
    c.fillStyle = "#2a2018";
    c.beginPath();
    c.roundRect(4, 4, 248, 152, 14);
    c.fill();
    c.fillStyle = "#f3ead6";
    c.fillRect(22, 18, 212, 52);
    c.fillStyle = "#b5562f";
    c.fillRect(22, 58, 212, 10);
    c.fillStyle = "#2a2018";
    c.font = "800 30px 'Helvetica Neue', Arial, sans-serif";
    c.textAlign = "center";
    c.fillText("MIXTAPE ?", 128, 50);
    c.fillStyle = "#e8a33d";
    for (const x of [82, 174]) {
      c.beginPath();
      c.arc(x, 112, 22, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#2a2018";
      c.beginPath();
      c.arc(x, 112, 8, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#e8a33d";
    }
  });
  const tape = new Mesh(new BoxGeometry(0.42, 0.27, 0.06), [
    std("#2a2018"),
    std("#2a2018"),
    std("#2a2018"),
    std("#2a2018"),
    mat("tapeLabel", () => new MeshStandardMaterial({ map: labelTex, roughness: 0.5 })),
    mat("tapeLabel", () => new MeshStandardMaterial({ map: labelTex, roughness: 0.5 })),
  ]);
  spin.add(tape);
  g.add(spin);
  // the "?" floating out of it, lit
  qTex ??= canvasTex(128, 128, (c) => {
    c.fillStyle = "#fff4d0";
    c.shadowColor = "#ffb347";
    c.shadowBlur = 16;
    c.font = "900 104px Georgia, serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("?", 64, 70);
  });
  const q = new Mesh(
    new PlaneGeometry(0.34, 0.34),
    mat(
      "crateQ",
      () =>
        new MeshBasicMaterial({ map: qTex, transparent: true, toneMapped: false, depthWrite: false, side: DoubleSide }),
    ),
  );
  q.name = "q";
  q.position.y = 0.02;
  q.position.z = 0.04;
  spin.add(q);
  const core = new Mesh(new SphereGeometry(0.16, 10, 8), glow("#ffcf7a", 0.35));
  g.add(core);
  return g;
}

/** A snowball: packed, a little lumpy, its ink in its shade. */
export function snowball3d(r = 0.25): Mesh {
  const geo = new IcosahedronGeometry(r, 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 1 + 0.07 * Math.sin(p.getX(i) * 31 + p.getY(i) * 17) * Math.cos(p.getZ(i) * 23);
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
  }
  geo.computeVertexNormals();
  const m = new Mesh(geo, std("#f6f9fc", { rough: 0.85 }));
  m.castShadow = true;
  return m;
}

/** Black ice: a lobed slick, glassy, its cracks white. */
export function ice3d(r: number): Mesh {
  iceTex ??= canvasTex(256, 256, (c) => {
    const rg = c.createRadialGradient(128, 128, 10, 128, 128, 128);
    rg.addColorStop(0, "#2c4656");
    rg.addColorStop(1, "#1a2a34");
    c.fillStyle = rg;
    c.fillRect(0, 0, 256, 256);
    c.strokeStyle = "rgba(220,240,255,0.55)";
    c.lineWidth = 2;
    for (let i = 0; i < 9; i++) {
      c.beginPath();
      let x = 128;
      let y = 128;
      c.moveTo(x, y);
      const a = (i / 9) * Math.PI * 2;
      for (let j = 0; j < 6; j++) {
        x += Math.cos(a + Math.sin(i * 3 + j) * 0.6) * 20;
        y += Math.sin(a + Math.sin(i * 5 + j) * 0.6) * 20;
        c.lineTo(x, y);
      }
      c.stroke();
    }
    c.fillStyle = "rgba(255,255,255,0.25)";
    c.beginPath();
    c.ellipse(96, 90, 40, 14, -0.5, 0, Math.PI * 2);
    c.fill();
  });
  const s = new Shape();
  for (let i = 0; i <= 28; i++) {
    const th = (i / 28) * Math.PI * 2;
    const rr = r * (1 + 0.22 * Math.sin(th * 3 + 1) + 0.12 * Math.sin(th * 5));
    i ? s.lineTo(Math.cos(th) * rr, Math.sin(th) * rr) : s.moveTo(Math.cos(th) * rr, Math.sin(th) * rr);
  }
  const geo = new ExtrudeGeometry(s, {
    depth: 0.02,
    bevelEnabled: true,
    bevelSize: 0.03,
    bevelThickness: 0.015,
    bevelSegments: 2,
  });
  geo.rotateX(-Math.PI / 2);
  // (its uvs over its face)
  const p = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + p.getX(i) / (r * 3), 0.5 + p.getZ(i) / (r * 3));
  return new Mesh(
    geo,
    mat(
      "ice",
      () =>
        new MeshStandardMaterial({
          map: iceTex,
          roughness: 0.05,
          metalness: 0.4,
          transparent: true,
          opacity: 0.9,
          polygonOffset: true,
          polygonOffsetFactor: -8,
        }),
    ),
  );
}

/** The fax bomb: a beige 80s fax — its keypad, its handset, the paper curling out, a red light
 *  blinking (named "led"). */
export function fax3d(): Group {
  const g = new Group();
  const beige = std("#d9cfb8", { rough: 0.65 });
  const darkM = std("#3a3a3e", { rough: 0.6 });
  const body = new Mesh(new RoundedBoxGeometry(0.62, 0.2, 0.46, 2, 0.04), beige);
  body.position.y = 0.1;
  body.castShadow = true;
  g.add(body);
  const deck = new Mesh(new RoundedBoxGeometry(0.3, 0.05, 0.3, 1, 0.015), darkM);
  deck.position.set(0.1, 0.215, 0.02);
  g.add(deck);
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 3; c++) {
      const k = new Mesh(new BoxGeometry(0.05, 0.02, 0.05), std("#e8e2d2"));
      k.position.set(0.02 + c * 0.07, 0.25, -0.08 + r * 0.06);
      g.add(k);
    }
  // the handset on its cradle along the side
  const hs = new Mesh(new RoundedBoxGeometry(0.08, 0.07, 0.42, 2, 0.03), darkM);
  hs.position.set(-0.22, 0.24, 0);
  g.add(hs);
  for (const z of [-0.18, 0.18]) {
    const cup = new Mesh(new CylinderGeometry(0.05, 0.05, 0.05, 10), darkM);
    cup.position.set(-0.22, 0.26, z);
    g.add(cup);
  }
  // the paper curling out of its back
  const paper = new Mesh(
    new CylinderGeometry(0.16, 0.16, 0.3, 14, 1, true, 0, Math.PI),
    std("#ffffff", { rough: 0.9 }),
  );
  (paper.material as MeshStandardMaterial).side = DoubleSide;
  paper.rotation.set(0, 0, Math.PI / 2);
  paper.position.set(0.18, 0.26, -0.24);
  g.add(paper);
  const led = new Mesh(new SphereGeometry(0.03, 8, 6), glow("#ff3020"));
  led.name = "led";
  led.position.set(0.25, 0.24, 0.2);
  g.add(led);
  return g;
}

/** Vortex's drone: a dark pod, his amber eye in a ring, four arms to motor pods with blurred
 *  rotors (named "rotor"), an antenna, the claw underneath. */
export function drone3d(): Group {
  const g = new Group();
  const shell = std("#26282c", { rough: 0.35, metal: 0.4 });
  const pod = new Mesh(new SphereGeometry(0.3, 16, 10).scale(1.3, 0.62, 1), shell);
  pod.castShadow = true;
  g.add(pod);
  const ring = new Mesh(
    new TorusGeometry(0.1, 0.025, 6, 18).rotateY(Math.PI / 2),
    std("#c9cfd4", { metal: 0.8, rough: 0.2 }),
  );
  ring.position.x = 0.36;
  g.add(ring);
  const eye = new Mesh(new SphereGeometry(0.085, 12, 8), glow("#ffb347"));
  eye.position.x = 0.36;
  g.add(eye);
  for (const [dx, dz] of [
    [0.42, 0.42],
    [0.42, -0.42],
    [-0.42, 0.42],
    [-0.42, -0.42],
  ]) {
    const arm = new Mesh(new BoxGeometry(0.56, 0.04, 0.05), shell);
    arm.position.set(dx / 2, 0.04, dz / 2);
    arm.rotation.y = Math.atan2(-dz, dx);
    g.add(arm);
    const motor = new Mesh(new CylinderGeometry(0.05, 0.06, 0.09, 10), std("#b5562f", { rough: 0.4 }));
    motor.position.set(dx, 0.08, dz);
    g.add(motor);
    const rotor = new Mesh(
      new CircleGeometry(0.28, 20).rotateX(-Math.PI / 2),
      mat(
        "rotor",
        () =>
          new MeshBasicMaterial({
            color: "#c9cfd4",
            transparent: true,
            opacity: 0.3,
            side: DoubleSide,
            depthWrite: false,
          }),
      ),
    );
    rotor.name = "rotor";
    rotor.position.set(dx, 0.13, dz);
    g.add(rotor);
    const blade = new Mesh(new BoxGeometry(0.5, 0.008, 0.04), std("#9aa1a7"));
    blade.name = "rotor";
    blade.position.set(dx, 0.135, dz);
    g.add(blade);
  }
  const ant = new Mesh(new CylinderGeometry(0.008, 0.008, 0.3, 5), shell);
  ant.position.set(-0.15, 0.3, 0);
  g.add(ant);
  const tip = new Mesh(new SphereGeometry(0.025, 8, 6), glow("#ff3020"));
  tip.name = "led";
  tip.position.set(-0.15, 0.46, 0);
  g.add(tip);
  // the claw: two hooked fingers under it
  for (const s of [1, -1]) {
    const f = new Mesh(new TorusGeometry(0.1, 0.018, 4, 10, Math.PI * 0.8), std("#9aa1a7", { metal: 0.7, rough: 0.3 }));
    f.rotation.set(0, (s * Math.PI) / 2, Math.PI);
    f.position.set(0, -0.26, s * 0.05);
    g.add(f);
  }
  return g;
}

/** The umbrella, held up over the driver: eight panels rust and cream, its ribs' tips, the stick. */
export function umbrella3d(): Group {
  const g = new Group();
  for (let i = 0; i < 8; i++) {
    const panel = new Mesh(
      new ConeGeometry(0.9, 0.36, 8, 1, true, (i / 8) * Math.PI * 2, Math.PI / 4),
      std(i % 2 ? "#f3ead6" : "#b5562f", { rough: 0.6 }),
    );
    (panel.material as MeshStandardMaterial).side = DoubleSide;
    panel.position.y = 0.18;
    g.add(panel);
  }
  const stick = new Mesh(new CylinderGeometry(0.015, 0.015, 1.1, 6), std("#3b2414"));
  stick.position.y = -0.36;
  g.add(stick);
  const knob = new Mesh(new SphereGeometry(0.035, 8, 6), std("#3b2414"));
  knob.position.y = 0.38;
  g.add(knob);
  return g;
}

/** The plough's blade, on a kart's nose: a curved yellow blade with black hazard stripes. */
export function plough3d(): Group {
  const g = new Group();
  const s = new Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(0.12, 0.2, 0.05, 0.42);
  s.lineTo(0.0, 0.42);
  s.quadraticCurveTo(0.06, 0.2, -0.05, 0);
  s.lineTo(0, 0);
  const geo = new ExtrudeGeometry(s, { depth: 1.5, bevelEnabled: false });
  geo.translate(0, 0, -0.75);
  const blade = new Mesh(geo, std("#e8b13a", { rough: 0.45 }));
  blade.castShadow = true;
  g.add(blade);
  for (let i = -3; i <= 3; i++) {
    const st = new Mesh(new BoxGeometry(0.02, 0.36, 0.08), std("#1a1a1e"));
    st.position.set(0.09, 0.22, i * 0.21);
    st.rotation.x = 0.5;
    g.add(st);
  }
  return g;
}
