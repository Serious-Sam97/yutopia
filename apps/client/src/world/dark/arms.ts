import type { ServerMessages } from "@yutopia/shared";
import {
  ARM,
  ARMS,
  bloomCalm,
  bloomShot,
  type GunId,
  isAuto,
  isScoped,
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
  // (the AK, plan 79 phase 5: a small kick a round that mostly stays — held down, it climbs, and walks
  // aside a little, the same way each burst)
  ak47: { up: 0.016, side: 0.007, settle: 0.3 },
  // (the sniper, phase 6: a hard push up, most of it back as the bolt's worked)
  sniper: { up: 0.07, side: 0.012, settle: 0.75 },
} as const;
// the scope (plan 79 phase 6): its sway on the look (rad, still and stood), and the breath held (Shift):
// steady for `hold` s, then worse till let go, getting back over `back` s
const SCOPE = { sway: 0.0035, hold: 3, steady: 0.12, spent: 2.2, back: 2 };
const WINDED = 32;
// the camera's share of a gun's kick, and how much of it settles back by itself at least (plan 79)
const CAM_KICK = { share: 0.65, settle: 0.8 }; // (shared move.ts MV_WINDED: a copy — this chunk doesn't carry move.ts)

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
  // the gun's feel (docs/plan/32-the-arms.md)
  private bloom = 0; // rad: shots fired fast open the spread up; it settles
  private queued = false; // a click a moment early: fired when it's ready
  private kickAt = -9; // s (performance.now / 1000): the last shot
  private triggerDown = false; // the left button held (full auto: the AK fires while it is)
  private burst = 0; // rounds into this burst (its climb walks aside by it)
  private dryPulled = false; // a dry click this pull (held, it isn't clicked again)
  private ahead = 0; // shots sent that the server's count hasn't taken off yet (full auto outruns the line)
  // the scope (the sniper's, plan 79 phase 6): its power (the wheel: 4, 8), aimed since (s), the
  // breath held (Shift) and how long, spent after holding too long; out of it while the bolt's worked
  private scopePow = 4;
  private aimedAt = -1;
  private shiftDown = false;
  private breathT = 0;
  private spent = 0;
  private boltTill = 0;
  private readonly scopeEl = document.createElement("div");
  private aheadLoaded = -1;
  private dryAt = -9; // s: the last pull on an empty chamber (the trigger goes, the hammer falls on nothing)
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
    this.cross.innerHTML = "<i></i><i></i><i></i><i></i><b></b>";
    this.scopeEl.className = "dk-scope";
    this.scopeEl.innerHTML = "<i></i><i></i><i></i><i></i><b></b>";
    root.append(this.hud, this.cross, this.scopeEl);
    const up = (e: MouseEvent) => {
      if (e.button === 0) this.triggerUp();
    };
    // (the scope's power: the wheel, while looking down it — the camera's distance otherwise)
    const wheel = (e: WheelEvent) => {
      if (!this.ctl.tp?.scope) return;
      this.scopePow = e.deltaY < 0 ? 8 : 4;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    // (Shift: the breath held, down the scope — aiming, it's no sprint: shared move step)
    const shift = (e: KeyboardEvent) => {
      if (e.code === "ShiftLeft" || e.code === "ShiftRight") this.shiftDown = e.type === "keydown";
    };
    window.addEventListener("mouseup", up, true);
    window.addEventListener("blur", up as () => void);
    window.addEventListener("wheel", wheel, { capture: true, passive: false });
    window.addEventListener("keydown", shift, true);
    window.addEventListener("keyup", shift, true);
    this.offs.push(() => {
      window.removeEventListener("mouseup", up, true);
      window.removeEventListener("blur", up as () => void);
      window.removeEventListener("wheel", wheel, true);
      window.removeEventListener("keydown", shift, true);
      window.removeEventListener("keyup", shift, true);
    });
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
      const o = tp.guns.muzzleOf(m.sid) ?? { x: m.ox, y: m.oy, z: m.oz };
      const reach = isScoped(gun) ? ARMS[gun].range : 30;
      const rays = pellets(gun, m.yaw, m.pitch, m.seed, m.spread).map((d) => this.flight(o.x, o.y, o.z, d, reach));
      tp.arms().shot(o.x, o.y, o.z, rays, gun, m.oz - HAND);
      tp.guns.gunShot(m.sid);
      tp.heard(m.ox, m.oy);
      // (far off: dulled, heard further; near: as the place I'm in sounds)
      const me = this.walker.where();
      const far = Math.hypot(m.ox - me.x, m.oy - me.y) > 22;
      const v = this.shotSound(gun, far);
      this.voices.play(v.name, { x: m.ox, y: m.oy }, far ? 90 : 60, v.volume, v.rate);
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
  /** The left button: fires while aiming with a gun out (else the world's click) — the AK while it's held. */
  click(e: MouseEvent): boolean {
    if (e.button !== 0 || !this.walker.aiming || !this.gun()) return false;
    this.triggerDown = true;
    this.fire();
    return true;
  }
  private triggerUp() {
    this.triggerDown = false;
    this.burst = 0;
    this.dryPulled = false;
  }
  private readonly offs: (() => void)[] = [];
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

  /** How far along the camera's line the crosshair meets a wall or the ground (the view's aim, within
   *  its 16 tiles), or null: nothing that near. */
  private crossHit(): number | null {
    const tp = this.ctl.tp;
    if (!tp?.aimOn) return null;
    const t = tp.camera.position.distanceTo(tp.aimHit);
    return t < 15.9 ? t : null;
  }

  /** Aiming a gun: where on the screen (px from the middle) a shot from the muzzle would be stopped
   *  short of what the crosshair is on — a wall, the ground right by me — or null: it's clear. */
  private blockedAt(): { x: number; y: number } | null {
    const tp = this.ctl.tp;
    if (!tp?.aimOn) return null;
    const mz = tp.guns.muzzleOf(this.ctl.room?.sessionId ?? "");
    if (!mz) return null;
    const h = tp.aimHit;
    const to = { x: h.x - mz.x, y: h.z - mz.y, z: h.y - mz.z };
    const L = Math.hypot(to.x, to.y, to.z);
    if (L < 0.6) return null;
    const yaw = Math.atan2(to.y, to.x);
    const pitch = Math.atan2(to.z, Math.hypot(to.x, to.y));
    const stop = tp.pointerPart.rayStop(mz.x, mz.y, mz.z, yaw, pitch, L - 0.35);
    if (!stop) return null;
    const k = stop.t / L;
    const p = tp.project(mz.x + to.x * k, mz.y + to.y * k, mz.z + to.z * k);
    if (!p) return null;
    const c = tp.renderer.domElement;
    return { x: p.x - c.clientWidth / 2, y: p.y - c.clientHeight / 2 };
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
    // (the rounds left as I've fired them — the server's count comes a moment after)
    if (g.loaded - this.ahead <= 0) {
      // (held down, the dry click once a pull)
      if (this.dryPulled) return;
      this.dryPulled = this.triggerDown;
      this.voices.play(g.id === "shotgun" ? "shotgun-dry" : "revolver-dry");
      this.dryAt = now / 1000;
      this.reload(); // (empty: a click, and the reload starts)
      return;
    }
    // (full auto keeps its beat: the next round's slot from this one's, not from the frame it fell in)
    const rateMs = ARMS[g.id].rate * 1000;
    this.shotAt = isAuto(g.id) && now - this.shotAt < rateMs * 1.5 ? this.shotAt + rateMs : now;
    this.ahead++;
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
    // (the sniper's reach: as far as it goes — the others', what's near)
    const reach = isScoped(g.id) ? ARMS[g.id].range : 30;
    let t = reach;
    let onBody = false;
    for (const s of this.shades.drawn()) {
      const m = rayMeets(camRay, s.x, s.y, s.z, Math.max(60, reach));
      if (m !== null && m < t) {
        t = m + 0.2;
        onBody = true;
      }
    }
    // (or one of us)
    const them = tp.pointerPart.personAlongLook();
    if (them !== null && them + 0.2 < t) {
      t = them + 0.2;
      onBody = true;
    }
    // (or a wall, the ground: the shot goes from the muzzle to what the crosshair is really on — over
    // the shoulder the muzzle isn't the camera, docs/plan/79-the-guns.md)
    const wall = this.crossHit();
    if (wall !== null && wall < t) {
      t = wall;
      onBody = false;
    }
    const aim = { x: camRay.x + d.x * t, y: camRay.y + d.y * t, z: camRay.z + d.z * t };
    // from the gun in the right hand (the body faces where the camera looks)
    const me = this.walker.where();
    const f = { x: Math.cos(camRay.yaw), y: Math.sin(camRay.yaw) };
    // (down a scope: from the eye along the look, exactly where the reticle is — plan 79 phase 6)
    const scoped = tp.scopeK > 0.85;
    const o = scoped
      ? { x: camRay.x, y: camRay.y, z: camRay.z }
      : { x: me.x + f.x * 0.45 - f.y * 0.22, y: me.y + f.y * 0.45 + f.x * 0.22, z: me.z + HAND };
    const yaw = scoped ? camRay.yaw : Math.atan2(aim.y - o.y, aim.x - o.x);
    const pitch = scoped ? camRay.pitch : Math.atan2(aim.z - o.z, Math.hypot(aim.x - o.x, aim.y - o.y));
    const seed = (Math.random() * 0xffffffff) >>> 0;
    // (the spread the server will shoot it with, as near as I can tell: its bloom, how I stand)
    const spread = this.spread(g.id);
    this.bloom = bloomShot(g.id, this.bloom);
    this.ctl.room?.send("arms:fire", {
      ox: o.x,
      oy: o.y,
      oz: o.z,
      yaw,
      pitch,
      lag: Math.round(this.rtt),
      seed,
      ...(scoped ? { scope: true } : {}),
    });
    // (the bolt worked after it: out of the scope till it's home — RE5's S75)
    const gb = ARMS[g.id];
    if ("bolt" in gb) this.boltTill = now + (gb.boltAt + gb.bolt) * 1000 + 120;
    // the flash, the tracers: at once — each as far as a wall or the ground (or, the revolver's,
    // the one the crosshair's on)
    const toAim = Math.hypot(aim.x - o.x, aim.y - o.y, aim.z - o.z);
    const most = onBody && (g.id === "revolver" || scoped) ? toAim : reach;
    // (out of the muzzle as it's drawn, where there's one)
    const mz = tp.guns.muzzleOf(this.ctl.room?.sessionId ?? "") ?? o;
    tp.arms().shot(
      mz.x,
      mz.y,
      mz.z,
      pellets(g.id, yaw, pitch, seed, spread).map((p) => this.flight(mz.x, mz.y, mz.z, p, most)),
      g.id,
      me.z,
    );
    tp.heard(mz.x, mz.y);
    // the kick, split (docs/plan/79-the-guns.md): a smaller one on my look, most of it settling back by
    // itself; the gun's own, bigger, in my hands (gunFx's kick, the body's aim2)
    const feel = FEEL[g.id];
    const look = CAM_KICK.share;
    // (full auto: it climbs — most of each round's kick stays — and walks aside the same way each burst)
    const auto = isAuto(g.id);
    const side = auto ? 0.7 * Math.sin(this.burst * 0.8 + 0.6) + 0.3 * (Math.random() * 2 - 1) : Math.random() * 2 - 1;
    tp.guns.kick(
      feel.up * look * (0.85 + Math.random() * 0.3),
      feel.side * look * side,
      auto ? feel.settle : Math.max(feel.settle, CAM_KICK.settle),
    );
    this.burst++;
    this.kickAt = now / 1000;
    if (g.id === "revolver") {
      this.cock = 0; // (the hammer falls; the thumb cocks it again, the cylinder turning a notch)
      this.turnTo += 1;
    }
    // (a sharp crack in the hands for the revolver; a long shove for the double-barrel; the AK's quick
    // jolts — and its brass out of the port, a case a round)
    if (g.id === "shotgun" || g.id === "sniper") this.walker.controls.pad.rumble(1, 0.8, 170);
    else if (auto) this.walker.controls.pad.rumble(0.4, 0.2, 45);
    else this.walker.controls.pad.rumble(0.55, 0.25, 70);
    if (g.id === "ak47") this.brass("case", 1);
    const v = this.shotSound(g.id, false);
    this.voices.play(v.name, undefined, 40, v.volume, v.rate);
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
    const name = far
      ? (`${k}-shot-far` as const)
      : this.walker.outside
        ? (`${k}-shot` as const)
        : (`${k}-shot-in` as const);
    // (the AK borrows the revolver's, quicker and a little lower in the mix; the sniper the double-barrel's,
    // deeper — placeholders till plan 79 phase 9's sounds)
    if (gun === "sniper") {
      const deep = far
        ? ("shotgun-shot-far" as const)
        : this.walker.outside
          ? ("shotgun-shot" as const)
          : ("shotgun-shot-in" as const);
      return { name: deep, volume: 1, rate: 0.8 };
    }
    return gun === "ak47" ? { name, volume: 0.75, rate: 1.22 } : { name, volume: 1, rate: 1 };
  }

  /** A pellet's flight from (x, y, z) its way: as far as the gun reaches (and `most`), stopped by a
   *  wall or the ground (a puff there). */
  private flight(x: number, y: number, z: number, d: { yaw: number; pitch: number }, most: number) {
    const gunMost = Math.min(most, ARMS.sniper.range);
    const stop = this.ctl.tp?.pointerPart.rayStop(x, y, z, d.yaw, d.pitch, gunMost) ?? null;
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
      tp.guns.myGun = null;
      return;
    }
    const ease = (v: number, to: number, rate: number) => v + (to - v) * (1 - Math.exp(-dt * rate));
    const since = now / 1000 - this.kickAt;
    const kick =
      since < 0
        ? 0
        : since < 0.035
          ? since / 0.035
          : Math.exp(-(since - 0.035) * (g.id === "shotgun" ? 9 : g.id === "ak47" ? 18 : g.id === "sniper" ? 7 : 13));
    // the hammer: back while aiming (a moment after a shot: thumbed back again), down otherwise
    // (dry: the trigger pulled, the hammer down on nothing for a moment — plan 79)
    const dry = now / 1000 - this.dryAt < 0.14;
    const cockTo = this.walker.aiming && since > 0.12 && !dry ? 1 : 0;
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
      trigger: since < 0.08 || dry ? 1 : 0,
      reload: this.reloadK,
    });
    tp.guns.myGun = this.fx;
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
    // (the server's count catching up with the shots I've sent; a reload, another gun: none ahead)
    const g0 = this.gun();
    if (g0) {
      if (g0.loaded < this.aheadLoaded) this.ahead = Math.max(0, this.ahead - (this.aheadLoaded - g0.loaded));
      else if (g0.loaded > this.aheadLoaded) this.ahead = 0;
      this.aheadLoaded = g0.loaded;
      if (now - this.shotAt > 1000) this.ahead = 0;
    }
    // (full auto: held, it fires at its rate; let go — or not aiming — the burst's over)
    const pulled = this.triggerDown || this.walker.controls.pad.rt > 0.6;
    if (g0 && isAuto(g0.id) && pulled && this.walker.aiming && armNow !== ARM.draw && armNow !== ARM.open) this.fire();
    else if (this.queued && this.walker.aiming && g0 && armNow !== ARM.draw && armNow !== ARM.open) this.fire();
    else if (!this.walker.aiming) this.queued = false;
    if (!pulled && this.burst > 0) this.triggerUp();
    this.gunFx(dt, now);
    this.scopeFrame(dt, now, armNow);
    this.armSounds();
    // a gun in my hand (3D): the right button aims anywhere, and the view's clicks don't pick
    const armed = !!ctl.tp && !!this.me()?.gun;
    this.walker.armed = armed;
    const held = this.gun();
    if (ctl.tp) ctl.tp.aimSecs = held ? ARMS[held.id].aim : 0.2;
    // (the sniper's aim comes up near level — out to the distance, where its scope's for: plan 79 phase 6)
    if (ctl.tp) ctl.tp.aimRise = held && isScoped(held.id) ? 0.04 : 0.15;
    if (ctl.tp && ctl.tp.armed !== armed) {
      ctl.tp.armed = armed;
      // (guns are third person: a gun out in first person goes over the shoulder, and back —
      // docs/plan/79-the-guns.md F3a)
      ctl.tp.setMode(ctl.camWanted());
    }
    // (the right button focuses the torch only when it's on — L: it no longer switches it on for
    // the aim and off after, docs/plan/79-the-guns.md F8; the walker's focus needs it on)
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

  /** Down the scope (the sniper's, plan 79 phase 6): aimed its `aim` s, not working the bolt, not
   *  reloading — the view goes to the eye (tp.scope); the sway on it, steadied by the breath held. */
  private scopeFrame(dt: number, now: number, arm: number) {
    const tp = this.ctl.tp;
    if (!tp) return;
    const g = this.gun();
    const aiming = this.walker.aiming && !!g && isScoped(g.id);
    if (!aiming) this.aimedAt = -1;
    else if (this.aimedAt < 0) this.aimedAt = now;
    const on =
      aiming &&
      !!g &&
      now - this.aimedAt > ARMS[g.id].aim * 1000 &&
      now > this.boltTill &&
      arm !== ARM.bolt &&
      arm !== ARM.draw &&
      !this.loadingNow();
    tp.scope = on ? this.scopePow : 0;
    // the breath: held (Shift, looking down it) steadies it, for a while; held too long, worse till let go
    const holding = on && this.shiftDown && this.spent <= 0.01;
    if (holding) this.breathT += dt;
    else this.breathT = 0;
    if (this.breathT > SCOPE.hold) {
      this.spent = 1;
      this.breathT = 0;
    }
    if (!this.shiftDown || !on) this.spent = Math.max(0, this.spent - dt / SCOPE.back);
    const mv = this.me()?.mv ?? 0;
    const k =
      (holding ? SCOPE.steady : 1 + this.spent * (SCOPE.spent - 1)) *
      (1 + Math.min(this.speed, 3) * 0.8) *
      ((mv & 8) !== 0 ? 0.55 : 1);
    const t = now / 1000;
    const a = SCOPE.sway * k;
    tp.scopeSway.x = a * (Math.sin(t * 0.9) + 0.5 * Math.sin(t * 2.3 + 1));
    tp.scopeSway.y = a * (0.8 * Math.sin(t * 1.3 + 0.5) + 0.3 * Math.sin(t * 3.1));
    // the glass: its ring and reticle, once the view's there
    this.scopeEl.classList.toggle("on", tp.scopeK > 0.8);
  }

  private draws() {
    const out = this.walker.outside;
    const inv = this.inv();
    const g = this.gun();
    // the crosshair, aiming (3D); a mark on it when a shot met one
    const tp = this.ctl.tp;
    const aiming = this.walker.aiming && !!tp && tp.scopeK < 0.5;
    this.cross.style.display = aiming ? "block" : "none";
    if (aiming && tp) {
      const marked = performance.now() < this.markUntil;
      // where the shot will really go: something between the muzzle and what the crosshair is on
      // takes it — the reticle moves there and says so (docs/plan/79-the-guns.md)
      const block = g ? this.blockedAt() : null;
      this.cross.className = `dk-cross${marked ? ` hit ${this.markKind}` : ""}${g ? "" : " bare"}${block ? " blocked" : ""}`;
      this.cross.style.transform = block ? `translate(${Math.round(block.x)}px, ${Math.round(block.y)}px)` : "";
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
    // a round in: the double-barrel's shell pushed in; the revolver's speedloader, all at once (plan 79
    // F11a — its spent cases fell as it swung out: armSounds)
    if (g) {
      const was = this.lastLoaded.get(g.id);
      if (was !== undefined && g.loaded > was) this.voices.play(g.id === "shotgun" ? "shotgun-shell" : "revolver-load");
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
      } else if (g.id === "sniper") {
        // (its five: brass, in a row)
        gunHtml = `<div class="shells clip${loading ? " re" : ""}">${Array.from({ length: mag }, (_, i) => `<b class="${i < g.loaded ? "on" : ""}"></b>`).join("")}</div>`;
      } else if (g.id === "ak47") {
        // (the magazine: its rounds as a bar, the count on it)
        gunHtml = `<div class="mag${loading ? " re" : ""}"><i style="height:${Math.round((g.loaded / mag) * 100)}%"></i><span>${g.loaded}</span></div>`;
      } else {
        gunHtml = `<div class="shells${loading ? " re" : ""}">${Array.from({ length: mag }, (_, i) => `<b class="${i < g.loaded ? "on" : ""}"></b>`).join("")}</div>`;
      }
      gunHtml = `<div class="gun">${gunHtml}<div class="spare${spare > 0 ? "" : " out"}">+${spare}<small>${ammo === "r38" ? ".38" : ammo === "r762" ? "7.62" : ammo === "r308" ? ".308" : "12"}</small></div></div>`;
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
          // (plan 79 F11a: the cylinder swung out — its spent cases dumped, the live ones to the pockets —
          // and shut after the speedloader; `reload`, the old gate, heard the same)
          const opened = arm === ARM.open || arm === ARM.reload;
          if (opened && was.arm !== ARM.open && was.arm !== ARM.reload) {
            this.voices.play("revolver-gate", at, 15);
            const g = me ? this.gun() : null;
            const spent = g ? WEAPONS.revolver.mag - g.loaded : 0;
            if (me) setTimeout(() => this.brass("case", spent), 250);
          } else if (!opened && (was.arm === ARM.open || was.arm === ARM.reload))
            this.voices.play("revolver-gate", at, 15, 0.8, 0.92);
          return;
        }
        if (p.gun === "sniper") {
          // (placeholders, plan 79 phase 9: the bolt up and back — its case out — and home; opened to load,
          // shut)
          if (arm === ARM.bolt) {
            this.voices.play("revolver-cock", at, 15, 0.9, 0.6);
            setTimeout(() => this.voices.play("revolver-cock", at, 15, 0.9, 0.75), 380);
            if (me) setTimeout(() => this.brass("case", 1), 200);
          } else if (arm === ARM.open) this.voices.play("revolver-gate", at, 15, 0.9, 0.8);
          else if (was.arm === ARM.open) this.voices.play("revolver-cock", at, 15, 0.9, 0.7);
          return;
        }
        if (p.gun === "ak47") {
          // (the magazine out — a placeholder: the double-barrel's break, higher — and in; shouldered again,
          // or the charging handle racked: plan 79 phase 9 has the real ones)
          if (arm === ARM.open) this.voices.play("shotgun-break", at, 15, 0.7, 1.35);
          else if (was.arm === ARM.open) this.voices.play("revolver-cock", at, 15, 0.8, 0.75);
          return;
        }
        if (arm === ARM.open) {
          this.voices.play("shotgun-break", at, 20);
          // (both out — plan 79 F12a: the fired ones kicked out to the ground, mine as many as are spent,
          // anyone's both; a live one back to the pocket)
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
    for (const off of this.offs) off();
    if (this.ctl.tp) this.ctl.tp.scope = 0;
    this.scopeEl.remove();
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
.dk-arms .shells.clip b{width:8px;height:36px;border-radius:4px 4px 2px 2px}
.dk-arms .shells.clip b.on{background:linear-gradient(#b8763e 0 22%,#d8b04e 22%)}
.dk-scope{position:fixed;inset:0;pointer-events:none;opacity:0;transition:opacity 90ms;background:radial-gradient(circle at 50% 50%,transparent 0 41vmin,rgba(0,0,0,.55) 42vmin,#000 44vmin)}
.dk-scope.on{opacity:1}
.dk-scope::before,.dk-scope::after{content:"";position:absolute;background:#050505}
.dk-scope::before{left:calc(50% - 44vmin);width:88vmin;top:50%;height:1px;margin-top:-.5px}
.dk-scope::after{top:calc(50% - 44vmin);height:88vmin;left:50%;width:1px;margin-left:-.5px}
.dk-scope i{position:absolute;background:#050505}
.dk-scope i:nth-child(1),.dk-scope i:nth-child(2){top:50%;height:4px;margin-top:-2px;width:34vmin}
.dk-scope i:nth-child(3),.dk-scope i:nth-child(4){left:50%;width:4px;margin-left:-2px;height:34vmin}
.dk-scope i:nth-child(1){left:calc(50% - 44vmin)}
.dk-scope i:nth-child(2){right:calc(50% - 44vmin)}
.dk-scope i:nth-child(3){top:calc(50% - 44vmin)}
.dk-scope i:nth-child(4){bottom:calc(50% - 44vmin)}
.dk-scope b{position:absolute;left:50%;top:50%;width:3px;height:3px;margin:-1.5px;border-radius:50%;background:#c22}
.dk-arms .mag{position:relative;width:26px;height:64px;margin:8px 0;border-radius:4px 4px 8px 4px;background:rgba(20,22,28,.75);border:2px solid rgba(220,224,230,.55);overflow:hidden;transform:skewY(-8deg)}
.dk-arms .mag i{position:absolute;left:0;right:0;bottom:0;background:linear-gradient(#d8b04e,#9e7d34)}
.dk-arms .mag span{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%) skewY(8deg);text-align:center;font-weight:700;font-size:13px;text-shadow:0 1px 3px #000}
.dk-arms .mag.re{border-color:${AMBER}}
.dk-arms .mag.re i{animation:dkpulse .6s ease-in-out infinite alternate}
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
.dk-cross b{position:absolute;width:3px;height:3px;left:-1.5px;top:-1.5px;border-radius:50%;background:var(--c);box-shadow:0 0 2px rgba(0,0,0,.7)}
.dk-cross.bare i{width:4px;height:4px;border-radius:50%;left:-2px;top:-2px;right:auto;bottom:auto}
.dk-cross.bare b{display:none}
.dk-cross.blocked{--c:rgba(255,150,120,.95)}
.dk-cross.blocked i{opacity:.3}
.dk-cross.blocked b{width:10px;height:10px;left:-6px;top:-6px;background:none;border:2px solid var(--c)}
.dk-cross.hit{--c:#fff}
.dk-cross.hit i{transform:scale(1.3)}
.dk-cross.hit.spark{--c:#9ec5ff}
.dk-cross.hit.person{--c:#ffb02e}
.dk-cross.hit.head{--c:#ffd54a}
.dk-cross.hit.head i{transform:scale(1.45)}
.dk-cross.hit.killed,.dk-cross.hit.downed{--c:#ff5a4a}
.dk-cross.hit.killed i,.dk-cross.hit.downed i{transform:scale(1.6)}
`;
