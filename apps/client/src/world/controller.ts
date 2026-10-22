"use client";

import {
  ANIM,
  across,
  areaAt,
  type ClientMessages,
  CONTACT,
  dirFromDelta,
  doorCentre,
  doorLeaves,
  doorOwner,
  EMOTES,
  entry,
  FLOORS,
  findPath,
  floorChange,
  floorOf,
  floorsOf,
  Grid,
  getMap,
  HEAR_RADIUS,
  type Height,
  hangSpot,
  hangStrip,
  hearingGain,
  inLift,
  isDoorKind,
  isJump,
  isPrivate,
  isSocial,
  isToyHeld,
  type JumpKind,
  type JumpNow,
  JumpTrack,
  jumpArc,
  jumpNowAt,
  jumpTimes,
  type LiftMotion,
  levelMap,
  liftFront,
  liftHere,
  liftMotion,
  type MapDef,
  mayLockDoor,
  objectActions,
  objLevel,
  onLevel,
  type Point,
  parseAvatar,
  placedFootprint,
  ROOM_NAME,
  reachOf,
  type ServerMessages,
  SOCIAL,
  SOCIAL_MS,
  STEP_LABELS,
  setAreasBeyond,
  setOutdoors,
  socialFor,
  spHour,
  stairsDoor,
  stairsLocal,
  stairsWayUp,
  stereoPan,
  THROWN,
  TICK_HZ,
  tileAt,
  type WbItem,
  type WorldObjectDef,
  wellsOf,
  ZPX_TILE,
} from "@yutopia/shared";
import { COMPUTER_REACH, computerAway, isComputer } from "@yutopia/shared/computer";
import { CABLE_REACH, gap, isConsole, isGameTv } from "@yutopia/shared/games";
import { isRadio, type RadioState, radioOf } from "@yutopia/shared/media";
import { type BattleEvent, type PetLook, type PetOutfit, type Species, toyAt } from "@yutopia/shared/pets";
import { Client, getStateCallbacks, type Room } from "colyseus.js";
import { ApiError, type Session, yutopia } from "@/lib/api";
import { lang, tr } from "@/lib/i18n";
import { deviceQuality, prefs, type Quality, resolveQuality, setPrefs, subscribePrefs } from "@/lib/prefs";
import { ActionQueue } from "./actions";
import { loadChars } from "./art/chars-load";
import { loadPeople } from "./art/people-load";
import { loadPets, pets as petsArt } from "./art/pets-load";
import { loadItemArt } from "./art/scene";
import { loadThemes } from "./art/themes-load";
import { mixer } from "./audio";
import type { BuildController } from "./build/controller";
import { type AvatarState, WorldEngine } from "./engine";
import { fanfare, machineSound, pianoNote, socialSound } from "./foley";
import type { GameRoom } from "./games/room";
import { loadGrounds } from "./grounds-load";
import { jumps, loadJumps } from "./jumps-load";
import { liftSound, loadLiftSounds, nearGain, stairStep } from "./lift-sound";
import { Media } from "./media";
import type { MediaRoom } from "./media/room";
import type { OsRoom } from "./os/room";
import type { PetView } from "./petview";
import type { Phone } from "./phone";
import type { SlotTracks } from "./slots";
import { type Floor, radio, sound } from "./sound";
import { type ActTarget, type BattleView, hud, type Person, type PetInfo, toast } from "./store";
import type { GameTables } from "./tables";
import type { Body3, CamMode, ThirdPersonView } from "./tp/view";

// biome-ignore lint/suspicious/noExplicitAny: decoded Colyseus schema objects
type S = any;

// map edits that act on a floor (the one I'm on, unless they say)
const FLOOR_EDITS = new Set<string>([
  "map:paint",
  "map:walls",
  "map:faces",
  "map:room",
  "map:room:walls",
  "map:room:update",
  "map:room:remove",
]);

// someone as they were at a moment of their own clock, put on mine (docs/plan/29-the-move.md M7)
interface Sample {
  t: number;
  x: number;
  y: number;
  z: number;
  d: number;
  a: number;
  mv: number;
  yaw: number;
}
const sampleOf = (
  p: { x: number; y: number; z?: number; d: number; a: number; mv?: number; yaw?: number },
  t: number,
): Sample => ({
  t,
  x: p.x,
  y: p.y,
  z: p.z ?? 0,
  d: p.d,
  a: p.a,
  mv: p.mv ?? 0,
  yaw: p.yaw ?? 0,
});

interface Remote {
  level: number; // the floor they're on (their coords are that floor's)
  buf: Sample[];
  off: number; // their clock to mine: the lowest gap seen (NaN: none yet)
  verbAt: number; // when their last verb shows (as late as they're drawn)
  offAt: number;
  jumpKey: string; // their last jump (kind|server ms), timed from when it showed up here
  track: JumpTrack;
}

const INTERP_MS = 110;
const MEDIA_SLEEP_MS = 5 * 60_000; // quiet this long: the voice line sleeps
const MEDIA_NEAR = HEAR_RADIUS + 4; // someone this close (tiles) keeps it awake
const LIVEKIT_TOKEN_FRESH_MS = 5 * 3600_000; // LiveKit tokens last 6 h (apps/api Tokens)
const IDLE_MS = 3000; // nothing moved for this long: frames at 30/s
const WANT_MS = 6000; // how long what a pet wants shows over its head
const INTERACT_RANGE = 1.7;
const ISO_UP = (-3 * Math.PI) / 4; // iso: W goes up the screen, the world's north-west (shared iso.ts)
const JUMP_HEARD = 9; // tiles: others' jumps are heard this far

// (a lot car out being driven: not where it was parked — docs/plan/28-the-car.md)
const notDriven = (o: { kind: string; props?: Record<string, unknown> | null }) => o.kind !== "car" || !o.props?.driven;

export class WorldController {
  engine: WorldEngine | null = null;
  room: Room<S> | null = null;
  media: Media;
  session: Session | null = null;
  map!: MapDef; // the floor I'm on (shared levels.ts)
  grid!: Grid;
  // the building: its home map with every floor, the floor I'm on, and the
  // things on every floor (the iso engine only has my floor's)
  building!: MapDef;
  level = 0;
  readonly objs = new Map<string, WorldObjectDef>();
  private host: HTMLElement;
  // my body (docs/plan/29-the-move.md): the movement core under the keys and the pad (input chunk)
  private walker: import("./input").Walker | null = null;
  private walkYaw = 0;
  private myVerb: { kind: string; t: number } | undefined;
  private myPitch = 0;
  private lastPitch = 0;
  private lastMv = 0;
  private lastYaw = 0;
  // my feet (shared/jump.ts): how high (up on something, in a jump), my jump's stage,
  // whether it's left the ground yet; Space pressed just before landing, waiting
  private height: Height = { z: 0, vz: 0, up: false };
  private jumpTrack = new JumpTrack();
  private jumpStages = new Map<string, string>(); // everyone's jump stage last frame (dust, sound)
  /** review shots / e2e: a jump of mine held at this moment (s in), while it's set */
  jumpHold: { kind: JumpKind; t: number } | null = null;
  private path: Point[] | null = null;
  private pathTarget: { objectId?: string } | null = null;
  private me = { x: 0, y: 0, d: 0, a: 0 as number };
  private lastSent = { x: 0, y: 0, z: 0, d: 0, a: 0, t: 0, l: 0 };
  private seq = 0;
  private remotes = new Map<string, Remote>();
  private npcBuf = new Map<string, { t: number; x: number; y: number }[]>();
  private petBuf = new Map<string, { t: number; x: number; y: number }[]>();
  private petHurt = new Map<string, number>(); // pet id → when it last took a hit (client ms)
  private toyPick: string | null = null; // a toy I'm walking over to pick up
  private battleSeen = ""; // the last battle round shown (id|round)
  private hear = new Set<string>();
  private raf = 0;
  private lastFrame = 0;
  private lastTick = 0;
  private tick = 0;
  private rafGap = 1000 / 60; // how often the screen asks for a frame (ms, smoothed)
  private activeAt = 0;
  private hudFrames = new Set<() => void>();
  private stopped = false;
  private timers: ReturnType<typeof setInterval>[] = [];
  private offPrefs: (() => void) | null = null;
  private offLook: (() => void) | null = null;
  private reconnecting = false;
  private peopleAt = 0;
  private followAt = 0;
  private uidToSid = new Map<number, string>();
  onOpenPanel: (kind: string, objectId?: string) => void = () => {};
  readonly actions: ActionQueue;

  constructor(host: HTMLElement) {
    this.host = host;
    this.actions = new ActionQueue({
      me: () => this.me,
      setFacing: (d) => {
        this.me.d = d;
      },
      grid: () => this.grid,
      object: (id) => this.engine?.getObject(id),
      person: (sid) => {
        const p = this.room?.state.players.get(sid);
        if (!p) return undefined;
        const r = this.remotes.get(sid);
        const at = r ? interpolate(r.buf, performance.now() - INTERP_MS) : { x: p.x, y: p.y };
        return { x: at.x, y: at.y, uid: p.uid, name: p.name };
      },
      pet: (id) => {
        const pet = this.room?.state.pets.get(id);
        if (!pet) return undefined;
        const at = interpolate(this.petBuf.get(id) ?? [{ t: 0, x: pet.x, y: pet.y }], performance.now() - INTERP_MS);
        return { x: at.x, y: at.y, name: pet.name };
      },
      walk: (to) => this.walkTo(to, undefined, true),
      walking: () => !!this.path?.length,
      stopWalking: () => {
        this.path = null;
        this.pathTarget = null;
      },
      send: (type, msg) => this.send(type, msg),
      activate: (id) => this.activateObject(id, false),
      machineBusy: () => performance.now() < this.usingUntil,
      busyFor: (what, ms) => {
        this.usingWhat = what;
        this.usingUntil = performance.now() + ms;
      },
      playNote: (id, n) => this.playPiano(id, n),
      openPanel: (kind, objectId) => this.onOpenPanel(kind, objectId),
      putDown: () => this.putDown(),
    });
    this.media = new Media({
      onTracksChanged: (m) => {
        hud.set((s) => ({ media: { ...s.media, mic: m.mic, cam: m.cam, screen: m.screen } }));
        this.send("media", m);
      },
      onVideo: (uid, el, kind) => {
        hud.set((s) => {
          const key = kind === "screen" ? "screens" : "videos";
          const next = { ...s[key] };
          if (el) next[uid] = el;
          else delete next[uid];
          return { [key]: next } as Partial<typeof s>;
        });
        this.syncStageScreen();
      },
      onTv: (identity, el) => {
        if (el) this.tvVideos.set(identity, el);
        else this.tvVideos.delete(identity);
      },
      onSpeaking: (on) => this.send("speaking", { on }),
      onQuality: (quality) => hud.set((s) => ({ media: { ...s.media, quality } })),
      onState: (st) => {
        // just woke: the quiet spell starts over
        if (!st.asleep && hud.get().media.asleep) this.mediaBusyAt = Date.now();
        hud.set((s) => ({ media: { ...s.media, ready: st.ready, offline: st.offline, asleep: st.asleep } }));
      },
    });
    // waking the voice line after a long sleep: a fresh token if ours is getting old
    this.media.refreshCreds = async () => {
      if (Date.now() - this.sessionAt < LIVEKIT_TOKEN_FRESH_MS && this.session)
        return {
          url: this.session.livekitUrl,
          token: this.session.livekitToken,
          iceServers: this.session.iceServers ?? [],
        };
      const s = await yutopia.session();
      this.session = s;
      this.sessionAt = Date.now();
      return { url: s.livekitUrl, token: s.livekitToken, iceServers: s.iceServers ?? [] };
    };
  }

  send<K extends keyof ClientMessages>(type: K, msg: ClientMessages[K]) {
    msg = this.onMyFloor(type, msg);
    // (a lift's button pressed: its click, at once)
    if (type === "lift:call" || type === "lift:go" || type === "lift:close") liftSound("lift/button", { gain: 0.8 });
    try {
      this.room?.send(type, msg);
    } catch {}
    if (Object.hasOwn(STEP_LABELS, type) && hud.get().build.on)
      hud.set((s) => ({ build: { ...s.build, save: { state: "saving", at: Date.now() } } }));
  }

  // Build mode builds the floor I'm on (shared levels.ts): its map edits say
  // which, and a thing put on a floor other than the home one says so in its props.
  private onMyFloor<K extends keyof ClientMessages>(type: K, msg: ClientMessages[K]): ClientMessages[K] {
    if (!this.building) return msg;
    const m = msg as Record<string, unknown>;
    if (FLOOR_EDITS.has(type) && m.level === undefined) return { ...m, level: this.level } as ClientMessages[K];
    const home = floorOf(this.building);
    const stamp = <T extends { props?: Record<string, unknown> }>(it: T): T =>
      this.level === home || it.props?.level !== undefined
        ? it
        : { ...it, props: { ...(it.props ?? {}), level: this.level } };
    if (type === "obj:put") return stamp(m as { props?: Record<string, unknown> }) as ClientMessages[K];
    if (type === "obj:batch")
      return { items: (m.items as { props?: Record<string, unknown> }[]).map(stamp) } as ClientMessages[K];
    if (
      type === "teleport" &&
      typeof m.to === "object" &&
      m.to &&
      "x" in (m.to as object) &&
      !("level" in (m.to as object))
    )
      return { to: { ...(m.to as object), level: this.level } } as ClientMessages[K];
    return msg;
  }

  // ── lifecycle ────────────────────────────────────────────────────────────
  async start() {
    hud.reset();
    hud.set({ phase: "loading" });
    try {
      this.session = await yutopia.session();
      this.sessionAt = Date.now();
    } catch (e) {
      if (this.stopped) return;
      hud.set({ phase: "failed", error: e instanceof ApiError && e.status === 404 ? "404" : tr("failed") });
      return;
    }
    // A discarded mount (React StrictMode) must not touch the shared HUD.
    if (this.stopped) return;
    const s = this.session;
    hud.set({ worldName: s.world.name, canBuild: s.canBuild, isAdmin: s.user.isAdmin, phase: "connecting" });
    this.map = getMap(s.world.mapKey);
    this.building = this.map;
    this.grid = Grid.from(this.map, this.map.objects);

    const engine = new WorldEngine(this.map);
    this.engine = engine;
    this.autoTier = deviceQuality();
    await engine.init(this.host, {
      quality: this.qualityNow(),
      reducedMotion: prefs().reducedMotion,
      autoStart: false,
    });
    if (this.stopped) return engine.destroy();
    engine.events = {
      onTileClick: (x, y, mods) => {
        if (hud.get().build.on) return this.buildClick(x, y);
        if (hud.get().pickArrival) return this.setArrival({ x, y });
        if (hud.get().menu) return hud.set({ menu: null });
        // a toy in hand: Shift / right-click (or the chip's Throw) throws it there, or points the laser
        if (this.throwAt(x, y, !!mods?.shift || !!mods?.right)) return;
        // a click on the floor: go there (dropping whatever was queued) — on a
        // stairwell's flights, up or down them to the other floor
        this.actions.clear();
        this.toyPick = null;
        if (this.climbAt(x, y)) return;
        this.walkTo({ x, y });
      },
      onToyClick: (id) => this.pickToy(id),
      onAvatarClick: (sid, at) => {
        if (sid.startsWith("pet:")) return void this.openMenu({ type: "pet", id: sid.slice(4) }, at);
        if (sid.startsWith("npc:")) return this.send("vortex:poke", {});
        // yourself: your look, your drink…; anyone else: what to do with them
        if (sid === this.room?.sessionId) return this.openMenu({ type: "self" }, at);
        const p = this.room?.state.players.get(sid);
        if (p && !p.bot) this.openMenu({ type: "person", sid }, at);
      },
      onObjectClick: (id, at) => {
        // a button on an elevator car's own panel (3D): a floor, open, close
        const btn = id.split("|btn|");
        if (btn.length === 2) return this.pressLiftButton(btn[0], btn[1]);
        const o = this.engine?.getObject(id);
        const b = hud.get().build;
        if (b.on && o && b.tool === "walls") return; // walls/floors paint by dragging
        if (b.on && o) return this.buildClick(o.x + 0.5, o.y + 0.5);
        // carrying a cable: a TV clicked is where it goes
        if (hud.get().cable && o && isGameTv(o.kind)) return this.activateObject(id, true);
        // an elevator: in when it's open, else a call (no menu to go through)
        if (o?.kind === "elevator") return this.activateObject(id, true);
        // a staircase (3D): up it from its floor, down it from the one above
        const st = !o ? this.objs.get(id) : o;
        if (st?.kind === "stairs" && !hud.get().build.on) {
          this.actions.clear();
          this.climb(st, objLevel(st, this.building) === this.level);
          return;
        }
        if (!this.openMenu({ type: "object", id }, at)) this.activateObject(id, true);
      },
      onHoverObject: () => {},
      onPointerWorld: (x, y) => (hud.get().pickArrival ? this.hoverArrival(x, y) : this.buildHover(x, y)),
      onPointerDown: (x, y) => this.buildDown(x, y),
      onPointerUp: (x, y) => this.buildUp(x, y),
      onWheel: (dy) => this.build?.wheel(dy) ?? false,
    };
    this.offLook = hud.subscribe(this.watchLook);
    this.offPrefs = subscribePrefs(() => {
      this.engine?.setQuality(this.qualityNow(), prefs().reducedMotion);
      if (this.tp && this.tp.quality !== this.qualityNow()) this.tp.setQuality(this.qualityNow());
      this.syncView();
    });
    // Auto quality: step down a tier when this device can't keep up
    this.timers.push(setInterval(() => this.watchFrameRate(), 1000));
    this.updateNight(true);

    await this.join();
    if (this.stopped) return;
    this.bindInput();
    this.lastFrame = performance.now();
    this.lastTick = this.lastFrame;
    this.activeAt = this.lastFrame;
    const loop = (t: number) => {
      if (this.stopped) return;
      // asked first: a frame that throws mustn't end the loop
      this.raf = requestAnimationFrame(loop);
      // Frames are drawn every n-th screen frame so they stay evenly spaced
      // (a 144 Hz screen capped at 60 draws every 2nd: 72/s), from the
      // screen's own rate, smoothed.
      const gap = t - this.lastTick;
      this.lastTick = t;
      if (gap > 0 && gap < 100) this.rafGap += (gap - this.rafGap) * 0.1;
      const cap = this.fpsCap(t);
      const every = cap ? Math.max(1, Math.round(1000 / this.rafGap / cap)) : 1;
      if (++this.tick % every) return;
      const dt = Math.min(0.1, (t - this.lastFrame) / 1000);
      this.lastFrame = t;
      this.frame(dt, t);
    };
    this.raf = requestAnimationFrame(loop);
    // rAF stops in hidden tabs: keep walking, hearing and voice panning alive
    // with a slow timer until frames come back.
    this.timers.push(
      setInterval(() => {
        const t = performance.now();
        if (t - this.lastFrame < 250 || this.stopped) return;
        const dt = Math.min(0.25, (t - this.lastFrame) / 1000);
        this.lastFrame = t;
        this.frame(dt, t);
      }, 100),
    );

    void this.media.connect(s.livekitUrl, s.livekitToken, s.iceServers);
    this.timers.push(setInterval(() => this.superviseMedia(), 1000));
    this.timers.push(setInterval(() => this.updateNight(), 1000));
  }

