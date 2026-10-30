import { type AvatarLayers, parseAvatar } from "@yutopia/shared";
import {
  bankAt,
  bowlCrates,
  bumpKart,
  createKart,
  GO_MS,
  gridRevs,
  ITEM,
  ITEMS,
  type ItemKind,
  KART,
  KART_BOWL,
  KART_COLOURS,
  KART_DESK,
  KART_HZ,
  KART_LAYOUTS,
  KART_PARK,
  KART_RACK,
  KART_REACH,
  KART_STANDS,
  KART_STEP,
  KART_THINGS,
  KART_TOWER,
  type KartInput,
  type KartLayoutKey,
  type KartSeat,
  type KartSpec,
  type KartState,
  type KartWire,
  type KartWorld,
  kartBowlWorld,
  kartInWake,
  kartLayout,
  kartSeats,
  kartSpeed,
  kartStart,
  kartTrack,
  kartTrackWorld,
  LapCounter,
  NO_INPUT,
  KART_SITTING as PARK_SITTING,
  spinOut,
  stepKart,
  trackAt,
  vortexBrawler,
  vortexRacer,
} from "@yutopia/shared/kart";
import {
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
} from "three";
import { mixer } from "../audio";
import { activePad } from "../pads";
import { hud } from "../store";
import type { CrowdUniforms } from "../tp/kart/crowd3d";
import { KartFx } from "../tp/kart/fx";
import { crate3d, drone3d, fax3d, ice3d, plough3d, snowball3d, umbrella3d } from "../tp/kart/items3d";
import { buildKart, type Kart, type KartDriver, kartDriver } from "../tp/kart/kart3d";
import type { ThirdPersonView } from "../tp/view";
import { KartControls } from "./input";
import { KartSound, kartFx } from "./sound";
import { drawBoardFace, drawTrackMap } from "./track-map";

// The karts in the game (docs/plan/46-the-karts.md, phases 2–6): at the paddock's desk, X takes a
// kart (the server puts you on the circuit); you drive it here with the sandbox's sim, your view
// behind it, and report it 20×/s (world-server features/karts.ts counts the rest). Everyone's
// karts drawn, someone else's 110 ms behind, eased; what flies about and the crates, as the server
// has them. The lobby and the HUD are plain DOM in the game's look (docs/plan/45-the-ui.md), so
// the world page grows by nothing: this module is loaded by the car chunk (car/cars.ts), whose
// hooks into the controller it rides.

export const KART_PLAY_CHUNK = "yutopia-kart-play";

