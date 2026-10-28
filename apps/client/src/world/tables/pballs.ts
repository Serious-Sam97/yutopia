import { toScreen } from "@yutopia/shared";
import { aimPitch, flightAt, heldBall, type Launch, PBALL, SETTLE, settleAt } from "@yutopia/shared/pool-throw";
import { lang } from "@/lib/i18n";
import { hud, toast } from "../store";
import type { TableScene3 } from "../tp/tables3d";
import type { Q } from "./ballart";
import type { TableHost } from "./pool";
import { clack, cueTip, cushion } from "./sound";

// Pool balls out of a game (shared/pool-throw.ts, the server's features/pballs.ts): taken off a
// table that isn't being played, thrown at people, fired from the cue taken down — whoever's
// reached is knocked down. Here: every ball out where its flight has it (the launch, the same
// arithmetic as the server's), then dropping off whatever it met and lying on the floor (the 3D
// view's scene3d); the click that throws or fires (at whoever's under the pointer — aimed, the
// crosshair — else the floor there); E takes one lying near, B puts the ball or the cue back; the
// sounds.

const ZPX = 45.25 * Math.cos(Math.PI / 6); // iso px of height per tile (a ray's z)
const R_DRAW = 0.0443; // a ball's radius, tiles (as the tables draw theirs)

// biome-ignore lint/suspicious/noExplicitAny: a colyseus schema instance
type S = any;

interface Seen {
  t0: number; // performance.now() when it showed up here (its flight is timed from then)
  stopped: boolean; // its stop heard
  roll: number; // how far it has rolled (for the turn of its numbers)
  last: { x: number; y: number; z: number } | null;
}

export interface PballHost extends TableHost {
  /** where I am (tiles; z the feet) */
  where(): { x: number; y: number; z: number };
  /** aiming (the right button): throws and shots go through the crosshair */
  aiming(): boolean;
  /** the floor I'm on */
  level(): number;
}

export class PoolBallsOut {
  private seen = new Map<string, Seen>();
  private holding = "";
  private cross: HTMLDivElement | null = null;

  constructor(private host: PballHost) {
    // (pointerdown: before the world's own; mousedown too — with the right button held to aim, a
    // left press is no pointerdown, only a mousedown: the pointer's chord)
    window.addEventListener("pointerdown", this.onDown, true);
    window.addEventListener("mousedown", this.onDown, true);
    window.addEventListener("keydown", this.onKey, true);
  }

  private me(): S | undefined {
    const r = this.host.room;
    return r.state.players.get(r.sessionId);
  }
  /** what I hold of the table's: a ball, the cue, nothing */
  holdingNow(): "ball" | "cue" | "" {
    const me = this.me();
    return heldBall(me?.held) >= 0 ? "ball" : me?.gun === "cue" ? "cue" : "";
  }
  take(id: string, what: "ball" | "cue") {
    this.host.send("pball:take", { id, what });
  }
  putBack() {
    this.host.send("pball:back", {});
  }

