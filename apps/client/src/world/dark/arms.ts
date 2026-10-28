import type { ServerMessages } from "@yutopia/shared";
import {
  ARM,
  ARMS,
  bloomCalm,
  bloomShot,
  type GunId,
  pellets,
  type Ray,
  rayMeets,
  spreadOf,
} from "@yutopia/shared/dark";
import { count, type Inventory, isUsable, isWeapon, QUICK_SLOT, STACKS, WEAPONS } from "@yutopia/shared/inventory";
import type { WorldController } from "../controller";
import type { Press } from "../input/controls";
import type { Walker } from "../input/walker";
import { hud } from "../store";
import type { Shades } from "./shades";
import type { DarkSound } from "./voices";

// Guns and flares on my side (docs/plan/30-the-dark.md D6), anywhere — the snow,
// the office. 1–4 are the quick slots: a weapon there taken out (again: put it
// away), first aid or a battery used,
// a flare thrown; aiming (the right button, LT), the left button (RT)
// fires: through the crosshair, from the hand — the server decides what it met
// (features/arms.ts: the shadowed, one of us), the flash and the tracers show at
// once. R (the pad's X with nothing to use) reloads a round at a time; G (RB)
// throws a flare where you look; Y while aiming, the next weapon. 1–4 are always
// the quick slots once the dark's loaded (the emotes keep 5–8); R and G only
// when there's something to do with them. The cylinder or the shells and the flares, bottom right, as in
// 02-hud-night.

const AMBER = "#e9a33a";
const QUICK_KEYS = ["Digit1", "Digit2", "Digit3", "Digit4"];
const HAND = 1.35; // the gun's height in the hand, held out (shared beam.ts BEAM.held)
const EARLY_MS = 120; // a click this early is held till the gun's ready
// each gun's kick (docs/plan/32-the-arms.md; tuned in phase 5): on the look (rad, up and at most
// aside) and how much of it settles back by itself (the spread is shared: spreadOf, the server's)
const FEEL = {
  revolver: { up: 0.032, side: 0.01, settle: 0.7 },
  shotgun: { up: 0.085, side: 0.022, settle: 0.55 },
} as const;
const WINDED = 32; // (shared move.ts MV_WINDED: a copy — this chunk doesn't carry move.ts)

export class Arms {
  private shotAt = 0;
  // a reload asked for, till the server's arm says it's on (the gate, the barrels open) — or
  // didn't take (nothing to load), a moment on: then the server's arm is the one that says
  private reloading = false;
  private reloadAt = 0;
  private rtt = 80; // ms, measured
  private pingAt = 0;
  private rtDown = false;
  private readonly hud = document.createElement("div");
  private readonly cross = document.createElement("div");
  private markUntil = 0;
  private markKind = "";
  private lastLoaded = new Map<string, number>(); // the gun's rounds as last seen (a reload's tick)
  private liftAt = 0; // the flashlight raised (aiming with no gun) since (performance.now; 0: not)
  private lent = false; // …and switched on for it: off again when it's let go
  // the gun's feel (docs/plan/32-the-arms.md)
  private bloom = 0; // rad: shots fired fast open the spread up; it settles
  private queued = false; // a click a moment early: fired when it's ready
  private kickAt = -9; // s (performance.now / 1000): the last shot
  private turn = 0; // the cylinder, in chambers (eased to turnTo)
  private turnTo = 0;
  private cock = 0; // the hammer back (0..1)
  private cockTo = 0;
  private open = 0; // the gate out, the barrels dropped (0..1)
  private reloadK = 0; // tipped up to load (0..1)
  private was: { x: number; y: number; t: number } | null = null;
  private speed = 0; // tiles / s, smoothed
  private fx = { kick: 0, cock: 0, turn: 0, open: 0, loaded: 0, trigger: 0, reload: 0 };
  /** a quick slot's key pressed (0–3), and whether it did anything (the quick HUD shows it) */
  onQuick: ((n: number, ok: boolean) => void) | null = null;