// biome-ignore lint/suspicious/noExplicitAny: decoded schema state
type S = any;
interface Host {
  room(): {
    sessionId: string;
    state: S;
    send(t: string, m: unknown): void;
    onMessage(t: string, f: (m: S) => void): () => void;
  } | null;
  ox(): number;
  oy(): number;
  level(): number;
  me(): { x: number; y: number };
  tp(): ThirdPersonView | null;
  night(): number;
  reduced(): boolean;
  toast(text: string): void;
  chars(): typeof import("../chars") | null;
}

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
const BEHIND = 0.11; // others' karts drawn this far in the past (s)
const fmt = (ms: number) => {
  const s = Math.max(0, ms) / 1000;
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, "0")}`;
};
const angleTo = (from: number, to: number) => {
  let d = to - from;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
};

interface View {
  key: string;
  kart: Kart;
  driver: KartDriver | null;
  look: string;
  colour: number;
  buf: { t: number; x: number; y: number; z: number; a: number; steer: number }[];
  pose: { x: number; y: number; z: number; a: number; steer: number };
  spin: number;
  roll: number;
  flame: Group;
  shield: Group;
  blade: Group;
  held: Group;
  sound: KartSound | null;
  /** when it appeared (Vortex's glitch in), whether it was smashed last frame */
  born: number;
  vortex: boolean;
  wasSmashed: boolean;
  /** the last skid mark's ends, behind its rear wheels */
  skid: [Vector3, Vector3] | null;
  /** the effects' memory: the tier last frame, airborne last frame, the next exhaust puff */
  lastTier: number;
  wasAir: boolean;
  smokeAt: number;
  /** a trick's time in the air so far (its roll), the landing's squash (1 → 0) */
  trickT: number;
  squash: number;
}

export class Karts {
  readonly root = new Group();
  private track = kartTrack();
  private trackWorld = kartTrackWorld();
  private bowlWorld = kartBowlWorld();
  private views = new Map<string, View>();
  private factory: InstanceType<typeof import("../chars")["CharFactory"]> | null = null;
  private ink: Material | null = null;
  // mine
  private mine: string | null = null;
  private sim: KartState | null = null;
  private spec: KartSpec = { ...KART };
  private prev = { x: 0, y: 0, z: 0, a: 0 };
  private acc = 0;
  private seq = 0;
  private sentAt = 0;
  private held = false;
  private smashed = false;
  private lc = new LapCounter(this.track);
  private ctl = new KartControls();
  private sound: KartSound | null = null;
  private camYaw = 0;
  private fov = 66;
  private shake = 0;
  private camNow: ThirdPersonView["gameCam"] = null;
  private time = 0;
  private offs: (() => void)[] = [];
  // the race as I see it: when the lights came on and went out here (my clock)
  private phase = "lobby";
  private lightsAt = 0;
  /** the start gantry's lamps (Grounds3's park: tp/karts3d.ts), found once it's in the scene */
  private gantry: MeshStandardMaterial[] | null = null;
  private gantryIn: Object3D | null = null;
  private goAt = 0;
  private lastItem = "";
  private rollUntil = 0;
  private callout = { text: "", until: 0 };
  private hud: HTMLDivElement | null = null;
  private lobby: HTMLDivElement | null = null;
  private lobbySig = "";
  private results: HTMLDivElement | null = null;
  // what flies, the crates
  private shots = new Map<string, Group>();
  private crates: Group[] = [];
  private mats: Record<string, Material> = {};
  /** the effects: sparks, flame, smoke, spray, blasts, confetti (tp/kart/fx.ts) */
  private fxs = new KartFx(this.root);

  constructor(private host: Host) {
    (window as unknown as { __karts?: Karts }).__karts = this;
    const room = host.room();
    if (room) {
      this.offs.push(
        room.onMessage("kart:snap", (m: S) => this.snap(m)),
        // my ping (the guns' own exchange): my items judged where I saw the others
        room.onMessage("arms:pong", (m: S) => {
          const rtt = performance.now() - Number(m.t);
          if (rtt > 0 && rtt < 2000) this.rtt = this.rtt ? this.rtt * 0.8 + rtt * 0.2 : rtt;
        }),
        room.onMessage("kart:hit", (m: S) => this.hit(m)),
        room.onMessage("kart:boost", (m: S) => {
          if (!this.sim) return;
          this.sim.boost = Math.max(this.sim.boost, m.secs);
          this.spec.boostTop = m.top ?? KART.boostTop;
          this.say(m.top ? "THE PLOUGH!" : "COFFEE!", 0.8);
        }),
        room.onMessage("kart:no", (m: S) =>
          host.toast(
            m.why === "racing"
              ? "A race is on: a kart's yours when it's done"
              : m.why === "full"
                ? "Every kart's out"
                : m.why === "show"
                  ? "The ploughs are out: the new circuit's nearly there"
                  : m.why === "busy"
                    ? "Your hands are full"
                    : "Closer to the desk",
          ),
        ),
      );
    }
  }

  /** The layout raced (the park's state: docs/plan/47-the-track-changer.md): my laps, my kart's
   *  world, the crates' places and the minimap's from it. */
  private followLayout(p: S) {
    const key = String(p.layout ?? "eight");
    const reverse = p.reverse === true;
    if (key === this.track.key && reverse === this.track.reverse) return;
    this.track = kartTrack(key as KartLayoutKey, reverse);
    this.trackWorld = kartTrackWorld(this.track);
    this.lc = new LapCounter(this.track);
    this.cratePos = null;
    this.mapFit = null;
  }
  private park(): S | null {
    return this.host.room()?.state.karts?.get("park") ?? null;
  }
  private world(): KartWorld {
    const p = this.park();
    return p && p.mode === "battle" && p.phase !== "lobby" ? this.bowlWorld : this.trackWorld;
  }
  inKart(): boolean {
    return this.mine !== null;
  }
  /** The people in karts (drawn here, not standing about). */
  seated(into: Set<string>) {
    const p = this.park();
    if (!p) return;
    for (const [, s] of p.karts) if (s.sid) into.add(s.sid);
  }

  // ── the server's word ──
  private snap(m: { x: number; y: number; z: number; a: number; still?: boolean }) {
    this.sim = createKart(m.x, m.y, m.z, m.a);
    this.prev = { x: m.x, y: m.y, z: m.z, a: m.a };
    this.acc = 0;
    this.held = !!m.still;
    this.smashed = false;
    this.camYaw = m.a;
    this.spec.boostTop = KART.boostTop;
  }
  private hit(m: { by: string; item: string; smash: boolean }) {
    if (!this.sim) return;
    this.fx(m.smash ? "smash" : "spin", this.sim.x, this.sim.z);
    if (m.smash) {
      this.smashed = true;
      this.say("SMASHED!", 1.6);
      this.fxs.blast(this.sim.x, this.sim.y, this.sim.z, 2);
      this.fxs.confetti(this.sim.x, this.sim.y, this.sim.z, KART_COLOURS[this.mySlot()?.colour ?? 0][0]);
    } else {
      spinOut(this.sim);
      this.say(m.by ? `${m.by.split(" ")[0].toUpperCase()} GOT YOU` : "SPUN OUT", 1.2);
    }
    this.shake = 1;
  }
  private say(text: string, secs = 1.4) {
    this.callout = { text, until: this.time + secs };
  }
  private mySlot(): S | null {
    return this.mine !== null ? (this.park()?.karts.get(this.mine) ?? null) : null;
  }

  // ── the controller's hooks (through car/cars.ts) ──
  key(e: KeyboardEvent, down: boolean): boolean {
    if (!this.mine) return false;
    if (!down) {
      this.ctl.keyUp(e.code);
      return false;
    }
    // out: Use (E: docs/plan/56-the-controls.md; X as it was)
    if ((e.code === "KeyE" || e.code === "KeyX") && !e.repeat) {
      const v = this.sim ? Math.abs(kartSpeed(this.sim)) : 0;
      if (v < 3 || this.phase === "lobby") this.host.room()?.send("kart:leave", {});
      return true;
    }
    void mixer.resume();
    if (!this.sound && mixer.ctx) this.sound = new KartSound(mixer.ctx, mixer.buses.effects);
    return this.ctl.keyDown(e.code) || e.code === "Escape";
  }
  blur() {
    this.ctl.clear();
  }
  camera(): ThirdPersonView["gameCam"] {
    return this.mine || this.following || this.watching ? this.camNow : null;
  }
  private watching = false;

  // ── the park's seats (shared kartSeats; world-server features/park-life.ts poses you) ──
  private seats = kartSeats();
  /** My player, if I'm sat on one of them. */
  private sitting(): S | null {
    const room = this.host.room();
    const p = room?.state.players.get(room.sessionId);
    return p?.busy === PARK_SITTING ? p : null;
  }
  /** The seat I'm on. */
  private mySeatAt(): KartSeat | null {
    const p = this.sitting();
    if (!p) return null;
    const x = p.x + this.host.ox();
    const z = p.y + this.host.oy();
    return this.seats.find((s) => Math.abs(s.x - x) < 0.1 && Math.abs(s.z - z) < 0.1) ?? null;
  }
  private taken(): Set<number> {
    return new Set(
      String(this.park()?.seats ?? "")
        .split(",")
        .filter(Boolean)
        .map(Number),
    );
  }
  // a bench by the fire, as the office's: walked onto and stood still on a moment, sat on; a way
  // pressed (or a click somewhere) sat there, walked off it
  private still = { x: Number.NaN, y: Number.NaN, since: 0 };
  private sitAsked = 0;
  private leaving = false;
  // biome-ignore lint/suspicious/noExplicitAny: the controller's private state
  private onBench(c: any) {
    const me = c.me;
    const now = performance.now();
    if (Math.abs(me.x - this.still.x) > 0.02 || Math.abs(me.y - this.still.y) > 0.02) {
      this.still = { x: me.x, y: me.y, since: now };
      return;
    }
    if (now - this.still.since < 350 || now - this.sitAsked < 1500) return;
    if (this.host.level() !== 0 || c.height?.up || c.path || c.walker?.controls?.moving?.()) return;
    const room = this.host.room();
    if (room?.state.players.get(room.sessionId)?.busy) return;
    const x = me.x + this.host.ox();
    const z = me.y + this.host.oy();
    const taken = this.taken();
    const i = this.seats.findIndex(
      (s, k) => s.stand === undefined && !taken.has(k) && Math.hypot(x - s.x, z - s.z) < 0.45,
    );
    if (i < 0) return;
    this.sitAsked = now;
    room?.send("park:sit", { i });
  }
  /** The free seat in reach (as the server judges it): a bench's by it; a stand's from its front
   *  or ends, abreast — the lowest row first. */
  private seatNear(): number {
    const me = this.host.me();
    const x = me.x + this.host.ox();
    const z = me.y + this.host.oy();
    const taken = this.taken();
    let best = -1;
    let bd = Number.POSITIVE_INFINITY;
    for (const [i, s] of this.seats.entries()) {
      if (s.crowd || taken.has(i)) continue;
      let d: number;
      if (s.stand === undefined) d = Math.hypot(x - s.x, z - s.z) < 2 ? Math.hypot(x - s.x, z - s.z) : Number.NaN;
      else {
        const st = KART_STANDS[s.stand];
        d =
          Math.abs(x - s.x) < 2.4 && z > st.z - 2.8 && z < st.z + st.rows * 1.2 + 1.3
            ? Math.abs(x - s.x) + (s.row ?? 0) * 0.4
            : Number.NaN;
      }
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }
  // ── watching from the stands: "Follow the race" lends you the leader's camera ──
  private following = false;
  private atStands(): boolean {
    const me = this.host.me();
    const x = me.x + this.host.ox();
    const z = me.y + this.host.oy();
    return KART_STANDS.some((st) => x > st.x0 - 4 && x < st.x1 + 4 && z > st.z - 8 && z < st.z + st.rows * 1.2 + 4);
  }
  private follow(p: S, dt: number) {
    if (this.following && (this.mine || p.phase === "lobby" || !this.atStands())) {
      this.following = false;
      this.camNow = null;
    }
    // (sat in the stands while a race is on: watching it, its leader's camera; stood up, back)
    const watching = !this.mine && p.phase !== "lobby" && this.mySeatAt()?.stand !== undefined;
    if (this.watching && !watching && !this.following) this.camNow = null;
    this.watching = watching;
    if (!this.following && !watching) return;
    let lead: View | undefined;
    for (const [key, s] of p.karts as Map<string, S>) if (s.place === 1) lead = this.views.get(key);
    lead ??= [...this.views.values()][0];
    if (!lead) return;
    const a = lead.pose.a;
    this.camYaw += angleTo(this.camYaw, a) * Math.min(1, dt * 3);
    const r = this.root.position;
    const x = lead.pose.x;
    const y = lead.pose.y;
    const z = lead.pose.z;
    this.camNow = {
      eye: [x - Math.cos(this.camYaw) * 7 + r.x, z - Math.sin(this.camYaw) * 7 + r.z, y + 3.2 + r.y],
      look: [x + Math.cos(this.camYaw) * 6 + r.x, z + Math.sin(this.camYaw) * 6 + r.z, y + 0.8 + r.y],
      fov: 64,
      showMe: false,
      snap: false,
    };
  }
  mySeat(): { x: number; y: number; a: number; ground: number } | null {
    const s = this.sim;
    if (!this.mine || !s) return null;
    return { x: s.x - this.host.ox(), y: s.z - this.host.oy(), a: s.a, ground: s.y };
  }
  // biome-ignore lint/suspicious/noExplicitAny: the controller's private state
  carry(c: any): boolean {
    // sat in the park: where the server put me, still
    const sat = this.sitting();
    if (!sat) this.leaving = false;
    if (sat && !this.mine) {
      const seat = this.mySeatAt();
      // (walking off a bench: on my feet from it, the server told)
      if (this.leaving) return false;
      if (seat && seat.stand === undefined && (c.path || c.walker?.controls?.moving?.())) {
        this.leaving = true;
        this.host.room()?.send("park:stand", { walk: true });
        return false;
      }
      c.path = null;
      c.actions.clear();
      c.me.x = sat.x;
      c.me.y = sat.y;
      c.me.a = 2;
      c.me.d = sat.d;
      c.height.z = sat.z;
      if (seat) c.meAngle = seat.a;
      return true;
    }
    const s = this.mySeat();
    if (!this.mine) {
      this.onBench(c);
      return false;
    }
    c.path = null;
    c.actions.clear();
    if (s) {
      c.me.x = s.x;
      c.me.y = s.y;
      c.me.a = 2;
      c.meAngle = s.a;
    }
    return true;
  }
  /** The X by the desk (take a kart), in one (give it back). */
  promptNow(): { objectId: string; kind: string; label: string } | null {
    if (this.host.level() !== 0) return null;
    if (this.mine) return null;
    // a seat: sat on one, get up; by a free one, sit
    const sat = this.mySeatAt();
    if (sat || this.sitting()) return { objectId: "park-seat", kind: "park:stand", label: "Get up" };
    const free = this.seatNear();
    if (free >= 0)
      return {
        objectId: `park-seat-${free}`,
        kind: "park:sit",
        label: this.seats[free].stand === undefined ? "Sit by the fire" : "Sit in the stands",
      };
    // the board of the circuits: choose the next race's track
    if (this.byBoard())
      return {
        objectId: "kart-circuits",
        kind: "kart:circuits",
        label: this.circuits ? "Close the circuits" : "Choose the track",
      };
    const pk = this.park();
    if (pk && pk.phase !== "lobby" && this.atStands())
      return {
        objectId: "kart-follow",
        kind: "kart:follow",
        label: this.following ? "Stop following" : "Follow the race",
      };
    const me = this.host.me();
    const x = me.x + this.host.ox();
    const z = me.y + this.host.oy();
    const near =
      Math.hypot(x - KART_DESK.x, z - KART_DESK.z) < KART_REACH ||
      (Math.abs(x - KART_RACK.x) < KART_REACH && z > KART_RACK.z0 - 3 && z < KART_RACK.z0 + KART_RACK.n * KART_RACK.dz);
    if (!near) return null;
    const p = this.park();
    const racing = p && p.phase !== "lobby";
    return {
      objectId: "kart-park",
      kind: "kart:take",
      label: racing ? "Kart Park · a race is on" : "Kart Park · take a kart",
    };
  }
  act(kind: string): boolean {
    if (kind === "kart:circuits") {
      if (this.circuits) this.closeCircuits();
      else this.openCircuits();
      return true;
    }
    if (kind === "park:sit" || kind === "park:stand") {
      const i = this.seatNear();
      if (kind === "park:stand") this.host.room()?.send("park:stand", {});
      else if (i >= 0) this.host.room()?.send("park:sit", { i });
      return true;
    }
    if (kind === "kart:follow") {
      this.following = !this.following;
      if (!this.following) this.camNow = null;
      return true;
    }
    if (kind !== "kart:take") return false;
    void mixer.resume();
    this.host.room()?.send("kart:take", {});
    return true;
  }
  /** Near the park (or in a kart): worth drawing at all. */
  near(): boolean {
    const me = this.host.me();
    return (
      this.mine !== null || Math.hypot(me.x + this.host.ox() - KART_PARK.x, me.y + this.host.oy() - KART_PARK.z) < 420
    );
  }

  // ── a frame ──
  frame(dt: number) {
    this.time += dt;
    const room = this.host.room();
    const tp = this.host.tp();
    const p = this.park();
    if (!room || !p) return;
    this.followLayout(p);
    const C = this.host.chars();
    if (C && !this.factory) {
      this.factory = new C.CharFactory();
      this.ink = C.inkMaterial();
    }
    this.factory?.pump(4);
    // which is mine
    const mine = room.state.players.get(room.sessionId);
    const busy: string = mine?.busy ?? "";
    const key = busy.startsWith("drive:kart:") ? busy.slice(11) : null;
    if (key !== this.mine) {
      this.mine = key;
      if (!key) {
        this.sim = null;
        // (the start's timing and a flooded engine: not carried into the next kart)
        this.throttleAt = -1;
        this.revs = 0;
        this.bog = 0;
        this.hideHud();
        this.sound?.dispose();
        this.sound = null;
      } else {
        this.showHud();
        this.lc = new LapCounter(this.track);
      }
    }
    // the race's clock, as it reaches me
    if (p.phase !== this.phase) {
      if (p.phase === "lights") {
        this.lightsAt = this.time;
        this.lc = new LapCounter(this.track);
      }
      if (p.phase === "race") {
        this.goAt = this.time;
        this.held = false;
        this.sound?.beep(true);
        this.cheer();
        this.go();
      }
      if (p.phase === "done") {
        this.doneAt = this.time;
        this.say("THE FLAG", 2);
        const me = this.mySlot();
        if (me) this.sound?.fanfare(me.place > 0 && me.place <= 3);
        this.cheer();
      }
      this.phase = p.phase;
    }
    if (tp) {
      if (this.root.parent !== tp.scene) tp.scene.add(this.root);
      if (!this.warmed) this.warm(tp);
      const f = tp.groundsFrame();
      this.root.position.set(-f.x, f.y, -f.z);
      this.root.visible = f.visible;
      this.lightGantry(tp, p.phase);
      this.paintBoards(tp, p);
      this.cheerStands(tp, p.phase, dt);
    }
    this.drive(dt, p);
    this.draw(dt, p);
    this.drawShots(p);
    this.drawCrates(p);
    this.drawHud(p);
    this.drawLobby(p);
    this.drawCircuits(p);
    this.drawResults(p);
    this.follow(p, dt);
    this.drawTower(p);
  }

  // the start, as Mario Kart's (shared kartStart): the throttle down on the fourth or fifth light, a
  // rocket start; after the fifth a smaller one; from before the fourth, flooded. Timed against the
  // lights as I see them go out (the race's own word comes a moment later)
  private throttleAt = -1;
  /** my engine's revs on the grid (shared gridRevs: minus, flooded) */
  private revs = 0;
  private go() {
    if (!this.sim) return;
    const out = this.lightsAt + GO_MS / 1000;
    const early = this.throttleAt >= 0 ? out - this.throttleAt : -1;
    const st = kartStart(early);
    this.throttleAt = -1;
    this.revs = 0;
    if (st === "rocket" || st === "good") {
      this.sim.boost = this.spec.turbo[st === "rocket" ? 1 : 0];
      this.sound?.whoosh(st === "rocket" ? 2 : 1);
      this.say(st === "rocket" ? "ROCKET START!" : "GOOD START", 1.2);
    } else if (st === "flooded") {
      this.bog = 0.9;
      this.say("FLOODED!", 1);
    } else this.say("GO!", 0.9);
  }
  private bog = 0;

  /** My kart: the sim at its steps, reported 20×/s; the camera behind it. */
  private drive(dt: number, p: S) {
    const k = this.sim;
    if (!this.mine || !k) return;
    const pad = activePad();
    const read = this.ctl.read(pad);
    // (past the flag in a race: Vortex takes the wheel for a lap of honour, easy on the throttle)
    const finished = p.mode !== "battle" && p.phase === "race" && (this.mySlot()?.done ?? 0) > 0;
    if (finished && !this.cooldown) {
      this.cooldown = vortexRacer(this.trackWorld, "medium", 3);
      this.say("VORTEX TAKES THE WHEEL", 1.6);
    } else if (!finished) this.cooldown = null;
    const cool = this.cooldown ? { ...this.cooldown(k), hop: false } : null;
    const raw = this.auto
      ? this.auto(k, this.world())
      : cool
        ? { ...cool, throttle: Math.min(0.7, cool.throttle) }
        : read.i;
    const buttons = finished ? [] : read.buttons;
    for (const b of buttons) if (b === "item") this.throwItem(raw.brake > 0.5);
    // (the autopilot uses what it's given as soon as it can)
    const slot = this.mySlot();
    if (this.auto && slot?.item && slot.rolling < Date.now() && this.time > this.autoUseAt) {
      this.autoUseAt = this.time + 1.5;
      this.throwItem(false);
    }
    let input = raw;
    if (this.phase === "lights") {
      // (the lights: one a second; the throttle's first press timed)
      const lit = Math.min(5, Math.floor(this.time - this.lightsAt) + 1);
      if (lit > this.lit) {
        this.lit = lit;
        this.sound?.beep(false);
      }
      if (raw.throttle > 0.5 && this.throttleAt < 0) this.throttleAt = this.time;
      if (raw.throttle < 0.2) this.throttleAt = -1;
      // (held, the engine revs where it stands)
      this.revs = gridRevs(this.throttleAt >= 0 ? this.time - this.throttleAt : -1, this.time);
      input = NO_INPUT;
    } else {
      this.lit = 0;
      this.revs = 0;
    }
    if (this.held || this.smashed) input = NO_INPUT;
    if (this.bog > 0) {
      this.bog -= dt;
      input = { ...input, throttle: 0 };
    }
    const w = this.world();
    // fished out by Vortex's drone: nothing to steer till it's put down
    if (this.fish) {
      this.fishing(dt, k);
      this.acc = 0;
      this.report(k, NO_INPUT);
      this.camera3(dt, k);
      return;
    }
    this.acc += dt;
    // (in someone's wake: where the others are drawn)
    const others: { x: number; z: number; a: number }[] = [];
    for (const [key, v] of this.views) if (key !== this.mine && v.kart.root.visible) others.push(v.pose);
    if (input !== NO_INPUT) input = { ...input, draft: kartInWake(k, others) };
    const tricking = k.trick;
    const hopping = k.hopping;
    let n = 0;
    while (this.acc >= KART_STEP && n < 14) {
      this.prev = { x: k.x, y: k.y, z: k.z, a: k.a };
      stepKart(k, input, w, this.spec);
      if (k.hopping && !hopping && n === 0) this.sound?.hop();
      if (k.trick && !tricking && n === 0) {
        this.say("TRICK!", 0.6);
        this.fx("trick", k.x, k.z);
      }
      if (k.drafted) {
        this.say("SLIPSTREAM", 0.7);
        this.sound?.drafted();
        this.ctl.rumble(pad, 0.3, 0.3, 160);
      }
      // (shoved by the karts round mine: each side does its own)
      for (const [key, v] of this.views)
        if (key !== this.mine && v.kart.root.visible) {
          const s = p.karts.get(key);
          if (s && bumpKart(k, v.pose.x, v.pose.z, s.vx, s.vz) && k.hit > 1) this.shake = Math.max(this.shake, 0.4);
        }
      this.acc -= KART_STEP;
      n++;
      if (k.fired) {
        this.sound?.whoosh(k.fired);
        const ex = this.views.get(this.mine ?? "")?.kart;
        if (ex) {
          ex.root.updateMatrixWorld(true);
          const p = ex.exhaust.p.clone();
          ex.body.localToWorld(p);
          this.root.worldToLocal(p);
          this.fxs.turbo(p.x, p.y, p.z, -Math.cos(k.a), -Math.sin(k.a), k.fired);
        }
        if (k.fired === 3) this.say("PURPLE TURBO", 0.7);
      }
      if (k.hit > 2) {
        this.sound?.thud(k.hit);
        // (where it touched: on the side of the nearer bank)
        const on = this.trackWorld.locate(k.x, k.z, k.y);
        if (on) {
          const sg = Math.sign(on.lat);
          const nx = Math.sin(on.p.a) * sg;
          const nz = -Math.cos(on.p.a) * sg;
          this.fxs.scrape(k.x + nx * 0.7, k.y, k.z + nz * 0.7, -nx, -nz, k.hit);
        }
        this.shake = Math.max(this.shake, Math.min(1, k.hit / 10));
        this.ctl.rumble(pad, Math.min(1, k.hit / 10), 0.2, 90);
      }
      // my lap's clock (the server counts the race's; this is mine to see at once)
      const on = this.trackWorld.locate(k.x, k.z, k.y);
      if (on && !(p.mode === "battle" && p.phase !== "lobby")) {
        const ev = this.lc.update(on.s, k.t);
        if (ev === "lap" && this.lc.last !== null) {
          const done = p.phase === "race" && this.lc.lap >= p.laps;
          this.say(
            done
              ? "FINISHED!"
              : this.lc.lap === p.laps - 1 && p.phase === "race"
                ? "FINAL LAP"
                : `LAP ${fmt(this.lc.last * 1000)}`,
            1.8,
          );
        }
      }
    }
    if (this.spec.boostTop !== KART.boostTop && k.boost <= 0) this.spec.boostTop = KART.boostTop;
    // off the circuit, or the wrong way round for a while: Vortex's drone fishes it out
    if (w === this.trackWorld && !this.held && !this.smashed) {
      const on = this.trackWorld.locate(k.x, k.z, k.y);
      let wrong = false;
      if (on && Math.hypot(k.vx, k.vz) > 3) {
        const d = Math.abs(angleTo(on.p.a, Math.atan2(k.vz, k.vx)));
        wrong = d > 2.2;
      }
      this.wrongFor = wrong ? this.wrongFor + dt : 0;
      if (!on || this.wrongFor > 3) this.fishOut(k, on ? on.s : null);
    }
    // (in a wake: the air streaming past)
    if (k.draft > 0.15 && !this.host.reduced() && Math.random() < dt * 40 * Math.min(1, k.draft / this.spec.draftFor))
      this.fxs.wind(k.x, k.y, k.z, Math.cos(k.a), Math.sin(k.a));
    this.report(k, input);
    if (k.drift && k.tier) this.ctl.rumble(pad, 0, 0.12 * k.tier, 40);
    this.camera3(dt, k);
  }
  private wrongFor = 0;
  private lastN = 0;
  private hadShield = false;
  /** An item's sound at (x, z), by how near me (the camera's, in a kart; else where I stand). */
  private fx(kind: string, x: number, z: number) {
    const ctx = mixer.ctx;
    if (!ctx) return;
    const at = this.listener();
    const d = Math.hypot(x - at.x, z - at.z);
    kartFx(ctx, mixer.buses.effects, kind, Math.max(0, 1 - d / 70), at.pan(x - at.x, z - at.z));
  }
  /** The stands roar (heard by how near the nearest stand is). */
  private cheer() {
    const at = this.listener();
    const st = [...KART_STANDS].sort(
      (a, b) => Math.hypot(a.x0 - at.x, a.z - at.z) - Math.hypot(b.x0 - at.x, b.z - at.z),
    )[0];
    if (st) this.fx("cheer", (st.x0 + st.x1) / 2, st.z);
  }
  private rtt = 0;
  private pingAt = 0;
  private throwItem(back: boolean) {
    this.host.room()?.send("kart:use", { back, lag: Math.round(this.rtt / 2) });
  }
  // ── Vortex's drone: down to the kart, its claw, up and over to the road, down facing the right way ──
  fish: {
    t: number;
    from: { x: number; y: number; z: number; a: number };
    to: { x: number; y: number; z: number; a: number };
    drone: Group;
  } | null = null;
  private fishOut(k: KartState, s: number | null) {
    const at = s ?? this.trackWorld.locate(this.prev.x, this.prev.z, this.prev.y)?.s ?? 0;
    const q = trackAt(this.track, at);
    const drone = this.makeShot("drone");
    drone.scale.setScalar(1.6);
    const cable = new Mesh(new BoxGeometry(0.03, 1, 0.03), this.mat("steel"));
    cable.name = "cable";
    drone.add(cable);
    this.fish = {
      t: 0,
      from: { x: k.x, y: k.y, z: k.z, a: k.a },
      to: { x: q.x, y: this.trackWorld.under(q.x, q.z, 50).y, z: q.z, a: q.a },
      drone,
    };
    this.say("VORTEX FISHES YOU OUT", 1.6);
    this.wrongFor = 0;
  }
  private fishing(dt: number, k: KartState) {
    const f = this.fish;
    if (!f) return;
    f.t += dt;
    const T = 1.8;
    const u = Math.min(1, f.t / T);
    // (down 0–0.3, up and over 0.3–0.8, down 0.8–1)
    const carry = Math.max(0, Math.min(1, (u - 0.3) / 0.5));
    const e = carry * carry * (3 - 2 * carry);
    const lift = u < 0.3 ? 0 : u < 0.8 ? Math.min(1, (u - 0.3) / 0.15) : Math.max(0, 1 - (u - 0.8) / 0.2);
    k.x = f.from.x + (f.to.x - f.from.x) * e;
    k.z = f.from.z + (f.to.z - f.from.z) * e;
    k.y = f.from.y + (f.to.y - f.from.y) * e + lift * 3;
    k.a = f.from.a + angleTo(f.from.a, f.to.a) * e;
    k.vx = 0;
    k.vz = 0;
    this.prev = { x: k.x, y: k.y, z: k.z, a: k.a };
    const droneY = u < 0.3 ? k.y + 8 - (u / 0.3) * 5.4 : k.y + 2.6;
    f.drone.position.set(k.x, droneY, k.z);
    const cable = f.drone.getObjectByName("cable");
    if (cable) {
      const len = Math.max(0.1, (droneY - k.y - 0.9) / 1.6);
      cable.scale.y = len;
      cable.position.y = -len / 2;
    }
    if (u >= 1) {
      f.drone.removeFromParent();
      this.fish = null;
      this.snap(f.to);
    }
  }
  private report(k: KartState, input: KartInput) {
    const now = performance.now();
    // (my ping, now and then)
    if (now - this.pingAt > 2000) {
      this.pingAt = now;
      this.host.room()?.send("arms:ping", { t: now });
    }
    if (now - this.sentAt > 1000 / KART_HZ) {
      this.sentAt = now;
      const wire: KartWire = {
        q: ++this.seq,
        x: k.x,
        y: k.y,
        z: k.z,
        a: k.a,
        vx: k.vx,
        vy: k.vy,
        vz: k.vz,
        st: k.steer,
        d: k.drift,
        tr: k.tier,
        b: k.boost,
        sp: k.spin,
        air: k.air,
        tk: k.trick && k.air,
        ...(this.phase === "lights" ? { rv: Math.round(this.revs * 100) / 100 } : {}),
      };
      this.host.room()?.send("kart:state", wire);
    }
    this.sound?.update({
      speed: kartSpeed(k),
      throttle: input.throttle,
      drift: k.drift !== 0,
      tier: k.tier,
      boost: k.boost > 0,
      air: k.air,
      ground: k.ground,
      spin: k.spin > 0,
      draft: Math.min(1, k.draft / this.spec.draftFor),
      rev: this.revs,
    });
  }
  private lit = 0;
  private autoUseAt = 0;
  /** The autopilot on (Vortex's driving, hard): round the circuit, or after the nearest in the bowl. */
  autopilot(on: boolean) {
    if (!on) {
      this.auto = null;
      return;
    }
    const race = vortexRacer(this.trackWorld, "hard", 7);
    const brawl = vortexBrawler("hard", 7);
    this.auto = (k, w) => {
      if (w === this.trackWorld) return race(k);
      let near: { x: number; z: number } | null = null;
      let bd = 1e9;
      for (const [key, v] of this.views) {
        if (key === this.mine) continue;
        const d = Math.hypot(v.pose.x - k.x, v.pose.z - k.z);
        if (d < bd) {
          bd = d;
          near = { x: v.pose.x, z: v.pose.z };
        }
      }
      return brawl(k, near);
    };
  }
  private cooldown: ((k: KartState) => KartInput) | null = null;
  /** A test's (or a dev's) driver at the wheel instead of the keys: window.__karts.auto */
  auto: ((k: KartState, w: KartWorld) => KartInput) | null = null;

  private camera3(dt: number, k: KartState) {
    const al = this.acc / KART_STEP;
    const x = this.prev.x + (k.x - this.prev.x) * al;
    const y = this.prev.y + (k.y - this.prev.y) * al;
    const z = this.prev.z + (k.z - this.prev.z) * al;
    const a = this.prev.a + angleTo(this.prev.a, k.a) * al;
    const speed = kartSpeed(k);
    const path = Math.hypot(k.vx, k.vz) > 3 ? Math.atan2(k.vz, k.vx) : a;
    let want = k.drift !== 0 ? a + angleTo(a, path) * 0.55 : a;
    if (this.ctl.lookBack) want += Math.PI;
    if (this.smashed) want = this.camYaw + dt * 0.6;
    this.camYaw += angleTo(this.camYaw, want) * Math.min(1, dt * (this.ctl.lookBack ? 20 : 5));
    const dist = 4.4 + Math.min(1.4, Math.abs(speed) * 0.04) + (this.smashed ? 4 : 0);
    this.shake = Math.max(0, this.shake - dt * 3);
    const sh = this.host.reduced() ? 0 : this.shake * 0.3;
    const ex = x - Math.cos(this.camYaw) * dist + (Math.random() - 0.5) * sh;
    const ey = y + 1.75 + (this.smashed ? 3 : 0) + (Math.random() - 0.5) * sh;
    const ez = z - Math.sin(this.camYaw) * dist;
    const lx = x + Math.cos(this.camYaw) * 4;
    const ly = y + 0.85;
    const lz = z + Math.sin(this.camYaw) * 4;
    this.fov += ((k.boost > 0 ? 80 : 66 + Math.abs(speed) * 0.15) - this.fov) * Math.min(1, dt * 4);
    // (in the scene: the Grounds' coords through the view's frame; the view's camera takes x, z-as-y, y-as-z)
    const r = this.root.position;
    this.camNow = {
      eye: [ex + r.x, ez + r.z, ey + r.y],
      look: [lx + r.x, lz + r.z, ly + r.y],
      fov: this.fov,
      showMe: false,
      snap: true,
    };
  }

  // ── everyone's karts drawn ──
  private draw(dt: number, p: S) {
    const room = this.host.room();
    const players = room?.state.players;
    const seen = new Set<string>();
    const now = this.time;
    let madeThisFrame = false;
    for (const [key, s] of p.karts as Map<string, S>) {
      seen.add(key);
      const look = s.vortex ? "vortex" : (players?.get(s.sid)?.avatar ?? "{}");
      let v = this.views.get(key);
      if (v && (v.look !== look || v.colour !== s.colour)) {
        this.drop(key);
        v = undefined;
      }
      if (!v) {
        // (one new kart a frame: the grid's seven Vortexes at once were a long one)
        if (madeThisFrame) continue;
        madeThisFrame = true;
        const made = this.make(key, s, look);
        if (!made) continue;
        v = made;
      }
      const mine = key === this.mine && this.sim;
      if (mine && this.sim) {
        const k = this.sim;
        const al = this.acc / KART_STEP;
        v.pose = {
          x: this.prev.x + (k.x - this.prev.x) * al,
          y: this.prev.y + (k.y - this.prev.y) * al,
          z: this.prev.z + (k.z - this.prev.z) * al,
          a: this.prev.a + angleTo(this.prev.a, k.a) * al,
          steer: k.steer,
        };
      } else {
        // someone else's: their reports in a buffer, drawn a little behind
        const last = v.buf[v.buf.length - 1];
        if (!last || last.x !== s.x || last.z !== s.z || last.a !== s.a)
          v.buf.push({ t: now, x: s.x, y: s.y, z: s.z, a: s.a, steer: s.steer });
        while (v.buf.length > 2 && v.buf[1].t < now - BEHIND) v.buf.shift();
        const [b0, b1] = v.buf;
        if (b0 && b1 && b1.t > b0.t) {
          const u = Math.max(0, Math.min(1.5, (now - BEHIND - b0.t) / (b1.t - b0.t)));
          v.pose = {
            x: b0.x + (b1.x - b0.x) * u,
            y: b0.y + (b1.y - b0.y) * u,
            z: b0.z + (b1.z - b0.z) * u,
            a: b0.a + angleTo(b0.a, b1.a) * u,
            steer: b1.steer,
          };
        } else if (b0) v.pose = { ...b0 };
      }
      const k = v.kart;
      const smashed = s.smashTo > 0 && (mine ? this.smashed : true) && s.smashTo > Date.now() - 50;
      k.root.visible = !(mine ? this.smashed : smashed);
      // someone else smashed: their confetti, their crunch
      if (!mine && smashed && !v.wasSmashed) {
        this.fxs.blast(v.pose.x, v.pose.y, v.pose.z, 2);
        this.fxs.confetti(v.pose.x, v.pose.y, v.pose.z, KART_COLOURS[s.colour][0]);
        this.fx("smash", v.pose.x, v.pose.z);
      }
      v.wasSmashed = smashed;
      // (blinking: nobody can hit it)
      if (s.blinkTo > Date.now() && !smashed) k.root.visible = Math.floor(this.time * 10) % 2 === 0;
      k.root.position.set(v.pose.x, v.pose.y + 0.02, v.pose.z);
      k.root.rotation.y = -v.pose.a;
      // spun out: round it goes
      const spinning = mine ? (this.sim?.spin ?? 0) > 0 : s.spinTo > Date.now();
      if (spinning && !mine) k.root.rotation.y -= this.time * 11;
      const speed = mine && this.sim ? kartSpeed(this.sim) : Math.hypot(s.vx, s.vz);
      const want = Math.max(-0.14, Math.min(0.14, -v.pose.steer * Math.abs(speed) * 0.004 * (s.drift ? 1.6 : 1)));
      v.roll += (want - v.roll) * Math.min(1, dt * 8);
      // a trick off the jump: a barrel roll over half a second, lifted clear; landing, a squash
      const air = mine ? !!this.sim?.air : !!s.air;
      const trick = (mine ? !!this.sim?.trick : !!s.trick) && air;
      v.trickT = trick ? v.trickT + dt : 0;
      const u = Math.min(1, v.trickT / 0.5);
      const ease = u * u * (3 - 2 * u);
      k.body.rotation.x = v.roll + (trick ? ease * Math.PI * 2 * (v.pose.steer >= 0 ? -1 : 1) : 0);
      k.body.position.y = trick ? Math.sin(u * Math.PI) * 0.45 : 0;
      if (v.wasAir && !air) v.squash = 1;
      v.squash = Math.max(0, v.squash - dt * 5);
      const sq = Math.sin(v.squash * Math.PI) * 0.1 * v.squash;
      k.body.scale.set(1 + sq * 0.6, 1 - sq, 1 + sq * 0.6);
      // revving on the grid: the body shudders on its springs, harder near the limiter
      const rev = Math.abs(mine ? this.revs : (s.rev ?? 0));
      const shudder = this.host.reduced() ? 0 : rev;
      k.body.position.y += Math.sin(this.time * 61 + v.colour) * 0.014 * shudder;
      k.body.rotation.z = Math.sin(this.time * 47 + v.colour * 2) * 0.012 * shudder;
      k.setSteer(-v.pose.steer * 0.45);
      v.spin -= (speed * dt) / 0.19;
      for (const w of k.wheels) w.spin.rotation.z = (v.spin * 0.19) / w.r;
      const boosting = mine ? (this.sim?.boost ?? 0) > 0 : !!s.boost || s.ploughTo > Date.now();
      v.flame.visible = boosting && k.root.visible;
      if (v.flame.visible) v.flame.scale.setScalar(0.7 + Math.random() * 0.6);
      v.shield.visible = s.shieldTo > Date.now();
      v.blade.visible = s.ploughTo > Date.now();
      // its snowballs held (rolled, not yet thrown), circling it
      const nHeld = s.item === "snowball" && s.rolling <= Date.now() ? s.itemN : 0;
      v.held.visible = nHeld > 0 && k.root.visible;
      v.held.children.forEach((b, i) => {
        b.visible = i < nHeld;
        const th = this.time * 3 + (i / Math.max(1, nHeld)) * Math.PI * 2;
        b.position.set(Math.cos(th) * 1.3, 0.45 + Math.sin(this.time * 5 + i) * 0.05, Math.sin(th) * 1.1);
      });
      k.wave(this.time, Math.abs(speed));
      if (v.driver?.ready()) v.driver.pose(-v.roll * 4, spinning);
      // their engine, heard by how near
      this.hear(v, mine ? null : speed, s);
      // sparks off my drift (and theirs)
      const drift = mine && this.sim ? this.sim.drift : s.drift;
      const tier = mine && this.sim ? this.sim.tier : s.tier;
      if (k.root.visible)
        this.effectsOf(
          v,
          {
            drift,
            tier,
            boosting,
            speed,
            mine: !!mine,
            air: mine ? !!this.sim?.air : !!s.air,
            rev: mine ? this.revs : (s.rev ?? 0),
          },
          dt,
        );
      this.skids(
        v,
        !!drift && k.root.visible && v.pose.y - this.trackWorld.under(v.pose.x, v.pose.z, v.pose.y + 1).y < 0.2,
      );
      // Vortex's karts glitch in: flickering, torn sideways, a VHS shimmer, for their first second
      const age = this.time - v.born;
      if (v.vortex && age < 1.1 && !this.host.reduced()) {
        const on = Math.sin(age * 90) > -0.2 || age > 0.9;
        k.root.visible = k.root.visible && on;
        k.root.scale.set(1 + Math.sin(age * 70) * 0.25 * (1 - age), 1, 1 - Math.sin(age * 53) * 0.15 * (1 - age));
        k.root.position.x += Math.sin(age * 120) * 0.25 * (1 - age);
      } else k.root.scale.set(1, 1, 1);
    }
    for (const key of [...this.views.keys()]) if (!seen.has(key)) this.drop(key);
    this.fxs.update(dt);
  }
  private hear(v: View, speed: number | null, s?: S) {
    if (speed === null || !mixer.ctx) {
      if (v.sound && speed === null) {
        v.sound.dispose();
        v.sound = null;
      }
      return;
    }
    const at = this.listener();
    const dx = v.pose.x - at.x;
    const dz = v.pose.z - at.z;
    const d = Math.hypot(dx, dz);
    const g = Math.max(0, 1 - d / 60);
    if (g <= 0) {
      v.sound?.dispose();
      v.sound = null;
      return;
    }
    v.sound ??= new KartSound(mixer.ctx, mixer.buses.effects, { lite: true, detune: ((v.colour * 7) % 9) / 4 - 1 });
    v.sound.setGain(g * g * 0.8, at.pan(dx, dz));
    // (coming at me higher, going away lower: its speed along the line to me, the sound's 343 m/s)
    const vr = s && d > 0.5 ? -(s.vx * dx + s.vz * dz) / d : 0;
    v.sound.update({
      speed,
      throttle: speed > 2 ? 0.8 : 0,
      rev: s?.rev ?? 0,
      drift: !!s?.drift,
      tier: s?.tier ?? 0,
      boost: !!s?.boost,
      air: !!s?.air,
      pitch: Math.max(0.85, Math.min(1.15, 343 / (343 - vr))),
    });
  }
  /** Where I hear from: my kart (or where I stand), and which way the camera's right is. */
  private listener(): { x: number; z: number; pan(dx: number, dz: number): number } {
    const me = this.sim ?? { x: this.host.me().x + this.host.ox(), z: this.host.me().y + this.host.oy() };
    const cam = this.host.tp()?.camera;
    let rx = 0;
    let rz = 0;
    if (cam) {
      const e = cam.matrixWorld.elements;
      const l = Math.hypot(e[0], e[2]) || 1;
      rx = e[0] / l;
      rz = e[2] / l;
    }
    return {
      x: me.x,
      z: me.z,
      pan: (dx, dz) => {
        const d = Math.hypot(dx, dz);
        return d < 1 ? 0 : ((dx * rx + dz * rz) / d) * 0.8;
      },
    };
  }
  private make(key: string, s: S, look: string): View | null {
    const C = this.host.chars();
    if (!C || !this.factory || !this.ink) return null;
    const [colour, trim] = KART_COLOURS[s.colour] ?? KART_COLOURS[0];
    const kart = buildKart({ colour, trim, number: Number(key) + 1 }, this.ink);
    this.root.add(kart.root);
    let avatar: AvatarLayers;
    try {
      avatar = look === "vortex" ? VORTEX_LOOK : parseAvatar(JSON.parse(look));
    } catch {
      avatar = parseAvatar({});
    }
    const body = C.bodyMaterial();
    const driver = kartDriver(C, this.factory, kart, avatar, colour, { body, ink: this.ink });
    // the exhaust's glow on a boost (its licks of flame are particles: effectsOf)
    const flame = new Group();
    const core = new Mesh(
      new SphereGeometry(0.11, 10, 8),
      new MeshBasicMaterial({
        color: "#ffe9a8",
        transparent: true,
        opacity: 0.9,
        toneMapped: false,
        depthWrite: false,
      }),
    );
    flame.add(core);
    flame.position.copy(kart.exhaust.p);
    flame.visible = false;
    kart.body.add(flame);
    // the umbrella up over the driver, a soft bubble round the kart
    const shield = new Group();
    const umb = umbrella3d();
    umb.position.set(-0.2, 1.55, 0);
    umb.rotation.z = 0.15;
    shield.add(umb);
    shield.add(
      new Mesh(
        new SphereGeometry(1.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2),
        new MeshBasicMaterial({
          color: "#fff6dc",
          transparent: true,
          opacity: 0.1,
          depthWrite: false,
          side: DoubleSide,
        }),
      ),
    );
    shield.visible = false;
    kart.root.add(shield);
    // the plough's blade on its nose
    const blade = plough3d();
    blade.position.set(1.15, 0, 0);
    blade.visible = false;
    kart.root.add(blade);
    // the snowballs it holds, circling it
    const held = new Group();
    for (let i = 0; i < 3; i++) held.add(snowball3d(0.2));
    held.visible = false;
    kart.root.add(held);
    const v: View = {
      key,
      kart,
      driver,
      look,
      colour: s.colour,
      buf: [],
      pose: { x: s.x, y: s.y, z: s.z, a: s.a, steer: 0 },
      spin: 0,
      roll: 0,
      flame,
      shield,
      blade,
      held,
      sound: null,
      born: this.time,
      vortex: look === "vortex",
      wasSmashed: false,
      skid: null,
      lastTier: 0,
      wasAir: false,
      smokeAt: 0,
      trickT: 0,
      squash: 0,
    };
    this.views.set(key, v);
    return v;
  }
  private drop(key: string) {
    const v = this.views.get(key);
    if (!v) return;
    this.views.delete(key);
    v.kart.root.removeFromParent();
    v.kart.dispose();
    v.driver?.dispose();
    v.sound?.dispose();
  }

  /** What a kart gives off this frame: the drift's sparks (and a pop as each tier comes in), the
   *  boost's flame, the two-stroke's smoke, snow thrown off the banks, dust on landing. */
  private effectsOf(
    v: View,
    o: { drift: number; tier: number; boosting: boolean; speed: number; mine: boolean; air: boolean; rev: number },
    dt: number,
  ) {
    const k = v.kart;
    k.root.updateMatrixWorld(true);
    const a = v.pose.a;
    const bx = -Math.cos(a);
    const bz = -Math.sin(a);
    const at = (lx: number, ly: number, lz: number) => {
      const p = new Vector3(lx, ly, lz);
      k.body.localToWorld(p);
      return this.root.worldToLocal(p);
    };
    const reduced = this.host.reduced();
    if (o.drift && o.tier && !o.air)
      for (const lz of [0.66, -0.66]) {
        const p = at(-0.75, 0.04, lz);
        this.fxs.sparks(p.x, p.y, p.z, bx, bz, o.tier, reduced ? 1 : 2);
      }
    if (o.drift && !o.air && Math.abs(o.speed) > 8 && Math.random() < dt * 30) {
      // (the drift's powder off the outside wheel)
      const p = at(-0.7, 0.02, o.drift > 0 ? -0.66 : 0.66);
      this.fxs.spray(p.x, p.y, p.z, bx, bz, 0.5, "#e9eef2");
    }
    if (o.tier > v.lastTier && o.drift) {
      const p = at(-0.2, 0, 0);
      this.fxs.tierPop(p.x, p.y, p.z, o.tier);
    }
    v.lastTier = o.drift ? o.tier : 0;
    const e = at(k.exhaust.p.x, k.exhaust.p.y, k.exhaust.p.z);
    if (o.boosting) this.fxs.flame(e.x, e.y, e.z, bx, bz, 1, reduced ? 1 : 3);
    // the two-stroke's smoke: a puff every so often, more when it's working (revving on the grid,
    // thick; flooded, thicker)
    v.smokeAt -= dt;
    if (v.smokeAt <= 0 && !reduced) {
      const working = Math.abs(o.speed) > 3 || o.rev > 0;
      v.smokeAt = o.rev < 0 ? 0.04 : working ? 0.08 : 0.25;
      this.fxs.smoke(e.x, e.y, e.z, bx, bz, o.rev < 0 ? 1.3 : working ? 0.8 : 0.5);
    }
    // landing: a ring of snow-dust
    if (v.wasAir && !o.air) {
      const p = at(0, 0, 0);
      this.fxs.land(p.x, p.y, p.z, 1);
    }
    v.wasAir = o.air;
  }

  // skid marks behind drifting karts: dark strips laid on the road, a pool of them, the oldest reused
  private skidMesh: Mesh | null = null;
  private skidAt = 0;
  private skids(v: View, on: boolean) {
    if (!on) {
      v.skid = null;
      return;
    }
    if (!this.skidMesh) {
      const N = 600;
      const g = new BufferGeometry();
      g.setAttribute("position", new Float32BufferAttribute(new Float32Array(N * 4 * 3), 3));
      const idx: number[] = [];
      for (let i = 0; i < N; i++) idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 2, i * 4 + 1, i * 4 + 3);
      g.setIndex(idx);
      this.skidMesh = new Mesh(
        g,
        new MeshBasicMaterial({
          color: "#101214",
          transparent: true,
          opacity: 0.4,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -8,
        }),
      );
      this.skidMesh.frustumCulled = false;
      this.root.add(this.skidMesh);
    }
    v.kart.root.updateMatrixWorld(true);
    const ends: [Vector3, Vector3] = [new Vector3(-0.62, 0.03, 0.64), new Vector3(-0.62, 0.03, -0.64)];
    for (const e of ends) {
      v.kart.root.localToWorld(e);
      this.root.worldToLocal(e);
    }
    if (v.skid && v.skid[0].distanceTo(ends[0]) > 0.35) {
      const pos = this.skidMesh.geometry.getAttribute("position") as Float32BufferAttribute;
      for (let w = 0; w < 2; w++) {
        const i = this.skidAt++ % 600;
        const a = v.skid[w];
        const b = ends[w];
        const dx = b.z - a.z;
        const dz = -(b.x - a.x);
        const l = Math.hypot(dx, dz) || 1;
        const hx = (dx / l) * 0.1;
        const hz = (dz / l) * 0.1;
        pos.setXYZ(i * 4, a.x - hx, a.y, a.z - hz);
        pos.setXYZ(i * 4 + 1, a.x + hx, a.y, a.z + hz);
        pos.setXYZ(i * 4 + 2, b.x - hx, b.y, b.z - hz);
        pos.setXYZ(i * 4 + 3, b.x + hx, b.y, b.z + hz);
      }
      pos.needsUpdate = true;
      v.skid = ends;
    } else if (!v.skid) v.skid = ends;
  }

  /** Everything that can show up mid-race, compiled before it does (each one's first frame was a
   *  long one: the items, the sparks, a smash's confetti). */
  private warmed = false;
  // ── the board of the circuits (docs/plan/47-the-track-changer.md) ──
  private boardThing = KART_THINGS.find((t) => t.kind === "circuits");
  /** Stood by the board, reading it (in front of it: to its south). */
  private byBoard(): boolean {
    const b = this.boardThing;
    if (!b || this.host.level() !== 0 || this.mine) return false;
    const me = this.host.me();
    const x = me.x + this.host.ox();
    const z = me.y + this.host.oy();
    return Math.abs(x - b.x) < b.hx + 1.2 && z > b.z && z < b.z + 3.2;
  }
  /** What's raced next, said short: for the board's strip and the desk's. */
  private nextRace(p: S, long: boolean): string {
    const name = kartLayout(this.track.key).name.replace(/^The /, "").toUpperCase();
    const how = p.mode === "battle" ? "BATTLE" : long ? `GRAND PRIX · ${p.laps} LAPS` : `GP ${p.laps} LAPS`;
    if (p.phase !== "lobby")
      return long ? `RACE ON · ${name}${this.track.reverse ? " REVERSED" : ""}` : `RACE ON: ${name}`;
    return long
      ? `NEXT RACE: ${name}${this.track.reverse ? " REVERSED" : ""} · ${how}`
      : `NEXT: ${name}${this.track.reverse ? " REV" : ""} ${how}`;
  }
  private boardsLook = 0;
  private boards: { face: Object3D | null; desk: Object3D | null } = { face: null, desk: null };
  /** The board's face and the desk's strip painted again when what they say changes. */
  private paintBoards(tp: ThirdPersonView, p: S) {
    const inScene = (o: Object3D | null) => {
      let top = o;
      while (top?.parent) top = top.parent;
      return top === tp.scene;
    };
    if (!inScene(this.boards.face) || !inScene(this.boards.desk)) {
      if (this.time < this.boardsLook) return;
      this.boardsLook = this.time + 1;
      this.boards.face = tp.scene.getObjectByName("kart-circuits") ?? null;
      this.boards.desk = tp.scene.getObjectByName("kart-desk-vfd") ?? null;
    }
    const face = this.boards.face?.userData as
      | { canvas: HTMLCanvasElement; tex: CanvasTexture; sig: string }
      | undefined;
    if (face?.canvas) {
      const name = `${kartLayout(this.track.key).name.toUpperCase()}`;
      const next = this.nextRace(p, true);
      const sig = `${this.track.key}${this.track.reverse}|${next}`;
      if (sig !== face.sig) {
        face.sig = sig;
        const g = face.canvas.getContext("2d") as CanvasRenderingContext2D;
        drawBoardFace(g, face.canvas.width, face.canvas.height, this.track, name, next);
        face.tex.needsUpdate = true;
      }
    }
    const desk = this.boards.desk?.userData as
      | { canvas: HTMLCanvasElement; tex: CanvasTexture; sig: string }
      | undefined;
    if (desk?.canvas) {
      const text = this.nextRace(p, false);
      if (text !== desk.sig) {
        desk.sig = text;
        const g = desk.canvas.getContext("2d") as CanvasRenderingContext2D;
        g.fillStyle = "#120d08";
        g.fillRect(0, 0, desk.canvas.width, desk.canvas.height);
        g.fillStyle = "#ffb347";
        g.shadowColor = "#ff9a2a";
        g.shadowBlur = 10;
        g.font = "700 34px 'Share Tech Mono', 'Courier New', monospace";
        g.textBaseline = "middle";
        g.fillText(text, 16, desk.canvas.height / 2, desk.canvas.width - 32);
        g.shadowBlur = 0;
        desk.tex.needsUpdate = true;
      }
    }
  }

  // the panel: a card each layout (its map, length, what it has, its record), Reverse, Set
  private circuits: HTMLDivElement | null = null;
  private circuitsSig = "";
  private pick: { key: KartLayoutKey; reverse: boolean } = { key: "eight", reverse: false };
  private onCircuitsKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") this.closeCircuits();
  };
  private openCircuits() {
    this.pick = { key: this.track.key, reverse: this.track.reverse };
    const tp = this.host.tp();
    const el = document.createElement("div");
    el.className = "cabinet";
    el.dataset.circuits = "1";
    el.style.cssText =
      "position:absolute;left:50%;top:84px;transform:translateX(-50%);width:min(820px,calc(100vw - 32px));max-height:calc(100vh - 200px);overflow:auto;padding:16px 18px 14px;z-index:40;pointer-events:auto;color:var(--cream);font-family:var(--font-body)";
    el.addEventListener("click", (e) => this.circuitsClick(e));
    (tp?.hostEl ?? document.body).appendChild(el);
    this.circuits = el;
    this.circuitsSig = "";
    window.addEventListener("keydown", this.onCircuitsKey);
    this.wantPointer();
  }
  private closeCircuits() {
    this.circuits?.remove();
    this.circuits = null;
    window.removeEventListener("keydown", this.onCircuitsKey);
    this.wantPointer();
  }
  // the lobby's and the circuits' buttons are clicked: the mouse leaves the camera for them while
  // they're up (docs/plan/56-the-controls.md A, the cursor rule — controller pointerWanted)
  private wantPointer() {
    const on = !!this.circuits || !!this.lobby;
    if (hud.get().kartUi !== on) hud.set({ kartUi: on });
  }
  /** Why it can't be set now (empty: it can). */
  private circuitsWhy(p: S): string {
    if (p.phase !== "lobby") return "A race is on: after it.";
    if (p.showing) return "The ploughs are out: a moment.";
    if ([...(p.karts as Map<string, S>).values()].some((k) => k.sid)) return "Someone's out on the track.";
    return "";
  }
  private drawCircuits(p: S) {
    const el = this.circuits;
    if (!el) return;
    if (!this.byBoard()) return this.closeCircuits();
    let rec: S = {};
    try {
      rec = p.record ? JSON.parse(p.record) : {};
    } catch {}
    const why = this.circuitsWhy(p);
    const sig = JSON.stringify([this.pick, this.track.key, this.track.reverse, why, p.record]);
    if (sig === this.circuitsSig) return;
    this.circuitsSig = sig;
    const fmt = (ms: number) => {
      const s = ms / 1000;
      return `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, "0")}`;
    };
    const esc = (v: string) =>
      v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
    const cards = KART_LAYOUTS.map((l) => {
      const t = kartTrack(l.key, this.pick.reverse);
      const id = `${l.key}${this.pick.reverse ? "-r" : ""}`;
      const best = id === "eight" ? rec.best : rec.bests?.[id];
      const racing = l.key === this.track.key && this.pick.reverse === this.track.reverse;
      const on = l.key === this.pick.key;
      const has = [
        `${t.len} m`,
        l.bridge === "both" ? "over the bridge" : "no bridge",
        `${t.jumps.length} jump${t.jumps.length > 1 ? "s" : ""}`,
      ].join(" · ");
      return `<button data-pick="${l.key}" aria-pressed="${on}" style="text-align:left;padding:10px;border-radius:4px;border:2px solid ${on ? "var(--amber, #e8a33d)" : "rgba(243,234,214,0.18)"};background:rgba(0,0,0,0.18);color:inherit;cursor:pointer;display:flex;flex-direction:column;gap:6px">
  <canvas data-map="${l.key}" width="360" height="190" style="width:100%;height:auto;border-radius:3px"></canvas>
  <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px"><span class="title" style="font-size:18px">${esc(l.name)}</span>${racing ? '<span class="mono" style="font-size:10px;color:#e8a33d">RACING NOW</span>' : ""}</div>
  <div style="font-size:12px;opacity:.85">${esc(l.blurb)}</div>
  <div class="mono" style="font-size:11px;color:var(--cream-dim)">${has}</div>
  <div class="mono" style="font-size:11px">RECORD ${best ? `${fmt(best.t)} · ${esc(best.name)}` : "—"}</div>
</button>`;
    }).join("");
    const same = this.pick.key === this.track.key && this.pick.reverse === this.track.reverse;
    el.innerHTML = `<div style="display:flex;align-items:baseline;justify-content:space-between"><div class="title" style="font-size:22px">The circuits</div><div class="mono" style="font-size:11px;color:var(--cream-dim)">THE NEXT RACE'S TRACK</div></div>
<div class="zigzag" style="margin:6px 0 12px"></div>
<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px">${cards}</div>
<div style="display:flex;align-items:center;gap:12px;margin-top:14px;flex-wrap:wrap">
  <span class="mono" style="font-size:11px;color:var(--cream-dim)">REVERSE</span><button class="sw" data-go="reverse" aria-pressed="${this.pick.reverse}"></button>
  <span style="flex:1;font-size:12px;opacity:.8" data-why>${esc(why)}</span>
  <button class="deck-btn" data-go="set" aria-pressed="${!(why || same)}" style="height:40px;padding:0 16px" ${why || same ? "disabled" : ""}>${same ? "Racing now" : "Set this track"}</button>
  <button class="deck-btn" data-go="close" style="height:40px;padding:0 14px">Close</button>
</div>`;
    for (const c of el.querySelectorAll("canvas[data-map]")) {
      const cv = c as HTMLCanvasElement;
      const g = cv.getContext("2d") as CanvasRenderingContext2D;
      drawTrackMap(g, kartTrack(cv.dataset.map as KartLayoutKey, this.pick.reverse), 0, 0, cv.width, cv.height);
    }
  }
  private circuitsClick(e: MouseEvent) {
    const el = (e.target as HTMLElement).closest("button") as HTMLButtonElement | null;
    if (!el) return;
    const room = this.host.room();
    if (el.dataset.pick) this.pick = { ...this.pick, key: el.dataset.pick as KartLayoutKey };
    if (el.dataset.go === "reverse") this.pick = { ...this.pick, reverse: !this.pick.reverse };
    if (el.dataset.go === "close") return this.closeCircuits();
    if (el.dataset.go === "set" && !el.disabled)
      room?.send("kart:layout", { layout: this.pick.key, reverse: this.pick.reverse });
    this.circuitsSig = "";
  }

  /** The gantry's lights: red one a second through the lights, all green for the go, then out. */
  private lightGantry(tp: ThirdPersonView, phase: string) {
    let top = this.gantryIn;
    while (top?.parent) top = top.parent;
    if (top !== tp.scene) {
      // (looked for now and then: the park's scenery comes and goes with distance)
      if (this.time < this.gantryLook) return;
      this.gantryLook = this.time + 1;
      this.gantryIn = tp.scene.getObjectByName("kart-gantry") ?? null;
      this.gantry = (this.gantryIn?.userData.lamps as MeshStandardMaterial[] | undefined) ?? null;
      if (!this.gantry) return;
    }
    const red = phase === "lights" ? Math.min(5, Math.floor(this.time - this.lightsAt) + 1) : 0;
    const green = phase === "race" && this.time - this.goAt < 2.5;
    this.gantry?.forEach((m, i) => {
      const on = green || i < red;
      const want = green ? "#3dff6a" : on ? "#ff2a1a" : "#000000";
      if (m.userData.was === want) return;
      m.userData.was = want;
      m.emissive.set(want);
      m.emissiveIntensity = on ? 4 : 0;
      m.color.set(on ? want : "#3a1512");
    });
  }
  private gantryLook = 0;

  /** The stands' crowd (tp/kart/crowd3d.ts): the race's own excitement — the lights, the go, the
   *  flag — and the karts going by in front of them, the heads turned to the nearest. */
  private cheerStands(tp: ThirdPersonView, phase: string, dt: number) {
    let top = this.crowdIn;
    while (top?.parent) top = top.parent;
    if (top !== tp.scene) {
      if (this.time < this.crowdLook) return;
      this.crowdLook = this.time + 1;
      this.crowdIn = tp.scene.getObjectByName("kart-crowd") ?? null;
      if (!this.crowdIn) return;
    }
    const u = this.crowdIn?.userData.crowd as CrowdUniforms | undefined;
    if (!u) return;
    const since = (t: number) => this.time - t;
    const want =
      phase === "lights"
        ? 0.3 + 0.1 * Math.min(5, since(this.lightsAt))
        : phase === "race"
          ? since(this.goAt) < 3
            ? 1
            : 0.12
          : phase === "done"
            ? since(this.doneAt) < 7
              ? 1
              : 0.3
            : 0;
    const ease = 1 - Math.exp(-dt * (want > u.uCheer.value ? 6 : 1.5));
    u.uCheer.value += (want - u.uCheer.value) * ease;
    // the karts in front of the stands (on the start straight), the nearest four
    const near: { x: number; w: number }[] = [];
    if (phase === "race" || phase === "done")
      for (const v of this.views.values()) {
        const st = KART_STANDS.find((s) => v.pose.x > s.x0 - 12 && v.pose.x < s.x1 + 12);
        if (!st) continue;
        const w = Math.max(0, Math.min(1, 1 - (Math.abs(v.pose.z - (st.z - 9)) - 5) / 12));
        if (w > 0) near.push({ x: v.pose.x, w });
      }
    near.sort((a, b) => b.w - a.w);
    const kx = [0, 1, 2, 3].map((i) => near[i]?.x ?? -1e4);
    const kw = [0, 1, 2, 3].map((i) => near[i]?.w ?? 0);
    u.uKx.value.set(kx[0], kx[1], kx[2], kx[3]);
    u.uKw.value.set(kw[0], kw[1], kw[2], kw[3]);
    const lw = near[0]?.w ?? 0;
    const k = 1 - Math.exp(-dt * 5);
    if (near[0]) u.uLook.value.x += (near[0].x - u.uLook.value.x) * (u.uLook.value.y > 0.05 ? k : 1);
    u.uLook.value.y += (lw - u.uLook.value.y) * k;
  }
  private crowdIn: Object3D | null = null;
  private crowdLook = 0;
  private doneAt = 0;

  private warm(tp: ThirdPersonView) {
    this.warmed = true;
    // (built apart and compiled against the scene's lights, as the view does a new thing's:
    // tp/view.ts; never drawn)
    const g = new Group();
    for (const k of ["snowball", "staple", "ice", "fax", "blast", "drone"]) g.add(this.makeShot(k));
    g.add(crate3d(), umbrella3d(), plough3d());
    // (the particles' three looks: their own shaders)
    const fx = new KartFx(g);
    for (const p of [fx.glow, fx.puff, fx.chip]) p.emit({ x: 0, y: 0, z: 0, life: 1, size: 0.1, col: "#fff" });
    fx.update(0);
    void tp.renderer.compileAsync(g, tp.camera, tp.scene).catch(() => {});
  }

  // ── what flies (the server's), the crates ──
  private mat(k: string): Material {
    this.mats[k] ??=
      k === "snow"
        ? new MeshStandardMaterial({ color: "#f8fbfd", flatShading: true, roughness: 0.9 })
        : k === "steel"
          ? new MeshStandardMaterial({ color: "#d6dde3", metalness: 0.8, roughness: 0.25 })
          : k === "ice"
            ? new MeshStandardMaterial({
                color: "#3a5566",
                roughness: 0.04,
                metalness: 0.5,
                transparent: true,
                opacity: 0.85,
                polygonOffset: true,
                polygonOffsetFactor: -8,
              })
            : k === "fax"
              ? new MeshStandardMaterial({ color: "#d9cfb8", flatShading: true, roughness: 0.7 })
              : k === "blast"
                ? new MeshBasicMaterial({
                    color: "#fff1c0",
                    transparent: true,
                    opacity: 0.5,
                    toneMapped: false,
                    depthWrite: false,
                  })
                : k === "drone"
                  ? new MeshStandardMaterial({ color: "#2a2d31", roughness: 0.4, metalness: 0.3 })
                  : k === "eye"
                    ? new MeshBasicMaterial({ color: "#ffb347", toneMapped: false })
                    : new MeshStandardMaterial({
                        color: "#e8a33d",
                        emissive: "#ffb347",
                        emissiveIntensity: 0.4,
                        roughness: 0.45,
                      });
    return this.mats[k];
  }
  private makeShot(kind: string): Group {
    const g = new Group();
    if (kind === "snowball") g.add(snowball3d(0.26));
    else if (kind === "staple") g.add(new Mesh(new TorusGeometry(0.1, 0.02, 3, 8, Math.PI), this.mat("steel")));
    else if (kind === "ice") {
      const m = ice3d(ITEM.ice.r);
      m.position.y = 0.05;
      g.add(m);
    } else if (kind === "fax") {
      g.add(fax3d());
      g.scale.setScalar(1.5);
    } else if (kind === "blast") {
      // (a shockwave ring on the ground, growing: the fire and smoke are particles)
      const ring = new Mesh(new TorusGeometry(1, 0.08, 4, 40).rotateX(Math.PI / 2), this.mat("blast"));
      ring.name = "wave";
      g.add(ring);
    } else if (kind === "drone") g.add(drone3d());
    this.root.add(g);
    return g;
  }
  private drawShots(p: S) {
    const seen = new Set<string>();
    for (const [id, t] of p.shots as Map<string, S>) {
      if (t.kind === "stapler") continue;
      seen.add(id);
      let g = this.shots.get(id);
      if (!g) {
        g = this.makeShot(t.kind);
        this.shots.set(id, g);
        // (its sound as it's thrown, from where it is)
        this.fx(t.kind === "snowball" ? "throw" : t.kind === "staple" ? "staple" : t.kind, t.x, t.z);
        if (t.kind === "fax") this.fx("throw", t.x, t.z);
        if (t.kind === "blast") this.fxs.blast(t.x, t.y, t.z, ITEM.fax.blast * 0.6);
      }
      if (t.kind === "snowball") this.fxs.trail(t.x, t.y, t.z);
      g.userData.kind = t.kind;
      g.userData.at = [t.x, t.z];
      g.position.set(t.x, t.y, t.z);
      g.rotation.y = -t.a;
      if (t.kind === "drone") g.rotation.y = -Math.atan2(t.vz, t.vx);
      if (t.kind === "snowball") g.rotation.x += 0.3;
      if (t.kind === "drone" || t.kind === "fax")
        g.traverse((o) => {
          if (o.name === "rotor") o.rotation.y += 1.3;
          if (o.name === "led") o.visible = Math.floor(this.time * (t.kind === "fax" ? 6 : 3)) % 2 === 0;
        });
      if (t.kind === "blast") {
        const u = Math.min(1, (Date.now() - t.at) / 700);
        const w = g.getObjectByName("wave");
        if (w) {
          w.scale.setScalar(0.5 + u * ITEM.fax.blast * 1.4);
          ((w as Mesh).material as MeshBasicMaterial).opacity = 0.6 * (1 - u);
        }
      }
    }
    for (const [id, g] of [...this.shots])
      if (!seen.has(id)) {
        g.removeFromParent();
        this.shots.delete(id);
        // (a snowball's end: its splat where it went)
        if (g.userData.kind === "snowball") {
          this.fx("snowball", g.userData.at[0], g.userData.at[1]);
          this.fxs.splat(g.userData.at[0], g.position.y, g.userData.at[1]);
        }
        if (g.userData.kind === "staple") this.fxs.scrape(g.position.x, g.position.y - 0.2, g.position.z, 0, 0, 1);
      }
  }
  private cratePos: { x: number; z: number; y: number; battle: boolean }[] | null = null;
  private drawCrates(p: S) {
    if (!this.cratePos) {
      const t = this.track;
      this.cratePos = [];
      for (const s of t.boxes) {
        const q = trackAt(t, s);
        for (let i = 0; i < 4; i++) {
          const o = -6 + 1.5 + i * 3;
          const x = q.x + Math.sin(q.a) * o;
          const z = q.z - Math.cos(q.a) * o;
          this.cratePos.push({ x, z, y: this.trackWorld.under(x, z, 50).y + 0.85 + (i % 2) * 0.1, battle: false });
        }
      }
      for (const c of bowlCrates()) this.cratePos.push({ ...c, y: KART_PARK.h + bankAt(0) + 0.85, battle: true });
      for (const c of this.cratePos) {
        const m = crate3d();
        m.position.set(c.x, c.y, c.z);
        m.visible = false;
        this.root.add(m);
        this.crates.push(m);
      }
    }
    const on: string = p.crates ?? "";
    const battle = p.mode === "battle";
    this.cratePos.forEach((c, i) => {
      const m = this.crates[i];
      // (between races the circuit's stand there; in a race, as the server has them)
      const was = m.visible;
      m.visible = p.phase === "lobby" ? !c.battle : c.battle === battle && on[i] !== "0";
      if (was && !m.visible && p.phase === "race") this.fxs.shatter(c.x, c.y, c.z);
      // (bobbing; a soft glow inside)
      m.position.y = c.y + Math.sin(this.time * 2.2 + i) * 0.08;
      m.rotation.set(0.35, this.time * 0.9 + i, 0.4);
      const sp = m.getObjectByName("spin");
      if (sp) sp.rotation.set(-0.35, this.time * 2.4, -0.4);
    });
  }

  // ── the HUD (docs/plan/45-the-ui.md: ink in walnut frames) ──
  private showHud() {
    const tp = this.host.tp();
    if (this.hud || !tp) return;
    const d = document.createElement("div");
    d.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:20";
    d.innerHTML = `<style>
.kh{position:absolute;color:var(--cream);font-family:var(--font-body)}
.kh .lbl{font-family:var(--font-mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--cream-dim)}
.kh .lcd{font-family:var(--font-lcd);color:var(--vfd);text-shadow:0 0 8px rgba(241,215,154,.35)}
.kh .big{font-family:var(--font-title);font-weight:600;letter-spacing:.12em;color:var(--amber);text-transform:uppercase;text-shadow:0 3px 0 #2a1b11,0 0 30px rgba(241,215,154,.45)}
.kh .lamp{width:28px;height:28px;border-radius:50%;background:#2a1612;border:2px solid #120a08;box-shadow:inset 0 2px 4px #000}
.kh .lamp.on{background:radial-gradient(#ffb08f,#c8553f 60%,#7a2a1e);box-shadow:0 0 18px #c8553f}
.kh i.m{display:block;width:44px;height:10px;border-radius:2px;background:var(--meter-off)}
.kh .row{display:flex;align-items:center;gap:8px;height:24px;padding:0 8px;border-radius:4px;font-size:13px}
.kh .row.me{background:color-mix(in srgb,var(--amber) 12%,transparent);color:var(--amber)}
.kh.lines{inset:0;opacity:0;background:repeating-conic-gradient(from 0deg at 50% 58%,transparent 0deg 2.6deg,rgba(255,250,235,.5) 2.6deg 3deg,transparent 3deg 5.2deg,rgba(255,250,235,.22) 5.2deg 5.5deg);-webkit-mask:radial-gradient(ellipse 70% 60% at 50% 58%,transparent 45%,#000 95%);mask:radial-gradient(ellipse 70% 60% at 50% 58%,transparent 45%,#000 95%)}
.kh.wrong{left:50%;top:38%;transform:translate(-50%,-50%);display:none;flex-direction:column;align-items:center;gap:4px;animation:khblink .5s steps(2) infinite}
@keyframes khblink{50%{opacity:.35}}
</style>
<div class="kh lines" data-k="lines"></div>
<div class="kh wrong cabinet" data-k="wrong" style="padding:10px 22px"><div class="big" style="font-size:44px;color:var(--danger-text)">↺ WRONG WAY</div><div class="lbl">turn round</div></div>
<div class="kh" data-k="place" style="left:24px;top:104px;display:flex;align-items:flex-end;gap:12px">
  <div class="big" data-k="pos" style="font-size:96px;line-height:.8;color:var(--cream)"></div><div class="lbl" data-k="of" style="padding-bottom:8px"></div>
</div>
<div class="kh cabinet" data-k="clock" style="left:24px;top:200px;padding:8px 14px;display:grid;grid-template-columns:auto auto;gap:2px 14px;align-items:baseline">
  <span class="lbl" data-k="lapL">Lap</span><span class="lcd" data-k="lap" style="font-size:24px">–</span>
  <span class="lbl">Time</span><span class="lcd" data-k="time" style="font-size:20px">–</span>
  <span class="lbl">Best</span><span class="lcd" data-k="best" style="font-size:16px;color:var(--cream-dim)">–</span>
</div>
<div class="kh cabinet" data-k="lights" style="left:50%;top:84px;transform:translateX(-50%);padding:10px 16px;display:none;gap:12px">${'<div class="lamp"></div>'.repeat(5)}</div>
<div class="kh big" data-k="call" style="left:50%;top:150px;transform:translateX(-50%);font-size:40px;white-space:nowrap"></div>
<div class="kh cabinet" data-k="item" style="right:24px;top:110px;padding:10px;display:flex;flex-direction:column;align-items:center;gap:6px;min-width:110px">
  <div data-k="itemName" class="lcd" style="font-size:18px;min-height:24px"></div><div class="lbl" style="font-size:10px">SHIFT use · ↓ behind</div>
</div>
<div class="kh cabinet" data-k="score" style="right:24px;top:200px;padding:8px 6px;width:220px;display:none"></div>
<div class="kh" style="left:50%;bottom:110px;transform:translateX(-50%);display:flex;align-items:flex-end;gap:20px">
  <div style="display:flex;flex-direction:column;align-items:center;gap:6px"><div style="display:flex;gap:4px" data-k="meter"><i class="m"></i><i class="m"></i><i class="m"></i></div><div class="lbl" style="font-size:10px" data-k="drift">Drift</div></div>
  <div class="cabinet" style="padding:6px 14px;text-align:center"><div class="lcd" data-k="speed" style="font-size:32px;line-height:1">0</div><div class="lbl" style="font-size:9px">km/h</div></div>
</div>
<div class="kh cabinet" data-k="mapBox" style="left:24px;bottom:160px;padding:5px;display:none"><canvas data-k="map" width="230" height="124" style="display:block;width:230px;height:124px"></canvas></div>
<div class="kh lbl" style="left:24px;bottom:110px;line-height:1.7;font-size:10px">W S go · brake &nbsp; A D steer &nbsp; SPACE hop &amp; drift<br/>SHIFT item &nbsp; C look back &nbsp; X out (stopped)</div>`;
    (tp.hostEl ?? document.body).appendChild(d);
    this.hud = d;
    // a phone: the kart's buttons on the screen
    if (window.matchMedia?.("(pointer: coarse)").matches) d.appendChild(this.touchPad());
  }
  private touchPad(): HTMLDivElement {
    const t = this.ctl.touch;
    t.on = true;
    const pad = document.createElement("div");
    pad.style.cssText = "position:absolute;inset:auto 0 18px 0;height:150px;pointer-events:none;z-index:22";
    const btn = (label: string, css: string, down: () => void, up: () => void) => {
      const b = document.createElement("button");
      b.className = "deck-btn";
      b.textContent = label;
      b.style.cssText = `position:absolute;pointer-events:auto;touch-action:none;width:74px;height:74px;border-radius:50%;font-size:13px;${css}`;
      b.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        b.setAttribute("aria-pressed", "true");
        void mixer.resume();
        if (!this.sound && mixer.ctx) this.sound = new KartSound(mixer.ctx, mixer.buses.effects);
        down();
      });
      const off = () => {
        b.setAttribute("aria-pressed", "false");
        up();
      };
      b.addEventListener("pointerup", off);
      b.addEventListener("pointercancel", off);
      b.addEventListener("pointerleave", off);
      pad.appendChild(b);
    };
    btn(
      "◀",
      "left:18px;bottom:20px",
      () => {
        t.steer = -1;
      },
      () => {
        t.steer = t.steer < 0 ? 0 : t.steer;
      },
    );
    btn(
      "▶",
      "left:104px;bottom:20px",
      () => {
        t.steer = 1;
      },
      () => {
        t.steer = t.steer > 0 ? 0 : t.steer;
      },
    );
    btn(
      "GO",
      "right:18px;bottom:20px;width:84px;height:84px",
      () => {
        t.throttle = 1;
      },
      () => {
        t.throttle = 0;
      },
    );
    btn(
      "BRAKE",
      "right:112px;bottom:8px;width:64px;height:64px",
      () => {
        t.brake = 1;
      },
      () => {
        t.brake = 0;
      },
    );
    btn(
      "HOP",
      "right:30px;bottom:116px;width:62px;height:62px",
      () => {
        t.hop = true;
      },
      () => {
        t.hop = false;
      },
    );
    btn(
      "ITEM",
      "right:104px;bottom:88px;width:62px;height:62px",
      () => this.ctl.press("item"),
      () => {},
    );
    btn(
      "OUT",
      "left:60px;bottom:104px;width:52px;height:52px;font-size:11px",
      () => {
        const v = this.sim ? Math.abs(kartSpeed(this.sim)) : 0;
        if (v < 3 || this.phase === "lobby") this.host.room()?.send("kart:leave", {});
      },
      () => {},
    );
    return pad;
  }
  private hideHud() {
    this.ctl.touch.on = false;
    this.ctl.clear();
    this.hud?.remove();
    this.hud = null;
    this.lobby?.remove();
    this.lobby = null;
    this.lobbySig = "";
    this.wantPointer();
    this.results?.remove();
    this.results = null;
    this.camNow = null;
  }
  private q(k: string): HTMLElement {
    return this.hud?.querySelector(`[data-k="${k}"]`) as HTMLElement;
  }
  private drawHud(p: S) {
    if (!this.hud || !this.sim) return;
    const s = this.mySlot();
    const k = this.sim;
    const racing = p.phase === "race" || p.phase === "lights";
    const battle = p.mode === "battle" && p.phase !== "lobby";
    const n = p.karts.size;
    this.q("place").style.display = racing && !battle ? "flex" : "none";
    if (s) {
      const pl = s.place || 1;
      const suf = pl === 1 ? "st" : pl === 2 ? "nd" : pl === 3 ? "rd" : "th";
      this.q("pos").innerHTML = `${pl}<span style="font-size:38px;vertical-align:top">${suf}</span>`;
      this.q("of").textContent = `of ${n}`;
    }
    // the clock: the race's (from GO) or free laps'
    const since = this.goAt ? (this.time - this.goAt) * 1000 : 0;
    this.q("clock").style.display = battle ? "none" : "grid";
    this.q("lapL").textContent = racing ? "Lap" : "Free lap";
    this.q("lap").innerHTML = racing
      ? `${Math.min(p.laps, this.lc.lap + 1)}<span style="color:var(--cream-dim);font-size:16px">/${p.laps}</span>`
      : String(this.lc.lap + 1);
    this.q("time").textContent =
      p.phase === "race" ? fmt(since) : this.lc.started !== null ? fmt((k.t - this.lc.started) * 1000) : "–";
    const best = s?.best || (this.lc.best ? this.lc.best * 1000 : 0);
    this.q("best").textContent = best ? fmt(best) : "–";
    // speed lines on a boost (fainter in a wake), jittered a little each frame; the wrong way
    const lines = this.q("lines");
    const rush = k.boost > 0 ? Math.min(1, k.boost * 2.5) : k.draft > 0.2 ? 0.3 * (k.draft / this.spec.draftFor) : 0;
    lines.style.opacity = this.host.reduced() ? "0" : (rush * 0.85).toFixed(2);
    if (rush > 0) lines.style.transform = `rotate(${(Math.random() - 0.5) * 3}deg) scale(${1 + rush * 0.04})`;
    this.q("wrong").style.display = this.wrongFor > 0.8 && racing ? "flex" : "none";
    // the lights
    const lights = this.q("lights");
    lights.style.display = p.phase === "lights" ? "flex" : "none";
    [...lights.children].forEach((c, i) => {
      c.classList.toggle("on", i < this.lit);
    });
    // a battle's clock and score
    const score = this.q("score");
    score.style.display = battle ? "block" : "none";
    if (battle) {
      const left = p.phase === "race" ? Math.max(0, 180 - (this.time - this.goAt)) : 180;
      const rows = [...(p.karts as Map<string, S>).entries()].sort((a, b) => b[1].score - a[1].score);
      score.innerHTML = `<div class="lcd" style="font-size:30px;text-align:center">${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, "0")}</div>
${rows
  .slice(0, 5)
  .map(
    ([key, r]) =>
      `<div class="row${key === this.mine ? " me" : ""}"><span style="width:12px;height:12px;border-radius:50%;background:${KART_COLOURS[r.colour][0]}"></span><span style="flex:1">${esc(r.name)}</span><span class="lcd">${r.score}</span></div>`,
  )
  .join("")}`;
    }
    // the item: its roulette for a second, then what it is (× how many)
    const item: string = s?.item ?? "";
    if (item && item !== this.lastItem && !this.lastItem) {
      this.rollUntil = this.time + ITEM.roll / 1000;
      this.fx("crate", k.x, k.z);
    }
    // (what I used that doesn't fly: its own sound)
    if (
      this.lastItem &&
      (!item || (s?.itemN ?? 0) < this.lastN) &&
      ["coffee", "umbrella", "plough"].includes(this.lastItem)
    )
      this.fx(this.lastItem, k.x, k.z);
    // (my umbrella gone before its time: it took a hit)
    const shield = (s?.shieldTo ?? 0) > Date.now();
    if (this.hadShield && !shield && (s?.shieldTo ?? 0) === 0) this.fx("pop", k.x, k.z);
    this.hadShield = shield;
    this.lastN = s?.itemN ?? 0;
    this.lastItem = item;
    const names = Object.values(ITEMS).map((x) => x.name);
    this.q("item").style.display = racing && p.phase === "race" ? "flex" : "none";
    this.q("itemName").textContent = !item
      ? "—"
      : this.time < this.rollUntil
        ? names[Math.floor(this.time * 14) % names.length]
        : `${ITEMS[item as ItemKind]?.name ?? item}${s.itemN > 1 ? ` ×${s.itemN}` : ""}`;
    // sparks, speed, call-outs
    const cols = ["#8fc0ff", "#e8a33d", "#c48cff"];
    [...this.q("meter").children].forEach((m, i) => {
      const lit = k.drift !== 0 && k.tier > i;
      (m as HTMLElement).style.background = lit ? cols[i] : "var(--meter-off)";
      (m as HTMLElement).style.boxShadow = lit ? `0 0 10px ${cols[i]}` : "none";
    });
    this.q("drift").textContent = k.drift
      ? k.tier === 3
        ? "Purple · let go"
        : "Drifting"
      : k.boost > 0
        ? "Boost"
        : "Drift";
    this.q("speed").textContent = String(Math.round(Math.abs(kartSpeed(k)) * 3.6));
    this.q("call").textContent = this.callout.until > this.time ? this.callout.text : "";
    this.drawMap(p, racing && !battle);
  }
  // the circuit small, everyone a dot in their kart's colour, me ringed in the lamp's (docs/plan/45)
  private mapPts: { x: number; y: number; over: boolean }[] | null = null;
  private mapFit: { x0: number; z0: number; k: number } | null = null;
  private drawMap(p: S, on: boolean) {
    const box = this.q("mapBox");
    box.style.display = on ? "block" : "none";
    if (!on) return;
    const c = this.q("map") as HTMLCanvasElement;
    const g = c.getContext("2d") as CanvasRenderingContext2D;
    const W = c.width;
    const H = c.height;
    const t = this.track;
    if (!this.mapFit) {
      const xs = t.pts.map((q) => q.x);
      const zs = t.pts.map((q) => q.z);
      const mx = Math.min(...xs);
      const mz = Math.min(...zs);
      this.mapFit = {
        x0: mx,
        z0: mz,
        k: Math.min((W - 20) / (Math.max(...xs) - mx), (H - 20) / (Math.max(...zs) - mz)),
      };
    }
    const { x0, z0, k } = this.mapFit;
    const X = (x: number) => 10 + (x - x0) * k;
    const Z = (z: number) => 10 + (z - z0) * k;
    this.mapPts ??= t.pts.filter((_, i) => i % 3 === 0).map((q) => ({ x: X(q.x), y: Z(q.z), over: q.y > 3 }));
    g.clearRect(0, 0, W, H);
    g.lineJoin = "round";
    const path = (only?: boolean) => {
      g.beginPath();
      let first = true;
      for (const q of this.mapPts ?? []) {
        if (only !== undefined && q.over !== only) {
          first = true;
          continue;
        }
        first ? g.moveTo(q.x, q.y) : g.lineTo(q.x, q.y);
        first = false;
      }
      if (only === undefined) g.closePath();
    };
    path();
    g.strokeStyle = "#2a2b31";
    g.lineWidth = 8;
    g.stroke();
    g.strokeStyle = "#8a857c";
    g.lineWidth = 4;
    g.stroke();
    // (the bridge over the rest)
    path(true);
    g.strokeStyle = "#17181d";
    g.lineWidth = 8;
    g.stroke();
    g.strokeStyle = "#a7a094";
    g.lineWidth = 4;
    g.stroke();
    const s0 = t.pts[0];
    g.fillStyle = "#ece6da";
    g.fillRect(X(s0.x) - 1.5, Z(s0.z) - 5, 3, 10);
    for (const [key, s] of p.karts as Map<string, S>) {
      if (key === this.mine) continue;
      g.beginPath();
      g.arc(X(s.x), Z(s.z), 4.5, 0, Math.PI * 2);
      g.fillStyle = KART_COLOURS[s.colour][0];
      g.fill();
      g.strokeStyle = "#1a1a1e";
      g.lineWidth = 1.5;
      g.stroke();
    }
    const me = this.sim;
    if (me) {
      g.beginPath();
      g.arc(X(me.x), Z(me.z), 6.5, 0, Math.PI * 2);
      g.fillStyle = KART_COLOURS[this.mySlot()?.colour ?? 0][0];
      g.fill();
      g.strokeStyle = "#f1d79a";
      g.lineWidth = 2.5;
      g.stroke();
    }
  }

  // ── the lobby: between races, in a kart (the paddock's desk's panel) ──
  private drawLobby(p: S) {
    const tp = this.host.tp();
    const show = !!this.mine && p.phase === "lobby";
    if (!show) {
      this.lobby?.remove();
      this.lobby = null;
      this.lobbySig = "";
      this.wantPointer();
      return;
    }
    const rows = [...(p.karts as Map<string, S>).entries()];
    const sig = JSON.stringify([
      p.autoAt ? Math.ceil((p.autoAt - Date.now()) / 1000) : 0,
      p.mode,
      p.laps,
      p.fill,
      p.level,
      p.record,
      p.layout,
      p.reverse,
      rows.map(([k, s]) => [k, s.name, s.colour, s.ready]),
    ]);
    if (sig === this.lobbySig && this.lobby) return;
    this.lobbySig = sig;
    if (!this.lobby) {
      this.lobby = document.createElement("div");
      this.lobby.className = "cabinet";
      this.lobby.style.cssText =
        "position:absolute;right:24px;top:110px;width:400px;padding:16px 18px 14px;z-index:21;pointer-events:auto;color:var(--cream);font-family:var(--font-body)";
      this.lobby.addEventListener("click", (e) => this.lobbyClick(e));
      (tp?.hostEl ?? document.body).appendChild(this.lobby);
      this.wantPointer();
    }
    let rec: S = {};
    try {
      rec = p.record ? JSON.parse(p.record) : {};
    } catch {}
    // (the layout raced's own record: the Figure Eight's where it always was)
    const id = `${this.track.key}${this.track.reverse ? "-r" : ""}`;
    const best = id === "eight" ? rec.best : rec.bests?.[id];
    const seg = (name: string, opts: [string, string][], on: string) =>
      `<div class="seg">${opts.map(([v, l]) => `<button data-set="${name}" data-v="${v}" aria-pressed="${v === on}">${l}</button>`).join("")}</div>`;
    this.lobby.innerHTML = `<div style="display:flex;align-items:baseline;justify-content:space-between"><div class="title" style="font-size:22px">Kart Park</div><div class="mono" style="font-size:11px;color:var(--cream-dim)">FREE LAPS TILL THE START</div></div>
<div class="zigzag" style="margin:6px 0 12px"></div>
<div style="display:grid;grid-template-columns:96px 1fr;gap:10px 12px;align-items:center;font-size:12px">
  <span class="mono" style="color:var(--cream-dim)">MODE</span>${seg(
    "mode",
    [
      ["gp", "Grand Prix"],
      ["battle", "Battle"],
    ],
    p.mode,
  )}
  ${
    p.mode === "gp"
      ? `<span class="mono" style="color:var(--cream-dim)">LAPS</span>${seg(
          "laps",
          [
            ["1", "1"],
            ["3", "3"],
            ["5", "5"],
          ],
          String(p.laps),
        )}`
      : ""
  }
  <span class="mono" style="color:var(--cream-dim)">VORTEX</span><div style="display:flex;gap:8px;align-items:center"><button class="sw" data-set="fill" aria-pressed="${!!p.fill}"></button>${seg(
    "level",
    [
      ["easy", "Easy"],
      ["medium", "Medium"],
      ["hard", "Hard"],
    ],
    p.level,
  )}</div>
  <span class="mono" style="color:var(--cream-dim)">YOUR KART</span><div style="display:flex;gap:7px;align-items:center">${KART_COLOURS.map(
    ([c], i) => {
      const taken = rows.some(([k, r]) => k !== this.mine && r.colour === i);
      const on = this.mySlot()?.colour === i;
      return `<button data-set="colour" data-v="${i}" ${taken ? "disabled" : ""} style="width:22px;height:22px;border-radius:50%;background:${c};border:2px solid #1a1a1e;box-shadow:0 0 0 ${on ? "2px var(--amber)" : "1px var(--edge-2)"};opacity:${taken ? 0.25 : 1};cursor:${taken ? "default" : "pointer"}"></button>`;
    },
  ).join("")}</div>
</div>
<div class="grp" style="margin:14px 0 6px">The grid</div>
${rows
  .map(
    ([k, s]) =>
      `<div style="display:flex;align-items:center;gap:8px;height:26px;padding:0 8px;border-radius:4px;${k === this.mine ? "background:color-mix(in srgb,var(--amber) 12%,transparent);color:var(--amber)" : ""}"><span style="width:12px;height:12px;border-radius:50%;background:${KART_COLOURS[s.colour][0]}"></span><span style="flex:1">${esc(s.name)}${k === this.mine ? " (you)" : ""}</span><span class="mono" style="font-size:10px;color:${s.ready ? "var(--olive)" : "var(--cream-dim)"}">${s.ready ? "READY" : "FREE LAPS"}</span></div>`,
  )
  .join("")}
${p.fill ? `<div class="mono" style="font-size:10px;color:var(--rust);padding:4px 8px">+ ${8 - rows.length} Vortex karts, ${p.level}</div>` : ""}
${p.autoAt ? `<div class="mono" style="font-size:12px;color:var(--amber);padding:6px 8px 0">STARTING IN ${Math.max(0, Math.ceil((p.autoAt - Date.now()) / 1000))} S</div>` : `<div class="mono" style="font-size:10px;color:var(--cream-dim);padding:6px 8px 0">READY STARTS IT IN 20 S · EVERYONE READY, AT ONCE</div>`}
<div style="display:flex;gap:8px;margin-top:12px"><button class="deck-btn" data-go="start" aria-pressed="true" style="flex:1;height:44px">Start</button><button class="deck-btn" data-go="ready" style="height:44px">${this.mySlot()?.ready ? "Not ready" : "Ready"}</button><button class="deck-btn" data-go="leave" style="height:44px">Out</button></div>
<div class="faceplate" style="margin-top:12px;padding:8px 10px;display:flex;gap:16px;font-family:var(--font-mono);font-size:11px">
  <div><div style="opacity:.6;font-size:9px">HOUSE RECORD · ${esc(kartLayout(this.track.key).name.toUpperCase())}${this.track.reverse ? " REVERSED" : ""}</div><div>${best ? `${fmt(best.t)} · ${esc(best.name)}` : "—"}</div></div>
  <div><div style="opacity:.6;font-size:9px">LAST RACE</div><div>${rec.last?.[0] ? rec.last[0].top.map(esc).join(" · ") : "—"}</div></div>
</div>`;
  }
  private lobbyClick(e: MouseEvent) {
    const el = (e.target as HTMLElement).closest("button") as HTMLButtonElement | null;
    const room = this.host.room();
    if (!el || !room) return;
    const set = el.dataset.set;
    const v = el.dataset.v ?? "";
    if (set === "mode") room.send("kart:setup", { mode: v });
    if (set === "laps") room.send("kart:setup", { laps: Number(v) });
    if (set === "level") room.send("kart:setup", { level: v, fill: true });
    if (set === "colour") room.send("kart:colour", { colour: Number(v) });
    if (set === "fill") room.send("kart:setup", { fill: el.getAttribute("aria-pressed") !== "true" });
    if (el.dataset.go === "start") room.send("kart:start", {});
    if (el.dataset.go === "ready") room.send("kart:ready", { on: !this.mySlot()?.ready });
    if (el.dataset.go === "leave") room.send("kart:leave", {});
    el.blur();
  }

  // ── at the flag ──
  private drawResults(p: S) {
    const tp = this.host.tp();
    if (p.phase !== "done" || !this.mine || !p.results) {
      this.results?.remove();
      this.results = null;
      return;
    }
    if (this.results) return;
    let r: S;
    try {
      r = JSON.parse(p.results);
    } catch {
      return;
    }
    const me = this.mySlot();
    const myRow = r.rows.findIndex((x: S) => x.name === me?.name && !x.vortex);
    const d = document.createElement("div");
    d.className = "cabinet";
    d.style.cssText =
      "position:absolute;left:50%;top:150px;transform:translateX(-50%);width:420px;padding:12px 10px;z-index:21;pointer-events:none;color:var(--cream);font-family:var(--font-body)";
    const first = r.rows[0];
    d.innerHTML = `<div style="text-align:center;margin-bottom:8px"><div class="title" style="font-size:40px;color:var(--amber)">${myRow >= 0 ? ordinal(myRow + 1) : "The flag"}</div><div class="mono" style="font-size:11px;color:var(--cream-dim)">${r.mode === "battle" ? "BATTLE · THE BOWL" : `GRAND PRIX · ${r.laps} LAPS`}</div></div>
${podium(r.rows)}
<div class="grp" style="margin:0 8px 6px">${r.mode === "battle" ? "Smashes" : "At the flag"}</div>
${r.rows
  .slice(0, 8)
  .map(
    (x: S, i: number) =>
      `<div style="display:flex;align-items:center;gap:8px;height:24px;padding:0 8px;border-radius:4px;${i === myRow ? "background:color-mix(in srgb,var(--amber) 12%,transparent);color:var(--amber)" : ""}"><span class="lcd" style="width:14px">${i + 1}</span><span style="width:12px;height:12px;border-radius:50%;background:${KART_COLOURS[x.colour][0]}"></span><span style="flex:1">${esc(x.name)}</span><span class="lcd">${r.mode === "battle" ? x.score : x.time ? (i === 0 ? fmt(x.time) : `+${((x.time - first.time) / 1000).toFixed(2)}`) : `lap ${x.lap}`}</span></div>`,
  )
  .join("")}`;
    (tp?.hostEl ?? document.body).appendChild(d);
    this.results = d;
  }

  // ── the tower: the order on its VFD board, live in a race ──
  private tower: { mesh: Mesh; canvas: HTMLCanvasElement; tex: CanvasTexture; at: number; sig: string } | null = null;
  private drawTower(p: S) {
    if (!this.tower) {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 640;
      const tex = new CanvasTexture(canvas);
      tex.colorSpace = SRGBColorSpace;
      const mesh = new Mesh(
        new PlaneGeometry(2.8, 3.6),
        new MeshStandardMaterial({
          map: tex,
          emissiveMap: tex,
          emissive: "#ffffff",
          emissiveIntensity: 1.1,
          roughness: 0.4,
        }),
      );
      // (over the tower's own board, a hair in front of it: facing north over the start straight)
      mesh.position.set(
        KART_TOWER.x,
        this.trackWorld.under(KART_TOWER.x, KART_TOWER.z, 50).y + 9.4,
        KART_TOWER.z - 0.28,
      );
      mesh.rotation.y = Math.PI;
      this.root.add(mesh);
      this.tower = { mesh, canvas, tex, at: -9, sig: "" };
    }
    const t = this.tower;
    if (this.time - t.at < 0.5) return;
    t.at = this.time;
    const rows = [...(p.karts as Map<string, S>).values()].sort((a, b) => (a.place || 99) - (b.place || 99));
    const battle = p.mode === "battle" && p.phase !== "lobby";
    const lap = Math.max(0, ...rows.map((r) => r.lap));
    const head = p.phase === "lobby" ? "FREE LAPS" : battle ? "BATTLE" : `LAP ${Math.min(p.laps, lap + 1)}/${p.laps}`;
    const lines = (p.phase === "lobby" ? rows : rows)
      .slice(0, 8)
      .map((r) => (r.name as string).split(" ")[0].toUpperCase().slice(0, 9));
    const sig = JSON.stringify([head, lines, battle ? rows.map((r) => r.score) : 0]);
    if (sig === t.sig) return;
    t.sig = sig;
    const g = t.canvas.getContext("2d") as CanvasRenderingContext2D;
    g.fillStyle = "#120d08";
    g.fillRect(0, 0, 512, 640);
    g.fillStyle = "#ffb347";
    g.shadowColor = "#ff9a2a";
    g.shadowBlur = 14;
    g.font = "700 46px 'Share Tech Mono', 'Courier New', monospace";
    g.textBaseline = "middle";
    g.fillText(head, 28, 48);
    g.font = "700 50px 'Share Tech Mono', 'Courier New', monospace";
    lines.forEach((n, i) => {
      g.globalAlpha = i < 3 ? 1 : 0.8;
      g.fillText(`${i + 1}`, 28, 120 + i * 64);
      g.fillText(n, 92, 120 + i * 64);
      if (battle) g.fillText(String(rows[i].score), 440, 120 + i * 64);
    });
    g.globalAlpha = 1;
    t.tex.needsUpdate = true;
  }

  dispose() {
    this.closeCircuits();
    for (const o of this.offs) o();
    for (const k of [...this.views.keys()]) this.drop(k);
    this.hideHud();
    this.sound?.dispose();
    this.root.removeFromParent();
  }
}

/** The first three on their steps, second, first, third: a medal each, the kart's colour. */
function podium(rows: S[]): string {
  const medal = ["var(--amber)", "var(--cream-dim)", "var(--teak)"];
  const step = (i: number, h: number) => {
    const x = rows[i];
    if (!x) return '<div style="flex:1"></div>';
    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px">
<div style="width:22px;height:22px;border-radius:50%;background:${medal[i]};color:var(--on-amber);font:700 12px var(--font-mono);display:grid;place-items:center;box-shadow:0 0 12px color-mix(in srgb,${medal[i]} 45%,transparent)">${i + 1}</div>
<div style="font-size:13px;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(x.name)}</div>
<div style="width:100%;height:${h}px;border-radius:3px 3px 0 0;background:linear-gradient(var(--walnut),var(--walnut-deep));border-top:4px solid ${KART_COLOURS[x.colour][0]}"></div></div>`;
  };
  return `<div style="display:flex;align-items:flex-end;gap:6px;margin:4px 14px 10px">${step(1, 34)}${step(0, 52)}${step(2, 22)}</div>`;
}
const ordinal = (n: number) => `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;
const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
// (a kart's own frame, for its sparks: nothing else needs a camera here)
void PerspectiveCamera;
void KART_BOWL;