  private async join(reconnectToken?: string) {
    const s = this.session as Session;
    const client = new Client(s.worldUrl);
    try {
      const room: Room<S> = reconnectToken
        ? await client.reconnect(reconnectToken)
        : await client.joinOrCreate(ROOM_NAME, { token: s.worldToken });
      if (this.stopped) {
        void room.leave(true);
        return;
      }
      this.room = room;
      this.wireMessages(room);
      // nested schema callbacks need the first full state
      if (!room.state?.players) await new Promise<void>((res) => room.onStateChange.once(() => res()));
      if (this.stopped) return;
      this.wireRoom(room);
      hud.set({ phase: "ready" });
      void this.syncLook();
      // the phone: in my pocket from the start (texts and calls reach it)
      setTimeout(() => {
        if (!this.stopped) void this.ensurePhone();
      }, 1500);
    } catch (e) {
      if (reconnectToken) throw e;
      console.warn("[world] join failed", e);
      if (!this.stopped) hud.set({ phase: "failed", error: tr("failed") });
    }
  }

  private wireRoom(room: Room<S>) {
    const $ = getStateCallbacks(room);
    const engine = this.engine as WorldEngine;
    this.remotes.clear();
    // a fresh session (not a resume) has new session ids: drop old avatars
    engine.clearAvatars();
    this.uidToSid.clear();

    $(room.state).players.onAdd((p: S, sid: string) => {
      const local = sid === room.sessionId;
      this.uidToSid.set(p.uid, sid);
      if (local) {
        this.me = { x: p.x, y: p.y, d: p.d, a: p.a };
        this.height = { z: p.z ?? 0, vz: 0, up: false };
        this.setLevel(p.level ?? 0);
        this.lastSent = { ...this.me, z: this.height.z, t: 0, l: this.level };
        engine.localId = sid;
      } else {
        this.remotes.set(sid, {
          level: p.level ?? 0,
          buf: [sampleOf(p, performance.now())],
          off: Number.NaN,
          offAt: 0,
          verbAt: 0,
          jumpKey: `${p.jump}|${p.jumpAt}`, // (a jump from before I came isn't played)
          track: new JumpTrack(),
        });
        if (hud.get().phase === "ready" && !p.bot) mixer.blip("join");
      }
      engine.upsertAvatar(sid, this.avatarState(p, local), local);
      $(p).onChange(() => {
        if (sid === room.sessionId) return;
        const r = this.remotes.get(sid);
        if (!r) return;
        // another floor: its coords aren't this one's (no gliding between them)
        if ((p.level ?? 0) !== r.level) {
          r.level = p.level ?? 0;
          r.buf = [];
        }
        // timed on their own clock (put on mine by the lowest gap seen, creeping up for drift):
        // a message that came late is played when it was sent, not when it came
        const now = performance.now();
        const last = r.buf[r.buf.length - 1];
        let t = now;
        if (p.mt) {
          r.off = Math.min(Number.isNaN(r.off) ? now : r.off + (now - r.offAt) * 0.002, now - p.mt);
          r.offAt = now;
          t = Math.max(p.mt + r.off, (last?.t ?? 0) + 1);
        }
        const s = sampleOf(p, t);
        if (!last || ["x", "y", "z", "d", "a", "mv", "yaw"].some((k) => last[k as "x"] !== s[k as "x"])) {
          r.buf.push(s);
          if (r.buf.length > 12) r.buf.shift();
        }
      });
    });
    $(room.state).players.onRemove((p: S, sid: string) => {
      engine.removeAvatar(sid);
      this.remotes.delete(sid);
      if (this.uidToSid.get(p.uid) === sid) this.uidToSid.delete(p.uid);
      if (!p.bot) mixer.blip("leave");
    });

    this.applyMapFromState();
    $(room.state).listen("mapVersion", () => {
      this.mapDirty = true;
    });
    engine.setObjects([]);
    // every floor's things kept; the engine draws mine
    const putObj = (o: S) => {
      const def = objFromState(o);
      this.objs.set(def.id, def);
      if (def.kind === "elevator") this.liftHeard(def);
      // (a lot car out being driven isn't where it was parked: the car itself is drawn)
      if (objLevel(def, this.building) === this.level && notDriven(def))
        engine.upsertObject(this.liftDrawn(def), false);
      else if (engine.getObject(def.id)) engine.removeObject(def.id, false);
      this.objectsDirty = true;
    };
    $(room.state).objects.onAdd((o: S) => {
      putObj(o);
      $(o).onChange(() => putObj(o));
    });
    $(room.state).objects.onRemove((o: S) => {
      this.objs.delete(o.id);
      engine.removeObject(o.id, false);
      this.objectsDirty = true;
    });

    $(room.state).npcs.onAdd((n: S, id: string) => {
      engine.upsertAvatar(`npc:${id}`, this.npcState(n));
      let lastSay = n.sayAt;
      this.npcBuf.set(id, [{ t: performance.now(), x: n.x, y: n.y }]);
      $(n).onChange(() => {
        const buf = this.npcBuf.get(id);
        const last = buf?.[buf.length - 1];
        if (buf && (!last || last.x !== n.x || last.y !== n.y)) {
          buf.push({ t: performance.now(), x: n.x, y: n.y });
          if (buf.length > 12) buf.shift();
        }
        // public lines: only people near him hear them
        if (n.sayAt === lastSay || !n.say) return;
        lastSay = n.sayAt;
        if (Math.hypot(n.x - this.me.x, n.y - this.me.y) > 8) return;
        this.say(`npc:${id}`, n.say, 7000);
      });
    });
    $(room.state).npcs.onRemove((_n: S, id: string) => engine.removeAvatar(`npc:${id}`));

    // pets (features/pets.ts): drawn like people, with their sounds near me
    $(room.state).pets.onAdd((pet: S, id: string) => {
      this.petBuf.set(id, [{ t: performance.now(), x: pet.x, y: pet.y }]);
      void loadPets(); // its drawing, animation, sounds and strings
      if (pet.alive) engine.upsertAvatar(`pet:${id}`, this.petState(pet));
      let lastSay = pet.sayAt;
      let floor = pet.floor ?? 0;
      $(pet).onChange(() => {
        // (to another floor: its coords are that floor's — no gliding there)
        if ((pet.floor ?? 0) !== floor) {
          floor = pet.floor ?? 0;
          this.petBuf.set(id, [{ t: performance.now(), x: pet.x, y: pet.y }]);
        }
        const buf = this.petBuf.get(id);
        const last = buf?.[buf.length - 1];
        if (buf && (!last || last.x !== pet.x || last.y !== pet.y)) {
          buf.push({ t: performance.now(), x: pet.x, y: pet.y });
          if (buf.length > 12) buf.shift();
        }
        if (!pet.alive && engine.hasAvatar(`pet:${id}`)) engine.removeAvatar(`pet:${id}`);
        if (pet.sayAt === lastSay || !pet.say) return;
        lastSay = pet.sayAt;
        const d = Math.hypot(pet.x - this.me.x, pet.y - this.me.y);
        if (d > 10 || (pet.floor ?? 0) !== this.level) return;
        const P = petsArt();
        if (!P) return;
        const sp = pet.species as Species;
        this.say(`pet:${id}`, P.petNoise(sp, pet.say as never, lang()), 2200);
        P.petSound(P.SPECIES_DEFS[sp].sound, pet.say, Math.max(0.15, 1 - d / 12));
      });
      this.publishPets();
    });
    $(room.state).pets.onRemove((_pet: S, id: string) => {
      engine.removeAvatar(`pet:${id}`);
      this.petBuf.delete(id);
      this.publishPets();
    });
    $(room.state).battles.onAdd((b: S) => {
      $(b).onChange(() => this.watchBattle(b));
      this.watchBattle(b);
    });
    $(room.state).battles.onRemove(() => this.publishPets());
    $(room.state).toys.onRemove((t: S) => {
      if (this.toyPick === t.id) this.toyPick = null;
    });

    const mirror = () => {
      const st = room.state;
      hud.set({
        standup: {
          active: st.standup.active,
          order: [...st.standup.order],
          turn: st.standup.turn,
          turnStartedAt: st.standup.turnStartedAt,
          turnSeconds: st.standup.turnSeconds,
        },
      });
    };
    $(room.state).standup.onChange(mirror);
    $(room.state).standup.order.onAdd(mirror);
    $(room.state).standup.order.onRemove(mirror);
    const mirrorLocks = () => {
      const locks: Record<string, string> = {};
      room.state.locks.forEach((by: string, area: string) => {
        locks[area] = by;
      });
      hud.set({ locks });
    };
    $(room.state).locks.onAdd(mirrorLocks);
    $(room.state).locks.onRemove(mirrorLocks);
    mirror();
    mirrorLocks();
  }

  private wireMessages(room: Room<S>) {
    room.onMessage("snap", (m: ServerMessages["snap"]) => {
      if (m.level !== undefined) this.setLevel(m.level);
      this.me.x = m.x;
      this.me.y = m.y;
      this.height = { z: m.z ?? 0, vz: 0, up: false };
      this.path = null;
    });
    room.onMessage("hear", (m: ServerMessages["hear"]) => {
      this.hear = new Set(m.ids);
      const uids = new Set<string>();
      for (const sid of m.ids) {
        const p = room.state.players?.get(sid);
        if (p) uids.add(String(p.uid));
      }
      this.media.setHearing(uids, m.heardBy ?? []);
      const heardBy = (m.heardBy ?? []).map(Number).filter((u) => u !== this.myUid());
      if (heardBy.join() !== hud.get().heardBy.join()) hud.set({ heardBy });
      // someone's in earshot: a sleeping voice line wakes now (not on the next tick)
      if ((m.ids.length || heardBy.length) && this.media.asleep()) this.superviseMedia();
    });
    room.onMessage("knock", (m: ServerMessages["knock"]) => {
      mixer.blip("knock");
      hud.set((s) => ({ knocks: [...s.knocks.filter((k) => k.from !== m.from), { ...m, at: Date.now() }] }));
    });
    room.onMessage("admitted", (m: ServerMessages["admitted"]) => {
      const area = this.map.areas.find((a) => a.key === m.area);
      toast(`${tr("letIn")} — ${area?.name ?? m.area}`);
      if (area) this.walkTo({ x: area.x + area.w / 2, y: area.y + area.h / 2 });
    });
    room.onMessage("toast", (m: ServerMessages["toast"]) => toast(m.text, m.tone ?? "info"));
    // the computer I sat down at is mine (its panel boots VortexOS), or it went off under me
    room.onMessage("computer:ok", (m: ServerMessages["computer:ok"]) => {
      this.computerId = m.id;
      void this.ensureOs();
      this.onOpenPanel("computer", m.id);
    });
    room.onMessage("computer:off", (m: ServerMessages["computer:off"]) => {
      if (this.computerId !== m.id) return;
      this.computerId = null;
      const pk = hud.get().panel;
      if (pk.kind === "computer" && pk.objectId === m.id) hud.set({ panel: { kind: null } });
    });
    room.onMessage("spawn:mine", (m: ServerMessages["spawn:mine"]) => {
      const was = hud.get().mySpawn;
      hud.set({ mySpawn: m.at });
      if (hud.get().pickArrival) return this.engine?.showMine(m.at);
      // just set: show where for a moment
      if (m.at && (m.at.x !== was?.x || m.at.y !== was?.y) && this.arrivalAsked) this.flashArrival();
    });
    // someone's playing the piano: from where they are (fades over ~10 tiles)
    room.onMessage("piano:note", (m: ServerMessages["piano:note"]) => {
      const d = Math.hypot(m.x - this.me.x, m.y - this.me.y);
      pianoNote(m.n, Math.max(0, 1 - d / 10), (m.x - m.y - (this.me.x - this.me.y)) / 8);
    });
    room.onMessage("build:history", (m: ServerMessages["build:history"]) =>
      hud.set((s) => ({ build: { ...s.build, history: m } })),
    );
    room.onMessage("build:saved", (m: ServerMessages["build:saved"]) =>
      hud.set((s) => ({
        build: { ...s.build, save: { state: m.ok ? "saved" : m.rejected ? "rejected" : "failed", at: m.at } },
      })),
    );
    room.onMessage("pet:challenge", (m: ServerMessages["pet:challenge"]) => {
      mixer.blip("knock");
      hud.set({ challenge: { battle: m.battle, fromName: m.fromName, pet: m.pet, mine: m.mine } });
    });
    room.onMessage("pet:event", (m: ServerMessages["pet:event"]) => this.petEvent(m));
    // texts and the like, from the API (world/phone): the phone's chunk takes them
    room.onMessage(
      "phone:live",
      (m: ServerMessages["phone:live"]) => void this.ensurePhone().then((ph) => ph?.onLive(m.event)),
    );
    // calls (world/phone/call.ts): the phone's chunk takes them
    room.onMessage(
      "call:ring",
      (m: ServerMessages["call:ring"]) => void this.ensurePhone().then((ph) => ph?.calls.onRing(m)),
    );
    room.onMessage(
      "call:update",
      (m: ServerMessages["call:update"]) => void this.ensurePhone().then((ph) => ph?.calls.onUpdate(m)),
    );
    room.onMessage(
      "call:join",
      (m: ServerMessages["call:join"]) => void this.ensurePhone().then((ph) => ph?.calls.onJoin(m)),
    );
    room.onMessage("vortex:say", (m: ServerMessages["vortex:say"]) => {
      this.say("npc:vortex", m.text, 7000);
      // his personal lines also land in his thread on the phone
      void this.ensurePhone().then((ph) => ph?.vortexLine(m.text));
      for (const f of this.vortexListeners) f(m.text);
    });
    room.onMessage("wb:scene", (m: ServerMessages["wb:scene"]) => {
      this.wbScenes.set(m.objectId, m.items);
      this.emitWb(m.objectId);
    });
    room.onMessage("wb:op", (m: ServerMessages["wb:op"]) => {
      const items = this.wbScenes.get(m.objectId) ?? this.persistedScene(m.objectId);
      if (m.op.t === "add") items.push(m.op.item);
      else if (m.op.t === "del")
        items.splice(0, items.length, ...items.filter((x) => x.id !== (m.op as { id: string }).id));
      else items.splice(0, items.length);
      this.wbScenes.set(m.objectId, items);
      this.emitWb(m.objectId);
    });
    room.onMessage("arcade:scores", () => {});
    room.onMessage("game:tv", (m: ServerMessages["game:tv"]) => this.games?.onTvToken(m));
    room.onMessage("media:key", (m: ServerMessages["media:key"]) => {
      this.mediaKey = m;
    });
    room.onMessage("game:pad", (m: ServerMessages["game:pad"]) => this.games?.onPad(m));
    room.onMessage("game:audience", (m: ServerMessages["game:audience"]) => this.games?.onAudience(m));
    room.onMessage("kicked", (m: ServerMessages["kicked"]) =>
      hud.set({ phase: m.reason === "removed" ? "removed" : "kicked" }),
    );
    room.onLeave((code: number) => {
      if (this.stopped) return;
      if (code === 4002 || hud.get().phase === "removed") return hud.set({ phase: "removed" });
      if (code === 4001 || hud.get().phase === "kicked") return hud.set({ phase: "kicked" });
      void this.reconnect(room.reconnectionToken);
    });
  }

  private async reconnect(token: string) {
    if (this.reconnecting) return;
    this.reconnecting = true;
    hud.set({ phase: "reconnecting" });
    const started = Date.now();
    let delay = 500;
    while (!this.stopped && Date.now() - started < 18_000) {
      try {
        await this.join(token);
        this.reconnecting = false;
        return;
      } catch {
        await new Promise((r) => setTimeout(r, delay));
        delay = Math.min(4000, delay * 1.6);
      }
    }
    // seat expired: fresh session + join
    try {
      this.session = await yutopia.session();
      this.sessionAt = Date.now();
      this.engine?.setObjects([]);
      for (const sid of [...this.remotes.keys()]) this.engine?.removeAvatar(sid);
      await this.join();
    } catch {
      hud.set({ phase: "failed", error: tr("failed") });
    }
    this.reconnecting = false;
  }

  // The room learns your look from the join token, minted when the page loaded:
  // after a rejoin (world restart, network) or a change saved elsewhere (the
  // editor in another tab), tell it the look saved in the API.
  async syncLook() {
    try {
      const { avatar } = await yutopia.avatar();
      const room = this.room;
      const me = room?.state.players.get(room.sessionId);
      if (me && JSON.stringify(parseAvatar(me.avatar)) !== JSON.stringify(parseAvatar(avatar)))
        this.send("avatar", { avatar });
    } catch {
      // offline or signed out: the room keeps what it has
    }
  }

  stop() {
    this.stopped = true;
    this.walker?.dispose();
    this.build?.dispose();
    this.slots?.dispose();
    this.tables?.dispose();
    this.games?.dispose();
    this.screens?.dispose();
    this.os?.dispose();
    this.cars?.dispose();
    this.cars = null;
    cancelAnimationFrame(this.raf);
    for (const t of this.timers) clearInterval(t);
    if (this.arrivalFlash) clearTimeout(this.arrivalFlash);
    if (hud.get().pickArrival) hud.set({ pickArrival: false });
    this.unbindInput();
    this.closeTp();
    this.offPrefs?.();
    this.offLook?.();
    void this.room?.leave(true).catch(() => {});
    void this.media.disconnect();
    sound.stopAll();
    this.life?.sound.stop();
    this.engine?.destroy();
    this.engine = null;
  }

  private heldShown = "";
  putDown() {
    this.send("item:drop", {});
  }

  // ── a console's cable: taken from its panel, plugged in at a TV ─────────
  grabCable(consoleId: string) {
    mixer.blip("click");
    hud.set({ cable: { consoleId }, panel: { kind: null } });
  }

  dropCable(why?: string) {
    if (!hud.get().cable) return;
    hud.set({ cable: null });
    if (why) toast(why, "warn");
  }

  // still in hand: the console's there, not plugged in yet, and I haven't
  // walked further off than the cable goes
  private checkCable() {
    const c = hud.get().cable;
    if (!c) return;
    const o = this.engine?.getObject(c.consoleId);
    if (!o) return this.dropCable();
    if (typeof o.props?.tv === "string") {
      mixer.blip("pop");
      return this.dropCable();
    }
    const { w, h } = placedFootprint(o);
    const me = { x: this.me.x, y: this.me.y, w: 0, h: 0 };
    if (gap({ x: o.x, y: o.y, w, h }, me) > CABLE_REACH + 2) this.dropCable(tr("cableTooFar"));
  }