  // ── input ──
  // (capture: before the world's own click — which would walk there, or pick what's under it)
  private downAt = 0;
  private onDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    const el = e.target as HTMLElement | null;
    if (el?.tagName !== "CANVAS") return;
    const what = this.holdingNow();
    const me = this.me();
    if (!what || !me || me.fellAt || me.downAt) return;
    // (at a pool table's console the pointer is the table's)
    if (hud.get().panel.kind === "pool") return;
    e.preventDefault();
    e.stopImmediatePropagation();
    // (the one press: its pointerdown and its mousedown)
    const now = performance.now();
    if (now - this.downAt < 80) return;
    this.downAt = now;
    this.send(what, e.clientX, e.clientY);
  };
  private onKey = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || e.repeat || e.metaKey || e.ctrlKey) return;
    const me = this.me();
    if (!me) return;
    if (e.code === "KeyB" && this.holdingNow()) {
      e.stopImmediatePropagation();
      this.putBack();
      return;
    }
    // E (or X): a ball lying near, if my hand's free
    if ((e.code === "KeyE" || e.code === "KeyX") && heldBall(me.held) < 0 && !me.fellAt) {
      const near = this.nearest();
      if (!near) return;
      e.stopImmediatePropagation();
      this.host.send("pball:pick", { key: near });
    }
  };
  private nearest(): string | null {
    const at = this.host.where();
    const lvl = this.host.level();
    const now = performance.now();
    let best: { key: string; d: number } | null = null;
    for (const [key, b] of this.host.room.state.pballs ?? new Map()) {
      if ((b as S).level !== lvl || (b as S).t1 < 0) continue;
      const s = this.seen.get(key);
      if (s && (now - s.t0) / 1000 < (b as S).t1 + SETTLE) continue;
      const d = Math.hypot((b as S).rx - at.x, (b as S).ry - at.y);
      if (d <= PBALL.reach && (!best || d < best.d)) best = { key, d };
    }
    return best?.key ?? null;
  }

  // The throw (the shot): at whoever the pointer's on — their chest — else where it meets the
  // floor; aimed in 3D, through the crosshair.
  private send(what: "ball" | "cue", cx: number, cy: number) {
    let px = cx;
    let py = cy;
    if (this.aimingNow()) {
      px = window.innerWidth / 2;
      py = window.innerHeight / 2;
    }
    const ray = this.host.model.rayAt(px, py);
    if (!ray) return;
    const o = { x: ray.o.x, y: ray.o.y, z: ray.o.z / ZPX };
    const d0 = { x: ray.d.x, y: ray.d.y, z: ray.d.z / ZPX };
    const len = Math.hypot(d0.x, d0.y, d0.z) || 1;
    const d = { x: d0.x / len, y: d0.y / len, z: d0.z / len };
    const me = this.host.where();
    const lvl = this.host.level();
    const sid = this.host.room.sessionId;
    // along the ray: someone, else the floor (my feet's height), else far out
    let target: { x: number; y: number; z: number } | null = null;
    for (let t = 0; t < 60 && !target; t += 0.05) {
      const x = o.x + d.x * t;
      const y = o.y + d.y * t;
      const z = o.z + d.z * t;
      for (const [id, q] of this.host.room.state.players as Map<string, S>) {
        if (id === sid || (q.level ?? 0) !== lvl) continue;
        if (Math.hypot(q.x - x, q.y - y) < 0.34 && z > q.z - 0.05 && z < q.z + 1.85) {
          target = { x: q.x, y: q.y, z: q.z + 1.1 };
          break;
        }
      }
      if (!target && z <= me.z && t > 0.5) target = { x, y, z: me.z + 0.3 };
    }
    if (!target) target = { x: o.x + d.x * 30, y: o.y + d.y * 30, z: o.z + d.z * 30 };
    const yaw = Math.atan2(target.y - me.y, target.x - me.x);
    if (what === "ball") {
      const from = { x: me.x + Math.cos(yaw) * 0.25, y: me.y + Math.sin(yaw) * 0.25, z: me.z + PBALL.hand };
      const dist = Math.hypot(target.x - from.x, target.y - from.y);
      this.host.send("pball:throw", { yaw, pitch: aimPitch(dist, target.z - from.z, PBALL.throwSpeed) });
      return;
    }
    // the cue: from its tip, out ahead of the hands
    const tip = { x: me.x + Math.cos(yaw) * 0.9, y: me.y + Math.sin(yaw) * 0.9, z: me.z + 1.3 };
    const dist = Math.hypot(target.x - tip.x, target.y - tip.y);
    const pitch = aimPitch(dist, target.z - tip.z, PBALL.cueSpeed);
    this.host.send("pball:fire", { ox: tip.x, oy: tip.y, oz: tip.z, yaw, pitch });
  }
  private aimingNow() {
    return this.host.aiming();
  }

  // ── every frame ──
  frame(_dt: number, me: { x: number; y: number }) {
    const now = performance.now();
    const state = this.host.room.state;
    const keep = new Set<string>();
    for (const [key, b] of (state.pballs ?? new Map()) as Map<string, S>) {
      keep.add(key);
      let s = this.seen.get(key);
      if (!s) {
        s = { t0: now, stopped: false, roll: 0, last: null };
        this.seen.set(key, s);
        // off the cue: its tip's knock; out of a hand, nothing
        if (!b.table && b.t1 < 0) this.sound(b, me, "fire");
      }
      const p = this.at(b, s, now);
      if (b.t1 >= 0 && !s.stopped) {
        s.stopped = true;
        if (b.t1 > 0) this.sound(b, me, b.hit ? "hit" : "stop");
      }
      if (s.last) s.roll += Math.hypot(p.x - s.last.x, p.y - s.last.y);
      s.last = p;
    }
    for (const key of this.seen.keys()) if (!keep.has(key)) this.seen.delete(key);
    // what I hold: told once how it works
    const h = this.holdingNow();
    if (h !== this.holding) {
      this.holding = h;
      const pt = lang() === "pt";
      if (h === "ball")
        toast(
          pt
            ? "Bola na mão — clique em alguém para jogar · B devolve"
            : "Ball in hand — click someone to throw it · B puts it back",
        );
      if (h === "cue")
        toast(
          pt
            ? "O taco atira bolas — mire (botão direito) e clique · B devolve"
            : "The cue fires balls — aim (right button) and click · B puts it back",
        );
    }
    this.crosshair(!!h && this.aimingNow());
  }

  // where a ball out is now (tiles, z up): flying, dropping off what it met, lying
  private at(b: S, s: Seen, now: number) {
    const t = (now - s.t0) / 1000;
    const f: Launch = { x0: b.x0, y0: b.y0, z0: b.z0, vx: b.vx, vy: b.vy, vz: b.vz };
    if (b.t1 < 0 || t < b.t1) return flightAt(f, Math.min(t, PBALL.maxSecs));
    return settleAt({ x: b.x1, y: b.y1, z: b.z1 }, { x: b.rx, y: b.ry, z: b.rz }, t - b.t1);
  }

  private sound(b: S, me: { x: number; y: number }, kind: "fire" | "hit" | "stop") {
    const x = kind === "fire" ? b.x0 : b.x1;
    const y = kind === "fire" ? b.y0 : b.y1;
    const gain = Math.max(0, 1 - Math.hypot(x - me.x, y - me.y) / 14) * 0.9;
    const a = toScreen(x, y);
    const c = toScreen(me.x, me.y);
    const pan = Math.max(-0.8, Math.min(0.8, (a.x - c.x) / 300));
    if (gain <= 0.01) return;
    if (kind === "fire") cueTip(2.2, gain, pan, false);
    else if (kind === "hit") clack(3.2, gain, pan);
    else cushion(2.4, gain * 0.8, pan);
  }

  // a crosshair while aiming a throw or the cue
  private crosshair(on: boolean) {
    if (on && !this.cross) {
      const c = document.createElement("div");
      c.setAttribute("aria-hidden", "true");
      c.style.cssText =
        "position:fixed;left:50%;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;border:2px solid rgba(244,236,216,.9);border-radius:50%;box-shadow:0 0 0 1px rgba(21,18,15,.6);pointer-events:none;z-index:40";
      document.body.appendChild(c);
      this.cross = c;
    } else if (!on && this.cross) {
      this.cross.remove();
      this.cross = null;
    }
  }

  // the balls out, flying and lying, turning as they roll (on my floor)
  scene3d(into: TableScene3) {
    const lvl = this.host.level();
    for (const [key, b] of (this.host.room.state.pballs ?? new Map()) as Map<string, S>) {
      const s = this.seen.get(key);
      if (!s?.last || b.level !== lvl) continue;
      const p = s.last;
      // rolled about the axis across its way (three's: x, up, y)
      const vx = b.vx;
      const vy = b.vy;
      const v = Math.hypot(vx, vy) || 1;
      const ax = vy / v;
      const az = -vx / v;
      const a = (s.roll / PBALL.r) * 0.5;
      const q: Q = [ax * Math.sin(a), 0, az * Math.sin(a), Math.cos(a)];
      into.balls.push({ key: `pb:${key}`, id: b.n, x: p.x, y: p.y, z: p.z, r: R_DRAW, q, alpha: 1 });
    }
  }

  dispose() {
    window.removeEventListener("pointerdown", this.onDown, true);
    window.removeEventListener("mousedown", this.onDown, true);
    window.removeEventListener("keydown", this.onKey, true);
    this.crosshair(false);
    this.seen.clear();
  }
}
