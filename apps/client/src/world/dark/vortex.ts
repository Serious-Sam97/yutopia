import type { ServerMessages } from "@yutopia/shared";
import { face8 } from "@yutopia/shared/facing";
import { VORTEX_FIGHT } from "@yutopia/shared/vortex-fight";
import type { WorldController } from "../controller";
import type { DarkHooks, Walker } from "../input/walker";
import type { Body3 } from "../tp/view";
import { officeLook } from "./shades";
import type { DarkSound, VxSound } from "./voices";

// The fight with Vortex on my screen (docs/plan/88-vortex-fight.md phase 2, as design/vortex-fight/mock): his health
// as a cassette at the top — the tape wound off its left reel as he's hurt, ticks at the acts, who's in it and their
// hits; act I's slip the first time I hit him; his act II moves as everyone near sees them — the tape whip's lash and
// the tape round whoever it caught (a friend by them: hold E to cut them free; me: I can't move), REW's ◀◀, PAUSE's
// ▮▮ and the shots back at whoever fired them, the confiscation's slip (and the duck), the radio's dance (me: I can't
// move), HR's slip; beaten — the building's slip.
// (Phase 3) Act III: the transformation (a dark flash, his drawing gone dark — the controller's) and **the studio's
// lights out** for everyone on his floor (eased, flickering off; tp/view.ts studioDark: the torch and flares what's
// left); the shadowed he lets in, drawn as the dark's own (handed to its Shades); "a clone?" over him and his
// clones, a popped one's *pop*; possessed — my legs walked to him, the camera turned on him, a magenta edge and its
// count; the glitch — my controls the other way round, the screen's lines and a band slipping, the HUD jittering.

const SEEN = 30; // m: his moves drawn this far from me, on his floor
const CUT_MS = 800; // a friend's knife: held this long
const SLIP_MS = 4200;