  constructor(
    private readonly ctl: WorldController,
    private readonly walker: Walker,
    private readonly shades: Shades,
    private readonly inv: () => Inventory | null,
    root: HTMLElement,
    private readonly voices: DarkSound,
  ) {
    this.hud.className = "abs dk-arms";
    this.cross.className = "dk-cross";
    this.cross.innerHTML = "<i></i><i></i><i></i><i></i>";
    root.append(this.hud, this.cross);
    const room = ctl.room;
    if (!room) return;
    const on = <K extends keyof ServerMessages>(type: K, fn: (m: ServerMessages[K]) => void) =>
      room.onMessage(type, fn);
    on("arms:pong", (m) => {
      this.rtt = this.rtt * 0.7 + Math.max(0, performance.now() - m.t) * 0.3;
    });
    // what my shot met: sparks, a wound; the crosshair says so
    on("arms:hit", (m) => {
      this.ctl.tp?.arms().hit(m.x, m.y, m.z, m.kind);
      // (in my ear: a tick, the head's brighter, one put down a thud; off a shield the spark says it)
      if (m.kind === "killed" || m.kind === "downed") this.voices.play("hit-kill");
      else if (m.kind !== "spark") this.voices.play(m.head ? "hit-head" : "hit-tick");
      // (the head: gold, a little longer; one put down: red, longest)
      const down = m.kind === "killed" || m.kind === "downed";
      this.markKind = m.head && !down && m.kind !== "spark" ? "head" : m.kind;
      this.markUntil = performance.now() + (down ? 500 : m.head ? 320 : 220);
    });
    // someone else's: their flash and tracers (the same pellets, from their seed)
    on("arms:shot", (m) => {
      const gun = m.gun as GunId;
      if (!ARMS[gun]) return;
      const tp = this.ctl.tp;
      if (!tp) return;
      const o = tp.muzzleOf(m.sid) ?? { x: m.ox, y: m.oy, z: m.oz };
      const rays = pellets(gun, m.yaw, m.pitch, m.seed, m.spread).map((d) => this.flight(o.x, o.y, o.z, d, 30));
      tp.arms().shot(o.x, o.y, o.z, rays, gun, m.oz - HAND);
      tp.gunShot(m.sid);
      // (far off: dulled, heard further; near: as the place I'm in sounds)
      const me = this.walker.where();
      const far = Math.hypot(m.ox - me.x, m.oy - me.y) > 22;
      this.voices.play(this.shotSound(gun, far), { x: m.ox, y: m.oy }, far ? 90 : 60);
    });
    on("arms:throw", (m) => {
      this.ctl.tp?.arms().throwFlare(m.x0, m.y0, m.z0, m.x, m.y, m.z, m.secs);
      this.voices.play("flare-strike", { x: m.x0, y: m.y0 }, 30);
    });
  }

  /** the cylinder and flares (the dark puts it in its bottom-right column) */
  get hudEl(): HTMLElement {
    return this.hud;
  }

  // ── the keys (Dark's capturing keydown hands them here first) ─────────────
  /** Taken (true): the world doesn't get it. */
  key(e: KeyboardEvent): boolean {
    if (hud.get().build.on) return false;
    const inv = this.inv();
    const q = QUICK_KEYS.indexOf(e.code);
    // (on foot: riding, driving, at an arcade the keys are theirs; an action menu's numbers pick)
    if (q >= 0 && this.walker.stepping && !hud.get().menu) {
      this.quick(q);
      return true;
    }
    if (e.code === "KeyR" && this.gun()) {
      this.reload();
      return true;
    }
    if (e.code === "KeyG" && inv && count(inv, "flare") > 0) {
      this.flare();
      return true;
    }
    return false;
  }
  /** The left button: fires while aiming with a gun out (else the world's click). */
  click(e: MouseEvent): boolean {
    if (e.button !== 0 || !this.walker.aiming || !this.gun()) return false;
    this.fire();
    return true;
  }
  /** The pad: Y while aiming is the next weapon in the quick slots (not the camera); X with
   *  a gun out and nothing to use, a reload. */
  presses(p: Set<Press>, aiming: boolean): void {
    if (aiming && p.has("camera")) {
      p.delete("camera");
      const me = this.me();
      const guns = (this.inv()?.quick ?? []).flatMap((it, i) => (it && isWeapon(it.id) ? [i] : []));
      const now = guns.findIndex((i) => this.inv()?.quick[i]?.id === me?.gun);
      const next = guns[(now + 1) % guns.length];
      if (next !== undefined && guns.length > (now >= 0 ? 1 : 0)) this.draw(next);
    }
    // (a use the dark took — a search, a pick-up — is gone from them by now)
    if (p.has("use") && this.gun()) {
      p.delete("use");
      this.reload();
    }
  }

