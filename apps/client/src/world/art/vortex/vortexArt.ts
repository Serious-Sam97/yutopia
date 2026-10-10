// GENERATED — copied verbatim from yondra-frontend/src/lib/vortexArt.ts by
// tools/sync-vortex-art.mjs. Don't edit here: change Yondra's file and re-sync.
// (excluded from Biome in biome.json)
// Vortex's body, drawn as one SVG string per expression. MK-V (Lado B · the
// rig): every open-eyed face carries the parts the body engine animates through
// CSS variables — per-eye blink lids (--vx-bl / --vx-br), dilating pupils
// (--vx-dil), micro-saccades (--vx-sacx/y) and the gaze (--vx-lx/ly) — so he
// can blink, stare and twitch without re-rendering React. 35 expressions, plus
// optional scars (B-18), the dark transformation (B-15) and tape tears (B-16).

export type VortexMood =
  // the originals (MK-II…IV)
  | "dormant"
  | "curious"
  | "smug"
  | "hungry"
  | "judging"
  | "sleepy"
  | "dizzy"
  | "happy"
  | "yawn"
  | "mourning"
  | "possessed"
  // MK-V · the 24 new faces (B-01)
  | "disgust"
  | "bored"
  | "terror"
  | "ecstasy"
  | "guilt"
  | "crying"
  | "hysterical"
  | "sideeye"
  | "crosseyed"
  | "drunk"
  | "asleep"
  | "seething"
  | "fury"
  | "love"
  | "dead"
  | "dreaming"
  | "lying"
  | "focused"
  | "shocked"
  | "embarrassed"
  | "malicious"
  | "empty"
  | "paranoid"
  | "sulking";

export const ALL_MOODS: VortexMood[] = [
  "dormant",
  "curious",
  "smug",
  "hungry",
  "judging",
  "sleepy",
  "dizzy",
  "happy",
  "yawn",
  "mourning",
  "possessed",
  "disgust",
  "bored",
  "terror",
  "ecstasy",
  "guilt",
  "crying",
  "hysterical",
  "sideeye",
  "crosseyed",
  "drunk",
  "asleep",
  "seething",
  "fury",
  "love",
  "dead",
  "dreaming",
  "lying",
  "focused",
  "shocked",
  "embarrassed",
  "malicious",
  "empty",
  "paranoid",
  "sulking",
];

export type VortexPose =
  | "rest"
  | "grab"
  | "crossed"
  | "poke"
  | "stomp"
  | "wave"
  | "none";

/** A permanent mark from your history together (B-18). */
export type VortexScar = "splice" | "burn" | "label" | "crack" | "stitch";

export interface VortexArtOptions {
  scars?: VortexScar[];
  /** 0..1 — how far the dark transformation has gone (B-15) */
  dark?: number;
  /** tape tears running down (B-16) */
  tears?: boolean;
  /** C-19 · how many days you've had him (he ages) */
  age?: number;
  /** C-21 · emergent traits leave marks */
  traits?: string[];
  /** H-10/H-11 · the twin wearing his place: negative palette, fixed smile */
  twin?: boolean;
  /** N-05 · the splicer's eye mod: an iris colour and a pupil shape */
  eye?: { id: string; color: string };
}

const W = "#ffffff";
const INK = "#1a0033";
const ARM = "#2a0a40";
const TAPE = "#5a3418";
const LX = 59;
const RX = 81;
const EY = 63;

function defaultPose(mood: VortexMood): VortexPose {
  switch (mood) {
    case "hungry":
      return "grab";
    case "judging":
    case "mourning":
    case "sulking":
    case "seething":
      return "crossed";
    case "sleepy":
    case "dormant":
    case "yawn":
    case "asleep":
    case "dreaming":
    case "dead":
    case "crying":
    case "terror":
    case "empty":
      return "none";
    case "happy":
    case "hysterical":
    case "ecstasy":
      return "wave";
    case "fury":
      return "stomp";
    default:
      return "rest";
  }
}

/* resting gaze per mood (the cursor adds a small offset on top) */
function gaze(mood: VortexMood): [number, number] {
  switch (mood) {
    case "curious":
      return [2.6, -2.6];
    case "judging":
      return [-1.5, 0.5];
    case "hungry":
      return [0, 1.5];
    case "sideeye":
    case "lying":
      return [4.2, 0.6];
    case "paranoid":
      return [-4.4, -1.2];
    case "guilt":
    case "embarrassed":
    case "sulking":
      return [-2.4, 3.4];
    case "focused":
      return [0, -0.6];
    case "dreaming":
      return [0, -3.6];
    default:
      return [0, 0.5];
  }
}

const PUPIL_R: Partial<Record<VortexMood, number>> = {
  hungry: 4.8,
  terror: 1.8,
  shocked: 2.2,
  ecstasy: 5.6,
  love: 5.2,
  focused: 3.2,
  malicious: 3.4,
  paranoid: 2.6,
};