type Move = ServerMessages["vortex:move"];
interface P {
  sid: string;
  name: string;
  x: number;
  y: number;
  z: number;
  level: number;
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export class VortexFight {
  readonly el = document.createElement("div");
  private readonly boss = document.createElement("div");
  private readonly layer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  private readonly marks = document.createElement("div");
  private readonly slips = document.createElement("div");
  private readonly notice = document.createElement("div");
  private readonly mine = document.createElement("div");
  private readonly prompt = document.createElement("div");
  private readonly vhs = document.createElement("div");
  private readonly pauseEl = document.createElement("div");
  private readonly flash = document.createElement("div");
  private readonly offs: (() => void)[] = [];
  // the fight as told (who's in it), and what's going on (performance.now deadlines)
  private who: { sid: string; name: string; hits: number }[] = [];
  private yetShown = false;
  private lashes: { to: string; from: { x: number; y: number }; at: number; ms: number }[] = [];
  private readonly bound = new Map<string, number>();
  private readonly dance = new Map<string, number>();
  private readonly rew = new Map<string, number>();
  private pauseUntil = 0;
  // (PAUSE: my shots that met him, stopped in the air where they met him — till he plays them back)
  private held: { x: number; y: number; z: number }[] = [];
  private playUntil = 0;
  private missedUntil = 0;
  private cutting: { sid: string; at: number } | null = null;
  // (phase 3) the lights out as eased here (0 … 1) and when they began to go; the mind games on me, till then; who's
  // possessed (theirs: a mark); his clones' question marks, till then; popped ones; the shadowed as seen (smoothed)
  private outK = 0;
  private saidAt = 0;
  private outFrom = 0;
  private lastFrame = performance.now();
  private possessUntil = 0;
  private glitchUntil = 0;
  private readonly possessed = new Map<string, number>();
  private clonesUntil = 0;
  private pops: { x: number; y: number; at: number }[] = [];
  private readonly shades = new Map<
    string,
    { x: number; y: number; angle: number; state: string; since: number; born: number; seed: number; speed: number }
  >();
  private readonly possessEl = document.createElement("div");
  private readonly glitchEl = document.createElement("div");
  private readonly turnEl = document.createElement("div");
  // (phase 4) beaten: where he fell and when (his tape unspooling over the floor there a while)
  private fell: { x: number; y: number; at: number } | null = null;

  constructor(
    private readonly ctl: WorldController,
    private readonly walker: Walker,
    root: HTMLElement,
    private readonly tr: (key: string, vars?: Record<string, string>) => string,
    private readonly sound: DarkSound,
  ) {
    this.el.className = "vxf";
    this.boss.className = "abs vxf-boss";
    this.layer.setAttribute("class", "abs vxf-layer");
    this.marks.className = "abs vxf-marks";
    this.slips.className = "abs vxf-slips";
    this.notice.className = "abs vxf-notice";
    this.mine.className = "abs vxf-mine";
    this.prompt.className = "abs dk-prompt";
    this.vhs.className = "abs vxf-vhs rew";
    this.pauseEl.className = "abs vxf-vhs pause";
    this.flash.className = "vxf-flash";
    for (const e of [this.boss, this.notice, this.mine, this.prompt, this.vhs, this.pauseEl]) e.style.display = "none";
    this.el.append(this.flash, this.layer, this.marks, this.boss, this.slips, this.notice, this.mine, this.prompt);
    this.el.append(this.vhs, this.pauseEl);
    this.possessEl.className = "vxf-possess";
    this.glitchEl.className = "vxf-glitch";
    this.turnEl.className = "vxf-turn";
    for (const e of [this.possessEl, this.glitchEl]) e.style.display = "none";
    this.el.prepend(this.turnEl, this.possessEl, this.glitchEl);
    root.append(this.el);
    const room = ctl.room;
    if (!room) return;
    const on = <K extends keyof ServerMessages>(type: K, fn: (m: ServerMessages[K]) => void) => {
      const off = room.onMessage(type, fn) as unknown;
      if (typeof off === "function") this.offs.push(off as () => void);
    };
    on("vortex:fight", (m) => {
      if (!m.who.length) this.yetShown = false;
      this.who = m.who;
    });
    on("vortex:grudge", (m) => {
      this.slip(this.tr(m.hits === 1 ? "vx_grudge1" : "vx_grudge", { n: String(m.hits) }), false, "hr");
      this.sound.vx("vx-grudge");
    });
    // (phase 5) his voice: a line to me alone (a personal one) — babbled here, close; only in a fight (the user,
    // 2026-11-15: out of one his lines are silent, the bubble alone)
    on("vortex:say", (m) => {
      if (this.fighting()) this.sound.babble(m.text, m.mood ?? this.vx()?.mood ?? "smug");
    });
    // (his cassette taken: its click)
    on("dark:found", (m) => {
      if (m.got.some((g) => g.id === "vxtape")) this.sound.vx("vx-pickup");
    });
    on("vortex:down", (m) => {
      const v = this.vx();
      if (v) this.fell = { x: v.x, y: v.y, at: performance.now() };
      // (the tape stopping; then it spilling out of him)
      if (v && this.onHisFloor()) {
        this.sound.vx("vx-down", v, 30);
        setTimeout(() => this.sound.vx("vx-unspool", v, 24), 350);
      }
      this.notice.innerHTML = this.tr("vx_down", { by: esc(m.by), t: mmss(m.secs) });
      this.notice.style.display = "block";
      this.notice.classList.remove("gone");
      setTimeout(() => this.notice.classList.add("gone"), 7000);
      setTimeout(() => {
        if (this.notice.classList.contains("gone")) this.notice.style.display = "none";
      }, 7600);
    });
    on("arms:hit", (m) => {
      if (m.kind === "vortex" && this.pauseUntil > performance.now()) this.held.push({ x: m.x, y: m.y, z: m.z });
      // (phase 5) the hit: hollow plastic — act III's distorted; a clone's a pop of its own (the server's)
      if (m.kind === "vortex" && (m.id === "vortex" || !m.id.startsWith("vortex:")))
        this.sound.vx((this.vx()?.vact ?? 0) >= 3 ? "vx-hit-dark" : "vx-hit", m, 30);
      // (act I: the first time I hit him, a slip — he's not fighting back. Yet.)
      if (m.kind !== "vortex" || this.yetShown) return;
      this.yetShown = true;
      if ((this.vx()?.vact ?? 0) <= 1) this.slip(this.tr("vx_yet"));
    });
    on("vortex:move", (m) => this.moved(m));
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.el.remove();
    if (this.ctl.tp) this.ctl.tp.studioDark = 0;
    this.sound.vxMusic(0);
    document.documentElement.classList.remove("vx-glitching");
  }

  // ── what Dark asks ───────────────────────────────────────────────────────
  /** taped up, or made to dance: I stand still */
  frozen(): boolean {
    const now = performance.now();
    const me = this.me();
    return (this.bound.get(me) ?? 0) > now || (this.dance.get(me) ?? 0) > now;
  }
  /** (phase 3) my move as he has it: possessed — walked to him (no running, no aiming); the glitch — reversed */
  steer(move: Parameters<DarkHooks["steer"]>[0]): void {
    const now = performance.now();
    const vx = this.vx();
    if (this.possessUntil > now && vx) {
      const me = this.walker.where();
      const d = Math.hypot(vx.x - me.x, vx.y - me.y);
      const k = d > 1.4 ? 0.55 / d : 0;
      move.x = (vx.x - me.x) * k;
      move.y = (vx.y - me.y) * k;
      move.sprint = false;
      move.aim = false;
      move.jump = false;
      move.jumpPressed = false;
    } else if (this.glitchUntil > now) {
      move.x = -move.x;
      move.y = -move.y;
    }
  }
  /** (phase 3) the shadowed he let in, as the 3D view draws the dark's (its Shades hands them on) */
  readonly shadeBodies = (): Body3[] => {
    const home = this.ctl.homeFloor();
    if (this.ctl.level !== home) return [];
    const now = performance.now();
    const out: Body3[] = [];
    for (const [id, s] of this.shades) {
      const fade = s.state === "dissolve" ? Math.max(0, 1 - (now - s.since) / 800) : Math.min(1, (now - s.born) / 500);
      const moving = s.speed > 0.3 && s.state !== "windup";
      out.push({
        name: "",
        avatar: officeLook(s.seed),
        x: s.x,
        y: s.y,
        yaw: face8(Math.cos(s.angle), Math.sin(s.angle)),
        a: moving ? 1 : 0,
        status: "online",
        speaking: false,
        emote: "",
        mic: false,
        bot: true,
        angle: s.angle,
        z: 0,
        mv: 1,
        shaded: true,
        fade,
        id: `vxs:${id}`,
        level: home,
        shade: {
          pose: s.state === "windup" ? "windup" : s.state === "strike" ? "strike" : "lurch",
          t: (now - s.since) / 1000,
          seed: s.seed,
          dark: 1,
          state: s.state === "emerge" ? "emerge" : s.state === "dissolve" ? "dissolve" : "stalk",
          since: s.since,
          burn: null,
          fade,
          killed: s.state === "dissolve",
        },
      } as Body3);
    }
    return out;
  };
  /** a use pressed: by a friend taped up, cutting them free (held) */
  use(): boolean {
    if (this.cutting) return true;
    const q = this.nearBound();
    if (!q) return false;
    this.cutting = { sid: q.sid, at: performance.now() };
    return true;
  }

  // ── his moves, as they come ──────────────────────────────────────────────
  // (phase 5) the sound of each of his moves: from where it happens — to me, close
  private heard(m: Move): void {
    if (!this.onHisFloor()) return;
    const me = this.me();
    const v = this.vx();
    const him = v ? { x: v.x, y: v.y } : null;
    const of = (sid?: string) => (sid === me ? null : (this.player(sid) ?? him));
    const s = (slot: VxSound, at: { x: number; y: number } | null, range = 24, rate = 1) =>
      this.sound.vx(slot, at, range, 1, rate);
    switch (m.kind) {
      case "whip":
        s("vx-whip", him);
        return;
      case "bound":
        s("vx-bound", of(m.to));
        return;
      case "free":
        s("vx-free", of(m.to));
        return;
      case "rew":
        s("vx-rew", of(m.to));
        return;
      case "pause":
        s("vx-pause", him, 30);
        return;
      case "play":
        s("vx-play", him, 30);
        return;
      case "steal":
        s("vx-steal", of(m.to));
        if (m.duck && m.to === me) setTimeout(() => s("vx-duck", null), 500);
        return;
      case "radio":
        s("vx-radio", him, 30);
        return;
      case "hr":
        s("vx-hr", of(m.to));
        return;
      case "dark":
        s("vx-flicker", null);
        setTimeout(() => s("vx-dark", null), 700);
        return;
      case "clones":
        s("vx-clones", him);
        return;
      case "pop":
        s("vx-pop", m.from ?? him);
        return;
      case "strike":
        s("vx-strike", of(m.to), 20);
        return;
      case "possess":
        s("vx-possess", of(m.to), 16);
        return;
      case "glitch":
        if (m.to === me) {
          s("vx-glitch", null);
          s("vx-kkzzt", null);
        }
        return;
      case "dodge":
        s("vx-dodge", m.from ?? him, 20);
        return;
    }
  }
  // a fight on (someone's shot him, his act up), or him on the floor beaten: his voice heard
  private fighting(): boolean {
    const vx = this.vx();
    return this.who.length > 0 || (vx?.vact ?? 0) > 0 || vx?.mood === "dead";
  }
  private onHisFloor(): boolean {
    return this.ctl.level === this.ctl.homeFloor();
  }

  private moved(m: Move): void {
    this.heard(m);
    const now = performance.now();
    const me = this.me();
    const ms = m.ms ?? 0;
    const name = (sid?: string) => esc(this.player(sid)?.name ?? "");
    const gun = (id?: string) => this.tr(`dark_item_${id}`).toLowerCase();
    switch (m.kind) {
      case "whip":
        if (m.to && m.from) this.lashes.push({ to: m.to, from: m.from, at: now, ms: ms || 500 });
        break;
      case "bound":
        if (m.to) this.bound.set(m.to, now + ms);
        this.lashes = this.lashes.filter((l) => l.to !== m.to);
        break;
      case "missed":
        this.lashes = this.lashes.filter((l) => l.to !== m.to);
        if (m.to === me) this.missedUntil = now + 1400;
        break;
      case "free":
        if (m.to) this.bound.delete(m.to);
        if (m.to === me && m.who?.[0]) this.slip(this.tr("vx_freed", { name: name(m.who[0]) }));
        break;
      case "rew":
        if (m.to) this.rew.set(m.to, now + 1600);
        if (m.to === me) this.vhsOnce();
        break;
      case "pause":
        this.pauseUntil = now + ms;
        break;
      case "play":
        this.pauseUntil = 0;
        this.held = [];
        this.playUntil = now + 900;
        if (m.to === me && m.n) {
          this.slip(this.tr("vx_back", { n: String(m.n) }));
          this.hurt();
        }
        break;
      case "steal":
        if (m.to === me) {
          const area = this.tr(`vx_area_${m.area}`);
          this.slip(`${this.tr("vx_took", { gun: gun(m.item), area })}${m.duck ? this.tr("vx_duck") : ""}`, m.duck);
        } else if (this.near(m.to)) this.slip(this.tr("vx_took_other", { name: name(m.to), gun: gun(m.item) }));
        break;
      case "radio":
        for (const sid of m.who ?? []) this.dance.set(sid, now + ms);
        break;
      case "hr":
        if (m.to === me) this.slip(this.tr("vx_hr", { s: String(Math.round(ms / 1000)) }), false, "hr");
        else if (this.near(m.to)) this.slip(this.tr("vx_hr_other", { name: name(m.to) }));
        break;
      // (phase 3) act III
      case "dark":
        this.turnEl.classList.remove("on");
        void this.turnEl.offsetWidth;
        this.turnEl.classList.add("on");
        break;
      case "clones":
        this.clonesUntil = now + 3500;
        break;
      case "pop":
        if (m.from) this.pops.push({ ...m.from, at: now });
        break;
      case "possess":
        if (m.to) this.possessed.set(m.to, now + ms);
        if (m.to === me) this.possessUntil = now + ms;
        break;
      case "glitch":
        if (m.to === me) this.glitchUntil = now + ms;
        break;
    }
  }

  frame(useHeld: boolean): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    const ctl = this.ctl;
    const vx = this.vx();
    const home = ctl.homeFloor();
    const here = ctl.level === home && !!vx;
    const me = this.walker.where();
    const near = here && !!vx && Math.hypot(vx.x - me.x, vx.y - me.y) <= SEEN;
    this.act3(now, dt, here, vx, me);
    // (phase 5) his public lines babbled where he is (as the bubble's: near him) — in a fight only; his sounds in
    // before they're wanted
    if (here && vx) {
      if (Math.hypot(vx.x - me.x, vx.y - me.y) < 30) this.sound.warmVortex();
      if (vx.sayAt && vx.sayAt !== this.saidAt) {
        if (this.saidAt && vx.say && this.fighting() && Math.hypot(vx.x - me.x, vx.y - me.y) <= 8)
          // (his line as said: the cast's EN, without its PT after — plan 120)
          this.sound.babble(vx.say.split("\u001f")[0], vx.mood ?? "smug", { x: vx.x, y: vx.y });
        this.saidAt = vx.sayAt;
      }
    }
    // (on screen: `h` metres over his floor — the studio's, indoors)
    const at = (x: number, y: number, h: number) => {
      const c = ctl.clientAt(x, y, h);
      const r = ctl.hostRect();
      return { x: c.x + r.left, y: c.y + r.top };
    };

    // the cassette: while there's a fight and I'm in it, or near him
    const mineIn = this.who.some((w) => w.sid === this.me());
    if (vx && this.who.length && (vx.vk ?? 1) > 0 && (mineIn || near)) {
      const act = Math.max(1, vx.vact ?? 1);
      const k = Math.max(0, Math.min(1, vx.vk ?? 1));
      const who = this.who
        .slice(0, 4)
        .map(
          (w, i) =>
            `<span${w.sid === this.me() ? ' class="me"' : ""}>${esc(w.name)} <b>${i === 0 ? this.tr(w.hits === 1 ? "vx_hit1" : "vx_hits", { n: String(w.hits) }) : w.hits}</b></span>`,
        )
        .join("");
      const html = `<div class="row"><h1>Vortex</h1><span class="act">${this.tr(`vx_act${act}`)}</span></div><div class="tape${act >= 3 ? " dark" : ""}"><span class="reel l"></span><span class="wound" style="width:calc((100% - 64px) * ${k.toFixed(3)})"></span><span class="tick" style="left:calc(32px + (100% - 64px) * ${VORTEX_FIGHT.acts[0]})"></span><span class="tick" style="left:calc(32px + (100% - 64px) * ${VORTEX_FIGHT.acts[1]})"></span><span class="reel r"></span></div><div class="who">${who}</div>`;
      if (this.boss.innerHTML !== html) this.boss.innerHTML = html;
      this.boss.style.display = "block";
    } else this.boss.style.display = "none";

    // the lashes in flight and the tape round whoever's bound; labels over them (REW, dancing)
    let svg = "";
    let marks = "";
    for (const m of [this.bound, this.dance, this.rew]) for (const [sid, t] of m) if (t <= now) m.delete(sid);
    if (near) {
      for (const l of this.lashes) {
        const q = this.player(l.to);
        if (!q) continue;
        const a = at(l.from.x, l.from.y, 0.8);
        const b = at(q.x, q.y, 1);
        const k = Math.min(1, (now - l.at) / l.ms);
        const ex = a.x + (b.x - a.x) * k;
        const ey = a.y + (b.y - a.y) * k;
        const mx = (a.x + ex) / 2 + (ey - a.y) * 0.25;
        const my = (a.y + ey) / 2 - (ex - a.x) * 0.25;
        const d = `M${a.x.toFixed(0)} ${a.y.toFixed(0)} Q ${mx.toFixed(0)} ${my.toFixed(0)} ${ex.toFixed(0)} ${ey.toFixed(0)}`;
        svg += `<path d="${d}" stroke="#3a2416" stroke-width="7" fill="none" stroke-linecap="round"/><path d="${d}" stroke="#6a4a30" stroke-width="2.5" fill="none" stroke-dasharray="12 9"/>`;
      }
      for (const [sid, until] of this.bound) {
        const q = this.player(sid);
        // (not over me: my camera's too close for it — my own line says it)
        if (!q || sid === this.me() || q.level !== ctl.level) continue;
        const foot = at(q.x, q.y, 0);
        const head = at(q.x, q.y, 1.7);
        const ppm = Math.abs(foot.y - head.y) / 1.7;
        if (ppm < 4) continue;
        const w = 0.32 * ppm;
        for (const h of [0.55, 0.9, 1.25]) {
          const c = at(q.x, q.y, h);
          svg += `<path d="M${(c.x - w).toFixed(0)} ${c.y.toFixed(0)} q ${w.toFixed(0)} ${(-w * 0.35).toFixed(0)} ${(w * 2).toFixed(0)} ${(w * 0.12).toFixed(0)}" stroke="#3a2416" stroke-width="${Math.max(3, ppm * 0.07).toFixed(1)}" fill="none" stroke-linecap="round" opacity=".95"/>`;
        }
        marks += this.mark(at(q.x, q.y, 0), this.tr("vx_bound", { s: secs(until - now) }));
      }
      for (const [sid, until] of this.dance) {
        const q = this.player(sid);
        if (!q || q.level !== ctl.level) continue;
        const p = at(q.x, q.y, 2.05);
        marks += `<div class="abs vxf-notes" style="left:${p.x.toFixed(0)}px;top:${p.y.toFixed(0)}px">♪ ♫ ♪</div>`;
        if (sid !== this.me()) marks += this.mark(at(q.x, q.y, 0), this.tr("vx_dance", { s: secs(until - now) }));
      }
      for (const [sid] of this.rew) {
        const q = this.player(sid);
        if (!q || sid === this.me() || q.level !== ctl.level) continue;
        marks += this.mark(at(q.x, q.y, 0), "◀◀ REW", "rew");
      }
      if (this.missedUntil > now) marks += this.mark(at(me.x, me.y, 0), this.tr("vx_missed"));
      // PAUSE: my shots hanging in the air where they met him, a ghost of their flight behind each
      if (this.pauseUntil > now)
        for (const b of this.held) {
          const p = at(b.x, b.y, b.z);
          marks += `<i class="abs vxf-bullet" style="left:${p.x.toFixed(0)}px;top:${p.y.toFixed(0)}px"></i>`;
        }
    }
    // (phase 3) "a clone?" over him and his clones a moment (which one's him, nobody's told); a popped one's *pop*;
    // someone else possessed: at their feet
    if (here) {
      if (this.clonesUntil > now)
        this.ctl.room?.state.npcs.forEach((n: { id: string; kind: string; x: number; y: number }) => {
          if (n.kind === "vortex" && (n.id === "vortex" || n.id.startsWith("vortex:c")))
            marks += this.mark(at(n.x, n.y, 1.75), this.tr("vx_clone"), "q");
        });
      this.pops = this.pops.filter((p) => now - p.at < 700);
      for (const p of this.pops) marks += this.mark(at(p.x, p.y, 0.9), "*pop*", "pop");
      for (const [sid, until] of this.possessed) {
        if (until <= now) this.possessed.delete(sid);
        else if (sid !== this.me()) {
          const q = this.player(sid);
          if (q && q.level === ctl.level) marks += this.mark(at(q.x, q.y, 0), this.tr("vx_possessed"));
        }
      }
    }
    // (phase 4) beaten: his tape unspooling across the floor from where he fell (out over a second and a half, there
    // 9 s); his tape lying — the trophy — glowing his pink
    if (here && this.fell && now - this.fell.at < 9000) {
      const f = this.fell;
      const grow = Math.min(1, (now - f.at) / 1500);
      const fade = Math.min(1, (9000 - (now - f.at)) / 1000);
      const c0 = at(f.x, f.y, 0);
      const ppm = Math.abs(c0.y - at(f.x, f.y, 1).y);
      for (const [a, len, bend] of UNSPOOL) {
        const L = len * grow;
        const e = at(f.x + Math.cos(a) * L, f.y + Math.sin(a) * L, 0.02);
        const m = at(f.x + Math.cos(a + bend) * L * 0.55, f.y + Math.sin(a + bend) * L * 0.55, 0.02);
        svg += `<path d="M${c0.x.toFixed(0)} ${c0.y.toFixed(0)} Q ${m.x.toFixed(0)} ${m.y.toFixed(0)} ${e.x.toFixed(0)} ${e.y.toFixed(0)}" stroke="#3a2416" stroke-width="${Math.max(2, ppm * 0.035).toFixed(1)}" fill="none" stroke-linecap="round" opacity="${fade.toFixed(2)}"/>`;
      }
    } else if (this.fell && now - this.fell.at >= 9000) this.fell = null;
    if (here)
      this.ctl.room?.state.drops.forEach((d: { item: string; x: number; y: number; level: number }) => {
        if (d.item !== "vxtape" || d.level !== ctl.level || Math.hypot(d.x - me.x, d.y - me.y) > 14) return;
        const c = at(d.x, d.y, 0.03);
        const r = Math.max(14, Math.abs(c.y - at(d.x, d.y, 1).y) * 0.55);
        marks += `<i class="abs vxf-tglow" style="left:${c.x.toFixed(0)}px;top:${c.y.toFixed(0)}px;width:${(r * 2).toFixed(0)}px;height:${r.toFixed(0)}px"></i>`;
      });
    if (this.layer.innerHTML !== svg) this.layer.innerHTML = svg;
    if (this.marks.innerHTML !== marks) this.marks.innerHTML = marks;

    // me: taped up (its time), or dancing
    const mb = this.bound.get(this.me()) ?? 0;
    const md = this.dance.get(this.me()) ?? 0;
    if (mb > now || md > now) {
      this.mine.textContent = "";
      this.mine.innerHTML =
        mb > now ? this.tr("vx_bound_me", { s: secs(mb - now) }) : `♪ ${this.tr("vx_dance", { s: secs(md - now) })} ♪`;
      this.mine.style.display = "block";
    } else this.mine.style.display = "none";

    // PAUSE, PLAY for everyone near
    if (near && (this.pauseUntil > now || this.playUntil > now)) {
      this.pauseEl.textContent = this.pauseUntil > now ? "▮▮ PAUSE" : "▶ PLAY";
      this.pauseEl.style.display = "block";
    } else this.pauseEl.style.display = "none";

    // by a friend taped up: hold E to cut them free
    if (this.cutting && (!useHeld || !this.bound.has(this.cutting.sid))) this.cutting = null;
    if (this.cutting && now - this.cutting.at >= CUT_MS) {
      ctl.room?.send("vortex:free", { sid: this.cutting.sid });
      this.cutting = null;
    }
    const q = this.nearBound();
    if (q) {
      const p = at(me.x, me.y, 1);
      const k = this.cutting?.sid === q.sid ? Math.min(1, (now - this.cutting.at) / CUT_MS) : 0;
      const key = this.walker.controls.b.keys.use[0]?.replace(/^Key/, "") ?? "E";
      this.prompt.style.display = "flex";
      this.prompt.style.left = `${p.x}px`;
      this.prompt.style.top = `${p.y}px`;
      this.prompt.innerHTML = `${ring(k, 22)}<span></span><span class="dk-key">${key}</span>`;
      (this.prompt.children[1] as HTMLElement).textContent = this.tr("vx_cut", { name: q.name });
    } else this.prompt.style.display = "none";
  }

