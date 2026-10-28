import { DOWN } from "@yutopia/shared/vitals";
import type { WorldController } from "../controller";
import type { Walker } from "../input/walker";

// Down, up, awake on my side (docs/plan/30-the-dark.md D7, the mock 03-revive):
// over whoever's down a red cross with what's left of their 30 s; by one, "hold
// E to get them up" (the pad's X) — held for 3 s, the ring fills; down myself,
// the screen red at the edges, my time, my first aid held for 5 s. The 3D view
// is told who crawls and who kneels.

const SEEN = 40; // tiles: a downed sign this far

interface Downed {
  sid: string;
  name: string;
  x: number;
  y: number;
  z: number;
  /** when I saw them go down (performance.now), and how long someone's held (ms) */
  seenAt: number;
  held: number;
  revBy: string;
  revAt: number; // (performance.now: since I saw the hold start)
}

const t = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export class Down {
  private readonly signs = new Map<string, HTMLDivElement>();
  private readonly mine = document.createElement("div");
  private readonly prompt = document.createElement("div");
  private seen = new Map<string, Downed>();
  /** holding: getting someone up (their sid), or my own first aid ("me") */
  private holding: string | null = null;
  private lastFrame = performance.now();

  constructor(
    private readonly ctl: WorldController,
    private readonly walker: Walker,
    private readonly root: HTMLElement,
    private readonly hasAid: () => boolean,
    private readonly tr: (key: string, vars?: Record<string, string>) => string,
  ) {
    this.mine.className = "dk-down";
    this.prompt.className = "abs dk-prompt";
    this.mine.style.display = "none";
    this.prompt.style.display = "none";
    root.append(this.mine, this.prompt);
  }

  dispose(): void {
    this.release();
    for (const el of this.signs.values()) el.remove();
    this.mine.remove();
    this.prompt.remove();
    this.ctl.tp?.downed.clear();
  }

  private sid(): string {
    return this.ctl.room?.sessionId ?? "";
  }
  private amDown(): boolean {
    return this.walker.down;
  }
  // the one down within reach to get up
  private nearDowned(): Downed | null {
    const me = this.walker.where();
    let best: Downed | null = null;
    let bd: number = DOWN.reach;
    for (const d of this.seen.values()) {
      if (d.sid === this.sid()) continue;
      const dist = Math.hypot(d.x - me.x, d.y - me.y);
      if (dist <= bd) {
        bd = dist;
        best = d;
      }
    }
    return best;
  }

  /** A use pressed (E, the pad's X): getting someone up, or my own first aid, held. */
  use(): boolean {
    const room = this.ctl.room;
    if (!room || this.holding) return !!this.holding;
    if (this.amDown()) {
      if (!this.hasAid()) return false;
      this.holding = "me";
      room.send("dark:selfaid", { on: true });
      return true;
    }
    const d = this.nearDowned();
    if (!d) return false;
    this.holding = d.sid;
    room.send("dark:revive", { sid: d.sid, on: true });
    return true;
  }
  /** The use let go. */
  release(): void {
    const room = this.ctl.room;
    if (!this.holding || !room) return;
    if (this.holding === "me") room.send("dark:selfaid", { on: false });
    else room.send("dark:revive", { sid: this.holding, on: false });
    this.holding = null;
  }

  frame(useHeld: boolean): void {
    const ctl = this.ctl;
    const room = ctl.room;
    const now = performance.now();
    const dt = now - this.lastFrame;
    this.lastFrame = now;
    if (this.holding && !useHeld) this.release();
    // who's down (and who's getting them up)
    const here = new Set<string>();
    const downed = ctl.tp?.downed;
    downed?.clear();
    room?.state.players.forEach(
      (p: {
        sid: string;
        name: string;
        x: number;
        y: number;
        z: number;
        level: number;
        downAt: number;
        revBy: string;
      }) => {
        if (!p.downAt || p.level !== ctl.level) return;
        here.add(p.sid);
        let d = this.seen.get(p.sid);
        if (!d) {
          d = { sid: p.sid, name: p.name, x: p.x, y: p.y, z: p.z, seenAt: now, held: 0, revBy: "", revAt: 0 };
          this.seen.set(p.sid, d);
        }
        d.x = p.x;
        d.y = p.y;
        d.z = p.z;
        if (p.revBy !== d.revBy) {
          d.revBy = p.revBy;
          d.revAt = now;
        }
        if (d.revBy) d.held += dt; // (the bleeding waits while someone holds)
        downed?.set(p.sid, "down");
        if (p.revBy) downed?.set(p.revBy, "kneel");
      },
    );
    for (const sid of [...this.seen.keys()]) if (!here.has(sid)) this.seen.delete(sid);
    if (this.holding && this.holding !== "me" && !this.seen.has(this.holding)) this.holding = null;
    if (this.holding === "me" && !this.amDown()) this.holding = null;

    // the signs over them (not me): a red cross, the time left, a ring while someone holds
    const me = this.walker.where();
    const at = (x: number, y: number, z: number) => {
      const c = ctl.clientAt(x, y, z * 39.19);
      const r = ctl.hostRect();
      return { x: c.x + r.left, y: c.y + r.top };
    };
    const shown = new Set<string>();
    for (const d of this.seen.values()) {
      if (d.sid === this.sid() || Math.hypot(d.x - me.x, d.y - me.y) > SEEN) continue;
      shown.add(d.sid);
      let el = this.signs.get(d.sid);
      if (!el) {
        el = document.createElement("div");
        el.className = "abs dk-sign";
        this.root.append(el);
        this.signs.set(d.sid, el);
      }
      const left = Math.max(0, DOWN.bleed - (now - d.seenAt - d.held) / 1000);
      const ring = d.revBy ? Math.min(1, (now - d.revAt) / (DOWN.revive * 1000)) : 0;
      const p = at(d.x, d.y, d.z + 0.9); // (over them, low: they crawl)
      el.style.left = `${p.x}px`;
      el.style.top = `${p.y}px`;
      el.innerHTML = `${ring > 0 ? ringSvg(ring, 30) : ""}<b>✚</b><span>${t(left)}</span>`;
    }
    for (const [sid, el] of this.signs)
      if (!shown.has(sid)) {
        el.remove();
        this.signs.delete(sid);
      }

    // by one: hold to get them up
    const near = this.amDown() ? null : this.nearDowned();
    if (near) {
      const p = at(me.x, me.y, me.z + 1);
      const k = this.holding === near.sid && near.revBy ? Math.min(1, (now - near.revAt) / (DOWN.revive * 1000)) : 0;
      const key = this.walker.controls.b.keys.use[0]?.replace(/^Key/, "") ?? "E";
      this.prompt.style.display = "flex";
      this.prompt.style.left = `${p.x}px`;
      this.prompt.style.top = `${p.y}px`;
      this.prompt.innerHTML = `${ringSvg(k, 22)}<span></span><span class="dk-key">${key}</span>`;
      (this.prompt.children[1] as HTMLElement).textContent = this.tr("dark_revive", { name: near.name });
    } else this.prompt.style.display = "none";

    // down myself: red at the edges, my time, my first aid
    const mine = this.seen.get(this.sid());
    if (mine && this.amDown()) {
      const left = Math.max(0, DOWN.bleed - (now - mine.seenAt - mine.held) / 1000);
      // (my own first aid, held: since I started it)
      if (this.holding === "me") this.selfAt ??= now;
      else this.selfAt = null;
      const self = this.selfAt !== null ? Math.min(1, (now - this.selfAt) / (DOWN.selfAid * 1000)) : 0;
      const key = this.walker.controls.b.keys.use[0]?.replace(/^Key/, "") ?? "E";
      const hint = mine.revBy
        ? this.tr("dark_being_revived")
        : this.hasAid()
          ? this.tr("dark_self_aid", { key })
          : this.tr("dark_wait");
      this.mine.style.display = "flex";
      this.mine.innerHTML = `<div class="t">${this.tr("dark_down")} · ${t(left)}</div><div class="h">${self > 0 ? ringSvg(self, 22) : ""}<span></span></div>`;
      (this.mine.querySelector(".h span") as HTMLElement).textContent = hint;
    } else {
      this.mine.style.display = "none";
      this.selfAt = null;
    }
  }
  private selfAt: number | null = null;
}

