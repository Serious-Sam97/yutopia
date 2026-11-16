import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";

// The pictures the Blender cars still paint here (docs/plan/92: everything else is in their files): the
// snow and the rain on the windscreen with the wipers' fans (docs/plan/28, 65), the number plate.
// Painted once each for the same arguments, shared (docs/plan/89-the-weight.md phase 3).

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d") as CanvasRenderingContext2D];
}
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}
function tex(c: HTMLCanvasElement, srgb = true, repeat = false): CanvasTexture {
  const t = new CanvasTexture(c);
  if (srgb) t.colorSpace = SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** The plate: made-up text, embossed black on cream. */
function paintPlate(text: string): CanvasTexture {
  const [c, g] = canvas(256, 64);
  g.fillStyle = "#e8e2cf";
  g.fillRect(0, 0, 256, 64);
  g.strokeStyle = "#2b2b2b";
  g.lineWidth = 3;
  g.strokeRect(4, 4, 248, 56);
  g.fillStyle = "#1d1d1d";
  g.font = '700 40px "DIN Condensed", "Arial Narrow", Arial, sans-serif';
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 128, 35);
  return tex(c);
}

/** The snow on the windscreen's outside, with the wipers' cleared fans (docs/plan/28: the
 *  windscreen). Painted in the glass's own metres: `z` across (−hw..hw), `s` up the glass
 *  (0..len). `wipers`: each pivot (z), arm length and the arc it has swept (radians from
 *  lying flat along the base, towards +z then up). */
