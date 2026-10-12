import type { AvatarLayers } from "@yutopia/shared";

// Yutopia people in the style each person picks (`style`, docs/art-style.md).
// City-pop 80s anime (default): about 5½ heads
// tall, flat fills with hard violet shade shapes, gradient hair with a highlight
// band, big glossy eyes, and a rim light down the edges — warm and sky blue by
// day, neon pink and cyan at night. Five drawn views — S (front), SW (¾ front),
// W (side), NW (¾ back), N (back); the other three facings are mirrors.
//
// The figure is drawn on a 120×180 board (feet on y = 168) and placed into the
// 64×100 box the engine and the HUD expect (feet on y = 96).
//
// Ligne claire paints the same figure and poses differently: one even black
// line, flat colours, dot eyes and a nose hook — no violet shade, no rim light.

export type View = "S" | "SW" | "W" | "NW" | "N";
export type Rim = "day" | "night";

const INK = "#2a1430";
const LIGNE_INK = "#151515";
// the paint of the drawing being made (set at the top of figure(); drawing is synchronous)
let ligne = false;
let ink = INK;
const SHOE = "#fff4ea";
const RIMS: Record<Rim, [string, string]> = { day: ["#ffc070", "#a8dcff"], night: ["#ff5fa8", "#5ff0ff"] };
// board → texture box: feet (60, 168) land on (32, 96)
const FIT = 0.585;
const FIT_X = 32 - 60 * FIT;
const FIT_Y = 96 - 168 * FIT;
const SIT_DROP = 12; // seated poses sit this much lower on the board so the hips meet the seat

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
function mix(a: string, b: string, t: number): string {
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

export function avatarSvg(
  a: AvatarLayers,
  view: View,
  frame: number,
  sitting: boolean,
  px = 2,
  rim: Rim = "day",
): string {
  // deterministic ids: the same drawing renders identically everywhere
  const id = `a${hash(`${JSON.stringify(a)}|${view}|${frame}|${sitting}|${rim}`)}`;
  const body = figure(a, view, frame % 4, sitting, id, rim);
  const y = FIT_Y + (sitting ? SIT_DROP * FIT : 0);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${64 * px}" height="${100 * px}" viewBox="0 0 64 100"><g transform="translate(${FIT_X.toFixed(2)} ${y.toFixed(2)}) scale(${FIT})">${body}</g></svg>`;
}

function figure(a: AvatarLayers, view: View, frame: number, sit: boolean, id: string, rimMode: Rim): string {
  ligne = a.style === "ligne";
  ink = ligne ? LIGNE_INK : INK;
  const back = view === "N" || view === "NW";
  const nw = view === "NW";
  const tq = view === "SW";
  const side = view === "W";
  const backSit = back && sit;
  const st = sit ? 0 : [0, 1, 0, -1][frame]; // 0/2 passing, 1/3 stride
  const passing = !sit && frame % 2 === 0;
  const bob = sit ? 0 : passing ? -1.2 : 0;
  // front/back views: the leg in front reaches towards the viewer, the other lifts
  const dyL = (back ? -1 : 1) * 2.6 * st;
  const dyR = -dyL;

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
  const skirtish = a.bottom === "skirt" || dress;
  // gender shapes the body and face only — hair, clothes and size stay free
  const fem = a.gender === "feminine";
  const masc = a.gender === "masculine";
  const shorts = a.bottom === "shorts" && !dress;
  const legBare = skirtish; // tights are just skin here
  const H = ligne ? hair : `url(#${id}h)`;

  let s = `<defs><linearGradient id="${id}h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${hH}"/><stop offset=".35" stop-color="${hair}"/><stop offset="1" stop-color="${hS}"/></linearGradient></defs>`;
  if (!backSit)
    s += `<ellipse cx="60" cy="${sit ? (side ? 134 : 131) : 168}" rx="${side ? 16 : 20}" ry="4" fill="#000" opacity=".35"/>`;
  const widen = (g: string) =>
    bw === 1 ? g : `<g transform="translate(60 0) scale(${bw} 1) translate(-60 0)">${g}</g>`;

  // ── side view (W, facing left; E is the mirror) ───────────────────────────
  if (side) {
    let S = hairBehind(a.hair, "W", H, hH, fill);
    const ang = st * 21;
    const armD = "M55.5 60 Q52 74 54 90 L55 103 Q59.5 107.5 63.5 103 L63.5 88 Q64.5 73 64.5 62Z";
    const legShape = skirtish ? "M55.5 112 L56.5 160 L63.5 160 L64.5 112Z" : "M54 102 L55.5 160 L64.5 160 L66.5 102Z";
    const sole = (c: string) =>
      `${fill("M51 159.5 Q48.5 160 48.5 164 Q48.5 167.5 52 167.5 L64.5 167.5 L64.5 159.5Z", c)}<path d="M48.8 165.6 H64.4" stroke="${mix(SHOE, "#8a70c8", 0.5)}" stroke-width="1.2"/>`;
    const leg = (rot: number, near: boolean) => {
      const c = legBare ? skin : bot;
      const tone = (x: string) => (near ? x : shade(x));
      let g = fill(legShape, tone(c));
      if (shorts) g = fill(legShape, tone(skin)) + fill("M54 102 L55 128 L65.5 128 L66.5 102Z", tone(bot));
      return `<g transform="rotate(${rot} 60 104)">${g}${sole(near ? SHOE : mix(SHOE, "#8a70c8", 0.35))}</g>`;
    };
    let lower = "";
    if (sit) {
      const shin = legBare || shorts ? skin : bot;
      lower += fill("M32.5 106 L33.5 128 L41.5 128 L42 107Z", shin);
      lower += fill("M28.5 127.5 Q26.5 128 26.5 131.5 Q26.5 134 29.5 134 L41.5 134 L41.5 127.5Z", SHOE);
      lower += fill("M57 97 L36 98.5 Q31.5 99 31.5 105 Q31.5 112 37 112 L60 112Z", bot);
      lower += flat("M36 107.5 L60 107.5 L60 112 L37 112 Q33 111.6 32 108Z", bS, 0.8);
    } else {
      lower += `<g transform="rotate(${ang * -0.8} 60 61)">${fill(armD, tS)}</g>`; // far arm
      // frame 0 is both "standing" and the walk's passing frame: a relaxed stance
      lower += leg(st ? -ang : -4, false) + leg(st ? ang : 4, true);
    }
    const jacket = a.top === "jacket";
    const sideTorso = fem
      ? "M49 60 Q53 55 61 55 Q69 55.5 71 60 Q72.5 73 69.5 84 Q72.5 94 72 104 Q60 108.5 48 104 Q48.5 94 50 84 Q47.5 72 49 60Z"
      : masc
        ? "M47.5 59.5 Q52 54.2 61 54.2 Q70.5 54.6 73 59.5 L72.5 104 Q60 108.5 47.5 104Z"
        : jacket
          ? "M47.5 60 Q52 54.5 61 54.5 Q70 55 72.5 60 L72 104 Q60 108 47.5 104Z"
          : "M49 60 Q53 55 61 55 Q69 55.5 71 60 L72 104 Q60 108.5 48 104Z";
    let torso = `<clipPath id="${id}s"><path d="${sideTorso}"/></clipPath>${fill(sideTorso, top)}`;
    torso += `<g clip-path="url(#${id}s)">${flat("M63 54 Q70 54.6 73 60 L73 104 Q67 106 63 106.6Z", tS)}</g>`;
    if (jacket)
      torso +=
        fill("M50 58.5 L55 58 L54 75 L50.3 70Z", inner, 0.8) +
        `<path d="M54 60 L55 86" stroke="${tS}" stroke-width="1"/>`;
    else if (a.top === "shirt")
      torso +=
        fill("M49.5 57 L56 56 L55 63Z", light(top), 0.8) +
        `<path d="M51 62 L51.6 100" stroke="${tS}" stroke-width=".8"/>`;
    else if (a.top === "hoodie")
      torso +=
        fill("M60 54.5 Q70 53 72 60 Q68 64 63 62Z", tS, 0.9) +
        `<path d="M52 59 L51.6 70" stroke="${light(top)}" stroke-width=".9"/>`;
    else if (!dress) torso += fill("M48 99 Q60 102.5 72 99 L72 105 Q60 108.5 48 105Z", top, 0.8);
    if (skirtish && !sit)
      torso +=
        fill(
          dress ? "M48.5 98 L44 126 Q59 129.5 74 126 L71.5 98Z" : "M50.5 100 L46.5 124 Q59 127.5 72 124 L69.5 100Z",
          bot,
        ) + flat("M62 100 L71.5 99 L74 125.5 Q68 127 62 127.5Z", bS);
    let arm = "";
    const short = a.top === "tee" || dress;
    if (sit) {
      arm += fill("M56.5 60 Q54 72 55 84 Q58 88 62 85 L63.5 62Z", top);
      arm +=
        fill("M57 82 L43 88.5 Q40.5 92 43.5 93.5 L60 89Z", short ? skin : top) +
        `<ellipse cx="41.5" cy="91" rx="3.2" ry="3" fill="${skin}" ${O()}/>`;
    } else {
      const sleeve = short ? fill("M55.5 60 Q52.5 70 53.4 79 L63.8 79 Q64.5 70 64.5 62Z", top) : "";
      arm += `<g transform="rotate(${ang * 0.8} 60 61)">${fill(armD, short ? skin : top)}${sleeve}${flat("M60.5 66 Q63.4 74 62.5 88 L62.5 103 Q61.5 105 60.5 105 Q61.5 86 60.5 66Z", short ? sS : tS)}<ellipse cx="59.3" cy="107" rx="3" ry="4" fill="${skin}" ${O()}/></g>`;
    }
    S += widen(lower + torso + arm);
    if (a.accessory === "walkman")
      S += `<rect x="64" y="${sit ? 92 : 94}" width="7" height="9" rx="1.4" fill="${acc}" ${O(0.9)}/><path d="M67 ${sit ? 92 : 94} Q71 70 64.5 40" stroke="${ink}" stroke-width=".8" fill="none"/>`;
    // neck + head (profile)
    S +=
      fill(masc ? "M57 45 L57 57 Q61 59.4 65.2 57 L65.2 45Z" : "M57.5 45 L57.5 57 Q61 59 64.5 57 L64.5 45Z", skin) +
      flat("M57.5 47 L64.5 47 L64.5 52 Q61 53 57.5 50Z", sS);
    S += fill(
      "M50.5 32 Q50.5 21 61 21 Q72 21 72 33 Q72 44 65 48.5 Q61 50.5 57.5 48.5 L55.5 46 Q52.5 46 52.6 43.6 L52 41.6 Q50.4 41 51 39.6 L51.4 38.4 Q48.4 37.6 50.5 32Z",
      skin,
    );
    S += flat("M66 24 Q72 28 72 33 Q72 44 65 48.5 Q69 38 66 24Z", sS, 0.9);
    if (!(a.hair === "bob" || a.hair === "long" || a.hair === "curly"))
      S += `<ellipse cx="63.5" cy="37" rx="2.2" ry="3" fill="${skin}" ${O(0.9)}/>`;
    if (ligne) {
      S += `<circle cx="54.4" cy="37.4" r="1.3" fill="${ink}"/><path d="M52 32.4 Q54.2 31.6 56.4 32.6" stroke="${ink}" stroke-width=".9" fill="none" stroke-linecap="round"/>`;
      S += `<path d="M52.6 44.6 Q53.8 45.2 55 44.8" stroke="${ink}" stroke-width=".9" fill="none" stroke-linecap="round"/>`;
    } else {
      S += `<path d="M51.6 34.4 Q54 32.8 56.4 34.8" stroke="${ink}" stroke-width="1.7" fill="none" stroke-linecap="round"/><ellipse cx="54.2" cy="37.8" rx="1.6" ry="3.2" fill="${eye}"/><ellipse cx="54.2" cy="39.2" rx="1.1" ry="1.4" fill="${mix(eye, "#ffc0e0", 0.55)}"/><ellipse cx="54" cy="37" rx=".8" ry="1.4" fill="#1a0a20"/><circle cx="54.7" cy="36.4" r=".75" fill="#fff"/>`;
      S += `<path d="M51.5 31 L56 30.2" stroke="${hS}" stroke-width="${masc ? 1.8 : 1}" stroke-linecap="round"/>`;
      if (fem) S += `<path d="M51.6 34.4 l-1.6 -1.1" stroke="${ink}" stroke-width="1.2" stroke-linecap="round"/>`;
      S += `<path d="M52.4 44.4 Q53.8 45.8 55 44.8" stroke="#b03050" stroke-width="1" fill="none" stroke-linecap="round"/>`;
      S += `<path d="M55.5 41 l2.4 -.9 M56.5 42 l2.4 -.9" stroke="#ff8aa0" stroke-width=".6"/>`;
    }
    S += hairFront(a.hair, "W", H, hH, hair, fill);
    S += accessory(a.accessory, "W", acc, fill, O);
    if (!(a.accessory === "cap" || a.accessory === "beanie")) S += rim("M50.8 31 Q51 23 57 21.4", R1);
    S += rim(jacket ? "M71.8 60 L71.6 102" : "M71 60 L71.6 102", R2);
    if (!sit && !skirtish) S += `<g transform="rotate(${ang} 60 104)">${rim("M66 104 L64 158", R2)}</g>`;
    return `${s}<g transform="translate(0 ${bob})">${S}</g>`;
  }

  // ── front and back views ──────────────────────────────────────────────────
  const fx = tq ? -4.2 : 0; // features lean towards the facing
  let F = hairBehind(a.hair, back ? "N" : "S", back ? H : hS, hH, fill);

  // legs
  let L = "";
  if (sit) {
    if (!back) {
      const shin = legBare || shorts ? skin : bot;
      L += fill("M47 110 L47.5 123 L55 123 L56 111Z", shin) + fill("M64 111 L65 123 L72.5 123 L73 110Z", shin);
      L += flat("M69 111 L73 110 L72.5 123 L70 123Z", shade(shin), 0.8);
      L +=
        fill("M45.5 122 Q44.5 129 49.5 129.5 L57 129.5 Q58 125.5 55 122Z", SHOE) +
        fill("M74.5 122 Q75.5 129 70.5 129.5 L63 129.5 Q62 125.5 65 122Z", SHOE);
      L +=
        fill("M44 100 L43.5 111 Q51 114 59 112 L59.5 102Z", bot) +
        fill("M60.5 102 L61 112 Q69 114 76.5 111 L76 100Z", bot);
      L += flat("M68 102 L76 100 L76.5 111 Q72 113 68 113Z", bS, 0.9);
    }
    // seen from behind the seat and the chair back hide the legs
  } else {
    if (legBare) {
      L +=
        fill(`M49 120 L50 ${160 + dyL} L56 ${160 + dyL} L57 122Z`, skin) +
        fill(`M63 122 L64 ${160 + dyR} L70 ${160 + dyR} L71 120Z`, skin);
      L += flat(`M67 122 L71 120 L70 ${160 + dyR} L67.5 ${160 + dyR}Z`, sS, 0.8);
    } else if (shorts) {
      L +=
        fill(`M49 126 L50 ${160 + dyL} L56 ${160 + dyL} L57.5 126Z`, skin) +
        fill(`M62.5 126 L64 ${160 + dyR} L70 ${160 + dyR} L71 126Z`, skin);
      L += flat(`M67 127 L71 126 L70 ${160 + dyR} L67.5 ${160 + dyR}Z`, sS, 0.8);
      L += fill("M46.5 102 L47 129 L58 129 L59.5 106 L60.5 106 L62 129 L73 129 L73.5 102Z", bot);
      L += flat("M66 104 L73.5 102 L73 129 L66.5 129Z", bS);
    } else {
      L +=
        fill(`M47 104 L49 ${160 + dyL} L56 ${160 + dyL} L59.5 106Z`, bot) +
        fill(`M60.5 106 L64 ${160 + dyR} L71 ${160 + dyR} L73 104Z`, bot);
      L +=
        flat(`M67 106 L73 104 L71 ${160 + dyR} L68 ${160 + dyR}Z`, bS) +
        flat(`M54 108 L59.5 106 L56 ${160 + dyL} L54.5 ${160 + dyL}Z`, bS, 0.7);
      if (a.bottom === "jeans")
        L += `<path d="M51.5 110 L52.6 ${157 + dyL} M66.5 110 L67.4 ${157 + dyR}" stroke="${light(bot)}" stroke-width=".7" stroke-dasharray="1.6 1.2" opacity=".7"/>`;
      else
        L += `<path d="M53 109 L52.6 ${158 + dyL} M66.6 109 L67.6 ${158 + dyR}" stroke="${shade(bot)}" stroke-width=".8"/>`;
    }
    const shoe = (dx: number, dy: number, right: boolean) => {
      if (back)
        return `<g transform="translate(${dx} ${dy})">${fill(right ? "M74 159 Q75 166 70 167 L63 167 L63 159Z" : "M46 159 Q45 166 50 167 L57 167 L57 159Z", SHOE)}</g>`;
      const d = right
        ? "M74 159 Q75 167 70 167.5 L62 167.5 Q61 163 64 159Z"
        : "M46 159 Q45 167 50 167.5 L58 167.5 Q59 163 56 159Z";
      const sh = right ? flat("M69 164 Q73 164 74.6 162 Q75 167 70 167.5 L64 167.5Z", mix(SHOE, "#8a70c8", 0.4)) : "";
      const stripe = `<path d="${right ? "M64.5 162.5 Q68.5 161 72.5 162.5" : "M47.5 162.5 Q51.5 161 55.5 162.5"}" stroke="${top}" stroke-width="1.1" fill="none" stroke-linecap="round"/>`;
      return `<g transform="translate(${dx} ${dy})">${fill(d, SHOE)}${sh}${stripe}</g>`;
    };
    L += shoe(0, dyL, false) + shoe(0, dyR, true);
    if (skirtish) {
      const sk = dress ? "M44.5 98 L39 128 Q60 133 81 128 L75.5 98Z" : "M44 100 L40 124 Q60 129 80 124 L76 100Z";
      L +=
        fill(sk, bot) +
        flat(dress ? "M66 99 L75.5 98 L81 128 Q73.5 130.5 66 131Z" : "M66 101 L76 100 L80 124 Q73 126.5 66 127Z", bS);
      L += `<path d="M52 104 L50 ${dress ? 130 : 126} M60 104 V${dress ? 131 : 127} M68 104 L70 ${dress ? 130 : 126}" stroke="${bS}" stroke-width=".8"/>`;
    }
  }

  // arms + torso
  const jacket = a.top === "jacket";
  const short = a.top === "tee" || dress;
  // shoulders: narrower (feminine) or broader (masculine) — arms follow
  const ax = fem ? (jacket ? 0.8 : 1.3) : masc ? (jacket ? -1 : -1.7) : 0;
  const swing = (side: -1 | 1) =>
    `transform="translate(${-side * ax} 0)${st ? ` rotate(${side * st * 5} ${side < 0 ? 46 : 74} 62)` : ""}"`;
  const armL = jacket
    ? "M41 60 Q35 68 36 90 L36 104 Q39 107 42 105 L45 88 Q47 76 49 70Z"
    : "M45 61 Q38 70 37 90 L36 104 Q39 107 42 105 L45 88 Q47 76 49 70Z";
  const armR = jacket
    ? "M79 60 Q85 68 84 90 L84 104 Q81 107 78 105 L75 88 Q73 76 71 70Z"
    : "M75 61 Q82 70 83 90 L84 104 Q81 107 78 105 L75 88 Q73 76 71 70Z";
  const sleeveL = "M45 61 Q39 67 38.5 78 L46.5 79.5 Q47.5 72 49 70Z";
  const sleeveR = "M75 61 Q81 67 81.5 78 L73.5 79.5 Q72.5 72 71 70Z";
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
  // left arm (behind the torso's edge); seated from behind: elbows out, forearms to the desk
  if (backSit) T += fill("M45 61 Q39 68 40 82 Q43 87 47.5 83 L50 70Z", top);
  else T += `<g ${swing(-1)}>${fill(armL, short ? skin : top)}${short ? fill(sleeveL, top) : ""}</g>`;
  if (a.top === "hoodie" && !back) T += fill("M47 58 Q60 47 73 58 Q66 64 60 64 Q54 64 47 58Z", tS);
  T += `<clipPath id="${id}t"><path d="${torso}"/></clipPath>${fill(torso, top)}<g clip-path="url(#${id}t)">`;
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
      default: // tee
        T += fill("M41 100 Q60 105 79 100 L79 104 Q60 109 41 104Z", top, 0.8);
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
  // right arm
  if (backSit)
    T +=
      fill("M75 61 Q81 68 80 82 Q77 87 72.5 83 L70 70Z", top) +
      flat("M77 64 Q81 70 80 82 Q78.5 85 76.5 85 Q79 74 77 64Z", tS);
  else if (sit && !back) {
    // seated facing out: hands rest on the lap
    T += fill("M75 61 Q82 70 81 86 L76 96 Q73 98 71 95 L75 86 Q74 76 71 70Z", short ? skin : top);
    if (short) T += fill(sleeveR, top);
    T += `<ellipse cx="72.5" cy="97" rx="3" ry="3.4" fill="${skin}" ${O()}/>`;
  } else {
    const shadeR = jacket
      ? "M82 66 Q85 74 84 90 L84 104 Q82 106 80 105.5 Q81 84 79 66Z"
      : "M78 66 Q82.5 74 83 90 L84 104 Q82 106 80 105.5 Q81 84 78 66Z";
    T += `<g ${swing(1)}>${fill(armR, short ? skin : top)}${flat(shadeR, short ? sS : tS)}${short ? fill(sleeveR, top) + flat("M77 64 Q80.5 70 81.2 77.6 L78.5 78.4 Q78 70 77 64Z", tS) : ""}<ellipse cx="81" cy="108" rx="3" ry="4" fill="${skin}" ${O()}/></g>`;
  }
  if (!backSit) {
    if (sit && !back) T += `<ellipse cx="47.5" cy="97" rx="3" ry="3.4" fill="${skin}" ${O()}/>`;
    else T += `<g ${swing(-1)}><ellipse cx="39" cy="108" rx="3" ry="4" fill="${skin}" ${O()}/></g>`;
  }
  if (a.accessory === "walkman") {
    if (back) T += `<rect x="64" y="94" width="8" height="10" rx="1.6" fill="${acc}" ${O(0.9)}/>`;
    else
      T += `<rect x="${68 + fx * 0.4}" y="92" width="8" height="10" rx="1.6" fill="${acc}" ${O(0.9)}/><rect x="${69.6 + fx * 0.4}" y="94" width="4.8" height="2.8" rx=".6" fill="${ink}"/><path d="M${72 + fx * 0.4} 92 Q75 70 ${66 + fx} 46" stroke="${ink}" stroke-width=".8" fill="none"/>`;
  }
  F += widen(L + T);

  // neck + head
  F +=
    fill(
      masc
        ? "M55 45 L55 57 Q60 59.6 65 57 L65 45Z"
        : fem
          ? "M56.6 45 L56.6 57 Q60 58.6 63.4 57 L63.4 45Z"
          : "M56 45 L56 57 Q60 59 64 57 L64 45Z",
      skin,
    ) + flat("M56 47 L64 47 L64 51 Q60 53 56 50Z", sS);
  if (!back && !jacket && a.top !== "shirt") F += `<path d="M53 56 Q60 61 67 56" fill="none" ${O()}/>`;
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
      return `${lash}<path d="M${cx - 3.5 * k} 35.5 Q${cx} 32.5 ${cx + 3.5 * k} 34.6" stroke="${ink}" stroke-width="1.8" fill="none" stroke-linecap="round"/><ellipse cx="${cx}" cy="38" rx="${2.3 * k}" ry="${masc ? 3 : 3.4}" fill="${eye}"/><ellipse cx="${cx}" cy="39.4" rx="${1.5 * k}" ry="1.6" fill="${mix(eye, "#ffc0e0", 0.55)}"/><ellipse cx="${cx}" cy="37.2" rx="${1.1 * k}" ry="1.5" fill="#1a0a20"/><circle cx="${cx + 0.8}" cy="36.5" r=".9" fill="#fff"/>`;
    };
    if (ligne) {
      // Ligne claire: dot eyes, thin brows, a nose hook, a line for a mouth
      const k = tq ? 0.8 : 1;
      Hd += `<circle cx="${55.5 + fx}" cy="37.6" r="${1.35 * k}" fill="${ink}"/><circle cx="${64.5 + fx}" cy="37.6" r="1.35" fill="${ink}"/>`;
      Hd += `<path d="M${53 + fx} 33.4 Q${55.5 + fx} 32.4 ${58 + fx} 33.3 M${62 + fx} 33.3 Q${64.5 + fx} 32.4 ${67 + fx} 33.4" stroke="${ink}" stroke-width="${masc ? 1.6 : 0.9}" fill="none" stroke-linecap="round"/>`;
      if (fem)
        Hd += `<path d="M${54.1 + fx} 36.6 l-1.3 -1 M${65.9 + fx} 36.6 l1.3 -1" stroke="${ink}" stroke-width=".8" stroke-linecap="round"/>`;
      Hd += tq
        ? `<path d="M58.4 38.6 Q56.4 41.6 58.4 42.2" stroke="${ink}" stroke-width=".9" fill="none" stroke-linecap="round"/>`
        : `<path d="M60.5 38.5 Q62.2 41.5 60 42" stroke="${ink}" stroke-width=".9" fill="none" stroke-linecap="round"/>`;
      Hd += `<path d="M${57.5 + fx} 45 Q${60 + fx} 46.2 ${62.5 + fx} 45" stroke="${ink}" stroke-width=".9" fill="none" stroke-linecap="round"/>`;
    } else {
      Hd += eyeAt(55 + fx, tq, -1) + eyeAt(65 + fx, false, 1);
      Hd += `<path d="M${52.5 + fx} 31 L${57.5 + fx} 30.2 M${62.5 + fx} 30.2 L${67.5 + fx} 31" stroke="${hS}" stroke-width="${masc ? 1.8 : 1}" stroke-linecap="round"/>`;
      Hd += tq
        ? `<path d="M58.6 39.5 L56.6 42.4 L58.4 42.6" stroke="${sS}" stroke-width=".9" fill="none"/>`
        : `<path d="M60.3 40.5 L59.6 42.6 L60.6 42.6" stroke="${sS}" stroke-width=".8" fill="none"/>`;
      Hd += `<path d="M${57.5 + fx} 44.8 Q${60 + fx} 46.8 ${62.5 + fx} 44.8" stroke="${fem ? "#c8305a" : "#b03050"}" stroke-width="${fem ? 1.5 : 1.1}" fill="none" stroke-linecap="round"/>`;
      Hd += `<path d="M${51 + fx} 41.5 l2.5 -1 M${52 + fx} 42.5 l2.5 -1 M${65.5 + fx} 40.5 l2.5 1 M${66.5 + fx} 41.5 l2.5 1" stroke="#ff8aa0" stroke-width=".6"/>`;
    }
    Hd += hairFront(a.hair, view, H, hH, hair, fill);
  }
  Hd += accessory(a.accessory, view, acc, fill, O);
  // seated at a desk from behind, the head dips towards the screen
  F += backSit ? `<g transform="translate(0 2.2)">${Hd}</g>` : Hd;

  // rim light (scene-coloured)
  if (!backSit) {
    F += widen(
      `<g transform="translate(${-ax} 0)">${sit ? "" : rim("M83.6 90 L84.4 103", R2)}</g>` +
        `<g transform="translate(${ax} 0)">${rim(jacket ? "M40.6 63 Q35.6 70 36.5 88" : "M44.5 61 Q38.5 70 37.6 88", R1)}</g>` +
        (sit || skirtish ? "" : rim(`M72.6 104.5 L71 ${158 + dyR}`, R2)),
    );
  }
  const hat = a.accessory === "cap" || a.accessory === "beanie";
  if (!hat) F += rim("M48.6 32 Q49 23 56 21.6", R1);

  const body = `<g transform="translate(0 ${bob})">${F}</g>`;
  // turned away or ¾ towards you: the body reads a little narrower
  const k = nw ? 0.88 : tq ? 0.95 : 1;
  return s + (k === 1 ? body : `<g transform="translate(60 0) scale(${k} 1) translate(-60 0)">${body}</g>`);
}

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
    };
    let g = d[style] ? fill(d[style], c) : "";
    if (style === "bun") g += fill("M64 13 a7 7 0 1 1 14 0 a7 7 0 1 1 -14 0Z", c);
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
  };
  const shift = (g: string) => (nw ? `<g transform="translate(2.5 0)">${g}</g>` : g);
  if (style === "bald") return `<ellipse cx="56" cy="26" rx="5" ry="2.4" fill="#fff" opacity=".25"/>`;
  if (style === "mohawk")
    return `<path d="M48 34 Q48 21 60 21 Q72 21 72 34 Q72 45 63 49 Q60 50.5 57 49 Q48 45 48 34Z" fill="${hair}" opacity=".3"/>${shift(fill("M56 46 Q54 22 55 12 Q60 5 65 12 Q66 22 64 46Z", H))}`;
  let g = fill(d[style] ?? d.short, H);
  g += `<path d="M52 22 Q60 18 68 22" stroke="${hH}" stroke-width="2" fill="none" stroke-linecap="round" opacity=".8"/>`;
  if (style === "curly" || style === "afro")
    g += `<path d="M48 26 q3 -3 6 0 M60 22 q3 -3 6 0 M66 32 q3 -3 6 0 M50 40 q3 -3 6 0 M60 44 q3 -3 6 0" stroke="${hS}" stroke-width="1.1" fill="none" stroke-linecap="round"/>`;
  else
    g += `<path d="M62 20 Q66 32 64 44 M56 22 Q53 34 55 44" stroke="${hS}" stroke-width=".9" fill="none" opacity=".7"/>`;
  if (style === "bun")
    g += `<circle cx="60" cy="12" r="7.5" fill="${H}" ${O()}/><path d="M55 11 q5 -4 10 0" stroke="${hH}" stroke-width="1.4" fill="none"/>`;
  return shift(g);
}

// fringe and locks in front of the face (S, SW, W)
function hairFront(style: string, view: View, H: string, hH: string, hair: string, fill: Fill): string {
  const side = view === "W";
  const shine = side
    ? `<path d="M53 21.5 Q60 17.5 68 20.5" stroke="${hH}" stroke-width="2" fill="none" stroke-linecap="round" opacity=".85"/>`
    : `<path d="M50 23 Q60 18.5 70 23 L69 25 Q60 21 51 25Z" fill="${hH}" opacity=".85"/>`;
  if (style === "bald") return `<ellipse cx="${side ? 60 : 56}" cy="25" rx="5" ry="2.4" fill="#fff" opacity=".25"/>`;
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
