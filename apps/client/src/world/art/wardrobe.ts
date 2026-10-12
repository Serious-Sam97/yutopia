// The wardrobe beyond the first set of clothes: shoes (a slot of their own),
// more tops and bottoms, head things, eyewear and one more thing (a scarf,
// earrings, a necklace, a backpack, a watch). Drawn on the figure's board
// (avatar-svg.ts) in its views: front (S, SW), back (N, NW) and side (W).

export type Fill = (d: string, c: string, w?: number) => string;
export interface Paint {
  fill: Fill;
  flat: (d: string, c: string, op?: number) => string;
  shade: (c: string) => string;
  light: (c: string) => string;
  ink: string;
  O: (w?: number) => string;
}

const mirror = (g: string) => `<g transform="translate(120 0) scale(-1 1)">${g}</g>`;

// ── shoes ────────────────────────────────────────────────────────────────────
// One foot from the front (the left; the right is its mirror), standing.
function footFront(p: Paint, kind: string, c: string, skin: string, stripe: string, back: boolean): string {
  const { fill, flat, shade, light } = p;
  const base = back ? "M46 159 Q45 166 50 167 L57 167 L57 159Z" : "M46 159 Q45 167 50 167.5 L58 167.5 Q59 163 56 159Z";
  switch (kind) {
    case "hightops":
      return (
        fill(
          back
            ? "M48.4 150.5 L56.9 150.5 L57 167 L50 167 Q45 166 46 159 L48 158Z"
            : "M48.4 150.5 L56.8 150.5 L57 159 Q59 163 58 167.5 L50 167.5 Q45 167 46 159 L48.2 158Z",
          c,
        ) +
        `<path d="M45.6 165.2 H58" stroke="${light(c)}" stroke-width="1.3"/>` +
        (back ? "" : `<path d="M50.5 153 h4 M50.3 155.6 h4 M50.2 158.2 h4" stroke="${shade(c)}" stroke-width=".8"/>`)
      );
    case "boots":
      return (
        fill(
          back
            ? "M48 146.5 L57.2 146.5 L57.4 167.4 L49.5 167.4 Q44.6 167 45.6 159 L47.6 157Z"
            : "M48 146.5 L57.2 146.5 L57.4 159 Q59.6 163 58.6 167.6 L49.6 167.6 Q44.6 167.2 45.6 159 L47.6 157Z",
          c,
        ) +
        fill("M45.3 165 H58.9 V167.6 H49.6 Q45 167.3 45.3 165Z", shade(shade(c))) +
        `<path d="M48.2 149.4 H57.1" stroke="${shade(c)}" stroke-width="1"/>`
      );
    case "loafers":
      return (
        fill(
          back
            ? "M46.4 161.4 Q45.4 166.4 50 167 L57 167 L57 161.4Z"
            : "M46.5 161.2 Q45.4 167 50 167.5 L57.6 167.5 Q58.6 163.6 56.4 161.2Z",
          c,
        ) +
        (back
          ? ""
          : `<path d="M48.4 163.4 Q51.8 162.2 55.2 163.4" stroke="${shade(c)}" stroke-width="1.1" fill="none"/>`)
      );
    case "sandals":
      return (
        fill(
          back
            ? "M46.8 160 Q45.8 166.4 50 167 L57 167 L57 160Z"
            : "M47 160 Q45.6 167 50 167.6 L57.4 167.6 Q58.4 163.6 56.2 160Z",
          skin,
        ) +
        `<path d="M46 166.6 H58.4" stroke="${c}" stroke-width="1.6"/>` +
        (back
          ? ""
          : `<path d="M47.4 162.6 Q51.6 161 55.8 162.6 M48.4 164.6 L55.6 160.8" stroke="${c}" stroke-width="1.4" fill="none"/>`)
      );
    default: {
      // sneakers: a stripe in the top's colour
      let g = fill(base, c);
      if (!back) {
        g += `<path d="M47.5 162.5 Q51.5 161 55.5 162.5" stroke="${stripe}" stroke-width="1.1" fill="none" stroke-linecap="round"/>`;
        g += flat("M46 164.5 H58.2 L58.4 166.2 Q54 167.8 49.6 167.4 Q45.6 166.8 46 164.5Z", shade(c), 0.35);
      }
      return g;
    }
  }
}

