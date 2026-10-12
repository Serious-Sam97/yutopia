import type { AvatarLayers } from "@yutopia/shared";
import { stillPose, walkPose } from "./avatar-motion";
import {
  type Box,
  capsule,
  capsuleSides,
  composeSvg,
  type Face,
  type Joints,
  type PartArt,
  type PartName,
  type Pose,
  type Pt,
  type Rig,
} from "./avatar-rig";
import { svgDoc } from "./svgdoc";
import {
  backpack,
  bottomLeg,
  bottomSide,
  earrings,
  eyewear,
  headThing,
  JACKET_CUT,
  LONGSKIRT_FRONT,
  LONGSKIRT_SHADE,
  LONGSKIRT_SIDE,
  neckThing,
  type Paint,
  SHORT_SLEEVES,
  SLEEVELESS,
  shoeLapSide,
  shoeSide,
  shoesFront,
  shoesLap,
  TANK_BACK,
  TANK_FRONT,
  TANK_SIDE,
  topBack,
  topFront,
  topSide,
  turtleneck,
  watch,
} from "./wardrobe";

// Yutopia people in the style each person picks (`style`, docs/art-style.md).
// City-pop 80s anime (default): about 5½ heads
// tall, flat fills with hard violet shade shapes, gradient hair with a highlight
// band, big glossy eyes, and a rim light down the edges — warm and sky blue by
// day, neon pink and cyan at night. Five drawn views — S (front), SW (¾ front),
// W (side), NW (¾ back), N (back); the other three facings are mirrors.
//
// The figure is drawn on a 120×180 board (feet on y = 168) and placed into the
// 64×100 box the engine and the HUD expect (feet on y = 96). It's drawn as a
// rig (avatar-rig.ts): parts with joints, posed by the world every frame;
// `avatarSvg` composes them into one still drawing (portraits, previews).
//
// Ligne claire paints the same figure and poses differently: one even black
// line, flat colours, dot eyes and a nose hook — no violet shade, no rim light.

// Marks the people chunk for `pnpm budget` (art/people.ts loads it on demand).
export const PEOPLE_CHUNK = "yutopia-people";

export type View = "S" | "SW" | "W" | "NW" | "N";
export type Rim = "day" | "night";

