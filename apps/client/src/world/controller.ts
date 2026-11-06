"use client";

import {
  ANIM,
  across,
  areaAt,
  byteFace,
  type ClientMessages,
  CONTACT,
  EMOTES,
  entry,
  face8,
  faceByte,
  floorAt,
  floorOf,
  floorsOf,
  getMap,
  HEAR_RADIUS,
  HELD,
  type Height,
  hangStrip,
  hearingGain,
  inLift,
  isHeld,
  isPrivate,
  isSocial,
  type JumpKind,
  JumpTrack,
  jumpTimes,
  levelMap,
  liftFloorName,
  liftFront,
  type MapDef,
  objLevel,
  onLevel,
  overFloor,
  type Point,
  parseAvatar,
  placedFootprint,
  quarterOf,
  quarterYaw,
  ROOM_NAME,
  SEAT_FACE,
  type ServerMessages,
  SOCIAL_MS,
  STEP_LABELS,
  seatDir,
  seatYaw,
  setAreasBeyond,
  setOutdoors,
  spHour,
  stationOf,
  TICK_HZ,
  type WorldObjectDef,
  worldZ,
} from "@yutopia/shared";
import { isGameTv } from "@yutopia/shared/games";
import { isRadio, type RadioState, radioOf } from "@yutopia/shared/media";
import { type Species, toyAt } from "@yutopia/shared/pets";
import { Place } from "@yutopia/shared/physics/place";
import { applyOps, cellTop, edgeBack, edgeFront, type Structure, viewOf } from "@yutopia/shared/structure";
import type { Npc, Player, WorldObject, WorldState } from "@yutopia/state";
import { Client, getStateCallbacks, type Room } from "colyseus.js";
import { ApiError, type Session, yutopia } from "@/lib/api";
import { reportError, setErrorSink } from "@/lib/crash";
import { lang, tr } from "@/lib/i18n";
import { deviceQuality, prefs, subscribePrefs } from "@/lib/prefs";
import { ActionQueue } from "./actions";
import { loadChars } from "./art/chars-load";
import { loadPets, pets as petsArt } from "./art/pets-load";
import { loadThemes } from "./art/themes-load";
import { mixer } from "./audio";
import type { BuildController } from "./build/controller";
import { Arrival } from "./ctl/arrival";
import { Whiteboards } from "./ctl/boards";
import { Cable } from "./ctl/cable";
import { INTERP_MS, type Remote, rainOf, type Sample, VORTEX_LOOK } from "./ctl/common";
import { Doors } from "./ctl/doors";
import { Focus } from "./ctl/focus";
import { Input } from "./ctl/input";
import { Jumps } from "./ctl/jumps";
import { Lifts } from "./ctl/lifts";
import { Loading } from "./ctl/loading";
import { ActionMenu } from "./ctl/menu";
import { Pets } from "./ctl/pets";
import { Photo } from "./ctl/photo";
import { QualityWatch } from "./ctl/quality";
import { Steps } from "./ctl/steps";
import { Tables } from "./ctl/tables";
import { Water } from "./ctl/water";
import { panOf } from "./ear";
import { fanfare, pianoNote, socialSound } from "./foley";
import type { GameRoom } from "./games/room";
import type { GodController } from "./god/controller";
import { layEdits, loadGrounds, wantEdits } from "./grounds-load";
import { loadJumps } from "./jumps-load";
import { liftSound } from "./lift-sound";
import { Media } from "./media";
import type { MediaRoom } from "./media/room";
import { type AvatarState, WorldModel } from "./model";
import type { OsRoom } from "./os/room";
import { FramePerf } from "./perf";
import type { PerfReport } from "./perf-report";
import type { Phone } from "./phone";
import type { SlotTracks } from "./slots";
import { type Floor, radio, sound } from "./sound";
import type { Space } from "./steps";
import { hud, type Person, toast } from "./store";
import type { Body3, CamMode, ThirdPersonView } from "./tp/view";

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

// (a remote's height over their floor, as everyone is drawn: Player.z is the world's)
const sampleOf = (
  p: { x: number; y: number; z?: number; level?: number; a: number; mv?: number; yaw?: number },
  t: number,
): Sample => ({
  t,
  x: p.x,
  y: p.y,
  z: overFloor(p.level ?? 0, p.z ?? 0),
  a: p.a,
  mv: p.mv ?? 0,
  yaw: p.yaw ?? 0,
});

const MEDIA_SLEEP_MS = 5 * 60_000; // quiet this long: the voice line sleeps
const MEDIA_NEAR = HEAR_RADIUS + 4; // someone this close (tiles) keeps it awake
const LIVEKIT_TOKEN_FRESH_MS = 5 * 3600_000; // LiveKit tokens last 6 h (apps/api Tokens)
const FLOORED = new Set<Floor>(["wood", "tile", "carpet", "earth", "hollow"]);
const JUMP_HEARD = 9; // tiles: others' jumps are heard this far

// (a lot car out being driven: not where it was parked — docs/plan/28-the-car.md)
const notDriven = (o: { kind: string; props?: Record<string, unknown> | null }) => o.kind !== "car" || !o.props?.driven;

export class WorldController {
  readonly loading: Loading = new Loading(this);

  readonly doors: Doors = new Doors(this);

  readonly quality: QualityWatch = new QualityWatch(this);

  readonly tableGames: Tables = new Tables(this);

  readonly boards: Whiteboards = new Whiteboards(this);

  readonly cable: Cable = new Cable(this);

  readonly photos: Photo = new Photo(this);

  readonly arrival: Arrival = new Arrival(this);

  readonly focus: Focus = new Focus(this);

  readonly input: Input = new Input(this);

  readonly steps: Steps = new Steps(this);

  readonly jumps: Jumps = new Jumps(this);

  readonly water: Water = new Water(this);

  readonly menu: ActionMenu = new ActionMenu(this);

  readonly pets: Pets = new Pets(this);

  readonly lifts: Lifts = new Lifts(this);

  model: WorldModel | null = null;
  room: Room<WorldState> | null = null;
  media: Media;
  session: Session | null = null;
  map!: MapDef; // the floor I'm on (shared levels.ts)
  /** My place on my floor (shared physics Place): Jolt's once it's in — till then the floor's map.
   *  Asked of the physics each time (its places cached till the building or its things change): one
   *  kept from when a thing arrived could be from before the view had it — a chair just put down
   *  not yet a seat (plan 72 phase 11's check). */
  get grid(): Place {
    return this.tp?.body.placeFor(this.myUid() || null, this.level) ?? this.ownGrid;
  }
  set grid(p: Place) {
    this.ownGrid = p;
  }
  private ownGrid!: Place;
  // the building: its home map with every floor, the floor I'm on, and the
  // things on every floor (the model only has my floor's)
  building!: MapDef;
  level = 0;
  readonly objs = new Map<string, WorldObjectDef>();
  readonly host: HTMLElement;
  // my body (docs/plan/29-the-move.md): the movement core under the keys and the pad (input chunk)
  walker: import("./input").Walker | null = null;
  walkYaw = 0;
  private myVerb: { kind: string; t: number } | undefined;
  // my Flowmotion move as it's drawn, and as it was last sent (Player.flow)
  private myFlow: import("./input/walker").WalkOut["flow"] = null;
  private myFlowSent = 0;
  private myPitch = 0;
  private lastPitch = 0;
  private lastMv = 0;
  /** me in the water (plan 66): 0 out, 1 wading, 2 afloat, 3 under */
  mySwim = 0;
  /** the ice's holes as the room last said them, mine just broken, how long I've stood on thin ice */
  holesWire = "";
  myHoles: { x: number; z: number; r: number; at: number }[] = [];
  thinFor = 0;
  private lastYaw = 0;
  // my feet (shared/jump.ts): how high (up on something, in a jump), my jump's stage,
  // whether it's left the ground yet; Space pressed just before landing, waiting
  height: Height = { z: 0, vz: 0, up: false };
  jumpTrack = new JumpTrack();
  jumpStages = new Map<string, string>(); // everyone's jump stage last frame (dust, sound)
  /** review shots / e2e: a jump of mine held at this moment (s in), while it's set */
  jumpHold: { kind: JumpKind; t: number } | null = null;
  private walkPath: Point[] | null = null;
  /** The way I'm walking (null: none — set so, a way asked for is let go too). */
  get path(): Point[] | null {
    return this.walkPath;
  }
  set path(v: Point[] | null) {
    this.walkPath = v;
    if (!v) this.way = null;
  }
  pathTarget: { objectId?: string } | null = null;
  /** A way asked of the server (its navmesh — docs/plan/72 phase 7), till it answers: where to, what
   *  for, and the waypoints after it (a staircase's flights). */
  way: { n: number; level: number; target: Point; objectId?: string; quiet: boolean; after: Point[] } | null = null;
  private wayN = 0;
  // (`yaw`: which way I face, world radians on 8 ways — shared move face8; the body's own turn is meAngle)
  me = { x: 0, y: 0, yaw: 0, a: 0 as number };
  private lastSent = { x: 0, y: 0, z: 0, yaw: 0, a: 0, t: 0, l: 0 };
  private seq = 0;
  private remotes = new Map<string, Remote>();
  private npcBuf = new Map<string, { t: number; x: number; y: number }[]>();
  private petBuf = new Map<string, { t: number; x: number; y: number }[]>();
  petHurt = new Map<string, number>(); // pet id → when it last took a hit (client ms)
  toyPick: string | null = null; // a toy I'm walking over to pick up
  battleSeen = ""; // the last battle round shown (id|round)
  private hear = new Set<string>();
  private raf = 0;
  private lastFrame = 0;
  private lastTick = 0;
  private tick = 0;
  private rafGap = 1000 / 60; // how often the screen asks for a frame (ms, smoothed)
  /** where each frame's time goes (perf.ts; `__yutopia.perf()`) */
  readonly framePerf = new FramePerf();
  objsRev = 0; // the things changed (tp.update is skipped while nothing it reads has)
  private tpKey: string | null = null;
  private tpBuilt: unknown = null;
  private tpFor: unknown = null;
  activeAt = 0;
  hudFrames = new Set<() => void>();
  stopped = false;
  private timers: ReturnType<typeof setInterval>[] = [];
  private offPrefs: (() => void) | null = null;
  private offLook: (() => void) | null = null;
  private reconnecting = false;
  private peopleAt = 0;
  private followAt = 0;
  uidToSid = new Map<number, string>();
  onOpenPanel: (kind: string, objectId?: string) => void = () => {};
  readonly actions: ActionQueue;

