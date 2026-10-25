import { BODY_R, CAR_COLOURS, dirFromDelta, GROUND_OFFSET, parseAvatar, type WorldObjectDef } from "@yutopia/shared";
import {
  CAR_FLAGS,
  CAR_HZ,
  type CarKind,
  type CarSpec,
  type CarState,
  type CarWire,
  type CarWorld,
  carKindOf,
  coverAfter,
  createCar,
  GRIP,
  type Ground,
  groundsWorld,
  HELPS,
  type Helps,
  headingOf,
  isCarKind,
  mayDrive,
  parkedPose,
  ploughCell,
  readout,
  SEATS_OF,
  type Solid,
  SPECS,
  STEP,
  setEngine,
  settle,
  stepCar,
  toWire,
} from "@yutopia/shared/car";
import type * as GroundsModule from "@yutopia/shared/grounds";
import {
  BackSide,
  Color,
  Group,
  type Material,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  PMREMGenerator,
  Quaternion,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SpotLight as Spot,
  type SpotLight,
  type Texture,
  type Group as TGroup,
  Vector3,
} from "three";
import { DealerPanel } from "@/components/hud/DealerPanel";
import { extraPanels } from "@/components/hud/panels";
import { addStrings, trMaybe } from "@/lib/i18n";
import { prefs } from "@/lib/prefs";
import { chars as charsMod } from "../art/chars-load";
import { mixer } from "../audio";
import { activePad } from "../pads";
import { Radio } from "../sound";
import { hud, toast } from "../store";
import { carGeometry } from "../tp/campus";
import { CarCamera } from "../tp/car/camera";
import { CarRig } from "../tp/car/rig";
import { buildSedan, type Sedan } from "../tp/car/sedan";
import type { ThirdPersonView } from "../tp/view";
import { CarInput, type Switch } from "./controls";
import { BaySnow, CabinLight, Mirror, RoadPatches, ScreenSnow, Spray, Tracks } from "./fx";
import { CarSound, preloadEngine } from "./sound";
import { type SpotPrompt, Spots, spotNo } from "./spot";

// MOTORS' panel, with the cars (the world page's panels are full): docs/plan/43-the-spot.md
extraPanels.motors = DealerPanel;
// (the showroom's door: Main Street's side of the old shut shop, its middle)
const MOTORS_DOOR = { x: 493, z: -396.6 };

// The lot's cars in the world, the client's side (docs/plan/28-the-car.md;
// the server: world-server features/cars.ts). Every lot car drawn with the
// sedan's model where it's parked (the lot's, or wherever someone left it);
// X at a door gets you in that door's seat; in the driver's, the car is yours
// to drive — its sim runs here (shared car/sim.ts) and its state goes to the
// server twenty times a second. Everyone else's cars are drawn 110 ms in the
// past from what the server has, the people in their seats. In a car the view
// is the 3D one, its camera the car's. Loaded on its own (`yutopia-car`).

export const CARS_CHUNK = "yutopia-car";
addStrings(
  {
    carIn: ["Get in", "Entrar no carro"],
    carDrive: ["Drive", "Dirigir"],
    carOut: ["Get out", "Sair do carro"],
    carMoving: ["Stop first", "Pare primeiro"],
    carHints: [
      "W/S go · brake · A/D steer · Space handbrake · L lights · V wipers · H horn · C camera · X out",
      "W/S acelerar · frear · A/D virar · Espaço freio de mão · L faróis · V limpador · H buzina · C câmera · X sair",
    ],
    sledHints: [
      "W push off · S back · A/D lean · Space drag your feet · C camera · X off",
      "W empurrar · S para trás · A/D inclinar · Espaço frear com os pés · C câmera · X descer",
    ],
    carNo_far: ["Too far from it", "Longe demais"],
    carNo_taken: ["That seat's taken", "Esse lugar está ocupado"],
    carNo_moving: ["It's moving", "Ele está andando"],
    carNo_busy: ["Someone's driving it", "Alguém está dirigindo"],
    carNo_gone: ["It's gone", "Ele sumiu"],
    carNo_pump: ["Stop beside a pump", "Pare ao lado de uma bomba"],
    carFill: ["F · fill up", "F · abastecer"],
    carFilling: ["Filling", "Abastecendo"],
    carLow: ["Low fuel", "Pouco combustível"],
    carDry: [
      "Out of fuel — fill it at the gas station, or leave it: it's towed back to the lot",
      "Sem combustível — abasteça no posto, ou deixe: ele é rebocado de volta ao estacionamento",
    ],
    carPassenger: ["C camera · R radio · X out", "C câmera · R rádio · X sair"],
    carStuck: ["Stuck? T · pull it out", "Preso? T · puxar para fora"],
    carNo_soon: ["Wait a moment", "Espere um pouco"],
    carNo_show: ["It's on show: pick yours at the door", "Está em exposição: escolha o seu na porta"],
    carNo_model: ["MOTORS doesn't sell that", "A MOTORS não vende esse"],
    carNo_owned: ["It's {who}'s: get in beside", "É de {who}: entre ao lado"],
    carNo_nocar: ["You've no car: MOTORS on Main Street has them", "Você não tem carro: a MOTORS na Main Street tem"],
    carOf: ["{who}'s car", "carro de {who}"],
    carKeysLent: ["{who} lent you their car keys · {plate}", "{who} emprestou a chave do carro · {plate}"],
    carKeysBack_taken: ["{who} took their car keys back", "{who} pegou a chave do carro de volta"],
    carKeysBack_home: [
      "{who}'s car is home: the keys are back with them",
      "O carro de {who} está na vaga: a chave voltou",
    ],
    carKeysBack_day: [
      "The day's over: {who}'s car keys are back with them",
      "O dia acabou: a chave do carro de {who} voltou",
    ],
    carNo_full: ["No room for it here: try again by the forecourt", "Sem espaço aqui: tente de novo perto do pátio"],
    motorsPrompt: ["MOTORS · pick yours", "MOTORS · escolha o seu"],
    motorsBought: ["It's yours: in the collection bay", "É seu: na vaga de retirada"],
    carNo_nowhere: ["Nowhere clear near to pull it to", "Nenhum lugar livre perto"],
    carGas: ["GAS", "ACEL"],
    carBrake: ["BRAKE", "FREIO"],
    carHand: ["HAND", "MÃO"],
  },
  "yutopia-car",
);
const t = (k: string) => trMaybe(k) ?? k;

interface RoomLike {
  sessionId: string;
  // biome-ignore lint/suspicious/noExplicitAny: the room's decoded state
  state: any;
  send(type: string, m: unknown): void;
  onMessage(type: string, cb: (m: never) => void): () => void;
}
export interface CarsHost {
  room(): RoomLike | null;
  /** the ground floor's corner in the building's coords (map ox, oy) */
  ox(): number;
  oy(): number;
  level(): number;
  me(): { x: number; y: number };
  /** my user id (my own bay: car/spot.ts) */
  uid(): number;
  tp(): ThirdPersonView | null;
  objects(): Iterable<WorldObjectDef>;
  night(): number;
  /** out under the sky: 0 … 1 pitch dark (daylight.ts) */
  dark(): number;
  storm(): number;
  reduced(): boolean;
  quality(): "high" | "medium" | "low";
  /** the Grounds' own vehicles (the shuttle, the visitor's car), eased */
  ai(): { id: string; kind: string; x: number; z: number; a: number; shown: boolean; v?: number }[];
  toast(text: string): void;
  chars(): typeof import("../chars") | null;
}

// a sample of someone else's car
interface Sample {
  t: number;
  p: Vector3;
  q: Quaternion;
  v: Vector3;
  steer: number;
  rpm: number;
  gear: number;
  fl: number;
  slip: number;
}
interface LiveView {
  id: string;
  kind: CarKind;
  model: Sedan;
  buf: Sample[];
  seq: number;
  spin: number;
  // (`at`: when they sat down — they slide in from the open door)
  people: Map<
    string,
    { m: InstanceType<typeof import("../chars").PersonModel>; seat: number; key: string; at: number }
  >;
  sound: CarSound | null;
  pose: { p: Vector3; q: Quaternion; v: Vector3 };
  // its doors swinging as people get in and out; how long it's been fast (its roof's snow)
  doors: number[];
  doorUntil: number[];
  prevSeats: string[];
  fast: number;
  role: string; // shared car/homes.ts: "police", "taxi", "rental" or none
  exhaustAt: number;
}
interface ParkedView {
  key: string;
  kind: CarKind;
  full: Sedan | null;
  far: Mesh | null;
  pose: { x: number; z: number; a: number; y: number };
}
// a parked car I knocked: sliding on its locked wheels till it stops, then told to the server
interface Shove {
  x: number;
  z: number;
  a: number;
  vx: number;
  vz: number;
  w: number; // turning (about y, as the sim's)
  spec: CarSpec;
  from: { x: number; z: number };
  sent: boolean;
  sentAt: number;
}
/** A car's footprint from its spec: half its length and width, its middle ahead of the CoG. */
const boxOf = (spec: CarSpec) => ({
  hx: (spec.body.ahead + spec.body.behind) / 2,
  hz: spec.body.width / 2,
  off: (spec.body.ahead - spec.body.behind) / 2,
});
const SHOVE_MAX = 6; // m: as far as the server lets a knocked car go
/** The Grounds' own vehicles' boxes (half length, half width; their middles where they are). */
const aiBox = (kind: string) =>
  kind === "shuttle" ? { hx: 5, hz: 1.2 } : kind === "plough" ? { hx: 4.3, hz: 1.35 } : { hx: 2.5, hz: 1 };
/** A car's dents from its wire ("front,rear,left,right"). */
const dmgOf = (s: unknown): number[] => {
  const d = String(s ?? "")
    .split(",")
    .map(Number);
  return [0, 1, 2, 3].map((i) => (Number.isFinite(d[i]) ? Math.max(0, Math.min(1, d[i])) : 0));
};
// how much dirt a second's driving at 10 m/s puts on, by the ground (the rest: none)
const DIRT: Partial<Record<Ground, number>> = { slush: 0.012, deep: 0.009, path: 0.007, snow: 0.005, ice: 0.001 };
const MY_CAR = "yutopia:mycar";
/** Does a box (its middle, half-sizes, heading) overlap a solid? (Separating axes, 2D.) */
function overlaps(x: number, z: number, hx: number, hz: number, a: number, o: Solid): boolean {
  const ax = Math.cos(a);
  const az = Math.sin(a);
  if (o.kind === "circle") {
    const dx = o.x - x;
    const dz = o.z - z;
    const lu = Math.max(-hx, Math.min(hx, dx * ax + dz * az));
    const lv = Math.max(-hz, Math.min(hz, -dx * az + dz * ax));
    return Math.hypot(dx * ax + dz * az - lu, -dx * az + dz * ax - lv) < (o.r ?? 0.2);
  }
  const bx = Math.cos(o.a ?? 0);
  const bz = Math.sin(o.a ?? 0);
  const ox = o.hx ?? 0.5;
  const oz = o.hz ?? 0.5;
  for (const [ux, uz] of [
    [ax, az],
    [-az, ax],
    [bx, bz],
    [-bz, bx],
  ]) {
    const ra = hx * Math.abs(ux * ax + uz * az) + hz * Math.abs(-ux * az + uz * ax);
    const rb = ox * Math.abs(ux * bx + uz * bz) + oz * Math.abs(-ux * bz + uz * bx);
    if (Math.abs((o.x - x) * ux + (o.z - z) * uz) >= ra + rb) return false;
  }
  return true;
}

const FAR = 38; // past this, a parked car is the simple model
/** Each kind's engine (car/sound.ts CarSound's voice; the toboggan has none). */
const VOICE: Record<CarKind, "four" | "v8" | "two" | "diesel" | null> = {
  sedan: "four",
  offroad: "four",
  pickup: "v8",
  snowmobile: "two",
  snowcat: "diesel",
  ploughtruck: "diesel",
  tractor: "diesel",
  toboggan: null,
};
/** A kind's engine heard (none for the toboggan). */
function soundOf(ctx: AudioContext, kind: CarKind): CarSound | null {
  const v = VOICE[kind];
  return v ? new CarSound(ctx, mixer.buses.effects, v) : null;
}
/** The kinds the far model (a wagon's or a sedan's outline) can't stand in for: always drawn whole. */
const OWN_SHAPE = new Set<CarKind>(["snowmobile", "snowcat", "ploughtruck", "tractor", "toboggan"]);
const ENTER_S = 0.7; // s: getting in (sliding in from the door; the camera easing to the car's)
const RENDER_BEHIND = 110;
const v3 = new Vector3();
const q1 = new Quaternion();
const FLIP = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI);