  // the cable from the console to my hands (for the 3D view; iso draws its own)
  private cableEnds(): { from: Point; to: Point } | null {
    const c = hud.get().cable;
    const o = c ? this.engine?.getObject(c.consoleId) : undefined;
    if (!o) return null;
    return { from: { x: o.x + 0.5, y: o.y + 0.3 }, to: { x: this.me.x, y: this.me.y } };
  }

  // What I'm busy with (shown on my body for everyone): a machine for a moment,
  // or the piano / whiteboard / computer while its panel is open.
  private usingWhat = "";
  private usingUntil = 0;
  private busySent = "";
  private syncBusy() {
    const panel = hud.get().panel;
    const pk = panel.kind;
    // the computer's panel closed (stood up, Esc, walked off): it shuts down
    if (this.computerId && !(pk === "computer" && panel.objectId === this.computerId)) {
      this.send("computer:leave", { id: this.computerId });
      this.computerId = null;
    }
    const want =
      pk === "piano" || pk === "whiteboard" || pk === "computer"
        ? pk
        : pk === "slotcar" && this.slots?.atControls()
          ? "slotcar"
          : (pk === "pool" || pk === "pong") && this.tables?.busy()
            ? (this.tables?.busy() as string)
            : this.games?.atPad()
              ? "gamepad"
              : performance.now() < this.usingUntil
                ? this.usingWhat
                : "";
    if (want !== this.busySent) {
      this.busySent = want;
      this.send("use", { what: want });
    }
  }

  // A note on the piano I'm at: heard here at once, sent to everyone else.
  playPiano(id: string, n: number) {
    pianoNote(n, 1, 0);
    this.send("piano:note", { id, n });
  }

  // ── the game room: its own chunk (world/games), loaded once a TV or console is here ──
  games: GameRoom | null = null;
  private gamesLoading: Promise<void> | null = null;
  tvVideos = new Map<string, HTMLVideoElement>(); // "tv-<console id>" → its picture
  private gamesChanged() {
    if (this.games) return this.games.refresh();
    const kinds = new Set([
      "crt_tv",
      "cart_shelf",
      "console_2600",
      "console_nes",
      "console_snes",
      "console_md",
      "console_gb",
      "console_ps1",
      "console_ps1_slim",
      "disc_rack",
    ]);
    if (this.gamesLoading || !this.engine?.allObjects().some((o) => kinds.has(o.kind))) return;
    this.gamesLoading = import("./games/room").then((m) => {
      if (this.stopped || !this.engine || !this.room) return;
      this.games = new m.GameRoom(this);
      this.games.refresh();
    });
  }

  // ── media on TVs and the radio: its own chunk (world/media), loaded once
  // something plays, a projector is here, or a remote opens ──
  screens: MediaRoom | null = null;
  private screensLoading: Promise<void> | null = null;
  mediaKey: ServerMessages["media:key"] | null = null;
  get worldHttp(): string {
    return (this.session?.worldUrl ?? "").replace(/^ws(s?):/, "http$1:").replace(/\/$/, "");
  }
  private screensChanged() {
    if (this.screens) return this.screens.refresh();
    const on = !!this.engine
      ?.allObjects()
      .some(
        (o) =>
          o.kind === "projector" ||
          !!o.props?.media ||
          (isRadio(o.kind) && (o.props?.radio as { source?: string } | undefined)?.source === "yt"),
      );
    if (on) void this.ensureScreens();
  }
  ensureScreens(): Promise<void> {
    this.screensLoading ??= import("./media/room").then((m) => {
      if (this.stopped || !this.engine || !this.room) return;
      this.screens = new m.MediaRoom(this);
      this.screens.refresh();
    });
    return this.screensLoading;
  }

  // ── computers running VortexOS: their own chunk (world/os), loaded once
  // someone's at one (the picture on its glass) ──
  os: OsRoom | null = null;
  private osLoading: Promise<void> | null = null;
  computerId: string | null = null; // the one I'm at
  private computersChanged() {
    if (this.os || !this.room?.state?.computers?.size) return;
    void this.ensureOs();
  }
  ensureOs(): Promise<void> {
    this.osLoading ??= import("./os/room").then((m) => {
      if (this.stopped || !this.engine || !this.room) return;
      this.os = new m.OsRoom(this);
    });
    return this.osLoading;
  }

  // ── the voice line's sleep (media.ts) ────────────────────────────────────
  // Nothing of mine live (mic, camera, screen), not on a call, nobody within
  // earshot or about to walk into it, no game TV streaming here: after
  // MEDIA_SLEEP_MS of that the LiveKit connection closes. Any of them again
  // wakes it (turning the mic, camera or screen on wakes it first, media.ts).
  private sessionAt = 0; // when the session (and its LiveKit token) was minted
  private mediaBusyAt = Date.now();
  private mediaRetryAt = 0;
  mediaNeeded(): boolean {
    const h = hud.get();
    if (h.media.mic || h.media.cam || h.media.screen) return true;
    if (h.phone.onCall || h.phone.ringing) return true;
    if (this.hear.size > 0 || h.heardBy.length > 0) return true;
    const st = this.room?.state;
    if (!st) return true;
    let busy = false;
    // a console's picture going out on a TV here (everyone gets it through this line)
    st.consoles?.forEach((c: S) => {
      if (c.live) busy = true;
    });
    if (busy) return true;
    // someone close enough to walk into earshot in a moment
    const meSid = this.room?.sessionId;
    st.players?.forEach((p: S, sid: string) => {
      if (busy || sid === meSid || p.bot) return;
      if (Math.hypot(p.x - this.me.x, p.y - this.me.y) < MEDIA_NEAR) busy = true;
    });
    return busy;
  }
  private superviseMedia() {
    if (this.stopped || hud.get().phase !== "ready") return;
    const now = Date.now();
    if (this.mediaNeeded()) {
      this.mediaBusyAt = now;
      if (this.media.asleep() && now >= this.mediaRetryAt)
        void this.media.wake().then((ok) => {
          if (!ok) this.mediaRetryAt = Date.now() + 15_000;
        });
      return;
    }
    // (e2e shortens the wait: window.__voiceSleepMs)
    const wait = (globalThis as { __voiceSleepMs?: number }).__voiceSleepMs ?? MEDIA_SLEEP_MS;
    if (this.media.on() && now - this.mediaBusyAt >= wait) void this.media.sleep();
  }

  // ── the phone (world/phone, Vortex Mobile): its own chunk, loaded soon after
  // arriving (texts and calls reach it while it's in the pocket) or when it comes out ──
  phone: Phone | null = null;
  private phoneLoading: Promise<Phone | null> | null = null;
  ensurePhone(): Promise<Phone | null> {
    this.phoneLoading ??= import("./phone").then((m) => {
      if (this.stopped) return null;
      this.phone = new m.Phone(this);
      hud.set((s) => ({ phone: { ...s.phone, loaded: true } }));
      return this.phone;
    });
    return this.phoneLoading;
  }
  async togglePhone(open = !hud.get().phone.open) {
    (await this.ensurePhone())?.setOpen(open);
  }

  // ── the phone's camera (world/phone/camera.ts): the view becomes the viewfinder ──
  // 3D: Photo is your eyes (first person, the lens zooms), Selfie a camera at
  // arm's length in front of you (Q / E walk it round you). Iso: Photo is the
  // view as it is, Selfie leans in on you (you turn to face it).
  private photo: {
    mode: "photo" | "selfie";
    angle: number; // the selfie camera, round me (world radians)
    tilt: number;
    zoom: number;
    was: { cam: CamMode | null; isoZoom: number; yaw: number; pitch: number };
  } | null = null;
  photoMode(mode: "photo" | "selfie" | null) {
    const tp = this.tp;
    const e = this.engine;
    if (!mode) {
      const was = this.photo?.was;
      this.photo = null;
      if (e) {
        e.tagsHidden = false;
        e.pinCamera(null);
        if (was) e.setZoom(was.isoZoom);
      }
      if (tp) {
        tp.lens(null);
        tp.setMode(this.camWanted());
        if (was) {
          tp.yaw = was.yaw;
          tp.pitch = was.pitch;
        }
      }
      return;
    }
    const was = this.photo?.was ?? {
      cam: tp ? (this.tp?.mode ?? null) : null,
      isoZoom: e?.getZoom() ?? 1,
      yaw: tp?.yaw ?? 0,
      pitch: tp?.pitch ?? 0,
    };
    this.photo = { mode, angle: this.meAngle, tilt: 0, zoom: 1, was };
    tp?.setLook(false);
    if (e) e.tagsHidden = true;
    if (tp) {
      tp.lens(mode === "photo" ? 1 : null);
      if (mode === "photo") {
        tp.setMode("first");
        tp.yaw = this.meAngle;
        tp.pitch = 0.04;
      } else tp.setMode("chase");
    } else if (e) {
      if (mode === "selfie") {
        const z = Math.min(5.2, was.isoZoom * 2.4);
        e.pinCamera({ x: this.me.x, y: this.me.y, zoom: z, ease: true, z: 34, zoomMax: z });
      } else {
        e.pinCamera(null);
        e.setZoom(was.isoZoom);
      }
    }
  }
  photoZoom(z: number) {
    if (!this.photo) return;
    this.photo.zoom = z;
    if (this.tp) this.tp.lens(this.photo.mode === "photo" ? z : null);
    else {
      const base = this.photo.was.isoZoom * (this.photo.mode === "selfie" ? 2.4 : 1);
      if (this.photo.mode === "selfie")
        this.engine?.pinCamera({ x: this.me.x, y: this.me.y, zoom: base * z, ease: true, z: 34, zoomMax: base * z });
      else this.engine?.setZoom(base * z);
    }
  }
  photoTurn(dir: number) {
    if (!this.photo) return;
    if (this.photo.mode === "selfie") this.photo.angle += dir * 0.22;
    else if (this.tp) this.tp.yaw += dir * 0.09;
  }
  photoTilt(dir: number) {
    if (!this.photo) return;
    if (this.photo.mode === "selfie") this.photo.tilt = Math.max(-0.4, Math.min(0.5, this.photo.tilt + dir * 0.08));
    else if (this.tp) this.tp.pitch = Math.max(-0.6, Math.min(0.8, this.tp.pitch + dir * 0.05));
  }
  // the selfie camera in 3D (null otherwise): at arm's length, a little above
  private photoCam(): ThirdPersonView["gameCam"] {
    const p = this.photo;
    if (!p || p.mode !== "selfie" || !this.tp) return null;
    const a = p.angle;
    const r = 1.35 / Math.max(1, p.zoom * 0.8);
    // the billboards face back along the camera's yaw: point it at me
    this.tp.yaw = a + Math.PI;
    return {
      eye: [this.me.x + Math.cos(a) * r, this.me.y + Math.sin(a) * r, 1.78 + p.tilt],
      look: [this.me.x, this.me.y, 1.42 + p.tilt * 0.4],
      showMe: true,
      fov: 56,
    };
  }
  // the canvas the world is drawn on right now (the phone records it)
  viewCanvas(): HTMLCanvasElement {
    return this.tp ? this.tp.renderer.domElement : (this.engine?.app.canvas as HTMLCanvasElement);
  }
  snapshot(): HTMLCanvasElement | null {
    return this.tp ? this.tp.snapshot() : (this.engine?.snapshot() ?? null);
  }
  // a selfie in iso: the box round me on the canvas (px), for the crop
  selfieFrame(): { x: number; y: number; w: number; h: number } | null {
    if (this.tp || !this.engine) return null;
    const dpr = this.engine.app.renderer.resolution;
    const feet = this.engine.worldToClient(this.me.x, this.me.y, 0);
    const head = this.engine.worldToClient(this.me.x, this.me.y, 110);
    const r = this.engine.app.canvas.getBoundingClientRect();
    const h = (feet.y - head.y) * 2.1;
    return { x: (feet.x - r.left - h * 0.4) * dpr, y: (head.y - r.top - h * 0.25) * dpr, w: h * 0.8 * dpr, h: h * dpr };
  }
  flashPerson(sid: string) {
    this.engine?.flash(sid);
    this.tp?.flash(sid);
  }

  // ── slot-car tracks: their own chunk (world/slots.ts), loaded once a track is here ──
  slots: SlotTracks | null = null;
  private slotsLoading: Promise<void> | null = null;
  private slotsChanged() {
    if (this.slots) return this.slots.refresh();
    if (this.slotsLoading || !this.engine?.allObjects().some((o) => o.kind === "slot_track")) return;
    this.slotsLoading = import("./slots").then((m) => {
      const room = this.room;
      if (this.stopped || !this.engine || !room) return;
      this.slots = new m.SlotTracks(this.engine, room, (type, msg) => this.send(type as never, msg as never));
      this.slots.refresh();
    });
  }

  // ── the game tables (pool, ping-pong): their own chunk (world/tables), loaded once one is here ──
  tables: GameTables | null = null;
  private tablesLoading: Promise<void> | null = null;
  private tableVortexes = new Set<string>();
  private tablesChanged() {
    if (this.tables) return this.tables.refresh();
    if (
      this.tablesLoading ||
      !this.engine?.allObjects().some((o) => o.kind === "pool_table" || o.kind === "pingpong_table")
    )
      return;
    this.tablesLoading = import("./tables").then((m) => {
      const room = this.room;
      const engine = this.engine;
      if (this.stopped || !engine || !room) return;
      this.tables = new m.GameTables({
        engine,
        room,
        send: (type, msg) => this.send(type as never, msg as never),
        walkTo: (p) => {
          this.walkTo(p, undefined, true);
        },
        face: (x, y) => {
          if (this.path) return;
          this.me.d = dirFromDelta(x - this.me.x, y - this.me.y, this.me.d as 0);
          this.meAngle = Math.atan2(y - this.me.y, x - this.me.x);
        },
        stand: (x, y) => {
          if (this.path || !this.grid.ok(Math.floor(x), Math.floor(y))) return;
          this.me.x = x;
          this.me.y = y;
        },
        threeD: () => !!this.tp,
        worldHttp: () => this.worldHttp,
        where: () => this.walker?.where() ?? { ...this.me, z: 0 },
        aiming: () => !!this.walker?.aiming,
        level: () => this.level,
      });
      this.tables.refresh();
    });
  }

  // ── per frame ────────────────────────────────────────────────────────────
  // A feature's frame (games, slot cars) that throws: logged once, and the
  // world carries on without it instead of freezing.
  private failed = new Set<string>();
  private isolated(name: string, fn: () => void) {
    try {
      fn();
    } catch (e) {
      if (this.failed.has(name)) return;
      this.failed.add(name);
      console.error(`[${name}] frame failed`, e);
    }
  }