  constructor(host: HTMLElement) {
    this.host = host;
    this.actions = new ActionQueue({
      me: () => this.me,
      focused: () => !!this.room?.state.players.get(this.room.sessionId)?.focus,
      setFacing: (yaw) => {
        this.me.yaw = yaw;
      },
      grid: () => this.grid,
      object: (id) => this.model?.getObject(id),
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
      activate: (id) => this.menu.activateObject(id, false),
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
    this.grid = new Place(null, this.map, this.map.objects);

    const model = new WorldModel(this.map);
    this.model = model;
    this.quality.autoTier = deviceQuality();
    model.setQuality(this.quality.qualityNow(), prefs().reducedMotion);
    model.events = {
      onTileClick: (x, y, mods) => {
        if (hud.get().build.on) return this.buildClick(x, y);
        if (hud.get().pickArrival) return this.arrival.setArrival({ x, y });
        if (hud.get().menu) return hud.set({ menu: null });
        // a toy in hand: Shift / right-click (or the chip's Throw) throws it there, or points the laser
        if (this.pets.throwAt(x, y, !!mods?.shift || !!mods?.right)) return;
        // a click on the floor: go there (dropping whatever was queued) — on a
        // stairwell's flights, up or down them to the other floor
        this.actions.clear();
        this.toyPick = null;
        if (this.doors.climbAt(x, y)) return;
        this.walkTo({ x, y });
      },
      onToyClick: (id) => this.pets.pickToy(id),
      onAvatarClick: (sid, at) => {
        if (sid.startsWith("pet:")) return void this.menu.openMenu({ type: "pet", id: sid.slice(4) }, at);
        if (sid.startsWith("npc:")) return this.send("vortex:poke", {});
        // yourself: your look, your drink…; anyone else: what to do with them
        if (sid === this.room?.sessionId) return this.menu.openMenu({ type: "self" }, at);
        const p = this.room?.state.players.get(sid);
        if (p && !p.bot) this.menu.openMenu({ type: "person", sid }, at);
      },
      onObjectClick: (id, at) => {
        // a button on an elevator car's own panel (3D): a floor, open, close
        const btn = id.split("|btn|");
        if (btn.length === 2) return this.pressLiftButton(btn[0], btn[1]);
        const o = this.model?.getObject(id);
        const b = hud.get().build;
        if (b.on && o && b.tool === "walls") return; // walls/floors paint by dragging
        if (b.on && o) return this.buildClick(o.x + 0.5, o.y + 0.5);
        // carrying a cable: a TV clicked is where it goes
        if (hud.get().cable && o && isGameTv(o.kind)) return this.menu.activateObject(id, true);
        // an elevator: in when it's open, else a call (no menu to go through)
        if (o?.kind === "elevator") return this.menu.activateObject(id, true);
        // a staircase (3D): up it from its floor, down it from the one above
        const st = !o ? this.objs.get(id) : o;
        if (st?.kind === "stairs" && !hud.get().build.on) {
          this.actions.clear();
          this.doors.climb(st, objLevel(st, this.building) === this.level);
          return;
        }
        if (!this.menu.openMenu({ type: "object", id }, at)) this.menu.activateObject(id, true);
      },
      onPointerWorld: (x, y) => (hud.get().pickArrival ? this.arrival.hoverArrival(x, y) : this.buildHover(x, y)),
      onPointerDown: (x, y) => this.buildDown(x, y),
      onPointerUp: (x, y) => this.buildUp(x, y),
      onWheel: (dy) => this.build?.wheel(dy) ?? false,
    };
    this.offLook = hud.subscribe(this.focus.watchLook);
    this.offPrefs = subscribePrefs(() => {
      this.model?.setQuality(this.quality.qualityNow(), prefs().reducedMotion);
      if (this.tp && this.tp.quality !== this.quality.qualityNow()) this.tp.warmup.toQuality(this.quality.qualityNow());
      this.syncView();
    });
    // Auto quality: step down a tier when this device can't keep up
    this.timers.push(setInterval(() => this.quality.watchFrameRate(), 1000));
    this.updateNight(true);

    await this.join();
    if (this.stopped) return;
    // how the game runs here, reported (docs/plan/39-the-telemetry.md; its own chunk, which
    // stops itself once this stops)
    void import("./telemetry").then((m) => m.startTelemetry(this));
    // the page's errors to the server from now on (lib/crash.ts: the ones before, sent now)
    setErrorSink((e) => this.room?.send("client:error", e));
    this.input.bindInput();
    this.loading.holdLoading("enter");
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
      const cap = this.quality.fpsCap(t);
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
      const room: Room<WorldState> = reconnectToken
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

  private wireRoom(room: Room<WorldState>) {
    const $ = getStateCallbacks(room);
    const model = this.model as WorldModel;
    this.remotes.clear();
    // a fresh session (not a resume) has new session ids: drop old avatars
    model.clearAvatars();
    this.uidToSid.clear();

    $(room.state).players.onAdd((p, sid) => {
      const local = sid === room.sessionId;
      this.uidToSid.set(p.uid, sid);
      if (local) {
        this.me = { x: p.x, y: p.y, yaw: byteFace(p.yaw), a: p.a };
        // (my height over my floor: what the walker works in; Player.z is the world's)
        this.height = { z: overFloor(p.level ?? 0, p.z ?? 0), vz: 0, up: false };
        this.setLevel(p.level ?? 0);
        this.lastSent = { ...this.me, z: this.height.z, t: 0, l: this.level };
        model.localId = sid;
      } else {
        this.remotes.set(sid, {
          level: p.level ?? 0,
          buf: [sampleOf(p, performance.now())],
          off: Number.NaN,
          offAt: 0,
          verbAt: 0,
          jumpKey: `${p.jump}|${p.jumpAt}`, // (a jump from before I came isn't played)
          track: new JumpTrack(),
          flow: p.flow ?? 0,
          flowAt: 0,
        });
        if (hud.get().phase === "ready" && !p.bot) mixer.blip("join");
      }
      model.upsertAvatar(sid, this.avatarState(p, local));
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
        if (!last || ["x", "y", "z", "a", "mv", "yaw"].some((k) => last[k as "x"] !== s[k as "x"])) {
          r.buf.push(s);
          if (r.buf.length > 12) r.buf.shift();
        }
      });
    });
    $(room.state).players.onRemove((p, sid) => {
      model.removeAvatar(sid);
      this.remotes.delete(sid);
      if (this.uidToSid.get(p.uid) === sid) this.uidToSid.delete(p.uid);
      if (!p.bot) mixer.blip("leave");
    });

    room.onMessage("struct:full", (m: ServerMessages["struct:full"]) => {
      this.structure = m.structure;
      this.structRev = m.rev;
      this.mapDirty = true;
    });
    room.onMessage("struct:walls:ok", (m: ServerMessages["struct:walls:ok"]) => this.build?.wallsOk(m));
    room.onMessage("struct:ops", (m: ServerMessages["struct:ops"]) => {
      // (behind, or not here yet: it whole again)
      if (!this.structure || m.rev !== this.structRev + 1) {
        if (m.rev > this.structRev) room.send("struct:get", {});
        return;
      }
      this.structure = applyOps(this.structure, m.ops);
      this.structRev = m.rev;
      this.mapDirty = true;
      this.build?.structChanged();
    });
    room.send("struct:get", {});
    // god mode's edits to the Grounds (docs/plan/53-the-god-mode.md): the revision live, laid here
    $(room.state).listen("groundsRev", (rev: number) => wantEdits(rev));
    room.onMessage("god:edits", (e: ServerMessages["god:edits"]) => layEdits(e));
    model.setObjects([]);
    // every floor's things kept; the model has mine
    const putObj = (o: WorldObject) => {
      const def = objFromState(o);
      this.objs.set(def.id, def);
      this.objsRev++;
      if (def.kind === "elevator") this.lifts.liftHeard(def);
      // (a lot car out being driven isn't where it was parked: the car itself is drawn)
      if (objLevel(def, this.building) === this.level && notDriven(def)) model.upsertObject(this.lifts.liftDrawn(def));
      else if (model.getObject(def.id)) model.removeObject(def.id);
      this.objectsDirty = true;
    };
    $(room.state).objects.onAdd((o) => {
      putObj(o);
      $(o).onChange(() => putObj(o));
    });
    $(room.state).objects.onRemove((o) => {
      this.objs.delete(o.id);
      this.objsRev++;
      model.removeObject(o.id);
      this.objectsDirty = true;
    });

    $(room.state).npcs.onAdd((n, id) => {
      model.upsertAvatar(`npc:${id}`, this.npcState(n));
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
    $(room.state).npcs.onRemove((_n, id) => model.removeAvatar(`npc:${id}`));

    // pets (features/pets.ts): drawn like people, with their sounds near me
    $(room.state).pets.onAdd((pet, id) => {
      this.petBuf.set(id, [{ t: performance.now(), x: pet.x, y: pet.y }]);
      void loadPets(); // its drawing, animation, sounds and strings
      if (pet.alive) model.upsertAvatar(`pet:${id}`, this.pets.petState(pet));
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
        if (!pet.alive && model.hasAvatar(`pet:${id}`)) model.removeAvatar(`pet:${id}`);
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
      this.pets.publishPets();
    });
    $(room.state).pets.onRemove((_pet, id) => {
      model.removeAvatar(`pet:${id}`);
      this.petBuf.delete(id);
      this.pets.publishPets();
    });
    $(room.state).battles.onAdd((b) => {
      $(b).onChange(() => this.pets.watchBattle(b));
      this.pets.watchBattle(b);
    });
    $(room.state).battles.onRemove(() => this.pets.publishPets());
    $(room.state).toys.onRemove((t) => {
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

  private wireMessages(room: Room<WorldState>) {
    room.onMessage("snap", (m: ServerMessages["snap"]) => {
      if (m.level !== undefined) this.setLevel(m.level);
      this.me.x = m.x;
      this.me.y = m.y;
      this.height = { z: overFloor(this.level, m.z ?? 0), vz: 0, up: false };
      this.path = null;
    });
    room.onMessage("way", (m: ServerMessages["way"]) => this.wayHere(m));
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
    // (plan 68 phases 21–25) the small games' news, to their panels
    for (const type of ["claw:result", "tg:state"] as const)
      room.onMessage(type, (m: unknown) => {
        for (const fn of this.gameFns.get(type) ?? []) fn(m);
      });
    // (plan 68) a present I opened: a fanfare, what was in it
    room.onMessage("present:opened", (m: ServerMessages["present:opened"]) => {
      fanfare(0.5);
      const what = isHeld(m.gift) ? HELD[m.gift].label.toLowerCase() : m.gift;
      toast(
        `${tr("presentOpened").replace("{gift}", what)}${m.from ? ` ${tr("presentFrom").replace("{name}", m.from)}` : ""}`,
      );
    });
    // (to admins) who's removed, till when: the admins' panel (docs/plan/48-the-admin.md)
    room.onMessage("admin:removed", (m: ServerMessages["admin:removed"]) => hud.set({ removed: m.list }));
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
      if (hud.get().pickArrival) return this.model?.showMine(m.at);
      // just set: show where for a moment
      if (m.at && (m.at.x !== was?.x || m.at.y !== was?.y) && this.arrival.arrivalAsked) this.arrival.flashArrival();
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
    room.onMessage("pet:event", (m: ServerMessages["pet:event"]) => this.pets.petEvent(m));
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
    room.onMessage("gps:friends", (m: ServerMessages["gps:friends"]) => this.phone?.gps.onFriends(m));
    room.onMessage("vortex:say", (m: ServerMessages["vortex:say"]) => {
      this.say("npc:vortex", m.text, 7000);
      // his personal lines also land in his thread on the phone
      void this.ensurePhone().then((ph) => ph?.vortexLine(m.text));
      for (const f of this.vortexListeners) f(m.text);
    });
    room.onMessage("wb:scene", (m: ServerMessages["wb:scene"]) => {
      this.boards.wbScenes.set(m.objectId, m.items);
      this.boards.emitWb(m.objectId);
    });
    room.onMessage("wb:op", (m: ServerMessages["wb:op"]) => {
      const items = this.boards.wbScenes.get(m.objectId) ?? this.boards.persistedScene(m.objectId);
      if (m.op.t === "add") items.push(m.op.item);
      else if (m.op.t === "del")
        items.splice(0, items.length, ...items.filter((x) => x.id !== (m.op as { id: string }).id));
      else items.splice(0, items.length);
      this.boards.wbScenes.set(m.objectId, items);
      this.boards.emitWb(m.objectId);
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
      this.model?.setObjects([]);
      for (const sid of [...this.remotes.keys()]) this.model?.removeAvatar(sid);
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

  /** The frame's stages over the last ~10 s (docs/plan/38-the-lag.md); `reset` starts a fresh window. */
  async perf(reset = false): Promise<PerfReport> {
    return (await import("./perf-report")).report(this.framePerf, reset);
  }

  stop() {
    setErrorSink(null);
    this.framePerf.dispose();
    this.stopped = true;
    this.offLandShifted?.();
    this.god?.dispose();
    this.walker?.dispose();
    this.build?.dispose();
    this.slots?.dispose();
    this.tableGames.tables?.dispose();
    this.tableGames.chess?.dispose();
    this.games?.dispose();
    this.screens?.dispose();
    this.os?.dispose();
    this.cars?.dispose();
    this.cars = null;
    cancelAnimationFrame(this.raf);
    for (const t of this.timers) clearInterval(t);
    if (this.arrival.arrivalFlash) clearTimeout(this.arrival.arrivalFlash);
    if (hud.get().pickArrival) hud.set({ pickArrival: false });
    this.input.unbindInput();
    this.closeTp();
    this.offPrefs?.();
    this.offLook?.();
    void this.room?.leave(true).catch(() => {});
    void this.media.disconnect();
    sound.stopAll();
    this.life?.sound.stop();
    this.model = null;
  }

  private heldShown = "";
  putDown() {
    this.send("item:drop", {});
  }

  // What I'm busy with (shown on my body for everyone): a machine for a moment,
  // or the piano / whiteboard / computer while its panel is open.
  usingWhat = "";
  usingUntil = 0;
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
          : (pk === "pool" || pk === "pong") && this.tableGames.tables?.busy()
            ? (this.tableGames.tables?.busy() as string)
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

  private gameFns = new Map<string, Set<(m: unknown) => void>>();
  /** (plan 68 phases 21–25) A small game's panel told of its news (the claw's drop, a table game's
   *  state); the returned function stops it. */
  onGame<T>(type: string, fn: (m: T) => void): () => void {
    const set = this.gameFns.get(type) ?? new Set();
    const f = fn as (m: unknown) => void;
    set.add(f);
    this.gameFns.set(type, set);
    return () => set.delete(f);
  }

  /** (plan 68) What I'm holding, wrapped at the table I'm at, for `to` (a user id; 0: anyone). */
  wrapFor(to: number) {
    const w = hud.get().wrap;
    // (−1: not wrapped after all)
    if (w && to >= 0) this.send("present:wrap", { id: w.id, to });
    hud.set({ wrap: null });
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
    if (this.gamesLoading || !this.model?.allObjects().some((o) => kinds.has(o.kind))) return;
    this.gamesLoading = import("./games/room").then((m) => {
      if (this.stopped || !this.model || !this.room) return;
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
    const on = !!this.model
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
      if (this.stopped || !this.model || !this.room) return;
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
      if (this.stopped || !this.model || !this.room) return;
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
    st.consoles?.forEach((c) => {
      if (c.live) busy = true;
    });
    if (busy) return true;
    // someone close enough to walk into earshot in a moment
    const meSid = this.room?.sessionId;
    st.players?.forEach((p, sid) => {
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

  // the canvas the world is drawn on right now (the phone records it)
  viewCanvas(): HTMLCanvasElement | null {
    return this.tp?.renderer.domElement ?? null;
  }
  // the world's host on the page (client px): the view's canvas fills it
  hostRect(): DOMRect {
    return this.host.getBoundingClientRect();
  }

  // ── slot-car tracks: their own chunk (world/slots.ts), loaded once a track is here ──
  slots: SlotTracks | null = null;
  private slotsLoading: Promise<void> | null = null;
  private slotsChanged() {
    if (this.slots) return this.slots.refresh();
    if (this.slotsLoading || !this.model?.allObjects().some((o) => o.kind === "slot_track")) return;
    this.slotsLoading = import("./slots").then((m) => {
      const room = this.room;
      if (this.stopped || !this.model || !room) return;
      this.slots = new m.SlotTracks(this.model, room, (type, msg) => this.send(type as never, msg as never));
      this.slots.refresh();
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
    const model = this.model;
    const room = this.room;
    if (!model || !room?.state?.players) return;
    const perf = this.framePerf;
    let lap = perf.begin();
    if (this.mapDirty) {
      this.mapDirty = false;
      this.applyMapFromState();
      // (the 3D view's walls for it the next frame, not this one: docs/plan/72 phase 8, an edit's cost)
      this.tpDue = Math.max(this.tpDue, now + 1);
    }
    this.doors.updateDoors();
    if (this.objectsDirty) {
      // batched: hundreds of objects arrive in the first patch
      this.objectsDirty = false;
      this.rebuildGrid();
      this.build?.checkPending();
      this.slotsChanged();
      this.tableGames.tablesChanged();
      this.tableGames.chessChanged();
      this.gamesChanged();
      this.screensChanged();
      hud.set((h) => ({ objectsVersion: h.objectsVersion + 1 }));
    }
    this.syncView();
    this.driveVehicles(dt);
    this.isolated("cars", () => this.cars?.frame(dt, now));
    this.moveLocal(dt);
    this.steps.hearAround(dt);
    this.updateLift();
    this.doors.stairsDoors();
    if (hud.get().build.on) {
      this.actions.clear();
      if (hud.get().menu) hud.set({ menu: null });
    } else this.actions.tick(now);
    // my voice's reach on open floor while the mic is on (rooms and the stage
    // don't go by distance)
    const here = areaAt(this.map, this.me.x, this.me.y);
    const open = !isPrivate(here) && here?.kind !== "stage";
    if (this.tp) this.tp.earshot = hud.get().media.mic && open && hud.get().me?.status !== "dnd" ? HEAR_RADIUS : 0;
    this.isolated("slots", () => this.slots?.frame(dt, this.me));
    this.isolated("tables", () => this.tableGames.tables?.frame(dt, this.me));
    this.isolated("chess", () => this.tableGames.chess?.frame());
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
      this.tp?.setWeather(this.storm, this.wind);
    }
    // what lies on the ground (docs/plan/65-the-weather.md): the server's, eased by the view
    const wxs = room.state.weather;
    if (wxs) this.life?.underfoot(wxs.snow ?? 0, wxs.wet ?? 0, (wxs.temp ?? 0) < 0, wxs.ice ?? 1);
    // (the ice's holes: the room's, and one I've just broken till it's the room's — plan 66 S4)
    if (wxs && this.G) {
      const wire = wxs.holes ?? "";
      const now0 = Date.now();
      this.myHoles = this.myHoles.filter((h) => now0 - h.at < 4000);
      if (wire !== this.holesWire || this.myHoles.length) {
        this.holesWire = wire;
        this.G.setIceHoles([...this.G.holesFromWire(wire), ...this.myHoles]);
      }
    }
    if (wxs)
      this.tp?.setGround({
        snow: wxs.snow ?? 0,
        falling: wxs.kind === "snow" ? Math.max(this.storm, wxs.fall ?? 0) : 0,
        cloud: wxs.cloud ?? 1,
        rain: rainOf(wxs, this.storm),
        sleet: wxs.kind === "sleet",
        wet: wxs.wet ?? 0,
        puddles: wxs.puddles ?? 0,
        temp: wxs.temp ?? -5,
        thunder: wxs.thunder ?? 0,
        ice: wxs.ice ?? 1,
      });
    // the morning fog (docs/plan/64-the-fog.md): the server's, eased by the view
    this.tp?.setFog(room.state.fog ?? 0, room.state.fogWall ?? 0, room.state.fogLift ?? 0);
    // someone high-fives me, hands me something…: turn to them
    if (lp?.act && lp.actAt !== this.facedAct) {
      this.facedAct = lp.actAt;
      const other = room.state.players.get(lp.actWith);
      if (other && !this.path) this.me.yaw = face8(other.x - this.me.x, other.y - this.me.y, this.me.yaw);
    }
    const tp = this.tp;
    const bodies: Body3[] = [];
    const reduced = prefs().reducedMotion;
    if (lp) {
      const st = {
        ...this.avatarState(lp, true),
        x: this.me.x,
        y: this.me.y,
        yaw: this.me.yaw,
        a: this.me.a,
        mv: this.lastMv,
        verb: this.myVerb,
        flow: this.myFlow,
        pitch: this.myPitch,
        angle: this.meAngle,
        focused: this.walker?.focus,
        ...this.jumps.myJump(now),
        swim: this.mySwim,
        overWater: this.water.overDeep(this.me.x, this.me.y),
        waterOver: this.water.waterOver(this.me.x, this.me.y, this.height.z),
      };
      this.jumps.jumpEffects(localSid, st, 1);
      this.life?.print(localSid, st, now, this.map, this.grid.onLand(st.x, st.y));
      const inCar = !!this.cars?.inCar();
      if (this.steps.wasInCar && !inCar) this.steps.alighted.push(localSid);
      this.steps.wasInCar = inCar;
      if (inCar) {
        if (model.hasAvatar(localSid)) model.removeAvatar(localSid);
      } else model.upsertAvatar(localSid, st);
      if (tp && !inCar)
        bodies.push({
          ...st,
          id: localSid,
          level: this.level,
          typing: st.a === 2 && (st.busy === "computer" || model.atWork(st.x, st.y)),
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
      // an admin who's hidden (docs/plan/48-the-admin.md; shared admin.ts POWERS.hidden): not
      // drawn, not heard — but by another admin, faded
      const hidden = (p.powers & 8) !== 0;
      const unseen = hidden && !lp?.admin;
      const st = {
        ...this.avatarState(p, false),
        ...(hidden ? { status: "away" } : null),
        x: pos.x,
        y: pos.y,
        yaw: byteFace(at.yaw),
        a: at.a,
        mv: at.mv,
        // (their verb, if it's one: timed from when it shows, by the 3D people)
        verb: p.jump ? { kind: p.jump, t: 0, at: r.verbAt } : undefined,
        // (their Flowmotion move, likewise: docs/plan/56-the-controls.md F)
        ...this.jumps.theirFlow(r, p, now),
        pitch: p.pitch / 40,
        // (their facing as they turned, not 8 ways: from the move's own senders)
        angle: p.mt ? (at.yaw / 128) * Math.PI : undefined,
        ...this.jumps.theirJump(r, p, pos, now),
        swim: this.water.swimOf(pos.x, pos.y, pos.z),
        overWater: this.water.overDeep(pos.x, pos.y),
        waterOver: this.water.waterOver(pos.x, pos.y, pos.z),
      };
      this.jumps.jumpEffects(
        sid,
        st,
        here ? Math.max(0, 1 - Math.hypot(pos.x - this.me.x, pos.y - this.me.y) / JUMP_HEARD) : 0,
      );
      // the model keeps my floor's; 3D draws everyone where they are in the building
      // (someone in a car: the car draws them, sitting in it)
      const carried = !!this.cars?.seatedIds().has(sid) || unseen;
      if (r.carried && !carried && !unseen) this.steps.alighted.push(sid);
      r.carried = carried;
      if (here && !carried) this.life?.print(sid, st, now, this.map, this.grid.onLand(st.x, st.y));
      else this.life?.prints.forget(sid);
      if (here && !carried) model.upsertAvatar(sid, st);
      else if (model.hasAvatar(sid)) model.removeAvatar(sid);
      if (tp && !carried)
        bodies.push({
          ...st,
          id: sid,
          level: p.level ?? 0,
          typing: st.a === 2 && (st.busy === "computer" || model.atWork(st.x, st.y)),
          reduced,
        });
      // voice: volume + stereo from where they are relative to me
      if (this.hear.has(sid) && !unseen) {
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
          tp ? tp.pan(ear, src) : panOf(ear, src),
        );
      } else this.media.setVoice(String(p.uid), 0, 0);
    }
    const night = model.getDaylight().night;
    room.state.npcs.forEach((n, id) => {
      const pos = interpolate(this.npcBuf.get(id) ?? [{ t: 0, x: n.x, y: n.y }], renderAt);
      // (the guard, the Kart Park's folk: people of the Grounds' life, not Vortex)
      const guard = n.kind === "guard" ? this.life?.guard(n, night) : n.kind === "folk" ? this.life?.folk(n) : null;
      const st: AvatarState & { z?: number; ground?: number } = {
        ...(guard ?? this.npcState(n)),
        x: pos.x,
        y: pos.y,
      };
      // (Vortex is the studio's; the night guard's on the ground floor — at his post in the
      // gatehouse by day, walking out to the fence after dark: the server walks him)
      const home = (n.level ?? -1) < 0 ? floorOf(this.building) : n.level;
      if ((n.kind === "guard" || n.kind === "folk") && !guard) {
        if (model.hasAvatar(`npc:${id}`)) model.removeAvatar(`npc:${id}`);
        return;
      }
      // (out on the land his feet are on it: the ground's not at 0 by the gatehouse)
      // (sat on a seat, the server says how high)
      if (guard && this.level === home) {
        st.ground = this.grid.groundAt(pos.x, pos.y, 0);
        st.z = Math.max(st.ground, n.z ?? 0);
      }
      if (this.level === home) model.upsertAvatar(`npc:${id}`, st);
      else if (model.hasAvatar(`npc:${id}`)) model.removeAvatar(`npc:${id}`);
      if (tp) bodies.push({ ...st, id: `npc:${id}`, reduced, level: home });
    });
    // Vortexes at the game tables (a Vortex for every game)
    const tv = new Set<string>();
    // (and sat in the chess tables' empty chairs, plan 70)
    for (const v of [...(this.tableGames.tables?.vortexes() ?? []), ...(this.tableGames.chess?.vortexes() ?? [])] as {
      key: string;
      x: number;
      y: number;
      angle: number;
      mood: string;
      sit?: number;
    }[]) {
      const id = `npc:${v.key}`;
      tv.add(id);
      const st = {
        ...this.npcState({
          x: v.x,
          y: v.y,
          yaw: faceByte(Math.cos(v.angle), Math.sin(v.angle), 128),
          a: 0,
          mood: v.mood,
        }),
        x: v.x,
        y: v.y,
        ...(v.sit !== undefined ? { vortexSit: v.sit } : {}),
      };
      model.upsertAvatar(id, st);
      if (tp) bodies.push({ ...st, id, reduced, level: this.level });
    }
    for (const id of this.tableGames.tableVortexes) if (!tv.has(id)) model.removeAvatar(id);
    this.tableGames.tableVortexes = tv;
    // toys in the air and on the floor (shared/pets.ts): where each is right now
    const toyList: { id: string; kind: string; x: number; y: number; z: number }[] = [];
    const wall = Date.now();
    room.state.toys.forEach((t) => {
      if (t.state === "mouth") return;
      const at = toyAt({ fromX: t.fromX, fromY: t.fromY, toX: t.x, toY: t.y, at: t.at, dur: t.dur }, wall);
      toyList.push({ id: t.id, kind: t.kind, x: at.x, y: at.y, z: at.z });
    });
    if (tp) tp.setToys(toyList);
    // walking over to pick a toy up
    if (this.toyPick && !this.path) {
      const t = room.state.toys.get(this.toyPick);
      if (t && Math.hypot(t.x - this.me.x, t.y - this.me.y) < 1.6) this.send("toy:pick", { id: t.id });
      this.toyPick = null;
    }
    room.state.pets.forEach((pet, id) => {
      // (in a car: the car draws it, in its seat — car/cars.ts; in a lift's car it's drawn as ever)
      const inCar = pet.ride && pet.ride !== "lift";
      if (!pet.alive || inCar) {
        if (inCar && model.hasAvatar(`pet:${id}`)) model.removeAvatar(`pet:${id}`);
        return;
      }
      const pos = interpolate(this.petBuf.get(id) ?? [{ t: 0, x: pet.x, y: pet.y }], renderAt);
      const st = { ...this.pets.petState(pet), x: pos.x, y: pos.y };
      // (out on the land its feet are on it — the hills, the road —; in a lift's car, the car's height)
      if ((pet.floor ?? 0) === this.level && !pet.z) st.z = this.grid.groundAt(pos.x, pos.y, 0, 0.25);
      if ((pet.floor ?? 0) === this.level) model.upsertAvatar(`pet:${id}`, st);
      else if (model.hasAvatar(`pet:${id}`)) model.removeAvatar(`pet:${id}`);
      if (tp) bodies.push({ ...st, id: `pet:${id}`, reduced, level: pet.floor ?? 0 });
    });
    // their steps (docs/plan/63-the-steps.md, phase 3): everyone else's near me, as they land
    if (bodies.length > 1) this.steps.theirSteps(bodies, dt);
    this.water.waterSound(bodies, dt);
    this.watchActs();
    lap = perf.lap("logic", lap); // (doors, things, moving, the tables and screens, the people)
    if (tp) {
      // the room as it is (doors swinging, seats taken, edits): only what changed is redrawn
      // build mode: what it shows (ghosts, previews, outlines); things in hand are left out of the
      // room — and my arrival pin while I pick one, outside it too
      const building = hud.get().build.on;
      const look = building || model.minePin() ? model.buildLook() : null;
      tp.buildPick.setBuild(look, building);
      tp.buildPick.floorHover = hud.get().pickArrival;
      if (now >= this.tpDue || (look && look.hidden.size !== this.tpHidden)) {
        this.tpDue = now + 200;
        this.tpHidden = look?.hidden.size ?? 0;
        // (nothing it's made from changed — the things, as the model has them, my floor, the
        // map — : the same floors again, not worked out again. Build mode: every time)
        const key = look ? null : `${this.objsRev}|${model.objRev}|${this.level}|${this.cars ? 1 : 0}`;
        const same = key !== null && key === this.tpKey && this.building === this.tpBuilt && tp === this.tpFor;
        this.tpKey = key;
        this.tpBuilt = this.building;
        this.tpFor = tp;
        if (!same) {
          // (every floor's things: the 3D view draws the floors below mine too —
          // my floor's as the model has them: a door swung open for someone
          // passing, a seat taken, a radio's display on live only there)
          // (the lot's cars: drawn by car/cars.ts once it's here)
          const all = [...this.objs.values()]
            .filter((o) => !this.cars || o.kind !== "car")
            .map((o) => model.getObject(o.id) ?? o);
          tp.structure = this.structure;
          tp.update(this.building, look?.hidden.size ? all.filter((o) => !look.hidden.has(o.id)) : all, this.level);
        }
      }
      lap = perf.lap("tp.update", lap);
      tp.setLiveFrom({ model, screens: this.screens, games: this.games, os: this.os });
      tp.setCars(this.slots?.cars() ?? []);
      tp.setTables(this.tableGames.tables?.scene3d() ?? null);
      tp.gameCam =
        this.god?.camera(this.godDt(now)) ??
        this.cars?.camera() ??
        this.photos.photoCam() ??
        this.tableGames.chess?.gameCam() ??
        this.tableGames.tables?.gameCam() ??
        this.lifts.liftCam(now) ??
        null;
      if (this.lifts.liftsDirty) {
        this.lifts.liftsDirty = false;
        tp.setLifts(
          [...this.objs.values()].filter((o) => o.kind === "elevator"),
          this.lifts.liftSince,
        );
      }
      tp.setCable(this.cable.cableEnds());
      tp.setGames(this.games?.scene3d() ?? null);
      // (a hidden tab: nothing to draw for)
      tp.tags.tagsHidden = !!hud.get().panel.kind || !!this.photos.photo;
      // (in a car I'm not in `bodies` — the car draws me — but the view still follows me)
      const seat = this.cars?.mySeat();
      if (!document.hidden) tp.frame(dt, bodies, localSid, seat ? { ...seat, level: 0 } : undefined);
      lap = perf.lap("tp.frame", lap);
    }
    for (const cb of this.hudFrames) cb();
    this.cable.checkCable();
    this.focus.updatePrompt();
    if (now - this.peopleAt > 250) {
      this.peopleAt = now;
      this.publishPeople();
    }
    this.follow(now);
    this.updateAudioScene();
    this.loading.watchLoading(now);
    perf.lap("hud", lap);
    perf.end();
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
    for (const box of this.model?.allObjects() ?? []) {
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
          : panOf(this.me, { x: box.x + 0.5, y: box.y + 0.5 });
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

  objectsDirty = false;

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
    // in a lift's car on the move: it carries me — its floor under me in Jolt (the server holds me
    // in it too: world-server features/lifts.ts)
    const phys = this.tp?.body.physics;
    const nowMs = performance.now();
    phys?.setLifts(this.lifts.carBodies(nowMs));
    if (this.lifts.liftCarry(nowMs, !!phys)) return;
    // the land changed under me (god mode's edits laid, the park's layout raced): till my body's
    // ground is made again (tp/physics3d.ts: a second or so), never under the land — onto it, as
    // the server sets me (docs/plan/53-the-god-mode.md)
    if (performance.now() < this.landShifted) this.ontoLand();
    // in god mode: my body stays where it stood (on foot again walking the draft)
    if (this.god?.on && !this.god.walking) return;
    // my body (docs/plan/29-the-move.md): the movement core on its fixed step, under the keys,
    // the pad or a click-to-walk path (the input chunk: until it's here, I stand still)
    const w = this.walker;
    if (!w) return;
    w.limp = !!this.tp?.body.limpMe();
    // (down on the ragdoll: where my body's gone, my place — it tumbles on from a fall; it slid back
    // to where I'd stood to get up)
    const drift = w.limp ? this.tp?.body.limpDrift() : null;
    if (drift && Math.hypot(drift.dx, drift.dz) > 0.02) {
      w.driftBy(drift.dx, drift.dz);
    }
    const upYaw = w.limp ? this.tp?.body.limpFacing() : null;
    if (upYaw != null) w.faceYaw(upYaw);
    const first = this.firstPerson();
    const lp = this.room?.state.players.get(this.room.sessionId);
    const playing = !!this.games?.playing();
    if (this.tp) this.tp.padFree = !playing;
    const G = this.G;
    const out = w.frame(dt, {
      grid: this.grid,
      // (outdoors on the land: snow, the trails, the pond's ice; else a floor)
      footing: (x, y) => (G && this.grid.onLand(x, y) ? G.surfaceTileAt(Math.floor(x), Math.floor(y)) : "floor"),
      // (a car on the move is in the way)
      blocked: this.level === 0 && this.cars ? (x, y) => !!this.cars?.blocks(x, y) : undefined,
      // (locked on: the way to them, exactly — the camera comes round after it, and going by its
      // turn, still behind, a circle round them spiralled out)
      camYaw: this.focus.lock
        ? Math.atan2(this.focus.lock.y - this.me.y, this.focus.lock.x - this.me.x)
        : (this.tp?.lookYaw ?? 0),
      // (locked on: I face it, and go round it — docs/plan/56 E)
      faceLook: first || !!this.focus.lock,
      canJump: !!lp && this.me.a !== ANIM.sit && !lp.busy && !lp.act && !playing,
      // (aiming, in 3D, anywhere: a gun, or the flashlight raised — world/dark/arms.ts; a quick
      // right click on a thing is still its menu)
      canAim: !!this.tp,
      usePad: !playing && !hud.get().menu,
      path: this.path,
      at: { x: this.me.x, y: this.me.y, z: this.height.z },
      // (the Grounds' pond and river, out on the land: docs/plan/66-the-water.md)
      water: G && this.level === 0 ? (x, y) => this.water.waterAt(x, y) : undefined,
      camPitch: this.tp?.aimPitch,
      waterTemp: this.room?.state.weather?.water,
    });
    this.mySwim = out.swim;
    this.water.thinIce(dt, out);
    // the camera on the arrows (the stick's the view's own)
    if (this.tp) {
      this.tp.keyLook = w.camKeys();
      this.tp.myFacing = out.yaw;
      // aiming help on a pad or the keys (not the mouse's: docs/plan/56 E): onto whoever's on my floor
      this.tp.aimAssist = hud.get().padLive || !this.tp.mouseLook.looking;
      if (out.aim && this.room) {
        const list: { x: number; y: number; z: number }[] = [];
        this.room.state.players.forEach((p, sid) => {
          if (sid !== this.room?.sessionId && (p.level ?? 0) === this.level) list.push({ x: p.x, y: p.y, z: 1.2 });
        });
        this.tp.aimTargets = list;
      }
    }
    const now = performance.now();
    if (out.manual) {
      this.actions.clear();
      this.path = null;
      this.pathTarget = null;
      hud.set({ following: null });
    }
    // (the pad's buttons: X uses, Y the camera, ↑ the torch)
    if (out.presses.has("use") && !this.focus.use) this.focus.use = { src: "pad", at: now, done: false };
    if (out.presses.has("recenter")) this.tp?.recenter();
    if (out.presses.has("lock")) this.focus.toggleLock();
    if (out.presses.has("focusPrev")) this.focus.cycleFocus(-1);
    if (out.presses.has("focusNext")) this.focus.cycleFocus(1);
    this.focus.holdFrame(now);
    // a menu open: the pad moves its choice, A does it, B closes it (the walker's off it meanwhile)
    if (hud.get().menu) {
      const mp = w.menuPad();
      if (mp.step) this.menu.menuStep(mp.step);
      if (mp.pick) this.menu.menuPick();
      if (mp.back) this.menu.closeMenu();
    }
    if (out.presses.has("camera")) this.focus.swapCamera();
    if (out.presses.has("torch")) this.toggleTorch();
    let moved = out.moved;
    const went = Math.hypot(out.x - this.me.x, out.y - this.me.y);
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
      this.me.yaw = face8(Math.cos(out.yaw), Math.sin(out.yaw), this.me.yaw);
    }
    if (this.path && !this.path.length) {
      this.walkPath = null; // (a way asked for meanwhile still comes)
      const target = this.pathTarget;
      this.pathTarget = null;
      if (target?.objectId) this.menu.activateObject(target.objectId, false);
    }
    // a jump: the view's stages from its take-off; everyone else told (after where I am, below)
    const jumped = out.jumped;
    if (jumped) {
      this.jumpTrack.begin(jumped, now - (jumpTimes(jumped).crouch - w.takeoff) * 1000);
      void loadJumps();
      this.activeAt = now;
    }
    // one building (docs/plan/50 D): past a storey's band my feet are on the next floor up or down
    // where it has a floor under them — up the stairs, or a flier through a ceiling (its frame is a
    // storey off, its coords maybe shifted; beside the building the land rises and falls as it
    // likes)
    // (the floor from the slab under me — Jolt's, once it's in; the floors' tiles till then)
    const change = floorAt(
      this.building,
      this.level,
      this.me,
      hgt.z,
      phys ? (l, q) => phys.slabUnder(l, q.x, q.y) : undefined,
    );
    if (change) {
      const from = this.level;
      const at = change.at;
      w.shift(at.x - this.me.x, at.y - this.me.y, change.dz);
      this.me.x = at.x;
      this.me.y = at.y;
      hgt.z += change.dz;
      // (a way up or down the stairs goes on from where it was, in the new floor's coords)
      const rest = this.path?.map((p) => across(this.building, from, change.level, p)) ?? null;
      if (this.tp) this.tp.carryFrom = from; // (the 3D camera keeps its place in the building)
      this.setLevel(change.level);
      this.walkPath = rest?.length ? rest : null;
      moved = true;
    }
    // (up on something or in the air nobody sits down: a jump over a chair lands on its feet)
    const seat = hgt.up || hgt.z > 0 || this.jumpTrack.kind ? null : this.grid.seatAt(this.me.x, this.me.y);
    // (what's underfoot: on the land snow, the trail, the ice — or a floor's tile)
    const floor = this.steps.myFooting(hgt.z);
    // my steps (docs/plan/63-the-steps.md): never in the air, a verb or a move, nor down on hands and
    // knees in the dark (their own sounds: the steps chunk's Footfalls); the stairs' treads as any floor
    this.steps.feet = {
      // (nor swimming: plan 66)
      ok:
        !hgt.up &&
        !out.verb &&
        !out.flow &&
        out.swim < 2 &&
        !this.jumpTrack.kind &&
        !this.tp?.downed.has(this.room?.sessionId ?? ""),
      gait: out.gait === "crouch" || out.gait === "jog" || out.gait === "sprint" ? out.gait : "walk",
    };
    this.steps.stepsBy(went, floor, dt);
    if (moved) this.me.a = ANIM.walk;
    else if (seat) {
      this.me.a = ANIM.sit;
      if (this.me.a !== this.lastSent.a) {
        // snap onto the seat and face its direction (the walker's body with me: else it's walked
        // straight back off it the next frame)
        // (a desk's chair: pulled in to it — plan 62, the grid's `seatSpot`)
        const at = this.grid.seatSpot(this.me.x, this.me.y);
        w.shift(at.x - this.me.x, at.y - this.me.y, 0);
        this.me.x = at.x;
        this.me.y = at.y;
        // away from the seat's back (server `seatFacing`); a free one turned its own way (plan 72 11.9)
        this.me.yaw = seat.front ? seatYaw(seat) : byteFace(SEAT_FACE[seat.rot & 3]);
        // (the body's own yaw too: else it's still the way I walked onto it, and sends me back round)
        const [fx, fy] = seatDir(seat);
        w.faceYaw(Math.atan2(fy, fx));
        this.meAngle = Math.atan2(fy, fx);
      }
    } else this.me.a = ANIM.idle;
    // a selfie: I face the camera (it's in front of me)
    if (this.photos.photo?.mode === "selfie" && !moved) {
      const a = this.tp ? this.photos.photo.angle : Math.atan2(1, 1);
      this.me.yaw = face8(Math.cos(a), Math.sin(a), this.me.yaw);
      this.meAngle = a;
    }
    // first person: I face where I look; else a seat, a high-five turns me (input/walker.ts)
    const view = first ? this.tp : null;
    this.meAngle = w.face(this.me, view, moved, this.lookYaw, this.meAngle, face8);
    this.lookYaw = view ? this.me.yaw : Number.NaN;

    const changed =
      Math.abs(this.me.x - this.lastSent.x) > 0.01 ||
      Math.abs(this.me.y - this.lastSent.y) > 0.01 ||
      Math.abs(this.height.z - this.lastSent.z) > 0.01 ||
      this.level !== this.lastSent.l ||
      this.me.yaw !== this.lastSent.yaw ||
      this.me.a !== this.lastSent.a ||
      out.mv !== this.lastMv ||
      out.yawByte !== this.lastYaw ||
      Math.round(this.myPitch * 40) !== this.lastPitch;
    // (aiming: over the shoulder, the body and the torch where I look)
    if (this.tp) this.tp.aim = out.aim;
    // (my torch's battery: low, it flickers)
    if (this.tp) this.tp.battery = w.vitals.bat;
    this.myVerb = out.verb ?? undefined;
    this.myFlow = out.flow;
    if (this.tp) this.tp.swingAt = out.pole;
    this.myPitch = out.aim && this.tp ? this.tp.aimPitch : 0;
    const go = jumped ?? out.started?.kind;
    // (a jump, a verb: where I took off from first, so the server sees my feet on the ground)
    if ((changed && now - this.lastSent.t >= 1000 / TICK_HZ) || go) {
      const z = Math.round(this.height.z * 1000) / 1000;
      this.send("pos", {
        x: this.me.x,
        y: this.me.y,
        z: worldZ(this.level, z),
        l: this.level,
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
    if (go) this.send("jump", { k: go, h: out.started?.h, air: out.air || undefined });
    if (out.flowCode !== this.myFlowSent) {
      this.myFlowSent = out.flowCode;
      this.send("flow", { f: out.flowCode });
    }
  }

  /** Walk to `target` on my floor (then on along `after`): the way asked of the server, walked when
   *  it comes (meanwhile any way I'm on goes on). False: not now (building, no room). */
  walkTo(target: Point, objectId?: string, quiet = false, after: Point[] = []): boolean {
    if (hud.get().build.on || !this.room) return false;
    const n = ++this.wayN;
    this.way = { n, level: this.level, target, objectId, quiet, after };
    this.send("way", { n, x: target.x, y: target.y, fx: this.me.x, fy: this.me.y });
    return true;
  }

  // the way asked for, come: walked (one asked since, or let go, or another floor now: dropped)
  private wayHere(m: ServerMessages["way"]) {
    const w = this.way;
    if (!w || w.n !== m.n) return;
    this.way = null;
    if (w.level !== this.level) return;
    if (!m.pts) {
      if (!w.quiet) this.tp?.showMarker(w.target.x, w.target.y);
      this.path = null;
      return;
    }
    const path = [...m.pts.map(([x, y]) => ({ x, y })), ...w.after];
    this.path = path;
    this.pathTarget = w.objectId ? { objectId: w.objectId } : null;
    const end = path[path.length - 1] ?? w.target;
    this.tp?.showMarker(end.x, end.y);
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

  // ── the lot's cars, driven (docs/plan/28-the-car.md; car/cars.ts, loaded on their own) ──
  cars: import("./car/cars").Cars | null = null;
  private lifeCars: { id: string; kind: string; x: number; z: number; a: number; shown: boolean; h?: number }[] = [];

  // ── life on the Grounds (docs/plan/27, phase 6; grounds-life.ts, loaded with them) ──
  life: import("./grounds-life").GroundsLife | null = null;
  private driveVehicles(dt: number) {
    if (!this.life || !this.room) return;
    const list = this.life.drive(dt, this.room.state.vehicles, this.me, this.level === 0);
    // (the Grounds' own: the drivable ones are the car module's)
    this.lifeCars = list.filter((v) => /^(shuttle|plough|visitor)$/.test(v.kind));
    this.tp?.vehicles.setVehicles(this.lifeCars);
  }

  // Moves between people: a spark and its sound where the hands meet (one of
  // the two shows it), heard by whoever's near.
  private actsSeen = new Map<string, string>();
  private watchActs() {
    const room = this.room;
    if (!room) return;
    room.state.players.forEach((p, sid) => {
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
        this.model?.puff(mid.x, mid.y, "spark", act === "highfive" ? 1.68 : 1.12);
        socialSound(act, Math.max(0, 1 - d / 9));
      }, SOCIAL_MS[act] * CONTACT);
    });
  }

  // Where someone is drawn right now (me: where I am).
  whereIs(sid: string): Point | null {
    if (sid === this.room?.sessionId) return { x: this.me.x, y: this.me.y };
    const r = this.remotes.get(sid);
    return r ? interpolate(r.buf, performance.now() - INTERP_MS) : null;
  }

  // ── the action menu ──────────────────────────────────────────────────────
  private facedAct = 0;

  // ── people / HUD ─────────────────────────────────────────────────────────
  private publishPeople() {
    const room = this.room;
    if (!room) return;
    const people: Person[] = [];
    let me: Person | null = null;
    const admin = !!room.state.players.get(room.sessionId)?.admin;
    room.state.players.forEach((p, sid) => {
      const local = sid === room.sessionId;
      // (a hidden admin: on no one's list but the admins' — shared admin.ts POWERS.hidden)
      if (!local && p.powers & 8 && !admin) return;
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
    const fps = this.tp?.fps ?? 0;
    hud.set({ me, people, fps: Math.round(fps) });
    const vx = room.state.npcs.get("vortex");
    hud.set({ vortex: vx ? { x: vx.x, y: vx.y, say: vx.say, sayAt: vx.sayAt, mood: vx.mood } : null });
    const petsAt: { x: number; y: number }[] = [];
    room.state.pets.forEach((pet) => {
      // (lost: not where it is — where it was last seen is on the GPS)
      if (pet.sid === room.sessionId && pet.alive && pet.mode !== "lost") petsAt.push({ x: pet.x, y: pet.y });
    });
    if (petsAt.length || hud.get().myPetsAt.length) hud.set({ myPetsAt: petsAt });
    this.pets.publishPets();
  }

  setStatus(status: "online" | "away" | "dnd") {
    this.send("status", { status });
  }

  // ── jumping ─────────────────────────────────────────────────────────────

  // what's under (x, y) from z down: the grid's, and where that has them off it (up on a roof, a
  // wall's top — or in the air) Jolt's say in 3D, as the move core stands on it
  groundUnder(x: number, y: number, z: number): number {
    const g = this.grid.groundAt(x, y, z);
    if (z <= g + 0.03 || !this.tp) return g;
    return Math.max(g, this.tp.body.groundUnder(this.grid, this.level, x, y, z));
  }

  emote(i: number) {
    const e = EMOTES[i];
    if (e) this.send("emote", { e });
  }

  teleport(to: ClientMessages["teleport"]["to"]) {
    this.path = null;
    this.send("teleport", { to });
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
    const model = this.model;
    const room = this.room;
    if (!model || !room) return;
    const screens = hud.get().screens;
    let video: HTMLVideoElement | null = null;
    room.state.players.forEach((p) => {
      const a = areaAt(this.map, p.x, p.y);
      if (a?.kind === "stage" && screens[String(p.uid)]) video = screens[String(p.uid)];
    });
    const stageScreen = model.allObjects().find((o) => o.kind === "screen_wall" && o.props?.source === "stage");
    if (stageScreen) model.setScreenVideo(stageScreen.id, video);
  }

  private vortexListeners = new Set<(text: string) => void>();

  onVortexSay(fn: (text: string) => void) {
    this.vortexListeners.add(fn);
    return () => {
      this.vortexListeners.delete(fn);
    };
  }

  // The light follows the world's hour (art/daylight.ts: day, golden hour, dusk,
  // night): São Paulo's, held by the server (shared clock.ts), a minute at a
  // time; round to one an admin sets at an hour a second.
  private updateNight(first = false) {
    const st = this.room?.state;
    const d = (((st?.players.size ? st.hour : spHour(Date.now())) - this.hour + 36) % 24) - 12;
    if (!first && Math.abs(d) < 1 / 60) return;
    this.hour = (this.hour + Math.max(-1, Math.min(1, d)) + 24) % 24;
    this.model?.setClock(this.hour);
    this.tp?.setHour(this.hour);
  }
  private hour = spHour(Date.now());

  // ── third person (world/tp, its own chunk) ─────────────────────────────────
  // The only view (iso retired: docs/plan/50-the-volume.md, phase 7): a three.js
  // view draws the people and the things the model has, and answers it what's
  // on the screen where.
  tp: ThirdPersonView | null = null;
  private tpHost: HTMLDivElement | null = null;
  private tpLoading = false;
  private tpDue = 0;
  private tpHidden = 0;
  meAngle = 0; // my facing in 3D (free; others see the nearest of 8)
  private lookYaw = Number.NaN; // first person: the 8-way facing I last set from where I look
  private viewNow: "none" | "3d" = "none"; // (none: before the 3D view has opened, or if it failed)

  // the 3D camera the prefs ask for (first person steps back out to the
  // chase camera while build mode is on: placing things from inside your
  // head is awkward)
  camWanted(): CamMode {
    // the phone's camera: Photo is my eyes, Selfie a camera out in front of me
    if (this.photos.photo) return this.photos.photo.mode === "photo" ? "first" : "chase";
    if (prefs().view === "1p") return hud.get().build.on ? "chase" : "first";
    // (one camera behind you: how it follows is its own setting — docs/plan/56-the-controls.md D)
    return "chase";
  }
  // the KH camera as the settings have it (docs/plan/56-the-controls.md D)
  private camPrefs(v: ThirdPersonView) {
    const p = prefs();
    const t = v.follow.tune;
    t.follow = p.camFollow;
    t.sens = p.stickSens;
    t.mouseSens = p.lookSens;
    t.invertY = p.lookInvert;
    t.invertX = p.lookInvertX;
  }
  // in my head (the first-person camera is showing)
  firstPerson(): boolean {
    return this.tp?.mode === "first";
  }

  private syncView() {
    if (!this.model || !this.room) return;
    this.tp?.setMode(this.camWanted());
    if (this.tp) {
      this.tp.mouseLook.lookSens = prefs().lookSens;
      this.tp.mouseLook.lookInvert = prefs().lookInvert;
      this.tp.handsOn = prefs().hands1p;
      this.camPrefs(this.tp);
    }
    if (this.viewNow === "3d") return;
    this.viewNow = "3d";
    const go = () => {
      if (!this.stopped) void this.openTp();
    };
    // the loading screen up first, painted, then the work behind it (entering, it's up already)
    if (hud.get().loading.on) return go();
    this.loading.holdLoading("view");
    requestAnimationFrame(() => requestAnimationFrame(go));
  }

  private async openTp() {
    if (this.tp || this.tpLoading) return;
    this.tpLoading = true;
    try {
      const [{ ThirdPersonView }, themes] = await Promise.all([import("./tp/game-view"), loadThemes()]);
      const model = this.model;
      if (this.stopped || this.viewNow !== "3d" || !model) return;
      const host = document.createElement("div");
      host.style.cssText = "position:absolute;inset:0";
      this.host.appendChild(host);
      const v = new ThirdPersonView(this.building, [...this.objs.values()], {
        keys: false,
        themes,
        level: this.level,
        quality: this.quality.qualityNow(),
        structure: this.structure,
      });
      v.printsPart.prints = this.life?.prints ?? null;
      v.events = {
        floor: (x, y, mods) => model.events.onTileClick?.(x, y, mods),
        person: (id, at) => model.events.onAvatarClick?.(id, at),
        toy: (id) => model.events.onToyClick?.(id),
        object: (id, at) => model.events.onObjectClick?.(id, at),
        // build mode: the build controller, fed the floor under the pointer (client px: drags
        // measure by it)
        buildMove: (x, y, at) => {
          model.pointerAt = { x: at.x, y: at.y };
          model.events.onPointerWorld?.(x, y);
        },
        buildDown: (x, y) => model.events.onPointerDown?.(x, y),
        buildUp: (x, y) => model.events.onPointerUp?.(x, y),
        wheel: (dy) => model.events.onWheel?.(dy) ?? false,
        look: (on) => {
          hud.set({ look: on });
          if (!on) this.focus.aimId = null;
        },
        lookRefused: () => toast(tr("lookRefused")),
        aim: (at) => {
          this.focus.aimId = at?.object ?? null;
          this.focus.updatePrompt();
        },
      };
      // what's under the pointer and where things are on screen: as this camera sees them
      model.view = {
        picks: (filter) =>
          v.buildPick
            .picksAtPointer()
            .filter((p) => {
              if (p.dress) return true;
              const o = model.getObject(p.id);
              return !!o && !!entry(o.kind).buildable && (!filter || filter(o));
            })
            .map((p) =>
              p.dress ? { id: p.id, dress: true as const, kind: p.kind ?? "" } : { id: p.id, dress: false as const },
            ),
        project: (x, y, z) => v.project(x, y, z),
        floorAt: (cx, cy, z) => v.buildPick.floorAt(cx, cy, z),
        rayAt: (cx, cy) => v.buildPick.rayAt(cx, cy),
        lookedThrough: () => v.buildPick.lookedThrough(),
        throughAt: (x, y) => v.buildPick.throughAt(x, y),
        puff: (x, y, kind, lift, hard) => v.puff(x, y, kind, lift, hard),
      };
      v.mount(host);
      v.warmup.setQuality(this.quality.qualityNow());
      v.setMode(this.camWanted());
      v.mouseLook.lookSens = prefs().lookSens;
      v.mouseLook.lookInvert = prefs().lookInvert;
      this.camPrefs(v);
      v.handsOn = prefs().hands1p;
      v.setHour(this.hour);
      v.warmup.warming = hud.get().loading.on;
      v.yaw = this.meAngle; // start behind me
      // (the camera takes the mouse only when nothing on screen wants the pointer)
      v.mouseLook.canLock = () => !this.focus.pointerWanted();
      // (the feet as the bodies put them down: the steps — mine, everyone else's near me)
      v.onStep = (id, side) =>
        id === this.room?.sessionId ? this.steps.myStep(side) : this.steps.footfalls?.body(id, side);
      v.onThud = (id, hard) => this.steps.footfalls?.impact(id, hard);
      v.onHop = (id, hard) =>
        id === this.room?.sessionId ? this.steps.myHop(hard) : this.steps.footfalls?.landed(id, hard);
      this.tp = v;
      this.tpHost = host;
      // (Jolt's world in: my place asked of it from now on)
      v.body.onPhysics = () => this.rebuildGrid();
      // the GPU took the 3D view's context away (a driver reset, too many tabs): said, and
      // reported; three gets it back by itself when the browser gives it (view.ts redraws the bakes)
      const canvas = v.renderer.domElement;
      canvas.addEventListener("webglcontextlost", () => {
        toast(tr("glLost"), "warn", 8000);
        reportError("webgl", new Error("context lost"));
      });
      canvas.addEventListener("webglcontextrestored", () => toast(tr("glBack"), "info", 3000));
      v.setHighlight(this.footprintOf(hud.get().prompt?.objectId));
    } catch (e) {
      console.error("third person", e);
      toast(tr("failed"));
      this.viewNow = "none"; // (tried again on the next prefs change)
    } finally {
      this.tpLoading = false;
    }
  }

  private closeTp() {
    this.tp?.destroy();
    this.focus.aimId = null;
    if (hud.get().look) hud.set({ look: false });
    this.tp = null;
    this.tpHost?.remove();
    this.tpHost = null;
    if (this.model) this.model.view = null;
  }

  // the floor outline of a thing (wall items: just in front of their wall)
  footprintOf(id: string | undefined): { x: number; y: number; w: number; h: number } | null {
    const o = id ? this.model?.getObject(id) : undefined;
    if (!o) return null;
    if (entry(o.kind).wall) {
      const r = hangStrip(o, 0.6);
      return { x: r.x0, y: r.y0, w: r.x1 - r.x0, h: r.y1 - r.y0 };
    }
    const { w, h } = placedFootprint(o);
    return { x: o.x - 0.08, y: o.y - 0.08, w: w + 0.16, h: h + 0.16 };
  }

  // A speech bubble over someone (Vortex, a pet).
  private say(id: string, text: string, ms?: number) {
    this.tp?.tags.say(id, text, ms);
  }

  // Where a world point is on screen (px from the world canvas's top-left; hostRect() for client
  // px). `z`: metres above the floor.
  clientAt(x: number, y: number, z: number): { x: number; y: number } {
    return this.model?.worldToClient(x, y, z) ?? { x: -9999, y: -9999 };
  }

  // ── god mode (docs/plan/53-the-god-mode.md): its own chunk (world/god), an admin's ──
  god: GodController | null = null;
  private godLoading: Promise<GodController | null> | null = null;
  private godAt = 0;
  loadGod(): Promise<GodController | null> {
    if (this.god) return Promise.resolve(this.god);
    this.godLoading ??= import("./god/controller").then((m) => {
      if (this.stopped || !hud.get().isAdmin) return null;
      this.god = new m.GodController(this);
      return this.god;
    });
    return this.godLoading;
  }
  /** In god mode, or out (an admin's: the world server refuses anyone else). */
  async toggleGod(): Promise<void> {
    if (!hud.get().isAdmin || !this.tp) return;
    if (hud.get().build.on) hud.set((s) => ({ build: { ...s.build, on: false } }));
    (await this.loadGod())?.toggle();
  }
  // (the god camera's step: the frame's own time)
  private godDt(now: number): number {
    const dt = this.godAt ? Math.min(0.1, (now - this.godAt) / 1000) : 0;
    this.godAt = now;
    return dt;
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
  // My place on my floor: locked doors of my own rooms let me through (Jolt's, once it's in).
  rebuildGrid() {
    if (!this.model) return;
    // (every floor's things: the stairs up from the floor below count here)
    this.grid = new Place(null, this.map, [...this.objs.values()]);
  }

  // Standing in an elevator's car: its panel (the floors it goes to). The car's
  // stop on my floor; riding, the doors shut, it stays up.
  private liftShown = "";
  private updateLift() {
    let at: WorldObjectDef | null = null;
    for (const o of this.model?.allObjects() ?? []) {
      if (o.kind !== "elevator") continue;
      const { w, h } = placedFootprint(o);
      if (this.me.x >= o.x && this.me.x < o.x + w && this.me.y >= o.y && this.me.y < o.y + h) at = o;
    }
    const pr = at?.props ?? {};
    const key = at ? `${at.id}|${hud.get().floors.join()}|${pr.ph}|${pr.at}|${pr.to}|${this.level}` : "";
    if (key === this.liftShown) return;
    this.liftShown = key;
    if (!at) {
      hud.set({ lift: null });
      return;
    }
    const shaft = String(at.props?.shaft ?? at.id);
    // (by station: a stop up on a mezzanine between its floor and the next — plan 72 phase 11)
    const floors = [...this.objs.values()]
      .filter((o) => o.kind === "elevator" && String(o.props?.shaft ?? o.id) === shaft)
      .map((o) => stationOf(o, this.building))
      .sort((a, b) => b - a);
    const mine = this.lifts.myLift(performance.now())?.o ?? at;
    const here = stationOf(mine, this.building);
    // (from the stop's props: the car's phase and floors, as the server says)
    const live = this.objs.get(at.id)?.props ?? pr;
    hud.set({
      lift: {
        id: at.id,
        floors: floors.map((level) => ({
          level,
          name: Number.isInteger(level)
            ? this.floorName(level)
            : `${this.floorName(Math.floor(level + 1e-3))} · ${tr("mezzanine")}`,
        })),
        here,
        // (on the way, the floor it's passing: mine, as it carries me)
        at: live.ph !== "moving" && typeof live.at === "number" ? live.at : this.level,
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
    const o = this.objs.get(id);
    const here = o ? stationOf(this.lifts.myLift(performance.now())?.o ?? o, this.building) : this.level;
    if (label === "◀▶") return this.send("lift:go", { id, level: here });
    if (label === "▶◀") return this.send("lift:close", { id });
    // (the button's station: the shaft's stop of that name — a mezzanine's GM, 1M)
    const shaft = String(o?.props?.shaft ?? id);
    const to = [...this.objs.values()].find(
      (s) =>
        s.kind === "elevator" &&
        String(s.props?.shaft ?? s.id) === shaft &&
        liftFloorName(stationOf(s, this.building)) === label,
    );
    if (to) this.send("lift:go", { id, level: stationOf(to, this.building) });
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
      this.send("lift:go", { id: o.id, level: l.here });
    }
  }

  /** A floor as rows of cells and edges from its corner, asked of the structure (e2e reads these —
   *  plan 72 phase 11: the world's maps carry no tile rows). */
  rows(level = this.level): {
    width: number;
    height: number;
    ox: number;
    oy: number;
    tiles: string[];
    hWalls: string[];
    vWalls: string[];
    hBacks: string[];
    vBacks: string[];
  } | null {
    const st = this.structure;
    const f = st?.floors.find((q) => q.index === level);
    if (!st || !f) return null;
    const { x0, y0, w, h } = f.grid;
    const line = (n: number, fn: (i: number) => string) => Array.from({ length: n }, (_, i) => fn(i)).join("");
    return {
      width: w,
      height: h,
      ox: x0,
      oy: y0,
      tiles: Array.from({ length: h }, (_, y) => line(w, (x) => cellTop(st, level, x0 + x, y0 + y))),
      hWalls: Array.from({ length: h + 1 }, (_, y) =>
        line(w, (x) => edgeFront(st, level, { dir: "h", x: x0 + x, y: y0 + y })),
      ),
      vWalls: Array.from({ length: h }, (_, y) =>
        line(w + 1, (x) => edgeFront(st, level, { dir: "v", x: x0 + x, y: y0 + y })),
      ),
      hBacks: Array.from({ length: h + 1 }, (_, y) =>
        line(w, (x) => edgeBack(st, level, { dir: "h", x: x0 + x, y: y0 + y })),
      ),
      vBacks: Array.from({ length: h }, (_, y) =>
        line(w + 1, (x) => edgeBack(st, level, { dir: "v", x: x0 + x, y: y0 + y })),
      ),
    };
  }

  /** The room's things as the server has them, on my floor (e2e reads these). */
  floorObjects(): WorldObject[] {
    const home = floorOf(this.building);
    const out: WorldObject[] = [];
    this.room?.state.objects?.forEach((o) => {
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

  // To another floor (the stairs, a ride, a teleport): my walk grid, the model
  // and the HUD that floor's now.
  setLevel(level: number) {
    if (level === this.level && floorOf(this.map) === level) return;
    this.level = level;
    this.life?.prints.clear(); // (they're the ground floor's)
    if (!this.building || !this.model) return;
    this.map = levelMap(this.building, level) ?? this.building;
    this.model.setMap(this.map);
    this.model.setObjects(
      onLevel(this.objs.values(), this.map)
        .filter(notDriven)
        .map((o) => this.lifts.liftDrawn(o)),
    );
    this.rebuildGrid();
    this.path = null;
    this.objectsDirty = true;
    this.tpDue = 0; // (the 3D view moves to that floor this frame)
    hud.set((h) => ({ floor: level, mapVersion: h.mapVersion + 1 }));
  }

  // The map lives in room state (per-space layout): rebuild walls/floors on change.
  private applyMapFromState() {
    const st = this.structure;
    if (!st || !this.model) return;
    // the tile maps the code not yet ported reads, made from the structure (plan 72 phase 6)
    this.building = { ...viewOf(st), objects: [] };
    // the floor I'm on (gone: the home one)
    const lm = levelMap(this.building, this.level);
    if (!lm) this.level = floorOf(this.building);
    this.map = lm ?? this.building;
    this.model.setMap(this.map);
    this.rebuildGrid();
    hud.set((h) => ({ mapVersion: h.mapVersion + 1, floor: this.level, floors: floorsOf(this.building) }));
  }
  // The building's structure (docs/plan/72-the-3d-core.md, phase 6) and its revision: whole when
  // asked for, then each edit's operations applied here as the server applied them.
  structure: Structure | null = null;
  structRev = -1;
  private mapDirty = false;

  // The play's own chunks, loaded once the world's joined (from Input.bindInput): my body's
  // controls, the land round the ground floor, its life and the lot's cars. (Here, not in
  // ctl/input.ts: these lazy imports keep the page's chunks as they were — plan 72 phase 4.)
  loadPlay() {
    void loadJumps(); // (a jump's dust and sounds: small, fetched now so the first one has them)
    // my body's controls and the movement core (docs/plan/29-the-move.md): a chunk of their own
    void import("./input").then((m) => {
      if (!this.stopped) this.walker ??= new m.Walker(this);
    });
    // the land round the ground floor: the grid walks it once it's here
    void loadGrounds().then((G) => {
      this.G = G;
      if (!this.stopped)
        this.offLandShifted = G.onGroundsChanged(() => {
          this.landShifted = performance.now() + LAND_SHIFTED_MS;
        });
      setOutdoors(G.groundsOutdoors);
      setAreasBeyond(G.groundsAreaAt);
      this.rebuildGrid();
      // (its life — footprints, vehicles, sound — in a chunk of its own)
      void import("./grounds-life").then((m) => {
        if (!this.G) return;
        this.life = new m.GroundsLife(G);
        if (this.tp) this.tp.printsPart.prints = this.life.prints;
      });
      // (the lot's cars, driven: docs/plan/28-the-car.md, in a chunk of their own — through the view's, tp/game-view.ts)
      void Promise.all([import("./tp/game-view").then((v) => v.loadCars()), loadChars()]).then(([m]) => {
        if (!this.G || this.stopped || this.cars) return;
        this.cars = m.attachCars(this, G);
        this.objectsDirty = true;
      });
    });
  }

  meTile() {
    return { x: this.me.x, y: this.me.y };
  }

  // the Grounds (docs/plan/27), once loaded: what's underfoot out there, its sound
  G: typeof import("@yutopia/shared/grounds") | null = null;
  /** till when the land under me may have moved (`ontoLand`) */
  landShifted = 0;
  offLandShifted: (() => void) | null = null;
  /** Under the land where I stand (on the ground floor, out on it): onto it. */
  private ontoLand() {
    if (this.level !== 0 || !this.grid.onLand(this.me.x, this.me.y)) return;
    const g = this.grid.outside?.height(this.me.x, this.me.y);
    if (g !== undefined && this.height.z < g - 0.05) this.height = { z: g, vz: 0, up: false };
  }
  /** Standing in a lift's car on my floor (its floor answers a landing). */
  inLiftCar(x: number, y: number): boolean {
    for (const o of this.objs.values())
      if (o.kind === "elevator" && objLevel(o, this.building) === this.level && inLift(o, { x, y })) return true;
    return false;
  }
  // where the body isn't stepping (first person, `?anim=old`, reduced motion, before its chunk's
  // in): a step every half a stride I go (plan 58's strides: tiles)
  // the kind of space I'm in, for the steps' reverb (phase 5): the stairs, a lift's car, a room by its
  // size (the server room's metal, a booth's deadened walls), out on the land by what's underfoot
  spaceHere(f: Floor): Space {
    if (this.grid.onRamp(this.me.x, this.me.y)) return "stairs";
    if (this.inLiftCar(this.me.x, this.me.y)) return "lift";
    if (this.grid.onLand(this.me.x, this.me.y))
      return f === "concrete" || f === "asphalt" || f === "slush" ? "street" : FLOORED.has(f) ? "room" : "dry";
    const a = areaAt(this.map, this.me.x, this.me.y);
    if (!a) return "room";
    if (/server/.test(a.key)) return "server";
    if (a.kind === "booth") return "booth";
    const n = a.w * a.h;
    return n < 60 ? "small" : n < 250 ? "room" : "hall";
  }

  /** The GPS (docs/plan/37-the-gps.md): where I am on the Grounds' coords (my
   *  floor's corner is somewhere in them), facing (0: north, clockwise), my floor. */
  gpsWhere(): { x: number; z: number; h: number; level: number } {
    return {
      x: this.me.x,
      z: this.me.y,
      h: this.meAngle + Math.PI / 2,
      level: this.level,
    };
  }

  /** The phone's flashlight on or off (everyone sees its beam). */
  toggleTorch() {
    this.send("phone:torch", { on: !hud.get().torch });
  }
  /** How hard it's storming here (0…1, eased) and where the wind's from. */
  storm = 0;
  wind = 0;

  // ── helpers ──────────────────────────────────────────────────────────────
  private avatarState(p: Player, _local: boolean): AvatarState {
    const look = parseAvatar(p.avatar);
    return {
      name: p.name,
      // focusing: headphones on
      avatar: p.focus ? { ...look, accessory: "headphones" } : look,
      x: p.x,
      y: p.y,
      yaw: byteFace(p.yaw),
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
      hitAt: p.hitAt,
      hitYaw: p.hitYaw,
      hp: p.hp,
      wm: p.wm,
      st: p.st,
      pinned: !!p.bitBy || undefined,
    };
  }

  // (Vortex as the room has him, or a stand-in of his drawn by the Grounds' life: what's read of him)
  private npcState(n: Pick<Npc, "x" | "y" | "yaw" | "a" | "mood">): AvatarState {
    return {
      name: "VORTEX",
      avatar: VORTEX_LOOK,
      x: n.x,
      y: n.y,
      yaw: byteFace(n.yaw),
      a: n.a,
      status: "online",
      speaking: false,
      emote: n.mood === "glitch" ? "fire" : "",
      vortexMood: n.mood,
      mic: false,
      npc: true,
    };
  }

  /** (moved to ActionMenu: read from outside) */
  menuFor(...a: Parameters<ActionMenu["menuFor"]>): ReturnType<ActionMenu["menuFor"]> {
    return this.menu.menuFor(...a);
  }
  /** (moved to ActionMenu: read from outside) */
  openMenu(...a: Parameters<ActionMenu["openMenu"]>): ReturnType<ActionMenu["openMenu"]> {
    return this.menu.openMenu(...a);
  }
  /** (moved to ActionMenu: read from outside) */
  activateObject(...a: Parameters<ActionMenu["activateObject"]>): ReturnType<ActionMenu["activateObject"]> {
    return this.menu.activateObject(...a);
  }

  /** (moved to Steps: read from outside) */
  footingAt(...a: Parameters<Steps["footingAt"]>): ReturnType<Steps["footingAt"]> {
    return this.steps.footingAt(...a);
  }
  /** (moved to Steps: read from outside) */
  get feet() {
    return this.steps.feet;
  }
  set feet(v) {
    this.steps.feet = v;
  }
  /** (moved to Steps: read from outside) */
  get stepper() {
    return this.steps.stepper;
  }
  set stepper(v) {
    this.steps.stepper = v;
  }
  /** (moved to Steps: read from outside) */
  myStep(...a: Parameters<Steps["myStep"]>): ReturnType<Steps["myStep"]> {
    return this.steps.myStep(...a);
  }
  /** (moved to Steps: read from outside) */
  get footfalls() {
    return this.steps.footfalls;
  }
  set footfalls(v) {
    this.steps.footfalls = v;
  }
  /** (moved to Steps: read from outside) */
  get ears() {
    return this.steps.ears;
  }
  set ears(v) {
    this.steps.ears = v;
  }
  /** (moved to Steps: read from outside) */
  myFooting(...a: Parameters<Steps["myFooting"]>): ReturnType<Steps["myFooting"]> {
    return this.steps.myFooting(...a);
  }

  /** (moved to Focus: read from outside) */
  offAt(...a: Parameters<Focus["offAt"]>): ReturnType<Focus["offAt"]> {
    return this.focus.offAt(...a);
  }
  /** (moved to Focus: read from outside) */
  get focusHost() {
    return this.focus.focusHost;
  }
  /** (moved to Focus: read from outside) */
  interact(...a: Parameters<Focus["interact"]>): ReturnType<Focus["interact"]> {
    return this.focus.interact(...a);
  }

  /** (moved to Photo: read from outside) */
  photoMode(...a: Parameters<Photo["photoMode"]>): ReturnType<Photo["photoMode"]> {
    return this.photos.photoMode(...a);
  }
  /** (moved to Photo: read from outside) */
  photoZoom(...a: Parameters<Photo["photoZoom"]>): ReturnType<Photo["photoZoom"]> {
    return this.photos.photoZoom(...a);
  }
  /** (moved to Photo: read from outside) */
  photoTurn(...a: Parameters<Photo["photoTurn"]>): ReturnType<Photo["photoTurn"]> {
    return this.photos.photoTurn(...a);
  }
  /** (moved to Photo: read from outside) */
  photoTilt(...a: Parameters<Photo["photoTilt"]>): ReturnType<Photo["photoTilt"]> {
    return this.photos.photoTilt(...a);
  }
  /** (moved to Photo: read from outside) */
  snapshot(...a: Parameters<Photo["snapshot"]>): ReturnType<Photo["snapshot"]> {
    return this.photos.snapshot(...a);
  }
  /** (moved to Photo: read from outside) */
  flashPerson(...a: Parameters<Photo["flashPerson"]>): ReturnType<Photo["flashPerson"]> {
    return this.photos.flashPerson(...a);
  }

  /** (moved to Tables: read from outside) */
  get chess() {
    return this.tableGames.chess;
  }
  set chess(v) {
    this.tableGames.chess = v;
  }
  /** (moved to Tables: read from outside) */
  get tables() {
    return this.tableGames.tables;
  }
  set tables(v) {
    this.tableGames.tables = v;
  }

  /** (moved to QualityWatch: read from outside) */
  qualityNow(...a: Parameters<QualityWatch["qualityNow"]>): ReturnType<QualityWatch["qualityNow"]> {
    return this.quality.qualityNow(...a);
  }
  /** (moved to QualityWatch: read from outside) */
  onFrame(...a: Parameters<QualityWatch["onFrame"]>): ReturnType<QualityWatch["onFrame"]> {
    return this.quality.onFrame(...a);
  }
}

function objFromState(o: WorldObject): WorldObjectDef {
  let props: Record<string, unknown> = {};
  try {
    props = JSON.parse(o.props || "{}");
  } catch {}
  // (a door or window in a wall drawn free keeps its wall's heading — plan 72 phase 11.6)
  const yaw = props.free === true ? o.yaw : quarterYaw(quarterOf(o));
  return { id: o.id, kind: o.kind, x: o.x, y: o.y, yaw, refId: o.refId || null, props };
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

/** How long after the land changes my feet are kept on it (till the physics' ground is made). */
const LAND_SHIFTED_MS = 6000;