export function vortexSvg(
  mood: VortexMood,
  uid: string,
  pose: VortexPose = defaultPose(mood),
  opts: VortexArtOptions = {},
): string {
  const id = `vx${uid}`;
  const red = mood === "possessed";
  const dark = Math.max(0, Math.min(1, opts.dark ?? 0));
  const holes = dark > 0.66; // B-15: the eyes become holes
  const [px, py] = gaze(mood);

  /* ── pupils ── */
  const pupil = (cx: number, side: "l" | "r") => {
    if (red)
      return `<ellipse cx="${cx + px}" cy="${EY + py}" rx="4.6" ry="5.4" fill="#ff2d2d"/><ellipse cx="${cx + px}" cy="${EY + py}" rx="1.1" ry="4.6" fill="#120000"/>`;
    if (mood === "dizzy")
      return `<path d="M${cx - 3.5} ${EY - 3.5} l7 7 M${cx + 3.5} ${EY - 3.5} l-7 7" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`;
    if (mood === "drunk")
      return `<path d="M${cx} ${EY} m-4.6 0 a4.6 4.6 0 1 0 4.6 -4.6 a3 3 0 1 0 -3 3 a1.4 1.4 0 1 0 1.4 -1.4" fill="none" stroke="${INK}" stroke-width="1.5" stroke-linecap="round"/>`;
    if (mood === "love")
      // reels for eyes: he's smitten with a tape
      return `<g class="vxr-pupil"><circle cx="${cx}" cy="${EY + 0.5}" r="5.2" fill="${INK}"/><circle cx="${cx}" cy="${EY + 0.5}" r="2" fill="#ff8fd4"/>${[
        0, 120, 240,
      ]
        .map(
          (a) =>
            `<rect x="${cx - 0.7}" y="${EY - 4.2}" width="1.4" height="2.4" fill="#ff8fd4" transform="rotate(${a} ${cx} ${EY + 0.5})"/>`,
        )
        .join("")}</g>`;
    let dx = px;
    if (mood === "crosseyed") dx = side === "l" ? 3.4 : -3.4;
    const r = PUPIL_R[mood] ?? 4;
    const mod = opts.eye;
    if (mod) {
      const x = cx + dx;
      const y = EY + py;
      const iris =
        mod.id === "eye-hetero"
          ? side === "l"
            ? "#8fe3e3"
            : "#ffb347"
          : mod.color;
      const ring = `<circle cx="${x}" cy="${y}" r="${r + 1.8}" fill="${iris}"/>`;
      const glint = `<circle cx="${x + r * 0.42}" cy="${y - r * 0.5}" r="${Math.max(0.6, r * 0.34)}" fill="#fff"/>`;
      if (mod.id === "eye-slit")
        return `<g class="vxr-pupil"><circle cx="${x}" cy="${y}" r="${r + 1.8}" fill="#e8c23a"/><ellipse cx="${x}" cy="${y}" rx="1.1" ry="${r + 1.2}" fill="${INK}"/>${glint}</g>`;
      if (mod.id === "eye-star") {
        const pts = Array.from({ length: 10 }, (_, k) => {
          const a = (Math.PI / 5) * k - Math.PI / 2;
          const rr = k % 2 ? r * 0.45 : r * 1.05;
          return `${(x + Math.cos(a) * rr).toFixed(2)},${(y + Math.sin(a) * rr).toFixed(2)}`;
        }).join(" ");
        return `<g class="vxr-pupil">${ring}<polygon points="${pts}" fill="${INK}"/>${glint}</g>`;
      }
      if (mod.id === "eye-reel")
        return `<g class="vxr-pupil">${ring}<circle cx="${x}" cy="${y}" r="${r}" fill="${INK}"/>${[0, 120, 240].map((a) => `<circle cx="${x}" cy="${y - r * 0.5}" r="${r * 0.22}" fill="${iris}" transform="rotate(${a} ${x} ${y})"/>`).join("")}</g>`;
      return `<g class="vxr-pupil">${ring}<circle cx="${x}" cy="${y}" r="${r}" fill="${INK}"/>${glint}</g>`;
    }
    return `<g class="vxr-pupil"><circle cx="${cx + dx}" cy="${EY + py}" r="${r}" fill="${INK}"/><circle cx="${cx + dx + r * 0.42}" cy="${EY + py - r * 0.5}" r="${Math.max(0.6, r * 0.34)}" fill="#fff"/><circle cx="${cx + dx - r * 0.35}" cy="${EY + py + r * 0.45}" r=".6" fill="#fff" opacity=".8"/></g>`;
  };

  /* ── eyes ── */
  let eyes: string;
  const closedDown = (cx: number) =>
    `<path d="M${cx - 7} ${EY + 1} Q${cx} ${EY + 7} ${cx + 7} ${EY + 1}" fill="none" stroke="${W}" stroke-width="2.4" stroke-linecap="round"/>`;
  const closedUp = (cx: number) =>
    `<path d="M${cx - 7} ${EY + 3} Q${cx} ${EY - 6} ${cx + 7} ${EY + 3}" fill="none" stroke="${W}" stroke-width="2.8" stroke-linecap="round"/>`;
  if (["dormant", "yawn", "asleep", "dreaming"].includes(mood)) {
    eyes = [LX, RX].map(closedDown).join("");
  } else if (["happy", "hysterical", "ecstasy"].includes(mood)) {
    eyes = [LX, RX].map(closedUp).join("");
  } else if (mood === "dead") {
    // X'd out with masking tape
    eyes = [LX, RX]
      .map(
        (cx) =>
          `<g transform="rotate(-8 ${cx} ${EY})"><rect x="${cx - 9}" y="${EY - 2}" width="18" height="4" fill="#d9c9a0" transform="rotate(45 ${cx} ${EY})"/><rect x="${cx - 9}" y="${EY - 2}" width="18" height="4" fill="#e6d7b0" transform="rotate(-45 ${cx} ${EY})"/></g>`,
      )
      .join("");
  } else if (mood === "empty") {
    eyes = [LX, RX]
      .map(
        (cx) =>
          `<ellipse cx="${cx}" cy="${EY}" rx="8.2" ry="10.2" fill="${W}"/><ellipse cx="${cx}" cy="${EY}" rx="8.2" ry="10.2" fill="url(#${id}es)"/>`,
      )
      .join("");
  } else if (mood === "crying") {
    eyes = [LX, RX]
      .map(
        (cx) =>
          `<path d="M${cx - 7} ${EY + 2} Q${cx} ${EY - 5} ${cx + 7} ${EY + 2}" fill="none" stroke="${W}" stroke-width="2.6" stroke-linecap="round"/><path d="M${cx - 6} ${EY + 4} Q${cx} ${EY + 8} ${cx + 6} ${EY + 4}" fill="none" stroke="#9fd8ff" stroke-width="1.6" stroke-linecap="round" opacity=".9"/>`,
      )
      .join("");
  } else {
    const sclera = holes ? "#050006" : W;
    eyes = `<g class="vxa-eyesg">${[LX, RX]
      .map(
        (cx) =>
          `<ellipse cx="${cx}" cy="${EY}" rx="8.2" ry="10.2" fill="${sclera}"/>${holes ? `<ellipse cx="${cx}" cy="${EY}" rx="8.2" ry="10.2" fill="none" stroke="#ff3b2f" stroke-opacity="${(dark - 0.66) * 2}" stroke-width="1"/>` : `<ellipse cx="${cx}" cy="${EY}" rx="8.2" ry="10.2" fill="url(#${id}es)"/>`}`,
      )
      .join(
        "",
      )}${holes ? "" : `<g class="vxa-pupils"><g class="vxr-eye vxr-eye--l">${pupil(LX, "l")}</g><g class="vxr-eye vxr-eye--r">${pupil(RX, "r")}</g></g>`}${
      // B-04 · per-eye blink lids, driven by the body engine (scaleY 0→1)
      [LX, RX]
        .map(
          (cx, i) =>
            `<g clip-path="url(#${id}e${cx})"><rect class="vxr-lid vxr-lid--${i === 0 ? "l" : "r"}" x="${cx - 10}" y="${EY - 12}" width="20" height="24" fill="url(#${id}lid)"/></g>`,
        )
        .join("")
    }</g>`;
  }

  /* ── lids (mood shape) ── */
  const lidAt: Partial<Record<VortexMood, [number, number]>> = {
    smug: [0, 4.5],
    mourning: [4, 4],
    sleepy: [6, 6],
    judging: [3, 3],
    possessed: [-1, -1],
    bored: [5.5, 5.5],
    sideeye: [4, 4],
    seething: [2.5, 2.5],
    guilt: [1.5, 1.5],
    sulking: [4.5, 3],
    malicious: [2, 3.5],
    drunk: [4.5, 6],
    focused: [2, 2],
    lying: [1, 3.5],
    embarrassed: [3, 3],
  };
  let lids = "";
  const lid = lidAt[mood];
  if (lid && eyes.includes("vxa-eyesg"))
    lids = (
      [
        [LX, lid[0]],
        [RX, lid[1]],
      ] as const
    )
      .map(([cx, d]) => {
        const bend = mood === "smug" || mood === "malicious" ? -1 : 1;
        return `<g clip-path="url(#${id}e${cx})"><path d="M${cx - 10} ${EY - 12} H${cx + 10} V${EY - 3 + d} Q${cx} ${EY + d + bend} ${cx - 10} ${EY - 3 + d} Z" fill="url(#${id}lid)"/><path d="M${cx + 10} ${EY - 3 + d} Q${cx} ${EY + d + bend} ${cx - 10} ${EY - 3 + d}" fill="none" stroke="${INK}" stroke-width="1.4"/></g>`;
      })
      .join("");
  if (mood === "judging" || mood === "disgust" || mood === "seething")
    lids += [LX, RX]
      .map(
        (cx) =>
          `<g clip-path="url(#${id}e${cx})"><path d="M${cx - 10} ${EY + 12} H${cx + 10} V${EY + (mood === "disgust" ? 3 : 5)} Q${cx} ${EY + (mood === "disgust" ? 1 : 3)} ${cx - 10} ${EY + (mood === "disgust" ? 3 : 5)} Z" fill="url(#${id}lid)"/></g>`,
      )
      .join("");

  /* ── brows ── */
  const browPath: Partial<Record<VortexMood, string>> = {
    curious: "M50 49 Q57 42 65 47 M74 51 Q81 49 89 51",
    smug: "M51 50 Q58 48 65 51 M74 49 Q82 43 90 47",
    hungry: "M50 48 Q57 44 64 49 M75 49 Q82 44 89 48",
    judging: "M50 51 L66 54 M73 54 L89 51",
    possessed: "M48 46 L66 56 M73 56 L91 46",
    dizzy: "M51 49 Q57 45 64 50 M75 50 Q82 45 88 49",
    happy: "M51 49 Q58 44 65 48 M74 48 Q81 44 89 49",
    mourning: "M51 47 Q58 51 65 50 M74 50 Q81 51 89 47",
    yawn: "M51 47 Q58 43 65 47 M74 47 Q81 43 89 47",
    disgust: "M50 50 Q58 46 66 52 M73 52 Q81 46 89 50",
    bored: "M51 52 H65 M74 52 H88",
    terror: "M50 46 Q57 40 64 44 M75 44 Q82 40 89 46",
    ecstasy: "M51 47 Q58 41 65 46 M74 46 Q81 41 89 47",
    guilt: "M51 46 Q58 50 65 52 M74 52 Q81 50 88 46",
    crying: "M51 46 Q58 51 65 53 M74 53 Q81 51 88 46",
    hysterical: "M50 46 Q58 42 65 47 M74 47 Q81 42 89 46",
    sideeye: "M51 51 H65 M74 48 Q82 46 89 50",
    crosseyed: "M51 47 Q58 45 65 49 M74 49 Q81 45 88 47",
    drunk: "M50 52 Q58 48 65 51 M74 47 Q82 45 89 49",
    seething: "M49 49 L66 56 M73 56 L90 49",
    fury: "M47 45 L67 57 M72 57 L92 45",
    love: "M51 48 Q58 43 65 47 M74 47 Q81 43 89 48",
    dead: "M51 47 H65 M74 47 H88",
    lying: "M51 49 Q58 47 65 49 M74 46 Q81 42 89 46",
    focused: "M51 51 L65 52 M74 52 L88 51",
    shocked: "M51 44 Q58 38 65 43 M74 43 Q81 38 88 44",
    embarrassed: "M51 47 Q58 50 65 50 M74 50 Q81 50 88 47",
    malicious: "M49 47 L66 54 M73 54 L90 47",
    paranoid: "M50 47 Q57 43 64 49 M75 47 Q82 43 89 48",
    sulking: "M50 49 L65 53 M74 53 L89 49",
  };
  const browColor = red || mood === "fury" ? "#ff5a3c" : INK;
  const brows = browPath[mood]
    ? `<path d="${browPath[mood]}" stroke="${browColor}" stroke-width="3" stroke-linecap="round" fill="none"/>`
    : "";

  /* ── mouth ── */
  let mouth: string;
  if (mood === "yawn")
    mouth = `<ellipse cx="70" cy="85" rx="9" ry="11" fill="${INK}" stroke="${W}" stroke-width="1.6"/><ellipse cx="70" cy="91" rx="5" ry="3" fill="#ff5fa8"/>`;
  else if (mood === "mourning" || mood === "sulking" || mood === "guilt")
    mouth = `<path d="M62 85 Q70 81 78 85" stroke="${W}" stroke-width="2.2" fill="none" stroke-linecap="round"/>${mood === "guilt" ? `<path d="M62 85 q2 -1 4 0 q2 1 4 0 q2 -1 4 0 q2 1 4 0" stroke="${W}" stroke-width="1" fill="none" opacity=".5"/>` : ""}`;
  else if (mood === "hungry")
    mouth = `<path d="M55 80 Q70 98 85 80 Q70 86 55 80Z" fill="${INK}" stroke="${W}" stroke-width="1.6" stroke-linejoin="round"/><path d="M58 81.5 l2.6 4 l2.6 -3.4 l2.6 4 l2.6 -3.4 l2.6 4 l2.6 -3.4 l2.6 4 l2.6 -3.4 l2.6 4 l2.6 -3.4" fill="none" stroke="${W}" stroke-width="1.2" stroke-linejoin="round"/><ellipse cx="72" cy="89.5" rx="5.5" ry="2.4" fill="#ff5fa8"/>`;
  else if (red || (dark > 0.5 && mood !== "dead"))
    // B-15 · the mouth tears past the outline of his body
    mouth = `<path d="M${50 - dark * 16} 78 Q70 ${100 + dark * 8} ${90 + dark * 16} 78 Q70 88 ${50 - dark * 16} 78Z" fill="#120000" stroke="#ff5a3c" stroke-width="1.2"/><path d="M53 79.5 l2.4 4 l2.4 -3 l2.4 5 l2.4 -4 l2.4 5 l2.4 -4 l2.4 5 l2.4 -4 l2.4 5 l2.4 -4 l2.4 4 l2.4 -3 l2.4 4 l2.4 -3" fill="none" stroke="${W}" stroke-width="1.2"/>`;
  else if (mood === "sleepy" || mood === "dizzy")
    mouth = `<ellipse cx="72" cy="83" rx="2.8" ry="3.4" fill="${INK}" stroke="${W}" stroke-width="1.3"/>`;
  else if (mood === "dormant" || mood === "asleep" || mood === "dreaming")
    mouth = `<path d="M64 81 Q70 84 76 81" stroke="${W}" stroke-width="2" fill="none" stroke-linecap="round" opacity=".85"/>`;
  else if (mood === "judging" || mood === "bored" || mood === "focused")
    mouth = `<path d="M${mood === "bored" ? 64 : 61} 83 H${mood === "bored" ? 76 : 79}" stroke="${W}" stroke-width="2.4" stroke-linecap="round"/>`;
  else if (mood === "curious")
    mouth = `<ellipse cx="71" cy="82" rx="3.4" ry="2.8" fill="${INK}" stroke="${W}" stroke-width="1.6"/>`;
  else if (mood === "happy" || mood === "ecstasy" || mood === "love")
    mouth = `<path d="M57 78 Q70 94 83 78 Q70 84 57 78Z" fill="${INK}" stroke="${W}" stroke-width="1.8" stroke-linejoin="round"/><ellipse cx="70" cy="85.5" rx="4.5" ry="2" fill="#ff5fa8"/>`;
  else if (mood === "hysterical")
    mouth = `<path d="M54 77 Q70 100 86 77 Z" fill="${INK}" stroke="${W}" stroke-width="1.8" stroke-linejoin="round"/><path d="M57 78.5 H83" stroke="${W}" stroke-width="2.2"/><ellipse cx="70" cy="91" rx="6" ry="3" fill="#ff5fa8"/>`;
  else if (mood === "terror" || mood === "shocked")
    mouth = `<ellipse cx="70" cy="86" rx="${mood === "terror" ? 7 : 5}" ry="${mood === "terror" ? 10 : 7}" fill="${INK}" stroke="${W}" stroke-width="1.6"/>`;
  else if (mood === "disgust")
    mouth = `<path d="M60 84 Q65 80 70 84 Q75 88 80 82" stroke="${W}" stroke-width="2.2" fill="none" stroke-linecap="round"/><path d="M71 85 q2 6 5 1" fill="#ff5fa8" stroke="${W}" stroke-width="1"/>`;
  else if (mood === "drunk")
    mouth = `<path d="M60 82 l4 3 l4 -3 l4 3 l4 -3 l4 3" stroke="${W}" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  else if (mood === "seething")
    mouth = `<rect x="59" y="79" width="22" height="8" rx="2" fill="${W}" stroke="${INK}" stroke-width="1.2"/><path d="M63 79 v8 M67 79 v8 M71 79 v8 M75 79 v8 M79 79 v8 M59 83 H81" stroke="${INK}" stroke-width=".9"/>`;
  else if (mood === "fury")
    mouth = `<path d="M56 88 Q70 74 84 88 Z" fill="${INK}" stroke="#ff5a3c" stroke-width="1.6"/><path d="M59 86 l2.5 -3 l2.5 3 l2.5 -3 l2.5 3 l2.5 -3 l2.5 3 l2.5 -3 l2.5 3 l2.5 -3" stroke="${W}" stroke-width="1.1" fill="none"/>`;
  else if (mood === "malicious")
    mouth = `<path d="M50 78 Q70 92 90 76" stroke="${W}" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M58 81 l2 3 l2 -2.4 l2 3 l2 -2.4 l2 3 l2 -2.4 l2 3 l2 -2.4 l2 3 l2 -2.6 l2 2.6" stroke="${W}" stroke-width="1.1" fill="none"/>`;
  else if (mood === "embarrassed")
    mouth = `<path d="M65 82 Q70 85 75 82" stroke="${W}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  else if (mood === "crying")
    mouth = `<path d="M60 89 Q70 79 80 89" stroke="${W}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
  else if (mood === "dead")
    mouth = `<path d="M62 84 q4 -3 8 0 q4 3 8 0" stroke="${W}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  else if (mood === "empty") mouth = "";
  else if (mood === "paranoid")
    mouth = `<path d="M63 84 q3.5 -2 7 0 q3.5 2 7 0" stroke="${W}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  else if (mood === "lying" || mood === "sideeye")
    mouth = `<path d="M62 82 Q72 86 82 79" stroke="${W}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
  else if (mood === "crosseyed")
    mouth = `<path d="M64 81 Q70 87 76 81" stroke="${W}" stroke-width="2.2" fill="none" stroke-linecap="round"/><path d="M69 84 q1.5 4 3 0" fill="#ff5fa8"/>`;
  else
    mouth = `<path d="M60 79 Q72 88 84 77" stroke="${W}" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M66 82.6 l1 2.6 l1.4 -2" stroke="${W}" stroke-width="1.3" fill="none" stroke-linejoin="round"/>`;

  /* ── arms (the old white-gloved poses) ── */
  const hand = (x: number, y: number) =>
    `<circle cx="${x}" cy="${y}" r="5.4" fill="${W}" stroke="${INK}" stroke-width="1.2"/><circle cx="${x - 1.7}" cy="${y - 1.7}" r="1.4" fill="#ffd6ef"/>`;
  const arm = (d: string) =>
    `<path d="${d}" stroke="${ARM}" stroke-width="4.6" fill="none" stroke-linecap="round"/>`;
  const restL = arm("M37 82 Q29 90 31 99") + hand(31, 100);
  let arms = "";
  if (pose === "rest")
    arms = restL + arm("M103 82 Q111 90 109 99") + hand(109, 100);
  else if (pose === "grab")
    arms =
      arm("M37 76 Q22 70 18 58") +
      hand(17, 56) +
      arm("M103 76 Q118 70 122 58") +
      hand(123, 56);
  else if (pose === "crossed")
    arms =
      arm("M38 92 Q60 106 86 98") +
      arm("M102 92 Q80 106 54 98") +
      hand(86, 98) +
      hand(54, 98);
  else if (pose === "poke")
    arms =
      restL +
      arm("M103 72 Q114 62 117 52") +
      `<path d="M113 60 L148 38" stroke="#8a5a32" stroke-width="2.6" stroke-linecap="round"/><path d="M136 46 l5 -7 M143 41 l4 -6" stroke="#8a5a32" stroke-width="1.4"/>` +
      hand(117, 52);
  else if (pose === "stomp")
    arms =
      arm("M37 74 Q25 62 27 50") +
      hand(27, 48) +
      arm("M103 74 Q115 62 113 50") +
      hand(113, 48) +
      `<path d="M60 104 v11 M80 104 v11" stroke="${ARM}" stroke-width="5" stroke-linecap="round"/><ellipse cx="58" cy="117" rx="7" ry="3.4" fill="${W}" stroke="${INK}"/><ellipse cx="82" cy="113" rx="7" ry="3.4" fill="${W}" stroke="${INK}"/>`;
  else if (pose === "wave")
    arms = restL + arm("M103 74 Q117 64 119 48") + hand(119, 46);

  /* ── extras per mood ── */
  let extra = "";
  if (mood === "sleepy")
    extra = `<path d="M44 48 Q66 22 104 40 L120 12 Z" fill="#6a1a8a"/><path d="M58 35 Q78 28 101 40 M74 28 Q90 24 108 33" stroke="${W}" stroke-width="4" fill="none" opacity=".9"/><path d="M42 49 Q70 32 106 44" stroke="${W}" stroke-width="6" fill="none" stroke-linecap="round"/><circle cx="121" cy="11" r="6" fill="${W}"/><text x="104" y="74" font-family="monospace" font-size="14" fill="#00e5d0">z</text><text x="112" y="62" font-family="monospace" font-size="18" fill="#00e5d0" opacity=".8">z</text>`;
  else if (mood === "asleep")
    extra = `<g class="vxr-zz"><text x="104" y="60" font-family="monospace" font-size="15" fill="#ffb347">z</text><text x="113" y="46" font-family="monospace" font-size="19" fill="#ffb347" opacity=".8">z</text><text x="123" y="30" font-family="monospace" font-size="23" fill="#ffb347" opacity=".55">z</text></g>`;
  else if (mood === "dreaming")
    extra = `<g class="vxr-dreamdots"><circle cx="104" cy="44" r="2.6" fill="#f3e4bd"/><circle cx="112" cy="34" r="3.6" fill="#f3e4bd"/><circle cx="122" cy="22" r="4.6" fill="#f3e4bd"/></g>`;
  else if (mood === "curious")
    extra = `<text x="106" y="40" font-family="monospace" font-size="26" fill="#00e5d0">?</text>`;
  else if (mood === "mourning")
    extra = `<path d="M44 40 h52 v4 h-52 Z" fill="#0c0610"/><path d="M54 40 V14 h32 V40 Z" fill="#120a18"/><path d="M54 32 h32 v4 h-32 Z" fill="#6a1a8a"/><path d="M60 104 l-8 -5 v10 Z M80 104 l8 -5 v10 Z" fill="#0c0610"/><circle cx="70" cy="104" r="3" fill="#0c0610"/>`;
  else if (mood === "yawn")
    extra = `<text x="102" y="52" font-family="monospace" font-size="13" fill="#00e5d0" opacity=".8">*yawn*</text>`;
  else if (mood === "dizzy" || mood === "drunk")
    extra = `<g class="vxa-stars"><circle cx="40" cy="30" r="2.4" fill="#00e5d0"/><circle cx="70" cy="22" r="2" fill="#fff"/><circle cx="100" cy="30" r="2.4" fill="#ff8fd4"/></g>`;
  else if (mood === "terror" || mood === "guilt")
    extra = `<path class="vxr-sweat" d="M100 46 q4 7 0 10 q-4 -3 0 -10z" fill="#9fd8ff" stroke="#5aa8d8" stroke-width=".8"/>`;
  else if (mood === "embarrassed" || mood === "love")
    extra = `<ellipse cx="50" cy="76" rx="6" ry="3" fill="#ff5fa8" opacity=".55"/><ellipse cx="90" cy="76" rx="6" ry="3" fill="#ff5fa8" opacity=".55"/>`;
  else if (mood === "shocked")
    extra = `<text x="104" y="40" font-family="monospace" font-weight="bold" font-size="26" fill="#ffb347">!</text>`;
  else if (mood === "bored")
    extra = `<text x="102" y="44" font-family="monospace" font-size="16" fill="#cfc4a8" opacity=".85">…</text>`;
  else if (mood === "fury")
    extra = `<g class="vxr-steam" fill="none" stroke="#e8e0d0" stroke-width="2.2" stroke-linecap="round" opacity=".8"><path d="M36 38 q-6 -6 0 -12 q6 -6 0 -12"/><path d="M104 38 q6 -6 0 -12 q-6 -6 0 -12"/></g>`;
  else if (mood === "seething")
    extra = `<path d="M92 42 l4 -4 m-4 0 l4 4 m-2 -6 v8" stroke="#ff5a3c" stroke-width="1.8" stroke-linecap="round"/>`;
  else if (mood === "lying")
    // B-04 · the tell: his left eye trembles (see .vxr-lying in CSS)
    extra = "";
  else if (mood === "paranoid")
    extra = `<path d="M30 44 q-4 0 -6 4 M28 52 q-5 1 -6 5" stroke="#cfc4a8" stroke-width="1.4" fill="none" stroke-linecap="round" opacity=".7"/>`;

  /* ── B-16 · tape tears ── */
  const tears =
    opts.tears || mood === "crying"
      ? `<g class="vxr-tears">${[LX, RX]
          .map(
            (cx, i) =>
              `<path class="vxr-tear vxr-tear--${i}" d="M${cx - 2} ${EY + 9} q-1 8 1 14 q-3 6 0 12 q2 5 -1 9" fill="none" stroke="${TAPE}" stroke-width="2.6" stroke-linecap="round"/>`,
          )
          .join("")}</g>`
      : "";

  /* ── B-18 · scars ── */
  const scars = (opts.scars ?? [])
    .map((s) => {
      switch (s) {
        case "splice":
          // the splice tape across his left eye (first death)
          return `<rect x="${LX - 11}" y="${EY - 3}" width="22" height="5" rx="1" fill="#e9dcb6" opacity=".88" transform="rotate(-24 ${LX} ${EY})"/><path d="M${LX - 9} ${EY + 3} l18 -8" stroke="#a88f5f" stroke-width=".6" transform="rotate(0)"/>`;
        case "burn":
          return `<ellipse cx="92" cy="92" rx="9" ry="6" fill="#2a120a" opacity=".55"/><ellipse cx="94" cy="91" rx="4" ry="2.5" fill="#6b2a12" opacity=".7"/>`;
        case "label":
          return `<rect x="42" y="88" width="20" height="9" rx="1" fill="#f3e4bd" transform="rotate(-12 52 92)"/><text x="44" y="95" font-family="monospace" font-size="5.6" fill="#3b2a12" transform="rotate(-12 52 92)">ARCH.</text>`;
        case "crack":
          return `<path d="M98 44 l5 7 l-4 3 l6 8 l-3 4" stroke="#0c0610" stroke-width="1.6" fill="none" stroke-linejoin="round"/>`;
        case "stitch":
          return `<path d="M44 70 h14 M47 66 v8 M51 66 v8 M55 66 v8" stroke="#e9dcb6" stroke-width="1.2" stroke-linecap="round"/>`;
        default:
          return "";
      }
    })
    .join("");

  /* ── C-19 · age, C-21 · trait marks ── */
  const age = opts.age ?? 0;
  const t = new Set(opts.traits ?? []);
  let marks = "";
  if (age >= 30)
    marks += `<circle cx="70" cy="70" r="36" fill="none" stroke="#000" stroke-opacity="${Math.min(0.32, 0.12 + age / 2000)}" stroke-width="3.4"/>`;
  if (age >= 100)
    marks += `<path d="M43 58 q3 -2 6 0 M95 60 q-3 -2 -6 0 M48 92 q4 2 8 1" stroke="#1a0033" stroke-opacity=".45" stroke-width=".8" fill="none"/>`;
  if (t.has("spoiled"))
    marks += `<path d="M58 34 l4 -8 l4 6 l4 -9 l4 9 l4 -6 l4 8 Z" fill="#ffd36a" stroke="#c8962e" stroke-width=".8"/>`;
  if (t.has("competitive"))
    marks += `<path d="M36 52 Q70 40 104 52" stroke="#b5533c" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M103 52 l8 6 M103 52 l9 1" stroke="#b5533c" stroke-width="2.4" stroke-linecap="round"/>`;
  if (t.has("feral"))
    marks += `<path d="M98 82 l6 -6 M101 86 l6 -6 M104 90 l5 -5" stroke="#f3e4bd" stroke-opacity=".7" stroke-width="1.2" stroke-linecap="round"/>`;
  if (t.has("nocturnal"))
    marks += `<path d="M52 75 q7 4 14 0 M74 75 q7 4 14 0" stroke="#6a1a8a" stroke-opacity=".7" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
  if (t.has("haunted"))
    marks += `<circle cx="73" cy="72" r="36" fill="none" stroke="#cfe3e2" stroke-opacity=".18" stroke-width="1.4" stroke-dasharray="3 4"/>`;

  // H-10 · the twin's smile never moves
  if (opts.twin)
    mouth = `<path d="M54 78 Q70 96 86 78 Q70 86 54 78Z" fill="#13240c" stroke="#fff" stroke-width="1.6"/><path d="M58 80 h24" stroke="#fff" stroke-width="2.2"/>`;
  // the mouth sits in its own group so CSS can flap it while he talks
  const face = `${eyes}${lids}${brows}<g class="vxa-mouth">${mouth}</g>`;
  const chroma = red
    ? `<g opacity=".5" transform="translate(-2.4 0)">${face.replaceAll(W, "#ff2d2d")}</g><g opacity=".4" transform="translate(2.4 0)">${face.replaceAll(W, "#2ad8ff")}</g>`
    : "";
  // the rim shows his mood
  const rims: Partial<Record<VortexMood, [string, string]>> = {
    judging: ["#ff5a3c", "#b5533c"],
    dormant: ["#8a8378", "#4a453d"],
    yawn: ["#8a8378", "#4a453d"],
    sleepy: ["#8a8378", "#4a453d"],
    asleep: ["#8a8378", "#4a453d"],
    dreaming: ["#a9a0c8", "#4a453d"],
    bored: ["#8a8378", "#6a6458"],
    happy: ["#ffd36a", "#ffb000"],
    ecstasy: ["#ffd36a", "#ff8fd4"],
    hysterical: ["#ffd36a", "#ff5a3c"],
    mourning: ["#3a3a3a", "#6a1a8a"],
    fury: ["#ff3b2f", "#b5533c"],
    seething: ["#ff5a3c", "#6a1a8a"],
    terror: ["#cfe3e2", "#5f7d7a"],
    paranoid: ["#cfe3e2", "#ff2d95"],
    love: ["#ff8fd4", "#ff2d95"],
    dead: ["#4a453d", "#1a1a1a"],
    empty: ["#e8e0d0", "#8a8378"],
    guilt: ["#c8962e", "#6a1a8a"],
    embarrassed: ["#ff8fd4", "#ffd36a"],
    malicious: ["#ff2d95", "#3d0c5c"],
  };
  let [rimA, rimB] = red
    ? ["#ff3b2f", "#ffb000"]
    : (rims[mood] ?? ["#ff2d95", "#00e5d0"]);
  if (dark > 0.33 && !red) [rimA, rimB] = ["#b5533c", "#5a1a10"]; // B-15 · rust rim
  if (opts.twin) [rimA, rimB] = ["#6aa8ff", "#2d5fa8"];
  const [c1, c2, c3, c4] = opts.twin
    ? ["#e9ffd0", "#b8e68a", "#5f8a3a", "#13240c"]
    : red
      ? ["#ff6a5a", "#c0150f", "#3a0605", "#0a0101"]
      : mood === "dead"
        ? ["#8a7a8a", "#4a3a4a", "#221822", "#080008"]
        : ["#ff7ac8", "#e0157f", "#3d0c5c", "#080010"];
  const bodyOpacity = mood === "dead" ? 0.85 : 1;
  // B-15 · a second pair of eyes that opens for a moment (CSS-timed)
  const extraEyes =
    dark > 0.8
      ? `<g class="vxr-eyes2"><ellipse cx="62" cy="88" rx="3.4" ry="4" fill="#fff"/><ellipse cx="78" cy="88" rx="3.4" ry="4" fill="#fff"/><circle cx="62" cy="88.6" r="1.6" fill="#120000"/><circle cx="78" cy="88.6" r="1.6" fill="#120000"/></g>`
      : "";

  return `<svg viewBox="-10 -6 160 150" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false" style="overflow:visible;display:block;width:100%;height:100%" data-mood="${mood}">
<defs>
<radialGradient id="${id}b" cx="40%" cy="32%" r="72%"><stop offset="0" stop-color="${c1}"/><stop offset=".3" stop-color="${c2}"/><stop offset=".68" stop-color="${c3}"/><stop offset="1" stop-color="${c4}"/></radialGradient>
<linearGradient id="${id}rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${rimA}"/><stop offset="1" stop-color="${rimB}"/></linearGradient>
<radialGradient id="${id}g" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${red ? "#ff3b2f" : "#ff2d95"}" stop-opacity=".38"/><stop offset=".6" stop-color="${red ? "#ff3b2f" : "#7a2cff"}" stop-opacity=".12"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
<radialGradient id="${id}es" cx="50%" cy="30%" r="80%"><stop offset=".6" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#c9b6ff" stop-opacity=".55"/></radialGradient>
<linearGradient id="${id}lid" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${red ? "#7a0a08" : "#c0207a"}"/><stop offset="1" stop-color="${red ? "#4a0605" : "#8a1468"}"/></linearGradient>
<clipPath id="${id}e${LX}"><ellipse cx="${LX}" cy="${EY}" rx="8.6" ry="10.6"/></clipPath>
<clipPath id="${id}e${RX}"><ellipse cx="${RX}" cy="${EY}" rx="8.6" ry="10.6"/></clipPath>
<pattern id="${id}sl" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="1.4" fill="#000"/></pattern>
</defs>
<circle class="vxa-aura" cx="70" cy="70" r="66" fill="url(#${id}g)"/>
<g class="vxa-orbit"><circle cx="18" cy="52" r="1.6" fill="#00e5d0"/><circle cx="124" cy="86" r="1.3" fill="#ff8fd4"/><circle cx="104" cy="26" r="1" fill="#fff"/><circle cx="30" cy="112" r="1.1" fill="#00e5d0" opacity=".7"/></g>
<g opacity="${bodyOpacity}">
<circle cx="70" cy="70" r="36" fill="url(#${id}b)" stroke="url(#${id}rim)" stroke-width="3.2"/>
<circle cx="70" cy="70" r="31.5" fill="none" stroke="#fff" stroke-opacity=".08" stroke-width="1"/>
<g class="vxa-swirl${dark > 0.5 ? " vxr-swirl-rev" : ""}"><path d="M70 42 A24 24 0 1 1 46 66" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".42"/><path d="M70 52 A14 14 0 1 1 56 66" fill="none" stroke="${red ? "#ffb000" : "#00e5d0"}" stroke-width="1.6" stroke-linecap="round" opacity=".45"/></g>
<ellipse cx="57" cy="47" rx="9" ry="5" fill="#fff" opacity=".22" transform="rotate(-30 57 47)"/>
</g>
${scars}${marks}${chroma}${face}${tears}${extraEyes}<g class="vxr-posearms">${arms}</g>${extra}
${red ? `<circle cx="70" cy="70" r="36" fill="url(#${id}sl)" opacity=".38"/>` : ""}
</svg>`;
}