export function shoesFront(
  p: Paint,
  kind: string,
  c: string,
  skin: string,
  stripe: string,
  back: boolean,
  right: boolean,
) {
  const g = footFront(p, kind, c, skin, stripe, back);
  return right ? mirror(g) : g;
}

// One foot in profile (W: toes towards −x), standing.
export function shoeSide(p: Paint, kind: string, c: string, skin: string, stripe: string): string {
  const { fill, shade, light } = p;
  const sole = "M51 159.5 Q48.5 160 48.5 164 Q48.5 167.5 52 167.5 L64.5 167.5 L64.5 159.5Z";
  switch (kind) {
    case "hightops":
      return (
        fill(
          "M55 150.5 L65 150.5 L64.8 159.5 L64.5 167.5 L52 167.5 Q48.5 167.5 48.5 164 Q48.5 160 51 159.5 L55 158.5Z",
          c,
        ) +
        `<path d="M48.8 165.6 H64.4" stroke="${light(c)}" stroke-width="1.3"/><path d="M56 153 l2 1.4 M56 156 l2 1.4" stroke="${shade(c)}" stroke-width=".8"/>`
      );
    case "boots":
      return (
        fill(
          "M54.4 146.5 L65.4 146.5 L65.2 160 L64.8 167.6 L51.6 167.6 Q48.2 167.6 48.3 164 Q48.4 160 51 159.4 L54.4 158Z",
          c,
        ) +
        fill("M48.3 165 H64.9 V167.6 H51.6 Q48.3 167.5 48.3 165Z", shade(shade(c))) +
        `<path d="M54.6 149.4 H65.3" stroke="${shade(c)}" stroke-width="1"/>`
      );
    case "loafers":
      return (
        fill("M51 161.6 Q48.5 162 48.5 164.6 Q48.5 167.5 52 167.5 L64.5 167.5 L64.5 161.4Z", c) +
        `<path d="M51.6 163.4 L57.6 162.6" stroke="${shade(c)}" stroke-width="1.1"/>`
      );
    case "sandals":
      return (
        fill("M51.5 160.4 Q48.8 161 48.8 164.2 Q48.8 167.4 52 167.4 L64.4 167.4 L64.4 160.4Z", skin) +
        `<path d="M48.6 167 H64.6" stroke="${c}" stroke-width="1.6"/><path d="M50.6 162.8 L56.4 161.4 M57.4 160.6 L60 167" stroke="${c}" stroke-width="1.4"/>`
      );
    default:
      return (
        fill(sole, c) +
        `<path d="M48.8 165.6 H64.4" stroke="${shade(c)}" stroke-width="1.2"/><path d="M50.4 162.4 H62.6" stroke="${stripe}" stroke-width="1" stroke-linecap="round"/>`
      );
  }
}

// Seated, from the front: the feet under the knees.
export function shoesLap(p: Paint, kind: string, c: string, skin: string): string {
  const { fill, shade } = p;
  const left = (() => {
    const foot = "M45.5 122 Q44.5 129 49.5 129.5 L57 129.5 Q58 125.5 55 122Z";
    if (kind === "sandals")
      return (
        fill(foot, skin) + `<path d="M46.2 126 Q50.6 124.6 55.4 126" stroke="${c}" stroke-width="1.4" fill="none"/>`
      );
    let g = "";
    if (kind === "boots") g += fill("M47.2 116.5 L55.6 116.5 L55.6 123 L47.2 123Z", c);
    else if (kind === "hightops") g += fill("M47.4 119 L55.4 119 L55.4 123 L47.4 123Z", c);
    g += fill(foot, c);
    if (kind === "boots") g += fill("M45 127.6 H57.6 V129.5 H49.5 Q45 129.4 45 127.6Z", shade(shade(c)));
    return g;
  })();
  return left + mirror(left);
}

export function shoeLapSide(p: Paint, kind: string, c: string, skin: string): string {
  const { fill, shade } = p;
  const foot = "M28.5 127.5 Q26.5 128 26.5 131.5 Q26.5 134 29.5 134 L41.5 134 L41.5 127.5Z";
  if (kind === "sandals")
    return fill(foot, skin) + `<path d="M27 133.6 H41.6 M30 129.6 L35 128.6" stroke="${c}" stroke-width="1.4"/>`;
  let g = "";
  if (kind === "boots") g += fill("M33 119.5 L41.8 119.5 L41.8 128 L33 128Z", c);
  else if (kind === "hightops") g += fill("M33.4 122.5 L41.6 122.5 L41.6 128 L33.4 128Z", c);
  g += fill(foot, c);
  if (kind === "boots") g += fill("M26.6 132 H41.6 V134 H29.5 Q26.6 134 26.6 132Z", shade(shade(c)));
  return g;
}