  // ── (phase 3) act III on my screen ───────────────────────────────────────
  // the lights out (his act III, him up: eased off over ~1.2 s with a flicker as they go, back on over 2 s); the
  // shadowed he let in, smoothed; possessed — the camera turned on him; the mind games' overlays
  private act3(
    now: number,
    dt: number,
    here: boolean,
    // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
    vx: any,
    me: { x: number; y: number },
  ): void {
    const want = here && vx?.vact === 3 && (vx.vk ?? 1) > 0 ? 1 : 0;
    if (want && !this.outK && !this.outFrom) this.outFrom = now;
    if (!want) this.outFrom = 0;
    this.outK = want ? Math.min(1, this.outK + dt / 1.2) : Math.max(0, this.outK - dt / 2);
    // (going: the lights catch a few times before they die)
    const going = this.outFrom && now - this.outFrom < 1100;
    const flick = going && Math.sin((now - this.outFrom) * 0.045) * Math.sin((now - this.outFrom) * 0.017) > 0.2;
    const k = flick ? this.outK * 0.3 : this.outK;
    if (this.ctl.tp) this.ctl.tp.studioDark = k;
    // (phase 5) the music's turn: its loop with the dark (eased with it, not its flicker)
    this.sound.vxMusic(this.outK);

    // the shadowed: as sent, smoothed (sent a few times a second)
    const seen = new Set<string>();
    this.ctl.room?.state.npcs.forEach((n: { id: string; kind: string; x: number; y: number; mood: string }) => {
      if (n.kind !== "vshade") return;
      seen.add(n.id);
      let s = this.shades.get(n.id);
      if (!s) {
        s = { x: n.x, y: n.y, angle: 0, state: n.mood, since: now, born: now, seed: hash(n.id), speed: 0 };
        this.shades.set(n.id, s);
      }
      if (s.state !== n.mood) {
        s.state = n.mood;
        s.since = now;
      }
      const e = 1 - Math.exp(-dt * 10);
      const nx = s.x + (n.x - s.x) * e;
      const ny = s.y + (n.y - s.y) * e;
      const v = Math.hypot(nx - s.x, ny - s.y) / Math.max(dt, 1e-3);
      if (v > 0.2) s.angle = Math.atan2(ny - s.y, nx - s.x);
      s.speed = s.speed * 0.8 + v * 0.2;
      s.x = nx;
      s.y = ny;
    });
    for (const id of [...this.shades.keys()]) if (!seen.has(id)) this.shades.delete(id);

    // possessed: the camera turned on him; its edge and its count
    const tp = this.ctl.tp;
    if (this.possessUntil > now) {
      if (tp && vx) {
        const want = Math.atan2(vx.y - me.y, vx.x - me.x);
        const d = Math.atan2(Math.sin(want - tp.yaw), Math.cos(want - tp.yaw));
        tp.yaw += d * Math.min(1, dt * 5);
      }
      this.possessEl.style.display = "block";
      this.possessEl.innerHTML = `<b>${this.tr("vx_legs")}</b><i>${secs(this.possessUntil - now)}</i>`;
    } else this.possessEl.style.display = "none";
    // the glitch: the screen's lines, a band slipping, the HUD jittering; its count
    const g = this.glitchUntil > now;
    document.documentElement.classList.toggle("vx-glitching", g);
    if (g) {
      this.glitchEl.style.display = "block";
      this.glitchEl.innerHTML = `<i class="band"></i><b>*kkzzt*</b><span>${this.tr("vx_inverted", { s: secs(this.glitchUntil - now) })}</span>`;
    } else this.glitchEl.style.display = "none";
  }