  private me() {
    const room = this.ctl.room;
    return room?.state.players.get(room.sessionId) as
      | { gun: string; x: number; y: number; arm?: number; mv?: number }
      | undefined;
  }
  private gun(): { id: GunId; loaded: number; slot: number } | null {
    const me = this.me();
    const inv = this.inv();
    if (!me?.gun || !inv) return null;
    const slot = inv.quick.findIndex((w) => w?.id === me.gun);
    const w = inv.quick[slot];
    return w && "loaded" in w ? { id: w.id as GunId, loaded: w.loaded, slot } : null;
  }

  /** A quick slot (0–3, keys 1–4): a weapon taken out (again: away), first aid or a battery
   *  used, a flare thrown. False (and nothing sent): nothing there to do. */
  quick(n: number): boolean {
    const it = this.inv()?.quick[n];
    let ok = false;
    if (it && isWeapon(it.id)) {
      this.draw(n);
      ok = true;
    } else if (it && isUsable(it.id)) {
      this.ctl.room?.send("dark:use", { slot: QUICK_SLOT + n });
      ok = true;
    } else if (it?.id === "flare") ok = this.flare();
    this.onQuick?.(n, ok);
    return ok;
  }

  /** A quick slot (0–3) with a weapon in the hand; the one in it, or -1: put away. */
  draw(slot: number) {
    const inv = this.inv();
    const it = inv?.quick[slot];
    const w = it && isWeapon(it.id) ? it : null;
    const me = this.me();
    const putAway = !w || me?.gun === w.id;
    this.ctl.room?.send("arms:draw", { slot: putAway ? -1 : slot });
    this.reloading = false;
  }
  reload() {
    const g = this.gun();
    const inv = this.inv();
    if (!g || g.loaded >= WEAPONS[g.id].mag) return;
    // (none left to load: nothing to do — the spare count says so, in red)
    if (!inv || count(inv, WEAPONS[g.id].ammo) <= 0) return;
    this.reloading = true;
    this.reloadAt = performance.now();
    this.ctl.room?.send("arms:reload", {});
  }
  private flare(): boolean {
    const inv = this.inv();
    if (!inv || count(inv, "flare") <= 0) return false;
    const tp = this.ctl.tp;
    // where I look (3D), else where I face
    const yaw = tp ? this.camYaw() : this.facing();
    const pitch = tp && this.walker.aiming ? this.camPitch() : 0;
    this.ctl.room?.send("arms:flare", { yaw, pitch });
    return true;
  }
  private facing(): number {
    const me = this.me() as { yaw?: number } | undefined;
    return (((me?.yaw ?? 0) & 255) / 256) * 2 * Math.PI;
  }
  private camDir() {
    const e = this.ctl.tp?.camera.matrixWorld.elements;
    if (!e) return { x: 1, y: 0, z: 0 };
    // (three: the camera looks down its −z; x, up, z → the floor's x, z up, y)
    return { x: -e[8], y: -e[10], z: -e[9] };
  }
  private camYaw() {
    const d = this.camDir();
    return Math.atan2(d.y, d.x);
  }
  private camPitch() {
    const d = this.camDir();
    return Math.asin(Math.max(-1, Math.min(1, d.z)));
  }

