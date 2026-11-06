export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, g: c.getContext("2d") as CanvasRenderingContext2D };
}

const hexRgb = (h: string): [number, number, number] => {
  const n = Number.parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const lerpHex = (a: string, b: string, t: number): number => {
  const A = hexRgb(a);
  const B = hexRgb(b);
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return (c[0] << 16) | (c[1] << 8) | c[2];
};
export const css = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

// Colour keys through the day: [hour, ...colours]; returns them blended for `hour`.
export function keyed(keys: [number, ...string[]][], hour: number): number[] {
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1][0] <= hour) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const t = Math.max(0, Math.min(1, (hour - a[0]) / (b[0] - a[0])));
  const s = t * t * (3 - 2 * t);
  return a.slice(1).map((c, k) => lerpHex(c as string, b[k + 1] as string, s));
}
