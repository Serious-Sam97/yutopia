import { crowdDraw, type KartSeat, kartSeats } from "@yutopia/shared/kart";
import {
  BackSide,
  BoxGeometry,
  type BufferGeometry,
  CanvasTexture,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  type Material,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  Vector4,
} from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { INK } from "../../chars/ink";

// The stands' crowd (docs/plan/46-the-karts.md, "the stands"): people drawn as the game's are —
// faceted, a face, a line of ink round them — sat on the planks (shared kartSeats: the crowd's
// seats), their feet in the row's footwell. Beanies, caps or hair, scarves; children among them;
// flags, signs and cups of cocoa. All instanced, a mesh a part; one shader poses every part the
// same way from where its person sits, so the parts agree with nothing kept a person:
// - a bob, now and then, looking about, at rest;
// - excited (the race's own: the lights, the go, the flag — `cheer`; a kart going by in front of
//   them — `karts`): up off the seat, arms up (one or both, the signs overhead), bouncing;
// - their heads turned to the kart nearest (`look`).
// The kart module (kart/karts.ts) finds the group by its name and sets the uniforms a frame.

export interface CrowdUniforms {
  uTime: { value: number };
  /** the race's own excitement, 0..1 */
  uCheer: { value: number };
  /** up to four karts' x in front of the stands, and how near each is (0..1) */
  uKx: { value: Vector4 };
  uKw: { value: Vector4 };
  /** the x the heads turn to, and how much they do */
  uLook: { value: Vector2 };
}

type Kind = "legs" | "body" | "head" | "arm";

const POSE = `
uniform float uTime;
uniform float uCheer;
uniform vec4 uKx;
uniform vec4 uKw;
uniform vec2 uLook;
attribute vec4 aCrowd; // (its own hash, the arms' rest, how it cheers: 0 one arm, 1 both, 2 a sign, -)
`;

// (where its person sits: the instance's own place; the same for every part of them)
const POSE_MAIN = (kind: Kind) => `
{
  vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  float h1 = aCrowd.x;
  float ph = h1 * 40.0;
  float ex = uCheer;
  for (int k = 0; k < 4; k++) {
    float d = (ip.x - uKx[k]) / 7.0;
    ex += uKw[k] * exp(-d * d);
  }
  ex = clamp(ex * (0.65 + 0.6 * h1), 0.0, 1.0);
  float stand = smoothstep(0.45, 0.85, ex);
  // (stood up: the hips over the feet in the footwell, the thighs swung up from the knees)
  float up = stand * 0.4 + stand * max(0.0, sin(uTime * (7.0 + h1 * 4.0) + ph)) * 0.07
    + max(0.0, sin(uTime * (1.1 + h1) + ph)) * 0.02;
  ${
    kind === "head"
      ? `// turned to the kart going by, else looking about now and then
  float yaw = -clamp(atan(uLook.x - ip.x, 9.0), -1.1, 1.1) * uLook.y
    + sin(uTime * 0.35 + ph * 3.0) * 0.45 * (1.0 - uLook.y) * step(0.55, fract(h1 * 7.0));
  vec3 n = vec3(0.0, 0.56, 0.0);
  vec3 v = transformed - n;
  float c = cos(yaw), s = sin(yaw);
  transformed = n + vec3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c);`
      : ""
  }${
    kind === "arm"
      ? `// from the shoulder: resting forward on the lap, up overhead excited (one arm or both)
  float side = sign(position.x);
  float lift = smoothstep(0.3, 0.8, ex);
  float arm = aCrowd.z < 0.5 ? (side > 0.0 ? lift : lift * 0.2) : lift;
  float ax = mix(aCrowd.y, 2.85, arm) + sin(uTime * 9.0 + ph + side) * 0.18 * arm * step(aCrowd.z, 1.5);
  float az = side * 0.45 * arm * step(aCrowd.z, 1.5);
  vec3 pv = vec3(side * 0.22, 0.46, 0.0);
  vec3 v = transformed - pv;
  float c = cos(ax), s = sin(ax);
  v = vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c);
  c = cos(az); s = sin(az);
  v = vec3(v.x * c - v.y * s, v.x * s + v.y * c, v.z);
  transformed = pv + v;`
      : ""
  }
  ${
    kind === "legs"
      ? `if (position.y > -0.02) {
    vec3 kn = vec3(0.0, 0.05, -0.4);
    vec3 v = transformed - kn;
    float a = -stand * 1.5708;
    float c = cos(a), s = sin(a);
    transformed = kn + vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c);
  }`
      : "transformed.y += up;\n  transformed.z -= stand * 0.36;"
  }
}
`;