  private fire() {
    const g = this.gun();
    const tp = this.ctl.tp;
    if (!g || !tp) return;
    const now = performance.now();
    const wait = ARMS[g.id].rate * 1000 - (now - this.shotAt);
    if (wait > 0) {
      // (a moment early: held, and fired the moment it's ready — no dead clicks between shots)
      if (wait < EARLY_MS) this.queued = true;
      return;
    }
    this.queued = false;
    // (not up yet: held till it is; the double-barrel open with a shell in: the click snaps it shut —
    // the server's — and the shot goes when it's shut)
    const arm = this.me()?.arm ?? ARM.idle;
    if (arm === ARM.draw) {
      this.queued = true;
      return;
    }
    if (arm === ARM.open && g.loaded > 0) {
      this.ctl.room?.send("arms:fire", { ox: 0, oy: 0, oz: 0, yaw: 0, pitch: 0, lag: 0, seed: 0 });
      this.reloading = false;
      this.queued = true;
      return;
    }
    if (g.loaded <= 0) {
      this.voices.play(g.id === "shotgun" ? "shotgun-dry" : "revolver-dry");
      this.reload(); // (empty: a click, and the reload starts)
      return;
    }
    this.shotAt = now;
    this.reloading = false;
    // through the crosshair: what it's on (one of them, else 30 tiles out)
    const cam = tp.camera.position;
    const d = this.camDir();
    const camRay: Ray = {
      x: cam.x,
      y: cam.z,
      z: cam.y,
      yaw: Math.atan2(d.y, d.x),
      pitch: Math.asin(Math.max(-1, Math.min(1, d.z))),
    };
    let t = 30;
    let onBody = false;
    for (const s of this.shades.drawn()) {
      const m = rayMeets(camRay, s.x, s.y, s.z, 60);
      if (m !== null && m < t) {
        t = m + 0.2;
        onBody = true;
      }
    }
    // (or one of us)
    const them = tp.personAlongLook();
    if (them !== null && them + 0.2 < t) {
      t = them + 0.2;
      onBody = true;
    }
    const aim = { x: camRay.x + d.x * t, y: camRay.y + d.y * t, z: camRay.z + d.z * t };
    // from the gun in the right hand (the body faces where the camera looks)
    const me = this.walker.where();
    const f = { x: Math.cos(camRay.yaw), y: Math.sin(camRay.yaw) };
    const o = { x: me.x + f.x * 0.45 - f.y * 0.22, y: me.y + f.y * 0.45 + f.x * 0.22, z: me.z + HAND };
    const yaw = Math.atan2(aim.y - o.y, aim.x - o.x);
    const pitch = Math.atan2(aim.z - o.z, Math.hypot(aim.x - o.x, aim.y - o.y));
    const seed = (Math.random() * 0xffffffff) >>> 0;
    // (the spread the server will shoot it with, as near as I can tell: its bloom, how I stand)
    const spread = this.spread(g.id);
    this.bloom = bloomShot(g.id, this.bloom);
    this.ctl.room?.send("arms:fire", { ox: o.x, oy: o.y, oz: o.z, yaw, pitch, lag: Math.round(this.rtt), seed });
    // the flash, the tracers: at once — each as far as a wall or the ground (or, the revolver's,
    // the one the crosshair's on)
    const toAim = Math.hypot(aim.x - o.x, aim.y - o.y, aim.z - o.z);
    const most = onBody && g.id === "revolver" ? toAim : 30;
    // (out of the muzzle as it's drawn, where there's one)
    const mz = tp.muzzleOf(this.ctl.room?.sessionId ?? "") ?? o;
    tp.arms().shot(
      mz.x,
      mz.y,
      mz.z,
      pellets(g.id, yaw, pitch, seed, spread).map((p) => this.flight(mz.x, mz.y, mz.z, p, most)),
      g.id,
      me.z,
    );
    // the kick: on my look (most of it settles back), in my hands
    const feel = FEEL[g.id];
    tp.kick(feel.up * (0.85 + Math.random() * 0.3), feel.side * (Math.random() * 2 - 1), feel.settle);
    this.kickAt = now / 1000;
    if (g.id === "revolver") {
      this.cock = 0; // (the hammer falls; the thumb cocks it again, the cylinder turning a notch)
      this.turnTo += 1;
    }
    // (a sharp crack in the hands for the revolver; a long shove for the double-barrel)
    if (g.id === "shotgun") this.walker.controls.pad.rumble(1, 0.8, 170);
    else this.walker.controls.pad.rumble(0.55, 0.25, 70);
    this.voices.play(this.shotSound(g.id, false));
  }

  /** Reloading now: as the server has it, or just asked for (and not full). */
  private loadingNow(): boolean {
    const g = this.gun();
    const arm = this.me()?.arm ?? ARM.idle;
    return !!g && ((this.reloading && g.loaded < WEAPONS[g.id].mag) || arm === ARM.reload || arm === ARM.open);
  }

