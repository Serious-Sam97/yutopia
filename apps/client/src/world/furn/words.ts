import { GLYPHS, glyphDots } from "@yutopia/shared/glyphs";

// Words on things, drawn (docs/plan/68-more-furniture.md, phase 1): the shared 5×7 face (glyphs.ts)
// painted dot by dot on a canvas — the ticker's VFD scroll, the split-flap's flaps.

/** Paint `text` from (x, y) (its top-left), each dot `dot` px across with `gap` between, in `on`;
 *  returns how wide it was. */
export function paintText(
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  dot: number,
  gap: number,
  on: string,
): number {
  const step = dot + gap;
  g.fillStyle = on;
  for (let i = 0; i < text.length; i++)
    for (const [c, r] of glyphDots(text[i])) g.fillRect(x + (i * 6 + c) * step, y + r * step, dot, dot);
  return text.length * 6 * step;
}

/** How wide `n` letters are painted at `dot` and `gap`. */
export const textWidth = (n: number, dot: number, gap: number) => n * 6 * (dot + gap);

// the boards' faces, as canvases: the ticker's strip and the split-flap's three rows of twelve
export const TICKER_PX: [number, number] = [1024, 92];
export const FLAPS_PX: [number, number] = [1024, 220];
const FLAP_ROWS = 3;
const FLAP_COLS = 12;
const ANY = Object.keys(GLYPHS).filter((c) => c !== " " && c !== "*");

/** The ticker: amber dots on its dark glass, the words scrolling right to left, round again. */
export function drawTicker(c: HTMLCanvasElement, text: string, t: number) {
  const g = c.getContext("2d");
  if (!g) return;
  const [dot, gap] = [8, 2];
  g.fillStyle = "#0b120e";
  g.fillRect(0, 0, c.width, c.height);
  const words = `${text}     `;
  const w = textWidth(words.length, dot, gap);
  const x = c.width - ((t * 90) % (w + c.width));
  const y = (c.height - 7 * (dot + gap)) / 2;
  paintText(g, words, x, y, dot, gap, "#ffb347");
  if (x + w < c.width) paintText(g, words, x + w, y, dot, gap, "#ffb347");
}

/** The split-flap board: three rows of twelve flaps (its words split at "/"), each flap a cream
 *  letter on black; for a while after its words change, each flap turns through letters till it
 *  settles, left to right and row by row. */
export function drawFlaps(c: HTMLCanvasElement, text: string, since: number, seed: string) {
  const g = c.getContext("2d");
  if (!g) return;
  g.fillStyle = "#0e0e10";
  g.fillRect(0, 0, c.width, c.height);
  const rows = text.split("/").slice(0, FLAP_ROWS);
  const cw = c.width / FLAP_COLS;
  const ch = c.height / FLAP_ROWS;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  for (let r = 0; r < FLAP_ROWS; r++)
    for (let k = 0; k < FLAP_COLS; k++) {
      const x = k * cw + 3;
      const y = r * ch + 4;
      g.fillStyle = "#1d1d21";
      g.fillRect(x, y, cw - 6, ch - 8);
      g.fillStyle = "#08080a";
      g.fillRect(x, y + (ch - 8) / 2 - 1, cw - 6, 2);
      const want = (rows[r] ?? "").padEnd(FLAP_COLS, " ")[k] ?? " ";
      const settle = 0.25 + k * 0.06 + r * 0.18 + (((h >> ((k + r * 5) % 24)) & 7) / 7) * 0.5;
      const ch1 = since < settle ? ANY[(Math.floor(since * 14) + k * 7 + r * 3) % ANY.length] : want;
      if (ch1 === " ") continue;
      const dot = 6;
      paintText(g, ch1, x + (cw - 6 - 5 * (dot + 1)) / 2, y + (ch - 8 - 7 * (dot + 1)) / 2, dot, 1, "#f2e8d2");
    }
}
