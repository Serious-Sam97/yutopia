// The bots' levels (docs/plan/117-bot-brains.md, F9a): each changes the whole brain — what it plays, what it
// throws, how well it hears, how it moves and aims — not just its aim. One table, read by every layer.

export type BotLevel = "easy" | "normal" | "hard" | "expert";
export const BOT_LEVEL_KEYS: BotLevel[] = ["easy", "normal", "hard", "expert"];

export interface LevelSpec {
  // ── aim (aim.ts) ──
  /** s from first sight to the first turn toward them (× surprise, × a little chance) */
  react: number;
  /** rad/s: the most the look turns */
  turn: number;
  /** rad: the aim's error as the flick lands, and what it settles to */
  err0: number;
  errFloor: number;
  /** 1/s: how fast the error settles */
  settle: number;
  /** s: how far behind a moving target the aim lags */
  lag: number;
  /** the share of shots aimed at the head */
  head: number;
  /** fires when the aim's within this many body half-widths */
  trigger: number;
  /** the AK: rounds in a burst at range (0: holds it down) */
  burst: number;
  /** shoots through a wall at someone it knows is there (the gun's that pierce) */
  wallbang: boolean;
  /** aims at the corner before it's round it, where someone's likely */
  prefire: boolean;
  // ── senses (senses.ts) ──
  /** m it spots someone at in the light */
  sight: number;
  /** × the sounds' reach */
  hear: number;
  // ── moving (walk.ts, brain.ts) ──
  /** stops (counter-strafes) before a shot at range */
  counter: boolean;
  /** strafes side to side in a fight at close and middle range */
  strafe: boolean;
  /** steps back into cover to reload and re-peeks */
  cover: boolean;
  /** walks quietly near where enemies are likely */
  quiet: boolean;
  /** goes to a teammate's fight or where they fell (0 never … 1 always) */
  trade: number;
  // ── the side (team.ts) ──
  /** the plays it may pick (the Raiders') */
  plays: ("rush" | "split" | "default" | "fake" | "lurk")[];
  /** its setups adapt to what happened in earlier rounds */
  reads: boolean;
  /** throws: none, smokes, smokes and flashes, everything */
  utility: 0 | 1 | 2 | 3;
  /** a side's buys agree (eco, force, full) */
  economy: boolean;
}

export const LEVELS: Record<BotLevel, LevelSpec> = {
  easy: {
    react: 0.75,
    turn: 3.5,
    err0: 0.14,
    errFloor: 0.034,
    settle: 2,
    lag: 0.3,
    head: 0.05,
    trigger: 2.6,
    burst: 0,
    wallbang: false,
    prefire: false,
    sight: 45,
    hear: 0.6,
    counter: false,
    strafe: false,
    cover: false,
    quiet: false,
    trade: 0.2,
    plays: ["rush"],
    reads: false,
    utility: 0,
    economy: false,
  },
  normal: {
    react: 0.45,
    turn: 6,
    err0: 0.09,
    errFloor: 0.02,
    settle: 3.5,
    lag: 0.2,
    head: 0.25,
    trigger: 2,
    burst: 8,
    wallbang: false,
    prefire: false,
    sight: 65,
    hear: 0.85,
    counter: true,
    strafe: false,
    cover: true,
    quiet: true,
    trade: 0.55,
    plays: ["rush", "split", "default"],
    reads: false,
    utility: 1,
    economy: true,
  },
  hard: {
    react: 0.3,
    turn: 9,
    err0: 0.06,
    errFloor: 0.012,
    settle: 5,
    lag: 0.13,
    head: 0.5,
    trigger: 1.6,
    burst: 5,
    wallbang: true,
    prefire: false,
    sight: 85,
    hear: 1,
    counter: true,
    strafe: true,
    cover: true,
    quiet: true,
    trade: 0.85,
    plays: ["rush", "split", "default", "fake", "lurk"],
    reads: true,
    utility: 2,
    economy: true,
  },
  expert: {
    react: 0.2,
    turn: 13,
    err0: 0.04,
    errFloor: 0.007,
    settle: 7,
    lag: 0.08,
    head: 0.75,
    trigger: 1.25,
    burst: 3,
    wallbang: true,
    prefire: true,
    sight: 100,
    hear: 1.1,
    counter: true,
    strafe: true,
    cover: true,
    quiet: true,
    trade: 1,
    plays: ["rush", "split", "default", "fake", "lurk"],
    reads: true,
    utility: 3,
    economy: true,
  },
};
export const isBotLevel = (s: string): s is BotLevel => s in LEVELS;