// ── tops ─────────────────────────────────────────────────────────────────────
export const SHORT_SLEEVES = new Set(["tee", "dress", "polo"]);
export const SLEEVELESS = new Set(["tank"]);
export const JACKET_CUT = new Set(["jacket", "blazer"]);

// Details on the front of the new tops (S, SW), inside the torso's clip.
export function topFront(p: Paint, top: string, c: string, inner: string, cx: number, accent: string): string {
  const { fill, flat, shade, light } = p;
  const tS = shade(c);
  const hem = fill("M41 100 Q60 105 79 100 L79 104 Q60 109 41 104Z", c, 0.8);
  const rib =
    fill("M41 99 Q60 104 79 99 L79 105 Q60 110 41 105Z", c, 0.8) +
    flat("M66 102.6 Q73 101.5 79 99 L79 105 Q72 107 66 108.3Z", tS);
  switch (top) {
    case "polo":
      return (
        fill(`M${cx - 7.4} 55.4 L${cx - 1} 59.6 L${cx - 3.2} 64 L${cx - 8.8} 59Z`, light(c), 0.85) +
        fill(`M${cx + 7.4} 55.4 L${cx + 1} 59.6 L${cx + 3.2} 64 L${cx + 8.8} 59Z`, light(c), 0.85) +
        `<path d="M${cx} 60 V71" stroke="${tS}" stroke-width=".9"/><circle cx="${cx + 1.2}" cy="63.6" r=".8" fill="${light(c)}"/><circle cx="${cx + 1.2}" cy="68" r=".8" fill="${light(c)}"/>` +
        hem
      );
    case "turtleneck":
      return `<path d="M50 70 V100 M55 70 V102 M65 70 V102 M70 70 V100" stroke="${tS}" stroke-width=".6" opacity=".55"/>${rib}`;
    case "blazer":
      return (
        fill(`M${cx - 6} 56.5 L${cx} 84 L${cx + 6} 56.5Z`, inner, 0.8) +
        fill(`M${cx - 6} 56.5 L${cx - 1.4} 82 L${cx - 9.6} 67 L${cx - 7} 62.4 L${cx - 9.2} 60Z`, tS, 0.8) +
        fill(`M${cx + 6} 56.5 L${cx + 1.4} 82 L${cx + 9.6} 67 L${cx + 7} 62.4 L${cx + 9.2} 60Z`, shade(tS), 0.8) +
        `<circle cx="${cx + 1}" cy="88" r="1.1" fill="${tS}"/><circle cx="${cx + 1}" cy="95" r="1.1" fill="${tS}"/>` +
        `<path d="M${cx + 8.6} 70.6 l4.2 -1 l.6 2.4 l-4.4 .6Z" fill="${accent}"/><path d="M${cx - 15} 93 h6 M${cx + 9} 93 h6" stroke="${tS}" stroke-width="1"/>`
      );
    case "cardigan":
      return (
        fill(
          `M${cx - 5.2} 55.6 L${cx - 3} 104 L${cx + 3} 104 L${cx + 5.2} 55.6 Q${cx} 60 ${cx - 5.2} 55.6Z`,
          inner,
          0.8,
        ) +
        `<path d="M${cx - 4.4} 58 L${cx - 2.6} 103 M${cx + 4.4} 58 L${cx + 2.6} 103" stroke="${tS}" stroke-width="1.1"/>` +
        [70, 79, 88, 97].map((y) => `<circle cx="${cx - 5.2}" cy="${y}" r=".9" fill="${light(c)}"/>`).join("") +
        rib
      );
    case "tank":
      return hem;
    default:
      return "";
  }
}