  /** A shot's sound: out on the land (the treeline, the woods' tail) or in a room — where I am —
   *  or far off. */
  private shotSound(gun: GunId, far: boolean) {
    const k = gun === "shotgun" ? "shotgun" : "revolver";
    if (far) return `${k}-shot-far` as const;
    return this.walker.outside ? (`${k}-shot` as const) : (`${k}-shot-in` as const);
  }

  /** A pellet's flight from (x, y, z) its way: as far as the gun reaches (and `most`), stopped by a
   *  wall or the ground (a puff there). */
  private flight(x: number, y: number, z: number, d: { yaw: number; pitch: number }, most: number) {
    const gunMost = Math.min(most, 30);
    const stop = this.ctl.tp?.rayStop(x, y, z, d.yaw, d.pitch, gunMost) ?? null;
    return { ...d, len: stop ? stop.t : gunMost, hit: stop?.what ?? null };
  }

  /** The spread as it is now (rad): shared spreadOf — the bloom, how I go and stand. */
  private spread(g: GunId): number {
    const mv = this.me()?.mv ?? 0;
    return spreadOf(g, this.bloom, {
      speed: this.speed,
      crouch: (mv & 8) !== 0,
      aim: this.walker.aiming,
      winded: (mv & WINDED) !== 0,
    });
  }

  /** What the gun in my hands is doing, eased each frame (the view poses my gun with it). */
  private gunFx(dt: number, now: number) {
    const g = this.gun();
    const tp = this.ctl.tp;
    if (!tp) return;
    if (!g) {
      tp.myGun = null;
      return;
    }
    const ease = (v: number, to: number, rate: number) => v + (to - v) * (1 - Math.exp(-dt * rate));
    const since = now / 1000 - this.kickAt;
    const kick =
      since < 0 ? 0 : since < 0.035 ? since / 0.035 : Math.exp(-(since - 0.035) * (g.id === "shotgun" ? 9 : 13));
    // the hammer: back while aiming (a moment after a shot: thumbed back again), down otherwise
    const cockTo = this.walker.aiming && since > 0.12 ? 1 : 0;
    // (the revolver's hammer thumbed back: click-click — coming up to aim, and again after a shot)
    if (g.id === "revolver" && cockTo === 1 && this.cockTo === 0) this.voices.play("revolver-cock", undefined, 40, 0.7);
    this.cockTo = cockTo;
    this.cock = ease(this.cock, cockTo, 18);
    // (the cylinder turns as the hammer comes back; a round loaded, a notch too)
    this.turn = ease(this.turn, this.turnTo, 14);
    // (reloading as the server has it — the gate open, the barrels broken open till they're shut —
    // or as I've just asked)
    const arm = this.me()?.arm ?? ARM.idle;
    if (this.reloading && (arm === ARM.reload || arm === ARM.open || now - this.reloadAt > 600)) this.reloading = false;
    const loading = this.loadingNow();
    this.open = ease(this.open, loading ? 1 : 0, loading ? 10 : 14);
    this.reloadK = ease(this.reloadK, loading && !this.walker.aiming ? 1 : 0, 8);
    this.bloom = bloomCalm(g.id, this.bloom, dt);
    Object.assign(this.fx, {
      kick,
      cock: this.cock,
      turn: this.turn,
      open: this.open,
      loaded: g.loaded,
      trigger: since < 0.08 ? 1 : 0,
      reload: this.reloadK,
    });
    tp.myGun = this.fx;
  }