/** The crowd's colours: a part's material (lit as the park is), with the pose. */
function partMat(kind: Kind, o: { map?: CanvasTexture; color?: string; side?: boolean }, u: CrowdUniforms) {
  const m = new MeshStandardMaterial({
    flatShading: true,
    roughness: 0.85,
    color: o.color ?? "#ffffff",
    map: o.map ?? null,
    side: o.side ? DoubleSide : undefined,
  });
  const patch = (sh: { uniforms: Record<string, unknown>; vertexShader: string }) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", `#include <common>\n${POSE}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${POSE_MAIN(kind)}`);
  };
  // (the Grounds' light goes on the park's materials and takes their hook: so the pose rides on
  // its own — light3d.ts patchGrounds; a still has it on its own)
  m.onBeforeCompile = patch;
  m.customProgramCacheKey = () => `kart-crowd-${kind}`;
  m.userData.grounds = { patch, key: `-crowd-${kind}` };
  return m;
}

/** Its line of ink: the part again from the back, pushed out in screen space (chars/ink.ts), posed. */
function inkMat(kind: Kind, u: CrowdUniforms) {
  const m = new MeshBasicMaterial({ color: "#151515", side: BackSide });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u, { inkRes: INK.res, inkPx: INK.px });
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", `#include <common>\n${POSE}\nuniform vec2 inkRes;\nuniform float inkPx;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${POSE_MAIN(kind)}`)
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
        vec3 inkN = normalize( normalMatrix * normal );
        vec2 inkDir = ( projectionMatrix * vec4( inkN, 0.0 ) ).xy;
        inkDir = length( inkDir ) > 1e-5 ? normalize( inkDir ) : vec2( 0.0 );
        gl_Position.xy += inkDir * inkPx * 0.8 * 2.0 / inkRes * gl_Position.w;`,
      );
  };
  m.customProgramCacheKey = () => `kart-crowd-ink-${kind}`;
  return m;
}

/** A part for its line: the faces welded, smooth normals (a box's corners stay closed). */
function welded(g: BufferGeometry): BufferGeometry {
  const c = g.clone();
  c.deleteAttribute("uv");
  c.deleteAttribute("normal");
  const w = mergeVertices(c, 1e-4);
  w.computeVertexNormals();
  c.dispose();
  return w;
}

const merge = (gs: BufferGeometry[]) => {
  const m = mergeGeometries(
    gs.map((g) => (g.index ? g.toNonIndexed() : g)),
    false,
  ) as BufferGeometry;
  for (const g of gs) g.dispose();
  return m;
};

// ── the parts, sat at the origin (its plank's top), facing −z ──
function torso() {
  return new CylinderGeometry(0.17, 0.21, 0.5, 6).scale(1, 1, 0.74).translate(0, 0.26, 0);
}
function legs() {
  const gs: BufferGeometry[] = [];
  for (const x of [-0.1, 0.1]) {
    gs.push(new BoxGeometry(0.15, 0.13, 0.44).translate(x, 0.05, -0.2));
    gs.push(new BoxGeometry(0.13, 0.44, 0.13).translate(x, -0.17, -0.38));
  }
  return merge(gs);
}
function shoes() {
  return merge([-0.1, 0.1].map((x) => new BoxGeometry(0.14, 0.08, 0.24).translate(x, -0.39, -0.43)));
}
function head() {
  return new IcosahedronGeometry(0.135, 1).translate(0, 0.69, 0);
}
function eyes() {
  return merge([-0.05, 0.05].map((x) => new BoxGeometry(0.028, 0.045, 0.02).translate(x, 0.7, -0.125)));
}
function beanie() {
  return merge([
    new SphereGeometry(0.148, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.705, 0),
    new BoxGeometry(0.3, 0.05, 0.3).scale(1, 1, 1).translate(0, 0.72, 0),
    new IcosahedronGeometry(0.05, 0).translate(0, 0.87, 0),
  ]);
}
function cap() {
  return merge([
    new SphereGeometry(0.145, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.72, 0),
    new BoxGeometry(0.22, 0.025, 0.16).translate(0, 0.73, -0.17),
  ]);
}
function hair() {
  return new SphereGeometry(0.143, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.62).translate(0, 0.7, 0.02);
}
function scarf() {
  return merge([
    new TorusGeometry(0.115, 0.045, 5, 10).rotateX(Math.PI / 2).translate(0, 0.53, 0),
    new BoxGeometry(0.08, 0.22, 0.04).translate(0.06, 0.42, -0.15),
  ]);
}
function arms() {
  const gs: BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    gs.push(new CapsuleGeometry(0.055, 0.34, 2, 6).translate(s * 0.22, 0.46 - 0.22, 0));
    gs.push(new IcosahedronGeometry(0.065, 0).translate(s * 0.22, 0.46 - 0.45, 0));
  }
  return merge(gs);
}
/** A flag on a stick in the right hand (posed with the arm: x > 0). */
function flag() {
  return merge([
    new CylinderGeometry(0.012, 0.012, 0.7, 4).translate(0.22, 0.46 - 0.75, 0),
    new PlaneGeometry(0.32, 0.22).translate(0.38, 0.46 - 1.0, 0),
  ]);
}
/** A sign held in both hands (posed with the arms: x 0), its words from the atlas's quarter `k`. */
function sign(k: number) {
  const g = new PlaneGeometry(0.72, 0.36).translate(0, 0.46 - 0.62, 0);
  const uv = g.attributes.uv;
  const [u0, v0] = [(k % 2) * 0.5, k < 2 ? 0.5 : 0];
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * 0.5, v0 + uv.getY(i) * 0.5);
  return g;
}
function cup() {
  return new CylinderGeometry(0.045, 0.038, 0.11, 7).translate(0, 0.16, -0.24);
}
function signAtlas(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 512;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  const words = [
    { t: "GO GO GO!", bg: "#f3ead6", fg: "#b5562f" },
    { t: "BEAT VORTEX", bg: "#151515", fg: "#e8a33d" },
    { t: "♥ YUTOPIA", bg: "#2f4a3b", fg: "#f3ead6" },
    { t: "FASTER!", bg: "#e8a33d", fg: "#151515" },
  ];
  words.forEach((w, k) => {
    const x = (k % 2) * 512;
    const y = k < 2 ? 0 : 256;
    g.fillStyle = w.bg;
    g.fillRect(x, y, 512, 256);
    g.strokeStyle = "#151515";
    g.lineWidth = 10;
    g.strokeRect(x + 5, y + 5, 502, 246);
    g.fillStyle = w.fg;
    g.font = "bold 92px Georgia, 'Times New Roman', serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(w.t, x + 256, y + 132, 470);
  });
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

const SHIRTS = [
  "#6b2430",
  "#2f4a3b",
  "#3d4a5c",
  "#b5562f",
  "#e8a33d",
  "#4a5a73",
  "#8b8f93",
  "#cdbf9f",
  "#20262c",
  "#7a3b5a",
];
const PANTS = ["#2b2f36", "#3d4a5c", "#4a3a2a", "#1d2228", "#5a5f66"];
const SKINS = ["#f1c8a4", "#d9a07a", "#b3774d", "#8a5634", "#5f3a22", "#f6d9bf"];
const HAIRS = ["#2a1d14", "#5a3a20", "#c99a5a", "#1a1a1a", "#8a4a2a", "#d8d2c4"];
const WOOL = ["#b5562f", "#e8a33d", "#2f4a3b", "#f3ead6", "#6b2430", "#3d4a5c"];
const FLAGS = ["#b5562f", "#e8a33d", "#2f4a3b", "#f3ead6"];

/** The stands' crowd: the group (named `kart-crowd`, its uniforms in `userData.crowd`), lit as the
 *  park; `padY` the pad's height under a place, `share` the seats taken (the game's: KART_CROWD,
 *  the seats nobody else may sit on). */
export function crowd3d(
  padY: (x: number, z: number) => number,
  keep: <T extends { dispose(): void }>(d: T) => T,
  share: number,
) {
  const u: CrowdUniforms = {
    uTime: { value: 0 },
    uCheer: { value: 0 },
    uKx: { value: new Vector4(-1e4, -1e4, -1e4, -1e4) },
    uKw: { value: new Vector4() },
    uLook: { value: new Vector2() },
  };
  const g = new Group();
  g.name = "kart-crowd";
  g.userData.crowd = u;
  // who sits where, and how they're dressed (from the seat: the same every time)
  const people = kartSeats()
    .filter((s): s is KartSeat & { stand: number } => s.stand !== undefined && crowdDraw(s.x, s.row ?? 0) <= share)
    .map((s) => {
      let h = Math.sin(s.x * 12.9898 + (s.row ?? 0) * 78.233) * 43758.5453;
      const r = () => {
        h = (h * 9301 + 49297) % 233280;
        return Math.abs(h) / 233280;
      };
      const hash = r();
      const kid = r() < 0.18;
      const top = r();
      const prop = r();
      return {
        s,
        hash,
        kid,
        shirt: SHIRTS[Math.floor(r() * SHIRTS.length)],
        pants: PANTS[Math.floor(r() * PANTS.length)],
        skin: SKINS[Math.floor(r() * SKINS.length)],
        hat: top < 0.38 ? "beanie" : top < 0.55 ? "cap" : "hair",
        hatC: top < 0.55 ? WOOL[Math.floor(r() * WOOL.length)] : HAIRS[Math.floor(r() * HAIRS.length)],
        scarf: r() < 0.4 ? WOOL[Math.floor(r() * WOOL.length)] : null,
        prop: prop < 0.14 ? "flag" : prop < 0.22 ? `sign${Math.floor(r() * 4)}` : prop < 0.32 ? "cup" : "",
        flagC: FLAGS[Math.floor(r() * FLAGS.length)],
        both: r() < 0.45,
      };
    });
  type P = (typeof people)[number];
  const m4 = new Matrix4();
  const col = new Color();
  const atlas = keep(signAtlas());
  // a part: its mesh over who has it, coloured by them, its line too (`ink`)
  const part = (
    geo: BufferGeometry,
    kind: Kind,
    who: P[],
    colour: ((p: P) => string) | string,
    o: { ink?: boolean; map?: CanvasTexture; side?: boolean; shadow?: boolean } = {},
  ) => {
    if (!who.length) {
      geo.dispose();
      return;
    }
    const meshes: [BufferGeometry, Material][] = [
      [
        geo,
        keep(partMat(kind, { color: typeof colour === "string" ? colour : undefined, map: o.map, side: o.side }, u)),
      ],
    ];
    if (o.ink) meshes.push([welded(geo), keep(inkMat(kind, u))]);
    for (const [gg, mat] of meshes) {
      keep(gg);
      const a = new Float32Array(who.length * 4);
      who.forEach((p, i) => {
        a.set(
          [
            p.hash,
            p.prop === "flag" ? 1.25 : p.prop.startsWith("sign") ? 0.95 : 0.7,
            p.prop.startsWith("sign") ? 2 : p.both ? 1 : 0,
            0,
          ],
          i * 4,
        );
      });
      gg.setAttribute("aCrowd", new InstancedBufferAttribute(a, 4));
      const im = new InstancedMesh(gg, mat, who.length);
      who.forEach((p, i) => {
        const k = p.kid ? 0.76 : 1;
        m4.makeScale(k, k, k).setPosition(p.s.x, padY(p.s.x, p.s.z) + p.s.top, p.s.z);
        im.setMatrixAt(i, m4);
        if (typeof colour !== "string") im.setColorAt(i, col.set(colour(p)));
      });
      im.castShadow = !!o.shadow && mat instanceof MeshStandardMaterial;
      im.receiveShadow = mat instanceof MeshStandardMaterial;
      im.frustumCulled = false;
      g.add(im);
    }
  };
  part(torso(), "body", people, (p) => p.shirt, { ink: true, shadow: true });
  part(legs(), "legs", people, (p) => p.pants, { ink: true });
  part(shoes(), "legs", people, "#2a2420");
  part(head(), "head", people, (p) => p.skin, { ink: true, shadow: true });
  part(eyes(), "head", people, "#1a1410");
  part(arms(), "arm", people, (p) => p.shirt, { ink: true, shadow: true });
  part(
    beanie(),
    "head",
    people.filter((p) => p.hat === "beanie"),
    (p) => p.hatC,
    { ink: true },
  );
  part(
    cap(),
    "head",
    people.filter((p) => p.hat === "cap"),
    (p) => p.hatC,
    { ink: true },
  );
  part(
    hair(),
    "head",
    people.filter((p) => p.hat === "hair"),
    (p) => p.hatC,
    { ink: true },
  );
  part(
    scarf(),
    "body",
    people.filter((p) => p.scarf),
    (p) => p.scarf as string,
    { ink: true },
  );
  part(
    flag(),
    "arm",
    people.filter((p) => p.prop === "flag"),
    (p) => p.flagC,
    { side: true },
  );
  for (let k = 0; k < 4; k++)
    part(
      sign(k),
      "arm",
      people.filter((p) => p.prop === `sign${k}`),
      "#ffffff",
      { map: atlas, side: true },
    );
  part(
    cup(),
    "body",
    people.filter((p) => p.prop === "cup"),
    "#f3ead6",
    { ink: true },
  );
  // (its clock: ticked as it's drawn)
  const first = g.children[0] as InstancedMesh | undefined;
  if (first)
    first.onBeforeRender = () => {
      u.uTime.value = performance.now() / 1000;
    };
  return g;
}
