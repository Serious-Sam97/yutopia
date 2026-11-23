// The best round's replay (docs/plan/115-the-strike-park-again.md, phase 97: "a highlight replay of your best round").
// While a round's played, everyone's place is sampled ten times a second and my kills noted; at its end the round's
// kept if it beats my best (a kill 2, a headshot 1 more). At the match's end H plays it back: over my shoulder from a
// few seconds before my first kill to just after my last, everyone as a figure in their team's colours, the fallen
// tipping over, the kills called.

import { BoxGeometry, CylinderGeometry, Group, type Material, Mesh, MeshLambertMaterial, SphereGeometry } from "three";
import type { ThirdPersonView } from "../tp/view";

export interface Who {
  id: string;
  x: number;
  /** height (m, world) */
  y: number;
  /** the world's y (three's z) */
  z: number;
  yaw: number;
  team: "r" | "w";
}
interface Frame {
  t: number;
  who: Who[];
}
interface Round {
  n: number;
  frames: Frame[];
  kills: { t: number; victim: string; head: boolean }[];
  t0: number;
}

const TEAM_COL = { r: 0xb9781f, w: 0x3e5d72 };

/** A figure: two legs, a vested torso, arms brought up to a gun held forward, a head under a team cap; facing +x. */
function figure(team: "r" | "w", mats: Material[]): Group {
  const vest = new MeshLambertMaterial({ color: TEAM_COL[team] });
  const cloth = new MeshLambertMaterial({ color: 0x3a3d36 });
  const dark = new MeshLambertMaterial({ color: 0x1e2022 });
  const skin = new MeshLambertMaterial({ color: 0xc89a7a });
  mats.push(vest, cloth, dark, skin);
  const g = new Group();
  const body = new Group();
  for (const z of [-0.1, 0.1]) {
    body.add(new Mesh(new BoxGeometry(0.15, 0.82, 0.15).translate(0, 0.41, z), cloth));
    body.add(new Mesh(new BoxGeometry(0.26, 0.09, 0.13).translate(0.05, 0.045, z), dark));
  }
  body.add(new Mesh(new BoxGeometry(0.24, 0.62, 0.42).translate(0, 1.13, 0), cloth));
  body.add(new Mesh(new BoxGeometry(0.28, 0.48, 0.44).translate(0.01, 1.16, 0), vest));
  body.add(new Mesh(new CylinderGeometry(0.06, 0.07, 0.1, 8).translate(0, 1.47, 0), skin));
  body.add(new Mesh(new SphereGeometry(0.115, 14, 12).translate(0.01, 1.6, 0), skin));
  body.add(new Mesh(new SphereGeometry(0.12, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0.0, 1.63, 0), vest));
  body.add(new Mesh(new BoxGeometry(0.12, 0.02, 0.2).translate(0.11, 1.63, 0), vest));
  // the arms up to the gun: the right along it, the left under its fore-end
  const arm = (z: number, x1: number) => {
    const m = new Mesh(new BoxGeometry(x1, 0.09, 0.09).translate(x1 / 2, 0, 0), cloth);
    m.position.set(0.02, 1.33, z);
    m.rotation.y = z > 0 ? 0.55 : -0.25;
    m.rotation.z = -0.35;
    body.add(m);
  };
  arm(-0.22, 0.42);
  arm(0.22, 0.5);
  body.add(new Mesh(new BoxGeometry(0.7, 0.07, 0.05).translate(0.52, 1.24, -0.02), dark));
  body.add(new Mesh(new BoxGeometry(0.06, 0.14, 0.04).translate(0.32, 1.16, -0.02), dark));
  body.name = "body";
  g.add(body);
  return g;
}

export class Highlights {
  private cur: Round | null = null;
  best: Round | null = null;
  private bestScore = 0;
  private lastAt = 0;

  start(n: number) {
    this.cur = { n, frames: [], kills: [], t0: performance.now() };
  }
  /** Ten times a second, while it's played. */
  sample(who: Who[]) {
    const now = performance.now();
    if (!this.cur || now - this.lastAt < 100) return;
    this.lastAt = now;
    this.cur.frames.push({ t: now - this.cur.t0, who });
    // (a long round: its first minutes let go — the kills are near the end of what's kept anyway)
    if (this.cur.frames.length > 1800) this.cur.frames.shift();
  }
  kill(victim: string, head: boolean) {
    if (this.cur) this.cur.kills.push({ t: performance.now() - this.cur.t0, victim, head });
  }
  /** The round's over: kept if it's my best. */
  end() {
    const r = this.cur;
    this.cur = null;
    if (!r || !r.kills.length) return;
    const score = r.kills.length * 2 + r.kills.filter((k) => k.head).length;
    if (score > this.bestScore) {
      this.bestScore = score;
      this.best = r;
    }
  }
  clear() {
    this.cur = null;
    this.best = null;
    this.bestScore = 0;
  }

