import type { AvatarLayers } from "@yutopia/shared";

// Yutopia people, drawn as vector illustrations (like Vortex in Yondra): soft
// gradients, warm ink outlines, real hair silhouettes, clothing details. Five
// drawn views — S (front), SW (¾ front), W (side), NW (¾ back), N (back) — the
// other three facings are mirrors. viewBox 64×100, feet on y = 96.

export type View = "S" | "SW" | "W" | "NW" | "N";

const INK = "#2a1a12";
const SOLE = "#efe4cc";

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

function hexToRgb(h: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
  const n = m ? Number.parseInt(m[1], 16) : 0x888888;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function sh(h: string, f: number): string {
  const [r, g, b] = hexToRgb(h);
  const c = (v: number) =>
    Math.max(0, Math.min(255, Math.round(f >= 1 ? v + (255 - v) * (f - 1) : v * f)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

interface Pose {
  view: View;
  frame: number; // 0..3 walk cycle (0/2 passing, 1/3 stride)
  sitting: boolean;
}

export function avatarSvg(a: AvatarLayers, view: View, frame: number, sitting: boolean, px = 2): string {
  // deterministic ids: the same drawing renders identically on server and client
  const id = `a${hash(`${JSON.stringify(a)}|${view}|${frame}|${sitting}`)}`;
  const p: Pose = { view, frame: frame % 4, sitting };
  const back = view === "N" || view === "NW";
  const side = view === "W";
  const three = view === "SW" || view === "NW";
  const stride = sitting ? 0 : [0, 1, 0, -1][p.frame];
  const bob = sitting ? 2 : p.frame % 2 === 0 ? -0.8 : 0;
  const skin = a.skin;
  const hair = a.hairColor;
  const top = a.topColor;
  const bottom = a.bottomColor;
  const acc = a.accessoryColor;
  const sw = { regular: 13, broad: 15, slim: 11 }[a.body as "regular"] ?? 13;
  const hw = { regular: 11, broad: 12.5, slim: 9.5 }[a.body as "regular"] ?? 11;
  const k = side ? 0.76 : three ? 0.88 : 1; // torso width by turn
  const fs = side ? -7 : view === "SW" ? -3.2 : view === "NW" ? -2 : 0; // features lean towards the facing
  const hx = 32 + (side ? -1 : three ? -1 : 0); // head centre x
  const hy = 26 + bob;
  const O = `stroke="${INK}" stroke-width="1.3" stroke-linejoin="round"`;

  const defs = `<defs>
<radialGradient id="${id}sk" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="${sh(skin, 1.12)}"/><stop offset=".6" stop-color="${skin}"/><stop offset="1" stop-color="${sh(skin, 0.86)}"/></radialGradient>
<linearGradient id="${id}hr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sh(hair, 1.28)}"/><stop offset=".45" stop-color="${hair}"/><stop offset="1" stop-color="${sh(hair, 0.78)}"/></linearGradient>
<linearGradient id="${id}tp" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${sh(top, 1.12)}"/><stop offset=".55" stop-color="${top}"/><stop offset="1" stop-color="${sh(top, 0.8)}"/></linearGradient>
<linearGradient id="${id}bt" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${sh(bottom, 1.12)}"/><stop offset=".55" stop-color="${bottom}"/><stop offset="1" stop-color="${sh(bottom, 0.8)}"/></linearGradient>
<linearGradient id="${id}ac" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${sh(acc, 1.2)}"/><stop offset="1" stop-color="${sh(acc, 0.82)}"/></linearGradient>
</defs>`;
  const SK = `url(#${id}sk)`;
  const HR = `url(#${id}hr)`;
  const TP = `url(#${id}tp)`;
  const BT = `url(#${id}bt)`;
  const AC = `url(#${id}ac)`;

  // limbs: an ink stroke under a coloured stroke = a clean cartoon outline
  // (solid colours: SVG gradients on a straight stroke have a zero-width bbox
  // and silently vanish), plus a soft highlight down the lit side
  const solid = (c: string) => (c === SK ? skin : c === TP ? top : c === BT ? bottom : c);
  const limb = (d: string, color: string, w: number) => {
    const c = solid(color);
    return `<path d="${d}" stroke="${INK}" stroke-width="${w + 2.4}" stroke-linecap="round" fill="none"/><path d="${d}" stroke="${c}" stroke-width="${w}" stroke-linecap="round" fill="none"/><path d="${d}" stroke="${sh(c, 1.22)}" stroke-width="${w * 0.28}" stroke-linecap="round" fill="none" transform="translate(${-w * 0.22} 0)" opacity=".7"/>`;
  };

  const parts: string[] = [];
  const shY = 44 + bob; // shoulder line
  const hipY = 66 + bob;

  // ── hair behind the head ────────────────────────────────────────────────
  parts.push(hairBack(a.hair, view, hx, hy, HR, O));

  // ── legs + shoes ────────────────────────────────────────────────────────
  const legColor = a.bottom === "shorts" || a.bottom === "skirt" || a.top === "dress" ? SK : BT;
  const legSkinFromY = a.bottom === "shorts" ? hipY + 9 : a.bottom === "skirt" || a.top === "dress" ? hipY + 11 : 999;
  // 80s sneakers: dark upper, cream sole, a stripe in the top's colour
  const shoe = (x: number, y: number, dir: -1 | 0 | 1) => {
    const w = dir === 0 ? 5 : 7.2;
    const ox = dir === 0 ? 0 : dir * 2.2;
    const upper = sh(bottom, 0.35);
    return `<path d="M${x - w + ox} ${y - 1.6} C${x - w + ox} ${y - 6.4} ${x - 1 + ox} ${y - 7} ${x + ox} ${y - 7} C${x + w * 0.8 + ox} ${y - 7} ${x + w + ox} ${y - 4.6} ${x + w + ox} ${y - 1.6} Z" fill="${upper}" ${O}/><rect x="${x - w + ox - 0.4}" y="${y - 2.4}" width="${w * 2 + 0.8}" height="2.6" rx="1.2" fill="${SOLE}" ${O}/><path d="M${x - w * 0.55 + ox} ${y - 4.2} Q${x + ox} ${y - 5.6} ${x + w * 0.55 + ox} ${y - 4.2}" stroke="${sh(top, 1.1)}" stroke-width="1.1" fill="none" stroke-linecap="round"/>`;
  };
  const leg = (x: number, x2: number, y0: number, y1: number, color: string) => {
    if (legSkinFromY > y1) return limb(`M${x} ${y0} L${x2} ${y1}`, color, 7);
    // trousers above, skin below (shorts / skirts)
    const t = (legSkinFromY - y0) / (y1 - y0);
    const mx = x + (x2 - x) * t;
    return (
      limb(`M${x} ${y0} L${x2} ${y1}`, SK, 6.4) +
      (t > 0 ? limb(`M${x} ${y0} L${mx} ${legSkinFromY}`, color === SK ? BT : color, 7.4) : "")
    );
  };
  if (sitting) {
    // thighs forward (towards the viewer in front views), shins down
    if (side) {
      parts.push(limb(`M${32} ${hipY} L${22} ${hipY + 2} L${21} ${hipY + 14}`, BT, 7), shoe(19, hipY + 18, -1));
    } else {
      for (const dx of [-4.6, 4.6]) {
        parts.push(limb(`M${32 + dx * k} ${hipY} L${32 + dx * k} ${hipY + 5}`, BT, 7.6));
        parts.push(limb(`M${32 + dx * k} ${hipY + 6} L${32 + dx * k} ${hipY + 15}`, legColor === SK ? SK : BT, 6.6));
        if (!back) parts.push(shoe(32 + dx * k, hipY + 19, 0));
      }
    }
  } else if (side) {
    const s = stride * 6;
    const lift = stride !== 0 ? 1.4 : 0;
    // far leg first (darker), then near leg
    parts.push(
      `<g opacity=".92">${leg(33, 33 + s, hipY, 90, legColor)}</g>`,
      shoe(33 + s - 1.5, 96 - (s > 0 ? lift : 0), -1),
    );
    parts.push(leg(31, 31 - s, hipY, 90, legColor), shoe(31 - s - 1.5, 96 - (s < 0 ? lift : 0), -1));
  } else {
    const lx = 32 - 4.6 * (three ? 0.9 : 1) + fs * 0.15;
    const rx = 32 + 4.6 * (three ? 0.9 : 1) + fs * 0.15;
    const l = stride > 0 ? 2.2 : 0;
    const r = stride < 0 ? 2.2 : 0;
    parts.push(leg(lx, lx, hipY, 90 - l, legColor), leg(rx, rx, hipY, 90 - r, legColor));
    if (!back) parts.push(shoe(lx, 96 - l, 0), shoe(rx, 96 - r, 0));
    else parts.push(shoe(lx, 96 - l, 0), shoe(rx, 96 - r, 0));
    // jeans: seams + cuffs
    if (a.bottom === "jeans" && legSkinFromY > 92) {
      parts.push(
        `<path d="M${lx} ${hipY + 4} V${90 - l} M${rx} ${hipY + 4} V${90 - r}" stroke="${sh(bottom, 1.35)}" stroke-width=".6" stroke-dasharray="1.6 1.2" opacity=".8"/>`,
        `<path d="M${lx - 3.5} ${90.6 - l} H${lx + 3.5} M${rx - 3.5} ${90.6 - r} H${rx + 3.5}" stroke="${sh(bottom, 1.3)}" stroke-width="1.2"/>`,
      );
    }
    if (a.bottom === "trousers" && legSkinFromY > 92)
      parts.push(
        `<path d="M${lx} ${hipY + 3} V${90 - l} M${rx} ${hipY + 3} V${90 - r}" stroke="${sh(bottom, 0.7)}" stroke-width=".7"/>`,
      );
  }

  // ── arms behind the torso (side views) ──────────────────────────────────
  const sleeveLong = !(a.top === "tee" || a.top === "dress");
  const armSwing = sitting ? 0 : stride * 5;
  // an arm with an elbow (ex, ey): skin underneath, sleeve on top, a hand
  const arm = (x0: number, y0: number, x1: number, y1: number, shade = 1, ex?: number, ey?: number) => {
    const s = shade === 1 ? top : sh(top, shade * 0.95);
    const exx = ex ?? x0 + (x1 - x0) * 0.5;
    const eyy = ey ?? y0 + (y1 - y0) * 0.5;
    const path = `M${x0} ${y0} L${exx} ${eyy} L${x1} ${y1}`;
    const sleeve = sleeveLong
      ? `M${x0} ${y0} L${exx} ${eyy} L${x1 + (exx - x1) * 0.12} ${y1 - 2}`
      : `M${x0} ${y0} L${x0 + (exx - x0) * 0.85} ${y0 + (eyy - y0) * 0.85}`;
    return `${limb(path, SK, 5.2) + limb(sleeve, s, 6.4)}<circle cx="${x1}" cy="${y1 + 0.6}" r="3" fill="${SK}" ${O}/>`;
  };
  if (side) parts.push(arm(33, shY + 1, 33 + armSwing + 1, shY + 19, 0.8, 34 + armSwing * 0.4, shY + 10));

  // ── skirt / dress hem behind the torso ─────────────────────────────────
  if (a.top === "dress" || a.bottom === "skirt") {
    const col = a.top === "dress" ? TP : BT;
    const w0 = hw * k;
    const w1 = (hw + 5) * k;
    parts.push(
      `<path d="M${32 - w0} ${hipY - 2} L${32 - w1} ${hipY + 12} Q32 ${hipY + 14.5} ${32 + w1} ${hipY + 12} L${32 + w0} ${hipY - 2} Z" fill="${col}" ${O}/>`,
      `<path d="M${32 - w1 + 2} ${hipY + 10} Q32 ${hipY + 12.5} ${32 + w1 - 2} ${hipY + 10}" stroke="${INK}" stroke-opacity=".25" fill="none"/>`,
    );
  }
  if (a.bottom === "shorts" && a.top !== "dress" && !sitting) {
    parts.push(
      `<path d="M${32 - hw * k - 0.5} ${hipY - 2} L${32 - hw * k - 1.5} ${hipY + 9} L${31} ${hipY + 9} L32 ${hipY + 4} L33 ${hipY + 9} L${32 + hw * k + 1.5} ${hipY + 9} L${32 + hw * k + 0.5} ${hipY - 2} Z" fill="${BT}" ${O}/>`,
    );
  }

  // ── torso ───────────────────────────────────────────────────────────────
  const S = sw * k;
  const H = hw * k;
  const tx = side ? 31 : 32;
  const longTop = a.top === "jacket" || a.top === "hoodie";
  const hemY = hipY + (longTop ? 2.5 : 0.5);
  const torso = `M${tx - S} ${shY + 3} C${tx - S} ${shY - 1} ${tx - S + 4} ${shY - 2.4} ${tx} ${shY - 2.4} C${tx + S - 4} ${shY - 2.4} ${tx + S} ${shY - 1} ${tx + S} ${shY + 3} L${tx + H + 0.5} ${hemY} Q${tx} ${hemY + 2.2} ${tx - H - 0.5} ${hemY} Z`;
  if (a.top === "hoodie" && !back) {
    // hood resting behind the neck
    parts.push(
      `<path d="M${tx - 9 * k} ${shY - 1} Q${tx} ${shY - 8} ${tx + 9 * k} ${shY - 1} Q${tx} ${shY + 3} ${tx - 9 * k} ${shY - 1} Z" fill="${sh(top, 0.78)}" ${O}/>`,
    );
  }
  parts.push(`<path d="${torso}" fill="${TP}" ${O}/>`);
  // belt line for trousers/jeans under shorter tops
  if (!longTop && a.top !== "dress" && (a.bottom === "jeans" || a.bottom === "trousers"))
    parts.push(
      `<path d="M${tx - H} ${hipY - 0.4} Q${tx} ${hipY + 1.4} ${tx + H} ${hipY - 0.4}" stroke="${sh(bottom, 0.55)}" stroke-width="1.6" fill="none"/>`,
    );
  parts.push(topDetails(a, p, tx, shY, hipY, S, H, top, back, side, fs));

  // ── front arms ──────────────────────────────────────────────────────────
  // profile: the near arm hangs a little forward, bent at the elbow
  if (side) parts.push(arm(30.5, shY + 1, 27.5 - armSwing, shY + 18.5, 1, 30 - armSwing * 0.45, shY + 10));
  else if (sitting && !back) {
    parts.push(arm(tx - S + 1, shY + 1, tx - S + 4, shY + 17), arm(tx + S - 1, shY + 1, tx + S - 4, shY + 17));
  } else {
    const ax = three ? 0.9 : 1;
    parts.push(arm(tx - S + 0.5, shY + 1, tx - S - 1.5 * ax, shY + 19 - Math.max(0, armSwing) * 0.5));
    parts.push(arm(tx + S - 0.5, shY + 1, tx + S + 1.5 * ax, shY + 19 - Math.max(0, -armSwing) * 0.5));
  }
  if (a.accessory === "walkman" && !back) {
    const wx = side ? 34 : tx + H - 4;
    parts.push(
      `<rect x="${wx}" y="${hipY - 7}" width="7" height="9" rx="1.4" fill="${AC}" ${O}/><rect x="${wx + 1.3}" y="${hipY - 5}" width="4.4" height="2.6" rx=".6" fill="${INK}"/><circle cx="${wx + 2.4}" cy="${hipY - 3.7}" r=".6" fill="${SOLE}"/><circle cx="${wx + 4.6}" cy="${hipY - 3.7}" r=".6" fill="${SOLE}"/>`,
      `<path d="M${wx + 3.5} ${hipY - 7} Q${wx + 1} ${shY + 6} ${hx + (side ? 4 : 11)} ${hy + 6}" stroke="${INK}" stroke-width=".7" fill="none"/>`,
    );
  }

  // ── neck + head ─────────────────────────────────────────────────────────
  parts.push(
    `<rect x="${hx - 3.4}" y="${hy + 10}" width="6.8" height="${shY - hy - 9}" rx="2" fill="${sh(skin, 0.86)}" ${O}/>`,
  );
  parts.push(`<ellipse cx="${hx}" cy="${hy + 11.5}" rx="4" ry="1.6" fill="${sh(skin, 0.7)}" opacity=".7"/>`);
  // ears
  const ear = (x: number) =>
    `<ellipse cx="${x}" cy="${hy + 2}" rx="2.6" ry="3.6" fill="${SK}" ${O}/><ellipse cx="${x}" cy="${hy + 2}" rx="1.1" ry="1.9" fill="${sh(skin, 0.8)}"/>`;
  if (view === "S" || view === "N") parts.push(ear(hx - 14.6), ear(hx + 14.6));
  else if (view === "SW") parts.push(ear(hx + 13.2));
  else if (view === "NW") parts.push(ear(hx - 13.2));
  else parts.push(ear(hx + 3));
  // skull (side view gets a nose + chin profile)
  if (side)
    parts.push(
      `<path d="M${hx + 13} ${hy - 2} C${hx + 13} ${hy - 12} ${hx + 6} ${hy - 15} ${hx - 1} ${hy - 15} C${hx - 9} ${hy - 15} ${hx - 14} ${hy - 9} ${hx - 14} ${hy - 1} C${hx - 14} ${hy + 1} ${hx - 15.6} ${hy + 2.4} ${hx - 15.4} ${hy + 3.6} C${hx - 15.2} ${hy + 4.8} ${hx - 13.8} ${hy + 4.8} ${hx - 13.6} ${hy + 6} C${hx - 12.6} ${hy + 11} ${hx - 7} ${hy + 14} ${hx - 1} ${hy + 14} C${hx + 7} ${hy + 14} ${hx + 13} ${hy + 8} ${hx + 13} ${hy - 2} Z" fill="${SK}" ${O}/>`,
    );
  else parts.push(`<ellipse cx="${hx}" cy="${hy}" rx="14.8" ry="14.4" fill="${SK}" ${O}/>`);

  // ── face ────────────────────────────────────────────────────────────────
  if (!back) parts.push(face(p, hx + fs, hy, hair, skin));

  // ── hair in front + accessories ─────────────────────────────────────────
  parts.push(hairFront(a.hair, view, hx, hy, HR, hair, O));
  parts.push(accessory(a.accessory, view, hx + fs * 0.4, hy, AC, acc, O));

  const w = 64 * px;
  const h = 100 * px;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 64 100">${defs}${parts.join("")}</svg>`;
}

function face(p: Pose, cx: number, hy: number, hair: string, skin: string): string {
  const out: string[] = [];
  const eye = (x: number, rx: number) =>
    `<ellipse cx="${x}" cy="${hy + 2.6}" rx="${rx}" ry="3.1" fill="${INK}"/><circle cx="${x + 0.9}" cy="${hy + 1.3}" r="1" fill="#fff"/><circle cx="${x - 0.5}" cy="${hy + 3.9}" r=".45" fill="#fff" opacity=".8"/>`;
  const brow = (x: number, tilt: number) =>
    `<path d="M${x - 2.6} ${hy - 2.4 + tilt} Q${x} ${hy - 3.8} ${x + 2.6} ${hy - 2.6 - tilt}" stroke="${sh(hair, 0.8)}" stroke-width="1.5" fill="none" stroke-linecap="round"/>`;
  const blush = (x: number) => `<ellipse cx="${x}" cy="${hy + 6.6}" rx="2.6" ry="1.4" fill="#d4664f" opacity=".32"/>`;
  if (p.view === "W") {
    out.push(eye(cx - 1.4, 2), brow(cx - 1.4, 0), blush(cx + 1.6));
    out.push(
      `<path d="M${cx - 6.4} ${hy + 8.2} Q${cx - 4.6} ${hy + 9.4} ${cx - 3} ${hy + 8.4}" stroke="#7a3424" stroke-width="1.2" fill="none" stroke-linecap="round"/>`,
    );
  } else {
    const narrow = p.view === "SW";
    const L = cx - 5.4;
    const R = cx + 5.4;
    out.push(eye(L, narrow ? 1.9 : 2.3), eye(R, 2.3), brow(L, 0.2), brow(R, -0.2), blush(L - 1.6), blush(R + 1.6));
    out.push(
      `<path d="M${cx - 0.6} ${hy + 5.2} Q${cx + 0.4} ${hy + 6.4} ${cx + 1.2} ${hy + 5.6}" stroke="${sh(skin, 0.68)}" stroke-width="1" fill="none" stroke-linecap="round"/>`,
    );
    out.push(
      `<path d="M${cx - 2.8} ${hy + 8.2} Q${cx} ${hy + 10.6} ${cx + 2.8} ${hy + 8.2}" stroke="#7a3424" stroke-width="1.25" fill="none" stroke-linecap="round"/>`,
    );
  }
  return out.join("");
}

function topDetails(
  a: AvatarLayers,
  p: Pose,
  tx: number,
  shY: number,
  hipY: number,
  S: number,
  H: number,
  top: string,
  back: boolean,
  side: boolean,
  fs: number,
): string {
  const o: string[] = [];
  const cx = tx + (side ? -2 : fs * 0.35);
  const dark = sh(top, 0.62);
  const light = sh(top, 1.3);
  if (back) {
    if (a.top === "hoodie")
      o.push(
        `<path d="M${tx - 7} ${shY - 2} Q${tx} ${shY + 10} ${tx + 7} ${shY - 2}" fill="${sh(top, 0.8)}" stroke="${INK}" stroke-width="1.2"/>`,
      );
    if (a.top === "jacket") o.push(`<path d="M${tx} ${shY} V${hipY + 1}" stroke="${dark}" stroke-width=".8"/>`);
    if (a.top === "sweater")
      o.push(`<path d="M${tx - H} ${hipY - 1} H${tx + H}" stroke="${dark}" stroke-width="1.8"/>`);
    return o.join("");
  }
  switch (a.top) {
    case "tee":
      o.push(
        `<path d="M${cx - 4} ${shY - 2.2} Q${cx} ${shY + 2.2} ${cx + 4} ${shY - 2.2}" fill="${sh(a.skin, 0.9)}" stroke="${INK}" stroke-width="1.1"/>`,
      );
      o.push(
        `<path d="M${cx - 4.6} ${shY - 2} Q${cx} ${shY + 3} ${cx + 4.6} ${shY - 2}" stroke="${dark}" stroke-width="1" fill="none"/>`,
      );
      break;
    case "hoodie":
      o.push(
        `<path d="M${cx - 2} ${shY - 1} V${shY + 7} M${cx + 2} ${shY - 1} V${shY + 7}" stroke="${sh(top, 1.6)}" stroke-width=".9" stroke-linecap="round"/>`,
      );
      o.push(
        `<path d="M${cx - 6} ${hipY - 9} H${cx + 6} L${cx + 7} ${hipY - 2} H${cx - 7} Z" fill="${sh(top, 0.86)}" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>`,
      );
      o.push(
        `<path d="M${tx - H} ${hipY + 0.6} Q${tx} ${hipY + 3} ${tx + H} ${hipY + 0.6}" stroke="${dark}" stroke-width="1.6" fill="none"/>`,
      );
      break;
    case "shirt":
      o.push(
        `<path d="M${cx - 5} ${shY - 2} L${cx} ${shY + 3} L${cx - 1.2} ${shY - 2.4} Z M${cx + 5} ${shY - 2} L${cx} ${shY + 3} L${cx + 1.2} ${shY - 2.4} Z" fill="${light}" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>`,
      );
      o.push(`<path d="M${cx} ${shY + 3} V${hipY}" stroke="${dark}" stroke-width=".8"/>`);
      for (let i = 0; i < 4; i++) o.push(`<circle cx="${cx + 1.2}" cy="${shY + 6 + i * 4.4}" r=".7" fill="${light}"/>`);
      o.push(`<path d="M${cx + 3} ${shY + 6} h4 v3.6 h-4 Z" fill="none" stroke="${dark}" stroke-width=".7"/>`);
      break;
    case "jacket":
      o.push(
        `<path d="M${cx - 3.2} ${shY - 1} L${cx - 2.6} ${hipY + 1.6} H${cx + 2.6} L${cx + 3.2} ${shY - 1} Z" fill="#efe4cc" stroke="${INK}" stroke-width=".9"/>`,
      );
      o.push(
        `<path d="M${cx - 3.2} ${shY - 1} L${cx - 7} ${shY + 7} L${cx - 3} ${shY + 10} Z M${cx + 3.2} ${shY - 1} L${cx + 7} ${shY + 7} L${cx + 3} ${shY + 10} Z" fill="${sh(top, 0.85)}" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/>`,
      );
      o.push(`<path d="M${cx - 8} ${hipY - 6} h4 M${cx + 4} ${hipY - 6} h4" stroke="${dark}" stroke-width="1"/>`);
      break;
    case "sweater":
      o.push(
        `<path d="M${tx - S + 1} ${shY + 8} H${tx + S - 1}" stroke="${light}" stroke-width="2.6"/><path d="M${tx - S + 1} ${shY + 11.4} H${tx + S - 1}" stroke="${dark}" stroke-width="1.4"/>`,
      );
      o.push(
        `<path d="M${cx - 3.6} ${shY - 2} Q${cx} ${shY + 1.6} ${cx + 3.6} ${shY - 2}" stroke="${dark}" stroke-width="1.6" fill="none"/>`,
      );
      for (let i = -3; i <= 3; i++)
        o.push(`<path d="M${tx + i * 2.6} ${hipY - 2.4} v2.6" stroke="${dark}" stroke-width=".7"/>`);
      break;
    case "dress":
      o.push(
        `<path d="M${cx - 4} ${shY - 2.2} Q${cx} ${shY + 2.6} ${cx + 4} ${shY - 2.2}" fill="${sh(a.skin, 0.9)}" stroke="${INK}" stroke-width="1.1"/>`,
      );
      o.push(
        `<path d="M${tx - H} ${hipY - 4} Q${tx} ${hipY - 2.6} ${tx + H} ${hipY - 4}" stroke="${sh(top, 0.5)}" stroke-width="1.8" fill="none"/>`,
      );
      break;
  }
  void p;
  return o.join("");
}

function hairBack(style: string, view: View, hx: number, hy: number, HR: string, O: string): string {
  const back = view === "N" || view === "NW";
  const side = view === "W";
  switch (style) {
    case "long":
      if (side)
        return `<path d="M${hx + 2} ${hy - 12} C${hx + 16} ${hy - 12} ${hx + 18} ${hy + 6} ${hx + 16} ${hy + 26} C${hx + 10} ${hy + 30} ${hx + 3} ${hy + 28} ${hx + 2} ${hy + 18} Z" fill="${HR}" ${O}/>`;
      return `<path d="M${hx - 16} ${hy - 2} C${hx - 17} ${hy + 14} ${hx - 15} ${hy + 24} ${hx - 12} ${hy + 27} Q${hx} ${hy + 31} ${hx + 12} ${hy + 27} C${hx + 15} ${hy + 24} ${hx + 17} ${hy + 14} ${hx + 16} ${hy - 2} Z" fill="${HR}" ${O}/>`;
    case "afro": {
      const ox = side ? 3 : back ? 0 : 0;
      return `<circle cx="${hx + ox}" cy="${hy - 3}" r="20" fill="${HR}" ${O}/>`;
    }
    case "bob":
      if (side)
        return `<path d="M${hx - 3} ${hy - 15} C${hx + 12} ${hy - 16} ${hx + 17} ${hy - 4} ${hx + 16} ${hy + 11} L${hx + 1} ${hy + 12} Z" fill="${HR}" ${O}/>`;
      return `<path d="M${hx - 16.5} ${hy - 4} C${hx - 16.5} ${hy - 17} ${hx + 16.5} ${hy - 17} ${hx + 16.5} ${hy - 4} V${hy + 12} Q${hx} ${hy + 14} ${hx - 16.5} ${hy + 12} Z" fill="${HR}" ${O}/>`;
    case "bun":
      return `<circle cx="${hx + (side ? 7 : 0)}" cy="${hy - 15.5}" r="6.4" fill="${HR}" ${O}/><path d="M${hx + (side ? 4 : -3)} ${hy - 17} q3 -2 6 0" stroke="#fff" stroke-opacity=".3" stroke-width="1" fill="none"/>`;
    case "curly":
      return back || side ? `<circle cx="${hx + (side ? 3 : 0)}" cy="${hy - 1}" r="16" fill="${HR}" ${O}/>` : "";
    default:
      return "";
  }
}

function hairFront(style: string, view: View, hx: number, hy: number, HR: string, hair: string, O: string): string {
  const back = view === "N" || view === "NW";
  const side = view === "W";
  const shine = (x: number, y: number, w: number) =>
    `<path d="M${x - w} ${y} Q${x} ${y - 2.4} ${x + w} ${y}" stroke="#fff" stroke-opacity=".32" stroke-width="1.3" fill="none" stroke-linecap="round"/>`;
  if (style === "bald") return `<ellipse cx="${hx - 4}" cy="${hy - 8}" rx="4" ry="2" fill="#fff" opacity=".22"/>`;
  if (style === "mohawk") {
    const shaved = back
      ? `<ellipse cx="${hx}" cy="${hy - 2}" rx="14.6" ry="14" fill="${hair}" opacity=".22"/>`
      : `<path d="M${hx - 14} ${hy - 1} C${hx - 14} ${hy - 14} ${hx + 14} ${hy - 14} ${hx + 14} ${hy - 1} Q${hx} ${hy - 9} ${hx - 14} ${hy - 1} Z" fill="${hair}" opacity=".22"/>`;
    const crest = side
      ? `<path d="M${hx - 9} ${hy - 9} C${hx - 8} ${hy - 22} ${hx + 6} ${hy - 24} ${hx + 11} ${hy - 9} Q${hx + 1} ${hy - 13} ${hx - 9} ${hy - 9} Z" fill="${HR}" ${O}/>`
      : `<path d="M${hx - 3} ${hy - 11} C${hx - 4} ${hy - 22} ${hx + 4} ${hy - 22} ${hx + 3} ${hy - 11} Z" fill="${HR}" ${O}/>`;
    return shaved + crest;
  }
  if (style === "curly") {
    const out: string[] = [];
    const n = side ? 6 : 9;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const ang = side ? Math.PI * (1.15 + t * 1.1) : Math.PI * (1.02 + t * 0.96);
      const r = 13.4;
      const x = hx + (side ? 2 : 0) + Math.cos(ang) * r;
      const y = hy - 1 + Math.sin(ang) * r;
      out.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="4.6" fill="${HR}" ${O}/>`);
    }
    if (back) out.push(`<circle cx="${hx}" cy="${hy}" r="13.6" fill="${HR}"/>`);
    return out.join("") + shine(hx - 4, hy - 12, 3);
  }
  if (style === "afro") {
    if (back) return "";
    return side
      ? `<path d="M${hx - 12} ${hy - 4} Q${hx - 6} ${hy - 13} ${hx + 4} ${hy - 12}" stroke="${sh(hair, 0.75)}" stroke-width="1.4" fill="none"/>`
      : `<path d="M${hx - 13} ${hy - 2} Q${hx} ${hy - 12} ${hx + 13} ${hy - 2}" stroke="${sh(hair, 0.7)}" stroke-width="1.6" fill="none"/>`;
  }
  // caps of hair: short, long, bob, bun share a scalp with a fringe
  if (back) {
    const cap = `<ellipse cx="${hx}" cy="${hy - 1}" rx="15.6" ry="15.2" fill="${HR}" ${O}/>`;
    const nape =
      style === "short" || style === "bun"
        ? `<path d="M${hx - 9} ${hy + 11} Q${hx} ${hy + 15} ${hx + 9} ${hy + 11}" stroke="${sh(hair, 0.7)}" stroke-width="1" fill="none"/>`
        : "";
    const longBack =
      style === "long"
        ? `<path d="M${hx - 15} ${hy} C${hx - 15} ${hy + 20} ${hx + 15} ${hy + 20} ${hx + 15} ${hy} Z" fill="${HR}"/>`
        : "";
    return cap + longBack + nape + shine(hx - 3, hy - 9, 4);
  }
  if (side) {
    const cap = `<path d="M${hx - 13.5} ${hy - 3} C${hx - 14} ${hy - 15} ${hx - 3} ${hy - 17.5} ${hx + 4} ${hy - 16} C${hx + 12} ${hy - 14} ${hx + 15} ${hy - 6} ${hx + 14} ${hy + 4} C${hx + 11} ${hy + 6} ${hx + 7} ${hy + 4} ${hx + 5} ${hy - 1} C${hx + 2} ${hy - 6} ${hx - 5} ${hy - 8} ${hx - 9} ${hy - 6} C${hx - 11} ${hy - 5} ${hx - 12.5} ${hy - 4} ${hx - 13.5} ${hy - 3} Z" fill="${HR}" ${O}/>`;
    const lng =
      style === "long"
        ? `<path d="M${hx + 8} ${hy} C${hx + 10} ${hy + 12} ${hx + 12} ${hy + 20} ${hx + 9} ${hy + 25}" stroke="${sh(hair, 0.8)}" stroke-width="1" fill="none"/>`
        : "";
    return cap + lng + shine(hx - 2, hy - 12, 4);
  }
  // front / ¾ front: scalp + a fringe with a couple of tufts
  const ox = view === "SW" ? -1.4 : 0;
  const fringe =
    style === "bob"
      ? `<path d="M${hx - 15} ${hy - 1} C${hx - 15.4} ${hy - 15} ${hx + 15.4} ${hy - 15} ${hx + 15} ${hy - 1} L${hx + 13} ${hy - 4} L${hx + ox + 10} ${hy - 5.6} H${hx + ox - 10} L${hx - 13} ${hy - 4} Z" fill="${HR}" ${O}/>`
      : `<path d="M${hx - 15} ${hy + 1} C${hx - 15.6} ${hy - 14} ${hx - 6} ${hy - 17.4} ${hx} ${hy - 17} C${hx + 7} ${hy - 17.4} ${hx + 15.6} ${hy - 14} ${hx + 15} ${hy + 1} C${hx + 13.6} ${hy - 4} ${hx + 11.6} ${hy - 6.6} ${hx + ox + 7} ${hy - 7.4} C${hx + ox + 4.6} ${hy - 4.6} ${hx + ox + 1} ${hy - 4.2} ${hx + ox - 2.6} ${hy - 6.4} C${hx + ox - 5.6} ${hy - 4.4} ${hx + ox - 9.6} ${hy - 4.6} ${hx - 11.4} ${hy - 5.6} C${hx - 13} ${hy - 4} ${hx - 14.4} ${hy - 1.6} ${hx - 15} ${hy + 1} Z" fill="${HR}" ${O}/>`;
  const sides =
    style === "long"
      ? `<path d="M${hx - 15} ${hy - 2} C${hx - 17} ${hy + 10} ${hx - 16} ${hy + 20} ${hx - 13} ${hy + 25} L${hx - 10.6} ${hy + 22} C${hx - 12} ${hy + 14} ${hx - 12.4} ${hy + 6} ${hx - 11.6} ${hy - 2} Z M${hx + 15} ${hy - 2} C${hx + 17} ${hy + 10} ${hx + 16} ${hy + 20} ${hx + 13} ${hy + 25} L${hx + 10.6} ${hy + 22} C${hx + 12} ${hy + 14} ${hx + 12.4} ${hy + 6} ${hx + 11.6} ${hy - 2} Z" fill="${HR}" ${O}/>`
      : style === "bob"
        ? `<path d="M${hx - 15.4} ${hy - 3} V${hy + 11} H${hx - 11} V${hy - 2} Z M${hx + 15.4} ${hy - 3} V${hy + 11} H${hx + 11} V${hy - 2} Z" fill="${HR}" ${O}/>`
        : `<path d="M${hx - 14.6} ${hy} L${hx - 13.6} ${hy + 5} L${hx - 12.4} ${hy - 1} Z M${hx + 14.6} ${hy} L${hx + 13.6} ${hy + 5} L${hx + 12.4} ${hy - 1} Z" fill="${HR}"/>`;
  return sides + fringe + shine(hx - 4, hy - 12, 4);
}

function accessory(kind: string, view: View, hx: number, hy: number, AC: string, acc: string, O: string): string {
  const back = view === "N" || view === "NW";
  const side = view === "W";
  switch (kind) {
    case "glasses":
      if (back) return "";
      if (side)
        return `<circle cx="${hx - 1.6}" cy="${hy + 2.6}" r="3.6" fill="#fff" fill-opacity=".14" stroke="${INK}" stroke-width="1.3"/><path d="M${hx + 2} ${hy + 2} L${hx + 9} ${hy + 1.4}" stroke="${INK}" stroke-width="1.1"/>`;
      return `<circle cx="${hx - 5.4}" cy="${hy + 2.6}" r="3.8" fill="#fff" fill-opacity=".14" stroke="${INK}" stroke-width="1.3"/><circle cx="${hx + 5.4}" cy="${hy + 2.6}" r="3.8" fill="#fff" fill-opacity=".14" stroke="${INK}" stroke-width="1.3"/><path d="M${hx - 1.6} ${hy + 2} Q${hx} ${hy + 1} ${hx + 1.6} ${hy + 2}" stroke="${INK}" stroke-width="1.1" fill="none"/>`;
    case "headphones": {
      const band = side
        ? `<path d="M${hx + 3} ${hy - 2} C${hx + 4} ${hy - 14} ${hx - 1} ${hy - 19} ${hx - 6} ${hy - 17}" stroke="${INK}" stroke-width="4.6" fill="none" stroke-linecap="round"/><path d="M${hx + 3} ${hy - 2} C${hx + 4} ${hy - 14} ${hx - 1} ${hy - 19} ${hx - 6} ${hy - 17}" stroke="${acc}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`
        : `<path d="M${hx - 15} ${hy} C${hx - 16} ${hy - 23} ${hx + 16} ${hy - 23} ${hx + 15} ${hy}" stroke="${INK}" stroke-width="4.6" fill="none"/><path d="M${hx - 15} ${hy} C${hx - 16} ${hy - 23} ${hx + 16} ${hy - 23} ${hx + 15} ${hy}" stroke="${acc}" stroke-width="2.6" fill="none"/>`;
      const cup = (x: number) =>
        `<rect x="${x - 3.6}" y="${hy - 3}" width="7.2" height="10" rx="3.2" fill="${AC}" ${O}/><rect x="${x - 1.6}" y="${hy - 1}" width="3.2" height="6" rx="1.4" fill="${sh(acc, 0.6)}"/>`;
      const cups = side
        ? cup(hx + 3)
        : view === "SW"
          ? cup(hx + 13.6)
          : view === "NW"
            ? cup(hx - 13.6)
            : cup(hx - 15) + cup(hx + 15);
      return band + cups;
    }
    case "cap": {
      const dome = `<path d="M${hx - 15.4} ${hy - 4} C${hx - 15.4} ${hy - 20} ${hx + 15.4} ${hy - 20} ${hx + 15.4} ${hy - 4} Q${hx} ${hy - 7.4} ${hx - 15.4} ${hy - 4} Z" fill="${AC}" ${O}/><circle cx="${hx}" cy="${hy - 16.4}" r="1.4" fill="${sh(acc, 0.6)}"/>`;
      if (back) return `${dome}<path d="M${hx - 4} ${hy - 4.4} h8" stroke="${sh(acc, 0.55)}" stroke-width="2"/>`;
      if (side)
        return `<path d="M${hx - 13} ${hy - 5} C${hx - 13} ${hy - 19} ${hx + 14} ${hy - 19} ${hx + 14} ${hy - 4} Z" fill="${AC}" ${O}/><path d="M${hx - 12} ${hy - 5} L${hx - 22} ${hy - 3.4} Q${hx - 22} ${hy - 6} ${hx - 13} ${hy - 7.6} Z" fill="${sh(acc, 0.78)}" ${O}/>`;
      return `${dome}<path d="M${hx - 14} ${hy - 4.6} Q${hx - 2} ${hy + 1.6} ${hx + 14} ${hy - 4.6} Q${hx} ${hy - 1.4} ${hx - 14} ${hy - 4.6} Z" fill="${sh(acc, 0.78)}" ${O}/>`;
    }
    case "beanie":
      return `<path d="M${hx - 15.4} ${hy - 4} C${hx - 15.4} ${hy - 22} ${hx + 15.4} ${hy - 22} ${hx + 15.4} ${hy - 4} Z" fill="${AC}" ${O}/><rect x="${hx - 15.8}" y="${hy - 7.6}" width="31.6" height="5.6" rx="2" fill="${sh(acc, 0.78)}" ${O}/>${[-10, -5, 0, 5, 10].map((d) => `<path d="M${hx + d} ${hy - 7} v4.6" stroke="${sh(acc, 0.6)}" stroke-width=".7"/>`).join("")}<circle cx="${hx}" cy="${hy - 19}" r="3.8" fill="${sh(acc, 1.25)}" ${O}/>`;
    default:
      return "";
  }
}