  // ── bits ─────────────────────────────────────────────────────────────────
  private me(): string {
    return this.ctl.room?.sessionId ?? "";
  }
  // biome-ignore lint/suspicious/noExplicitAny: decoded schema state
  private vx(): any {
    return this.ctl.room?.state.npcs.get("vortex");
  }
  private player(sid?: string): P | null {
    if (!sid) return null;
    const p = this.ctl.room?.state.players.get(sid) as P | undefined;
    return p ? { ...p, sid } : null;
  }
  private near(sid?: string): boolean {
    const q = this.player(sid);
    const me = this.walker.where();
    return !!q && q.level === this.ctl.level && Math.hypot(q.x - me.x, q.y - me.y) <= SEEN;
  }
  // a friend taped up within reach (not me; me not taped up)
  private nearBound(): P | null {
    const now = performance.now();
    if ((this.bound.get(this.me()) ?? 0) > now || this.walker.down) return null;
    const me = this.walker.where();
    let best: P | null = null;
    let bd = 1.6;
    for (const [sid, until] of this.bound) {
      if (sid === this.me() || until <= now) continue;
      const q = this.player(sid);
      if (!q || q.level !== this.ctl.level) continue;
      const d = Math.hypot(q.x - me.x, q.y - me.y);
      if (d <= bd) {
        bd = d;
        best = q;
      }
    }
    return best;
  }
  private mark(p: { x: number; y: number }, text: string, cls = ""): string {
    return `<div class="abs vxf-mark ${cls}" style="left:${p.x.toFixed(0)}px;top:${p.y.toFixed(0)}px">${esc(text)}</div>`;
  }
  /** a typed slip (the strings carry their own <b>), a while; the duck in it when he left one */
  private slip(html: string, duck = false, cls = ""): void {
    const el = document.createElement("div");
    el.className = `vxf-slip ${cls}`;
    el.innerHTML = `${duck ? DUCK : ""}<span>${html}</span>`;
    this.slips.append(el);
    while (this.slips.childElementCount > 3) this.slips.firstElementChild?.remove();
    const ms = cls === "hr" ? SLIP_MS * 1.6 : SLIP_MS;
    setTimeout(() => el.classList.add("gone"), ms);
    setTimeout(() => el.remove(), ms + 450);
  }
  // REW on me: the tape's ◀◀ and its lines, a moment
  private vhsOnce(): void {
    this.vhs.textContent = "◀◀ REW 0:05";
    this.vhs.style.display = "block";
    this.el.classList.add("rewinding");
    setTimeout(() => {
      this.vhs.style.display = "none";
      this.el.classList.remove("rewinding");
    }, 1600);
  }
  // my shots back at me: red at the edges, a moment
  private hurt(): void {
    this.flash.style.transition = "none";
    this.flash.style.opacity = "1";
    requestAnimationFrame(() => {
      this.flash.style.transition = "";
      this.flash.style.opacity = "0";
    });
  }
}