  /** Plays the best round back: its camera each frame, the figures in `parent`; null when it's done. */
  play(me: string, parent: Group): Replay | null {
    return this.best && this.best.frames.length > 2 ? new Replay(this.best, me, parent) : null;
  }
}

export class Replay {
  private t: number;
  private end: number;
  private figs = new Map<string, Group>();
  private mats: Material[] = [];
  private root = new Group();
  private el: HTMLDivElement;
  done = false;

  constructor(
    private r: Round,
    private me: string,
    parent: Group,
  ) {
    const first = r.kills[0].t;
    const last = r.kills[r.kills.length - 1].t;
    this.t = Math.max(r.frames[0].t, first - 4000);
    this.end = Math.min(r.frames[r.frames.length - 1].t, last + 2500, this.t + 25000);
    parent.add(this.root);
    this.el = document.createElement("div");
    this.el.style.cssText =
      "position:fixed;inset:0;pointer-events:none;z-index:45;font-family:'Avenir Next Condensed',sans-serif;color:#e9dcc0";
    document.body.appendChild(this.el);
  }

  private at(t: number): Who[] {
    const f = this.r.frames;
    let i = 0;
    while (i + 1 < f.length && f[i + 1].t < t) i++;
    const a = f[i];
    const b = f[Math.min(f.length - 1, i + 1)];
    const k = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 0;
    return a.who.map((w) => {
      const o = b.who.find((q) => q.id === w.id);
      if (!o) return w;
      let dy = o.yaw - w.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      return {
        ...w,
        x: w.x + (o.x - w.x) * k,
        y: w.y + (o.y - w.y) * k,
        z: w.z + (o.z - w.z) * k,
        yaw: w.yaw + dy * k,
      };
    });
  }

  /** A frame of it: the camera over my shoulder (null: it's over). */
  frame(dt: number): ThirdPersonView["gameCam"] {
    if (this.done) return null;
    this.t += dt * 1000;
    if (this.t >= this.end) {
      this.stop();
      return null;
    }
    const who = this.at(this.t);
    const seen = new Set<string>();
    for (const w of who) {
      seen.add(w.id);
      let g = this.figs.get(w.id);
      if (!g) {
        g = figure(w.team, this.mats);
        this.figs.set(w.id, g);
        this.root.add(g);
      }
      g.position.set(w.x, w.y, w.z);
      g.rotation.y = -w.yaw;
      // (the fallen: tipped over in half a second from their kill)
      const k = this.r.kills.find((q) => q.victim === w.id && q.t <= this.t);
      const body = g.getObjectByName("body");
      if (body) body.rotation.z = k ? Math.min(1, (this.t - k.t) / 500) * (Math.PI / 2) : 0;
    }
    // (someone gone from the samples — dead and dropped from them: still lying where last seen)
    for (const [id, g] of this.figs) if (!seen.has(id)) g.visible = this.r.kills.some((q) => q.victim === id);
    const me = who.find((w) => w.id === this.me);
    // the calls: the kills as they come
    const near = this.r.kills.filter((q) => this.t >= q.t && this.t - q.t < 1200);
    const n = this.r.kills.filter((q) => q.t <= this.t).length;
    const call = near.length ? (near[near.length - 1].head ? "HEADSHOT" : "KILL") : "";
    const html = `<div style="position:absolute;top:24px;left:50%;transform:translateX(-50%);background:rgba(14,16,18,.82);border-left:3px solid #e8a33a;padding:8px 18px;font-weight:800;letter-spacing:.14em">YOUR BEST ROUND · ROUND ${this.r.n} · ${n}/${this.r.kills.length} ${this.r.kills.length === 1 ? "KILL" : "KILLS"} <span style="opacity:.6;font-weight:600">· H or Esc stops</span></div>${call ? `<div style="position:absolute;top:42%;left:50%;transform:translate(-50%,-50%);font-size:54px;font-weight:900;letter-spacing:.12em;color:${call === "HEADSHOT" ? "#e06a52" : "#e8a33a"};text-shadow:0 2px 12px rgba(0,0,0,.6)">${call}</div>` : ""}<div style="position:absolute;inset:0;box-shadow:inset 0 0 160px rgba(0,0,0,.55)"></div>`;
    if (this.el.innerHTML !== html) this.el.innerHTML = html;
    if (!me) return null;
    // (back and up a little, off to the right: me in the corner of the shot, what I faced in the middle)
    const back = 3.6;
    const side = 0.9;
    const cx = Math.cos(me.yaw);
    const cz = Math.sin(me.yaw);
    return {
      eye: [me.x - cx * back - cz * side, me.z - cz * back + cx * side, me.y + 2.4],
      look: [me.x + cx * 10, me.z + cz * 10, me.y + 1.3],
      showMe: false,
    };
  }

  stop() {
    if (this.done) return;
    this.done = true;
    this.root.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh) m.geometry.dispose();
    });
    for (const m of this.mats) m.dispose();
    this.root.removeFromParent();
    this.el.remove();
  }
}
