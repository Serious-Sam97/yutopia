// Someone else as they were a moment ago, smooth over a link that isn't (docs/plan/89-the-weight.md phase 7, F3b).
// A stream of states — a person's moves on their own clock (Player.mt), the room's NPCs and pets on the server's
// (WorldState.tickAt) — put on this client's clock and drawn a little behind: as far behind as they've had to be
// lately for the next state to be here by the time it's needed. On a steady link that's the 110 ms it always was;
// over one that comes in bursts, up to 250 ms, eased there (never stepped: the drawn clock runs a little slow while it
// deepens, a little fast while it shallows). Their clock to mine is the fastest a state's come lately — followed
// within a second or two when the link gets slower, not the old 2 ms a second (a minute late after a route change).
// The cars have the same, their own (car/playback.ts).

/** ms behind: a steady link's (as it always was) */
export const MIN_DELAY = 110;
/** ms behind at most: deeper, people lag their own voices */
export const MAX_DELAY = 250;
const BASE_WINDOW = 2000; // ms: the fastest a state's come lately (the clocks' offset)
const NEED_WINDOW = 5000; // ms: how deep the buffer has had to be lately
const PCT = 0.95;
const MARGIN = 10; // ms over it
const GAP_MAX = 300; // ms: a longer gap between states is a stop and a start (nothing to draw between), not a slow sender
const RISE = 0.1; // the offset rises to a slower link at most this ms a ms (the states ~10% further apart meanwhile)
const GROW = 0.1; // the delay deepens at most this ms a ms (the drawn clock at 0.9×)
const SHRINK = 0.03; // … and shallows (1.03×)

export class Smooth {
  /** their clock to mine (ms; NaN: no state yet) */
  off = Number.NaN;
  /** how far behind they're drawn now (ms) */
  delay = MIN_DELAY;
  /** how far behind they should be */
  want = MIN_DELAY;
  /** (tests: as it was before — 110 ms always, the offset creeping up 2 ms a second: e2e/others-link.spec.ts' A/B) */
  fixed = false;
  private offAt = 0;
  private drawnAt = 0;
  private raws: { at: number; raw: number }[] = [];
  private needs: { at: number; need: number }[] = [];

  /** A state sent at `sent` (their clock, ms) come in `now` (mine): when it's played, on my clock — after `last`
   *  (the one before it, if any). */
  time(sent: number, now: number, last?: number): number {
    const raw = now - sent;
    const r = this.raws;
    r.push({ at: now, raw });
    while (r.length > 1 && r[0].at < now - BASE_WINDOW) r.shift();
    if (Number.isNaN(this.off)) this.off = raw;
    else if (this.fixed) this.off = Math.min(this.off + (now - this.offAt) * 0.002, raw);
    else {
      let base = raw;
      for (const o of r) if (o.raw < base) base = o.raw;
      // (faster than lately: that's the clocks as they are — at once, as before; slower: followed, eased)
      this.off = base <= this.off ? base : Math.min(base, this.off + (now - this.offAt) * RISE);
    }
    this.offAt = now;
    const t = last === undefined ? sent + this.off : Math.max(sent + this.off, last + 1);
    // how deep the buffer had to be for this one: drawn up to `last`, it had to be here by then
    if (last !== undefined && t - last <= GAP_MAX && !this.fixed) this.need(now - last, now);
    return t;
  }

  private need(need: number, now: number) {
    const n = this.needs;
    n.push({ at: now, need });
    while (n.length && n[0].at < now - NEED_WINDOW) n.shift();
    const s = n.map((o) => o.need).sort((a, b) => a - b);
    const pc = s[Math.min(s.length - 1, Math.floor(s.length * PCT))] ?? 0;
    this.want = Math.min(MAX_DELAY, Math.max(MIN_DELAY, pc + MARGIN));
  }

  /** The moment (my clock) they're drawn at `now`: `delay` behind it, the delay eased to what's wanted. */
  at(now: number): number {
    if (this.fixed) this.want = MIN_DELAY;
    const dt = Math.max(0, Math.min(250, now - (this.drawnAt || now)));
    this.drawnAt = Math.max(this.drawnAt, now);
    if (this.delay < this.want) this.delay = Math.min(this.want, this.delay + dt * GROW);
    else if (this.delay > this.want) this.delay = Math.max(this.want, this.delay - dt * SHRINK);
    return now - this.delay;
  }
}