/** The cars for a world controller (its own state read as the host: the glue lives here, in the
 *  car's chunk, not on the world page). */
// biome-ignore lint/suspicious/noExplicitAny: the controller's private state, read from its chunk
export function attachCars(c: any, G: typeof GroundsModule): Cars {
  return new Cars(
    {
      room: () => c.room,
      ox: () => c.map.ox ?? 0,
      oy: () => c.map.oy ?? 0,
      level: () => c.level,
      me: () => c.me,
      uid: () => c.myUid(),
      tp: () => c.tp,
      objects: () => c.objs.values(),
      night: () => c.engine?.getDaylight().night ?? 0,
      dark: () => c.engine?.getDaylight().dark ?? 0,
      storm: () => Math.max(0, c.storm),
      reduced: () => prefs().reducedMotion,
      quality: () => c.qualityNow(),
      ai: () => c.lifeCars,
      toast: (text) => toast(text, "warn"),
      chars: () => charsMod(),
    },
    G,
  );
}

export class Cars {
  /** everything drawn here, in the Grounds' (building) coords: placed in the view's frame */
  readonly root = new Group();
  private G: typeof GroundsModule;
  private world: CarWorld;
  private helps: Helps = { ...HELPS };
  private parked = new Map<string, ParkedView>();
  private shoves = new Map<string, Shove>();
  private nowMs = 0;
  private live = new Map<string, LiveView>();
  private farMats = new Map<number, Material>();
  private env: Texture | null = null;
  // (kept from one renewal to the next: a new generator and dome each time linked
  // their shaders again, a hitch every 20 s)
  private envMake: { pm: PMREMGenerator; for: ThirdPersonView["renderer"]; scene: Scene; dome: Mesh } | null = null;
  private envAt = -1e9;
  private envNight = -1;
  private envDark = -1;
  // mine
  private mine: {
    vid: string;
    seat: number;
    sim: CarState | null;
    rig: CarRig | null;
    acc: number;
    seq: number;
    sentAt: number;
    sound: CarSound | null;
    started: boolean;
    // its wear as I drive it (sent now and then: car:wear), the last knock counted
    grime: number;
    dmg: number[];
    wearSent: string;
    wearAt: number;
    hitAt: number;
    dry: boolean;
  } | null = null;
  private knocked = new Map<string, number>();
  private enteredAt = -9;
  // the mouse turning the car's camera: moved (locked, as the view's mouse look) or dragged
  private mouseAt = -9;
  private mouseHeld = false;
  private mouseOn: HTMLCanvasElement | null = null;
  private onMouse = (e: PointerEvent) => {
    if (!this.mine || e.pointerType === "touch") return;
    const c = this.mouseOn;
    const locked = !!c && document.pointerLockElement === c;
    if (e.type === "pointerdown" || e.type === "pointerup") {
      this.mouseHeld = !locked && (e.buttons & 3) !== 0;
      return;
    }
    if (!locked && !(e.buttons & 3)) return;
    // (some browsers send one huge jump as the lock starts)
    if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
    const tp = this.host.tp();
    const k = locked ? 0.0024 * (tp?.lookSens ?? 1) : 0.0055;
    const look = this.cam.look;
    // (all the way round the car behind it; from the driver's seat, as far as a head turns)
    const far = this.cam.mode === "cockpit" ? 2.4 : Math.PI;
    look.yaw = Math.max(-far, Math.min(far, look.yaw + e.movementX * k));
    look.pitch = Math.max(-0.5, Math.min(0.4, look.pitch - e.movementY * k * 0.8 * (tp?.lookInvert ? -1 : 1)));
    this.mouseAt = this.time;
  };
  private listenMouse(c: HTMLCanvasElement) {
    if (this.mouseOn === c) return;
    this.unlistenMouse();
    this.mouseOn = c;
    for (const t of ["pointermove", "pointerdown", "pointerup"] as const) c.addEventListener(t, this.onMouse);
  }
  private unlistenMouse() {
    const c = this.mouseOn;
    if (c) for (const t of ["pointermove", "pointerdown", "pointerup"] as const) c.removeEventListener(t, this.onMouse);
    this.mouseOn = null;
  }
  private stuckFor = 0; // s: the throttle (either way) held and it not moving
  private myCarAt = 0;
  private input = new CarInput();
  readonly cam = new CarCamera();
  private beams: "off" | "low" | "high" = "off";
  private ind: -1 | 0 | 1 = 0;
  private hazard = false;
  private siren = false; // (a police car's: G)
  private wipers: 0 | 1 | 2 | 3 = 0;
  private time = 0;
  private hud: HTMLDivElement | null = null;
  private offMsg: (() => void)[] = [];
  private factory: InstanceType<typeof import("../chars").CharFactory> | null = null;
  private seated = new Set<string>();
  private wanted = ""; // a car:enter sent, waiting for its seat
  private wantedAt = 0;
  // what the cars leave and throw, the roads' patches, the cabin I'm in
  private tracks: Tracks;
  private spray: Spray;
  private patches: RoadPatches;
  private cabin: CabinLight;
  private mirror: { vid: string; m: Mirror } | null = null;
  private screen: { vid: string; s: ScreenSnow } | null = null;
  private radio = new Radio();
  private station = 0; // 0 off, 1..3

  constructor(
    private host: CarsHost,
    G: typeof GroundsModule,
  ) {
    this.G = G;
    this.root.name = "cars";
    // (its parked cars, marked `still`, are looked at by the 3D view's culling: tp/below-cull.ts)
    this.root.userData.cullKids = true;
    this.world = groundsWorld({
      cold: () => Math.min(1, 0.35 + 0.5 * this.host.night() + 0.3 * this.host.storm()),
      cover: () => Math.max(0, this.host.storm() - 0.2) * 0.9,
      // (less where a plough's blade has been through: the server's cells)
      coverAt: (x, z) =>
        coverAfter(
          Math.max(0, this.host.storm() - 0.2) * 0.9,
          this.host.room()?.state.ploughed?.get(ploughCell(x, z)),
          Date.now(),
        ),
      extra: (x, z, r, out) => this.solidsNear(x, z, r, out),
    });
    const room = host.room();
    if (room) {
      this.offMsg.push(
        room.onMessage("car:snap", (m: CarWire & { id: string }) => this.snapped(m)),
        room.onMessage("car:no", (m: { why: string; who?: string }) => {
          this.wanted = "";
          host.toast(t(`carNo_${m.why}`).replace("{who}", (m.who ?? "").split(" ")[0]));
        }),
        // someone's car keys lent me, or back with them (docs/plan/43-the-spot.md)
        room.onMessage("car:keys", (m: { from: string; plate: string; lent: boolean; why?: string }) =>
          toast(
            t(m.lent ? "carKeysLent" : `carKeysBack_${m.why ?? "taken"}`)
              .replace("{who}", m.from.split(" ")[0])
              .replace("{plate}", m.plate),
            "info",
          ),
        ),
        room.onMessage("spot:no", (m: { why: string }) => host.toast(spotNo(m.why))),
        room.onMessage("car:bought", () => {
          if (hud.get().panel.kind === "motors") hud.set({ panel: { kind: null } });
          toast(t("motorsBought"), "info");
        }),
        room.onMessage("car:radio", () => {
          if (this.mine?.seat === 0) this.station = (this.station + 1) % 4;
        }),
      );
    }
    this.cam.reduced = host.reduced();
    this.tracks = new Tracks(this.root);
    this.spray = new Spray(this.root);
    this.patches = new RoadPatches(this.root, G);
    this.cabin = new CabinLight(G);
    // (in the scene from the start, dark: added getting in, it recompiled every material)
    this.cabin.park(this.root);
  }

  // ── what the controller asks ───────────────────────────────────────────────
  /** Am I in a car (the driver or a passenger)? */
  inCar(): boolean {
    return !!this.mine;
  }
  driving(): boolean {
    return !!this.mine && this.mine.seat === 0;
  }
  /** People seated in cars (drawn here, not as people standing about). */
  seatedIds(): Set<string> {
    return this.seated;
  }
  /** In a car: the controller's me carried in my seat (it walks nowhere). */
  // biome-ignore lint/suspicious/noExplicitAny: the controller's private state
  carry(c: any): boolean {
    if (!this.mine) return false;
    const s = this.mySeat();
    c.path = null;
    c.actions.clear();
    if (s) {
      c.me.x = s.x;
      c.me.y = s.y;
      c.me.a = 2; // (sitting: shared ANIM.sit)
      c.meAngle = s.a;
      c.me.d = dirFromDelta(Math.cos(s.a), Math.sin(s.a), c.me.d);
    }
    return true;
  }
  /** Where I am, in my seat (the ground floor's coords), facing, and the ground's height under
   *  the car: for the controller's own state, and the 3D view's (it follows me, not drawn). */
  mySeat(): { x: number; y: number; a: number; ground: number } | null {
    const m = this.mine;
    const l = m ? this.live.get(m.vid) : null;
    if (!m || !l) return null;
    const p = l.pose.p;
    const a = headingFromQ(l.pose.q);
    const [lx, lz] = SEATS_OF[l.kind].at[m.seat];
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    return {
      x: p.x + ca * lx - sa * lz - this.host.ox(),
      y: p.z + sa * lx + ca * lz - this.host.oy(),
      a,
      ground: p.y - SPECS[l.kind].cog,
    };
  }
  /** A key for the car (in it): handled. */
  key(e: KeyboardEvent, down: boolean): boolean {
    if (!this.mine) return false;
    if (!down) {
      this.input.keyUp(e.code);
      return false;
    }
    if (e.repeat && e.code !== "KeyW" && e.code !== "KeyS") return this.input.keyDown(e.code) || true;
    const used = this.input.keyDown(e.code);
    void mixer.resume();
    return used;
  }
  blur() {
    this.input.clear();
  }
  /** The HUD's "X" prompt by a car or in one (none while it moves): set, and true; false if there's none. */
  prompt(h: typeof hud): boolean {
    // (the bays' boards: who's claimed what, their posts for the sim)
    this.spots.refresh(
      () => this.host.objects(),
      this.host.uid(),
      { x: this.host.ox(), y: this.host.oy() },
      performance.now(),
      (o) => {
        // (driven: where it is now; parked: its object, on the ground floor)
        const l = this.live.get(`car:${o.id}`);
        const q = l ? null : parkedPose(o);
        const x = l ? l.pose.p.x : (q?.x ?? 0) + GROUND_OFFSET.x;
        const z = l ? l.pose.p.z : (q?.y ?? 0) + GROUND_OFFSET.y;
        return { x, z, where: this.G.placeAt(x, z).name };
      },
    );
    // (standing in a bay of the lot, its claim before a car in the next bay: a neighbour's door is
    // in reach from most of a bay; a car in this very bay — mine, say — before it)
    const near = this.promptNow();
    const spot = this.mine ? null : this.spotNow();
    const inBay = (id: string) => {
      const p = this.parked.get(id)?.pose;
      const me = this.host.me();
      return !!p && this.spots.sameBay(me.x + this.host.ox(), me.y + this.host.oy(), p.x, p.z);
    };
    // (by its door — within 2.2 of its middle — the car's, though)
    const carWins = !!near && (near.kind !== "car" || inBay(near.objectId) || this.nearD < 2.2);
    const car = (spot && !carWins ? spot : near) ?? this.motorsNow();
    if (!car) return false;
    // (by a car: its engine's recordings fetched before it's started)
    if (car.kind === "car" && mixer.ctx) void preloadEngine(mixer.ctx);
    const cur = h.get().prompt;
    if (car.kind === "car:moving") {
      if (cur) h.set({ prompt: null });
    } else if (cur?.objectId !== car.objectId || cur.label !== car.label || cur.kind !== car.kind)
      h.set({ prompt: car });
    return true;
  }
  private promptNow(): { objectId: string; kind: string; label: string } | null {
    if (this.mine) {
      // (on the move there's nothing to press: the prompt comes back at a stop)
      const l = this.live.get(this.mine.vid);
      const sp = l ? Math.hypot(l.pose.v.x, l.pose.v.z) : 0;
      return sp > 1.5
        ? { objectId: this.mine.vid, kind: "car:moving", label: "" }
        : { objectId: this.mine.vid, kind: "car:leave", label: t("carOut") };
    }
    if (this.host.level() !== 0) return null;
    const hit = this.nearest();
    if (!hit) return null;
    this.nearD = hit.d;
    const label = hit.seat === 0 ? t("carDrive") : t("carIn");
    // (someone's own: whose)
    return {
      objectId: hit.id,
      kind: "car",
      label: hit.owner ? `${label} · ${t("carOf").replace("{who}", hit.owner.split(" ")[0])}` : label,
    };
  }
  /** Standing in a bay of the lot, on foot: claim it, or give it up (car/spot.ts). */
  private spots = new Spots();
  /** how far the car the prompt offers is (its middle) */
  private nearD = 0;
  private spotNow(): SpotPrompt | null {
    if (this.host.level() !== 0) return null;
    const me = this.host.me();
    return this.spots.prompt(me.x + this.host.ox(), me.y + this.host.oy(), this.host.uid());
  }
  /** By MOTORS' door or a vehicle on show, on foot: the dealer's prompt (docs/plan/43-the-spot.md). */
  private motorsNow(): { objectId: string; kind: string; label: string } | null {
    if (this.host.level() !== 0) return null;
    const me = this.host.me();
    const x = me.x + this.host.ox();
    const z = me.y + this.host.oy();
    const M = this.G.MOTORS;
    if (x < M.yard.x0 - 20 || x > M.yard.x1 + 2 || z < M.yard.z0 - 4 || z > M.yard.z1 + 2) return null;
    const door = Math.hypot(x - MOTORS_DOOR.x, z - MOTORS_DOOR.z) < 2.6;
    const show = M.show.some((v) => Math.hypot(x - v.x, z - v.z) < 4);
    return door || show ? { objectId: "motors", kind: "motors", label: t("motorsPrompt") } : null;
  }
  /** X pressed on the prompt: true if it was a car's (or a bay's, or the dealer's). */
  act(kind: string, id: string): boolean {
    const room = this.host.room();
    if (kind === "motors") {
      // (the one I have now: the panel starts from its looks)
      const uid = this.host.uid();
      let mine = "";
      for (const o of this.host.objects())
        if (o.kind === "car" && Number(o.props?.ownerId) === uid && !o.props?.retire) mine = o.id;
      hud.set({ panel: { kind: "motors", objectId: mine } });
      return true;
    }
    if (kind === "spot:claim" || kind === "spot:free") {
      room?.send(kind, { bay: id.replace(/^bay-/, "") });
      return true;
    }
    if (kind !== "car" && kind !== "car:leave") return false;
    if (!room) return true;
    if (kind === "car:leave") {
      const l = this.mine ? this.live.get(this.mine.vid) : null;
      if (l && Math.hypot(l.pose.v.x, l.pose.v.z) > 2.5) return true;
      room.send("car:leave", {});
      return true;
    }
    const hit = this.nearest();
    if (!hit || hit.id !== id) return true;
    this.wanted = id;
    this.wantedAt = performance.now();
    void mixer.resume();
    room.send("car:enter", { id, seat: hit.seat });
    return true;
  }
  /** The car's camera (in one, the view uses it). */
  camera(): ThirdPersonView["gameCam"] {
    return this.camNow;
  }
  private camNow: ThirdPersonView["gameCam"] = null;
  /** Something that blocks walking: a live car's body, its model's size, a body round (x, y)
   *  touching it (the ground floor's coords; parked, its object blocks — shared grid.ts). */
  blocks(x: number, y: number): boolean {
    const bx = x + this.host.ox();
    const bz = y + this.host.oy();
    for (const [, l] of this.live) {
      const a = headingFromQ(l.pose.q);
      const b = boxOf(SPECS[l.kind]);
      const dx = bx - l.pose.p.x;
      const dz = bz - l.pose.p.z;
      const u = Math.abs(dx * Math.cos(a) + dz * Math.sin(a) - b.off) - b.hx;
      const w = Math.abs(-dx * Math.sin(a) + dz * Math.cos(a)) - b.hz;
      if (Math.hypot(Math.max(u, 0), Math.max(w, 0)) < BODY_R) return true;
    }
    // (and the Grounds' own: the shuttle, the plough, the visitor's car)
    for (const v of this.host.ai()) {
      if (!v.shown) continue;
      const b = aiBox(v.kind);
      const dx = bx - v.x;
      const dz = bz - v.z;
      const u = Math.abs(dx * Math.cos(v.a) + dz * Math.sin(v.a)) - b.hx;
      const w = Math.abs(-dx * Math.sin(v.a) + dz * Math.cos(v.a)) - b.hz;
      if (Math.hypot(Math.max(u, 0), Math.max(w, 0)) < BODY_R) return true;
    }
    return false;
  }