// …from behind (N, NW)
export function topBack(p: Paint, top: string, c: string): string {
  const { fill, flat, shade, light } = p;
  const tS = shade(c);
  switch (top) {
    case "polo":
      return (
        fill("M51 56.5 Q60 53 69 56.5 L68 59.8 Q60 57.2 52 59.8Z", light(c), 0.85) +
        `<path d="M60 60 V104" stroke="${tS}" stroke-width=".8"/>`
      );
    case "blazer":
      return `<path d="M60 58 V90" stroke="${tS}" stroke-width=".8"/><path d="M60 92 V104" stroke="${tS}" stroke-width="1.1"/>`;
    case "cardigan":
    case "turtleneck":
      return `<path d="M60 58 V100" stroke="${tS}" stroke-width=".8"/>${fill("M41 99 Q60 104 79 99 L79 105 Q60 110 41 105Z", c, 0.8)}${flat("M66 102.6 Q73 101.5 79 99 L79 105 Q72 107 66 108.3Z", tS)}`;
    default:
      return "";
  }
}

// …in profile (W)
export function topSide(p: Paint, top: string, c: string, inner: string): string {
  const { fill, shade, light } = p;
  const tS = shade(c);
  switch (top) {
    case "polo":
      return (
        fill("M49.6 56.6 L56.4 55.8 L54.6 62.4Z", light(c), 0.85) +
        `<path d="M51.2 60 L51.6 70" stroke="${tS}" stroke-width=".8"/>`
      );
    case "blazer":
      return (
        fill("M50 58.5 L55 58 L54 76 L50.3 70Z", inner, 0.8) +
        `<path d="M54 60 L55 88" stroke="${tS}" stroke-width="1"/><path d="M55.6 70 l2.6 -.8" stroke="${tS}" stroke-width="1"/>`
      );
    case "cardigan":
      return (
        fill("M48.6 58.6 L52.4 58.4 L52 104 L48.4 104Z", inner, 0.8) +
        `<path d="M52.4 59 L52 104" stroke="${tS}" stroke-width="1"/>`
      );
    default:
      return "";
  }
}

// Turtlenecks roll up the neck (drawn over it).
export function turtleneck(p: Paint, c: string, view: "front" | "back" | "side"): string {
  const { fill, shade } = p;
  const tS = shade(c);
  if (view === "side")
    return (
      fill("M55.6 47.6 L66 47.6 L66.4 57.4 Q61 60 55.4 57.6Z", c) +
      `<path d="M58 49 V57 M61 49 V58 M64 49 V57" stroke="${tS}" stroke-width=".6"/>`
    );
  return (
    fill("M53.4 47.4 Q60 49.6 66.6 47.4 L67.2 57.2 Q60 60.4 52.8 57.2Z", c) +
    (view === "front"
      ? `<path d="M55.6 49 V57.6 M58 49.4 V58.4 M60 49.6 V58.8 M62 49.4 V58.4 M64.4 49 V57.6" stroke="${tS}" stroke-width=".6"/>`
      : "")
  );
}

// A tank top's shape: the body under it is skin.
export const TANK_FRONT =
  "M48.5 59 L52 57.4 Q60 67 68 57.4 L71.5 59 Q73.5 70 73 80 Q77 92 79 104 Q60 109 41 104 Q43 92 47 80 Q46.5 70 48.5 59Z";
export const TANK_BACK =
  "M48.5 59 L52 57.4 Q60 61 68 57.4 L71.5 59 Q73.5 70 73 80 Q77 92 79 104 Q60 109 41 104 Q43 92 47 80 Q46.5 70 48.5 59Z";
export const TANK_SIDE = "M50.6 60 L55.6 57.6 Q60 61.4 64.6 57.6 L69.6 60 L72 104 Q60 108.5 48 104Z";

