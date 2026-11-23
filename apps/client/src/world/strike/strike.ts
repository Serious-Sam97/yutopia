// The Strike Park on the client (docs/plan/114-the-strike-park.md): the map standing drawn and solid (it
// follows the room's `strike.map`), the compound, the bots (Vortex in each team's kit: F9), the lobby's desk and
// the Map Board (the X prompts), the HUD while in the match (health, armor, money, the clock, the score, the kill
// feed, the radar, the charge), the buy grid (B: CS2's grid by role, F10), the scoreboard (Tab), use held
// (E: plant, defuse, a hostage), G drops the charge; dead, I watch a living teammate. Loaded near the park
// (car/cars.ts strikeFrame), a chunk of its own. The look is the HUD's own: ink in walnut frames (plan 45).

import type { ServerMessages } from "@yutopia/shared";
import { arenaChanged, groundAt } from "@yutopia/shared/grounds";
import {
  climateOf,
  gridOf,
  inRect,
  inStrikeArena,
  inStrikeCompound,
  isGun,
  type MatchEvent,
  MODES,
  type ModeId,
  nodeNear,
  nodePos,
  STRIKE_BOARD,
  STRIKE_DESK,
  STRIKE_HUB,
  STRIKE_KIT,
  STRIKE_PARK,
  STRIKE_YARD,
  setStrikeMap,
  shotThrough,
  speedWith,
  strikeDist,
  strikeMap,
  TEAMS,
  toLocal,
} from "@yutopia/shared/strike";
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
} from "three";
import { mixer } from "../audio";
import type { CarsHost } from "../car/cars";
import { hud, type StrikeMemberView, type StrikeView } from "../store";
import { kitReady, loadKit } from "../tp/kit-buildings";
import { type StandIn, Vortex3 } from "../tp/stand3d";
import type { ThirdPersonView } from "../tp/view";
import {
  type Built,
  buildCompound,
  buildKit,
  buildMap,
  buildProps,
  buildSign,
  chargeModel,
  crane,
  type hostageModel,
  joinDesk,
  kitCorner,
  kitPlan,
  loadProps,
  miniature,
  propsReady,
  warScreen,
} from "./arena3d";
import { strikeKeys } from "./flag";
import { radar } from "./radar";
import { Highlights, type Replay, type Who } from "./replay";
import { CALLS, RADIO, StrikeSound } from "./sound";
import { Tutorial } from "./tutorial";

/** How near the park this loads (m from the arena's middle), and draws the map. */
export const STRIKE_NEAR = 520;
const INK = "#f3ead8";
const WALNUT = "linear-gradient(180deg,#5a3a24,#3e2716)";
const FRAME = `background:${WALNUT};border:2px solid #2a1a0e;box-shadow:inset 0 0 0 1px #8a6440,0 4px 14px rgba(0,0,0,.45);color:${INK};font-family:Georgia,'Times New Roman',serif;border-radius:4px`;

// biome-ignore lint/suspicious/noExplicitAny: the room's decoded state
type Arena = any;

export class Strike {
  readonly root = new Group();
  private compound: (Built & { board: Mesh; screen: Mesh }) | null = null;
  private sign: ReturnType<typeof buildSign> | null = null;
  private mapBuilt: Built | null = null;
  private mapKey = "";
  private mapUp = true;
  private bots = new Map<string, Vortex3>();
  private offs: (() => void)[] = [];
  private hudEl: HTMLDivElement | null = null;
  private feed: { text: string; until: number; mine: boolean }[] = [];
  private banner = { text: "", until: 0 };
  private board = { tex: null as CanvasTexture | null, sig: "" };
  private screen = { tex: null as CanvasTexture | null, sig: "" };
  private scoreOpen = false;
  private using = false;
  private watch = "";
  private camNow: ThirdPersonView["gameCam"] = null;
  private flash = 0;
  private wasLocked = false;
  private rangeScore = 0;
  private rangeShots = 0;
  private war: ReturnType<typeof warScreen> | null = null;
  private warAt = 0;
  private warTex: CanvasTexture | null = null;
  private warCanvas: HTMLCanvasElement | null = null;
  private mini: Built | null = null;
  private miniKey = "";
  /** my card in the park (ranks.ts), as the server last sent it */
  private myCard = "";
  private corner: Awaited<ReturnType<typeof kitCorner>> | null = null;
  /** the join desk (rebuilt): its screen, its lamps, its ring */
  private desk: ReturnType<typeof joinDesk> | null = null;
  private deskAt = 0;
  private deskCanvas: HTMLCanvasElement | null = null;
  private deskTex: CanvasTexture | null = null;
  private cornerAsked = false;
  private disposed = false;
  private cardAsked = false;
  /** the first match's checklist (tutorial.ts, plan 115 phase 19) */
  private tut: Tutorial;
  /** (phase 97) my best round, kept as it's played; its replay when it's on */
  private hl = new Highlights();
  private replay: Replay | null = null;
  private replayCam: ThirdPersonView["gameCam"] = null;
  private wasIn = false;
  private pinned = false;
  private hitMark: { until: number; head: boolean } | null = null;
  private hurt = 0;
  /** how I died (plan 115 phase 94): the kill cam's first seconds look at who did it; the card while I'm out */
  private death: (ServerMessages["strike:death"] & { until: number; from: [number, number] }) | null = null;
  private ticks: { n: number; why: string; until: number }[] = [];
  private card: { team: "r" | "w"; why: string; mvp: string; mine: string; until: number } | null = null;
  private drawAt = 0;
  /** the park's own sounds (sound.ts), made once the mixer's up */
  private sound: StrikeSound | null = null;
  private keyAt = 0;
  private warmed = false;
  private crackleAt = 0;
  private radioOpen = false;
  /** Follow the match (F7): from the lobby, a teammate-less camera FOLLOW_DELAY behind */
  private following = false;
  private followId = "";
  private trails = new Map<string, { t: number; x: number; y: number; z: number; yaw: number }[]>();
  private followEl: HTMLDivElement | null = null;
  /** the swap's show: maps going down and the one coming up, the cranes, the crew */
  private leaving: { b: Built; t: number }[] = [];
  private rising: { b: Built; t: number } | null = null;
  private show3d: { g: Group; crew: Vortex3[]; mats: import("three").Material[] } | null = null;
  /** the charge and the hostages drawn */
  private chargeV: ReturnType<typeof chargeModel> | null = null;
  private hostV: ReturnType<typeof hostageModel>[] = [];
  /** the grenades drawn (id → its 3D), the grenade I'd throw next */
  private nadeViews = new Map<string, { kind: string; g: Group; puffs: Sprite[]; born: number }>();
  private nadeSel = 0;
  private bursts: { m: Mesh; t: number; life: number }[] = [];
  /** my camera in the match: CS's first person unless I've switched (K) */
  private view: "first" | "chase" = "first";

  constructor(private host: CarsHost) {
    this.tut = new Tutorial((t) => host.toast(t));
    (window as unknown as { __strike?: Strike; __strikeKeys?: typeof strikeKeys }).__strike = this;
    (window as unknown as { __strikeKeys?: typeof strikeKeys }).__strikeKeys = strikeKeys;
    const room = host.room();
    if (room) {
      this.offs.push(
        room.onMessage("strike:ev", (evs: ServerMessages["strike:ev"]) => this.events(evs)),
        room.onMessage("strike:why", (m: ServerMessages["strike:why"]) => host.toast(cap(m.why))),
        room.onMessage("strike:show", (m: ServerMessages["strike:show"]) => this.show(m)),
        room.onMessage("strike:shot", (m: ServerMessages["strike:shot"]) => this.botShot(m)),
        room.onMessage("strike:flash", (m: ServerMessages["strike:flash"]) => {
          this.flash = Math.max(this.flash, m.secs);
          this.sound?.ring(m.secs);
        }),
        room.onMessage("strike:radio", (m: ServerMessages["strike:radio"]) => {
          const name = String(this.arena()?.members.get(m.by)?.name ?? "someone");
          // (a bot's own words — plan 117 — or a menu line)
          const line = m.text ?? RADIO[m.i] ?? "";
          this.feed.push({
            text: `${esc(name)} (radio): ${esc(line)}`,
            until: performance.now() + 5000,
            mine: m.by === this.myId(),
          });
          this.sound?.say(line, true);
        }),
        room.onMessage("strike:boom", (m: ServerMessages["strike:boom"]) => this.boom(m)),
        // (plan 115 phase 95) hit feedback: my hits marked at the crosshair; struck, the screen's edge goes red
        room.onMessage("arms:hit", (m: { kind?: string; head?: boolean }) => {
          if (!this.playing() || m.kind !== "person") return;
          this.tut.tick("hit");
          this.hitMark = { until: performance.now() + 180, head: !!m.head };
        }),
        room.onMessage("dark:hit", (m: { n?: number }) => {
          if (!this.playing()) return;
          this.hurt = Math.min(1, this.hurt + Math.max(0.25, Number(m.n ?? 20) / 60));
        }),
        // (plan 115 phase 47) the lobby range: each hit scored, a running total this visit
        room.onMessage("strike:target", (m: ServerMessages["strike:target"]) => {
          this.rangeScore += m.ring;
          this.tut.tick("hit");
          this.rangeShots++;
          host.toast(`Target ${m.i + 1} · ring ${m.ring} · ${m.m} m — ${this.rangeScore} in ${this.rangeShots}`);
        }),
        // (plan 115 phases 96–97) my card: after a match, what it gave me
        room.onMessage("strike:card", (m: ServerMessages["strike:card"]) => {
          this.myCard = m.card;
          try {
            const k = (JSON.parse(m.card) as { kit?: string }).kit;
            if (k && !strikeKeys.myKit) strikeKeys.myKit = k;
          } catch {}
          if (m.xp) {
            const parts = [`+${m.xp} XP`];
            if (m.missions?.length) parts.push(`missions done: ${m.missions.join(", ")}`);
            if (m.rankUp) parts.push(`promoted to ${m.rankUp}!`);
            host.toast(parts.join(" · "));
          }
          const a = this.arena();
          if (a) this.snapshot(a);
        }),
        room.onMessage("strike:death", (m: ServerMessages["strike:death"]) => {
          const p = this.host.me();
          this.death = { ...m, until: performance.now() + 2600, from: [p.x, p.y] };
        }),
      );
    }
  }

  private arena(): Arena | null {
    return (this.host.room()?.state as { strike?: Arena } | undefined)?.strike ?? null;
  }
  private myId(): string {
    return (this.host.room() as { sessionId?: string } | null)?.sessionId ?? "";
  }
  private mine(): Arena | null {
    return this.arena()?.members?.get(this.myId()) ?? null;
  }
  /** In the match (alive or watching). */
  playing(): boolean {
    return !!this.mine();
  }