  private frame(dt: number, now: number) {
    const engine = this.engine;
    const room = this.room;
    if (!engine || !room?.state?.players) return;
    if (this.mapDirty) {
      this.mapDirty = false;
      this.applyMapFromState();
    }
    if (this.isoSwap === 2) {
      this.isoSwap = 1;
      engine.setMap(this.map);
    } else if (this.isoSwap === 1) {
      this.isoSwap = 0;
      engine.setObjects(
        onLevel(this.objs.values(), this.map)
          .filter(notDriven)
          .map((o) => this.liftDrawn(o)),
      );
      this.objectsDirty = true;
    }
    this.updateDoors();
    if (this.objectsDirty) {
      // batched: hundreds of objects arrive in the first patch
      this.objectsDirty = false;
      this.prewarmFloors();
      engine.refreshFlat();
      engine.setWells(wellsOf(this.map, this.objs.values()));
      this.rebuildGrid();
      this.build?.checkPending();
      this.slotsChanged();
      this.tablesChanged();
      this.gamesChanged();
      this.screensChanged();
      hud.set((h) => ({ objectsVersion: h.objectsVersion + 1 }));
    }
    this.syncView();
    this.driveVehicles(dt);
    this.isolated("cars", () => this.cars?.frame(dt, now));
    this.moveLocal(dt);
    this.updateLift();
    if (!this.tp) this.liftsIso(now);
    this.stairsDoors();
    if (hud.get().build.on) {
      this.actions.clear();
      if (hud.get().menu) hud.set({ menu: null });
    } else this.actions.tick(now);
    // my voice's reach on open floor while the mic is on (rooms and the stage
    // don't go by distance)
    const here = areaAt(this.map, this.me.x, this.me.y);
    const open = !isPrivate(here) && here?.kind !== "stage";
    engine.earshot = hud.get().media.mic && open && hud.get().me?.status !== "dnd" ? HEAR_RADIUS : 0;
    if (this.tp) this.tp.earshot = engine.earshot;
    this.isolated("slots", () => this.slots?.frame(dt, this.me));
    this.isolated("tables", () => this.tables?.frame(dt, this.me));
    this.isolated("games", () => this.games?.frame(dt, this.me));
    this.isolated("media", () => this.screens?.frame(dt, this.me));
    this.computersChanged();
    this.isolated("os", () => this.os?.frame(dt, this.me));
    this.syncBusy();
    const localSid = room.sessionId;
    const lp = room.state.players.get(localSid);
    // what I carry, for the HUD
    const heldNow = lp?.held ? `${lp.held}|${lp.heldAt}` : "";
    if (heldNow !== this.heldShown) {
      this.heldShown = heldNow;
      hud.set({ held: lp?.held ? { kind: lp.held, at: lp.heldAt } : null });
    }
    if (!!lp?.focus !== hud.get().focus) hud.set({ focus: !!lp?.focus });
    if (!!lp?.torch !== hud.get().torch) hud.set({ torch: !!lp?.torch });
    // the weather (shared weather.ts): the server's storm, eased (grounds-life.ts)
    if (this.life) {
      [this.storm, this.wind] = this.life.weather(dt, room.state.storm, room.state.wind);
      engine.grounds?.setWeather(this.storm, this.wind);
      this.tp?.setWeather(this.storm, this.wind);
    }
    // someone high-fives me, hands me something…: turn to them
    if (lp?.act && lp.actAt !== this.facedAct) {
      this.facedAct = lp.actAt;
      const other = room.state.players.get(lp.actWith);
      if (other && !this.path) this.me.d = dirFromDelta(other.x - this.me.x, other.y - this.me.y, this.me.d as 0);
    }
    const tp = this.tp;
    const bodies: Body3[] = [];
    const reduced = prefs().reducedMotion;
    if (lp) {
      const st = {
        ...this.avatarState(lp, true),
        x: this.me.x,
        y: this.me.y,
        d: this.me.d,
        a: this.me.a,
        mv: this.lastMv,
        verb: this.myVerb,
        pitch: this.myPitch,
        angle: this.meAngle,
        focused: this.walker?.focus,
        ...this.myJump(now),
      };
      this.jumpEffects(localSid, st, 1);
      this.life?.print(localSid, st, now, this.map, this.grid.onLand(st.x, st.y));
      const inCar = !!this.cars?.inCar();
      if (inCar) {
        if (engine.hasAvatar(localSid)) engine.removeAvatar(localSid);
      } else engine.upsertAvatar(localSid, st, true);
      if (tp && !inCar)
        bodies.push({
          ...st,
          id: localSid,
          level: this.level,
          typing: st.a === 2 && (st.busy === "computer" || engine.atWork(st.x, st.y)),
          reduced,
        });
    }

    const renderAt = now - INTERP_MS;
    for (const [sid, r] of this.remotes) {
      const p = room.state.players.get(sid);
      if (!p) continue;
      if (!r.buf.length) r.buf.push(sampleOf(p, performance.now()));
      const pos = interpolate(r.buf, renderAt);
      const at = pos.s;
      const here = (p.level ?? 0) === this.level;
      const st = {
        ...this.avatarState(p, false),
        x: pos.x,
        y: pos.y,
        d: at.d,
        a: at.a,
        mv: at.mv,
        // (their verb, if it's one: timed from when it shows, by the 3D people and iso)
        verb: p.jump ? { kind: p.jump, t: 0, at: r.verbAt } : undefined,
        pitch: p.pitch / 40,
        // (their facing as they turned, not 8 ways: from the move's own senders)
        angle: p.mt ? (at.yaw / 128) * Math.PI : undefined,
        ...this.theirJump(r, p, pos, now),
      };
      this.jumpEffects(
        sid,
        st,
        here ? Math.max(0, 1 - Math.hypot(pos.x - this.me.x, pos.y - this.me.y) / JUMP_HEARD) : 0,
      );
      // iso shows my floor; 3D draws everyone where they are in the building
      // (someone in a car: the car draws them, sitting in it)
      const carried = !!this.cars?.seatedIds().has(sid);
      if (here && !carried) this.life?.print(sid, st, now, this.map, this.grid.onLand(st.x, st.y));
      else this.life?.prints.forget(sid);
      if (here && !carried) engine.upsertAvatar(sid, st);
      else if (engine.hasAvatar(sid)) engine.removeAvatar(sid);
      if (tp && !carried)
        bodies.push({
          ...st,
          id: sid,
          level: p.level ?? 0,
          typing: st.a === 2 && (st.busy === "computer" || engine.atWork(st.x, st.y)),
          reduced,
        });
      // voice: volume + stereo from where they are relative to me
      if (this.hear.has(sid)) {
        const ear = {
          x: this.me.x,
          y: this.me.y,
          dnd: lp?.status === "dnd",
          level: this.level,
          stairs: this.grid.onRamp(this.me.x, this.me.y),
        };
        // (on another floor I only hear them in the stairwell: the server decides)
        const src = { x: pos.x, y: pos.y, dnd: p.status === "dnd", level: p.level ?? 0, stairs: true };
        // focusing: the room's chatter turned down (whoever's right beside me still heard)
        const duck = lp?.focus && Math.hypot(pos.x - this.me.x, pos.y - this.me.y) > 2 ? 0.25 : 1;
        this.media.setVoice(
          String(p.uid),
          Math.max(0.05, hearingGain(this.building, ear, src, true) * duck),
          tp ? tp.pan(ear, src) : stereoPan(ear, src),
        );
      } else this.media.setVoice(String(p.uid), 0, 0);
    }
    const night = engine.getDaylight().night;
    room.state.npcs.forEach((n: S, id: string) => {
      const pos = interpolate(this.npcBuf.get(id) ?? [{ t: 0, x: n.x, y: n.y }], renderAt);
      const guard = n.kind === "guard" ? this.life?.guard(n, night) : null;
      const st: AvatarState & { z?: number; ground?: number } = {
        ...(guard ?? this.npcState(n)),
        x: pos.x,
        y: pos.y,
      };
      // (Vortex is the studio's; the night guard's on the ground floor — at his post in the
      // gatehouse by day, walking out to the fence after dark: the server walks him)
      const home = (n.level ?? -1) < 0 ? floorOf(this.building) : n.level;
      if (n.kind === "guard" && !guard) {
        if (engine.hasAvatar(`npc:${id}`)) engine.removeAvatar(`npc:${id}`);
        return;
      }
      // (out on the land his feet are on it: the ground's not at 0 by the gatehouse)
      if (guard && this.level === home) st.z = st.ground = this.grid.groundAt(pos.x, pos.y, 0);
      if (this.level === home) engine.upsertAvatar(`npc:${id}`, st);
      else if (engine.hasAvatar(`npc:${id}`)) engine.removeAvatar(`npc:${id}`);
      if (tp) bodies.push({ ...st, id: `npc:${id}`, reduced, level: home });
    });
    // Vortexes at the game tables (a Vortex for every game)
    const tv = new Set<string>();
    for (const v of this.tables?.vortexes() ?? []) {
      const id = `npc:${v.key}`;
      tv.add(id);
      const st = {
        ...this.npcState({
          x: v.x,
          y: v.y,
          d: dirFromDelta(Math.cos(v.angle), Math.sin(v.angle), 3),
          a: 0,
          mood: v.mood,
        }),
        x: v.x,
        y: v.y,
      };
      engine.upsertAvatar(id, st);
      if (tp) bodies.push({ ...st, id, reduced, level: this.level });
    }
    for (const id of this.tableVortexes) if (!tv.has(id)) engine.removeAvatar(id);
    this.tableVortexes = tv;
    // toys in the air and on the floor (shared/pets.ts): where each is right now
    const toyList: { id: string; kind: string; x: number; y: number; z: number }[] = [];
    const wall = Date.now();
    room.state.toys.forEach((t: S) => {
      if (t.state === "mouth") return;
      const at = toyAt({ fromX: t.fromX, fromY: t.fromY, toX: t.x, toY: t.y, at: t.at, dur: t.dur }, wall);
      toyList.push({ id: t.id, kind: t.kind, x: at.x, y: at.y, z: at.z });
    });
    engine.setToys(toyList);
    if (tp) tp.setToys(toyList);
    // walking over to pick a toy up
    if (this.toyPick && !this.path) {
      const t = room.state.toys.get(this.toyPick);
      if (t && Math.hypot(t.x - this.me.x, t.y - this.me.y) < 1.6) this.send("toy:pick", { id: t.id });
      this.toyPick = null;
    }
    room.state.pets.forEach((pet: S, id: string) => {
      if (!pet.alive) return;
      const pos = interpolate(this.petBuf.get(id) ?? [{ t: 0, x: pet.x, y: pet.y }], renderAt);
      const st = { ...this.petState(pet), x: pos.x, y: pos.y };
      if ((pet.floor ?? 0) === this.level) engine.upsertAvatar(`pet:${id}`, st);
      else if (engine.hasAvatar(`pet:${id}`)) engine.removeAvatar(`pet:${id}`);
      if (tp) bodies.push({ ...st, id: `pet:${id}`, reduced, level: pet.floor ?? 0 });
    });
    this.watchActs();
    engine.update(dt);
    if (tp) {
      // the room as it is (doors swinging, seats taken, edits): only what changed is redrawn
      // build mode: what it shows (ghosts, previews, outlines); things in hand are left out of the room
      const look = hud.get().build.on ? engine.buildLook() : null;
      tp.setBuild(look);
      if (now >= this.tpDue || (look && look.hidden.size !== this.tpHidden)) {
        this.tpDue = now + 200;
        this.tpHidden = look?.hidden.size ?? 0;
        // (every floor's things: the 3D view draws the floors below mine too —
        // my floor's as the iso engine has them: a door swung open for someone
        // passing, a seat taken, a radio's display on live only there)
        // (the lot's cars: drawn by car/cars.ts once it's here)
        const all = [...this.objs.values()]
          .filter((o) => !this.cars || o.kind !== "car")
          .map((o) => engine.getObject(o.id) ?? o);
        tp.update(this.building, look?.hidden.size ? all.filter((o) => !look.hidden.has(o.id)) : all, this.level);
      }
      tp.setLiveFrom({ engine, screens: this.screens, games: this.games, os: this.os });
      tp.setCars(this.slots?.cars() ?? []);
      tp.setTables(this.tables?.scene3d() ?? null);
      tp.gameCam = this.cars?.camera() ?? this.photoCam() ?? this.tables?.gameCam() ?? this.liftCam(now) ?? null;
      if (this.liftsDirty) {
        this.liftsDirty = false;
        tp.setLifts(
          [...this.objs.values()].filter((o) => o.kind === "elevator"),
          this.liftSince,
        );
      }
      tp.setCable(this.cableEnds());
      tp.setGames(this.games?.scene3d() ?? null);
      // (a hidden tab: nothing to draw for)
      tp.tagsHidden = !!hud.get().panel.kind || !!this.photo;
      if (!document.hidden) tp.frame(dt, bodies, localSid);
    } else if (!document.hidden) engine.render();
    for (const cb of this.hudFrames) cb();
    this.checkCable();
    this.updatePrompt();
    if (now - this.peopleAt > 250) {
      this.peopleAt = now;
      this.publishPeople();
    }
    this.follow(now);
    this.updateAudioScene();
  }

  // Room tone follows my area. Each radio and record player plays its own
  // music: loud in its room, faint by the door. The lo-fi I hear is the
  // loudest one's where I stand (and from its side); YouTube on a radio plays
  // in the media chunk's card. The top bar shows the one I hear (or the
  // nearest that plays).
  private updateAudioScene() {
    const area = areaAt(this.map, this.me.x, this.me.y);
    sound.setArea(area?.key ?? "", area?.kind ?? "open");
    let level = 0;
    let pan = 0;
    let loud: { o: WorldObjectDef; r: RadioState } | null = null;
    let near: { o: WorldObjectDef; r: RadioState; d: number } | null = null;
    for (const box of this.engine?.allObjects() ?? []) {
      if (!isRadio(box.kind)) continue;
      const r = radioOf(box);
      if (!r.playing) continue;
      const d = Math.hypot(this.me.x - (box.x + 0.5), this.me.y - (box.y + 0.5));
      if (!near || d < near.d) near = { o: box, r, d };
      if (r.source !== "lofi") continue;
      const same = area?.key === areaAt(this.map, box.x + 0.5, box.y + 0.5)?.key;
      // its own knob too: a radio turned down is quieter, and loses to a louder one
      const l = (same ? Math.max(0.2, Math.min(1, 1 - (d - 2) / 10)) : d < 5 ? 0.12 : 0) * r.volume;
      if (l > level) {
        level = l;
        loud = { o: box, r };
        pan = this.tp
          ? this.tp.pan(this.me, { x: box.x + 0.5, y: box.y + 0.5 })
          : stereoPan(this.me, { x: box.x + 0.5, y: box.y + 0.5 });
      }
    }
    if (loud) {
      radio.play(loud.r.station, loud.r.startedAt);
      radio.setLevel(level, prefs().spatial ? pan * 0.6 : 0);
    } else radio.stop();
    const shown = loud ?? near;
    const was = hud.get().radio;
    const now = shown
      ? {
          id: shown.o.id,
          playing: true,
          station: shown.r.station,
          startedAt: shown.r.startedAt,
          by: shown.r.by,
          source: shown.r.source,
          title: shown.r.source === "yt" ? (shown.r.media?.item?.title ?? "") : "",
        }
      : { id: "", playing: false, station: 0, startedAt: 0, by: "", source: "lofi" as const, title: "" };
    if (JSON.stringify(now) !== JSON.stringify(was)) hud.set({ radio: now });
  }

  private objectsDirty = false;

  private moveLocal(dt: number) {
    // in a car: in my seat (the server says so too: world-server features/cars.ts)
    if (this.cars?.carry(this)) return;
    // on the shuttle: it carries me (the server says where: world-server grounds-life.ts)
    const ride = this.life?.seat(this.room?.state.players.get(this.room.sessionId));
    if (ride) {
      this.path = null;
      this.actions.clear();
      Object.assign(this.me, ride.me);
      this.height.z = ride.z;
      this.meAngle = ride.angle ?? this.meAngle;
      return;
    }
    // my body (docs/plan/29-the-move.md): the movement core on its fixed step, under the keys,
    // the pad or a click-to-walk path (the input chunk: until it's here, I stand still)
    const w = this.walker;
    if (!w) return;
    const first = this.firstPerson();
    const lp = this.room?.state.players.get(this.room.sessionId);
    const playing = !!this.games?.playing();
    if (this.tp) this.tp.padFree = !playing;
    const map = this.map;
    const G = this.G;
    const out = w.frame(dt, {
      grid: this.grid,
      // (outdoors on the land: snow, the trails, the pond's ice; else a floor)
      footing: (x, y) =>
        G && this.grid.onLand(x, y)
          ? G.surfaceTileAt(Math.floor(x + (map.ox ?? 0)), Math.floor(y + (map.oy ?? 0)))
          : "floor",
      // (a car on the move is in the way)
      blocked: this.level === 0 && this.cars ? (x, y) => !!this.cars?.blocks(x, y) : undefined,
      camYaw: this.tp ? this.tp.lookYaw : ISO_UP,
      faceLook: first,
      canJump: !!lp && this.me.a !== ANIM.sit && !lp.busy && !lp.act && !playing,
      // (aiming, in 3D, anywhere: a gun, or the flashlight raised — world/dark/arms.ts; a quick
      // right click on a thing is still its menu)
      canAim: !!this.tp,
      usePad: !playing,
      path: this.path,
      at: { x: this.me.x, y: this.me.y, z: this.height.z },
    });
    const now = performance.now();
    if (out.manual) {
      this.actions.clear();
      this.path = null;
      this.pathTarget = null;
      hud.set({ following: null });
    }
    // (the pad's buttons: X uses, Y the camera, ↑ the torch)
    if (out.presses.has("use")) this.interact();
    if (out.presses.has("camera")) this.swapCamera();
    if (out.presses.has("torch")) this.toggleTorch();
    let moved = out.moved;
    const turned = Math.abs(out.yaw - this.walkYaw) > 1e-4;
    this.walkYaw = out.yaw;
    this.me.x = out.x;
    this.me.y = out.y;
    const hgt = this.height;
    hgt.z = out.z;
    hgt.up = out.up;
    hgt.vz = out.vz;
    // (first person: I keep facing where I look — S walks backwards, A / D sideways)
    if (!first && (moved || turned)) {
      this.meAngle = out.yaw;
      this.me.d = dirFromDelta(Math.cos(out.yaw), Math.sin(out.yaw), this.me.d as 0);
    }
    if (this.path && !this.path.length) {
      this.path = null;
      const target = this.pathTarget;
      this.pathTarget = null;
      if (target?.objectId) this.activateObject(target.objectId, false);
    }
    // a jump: the view's stages from its take-off; everyone else told (after where I am, below)
    const jumped = out.jumped;
    if (jumped) {
      this.jumpTrack.begin(jumped, now - (jumpTimes(jumped).crouch - w.takeoff) * 1000);
      void loadJumps();
      this.activeAt = now;
    }
    const running = out.gait === "sprint";
    // the stairs: past a storey's band my feet are on the next floor up or down
    // (its frame is a storey off, its coords maybe shifted)
    // (only on the stairs: outdoors the ground itself rises and falls by storeys)
    const change = this.grid.onRamp(this.me.x, this.me.y)
      ? floorChange(hgt.z, this.level, floorsOf(this.building))
      : null;
    if (change) {
      const from = this.level;
      const at = across(this.building, from, change.level, this.me);
      w.shift(at.x - this.me.x, at.y - this.me.y, change.dz);
      this.me.x = at.x;
      this.me.y = at.y;
      hgt.z += change.dz;
      // (a way up or down the stairs goes on from where it was, in the new floor's coords)
      const rest = this.path?.map((p) => across(this.building, from, change.level, p)) ?? null;
      if (this.tp) this.tp.carryFrom = from; // (the 3D camera keeps its place in the building)
      this.setLevel(change.level);
      this.path = rest?.length ? rest : null;
      moved = true;
    }
    // (up on something or in the air nobody sits down: a jump over a chair lands on its feet)
    const seat = hgt.up || hgt.z > 0 || this.jumpTrack.kind ? null : this.grid.seatAt(this.me.x, this.me.y);
    // (outdoors on the land: what's underfoot there — snow, the trail, the ice)
    const land = this.grid.onLand(this.me.x, this.me.y);
    const floor = land
      ? this.landFloor()
      : (FLOORS[tileAt(this.map, Math.floor(this.me.x), Math.floor(this.me.y)) as keyof typeof FLOORS] ?? "wood");
    this.life?.hear(dt, this.me, this.map, land && this.level === 0, this.engine?.getDaylight().night ?? 0, this.storm);
    // (on the stairs: a shoe on concrete treads, in the stairwell)
    if (this.grid.onRamp(this.me.x, this.me.y)) {
      stairStep(dt, moved, running);
      sound.step(0, false, false, floor);
    } else sound.step(dt, moved, running, floor);
    if (moved) this.me.a = ANIM.walk;
    else if (seat) {
      this.me.a = ANIM.sit;
      if (this.me.a !== this.lastSent.a) {
        // snap onto the seat and face its direction
        this.me.x = Math.floor(this.me.x) + 0.5;
        this.me.y = Math.floor(this.me.y) + 0.5;
        this.me.d = [1, 3, 5, 7][seat.rot % 4]; // away from the seat's back (server `seatFacing`)
      }
    } else this.me.a = ANIM.idle;
    // a selfie: I face the camera (it's in front of me)
    if (this.photo?.mode === "selfie" && !moved) {
      const a = this.tp ? this.photo.angle : Math.atan2(1, 1);
      this.me.d = dirFromDelta(Math.cos(a), Math.sin(a), this.me.d as 0);
      this.meAngle = a;
    }
    // first person: I face where I look; else a seat, a high-five turns me (input/walker.ts)
    const view = first ? this.tp : null;
    this.meAngle = w.face(this.me, view, moved, this.lookD, this.meAngle, dirFromDelta);
    this.lookD = view ? this.me.d : -1;

    const changed =
      Math.abs(this.me.x - this.lastSent.x) > 0.01 ||
      Math.abs(this.me.y - this.lastSent.y) > 0.01 ||
      Math.abs(this.height.z - this.lastSent.z) > 0.01 ||
      this.level !== this.lastSent.l ||
      this.me.d !== this.lastSent.d ||
      this.me.a !== this.lastSent.a ||
      out.mv !== this.lastMv ||
      out.yawByte !== this.lastYaw ||
      Math.round(this.myPitch * 40) !== this.lastPitch;
    // (aiming: over the shoulder, the body and the torch where I look)
    if (this.tp) this.tp.aim = out.aim;
    // (my torch's battery: low, it flickers)
    if (this.tp) this.tp.battery = w.vitals.bat;
    this.myVerb = out.verb ?? undefined;
    this.myPitch = out.aim && this.tp ? this.tp.aimPitch : 0;
    const go = jumped ?? out.started?.kind;
    // (a jump, a verb: where I took off from first, so the server sees my feet on the ground)
    if ((changed && now - this.lastSent.t >= 1000 / TICK_HZ) || go) {
      const z = Math.round(this.height.z * 1000) / 1000;
      this.send("pos", {
        x: this.me.x,
        y: this.me.y,
        z,
        l: this.level,
        d: this.me.d,
        a: this.me.a,
        seq: ++this.seq,
        mv: out.mv,
        yaw: out.yawByte,
        pitch: Math.round(this.myPitch * 40),
        mt: Math.round(now) >>> 0,
      });
      this.lastSent = { ...this.me, z, t: now, l: this.level };
      this.lastMv = out.mv;
      this.lastYaw = out.yawByte;
      this.lastPitch = Math.round(this.myPitch * 40);
    }
    if (go) this.send("jump", { k: go, h: out.started?.h });
  }

