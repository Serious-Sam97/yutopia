import { drain, fill } from "./needs.ts";

// A survivor's vitals (docs/plan/30-the-dark.md, D2): health, stamina, warmth
// and the torch's battery, 0..100. The server settles them every tick from what
// the body did (vitalsIn); the client runs the same steps for its own stamina,
// so a sprint stops the moment it runs out, and takes the server's word when
// they drift apart. Stamina drains only outside: the office's sprint is free.

export interface Vitals {
  hp: number;
  st: number;
  wm: number;
  bat: number;
}
export const FULL_VITALS: Vitals = { hp: 100, st: 100, wm: 100, bat: 100 };

export interface VitalsClock {
  /** s since stamina last went down (it comes back after VITALS.st.after) */
  sinceDrain: number;
  /** s since a strike (health comes back after VITALS.hp.after) */
  sinceHurt: number;
  /** out of breath: no sprint, no roll, until stamina is back to VITALS.st.unwind */
  winded: boolean;
  /** the battery ran out focusing: no focus until it's back to VITALS.bat.back */
  drained: boolean;
}
export const freshClock = (): VitalsClock => ({ sinceDrain: 99, sinceHurt: 99, winded: false, drained: false });

export interface VitalsIn {
  sprinting: boolean;
  /** out on the Grounds (level 0, the land or the lot) */
  outside: boolean;
  /** 0 day … 1 night (danger.ts nightness) */
  night: number;
  /** 0 calm … 1 a blizzard */
  storm: number;
  /** indoors (any building), in a lamp's pool, in a car */
  warm: boolean;
  /** the torch focused (phase 3) */
  focus: boolean;
}

export const VITALS = {
  // per second
  st: { sprint: 16, roll: 22, regen: 25, after: 0.7, unwind: 25 },
  hp: { regen: 1, after: 8, upTo: 60 },
  // 0.6 a minute outside at night (twice that in a blizzard); 20 a minute somewhere warm;
  // frozen, stamina comes back at half speed (the cold never kills)
  wm: { night: 0.6 / 60, warmUp: 20 / 60, coldRegen: 0.5 },
  // (run out, the focus is gone until it's back to `back`: at 0 it isn't on and off every step)
  bat: { focus: 12, regen: 4, upTo: 40, back: 25 },
} as const;

/** `dt` s of being alive: `v` and `c` change in place. */
export function stepVitals(v: Vitals, c: VitalsClock, i: VitalsIn, dt: number): void {
  if (dt <= 0) return;
  // stamina
  if (i.sprinting && i.outside && !c.winded) {
    v.st = drain(v.st, VITALS.st.sprint, dt);
    c.sinceDrain = 0;
    if (v.st <= 0) c.winded = true;
  } else {
    c.sinceDrain += dt;
    if (c.sinceDrain >= VITALS.st.after) v.st = fill(v.st, VITALS.st.regen * (v.wm <= 0 ? VITALS.wm.coldRegen : 1), dt);
  }
  if (c.winded && v.st >= VITALS.st.unwind) c.winded = false;
  // health
  c.sinceHurt += dt;
  if (c.sinceHurt >= VITALS.hp.after && v.hp > 0) v.hp = fill(v.hp, VITALS.hp.regen, dt, VITALS.hp.upTo);
  // warmth
  if (i.warm) v.wm = fill(v.wm, VITALS.wm.warmUp, dt);
  else if (i.outside) v.wm = drain(v.wm, VITALS.wm.night * i.night * (1 + Math.min(1, Math.max(0, i.storm))), dt);
  // the battery
  if (i.focus) {
    v.bat = drain(v.bat, VITALS.bat.focus, dt);
    if (v.bat < 1e-6) {
      v.bat = 0; // (not a float's dust left: that would be on and off again)
      c.drained = true;
    }
  } else v.bat = fill(v.bat, VITALS.bat.regen, dt, VITALS.bat.upTo);
  if (c.drained && v.bat >= VITALS.bat.back) c.drained = false;
}

/** Can the torch focus? Battery left, and not run out and still coming back. */
export const canFocus = (v: Vitals, c: VitalsClock): boolean => v.bat > 0 && !c.drained;

/** A roll's cost: false (refused) while winded; outside it takes VITALS.st.roll
 *  (what's left, if less), indoors nothing. */
export function spendRoll(v: Vitals, c: VitalsClock, outside: boolean): boolean {
  if (c.winded) return false;
  if (!outside) return true;
  v.st = drain(v.st, VITALS.st.roll, 1);
  c.sinceDrain = 0;
  if (v.st <= 0) c.winded = true;
  return true;
}

/** A strike (phase 4): `n` off health. */
export function hurt(v: Vitals, c: VitalsClock, n: number): void {
  v.hp = drain(v.hp, n, 1);
  c.sinceHurt = 0;
}

/** A level as the byte on the wire (Player.hp / st / wm). */
export const vitalByte = (x: number) => Math.round(Math.max(0, Math.min(100, x)));

/** Down (docs/plan/30-the-dark.md D7): bleeding out (s; it waits while someone gets you up),
 *  a teammate's hold to get you up (s, within `reach`), your own first aid (s); the health you
 *  come back with; crawling (tiles / s); away outside at night this long (s), you go down. */
export const DOWN = {
  bleed: 30,
  revive: 3,
  selfAid: 5,
  reach: 1.5,
  upHp: 35,
  awakeHp: 50,
  crawl: 0.6,
  awayOut: 30,
} as const;
