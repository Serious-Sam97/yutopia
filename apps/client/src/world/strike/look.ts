// The Strike Park's one look (docs/plan/118-the-strike-park-polished.md, F1a: the user picked A, "the tactical skin
// refined" — design/strike118/mocks/a-*.png): dark steel panels with a hairline edge, the Raiders' signal amber and
// the Wardens' steel blue, condensed stencil heads over a plain sans. Every surface of the park draws from here: the
// match's HUD (strike.ts), its menus (StrikePanels.module.css keeps the same values as CSS variables), the in-world
// screens (their canvases' fonts and colours).

export const LOOK = {
  panel: "rgba(20,23,23,.82)",
  panelSolid: "#171a1a",
  line: "rgba(233,220,192,.14)",
  ink: "#f1e9d6",
  mute: "rgba(241,233,214,.6)",
  dim: "rgba(241,233,214,.18)",
  /** the teams: the Raiders' signal amber, the Wardens' steel blue */
  r: "#e8a33a",
  w: "#6fa3c7",
  rInk: "#1b1d1a",
  wInk: "#081521",
  good: "#9cc46a",
  bad: "#e06a52",
  /** the faces: condensed stencil heads, a plain body (canvas can't read CSS variables: the stacks in full) */
  headFont: `'DIN Condensed','Bahnschrift Condensed','Bahnschrift','Avenir Next Condensed','Roboto Condensed','Arial Narrow',sans-serif`,
  bodyFont: `'Avenir Next',Avenir,'Segoe UI','Helvetica Neue',system-ui,sans-serif`,
  monoFont: `'SF Mono','Menlo','Consolas',monospace`,
} as const;

export const teamCol = (t: string): string => (t === "w" ? LOOK.w : LOOK.r);
export const teamInk = (t: string): string => (t === "w" ? LOOK.wInk : LOOK.rInk);

/** A panel: dark steel, a hairline edge, a soft drop (inline CSS). */
export const PANEL = `background:${LOOK.panel};border:1px solid ${LOOK.line};border-radius:3px;box-shadow:0 6px 18px rgba(0,0,0,.35);color:${LOOK.ink};font-family:${LOOK.bodyFont}`;
/** A stencilled head: condensed, bold, upper case, spaced. */
export const HEAD = `font-family:${LOOK.headFont};font-weight:700;text-transform:uppercase;letter-spacing:.12em`;
/** A key cap. */
export const KEY = `display:inline-block;min-width:16px;padding:1px 5px;border-radius:2px;background:rgba(255,255,255,.12);border:1px solid ${LOOK.line};color:${LOOK.ink};font-size:11px;font-weight:700;text-align:center;font-family:${LOOK.bodyFont};line-height:1.3`;
/** Small labels over numbers. */
export const LABEL = `${HEAD};font-size:11px;color:${LOOK.mute};letter-spacing:.16em`;
/** Tabular numbers. */
export const NUM = "font-variant-numeric:tabular-nums";

/** A canvas font in the look: `head` the stencil, else the body. */
export const canvasFont = (px: number, head = false, weight = 700): string =>
  `${weight} ${px}px ${head ? LOOK.headFont : LOOK.bodyFont}`;

// ── the guns' and marks' silhouettes (one colour, `currentColor`): the kill feed's, the ammo box's, the slots' ──
const svg = (vb: string, d: string, extra = "") =>
  `<svg viewBox="${vb}" style="height:100%;width:auto;display:block" fill="currentColor">${d}${extra}</svg>`;