// ── bottoms ──────────────────────────────────────────────────────────────────
// Over a front leg (the left; mirrored for the right).
export function bottomLeg(p: Paint, bottom: string, c: string): string {
  const { fill, shade, light } = p;
  if (bottom === "cargo")
    return (
      fill("M47.4 117.6 L53 117.6 L53.2 129.4 L47.8 129.4Z", c) +
      `<path d="M47.5 120.4 H53.1" stroke="${shade(c)}" stroke-width="1"/>`
    );
  if (bottom === "joggers")
    return (
      fill("M48.6 151.6 L56.4 151.6 L56.2 158.8 L49 158.8Z", shade(c)) +
      `<path d="M48 108 L49.2 151" stroke="${light(c)}" stroke-width="1" opacity=".8"/>`
    );
  return "";
}
export function bottomSide(p: Paint, bottom: string, c: string, part: "thigh" | "shin"): string {
  const { fill, shade, light } = p;
  if (bottom === "cargo" && part === "thigh")
    return (
      fill("M55.8 113.6 L64.2 113.6 L64.4 124.6 L56 124.6Z", c) +
      `<path d="M55.9 116.4 H64.3" stroke="${shade(c)}" stroke-width="1"/>`
    );
  if (bottom === "joggers" && part === "shin")
    return (
      fill("M55.2 151 L64.8 151 L64.6 157.8 L55.4 157.8Z", shade(c)) +
      `<path d="M64.6 134 L64.6 150" stroke="${light(c)}" stroke-width="1" opacity=".8"/>`
    );
  if (bottom === "joggers" && part === "thigh")
    return `<path d="M66 104 L65.4 132" stroke="${light(c)}" stroke-width="1" opacity=".8"/>`;
  return "";
}
export const LONGSKIRT_FRONT = "M44 100 L37.5 155.5 Q60 161.5 82.5 155.5 L76 100Z";
export const LONGSKIRT_SHADE = "M66 101 L76 100 L82.5 155.5 Q74 158.6 66 159.4Z";
export const LONGSKIRT_SIDE = "M50.5 100 L44.5 154 Q59 158 75 154 L69.5 100Z";

// ── on the head ──────────────────────────────────────────────────────────────
export function headThing(
  p: Paint,
  kind: string,
  c: string,
  view: "front" | "tq" | "back" | "side",
  close = false, // hair cropped close: it sits on the skull
): string {
  const { fill, shade, light, ink } = p;
  const side = view === "side";
  const back = view === "back";
  switch (kind) {
    case "beret":
      return side
        ? fill("M49 27.2 Q50 15 62 14.4 Q76 15.4 78.4 23.2 Q70 27.6 60 27.2 Q53 27.6 49 27.2Z", c) +
            `<circle cx="63" cy="14.4" r="1.4" fill="${shade(c)}"/>`
        : fill("M43.6 26.4 Q46 14.8 60 14.4 Q76 14.8 77.6 24.4 Q70 28.8 58 28.4 Q48 28.8 43.6 26.4Z", c) +
            `<circle cx="61" cy="14.4" r="1.4" fill="${shade(c)}"/>` +
            (back ? "" : `<path d="M46.4 27.2 Q60 30.2 75 26.4" stroke="${shade(c)}" stroke-width="1" fill="none"/>`);
    case "bucket":
      return side
        ? fill("M51 27.4 Q50.6 13.8 62 13.8 Q73.6 14.4 73.6 27.4Z", c) +
            fill("M44 27.6 Q62 24.4 79.6 27.6 L82 32.6 Q62 29 41.8 32.6Z", shade(c)) +
            `<path d="M51.4 25 H73.4" stroke="${light(c)}" stroke-width="1.2"/>`
        : fill("M47.4 27 Q47 13.8 60 13.8 Q73 13.8 72.6 27Z", c) +
            fill("M41.8 27 Q60 23.8 78.2 27 L80.6 33 Q60 29.4 39.4 33Z", shade(c)) +
            `<path d="M47.8 24.6 H72.2" stroke="${light(c)}" stroke-width="1.2"/>`;
    case "bandana": {
      const dots = (pts: [number, number][]) =>
        pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".7" fill="${light(c)}"/>`).join("");
      if (side)
        return (
          fill("M50.8 25.8 Q62 21.6 72.6 26.2 L72.9 31.4 Q62 27.4 50.6 31Z", c) +
          fill("M72.4 26.6 L78.6 24.4 L77.6 29.8Z M72.8 28.8 L78.8 33 L75.6 34.6Z", shade(c)) +
          dots([
            [55, 28.4],
            [60, 26.8],
            [65.6, 27.2],
          ])
        );
      if (back)
        return (
          fill("M47.4 25.8 Q60 22 72.6 25.8 L72.8 31 Q60 27.4 47.2 31Z", c) +
          fill("M56.6 26.6 L63.4 26.6 L64.4 31 L60 33 L55.6 31Z", shade(c)) +
          fill("M57.6 31 L54.6 38.4 L58.4 37.4Z M62.4 31 L65.4 38.4 L61.6 37.4Z", c)
        );
      return (
        fill("M47.4 26 Q60 22 72.6 26 L72.8 31 Q60 27.4 47.2 31Z", c) +
        dots([
          [52, 27.6],
          [57.6, 26],
          [63.2, 26],
          [68.6, 27.4],
        ])
      );
    }
    case "headband": {
      const d = side
        ? close
          ? "M58.6 35.2 Q57.8 24 62.4 20.4"
          : "M58.4 35.4 Q57.4 21.6 62.6 15.4"
        : close
          ? "M47.6 31.4 Q47.6 21.2 60 20.8 Q72.4 21.2 72.4 31.4"
          : "M46.6 30.4 Q46.4 16.8 60 16.2 Q73.6 16.8 73.4 30.4";
      return `<path d="${d}" stroke="${ink}" stroke-width="4" fill="none" stroke-linecap="round"/><path d="${d}" stroke="${c}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
    }
    default:
      return "";
  }
}