  // ── every frame ──────────────────────────────────────────────────────────
  frame(): void {
    const ctl = this.ctl;
    const room = ctl.room;
    const now = performance.now();
    // how fast I go (the spread opens on the move)
    const at = this.walker.where();
    if (this.was) {
      const dt = Math.max(0.001, (now - this.was.t) / 1000);
      const v = Math.min(12, Math.hypot(at.x - this.was.x, at.y - this.was.y) / dt);
      this.speed += (v - this.speed) * Math.min(1, dt * 8);
    }
    const dt = this.was ? Math.min(0.1, (now - this.was.t) / 1000) : 0;
    this.was = { x: at.x, y: at.y, t: now };
    const armNow = this.me()?.arm ?? ARM.idle;
    if (this.queued && this.walker.aiming && this.gun() && armNow !== ARM.draw && armNow !== ARM.open) this.fire();
    else if (!this.walker.aiming) this.queued = false;
    this.gunFx(dt, now);
    this.armSounds();
    // a gun in my hand (3D): the right button aims anywhere, and the view's clicks don't pick
    const armed = !!ctl.tp && !!this.me()?.gun;
    this.walker.armed = armed;
    if (ctl.tp) ctl.tp.armed = armed;
    // no gun: the right button held raises the flashlight along the look and focuses it — on while
    // it's held, if it was off (a quick click, a thing's menu, doesn't: a quarter second first)
    const lift = this.walker.aiming && !!ctl.tp && !armed;
    if (!lift) this.liftAt = 0;
    else if (!this.liftAt) this.liftAt = now;
    if (lift && !this.lent && now - this.liftAt >= 250 && !hud.get().torch) {
      room?.send("phone:torch", { on: true });
      this.lent = true;
    }
    if (!lift && this.lent) {
      room?.send("phone:torch", { on: false });
      this.lent = false;
    }
    if (room && now - this.pingAt > 3000) {
      this.pingAt = now;
      room.send("arms:ping", { t: now });
    }
    // the pad: RT fires (an edge), RB throws a flare
    const pad = this.walker.controls.pad;
    const rt = pad.rt > 0.6;
    if (rt && !this.rtDown && this.walker.aiming && this.gun()) this.fire();
    this.rtDown = rt;
    if (pad.pressed(5)) this.flare();
    // flares burning on my floor: to the 3D view
    const tp = ctl.tp;
    if (tp) {
      const flares: { x: number; y: number; z: number; t: number }[] = [];
      room?.state.flares?.forEach((f: { x: number; y: number; z: number; at: number; level?: number }) => {
        if ((f.level ?? 0) === ctl.level) flares.push({ x: f.x, y: f.y, z: f.z, t: f.at / 1000 });
      });
      tp.flares = flares;
    }
    this.draws();
  }

  private draws() {
    const out = this.walker.outside;
    const inv = this.inv();
    const g = this.gun();
    // the crosshair, aiming (3D); a mark on it when a shot met one
    // (down the sights in first person, the sights are the crosshair)
    const tp = this.ctl.tp;
    const aiming = this.walker.aiming && !!tp && tp.ads < 0.6;
    this.cross.style.display = aiming ? "block" : "none";
    if (aiming && tp) {
      const marked = performance.now() < this.markUntil;
      this.cross.className = `dk-cross${marked ? ` hit ${this.markKind}` : ""}${g ? "" : " bare"}`;
      // the ticks as far out as the spread: where a shot may go, on the screen
      const half = Math.tan((tp.camera.fov * Math.PI) / 360);
      const px = g ? (Math.tan(this.spread(g.id)) / half) * (window.innerHeight / 2) : 0;
      this.cross.style.setProperty("--gap", `${Math.round(4 + Math.min(80, px))}px`);
    }
    // the cylinder (or the shells), the spare rounds, the flares
    const flares = inv ? count(inv, "flare") : 0;
    // (out here, the flares too; indoors only with a gun out)
    const show = !!inv && (out ? !!g || flares > 0 : !!g);
    this.hud.style.display = show ? "flex" : "none";
    if (!show || !inv) return;
    if (this.reloading && (!g || g.loaded >= WEAPONS[g.id].mag)) this.reloading = false;
    const loading = this.loadingNow();
    // a round in (a reload's tick, a spent case out of the gate; the double-barrel's shell pushed in)
    if (g) {
      const was = this.lastLoaded.get(g.id);
      if (was !== undefined && g.loaded > was) {
        this.voices.play(g.id === "shotgun" ? "shotgun-shell" : "revolver-load");
        if (g.id === "revolver") {
          this.turnTo += 1;
          this.brass("case", 1);
        }
      }
      this.lastLoaded.set(g.id, g.loaded);
    }
    const key = `${g?.id}|${g?.loaded}|${flares}|${loading}|${[...inv.pockets, ...inv.quick].map((s) => (s ? `${s.id}${"n" in s ? s.n : ""}` : "")).join()}`;
    if (this.hud.dataset.key === key) return;
    this.hud.dataset.key = key;
    let gunHtml = "";
    if (g) {
      const mag = WEAPONS[g.id].mag;
      const ammo = WEAPONS[g.id].ammo;
      const spare = count(inv, ammo);
      if (g.id === "revolver") {
        const holes = Array.from({ length: mag }, (_, i) => {
          const a = -Math.PI / 2 + (i * 2 * Math.PI) / mag;
          const x = 40 + 24 * Math.cos(a) - 11;
          const y = 40 + 24 * Math.sin(a) - 11;
          const full = i < g.loaded;
          return `<i style="left:${x}px;top:${y}px;${full ? "background:radial-gradient(#8a6c22 30%,#d8b04e 34%,#b88f33 70%)" : "background:#0b0c0f;border:1.5px solid #555"}"></i>`;
        }).join("");
        gunHtml = `<div class="cyl${loading ? " re" : ""}">${holes}</div>`;
      } else {
        gunHtml = `<div class="shells${loading ? " re" : ""}">${Array.from({ length: mag }, (_, i) => `<b class="${i < g.loaded ? "on" : ""}"></b>`).join("")}</div>`;
      }
      gunHtml = `<div class="gun">${gunHtml}<div class="spare${spare > 0 ? "" : " out"}">+${spare}<small>${ammo === "r38" ? ".38" : "12"}</small></div></div>`;
    }
    const tubes = Array.from({ length: STACKS.flare }, (_, i) => `<b class="${i < flares ? "on" : ""}"></b>`).join("");
    this.hud.innerHTML = `<div class="fl"><div class="tubes">${tubes}</div><div class="n">${flares}</div></div>${gunHtml}`;
  }