export const GLYPH: Record<string, string> = {
  revolver: svg("0 0 64 40", '<path d="M6 12h34l3-4h6v4h9v7H44l-2 3h-8l-3 4-4 11h-9l4-13-2-3H6z"/>'),
  shotgun: svg("0 0 96 40", '<path d="M2 14h58v6H2zM58 13h8l4 3h6l16 4-2 9-18-5h-8l-6-2z"/>'),
  ak47: svg(
    "0 0 96 40",
    '<path d="M30 12h32l2-2h4v2h24v4H68l-2 3H30zM4 14l26-2v8l-4 3H8l-4 6zM40 19h7l2 13-4 3-6-2 1-6zM33 19h5l-2 12h-5z"/>',
  ),
  sniper: svg(
    "0 0 96 40",
    '<path d="M2 15l24-3 6 2h40v4H34l-4 6H22l-4 8H8l2-9-8 2zM34 14h58v3H34z"/><rect x="38" y="6" width="26" height="6" rx="3"/>',
  ),
  daybreak: svg(
    "0 0 96 40",
    '<path d="M6 14l18-2h8v14H24l-6 4H8z"/><rect x="30" y="10" width="40" height="18" rx="5"/><path d="M70 8l12-2v26l-12-2z"/>',
  ),
  knife: svg("0 0 64 24", '<path d="M2 10h22l4-3h4v10h-4l-4-3H2zM32 8h20l10 4-10 4H32z"/>'),
  he: svg(
    "0 0 24 24",
    '<ellipse cx="12" cy="14" rx="6" ry="7"/><rect x="10" y="3" width="4" height="4"/><path d="M14 4h6v2h-6z"/>',
  ),
  flash: svg("0 0 24 24", '<rect x="7" y="7" width="10" height="14" rx="2"/><rect x="10" y="3" width="4" height="4"/>'),
  smoke: svg("0 0 24 24", '<rect x="7" y="6" width="10" height="15" rx="3"/><rect x="10" y="3" width="4" height="3"/>'),
  molotov: svg(
    "0 0 24 24",
    '<path d="M9 9h6v12H9z"/><path d="M10 3h4v6h-4z"/><path d="M12 0c2 2 2 3 0 4-2-1-2-2 0-4z"/>',
  ),
  incendiary: svg(
    "0 0 24 24",
    '<rect x="7" y="7" width="10" height="14" rx="2"/><path d="M12 1c3 3 3 5 0 6-3-1-3-3 0-6z"/>',
  ),
  decoy: svg("0 0 24 24", '<rect x="7" y="8" width="10" height="13" rx="2"/><path d="M10 4h4v4h-4z"/>'),
  charge: svg("0 0 24 24", '<rect x="4" y="7" width="16" height="11" rx="2"/><rect x="8" y="4" width="8" height="3"/>'),
  head: `<svg viewBox="0 0 24 24" style="height:100%;width:auto;display:block" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="11" r="6"/><path d="M12 2v5M12 15v5M3 11h5M16 11h5"/></svg>`,
  wall: `<svg viewBox="0 0 24 24" style="height:100%;width:auto;display:block" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 5h16v14H4zM4 12h16M10 5v7M14 12v7"/><path d="M1 9l22 6" stroke-width="2.6"/></svg>`,
  through: svg("0 0 24 24", '<circle cx="8" cy="13" r="5" opacity=".7"/><circle cx="15" cy="10" r="6" opacity=".85"/>'),
  blind: `<svg viewBox="0 0 24 24" style="height:100%;width:auto;display:block" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12c3-5 7-7 10-7s7 2 10 7c-3 5-7 7-10 7S5 17 2 12z"/><path d="M3 3l18 18"/></svg>`,
  noscope: `<svg viewBox="0 0 24 24" style="height:100%;width:auto;display:block" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><path d="M12 2v6M12 16v6M2 12h6M16 12h6M5 5l14 14"/></svg>`,
  cross: svg("0 0 24 24", '<path d="M9 2h6v7h7v6h-7v7H9v-7H2V9h7z"/>'),
  shield: svg("0 0 24 24", '<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z"/>'),
  helmet: svg("0 0 24 24", '<path d="M3 15a9 9 0 0118 0v2H3z"/>'),
  kit: svg("0 0 24 24", '<rect x="3" y="8" width="18" height="12" rx="2"/><path d="M8 8V5h8v3h-2V7h-4v1z"/>'),
  vest: svg("0 0 24 24", '<path d="M6 3l3 2h6l3-2 3 4-2 3v11H5V10L3 7z"/>'),
  hostage: svg("0 0 24 24", '<circle cx="12" cy="6" r="4"/><path d="M5 22c0-6 3-9 7-9s7 3 7 9z"/>'),
};
/** A glyph `h` px high, in a colour. */
export const glyph = (id: string, h: number, col?: string): string =>
  GLYPH[id]
    ? `<span style="display:inline-block;height:${h}px;vertical-align:middle;${col ? `color:${col}` : ""}">${GLYPH[id]}</span>`
    : "";