// ── eyewear ──────────────────────────────────────────────────────────────────
export function eyewear(p: Paint, kind: string, c: string, view: "front" | "tq" | "side", fx: number): string {
  const { O, ink } = p;
  if (kind === "none") return "";
  if (view === "side") {
    if (kind === "round")
      return `<circle cx="54.2" cy="37.6" r="3.1" fill="#cfe8ff" fill-opacity=".22" stroke="${c}" stroke-width="1.2"/><path d="M57.3 37 L63 36.6" stroke="${c}" stroke-width="1"/>`;
    if (kind === "sunglasses")
      return `<path d="M50.2 34.6 h6.4 v2.4 q-.8 3.6 -3.4 3.6 q-2.4 0 -3 -3.6Z" fill="#1c1a24" ${O(0.9)}/><path d="M51.4 35.6 l1.6 -.4" stroke="#fff" stroke-width=".7" opacity=".7"/><path d="M56.6 35.6 L63 36.4" stroke="${ink}" stroke-width="1"/>`;
    return `<path d="M50.4 34.8 h6 v3 q-1 3.2 -3.2 3.2 q-2.2 0 -2.8 -3.2Z" fill="${c}" fill-opacity=".35" ${O(0.9)}/><path d="M56.4 35.8 L63 36.6" ${O(0.9)}/>`;
  }
  const l = 55 + fx;
  const r = 65 + fx;
  if (kind === "round")
    return `<circle cx="${l}" cy="37.6" r="${view === "tq" ? 3 : 3.6}" fill="#cfe8ff" fill-opacity=".22" stroke="${c}" stroke-width="1.2"/><circle cx="${r}" cy="37.6" r="3.6" fill="#cfe8ff" fill-opacity=".22" stroke="${c}" stroke-width="1.2"/><path d="M${l + 3.4} 36.8 Q${60 + fx} 35.6 ${r - 3.4} 36.8" stroke="${c}" stroke-width="1" fill="none"/>`;
  if (kind === "sunglasses")
    return `<path d="M${49.4 + fx} 34.4 h10.4 v2.6 q-.8 4 -5.2 4 q-4.4 0 -5.2 -4Z M${60.6 + fx} 34.4 h10.4 v2.6 q-.8 4 -5.2 4 q-4.4 0 -5.2 -4Z" fill="#1c1a24" ${O(0.9)}/><path d="M${51 + fx} 35.6 l2.4 -.5 M${62.2 + fx} 35.6 l2.4 -.5" stroke="#fff" stroke-width=".8" opacity=".7"/><path d="M${59.8 + fx} 35.4 h1" ${O(1.2)}/>`;
  return `<path d="M${50 + fx} 35 h9 v3.2 q-1 3.4 -4.6 3.4 q-3.6 0 -4.4 -3.4Z M${61 + fx} 35 h9 v3.2 q-1 3.4 -4.6 3.4 q-3.6 0 -4.4 -3.4Z" fill="${c}" fill-opacity=".35" ${O(0.9)}/><path d="M${59 + fx} 36 h2" ${O(0.9)}/>`;
}

