import type { ServerMessages } from "@yutopia/shared";
import { ARMS, type GunId, pellets, type Ray, rayMeets } from "@yutopia/shared/dark";
import { count, type Inventory, isUsable, isWeapon, QUICK_SLOT, STACKS, WEAPONS } from "@yutopia/shared/inventory";
import { prefs, setPrefs } from "@/lib/prefs";
import type { WorldController } from "../controller";
import type { Press } from "../input/controls";
import type { Walker } from "../input/walker";
import { hud } from "../store";
import type { Shades } from "./shades";
import type { DarkSound } from "./voices";

// Guns and flares on my side (docs/plan/30-the-dark.md D6), anywhere — the snow,
// the office. 1–4 are the quick slots: a weapon there taken out (again: put it
// away; in iso, it switches to 3D — the fight is 3D), first aid or a battery used,
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

export class Arms {
  private shotAt = 0;
  private reloading = false;
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
      this.markKind = m.kind;
      this.markUntil = performance.now() + (m.kind === "killed" || m.kind === "downed" ? 500 : 220);
    });
    // someone else's: their flash and tracers (the same pellets, from their seed)
    on("arms:shot", (m) => {
      const gun = m.gun as GunId;
      if (!ARMS[gun]) return;
      const rays = pellets(gun, m.yaw, m.pitch, m.seed).map((d) => ({ ...d, len: Math.min(ARMS[gun].range, 30) }));
      this.ctl.tp?.arms().shot(m.ox, m.oy, m.oz, rays);
      this.voices.play(gun === "shotgun" ? "shotgun-shot" : "revolver-shot", { x: m.ox, y: m.oy }, 60);
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
    // (on foot: riding, driving, at an arcade the keys are theirs)
    if (q >= 0 && this.walker.stepping) {
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
    return room?.state.players.get(room.sessionId) as { gun: string; x: number; y: number } | undefined;
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
    // (the fight is 3D: a gun out in iso, the view goes 3D)
    if (!putAway && !this.ctl.tp) setPrefs({ view: prefs().last3d === "1p" ? "1p" : "3p" });
  }
  reload() {
    const g = this.gun();
    if (!g || g.loaded >= WEAPONS[g.id].mag) return;
    this.reloading = true;
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
    if (now - this.shotAt < ARMS[g.id].rate * 1000) return;
    if (g.loaded <= 0) {
      this.voices.play("revolver-dry");
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
    for (const s of this.shades.drawn()) {
      const m = rayMeets(camRay, s.x, s.y, s.z, 60);
      if (m !== null && m < t) t = m + 0.2;
    }
    // (or one of us)
    const them = tp.personAlongLook();
    if (them !== null && them + 0.2 < t) t = them + 0.2;
    const aim = { x: camRay.x + d.x * t, y: camRay.y + d.y * t, z: camRay.z + d.z * t };
    // from the gun in the right hand (the body faces where the camera looks)
    const me = this.walker.where();
    const f = { x: Math.cos(camRay.yaw), y: Math.sin(camRay.yaw) };
    const o = { x: me.x + f.x * 0.45 - f.y * 0.22, y: me.y + f.y * 0.45 + f.x * 0.22, z: me.z + HAND };
    const yaw = Math.atan2(aim.y - o.y, aim.x - o.x);
    const pitch = Math.atan2(aim.z - o.z, Math.hypot(aim.x - o.x, aim.y - o.y));
    const seed = (Math.random() * 0xffffffff) >>> 0;
    this.ctl.room?.send("arms:fire", { ox: o.x, oy: o.y, oz: o.z, yaw, pitch, lag: Math.round(this.rtt), seed });
    // the flash, the tracers: at once
    const len = Math.min(ARMS[g.id].range, Math.hypot(aim.x - o.x, aim.y - o.y, aim.z - o.z));
    tp.arms().shot(
      o.x,
      o.y,
      o.z,
      pellets(g.id, yaw, pitch, seed).map((p) => ({ ...p, len })),
    );
    this.walker.controls.pad.rumble(g.id === "shotgun" ? 0.9 : 0.5, 0.4, 90);
    this.voices.play(g.id === "shotgun" ? "shotgun-shot" : "revolver-shot");
    if (g.id === "shotgun") setTimeout(() => this.voices.play("shotgun-pump"), 380);
  }

  // ── every frame ──────────────────────────────────────────────────────────
  frame(): void {
    const ctl = this.ctl;
    const room = ctl.room;
    const now = performance.now();
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
    // flares burning on my floor: to whichever view is showing (iso: the snow's only)
    const flares: { x: number; y: number; z: number; t: number }[] = [];
    room?.state.flares?.forEach((f: { x: number; y: number; z: number; at: number; level?: number }) => {
      if ((f.level ?? 0) === ctl.level) flares.push({ x: f.x, y: f.y, z: f.z, t: f.at / 1000 });
    });
    if (ctl.tp) ctl.tp.flares = flares;
    const g = ctl.engine?.grounds;
    if (g) g.flares = ctl.tp || ctl.level !== 0 ? [] : flares;
    this.draws();
  }

  private draws() {
    const out = this.walker.outside;
    const inv = this.inv();
    const g = this.gun();
    // the crosshair, aiming (3D); a mark on it when a shot met one
    const aiming = this.walker.aiming && !!this.ctl.tp;
    this.cross.style.display = aiming ? "block" : "none";
    if (aiming) {
      const marked = performance.now() < this.markUntil;
      this.cross.className = `dk-cross${marked ? ` hit ${this.markKind}` : ""}`;
    }
    // the cylinder (or the shells), the spare rounds, the flares
    const flares = inv ? count(inv, "flare") : 0;
    // (out here, the flares too; indoors only with a gun out)
    const show = !!inv && (out ? !!g || flares > 0 : !!g);
    this.hud.style.display = show ? "flex" : "none";
    if (!show || !inv) return;
    if (this.reloading && (!g || g.loaded >= WEAPONS[g.id].mag)) this.reloading = false;
    // a round in (a reload's tick; the shotgun's shell, racked)
    if (g) {
      const was = this.lastLoaded.get(g.id);
      if (was !== undefined && g.loaded > was) this.voices.play(g.id === "shotgun" ? "shotgun-pump" : "revolver-load");
      this.lastLoaded.set(g.id, g.loaded);
    }
    const key = `${g?.id}|${g?.loaded}|${flares}|${this.reloading}|${[...inv.pockets, ...inv.quick].map((s) => (s ? `${s.id}${"n" in s ? s.n : ""}` : "")).join()}`;
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
        gunHtml = `<div class="cyl${this.reloading ? " re" : ""}">${holes}</div>`;
      } else {
        gunHtml = `<div class="shells${this.reloading ? " re" : ""}">${Array.from({ length: mag }, (_, i) => `<b class="${i < g.loaded ? "on" : ""}"></b>`).join("")}</div>`;
      }
      gunHtml = `<div class="gun">${gunHtml}<div class="spare">+${spare}<small>${ammo === "r38" ? ".38" : "12"}</small></div></div>`;
    }
    const tubes = Array.from({ length: STACKS.flare }, (_, i) => `<b class="${i < flares ? "on" : ""}"></b>`).join("");
    this.hud.innerHTML = `<div class="fl"><div class="tubes">${tubes}</div><div class="n">${flares}</div></div>${gunHtml}`;
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
.dk-arms .re{animation:dkspin .7s linear infinite;border-color:${AMBER}}
@keyframes dkspin{to{transform:rotate(60deg)}}
.dk-arms .shells{display:flex;gap:6px;padding:8px}
.dk-arms .shells b{width:14px;height:40px;border-radius:3px;background:rgba(255,255,255,.12)}
.dk-arms .shells b.on{background:linear-gradient(#b3302b 0 70%,#c9a24a 70%)}
.dk-arms .spare{font-weight:700;font-size:15px;text-align:center;text-shadow:0 1px 3px #000}
.dk-arms .spare small{display:block;font-size:11px;color:rgba(233,236,239,.6);font-weight:500}
.dk-arms .fl{text-align:center}
.dk-arms .fl .tubes{display:flex;gap:5px;justify-content:center;height:46px;align-items:flex-end}
.dk-arms .fl .tubes b{width:9px;height:42px;border-radius:5px;background:rgba(255,255,255,.12)}
.dk-arms .fl .tubes b.on{background:linear-gradient(#f4e2c2 0 6px,#c8322a 6px)}
.dk-arms .fl .n{font-weight:700;font-size:14px;margin-top:4px;text-shadow:0 1px 3px #000}
.dk-cross{position:fixed;left:50%;top:50%;width:20px;height:20px;margin:-10px 0 0 -10px;border:2px solid rgba(255,255,255,.75);border-radius:50%;pointer-events:none;box-shadow:0 0 3px rgba(0,0,0,.6);display:none}
.dk-cross.hit{border-color:#fff;transform:scale(1.25)}
.dk-cross.hit.spark{border-color:#9ec5ff}
.dk-cross.hit.killed{border-color:#ff5a4a;transform:scale(1.5)}
.dk-cross.hit.person{border-color:#ffb02e}
.dk-cross.hit.downed{border-color:#ff5a4a;transform:scale(1.5)}
`;