  // ── a frame ────────────────────────────────────────────────────────────────
  frame(dt: number, now: number) {
    const room = this.host.room();
    const tp = this.host.tp();
    this.time += dt;
    if (!room?.state?.vehicles) return;
    const C = this.host.chars();
    if (C && !this.factory) this.factory = new C.CharFactory();
    this.factory?.pump(6);
    // the view's frame for the Grounds' coords
    if (tp) {
      if (this.root.parent !== tp.scene) tp.scene.add(this.root);
      this.listenMouse(tp.renderer.domElement);
      const f = tp.groundsFrame();
      this.root.position.set(-f.x, f.y, -f.z);
      this.root.visible = f.visible;
      this.root.updateMatrixWorld();
    }
    this.nowMs = now;
    this.updateEnv(tp);
    this.stepShoves(dt, room);
    this.syncParked(tp, dt);
    this.syncLive(room, dt, now);
    this.drive(room, dt, now);
    if (!this.mine?.sim) this.headlamps(null, "off");
    this.findMine(room, now);
    this.effects(dt);
    this.drawHud();
  }

  // ── what they leave, throw and show ────────────────────────────────────────
  private effects(dt: number) {
    const night = this.host.night();
    const storm = this.host.storm();
    this.patches.update(Math.min(1, 0.35 + 0.5 * night + 0.3 * storm));
    const t = this.time;
    for (const [id, l] of this.live) {
      const mine = this.mine?.vid === id ? this.mine : null;
      const sim = mine?.sim ?? null;
      const m = l.model;
      const a = headingFromQ(l.pose.q);
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const speed = Math.hypot(l.pose.v.x, l.pose.v.z);
      const spec = SPECS[l.kind];
      const rear = spec.wheelbase - spec.front;
      // each wheel: its track, the snow it throws
      for (let i = 0; i < 4; i++) {
        let x: number;
        let z: number;
        let g: Ground;
        let slip: number;
        if (sim) {
          const w = sim.wheels[i];
          if (!w.contact) continue;
          x = w.px;
          z = w.pz;
          g = w.ground;
          slip = w.slip;
        } else {
          const lx = i < 2 ? spec.front : -rear;
          const lz = (i % 2 === 0 ? -1 : 1) * (spec.track / 2);
          x = l.pose.p.x + ca * lx - sa * lz;
          z = l.pose.p.z + sa * lx + ca * lz;
          g = this.world.ground(x, z);
          const b = l.buf[l.buf.length - 1];
          slip = b ? b.slip : 0;
        }
        const y = this.G.heightAt(x, z);
        this.tracks.mark(`${id}:${i}`, x, y, z, g, t, slip > 1.5);
        const loose = g === "snow" || g === "deep" || g === "path" || g === "slush";
        const k = loose ? Math.min(1, (slip / 4) * (i >= 2 ? 1 : 0.5) + (speed > 6 ? (speed - 6) * 0.02 : 0)) : 0;
        if (k > 0.05) {
          const back = speed > 0.5 ? -1 : 1;
          this.spray.throw(x, y, z, ca * back, sa * back, k, g === "slush");
        }
      }
      // the exhaust's breath in the cold (thick while the engine's cold, torn away by speed)
      const engineOn = sim ? sim.rpm > 50 : !!((l.buf[l.buf.length - 1]?.fl ?? 0) & CAR_FLAGS.engine);
      if (engineOn && t - l.exhaustAt > 0.14) {
        l.exhaustAt = t;
        const e = m.lamps.exhaust;
        v3.copy(e).applyMatrix4(m.root.matrix);
        const cold = sim ? 1 - sim.temp / 0.55 : 0.3;
        this.spray.puff(
          v3.x,
          v3.y,
          v3.z,
          -ca * 0.6 - l.pose.v.x * 0.2,
          0.25,
          -sa * 0.6 - l.pose.v.z * 0.2,
          0.5 + cold * 0.6,
          1.2,
          night > 0.5 ? 0x8b95a5 : 0xeef1f4,
          0.16 + 0.18 * cold,
        );
      }
      // the doors
      for (let i = 0; i < 4; i++) {
        const want = t < l.doorUntil[i] ? 1.05 : 0;
        const was = l.doors[i];
        l.doors[i] += (want - l.doors[i]) * Math.min(1, dt * (want > l.doors[i] ? 7 : 5));
        if (was > 0.08 && l.doors[i] <= 0.08 && want === 0) this.clunk(l, false);
        m.doors[i]?.open(l.doors[i]); // (the 4x4 has two: its back seats get in through the front)
      }
      // the roof's snow blown off at speed
      l.fast = speed > 12 ? l.fast + dt : 0;
      if (l.fast > 1.2)
        for (const sm of m.snow)
          if (sm.visible) {
            sm.visible = false;
            sm.updateWorldMatrix(true, false);
            sm.getWorldPosition(v3);
            this.root.worldToLocal(v3);
            for (let k = 0; k < 4; k++)
              this.spray.puff(
                v3.x,
                v3.y + 0.2,
                v3.z,
                -ca * (3 + k),
                1 + k * 0.3,
                -sa * (3 + k),
                1.4,
                1.6,
                0xf3f6f9,
                0.5,
              );
          }
    }
    // the car I'm in: the snow on its windscreen, the lamps over its cabin, its mirror
    const mine = this.mine;
    const l = mine ? this.live.get(mine.vid) : null;
    // (a toboggan has none of them)
    if (l && mine && !SPECS[l.kind].pushed) {
      if (this.screen?.vid !== mine.vid) {
        this.screen?.s.dispose();
        this.screen = { vid: mine.vid, s: new ScreenSnow(l.model) };
      }
      const speed = Math.hypot(l.pose.v.x, l.pose.v.z);
      const wipers = mine.seat === 0 ? this.wipers : ((l.buf[l.buf.length - 1]?.fl ?? 0) >> 8) & 3;
      this.screen.s.step(dt, 0.25 + 0.9 * storm, speed, wipers, false);
      this.cabin.step(l.model, night);
      const q = this.host.quality();
      const tp = this.host.tp();
      if (this.cam.mode === "cockpit" && tp && q !== "low") {
        if (this.mirror?.vid !== mine.vid) {
          this.mirror?.m.dispose();
          this.mirror = { vid: mine.vid, m: new Mirror(l.model) };
        }
        this.mirror.m.render(tp.renderer, tp.scene, t, q === "high" ? 24 : 12);
      }
      // the radio, heard in the car
      const st = mine.seat === 0 ? this.station : ((l.buf[l.buf.length - 1]?.fl ?? 0) >> 14) & 3;
      if (st > 0) {
        this.radio.play(st - 1, 0);
        this.radio.setLevel(0.55, 0);
      } else this.radio.setLevel(0);
      if (st !== this.shownStation) {
        this.shownStation = st;
        l.model.setRadio(st ? "FM" : "TAPE", [98.7, 88.4, 101.3][(st || 1) - 1], st || 1);
      }
    } else {
      this.cabin.park(this.root);
      this.mirror?.m.dispose();
      this.mirror = null;
      this.screen?.s.dispose();
      this.screen = null;
      this.radio.setLevel(0);
    }
    // the plough's blade throwing the road's snow off to its right
    const me = this.host.me();
    for (const v of this.host.ai()) {
      if (v.kind !== "plough" || !v.shown || Math.abs(v.v ?? 0) < 1.5) continue;
      const cx = Math.cos(v.a);
      const sx = Math.sin(v.a);
      if (Math.hypot(v.x - me.x - this.host.ox(), v.z - me.y - this.host.oy()) > 90) continue;
      const bx = v.x + cx * 4.6 - sx * 1.2;
      const bz = v.z + sx * 4.6 + cx * 1.2;
      this.spray.throw(bx, this.G.heightAt(bx, bz) + 0.3, bz, -sx, cx, Math.min(1, Math.abs(v.v ?? 0) / 8), false);
    }
    // …and the plough truck's, driven (in a storm: fresh snow to throw)
    if (this.host.storm() > 0.25)
      for (const l of this.live.values()) {
        const sp = Math.hypot(l.pose.v.x, l.pose.v.z);
        if (l.kind !== "ploughtruck" || sp < 1.5) continue;
        if (Math.hypot(l.pose.p.x - me.x - this.host.ox(), l.pose.p.z - me.y - this.host.oy()) > 90) continue;
        const a = headingFromQ(l.pose.q);
        const cx = Math.cos(a);
        const sx = Math.sin(a);
        const bx = l.pose.p.x + cx * 3.2 - sx * 1.5;
        const bz = l.pose.p.z + sx * 3.2 + cx * 1.5;
        this.spray.throw(bx, this.G.heightAt(bx, bz) + 0.3, bz, -sx, cx, Math.min(1, sp / 8), false);
      }
    this.tracks.fade(t, night);
    this.spray.step(dt, night);
  }
  private shownStation = -1;
  private hintAt = 0;
  /** A door's clunk (opening: a click; shutting: a thud), heard by distance. */
  private clunk(l: LiveView, open: boolean) {
    const s = l.sound ?? (this.mine?.vid === l.id ? this.mine.sound : null);
    s?.door(open);
  }