const INK = "#2a1430";
const LIGNE_INK = "#151515";
// the paint of the drawing being made (set at the top of rigFor(); drawing is synchronous)
let ligne = false;
let ink = INK;
const SHOE = "#fff4ea";
const RIMS: Record<Rim, [string, string]> = { day: ["#ffc070", "#a8dcff"], night: ["#ff5fa8", "#5ff0ff"] };
// board → texture box: feet (60, 168) land on (32, 96)
export const FIT = 0.585;
const FIT_X = 32 - 60 * FIT;
const FIT_Y = 96 - 168 * FIT;
export const SIT_DROP = 12; // seated poses sit this much lower on the board so the hips meet the seat

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}
function rgb(h: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
  const n = m ? Number.parseInt(m[1], 16) : 0x888888;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function mix(a: string, b: string, t: number): string {
  const A = rgb(a);
  const B = rgb(b);
  return `#${A.map((v, i) =>
    Math.round(v + (B[i] - v) * t)
      .toString(16)
      .padStart(2, "0"),
  ).join("")}`;
}
// hard shadows lean violet; Ligne claire just uses a darker flat tone
const shade = (c: string) => (ligne ? mix(c, "#000000", 0.22) : mix(c, "#2a1a5e", 0.45));
const light = (c: string) => mix(c, "#fff4e6", 0.4);
const lum = (c: string) => {
  const [r, g, b] = rgb(c);
  return (r * 0.3 + g * 0.59 + b * 0.11) / 255;
};

// A still drawing: the rig at rest, or (frame 1–7) a step of the walk —
// what the editor's turntable and the lobby show.
export function avatarSvg(
  a: AvatarLayers,
  view: View,
  frame: number,
  sitting: boolean,
  px = 2,
  rim: Rim = "day",
): string {
  const rig = avatarRig(a, view, sitting, rim);
  const pose = sitting || !frame ? stillPose(rig) : walkPose(rig, (frame % 8) / 8, 1);
  const shadow =
    rig.back && sitting
      ? ""
      : `<ellipse cx="60" cy="${sitting ? (rig.side ? 134 : 131) : 168}" rx="${rig.side ? 16 : 20}" ry="4" fill="#000" opacity=".35"/>`;
  const body = `${shadow}<g transform="translate(60 0) scale(${rig.squash} 1) translate(-60 0)">${composeSvg(rig, pose)}</g>`;
  const y = FIT_Y + (sitting ? SIT_DROP * FIT : 0);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${64 * px}" height="${100 * px}" viewBox="0 0 64 100"><g transform="translate(${FIT_X.toFixed(2)} ${y.toFixed(2)}) scale(${FIT})">${body}</g></svg>`;
}

// A part as its own SVG document (the box it's cropped to, `px` per board unit).
export const partSvg = svgDoc;

const rigs = new Map<string, AvatarRig>();
export type AvatarRig = Rig & { squash: number; id: string };

// The rig for a look, a view and seated or not (cached: building it is all
// string work).
export function avatarRig(a: AvatarLayers, view: View, sit: boolean, rim: Rim = "day"): AvatarRig {
  const key = `${JSON.stringify(a)}|${view}|${sit ? 1 : 0}|${rim}`;
  let r = rigs.get(key);
  if (!r) {
    r = rigFor(a, view, sit, rim);
    rigs.set(key, r);
    if (rigs.size > 400) rigs.delete(rigs.keys().next().value as string);
  }
  return r;
}

// boxes the parts are cropped to (board units, generous: any look fits)
const BOX: Record<string, Box> = {
  hairBack: [22, 0, 76, 92],
  head: [22, -2, 76, 90],
  torso: [26, 40, 68, 96],
  armLu: [26, 50, 34, 50],
  armLf: [24, 76, 32, 44],
  armRu: [60, 50, 34, 50],
  armRf: [64, 76, 32, 44],
  legL: [34, 94, 30, 80],
  legR: [56, 94, 30, 80],
  lap: [34, 92, 52, 42],
  sideArmU: [46, 50, 30, 50],
  sideArmF: [44, 74, 30, 46],
  thigh: [42, 92, 36, 48],
  shin: [40, 122, 34, 52],
  sideLap: [20, 90, 48, 50],
};

function rigFor(a: AvatarLayers, view: View, sit: boolean, rimMode: Rim): AvatarRig {
  ligne = a.style === "ligne";
  ink = ligne ? LIGNE_INK : INK;
  const id = `a${hash(`${JSON.stringify(a)}|${view}|${sit}|${rimMode}`)}`;
  const back = view === "N" || view === "NW";
  const nw = view === "NW";
  const tq = view === "SW";
  const side = view === "W";
  const backSit = back && sit;

  const O = (w = 1) =>
    `stroke="${ink}" stroke-width="${ligne ? w * 1.15 : w}" stroke-linejoin="round" stroke-linecap="round"`;
  const fill = (d: string, c: string, w?: number) => `<path d="${d}" fill="${c}" ${O(w)}/>`;
  // shade shapes and rim light belong to City-pop only
  const flat = (d: string, c: string, op = 1) => (ligne ? "" : `<path d="${d}" fill="${c}" opacity="${op}"/>`);
  const rim = (d: string, c: string) =>
    ligne
      ? ""
      : `<path d="${d}" stroke="${c}" stroke-width="1.1" stroke-opacity=".8" fill="none" stroke-linecap="round"/>`;
  const [R1, R2] = RIMS[rimMode];

  const skin = a.skin;
  const sS = mix(skin, "#8a3a7a", 0.38);
  const hair = a.hairColor;
  const hS = shade(hair);
  const hH = ligne ? hair : light(hair);
  const top = a.topColor;
  const tS = shade(top);
  const dress = a.top === "dress";
  const bot = dress ? top : a.bottomColor;
  const bS = shade(bot);
  const acc = a.accessoryColor;
  const eye = mix(mix(hair, "#000000", 0.3), "#6a3a9a", 0.45);
  const inner = lum(top) > 0.62 ? "#2a2a3a" : "#f4ece0";
  const bw = ({ slim: 0.9, regular: 1, broad: 1.12 } as Record<string, number>)[a.body] ?? 1;
  const longSkirt = a.bottom === "longskirt" && !dress;
  const skirtish = a.bottom === "skirt" || longSkirt || dress;
  // gender shapes the body and face only — hair, clothes and size stay free
  const fem = a.gender === "feminine";
  const masc = a.gender === "masculine";
  const shorts = a.bottom === "shorts" && !dress;
  const legBare = skirtish; // tights are just skin here
  const jacket = JACKET_CUT.has(a.top); // the jacket's cut (a blazer too)
  const short = SHORT_SLEEVES.has(a.top);
  const bare = SLEEVELESS.has(a.top); // a tank: bare arms and shoulders
  const tank = a.top === "tank";
  const shoeC = a.shoesColor || SHOE;
  const ec = a.extraColor;
  const hat = ["cap", "beanie", "beret", "bucket"].includes(a.accessory);
  const earsShow = !(a.hair === "bob" || a.hair === "long" || a.hair === "curly");
  const closeCrop = a.hair === "buzz" || a.hair === "bald" || a.hair === "mohawk"; // hats sit on the skull
  const H = ligne ? hair : `url(#${id}h)`;
  const defs = `<defs><linearGradient id="${id}h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${hH}"/><stop offset=".35" stop-color="${hair}"/><stop offset="1" stop-color="${hS}"/></linearGradient></defs>`;
  const widen = (g: string) =>
    bw === 1 ? g : `<g transform="translate(60 0) scale(${bw} 1) translate(-60 0)">${g}</g>`;
  const wx = (x: number) => 60 + (x - 60) * bw;
  // a limb's shade: a slimmer copy along its lit-away side (+x)
  const limbShade = (x0: number, y0: number, x1: number, y1: number, r0: number, r1: number, c: string) =>
    flat(capsule(x0 + r0 * 0.42, y0, x1 + r1 * 0.42, y1, r0 * 0.5, r1 * 0.5), c, 0.85);
  const hand = (x: number, y: number, c = skin) => `<ellipse cx="${x}" cy="${y}" rx="3" ry="3.9" fill="${c}" ${O()}/>`;
  // the lower segment of a joint (forearm, shin): its round top covers the
  // joint with no outline across the limb; only its sides are outlined
  const lower = (x0: number, y0: number, x1: number, y1: number, r0: number, r1: number, c: string) =>
    `<path d="${capsule(x0, y0, x1, y1, r0, r1)}" fill="${c}"/><path d="${capsuleSides(x0, y0, x1, y1, r0, r1)}" fill="none" ${O()}/>`;
  const P: Paint = { fill, flat, shade, light, ink, O };

  const parts: PartArt[] = [];
  const add = (name: PartName, svg: string, box: Box) => parts.push({ name, svg, box });
  let joints: Joints;
  let heads: Record<Face, string>;
  let headBox: Box = BOX.head;

  // ── side view (W, facing left; E is the mirror) ───────────────────────────
  if (side) {
    const SH: Pt = [60, 62];
    const EL: Pt = [59.2, 85.5];
    const WR: Pt = [59.4, 103];
    const HIP: Pt = [60.2, 104];
    const KNEE: Pt = [60.2, 132];
    // the far arm and leg a little behind the near ones, so both read
    const FAR = 1.8;
    const far = (p: Pt): Pt => [p[0] + FAR, p[1]];
    const back1 = (g: string) => `<g transform="translate(${FAR} 0)">${g}</g>`;
    joints = {
      hip: HIP,
      hipL: far(HIP),
      hipR: HIP,
      kneeL: far(KNEE),
      kneeR: KNEE,
      shL: far(SH),
      elL: far(EL),
      shR: SH,
      elR: EL,
      hand: [59.3, 107],
      handL: [59.3, 107],
      neck: [61, 50],
      mouth: [53.6, 45],
    };
    add("hairBack", defs + hairBehind(a.hair, "W", H, hH, fill), BOX.hairBack);
    // a leg: the thigh, then the shin (and shoe) over the knee
    const leg = (near: boolean) => {
      const c = legBare ? skin : bot;
      const tone = (x: string) => (near ? x : shade(x));
      let thigh: string;
      if (skirtish) thigh = fill(capsule(60, 112, 60.1, 132.3, 4.4, 4.1), tone(skin));
      else if (shorts)
        thigh =
          fill(capsule(60.25, 102, 60.2, 132.3, 6.2, 5.35), tone(skin)) +
          fill("M54 102 L55 128 L65.5 128 L66.5 102Z", tone(bot));
      else thigh = fill(capsule(60.25, 102, 60.2, 132.3, 6.2, 5.35), tone(bot));
      if (!skirtish && !shorts) thigh += bottomSide(P, a.bottom, tone(bot), "thigh");
      if (near && !skirtish) thigh += rim("M66.2 104 L65.6 130", R2);
      let shin = skirtish
        ? lower(60.1, 132.3, 60, 158, 4.1, 3.5, tone(skin))
        : lower(60.2, 132.3, 60, 158, 5.35, 4.5, tone(shorts ? skin : c));
      if (!skirtish && !shorts) shin += bottomSide(P, a.bottom, tone(bot), "shin");
      shin += shoeSide(P, a.shoes, tone(shoeC), tone(skin), tone(top));
      if (near && !skirtish) shin += rim("M65.4 134 L64.4 157", R2);
      return [shin, thigh];
    };
    if (sit) {
      const shin = legBare || shorts ? skin : bot;
      let lap = fill("M32.5 106 L33.5 128 L41.5 128 L42 107Z", shin);
      lap += shoeLapSide(P, a.shoes, shoeC, skin);
      lap += fill("M57 97 L36 98.5 Q31.5 99 31.5 105 Q31.5 112 37 112 L60 112Z", bot);
      lap += flat("M36 107.5 L60 107.5 L60 112 L37 112 Q33 111.6 32 108Z", bS, 0.8);
      add("lap", widen(lap), BOX.sideLap);
    } else {
      // far arm, a shade darker
      const fc = short || bare ? sS : tS;
      let fu = fill(capsule(SH[0], SH[1], EL[0], EL[1], 4.6, 4.1), fc);
      if (short) fu += fill("M55.5 60 Q52.5 70 53.4 79 L63.8 79 Q64.5 70 64.5 62Z", tS);
      add("armLu", widen(back1(fu)), BOX.sideArmU);
      add("armLf", widen(back1(lower(EL[0], EL[1], WR[0], WR[1], 4.1, 3.6, fc) + hand(59.3, 107, sS))), BOX.sideArmF);
      const [fs, ft] = leg(false);
      const [ns, nt] = leg(true);
      add("thighL", widen(back1(ft)), BOX.thigh);
      add("shinL", widen(back1(fs)), BOX.shin);
      add("thighR", widen(nt), BOX.thigh);
      add("shinR", widen(ns), BOX.shin);
    }
    const sideTorso = fem
      ? "M49 60 Q53 55 61 55 Q69 55.5 71 60 Q72.5 73 69.5 84 Q72.5 94 72 104 Q60 108.5 48 104 Q48.5 94 50 84 Q47.5 72 49 60Z"
      : masc
        ? "M47.5 59.5 Q52 54.2 61 54.2 Q70.5 54.6 73 59.5 L72.5 104 Q60 108.5 47.5 104Z"
        : jacket
          ? "M47.5 60 Q52 54.5 61 54.5 Q70 55 72.5 60 L72 104 Q60 108 47.5 104Z"
          : "M49 60 Q53 55 61 55 Q69 55.5 71 60 L72 104 Q60 108.5 48 104Z";
    let torso = "";
    if (a.extra === "backpack") torso += backpack(P, ec, "side", true);
    if (skirtish && !sit)
      torso +=
        fill(
          dress
            ? "M48.5 98 L44 126 Q59 129.5 74 126 L71.5 98Z"
            : longSkirt
              ? LONGSKIRT_SIDE
              : "M50.5 100 L46.5 124 Q59 127.5 72 124 L69.5 100Z",
          bot,
        ) +
        flat(
          longSkirt ? "M62 100 L69.5 100 L75 154 Q68 156 62 156.4Z" : "M62 100 L71.5 99 L74 125.5 Q68 127 62 127.5Z",
          bS,
        );
    // a tank top: the body under it is skin
    if (tank) torso += fill(sideTorso, skin);
    const sideShape = tank ? TANK_SIDE : sideTorso;
    torso += `<clipPath id="${id}s"><path d="${sideShape}"/></clipPath>${fill(sideShape, top)}`;
    torso += `<g clip-path="url(#${id}s)">${flat("M63 54 Q70 54.6 73 60 L73 104 Q67 106 63 106.6Z", tS)}</g>`;
    if (a.top === "jacket")
      torso +=
        fill("M50 58.5 L55 58 L54 75 L50.3 70Z", inner, 0.8) +
        `<path d="M54 60 L55 86" stroke="${tS}" stroke-width="1"/>`;
    else if (topSide(P, a.top, top, inner)) torso += topSide(P, a.top, top, inner);
    else if (a.top === "shirt")
      torso +=
        fill("M49.5 57 L56 56 L55 63Z", light(top), 0.8) +
        `<path d="M51 62 L51.6 100" stroke="${tS}" stroke-width=".8"/>`;
    else if (a.top === "hoodie")
      torso +=
        fill("M60 54.5 Q70 53 72 60 Q68 64 63 62Z", tS, 0.9) +
        `<path d="M52 59 L51.6 70" stroke="${light(top)}" stroke-width=".9"/>`;
    else if (!dress) torso += fill("M48 99 Q60 102.5 72 99 L72 105 Q60 108.5 48 105Z", top, 0.8);
    torso += rim(jacket ? "M71.8 60 L71.6 102" : "M71 60 L71.6 102", R2);
    torso = widen(torso);
    if (a.extra === "walkman")
      torso += `<rect x="64" y="${sit ? 92 : 94}" width="7" height="9" rx="1.4" fill="${ec}" ${O(0.9)}/><path d="M67 ${sit ? 92 : 94} Q71 70 64.5 40" stroke="${ink}" stroke-width=".8" fill="none"/>`;
    torso +=
      fill(masc ? "M57 45 L57 57 Q61 59.4 65.2 57 L65.2 45Z" : "M57.5 45 L57.5 57 Q61 59 64.5 57 L64.5 45Z", skin) +
      flat("M57.5 47 L64.5 47 L64.5 52 Q61 53 57.5 50Z", sS);
    if (a.top === "turtleneck") torso += turtleneck(P, top, "side");
    torso += neckThing(P, a.extra, ec, "side", 60);
    if (a.extra === "backpack") torso += backpack(P, ec, "side", false);
    add("torso", torso, BOX.torso);
    // near arm
    const nc = short || bare ? skin : top;
    let nu = fill(capsule(SH[0], SH[1], EL[0], EL[1], 4.6, 4.1), nc);
    nu += limbShade(SH[0], SH[1], EL[0], EL[1], 4.6, 4.1, short || bare ? sS : tS);
    if (short) nu += fill("M55.5 60 Q52.5 70 53.4 79 L63.8 79 Q64.5 70 64.5 62Z", top);
    add("armRu", widen(nu), BOX.sideArmU);
    let nf = lower(EL[0], EL[1], WR[0], WR[1], 4.1, 3.6, nc);
    nf += limbShade(EL[0], EL[1], WR[0], WR[1], 4.1, 3.6, short || bare ? sS : tS);
    if (jacket) nf += `<path d="M55.6 99.5 L63.2 99.7" stroke="${tS}" stroke-width="1.2"/>`;
    if (a.extra === "watch") nf += watch(P, ec, WR[0], WR[1]);
    nf += hand(59.3, 107);
    add("armRf", widen(nf), BOX.sideArmF);
    // the head (profile)
    const head = (face: Face) => {
      let S = fill(
        "M50.5 32 Q50.5 21 61 21 Q72 21 72 33 Q72 44 65 48.5 Q61 50.5 57.5 48.5 L55.5 46 Q52.5 46 52.6 43.6 L52 41.6 Q50.4 41 51 39.6 L51.4 38.4 Q48.4 37.6 50.5 32Z",
        skin,
      );
      S += flat("M66 24 Q72 28 72 33 Q72 44 65 48.5 Q69 38 66 24Z", sS, 0.9);
      if (!(a.hair === "bob" || a.hair === "long" || a.hair === "curly"))
        S += `<ellipse cx="63.5" cy="37" rx="2.2" ry="3" fill="${skin}" ${O(0.9)}/>`;
      if (ligne) {
        S +=
          face === "blink"
            ? `<path d="M53 37.6 h2.8" stroke="${ink}" stroke-width="1" stroke-linecap="round"/>`
            : `<circle cx="54.4" cy="37.4" r="1.3" fill="${ink}"/>`;
        S += `<path d="M52 32.4 Q54.2 31.6 56.4 32.6" stroke="${ink}" stroke-width=".9" fill="none" stroke-linecap="round"/>`;
        S +=
          face === "talk"
            ? `<path d="M52.6 44.2 Q54 44 55 44.4 Q54.6 46.6 53.6 46.6 Q52.8 46.4 52.6 44.2Z" fill="${ink}"/>`
            : `<path d="M52.6 44.6 Q53.8 45.2 55 44.8" stroke="${ink}" stroke-width=".9" fill="none" stroke-linecap="round"/>`;
      } else {
        S += `<path d="M51.6 34.4 Q54 32.8 56.4 34.8" stroke="${ink}" stroke-width="1.7" fill="none" stroke-linecap="round"/>`;
        S +=
          face === "blink"
            ? `<path d="M52 38 Q54.2 39.8 56.2 38.2" stroke="${ink}" stroke-width="1.4" fill="none" stroke-linecap="round"/>`
            : `<ellipse cx="54.2" cy="37.8" rx="1.6" ry="3.2" fill="${eye}"/><ellipse cx="54.2" cy="39.2" rx="1.1" ry="1.4" fill="${mix(eye, "#ffc0e0", 0.55)}"/><ellipse cx="54" cy="37" rx=".8" ry="1.4" fill="#1a0a20"/><circle cx="54.7" cy="36.4" r=".75" fill="#fff"/>`;
        S += `<path d="M51.5 31 L56 30.2" stroke="${hS}" stroke-width="${masc ? 1.8 : 1}" stroke-linecap="round"/>`;
        if (fem) S += `<path d="M51.6 34.4 l-1.6 -1.1" stroke="${ink}" stroke-width="1.2" stroke-linecap="round"/>`;
        S +=
          face === "talk"
            ? `<path d="M52.4 44 Q53.8 43.6 55.2 44.2 Q54.8 47.2 53.6 47.2 Q52.6 47 52.4 44Z" fill="#7a2040" ${O(0.7)}/>`
            : `<path d="M52.4 44.4 Q53.8 45.8 55 44.8" stroke="#b03050" stroke-width="1" fill="none" stroke-linecap="round"/>`;
        S += `<path d="M55.5 41 l2.4 -.9 M56.5 42 l2.4 -.9" stroke="#ff8aa0" stroke-width=".6"/>`;
      }
      if (a.extra === "earrings" && earsShow) S += earrings(ec, [[63.6, 40.8]]);
      S += hairFront(a.hair, "W", H, hH, hair, fill);
      S += eyewear(P, a.eyewear, a.eyewearColor, "side", 0);
      S += accessory(a.accessory, "W", acc, fill, O) + headThing(P, a.accessory, acc, "side", closeCrop);
      if (!hat) S += rim("M50.8 31 Q51 23 57 21.4", R1);
      return defs + S;
    };
    heads = { open: head("open"), blink: head("blink"), talk: head("talk") };
    const order: PartName[] = sit
      ? ["hairBack", "lap", "torso", "armRu", "armRf", "head"]
      : ["hairBack", "armLu", "armLf", "thighL", "shinL", "thighR", "shinR", "torso", "armRu", "armRf", "head"];
    return finish(parts, order, heads, headBox, joints, { side, sit, back, quarter: false, squash: 1, id });
  }

  // ── front and back views ──────────────────────────────────────────────────
  const fx = tq ? -4.2 : 0; // features lean towards the facing
  // turned ¾ (SW, NW), the far arm and leg tuck in behind the body, a shade
  // darker: SW turns its screen-left side away, NW its screen-right side
  const farSide: "L" | "R" | null = tq ? "L" : nw ? "R" : null;
  const FAR_ARM = 3.4;
  const FAR_LEG = 1.8;
  add("hairBack", defs + hairBehind(a.hair, back ? "N" : "S", back ? H : hS, hH, fill), BOX.hairBack);

  // legs
  if (sit) {
    if (!back) {
      const shin = legBare || shorts ? skin : bot;
      let L = fill("M47 110 L47.5 123 L55 123 L56 111Z", shin) + fill("M64 111 L65 123 L72.5 123 L73 110Z", shin);
      L += flat("M69 111 L73 110 L72.5 123 L70 123Z", shade(shin), 0.8);
      L += shoesLap(P, a.shoes, shoeC, skin);
      L +=
        fill("M44 100 L43.5 111 Q51 114 59 112 L59.5 102Z", bot) +
        fill("M60.5 102 L61 112 Q69 114 76.5 111 L76 100Z", bot);
      L += flat("M68 102 L76 100 L76.5 111 Q72 113 68 113Z", bS, 0.9);
      add("lap", widen(L), BOX.lap);
    }
    // seen from behind, the seat and the chair back hide the legs
  } else {
    let LL = "";
    let LR = "";
    if (legBare) {
      LL += fill("M49 120 L50 160 L56 160 L57 122Z", skin);
      LR += fill("M63 122 L64 160 L70 160 L71 120Z", skin) + flat("M67 122 L71 120 L70 160 L67.5 160Z", sS, 0.8);
    } else if (shorts) {
      LL += fill("M49 126 L50 160 L56 160 L57.5 126Z", skin);
      LR += fill("M62.5 126 L64 160 L70 160 L71 126Z", skin) + flat("M67 127 L71 126 L70 160 L67.5 160Z", sS, 0.8);
      LL += fill("M46.5 102 L47 129 L58 129 L59.5 106 L60.3 106 L60.3 102Z", bot);
      LR += fill("M59.7 102 L59.7 106 L60.5 106 L62 129 L73 129 L73.5 102Z", bot);
      LR += flat("M66 104 L73.5 102 L73 129 L66.5 129Z", bS);
    } else {
      LL += fill("M47 104 L49 160 L56 160 L59.5 106Z", bot);
      LR += fill("M60.5 106 L64 160 L71 160 L73 104Z", bot);
      LR += flat("M67 106 L73 104 L71 160 L68 160Z", bS);
      LL += flat("M54 108 L59.5 106 L56 160 L54.5 160Z", bS, 0.7);
      if (a.bottom === "jeans") {
        const st = `stroke="${light(bot)}" stroke-width=".7" stroke-dasharray="1.6 1.2" opacity=".7"`;
        LL += `<path d="M51.5 110 L52.6 157" ${st}/>`;
        LR += `<path d="M66.5 110 L67.4 157" ${st}/>`;
      } else {
        LL += `<path d="M53 109 L52.6 158" stroke="${shade(bot)}" stroke-width=".8"/>`;
        LR += `<path d="M66.6 109 L67.6 158" stroke="${shade(bot)}" stroke-width=".8"/>`;
      }
      // cargo pockets, jogger cuffs
      LL += bottomLeg(P, a.bottom, bot);
      LR += `<g transform="translate(120 0) scale(-1 1)">${bottomLeg(P, a.bottom, bot)}</g>`;
    }
    LL += shoesFront(P, a.shoes, shoeC, skin, top, back, false);
    LR += shoesFront(P, a.shoes, shoeC, skin, top, back, true);
    if (!skirtish) LR += rim("M72.6 104.5 L71 158", R2);
    const farLeg = (g: string, left: boolean) =>
      farSide === (left ? "L" : "R") ? `<g transform="translate(${left ? FAR_LEG : -FAR_LEG} 0)">${g}</g>` : g;
    add("legL", widen(farLeg(LL, true)), BOX.legL);
    add("legR", widen(farLeg(LR, false)), BOX.legR);
  }

  // shoulders: narrower (feminine) or broader (masculine) — arms follow
  const ax = fem ? (jacket ? 0.8 : 1.3) : masc ? (jacket ? -1 : -1.7) : 0;
  // arms at rest (before the shoulder shift and the body's width)
  const SHL: Pt = jacket ? [44.8, 63] : [46.8, 63.5];
  const ELL: Pt = jacket ? [40.4, 88] : [41.4, 87.5];
  const WRL: Pt = jacket ? [39.6, 104] : [39.6, 104.2];
  const HDL: Pt = [39.1, 108];
  const mirror = (p: Pt): Pt => [120 - p[0], p[1]];
  const [SHR, ELR, WRR, HDR] = [SHL, ELL, WRL, HDL].map(mirror);
  const ru = jacket ? [5.4, 4.6] : [4.4, 3.8];
  const rf = jacket ? [4.6, 4.0] : [3.7, 3.1];
  // the far arm sits further in
  const axL = ax + (farSide === "L" ? FAR_ARM : 0);
  const axR = ax + (farSide === "R" ? FAR_ARM : 0);
  const atL = (p: Pt): Pt => [wx(p[0] + axL), p[1]];
  const atR = (p: Pt): Pt => [wx(p[0] - axR), p[1]];
  const legShift = (left: boolean) => (farSide === (left ? "L" : "R") ? (left ? FAR_LEG : -FAR_LEG) : 0);
  joints = {
    hip: [60, 104],
    hipL: [wx(53.3 + legShift(true)), 104],
    hipR: [wx(66.7 + legShift(false)), 104],
    kneeL: [wx(53 + legShift(true)), 132],
    kneeR: [wx(67 + legShift(false)), 132],
    shL: atL(SHL),
    elL: atL(ELL),
    shR: atR(SHR),
    elR: atR(ELR),
    hand: atR(HDR),
    handL: atL(HDL),
    neck: [60, 50],
    mouth: [60 + fx, 45.5],
  };
  const arm = (left: boolean) => {
    const [sh, el, wr, hd] = left ? [SHL, ELL, WRL, HDL] : [SHR, ELR, WRR, HDR];
    const isFar = farSide === (left ? "L" : "R");
    const dim = (c: string) => (isFar ? shade(c) : c);
    const limbColor = dim(short || bare ? skin : top);
    const limbShadeColor = short || bare ? sS : tS;
    let up = fill(capsule(sh[0], sh[1], el[0], el[1], ru[0], ru[1]), limbColor);
    if (!left && !isFar) up += limbShade(sh[0], sh[1], el[0], el[1], ru[0], ru[1], limbShadeColor);
    if (short) {
      up += fill(
        left ? "M45 61 Q39 67 38.5 78 L46.5 79.5 Q47.5 72 49 70Z" : "M75 61 Q81 67 81.5 78 L73.5 79.5 Q72.5 72 71 70Z",
        dim(top),
      );
      if (!left && !isFar) up += flat("M77 64 Q80.5 70 81.2 77.6 L78.5 78.4 Q78 70 77 64Z", tS);
    }
    if (left && !backSit && !isFar) up += rim(jacket ? "M40.6 63 Q35.6 70 36.5 86" : "M43 63 Q38.5 70 37.8 86", R1);
    let fo = lower(el[0], el[1], wr[0], wr[1], rf[0], rf[1], limbColor);
    if (!left && !isFar) fo += limbShade(el[0], el[1], wr[0], wr[1], rf[0], rf[1], limbShadeColor);
    if (jacket)
      fo += `<path d="M${wr[0] - 4.2} ${wr[1] - 4.5} L${wr[0] + 4.2} ${wr[1] - 4.3}" stroke="${tS}" stroke-width="1.2"/>`;
    if (left && a.extra === "watch") fo += watch(P, ec, wr[0], wr[1]);
    if (!left && !sit && !isFar)
      fo += rim(`M${wr[0] + rf[1] + 0.2} ${el[1] + 3} L${wr[0] + rf[1] + 0.4} ${wr[1] - 1}`, R2);
    fo += hand(hd[0], hd[1], isFar ? sS : skin);
    const shift = (g: string) => widen(`<g transform="translate(${left ? axL : -axR} 0)">${g}</g>`);
    return [shift(up), shift(fo)];
  };
  const [lu, lf] = arm(true);
  const [rU, rF] = arm(false);
  add("armLu", lu, BOX.armLu);
  add("armLf", lf, BOX.armLf);

  // torso (with the skirt, the hood, the neck)
  const torso = jacket
    ? fem
      ? "M42 60 Q50 55 60 55 Q70 55 78 60 Q78.5 74 74.5 84 Q77.5 94 78 104 Q60 108 42 104 Q42.5 94 45.5 84 Q41.5 74 42 60Z"
      : masc
        ? "M39.5 59.5 Q50 54.5 60 54.5 Q70 54.5 80.5 59.5 L79 104 Q60 108 41 104Z"
        : "M41 60 Q50 55 60 55 Q70 55 79 60 L78 104 Q60 108 42 104Z"
    : dress
      ? fem
        ? "M45.5 60 Q51 55.5 60 55.5 Q69 55.5 74.5 60 Q76 72 72.5 84 L76 100 Q60 103 44 100 L47.5 84 Q44 72 45.5 60Z"
        : "M45 60 Q50 55 60 55 Q70 55 75 60 L76 100 Q60 103 44 100Z"
      : fem
        ? "M45.5 60 Q51 55.5 60 55.5 Q69 55.5 74.5 60 Q76 71 73 82 Q77 92 79 104 Q60 109 41 104 Q43 92 47 82 Q44 71 45.5 60Z"
        : masc
          ? "M42.5 59.5 Q49.5 54.5 60 54.5 Q70.5 54.5 77.5 59.5 L78 104 Q60 108 42 104Z"
          : "M44 60 Q50 55 60 55 Q70 55 76 60 L79 104 Q60 109 41 104Z";
  let T = "";
  if (skirtish && !sit) {
    const sk = dress
      ? "M44.5 98 L39 128 Q60 133 81 128 L75.5 98Z"
      : longSkirt
        ? LONGSKIRT_FRONT
        : "M44 100 L40 124 Q60 129 80 124 L76 100Z";
    const hemY = dress ? 130 : longSkirt ? 158 : 126;
    T +=
      fill(sk, bot) +
      flat(
        dress
          ? "M66 99 L75.5 98 L81 128 Q73.5 130.5 66 131Z"
          : longSkirt
            ? LONGSKIRT_SHADE
            : "M66 101 L76 100 L80 124 Q73 126.5 66 127Z",
        bS,
      );
    T += `<path d="M52 104 L${longSkirt ? 47 : 50} ${hemY} M60 104 V${hemY + 1} M68 104 L${longSkirt ? 73 : 70} ${hemY}" stroke="${bS}" stroke-width=".8"/>`;
  }
  if (a.top === "hoodie" && !back) T += fill("M47 58 Q60 47 73 58 Q66 64 60 64 Q54 64 47 58Z", tS);
  // a tank top: the body under it is skin
  if (tank) T += fill(torso, skin);
  const shape = tank ? (back ? TANK_BACK : TANK_FRONT) : torso;
  T += `<clipPath id="${id}t"><path d="${shape}"/></clipPath>${fill(shape, top)}<g clip-path="url(#${id}t)">`;
  T += flat(
    jacket
      ? "M66 56 Q73 57 79 60 L78 104 Q72 106 64 107 Q70 86 66 56Z"
      : dress
        ? "M66 56 Q72 57 75 60 L76 100 Q71 101.5 65 102 Q70 84 66 56Z"
        : "M66 56 Q72 57 76 60 L79 104 Q72 106 64 107 Q70 86 66 56Z",
    tS,
  );
  if (back) {
    if (a.top === "hoodie") T += fill("M49 58 Q60 76 71 58 Q60 54 49 58Z", tS, 0.9);
    else T += `<path d="M60 58 V${dress ? 100 : 104}" stroke="${tS}" stroke-width=".8"/>`;
    if (a.top === "sweater" || a.top === "hoodie")
      T +=
        fill("M41 99 Q60 104 79 99 L79 105 Q60 110 41 105Z", top, 0.8) +
        flat("M66 102.6 Q73 101.5 79 99 L79 105 Q72 107 66 108.3Z", tS);
    T += topBack(P, a.top, top);
  } else {
    const cx = 60 + fx * 0.4;
    switch (a.top) {
      case "jacket":
        T += fill(`M${cx - 6} 56.5 L${cx} 82 L${cx + 6} 56.5Z`, inner, 0.8);
        T += flat(`M${cx - 3} 60 L${cx} 82 L${cx + 3} 60Z`, shade(inner), 0.25);
        T +=
          fill(`M${cx - 6} 56.5 L${cx - 2.5} 74 L${cx - 9} 64Z`, tS, 0.8) +
          fill(`M${cx + 6} 56.5 L${cx + 2.5} 74 L${cx + 9} 64Z`, shade(tS), 0.8);
        T += `<path d="M${cx - 15} 92 h6 M${cx + 9} 92 h6" stroke="${tS}" stroke-width="1"/>`;
        break;
      case "shirt":
        T += fill(
          `M${cx - 7} 56 L${cx} 63 L${cx - 1.6} 55.4Z M${cx + 7} 56 L${cx} 63 L${cx + 1.6} 55.4Z`,
          light(top),
          0.8,
        );
        T += `<path d="M${cx} 63 V104" stroke="${tS}" stroke-width=".8"/>`;
        for (let i = 0; i < 4; i++) T += `<circle cx="${cx + 1.4}" cy="${68 + i * 9}" r=".9" fill="${light(top)}"/>`;
        T += `<path d="M${cx + 5} 70 h6 v5 h-6Z" fill="none" stroke="${tS}" stroke-width=".8"/>`;
        T += fill("M41 101 Q60 105 79 101 L79 104.5 Q60 109 41 104.5Z", tS, 0.6);
        break;
      case "hoodie":
        T += `<path d="M${cx - 3} 58 V70 M${cx + 3} 58 V70" stroke="${light(top)}" stroke-width="1.1" stroke-linecap="round"/>`;
        T += fill(`M${cx - 10} 86 H${cx + 10} L${cx + 12} 98 H${cx - 12}Z`, tS, 0.8);
        T +=
          fill("M41 99 Q60 104 79 99 L79 105 Q60 110 41 105Z", top, 0.8) +
          flat("M66 102.6 Q73 101.5 79 99 L79 105 Q72 107 66 108.3Z", tS);
        break;
      case "sweater":
        T += `<path d="M44 75 H76" stroke="${light(top)}" stroke-width="2.6"/><path d="M44 79.5 H76" stroke="${tS}" stroke-width="1.2"/>`;
        T +=
          fill("M41 99 Q60 104 79 99 L79 105 Q60 110 41 105Z", top, 0.8) +
          flat("M66 102.6 Q73 101.5 79 99 L79 105 Q72 107 66 108.3Z", tS);
        break;
      case "dress":
        T += `<path d="M44.5 96 Q60 99 75.5 96" stroke="${shade(tS)}" stroke-width="2" fill="none"/>`;
        break;
      case "tee":
        T += fill("M41 100 Q60 105 79 100 L79 104 Q60 109 41 104Z", top, 0.8);
        break;
      default: // polo, turtleneck, blazer, cardigan, tank (wardrobe.ts)
        T += topFront(P, a.top, top, inner, cx, acc);
    }
  }
  T += "</g>"; // shade and details stay inside the torso's outline
  // cool rim on the torso's lit edge, under the right arm
  if (!backSit)
    T += rim(
      fem
        ? jacket
          ? "M77.6 62 Q78.2 74 74.3 84 Q77.2 93 77.6 100"
          : "M74.3 62 Q75.8 71 72.8 82 Q76.4 92 78.4 100"
        : masc
          ? jacket
            ? "M80 62 L78.8 100"
            : "M77.2 62 L77.8 100"
          : jacket
            ? "M78.6 62 L77.8 100"
            : "M76.2 62 L78.6 100",
      R2,
    );
  if (a.extra === "walkman") {
    if (back) T += `<rect x="64" y="94" width="8" height="10" rx="1.6" fill="${ec}" ${O(0.9)}/>`;
    else
      T += `<rect x="${68 + fx * 0.4}" y="92" width="8" height="10" rx="1.6" fill="${ec}" ${O(0.9)}/><rect x="${69.6 + fx * 0.4}" y="94" width="4.8" height="2.8" rx=".6" fill="${ink}"/><path d="M${72 + fx * 0.4} 92 Q75 70 ${66 + fx} 46" stroke="${ink}" stroke-width=".8" fill="none"/>`;
  }
  if (a.extra === "backpack") T += backpack(P, ec, back ? "back" : "front", false);
  let neck =
    fill(
      masc
        ? "M55 45 L55 57 Q60 59.6 65 57 L65 45Z"
        : fem
          ? "M56.6 45 L56.6 57 Q60 58.6 63.4 57 L63.4 45Z"
          : "M56 45 L56 57 Q60 59 64 57 L64 45Z",
      skin,
    ) + flat("M56 47 L64 47 L64 51 Q60 53 56 50Z", sS);
  if (!back && !jacket && a.top !== "shirt" && !tank && a.top !== "turtleneck")
    neck += `<path d="M53 56 Q60 61 67 56" fill="none" ${O()}/>`;
  if (a.top === "turtleneck") neck += turtleneck(P, top, back ? "back" : "front");
  neck += neckThing(P, a.extra, ec, back ? "back" : "front", 60 + fx * 0.4);
  add("torso", widen(T) + neck, BOX.torso);
  add("armRu", rU, BOX.armRu);
  add("armRf", rF, BOX.armRf);

  // the head
  const head = (face: Face) => {
    // a squarer jaw for masculine faces
    let Hd = fill(
      masc
        ? "M48 34 Q48 21 60 21 Q72 21 72 34 Q72 44.5 66.5 48.6 Q60 51.6 53.5 48.6 Q48 44.5 48 34Z"
        : "M48 34 Q48 21 60 21 Q72 21 72 34 Q72 45 63 49 Q60 50.5 57 49 Q48 45 48 34Z",
      skin,
    );
    if (!back) Hd += flat("M67 26 Q72 30 72 35 Q72 45 63 49 Q68 40 67 26Z", sS, 0.9);
    if (!back && a.hair !== "long" && a.hair !== "bob" && a.hair !== "curly")
      Hd += `<ellipse cx="${tq ? 69.5 : 47.6}" cy="37.5" rx="1.9" ry="2.8" fill="${skin}" ${O(0.8)}/>${tq ? "" : `<ellipse cx="72.4" cy="37.5" rx="1.9" ry="2.8" fill="${skin}" ${O(0.8)}/>`}`;
    if (back) {
      Hd += hairFull(a.hair, nw, H, hH, hS, hair, fill, O);
      if (nw && a.hair !== "afro")
        Hd +=
          fill("M46.5 31 Q45.4 42 51.5 49 Q49.2 41 49.8 31Z", skin) +
          (a.hair === "long" || a.hair === "curly"
            ? ""
            : `<ellipse cx="49.6" cy="37.5" rx="1.9" ry="2.8" fill="${skin}" ${O(0.8)}/>`);
    } else {
      const eyeAt = (cx: number, far: boolean, outer: -1 | 1) => {
        const k = far ? 0.72 : 1;
        const lash = fem
          ? `<path d="M${outer < 0 ? cx - 3.5 * k : cx + 3.5 * k} ${outer < 0 ? 35.5 : 34.6} l${outer * 1.9 * k} -1.5" stroke="${ink}" stroke-width="1.3" stroke-linecap="round"/>`
          : "";
        if (face === "blink")
          return `${lash}<path d="M${cx - 3.2 * k} 37.4 Q${cx} 40.2 ${cx + 3.2 * k} 37.4" stroke="${ink}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
        return `${lash}<path d="M${cx - 3.5 * k} 35.5 Q${cx} 32.5 ${cx + 3.5 * k} 34.6" stroke="${ink}" stroke-width="1.8" fill="none" stroke-linecap="round"/><ellipse cx="${cx}" cy="38" rx="${2.3 * k}" ry="${masc ? 3 : 3.4}" fill="${eye}"/><ellipse cx="${cx}" cy="39.4" rx="${1.5 * k}" ry="1.6" fill="${mix(eye, "#ffc0e0", 0.55)}"/><ellipse cx="${cx}" cy="37.2" rx="${1.1 * k}" ry="1.5" fill="#1a0a20"/><circle cx="${cx + 0.8}" cy="36.5" r=".9" fill="#fff"/>`;
      };
      if (ligne) {
        // Ligne claire: dot eyes, thin brows, a nose hook, a line for a mouth
        const k = tq ? 0.8 : 1;
        Hd +=
          face === "blink"
            ? `<path d="M${54 + fx} 37.6 h${3 * k} M${63 + fx} 37.6 h3" stroke="${ink}" stroke-width="1" stroke-linecap="round"/>`
            : `<circle cx="${55.5 + fx}" cy="37.6" r="${1.35 * k}" fill="${ink}"/><circle cx="${64.5 + fx}" cy="37.6" r="1.35" fill="${ink}"/>`;
        Hd += `<path d="M${53 + fx} 33.4 Q${55.5 + fx} 32.4 ${58 + fx} 33.3 M${62 + fx} 33.3 Q${64.5 + fx} 32.4 ${67 + fx} 33.4" stroke="${ink}" stroke-width="${masc ? 1.6 : 0.9}" fill="none" stroke-linecap="round"/>`;
        if (fem)
          Hd += `<path d="M${54.1 + fx} 36.6 l-1.3 -1 M${65.9 + fx} 36.6 l1.3 -1" stroke="${ink}" stroke-width=".8" stroke-linecap="round"/>`;
        Hd += tq
          ? `<path d="M58.4 38.6 Q56.4 41.6 58.4 42.2" stroke="${ink}" stroke-width=".9" fill="none" stroke-linecap="round"/>`
          : `<path d="M60.5 38.5 Q62.2 41.5 60 42" stroke="${ink}" stroke-width=".9" fill="none" stroke-linecap="round"/>`;
        Hd +=
          face === "talk"
            ? `<ellipse cx="${60 + fx}" cy="45.6" rx="2" ry="1.5" fill="${ink}"/>`
            : `<path d="M${57.5 + fx} 45 Q${60 + fx} 46.2 ${62.5 + fx} 45" stroke="${ink}" stroke-width=".9" fill="none" stroke-linecap="round"/>`;
      } else {
        Hd += eyeAt(55 + fx, tq, -1) + eyeAt(65 + fx, false, 1);
        Hd += `<path d="M${52.5 + fx} 31 L${57.5 + fx} 30.2 M${62.5 + fx} 30.2 L${67.5 + fx} 31" stroke="${hS}" stroke-width="${masc ? 1.8 : 1}" stroke-linecap="round"/>`;
        Hd += tq
          ? `<path d="M58.6 39.5 L56.6 42.4 L58.4 42.6" stroke="${sS}" stroke-width=".9" fill="none"/>`
          : `<path d="M60.3 40.5 L59.6 42.6 L60.6 42.6" stroke="${sS}" stroke-width=".8" fill="none"/>`;
        Hd +=
          face === "talk"
            ? `<path d="M${57.6 + fx} 44.4 Q${60 + fx} 43.8 ${62.4 + fx} 44.4 Q${61.8 + fx} 48.2 ${60 + fx} 48.2 Q${58.2 + fx} 48.2 ${57.6 + fx} 44.4Z" fill="#7a2040" ${O(0.7)}/><path d="M${58.6 + fx} 47 Q${60 + fx} 46.2 ${61.4 + fx} 47" stroke="#ff8aa0" stroke-width=".9" fill="none"/>`
            : `<path d="M${57.5 + fx} 44.8 Q${60 + fx} 46.8 ${62.5 + fx} 44.8" stroke="${fem ? "#c8305a" : "#b03050"}" stroke-width="${fem ? 1.5 : 1.1}" fill="none" stroke-linecap="round"/>`;
        Hd += `<path d="M${51 + fx} 41.5 l2.5 -1 M${52 + fx} 42.5 l2.5 -1 M${65.5 + fx} 40.5 l2.5 1 M${66.5 + fx} 41.5 l2.5 1" stroke="#ff8aa0" stroke-width=".6"/>`;
      }
      if (a.extra === "earrings" && earsShow)
        Hd += earrings(
          ec,
          tq
            ? [[69.5, 41.4]]
            : [
                [47.6, 41.4],
                [72.4, 41.4],
              ],
        );
      Hd += hairFront(a.hair, view, H, hH, hair, fill);
      Hd += eyewear(P, a.eyewear, a.eyewearColor, tq ? "tq" : "front", fx);
    }
    if (back && nw && a.extra === "earrings" && earsShow) Hd += earrings(ec, [[49.6, 41.4]]);
    Hd +=
      accessory(a.accessory, view, acc, fill, O) +
      headThing(P, a.accessory, acc, back ? "back" : tq ? "tq" : "front", closeCrop);
    if (!hat) Hd += rim("M48.6 32 Q49 23 56 21.6", R1);
    return defs + Hd;
  };
  const open = head("open");
  // from behind there's no face to blink or talk
  heads = back ? { open, blink: open, talk: open } : { open, blink: head("blink"), talk: head("talk") };
  headBox = BOX.head;
  let order: PartName[];
  if (sit && back) order = ["hairBack", "armLu", "armLf", "torso", "armRu", "armRf", "head"];
  else if (sit) order = ["hairBack", "lap", "armLu", "torso", "armLf", "armRu", "armRf", "head"];
  else if (farSide === "R")
    // turned away to the left: the right-hand limbs go behind
    order = ["hairBack", "legR", "legL", "armRu", "armRf", "torso", "armLu", "armLf", "head"];
  else order = ["hairBack", "legL", "legR", "armLu", "armLf", "torso", "armRu", "armRf", "head"];
  // turned away or ¾ towards you: the body reads a little narrower
  const squash = nw ? 0.88 : tq ? 0.95 : 1;
  return finish(parts, order, heads, headBox, joints, { side, sit, back, quarter: tq || nw, squash, id });
}

function finish(
  parts: PartArt[],
  order: PartName[],
  heads: Record<Face, string>,
  headBox: Box,
  joints: Joints,
  r: { side: boolean; sit: boolean; back: boolean; quarter: boolean; squash: number; id: string },
): AvatarRig {
  const byName = new Map(parts.map((p) => [p.name, p]));
  const out: PartArt[] = [];
  for (const n of order) {
    if (n === "head") out.push({ name: "head", svg: heads.open, box: headBox });
    else {
      const p = byName.get(n);
      if (p) out.push(p);
    }
  }
  return { ...r, parts: out, heads, headBox, joints };
}

// re-exported for the engine
export type { Face, Pose };
type Fill = (d: string, c: string, w?: number) => string;

// hair mass behind the head (front views use the shade colour so the face pops)
function hairBehind(style: string, view: "S" | "N" | "W", c: string, hH: string, fill: Fill): string {
  if (view === "W") {
    const d: Record<string, string> = {
      short: "M48 30 Q46 13 62 12.5 Q78 14 74 34 L71 45 L60 45Z",
      bob: "M49 30 Q50 15 63 15.5 Q76 17 74.5 36 L74.5 51 Q68 54 62 50 L60 40Z",
      long: "M49 30 Q50 15 63 15.5 Q76 17 75 36 L77 80 Q69 84 62 80 L60 40Z",
      afro: "M64 5 C78 5 86 15 84 28 C87 37 80 46 72 45 L57 45 C51 44 48.5 37 50 30 C48.5 14 54 5 64 5Z",
      curly: "M50 32 C47 22 52 14 63 14 C75 14 80 24 77 34 C80 42 76 54 69 53 L60 52Z",
      bun: "M48 31 Q47 15 62 14.5 Q75 15.5 74 34 Q73 44 67 47 L58 47Z",
      ponytail: "M48 31 Q47 15 62 14.5 Q75 15.5 74 34 Q73 44 67 47 L58 47Z",
      buzz: "M60 22 Q72 21 72.4 33 L71.5 42 Q69 46 66 47 Q68 36 64 26Z",
    };
    let g = d[style] ? fill(d[style], c) : "";
    if (style === "bun") g += fill("M64 13 a7 7 0 1 1 14 0 a7 7 0 1 1 -14 0Z", c);
    if (style === "ponytail")
      g +=
        fill("M71.5 21 Q83 22 83.5 36 Q84 50 78.5 60 Q78.2 47 74.5 36 Q72.6 29 71 26Z", c) +
        `<path d="M71.6 21.6 L74 27" stroke="${hH}" stroke-width="2.2" stroke-linecap="round"/>`;
    if (style === "afro")
      g += `<path d="M58 12 q5 -3 10 0 M74 14 q4 2 5 6" stroke="${hH}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
    return g;
  }
  if (view === "N") return ""; // the back views draw the whole head of hair after the skull
  const d: Record<string, string> = {
    short: "M47 38 Q44 20 60 17 Q76 20 73 38 L72 45 L48 45Z",
    bob: "M46 34 Q44 17 60 16 Q76 17 74 34 L75 51 Q70 54 66 51 L54 51 Q50 54 45 51Z",
    long: "M45 34 Q44 16 60 16 Q76 16 75 34 L78 80 Q69 84 60 81 Q51 84 42 80Z",
    afro: "M60 7 C74 6 82 16 80 28 C84 36 78 46 70 45 L50 45 C42 46 36 36 40 28 C38 16 46 6 60 7Z",
    curly: "M44 36 C40 26 46 14 60 14 C74 14 80 26 76 36 C80 44 77 55 70 53 L50 53 C43 55 40 44 44 36Z",
    bun: "M47 38 Q45 17 60 16 Q75 17 73 38 Q72 45 66 47 L54 47 Q48 45 47 38Z",
  };
  let g = d[style] ? fill(d[style], c) : "";
  if (style === "bun") g += fill("M52.5 12 a7.5 7.5 0 1 1 15 0 a7.5 7.5 0 1 1 -15 0Z", c);
  if (style === "afro")
    g += `<path d="M48 14 q4 -3 8 -1 M64 12 q5 -1 8 3 M42 28 q1 -4 4 -6" stroke="${hH}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
  return g;
}

// the whole head of hair from behind (N, NW) — never a bare scalp
function hairFull(
  style: string,
  nw: boolean,
  H: string,
  hH: string,
  hS: string,
  hair: string,
  fill: Fill,
  O: (w?: number) => string,
): string {
  const d: Record<string, string> = {
    short: "M47 40 Q44 16 60 15 Q76 16 73 40 Q72 46 66 47 L54 47 Q48 46 47 40Z",
    bob: "M46 36 Q44 16 60 16 Q76 16 74 36 L75 51 Q60 55 45 51Z",
    long: "M45 34 Q44 16 60 16 Q76 16 75 34 L78 80 Q60 85 42 80Z",
    afro: "M60 7 C74 6 82 16 80 28 C84 36 78 46 70 45 L50 45 C42 46 36 36 40 28 C38 16 46 6 60 7Z",
    curly: "M44 36 C40 26 46 14 60 14 C74 14 80 26 76 36 C80 44 77 55 70 53 L50 53 C43 55 40 44 44 36Z",
    bun: "M47 40 Q45 16 60 15 Q75 16 73 40 Q72 46 66 47 L54 47 Q48 46 47 40Z",
    ponytail: "M47 40 Q45 16 60 15 Q75 16 73 40 Q72 46 66 47 L54 47 Q48 46 47 40Z",
    buzz: "M48 33 Q48 20.5 60 20.5 Q72 20.5 72 33 Q72 38 70.5 41 Q60 44 49.5 41 Q48 38 48 33Z",
  };
  const shift = (g: string) => (nw ? `<g transform="translate(2.5 0)">${g}</g>` : g);
  if (style === "bald") return `<ellipse cx="56" cy="26" rx="5" ry="2.4" fill="#fff" opacity=".25"/>`;
  if (style === "mohawk")
    return `<path d="M48 34 Q48 21 60 21 Q72 21 72 34 Q72 45 63 49 Q60 50.5 57 49 Q48 45 48 34Z" fill="${hair}" opacity=".3"/>${shift(fill("M56 46 Q54 22 55 12 Q60 5 65 12 Q66 22 64 46Z", H))}`;
  // a buzz cut: a close crop, the scalp showing through
  if (style === "buzz") return shift(fill(d.buzz, H, 0.9).replace("<path ", '<path opacity=".82" '));
  let g = fill(d[style] ?? d.short, H);
  g += `<path d="M52 22 Q60 18 68 22" stroke="${hH}" stroke-width="2" fill="none" stroke-linecap="round" opacity=".8"/>`;
  if (style === "curly" || style === "afro")
    g += `<path d="M48 26 q3 -3 6 0 M60 22 q3 -3 6 0 M66 32 q3 -3 6 0 M50 40 q3 -3 6 0 M60 44 q3 -3 6 0" stroke="${hS}" stroke-width="1.1" fill="none" stroke-linecap="round"/>`;
  else
    g += `<path d="M62 20 Q66 32 64 44 M56 22 Q53 34 55 44" stroke="${hS}" stroke-width=".9" fill="none" opacity=".7"/>`;
  if (style === "bun")
    g += `<circle cx="60" cy="12" r="7.5" fill="${H}" ${O()}/><path d="M55 11 q5 -4 10 0" stroke="${hH}" stroke-width="1.4" fill="none"/>`;
  if (style === "ponytail")
    g += `${fill("M56.4 24 Q60 21 63.6 24 L64.6 58 Q60 66 55.4 58Z", H)}<path d="M56.6 27.4 Q60 25.6 63.4 27.4" stroke="${hH}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
  return shift(g);
}

// fringe and locks in front of the face (S, SW, W)
function hairFront(style: string, view: View, H: string, hH: string, hair: string, fill: Fill): string {
  const side = view === "W";
  const shine = side
    ? `<path d="M53 21.5 Q60 17.5 68 20.5" stroke="${hH}" stroke-width="2" fill="none" stroke-linecap="round" opacity=".85"/>`
    : `<path d="M50 23 Q60 18.5 70 23 L69 25 Q60 21 51 25Z" fill="${hH}" opacity=".85"/>`;
  if (style === "bald") return `<ellipse cx="${side ? 60 : 56}" cy="25" rx="5" ry="2.4" fill="#fff" opacity=".25"/>`;
  if (style === "buzz")
    return side
      ? fill("M50.6 31 Q51 20.6 61 20.6 Q72.3 21 72.2 33 Q70 27 62 25.6 Q55 25.6 50.6 31Z", H, 0.7)
      : fill("M48 31 Q48 20.5 60 20.5 Q72 20.5 72 31 Q66 25.5 60 25.5 Q54 25.5 48 31Z", H, 0.7);
  if (style === "mohawk") {
    const shaved = side
      ? `<path d="M50.5 32 Q50.5 21 61 21 Q72 21 72 33 Q66 27 58 27 Q53 28 50.5 32Z" fill="${hair}" opacity=".3"/>`
      : `<path d="M48 33 Q48 21 60 21 Q72 21 72 33 Q66 27 60 27 Q54 27 48 33Z" fill="${hair}" opacity=".3"/>`;
    const crest = side
      ? fill("M52 24 Q54 9 63 7 Q73 8 75 20 L71 27 Q62 19 52 24Z", H)
      : fill(`M${view === "SW" ? 54 : 56} 23 Q55 9 ${view === "SW" ? 58 : 60} 6 Q65 9 64 23Z`, H);
    return shaved + crest;
  }
  if (style === "curly") {
    const at = side
      ? [
          [53, 24, 4.5],
          [59, 21.5, 4.5],
          [66, 21, 4.5],
          [71, 25, 4],
        ]
      : [
          [48, 31, 4],
          [50.5, 25.5, 4.5],
          [56, 22.5, 4.6],
          [62, 22, 4.6],
          [68, 24.5, 4.5],
          [72, 30, 4],
        ];
    return (
      at
        .map(([x, y, r]) => fill(`M${x - r} ${y} a${r} ${r} 0 1 1 ${r * 2} 0 a${r} ${r} 0 1 1 ${-r * 2} 0Z`, H))
        .join("") + shine
    );
  }
  const d: Record<string, string[]> = side
    ? {
        short: ["M49 32 Q45 13 62 11 Q80 11 76 28 L74 33 Q68 25 60 26 Q54 26.5 49 32Z"],
        bob: [
          "M50 33 Q49 17 62 16.5 Q74 17 74 30 Q68 25.5 61 26.5 Q56 27 53 31 Q51.5 30 50 33Z",
          "M62 29 Q66.5 40 64.5 51 L69 50 Q71 40 67 28Z",
        ],
        long: [
          "M50 33 Q49 17 62 16.5 Q74 17 74 30 Q68 25.5 61 26.5 Q56 27 53 31 Q51.5 30 50 33Z",
          "M62 29 Q67 50 65 78 L70 78 Q72 50 67 28Z",
        ],
        afro: ["M50 31 Q52 21 61 21.5 Q67 22 70 26 Q62 25 55 27 Q52 28 50 31Z"],
        bun: ["M50 33 Q49 17 62 16.5 Q74 17 74 30 Q68 24 60 24.5 Q54 26 50 33Z"],
        ponytail: ["M50 33 Q49 17 62 16.5 Q74 17 74 30 Q68 24 60 24.5 Q54 26 50 33Z"],
      }
    : {
        short: ["M46 36 Q42 14 60 11 Q80 10 77 28 Q76 34 73 37 Q71 28 64 26 Q62 30 55 29 Q51 31 48 30 Q47 33 46 36Z"],
        bob: [
          "M47 36 Q46 18 60 17.5 Q74 18 73 36 Q70 29 65 27 Q62 31.5 56 30.5 Q52 29 50 27.5 Q48 31 47 36Z",
          "M47 36 Q45 44 47 51 L50 42Z",
          "M73 36 Q75 44 73 51 L70 42Z",
        ],
        long: [
          "M47 38 Q46 18 60 17 Q74 18 73 38 Q70 28 61 24 Q56 28 50 29 Q48 33 47 38Z",
          "M47 36 Q43 56 45 78 L51 76 Q49 54 50 42Z",
          "M73 36 Q77 56 75 78 L69 76 Q71 54 70 42Z",
        ],
        afro: ["M47 33 Q49 21 60 21 Q71 21 73 33 Q67 26 60 27 Q53 26 47 33Z"],
        bun: [
          "M47 36 Q46 18 60 17.5 Q74 18 73 36 Q68 26 60 25 Q52 26 47 36Z",
          "M47 36 Q46 41 47.5 44 L49 38Z",
          "M73 36 Q74 41 72.5 44 L71 38Z",
        ],
        ponytail: ["M47 36 Q46 18 60 17.5 Q74 18 73 36 Q68 26 60 25 Q52 26 47 36Z"],
      };
  const parts = d[style] ?? d.short;
  return parts.map((p) => fill(p, H)).join("") + shine;
}

function accessory(kind: string, view: View, acc: string, fill: Fill, O: (w?: number) => string): string {
  const back = view === "N" || view === "NW";
  const side = view === "W";
  const tq = view === "SW";
  const dark = shade(acc);
  switch (kind) {
    case "headphones": {
      if (side)
        return `<path d="M64.3 32 Q65.2 20 63 15.2" stroke="${ink}" stroke-width="3.6" fill="none" stroke-linecap="round"/><path d="M64.3 32 Q65.2 20 63 15.2" stroke="${acc}" stroke-width="2" fill="none" stroke-linecap="round"/><ellipse cx="64" cy="37" rx="4.2" ry="5.6" fill="${acc}" ${O()}/><ellipse cx="64.6" cy="37" rx="2" ry="3.4" fill="${dark}"/>`;
      const band = "M45.5 33 Q44.5 10 60 10 Q75.5 10 74.5 33";
      return `<path d="${band}" stroke="${ink}" stroke-width="3.6" fill="none" stroke-linecap="round"/><path d="${band}" stroke="${acc}" stroke-width="2" fill="none" stroke-linecap="round"/><rect x="41.5" y="30" width="7" height="11" rx="3" fill="${acc}" ${O()}/><rect x="71.5" y="30" width="7" height="11" rx="3" fill="${acc}" ${O()}/>${fillFlat("M75 31 h2.4 q1.1 0 1.1 1.2 v7.6 q0 1.2 -1.1 1.2 h-2.4Z", dark)}`;
    }
    case "glasses": {
      if (back) return "";
      if (side)
        return `<path d="M50.4 34.8 h6 v3 q-1 3.2 -3.2 3.2 q-2.2 0 -2.8 -3.2Z" fill="${acc}" fill-opacity=".35" ${O(0.9)}/><path d="M56.4 35.8 L63 36.6" ${O(0.9)}/>`;
      const fx = tq ? -4.2 : 0;
      return `<path d="M${50 + fx} 35 h9 v3.2 q-1 3.4 -4.6 3.4 q-3.6 0 -4.4 -3.4Z M${61 + fx} 35 h9 v3.2 q-1 3.4 -4.6 3.4 q-3.6 0 -4.4 -3.4Z" fill="${acc}" fill-opacity=".35" ${O(0.9)}/><path d="M${59 + fx} 36 h2" ${O(0.9)}/>`;
    }
    case "cap": {
      if (side)
        return (
          fill("M50 28 Q50 13 62 13 Q74 13 74 29 Q62 25 50 28Z", acc) +
          fill("M51 27.5 L37.5 29.5 Q37 26.5 51 24.5Z", dark)
        );
      const dome =
        fill("M46 30 Q46 12 60 12 Q74 12 74 30 Q60 26 46 30Z", acc) +
        `<circle cx="60" cy="12.6" r="1.3" fill="${dark}"/>`;
      if (back) return `${dome}<path d="M56 28 h8" stroke="${dark}" stroke-width="2.2"/>`;
      return dome + fill(`M${46 + (tq ? -2 : 0)} 29.5 Q60 36 74 29.5 Q60 31.5 46 29.5Z`, dark);
    }
    case "beanie": {
      const x0 = side ? 49.5 : 45.5;
      const x1 = side ? 75 : 74.5;
      return `${fill(`M${x0} 29 Q${x0} 8 ${(x0 + x1) / 2} 8 Q${x1} 8 ${x1} 29Z`, acc)}${fill(`M${x0 - 0.5} 25 H${x1 + 0.5} V31 H${x0 - 0.5}Z`, dark)}${[0.2, 0.4, 0.6, 0.8].map((t) => `<path d="M${x0 + (x1 - x0) * t} 25.6 v4.8" stroke="${shade(dark)}" stroke-width=".8"/>`).join("")}<circle cx="${(x0 + x1) / 2}" cy="7" r="4" fill="${light(acc)}" ${O()}/>`;
    }
    case "walkman":
      if (back) return "";
      return side
        ? `<circle cx="63.5" cy="38" r="1.8" fill="${ink}"/>`
        : `<circle cx="${tq ? 66.5 : 47.6}" cy="38.5" r="1.8" fill="${ink}"/>${tq ? "" : `<circle cx="72.4" cy="38.5" r="1.8" fill="${ink}"/>`}`;
    default:
      return "";
  }
}

const fillFlat = (d: string, c: string) => `<path d="${d}" fill="${c}"/>`;
