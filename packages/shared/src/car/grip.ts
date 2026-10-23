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

/** What a car stands on, axle by axle (docs/plan/34-the-vehicles.md, wave 2): tyres, a pair of
 *  skis (the snowmobile's front), or a track (its back; both of the snowcat's). */
export type Foot = "tyre" | "ski" | "track" | "lug" | "runner";

// A ski's and a track's take on each ground, in place of a tyre's: the friction's peak and what it
// costs to slide or roll over it. A ski glides on snow and carves into it; on bare ground it
// scrapes, slow. A track floats on deep snow and grips it best of all; on a road it grinds (on
// the roads, slowly: docs/plan/34's decision). Both sink far less than a tyre, plough less.
const FEET: Record<"ski" | "track" | "lug" | "runner", Record<Ground, [mu: number, crr: number]>> = {
  // a toboggan's wooden runners: they slide, but snow drags at them (and bare ground stops them)
  runner: {
    snow: [0.3, 0.07],
    deep: [0.3, 0.12],
    path: [0.3, 0.06],
    slush: [0.25, 0.1],
    ice: [0.12, 0.02],
    blackice: [0.1, 0.02],
    asphalt: [0.4, 0.4],
    walk: [0.4, 0.4],
    floor: [0.4, 0.4],
    rock: [0.4, 0.5],
  },
  // a tractor's big lugged tyre: it bites snow and mud as no road tyre does
  lug: {
    deep: [0.55, 0.06],
    snow: [0.6, 0.03],
    path: [0.6, 0.025],
    slush: [0.5, 0.03],
    ice: [0.15, 0.01],
    blackice: [0.13, 0.01],
    asphalt: [0.8, 0.02],
    walk: [0.75, 0.02],
    floor: [0.75, 0.02],
    rock: [0.65, 0.03],
  },
  ski: {
    snow: [0.5, 0.006],
    deep: [0.45, 0.012],
    path: [0.45, 0.008],
    slush: [0.35, 0.02],
    ice: [0.25, 0.003],
    blackice: [0.2, 0.004],
    asphalt: [0.3, 0.12],
    walk: [0.3, 0.12],
    floor: [0.3, 0.12],
    rock: [0.3, 0.15],
  },
  track: {
    deep: [0.8, 0.02],
    snow: [0.75, 0.015],
    path: [0.7, 0.015],
    slush: [0.55, 0.025],
    // (studded: a track bites into ice as no tyre can)
    ice: [0.6, 0.01],
    blackice: [0.55, 0.01],
    asphalt: [0.5, 0.09],
    walk: [0.5, 0.09],
    floor: [0.5, 0.09],
    rock: [0.55, 0.07],
  },
};
/** A foot's grip on a ground (a tyre's: `base`, the ground's own). */
export function footGrip(foot: Foot, g: Ground, base: Grip): Grip {
  if (foot === "tyre") return base;
  const [mu, crr] = FEET[foot][g];
  return {
    ...base,
    mu,
    crr,
    kappa: foot === "track" ? 0.25 : foot === "lug" ? Math.max(base.kappa, 0.2) : base.kappa,
    alpha: foot === "ski" || foot === "runner" ? 0.2 : Math.max(base.alpha, 0.18),
    slide: foot === "track" ? 0.9 : Math.max(base.slide, 0.8),
    sink: base.sink * (foot === "lug" ? 0.6 : 0.2),
    plough: base.plough * (foot === "track" ? 0.1 : foot === "lug" ? 0.5 : 0.15),
  };
}