  // the sky as the paint's and the chrome's reflections, renewed now and then
  private updateEnv(tp: ThirdPersonView | null) {
    if (!tp) return;
    const n = this.host.night();
    const dark = this.host.dark();
    if (this.time - this.envAt < 20 && Math.abs(n - this.envNight) < 0.15 && Math.abs(dark - this.envDark) < 0.15)
      return;
    this.envDark = dark;
    this.envAt = this.time;
    this.envNight = n;
    if (this.envMake?.for !== tp.renderer) {
      this.dropEnvMake();
      const scene = new Scene();
      const dome = new Mesh(
        new SphereGeometry(50, 24, 12),
        new ShaderMaterial({
          side: BackSide,
          uniforms: { top: { value: new Color() }, hor: { value: new Color() }, low: { value: new Color() } },
          vertexShader:
            "varying vec3 p; void main(){ p = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
          fragmentShader:
            "uniform vec3 top; uniform vec3 hor; uniform vec3 low; varying vec3 p; void main(){ vec3 c = p.y > 0.0 ? mix(hor, top, smoothstep(0.0, 0.5, p.y)) : mix(hor, low, smoothstep(0.0, 0.15, -p.y)); gl_FragColor = vec4(c, 1.0); }",
        }),
      );
      scene.add(dome);
      this.envMake = { pm: new PMREMGenerator(tp.renderer), for: tp.renderer, scene, dome };
    }
    const { pm, scene, dome } = this.envMake;
    const u = (dome.material as ShaderMaterial).uniforms;
    u.top.value.set("#8f9ca8").lerp(new Color("#04070c"), n);
    u.hor.value.set("#d5dbe0").lerp(new Color("#141c27"), n);
    u.low.value.set("#dfe5ea").lerp(new Color("#0b1016"), n);
    // (in the pitch dark, nothing up there to shine in the paint)
    for (const c of [u.top.value, u.hor.value, u.low.value]) c.multiplyScalar(1 - 0.92 * dark);
    const next = pm.fromScene(scene, 0.04, 0.1, 100).texture;
    const old = this.env;
    this.env = next;
    for (const p of this.parked.values()) p.full?.setEnv(next);
    for (const l of this.live.values()) l.model.setEnv(next);
    old?.dispose();
  }
  private dropEnvMake() {
    const m = this.envMake;
    if (!m) return;
    m.pm.dispose();
    m.dome.geometry.dispose();
    (m.dome.material as ShaderMaterial).dispose();
    this.envMake = null;
  }

  // ── the parked cars: the lot's (and wherever they were left) ───────────────
  private syncParked(tp: ThirdPersonView | null, dt: number) {
    const ox = this.host.ox();
    const oy = this.host.oy();
    const seen = new Set<string>();
    const me = this.host.me();
    const mx = me.x + ox;
    const mz = me.y + oy;
    const camAt = tp ? tp.camera.position : null;
    for (const o of this.host.objects()) {
      if (o.kind !== "car" || (Number(o.props?.level ?? 0) | 0) !== 0 || o.props?.driven) continue;
      seen.add(o.id);
      const pose = parkedPose(o);
      let x = pose.x + ox;
      let z = pose.y + oy;
      let a = pose.a;
      // (knocked by me: where it's sliding; told to the server, till its object has caught up)
      const sh = this.shoves.get(o.id);
      if (sh) {
        if (sh.sent && (Math.hypot(sh.x - x, sh.z - z) < 0.05 || this.nowMs - sh.sentAt > 4000))
          this.shoves.delete(o.id);
        else {
          x = sh.x;
          z = sh.z;
          a = sh.a;
        }
      }
      const kind = carKindOf(o.props?.model);
      const key = `${kind}|${o.props?.variant}|${o.props?.snowy}|${o.props?.wagon}|${o.props?.role}`;
      let p = this.parked.get(o.id);
      if (!p || p.key !== key) {
        this.dropParked(p);
        p = { key, kind, full: null, far: null, pose: { x, z, a, y: pose.h ?? this.G.heightAt(x, z) } };
        this.parked.set(o.id, p);
      }
      // moved (knocked, by me or someone): slid there, not rebuilt
      const P = p.pose;
      const dA = Math.atan2(Math.sin(a - P.a), Math.cos(a - P.a));
      if (Math.hypot(x - P.x, z - P.z) > 0.002 || Math.abs(dA) > 0.001) {
        const k = sh || Math.hypot(x - P.x, z - P.z) > 8 ? 1 : Math.min(1, dt * 5);
        P.x += (x - P.x) * k;
        P.z += (z - P.z) * k;
        P.a += dA * k;
        P.y = sh ? this.G.heightAt(P.x, P.z) : (pose.h ?? this.G.heightAt(P.x, P.z));
        if (p.full) placeModel(p.full.root, P.x, P.y, P.z, P.a);
        if (p.far) placeModel(p.far, P.x, P.y + 0.03, P.z, P.a);
      }
      const y = P.y;
      // near: the whole car; far: one mesh
      const camD = camAt
        ? Math.hypot(P.x - (camAt.x - this.root.position.x), P.z - (camAt.z - this.root.position.z))
        : Math.hypot(P.x - mx, P.z - mz);
      const near = camD < FAR || OWN_SHAPE.has(kind);
      if (near && !p.full) {
        const colour = colourOf(o);
        p.full = buildSedan({
          colour,
          snowy: o.props?.snowy ? 0.7 : 0.15,
          kind,
          role: typeof o.props?.role === "string" ? o.props.role : undefined,
          plate: typeof o.props?.plate === "string" ? o.props.plate : undefined,
        });
        p.full.setEnv(this.env);
        placeModel(p.full.root, P.x, y, P.z, P.a);
        castAll(p.full.root);
        p.full.root.userData.still = true; // (parked: the 3D view may leave it out when hidden, tp/below-cull.ts)
        // (nothing on a parked car moves — a driven car gets a model of its own —: the 3D view
        // draws it as a still model, fewer draws; done once the 3D view is there)
        p.full.root.userData.stillDue = true;
        this.root.add(p.full.root);
      }
      if (!near && !p.far) {
        const colour = colourOf(o);
        const { solid, glass } = carGeometry(!!o.props?.wagon || kind !== "sedan", colour, !!o.props?.snowy);
        const g = new Group();
        g.add(new Mesh(solid, this.farMat(0xffffff)), new Mesh(glass, this.farMat(0x9aa6ae)));
        placeModel(g, P.x, y + 0.03, P.z, P.a);
        castAll(g);
        g.userData.still = true;
        p.far = g as unknown as Mesh;
        this.root.add(g);
      }
      if (p.full?.root.userData.stillDue && tp) {
        p.full.root.userData.stillDue = false;
        tp.stillModel(p.full.root);
      }
      if (p.full) {
        p.full.root.visible = near;
        if (near) {
          p.full.setWear(Number(o.props?.grime) || 0, dmgOf(o.props?.dmg));
          if (o.props?.role === "taxi") p.full.setBeacon(this.host.night() > 0.2, this.time);
        }
      }
      if (p.far) p.far.visible = !near;
    }
    for (const [id, p] of this.parked)
      if (!seen.has(id)) {
        this.dropParked(p);
        this.parked.delete(id);
      }
    // the lot's empty bays snowed in (only where no car stands)
    if (!this.baySnow.mesh.parent) this.root.add(this.baySnow.mesh);
    this.baySnow.set([...this.parked.values()].map((p) => p.pose));
  }
  private baySnow = new BaySnow();
  private farMat(hex: number): Material {
    let m = this.farMats.get(hex);
    if (!m) {
      m = new MeshLambertMaterial({ vertexColors: true, color: hex });
      this.farMats.set(hex, m);
    }
    return m;
  }
  /** A parked car taking a knock from mine: its slide starts (or speeds up) from where it is. */
  private shoveParked(id: string, jx: number, jz: number, px: number, pz: number) {
    let sh = this.shoves.get(id);
    if (!sh) {
      const p = this.parked.get(id);
      if (!p) return;
      sh = {
        x: p.pose.x,
        z: p.pose.z,
        a: p.pose.a,
        vx: 0,
        vz: 0,
        w: 0,
        spec: SPECS[p.kind],
        from: { x: p.pose.x, z: p.pose.z },
        sent: false,
        sentAt: 0,
      };
      this.shoves.set(id, sh);
    }
    const m = sh.spec.mass;
    const b = boxOf(sh.spec);
    const iy = (m * ((2 * b.hx) ** 2 + (2 * b.hz) ** 2)) / 12;
    sh.vx += jx / m;
    sh.vz += jz / m;
    sh.w += ((pz - sh.z) * jx - (px - sh.x) * jz) / iy;
    sh.sent = false;
  }
  /** The knocked cars sliding on their locked wheels; stopped, where they ended up goes to the server. */
  private stepShoves(dt: number, room: NonNullable<ReturnType<CarsHost["room"]>>) {
    const near: Solid[] = [];
    for (const [id, sh] of this.shoves) {
      if (sh.sent) continue;
      const sp = Math.hypot(sh.vx, sh.vz);
      const b = boxOf(sh.spec);
      if (sp > 0.03 || Math.abs(sh.w) > 0.02) {
        // its tyres, braked (in park, the handbrake on), scrubbing it to a stop
        const mu = GRIP[this.world.ground(sh.x, sh.z)].mu * 0.75 * 9.81;
        const k = sp > 1e-6 ? Math.max(0, sp - mu * dt) / sp : 0;
        const prev = { x: sh.x, z: sh.z, a: sh.a };
        sh.x += sh.vx * dt;
        sh.z += sh.vz * dt;
        sh.a -= sh.w * dt;
        sh.vx *= k;
        sh.vz *= k;
        sh.w = Math.sign(sh.w) * Math.max(0, Math.abs(sh.w) - (mu / b.hx) * dt);
        // into something (a wall, a tree, another parked car): it stops there
        near.length = 0;
        const cx = sh.x + Math.cos(sh.a) * b.off;
        const cz = sh.z + Math.sin(sh.a) * b.off;
        this.world.solids(cx, cz, b.hx + 1, near);
        const blocked =
          Math.hypot(sh.x - sh.from.x, sh.z - sh.from.z) > SHOVE_MAX ||
          near.some((o) => o.id !== id && overlaps(cx, cz, b.hx, b.hz, sh.a, o));
        if (blocked) {
          Object.assign(sh, prev);
          sh.vx = sh.vz = sh.w = 0;
        }
        continue;
      }
      sh.vx = sh.vz = sh.w = 0;
      sh.sent = true;
      sh.sentAt = this.nowMs;
      room.send("car:shove", { id, x: sh.x, z: sh.z, a: sh.a });
    }
  }
  private dropParked(p: ParkedView | undefined) {
    if (!p) return;
    if (p.full) {
      this.root.remove(p.full.root);
      p.full.dispose();
    }
    if (p.far) {
      this.root.remove(p.far);
      p.far.traverse((m) => (m as Mesh).geometry?.dispose());
    }
  }

