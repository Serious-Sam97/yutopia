// The side's voice (docs/plan/117-bot-brains.md, phase 12, F7a; Orkin's "if the AI didn't say it, it didn't
// happen"): an event is said once, by the one who saw it, with the place and a count — "Two at Catwalk!" —; the
// round's plan is called at its start; nobody says the same thing again within its time, nobody talks over the last
// one, and a line that's gone stale before it's said is dropped. What's said is what the side then knows.

export type Call =
  | { k: "contact"; n: number; area: string }
  | { k: "heard"; n: number; area: string }
  | { k: "sniper"; area: string }
  | { k: "down"; left: number }
  | { k: "last"; area: string }
  | { k: "plan"; text: string }
  | { k: "hit" }
  | { k: "reload" }
  | { k: "backup"; area: string }
  | { k: "rotate"; to: string }
  | { k: "clear"; area: string }
  | { k: "planting" }
  | { k: "planted"; site: string }
  | { k: "defusing" }
  | { k: "dropped"; area: string }
  | { k: "bomb"; area: string }
  | { k: "hostage" }
  | { k: "roger" }
  | { k: "negative" }
  | { k: "onway" }
  | { k: "nice" };

const WORDS = ["None", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

/** The words of a call. */
export function lineOf(c: Call): string {
  switch (c.k) {
    case "contact":
      return c.n <= 1 ? `Contact, ${c.area}!` : `${WORDS[Math.min(10, c.n)]} at ${c.area}!`;
    case "heard":
      return c.n <= 1 ? `Footsteps at ${c.area}.` : `I hear ${WORDS[Math.min(10, c.n)].toLowerCase()} at ${c.area}.`;
    case "sniper":
      return `Sniper at ${c.area}!`;
    case "down":
      return c.left > 0 ? `Enemy down. ${c.left} left.` : "Enemy down.";
    case "last":
      return c.area ? `Last one, ${c.area}!` : "Last one!";
    case "plan":
      return c.text;
    case "hit":
      return "I'm hit!";
    case "reload":
      return "Reloading, cover me!";
    case "backup":
      return `Need backup at ${c.area}!`;
    case "rotate":
      return `Rotating to ${c.to}.`;
    case "clear":
      return `${c.area} clear.`;
    case "planting":
      return "Planting!";
    case "planted":
      return `The charge is down at ${c.site}!`;
    case "defusing":
      return "Defusing, cover me!";
    case "dropped":
      return `Charge dropped at ${c.area}.`;
    case "bomb":
      return `Charge spotted at ${c.area}!`;
    case "hostage":
      return "I've got a hostage, falling back!";
    case "roger":
      return "Roger that.";
    case "negative":
      return "Negative.";
    case "onway":
      return "On my way.";
    case "nice":
      return "Nice one.";
  }
}

/** Which calls are the same event (said once in its window), and how long that window is (s). */
const KEY: Record<Call["k"], number> = {
  contact: 10,
  heard: 12,
  sniper: 20,
  down: 1.2,
  last: 30,
  plan: 999,
  hit: 25,
  reload: 18,
  backup: 15,
  rotate: 12,
  clear: 20,
  planting: 10,
  planted: 60,
  defusing: 15,
  dropped: 20,
  bomb: 15,
  hostage: 15,
  roger: 4,
  negative: 4,
  onway: 6,
  nice: 30,
};
/** Which come first when several wait. */
const PRIO: Record<Call["k"], number> = {
  planted: 9,
  defusing: 9,
  planting: 8,
  bomb: 8,
  contact: 7,
  heard: 5,
  sniper: 7,
  last: 7,
  dropped: 6,
  hostage: 6,
  down: 6,
  backup: 5,
  plan: 5,
  rotate: 4,
  roger: 4,
  negative: 4,
  onway: 3,
  hit: 3,
  reload: 2,
  clear: 2,
  nice: 1,
};
const keyOf = (c: Call): string =>
  c.k === "contact" || c.k === "heard" || c.k === "sniper" || c.k === "clear" || c.k === "backup"
    ? `${c.k}:${c.area}`
    : c.k;

interface Waiting {
  by: string;
  c: Call;
  at: number;
}

/** A side's radio. `ask` a call; `step` gives the lines to say now. */
export class Radio {
  private said = new Map<string, { at: number; n: number }>();
  private texts = new Map<string, number>();
  private spoke = new Map<string, number>();
  private last = -99;
  private q: Waiting[] = [];
  /** the lines said this round (the lab counts them) */
  count = 0;
  /** the side's size (a big side's lines further apart) */
  size = 5;
  log: { at: number; by: string; text: string }[] = [];

  /** A call, if it's news: the same event within its window isn't (a contact is again if there are more of them). */
  ask(by: string, c: Call, now: number): boolean {
    const key = keyOf(c);
    const had = this.said.get(key);
    const n = c.k === "contact" || c.k === "heard" ? c.n : 0;
    // (a big side's contacts held longer: ten pairs of eyes see the same fight from five places)
    const win = KEY[c.k] * (this.size > 5 && (c.k === "contact" || c.k === "heard") ? 1.6 : 1);
    if (had && now - had.at < win && !((c.k === "contact" || c.k === "heard") && n > had.n)) return false;
    // (heard where they've already been seen: not news)
    if (c.k === "heard" && now - (this.said.get(`contact:${c.area}`)?.at ?? -99) < 9) return false;
    // (already waiting: a contact keeps the bigger count; a down adds up)
    const w = this.q.find((x) => keyOf(x.c) === key);
    if (w) {
      if ((c.k === "contact" || c.k === "heard") && w.c.k === c.k) {
        w.c.n = Math.max(w.c.n, c.n);
        w.at = now;
      }
      if (c.k === "down" && w.c.k === "down") w.c.left = c.left;
      return true;
    }
    this.q.push({ by, c, at: now });
    this.said.set(key, { at: now, n });
    return true;
  }
  /** Lines to say now: one at most, 1.2 s after the last (longer on a big side: 3.4 s for ten — the same air shared
   *  by twice the voices); nobody twice within 3 s; the same words not within 15 s; a wait past 2.5 s dropped (1.5 s
   *  a contact's). */
  step(now: number, alive: (id: string) => boolean): { by: string; text: string } | null {
    this.q = this.q.filter((w) => now - w.at < (w.c.k === "contact" ? 1.5 : 2.5) && alive(w.by));
    if (!this.q.length || now - this.last < 1.2 * Math.max(1, this.size / 5) ** 1.5) return null;
    this.q.sort((a, b) => PRIO[b.c.k] - PRIO[a.c.k] || a.at - b.at);
    for (let i = 0; i < this.q.length; i++) {
      const w = this.q[i];
      if (now - (this.spoke.get(w.by) ?? -99) < 3) continue;
      const text = lineOf(w.c);
      if (now - (this.texts.get(text) ?? -99) < 15) {
        this.q.splice(i, 1);
        i--;
        continue;
      }
      this.q.splice(i, 1);
      this.last = now;
      this.spoke.set(w.by, now);
      this.texts.set(text, now);
      this.count++;
      this.log.push({ at: now, by: w.by, text });
      if (this.log.length > 200) this.log.shift();
      return { by: w.by, text };
    }
    return null;
  }
  /** A new round: the windows kept (a line said at the end of one isn't news at the start of the next), the wait
   *  dropped. */
  round(size = 5) {
    this.q = [];
    this.count = 0;
    this.size = size;
  }
}