function paintWindscreenSnow(
  hw: number,
  len: number,
  amount: number,
  wipers: { z: number; arm: number; blade: number; a0: number; a1: number }[],
  seed = 3,
  W = 1024,
): CanvasTexture {
  const H = Math.round((W * len) / (2 * hw));
  const [c, g] = canvas(W, H);
  const r = rng(seed);
  const X = (z: number) => ((z + hw) / (2 * hw)) * W;
  const Y = (s: number) => H - (s / len) * H; // s = 0 at the bottom
  const px = W / (2 * hw);
  g.clearRect(0, 0, W, H);
  // settled flakes everywhere, thicker low down and at the edges
  for (let i = 0; i < 7000 * amount * (W / 1024) ** 2; i++) {
    const x = r() * W;
    const y = r() ** 0.7 * H;
    const s = 0.5 + r() ** 2 * 1.9;
    g.fillStyle = `rgba(232,240,250,${0.3 + r() * 0.5})`;
    g.beginPath();
    g.arc(x, H - y * 0.999, s, 0, Math.PI * 2);
    g.fill();
  }
  // a drift banked on the base
  const base = g.createLinearGradient(0, H, 0, H - 0.09 * px);
  base.addColorStop(0, `rgba(240,244,248,${0.95 * amount})`);
  base.addColorStop(1, "rgba(240,244,248,0)");
  g.fillStyle = base;
  g.fillRect(0, H - 0.09 * px, W, 0.09 * px);
  // the wipers' fans: cleared, with a ridge of snow pushed to their ends
  g.save();
  g.globalCompositeOperation = "destination-out";
  for (const w of wipers) {
    const cx = X(w.z);
    const cy = Y(0);
    const r0 = (w.arm - w.blade) * px;
    const r1 = w.arm * px;
    g.fillStyle = "rgba(0,0,0,0.97)";
    g.beginPath();
    // canvas angles: 0 = +x (the +z direction), up = negative y
    g.arc(cx, cy, r1, -w.a1, -w.a0, false);
    g.arc(cx, cy, r0, -w.a0, -w.a1, true);
    g.closePath();
    g.fill();
  }
  g.restore();
  // streaks left in the fans, then the ridges at each end of the sweep
  for (const w of wipers) {
    const cx = X(w.z);
    const cy = Y(0);
    for (let i = 0; i < 26; i++) {
      const rr = (w.arm - w.blade + r() * w.blade) * px;
      const a = w.a0 + r() * (w.a1 - w.a0);
      g.strokeStyle = `rgba(230,236,242,${0.08 + r() * 0.12})`;
      g.lineWidth = 0.8;
      g.beginPath();
      g.arc(cx, cy, rr, -a - 0.05 - r() * 0.2, -a, false);
      g.stroke();
    }
    for (const a of [w.a0, w.a1]) {
      for (let k = 0; k < 60; k++) {
        const rr = (w.arm - w.blade + r() * w.blade) * px;
        const aa = a + (a === w.a0 ? -1 : 1) * r() * 0.05;
        g.fillStyle = `rgba(246,249,252,${0.6 + r() * 0.4})`;
        g.beginPath();
        g.arc(cx + Math.cos(aa) * rr, cy - Math.sin(aa) * rr, 1.6 + r() * 3.2, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  // meltwater beads in the cleared glass
  for (let i = 0; i < 420; i++) {
    const x = r() * W;
    const y = r() * H;
    g.fillStyle = `rgba(210,222,235,${0.12 + r() * 0.18})`;
    g.beginPath();
    g.arc(x, y, 0.8 + r() * 1.6, 0, Math.PI * 2);
    g.fill();
  }
  return tex(c);
}

/** Rain on a windscreen (docs/plan/65, W7): beads of water, a dark rim and a bright spot each, more
 *  and bigger the more `amount`, a few running down in trails; the wipers' fans wiped to a thin
 *  smear with only fresh specks in them. As windscreenSnow is drawn: the screen's own size. */
function paintWindscreenRain(
  hw: number,
  len: number,
  amount: number,
  wipers: { z: number; arm: number; blade: number; a0: number; a1: number }[],
  seed = 5,
  W = 512,
): CanvasTexture {
  const H = Math.round((W * len) / (2 * hw));
  const [c, g] = canvas(W, H);
  const r = rng(seed);
  const X = (z: number) => ((z + hw) / (2 * hw)) * W;
  const Y = (s: number) => H - (s / len) * H;
  const px = W / (2 * hw);
  g.clearRect(0, 0, W, H);
  const bead = (x: number, y: number, s: number) => {
    g.fillStyle = "rgba(40,50,62,0.28)";
    g.beginPath();
    g.arc(x, y, s, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "rgba(200,214,228,0.32)";
    g.beginPath();
    g.arc(x, y, s * 0.72, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.75)";
    g.beginPath();
    g.arc(x - s * 0.3, y - s * 0.35, Math.max(0.6, s * 0.25), 0, Math.PI * 2);
    g.fill();
  };
  for (let i = 0; i < 1600 * amount * (W / 512) ** 2; i++)
    bead(r() * W, r() * H, 0.8 + r() ** 3 * 3.5 * (0.5 + amount));
  // trails: a few beads run down, leaving a wet line
  for (let i = 0; i < 26 * amount; i++) {
    const x = r() * W;
    const y0 = r() * H * 0.7;
    const l = 20 + r() * 80;
    g.strokeStyle = "rgba(190,206,222,0.22)";
    g.lineWidth = 1.5 + r() * 1.5;
    g.beginPath();
    g.moveTo(x, y0);
    g.lineTo(x + (r() - 0.5) * 6, y0 + l);
    g.stroke();
    bead(x, y0 + l, 2.2 + r() * 1.8);
  }
  // the wipers' fans: wiped (a smear of a few fresh drops left)
  g.save();
  g.globalCompositeOperation = "destination-out";
  for (const w of wipers) {
    const cx = X(w.z);
    const cy = Y(0);
    g.fillStyle = "rgba(0,0,0,0.93)";
    g.beginPath();
    g.arc(cx, cy, w.arm * px, -w.a1, -w.a0, false);
    g.arc(cx, cy, (w.arm - w.blade) * px, -w.a0, -w.a1, true);
    g.closePath();
    g.fill();
  }
  g.restore();
  for (const w of wipers)
    for (let i = 0; i < 40; i++) {
      const rr = (w.arm - w.blade + r() * w.blade) * px;
      const a = w.a0 + r() * (w.a1 - w.a0);
      bead(X(w.z) + Math.cos(a) * rr, Y(0) - Math.sin(a) * rr, 0.7 + r() * 1.2);
    }
  return tex(c);
}

// ── painted once ──
const painted = new Map<string, CanvasTexture>();
function once<A extends unknown[]>(name: string, paint: (...a: A) => CanvasTexture): (...a: A) => CanvasTexture {
  return (...a: A) => {
    const key = `${name}|${JSON.stringify(a)}`;
    let t = painted.get(key);
    if (!t) {
      t = paint(...a);
      t.userData.repaint = () => paint(...a);
      t.userData.painted = key;
      // (shared by every car that shows it: never let go by one of them)
      t.dispose = () => {};
      painted.set(key, t);
    }
    return t;
  };
}
export const plateTexture = once("plate", paintPlate);
export const windscreenSnow = once("windscreenSnow", paintWindscreenSnow);
export const windscreenRain = once("windscreenRain", paintWindscreenRain);