  walkTo(target: Point, objectId?: string, quiet = false): boolean {
    if (hud.get().build.on) return false;
    const path = findPath(this.grid, this.me, target);
    if (!path) {
      if (!quiet) {
        this.engine?.showMarker(target.x, target.y);
        this.tp?.showMarker(target.x, target.y);
      }
      return false;
    }
    this.path = path;
    this.pathTarget = objectId ? { objectId } : null;
    const end = path[path.length - 1] ?? target;
    this.engine?.showMarker(end.x, end.y);
    this.tp?.showMarker(end.x, end.y);
    return true;
  }

  private follow(now: number) {
    const uid = hud.get().following;
    if (uid == null || now - this.followAt < 600) return;
    this.followAt = now;
    const sid = this.uidToSid.get(uid);
    const p = sid ? this.room?.state.players.get(sid) : undefined;
    if (!p) return hud.set({ following: null });
    if (Math.hypot(p.x - this.me.x, p.y - this.me.y) > 1.8) this.walkTo({ x: p.x, y: p.y + 1 });
  }

  // ── interactions ─────────────────────────────────────────────────────────
  private nearestInteractable(): WorldObjectDef | null {
    if (!this.engine) return null;
    let best: WorldObjectDef | null = null;
    let bestD = INTERACT_RANGE;
    const cable = !!hud.get().cable; // a cable in hand: only what it plugs into
    for (const o of this.engine.allObjects()) {
      const e = entry(o.kind);
      if (!e.interact || (cable && !isGameTv(o.kind))) continue;
      const d = reachOf(o, this.me);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    return best;
  }

  // Mouse look (Z, 3D only): the pointer locked, the mouse turns the camera.
  // It lets go by itself when something wants the pointer: a menu, a panel,
  // build mode, a side panel opening, the phone.
  private aimId: string | null = null; // the usable thing under the crosshair
  private lookWas = { menu: false, panel: false, build: false, side: null as string | null, pick: false };
  private toggleLook() {
    const v = this.tp;
    if (!v || hud.get().build.on || window.matchMedia?.("(pointer: coarse)").matches) return;
    v.setLook(!v.looking);
  }
  // C (3D only): third person ↔ first person. Into first person from a key
  // press, mouse look starts at once (half the mode without it).
  private swapCamera() {
    const v = this.tp;
    if (!v || prefs().view === "iso") return;
    const view = prefs().view === "1p" ? "3p" : "1p";
    setPrefs({ view, last3d: view });
    v.setMode(this.camWanted());
    if (view === "1p" && !hud.get().build.on && !window.matchMedia?.("(pointer: coarse)").matches) v.setLook(true);
  }
  private watchLook = () => {
    const h = hud.get();
    const now = { menu: !!h.menu, panel: !!h.panel.kind, build: h.build.on, side: h.side, pick: h.pickArrival };
    const was = this.lookWas;
    this.lookWas = now;
    if (!this.tp?.looking) return;
    const opened =
      (now.menu && !was.menu) ||
      (now.panel && !was.panel) ||
      (now.build && !was.build) ||
      (now.pick && !was.pick) ||
      (now.side !== null && now.side !== was.side);
    if (opened) this.tp.setLook(false);
  };
  // what E / X uses: in mouse look the thing under the crosshair (when it's
  // something to use), else the nearest
  private aimedObject(): WorldObjectDef | null {
    if (!this.aimId || !this.tp?.looking || hud.get().cable) return null;
    const o = this.engine?.getObject(this.aimId);
    return o && entry(o.kind).interact ? o : null;
  }

  private updatePrompt() {
    if (this.cars?.prompt(hud)) return; // (a car: in by its door, or out — car/cars.ts)
    // the shuttle at its stop, near: on (or off, riding)
    const lp = this.room?.state.players.get(this.room.sessionId);
    const ride =
      this.level === 0
        ? (this.life?.prompt(
            this.room?.state.vehicles,
            lp?.busy === RIDING,
            this.me,
            this.map.ox ?? 0,
            this.map.oy ?? 0,
          ) ?? null)
        : null;
    if (ride) {
      const cur = hud.get().prompt;
      if (cur?.objectId !== ride.objectId || cur.label !== ride.label) hud.set({ prompt: ride });
      return;
    }
    // (in an elevator's car its panel is the way to use it: no "X" for it)
    const near = this.aimedObject() ?? this.nearestInteractable();
    const o = near?.kind === "elevator" && hud.get().lift ? null : near;
    const cur = hud.get().prompt;
    const kind = !o ? "" : hud.get().cable ? "plug" : (entry(o.kind).interact as string);
    if ((o?.id ?? null) === (cur?.objectId ?? null) && kind === (cur?.kind ?? "")) return;
    this.engine?.setHighlight(o?.id ?? null);
    this.tp?.setHighlight(this.footprintOf(o?.id));
    hud.set({
      prompt: o ? { objectId: o.id, kind, label: kind === "plug" ? tr("cablePlug") : entry(o.kind).label } : null,
    });
  }

  interact() {
    const p = hud.get().prompt;
    if (p && this.cars?.act(p.kind, p.objectId)) return;
    if (p?.kind === "ride" || p?.kind === "ride:leave") this.send(p.kind === "ride" ? "ride:board" : "ride:leave", {});
    else if (p) this.activateObject(p.objectId, false);
  }

  // ── the lot's cars, driven (docs/plan/28-the-car.md; car/cars.ts, loaded on their own) ──
  private cars: import("./car/cars").Cars | null = null;
  private lifeCars: { id: string; kind: string; x: number; z: number; a: number; shown: boolean }[] = [];

  // ── life on the Grounds (docs/plan/27, phase 6; grounds-life.ts, loaded with them) ──
  private life: import("./grounds-life").GroundsLife | null = null;
  private driveVehicles(dt: number) {
    if (!this.life || !this.room) return;
    const list = this.life.drive(
      dt,
      this.room.state.vehicles,
      this.me,
      this.map.ox ?? 0,
      this.map.oy ?? 0,
      this.level === 0,
    );
    this.lifeCars = list.filter((v) => v.kind !== "sedan" && v.kind !== "offroad");
    this.engine?.grounds?.setVehicles(list, this.me.x, this.me.y);
    this.tp?.setVehicles(this.lifeCars);
  }

  // Moves between people: a spark and its sound where the hands meet (one of
  // the two shows it), heard by whoever's near.
  private actsSeen = new Map<string, string>();
  private watchActs() {
    const room = this.room;
    if (!room) return;
    room.state.players.forEach((p: S, sid: string) => {
      const key = p.act ? `${p.act}|${p.actAt}` : "";
      if (this.actsSeen.get(sid) === key) return;
      this.actsSeen.set(sid, key);
      const act = p.act as string;
      if (!isSocial(act) || act === "wave" || act === "give") return;
      const other = room.state.players.get(p.actWith);
      if (other?.act === act && sid > p.actWith) return;
      setTimeout(() => {
        const a = this.whereIs(sid);
        const b = this.whereIs(p.actWith);
        if (!a || !b) return;
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const d = Math.hypot(mid.x - this.me.x, mid.y - this.me.y);
        this.engine?.puff(mid.x, mid.y, "spark", act === "highfive" ? 66 : 44);
        socialSound(act, Math.max(0, 1 - d / 9));
      }, SOCIAL_MS[act] * CONTACT);
    });
  }

  // Where someone is drawn right now (me: where I am).
  private whereIs(sid: string): Point | null {
    if (sid === this.room?.sessionId) return { x: this.me.x, y: this.me.y };
    const r = this.remotes.get(sid);
    return r ? interpolate(r.buf, performance.now() - INTERP_MS) : null;
  }

  // ── the action menu ──────────────────────────────────────────────────────
  private facedAct = 0;

  // What can be done with it, with a title (and a line about it): null when
  // there's nothing to do.
  menuFor(target: ActTarget): { title: string; subtitle?: string; items: { act: string; ok: boolean }[] } | null {
    const room = this.room;
    const me = room?.state.players.get(room.sessionId);
    if (!room || !me) return null;
    if (target.type === "self") {
      const items = [{ act: "look", ok: true }];
      if (me.held) items.push({ act: "putDown", ok: true });
      if (me.focus) items.push({ act: "unfocus", ok: true });
      items.push({ act: "arriveHere", ok: true });
      if (hud.get().mySpawn) items.push({ act: "arriveUsual", ok: true });
      // a pet off exploring (or told to stay) somewhere: called back from here
      if (this.petsAway().length) items.push({ act: "callPets", ok: true });
      return { title: me.name, items };
    }
    if (target.type === "pet") {
      const pet = room.state.pets.get(target.id);
      const P = petsArt();
      if (!pet || !pet.alive || !P) return null;
      const mine = pet.sid === room.sessionId;
      const items: { act: string; ok: boolean }[] = [{ act: "petpet", ok: !pet.battle }];
      const sp = pet.species as Species;
      if (mine) {
        const free = !pet.battle;
        items.push({ act: "snack", ok: free }, { act: "water", ok: free }, { act: "speak", ok: free });
        const far = Math.hypot(pet.x - me.x, pet.y - me.y) > 3;
        if (far) items.push({ act: "come", ok: free });
        if (pet.mode !== "follow") items.push({ act: "followMe", ok: free });
        if (pet.mode !== "explore") items.push({ act: "explore", ok: free });
        if (pet.mode !== "stay") items.push({ act: "stay", ok: free });
        if (pet.mode !== "sleep") items.push({ act: "sleep", ok: free });
        const t = safeParse(pet.tricks) as Record<string, number>;
        const known = P.tricksFor(sp).filter((x) => P.learned(t, x));
        if (known.length) items.push({ act: `trick_${known[0]}`, ok: free });
        items.push({ act: "petCare", ok: true });
      } else {
        const myFree =
          [...room.state.players.values()].length > 0 && hud.get().pets.some((x) => x.mine && x.alive && !x.battle);
        items.push({ act: "challenge", ok: myFree && !pet.battle }, { act: "petCare", ok: true });
      }
      const feeling = tr(`feel_${P.feelingOf(petNeeds(pet))}` as never);
      return { title: pet.name, subtitle: `${tr(`sp_${sp}` as never)} · Lv ${pet.level} · ${feeling}`, items };
    }
    if (target.type === "person") {
      const p = room.state.players.get(target.sid);
      if (!p) return null;
      const can = socialFor({ held: me.held, status: me.status }, { held: p.held, status: p.status });
      const items: { act: string; ok: boolean }[] = SOCIAL.map((act) => ({ act, ok: can.includes(act) }))
        // cheers and give only make sense with drinks about
        .filter((i) => i.ok || (i.act !== "cheers" && i.act !== "give"));
      items.push({ act: "follow", ok: true }, { act: "profile", ok: true });
      return { title: p.name, subtitle: p.focus ? tr("focusing") : undefined, items };
    }
    const o = this.engine?.getObject(target.id);
    if (!o) return null;
    // someone else's desk: whose (and who they are, when they're here)
    const owner = Number(o.props?.ownerId);
    if (o.kind === "desk" && owner && owner !== this.myUid()) {
      if (!this.uidToSid.has(owner)) return null;
      return {
        title: `${String(o.props?.ownerName ?? "").split(" ")[0]} · ${entry(o.kind).label}`,
        items: [{ act: "profile", ok: true }],
      };
    }
    const acts = objectActions(o, {
      uid: this.myUid(),
      focus: !!me.focus,
      radioOn: radioOf(o).playing,
      mayLock: (d) => mayLockDoor(this.map, d, { uid: this.myUid(), admin: me.admin }),
    });
    if (!acts.length) return null;
    const e = entry(o.kind);
    const title = o.kind === "tabletop" && o.props?.d === "desklamp" ? tr("deskLamp") : e.label;
    return { title, items: acts.map((act) => ({ act, ok: true })) };
  }

  openMenu(target: ActTarget, at: { x: number; y: number }): boolean {
    const m = this.menuFor(target);
    if (!m) return false;
    mixer.blip("click");
    hud.set({ menu: { x: at.x, y: at.y, target, ...m } });
    return true;
  }

  closeMenu() {
    if (hud.get().menu) hud.set({ menu: null });
  }

  // Picked from the menu: queued (walk there, then do it).
  pickAction(act: string) {
    const m = hud.get().menu;
    if (!m) return;
    hud.set({ menu: null });
    // looking things up happens at once (no need to walk over)
    const t = m.target;
    const desk = t.type === "object" ? this.engine?.getObject(t.id) : undefined;
    const owner = Number(desk?.props?.ownerId);
    if (act === "profile" && desk) return hud.set({ inspect: owner });
    if (act === "profile" && t.type === "person") {
      const p = this.room?.state.players.get(t.sid);
      if (p) hud.set({ inspect: p.uid });
      return;
    }
    if (act === "look") return hud.set({ panel: { kind: "avatar" } });
    // a pet's commands need no walking over; care, toys and lessons do
    if (t.type === "pet") {
      const id = t.id;
      if (act === "petCare") return hud.set({ panel: { kind: "pets" }, petFocus: id });
      const cmd = act === "followMe" ? "follow" : act;
      if (
        cmd === "come" ||
        cmd === "stay" ||
        cmd === "follow" ||
        cmd === "explore" ||
        cmd === "sleep" ||
        cmd === "speak"
      )
        return this.send("pet:cmd", { id, cmd });
      const tk = act.slice(6);
      if (act.startsWith("trick_") && petsArt()?.isTrick(tk))
        return this.send("pet:cmd", { id, cmd: "trick", trick: tk as never });
    }
    if (act === "arriveHere") return this.setArrival({ x: this.me.x, y: this.me.y });
    if (act === "arriveUsual") return this.setArrival(null);
    if (act === "callPets") {
      for (const id of this.petsAway()) this.send("pet:cmd", { id, cmd: "follow" });
      return;
    }
    this.actions.add(act, m.target, m.title);
  }

  activateObject(id: string, walkIfFar: boolean) {
    const o = this.engine?.getObject(id);
    if (!o) return;
    const e = entry(o.kind);
    if (!e.interact) return;
    const { w, h } = placedFootprint(o);
    // an elevator (shared lift.ts): its doors open here, a click takes me in;
    // shut, I call it to my floor (from in front of its doors). In it, its
    // panel does the rest.
    if (e.interact === "lift") {
      if (inLift(o, this.me)) return;
      if (o.props?.door === "open" && liftHere(o, this.map)) {
        if (walkIfFar) this.walkTo({ x: o.x + w / 2, y: o.y + h / 2 });
        return;
      }
      const front = liftFront(o);
      if (Math.hypot(front.x - this.me.x, front.y - this.me.y) > 2) {
        const to = walkIfFar ? this.grid.nearestOpen(front.x, front.y, 3) : null;
        if (to) this.walkTo(to, id);
        return;
      }
      mixer.blip("click");
      this.send("lift:call", { id });
      if (o.props?.door !== "open") toast(tr("liftCalled"));
      return;
    }
    // a computer: sit down at its desk (the seat nearest me), else stand in front of it
    if (isComputer(o.kind) && computerAway(o, this.me) > COMPUTER_REACH - 0.15) {
      if (!walkIfFar) return;
      let seat: { x: number; y: number } | null = null;
      let best = Number.POSITIVE_INFINITY;
      for (let y = o.y - 1; y <= o.y + 1; y++)
        for (let x = o.x - 1; x <= o.x + 1; x++) {
          if (!this.grid.seatAt(x + 0.5, y + 0.5)) continue;
          const d = Math.hypot(x + 0.5 - this.me.x, y + 0.5 - this.me.y);
          if (d < best) {
            best = d;
            seat = { x: x + 0.5, y: y + 0.5 };
          }
        }
      const to =
        seat ?? this.grid.nearestOpen(o.x + 0.5, o.y - 0.5, 3) ?? this.grid.nearestOpen(o.x + 0.5, o.y + 1.5, 3);
      if (to) this.walkTo(to, id);
      return;
    }
    if (!isComputer(o.kind) && reachOf(o, this.me) > INTERACT_RANGE + 0.3) {
      if (!walkIfFar) return;
      // walk to the nearest open tile in front of it (a wall item: its side of the wall), then open
      const spot = e.wall ? hangSpot(o, 0.7) : null;
      const front = spot
        ? this.grid.nearestOpen(spot.x, spot.y, 4)
        : (this.grid.nearestOpen(o.x + w / 2, o.y + h + 0.5, 4) ?? this.grid.nearestOpen(o.x + w / 2, o.y + h / 2, 4));
      if (front) this.walkTo(front, id);
      return;
    }
    // turn to face it
    const ox = o.x + w / 2;
    const oy = o.y + h / 2;
    if (Math.hypot(ox - this.me.x, oy - this.me.y) > 0.2)
      this.me.d = dirFromDelta(ox - this.me.x, oy - this.me.y, this.me.d as 0);
    // a console's cable in hand: into this TV (the server says if it reaches)
    const cable = hud.get().cable;
    if (cable) {
      if (isGameTv(o.kind)) this.send("game:plug", { id: cable.consoleId, tv: id });
      else toast(tr("cableNotHere"), "warn");
      return;
    }
    if (e.interact === "coffee" || e.interact === "water" || e.interact === "vending") {
      // the machine does its thing (a moment, its sound), then hands you a
      // drink, sipped little by little (shared/held.ts)
      if (performance.now() < this.usingUntil) return;
      const how = {
        coffee: ["brew", 1600, "coffeeMade"],
        water: ["pour", 1000, "waterPoured"],
        vending: ["clunk", 900, "sodaBought"],
      } as const;
      const [snd, ms, msg] = how[e.interact];
      this.usingWhat = e.interact;
      this.usingUntil = performance.now() + ms;
      machineSound(snd);
      setTimeout(() => {
        this.send("item:take", { id });
        toast(tr(msg));
      }, ms);
      return;
    }
    if (e.interact === "piano") {
      this.onOpenPanel("piano", id);
      return;
    }
    if (e.interact === "lamp") {
      mixer.blip("click");
      this.send("lamp:set", { id, on: o.props?.on === false });
      return;
    }
    // (no panel for a switch: one opened anyway would swallow the keys)
    if (e.interact === "switch") {
      mixer.blip("click");
      this.send("lights:room", { id, on: o.props?.on === false });
      return;
    }
    if (e.interact === "terminal") this.send("vortex:poke", {});
    // a computer: the server says if it's mine (computer:ok opens its panel)
    if (e.interact === "computer") {
      this.send("computer:use", { id });
      return;
    }
    // a pet's bowl: fill it; the toy box: the Pets cabinet's Play deck (no panel of their own)
    if (e.interact === "petbowl" || e.interact === "waterbowl") {
      mixer.blip("click");
      this.send("pet:bowl", { id });
      return;
    }
    if (e.interact === "toybox") {
      this.onOpenPanel("pets", id);
      return;
    }
    // a media TV with a console plugged in: the TV's own panel (its inputs, the remote among them)
    const plugged =
      e.interact === "media" &&
      isGameTv(o.kind) &&
      !!this.engine?.allObjects().some((x) => isConsole(x.kind) && x.props?.tv === id);
    this.onOpenPanel(plugged ? "tv" : e.interact, id);
  }

  // ── people / HUD ─────────────────────────────────────────────────────────
  private publishPeople() {
    const room = this.room;
    if (!room) return;
    const people: Person[] = [];
    let me: Person | null = null;
    room.state.players.forEach((p: S, sid: string) => {
      const local = sid === room.sessionId;
      const x = local ? this.me.x : p.x;
      const y = local ? this.me.y : p.y;
      const area = areaAt(this.map, x, y);
      const row: Person = {
        sid,
        uid: p.uid,
        name: p.name,
        avatar: p.avatar ?? "",
        area: area?.key ?? "",
        areaName: area?.name ?? "",
        status: p.status,
        mic: p.mic,
        cam: p.cam,
        screen: p.screen,
        speaking: p.speaking,
        bot: p.bot,
        muted: p.muted,
        hearing: this.hear.has(sid),
        x,
        y,
      };
      if (local) me = row;
      else people.push(row);
    });
    people.sort((a, b) => Number(b.hearing) - Number(a.hearing) || a.name.localeCompare(b.name));
    const st = this.engine?.stats();
    hud.set({ me, people, fps: Math.round(st?.fps ?? 0) });
    const vx = room.state.npcs.get("vortex");
    hud.set({ vortex: vx ? { x: vx.x, y: vx.y, say: vx.say, sayAt: vx.sayAt, mood: vx.mood } : null });
    const petsAt: { x: number; y: number }[] = [];
    room.state.pets.forEach((pet: S) => {
      if (pet.sid === room.sessionId && pet.alive) petsAt.push({ x: pet.x, y: pet.y });
    });
    if (petsAt.length || hud.get().myPetsAt.length) hud.set({ myPetsAt: petsAt });
    this.publishPets();
  }

  // ── pets ─────────────────────────────────────────────────────────────────
  private petState(pet: S): AvatarState {
    const view: PetView = {
      id: pet.id,
      species: pet.species as Species,
      look: petLook(pet),
      outfit: petOutfit(pet),
      mode: pet.mode,
      act: pet.act,
      actAt: pet.actAt,
      feeling: petsArt()?.feelingOf(petNeeds(pet)) ?? "ok",
      level: pet.level,
      mine: pet.sid === this.room?.sessionId,
      hurtAt: this.petHurt.get(pet.id),
      lookAt: this.whereIs(pet.sid),
      carry: pet.carry || null,
    };
    return {
      name: pet.name,
      avatar: VORTEX_LOOK,
      x: pet.x,
      y: pet.y,
      d: pet.d,
      a: pet.a,
      status: "online",
      speaking: false,
      emote: pet.want && Date.now() - pet.wantAt < WANT_MS ? pet.want : "", // what it wants, over its head
      mic: false,
      pet: view,
    };
  }

  // My pets not at my heels (exploring, staying put): "Call my pets" brings them.
  private petsAway(): string[] {
    const room = this.room;
    const out: string[] = [];
    room?.state.pets.forEach((pet: S) => {
      if (pet.sid === room.sessionId && pet.alive && !pet.battle && (pet.mode === "explore" || pet.mode === "stay"))
        out.push(pet.id);
    });
    return out;
  }

  // The pets in the room and the battle I'm in, for the panel and the menus.
  private petsKey = "";
  publishPets() {
    const room = this.room;
    if (!room) return;
    const mySid = room.sessionId;
    const pets: PetInfo[] = [];
    room.state.pets.forEach((pet: S) => {
      pets.push({
        id: pet.id,
        uid: pet.uid,
        owner: pet.owner,
        mine: pet.sid === mySid,
        name: pet.name,
        species: pet.species as Species,
        look: petLook(pet),
        outfit: petOutfit(pet),
        needs: petNeeds(pet),
        xp: pet.xp,
        level: pet.level,
        tricks: safeParse(pet.tricks) as Record<string, number>,
        alive: pet.alive,
        wins: pet.wins,
        losses: pet.losses,
        mode: pet.mode,
        act: pet.act,
        battle: pet.battle,
        near: Math.hypot(pet.x - this.me.x, pet.y - this.me.y) <= 2.8,
        want: pet.want,
        traits: safeParse(pet.traits) as PetInfo["traits"],
        bonds: safeParse(pet.bonds) as PetInfo["bonds"],
      });
    });
    pets.sort((a, b) => Number(b.mine) - Number(a.mine) || a.name.localeCompare(b.name));
    let battle: BattleView | null = null;
    room.state.battles.forEach((b: S) => {
      const mine = b.sidA === mySid ? "a" : b.sidB === mySid ? "b" : null;
      if (b.phase === "offer" || (!mine && battle)) return;
      if (mine || !battle)
        battle = {
          id: b.id,
          a: b.a,
          b: b.b,
          mine,
          hpA: b.hpA,
          hpB: b.hpB,
          maxA: b.maxA,
          maxB: b.maxB,
          moveA: b.moveA,
          moveB: b.moveB,
          round: b.round,
          phase: b.phase,
          until: b.until,
          log: safeParseList(b.log) as BattleEvent[],
          winner: b.winner,
        };
    });
    const key = JSON.stringify([pets, battle]);
    if (key === this.petsKey) return;
    this.petsKey = key;
    hud.set({ pets, battle });
  }

  // A round played out: who got hit flashes, and the sounds of it.
  private watchBattle(b: S) {
    const key = `${b.id}|${b.round}|${b.phase}`;
    if (this.battleSeen === key) return;
    this.battleSeen = key;
    if (b.phase !== "anim") return this.publishPets();
    const log = safeParseList(b.log) as BattleEvent[];
    let at = 0;
    for (const ev of log) {
      if (!ev.dmg) continue;
      const hit = ev.who === "a" ? b.b : b.a;
      at += 350;
      setTimeout(() => {
        this.petHurt.set(hit, performance.now());
        const pet = this.room?.state.pets.get(hit);
        if (pet) {
          const d = Math.hypot(pet.x - this.me.x, pet.y - this.me.y);
          this.engine?.puff(pet.x, pet.y, "spark", 40);
          socialSound("fistbump", Math.max(0, 1 - d / 10));
        }
      }, at);
    }
    this.publishPets();
  }

  private petEvent(m: ServerMessages["pet:event"]) {
    if (!petsArt()) return void loadPets().then(() => this.petEvent(m)); // (its strings come with the chunk)
    const pet = this.room?.state.pets.get(m.id);
    const name = pet?.name ?? "";
    const trick = m.trick ? tr(`trick_${m.trick}` as never) : "";
    const text = tr(`petEv_${m.kind}` as never)
      .replace("{name}", name)
      .replace("{n}", String(m.n ?? ""))
      .replace("{trick}", trick);
    if (!text) return;
    if (m.kind === "levelUp" || m.kind === "learned" || m.kind === "won") fanfare(0.6);
    toast(text, m.kind === "died" ? "warn" : "info");
  }

  // A toy in my hand thrown where I click (or the laser pointed there): true when it was.
  private throwAt(x: number, y: number, mods: boolean): boolean {
    const me = this.room?.state.players.get(this.room.sessionId);
    const held = me?.held;
    if (!held || !isToyHeld(held)) return false;
    const armed = hud.get().throwArm;
    if (!armed && !mods) return false;
    if (armed) hud.set({ throwArm: false });
    if ((THROWN as readonly string[]).includes(held)) this.send("toy:throw", { x, y });
    else if (held === "laser") this.send("laser:point", { x, y });
    else return false;
    this.actions.clear();
    return true;
  }
  armThrow(on = true) {
    hud.set({ throwArm: on });
  }
  // A toy on the floor clicked: picked up (walking over first)
  pickToy(id: string) {
    const t = this.room?.state.toys.get(id);
    if (!t || t.state !== "floor") return;
    if (Math.hypot(t.x - this.me.x, t.y - this.me.y) < 1.6) return this.send("toy:pick", { id });
    this.actions.clear();
    this.toyPick = id;
    this.walkTo({ x: t.x, y: t.y });
  }
  // Take a toy into my hand (from the Pets panel; the toy box hands them out too)
  takeToy(toy: string) {
    this.send("toy:take", { toy: toy as never });
  }

  // Answering a battle proposed to me, and my move each round.
  answerChallenge(accept: boolean) {
    const c = hud.get().challenge;
    if (!c) return;
    hud.set({ challenge: null });
    this.send("pet:answer", { battle: c.battle, accept });
  }
  battleMove(move: string) {
    const b = hud.get().battle;
    if (!b || !b.mine) return;
    this.send("pet:move", { battle: b.id, move: move as never });
  }

  setStatus(status: "online" | "away" | "dnd") {
    this.send("status", { status });
  }

  // ── jumping ─────────────────────────────────────────────────────────────

  // my jump as the views show it, my feet's height and what's under them
  private myJump(now: number): { jump?: JumpNow; z: number; ground: number } {
    const h = this.height;
    const ground = this.grid.groundAt(this.me.x, this.me.y, h.z);
    const hold = this.jumpHold;
    if (hold) return { jump: jumpNowAt(hold.kind, hold.t) ?? undefined, z: h.z + jumpArc(hold.kind, hold.t).h, ground };
    return { jump: this.jumpTrack.update(now, h.up) ?? undefined, z: h.z, ground };
  }

  // someone else's: from when it showed up here, as late as their position is drawn
  private theirJump(r: Remote, p: S, at: { x: number; y: number; z: number }, now: number) {
    const key = `${p.jump}|${p.jumpAt}`;
    if (key !== r.jumpKey) {
      r.jumpKey = key;
      if (isJump(p.jump)) r.track.begin(p.jump, now + INTERP_MS);
      r.verbAt = now + INTERP_MS;
      void loadJumps();
    }
    const ground = this.grid.groundAt(at.x, at.y, at.z);
    const jump = r.track.update(now, at.z > ground + 0.03) ?? undefined;
    return { jump, z: at.z, ground };
  }

  // dust kicked up at take-off and thrown out on landing, a whoosh, a thud (`near`: 0..1, how loud)
  private jumpEffects(id: string, st: { x: number; y: number; jump?: JumpNow; ground?: number }, near: number) {
    const stage = st.jump?.stage ?? "";
    const was = this.jumpStages.get(id) ?? "";
    if (stage === was) return;
    if (stage) this.jumpStages.set(id, stage);
    else this.jumpStages.delete(id);
    const j = st.jump;
    if (!j) return;
    const hard = j.kind === "flip" ? 1 : 0.6;
    const floor = this.grid.onLand(st.x, st.y)
      ? this.landFloor(st.x, st.y)
      : (FLOORS[tileAt(this.map, Math.floor(st.x), Math.floor(st.y)) as keyof typeof FLOORS] ?? "wood");
    // (up on something the dust is on its top)
    const lift = (st.ground ?? 0) * ZPX_TILE;
    if (stage === "air" && was === "crouch") {
      this.engine?.puff(st.x, st.y, "kick", lift, hard);
      if (near > 0) jumps()?.jumpSound(j.kind, near);
    } else if (stage === "land") {
      this.engine?.puff(st.x, st.y, "land", lift, hard);
      if (near > 0) jumps()?.landSound(j.kind, st.ground ? "wood" : floor, near);
    }
  }

  emote(i: number) {
    const e = EMOTES[i];
    if (e) this.send("emote", { e });
  }

  teleport(to: ClientMessages["teleport"]["to"]) {
    this.path = null;
    this.send("teleport", { to });
  }

  // ── my own arrival point (features/arrival.ts on the server) ─────────────
  private arrivalAsked = false; // I changed it this session (so the pin flashes)
  private arrivalFlash: ReturnType<typeof setTimeout> | null = null;

  // choose it on the map: the next floor click sets it (Esc cancels)
  pickArrival(on: boolean) {
    hud.set({ pickArrival: on, menu: null });
    if (on) this.actions.clear();
    if (this.arrivalFlash) clearTimeout(this.arrivalFlash);
    this.engine?.showMine(on ? hud.get().mySpawn : null);
  }

  // here (a tile), or null: back to the space's arrival point
  setArrival(at: Point | null) {
    this.arrivalAsked = true;
    this.send("spawn:mine", { at: at && { x: Math.floor(at.x), y: Math.floor(at.y) } });
    if (hud.get().pickArrival) this.pickArrival(false);
  }

  private hoverArrival(x: number, y: number) {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    const ok = this.grid.ok(tx, ty) && this.grid.fits(tx + 0.5, ty + 0.5);
    this.engine?.showMine(hud.get().mySpawn, { x: tx, y: ty, ok });
  }

  private flashArrival() {
    if (this.arrivalFlash) clearTimeout(this.arrivalFlash);
    this.engine?.showMine(hud.get().mySpawn);
    this.arrivalFlash = setTimeout(() => {
      if (!hud.get().pickArrival) this.engine?.showMine(null);
    }, 2500);
  }

  admit(k: { from: string; area: string }) {
    const p = this.room?.state.players.get(k.from);
    if (p) this.send("admit", { userId: p.uid, area: k.area });
    hud.set((s) => ({ knocks: s.knocks.filter((x) => x.from !== k.from) }));
  }

  dismissKnock(from: string) {
    hud.set((s) => ({ knocks: s.knocks.filter((x) => x.from !== from) }));
  }

  async toggleMic() {
    const on = !hud.get().media.mic;
    const err = await this.media.setMic(on);
    if (err === "blocked") toast(tr("micBlocked"), "warn");
    else if (err === "offline") toast(tr("avOffline"), "warn");
    // anything else (no device, the call's media link not up…): say so
    else if (err) toast(`${tr("micFailed")} (${err})`, "warn", 8000);
    else mixer.blip(on ? "pop" : "tape");
  }

  async toggleCam() {
    const err = await this.media.setCam(!hud.get().media.cam);
    if (err === "blocked") toast(tr("camBlocked"), "warn");
    else if (err === "offline") toast(tr("avOffline"), "warn");
    else if (err) toast(`${tr("camFailed")} (${err})`, "warn", 8000);
  }

  async toggleScreen() {
    const on = !hud.get().media.screen;
    const err = await this.media.setScreen(on);
    if (err === "offline") toast(tr("avOffline"), "warn");
    else if (err === "system") toast(tr("screenBlocked"), "warn", 9000);
    else if (err) toast(`${tr("screenFailed")} (${err})`, "warn");
    else if (on && hud.get().media.screen) mixer.blip("pop");
  }

  myUid(): number {
    return this.session?.user.id ?? 0;
  }
  myName(): string {
    return this.session?.user.name ?? "";
  }

  personByUid(uid: number) {
    const sid = this.uidToSid.get(uid);
    return sid ? this.room?.state.players.get(sid) : undefined;
  }

  // The stage screen shows whoever is sharing from the stage (if I can hear them).
  private syncStageScreen() {
    const engine = this.engine;
    const room = this.room;
    if (!engine || !room) return;
    const screens = hud.get().screens;
    let video: HTMLVideoElement | null = null;
    room.state.players.forEach((p: S) => {
      const a = areaAt(this.map, p.x, p.y);
      if (a?.kind === "stage" && screens[String(p.uid)]) video = screens[String(p.uid)];
    });
    const stageScreen = engine.allObjects().find((o) => o.kind === "screen_wall" && o.props?.source === "stage");
    if (stageScreen) engine.setScreenVideo(stageScreen.id, video);
  }

  private vortexListeners = new Set<(text: string) => void>();

  onVortexSay(fn: (text: string) => void) {
    this.vortexListeners.add(fn);
    return () => {
      this.vortexListeners.delete(fn);
    };
  }

  // ── whiteboards ──────────────────────────────────────────────────────────
  private wbScenes = new Map<string, WbItem[]>();
  private wbListeners = new Set<(objectId: string, items: WbItem[]) => void>();

  onWhiteboard(fn: (objectId: string, items: WbItem[]) => void) {
    this.wbListeners.add(fn);
    return () => {
      this.wbListeners.delete(fn);
    };
  }

  whiteboardItems(objectId: string): WbItem[] {
    return this.wbScenes.get(objectId) ?? this.persistedScene(objectId);
  }

  private persistedScene(objectId: string): WbItem[] {
    const scene = this.engine?.getObject(objectId)?.props?.scene;
    return Array.isArray(scene) ? [...(scene as WbItem[])] : [];
  }

  private emitWb(objectId: string) {
    const items = this.whiteboardItems(objectId);
    this.engine?.setWhiteboard(objectId, items);
    for (const f of this.wbListeners) f(objectId, items);
  }

  // The light follows the world's hour (art/daylight.ts: day, golden hour, dusk,
  // night): São Paulo's, held by the server (shared clock.ts), a minute at a
  // time; round to one an admin sets at an hour a second.
  private updateNight(first = false) {
    const st = this.room?.state;
    const d = (((st?.players.size ? st.hour : spHour(Date.now())) - this.hour + 36) % 24) - 12;
    if (!first && Math.abs(d) < 1 / 60) return;
    this.hour = (this.hour + Math.max(-1, Math.min(1, d)) + 24) % 24;
    this.engine?.setClock(this.hour);
    this.tp?.setHour(this.hour);
  }
  private hour = spHour(Date.now());

  // ── third person (world/tp, its own chunk) ─────────────────────────────────
  // A per-player way of seeing the same world: the iso engine keeps running
  // (it's what everything else asks about the room) but stops drawing, and a
  // three.js view behind you draws the same people and things. Build mode
  // always opens in iso.
  tp: ThirdPersonView | null = null;
  private tpHost: HTMLDivElement | null = null;
  private tpLoading = false;
  private tpDue = 0;
  private tpHidden = 0;
  private meAngle = 0; // my facing in 3D (free; others see the nearest of 8)
  private lookD = -1; // first person: the 8-way facing I last set from where I look
  private viewNow: "iso" | "3d" = "iso";

  // the 3D camera the prefs ask for (first person steps back out to the
  // chase camera while build mode is on: placing things from inside your
  // head is awkward)
  private camWanted(): CamMode {
    // the phone's camera: Photo is my eyes, Selfie a camera out in front of me
    if (this.photo) return this.photo.mode === "photo" ? "first" : "chase";
    if (prefs().view === "1p") return hud.get().build.on ? "chase" : "first";
    return prefs().cam3p;
  }
  // in my head (the first-person camera is showing)
  firstPerson(): boolean {
    return this.tp?.mode === "first";
  }

  private syncView() {
    if (!this.engine || !this.room) return;
    // (in a car: the 3D view, its camera the car's — back to iso on the way out)
    const want = prefs().view === "iso" && !this.cars?.inCar() ? "iso" : "3d";
    this.tp?.setMode(this.camWanted());
    if (this.tp) {
      this.tp.lookSens = prefs().lookSens;
      this.tp.lookInvert = prefs().lookInvert;
      this.tp.handsOn = prefs().hands1p;
    }
    if (want === this.viewNow) return;
    this.viewNow = want;
    if (want === "3d") void this.openTp();
    else this.closeTp();
  }

  private async openTp() {
    if (this.tp || this.tpLoading) return;
    this.tpLoading = true;
    try {
      const [{ ThirdPersonView }, P, items, themes] = await Promise.all([
        import("./tp/view"),
        loadPeople(),
        loadItemArt() as Promise<typeof import("./art/items")>,
        loadThemes(),
      ]);
      const engine = this.engine;
      if (this.stopped || this.viewNow !== "3d" || !engine) return;
      const host = document.createElement("div");
      host.style.cssText = "position:absolute;inset:0";
      this.host.appendChild(host);
      const v = new ThirdPersonView(this.building, [...this.objs.values()], P, items, {
        keys: false,
        themes,
        level: this.level,
      });
      v.prints = this.life?.prints ?? null;
      v.events = {
        floor: (x, y, mods) => engine.events.onTileClick?.(x, y, mods),
        person: (id, at) => engine.events.onAvatarClick?.(id, at),
        toy: (id) => engine.events.onToyClick?.(id),
        object: (id, at) => engine.events.onObjectClick?.(id, at),
        // build mode: the iso build controller, fed the floor under the 3D pointer
        buildMove: (x, y, at) => {
          // (canvas px, as the iso engine keeps it: drags measure by it)
          const r = engine.app.canvas.getBoundingClientRect();
          engine.pointerAt = { gx: at.x - r.left, gy: at.y - r.top };
          engine.events.onPointerWorld?.(x, y);
        },
        buildDown: (x, y) => engine.events.onPointerDown?.(x, y),
        buildUp: (x, y) => engine.events.onPointerUp?.(x, y),
        wheel: (dy) => engine.events.onWheel?.(dy) ?? false,
        look: (on) => {
          hud.set({ look: on });
          if (!on) this.aimId = null;
        },
        lookRefused: () => toast(tr("lookRefused")),
        aim: (at) => {
          this.aimId = at?.object ?? null;
          this.updatePrompt();
        },
      };
      // what's under the pointer and where things are on screen: as this camera sees them
      engine.picksOverride = (filter) =>
        v
          .picksAtPointer()
          .filter((p) => {
            if (p.dress) return true;
            const o = engine.getObject(p.id);
            return !!o && !!entry(o.kind).buildable && (!filter || filter(o));
          })
          .map((p) =>
            p.dress ? { id: p.id, dress: true as const, kind: p.kind ?? "" } : { id: p.id, dress: false as const },
          );
      engine.clientOverride = (x, y, z) => v.project(x, y, z / 39.19) ?? { x: -9999, y: -9999 };
      engine.floorOverride = (cx, cy, z) => v.floorAt(cx, cy, z / 39.19) ?? { x: -1, y: -1 };
      engine.rayOverride = (cx, cy) => v.rayAt(cx, cy);
      engine.throughOverride = () => v.lookedThrough();
      v.mount(host);
      v.setQuality(this.qualityNow());
      v.setMode(this.camWanted());
      v.lookSens = prefs().lookSens;
      v.lookInvert = prefs().lookInvert;
      v.handsOn = prefs().hands1p;
      v.setHour(this.hour);
      v.yaw = this.meAngle; // start behind me
      engine.app.canvas.style.visibility = "hidden";
      engine.onPuff = (x, y, kind, lift, hard) => v.puff(x, y, kind, lift, hard);
      this.tp = v;
      this.tpHost = host;
      v.setHighlight(this.footprintOf(hud.get().prompt?.objectId));
    } catch (e) {
      console.error("third person", e);
      toast(tr("failed"));
      setPrefs({ view: "iso" });
    } finally {
      this.tpLoading = false;
    }
  }

  private closeTp() {
    this.tp?.destroy();
    this.aimId = null;
    if (hud.get().look) hud.set({ look: false });
    this.tp = null;
    this.tpHost?.remove();
    this.tpHost = null;
    const e = this.engine;
    if (e) {
      e.onPuff = null;
      e.picksOverride = null;
      e.clientOverride = null;
      e.floorOverride = null;
      e.rayOverride = null;
      e.throughOverride = null;
      e.app.canvas.style.visibility = "";
    }
  }

  // the floor outline of a thing (wall items: just in front of their wall)
  private footprintOf(id: string | undefined): { x: number; y: number; w: number; h: number } | null {
    const o = id ? this.engine?.getObject(id) : undefined;
    if (!o) return null;
    if (entry(o.kind).wall) {
      const r = hangStrip(o, 0.6);
      return { x: r.x0, y: r.y0, w: r.x1 - r.x0, h: r.y1 - r.y0 };
    }
    const { w, h } = placedFootprint(o);
    return { x: o.x - 0.08, y: o.y - 0.08, w: w + 0.16, h: h + 0.16 };
  }

  // A speech bubble over someone (Vortex, a pet), in both views (switching keeps it).
  private say(id: string, text: string, ms?: number) {
    this.engine?.say(id, text, ms);
    this.tp?.say(id, text, ms);
  }

  // Where a world point is on screen (canvas px), in whichever view is showing.
  // `z`: iso px above the floor (as the iso engine measures).
  clientAt(x: number, y: number, z: number): { x: number; y: number } {
    if (this.tp) return this.tp.project(x, y, z / 39.19) ?? { x: -9999, y: -9999 };
    return this.engine?.worldToClient(x, y, z) ?? { x: -9999, y: -9999 };
  }

  // ── build mode: its own chunk (world/build), loaded when an owner opens it ──
  build: BuildController | null = null;
  private buildLoading: Promise<void> | null = null;
  loadBuild(): Promise<void> {
    if (this.build) return Promise.resolve();
    this.buildLoading ??= import("./build/controller").then((m) => {
      if (this.stopped) return;
      this.build = new m.BuildController(this);
      this.build.refresh();
    });
    return this.buildLoading;
  }
  buildHover(x: number, y: number) {
    this.build?.hover(x, y);
  }
  buildDown(x: number, y: number) {
    this.build?.down(x, y);
  }
  buildUp(x: number, y: number) {
    this.build?.up(x, y);
  }
  buildClick(x: number, y: number) {
    this.build?.click(x, y);
  }
  buildKey(key: string): boolean {
    return this.build?.key(key) ?? false;
  }
  refreshGhost() {
    this.build?.refresh();
  }
  clearRoomGhost() {
    this.build?.clearRoomGhost();
  }
  seatAt(clientX: number, clientY: number): WorldObjectDef | null {
    return this.build?.seatAt(clientX, clientY) ?? null;
  }
  showSeatDrop(at: { x: number; y: number } | null) {
    this.build?.showSeatDrop(at);
  }
  undo() {
    this.send("build:undo", {});
  }
  redo() {
    this.send("build:redo", {});
  }

  // ── build mode support ───────────────────────────────────────────────────
  // My walk grid: locked doors of my own rooms let me through.
  rebuildGrid() {
    if (!this.engine) return;
    // (every floor's things: the stairs up from the floor below count here)
    this.grid = Grid.from(this.map, [...this.objs.values()], { uid: this.myUid() || null });
  }

  // Standing in an elevator's car: its panel (the floors it goes to). The car's
  // stop on my floor; riding, the doors shut, it stays up.
  private liftShown = "";
  private updateLift() {
    let at: WorldObjectDef | null = null;
    for (const o of this.engine?.allObjects() ?? []) {
      if (o.kind !== "elevator") continue;
      const { w, h } = placedFootprint(o);
      if (this.me.x >= o.x && this.me.x < o.x + w && this.me.y >= o.y && this.me.y < o.y + h) at = o;
    }
    const pr = at?.props ?? {};
    const key = at ? `${at.id}|${hud.get().floors.join()}|${pr.ph}|${pr.at}|${pr.to}` : "";
    if (key === this.liftShown) return;
    this.liftShown = key;
    if (!at) {
      hud.set({ lift: null });
      return;
    }
    const shaft = String(at.props?.shaft ?? at.id);
    const floors = [...this.objs.values()]
      .filter((o) => o.kind === "elevator" && String(o.props?.shaft ?? o.id) === shaft)
      .map((o) => objLevel(o, this.building))
      .sort((a, b) => b - a);
    // (from the stop's props: the car's phase and floors, as the server says)
    const live = this.objs.get(at.id)?.props ?? pr;
    hud.set({
      lift: {
        id: at.id,
        floors: floors.map((level) => ({ level, name: this.floorName(level) })),
        at: typeof live.at === "number" ? live.at : this.level,
        to: typeof live.to === "number" ? live.to : this.level,
        phase: String(live.ph ?? (live.door === "open" ? "open" : "shut")),
      },
    });
    // stepping out (Esc) waited for the doors: they're open, out I go
    if (this.liftOut === at.id && live.ph === "open") {
      this.liftOut = null;
      this.walkTo(liftFront(at, 0.9));
    }
  }

  private pressLiftButton(id: string, label: string) {
    if (label === "◀▶") return this.send("lift:go", { id, level: this.level });
    if (label === "▶◀") return this.send("lift:close", { id });
    const level = label === "G" ? 0 : Number(label);
    if (Number.isInteger(level)) this.send("lift:go", { id, level });
  }

  /** Esc in the car: out of it — at once if its doors are open, else they open first. */
  private liftOut: string | null = null;
  stepOutOfLift() {
    const l = hud.get().lift;
    const o = l ? this.objs.get(l.id) : undefined;
    if (!l || !o) return;
    if (o.props?.ph === "open" || o.props?.door === "open") this.walkTo(liftFront(o, 0.9));
    else {
      this.liftOut = o.id;
      this.send("lift:go", { id: o.id, level: this.level });
    }
  }

  /** The room's things as the server has them, on my floor (e2e reads these). */
  floorObjects(): S[] {
    const home = floorOf(this.building);
    const out: S[] = [];
    this.room?.state.objects?.forEach((o: S) => {
      let l: unknown;
      try {
        l = JSON.parse(o.props || "{}").level;
      } catch {}
      if ((typeof l === "number" ? l : home) === this.level) out.push(o);
    });
    return out;
  }

  /** To another floor (build mode's floor picker): its own arrival point. */
  goToFloor(level: number) {
    const lm = levelMap(this.building, level);
    if (!lm || level === this.level) return;
    this.send("teleport", { to: { x: lm.spawn.x, y: lm.spawn.y, level } });
  }

  /** A floor's name: the home floor is the world's, the others their own. */
  floorName(level: number): string {
    if (level === floorOf(this.building)) return this.building.name;
    return levelMap(this.building, level)?.name ?? `${tr("floor")} ${level}`;
  }

  // To another floor (the stairs, a ride, a teleport): the iso view, my walk
  // grid and the HUD show that floor now.
  // The other floors' things drawn ahead, once, a few seconds after arriving
  // (engine.prewarm): the first visit to a floor then has its art ready.
  private prewarmed = false;
  private prewarmFloors() {
    if (this.prewarmed || this.objs.size === 0 || !this.building) return;
    this.prewarmed = true;
    setTimeout(async () => {
      for (const f of floorsOf(this.building)) {
        if (this.stopped) return;
        const lm = levelMap(this.building, f);
        if (!lm || f === this.level) continue;
        await this.engine?.prewarm(onLevel(this.objs.values(), lm), lm);
      }
    }, 2500);
  }

  // ── the stairs (shared stairs.ts) ─────────────────────────────────────
  // A click on a stairwell's flights: on my floor's own stairs (flight A's
  // side) up them, on the ones coming up from the floor below (flight B's) down.
  private climbAt(x: number, y: number): boolean {
    let up: WorldObjectDef | null = null;
    let down: WorldObjectDef | null = null;
    for (const o of this.objs.values()) {
      if (o.kind !== "stairs") continue;
      const l = objLevel(o, this.building);
      if (l !== this.level && l !== this.level - 1) continue;
      const p = across(this.building, this.level, l, { x, y });
      const { u, v } = stairsLocal(o, p.x, p.y);
      if (u < 0 || u > 4 || v < 1 || v > 6) continue;
      if (l === this.level) up = o;
      else down = o;
    }
    if (up && down) {
      const p = { x, y };
      return this.climb(stairsLocal(up, p.x, p.y).u >= 2 ? up : down, stairsLocal(up, p.x, p.y).u >= 2);
    }
    if (up) return this.climb(up, true);
    if (down) return this.climb(down, false);
    return false;
  }

  /** Walk to a staircase and up it (from its floor) or down it (from the floor
   *  above): over to its door, then the flights, out on the other floor. */
  private climb(o: WorldObjectDef, up: boolean): boolean {
    if (hud.get().build.on) return false;
    const S = objLevel(o, this.building);
    if (up ? S !== this.level : S + 1 !== this.level) return false;
    const way = stairsWayUp(o).map((p) => across(this.building, S, this.level, p));
    const pts = up ? way : [...way].reverse();
    const lead = findPath(this.grid, this.me, pts[0]);
    if (!lead) return false;
    this.path = [...lead, ...pts.slice(1)];
    this.pathTarget = null;
    const end = pts[pts.length - 1];
    this.engine?.showMarker(end.x, end.y);
    this.tp?.showMarker(end.x, end.y);
    return true;
  }

  // The fire doors on my floor: they swing open as someone comes near and shut
  // behind them (the 3D view draws it, both views hear it).
  private fireDoors = new Map<string, boolean>();
  private stairsDoors() {
    const people: { x: number; y: number }[] = [this.me];
    this.room?.state.players.forEach((p: S, sid: string) => {
      if (sid !== this.room?.sessionId && (p.level ?? 0) === this.level) people.push({ x: p.x, y: p.y });
    });
    for (const o of this.objs.values()) {
      if (o.kind !== "stairs" || objLevel(o, this.building) !== this.level) continue;
      const d = stairsDoor(o);
      const open = people.some((p) => Math.hypot(p.x - d.x, p.y - d.y) < 1.15);
      const was = this.fireDoors.get(o.id);
      this.fireDoors.set(o.id, open);
      if (was === undefined || was === open) continue;
      loadLiftSounds();
      const gain = nearGain(Math.hypot(d.x - this.me.x, d.y - this.me.y));
      liftSound(open ? "stairs/door-open" : "stairs/door-close", { gain: gain * 0.75, delay: open ? 0 : 0.35 });
    }
  }

  // ── the elevators' motion (shared lift.ts: liftMotion) ─────────────────
  // When each stop's phase was heard of: the doors and the car move from then
  // (everyone hears it at about the same moment). Its sounds start with it.
  private liftSince = new Map<string, number>();
  private liftKeys = new Map<string, string>();
  private liftsDirty = true;
  private liftHeard(o: WorldObjectDef) {
    loadLiftSounds(); // (the building has elevators: their sounds, decoded ahead)
    const p = o.props ?? {};
    const key = `${p.ph}|${p.len}|${p.at}|${p.to}`;
    this.liftsDirty = true;
    if (this.liftKeys.get(o.id) === key) return;
    const was = this.liftKeys.get(o.id);
    this.liftKeys.set(o.id, key);
    this.liftSince.set(o.id, performance.now());
    if (was !== undefined) this.liftSound(o, was);
  }

  // A stop's phase changed (`was`: the one before): what it sounds like, if it's
  // on my floor — the doors, the chime as it arrives, the ride if I'm in it.
  private liftRide: ((fade?: number) => void) | null = null;
  private liftSound(o: WorldObjectDef, wasKey: string) {
    loadLiftSounds();
    const [was, , wasAt, wasTo] = wasKey.split("|");
    if (objLevel(o, this.building) !== this.level) return;
    const p = o.props ?? {};
    const ph = String(p.ph ?? "");
    const len = (Number(p.len) || 0) / 1000;
    const here = p.at === this.level;
    const c = { x: o.x + 1, y: o.y + 1 };
    const inside = inLift(o, this.me);
    const gain = inside ? 1 : nearGain(Math.hypot(c.x - this.me.x, c.y - this.me.y));
    if (here && ph === "opening") {
      if (was === "moving") liftSound("lift/chime", { gain: gain * 0.7 });
      // (one tone for a car that came up, a second, lower, for one that came down)
      if (was === "moving" && Number(wasTo) < Number(wasAt))
        liftSound("lift/chime", { gain: gain * 0.7, rate: 0.8, delay: 0.42 });
      liftSound("lift/door-open", { gain: gain * 0.8, rate: 1.7 / Math.max(0.5, len) });
    }
    if (here && ph === "closing") liftSound("lift/door-close", { gain: gain * 0.8, rate: 1.7 / Math.max(0.5, len) });
    if (ph === "moving" && inside) {
      this.liftRide?.(0.3);
      const stop = liftSound("lift/ride.wav", { gain: 0.7, loop: true });
      this.liftRide = stop;
      if (stop) setTimeout(() => stop(0.6), Math.max(0, len - 0.6) * 1000);
    }
  }

  /** An elevator stop as the iso view draws it now (its doors' step, the car
   *  there or not); anything else as it is. */
  private liftDrawn(o: WorldObjectDef): WorldObjectDef {
    if (o.kind !== "elevator") return o;
    const now = performance.now();
    const m = liftMotion(o, objLevel(o, this.building), (now - (this.liftSince.get(o.id) ?? now)) / 1000);
    return { ...o, props: { ...(o.props ?? {}), anim: Math.round(m.doors * 5) / 5, here: m.here } };
  }

  // Iso: the doors on my floor slide in steps (six, each one's art cached once),
  // the inside shown where the car is
  private liftsIso(now: number) {
    const engine = this.engine;
    if (!engine) return;
    for (const o of this.objs.values()) {
      if (o.kind !== "elevator" || objLevel(o, this.building) !== this.level) continue;
      const m = liftMotion(o, this.level, (now - (this.liftSince.get(o.id) ?? now)) / 1000);
      const anim = Math.round(m.doors * 5) / 5;
      const shown = engine.getObject(o.id);
      if (!shown || (shown.props?.anim === anim && shown.props?.here === m.here)) continue;
      engine.upsertObject(this.liftDrawn(o));
    }
  }

  /** The car I'm standing in on my floor (and its motion), if I am. */
  private myLift(now: number): { o: WorldObjectDef; m: LiftMotion } | null {
    for (const o of this.objs.values()) {
      if (o.kind !== "elevator" || objLevel(o, this.building) !== this.level || !inLift(o, this.me)) continue;
      return { o, m: liftMotion(o, this.level, (now - (this.liftSince.get(o.id) ?? now)) / 1000) };
    }
    return null;
  }

  // In the car (3D), the camera rides in it with you: high in its back corner,
  // over your shoulder to the doors and the panel; it sways a hair on the way.
  private liftCam(
    now: number,
  ): { eye: [number, number, number]; look: [number, number, number]; showMe: boolean; fov: number } | null {
    const at = this.myLift(now);
    if (this.tp) this.tp.liftIn = at?.o.id ?? null;
    if (!at) {
      if (this.tp) this.tp.liftSway = 0;
      return null;
    }
    const { o, m } = at;
    const moving = m.phase === "moving";
    const sway = moving ? Math.sin((now / 1000) * 31) * 0.002 + Math.sin((now / 1000) * 7.3) * 0.003 : 0;
    if (this.tp) this.tp.liftSway = sway;
    // the car's own frame: doors on its local −y side (rot 0), turned with it
    const r = (o.rot ?? 0) & 3;
    const turn = (u: number, v: number): [number, number] => {
      const dx = u - 1;
      const dy = v - 1;
      const c = [1, 0, -1, 0][r];
      const s = [0, 1, 0, -1][r];
      return [o.x + 1 + dx * c - dy * s, o.y + 1 + dx * s + dy * c];
    };
    const [ex, ey] = turn(1, 1.82);
    const [lx, ly] = turn(1, -1.6);
    // (the keys follow this camera — W towards the doors — and so does the one
    // behind me as I walk out)
    if (this.tp) this.tp.yaw = Math.atan2(ly - ey, lx - ex);
    return { eye: [ex, ey, 2.2 + sway], look: [lx, ly, 1.15 + sway], showMe: true, fov: 74 };
  }

  private isoSwap = 0; // (3D: the iso engine's floor change, spread over frames)
  setLevel(level: number) {
    if (level === this.level && floorOf(this.map) === level) return;
    this.level = level;
    this.life?.prints.clear(); // (they're the ground floor's)
    if (!this.building || !this.engine) return;
    this.map = levelMap(this.building, level) ?? this.building;
    // in 3D the iso engine follows over the next two frames (its map, then its
    // things), so no one frame carries the whole change; in iso, at once
    if (this.tp) this.isoSwap = 2;
    else {
      this.isoSwap = 0;
      this.engine.setMap(this.map);
      this.engine.setObjects(
        onLevel(this.objs.values(), this.map)
          .filter(notDriven)
          .map((o) => this.liftDrawn(o)),
      );
    }
    this.rebuildGrid();
    this.path = null;
    this.objectsDirty = true;
    this.tpDue = 0; // (the 3D view moves to that floor this frame)
    hud.set((h) => ({ floor: level, mapVersion: h.mapVersion + 1 }));
  }

  // The map lives in room state (per-space layout): rebuild walls/floors on change.
  private applyMapFromState() {
    const st = this.room?.state;
    if (!st?.tiles || !this.engine || !st.width) return;
    let areas = [];
    try {
      areas = JSON.parse(st.areas || "[]");
    } catch {}
    const base = getMap(st.mapKey);
    let levels = [];
    try {
      levels = JSON.parse(st.levels || "[]");
    } catch {}
    this.building = {
      ...base,
      width: st.width,
      height: st.height,
      tiles: [...st.tiles],
      hWalls: [...(st.hWalls ?? [])],
      vWalls: [...(st.vWalls ?? [])],
      hBacks: st.hBacks?.length ? [...st.hBacks] : undefined,
      vBacks: st.vBacks?.length ? [...st.vBacks] : undefined,
      areas,
      spawn: { x: st.spawnX, y: st.spawnY },
      objects: [],
      floor: st.floor ?? 0,
      levels,
    };
    // the floor I'm on (gone: the home one)
    const lm = levelMap(this.building, this.level);
    if (!lm) this.level = floorOf(this.building);
    this.map = lm ?? this.building;
    this.engine.setMap(this.map);
    this.rebuildGrid();
    hud.set((h) => ({ mapVersion: h.mapVersion + 1, floor: this.level, floors: floorsOf(this.building) }));
  }
  private mapDirty = false;

  // Doors swing open while someone walks through them; chairs show who sits
  // in them; the radio's display lights while it plays.
  private passing = new Map<string, boolean>();
  private updateDoors() {
    const engine = this.engine;
    const room = this.room;
    if (!engine || !room) return;
    const sitting = new Set<string>();
    if (this.me.a === ANIM.sit) sitting.add(`${Math.floor(this.me.x)},${Math.floor(this.me.y)}`);
    room.state.players.forEach((p: S, sid: string) => {
      if (sid !== room.sessionId && p.a === ANIM.sit && (p.level ?? 0) === this.level)
        sitting.add(`${Math.floor(p.x)},${Math.floor(p.y)}`);
    });
    for (const o of engine.allObjects()) {
      if (o.kind === "chair" || o.kind === "armchair" || o.kind === "beanbag") {
        const occupied = sitting.has(`${o.x},${o.y}`);
        if (!!o.props?.occupied !== occupied) engine.upsertObject({ ...o, props: { ...(o.props ?? {}), occupied } });
        continue;
      }
      if (isRadio(o.kind)) {
        // its display lights while it plays (its own state)
        const playing = radioOf(o).playing;
        if (!!o.props?.on !== playing) engine.upsertObject({ ...o, props: { ...(o.props ?? {}), on: playing } });
        continue;
      }
      if (!isDoorKind(o.kind) || !doorLeaves(o.kind)) continue;
      // someone in the doorway: close to the middle of the door's edges
      const c = doorCentre(o);
      const half = entry(o.kind).w / 2;
      const on = (x: number, y: number) =>
        (o.rot ?? 0) % 2 === 0
          ? Math.abs(x - c.x) < half && Math.abs(y - c.y) < 0.55
          : Math.abs(y - c.y) < half && Math.abs(x - c.x) < 0.55;
      // (a locked door swings only for its room's owner, the one who can go
      // through it: anyone else at it finds it shut)
      const locked = o.props?.state === "locked";
      const owner = locked ? doorOwner(this.map, o) : null;
      const may = (uid: number) => !locked || (owner != null && uid === owner);
      let occupied = may(this.myUid()) && on(this.me.x, this.me.y);
      room.state.players.forEach((p: S, sid: string) => {
        if (sid !== room.sessionId && (p.level ?? 0) === this.level && on(p.x, p.y) && may(p.uid)) occupied = true;
      });
      if (!locked)
        room.state.npcs.forEach((n: S) => {
          if (on(n.x, n.y)) occupied = true;
        });
      if ((this.passing.get(o.id) ?? false) !== occupied) {
        this.passing.set(o.id, occupied);
        engine.upsertObject({ ...o, props: { ...(o.props ?? {}), passing: occupied } });
      }
    }
  }

  // ── quality ──────────────────────────────────────────────────────────────
  private autoTier: Quality = "high";
  private slowFor = 0;
  private startedAt = Date.now();

  qualityNow(): Quality {
    return prefs().quality === "auto" ? this.autoTier : resolveQuality(prefs().quality);
  }

  // Frames per second, at most, right now: the setting — or 30 once nothing
  // has moved for a while (ambient life alone doesn't need more). 0 = no cap.
  private fpsCap(now: number): number {
    const cap = prefs().maxFps;
    if (!cap) return 0;
    const e = this.engine;
    const last = Math.max(this.activeAt, e?.activeAt ?? 0, this.tp?.activeAt ?? 0);
    const h = hud.get();
    const idle = now - last > IDLE_MS && !h.build.on && !h.menu && !this.path && !e?.busy();
    return idle ? Math.min(30, cap) : cap;
  }

  // HUD pieces that follow the picture (tags, meters): run once per drawn frame
  onFrame(cb: () => void): () => void {
    this.hudFrames.add(cb);
    return () => void this.hudFrames.delete(cb);
  }

  private watchFrameRate() {
    const e = this.engine;
    if (!e || prefs().quality !== "auto" || Date.now() - this.startedAt < 8000 || document.hidden) return;
    // (third person: its own frame rate — the iso engine isn't drawing)
    const fps = this.tp ? this.tp.fps : e.stats().fps;
    // (under the cap, or 30 when idle: slow is well under what's asked for)
    const cap = this.fpsCap(performance.now());
    const floor = cap ? Math.min(40, cap * 0.7) : 40;
    this.slowFor = fps > 0 && fps < floor ? this.slowFor + 1 : 0;
    if (this.slowFor < 6 || this.autoTier === "low") return;
    this.slowFor = 0;
    this.autoTier = this.autoTier === "high" ? "medium" : "low";
    e.setQuality(this.autoTier, prefs().reducedMotion);
    this.tp?.setQuality(this.autoTier);
  }

  meTile() {
    return { x: this.me.x, y: this.me.y };
  }

  // ── input ────────────────────────────────────────────────────────────────
  private onKeyDown = (e: KeyboardEvent) => {
    this.activeAt = performance.now();
    const t = e.target as HTMLElement;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable))
      return;
    if (hud.get().pickArrival && e.key === "Escape") {
      e.preventDefault();
      return this.pickArrival(false);
    }
    // the action menu: a number picks, Esc closes
    const menu = hud.get().menu;
    if (menu) {
      const i = Number(e.key) - 1;
      if (e.key === "Escape") this.closeMenu();
      else if (Number.isInteger(i) && i >= 0 && menu.items[i]?.ok) this.pickAction(menu.items[i].act);
      else return;
      e.preventDefault();
      return;
    }
    if (hud.get().cable && e.key === "Escape" && !hud.get().panel.kind) {
      e.preventDefault();
      return this.dropCable();
    }
    // the phone: while it's out it takes the arrows, Enter, Backspace and Esc (WASD still walks)
    if (hud.get().phone.open && !hud.get().panel.kind && !hud.get().build.on && this.phone?.key(e)) {
      e.preventDefault();
      return;
    }
    if (hud.get().panel.kind && e.key !== "Escape") return;
    // in a car: its controls (docs/plan/28-the-car.md, car/controls.ts)
    if (this.cars?.inCar() && !e.metaKey && !e.ctrlKey && this.cars.key(e, true)) {
      e.preventDefault();
      return;
    }
    const key = e.key.toLowerCase();
    if (hud.get().build.on && (e.metaKey || e.ctrlKey) && key === "d") {
      e.preventDefault();
      this.build?.duplicate();
      return;
    }
    if (hud.get().build.on && (e.metaKey || e.ctrlKey) && (key === "z" || key === "y")) {
      e.preventDefault();
      if (key === "y" || e.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if (e.metaKey || e.ctrlKey) return;
    if (this.buildKey(key)) {
      e.preventDefault();
      return;
    }
    // moving and jumping: the keys by where they are on the keyboard (input/bindings.ts)
    if (this.walker?.controls.world(e.code)) {
      if (e.code !== "ShiftLeft" && e.code !== "ShiftRight") e.preventDefault();
      void mixer.resume();
      return;
    }
    if (e.repeat) return;
    if (key === "x" || key === "e") this.interact();
    else if (key === "m") void this.toggleMic();
    else if (key === "v") void this.toggleCam();
    else if (key === "t") setPrefs({ view: prefs().view === "iso" ? prefs().last3d : "iso" });
    else if (key === "y") this.swapCamera();
    else if (key === "z") this.toggleLook();
    else if (key === "p" && !hud.get().build.on) void this.togglePhone();
    else if (key === "f" && !hud.get().build.on) this.toggleTorch();
    else if (key >= "1" && key <= "8") this.emote(Number(key) - 1);
    else if ((key === "+" || key === "=") && this.tp) this.tp.zoomBy(1 / 1.15);
    else if (key === "-" && this.tp) this.tp.zoomBy(1.15);
    else if (key === "+" || key === "=") this.engine?.setZoom((this.engine?.getZoom() ?? 1) * 1.15);
    else if (key === "-") this.engine?.setZoom((this.engine?.getZoom() ?? 1) / 1.15);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.walker?.controls.up(e.code);
    this.cars?.key(e, false);
  };
  private onBlur = () => {
    this.walker?.clear();
    this.cars?.blur();
  };
  private onFirstGesture = () => void mixer.resume();

  private bindInput() {
    void loadJumps(); // (a jump's dust and sounds: small, fetched now so the first one has them)
    // my body's controls and the movement core (docs/plan/29-the-move.md): a chunk of their own
    void import("./input").then((m) => {
      if (!this.stopped) this.walker ??= new m.Walker(this);
    });
    // the land round the ground floor: the grid walks it once it's here
    void loadGrounds().then((G) => {
      this.G = G;
      setOutdoors(G.groundsOutdoors);
      setAreasBeyond(G.groundsAreaAt);
      this.rebuildGrid();
      // (its life — footprints, vehicles, sound — in a chunk of its own)
      void import("./grounds-life").then((m) => {
        if (!this.G) return;
        this.life = new m.GroundsLife(G);
        this.engine?.setGrounds(G, this.life.prints);
        if (this.tp) this.tp.prints = this.life.prints;
      });
      // (the lot's cars, driven: docs/plan/28-the-car.md, in a chunk of their own)
      void Promise.all([import("./car/cars"), loadChars()]).then(([m]) => {
        if (!this.G || this.stopped || this.cars) return;
        this.cars = m.attachCars(this, G);
        this.objectsDirty = true;
      });
    });
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    window.addEventListener("pointerdown", this.onFirstGesture);
    window.addEventListener("focus", this.onFocus);
  }

  private unbindInput() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("pointerdown", this.onFirstGesture);
    window.removeEventListener("focus", this.onFocus);
  }