  // ── the cars being driven (mine and everyone else's) ───────────────────────
  private syncLive(room: RoomLike, dt: number, now: number) {
    const seen = new Set<string>();
    this.seated.clear();
    const mySid = room.sessionId;
    let mine: { vid: string; seat: number } | null = null;
    room.state.vehicles.forEach((v: VehWire, id: string) => {
      if (!isCarKind(v.kind)) return;
      seen.add(id);
      let l = this.live.get(id);
      if (!l) {
        const model = buildSedan({
          colour: CAR_COLOURS[v.colour % CAR_COLOURS.length] ?? 0x6b2430,
          snowy: 0.1,
          kind: v.kind,
          role: v.role || undefined,
          plate: v.plate || undefined,
        });
        model.setEnv(this.env);
        castAll(model.root);
        this.root.add(model.root);
        l = {
          id,
          kind: v.kind,
          model,
          buf: [],
          seq: -1,
          spin: 0,
          people: new Map(),
          sound: null,
          pose: { p: new Vector3(v.x, v.y, v.z), q: new Quaternion(v.qx, v.qy, v.qz, v.qw), v: new Vector3() },
          doors: [0, 0, 0, 0],
          doorUntil: [0, 0, 0, 0],
          prevSeats: String(v.seats ?? "|||").split("|"),
          role: v.role ?? "",
          fast: 0,
          exhaustAt: 0,
        };
        this.live.set(id, l);
      }
      // a new state from the server: a sample
      if (v.seq !== l.seq || !l.buf.length) {
        l.seq = v.seq;
        l.buf.push({
          t: now,
          p: new Vector3(v.x, v.y, v.z),
          q: new Quaternion(v.qx, v.qy, v.qz, v.qw).normalize(),
          v: new Vector3(v.vx, v.vy, v.vz),
          steer: v.steer,
          rpm: v.rpm,
          gear: v.gear,
          fl: v.fl,
          slip: v.slip,
        });
        if (l.buf.length > 12) l.buf.shift();
      }
      // its wear (mine: as my sim counts it — wearOn)
      if (this.mine?.vid !== id || this.mine.seat !== 0) l.model.setWear(v.grime ?? 0, dmgOf(v.dmg));
      const seats = String(v.seats ?? "|||").split("|");
      // someone in or out: their door swings open a moment (and shuts with a clunk)
      seats.forEach((sid, i) => {
        if ((sid || "") !== (l.prevSeats[i] || "")) {
          l.doorUntil[i] = this.time + 1.1;
          this.clunk(l, true);
        }
      });
      l.prevSeats = seats;
      seats.forEach((sid, i) => {
        if (!sid) return;
        this.seated.add(sid);
        if (sid === mySid) mine = { vid: id, seat: i };
      });
      this.seatPeople(room, l, seats);
    });
    for (const [id, l] of this.live)
      if (!seen.has(id)) {
        this.root.remove(l.model.root);
        l.model.dispose();
        l.sound?.dispose();
        for (const p of l.people.values()) p.m.root.removeFromParent();
        this.live.delete(id);
      }
    this.become(mine);
    // pose everyone else's from their samples
    for (const [id, l] of this.live) {
      if (this.mine?.vid === id && this.mine.sim) continue;
      this.poseRemote(l, now, dt);
    }
  }

  /** The people in a car's seats: their models, sitting. */
  private seatPeople(room: RoomLike, l: LiveView, seats: string[]) {
    const C = this.host.chars();
    if (!C || !this.factory) return;
    const keep = new Set<string>();
    seats.forEach((sid, i) => {
      if (!sid) return;
      const p = room.state.players.get(sid);
      if (!p) return;
      // (me, in my own eyes: just my arms — my head would be in the way)
      const cockpit = sid === room.sessionId && this.cam.mode === "cockpit";
      const key = `${sid}|${i}|${p.avatar}|${cockpit ? "arms" : "all"}`;
      keep.add(sid);
      let e = l.people.get(sid);
      if (!e || e.key !== key) {
        e?.m.root.removeFromParent();
        const m = new C.PersonModel(
          this.factory as InstanceType<typeof C.CharFactory>,
          parseAvatar(p.avatar),
          0,
          undefined,
          cockpit ? "arms" : "all",
        );
        m.root.position.set(l.model.seats[i].hip.x, 0, l.model.seats[i].hip.z);
        m.root.rotation.y = -Math.PI / 2;
        m.root.scale.setScalar(0.92);
        l.model.body.add(m.root);
        // (sliding in only as they get in — its door just opened —, not a model remade or a car
        // first seen with them in it)
        const getting = (!e || e.seat !== i) && this.time < l.doorUntil[i];
        e = { m, seat: i, key, at: getting ? this.time : -9 };
        l.people.set(sid, e);
      }
    });
    for (const [sid, e] of l.people)
      if (!keep.has(sid)) {
        e.m.root.removeFromParent();
        l.people.delete(sid);
      }
    // posed: sitting, the driver's hands on the wheel
    const C2 = C;
    for (const e of l.people.values()) {
      // getting in: from outside the open door, ducking in, onto the seat
      const seatAt = l.model.seats[e.seat].hip;
      const k = Math.min(1, (this.time - e.at) / ENTER_S);
      const out = 1 - k * k * (3 - 2 * k);
      e.m.root.position.set(seatAt.x, -0.12 * Math.sin(Math.PI * k), seatAt.z + Math.sign(seatAt.z) * 0.85 * out);
      if (!e.m.update()) continue;
      const seat = l.model.seats[e.seat];
      e.m.setPose(C2.carPose(e.seat === 0), [0, e.m.sitDrop((seat.hip.y + 0.02) / 0.92), 0]);
      if (e.seat === 0) {
        l.model.root.updateMatrixWorld(true);
        for (const [side, phi] of [
          ["L", -1.0],
          ["R", 1.0],
        ] as const) {
          l.model.rim(phi, v3);
          l.model.body.localToWorld(v3);
          e.m.reachTo(side, v3, 1, [-0.75, -1, -0.35]);
        }
      }
    }
  }

  /** Someone else's car: where it was 110 ms ago (between two of its states), its wheels, lamps, sound. */
  private poseRemote(l: LiveView, now: number, dt: number) {
    const at = now - RENDER_BEHIND;
    const b = l.buf;
    if (!b.length) return;
    let s0 = b[0];
    let s1 = b[b.length - 1];
    for (let i = 0; i < b.length - 1; i++)
      if (b[i].t <= at && b[i + 1].t >= at) {
        s0 = b[i];
        s1 = b[i + 1];
        break;
      }
    const p = l.pose;
    if (at >= s1.t) {
      // past the newest: on along its velocity a little way
      const ex = Math.min(0.25, (at - s1.t) / 1000);
      p.p.copy(s1.p).addScaledVector(s1.v, ex);
      p.q.copy(s1.q);
      p.v.copy(s1.v);
    } else if (at <= s0.t || s1 === s0) {
      p.p.copy(s0.p);
      p.q.copy(s0.q);
      p.v.copy(s0.v);
    } else {
      // a Hermite curve through both, with their velocities
      const T = (s1.t - s0.t) / 1000;
      const u = (at - s0.t) / (s1.t - s0.t);
      const h00 = 2 * u ** 3 - 3 * u ** 2 + 1;
      const h10 = u ** 3 - 2 * u ** 2 + u;
      const h01 = -2 * u ** 3 + 3 * u ** 2;
      const h11 = u ** 3 - u ** 2;
      p.p.set(
        h00 * s0.p.x + h10 * T * s0.v.x + h01 * s1.p.x + h11 * T * s1.v.x,
        h00 * s0.p.y + h10 * T * s0.v.y + h01 * s1.p.y + h11 * T * s1.v.y,
        h00 * s0.p.z + h10 * T * s0.v.z + h01 * s1.p.z + h11 * T * s1.v.z,
      );
      p.q.slerpQuaternions(s0.q, s1.q, u);
      p.v.lerpVectors(s0.v, s1.v, u);
    }
    const m = l.model;
    const spec = SPECS[l.kind];
    // the root: the CoG back to the model's origin
    const origin = v3.set(m.dims.axleF + spec.front - m.dims.L / 2, -spec.cog, 0).applyQuaternion(p.q);
    m.root.position.copy(p.p).add(origin);
    m.root.quaternion.copy(p.q).multiply(FLIP);
    // wheels: rolling at its speed, the fronts steered
    const fwd = v3.set(1, 0, 0).applyQuaternion(p.q);
    const sp = p.v.dot(fwd);
    l.spin += (sp / spec.wheel.r) * dt;
    const steer = s1.steer;
    for (const w of m.wheels) {
      w.spin.rotation.z = l.spin * (w.turnK ?? 1);
      if (w.front) w.steer.rotation.y = -steer;
    }
    m.steering.rotation.z = -steer * spec.steer.ratio;
    // its lamps from its switches
    const fl = s1.fl;
    const blink = this.time % 0.9 < 0.45;
    m.setLights({
      beams: fl & CAR_FLAGS.high ? "high" : fl & CAR_FLAGS.low ? "low" : "off",
      tail: !!(fl & (CAR_FLAGS.low | CAR_FLAGS.high)),
      brake: fl & CAR_FLAGS.brake ? 1 : 0,
      reverse: !!(fl & CAR_FLAGS.reverse),
      ind: blink ? (fl & CAR_FLAGS.left ? -1 : fl & CAR_FLAGS.right ? 1 : 0) : 0,
      hazard: blink && !!(fl & CAR_FLAGS.hazard),
      dash: fl & CAR_FLAGS.engine ? 0.8 : 0,
      dome: false,
    });
    this.beaconOf(l, !!(fl & CAR_FLAGS.siren));
    this.hearRemote(l, s1, sp, dt);
  }

  /** Someone else's car heard: its engine and tyres from what it sends, by distance. */
  private hearRemote(l: LiveView, s: Sample, sp: number, dt: number) {
    const me = this.host.me();
    const d = Math.hypot(l.pose.p.x - (me.x + this.host.ox()), l.pose.p.z - (me.y + this.host.oy()));
    const on = d < 70 && !!(s.fl & CAR_FLAGS.engine) && mixer.ctx?.state === "running";
    if (on && !l.sound && mixer.ctx) l.sound = soundOf(mixer.ctx, l.kind);
    if (!on && l.sound) {
      l.sound.dispose();
      l.sound = null;
    }
    if (!l.sound) return;
    const g = this.groundUnder(l.pose.p.x, l.pose.p.z);
    const fake = {
      rpm: s.rpm,
      thr: Math.min(1, Math.max(0, (s.rpm - 1200) / 4000)),
      clutch: 1,
      spec: SPECS[l.kind],
      wheels: [0, 1, 2, 3].map(() => ({ contact: true, ground: g, used: s.slip > 1 ? 1.3 : 0.4, slip: s.slip })),
      hit: null,
      v: { x: l.pose.v.x, y: l.pose.v.y, z: l.pose.v.z },
      q: { x: l.pose.q.x, y: l.pose.q.y, z: l.pose.q.z, w: l.pose.q.w },
      shiftT: 0,
      gear: s.gear,
    } as unknown as CarState;
    const tp = this.host.tp();
    let pan = 0;
    if (tp) {
      // (left or right of where the camera looks)
      const c = tp.camera;
      const right = v3.set(1, 0, 0).applyQuaternion(c.quaternion);
      const to = new Vector3(l.pose.p.x, l.pose.p.y, l.pose.p.z)
        .applyMatrix4(this.root.matrixWorld)
        .sub(c.position)
        .normalize();
      pan = Math.max(-1, Math.min(1, right.dot(to)));
    }
    l.sound.update(fake, { inside: false, gain: Math.max(0, 1 - d / 70) ** 1.5, pan }, dt, false, false);
    l.sound.horn(!!(s.fl & CAR_FLAGS.horn) && d < 70);
    l.sound.siren(!!(s.fl & CAR_FLAGS.siren) && d < 70);
    void sp;
  }

  // ── mine ───────────────────────────────────────────────────────────────────
  private become(now: { vid: string; seat: number } | null) {
    const was = this.mine;
    if (was && (!now || now.vid !== was.vid || now.seat !== was.seat)) {
      // out (or moved seat): my sim and sound go
      was.sound?.dispose();
      this.mine = null;
      this.camNow = null;
      this.input.clear();
      this.hideHud();
    }
    if (now && !this.mine) {
      const l = this.live.get(now.vid);
      if (!l) return;
      this.wanted = "";
      this.mine = {
        vid: now.vid,
        seat: now.seat,
        sim: null,
        rig: null,
        acc: 0,
        seq: 0,
        sentAt: 0,
        sound: null,
        started: false,
        grime: 0,
        dmg: [0, 0, 0, 0],
        wearSent: "",
        wearAt: 0,
        hitAt: -1,
        dry: false,
      };
      if (now.seat === 0) {
        const room = this.host.room();
        const v = room?.state.vehicles.get(now.vid) as VehWire;
        const spec = SPECS[isCarKind(v.kind) ? v.kind : "sedan"];
        const sim = createCar(spec, v.x, v.y - spec.cog, v.z, headingFromQ(new Quaternion(v.qx, v.qy, v.qz, v.qw)));
        // (its tank and its wear: as it was left)
        sim.fuel = Math.max(0, Math.min(1, v.fuel ?? 0.7)) * spec.fuel.litres;
        this.mine.grime = v.grime ?? 0;
        this.mine.dmg = dmgOf(v.dmg);
        this.mine.wearSent = `${this.mine.grime}|${this.mine.dmg}`;
        // (the car I last drove: on the minimap after)
        const obj = v.obj ?? "";
        try {
          if (obj) localStorage.setItem(MY_CAR, obj);
        } catch {}
        // (fresh from parked: put down on its wheels; from someone else's driving: as it was)
        if (Math.hypot(v.vx, v.vz) < 0.2) settle(sim, this.world);
        else {
          sim.p.y = v.y;
          sim.q = { x: v.qx, y: v.qy, z: v.qz, w: v.qw };
          sim.v = { x: v.vx, y: v.vy, z: v.vz };
        }
        sim.temp = 0.1 + 0.3 * (1 - this.host.night());
        this.mine.sim = sim;
        this.mine.rig = new CarRig(l.model, sim);
        this.beams = this.host.night() > 0.4 && !sim.spec.pushed ? "low" : "off";
        this.wipers = this.host.storm() > 0.4 ? 2 : 0;
      }
      this.cam.mode = "chase";
      this.enteredAt = this.time;
      this.siren = false;
      this.showHud();
    }
  }