function ringSvg(k: number, size: number): string {
  const r = size / 2 - 2;
  const c = 2 * Math.PI * r;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="rgba(255,255,255,.25)" stroke-width="2.5" fill="none"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="#e9ecef" stroke-width="2.5" fill="none" stroke-dasharray="${(c * k).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>`;
}

export const DOWN_CSS = `
.dk-sign{transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;gap:2px;text-shadow:0 1px 3px #000}
.dk-sign b{font-size:22px;color:#e0473a;line-height:1}
.dk-sign span{font-size:12px;font-weight:700;color:#f0d0cc}
.dk-sign svg{position:absolute;top:-4px}
.dk-down{position:fixed;inset:0;pointer-events:none;flex-direction:column;align-items:center;justify-content:flex-end;padding-bottom:140px;background:radial-gradient(ellipse at center,rgba(90,0,0,0) 35%,rgba(120,6,6,.6) 100%);animation:dkpulse 1.6s ease-in-out infinite}
.dk-down .t{font-size:20px;font-weight:700;letter-spacing:.04em;color:#ffd7d2;text-shadow:0 1px 4px #000}
.dk-down .h{display:flex;align-items:center;gap:8px;margin-top:8px;font-size:14px;color:#f3e7e5;text-shadow:0 1px 3px #000}
@keyframes dkpulse{50%{background-color:rgba(60,0,0,.12)}}
`;