  // ── each frame ──
  frame(dt: number) {
    const a = this.arena();
    const tp = this.host.tp();
    if (!a || !tp) return;
    if (this.root.parent !== tp.scene) tp.scene.add(this.root);
    if (!this.sound && mixer.ctx)
      this.sound = new StrikeSound(
        mixer.ctx,
        mixer.buses.effects,
        () => {
          const c = tp.camera;
          const d = c.getWorldDirection(new Vector3());
          return { x: c.position.x, z: c.position.z, yaw: Math.atan2(d.z, d.x) };
        },
        // (phase 91) the map's walls between my ear and the sound, both in the arena
        (x, z) => {
          if (!this.mapUp) return 0;
          const c = tp.camera.position;
          if (!inStrikeArena(c.x, c.z, 2) || !inStrikeArena(x, z, 2)) return 0;
          const [ex, ez] = toLocal(c.x, c.z);
          const [sx, sz] = toLocal(x, z);
          return shotThrough(strikeMap(this.mapKey), [ex, 1.5, ez], [sx, 1.4, sz]).walls;
        },
      );
    if (this.sound && !this.warmed) {
      this.warmed = true;
      this.sound.warm();
    }
    this.stepSounds(a);
    // (phase 97) the best round playing back
    if (this.replay) {
      this.replayCam = this.replay.frame(dt);
      if (this.replay.done) {
        this.replay = null;
        this.replayCam = null;
      }
    }
    // the beds: the lobby's talk, the map's weather (phases 53, 93)
    if (this.sound) {
      const c = tp.camera.position;
      const d = strikeDist(c.x, c.z);
      // (my card asked for once I'm near the park)
      if (!this.cardAsked && d < 140) {
        this.cardAsked = true;
        this.host.room()?.send("strike:card", {});
      }
      if (d > 140) this.sound.hush();
      else {
        const inArena = this.mapUp && inStrikeArena(c.x, c.z, 0);
        const cl = inArena ? climateOf(this.mapKey) : null;
        const crowd = inArena
          ? 0
          : Math.max(0, 1 - Math.hypot(c.x - STRIKE_HUB.x, c.z - STRIKE_HUB.z) / 70) *
            (inStrikeCompound(c.x, c.z) ? 1 : 0.4);
        this.sound.beds2(
          crowd,
          cl ? 0.3 + cl.wind : 0,
          cl ? cl.rain : 0,
          inArena ? null : { x: -364, z: STRIKE_YARD.z1 - 9.3 },
        );
      }
    }
    // the map standing: the shared state (solids: the physics' chunks made again) and the 3D
    const key = String(a.map ?? "sawmill");
    const up = a.up !== false;
    if (key !== this.mapKey || up !== this.mapUp) {
      const first = this.mapKey === "";
      this.mapKey = key;
      this.mapUp = up;
      if (setStrikeMap(key, up)) arenaChanged();
      // (the old one sinks into the ground — the show — unless this is the first I've seen of it)
      if (this.mapBuilt) {
        if (first) this.mapBuilt.dispose();
        else this.leaving.push({ b: this.mapBuilt, t: 0 });
      }
      this.mapBuilt = null;
      if (up) {
        this.mapBuilt = this.makeMap(key);
        this.root.add(this.mapBuilt.root);
        if (!first) {
          this.rising = { b: this.mapBuilt, t: 0 };
          this.mapBuilt.root.position.y = -SINK;
        }
      }
    }
    // (the buildings' kit in since the map went up plain: up again, dressed)
    if (this.mapBuilt && !this.dressed && kitReady() && propsReady() && !this.rising) {
      const b = this.mapBuilt;
      this.mapBuilt = this.makeMap(this.mapKey);
      this.root.add(this.mapBuilt.root);
      b.dispose();
    }
    this.stepShow(dt, a);
    this.drawCharge(a);
    this.drawHostages(a);
    if (!this.compound) {
      this.compound = buildCompound();
      this.root.add(this.compound.root);
    }
    // (plan 115 phase 55) the customization corner: made once; its mirror live only with someone near; my kit tried on
    // in the mirror while I stand there (out of the match)
    if (!this.cornerAsked) {
      this.cornerAsked = true;
      void kitCorner().then((c) => {
        if (this.disposed) return c.dispose();
        this.corner = c;
        this.root.add(c.root);
      });
    }
    {
      const c = tp.camera.position;
      const near = Math.hypot(c.x - STRIKE_KIT.x, c.z - STRIKE_KIT.z) < 10;
      if (this.corner?.mirror) this.corner.mirror.visible = near;
      const me0 = this.host.me();
      const at = Math.hypot(me0.x - STRIKE_KIT.stand.x, me0.y - STRIKE_KIT.stand.z) < 4.5 && !this.playing();
      if (at && !strikeKeys.kitTry) strikeKeys.kitTry = "r";
      if (!at && strikeKeys.kitTry) strikeKeys.kitTry = null;
    }
    // the join desk: who's in on its screen, each side's lamp lit by its count, the ring bright while I'm in it
    if (!this.desk) {
      this.desk = joinDesk();
      this.root.add(this.desk.root);
    }
    {
      const c = tp.camera.position;
      const now = performance.now();
      const ms = [...(a.members as Map<string, Arena>).values()];
      for (const t of ["r", "w"] as const) {
        const n = ms.filter((m) => m.team === t && !m.bot).length;
        const mine = this.mine()?.team === t;
        this.desk.lamp[t].emissiveIntensity =
          0.15 + Math.min(1, n / 4) * 1.1 + (mine ? 0.35 + 0.35 * Math.sin(now / 260) : 0);
      }
      const me0 = this.host.me();
      const inRing = Math.hypot(me0.x - STRIKE_DESK.x, me0.y - STRIKE_DESK.z) < 3;
      this.desk.ring.opacity = inRing ? 0.75 + 0.2 * Math.sin(now / 200) : 0.45;
      if (now - this.deskAt > 500 && Math.hypot(c.x - STRIKE_DESK.x, c.z - STRIKE_DESK.z) < 30) {
        this.deskAt = now;
        this.drawDesk(a);
      }
    }
    // the war room's screen: the live score and the radar, twice a second (plan 115 phase 48)
    if (!this.war) {
      this.war = warScreen();
      this.root.add(this.war.root);
    }
    if (
      performance.now() - this.warAt > 500 &&
      tp.camera.position.distanceTo(this.war.screen.getWorldPosition(new Vector3())) < 40
    ) {
      this.warAt = performance.now();
      this.drawWar(a);
    }
    // the briefing hall's miniature of the map standing (phase 54)
    if (this.miniKey !== `${this.mapKey}|${this.mapUp}`) {
      this.miniKey = `${this.mapKey}|${this.mapUp}`;
      this.mini?.dispose();
      this.mini = this.mapUp ? miniature(strikeMap(this.mapKey)) : null;
      if (this.mini) this.root.add(this.mini.root);
    }
    if (!this.sign) {
      this.sign = buildSign((x, z) => groundAt(x, z));
      this.root.add(this.sign.root);
    }
    // the floodlights after dark (the park's surfaces lit from within, as the floods would: no lights to pay for)
    const lit = Math.min(1, this.host.night() * 1.4);
    tp.parkFlood = lit;
    this.mapBuilt?.lit(lit);
    this.compound.lit(lit);
    this.sign?.light(lit);
    this.drawBoard(a);
    this.drawScreen(a);
    this.drawBots(a, tp);
    this.drawNades(a, dt);
    this.drawHud(a);
    this.snapshot(a);
    // the Esc menu (plan 115 phase 4): in the match, the pointer let go (Esc) with no menu open → the match's menu
    const locked = !!document.pointerLockElement;
    if (this.wasLocked && !locked && this.playing() && !hud.get().panel.kind) this.openPanel("strike-esc");
    this.wasLocked = locked;
    this.record(a);
    if (this.following) this.follow(a);
    else this.spectate(a, tp);
    strikeKeys.playing = this.playing();
    strikeKeys.digits = this.playing() && (!!a.voteTo || this.radioOpen);
    strikeKeys.holding = this.using && this.playing();
    strikeKeys.carrying = this.playing() && Number(this.mine()?.carry ?? -1) >= 0;
    tp.centred = this.playing();
    // (F3b) the map's own climate while I'm in the arena (its sky, hour, weather, ground)
    const me0 = this.host.me();
    strikeKeys.climate =
      this.mapUp && this.host.level() === 0 && inStrikeArena(me0.x, me0.y, -3) ? climateOf(this.mapKey) : null;
    strikeKeys.view = this.playing() && this.mine()?.alive && a.phase !== "idle" ? this.view : null;
    // (plan 115 phase 21) in the match the gun's always in hand: nothing drawn (just lent, just bought, respawned) →
    // the first gun drawn (the primary, else the pistol: quick slot 0) — unless the knife's out (slot 3)
    const plk = this.host.room()?.state.players.get(this.myId()) as { held?: string } | undefined;
    strikeKeys.knife = this.playing() && plk?.held === "knife";
    if (this.playing() && this.mine()?.alive && a.phase !== "idle" && !strikeKeys.knife) {
      const pl = this.host.room()?.state.players.get(this.myId()) as { gun?: string } | undefined;
      const now = performance.now();
      if (pl && !pl.gun && now - this.drawAt > 900) {
        this.drawAt = now;
        this.host.room()?.send("arms:draw", { slot: 0 });
      }
    }
    // CS's run by the gun in my hand (walker.ts takes it: S-M1)
    const gun = String(this.host.room()?.state.players.get(this.myId())?.gun ?? "");
    strikeKeys.speed = this.playing() ? speedWith(isGun(gun) ? gun : null) : 0;
    strikeKeys.use = this.playing() && this.canUseHere();
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt);
    if (this.hurt > 0) this.hurt = Math.max(0, this.hurt - dt * 1.6);
  }

  // ── the bots: Vortex in his team's tint, where the server has him ──
  private drawBots(_a: Arena, _tp: ThirdPersonView) {
    // (plan 115 phase 84: the bots are the world's people — room NPCs drawn by grounds-life.ts strikeBot, their guns in
    // their hands; the flat Vortex drawings stay only for the swap's crew)
    for (const [id, v] of this.bots) {
      v.root.removeFromParent();
      this.bots.delete(id);
    }
  }

  // ── the Map Board's face: the map standing (or going up), its radar, the next ──
  private drawBoard(a: Arena) {
    if (!this.compound) return;
    const key = String(a.next || a.map);
    const sig = `${key}|${a.up}|${a.phase}`;
    if (sig === this.board.sig) return;
    this.board.sig = sig;
    const c = document.createElement("canvas");
    c.width = 640;
    c.height = 384;
    const g = c.getContext("2d") as CanvasRenderingContext2D;
    g.fillStyle = "#1d1611";
    g.fillRect(0, 0, 640, 384);
    const map = strikeMap(key);
    g.fillStyle = INK;
    g.font = "bold 34px Georgia";
    g.fillText(map.name.toUpperCase(), 24, 48);
    g.font = "18px Georgia";
    g.fillStyle = "#d9c7a4";
    g.fillText(a.up ? `${modeName(map.mode)} · ${map.plays}` : "THE CREW IS PUTTING IT UP…", 24, 76);
    radar(g, map, 300, 92, 320, 280);
    g.font = "15px Georgia";
    g.fillStyle = INK;
    wrap(g, map.blurb, 24, 120, 260, 20);
    g.fillStyle = "#d9a066";
    g.fillText("X  CHOOSE THE MAP", 24, 360);
    this.board.tex?.dispose();
    this.board.tex = new CanvasTexture(c);
    this.board.tex.colorSpace = SRGBColorSpace;
    const mat = this.compound.board.material as MeshBasicMaterial;
    mat.map = this.board.tex;
    mat.needsUpdate = true;
  }
  // ── the big screen over the gate: the score, the clock, the map ──
  private drawScreen(a: Arena) {
    if (!this.compound) return;
    const sig = `${a.map}|${a.phase}|${a.scoreA}|${a.scoreB}|${Math.ceil(Number(a.left))}|${a.charge}`;
    if (sig === this.screen.sig) return;
    this.screen.sig = sig;
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 280;
    const g = c.getContext("2d") as CanvasRenderingContext2D;
    g.fillStyle = "#0d0f10";
    g.fillRect(0, 0, 512, 280);
    g.textAlign = "center";
    g.fillStyle = "#ffb347";
    g.font = "bold 30px monospace";
    g.fillText(`STRIKE PARK · ${strikeMap(String(a.map)).name.toUpperCase()}`, 256, 46);
    if (a.phase === "idle") {
      g.fillStyle = "#cfd6dc";
      g.font = "24px monospace";
      g.fillText("WALK IN · JOIN AT THE DESK", 256, 150);
    } else {
      const sw = !!a.swapped;
      const [ra, wa] = sw ? [a.scoreB, a.scoreA] : [a.scoreA, a.scoreB];
      g.font = "bold 92px monospace";
      g.fillStyle = "#d9a066";
      g.fillText(String(ra), 140, 170);
      g.fillStyle = "#7fa6c9";
      g.fillText(String(wa), 372, 170);
      g.font = "20px monospace";
      g.fillStyle = "#d9a066";
      g.fillText(TEAMS.r.name.toUpperCase(), 140, 206);
      g.fillStyle = "#7fa6c9";
      g.fillText(TEAMS.w.name.toUpperCase(), 372, 206);
      g.fillStyle = "#cfd6dc";
      g.font = "bold 34px monospace";
      g.fillText(clock(Number(a.left)), 256, 150);
      g.font = "18px monospace";
      g.fillText(a.charge === "planted" ? "CHARGE PLANTED" : `ROUND ${a.round}`, 256, 250);
    }
    this.screen.tex?.dispose();
    this.screen.tex = new CanvasTexture(c);
    this.screen.tex.colorSpace = SRGBColorSpace;
    const mat = this.compound.screen.material as MeshBasicMaterial;
    mat.map = this.screen.tex;
    mat.needsUpdate = true;
  }

  // ── the HUD ──
  private drawHud(a: Arena) {
    const me = this.mine();
    if (!!me !== this.wasIn) {
      this.wasIn = !!me;
      if (me) {
        this.tut.joined();
        // (joined: said loud — the side, and a tick from the desk)
        this.say(`YOU JOINED THE ${TEAMS[me.team as "r" | "w"].name.toUpperCase()}`, 2.6);
        this.sound?.key();
        this.deskAt = 0;
      }
    }
    if (!me) this.tut.hide();
    if (!me) {
      this.hudEl?.remove();
      this.hudEl = null;
      if (this.panelOpen("strike-buy") || this.panelOpen("strike-esc")) this.closePanel();
      return;
    }
    // (a menu of the park's up: the match's HUD out of its way)
    const menu = String(hud.get().panel.kind ?? "").startsWith("strike");
    if (this.hudEl) this.hudEl.style.display = menu ? "none" : "";
    if (!this.hudEl) {
      this.hudEl = document.createElement("div");
      this.hudEl.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:40;";
      document.body.appendChild(this.hudEl);
    }
    // (the tutorial's checklist: what I do, ticked)
    if (this.tut.on) {
      const p = this.host.room()?.state.players.get(this.myId());
      if (p && me.alive) {
        this.tut.show();
        this.tut.frame(
          p.x,
          p.y,
          Number(me.money),
          String(me.nades ?? ""),
          !!strikeMap(this.mapKey).sites,
          String(p.gun ?? ""),
          strikeKeys.crouched,
          document.body,
        );
      }
      if (menu) this.tut.hide();
    }
    const now = performance.now();
    this.feed = this.feed.filter((f) => f.until > now);
    this.ticks = this.ticks.filter((t) => t.until > now);
    const team = me.team as "r" | "w";
    const sw = !!a.swapped;
    const [ra, wa] = sw ? [a.scoreB, a.scoreA] : [a.scoreA, a.scoreB];
    const alive = (t: "r" | "w") => [...(a.members as Map<string, Arena>).values()].filter((m) => m.team === t);
    const pips = (t: "r" | "w") =>
      alive(t)
        .map(
          (m) =>
            `<i style="display:inline-block;width:7px;height:14px;margin:0 1.5px;border-radius:1px;background:${m.alive ? (t === "r" ? AMBER : STEEL) : "rgba(233,220,192,.18)"}"></i>`,
        )
        .join("");
    const clockText =
      a.phase === "warmup"
        ? `WARMUP ${clock(Number(a.left))}`
        : a.phase === "freeze"
          ? `BUY ${Math.ceil(Number(a.left))}`
          : a.phase === "planted"
            ? "CHARGE"
            : a.phase === "half"
              ? "HALF TIME"
              : a.phase === "over"
                ? "FINAL"
                : clock(Number(a.left));
    const planted = a.phase === "planted";
    const feed = this.feed
      .map(
        (f) =>
          `<div style="${TAG};padding:4px 10px;margin-bottom:4px;font-size:13px;${f.mine ? `box-shadow:inset 0 0 0 1px ${AMBER}` : ""}">${f.text}</div>`,
      )
      .join("");
    const gun = String(this.host.room()?.state.players.get(this.myId())?.gun ?? "");
    const mag = gun ? (this.host.loaded?.(gun) ?? 0) : 0;
    const reserve = gun ? this.host.items(AMMO[gun] ?? "") : 0;
    const nades = String(me.nades || "")
      .split(",")
      .filter(Boolean);
    const sel = nades[this.nadeSel % Math.max(1, nades.length)];
    const slot = (k: string, name: string, on: boolean) =>
      `<span style="display:inline-flex;align-items:center;gap:5px;margin-left:10px;opacity:${on ? 1 : 0.55}"><b style="${KEY}">${k}</b>${name}</span>`;
    const hpCol = me.hp <= 25 ? "#e06a52" : "#f3ead8";
    const bar = (v: number, col: string) =>
      `<div style="width:150px;height:5px;background:rgba(233,220,192,.15);border-radius:2px;overflow:hidden;margin-top:4px"><div style="width:${Math.max(0, Math.min(100, v))}%;height:100%;background:${col}"></div></div>`;
    const ticks = this.ticks
      .map(
        (t) =>
          `<div style="color:${t.n >= 0 ? "#9cc46a" : "#e06a52"};font-size:14px">${t.n >= 0 ? "+" : "−"}$${Math.abs(t.n)} <span style="opacity:.7">${t.why}</span></div>`,
      )
      .join("");
    const card = this.card && this.card.until > now ? this.card : null;
    const dead = !me.alive && a.phase !== "warmup";
    const html = `
<div style="position:absolute;top:12px;left:50%;transform:translateX(-50%);display:flex;align-items:stretch;gap:0;${PLATE}">
  <div style="padding:6px 14px;text-align:center;background:linear-gradient(180deg,#f0b752,${AMBER});color:#1b1d1a"><div style="${STENCIL};font-size:26px;line-height:1">${ra}</div><div style="${STENCIL};font-size:10px;letter-spacing:.2em">RAIDERS</div></div>
  <div style="padding:6px 16px;min-width:120px;text-align:center"><div style="${STENCIL};font-size:24px;line-height:1.05;color:${planted ? "#e06a52" : "#f3ead8"}">${clockText}</div><div style="margin-top:3px">${pips("r")}<span style="display:inline-block;width:10px"></span>${pips("w")}</div></div>
  <div style="padding:6px 14px;text-align:center;background:linear-gradient(180deg,#8fbddc,${STEEL});color:#081521"><div style="${STENCIL};font-size:26px;line-height:1">${wa}</div><div style="${STENCIL};font-size:10px;letter-spacing:.2em">WARDENS</div></div>
</div>
<div style="position:absolute;top:84px;right:14px;max-width:380px;text-align:right">${feed}</div>
<div style="position:absolute;left:14px;top:92px">${this.radarHtml(a)}<div style="${TAG};margin-top:6px;padding:4px 10px;font-size:12px;display:inline-block"><b style="${KEY}">ESC</b> the match menu · leave</div></div>
<div style="position:absolute;left:14px;bottom:74px;${PLATE};padding:10px 14px;min-width:190px">
  <div style="display:flex;align-items:baseline;gap:14px">
    <div><div style="${STENCIL};font-size:11px;letter-spacing:.2em;opacity:.7">HEALTH</div><div style="${STENCIL};font-size:34px;line-height:1;color:${hpCol}">${me.alive ? me.hp : 0}</div></div>
    <div><div style="${STENCIL};font-size:11px;letter-spacing:.2em;opacity:.7">ARMOR${me.helmet ? " +H" : ""}</div><div style="${STENCIL};font-size:24px;line-height:1">${me.armor}</div></div>
    <div style="margin-left:auto;text-align:right"><div style="${STENCIL};font-size:11px;letter-spacing:.2em;opacity:.7">MONEY</div><div style="${STENCIL};font-size:22px;line-height:1;color:#9cc46a">$${me.money}</div></div>
  </div>
  ${bar(me.alive ? me.hp : 0, hpCol)}${bar(me.armor, STEEL)}
  ${me.bomb ? `<div style="margin-top:6px;font-size:13px;color:#e8a33a">◉ YOU CARRY THE CHARGE · hold E on a site</div>` : ""}
  ${me.kit ? `<div style="margin-top:4px;font-size:12px;opacity:.8">Defuse kit</div>` : ""}
</div>
<div style="position:absolute;left:220px;bottom:96px">${ticks}</div>
<div style="position:absolute;right:14px;bottom:124px;${PLATE};padding:10px 16px;text-align:right;min-width:200px">
  <div style="${STENCIL};font-size:13px;letter-spacing:.16em;color:${team === "r" ? AMBER : STEEL}">${gunName(gun) || "—"}</div>
  <div style="${STENCIL};line-height:1"><span style="font-size:40px">${gun ? mag : "–"}</span><span style="font-size:18px;opacity:.65"> / ${gun ? reserve : "–"}</span></div>
  <div style="margin-top:6px;font-size:12px">${me.primary ? slot("1", gunName(me.primary), gun === me.primary) : ""}${me.pistol ? slot("2", gunName(me.pistol), gun === me.pistol) : ""}${slot("3", "Knife", strikeKeys.knife)}</div>
  ${nades.length ? `<div style="margin-top:4px;font-size:12px">${nades.map((n) => `<span style="margin-left:8px;${n === sel ? `color:${AMBER}` : "opacity:.6"}">${shortNade(n)}</span>`).join("")} <span style="opacity:.6">· 4 picks · hold J, let go</span></div>` : ""}
</div>
${planted ? `<div style="position:absolute;top:84px;left:50%;transform:translateX(-50%);${TAG};padding:5px 14px;font-size:14px;color:#e06a52;${STENCIL}">THE CHARGE IS DOWN · SITE ${a.site}</div>` : ""}
${this.banner.until > now ? `<div style="position:absolute;top:28%;left:50%;transform:translateX(-50%);${PLATE};padding:12px 30px;${STENCIL};font-size:28px;letter-spacing:.1em">${this.banner.text}</div>` : ""}
${card ? this.cardHtml(card) : ""}
${a.phase === "over" ? this.endHtml(a) : ""}
${a.phase === "warmup" ? this.warmupHtml(a) : ""}
${a.phase === "half" ? `<div style="position:absolute;top:24%;left:50%;transform:translateX(-50%);${PLATE};min-width:420px;text-align:center;overflow:hidden"><div style="padding:12px 20px;background:#2b302d;${STENCIL};font-size:30px;letter-spacing:.12em">HALF TIME</div><div style="padding:12px 20px;font-size:16px">The sides swap — you're the <b style="color:${team === "r" ? AMBER : STEEL}">${TEAMS[team].name}</b> now. Your money starts again.</div></div>` : ""}
${dead ? `<div style="position:absolute;bottom:84px;left:50%;transform:translateX(-50%);${PLATE};padding:8px 18px;font-size:15px">YOU'RE OUT · WATCHING <b>${esc(this.watchName(a))}</b> · back next round</div>` : ""}
${dead && this.death ? this.deathHtml(this.death) : ""}
${a.charge === "planted" && a.defuser === this.myId() ? `<div style="position:absolute;top:58%;left:50%;transform:translateX(-50%);${PLATE};padding:8px 14px;width:240px"><div style="${STENCIL};font-size:13px;letter-spacing:.14em">DEFUSING</div>${bar(100 - (Number(a.defuseLeft) / (me.kit ? 5 : 10)) * 100, AMBER)}</div>` : ""}
${a.charge === "planting" && me.bomb ? `<div style="position:absolute;top:58%;left:50%;transform:translateX(-50%);${PLATE};padding:8px 14px;width:240px"><div style="${STENCIL};font-size:13px;letter-spacing:.14em">PLANTING</div></div>` : ""}
${this.scoreOpen ? this.scoreHtml(a) : ""}
${this.radioOpen ? `<div style="position:absolute;left:14px;top:330px;${PLATE};padding:8px 14px;font-size:14px"><div style="${STENCIL};font-size:12px;letter-spacing:.2em;color:${AMBER}">RADIO</div>${RADIO.map((l, i) => `<div><b style="${KEY}">${(i + 1) % 10}</b> ${l}</div>`).join("")}</div>` : ""}
<div style="position:absolute;inset:0;background:#fff;opacity:${Math.min(1, this.flash).toFixed(2)}"></div>
${this.hurt > 0.02 ? `<div style="position:absolute;inset:0;box-shadow:inset 0 0 ${Math.round(120 * this.hurt)}px ${Math.round(40 * this.hurt)}px rgba(190,30,20,${(0.55 * this.hurt).toFixed(2)})"></div>` : ""}
${this.hitMark && this.hitMark.until > now ? hitMarker(this.hitMark.head) : ""}
${dead || (this.host.tp()?.handsAds ?? 0) > 0.5 || (this.host.tp()?.scopeK ?? 0) > 0.5 ? "" : crosshair()}`;
    if (this.hudEl.innerHTML !== html) this.hudEl.innerHTML = html;
  }
  /** The map vote (phase 13): three maps, their votes, mine; 1–3. */
  private voteHtml(a: Arena): string {
    const keys = String(a.vote ?? "")
      .split(",")
      .filter(Boolean);
    let votes: Record<string, string> = {};
    try {
      votes = a.votes ? JSON.parse(String(a.votes)) : {};
    } catch {
      votes = {};
    }
    const mine = votes[this.myId()];
    const left = Math.max(0, Math.ceil((Number(a.voteTo) - Date.now()) / 1000));
    return `<div style="padding:8px 18px 4px"><div style="${STENCIL};font-size:13px;letter-spacing:.2em;color:${AMBER}">VOTE THE NEXT MAP · ${left}s</div>
  <div style="display:flex;gap:10px;justify-content:center;margin-top:8px">${keys
    .map((k, i) => {
      const n = Object.values(votes).filter((x) => x === k).length;
      return `<div style="padding:8px 14px;border:1px solid ${mine === k ? AMBER : "rgba(233,220,192,.2)"};border-radius:3px;min-width:140px"><div><b style="${KEY}">${i + 1}</b> <span style="${STENCIL};font-size:18px">${esc(strikeMap(k).name)}</span></div><div style="font-size:12px;opacity:.75">${climateOf(k).name} · ${n} vote${n === 1 ? "" : "s"}</div></div>`;
    })
    .join("")}</div></div>`;
  }
  /** The warmup's board (plan 115 phase 14): who's ready; F3. */
  private warmupHtml(a: Arena): string {
    const ready = new Set(
      String(a.ready ?? "")
        .split(",")
        .filter(Boolean),
    );
    const people = [...(a.members as Map<string, Arena>).entries()].filter(([, m]) => !m.bot);
    const mine = ready.has(this.myId());
    return `<div style="position:absolute;left:14px;top:340px;${PLATE};padding:10px 14px;min-width:200px">
  <div style="${STENCIL};font-size:13px;letter-spacing:.2em;color:${AMBER}">WARMUP</div>
  <div style="font-size:13px;margin:4px 0 6px">Free buys, respawns. Ready <b>${ready.size}/${people.length}</b></div>
  ${people.map(([id, m]) => `<div style="font-size:13px">${ready.has(id) ? "✔" : "·"} ${esc(m.name)}</div>`).join("")}
  <div style="margin-top:8px;font-size:12px"><b style="${KEY}">F3</b> ${mine ? "not ready" : "I'm ready"}</div>
</div>`;
  }
  /** The match's end (plan 115 phase 18): who took it, the MVP, both teams' boards; how to go again or leave. */
  private endHtml(a: Arena): string {
    const sw = !!a.swapped;
    const [ra, wa] = sw ? [a.scoreB, a.scoreA] : [a.scoreA, a.scoreB];
    const win: "r" | "w" | "" = ra > wa ? "r" : wa > ra ? "w" : "";
    const all = [...(a.members as Map<string, Arena>).values()];
    const mvp = [...all].sort((x, y) => y.mvps - x.mvps || y.kills - x.kills)[0];
    const me = this.mine();
    const meWon = me && win && me.team === win;
    const col = win === "r" ? AMBER : win === "w" ? STEEL : "#e9dcc0";
    return `<div style="position:absolute;inset:0;background:rgba(8,10,9,.62);display:flex;align-items:center;justify-content:center">
<div style="${PLATE};min-width:620px;overflow:hidden;text-align:center">
  <div style="padding:16px 24px;background:${col};color:${win === "w" ? "#081521" : "#1b1d1a"}"><div style="${STENCIL};font-size:14px;letter-spacing:.3em">${meWon ? "VICTORY" : win ? "DEFEAT" : "A DRAW"}</div><div style="${STENCIL};font-size:42px;letter-spacing:.08em">${win ? `${TEAMS[win].name.toUpperCase()} TAKE THE MATCH` : "THE MATCH IS SHARED"}</div><div style="${STENCIL};font-size:30px">${ra} – ${wa}</div></div>
  ${mvp ? `<div style="padding:12px 20px;font-size:16px"><span style="${STENCIL};color:${AMBER};letter-spacing:.16em">MATCH MVP</span> &nbsp;<b>${esc(mvp.name)}</b> · ${mvp.kills} kills · ${mvp.mvps} round MVPs</div>` : ""}
  <div style="padding:0 18px 12px;text-align:left">${this.scoreHtml(a).replace(/position:absolute;top:14%;left:50%;transform:translateX\(-50%\);/, "")}</div>
  ${a.voteTo ? this.voteHtml(a) : ""}
  <div style="padding:10px 20px 16px;font-size:14px;opacity:.85">${a.voteTo ? "The next match starts on the map with the most votes" : "The next one's being set up"} · <b style="${KEY}">ESC</b> leaves${this.hl.best ? ` · <b style="${KEY}">H</b> watch your best round` : ""}</div>
</div></div>`;
  }
  /** Killed: by whom, with what, their health left; my round's damage to and from each. */
  private deathHtml(d: ServerMessages["strike:death"]): string {
    const rows = d.report
      .map(
        (r) =>
          `<tr><td>${esc(r.name)}</td><td style="text-align:right;color:#9cc46a">${r.dealt}</td><td style="text-align:right;color:#e06a52">${r.taken}</td></tr>`,
      )
      .join("");
    return `<div style="position:absolute;top:24%;left:50%;transform:translateX(-50%);${PLATE};min-width:340px;overflow:hidden">
  <div style="padding:10px 16px;background:#3a1c16"><span style="${STENCIL};letter-spacing:.14em;color:#e06a52">KILLED BY</span> <b style="font-size:18px">${esc(d.name || "the fall")}</b></div>
  <div style="padding:8px 16px;font-size:14px">${gunName(d.gun)}${d.head ? " · a headshot" : ""}${d.name ? ` · they had <b>${d.hp}</b> health left` : ""}</div>
  ${rows ? `<table style="width:100%;font-size:13px;border-top:1px solid rgba(233,220,192,.14)"><tr style="opacity:.6;font-size:11px;letter-spacing:.12em"><td style="padding:6px 16px">THIS ROUND</td><td style="text-align:right">GIVEN</td><td style="text-align:right;padding-right:16px">TAKEN</td></tr>${rows.replace(/<td>/g, '<td style="padding:4px 16px">').replace(/<\/tr>/g, "</tr>")}</table>` : ""}
</div>`;
  }
  /** The round-end card: who won and how, the MVP and why, my round, the money next. */
  private cardHtml(c: { team: "r" | "w"; why: string; mvp: string; mine: string }): string {
    const col = c.team === "r" ? AMBER : STEEL;
    return `<div style="position:absolute;top:22%;left:50%;transform:translateX(-50%);${PLATE};min-width:420px;text-align:center;overflow:hidden">
  <div style="background:${col};color:${c.team === "r" ? "#1b1d1a" : "#081521"};padding:10px 20px;${STENCIL};font-size:30px;letter-spacing:.12em">${TEAMS[c.team].name.toUpperCase()} WIN THE ROUND</div>
  <div style="padding:10px 20px;font-size:15px">${c.why}</div>
  ${c.mvp ? `<div style="padding:0 20px 10px;font-size:14px"><span style="${STENCIL};color:${AMBER};letter-spacing:.14em">MVP</span> ${c.mvp}</div>` : ""}
  ${c.mine ? `<div style="padding:8px 20px;border-top:1px solid rgba(233,220,192,.14);font-size:13px;opacity:.85">${c.mine}</div>` : ""}
</div>`;
  }
  private watchName(a: Arena): string {
    return String(a.members.get(this.watch)?.name ?? "—");
  }
  /** The radar (plan 115 phases 35, 80): the map's picture drawn once (radar.ts, its climate's ground, its places'
   *  names) and kept; my teammates, the charge, as markers over it — nothing re-encoded a frame. */
  private radarPic = { key: "", url: "" };
  private radarHtml(a: Arena): string {
    const map = strikeMap(String(a.map));
    const SZ = 190;
    if (this.radarPic.key !== map.key) {
      const c = document.createElement("canvas");
      c.width = c.height = SZ * 2;
      radar(c.getContext("2d") as CanvasRenderingContext2D, map, 0, 0, SZ * 2, SZ * 2, true);
      this.radarPic = { key: map.key, url: c.toDataURL() };
    }
    const me = this.mine();
    const team = me?.team;
    const S = map.size;
    const k = SZ / Math.max(S.x1 - S.x0, S.z1 - S.z0);
    const marks: string[] = [];
    const dot = (x: number, z: number, col: string, r: number, ring = false) =>
      marks.push(
        `<i style="position:absolute;left:${Math.round((x - S.x0) * k - r)}px;top:${Math.round((z - S.z0) * k - r)}px;width:${r * 2}px;height:${r * 2}px;border-radius:50%;background:${col};box-shadow:0 0 0 ${ring ? 2 : 1}px rgba(0,0,0,.7)"></i>`,
      );
    for (const [id, m] of a.members as Map<string, Arena>) {
      if (!m.alive || m.team !== team) continue;
      let x = Number(m.x);
      let z = Number(m.z);
      if (!m.bot) {
        const p = this.host.room()?.state.players.get(id);
        if (!p) continue;
        [x, z] = toLocal(p.x, p.y);
      }
      const mine = id === this.myId();
      dot(x, z, mine ? "#ffffff" : team === "r" ? AMBER : STEEL, mine ? 5 : 4, mine);
    }
    if (a.charge === "dropped" || a.charge === "planted" || (a.charge && team === "r"))
      dot(Number(a.cx), Number(a.cz), "#e06a52", 4, true);
    return `<div style="${PLATE};padding:4px"><div style="position:relative;width:${SZ}px;height:${SZ}px;overflow:hidden;border-radius:2px"><img src="${this.radarPic.url}" width="${SZ}" height="${SZ}" style="display:block"/>${marks.join("")}</div></div>`;
  }
  private scoreHtml(a: Arena): string {
    const rows = (t: "r" | "w") =>
      [...(a.members as Map<string, Arena>).values()]
        .filter((m) => m.team === t)
        .sort((x, y) => y.kills - x.kills || x.deaths - y.deaths)
        .map(
          (m) =>
            `<tr style="opacity:${m.alive ? 1 : 0.5}"><td>${esc(m.name)}${m.bot ? " ·bot" : ""}</td><td>${m.kills}</td><td>${m.assists}</td><td>${m.deaths}</td><td>${"★".repeat(Math.min(5, m.mvps))}</td><td>$${m.money}</td></tr>`,
        )
        .join("");
    const head =
      "<colgroup><col style='width:46%'><col style='width:9%'><col style='width:9%'><col style='width:9%'><col style='width:13%'><col style='width:14%'></colgroup><tr style='opacity:.6;font-size:11px;letter-spacing:.14em'><td>NAME</td><td>K</td><td>A</td><td>D</td><td>MVP</td><td>$</td></tr>";
    return `<div style="position:absolute;top:14%;left:50%;transform:translateX(-50%);${PLATE};padding:14px 22px;min-width:560px">
<div style="${STENCIL};font-size:20px;letter-spacing:.1em;margin-bottom:8px">${strikeMap(String(a.map)).name} · ${MODES[a.mode as ModeId]?.name ?? ""} · round ${a.round}</div>
<div style="${STENCIL};color:${AMBER};letter-spacing:.16em">${TEAMS.r.name}</div><table style="width:100%;font-size:14px;table-layout:fixed;border-collapse:collapse">${head}${rows("r")}</table>
<div style="${STENCIL};color:${STEEL};margin-top:10px;letter-spacing:.16em">${TEAMS.w.name}</div><table style="width:100%;font-size:14px;table-layout:fixed;border-collapse:collapse">${head}${rows("w")}</table></div>`;
  }

  // ── the events ──
  private events(evs: ServerMessages["strike:ev"]) {
    const a = this.arena();
    const name = (id: string) => String(a?.members.get(id)?.name ?? "someone");
    const me = this.myId();
    for (const e of evs as MatchEvent[]) {
      if (e.e === "kill") {
        const marks = `${e.head ? " ⊕" : ""}${e.walls ? " ▥" : ""}`;
        this.feed.push({
          text: `${esc(name(e.by))}${e.assist ? ` + ${esc(name(e.assist))}` : ""} <span style="opacity:.7">[${gunName(e.gun)}${marks}]</span> ${esc(name(e.victim))}`,
          until: performance.now() + 6000,
          mine: e.by === me || e.victim === me,
        });
        if (e.victim === me) this.watch = "";
        if (e.by === me && e.victim !== me) {
          this.sound?.key();
          this.hl.kill(e.victim, e.head);
        }
      } else if (e.e === "round") {
        if (e.n === 1) this.hl.clear();
        this.hl.start(e.n);
        this.say(`ROUND ${e.n}`, 1.6);
      } else if (e.e === "live") {
        this.say("GO", 0.9);
        this.sound?.say(CALLS.live);
      } else if (e.e === "planted") {
        if (e.by === me) this.tut.tick("plant");
        this.say(`THE CHARGE IS PLANTED · ${e.site}`, 2.2);
        this.sound?.say(CALLS.planted);
      } else if (e.e === "defused") {
        if (e.by === me) this.tut.tick("defuse");
        this.say("THE CHARGE IS DEFUSED", 2.4);
        this.sound?.say(CALLS.defused);
      } else if (e.e === "exploded") {
        this.say("THE CHARGE WENT OFF", 2.4);
        if (a) this.sound?.blast(Number(a.cx) + STRIKE_PARK.x, Number(a.cz) + STRIKE_PARK.z, true);
      } else if (e.e === "win") {
        this.hl.end();
        this.say(`${TEAMS[e.team].name.toUpperCase()} WIN${e.mvp ? ` · MVP ${esc(name(e.mvp))}` : ""}`, 3.2);
        this.sound?.say(e.team === "r" ? CALLS.winR : CALLS.winW);
      } else if (e.e === "half") {
        this.say("HALF TIME · SIDES SWAP", 3);
        this.sound?.say(CALLS.half);
      } else if (e.e === "overtime") {
        this.say("OVERTIME", 3);
        this.sound?.say(CALLS.overtime);
      } else if (e.e === "rescued") {
        this.say("A HOSTAGE IS OUT", 2.4);
        this.sound?.say(CALLS.rescued);
      } else if (e.e === "level") this.say(`UP: ${gunName(String(e.level))}`, 1.2);
      else if (e.e === "over") {
        this.say("MATCH OVER", 5);
        this.sound?.say(CALLS.over);
      }
    }
  }
  private say(text: string, secs: number) {
    this.banner = { text, until: performance.now() + secs * 1000 };
  }
  private show(m: ServerMessages["strike:show"]) {
    if (m.to)
      this.host.toast(`The crew's taking ${strikeMap(m.from ?? "").name} down: ${strikeMap(m.to).name} is going up`);
    if (m.done) this.host.toast(`${strikeMap(m.done).name} is up`);
  }
  private botShot(m: ServerMessages["strike:shot"]) {
    // (its tracer and sound are the world's guns': the arms view hears "arms:shot" from people; a bot's shot
    // reaches here — the flash on me when it's my hit)
    if (m.victim === this.myId()) this.flash = Math.max(this.flash, 0.12);
  }

  // ── the swap's show (F6): the old map sinks into the snow over 8 s while two tower cranes swing over the
  // arena and a crew of Vortexes walks it; the new one rises in 4 s ──
  private stepShow(dt: number, a: Arena) {
    for (const l of this.leaving) {
      l.t += dt;
      const k = Math.min(1, l.t / 8);
      l.b.root.position.y = -SINK * k * k;
    }
    for (const l of this.leaving.filter((x) => x.t >= 8)) l.b.dispose();
    this.leaving = this.leaving.filter((x) => x.t < 8);
    if (this.rising) {
      this.rising.t += dt;
      const k = Math.min(1, this.rising.t / 4);
      this.rising.b.root.position.y = -SINK * (1 - k) ** 2;
      if (k >= 1) this.rising = null;
    }
    const on = !a.up || this.leaving.length > 0 || !!this.rising;
    if (on && !this.show3d) {
      const g = new Group();
      const mats: import("three").Material[] = [];
      g.add(crane(STRIKE_PARK.x - 60, STRIKE_PARK.h, STRIKE_PARK.z - 60, 0.6, 1, mats));
      g.add(crane(STRIKE_PARK.x + 62, STRIKE_PARK.h, STRIKE_PARK.z + 40, 2.6, 0.9, mats));
      const crew = [0, 1, 2, 3].map((i) => {
        const v = new Vortex3(`crew${i}`);
        g.add(v.root);
        return v;
      });
      this.root.add(g);
      this.show3d = { g, crew, mats };
    }
    if (this.show3d) {
      const t = performance.now() / 1000;
      this.show3d.g.children.forEach((c, i) => {
        const jib = c.getObjectByName("jib");
        if (jib) jib.rotation.y = Math.sin(t * 0.25 + i * 2) * 1.4;
        // (phase 81) the load let down while the jib's slowest (over the arena), hauled up as it swings
        const len = 8 + 12 * (0.5 + 0.5 * Math.cos(t * 0.5 + i * 2));
        const cable = c.getObjectByName("cable");
        const load = c.getObjectByName("load");
        if (cable) cable.scale.y = len;
        if (load) {
          load.position.y = -len;
          load.rotation.y = Math.sin(t * 0.7 + i) * 0.25;
        }
      });
      const cam = this.host.tp()?.camera;
      this.show3d.crew.forEach((v, i) => {
        const x = STRIKE_PARK.x + Math.cos(t * 0.15 + i * 1.6) * (20 + i * 12);
        const z = STRIKE_PARK.z + Math.sin(t * 0.12 + i * 1.6) * (18 + i * 10);
        const face = cam ? Math.atan2(cam.position.x - x, cam.position.z - z) : 0;
        v.update(
          { avatar: {} as StandIn["avatar"], x, y: z, angle: 0, a: 0, vortexMood: "smug" },
          face,
          0,
          0,
          new Color(0xffd27a),
        );
        v.root.position.y = STRIKE_PARK.h;
      });
      if (!on) {
        this.show3d.g.traverse((o) => {
          const m = o as Mesh;
          if (m.isMesh) m.geometry.dispose();
        });
        for (const m of this.show3d.mats) m.dispose();
        this.show3d.g.removeFromParent();
        this.show3d = null;
      }
    }
  }
  private dressed = false;
  /** A map's 3D: its blocks, its props — and, the kit in, its buildings as the kit's (arena3d kitPlan). */
  private makeMap(key: string): Built {
    const map = strikeMap(key);
    if (!kitReady() || !propsReady()) {
      void loadKit();
      void loadProps();
      this.dressed = false;
      return buildMap(map, this.host.night() > 0.5);
    }
    const g = gridOf(map);
    const open = (x: number, z: number) => {
      const n = nodeNear(g, x, z);
      if (n < 0) return false;
      const [nx, ny, nz] = nodePos(g, n);
      return ny < 0.6 && Math.hypot(nx - x, nz - z) < 0.8;
    };
    const face = (b: { x: number; z: number; hx: number; hz: number }): "n" | "s" | "e" | "w" => {
      const score = (side: "n" | "s" | "e" | "w") => {
        let k = 0;
        for (let t = -0.4; t <= 0.41; t += 0.2) {
          const x = side === "e" ? b.x + b.hx + 1.6 : side === "w" ? b.x - b.hx - 1.6 : b.x + b.hx * t * 2;
          const z = side === "s" ? b.z + b.hz + 1.6 : side === "n" ? b.z - b.hz - 1.6 : b.z + b.hz * t * 2;
          if (open(x, z)) k++;
        }
        return k;
      };
      const sides = ["s", "n", "e", "w"] as const;
      return sides.reduce((best, sd) => (score(sd) > score(best) ? sd : best), "s" as "n" | "s" | "e" | "w");
    };
    const plan = kitPlan(map, face);
    const skip = new Set(plan.map((p) => p.i));
    const plain = buildMap(map, this.host.night() > 0.5, skip);
    const kit = buildKit(plan);
    plain.root.add(kit.root);
    const pr = buildProps(map);
    plain.root.add(pr.root);
    this.dressed = true;
    return {
      root: plain.root,
      lit: (k) => plain.lit(k),
      dispose() {
        pr.dispose();
        kit.dispose();
        plain.dispose();
      },
    };
  }
  /** The join desk's screen: the map and the mode, each side's people (bots counted), and — joined — "YOU'RE IN". */
  private drawDesk(a: Arena) {
    if (!this.desk) return;
    this.deskCanvas ??= Object.assign(document.createElement("canvas"), { width: 512, height: 312 });
    const c = this.deskCanvas;
    const g = c.getContext("2d") as CanvasRenderingContext2D;
    g.fillStyle = "#0d1012";
    g.fillRect(0, 0, 512, 312);
    const map = strikeMap(this.mapKey || String(a.map ?? "sawmill"));
    const mode = MODES[String(a.mode) as ModeId]?.name ?? "";
    const me = this.mine();
    g.font = "800 30px 'Avenir Next Condensed', sans-serif";
    g.fillStyle = "#e9dcc0";
    g.fillText(map.name.toUpperCase(), 18, 40);
    g.font = "600 18px 'Avenir Next', sans-serif";
    g.fillStyle = "#b9ab8d";
    g.fillText(`${mode} · ${a.phase === "idle" ? "no match on — join to start one" : String(a.phase)}`, 18, 66);
    const ms = [...(a.members as Map<string, Arena>).entries()];
    for (const [i, t] of (["r", "w"] as const).entries()) {
      const x = 18 + i * 248;
      const list = ms.filter(([, m]) => m.team === t);
      const people = list.filter(([, m]) => !m.bot);
      g.fillStyle = t === "r" ? AMBER : STEEL;
      g.fillRect(x, 82, 228, 34);
      g.fillStyle = t === "r" ? "#1b1d1a" : "#081521";
      g.font = "800 22px 'Avenir Next Condensed', sans-serif";
      g.fillText(
        `${TEAMS[t].name.toUpperCase()}  ${people.length}${list.length > people.length ? ` +${list.length - people.length} bots` : ""}`,
        x + 10,
        107,
      );
      g.font = "600 17px 'Avenir Next', sans-serif";
      people.slice(0, 5).forEach(([id, m], k) => {
        g.fillStyle = id === this.myId() ? "#f6c467" : "#e9dcc0";
        g.fillText(`${id === this.myId() ? "▶ " : ""}${String(m.name).slice(0, 18)}`, x + 8, 142 + k * 24);
      });
    }
    // the bottom line: mine
    g.fillStyle = me ? "#2f5d3a" : "#2a2e31";
    g.fillRect(0, 262, 512, 50);
    g.font = "800 24px 'Avenir Next Condensed', sans-serif";
    g.fillStyle = "#f4efe6";
    g.fillText(
      me ? `✓ YOU'RE IN · ${TEAMS[me.team as "r" | "w"].name.toUpperCase()}` : "PRESS E TO JOIN · PICK A SIDE",
      18,
      296,
    );
    if (!this.deskTex) {
      this.deskTex = new CanvasTexture(c);
      this.deskTex.colorSpace = SRGBColorSpace;
      const mat = this.desk.screen.material as MeshBasicMaterial;
      mat.map = this.deskTex;
      mat.needsUpdate = true;
    } else this.deskTex.needsUpdate = true;
  }
  /** The war room's screen: the map's radar with everyone on it (both sides: it's the war room), the score, the clock. */
  private drawWar(a: Arena) {
    if (!this.war) return;
    this.warCanvas ??= Object.assign(document.createElement("canvas"), { width: 640, height: 360 });
    const c = this.warCanvas;
    const g = c.getContext("2d") as CanvasRenderingContext2D;
    g.fillStyle = "#0d1012";
    g.fillRect(0, 0, 640, 360);
    const map = strikeMap(this.mapKey || "sawmill");
    radar(g, map, 16, 16, 328, 328, true);
    const S = map.size;
    const k = 328 / Math.max(S.x1 - S.x0, S.z1 - S.z0);
    for (const [id, m] of a.members as Map<string, Arena>) {
      if (!m.alive) continue;
      let x = Number(m.x);
      let z = Number(m.z);
      if (!m.bot) {
        const p = this.host.room()?.state.players.get(id);
        if (!p) continue;
        [x, z] = toLocal(p.x, p.y);
      }
      g.fillStyle = m.team === "w" ? STEEL : AMBER;
      g.beginPath();
      g.arc(16 + (x - S.x0) * k, 16 + (z - S.z0) * k, 4, 0, Math.PI * 2);
      g.fill();
    }
    const sw = !!a.swapped;
    const [ra, wa] = sw ? [a.scoreB, a.scoreA] : [a.scoreA, a.scoreB];
    g.font = "800 22px 'Avenir Next Condensed', sans-serif";
    g.fillStyle = "#e9dcc0";
    g.fillText(map.name.toUpperCase(), 364, 48);
    g.font = "600 16px 'Avenir Next', sans-serif";
    g.fillStyle = "#b9ab8d";
    g.fillText(a.phase === "idle" ? "No match on" : `Round ${a.round} · ${a.phase}`, 364, 74);
    g.font = "900 72px 'Avenir Next Condensed', sans-serif";
    g.fillStyle = AMBER;
    g.fillText(String(ra ?? 0), 364, 170);
    g.fillStyle = STEEL;
    g.fillText(String(wa ?? 0), 520, 170);
    g.font = "700 14px 'Avenir Next Condensed', sans-serif";
    g.fillStyle = AMBER;
    g.fillText("RAIDERS", 364, 192);
    g.fillStyle = STEEL;
    g.fillText("WARDENS", 520, 192);
    g.font = "800 34px monospace";
    g.fillStyle = a.phase === "planted" ? "#e06a52" : "#e9dcc0";
    g.fillText(a.phase === "idle" ? "--:--" : clock(Number(a.left)), 364, 250);
    if (!this.warTex) {
      this.warTex = new CanvasTexture(c);
      this.warTex.colorSpace = SRGBColorSpace;
      const mat = this.war.screen.material as MeshBasicMaterial;
      mat.map = this.warTex;
      mat.needsUpdate = true;
    } else this.warTex.needsUpdate = true;
  }
  /** The sounds that go on: the keypad while the charge is planted or defused, the fire's crackle. */
  private stepSounds(a: Arena) {
    const now = performance.now();
    const st = String(a.charge || "");
    const x = Number(a.cx) + STRIKE_PARK.x;
    const z = Number(a.cz) + STRIKE_PARK.z;
    if ((st === "planting" || (st === "planted" && a.defuser)) && now >= this.keyAt) {
      this.keyAt = now + (st === "planting" ? 330 : 520);
      this.sound?.key(x, z);
    }
    if (now >= this.crackleAt) {
      this.crackleAt = now + 1800 + Math.random() * 400;
      for (const n of (a.nades as Map<string, Arena>).values())
        if (n.state === "fire") this.sound?.burn(Number(n.x) + STRIKE_PARK.x, Number(n.z) + STRIKE_PARK.z);
    }
  }
  /** Where something stands in the map: its floor's height at (x, z) (the walk grid's node there). */
  private floorAt(x: number, z: number, y?: number): number {
    const g = gridOf(strikeMap(this.mapKey || "sawmill"));
    const n = nodeNear(g, x, z, y);
    return n >= 0 ? nodePos(g, n)[1] : 0;
  }
  // ── the charge where it lies (dropped, being planted, planted): its light blinks faster as its fuse runs ──
  private drawCharge(a: Arena) {
    const st = String(a.charge || "");
    const on = (st === "dropped" || st === "planting" || st === "planted") && this.mapUp;
    if (!on) {
      if (this.chargeV) this.chargeV.g.visible = false;
      return;
    }
    if (!this.chargeV) {
      this.chargeV = chargeModel();
      this.root.add(this.chargeV.g);
    }
    const x = Number(a.cx);
    const z = Number(a.cz);
    this.chargeV.g.visible = true;
    this.chargeV.g.position.set(x + STRIKE_PARK.x, this.floorAt(x, z) + STRIKE_PARK.h, z + STRIKE_PARK.z);
    const fuse = st === "planted" ? Math.max(0, Number(a.fuse)) : 40;
    const period = 0.12 + (fuse / 40) * 0.88;
    const t = performance.now() / 1000;
    const lit = st === "planted" ? t % period < 0.08 : false;
    this.chargeV.light.color.setHex(lit ? 0xff3a28 : 0x4a1210);
    if (lit && !this.beeped) this.sound?.beep(fuse < 8 ? 1 : 0, x + STRIKE_PARK.x, z + STRIKE_PARK.z);
    this.beeped = lit;
  }
  private beeped = false;
  // ── the hostages: where they're held, or with whoever carries them ──
  private drawHostages(a: Arena) {
    // (plan 115 phase 88: the hostages are the world's people now — room NPCs, grounds-life.ts; nothing drawn here)
    void a;
    for (const v of this.hostV) v.dispose();
    this.hostV = [];
  }
  // ── the grenades: in the air a small dark shape; a smoke's volume of puffs grown to its radius; fire on the
  // floor, flickering; the blasts a flash of light that fades ──
  private drawNades(a: Arena, dt: number) {
    const now = performance.now();
    const seen = new Set<string>();
    for (const [id, n] of a.nades as Map<string, Arena>) {
      seen.add(id);
      let v = this.nadeViews.get(id);
      if (!v) {
        const g = new Group();
        const body = new Mesh(new SphereGeometry(0.06, 8, 6), new MeshBasicMaterial({ color: 0x2c3236 }));
        body.name = "body";
        g.add(body);
        v = { kind: String(n.kind), g, puffs: [], born: now };
        this.nadeViews.set(id, v);
        this.root.add(g);
      }
      v.g.position.set(Number(n.x) + STRIKE_PARK.x, Number(n.y) + STRIKE_PARK.h, Number(n.z) + STRIKE_PARK.z);
      const body = v.g.getObjectByName("body");
      if (body) body.visible = n.state === "fly" || n.state === "decoy";
      if (n.state === "smoke") {
        if (!v.puffs.length) v.puffs = this.puffs(v.g, 34, 0xc9ccce, 0.9, false);
        const r = smokeRadius(Number(n.left));
        v.puffs.forEach((sp, i) => {
          const u = sp.userData as { dx: number; dy: number; dz: number; s: number };
          sp.position.set(u.dx * r, Math.max(0.3, (u.dy * 0.6 + 0.6) * r), u.dz * r);
          sp.scale.setScalar(u.s * r * 1.25);
          (sp.material as SpriteMaterial).opacity = Math.min(0.95, Number(n.left) / 2) * 0.9;
          sp.material.rotation += dt * 0.05 * (i % 2 ? 1 : -1);
        });
      } else if (n.state === "fire") {
        if (!v.puffs.length) v.puffs = this.puffs(v.g, 18, 0xff8a2a, 1, true);
        v.puffs.forEach((sp, i) => {
          const u = sp.userData as { dx: number; dy: number; dz: number; s: number };
          const f = 0.7 + 0.3 * Math.sin(now / 90 + i * 1.7);
          sp.position.set(u.dx * 2.6, 0.35 + Math.abs(u.dy) * 0.6 * f, u.dz * 2.6);
          sp.scale.setScalar(0.9 * f + u.s * 0.6);
          (sp.material as SpriteMaterial).opacity = Math.min(1, Number(n.left) / 1.5) * 0.85;
        });
      }
    }
    for (const [id, v] of this.nadeViews)
      if (!seen.has(id)) {
        v.g.traverse((o) => {
          const m = o as Mesh;
          if (m.isMesh) m.geometry.dispose();
          if ((m as unknown as Sprite).isSprite || m.isMesh) (m.material as MeshBasicMaterial).dispose();
        });
        v.g.removeFromParent();
        this.nadeViews.delete(id);
      }
    for (const b of this.bursts) {
      b.t += dt;
      const k = b.t / b.life;
      b.m.scale.setScalar(1 + k * 6);
      (b.m.material as MeshBasicMaterial).opacity = Math.max(0, 1 - k);
    }
    for (const b of this.bursts.filter((x) => x.t >= x.life)) {
      b.m.geometry.dispose();
      (b.m.material as MeshBasicMaterial).dispose();
      b.m.removeFromParent();
    }
    this.bursts = this.bursts.filter((x) => x.t < x.life);
  }
  private puffs(g: Group, n: number, color: number, a: number, add: boolean): Sprite[] {
    const out: Sprite[] = [];
    let seed = n * 97;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < n; i++) {
      const sp = new Sprite(
        new SpriteMaterial({
          map: softTex(),
          color,
          transparent: true,
          opacity: a,
          depthWrite: false,
          blending: add ? AdditiveBlending : undefined,
        }),
      );
      // (spread through a ball: more of them inside)
      const th = rnd() * Math.PI * 2;
      const ph = Math.acos(2 * rnd() - 1);
      const r = Math.cbrt(rnd()) * 0.75;
      sp.userData = {
        dx: Math.sin(ph) * Math.cos(th) * r,
        dy: Math.cos(ph) * r,
        dz: Math.sin(ph) * Math.sin(th) * r,
        s: 0.6 + rnd() * 0.5,
      };
      sp.material.rotation = rnd() * 6;
      g.add(sp);
      out.push(sp);
    }
    return out;
  }
  private boom(m: ServerMessages["strike:boom"]) {
    const wx = m.x + STRIKE_PARK.x;
    const wz = m.z + STRIKE_PARK.z;
    if (m.kind === "he") this.sound?.blast(wx, wz);
    else if (m.kind === "flash") this.sound?.bang(wx, wz);
    else if (m.kind === "smoke") this.sound?.hiss(wx, wz);
    else if (m.kind === "swing") this.sound?.swing(wx, wz);
    else if (m.kind === "molotov" || m.kind === "incendiary") this.sound?.ignite(wx, wz);
    if (m.kind !== "he" && m.kind !== "flash") return;
    const mesh = new Mesh(
      new SphereGeometry(0.5, 14, 10),
      new MeshBasicMaterial({
        color: m.kind === "he" ? 0xffb35c : 0xffffff,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    );
    mesh.position.set(m.x + STRIKE_PARK.x, m.y + STRIKE_PARK.h + 0.2, m.z + STRIKE_PARK.z);
    this.root.add(mesh);
    this.bursts.push({ m: mesh, t: 0, life: m.kind === "he" ? 0.45 : 0.25 });
  }

  // ── dead: a living teammate's view ──
  private spectate(a: Arena, tp: ThirdPersonView) {
    const me = this.mine();
    if (me?.alive) this.death = null;
    if (!me || me.alive || a.phase === "warmup" || a.phase === "idle") {
      this.camNow = null;
      return;
    }
    // the kill cam: from where I fell, up a little, looking at who did it
    const d = this.death;
    if (d?.at && performance.now() < d.until) {
      const kx = d.at[0] + STRIKE_PARK.x;
      const kz = d.at[2] + STRIKE_PARK.z;
      const ky = d.at[1] + STRIKE_PARK.h;
      const [fx, fz] = d.from;
      const back = Math.hypot(kx - fx, kz - fz) || 1;
      this.camNow = {
        eye: [fx - ((kx - fx) / back) * 1.5, fz - ((kz - fz) / back) * 1.5, ky + 2.4],
        look: [kx, kz, ky + 1.4],
        showMe: false,
      };
      return;
    }
    const mates = [...(a.members as Map<string, Arena>).entries()].filter(([, m]) => m.alive && m.team === me.team);
    if (!mates.find(([id]) => id === this.watch)) this.watch = mates[0]?.[0] ?? "";
    const w = a.members.get(this.watch);
    if (!w) {
      this.camNow = null;
      return;
    }
    let x: number;
    let z: number;
    let y: number;
    let yaw: number;
    if (w.bot) {
      x = Number(w.x) + STRIKE_PARK.x;
      z = Number(w.z) + STRIKE_PARK.z;
      y = Number(w.y) + STRIKE_PARK.h;
      yaw = Number(w.yaw);
    } else {
      const p = this.host.room()?.state.players.get(this.watch);
      if (!p) return;
      x = p.x;
      z = p.y;
      y = p.z;
      yaw = (Number((p as { yaw?: number }).yaw ?? 0) / 256) * Math.PI * 2;
    }
    const back = 3.2;
    // (the game camera's points: [x, the floor's y — the world's z —, the height])
    this.camNow = {
      eye: [x - Math.cos(yaw) * back, z - Math.sin(yaw) * back, y + 2.1],
      look: [x + Math.cos(yaw) * 4, z + Math.sin(yaw) * 4, y + 1.5],
      showMe: false,
    };
    void tp;
  }
  camera(): ThirdPersonView["gameCam"] {
    return this.stillCam ?? this.replayCam ?? this.camNow;
  }
  /** (the stills' own camera: e2e/strike-shots.mts) */
  stillCam: ThirdPersonView["gameCam"] = null;
  /** Where each one in the match has been, the last few seconds (world coords): the delayed camera's. */
  private record(a: Arena) {
    if (a.phase === "idle") {
      this.trails.clear();
      if (this.following) this.stopFollow();
      return;
    }
    const now = performance.now();
    const hlWho: Who[] = [];
    for (const [id, m] of a.members as Map<string, Arena>) {
      if (!m.alive) {
        this.trails.delete(id);
        continue;
      }
      let at: { x: number; y: number; z: number; yaw: number } | null = null;
      if (m.bot)
        at = {
          x: Number(m.x) + STRIKE_PARK.x,
          y: Number(m.y) + STRIKE_PARK.h,
          z: Number(m.z) + STRIKE_PARK.z,
          yaw: Number(m.yaw),
        };
      else {
        const p = this.host.room()?.state.players.get(id) as
          | { x: number; y: number; z: number; yaw?: number }
          | undefined;
        if (p) at = { x: p.x, y: p.z, z: p.y, yaw: (Number(p.yaw ?? 0) / 256) * Math.PI * 2 };
      }
      if (!at) continue;
      hlWho.push({ id, x: at.x, y: at.y, z: at.z, yaw: at.yaw, team: m.team === "w" ? "w" : "r" });
      const l = this.trails.get(id) ?? [];
      l.push({ t: now, ...at });
      while (l.length && now - l[0].t > (FOLLOW_DELAY + 1.5) * 1000) l.shift();
      this.trails.set(id, l);
    }
    if (a.phase === "live" || a.phase === "planted" || a.phase === "after") this.hl.sample(hlWho);
  }
  private follow(a: Arena) {
    const now = performance.now();
    const alive = [...(a.members as Map<string, Arena>).entries()].filter(([id, m]) => m.alive && this.trails.has(id));
    if (!alive.find(([id]) => id === this.followId)) this.followId = alive[0]?.[0] ?? "";
    const l = this.trails.get(this.followId);
    const want = now - FOLLOW_DELAY * 1000;
    const p = l?.find((q) => q.t >= want) ?? l?.[l.length - 1];
    if (!p) {
      this.camNow = null;
    } else {
      const back = 3.4;
      this.camNow = {
        eye: [p.x - Math.cos(p.yaw) * back, p.z - Math.sin(p.yaw) * back, p.y + 2.2],
        look: [p.x + Math.cos(p.yaw) * 5, p.z + Math.sin(p.yaw) * 5, p.y + 1.4],
        showMe: false,
      };
    }
    if (!this.followEl) {
      this.followEl = document.createElement("div");
      this.followEl.style.cssText = `position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:40;${FRAME};padding:6px 16px;font-size:16px;pointer-events:none`;
      document.body.appendChild(this.followEl);
    }
    const m = a.members.get(this.followId);
    const sw = !!a.swapped;
    const [ra, wa] = sw ? [a.scoreB, a.scoreA] : [a.scoreA, a.scoreB];
    const html = `<span style="color:#d9a066">${ra}</span> · ${clock(Number(a.left))} · <span style="color:#7fa6c9">${wa}</span> &nbsp; WATCHING ${esc(m?.name ?? "—")} · ${FOLLOW_DELAY} s behind · N next · Esc stops`;
    if (this.followEl.innerHTML !== html) this.followEl.innerHTML = html;
  }
  /** (phase 97) my best round, played back over my shoulder */
  startReplay() {
    this.stopReplay();
    this.replay = this.hl.play(this.myId(), this.root);
  }
  private stopReplay() {
    this.replay?.stop();
    this.replay = null;
    this.replayCam = null;
  }
  private stopFollow() {
    this.following = false;
    this.camNow = null;
    this.followEl?.remove();
    this.followEl = null;
  }

  // ── the prompts: the desk, the board ──
  promptNow(): { objectId: string; kind: string; label: string } | null {
    if (this.host.level() !== 0) return null;
    const me = this.host.me();
    if (!inStrikeCompound(me.x, me.y)) return null;
    if (Math.hypot(me.x - STRIKE_DESK.x, me.y - STRIKE_DESK.z) < 3)
      return { objectId: "strike-desk", kind: "strike:lobby", label: this.playing() ? "The match" : "Join the match" };
    if (Math.hypot(me.x - STRIKE_BOARD.x, me.y - STRIKE_BOARD.z) < 3.5)
      return { objectId: "strike-board", kind: "strike:board", label: "Choose the map" };
    if (Math.hypot(me.x - STRIKE_KIT.stand.x, me.y - STRIKE_KIT.stand.z) < 2.4)
      return { objectId: "strike-kit", kind: "strike:kit", label: "Your kit" };
    return null;
  }
  act(kind: string): boolean {
    if (kind === "strike:lobby") {
      this.panelOpen("strike") ? this.closePanel() : this.openPanel("strike");
      return true;
    }
    if (kind === "strike:kit") {
      this.panelOpen("strike-kit") ? this.closePanel() : this.openPanel("strike-kit");
      return true;
    }
    if (kind === "strike:board") {
      this.panelOpen("strike-board") ? this.closePanel() : this.openPanel("strike-board");
      return true;
    }
    return false;
  }

  /** A key while in the match (or a panel's open): handled. */
  key(e: KeyboardEvent, down: boolean): boolean {
    const room = this.host.room();
    // (phase 97) H at the match's end: my best round played back; H or Esc stops it
    if (this.replay && (e.code === "KeyH" || e.code === "Escape")) {
      if (down) this.stopReplay();
      return true;
    }
    if (e.code === "KeyH" && this.hl.best && this.arena()?.phase === "over") {
      if (down) this.startReplay();
      return true;
    }
    // (a menu of the park's open: its own keys — the panel's)
    if (String(hud.get().panel.kind ?? "").startsWith("strike") && e.code !== "KeyB") return false;
    if (this.following && down) {
      if (e.code === "Escape") {
        this.stopFollow();
        return true;
      }
      if (e.code === "KeyN") {
        const ids = [...(this.arena()?.members.keys() ?? [])].filter((id: string) => this.trails.has(id));
        this.followId = ids[(ids.indexOf(this.followId) + 1) % Math.max(1, ids.length)] ?? "";
        return true;
      }
    }
    if (!this.playing() || !room) return false;
    if (e.code === "Tab") {
      this.scoreOpen = down;
      e.preventDefault();
      return true;
    }
    if (!down) {
      if (e.code === "KeyJ" && this.pinned) {
        this.pinned = false;
        const ns = String(this.mine()?.nades || "")
          .split(",")
          .filter(Boolean);
        const kind = ns[this.nadeSel % Math.max(1, ns.length)];
        const cam = this.host.tp()?.camera;
        if (kind && cam && this.mine()?.alive) {
          const d = cam.getWorldDirection(new Vector3());
          room.send("strike:throw", {
            kind,
            short: e.shiftKey,
            yaw: Math.atan2(d.z, d.x),
            pitch: Math.asin(Math.max(-1, Math.min(1, d.y))),
          });
        }
        return true;
      }
      if (e.code === "KeyE" && this.using) {
        this.using = false;
        room.send("strike:use", { on: false });
        return true;
      }
      return false;
    }
    if (e.code === "KeyB" && !e.repeat) {
      this.panelOpen("strike-buy") ? this.closePanel() : this.openPanel("strike-buy");
      return true;
    }
    if (e.code === "KeyE" && !this.using) {
      if (this.canUseHere()) {
        this.using = true;
        room.send("strike:use", { on: true });
        return true;
      }
      return false;
    }
    if ((e.code === "KeyN" || e.code === "Digit4") && !e.repeat) {
      const ns = String(this.mine()?.nades || "")
        .split(",")
        .filter(Boolean);
      if (ns.length) {
        this.nadeSel = (this.nadeSel + 1) % ns.length;
        this.host.toast(`Grenade: ${NADE_NAMES[ns[this.nadeSel]] ?? ns[this.nadeSel]} · J throws, Shift+J short`);
      }
      return true;
    }
    // (plan 115 phase 28) J held: the pin out (its sound); let go: thrown (Shift held: short)
    if (e.code === "KeyJ" && !e.repeat) {
      const ns = String(this.mine()?.nades || "")
        .split(",")
        .filter(Boolean);
      if (!ns.length || !this.mine()?.alive) return true;
      this.pinned = true;
      this.sound?.pin();
      return true;
    }
    // (plan 115 phase 14) ready up in the warmup: F3
    if (e.code === "F3" && !e.repeat && this.arena()?.phase === "warmup") {
      const ready = String(this.arena()?.ready ?? "")
        .split(",")
        .includes(this.myId());
      room.send("strike:ready", { on: !ready });
      return true;
    }
    // (phase 13) the map vote at the match's end: 1–3
    if (this.arena()?.voteTo && /^Digit[1-3]$/.test(e.code)) {
      const keys = String(this.arena()?.vote ?? "").split(",");
      const key = keys[Number(e.code.slice(5)) - 1];
      if (key) room.send("strike:vote", { key });
      return true;
    }
    // the radio: U opens its lines, 1–9 and 0 says one to my team (the bots on it do as told: plan 117)
    if (e.code === "KeyU" && !e.repeat) {
      this.radioOpen = !this.radioOpen;
      return true;
    }
    if (this.radioOpen && /^Digit[0-9]$/.test(e.code)) {
      const n = Number(e.code.slice(5));
      room.send("strike:radio", { i: n === 0 ? 9 : n - 1 });
      this.radioOpen = false;
      return true;
    }
    if (e.code === "KeyK" && !e.repeat) {
      this.view = this.view === "first" ? "chase" : "first";
      return true;
    }
    if (e.code === "KeyG" && this.mine()?.bomb) {
      room.send("strike:drop", {});
      return true;
    }
    return false;
  }
  /** Whether held Use is the match's where I stand: the charge on a site, the planted charge, a hostage. */
  private canUseHere(): boolean {
    const me = this.mine();
    const a = this.arena();
    if (!me?.alive || !a) return false;
    const p = this.host.me();
    const [x, z] = toLocal(p.x, p.y);
    const map = strikeMap(String(a.map));
    const onSite =
      !!me.bomb && !!map.sites && (inRect(map.sites.A, x, z) || (!!map.sites.B && inRect(map.sites.B, x, z)));
    const byCharge = a.charge === "planted" && me.team === "w" && Math.hypot(Number(a.cx) - x, Number(a.cz) - z) < 1.6;
    const byHostage =
      me.team === "w" &&
      [...(a.hostages ?? [])].some((h: Arena) => !h.by && !h.rescued && Math.hypot(h.x - x, h.z - z) < 2);
    return onSite || byCharge || byHostage;
  }
  blur() {
    if (this.using) this.host.room()?.send("strike:use", { on: false });
    this.using = false;
    this.scoreOpen = false;
  }

  // ── the menus (plan 115 phase 2): the game's own panels (hud.panel — components/hud/StrikePanels.tsx), fed by a
  // snapshot of the park (hud.strike) whenever it changes; opening one frees the pointer and stops the walker ──
  private panelOpen(kind: string): boolean {
    return hud.get().panel.kind === kind;
  }
  private openPanel(kind: "strike" | "strike-buy" | "strike-esc" | "strike-board" | "strike-kit") {
    if (kind === "strike") this.host.room()?.send("strike:card", {});
    hud.set({ panel: { kind, objectId: kind } });
    document.exitPointerLock?.();
  }
  private closePanel() {
    const k = hud.get().panel.kind;
    if (k?.startsWith("strike")) hud.set({ panel: { kind: null } });
  }
  private snapSig = "";
  /** The park's snapshot for its menus: written when anything they show changes. */
  private snapshot(a: Arena) {
    const id = this.myId();
    const members: StrikeMemberView[] = [];
    for (const [mid, m] of a.members as Map<string, Arena>)
      members.push({
        id: mid,
        name: String(m.name),
        team: m.team === "w" ? "w" : "r",
        bot: !!m.bot,
        alive: !!m.alive,
        hp: Number(m.hp),
        armor: Number(m.armor),
        helmet: !!m.helmet,
        kit: !!m.kit,
        money: Number(m.money),
        primary: String(m.primary ?? ""),
        pistol: String(m.pistol ?? ""),
        nades: String(m.nades ?? ""),
        bomb: !!m.bomb,
        kills: Number(m.kills),
        deaths: Number(m.deaths),
        assists: Number(m.assists),
        mvps: Number(m.mvps),
        score: Number(m.score),
        me: mid === id,
      });
    const me = members.find((m) => m.me) ?? null;
    const sw = !!a.swapped;
    const p = this.host.me();
    const [x, z] = toLocal(p.x, p.y);
    const map = strikeMap(String(a.map));
    const buyTime =
      a.phase === "warmup" ||
      a.phase === "freeze" ||
      (a.phase === "live" && 115 - Number(a.left) <= 20) ||
      a.mode === "deathmatch";
    const canBuy = !!me?.alive && buyTime && inRect(map.buy[me.team], x, z);
    const view: StrikeView = {
      map: String(a.map),
      next: String(a.next ?? ""),
      up: a.up !== false,
      mode: String(a.mode),
      phase: String(a.phase),
      left: Math.ceil(Number(a.left)),
      round: Number(a.round),
      scoreR: Number(sw ? a.scoreB : a.scoreA),
      scoreW: Number(sw ? a.scoreA : a.scoreB),
      fill: !!a.fill,
      level: String(a.level),
      members,
      me,
      canBuy,
      record: String(a.record ?? ""),
      last: String(a.last ?? ""),
      card: this.myCard,
      following: this.following,
    };
    const sig = JSON.stringify(view);
    if (sig === this.snapSig) return;
    this.snapSig = sig;
    hud.set({ strike: view });
  }
  /** What the menus ask of me (StrikePanels.tsx): follow the match, stop. */
  setFollowing(on: boolean) {
    if (on) this.following = true;
    else this.stopFollow();
  }

  dispose() {
    this.disposed = true;
    this.stopFollow();
    const tpv = this.host.tp();
    if (tpv) tpv.centred = false;
    strikeKeys.playing = strikeKeys.use = false;
    strikeKeys.view = null;
    strikeKeys.speed = 0;
    strikeKeys.climate = null;
    for (const o of this.offs) o();
    this.closePanel();
    this.hudEl?.remove();
    this.mapBuilt?.dispose();
    this.sound?.hush();
    this.war?.dispose();
    this.warTex?.dispose();
    this.mini?.dispose();
    this.corner?.dispose();
    this.desk?.dispose();
    this.deskTex?.dispose();
    this.stopReplay();
    strikeKeys.kitTry = null;
    this.tut.dispose();
    this.compound?.dispose();
    this.root.removeFromParent();
  }
}

// ── helpers ──
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const esc = (s: unknown) => String(s).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const clock = (s: number) => {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};
const modeName = (m: string) =>
  m === "bomb" ? "Bomb defusal" : m === "hostage" ? "Hostage rescue" : m === "wingman" ? "Wingman" : "Aim & Deathmatch";
const GUN_NAMES: Record<string, string> = {
  revolver: "Revolver",
  shotgun: "Double-barrel",
  ak47: "AK",
  sniper: "Sniper",
  daybreak: "Daybreak",
  he: "HE",
  molotov: "Molotov",
  incendiary: "Incendiary",
  charge: "the charge",
};
const gunName = (g: string) => (g ? (GUN_NAMES[g] ?? cap(g)) : "");
// the park's tactical skin (plan 115, F1 — StrikePanels.module.css's, inline here)
const AMBER = "#e8a33a";
const STEEL = "#6fa3c7";
const STENCIL =
  "font-family:'Avenir Next Condensed','Arial Narrow','Helvetica Neue',sans-serif;font-weight:800;font-stretch:condensed;text-transform:uppercase";
const PLATE =
  "background:linear-gradient(180deg,rgba(38,44,41,.92),rgba(30,35,33,.92));border:1px solid #0b0d0c;box-shadow:0 0 0 2px rgba(90,58,36,.85),0 8px 24px rgba(0,0,0,.45);border-radius:4px;color:#f3ead8;font-family:var(--font-body),system-ui,sans-serif";
const TAG =
  "background:rgba(30,35,33,.88);border:1px solid #0b0d0c;border-radius:3px;color:#f3ead8;font-family:var(--font-body),system-ui,sans-serif";
const KEY =
  "display:inline-block;min-width:16px;padding:0 5px;border-radius:2px;background:#e9dcc0;color:#1b1d1a;font-size:11px;text-align:center;font-family:system-ui,sans-serif";
/** The world's guns' rounds (shared inventory WEAPONS' ammo). */
const AMMO: Record<string, string> = {
  revolver: "r38",
  shotgun: "shell",
  ak47: "r762",
  sniper: "r308",
  daybreak: "cell",
};
/** A hit at the crosshair: four short strokes on the diagonals (red for the head). */
function hitMarker(head: boolean): string {
  const c = head ? "#ff5a48" : "#ffffff";
  const o = "position:absolute;left:50%;top:50%;width:0;height:0";
  const l = (r: number) =>
    `<div style="position:absolute;left:-1px;top:-11px;width:2px;height:7px;background:${c};transform:rotate(${r}deg) translateY(-3px);transform-origin:1px 11px;box-shadow:0 0 0 1px rgba(0,0,0,.5)"></div>`;
  return `<div style="${o}">${l(45)}${l(135)}${l(225)}${l(315)}</div>`;
}
/** The crosshair as the park's settings have it (StrikePanels.tsx strikePrefs). */
function crosshair(): string {
  let p = { crosshair: "cross", size: 1, color: "#9cf06a" };
  try {
    p = { ...p, ...JSON.parse(localStorage.getItem("yutopia:strike") ?? "{}") };
  } catch {
    /* defaults */
  }
  const c = p.color;
  const k = p.size;
  const o = "position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)";
  if (p.crosshair === "dot")
    return `<div style="${o};width:${4 * k}px;height:${4 * k}px;border-radius:50%;background:${c};box-shadow:0 0 0 1px rgba(0,0,0,.6)"></div>`;
  if (p.crosshair === "circle")
    return `<div style="${o};width:${16 * k}px;height:${16 * k}px;border-radius:50%;border:2px solid ${c};box-shadow:0 0 0 1px rgba(0,0,0,.5)"></div>`;
  const l = 7 * k;
  const g = 4 * k;
  const line = (x: number, y: number, w: number, h: number) =>
    `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:${c};box-shadow:0 0 0 1px rgba(0,0,0,.55)"></div>`;
  return `<div style="${o};width:0;height:0">${line(-1, -g - l, 2, l)}${line(-1, g, 2, l)}${line(-g - l, -1, l, 2)}${line(g, -1, l, 2)}</div>`;
}
/** How far behind Follow the match is (s): what it shows can't call positions (F7). */
const FOLLOW_DELAY = 3;
/** How far a map sinks into the ground in the swap's show (m). */
const SINK = 26;
const NADE_NAMES: Record<string, string> = {
  he: "HE grenade",
  flash: "Flashbang",
  smoke: "Smoke",
  molotov: "Molotov",
  incendiary: "Incendiary",
  decoy: "Decoy",
};
/** A smoke's radius from the seconds it has left (shared nades.ts smokeR's numbers). */
const smokeRadius = (left: number) => {
  const age = 18 - left;
  return 4.2 * Math.min(1, age / 1) * (0.6 + 0.4 * Math.min(1, left / 2));
};
let soft: CanvasTexture | null = null;
function softTex(): CanvasTexture {
  if (soft) return soft;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  const r = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.55, "rgba(255,255,255,.75)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  soft = new CanvasTexture(c);
  return soft;
}
const shortNade = (n: string) =>
  ({ he: "HE", flash: "FL", smoke: "SM", molotov: "MO", incendiary: "IN", decoy: "DE" })[n] ?? n;

function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, lh: number) {
  let line = "";
  for (const word of text.split(" ")) {
    const t = line ? `${line} ${word}` : word;
    if (g.measureText(t).width > w) {
      g.fillText(line, x, y);
      y += lh;
      line = word;
    } else line = t;
  }
  if (line) g.fillText(line, x, y);
}