  private drive(room: RoomLike, dt: number, now: number) {
    const m = this.mine;
    if (!m) return;
    const l = this.live.get(m.vid);
    if (!l) return;
    const pad = activePad();
    const { c, switches } = this.input.read(pad);
    for (const sw of switches) this.switch(sw);
    // looking round: the right stick (back to ahead when let go)
    const rx = pad?.axes[2] ?? 0;
    const ry = pad?.axes[3] ?? 0;
    const look = this.cam.look;
    if (Math.abs(rx) > 0.15 || Math.abs(ry) > 0.15) {
      look.yaw = Math.max(-2.2, Math.min(2.2, look.yaw + rx * dt * 2.4));
      look.pitch = Math.max(-0.5, Math.min(0.4, look.pitch - ry * dt * 1.4));
    } else if (this.mouseHeld || this.time - this.mouseAt < 1.5) {
      // (turned with the mouse: held where it was left a moment, then back behind the car)
    } else {
      look.yaw *= 1 - Math.min(1, dt * 2.5);
      look.pitch *= 1 - Math.min(1, dt * 2.5);
    }
    if (m.sim && m.rig) {
      const s = m.sim;
      // its tank, filled at a pump (the server's count, while it fills)
      const vw = room.state.vehicles.get(m.vid) as VehWire | undefined;
      const tank = s.spec.fuel.litres;
      if (vw && (vw.filling || (vw.fuel ?? 0) * tank > s.fuel + 0.5)) s.fuel = (vw.fuel ?? 0) * tank;
      // the engine: on as I sit down (the starter turns it over first); dry, it won't; filled, it
      // starts again
      if (!m.started || (m.dry && s.fuel > 0.3 && !vw?.filling)) {
        m.started = true;
        m.dry = false;
        setEngine(s, true);
        if (mixer.ctx && s.rpm > 0) {
          m.sound ??= soundOf(mixer.ctx, l.kind);
          m.sound?.start(1 - s.temp / 0.55);
        }
      }
      if (s.fuel <= 0 && !m.dry) {
        m.dry = true;
        this.host.toast(t("carDry"));
      }
      // (stuck: pressing on and going nowhere — the hint to pull it out)
      const going = Math.hypot(s.v.x, s.v.z);
      // (not the handbrake held on purpose)
      const pressing = (c.up > 0.5 || c.down > 0.5) && c.hand < 0.5;
      this.stuckFor = pressing && going < 0.6 ? this.stuckFor + dt : going > 1.5 ? 0 : this.stuckFor;
      m.acc = Math.min(m.acc + dt, 0.25);
      while (m.acc >= STEP) {
        stepCar(s, c, this.world, this.helps);
        m.rig.stepped();
        m.acc -= STEP;
        if (s.hit) this.hitBy(room, s);
      }
      this.wearOn(room, s, l, dt, now);
      const rig = m.rig;
      rig.state.beams = this.beams;
      rig.state.ind = this.ind;
      rig.state.hazard = this.hazard;
      rig.state.wipers = this.wipers;
      rig.state.dash = this.host.night() > 0.4 ? 1 : 0.45;
      rig.state.clock = new Date().toTimeString().slice(0, 5);
      rig.state.outside = Math.round(-6 - 8 * this.host.night() - 6 * this.host.storm());
      rig.pose(m.acc / STEP, dt, this.time);
      l.pose.p.set(s.p.x, s.p.y, s.p.z);
      l.pose.q.set(s.q.x, s.q.y, s.q.z, s.q.w);
      l.pose.v.set(s.v.x, s.v.y, s.v.z);
      // to the server, twenty times a second
      if (now - m.sentAt >= 1000 / CAR_HZ) {
        m.sentAt = now;
        room.send("car:state", toWire(s, ++m.seq, this.flags(s)));
      }
      // sound, the pad's rumble
      const rough = s.wheels.reduce((a, w) => a + GRIP[w.ground].rough, 0) / 4;
      if (s.hit) this.cam.knock(Math.min(1, s.hit.j / 8000));
      m.sound?.update(
        s,
        { inside: this.cam.mode === "cockpit", gain: 1, pan: 0 },
        dt,
        this.ind !== 0 && this.time % 0.9 < 0.45,
        true,
      );
      m.sound?.horn(this.input.horn);
      m.sound?.siren(this.siren);
      this.beaconOf(l, this.siren);
      const slip = s.wheels.reduce((a, w) => Math.max(a, w.slip), 0);
      this.input.rumble(
        pad,
        (s.hit ? Math.min(1, s.hit.j / 6000) : 0) + rough * 4 * Math.min(1, readout(s).speed / 15),
        Math.min(1, slip / 8) * 0.5,
      );
      // lights for real at night
      this.headlamps(l, this.beams);
    }
    // the camera: the car's (a passenger: the chase camera, or their own seat)
    const tp = this.host.tp();
    if (tp) {
      const cam = this.camScratch;
      cam.fov = tp.camera.fov;
      cam.aspect = tp.camera.aspect;
      // (the rig's model sits in `root`: its world matrix is the scene's)
      // (a passenger's: no sim of their own — the car's spec still sizes the chase camera)
      const sim =
        m.sim ??
        ({ v: { x: l.pose.v.x, y: l.pose.v.y, z: l.pose.v.z }, str: 0, spec: SPECS[l.kind] } as unknown as CarState);
      const rigFor = m.rig ?? this.passengerRig(l);
      const rough = m.sim ? m.sim.wheels.reduce((a, w) => a + GRIP[w.ground].rough, 0) * 2.5 : 0.02;
      this.cam.update(cam, rigFor, sim, dt, this.input.lookBack, rough);
      if (m.seat !== 0 && this.cam.mode === "cockpit") {
        // a passenger's own eyes: their seat's, not the driver's
        const seat = l.model.seats[m.seat];
        v3.set(seat.hip.x + 0.06, 1.3, seat.hip.z).applyMatrix4(l.model.root.matrixWorld);
        cam.position.copy(v3);
      }
      const look = new Vector3(0, 0, -1).applyQuaternion(cam.quaternion).multiplyScalar(10).add(cam.position);
      this.camNow = {
        eye: [cam.position.x, cam.position.z, cam.position.y],
        look: [look.x, look.z, look.y],
        fov: cam.fov,
        showMe: false,
        // (getting in: eased to it from where the camera was; then held to it)
        snap: this.time - this.enteredAt > ENTER_S + 0.5,
      };
    }
  }
  private camScratch = new PerspectiveCamera(62, 1.6, 0.05, 3000);
  private passengerRigs = new Map<string, CarRig>();
  private passengerRig(l: LiveView): CarRig {
    let r = this.passengerRigs.get(l.id);
    if (!r) {
      // (a rig only for the camera's sake: the model is posed from the samples)
      const fake = createCar(SPECS[l.kind], l.pose.p.x, l.pose.p.y, l.pose.p.z, 0);
      r = new CarRig(l.model, fake);
      this.passengerRigs.set(l.id, r);
    }
    return r;
  }

  private switch(sw: Switch) {
    if (sw === "lights") {
      if (!this.mine?.sim?.spec.pushed)
        this.beams = this.beams === "off" ? "low" : this.beams === "low" ? "high" : "off";
    } else if (sw === "left") this.ind = this.ind === -1 ? 0 : -1;
    else if (sw === "right") this.ind = this.ind === 1 ? 0 : 1;
    else if (sw === "hazard") this.hazard = !this.hazard;
    else if (sw === "siren") {
      const l = this.mine ? this.live.get(this.mine.vid) : null;
      if (l?.role === "police" && this.mine?.seat === 0) this.siren = !this.siren;
    } else if (sw === "wipers") this.wipers = ((this.wipers + 1) % 4) as 0 | 1 | 2 | 3;
    else if (sw === "camera") this.cam.cycle();
    else if (sw === "exit") this.act("car:leave", this.mine?.vid ?? "");
    else if (sw === "radio") {
      // (a passenger's: the driver's client keeps the station — the server tells it)
      if (this.mine && this.mine.seat !== 0) this.host.room()?.send("car:radio", {});
      else this.station = (this.station + 1) % 4;
    } else if (sw === "unstick" && this.mine?.seat === 0) {
      this.host.room()?.send("car:unstick", {});
      this.stuckFor = 0;
    } else if (sw === "fill" && this.mine?.seat === 0) {
      const v = this.host.room()?.state.vehicles.get(this.mine.vid) as VehWire | undefined;
      this.host.room()?.send("car:fill", { on: !v?.filling });
    } else if (sw === "diff" && this.mine?.sim) this.mine.sim.lock = !this.mine.sim.lock;
    else if (sw === "range" && this.mine?.sim) this.mine.sim.low = !this.mine.sim.low;
  }

  private flags(s: CarState): number {
    let f = 0;
    if (this.beams === "low") f |= CAR_FLAGS.low;
    if (this.beams === "high") f |= CAR_FLAGS.low | CAR_FLAGS.high;
    if (s.brk > 0.05) f |= CAR_FLAGS.brake;
    if (s.gear === -1) f |= CAR_FLAGS.reverse;
    if (this.ind === -1) f |= CAR_FLAGS.left;
    if (this.ind === 1) f |= CAR_FLAGS.right;
    if (this.hazard) f |= CAR_FLAGS.hazard;
    if (this.input.horn) f |= CAR_FLAGS.horn;
    if (this.wipers & 1) f |= CAR_FLAGS.wipers1;
    if (this.wipers & 2) f |= CAR_FLAGS.wipers2;
    if (s.rpm > 50) f |= CAR_FLAGS.engine;
    if (s.hb > 0.5) f |= CAR_FLAGS.hand;
    if (this.siren) f |= CAR_FLAGS.siren;
    f |= (this.station & 3) << 14;
    return f;
  }

  /** A car's role light: the police car's bar flashing with its siren; the taxi's sign lit at
   *  night while it's free (no one behind the driver). */
  private beaconOf(l: LiveView, siren: boolean) {
    if (l.role === "police") l.model.setBeacon(siren, this.time);
    else if (l.kind === "ploughtruck" || l.kind === "snowcat") l.model.setBeacon(!!l.prevSeats[0], this.time);
    else if (l.role === "taxi")
      l.model.setBeacon(l.prevSeats.slice(1).every((x) => !x) && this.host.night() > 0.2, this.time);
  }

  /** My car hit something this step: someone (at speed: knocked down), or a dent where it hit. */
  private hitBy(room: RoomLike, s: CarState) {
    const h = s.hit;
    const m = this.mine;
    if (!h || !m) return;
    if (h.what === "person") {
      if (!h.id || (h.v ?? 0) < 2.2 || this.time - (this.knocked.get(h.id) ?? -9) < 4) return;
      this.knocked.set(h.id, this.time);
      room.send("car:knock", { sid: h.id });
      return;
    }
    // (a knock, not a lean or the ground under it: hard enough, and not the same one again)
    if (h.what === "ground" || h.what === "bank" || h.j < 2500 || s.t - m.hitAt < 0.3) return;
    m.hitAt = s.t;
    // where on it: the front, the back, or a side (the sim's x ahead, z to the right)
    const a = headingOf(s.q);
    const b = boxOf(s.spec);
    const dx = h.x - (s.p.x + Math.cos(a) * b.off);
    const dz = h.z - (s.p.z + Math.sin(a) * b.off);
    const u = dx * Math.cos(a) + dz * Math.sin(a);
    const w = -dx * Math.sin(a) + dz * Math.cos(a);
    const i = u > b.hx * 0.55 ? 0 : u < -b.hx * 0.55 ? 1 : w < 0 ? 2 : 3;
    m.dmg[i] = Math.min(1, m.dmg[i] + Math.min(0.35, (h.j - 2500) / 16000));
  }