  /** Spent brass out of my gun (where it's held), and its tinkle as it lands. */
  private brass(kind: "case" | "shell", n: number) {
    const tp = this.ctl.tp;
    if (!tp || n <= 0) return;
    const me = this.walker.where();
    const yaw = tp ? this.camYaw() : this.facing();
    tp.arms().eject(me.x + Math.cos(yaw) * 0.3, me.y + Math.sin(yaw) * 0.3, me.z + 1.2, yaw, kind, n, me.z);
    // (landing: brass tinkles, a shell's plastic tocks)
    setTimeout(() => this.voices.play(kind === "case" ? "brass" : "shell-drop", { x: me.x, y: me.y }, 12, 0.7), 420);
  }

  // What every hand near me is doing with its gun (Player.arm), heard where they are (mine, here): a
  // gun drawn or put away; the revolver's gate opened for a reload and shut after; the double-barrel
  // broken open (the break, its fired shells kicked out and landing) and snapped shut.
  private arms = new Map<string, { arm: number; gun: string }>();
  private armSounds() {
    const room = this.ctl.room;
    const tp = this.ctl.tp;
    if (!room) return;
    const mine = room.sessionId;
    room.state.players.forEach(
      (p: { sid: string; gun: string; arm?: number; x: number; y: number; z: number; level: number; yaw?: number }) => {
        const arm = p.gun ? (p.arm ?? ARM.idle) : ARM.idle;
        const was = this.arms.get(p.sid) ?? { arm, gun: p.gun };
        this.arms.set(p.sid, { arm, gun: p.gun });
        if (p.level !== this.ctl.level) return;
        const me = p.sid === mine;
        const at = me ? undefined : { x: p.x, y: p.y };
        if (arm === ARM.draw && was.arm !== ARM.draw) this.voices.play("gun-draw", at, 15);
        else if (!p.gun && was.gun) this.voices.play("gun-holster", at, 15);
        if (arm === was.arm || !p.gun) return;
        if (p.gun === "revolver") {
          if (arm === ARM.reload) this.voices.play("revolver-gate", at, 15);
          else if (was.arm === ARM.reload) this.voices.play("revolver-gate", at, 15, 0.8, 0.92);
          return;
        }
        if (arm === ARM.open) {
          this.voices.play("shotgun-break", at, 20);
          // (the fired ones out: mine, as many as are spent; anyone's, both)
          const g = me ? this.gun() : null;
          const spent = g ? WEAPONS.shotgun.mag - g.loaded : 2;
          if (spent > 0) setTimeout(() => this.voices.play("shotgun-eject", at, 15), 110);
          if (me) this.brass("shell", spent);
          else if (tp && spent > 0) {
            const yaw = (((p.yaw ?? 0) & 255) / 256) * 2 * Math.PI;
            tp.arms().eject(p.x + Math.cos(yaw) * 0.3, p.y + Math.sin(yaw) * 0.3, p.z + 1.2, yaw, "shell", spent, p.z);
            setTimeout(() => this.voices.play("shell-drop", at, 12, 0.7), 520);
          }
        } else if (was.arm === ARM.open) this.voices.play("shotgun-shut", at, 20);
      },
    );
    for (const sid of this.arms.keys()) if (!room.state.players.has(sid)) this.arms.delete(sid);
  }