  // back from another tab (maybe the lobby's avatar editor): pick up a saved look
  private onFocus = () => {
    if (this.room && hud.get().phase === "ready") void this.syncLook();
  };

  // the Grounds (docs/plan/27), once loaded: what's underfoot out there, its sound
  private G: typeof import("@yutopia/shared/grounds") | null = null;
  private landFloor(x = this.me.x, y = this.me.y): Floor {
    return this.life?.floorAt(x, y, this.map) ?? "asphalt";
  }

  /** The phone's flashlight on or off (everyone sees its beam). */
  toggleTorch() {
    this.send("phone:torch", { on: !hud.get().torch });
  }
  /** How hard it's storming here (0…1, eased) and where the wind's from. */
  storm = 0;
  wind = 0;

  // ── helpers ──────────────────────────────────────────────────────────────
  private avatarState(p: S, _local: boolean): AvatarState {
    const look = parseAvatar(p.avatar);
    return {
      name: p.name,
      // focusing: headphones on
      avatar: p.focus ? { ...look, accessory: "headphones" } : look,
      x: p.x,
      y: p.y,
      d: p.d,
      a: p.a,
      status: p.status,
      speaking: p.speaking,
      emote: p.emote,
      mic: p.mic,
      bot: p.bot,
      held: p.held,
      heldAt: p.heldAt,
      busy: p.busy,
      act: p.act,
      actAt: p.actAt,
      actWith: p.actWith,
      phone: p.phone,
      phoneCase: p.phoneCase,
      phonePose: p.phonePose,
      ringing: p.ringing,
      recording: p.recording,
      torch: p.torch,
      focused: p.focused,
      gun: p.gun,
      arm: p.arm,
      fellAt: p.fellAt,
      fellYaw: p.fellYaw,
    };
  }

