// How each surface takes a tyre (docs/plan/28-the-car.md, M3 + M7): the
// friction's peak, the slip it peaks at, how fast it falls off past the peak,
// what it costs to roll through it, how deep a tyre sinks, how rough it is.

export type Ground = "asphalt" | "slush" | "blackice" | "walk" | "path" | "snow" | "deep" | "ice" | "rock" | "floor";

export interface Grip {
  mu: number; // peak friction
  kappa: number; // slip ratio at the peak (spinning / locking)
  alpha: number; // slip angle at the peak (radians)
  slide: number; // what's left of the peak when sliding fully (0..1): low = it lets go
  shape: number; // how quickly it falls from the peak towards `slide` (bigger: sooner)
  crr: number; // rolling resistance (× load)
  plough: number; // drag through loose snow (× load, per m/s)
  sink: number; // how deep a tyre sinks (m)
  rough: number; // the bumps' height (m)
  /** the sound and the trace it leaves */
  trace: "none" | "light" | "ruts" | "scratch" | "spray";
}

export const GRIP: Record<Ground, Grip> = {
  asphalt: {
    mu: 0.86,
    kappa: 0.1,
    alpha: 0.12,
    slide: 0.74,
    shape: 1.6,
    crr: 0.013,
    plough: 0,
    sink: 0,
    rough: 0.002,
    trace: "none",
  },
  slush: {
    mu: 0.56,
    kappa: 0.12,
    alpha: 0.14,
    slide: 0.7,
    shape: 1.2,
    crr: 0.03,
    plough: 0.004,
    sink: 0.03,
    rough: 0.006,
    trace: "spray",
  },
  blackice: {
    mu: 0.13,
    kappa: 0.05,
    alpha: 0.05,
    slide: 0.82,
    shape: 1.0,
    crr: 0.008,
    plough: 0,
    sink: 0,
    rough: 0,
    trace: "none",
  },
  walk: {
    mu: 0.7,
    kappa: 0.11,
    alpha: 0.13,
    slide: 0.76,
    shape: 1.4,
    crr: 0.016,
    plough: 0,
    sink: 0,
    rough: 0.004,
    trace: "none",
  },
  path: {
    mu: 0.4,
    kappa: 0.18,
    alpha: 0.19,
    slide: 0.86,
    shape: 0.6,
    crr: 0.02,
    plough: 0.001,
    sink: 0.02,
    rough: 0.012,
    trace: "light",
  },
  snow: {
    mu: 0.36,
    kappa: 0.24,
    alpha: 0.23,
    slide: 0.88,
    shape: 0.5,
    crr: 0.028,
    plough: 0.0016,
    sink: 0.07,
    rough: 0.02,
    trace: "ruts",
  },
  deep: {
    mu: 0.3,
    kappa: 0.3,
    alpha: 0.26,
    slide: 0.9,
    shape: 0.45,
    crr: 0.05,
    plough: 0.0035,
    sink: 0.12,
    rough: 0.025,
    trace: "ruts",
  },
  ice: {
    mu: 0.1,
    kappa: 0.04,
    alpha: 0.05,
    slide: 0.78,
    shape: 1.1,
    crr: 0.008,
    plough: 0,
    sink: 0,
    rough: 0.001,
    trace: "scratch",
  },
  rock: {
    mu: 0.6,
    kappa: 0.12,
    alpha: 0.14,
    slide: 0.78,
    shape: 1.2,
    crr: 0.03,
    plough: 0,
    sink: 0,
    rough: 0.04,
    trace: "none",
  },
  floor: {
    mu: 0.7,
    kappa: 0.11,
    alpha: 0.13,
    slide: 0.76,
    shape: 1.4,
    crr: 0.016,
    plough: 0,
    sink: 0,
    rough: 0,
    trace: "none",
  },
};

/** The friction curve normalised to its peak: 0 at no slip, 1 at s = 1 (the peak), falling
 *  towards `slide` beyond it. `s` is the combined slip measured in peaks. */
export function curve(g: Grip, s: number): number {
  if (s <= 1) return Math.sin((Math.PI / 2) * s) * rise(s);
  return g.slide + (1 - g.slide) * Math.exp(-g.shape * (s - 1));
}
// (a little more grip early on than a sine: tyres are stiff near zero slip)
function rise(s: number): number {
  return 1 + 0.18 * s * (1 - s);
}

/** A grip blended towards another (a storm laying fresh snow on the road). */
export function blend(a: Grip, b: Grip, k: number): Grip {
  if (k <= 0) return a;
  if (k >= 1) return b;
  const m = (x: number, y: number) => x + (y - x) * k;
  return {
    mu: m(a.mu, b.mu),
    kappa: m(a.kappa, b.kappa),
    alpha: m(a.alpha, b.alpha),
    slide: m(a.slide, b.slide),
    shape: m(a.shape, b.shape),
    crr: m(a.crr, b.crr),
    plough: m(a.plough, b.plough),
    sink: m(a.sink, b.sink),
    rough: m(a.rough, b.rough),
    trace: k > 0.5 ? b.trace : a.trace,
  };
}