  dispose(): void {
    this.hud.remove();
    this.cross.remove();
  }
}

/** The arms' look (added to the chunk's own sheet). */
export const ARMS_CSS = `
.dk-arms{right:24px;bottom:18px;gap:18px;align-items:flex-end;display:flex}
.dk-arms .gun{display:flex;flex-direction:column;align-items:center;gap:2px}
.dk-arms .cyl{position:relative;width:80px;height:80px;border-radius:50%;background:rgba(20,22,28,.75);border:2px solid rgba(220,224,230,.55)}
.dk-arms .cyl i{position:absolute;width:22px;height:22px;border-radius:50%}
.dk-arms .cyl.re{animation:dkspin .7s linear infinite;border-color:${AMBER}}
.dk-arms .shells.re b:not(.on){animation:dkpulse .6s ease-in-out infinite alternate}
@keyframes dkpulse{to{background:rgba(233,163,58,.45)}}
@keyframes dkspin{to{transform:rotate(60deg)}}
.dk-arms .shells{display:flex;gap:6px;padding:8px}
.dk-arms .shells b{width:14px;height:40px;border-radius:3px;background:rgba(255,255,255,.12)}
.dk-arms .shells b.on{background:linear-gradient(#b3302b 0 70%,#c9a24a 70%)}
.dk-arms .spare{font-weight:700;font-size:15px;text-align:center;text-shadow:0 1px 3px #000}
.dk-arms .spare.out{color:#ff6b5a}
.dk-arms .spare small{display:block;font-size:11px;color:rgba(233,236,239,.6);font-weight:500}
.dk-arms .fl{text-align:center}
.dk-arms .fl .tubes{display:flex;gap:5px;justify-content:center;height:46px;align-items:flex-end}
.dk-arms .fl .tubes b{width:9px;height:42px;border-radius:5px;background:rgba(255,255,255,.12)}
.dk-arms .fl .tubes b.on{background:linear-gradient(#f4e2c2 0 6px,#c8322a 6px)}
.dk-arms .fl .n{font-weight:700;font-size:14px;margin-top:4px;text-shadow:0 1px 3px #000}
.dk-cross{position:fixed;left:50%;top:50%;width:1px;height:1px;pointer-events:none;display:none;--gap:6px;--c:rgba(255,255,255,.85)}
.dk-cross i{position:absolute;background:var(--c);box-shadow:0 0 2px rgba(0,0,0,.7);transition:transform 60ms}
.dk-cross i:nth-child(1),.dk-cross i:nth-child(2){width:9px;height:2px;top:-1px}
.dk-cross i:nth-child(3),.dk-cross i:nth-child(4){width:2px;height:9px;left:-1px}
.dk-cross i:nth-child(1){right:var(--gap)}
.dk-cross i:nth-child(2){left:var(--gap)}
.dk-cross i:nth-child(3){bottom:var(--gap)}
.dk-cross i:nth-child(4){top:var(--gap)}
.dk-cross.bare i{width:4px;height:4px;border-radius:50%;left:-2px;top:-2px;right:auto;bottom:auto}
.dk-cross.hit{--c:#fff}
.dk-cross.hit i{transform:scale(1.3)}
.dk-cross.hit.spark{--c:#9ec5ff}
.dk-cross.hit.person{--c:#ffb02e}
.dk-cross.hit.head{--c:#ffd54a}
.dk-cross.hit.head i{transform:scale(1.45)}
.dk-cross.hit.killed,.dk-cross.hit.downed{--c:#ff5a4a}
.dk-cross.hit.killed i,.dk-cross.hit.downed i{transform:scale(1.6)}
`;