const secs = (ms: number) => String(Math.max(0, Math.ceil(ms / 1000)));
// his tape unspooled where he fell: each strand's way out (radians), how far (m), how it curls
const UNSPOOL: [number, number, number][] = [
  [0.3, 2.1, 0.5],
  [2.0, 1.6, -0.6],
  [3.6, 1.9, 0.4],
  [5.0, 1.3, -0.5],
];
// (a shadowed's look from its id: the same for everyone)
const hash = (s: string) => {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

function ring(k: number, size: number): string {
  const r = size / 2 - 2;
  const c = 2 * Math.PI * r;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="rgba(255,255,255,.25)" stroke-width="2.5" fill="none"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="#ff2d95" stroke-width="2.5" fill="none" stroke-dasharray="${(c * k).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>`;
}

// the duck he leaves now and then in place of the gun (the mock's)
const DUCK =
  '<svg class="duck" viewBox="0 0 120 100"><ellipse cx="60" cy="70" rx="44" ry="26" fill="#ffd23a"/><circle cx="82" cy="38" r="20" fill="#ffd23a"/><path d="M98 38 l20 4 -20 6z" fill="#ff8a1e"/><circle cx="88" cy="33" r="3" fill="#222"/><path d="M30 66 q 20 -16 40 0" stroke="#e6b51c" stroke-width="4" fill="none"/></svg>';

export const VORTEX_CSS = `
.vxf{position:fixed;inset:0;pointer-events:none;--pink:#ff2d95}
.vxf-layer{left:0;top:0;width:100%;height:100%;overflow:visible}
.vxf-boss{left:50%;top:14px;transform:translateX(-50%);width:min(560px,calc(100vw - 32px));padding:10px 16px 12px;border:5px solid transparent;border-radius:6px;background:linear-gradient(var(--panel),var(--panel)) padding-box,var(--wood) 0 0/600px 240px border-box;box-shadow:inset 0 0 0 1px rgba(0,0,0,.6),0 10px 26px rgba(0,0,0,.5)}
.vxf-boss .row{display:flex;align-items:baseline;justify-content:space-between}
.vxf-boss h1{margin:0;font:600 24px/1 var(--font-title);letter-spacing:.26em;text-transform:uppercase;color:#fff0f7;text-shadow:0 0 12px rgba(255,45,149,.45)}
.vxf-boss .act{font:400 11px/1 var(--font-mono);letter-spacing:.16em;text-transform:uppercase;color:#d9c08a}
.vxf-boss .tape{position:relative;height:26px;margin-top:9px;border-radius:5px;background:#0c0c10;box-shadow:inset 0 0 0 1px rgba(255,45,149,.35)}
.vxf-boss .reel{position:absolute;top:3px;width:20px;height:20px;border-radius:50%;background:radial-gradient(circle,#ddd 0 3px,#2a2a30 3.5px 6px,#555 6.5px 7px,#2a2a30 7.5px)}
.vxf-boss .reel.l{left:6px}.vxf-boss .reel.r{right:6px}
.vxf-boss .wound{position:absolute;left:32px;top:8px;height:10px;border-radius:2px;background:linear-gradient(90deg,#ff2d95,#ff7ac8);box-shadow:0 0 10px rgba(255,45,149,.6);transition:width .25s ease-out}
.vxf-boss .tick{position:absolute;top:6px;width:1px;height:14px;background:rgba(255,255,255,.4)}
.vxf-boss .tape.dark{box-shadow:inset 0 0 0 1px rgba(160,0,40,.7),0 0 18px rgba(160,0,40,.45)}
.vxf-boss .tape.dark .wound{background:linear-gradient(90deg,#8a0020,#e0244a)}
.vxf-boss .who{display:flex;flex-wrap:wrap;gap:4px 14px;margin-top:8px;font:400 12px/1 var(--font-mono);color:var(--cream-dim)}
.vxf-boss .who b{color:var(--cream);font-weight:400}
.vxf-boss .who .me b{color:var(--amber)}
.vxf-slips{right:24px;top:140px;display:flex;flex-direction:column;align-items:flex-end;gap:10px}
.vxf-slip{display:flex;align-items:center;gap:10px;max-width:380px;padding:9px 14px;background:#ece5d3;color:#222;font:400 14px/1.35 var(--font-mono);box-shadow:0 8px 18px rgba(0,0,0,.4);transform:rotate(-.6deg);transition:opacity .4s,transform .4s}
.vxf-slip b{font-weight:400;color:#b0125e}
.vxf-slip.hr{transform:rotate(1.2deg)}
.vxf-slip.gone{opacity:0;transform:translateY(-6px) rotate(-.6deg)}
.vxf-slip .duck{flex:none;width:58px;height:48px;transform:rotate(-12deg)}
.vxf-notice{left:50%;top:22px;transform:translateX(-50%) rotate(-.4deg);padding:10px 16px;background:#ece5d3;color:#222;font:400 16px/1.4 var(--font-mono);text-align:center;box-shadow:0 8px 18px rgba(0,0,0,.4);transition:opacity .5s}
.vxf-notice b{font-weight:400;color:#b0125e}.vxf-notice span{color:#666}
.vxf-notice.gone{opacity:0}
.vxf-mark{transform:translate(-50%,10px);padding:4px 7px;border-radius:4px;background:rgba(16,17,22,.78);white-space:nowrap;font:400 12px/1 var(--font-mono);letter-spacing:.14em;text-transform:uppercase;color:#d9c08a;text-shadow:0 1px 3px #000}
.vxf-mark.rew{color:#fff;letter-spacing:.04em;font-size:16px;text-shadow:2px 0 rgba(255,0,80,.7),-2px 0 rgba(0,200,255,.7)}
.vxf-bullet{width:9px;height:9px;margin:-4px 0 0 -4px;border-radius:50%;background:#d8b25a;box-shadow:-14px 0 0 -2px rgba(216,178,90,.35),-26px 0 0 -3px rgba(216,178,90,.18),0 0 8px #fff6}
.vxf-notes{transform:translate(-50%,-100%);font:600 26px/1 var(--font-title);color:#fff0f7;text-shadow:0 0 14px var(--pink);animation:vxbob .5s ease-in-out infinite alternate}
@keyframes vxbob{to{transform:translate(-50%,calc(-100% - 6px)) rotate(4deg)}}
.vxf-mine{left:50%;bottom:150px;transform:translateX(-50%);padding:8px 14px;border-radius:6px;background:rgba(16,17,22,.85);font:400 14px/1 var(--font-mono);letter-spacing:.08em;color:#f4e6c8;white-space:nowrap}
.vxf-vhs{font:400 40px/1 var(--font-mono);color:#fff;letter-spacing:.04em;text-shadow:2px 0 rgba(255,0,80,.75),-2px 0 rgba(0,200,255,.75)}
.vxf-vhs.rew{left:36px;top:96px}
.vxf-vhs.pause{left:50%;top:38%;transform:translateX(-50%);font-size:30px}
.vxf.rewinding::after{content:"";position:fixed;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.22) 0 2px,transparent 2px 4px);animation:vxroll .25s linear infinite}
@keyframes vxroll{to{background-position:0 8px}}
.vxf-flash{position:fixed;inset:0;opacity:0;background:radial-gradient(ellipse at center,transparent 40%,rgba(255,45,149,.5) 100%);transition:opacity .8s ease-out}
.vxf-tglow{transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(closest-side,rgba(255,45,149,.55),rgba(255,45,149,0));mix-blend-mode:screen;animation:vxglow 1.4s ease-in-out infinite alternate}
@keyframes vxglow{to{opacity:.55}}
.vxf-mark.q{color:#ffd6ee;text-shadow:0 0 10px rgba(255,45,149,.7)}
.vxf-mark.pop{background:none;color:#fff0f7;font-size:18px;letter-spacing:.04em;text-shadow:0 0 12px var(--pink)}
.vxf-turn{position:fixed;inset:0;opacity:0;background:radial-gradient(ellipse at center,rgba(120,0,30,.15),rgba(40,0,10,.85) 75%)}
.vxf-turn.on{animation:vxturn 1.6s ease-out}
@keyframes vxturn{0%{opacity:0}12%{opacity:1}30%{opacity:.3}42%{opacity:.9}100%{opacity:0}}
.vxf-possess{position:fixed;inset:0;background:radial-gradient(ellipse at center,transparent 35%,rgba(120,0,90,.65) 100%);text-align:center}
.vxf-possess b{position:absolute;left:0;right:0;top:38%;font:600 34px/1.1 var(--font-title);letter-spacing:.2em;color:#ffd6ee;text-shadow:0 0 16px var(--pink)}
.vxf-possess i{position:absolute;left:0;right:0;top:calc(38% + 48px);font:400 40px/1 var(--font-mono);font-style:normal;color:#fff;text-shadow:2px 0 rgba(255,0,80,.75),-2px 0 rgba(0,200,255,.75)}
.vxf-glitch{position:fixed;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.28) 0 2px,transparent 2px 4px);mix-blend-mode:normal}
.vxf-glitch .band{position:absolute;left:0;right:0;top:34%;height:40px;background:rgba(255,255,255,.12);animation:vxband .9s steps(6) infinite}
@keyframes vxband{0%{transform:translate(30px,0)}50%{transform:translate(-24px,120px)}100%{transform:translate(18px,-80px)}}
.vxf-glitch b{position:absolute;left:26%;top:15%;font:400 56px/1 var(--font-mono);font-weight:400;color:#fff;text-shadow:3px 0 rgba(255,0,80,.75),-3px 0 rgba(0,200,255,.75)}
.vxf-glitch span{position:absolute;left:50%;transform:translateX(-50%);white-space:nowrap;bottom:150px;font:400 28px/1 var(--font-mono);color:#fff;text-shadow:2px 0 rgba(255,0,80,.75),-2px 0 rgba(0,200,255,.75)}
.vx-glitching .dk-col,.vx-glitching .vxf-boss{animation:vxjit .16s steps(2) infinite}
@keyframes vxjit{0%{translate:0 0}50%{translate:-6px 3px}100%{translate:5px -2px}}
@media (max-width:639px){.vxf-slips{left:12px;right:12px;top:150px;align-items:center}.vxf-boss h1{font-size:18px}}
`;