  /** The dirt the roads put on it as I drive; its wear to the server now and then, and drawn. */
  private wearOn(room: RoomLike, s: CarState, l: LiveView, dt: number, now: number) {
    const m = this.mine;
    if (!m) return;
    const sp = Math.hypot(s.v.x, s.v.z);
    let d = 0;
    for (const w of s.wheels) if (w.contact) d += DIRT[w.ground] ?? 0;
    m.grime = Math.min(1, m.grime + (d / 4) * Math.min(2, sp / 10) * dt);
    const vw = room.state.vehicles.get(m.vid) as VehWire | undefined;
    // (washed at the pump: the server's count)
    if (vw?.filling) m.grime = Math.min(m.grime, vw.grime ?? 0);
    l.model.setWear(m.grime, m.dmg);
    const key = `${Math.round(m.grime * 100)}|${m.dmg.map((x) => Math.round(x * 100))}`;
    if (key !== m.wearSent && now - m.wearAt > 1000 && !vw?.filling) {
      m.wearSent = key;
      m.wearAt = now;
      room.send("car:wear", { grime: m.grime, dmg: m.dmg });
    }
  }

  /** The car I last drove, for the minimap (the ground floor's coords; none while I'm in it). */
  private findMine(room: RoomLike, now: number) {
    if (now - this.myCarAt < 500) return;
    this.myCarAt = now;
    let id = "";
    try {
      id = localStorage.getItem(MY_CAR) ?? "";
    } catch {}
    let at: { x: number; y: number } | null = null;
    if (id && !this.mine) {
      const o = room.state.objects.get(id) as { kind: string; props: string } | undefined;
      if (o?.kind === "car") {
        let driven = false;
        room.state.vehicles.forEach((v: VehWire) => {
          if (v.obj === id) {
            driven = true;
            at = { x: v.x - this.host.ox(), y: v.z - this.host.oy() };
          }
        });
        const def = [...this.host.objects()].find((x) => x.id === id);
        if (!driven && def) {
          const p = parkedPose(def);
          at = { x: p.x, y: p.y };
        }
      }
    }
    const cur = hud.get().myCarAt;
    const a = at as { x: number; y: number } | null;
    if (!a ? cur : !cur || Math.hypot(cur.x - a.x, cur.y - a.y) > 0.5) hud.set({ myCarAt: a });
  }

  /** The server didn't believe my car: back where it has it. */
  private snapped(w: CarWire & { id: string }) {
    const s = this.mine?.sim;
    if (!s || this.mine?.vid !== w.id) return;
    s.p = { x: w.x, y: w.y, z: w.z };
    s.q = { x: w.qx, y: w.qy, z: w.qz, w: w.qw };
    s.v = { x: w.vx, y: w.vy, z: w.vz };
    s.w = { x: 0, y: w.wy, z: 0 };
    // (its tyres no longer holding where they stood, nor dug in: it's somewhere else)
    for (const wh of s.wheels) {
      wh.hold = false;
      wh.dig = 0;
    }
    this.mine?.rig?.snap();
  }

  /** Headlamps as real lights (docs/plan/44-the-night.md, N2): my car's while I drive with them
   *  on, else the nearest other car with its lights on (another's, or the Grounds' own: the
   *  visitor's car, the shuttle, the plough) — the view's tier says how many lamps get them.
   *  Always the same two in the scene, off (dark, parked under the ground) when not wanted: a
   *  light coming or going recompiles every material — a freeze getting in and out of a car at
   *  night. The first casts shadows on High (its map drawn once at the start, as the
   *  flashlight's must be). */
  private beamLights: SpotLight[] = [];
  private beamShadow: boolean | null = null;
  private lampA = new Vector3();
  private lampB = new Vector3();
  private lampFwd = new Vector3();
  private headlamps(l: LiveView | null, beams: "off" | "low" | "high") {
    const q = this.host.quality();
    if (!this.beamLights.length)
      for (let i = 0; i < 2; i++) {
        const s = new Spot("#fff2da", 0, 80, 0.5, 0.55, 1.25);
        s.shadow.mapSize.set(1024, 1024);
        s.position.set(0, -500, 0);
        s.target.position.set(0, -501, 0);
        this.root.add(s, s.target);
        this.beamLights.push(s);
      }
    // (whoever stands in them takes their light: the view's tint)
    const tp = this.host.tp();
    if (tp && tp.carBeams !== this.beamLights) tp.carBeams = this.beamLights;
    const shadow = q === "high";
    if (shadow !== this.beamShadow) {
      // (only when the tier changes: that recompiles anyway)
      this.beamShadow = shadow;
      this.beamLights[0].castShadow = shadow;
      this.beamLights[0].shadow.needsUpdate = true;
    }
    const night = this.host.night() > 0.25;
    const [A, B, F] = [this.lampA, this.lampB, this.lampFwd];
    let lit: "off" | "low" | "high" = "off";
    if (night && l && beams !== "off") {
      const m = l.model;
      m.root.updateMatrixWorld();
      A.copy(m.lamps.head[0]).applyMatrix4(m.root.matrix);
      B.copy(m.lamps.head[1] ?? m.lamps.head[0]).applyMatrix4(m.root.matrix);
      F.set(-1, 0, 0).transformDirection(m.root.matrix);
      lit = beams;
    } else if (night && !l) lit = this.nearestLit(A, B, F);
    const want = lit === "off" ? 0 : q !== "low" ? 2 : 1;
    this.beamLights.forEach((s, i) => {
      s.shadow.autoUpdate = i < want;
      if (i >= want) {
        s.intensity = 0;
        s.position.set(0, -500, 0);
        s.target.position.set(0, -501, 0);
        return;
      }
      // (one light only: from between the two lamps)
      const at = want === 1 ? A.clone().add(B).multiplyScalar(0.5) : i === 0 ? A : B;
      s.intensity = lit === "high" ? 220 : 120;
      s.angle = lit === "high" ? 0.36 : 0.5;
      s.position.copy(at);
      s.target.position.copy(at).addScaledVector(F, 30);
      s.target.position.y -= lit === "high" ? 0.4 : 1.3;
    });
  }
  /** The nearest car with its lamps on, to the camera (within 80 tiles): its two headlamps and
   *  which way they shine, into `a`, `b`, `fwd`. */
  private nearestLit(a: Vector3, b: Vector3, fwd: Vector3): "off" | "low" | "high" {
    const tp = this.host.tp();
    if (!tp) return "off";
    const cam = tp.camera.position;
    let best = 80;
    let lit: "off" | "low" | "high" = "off";
    // (the car I ride in too: as a passenger, its lamps light my way)
    for (const l of this.live.values()) {
      const fl = l.buf[l.buf.length - 1]?.fl ?? 0;
      if (!(fl & (CAR_FLAGS.low | CAR_FLAGS.high))) continue;
      const m = l.model;
      const d = cam.distanceTo(m.root.position);
      if (d >= best) continue;
      best = d;
      m.root.updateMatrixWorld();
      a.copy(m.lamps.head[0]).applyMatrix4(m.root.matrix);
      b.copy(m.lamps.head[1] ?? m.lamps.head[0]).applyMatrix4(m.root.matrix);
      fwd.set(-1, 0, 0).transformDirection(m.root.matrix);
      lit = fl & CAR_FLAGS.high ? "high" : "low";
    }
    for (const v of tp.vehicleLamps()) {
      const d = cam.distanceTo(v.a);
      if (d >= best) continue;
      best = d;
      a.copy(v.a);
      b.copy(v.b);
      fwd.copy(v.fwd);
      lit = "low";
    }
    return lit;
  }

  // ── what a car can hit besides the Grounds ─────────────────────────────────
  private solidsNear(x: number, z: number, r: number, out: Solid[]) {
    const room = this.host.room();
    const near = (sx: number, sz: number, ext: number) => Math.abs(sx - x) < r + ext && Math.abs(sz - z) < r + ext;
    // the bays' name boards: a post, its planks along the bay's head (shared spot.ts)
    for (const p of this.spots.posts)
      if (near(p.x, p.z, 0.6)) out.push({ kind: "box", x: p.x, z: p.z, hx: 0.08, hz: 0.55, what: "post" });
    // the parked cars: each its own size; knocked, they move (I drive them: only I shove them)
    const driving = this.mine?.seat === 0;
    for (const [id, p] of this.parked) {
      const sh = this.shoves.get(id);
      const P = sh ?? p.pose;
      const spec = SPECS[p.kind];
      const b = boxOf(spec);
      const cx = P.x + Math.cos(P.a) * b.off;
      const cz = P.z + Math.sin(P.a) * b.off;
      if (!near(cx, cz, b.hx + 0.5)) continue;
      out.push({
        kind: "box",
        x: cx,
        z: cz,
        hx: b.hx,
        hz: b.hz,
        a: P.a,
        what: "car",
        id,
        ...(driving
          ? {
              m: spec.mass,
              vx: sh?.vx ?? 0,
              vz: sh?.vz ?? 0,
              wy: sh?.w ?? 0,
              shove: (jx: number, jz: number, px: number, pz: number) => this.shoveParked(id, jx, jz, px, pz),
            }
          : {}),
      });
    }
    // the other cars on the move: where they are now (they're drawn a little in the past —
    // on from their newest state along its velocity), as heavy as they are
    for (const [id, l] of this.live) {
      if (this.mine?.vid === id) continue;
      const s1 = l.buf[l.buf.length - 1];
      if (!s1) continue;
      const ahead = Math.max(0, Math.min(0.3, (this.nowMs - s1.t) / 1000));
      const a = headingFromQ(s1.q);
      const spec = SPECS[l.kind];
      const b = boxOf(spec);
      const cx = s1.p.x + s1.v.x * ahead + Math.cos(a) * b.off;
      const cz = s1.p.z + s1.v.z * ahead + Math.sin(a) * b.off;
      if (near(cx, cz, b.hx + 0.5))
        out.push({
          kind: "box",
          x: cx,
          z: cz,
          hx: b.hx,
          hz: b.hz,
          a,
          vx: s1.v.x,
          vz: s1.v.z,
          m: spec.mass,
          what: "car",
          id,
        });
    }
    // the shuttle, the visitor's car
    for (const v of this.host.ai()) {
      if (!v.shown) continue;
      const b = aiBox(v.kind);
      if (near(v.x, v.z, b.hx + 0.5))
        out.push({ kind: "box", x: v.x, z: v.z, hx: b.hx, hz: b.hz, a: v.a, what: "car" });
    }
    // people out on the ground floor (never hurt: soft, the car stops)
    if (room)
      room.state.players.forEach((p: { x: number; y: number; level: number }, sid: string) => {
        if (p.level !== 0 || this.seated.has(sid)) return;
        const px = p.x + this.host.ox();
        const pz = p.y + this.host.oy();
        if (near(px, pz, 0.4)) out.push({ kind: "circle", x: px, z: pz, r: 0.38, soft: true, what: "person", id: sid });
      });
  }
  private groundUnder(x: number, z: number): Ground {
    return this.world.ground(x, z);
  }