  private npcState(n: S): AvatarState {
    return {
      name: "VORTEX",
      avatar: VORTEX_LOOK,
      x: n.x,
      y: n.y,
      d: n.d,
      a: n.a,
      status: "online",
      speaking: false,
      emote: n.mood === "glitch" ? "fire" : "",
      vortexMood: n.mood,
      mic: false,
      npc: true,
    };
  }
}

// riding the shuttle (docs/plan/27, phase 6: grounds-life.ts)
const RIDING = "ride:shuttle";

const VORTEX_LOOK = parseAvatar({
  body: "slim",
  skin: "#9aa67e",
  hair: "mohawk",
  hairColor: "#c4402b",
  top: "jacket",
  topColor: "#2a2420",
  bottom: "trousers",
  bottomColor: "#1c1410",
  accessory: "glasses",
  accessoryColor: "#ffa630",
});

// A pet's look, clothes and needs as the server keeps them (it cleans them on the way in).
const petNeeds = (pet: S) => ({
  food: pet.food,
  water: pet.water,
  energy: pet.energy,
  fun: pet.fun,
  health: pet.health,
});
const petLook = (pet: S): PetLook =>
  ({ color: "#c68a5e", mark: "none", markColor: "#efe4cc", breed: "", ...safeParse(pet.look) }) as PetLook;