// ── one more thing ───────────────────────────────────────────────────────────
// Round the neck and over the chest (drawn over the neck), by view.
export function neckThing(p: Paint, kind: string, c: string, view: "front" | "back" | "side", cx: number): string {
  const { fill, flat, shade, light } = p;
  if (kind === "scarf") {
    if (view === "side")
      return (
        fill("M55.6 51.4 L66.6 51.4 L67 58.2 Q61 61 55.4 58.2Z", c) +
        fill("M55.4 57.4 L53.2 74 L57.4 74.6 L58.6 57.8Z", c) +
        `<path d="M53.6 72 l-.4 3.2 M55.4 72.4 l-.2 3.2 M57 72.6 v3" stroke="${shade(c)}" stroke-width=".7"/>`
      );
    if (view === "back")
      return (
        fill("M51 51.6 Q60 55.8 69 51.6 L70 57 Q60 61.2 50 57Z", c) +
        flat("M63 54 L70 51.6 L70 57 L63 59Z", shade(c), 0.6)
      );
    return (
      fill("M51.4 51.8 Q60 58.4 68.6 51.8 L70 57.6 Q60 64.4 50 57.6Z", c) +
      fill(`M${cx + 2} 58.4 L${cx + 3.4} 77 L${cx + 7.6} 76.2 L${cx + 6.6} 57.6Z`, c) +
      `<path d="M${cx + 4} 74.6 v3 M${cx + 5.6} 74.4 v3 M${cx + 7} 74.2 v2.8" stroke="${light(c)}" stroke-width=".7"/>` +
      flat("M63 55 L70 52 L70 57.6 L63 60Z", shade(c), 0.6)
    );
  }
  if (kind === "necklace") {
    if (view === "back") return "";
    if (view === "side")
      return `<path d="M57.2 55.6 Q55.4 60.4 56.8 62" stroke="${c}" stroke-width="1" fill="none"/><circle cx="56.4" cy="62.4" r="1.5" fill="${c}"/>`;
    return `<path d="M${cx - 5.6} 56.4 Q${cx} 65 ${cx + 5.6} 56.4" stroke="${c}" stroke-width="1" fill="none"/><circle cx="${cx}" cy="63.8" r="1.7" fill="${c}" stroke="${shade(c)}" stroke-width=".6"/>`;
  }
  return "";
}

// A backpack: on the back (seen from behind), its straps from the front, its
// pack behind the shoulder in profile (`behind`: the part drawn before the torso).
export function backpack(p: Paint, c: string, view: "front" | "back" | "side", behind: boolean): string {
  const { fill, flat, shade } = p;
  if (view === "back")
    return behind
      ? ""
      : fill(
          "M46.6 62 Q46.6 57.6 51 57.6 L69 57.6 Q73.4 57.6 73.4 62 L74 92 Q74 96.4 69.6 96.4 L50.4 96.4 Q46 96.4 46 92Z",
          c,
        ) +
          fill("M50 80 L70 80 L70 92 Q70 93.6 68.4 93.6 L51.6 93.6 Q50 93.6 50 92Z", shade(c)) +
          `<path d="M50.6 84 H69.4" stroke="${shade(shade(c))}" stroke-width=".8"/>` +
          flat("M66 58 L73.4 60 L74 92 Q73 95.6 69 96.2 L66 96.2Z", shade(c), 0.5);
  if (view === "side")
    return behind
      ? fill("M70.6 59.6 Q76 59.6 77.6 64 L78.6 92 Q78.2 96.4 74 96.4 L70.6 96.4Z", c) +
          flat("M74 62 Q77.4 63 77.8 66 L78.6 92 Q78 95.6 75.4 96.2Z", shade(c), 0.6)
      : `<path d="M56 58.6 Q61 56.6 66 59.6" stroke="${shade(c)}" stroke-width="2.6" fill="none"/><path d="M63.6 60 L63 82" stroke="${shade(c)}" stroke-width="2.4"/>`;
  return behind
    ? ""
    : fill("M48.2 58 L51 57.4 L52.2 81 L49.2 81Z", shade(c)) + fill("M71.8 58 L69 57.4 L67.8 81 L70.8 81Z", shade(c));
}

// Earrings at the lobes that show.
export function earrings(c: string, at: [number, number][]): string {
  return at
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.5" fill="none" stroke="${c}" stroke-width="1.1"/>`)
    .join("");
}

// A watch round a wrist (x, y: the wrist, the forearm running down).
export function watch(p: Paint, c: string, x: number, y: number): string {
  return `<rect x="${x - 3.6}" y="${y - 3.4}" width="7.2" height="2.8" rx="1" fill="${c}" ${p.O(0.8)}/><circle cx="${x}" cy="${y - 2}" r="1.3" fill="#e8f2e0" ${p.O(0.5)}/>`;
}