  // ── the car's hints and gauges on the screen ───────────────────────────────
  private showHud() {
    const tp = this.host.tp();
    if (!tp || this.hud) return;
    const d = document.createElement("div");
    d.style.cssText =
      "position:absolute;left:50%;bottom:132px;transform:translateX(-50%);pointer-events:none;font:600 12px/1.4 'IBM Plex Mono',monospace;color:#f3e3c3;text-shadow:0 1px 2px #000;display:flex;flex-direction:column;align-items:center;gap:8px;white-space:nowrap";
    // (a line for what to do now — at a pump, filling, stuck, low —; under it the keys, the speed, the tank)
    d.innerHTML = `<span data-note style="font:700 16px/1 'IBM Plex Mono',monospace;color:#ffd08a;background:rgba(20,16,12,.55);padding:6px 12px;border-radius:8px;display:none"></span><div style="display:flex;gap:18px;align-items:flex-end"><span data-hint style="opacity:.8"></span><span data-speed style="font:700 30px/1 'IBM Plex Mono',monospace;color:#ffb24a;text-shadow:0 0 8px rgba(255,178,74,.6)"></span><span data-fuel style="font:700 16px/1 'IBM Plex Mono',monospace;color:#ffb24a"></span></div>`;
    (tp.hostEl ?? document.body).appendChild(d);
    this.hud = d;
    // a phone: the wheel and the pedals on the screen
    if (window.matchMedia?.("(pointer: coarse)").matches && this.mine) {
      this.pads = touchControls(this.input, this.mine.seat === 0);
      (tp.hostEl ?? document.body).appendChild(this.pads);
    }
  }
  private hideHud() {
    this.hud?.remove();
    this.hud = null;
    this.pads?.remove();
    this.pads = null;
    this.input.touch.on = false;
  }
  private pads: HTMLDivElement | null = null;
  private drawHud() {
    const d = this.hud;
    const m = this.mine;
    if (!d || !m) return;
    const hint = d.querySelector("[data-hint]") as HTMLElement;
    const speed = d.querySelector("[data-speed]") as HTMLElement;
    if (hint.dataset.v !== String(m.seat)) {
      hint.dataset.v = String(m.seat);
      hint.textContent = this.pads
        ? ""
        : m.seat !== 0
          ? t("carPassenger")
          : m.sim?.spec.pushed
            ? t("sledHints")
            : t("carHints");
      this.hintAt = this.time;
    }
    // (the keys a while after getting in, then out of the way — gone, not taking the room)
    const op = Math.max(0, Math.min(0.85, 10 - (this.time - this.hintAt)));
    hint.style.opacity = String(op);
    hint.style.display = op > 0 && hint.textContent ? "" : "none";
    // the tank: at a pump (F), filling, low
    const note = d.querySelector("[data-note]") as HTMLElement;
    let say = "";
    if (m.sim) {
      const l = this.live.get(m.vid);
      const v = this.host.room()?.state.vehicles.get(m.vid) as VehWire | undefined;
      const stopped = l ? Math.hypot(l.pose.v.x, l.pose.v.z) < 0.4 : false;
      const full = m.sim.fuel / m.sim.spec.fuel.litres;
      if (m.sim.spec.pushed) say = this.stuckFor > 3 ? t("carStuck") : "";
      else if (v?.filling) say = `${t("carFilling")} ${Math.round((v.fuel ?? 0) * 100)}%`;
      else if (stopped && l && this.atPumpNow(l) && (full < 0.98 || m.grime > 0.05)) say = t("carFill");
      else if (this.stuckFor > 3) say = t("carStuck");
      else if (full < 0.12) say = `${t("carLow")} ${Math.round(full * 100)}%`;
    }
    if (note.textContent !== say) {
      note.textContent = say;
      note.style.display = say ? "" : "none";
    }
    // the speed, the gear, the tank (from the driver's seat they're on the dash)
    const fuel = d.querySelector("[data-fuel]") as HTMLElement;
    if (m.sim && this.cam.mode !== "cockpit") {
      const r = readout(m.sim);
      const gear = r.gear === -1 ? "R" : r.gear === 0 ? "N" : String(r.gear);
      speed.textContent = m.sim.spec.pushed
        ? `${Math.abs(Math.round(r.kmh))} km/h`
        : `${Math.abs(Math.round(r.kmh))} km/h · ${gear}`;
      const full = m.sim.fuel / m.sim.spec.fuel.litres;
      const v = this.host.room()?.state.vehicles.get(m.vid) as VehWire | undefined;
      const pct = Math.round((v?.filling ? (v.fuel ?? full) : full) * 100);
      fuel.textContent = m.sim.spec.pushed ? "" : `⛽ ${pct}%`;
      fuel.style.color = pct < 15 ? "#ff6a4a" : "#ffb24a";
    } else {
      speed.textContent = "";
      fuel.textContent = "";
    }
  }

  /** Is this car (its middle, not its CoG) beside a pump? */
  private atPumpNow(l: LiveView): boolean {
    const b = boxOf(SPECS[l.kind]);
    const a = headingFromQ(l.pose.q);
    return this.G.atPump(l.pose.p.x + Math.cos(a) * b.off, l.pose.p.z + Math.sin(a) * b.off);
  }

  /** The car (and its seat) X would get me into: the nearest within reach, by the door I'm at. */
  private nearest(): { id: string; seat: number; owner: string; d: number } | null {
    const me = this.host.me();
    const bx = me.x + this.host.ox();
    const bz = me.y + this.host.oy();
    let best: { id: string; seat: number; d: number; owner: string } | null = null;
    // (someone's own: whose, and whether its wheel's mine — theirs, or their keys lent me today)
    const uid = this.host.uid();
    const now = Date.now();
    const owned = new Map<string, { owner: string; wheel: boolean }>();
    for (const o of this.host.objects())
      if (o.kind === "car" && o.props?.ownerId && Number(o.props.ownerId) !== uid)
        owned.set(o.id, { owner: String(o.props.owner ?? ""), wheel: mayDrive(o.props, uid, now) });
    const consider = (
      id: string,
      x: number,
      z: number,
      a: number,
      taken: string[],
      kind: CarKind,
      own?: { owner: string; wheel: boolean },
    ) => {
      const dx = bx - x;
      const dz = bz - z;
      const d = Math.hypot(dx, dz);
      if (d > 3.6 || (best && d > best.d)) return;
      // which door: in front of the B-pillar the front seats, behind it the back; left or right
      const u = dx * Math.cos(a) + dz * Math.sin(a);
      const w = -dx * Math.sin(a) + dz * Math.cos(a);
      // (an empty car: the wheel's yours, whichever door)
      const order = !taken[0]
        ? [0, 1, 2, 3]
        : u > -0.8
          ? w < 0
            ? [0, 1, 2, 3]
            : [1, 0, 3, 2]
          : w < 0
            ? [2, 0, 3, 1]
            : [3, 1, 2, 0];
      // (only the seats it has: the snowmobile's one)
      const seats = SEATS_OF[kind].at.length;
      const seat = order.find((s) => s < seats && !taken[s] && (s > 0 || !own || own.wheel));
      if (seat === undefined) return;
      best = { id, seat, d, owner: own ? own.owner : "" };
    };
    for (const o of this.host.objects()) {
      if (o.kind !== "car" || o.props?.driven || (Number(o.props?.level ?? 0) | 0) !== 0) continue;
      // (MOTORS' on show: its prompt is the dealer's; a retired one: going)
      if (o.props?.role === "show" || o.props?.retire) continue;
      const p = this.parked.get(o.id);
      if (p) consider(o.id, p.pose.x, p.pose.z, p.pose.a, [], p.kind, owned.get(o.id));
    }
    const room = this.host.room();
    for (const [id, l] of this.live) {
      if (Math.hypot(l.pose.v.x, l.pose.v.z) > 2) continue;
      const v = room?.state.vehicles.get(id) as VehWire | undefined;
      consider(
        id,
        l.pose.p.x,
        l.pose.p.z,
        headingFromQ(l.pose.q),
        String(v?.seats ?? "|||").split("|"),
        l.kind,
        owned.get(String(v?.obj ?? "")),
      );
    }
    if (this.wanted && performance.now() - this.wantedAt < 1500) return null;
    const b = best as { id: string; seat: number; owner: string; d: number } | null;
    return b ? { id: b.id, seat: b.seat, owner: b.owner, d: b.d } : null;
  }

  dispose() {
    this.baySnow.dispose();
    this.unlistenMouse();
    for (const off of this.offMsg) off();
    for (const p of this.parked.values()) this.dropParked(p);
    for (const l of this.live.values()) {
      l.model.dispose();
      l.sound?.dispose();
    }
    this.mine?.sound?.dispose();
    this.tracks.dispose();
    this.spray.dispose();
    this.patches.dispose();
    this.cabin.dispose();
    this.mirror?.m.dispose();
    this.screen?.s.dispose();
    this.radio.stop();
    this.root.removeFromParent();
    this.env?.dispose();
    this.dropEnvMake();
    this.hideHud();
  }
}

interface VehWire {
  kind: string;
  x: number;
  y: number;
  z: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
  vx: number;
  vy: number;
  vz: number;
  steer: number;
  rpm: number;
  gear: number;
  fl: number;
  slip: number;
  seats: string;
  colour: number;
  seq: number;
  fuel?: number;
  grime?: number;
  dmg?: string;
  filling?: boolean;
  obj?: string;
  role?: string;
  plate?: string;
}

function headingFromQ(q: { x: number; y: number; z: number; w: number }): number {
  return headingOf(q);
}
/** A model's root at a car's middle (Grounds coords), on the ground, its nose along `a`. */
function placeModel(root: TGroup | Mesh, x: number, y: number, z: number, a: number) {
  root.position.set(x, y, z);
  root.rotation.set(0, Math.PI - a, 0);
}
function castAll(o: TGroup | Mesh) {
  o.traverse((m) => {
    if ((m as Mesh).isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
}
function colourOf(o: WorldObjectDef): number {
  if (typeof o.props?.color === "string") return Number.parseInt(String(o.props.color).slice(1), 16);
  // (the taxi's yellow, as its model paints it)
  if (o.props?.role === "taxi") return 0xe2b42a;
  const v = Number.isInteger(o.props?.variant) ? Number(o.props?.variant) : 0;
  return CAR_COLOURS[v % CAR_COLOURS.length];
}
void q1;

/** The car's controls on a phone's screen: a wheel to drag on the left; the pedals and the
 *  handbrake on the right; the switches in a column (the driver's); a passenger's camera, radio
 *  and door. Held values go into the input's `touch`, the buttons as switches. */
function touchControls(input: CarInput, driver: boolean): HTMLDivElement {
  const root = document.createElement("div");
  root.style.cssText = "position:absolute;inset:0;pointer-events:none;user-select:none;-webkit-user-select:none";
  const ink = "font:700 13px/1 'IBM Plex Mono',monospace;color:#f3e3c3;text-shadow:0 1px 2px #000";
  const pad = (css: string, label: string) => {
    const b = document.createElement("div");
    b.style.cssText = `position:absolute;pointer-events:auto;touch-action:none;display:flex;align-items:center;justify-content:center;border-radius:14px;background:rgba(20,16,12,.45);border:1.5px solid rgba(255,178,74,.55);${ink};${css}`;
    b.textContent = label;
    root.appendChild(b);
    return b;
  };
  /** held while a finger's on it */
  const hold = (b: HTMLDivElement, set: (on: boolean) => void) => {
    const down = (e: PointerEvent) => {
      e.preventDefault();
      b.setPointerCapture(e.pointerId);
      b.style.background = "rgba(255,178,74,.35)";
      set(true);
    };
    const up = () => {
      b.style.background = "rgba(20,16,12,.45)";
      set(false);
    };
    b.addEventListener("pointerdown", down);
    b.addEventListener("pointerup", up);
    b.addEventListener("pointercancel", up);
  };
  const tap = (b: HTMLDivElement, sw: Switch) =>
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      input.press(sw);
    });
  const T = input.touch;
  T.on = true;
  // (the switches in a row under the top bar, from the right; the wheel and pedals above the dock)
  const col = (i: number, label: string, sw: Switch) =>
    tap(pad(`right:${16 + i * 54}px;top:72px;width:46px;height:40px`, label), sw);
  if (driver) {
    // the wheel: drag across it (its middle where the finger went down)
    const wheel = pad("left:20px;bottom:84px;width:150px;height:150px;border-radius:50%", "◀  ▶");
    let x0 = 0;
    wheel.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      wheel.setPointerCapture(e.pointerId);
      x0 = e.clientX;
    });
    wheel.addEventListener("pointermove", (e) => {
      if (!wheel.hasPointerCapture(e.pointerId)) return;
      const k = Math.max(-1, Math.min(1, (e.clientX - x0) / 70));
      T.steer = k;
      wheel.style.transform = `rotate(${k * 90}deg)`;
    });
    const let_go = () => {
      T.steer = 0;
      wheel.style.transform = "";
    };
    wheel.addEventListener("pointerup", let_go);
    wheel.addEventListener("pointercancel", let_go);
    hold(pad("right:16px;bottom:84px;width:76px;height:128px", t("carGas")), (on) => {
      T.up = on ? 1 : 0;
    });
    hold(pad("right:102px;bottom:84px;width:76px;height:84px", t("carBrake")), (on) => {
      T.down = on ? 1 : 0;
    });
    hold(pad("right:102px;bottom:176px;width:76px;height:36px", t("carHand")), (on) => {
      T.hand = on ? 1 : 0;
    });
    hold(pad("left:180px;bottom:84px;width:50px;height:50px;border-radius:50%", "📯"), (on) => {
      T.horn = on;
    });
    col(0, "🚪", "exit");
    col(1, "📻", "radio");
    col(2, "🎥", "camera");
    col(3, "⛽", "fill");
    col(4, "💡", "lights");
    col(5, "🪝", "unstick");
    col(6, "🚨", "siren");
  } else {
    col(0, "🚪", "exit");
    col(1, "📻", "radio");
    col(2, "🎥", "camera");
  }
  return root;
}