const petOutfit = (pet: S): PetOutfit =>
  ({
    hat: "none",
    hatColor: "#c4402b",
    collar: "none",
    collarColor: "#c4402b",
    coat: "none",
    coatColor: "#6e7b3a",
    ...safeParse(pet.outfit),
  }) as PetOutfit;

function safeParse(s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(s || "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}
function safeParseList(s: string): unknown[] {
  try {
    const v = JSON.parse(s || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function objFromState(o: S): WorldObjectDef {
  let props: Record<string, unknown> = {};
  try {
    props = JSON.parse(o.props || "{}");
  } catch {}
  return { id: o.id, kind: o.kind, x: o.x, y: o.y, rot: o.rot, refId: o.refId || null, props };
}

// where someone was at `at` (between the samples round it; past the last, on the way they were
// going a moment longer if they were walking), and the sample they were last at (their facing…)
function interpolate<T extends { t: number; x: number; y: number; z?: number; a?: number }>(
  buf: T[],
  at: number,
): { x: number; y: number; z: number; s: T } {
  const of = (p: T) => ({ x: p.x, y: p.y, z: p.z ?? 0, s: p });
  if (!buf.length) return { x: 0, y: 0, z: 0, s: {} as T };
  if (at <= buf[0].t) return of(buf[0]);
  for (let i = buf.length - 1; i >= 0; i--) {
    const a = buf[i];
    if (a.t <= at) {
      const b = buf[i + 1];
      const p0 = buf[i - 1];
      if (!b && p0 && a.a === 1) {
        const k = Math.min(at - a.t, 150) / Math.max(1, a.t - p0.t);
        return { x: a.x + (a.x - p0.x) * k, y: a.y + (a.y - p0.y) * k, z: a.z ?? 0, s: a };
      }
      if (!b) return of(a);
      const k = (at - a.t) / Math.max(1, b.t - a.t);
      const az = a.z ?? 0;
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: az + ((b.z ?? 0) - az) * k, s: a };
    }
  }
  return of(buf[buf.length - 1]);
}
