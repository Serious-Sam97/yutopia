import { BODY_R, face8, parseAvatar, type WorldObjectDef } from "@yutopia/shared";
import {
  beltOf,
  bodyOf,
  bodyStruck,
  CAR_FLAGS,
  CAR_HZ,
  type CarClaim,
  type CarKind,
  type CarLook,
  type CarSpec,
  type CarState,
  type CarWire,
  type CarWorld,
  CHAIN_OFF_MS,
  CHAIN_ON_MS,
  CHAIN_REACH,
  carAtHome,
  carKindOf,
  chainSpot,
  chainsOf,
  coverAfter,
  createCar,
  type Damage,
  DOOR_GONE,
  damageString,
  doorSlot,
  FLATS,
  faceOf,
  GLASS_BITS,
  GRIP,
  type Ground,
  groundsWorld,
  HELPS,
  type Helps,
  type Hole,
  headingOf,
  headK,
  isCarKind,
  knock,
  levelCar,
  lookFor,
  MEND_MS,
  MEND_REACH,
  type Mend,
  mayDrive,
  mayMend,
  nextMend,
  noDamage,
  PANE_CRACK,
  PANE_GONE,
  PART,
  paneOf,
  parkedPose,
  parseDamage,
  parseHoles,
  ploughCell,
  Ruts,
  readout,
  SEATS_OF,
  type CarAt as ShotCar,
  type Solid,
  SPECS,
  type Stored,
  setEngine,
  settle,
  spareOf,
  steamOf,
  steerPull,
  storeOf,
  toWire,
  unpackWheels,
  variantSpec,
  WRECK,
  wireCar,
} from "@yutopia/shared/car";
import { feel92 } from "@yutopia/shared/car/assist";
import { Drive, defOf } from "@yutopia/shared/car/drive";
import type * as GroundsModule from "@yutopia/shared/grounds";
import type { PulledCar } from "@yutopia/shared/physics";
import type { WorldState } from "@yutopia/state";
import {
  BackSide,
  BoxGeometry,
  Color,
  CubeCamera,
  Euler,
  Group,
  HalfFloatType,
  type Material,
  Matrix4,
  Mesh,
  Object3D,
  PerspectiveCamera,
  PMREMGenerator,
  Quaternion,
  Raycaster,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SpotLight as Spot,
  type SpotLight,
  type Texture,
  type Group as TGroup,
  Vector3,
  WebGLCubeRenderTarget,
  type WebGLRenderTarget,
} from "three";
import { DealerPanel } from "@/components/hud/DealerPanel";
import { extraPanels } from "@/components/hud/panels";
import { gfxNow } from "@/lib/graphics";
import { addStrings, trMaybe } from "@/lib/i18n";
import { prefs, type Quality } from "@/lib/prefs";
import { chars as charsMod } from "../art/chars-load";
import { pets as petsMod } from "../art/pets-load";
import { mixer } from "../audio";
import { litMaterial } from "../look/lit";
import { activePad } from "../pads";
import { Radio } from "../sound";
import { hud, toast } from "../store";
import { CarCamera } from "../tp/car/camera";
import { buildCar, buildFar, carManifest, hullPoints, loadCarManifest, preloadCars } from "../tp/car/glb";
import type { Sedan } from "../tp/car/model";
import { CarRig } from "../tp/car/rig";
import { carFit } from "../tp/car/seatfit";
import type { BrowserPhysics } from "../tp/physics3d";
import type { ThirdPersonView } from "../tp/view";
import { AT, growOf, SHOWN, wx, wxHold, wxNow } from "../tp/wx3d";
import { CarInput, type Switch } from "./controls";
import { swingDoor } from "./door";
import {
  BaySnow,
  CabinLight,
  Debris,
  Fires,
  Mirror,
  RoadPatches,
  Ropes,
  ScreenSnow,
  Shards,
  Slabs,
  Smoke,
  Sparks,
  Spray,
  Tracks,
} from "./fx";
import {
  type ActPose,
  actAt,
  type Doorway,
  ENTER_S,
  EXIT_S,
  newActPose,
  roofGrip,
  seatGrip,
  straddleAt,
} from "./getin";
import { thrown } from "../tp/thrown";
import { CarHud } from "./hud";
import { CarPlayback } from "./playback";
import { type CarExtras, CarSound, distanceGain, HEARD, preloadEngine } from "./sound";
import { doorSlots, slotBuffers, voiceOf } from "./sound-bank";
import { type SpotPrompt, Spots, spotNo } from "./spot";

// MOTORS' panel, with the cars (the world page's panels are full): docs/plan/43-the-spot.md
extraPanels.motors = DealerPanel;
// a car's roof over the ground (m): a flier higher passes over it (world-server cars.ts CAR_H)
const CAR_ROOF = 1.5;
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
    // (plan 94 P10: the HUD's words)
    carH_hudDamage: ["DAMAGE", "DANOS"],
    // (plan 98 phase 26: the plate's words, and the refusals that had none — the toast showed their keys)
    carH_hudKmh: ["KM/H", "KM/H"],
    carH_hudFuel: ["FUEL", "COMBUSTÍVEL"],
    carH_hudEngine: ["ENGINE", "MOTOR"],
    carH_hudAuto: ["AUTO", "AUTO"],
    carH_hudManual: ["MANUAL", "MANUAL"],
    carNo_chains: ["You've no snow chains", "Você não tem correntes de neve"],
    carNo_rope: ["You've no tow rope", "Você não tem corda de reboque"],
    carNo_tied: ["One of them's already tied to another", "Um deles já está amarrado a outro"],
    carH_hudKeysAgain: ["F1 — these keys again", "F1 — estas teclas de novo"],
    carH_kGo: ["go", "acelerar"],
    carH_kBrake: ["brake", "frear"],
    carH_kSteer: ["steer", "virar"],
    carH_kHand: ["handbrake", "freio de mão"],
    carH_kLights: ["lights", "faróis"],
    carH_kHorn: ["horn", "buzina"],
    carH_kWipers: ["wipers", "limpador"],
    carH_kWindow: ["window", "janela"],
    carH_kRadio: ["radio", "rádio"],
    carH_kCamera: ["camera", "câmera"],
    carH_kOut: ["get out", "sair"],
    carH_kGears: ["gear up · down", "marcha acima · abaixo"],
    carH_kDiff: ["diff lock", "bloqueio do diferencial"],
    carH_kRange: ["low range", "reduzida"],
    carH_kSiren: ["siren", "sirene"],
    carH_kLock: ["doors locked · open", "portas trancadas · abertas"],
    carH_kPush: ["push off", "empurrar"],
    carH_kBack: ["back", "para trás"],
    carH_kLean: ["lean", "inclinar"],
    carH_kDrag: ["drag your feet", "frear com os pés"],
    carH_kOff: ["off", "descer"],
    carH_engCold: ["cold", "frio"],
    carH_engWarm: ["warm", "quente"],
    carH_engHot: ["hot", "muito quente"],
    carH_engSteam: ["steaming", "fumegando"],
    carH_engDead: ["dead", "morto"],
    carH_engOff: ["off", "desligado"],
    carH_engBurning: ["on fire", "pegando fogo"],
    carH_chipWindow: ["window down", "janela aberta"],
    carH_chipChains: ["chains", "correntes"],
    carH_chipLocked: ["locked", "trancado"],
    carH_chipFlat: ["flat", "pneu furado"],
    carH_chipSmoke: ["smoking", "soltando fumaça"],
    carH_chipFire: ["on fire", "pegando fogo"],
    carH_chipEngineDead: ["engine dead", "motor morto"],
    carH_wFL: ["front left", "dianteiro esquerdo"],
    carH_wFR: ["front right", "dianteiro direito"],
    carH_wRL: ["rear left", "traseiro esquerdo"],
    carH_wRR: ["rear right", "traseiro direito"],
    carBoot: ["Open the boot", "Abrir o porta-malas"],
    carBootIn: ["In the boot", "No porta-malas"],
    // (plan 93 S6) snow chains
    carChainOn: ["Fit a snow chain", "Pôr corrente de neve"],
    carChainOff: ["Take the snow chain off", "Tirar a corrente de neve"],
    carChaining: ["Fitting the chain", "Pondo a corrente"],
    carUnchaining: ["Taking the chain off", "Tirando a corrente"],
    carChainDone: ["Chain on", "Corrente posta"],
    carChainOffDone: ["Chain off", "Corrente tirada"],
    // (plan 93 S7) mending, the tow rope
    carMend_engine: ["Mend the engine", "Consertar o motor"],
    carMend_lamps: ["Mend the lamps", "Consertar os faróis"],
    carMend_panels: ["Knock the dents out", "Desamassar a lataria"],
    carMend_glass: ["Fit new glass", "Pôr vidros novos"],
    carMend_tyre: ["Change the tyre (the spare)", "Trocar o pneu (o estepe)"],
    carMending_engine: ["Mending the engine", "Consertando o motor"],
    carMending_lamps: ["Mending the lamps", "Consertando os faróis"],
    carMending_panels: ["Knocking the dents out", "Desamassando"],
    carMending_glass: ["Fitting the glass", "Pondo os vidros"],
    carMending_tyre: ["Changing the tyre", "Trocando o pneu"],
    carMended_engine: ["The engine runs again", "O motor funciona de novo"],
    carMended_lamps: ["The lamps work", "Os faróis funcionam"],
    carMended_panels: ["The dents are out", "Lataria desamassada"],
    carMended_glass: ["New glass in", "Vidros novos"],
    carMended_tyre: ["The spare's on", "Estepe trocado"],
    carNeedsWrench: ["needs a wrench", "precisa de uma chave"],
    carNeedsGarage: ["at the garage only", "só na oficina"],
    carNoSpare: ["its spare's used — the garage", "estepe já usado — a oficina"],
    carRopeBack: ["Tie a tow rope to its back", "Amarrar o cabo na traseira"],
    carRopeFront: ["Tie a tow rope to its front", "Amarrar o cabo na frente"],
    carRopeTie2: ["Tie the rope's other end here", "Amarrar a outra ponta aqui"],
    carRopeToFront: [
      "Now its other end: the front of the car to tow",
      "Agora a outra ponta: a frente do carro a rebocar",
    ],
    carRopeToBack: [
      "Now its other end: the back of the car to pull it",
      "Agora a outra ponta: a traseira do carro que vai puxar",
    ],
    carUntow: ["Untie the tow rope", "Desamarrar o cabo"],
    // (plan 93 S9) lock, keys, alarm
    carLockKey: ["L lock", "L trancar"],
    carUnlockKey: ["L unlock", "L destrancar"],
    carLocked: ["locked", "trancado"],
    carNo_locked: ["It's locked", "Está trancado"],
    carAlarm_door: [
      "Your car {plate}: its alarm — someone tried a door",
      "Seu carro {plate}: alarme — tentaram abrir uma porta",
    ],
    carAlarm_boot: [
      "Your car {plate}: its alarm — someone tried the boot",
      "Seu carro {plate}: alarme — tentaram abrir o porta-malas",
    ],
    carAlarm_shot: ["Your car {plate}: its alarm — it's been shot", "Seu carro {plate}: alarme — atiraram nele"],
    carAlarm_knock: ["Your car {plate}: its alarm — it's been hit", "Seu carro {plate}: alarme — bateram nele"],
    carTunedTo: ["Tuned to the car beside you", "Sintonizado no carro ao lado"],
    carRopeNeedsDriver: [
      "It won't come: someone has to be at its wheel",
      "Ele não vem: alguém precisa estar no volante dele",
    ],
    carGlove: ["In the glove box", "No porta-luvas"],
    carShotDead: [
      "The engine's been shot — it won't start; it's towed back to the lot to be mended",
      "O motor foi atingido — não liga; ele é rebocado de volta ao estacionamento para o conserto",
    ],
    carRight: ["On its side? R · put it back on its wheels", "Virou? R · desvirar"],
    carJolt: ["Getting the car ready…", "Preparando o carro…"],
    carStuck: ["Stuck? T · pull it out", "Preso? T · puxar para fora"],
    carNo_soon: ["Wait a moment", "Espere um pouco"],
    carNo_show: ["It's on show: pick yours at the door", "Está em exposição: escolha o seu na porta"],
    carNo_model: ["MOTORS doesn't sell that", "A MOTORS não vende esse"],
    carNo_owned: ["It's {who}'s: get in beside", "É de {who}: entre ao lado"],
    carNo_nocar: ["You've no car: MOTORS on Main Street has them", "Você não tem carro: a MOTORS na Main Street tem"],
    // "Repaint" (docs/plan/92-the-cars.md F13b): held Use by your own, parked at home
    carNo_look: ["MOTORS can't do that one", "A MOTORS não faz esse"],
    carNo_home: [
      "Bring it home first: your bay, or MOTORS' forecourt",
      "Leve-o para casa antes: sua vaga, ou o pátio da MOTORS",
    ],
    carNo_notyours: ["It isn't yours", "Não é seu"],
    carLooked: ["Repainted: everyone sees it now", "Repintado: todos já veem"],
    carRepaintHold: ["hold: repaint", "segure: repintar"],
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
    // pets getting in (docs/plan/51-the-pet.md)
    carPetWait: ["Waiting for {name}…", "Esperando {name}…"],
  },
  "yutopia-car",
);
const t = (k: string) => trMaybe(k) ?? k;

interface RoomLike {
  sessionId: string;
  state: WorldState;
  send(type: string, m: unknown): void;
  onMessage(type: string, cb: (m: never) => void): () => void;
}
export interface CarsHost {
  room(): RoomLike | null;
  /** (plan 93 C) my body walked to a spot (the walker's own way there); whether it's still on its way */
  walk(to: { x: number; y: number }): boolean;
  walking(): boolean;
  /** (plan 93 S6) how many of a stack I carry; my body turned to face `a` (the floor's radians) */
  items(id: string): number;
  face(a: number): void;
  /** (plan 93 S4) the pack opened (the inventory, I's); whether it's open */
  openPack(): void;
  packOpen(): boolean;
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
  /** how much the morning fog calls for lamps, 0 … 1 (view.ts lampFog) */
  lampFog(): number;
  reduced(): boolean;
  quality(): Quality;
  /** the Grounds' own vehicles (the shuttle, the visitor's car), eased */
  ai(): { id: string; kind: string; x: number; z: number; a: number; shown: boolean; v?: number; h?: number }[];
  toast(text: string): void;
  chars(): typeof import("../chars") | null;
  /** the pets' chunk, if it's in (their models: pets in the seats) */
  pets(): Pets | null;
}
type Pets = typeof import("../art/pets");

/** How big a pet is in a seat (as people are drawn a touch smaller there; more so pets — a
 *  capybara would fill the back seat): the stills' SEAT_SCALE (tp/pet-stage.ts). */
const PET_SEAT = 0.72;
// a sample of someone else's car (`t`: when it came; `st`: on its driver's sim clock — playback.ts)
interface Sample {
  t: number;
  st: number;
  /** its wheels' travel from rest (net.ts packWheels) */
  wc?: number;
  p: Vector3;
  q: Quaternion;
  v: Vector3;
  steer: number;
  rpm: number;
  gear: number;
  fl: number;
  slip: number;
  /** (plan 93) the most grip a tyre uses (1: its peak) */
  grip: number;
  /** (plan 98 phase 13) its yaw rate */
  wy?: number;
  /** (plan 98 phase 15) its throttle 0..1 */
  thr?: number;
}
/** (plan 93 D) A hand on the wheel: the rim's point it holds (a mark on the steering wheel, turning with
 *  it), or on its way to a new one (hand over hand: let go, reached back up the rim, gripped again). */
interface Grip {
  a: Object3D;
  moving: boolean;
  t: number;
  from: Vector3;
  to: number;
}
/** (plan 93 S8) The driver's body as it was: the hands, the gear and the indicator last seen (a hand to the
 *  lever on a change, a glance at the mirror as it's put on), the last frame's time. */
interface DriverBody {
  grips: Partial<Record<"L" | "R", Grip>>;
  gear: number;
  leverT: number;
  ind: number;
  glanceT: number;
  glanceTo: number;
  t: number;
  wheel?: number;
}

const hA = new Vector3();
const hB = new Vector3();
const hC = new Vector3();
const hD = new Vector3();
const hE = new Vector3();
const hF = new Vector3();
const hF2 = new Vector3();
const hG = new Vector3();
const hH = new Vector3();
const hI = new Vector3();
const hJ = new Vector3();

interface LiveView {
  id: string;
  /** the snow on it since it last moved (docs/plan/65), 0..1 — the world's when first seen */
  snowK?: number;
  kind: CarKind;
  /** its numbers: its kind's, shaped as its variant's model (shared car/look.ts variantSpec) */
  spec: CarSpec;
  look: CarLook;
  model: Sedan;
  /** its states, played back on its driver's clock (playback.ts) */
  pb: CarPlayback<Sample>;
  seq: number;
  jump: number;
  spin: number;
  // (`at`: when they sat down — they slide in from the open door)
  people: Map<
    string,
    {
      m: InstanceType<typeof import("../chars").PersonModel>;
      seat: number;
      key: string;
      at: number;
      /** (plan 62) got out: when, the model kept a moment to climb out by the door */
      gone?: number;
      /** (plan 93 D, S8) the driver's hands on the rim, the lever, the glance, as last frame */
      drv?: DriverBody;
      /** (plan 93 S5) the arm out on the window's sill (0..1, eased): their window down, at a cruise */
      sill?: number;
      /** (plan 93 S8) eased 0..1: the driver turned round backing up; a hand on the thigh at a stop (and how long
       *  stopped, s); a passenger's hand on the grab handle in a hard turn */
      rev?: number;
      rest?: number;
      still?: number;
      grab?: number;
      /** (plan 93 C) in by the passenger's door of an empty car, across to the wheel after: that seat */
      via?: number;
      /** (plan 93 S2) a gun out: its key, and its model in their hand (null till it's loaded) */
      gun?: {
        key: string;
        held: {
          root: Object3D;
          muzzle(out: Vector3): Vector3;
          line: Vector3;
          aimAt(at: Vector3, f: Vector3, w: number, pole: [number, number, number]): void;
          rest(): void;
          barrel(out: Vector3): Vector3;
          grip(): void;
          drop(): void;
          fore(out: Vector3): Vector3 | null;
        } | null;
      };
      /** (plan 93 C) the door's handle and its inside pull: marks on the door, swung with it */
      handle?: Object3D;
      pull?: Object3D;
      /** (plan 98) the door frame's top at its back: a mark on it */
      top?: Object3D;
      /** (plan 98 phase 7) their belt on; the key's chime last rung (its count) */
      belted?: boolean;
      chimed?: number;
      /** (plan 98) the act's pose as last worked out, and where they stood as it began (the body's frame) */
      act?: ActPose;
      from?: { x: number; z: number; yaw: number };
    }
  >;
  sound: CarSound | null;
  pose: { p: Vector3; q: Quaternion; v: Vector3 };
  /** (docs/plan/92 phase 3) in my Jolt world, pulled to where its driver has it: my car meets it by
   *  their weights, a walker is stopped by it */
  pulled?: PulledCar | null;
  // its doors swinging as people get in and out; how long it's been fast (its roof's snow)
  doors: number[];
  doorUntil: number[];
  /** (plan 93 C) a door held by someone getting in or out: its opening (−1: nobody's — the timer's) */
  doorBy: number[];
  /** (plan 98 phase 16) behind something from me (0..1, eased), what the sight ray last said, when */
  occl?: number;
  occlWant?: number;
  occlAt?: number;
  /** (plan 98 phase 15) its velocity last heard (a crash's change) */
  hv?: Vector3;
  /** (plan 98 phase 7) its engine's flag as last heard (undefined: not heard yet) */
  engOn?: boolean;
  /** (plan 98 phase 6) each door's swing (rad/s); its velocity last frame (what swings them) */
  doorW?: number[];
  /** (plan 98) a door the timer opened: shut by it too */
  doorT?: boolean[];
  accV?: Vector3;
  accB?: Vector3;
  /** (plan 98 phase 13) its driven wheels' turn (rad), spun by their slip too */
  spinD?: number;
  /** (plan 98 phase 11) its weight's spring: the pitch and roll seen, and their speeds */
  wt?: { p: number; pv: number; r: number; rv: number };
  /** (plan 93 C) parked, kept a moment: someone's still climbing out of it */
  linger?: boolean;
  /** (plan 93 S1) its holes as last drawn */
  holes?: string;
  /** (plan 93 S5) the seats' windows down (bit i: seat i's switch) */
  win: number;
  /** (plan 93 S6) its velocity last frame and its forward acceleration (eased, m/s²): its roof's slab */
  slabV?: Vector3;
  accF?: number;
  /** (plan 93 S5) when its people were last posed (this.time) */
  seatT?: number;
  /** (plan 93 S5) its velocity last frame, the speed it's lost of late (m/s), its last big crash (when, how
   *  hard 0..1, + its front's: its people thrown forward) */
  prevV?: Vector3;
  dvSum?: number;
  dvV?: Vector3;
  jumpSeen?: number;
  crash?: { t: number; k: number; dir: number };
  /** (plan 93 S3) when its horn was last heard by the people round it (this.time) */
  hornAt?: number;
  prevSeats: string[];
  fast: number;
  role: string; // shared car/homes.ts: "police", "taxi", "rental" or none
  exhaustAt: number;
  /** (docs/plan/92 phase 9) its broken parts as last seen (shared car/damage.ts PART): a bumper newly gone
   *  falls on the road; -1 till first seen (none falls for what was broken before I came) */
  parts?: number;
  /** (plan 94 P2) what's come off it or hangs, as last seen */
  wreck?: number;
  /** (plan 94 P1) its fire's stage (shared FIRE), and as last seen for what blew off; as last heard (its catch) */
  fire?: number;
  fireSeen?: number;
  fireAt?: number;
  fireHeard?: number;
  /** steam from under its bonnet (a front past 0.8), 0..1 */
  steam?: number;
  steamAt?: number;
  scrapeAt?: number;
  // pets in its seats (docs/plan/51-the-pet.md): their models, on the seat's cushion
  pets: Map<string, { holder: Group; model: InstanceType<Pets["PetModel"]>; key: string }>;
}
/** (plan 93 S1) a round into a car, as the server told it */
interface ShotHit {
  id: string;
  x: number;
  y: number;
  z: number;
  struck: string;
  face: number;
}

interface ParkedView {
  key: string;
  /** (plan 93 S1) its damage and holes as last put on it (shot where it stands: again) */
  wearKey?: string;
  /** (plan 94 P3) its broken parts as last seen here: a pane gone since, its glass out */
  partsSeen?: number;
  /** (plan 94 P2) what had come off it, as last seen here */
  wreckSeen?: number;
  /** (plan 94 P1) its fire's stage, and as last seen here (a blast since: what's blown off thrown); as last heard */
  fire?: number;
  fireSeen?: number;
  fireAt?: number;
  fireHeard?: number;
  kind: CarKind;
  spec: CarSpec;
  look: CarLook;
  /** its model near (everything) or mid (a parked car round you); the one it had while the new one's
   *  file comes in */
  full: Sedan | null;
  level: "near" | "mid" | null;
  old: Sedan | null;
  far: ReturnType<typeof buildFar> | null;
  stillDone: boolean;
  /** the dents its still model was made with (they change: made again) */
  baked?: string;
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
/** A car's damage from its wire ("front,rear,left,right[,roof][|parts]": shared car/damage.ts). */
const dmgOf = (s: unknown): Damage => parseDamage(s);
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

// (docs/plan/92) a parked car near: its whole model (its cabin, its engine); round you: its mid one;
// past that its body's outline — a metre or two more to go back than to come (no flicker on the line)
const NEAR = 14;
const NEAR_LOW = 8;
const MID = 70;
/** A car heard: its kind's doors and horn, its variant's engine (car/sound-bank.ts voiceOf); none for what
 *  has no engine (the toboggan). */
function soundOf(ctx: AudioContext, kind: CarKind, variant?: string): CarSound | null {
  // (plan 98 phase 15: the toboggan has no engine but its runners on the snow, its knocks)
  return voiceOf(kind, variant) || kind === "toboggan"
    ? new CarSound(ctx, mixer.buses.effects, { kind, variant })
    : null;
}
/** The kinds the far model (a wagon's or a sedan's outline) can't stand in for: always drawn whole. */
const SLIDE_S = 0.45;
/** (plan 99 F5a) s: what's left of climbing out once a move hurries it */
const HURRY_S = 0.45;
/** (plan 98 phase 23) m: the town's own cars' engines heard this near */
const AI_HEARD = 40; // s: (plan 93 F3a) across from the passenger's seat to the wheel, after
const DRIVER_SHOT_V = 8.4; // m/s (~30 km/h): the driver's revolver only slower than this (plan 93 S2, the server's)
/** my car's step on Jolt (s; two collision steps each: 120 Hz for its wheels) and the most a frame takes */
const CAR_STEP = 1 / 60;
const CAR_STEPS_MAX = 8; // (plan 93 checks: a stall up to 133 ms caught up — dropped, the car fell back behind its camera)
const SEATED_OLD = 0.92; // a vehicle whose cabin isn't fitted to plan 59's people: drawn a little smaller in it
const v3 = new Vector3();
const v4 = new Vector3();
/** (plan 94 P1) what a blast throws off a car: up, at this */
const BLOWN = { x: 0, y: 7.5, z: 0 };
const q1 = new Quaternion();
/** (plan 93 S7) a tow rope: its length (m, eye to eye), its stretch's stiffness (N/m) and damping (N per m/s), the
 *  most it pulls (N) */
const TOW_LEN = 4.5;
const TOW_K = 14000;
const TOW_C = 3500;
const TOW_MAX = 26000;
const ZERO_V = new Vector3();
const ropeA = new Vector3();
const ropeB = new Vector3();
/** how many bits are set (of four: the chained wheels) */
const bitsN = (b: number) => (b & 1) + ((b >> 1) & 1) + ((b >> 2) & 1) + ((b >> 3) & 1);
const FLIP = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI);

/** The cars for a world controller (its own state read as the host: the glue lives here, in the
 *  car's chunk, not on the world page). */
// biome-ignore lint/suspicious/noExplicitAny: the controller's private state, read from its chunk
export function attachCars(c: any, G: typeof GroundsModule): Cars {
  return new Cars(
    {
      room: () => c.room,
      walk: (to: { x: number; y: number }) => c.walkTo(to, undefined, true),
      walking: () => !!c.path?.length,
      openPack: () => {
        const d = c.walker?.dark;
        if (d && !d.frozen?.()) d.inventory();
      },
      packOpen: () => !!c.walker?.dark?.frozen?.(),
      items: (id: string) => c.walker?.dark?.countOf?.(id) ?? 0,
      face: (a: number) => {
        // (as a seat turns me: the walker's body, my facing, the 8 ways the others see)
        c.walker?.faceYaw?.(a);
        c.meAngle = a;
        c.me.yaw = face8(Math.cos(a), Math.sin(a), c.me.yaw);
      },
      level: () => c.level,
      me: () => c.me,
      uid: () => c.myUid(),
      tp: () => c.tp,
      objects: () => c.objs.values(),
      night: () => c.model?.getDaylight().night ?? 0,
      dark: () => c.model?.getDaylight().dark ?? 0,
      storm: () => Math.max(0, c.storm),
      lampFog: () => c.tp?.lampFog ?? 0,
      reduced: () => prefs().reducedMotion,
      quality: () => c.qualityNow(),
      ai: () => c.lifeCars,
      toast: (text) => toast(text, "warn"),
      chars: () => charsMod(),
      pets: () => petsMod(),
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
  /** the 3D view's Jolt world (docs/plan/92): where my car drives and others' are pulled */
  private physics(): BrowserPhysics | null {
    return (this.host.tp() as unknown as { physics?: BrowserPhysics | null } | null)?.physics ?? null;
  }
  /** the Grounds' own vehicles (the shuttle, the plough, the visitor's car), pulled in my Jolt world */
  private aiPulled = new Map<string, PulledCar>();
  private rightToast = 0;
  private parked = new Map<string, ParkedView>();
  // (plan 62) when a parked car went (driven off): a car out on the road just after was got into
  private unparked = new Map<string, number>();
  private wasParked(vid: string): boolean {
    const oid = vid.replace(/^car:/, "");
    return this.parked.has(oid) || this.time - (this.unparked.get(oid) ?? Number.NEGATIVE_INFINITY) < 2;
  }
  private shoves = new Map<string, Shove>();
  // the world's objects by id (a driven car's object: its look)
  private objMap = new Map<string, WorldObjectDef>();
  private objSrc: unknown = null;
  private objById(id: string): WorldObjectDef | undefined {
    const src = this.host.objects();
    if (src !== this.objSrc || !this.objMap.has(id)) {
      this.objSrc = src;
      this.objMap.clear();
      for (const o of src) this.objMap.set(o.id, o);
    }
    return this.objMap.get(id);
  }
  private nowMs = 0;
  private live = new Map<string, LiveView>();
  private env: Texture | null = null;
  private envTarget: WebGLRenderTarget | null = null;
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
    /** the car on Jolt (docs/plan/92): made once the 3D view's physics is in */
    drive: Drive | null;
    acc: number;
    seq: number;
    sentAt: number;
    /** my sim's own clock (ms, from 1 as I took the wheel): sent with each state (net.ts CarWire.st) */
    simMs: number;
    sound: CarSound | null;
    started: boolean;
    /** (plan 98 phase 7) the starter turning since (this.time) for how long; when the key was turned */
    crankAt?: number;
    crankS?: number;
    keyAt?: number;
    // its wear as I drive it (sent now and then: car:wear), the last knock counted
    grime: number;
    dmg: Damage;
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
    // (plan 93 S2: a gun drawn here — gun mode —: the mouse aims out of my window, the buttons are the gun's)
    const gunMode = !!this.gunSeat()?.aiming;
    if (e.type === "pointerdown" || e.type === "pointerup") {
      this.mouseHeld = !locked && (e.buttons & 3) !== 0 && !gunMode;
      return;
    }
    if (!locked && !(e.buttons & 3)) return;
    // (some browsers send one huge jump as the lock starts)
    if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
    const tp = this.host.tp();
    const k = locked ? 0.0024 * (tp?.mouseLook.lookSens ?? 1) : 0.0055;
    if (gunMode) {
      // (aiming out of the window: as far round as an arm reaches out of it, up and down)
      const a = this.aimLook;
      a.yaw = Math.max(-1.35, Math.min(1.35, a.yaw + e.movementX * k * 0.8));
      a.pitch = Math.max(-0.6, Math.min(0.5, a.pitch - e.movementY * k * 0.8 * (tp?.mouseLook.lookInvert ? -1 : 1)));
      return;
    }
    const look = this.cam.look;
    // (all the way round the car behind it; from the driver's seat, as far as a head turns)
    const far = this.cam.mode === "cockpit" ? 2.4 : Math.PI;
    look.yaw = Math.max(-far, Math.min(far, look.yaw + e.movementX * k));
    look.pitch = Math.max(
      -0.5,
      Math.min(0.4, look.pitch - e.movementY * k * 0.8 * (tp?.mouseLook.lookInvert ? -1 : 1)),
    );
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
  /** (plan 93 S4) the boot I opened (a parked car's object), the pack open on it; its lid's opening (rad) */
  private bootOpen: { id: string; packed: boolean } | null = null;
  private lids = new Map<string, number>();
  /** (plan 93 S2) gun mode — a gun drawn in my seat: aiming out of my window, the look there (straight out as
   *  it starts) */
  private aimWas = false;
  private aimLook = { yaw: 0, pitch: 0 };
  /** (plan 93 S2) others' shots, by who (`arms:shot`): someone sat in a car fired out of its window that way */
  private shotsBy = new Map<string, { t: number; yaw: number; pitch: number }>();
  private myCarAt = 0;
  private input = new CarInput();
  readonly cam = new CarCamera();
  private beams: "off" | "low" | "high" = "off";
  private ind: -1 | 0 | 1 = 0;
  private hazard = false;
  private siren = false; // (a police car's: G)
  private wipers: 0 | 1 | 2 | 3 = 0;
  /** the wipers left to the weather (till V's pressed): on as it rains, off as it stops */
  private wipersAuto = true;
  private time = 0;
  private hud: CarHud | null = null;
  /** (plan 94 P10) when the keys' slip was last shown (getting in, F1) */
  private keysAt = -99;
  private offMsg: (() => void)[] = [];
  private factory: InstanceType<typeof import("../chars").CharFactory> | null = null;
  private seated = new Set<string>();
  private wanted = ""; // a car:enter sent, waiting for its seat
  /** (plan 93 C) on my way to a car's door: in when there (let go if I walk off) */
  private walkIn: { id: string; seat: number; spot: { x: number; y: number }; at: number; via?: number } | null = null;
  /** (plan 93 F3a) the seat whose door I went in by (the server puts me at the wheel: across after) */
  private myVia: { id: string; via: number } | null = null;
  private wantedAt = 0;
  // what the cars leave and throw, the roads' patches, the cabin I'm in
  private tracks: Tracks;
  /** (plan 93 S6) the ruts every car drawn here has pressed in the deep snow: my car's sim follows them */
  readonly ruts = new Ruts();
  private spray: Spray;
  /** (plan 93 S6) the roofs' snow sliding off in slabs */
  private slabs: Slabs;
  /** (plan 93 S7) the tow ropes drawn */
  private ropes: Ropes;
  /** (docs/plan/92 phase 9) tyre smoke, steam, the snow's powder; sparks; what falls off */
  private smoke: Smoke;
  private sparks: Sparks;
  private debris: Debris;
  /** (plan 94 P3) glass out of its panes */
  private shards: Shards;
  /** (plan 94 P1) cars on fire, and their blasts */
  private fires: Fires;
  private patches: RoadPatches;
  private cabin: CabinLight;
  /** (plan 98 phase 12) my car was in the air last frame (a landing's rumble) */
  private wasAir = false;
  /** (plan 98 phase 25) when I last told each car's driver I'd hit it */
  private toldAt = new Map<string, number>();
  private gearWas: number | null = null;
  private kickAt = -9;
  /** (plan 98 phase 7) my car's dome light, eased (0..1) */
  private domeK = 0;
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
    // (plan 93: `?feel=92` drives plan 92's arcade layer, for an A/B against the tyre-led one)
    if (typeof location !== "undefined" && new URLSearchParams(location.search).get("feel") === "92") feel92();
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
      ruts: this.ruts,
    });
    const room = host.room();
    if (room) {
      this.offMsg.push(
        room.onMessage("car:snap", (m: CarWire & { id: string }) => this.snapped(m)),
        room.onMessage("car:no", (m: { why: string; who?: string }) => {
          this.wanted = "";
          host.toast(t(`carNo_${m.why}`).replace("{who}", (m.who ?? "").split(" ")[0]));
        }),
        // my own repainted (docs/plan/92 F13b): the panel shut
        room.onMessage("car:looked", () => {
          if (hud.get().panel.kind === "motors") hud.set({ panel: { kind: null } });
          toast(t("carLooked"), "info");
        }),
        // someone's car keys lent me, or back with them (docs/plan/43-the-spot.md)
        // (plan 98 phase 25) another driver's car into mine, as their screen had it: the shove and the dent (unless my
        // own screen felt the same crash just now)
        room.onMessage(
          "car:struck",
          (h: { by: string; j: number; vx: number; vz: number; m: number; x: number; z: number }) => this.struck(h),
        ),
        // (plan 99 F1a) someone thrown out of a moving car: their model limp on the ragdoll at its speed
        room.onMessage("car:thrown", (m: { sid: string; vx: number; vz: number }) =>
          thrown.set(m.sid, { v: [m.vx, 1.6, m.vz], at: performance.now() }),
        ),
        room.onMessage("car:keys", (m: { from: string; plate: string; lent: boolean; why?: string }) =>
          toast(
            t(m.lent ? "carKeysLent" : `carKeysBack_${m.why ?? "taken"}`)
              .replace("{who}", m.from.split(" ")[0])
              .replace("{plate}", m.plate),
            "info",
          ),
        ),
        room.onMessage("spot:no", (m: { why: string }) => host.toast(spotNo(m.why))),
        // (plan 93 S9) my car's alarm went off: my phone tells me
        room.onMessage("car:alarm", (m: { why: string; plate: string }) => {
          mixer.blip("pop");
          toast(`📱 ${t(`carAlarm_${m.why}`).replace("{plate}", m.plate)}`, "warn");
        }),
        room.onMessage("car:bought", () => {
          if (hud.get().panel.kind === "motors") hud.set({ panel: { kind: null } });
          toast(t("motorsBought"), "info");
        }),
        room.onMessage("car:shot", (m: { gun: string; hits: ShotHit[] }) => this.shotFx(m.hits ?? [])),
        // (plan 94 G4: the ruts pressed before I came — asked for, now that they're heard)
        room.onMessage("car:ruts", (m: { segs: number[] }) => this.rutsIn(m.segs ?? [])),
        // (plan 94 P1: a car blew — the server's frame, z up)
        room.onMessage("car:blast", (m: { id: string; x: number; y: number; z: number }) => {
          this.blastFx(m.x, m.z, m.y);
          // (plan 96 F2a: the car itself thrown up, tipping, and down again)
          this.hop(m.id);
        }),
        // (plan 93 S2: someone's shot — sat in a car, their arm out of its window that way a moment)
        room.onMessage("arms:shot", (m: { sid: string; yaw: number; pitch: number }) =>
          this.shotsBy.set(m.sid, { t: this.time, yaw: m.yaw, pitch: m.pitch }),
        ),
        room.onMessage("car:radio", () => {
          if (this.mine?.seat === 0) this.station = (this.station + 1) % 4;
        }),
      );
      // (plan 94 G4: listening now — the ruts of the last minutes, please)
      room.send("car:ruts-hello", {});
    }
    this.cam.reduced = host.reduced();
    // (docs/plan/92) the Blender cars' manifest, then the far outlines every parked car past the near
    // ones shows
    void loadCarManifest()
      .then(() => {
        const r = this.host.tp()?.renderer;
        if (r) preloadCars(r);
      })
      .catch((e) => console.warn("cars: no manifest", e));
    this.tracks = new Tracks(this.root, 5000, this.ruts);
    this.spray = new Spray(this.root);
    this.slabs = new Slabs(this.root, this.spray, (x, z) => this.G.heightAt(x, z));
    this.ropes = new Ropes(this.root);
    this.smoke = new Smoke(this.root);
    this.sparks = new Sparks(this.root);
    this.shards = new Shards(this.root, (x, z) => this.G.heightAt(x, z));
    this.fires = new Fires(this.root);
    this.debris = new Debris(this.root, {
      add: (x, y, z, v) => this.physics()?.carWorld.addThing({ kind: "crate", h: 0.16 }, x, y, z, v) ?? null,
      at: (id, out) => this.physics()?.carWorld.thingAt(id, out) ?? false,
      remove: (id) => this.physics()?.carWorld.removeThing(id),
      ground: (x, z) => this.G.heightAt(x, z),
    });
    this.patches = new RoadPatches(this.root, G);
    this.cabin = new CabinLight(G);
    // (in the scene from the start, dark: added getting in, it recompiled every material)
    this.cabin.park(this.root);
  }

  // ── what the controller asks ───────────────────────────────────────────────
  /** Am I in a car (the driver or a passenger)? */
  inCar(): boolean {
    return !!this.mine || !!this.karts?.inKart();
  }
  // ── the Kart Park's karts (docs/plan/46-the-karts.md; kart/karts.ts, loaded near the park) ──
  private karts: import("../kart/karts").Karts | null = null;
  private kartsLoading = false;
  private kartsFrame(dt: number) {
    const room = this.host.room();
    // the Kart Park's layout raced (docs/plan/47-the-track-changer.md): what's asphalt there
    // follows it (the park's land made again), near the park or not
    const park = room?.state.karts?.get("park");
    if (park) this.G.setParkLayout(String(park.layout ?? "eight"), park.reverse === true);
    // (the change's show: how far the ploughs are — the views draw the new circuit behind them)
    this.G.setKartShow(park?.showing ? Number(park.show ?? 0) : -1);
    if (!this.karts) {
      const me = this.host.me();
      const near = this.host.level() === 0 && Math.hypot(me.x - this.G.KART_PARK.x, me.y - this.G.KART_PARK.z) < 420;
      if ((near || room?.state.karts?.get("park")?.karts.size) && !this.kartsLoading) {
        this.kartsLoading = true;
        void import("../kart/karts").then((m) => {
          this.karts = new m.Karts(this.host);
        });
      }
      return;
    }
    this.karts.frame(dt);
  }
  driving(): boolean {
    return !!this.mine && this.mine.seat === 0;
  }
  /** Every car drawn, where it is (the Grounds' coords; `y` its middle's height): the water's sound
   *  hears one go in (docs/plan/66-the-water.md S9). */
  where(): { id: string; x: number; y: number; z: number }[] {
    return [...this.live.values()].map((l) => ({ id: l.id, x: l.pose.p.x, y: l.pose.p.y, z: l.pose.p.z }));
  }
  /** (plan 93 S5) Someone seated in a car: which, and how shut in they are from the outside — 1 behind glass
   *  wound up all round, less with a window down (their own: nearly open), a side's glass shot out, or no door
   *  at all (the pickup's bed, the tractor's seat: 0). Null: not in one. */
  cabinOf(sid: string): { vid: string; seal: number } | null {
    for (const l of this.live.values()) {
      const e = l.people.get(sid);
      if (!e || e.gone !== undefined) continue;
      const door = l.model.doorOf ? l.model.doorOf(e.seat) : -1;
      if (door < 0) return { vid: l.id, seal: 0 };
      const parts = l.parts ?? 0;
      let seal = 1;
      if (l.win & (1 << e.seat)) seal = 0.15;
      else if (l.win) seal = 0.55;
      // (plan 94 P3: its glass gone — the side's windows, the rear's, the windscreen's — lets the outside in)
      let gone = 0;
      for (let i = 1; i < 6; i++) if (paneOf(parts, i as 1) === 2) gone++;
      if (gone) seal = Math.min(seal, gone >= 3 ? 0.2 : gone === 2 ? 0.3 : 0.5);
      if (parts & PART.screenGone) seal = Math.min(seal, 0.25);
      else if (parts & PART.screenBad) seal = Math.min(seal, 0.6);
      return { vid: l.id, seal };
    }
    return null;
  }
  /** (plan 93 S5) My cabin shut round me as I hear the world (0 open … 1 shut), for the world's sounds. */
  cabinSeal(): number {
    const sid = this.host.room()?.sessionId;
    if (!sid || !this.mine) return 0;
    return this.cabinOf(sid)?.seal ?? 0;
  }
  /** People seated in cars (drawn here, not as people standing about). */
  seatedIds(): Set<string> {
    this.karts?.seated(this.seated);
    return this.seated;
  }
  /** In a car: the controller's me carried in my seat (it walks nowhere). */
  // biome-ignore lint/suspicious/noExplicitAny: the controller's private state
  carry(c: any): boolean {
    if (this.karts?.carry(c)) return true;
    if (!this.mine) {
      // (plan 99 F5a) still climbing out: held where the act ends (the server's put me there) — a move hurries it to
      // its end, never walks me off from under it
      const e = this.myExit();
      if (!e) return false;
      c.path = null;
      c.actions.clear();
      const room = this.host.room();
      const p = room?.state.players.get(room.sessionId) as { x: number; y: number } | undefined;
      if (p) {
        c.me.x = p.x;
        c.me.y = p.y;
      }
      c.walker?.still();
      if (this.moveKeys.size && e.gone !== undefined && this.time - e.gone < EXIT_S - HURRY_S)
        e.gone = this.time - (EXIT_S - HURRY_S);
      return true;
    }
    const s = this.mySeat();
    c.path = null;
    c.actions.clear();
    if (s) {
      c.me.x = s.x;
      c.me.y = s.y;
      c.me.a = 2; // (sitting: shared ANIM.sit)
      c.meAngle = s.a;
      c.me.yaw = face8(Math.cos(s.a), Math.sin(s.a), c.me.yaw);
    }
    return true;
  }
  /** Where I am, in my seat (the ground floor's coords), facing, and the ground's height under
   *  the car: for the controller's own state, and the 3D view's (it follows me, not drawn). */
  mySeat(): { x: number; y: number; a: number; ground: number } | null {
    if (this.karts?.inKart()) return this.karts.mySeat();
    const m = this.mine;
    const l = m ? this.live.get(m.vid) : null;
    if (!m || !l) return null;
    const p = l.pose.p;
    const a = headingFromQ(l.pose.q);
    const [lx, lz] = SEATS_OF[l.kind].at[m.seat];
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    return {
      x: p.x + ca * lx - sa * lz,
      y: p.z + sa * lx + ca * lz,
      a,
      ground: p.y - l.spec.cog,
    };
  }
  /** A key for the car (in it): handled. */
  key(e: KeyboardEvent, down: boolean): boolean {
    if (this.karts?.inKart()) return this.karts.key(e, down);
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
    this.karts?.blur();
    this.input.clear();
  }
  /** The HUD's "X" prompt by a car or in one (none while it moves): set, and true; false if there's none. */
  prompt(h: typeof hud): boolean {
    // (the Kart Park: in a kart, nothing to press; by its desk, take one)
    if (this.karts?.inKart()) {
      if (h.get().prompt) h.set({ prompt: null });
      return true;
    }
    const kp = this.karts?.promptNow();
    if (kp) {
      const cur = h.get().prompt;
      if (cur?.objectId !== kp.objectId || cur.label !== kp.label) h.set({ prompt: kp });
      return true;
    }
    // (the bays' boards: who's claimed what, their posts for the sim)
    this.spots.refresh(
      () => this.host.objects(),
      this.host.uid(),
      performance.now(),
      (o) => {
        // (driven: where it is now; parked: its object, on the ground floor)
        const l = this.live.get(`car:${o.id}`);
        const q = l ? null : parkedPose(o);
        const x = l ? l.pose.p.x : (q?.x ?? 0);
        const z = l ? l.pose.p.z : (q?.y ?? 0);
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
      return !!p && this.spots.sameBay(me.x, me.y, p.x, p.z);
    };
    // (by its door — within 2.2 of its middle — the car's, though)
    const carWins = !!near && (near.kind !== "car" || inBay(near.objectId) || this.nearD < 2.2);
    const car = (spot && !carWins ? spot : near) ?? this.motorsNow();
    if (!car) return false;
    // (by a car: its engine's recordings fetched before it's started)
    if (car.kind === "car" && mixer.ctx) {
      const pv = this.parked.get(car.objectId);
      const v = pv ? voiceOf(pv.kind, pv.look.variant) : "four";
      if (v) void preloadEngine(mixer.ctx, v);
    }
    const cur = h.get().prompt;
    if (car.kind === "car:moving") {
      if (cur) h.set({ prompt: null });
    } else if (cur?.objectId !== car.objectId || cur.label !== car.label || cur.kind !== car.kind)
      h.set({ prompt: car });
    return true;
  }
  private promptNow(): { objectId: string; kind: string; label: string; key?: string; padKey?: string } | null {
    if (this.mine) {
      // (on the move there's nothing to press: the prompt comes back at a stop)
      const l = this.live.get(this.mine.vid);
      const sp = l ? Math.hypot(l.pose.v.x, l.pose.v.z) : 0;
      // (plan 98 phase 24: a passenger, the wheel empty — across to it)
      const vw = this.host.room()?.state.vehicles.get(this.mine.vid) as VehWire | undefined;
      const wheelFree = this.mine.seat > 0 && !String(vw?.seats ?? "").split("|")[0];
      if (wheelFree && sp <= 1.5)
        return { objectId: this.mine.vid, kind: "car:swap", label: t("carSwap"), key: "E", padKey: "A" };
      return sp > 1.5
        ? { objectId: this.mine.vid, kind: "car:moving", label: "" }
        : // (out by the car's own key, X — or the pad's X button —, not the walker's use key: plan 94 P9)
          { objectId: this.mine.vid, kind: "car:leave", label: t("carOut"), key: "X", padKey: "X" };
    }
    if (this.host.level() !== 0) return null;
    // (plan 93 S6, S7: at work on a car — pressed again, stood up)
    const job = this.job;
    if (job) {
      const left = Math.max(0, (job.ms - (performance.now() - job.at)) / 1000);
      return { objectId: job.key, kind: "car:working", label: `${job.label} · ${Math.ceil(left)} s` };
    }
    // (plan 93 S4, S6, S7: by a parked car — whichever of its spots I'm nearest: its boot, a wheel (a chain, a flat),
    // its bonnet (what's next to mend), a tow eye)
    const spot = this.workSpot();
    if (spot) return spot;
    const hit = this.nearest();
    if (!hit) return null;
    this.nearD = hit.d;
    const label = hit.seat === 0 ? t("carDrive") : t("carIn");
    // (my own at home: held, repainted — docs/plan/92 F13b)
    if (!hit.owner && hit.seat === 0 && this.repaintable(hit.id))
      return { objectId: hit.id, kind: "car", label: `${label} · ${t("carRepaintHold")}` };
    // (someone's own: whose)
    // (plan 93 S9: mine — L locks it, or unlocks; another's locked: said)
    const pr = this.propsOf(hit.id);
    const mine = !!pr?.ownerId && mayDrive(pr, this.host.uid(), Date.now());
    const lockNote = mine
      ? ` · ${t(pr?.locked ? "carUnlockKey" : "carLockKey")}`
      : pr?.locked
        ? ` · ${t("carLocked")}`
        : "";
    return {
      objectId: hit.id,
      kind: "car",
      label: (hit.owner ? `${label} · ${t("carOf").replace("{who}", hit.owner.split(" ")[0])}` : label) + lockNote,
    };
  }
  /** (plan 93 S9) L on foot: my own car near (or one lent me today) locked, or unlocked — the nearest. */
  lockKey(): boolean {
    if (this.mine || this.host.level() !== 0) return false;
    const me = this.host.me();
    let best: string | null = null;
    let bd = 8;
    for (const [id, p] of this.parked) {
      const pr = this.propsOf(id);
      if (!pr?.ownerId || !mayDrive(pr, this.host.uid(), Date.now())) continue;
      const d = Math.hypot(me.x - p.pose.x, me.y - p.pose.z);
      if (d < bd) {
        bd = d;
        best = id;
      }
    }
    if (!best) return false;
    this.host.room()?.send("car:lock", { id: best, on: !this.propsOf(best)?.locked });
    return true;
  }
  /** (plan 93 S9) Locked, unlocked: its indicators flash (twice, once) and it chirps — whoever's near sees and hears
   *  it. Its alarm going (`alarmAt`, 20 s): its lamps flashing, the whoop. */
  private lockSeen = new Map<string, { locked: boolean; flash: number; n: number; lit?: boolean }>();
  private alarms = new Map<string, { g: GainNode; o: OscillatorNode; lfo: OscillatorNode }>();
  private locksFrame() {
    const me = this.host.me();
    const now = Date.now();
    const c = mixer.ctx;
    const live = new Set<string>();
    for (const [id, p] of this.parked) {
      const pr = this.propsOf(id);
      if (!pr?.ownerId) continue;
      const locked = !!pr.locked;
      let s = this.lockSeen.get(id);
      if (!s) {
        s = { locked, flash: -9, n: 0 };
        this.lockSeen.set(id, s);
      } else if (s.locked !== locked) {
        s.locked = locked;
        s.flash = this.time;
        s.n = locked ? 2 : 1;
        const d = Math.hypot(me.x - p.pose.x, me.y - p.pose.z);
        if (c && c.state === "running" && d < 30) this.chirp(c, s.n, Math.max(0.05, 1 - d / 30));
      }
      const alarmOn = now - (Number(pr.alarmAt) || 0) < 20_000;
      // (a flash: 0.25 s on, 0.2 off, each)
      const u = this.time - s.flash;
      const flash = u < s.n * 0.45 && u % 0.45 < 0.25;
      const blink = alarmOn && this.time % 0.6 < 0.3;
      const on = flash || blink;
      if (on || s.lit) {
        p.full?.setLights?.({
          beams: blink ? "low" : "off",
          tail: on,
          brake: 0,
          reverse: false,
          ind: on ? 1 : 0,
          hazard: on,
          dash: 0,
          dome: false,
        });
        s.lit = on;
      }
      if (alarmOn) live.add(id);
      // (the whoop: a tone swept up and down, by how far)
      const d = Math.hypot(me.x - p.pose.x, me.y - p.pose.z);
      let a = this.alarms.get(id);
      if (alarmOn && c && c.state === "running" && d < 80) {
        if (!a) {
          const o = c.createOscillator();
          o.type = "square";
          o.frequency.value = 900;
          const lfo = c.createOscillator();
          lfo.frequency.value = 1.6;
          const lg = c.createGain();
          lg.gain.value = 380;
          lfo.connect(lg).connect(o.frequency);
          const bp = c.createBiquadFilter();
          bp.type = "bandpass";
          bp.frequency.value = 1100;
          bp.Q.value = 0.8;
          const g = c.createGain();
          g.gain.value = 0;
          o.connect(bp).connect(g).connect(mixer.buses.effects);
          o.start();
          lfo.start();
          a = { g, o, lfo };
          this.alarms.set(id, a);
        }
        a.g.gain.setTargetAtTime(0.06 * Math.max(0, 1 - d / 80), c.currentTime, 0.1);
      }
    }
    for (const [id, a] of this.alarms)
      if (!live.has(id) || !this.parked.has(id)) {
        a.o.stop();
        a.lfo.stop();
        a.g.disconnect();
        this.alarms.delete(id);
      }
  }
  /** (plan 93 S9) the lock's chirp: `n` short beeps */
  private chirp(c: AudioContext, n: number, k: number) {
    for (let i = 0; i < n; i++) {
      const t0 = c.currentTime + i * 0.16;
      const o = c.createOscillator();
      o.type = "square";
      o.frequency.value = 2100;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.05 * k, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
      o.connect(g).connect(mixer.buses.effects);
      o.start(t0);
      o.stop(t0 + 0.1);
    }
  }
  /** Standing in a bay of the lot, on foot: claim it, or give it up (car/spot.ts). */
  private spots = new Spots();
  /** how far the car the prompt offers is (its middle) */
  private nearD = 0;
  private spotNow(): SpotPrompt | null {
    if (this.host.level() !== 0) return null;
    const me = this.host.me();
    return this.spots.prompt(me.x, me.y, this.host.uid());
  }
  /** By MOTORS' door or a vehicle on show, on foot: the dealer's prompt (docs/plan/43-the-spot.md). */
  private motorsNow(): { objectId: string; kind: string; label: string } | null {
    if (this.host.level() !== 0) return null;
    const me = this.host.me();
    const x = me.x;
    const z = me.y;
    const M = this.G.MOTORS;
    if (x < M.yard.x0 - 20 || x > M.yard.x1 + 2 || z < M.yard.z0 - 4 || z > M.yard.z1 + 2) return null;
    const door = Math.hypot(x - MOTORS_DOOR.x, z - MOTORS_DOOR.z) < 2.6;
    const show = M.show.some((v) => Math.hypot(x - v.x, z - v.z) < 4);
    return door || show ? { objectId: "motors", kind: "motors", label: t("motorsPrompt") } : null;
  }
  /** My own car, parked at home (my bay, MOTORS' forecourt): repainted by holding Use by it (docs/plan/92 F13b). */
  repaintable(id: string): boolean {
    let o: WorldObjectDef | null = null;
    for (const x of this.host.objects()) if (x.id === id) o = x;
    if (!o || o.kind !== "car" || Number(o.props?.ownerId) !== this.host.uid() || o.props?.retire) return false;
    return carAtHome(o, this.host.objects(), this.G.MOTORS.yard);
  }
  /** Held Use by my own at home: its "Repaint" panel (true), else nothing to hold for (false). */
  hold(kind: string, id: string): boolean {
    if (kind !== "car" || this.mine || !this.repaintable(id)) return false;
    hud.set({ panel: { kind: "motors", objectId: `repaint:${id}` } });
    return true;
  }
  /** X pressed on the prompt: true if it was a car's (or a bay's, or the dealer's). */
  act(kind: string, id: string): boolean {
    if (this.karts?.act(kind)) return true;
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
    if (kind === "car:working") {
      room?.send("car:chain-stop", {});
      this.job = null;
      return true;
    }
    if (kind === "car:no") {
      this.host.toast(id.split("#")[1] ?? "");
      return true;
    }
    if (kind === "car:chain" || kind === "car:mend") {
      const [cid, a, b] = id.split("#");
      const p = this.parked.get(cid);
      if (!p || !room) return true;
      const me = this.host.me();
      const dmg = String(this.propsOf(cid)?.dmg ?? "");
      if (kind === "car:chain") {
        const wheel = Number(a);
        const on = !(chainsOf(this.propsOf(cid)) & (1 << wheel));
        room.send("car:chain", { id: cid, wheel, on });
        this.job = {
          key: id,
          id: cid,
          at: performance.now(),
          ms: on ? CHAIN_ON_MS : CHAIN_OFF_MS,
          x: me.x,
          y: me.y,
          label: t(on ? "carChaining" : "carUnchaining"),
          done: () =>
            !!(chainsOf(this.propsOf(cid)) & (1 << wheel)) === on ? t(on ? "carChainDone" : "carChainOffDone") : null,
        };
        this.host.face(chainSpot(p.spec, p.pose.x, p.pose.z, p.pose.a, wheel).a);
        return true;
      }
      const what = a as Mend;
      const wheel = Number(b ?? 0);
      room.send("car:mend", { id: cid, what, wheel });
      this.job = {
        key: id,
        id: cid,
        at: performance.now(),
        ms: MEND_MS[what],
        x: me.x,
        y: me.y,
        label: t(`carMending_${what}`),
        done: () => (String(this.propsOf(cid)?.dmg ?? "") !== dmg ? t(`carMended_${what}`) : null),
      };
      // (facing the wheel, or the car's nose: back along it)
      this.host.face(what === "tyre" ? chainSpot(p.spec, p.pose.x, p.pose.z, p.pose.a, wheel).a : p.pose.a + Math.PI);
      return true;
    }
    if (kind === "car:tow") {
      // (a rope's end tied: the first — its other end to the other car's —, or that, and it's tied)
      const [cid, end] = id.split("#") as [string, "back" | "front"];
      const r = this.rope;
      if (r && r.end !== end && r.id !== cid) {
        room?.send("car:tow", end === "back" ? { from: cid, to: r.id } : { from: r.id, to: cid });
        this.rope = null;
      } else {
        this.rope = { id: cid, end };
        this.host.toast(t(end === "back" ? "carRopeToFront" : "carRopeToBack"));
      }
      return true;
    }
    if (kind === "car:untow") {
      room?.send("car:untow", { id: id.split("#")[0] });
      return true;
    }
    if (kind === "car:boot") {
      // (plan 93 S4: its lid up, the pack open on it — what's in it beside my pockets)
      this.bootOpen = { id, packed: false };
      // (plan 94 G3: for everyone near — its lid up on their screens)
      room?.send("car:boot", { id, open: true });
      this.host.openPack();
      return true;
    }
    if (kind === "car:swap") {
      room?.send("car:swap", {});
      return true;
    }
    if (kind !== "car" && kind !== "car:leave" && kind !== "car:moving") return false;
    if (!room) return true;
    // (plan 98 F5a: X on the move — out anyway, thrown)
    if (kind === "car:leave" || kind === "car:moving") {
      // (plan 98 F2a: still getting in — X again: sat at once)
      const at = this.myActT();
      if (at !== null && at < ENTER_S && this.mine) {
        const e = this.live.get(this.mine.vid)?.people.get(room.sessionId);
        if (e) e.at = this.time - ENTER_S - (e.via !== undefined ? 0 : SLIDE_S);
        return true;
      }
      const l = this.mine ? this.live.get(this.mine.vid) : null;
      // (plan 98 F5a: on the move — out anyway: thrown out, a stumble or a roll; no climbing out)
      if (l && Math.hypot(l.pose.v.x, l.pose.v.z) > 2.5) {
        this.cancelled = l.id;
        // (plan 99 F2a: the car goes on — mine to drive on, with nobody at its wheel, till it stops)
        if (this.mine?.seat === 0) this.coastWant = l.id;
        room.send("car:leave", { jump: true });
        return true;
      }
      room.send("car:leave", {});
      return true;
    }
    const hit = this.nearest();
    if (!hit || hit.id !== id) return true;
    void mixer.resume();
    // (plan 93 C: walked to the door first — its handle's spot, beside the seat it's for — then in)
    const [u, w0] = SEATS_OF[hit.kind].at[hit.via ?? hit.seat] ?? [0, -0.42];
    const w = Math.sign(w0 || -1) * (Math.abs(w0) + 0.85);
    // (plan 98: where the act begins — beside the door's back edge, facing it — as its model measures it)
    const spot = this.stanceOf(id, hit.via ?? hit.seat) ?? {
      x: hit.x + u * Math.cos(hit.a) - w * Math.sin(hit.a),
      y: hit.z + u * Math.sin(hit.a) + w * Math.cos(hit.a),
    };
    const me = this.host.me();
    this.wanted = id;
    this.wantedAt = performance.now();
    this.myVia = hit.via !== undefined ? { id, via: hit.via } : null;
    if (Math.hypot(spot.x - me.x, spot.y - me.y) > 0.6 && this.host.walk(spot)) {
      this.walkIn = { id, seat: hit.seat, spot, at: performance.now(), via: hit.via };
      return true;
    }
    this.camBefore = this.camOff();
    room.send("car:enter", { id, seat: hit.seat, via: hit.via });
    return true;
  }
  /** The car's camera (in one, the view uses it). */
  camera(): ThirdPersonView["gameCam"] {
    return this.karts?.camera() ?? this.camNow;
  }
  private camNow: ThirdPersonView["gameCam"] = null;
  /** Something that blocks walking: a live car's body, its model's size, a body round (x, y)
   *  touching it (the ground floor's coords; parked, its object blocks — shared grid.ts). */
  blocks(x: number, y: number): boolean {
    const bx = x;
    const bz = y;
    for (const [, l] of this.live) {
      // (on Jolt in my world: the walker meets its body there — docs/plan/92 phase 3)
      if (l.pulled) continue;
      const a = headingFromQ(l.pose.q);
      const b = boxOf(l.spec);
      const dx = bx - l.pose.p.x;
      const dz = bz - l.pose.p.z;
      const u = Math.abs(dx * Math.cos(a) + dz * Math.sin(a) - b.off) - b.hx;
      const w = Math.abs(-dx * Math.sin(a) + dz * Math.cos(a)) - b.hz;
      if (Math.hypot(Math.max(u, 0), Math.max(w, 0)) < BODY_R) return true;
    }
    // (and the Grounds' own: the shuttle, the plough, the visitor's car)
    for (const v of this.host.ai()) {
      if (!v.shown || this.aiPulled.has(`ai:${v.kind}:${v.id ?? ""}`)) continue;
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
      this.root.position.set(0, f.y, 0);
      this.root.visible = f.visible;
      tp.culling.matrices(this.root);
    }
    this.nowMs = now;
    this.watchKeys();

    // (plan 99 F3a) a parked car's driven model nobody took on (it parked out of reach): let go
    for (const [k, h] of this.handoff)
      if (this.time - h.at > 8) {
        this.handoff.delete(k);
        this.root.remove(h.model.root);
        h.model.dispose();
      }
    this.lidsFrame(dt);
    // (plan 95 F1a) the windows on their way down or up
    for (const l of this.live.values()) l.model.windowsTick?.(dt);
    this.workFrame(room, dt);
    this.locksFrame();
    // (plan 93 C) at the door I walked to: in; walked off (the way let go): not
    const wi = this.walkIn;
    if (wi) {
      const me = this.host.me();
      const d = Math.hypot(wi.spot.x - me.x, wi.spot.y - me.y);
      const t = performance.now() - wi.at;
      if (d < 0.5 || (t > 700 && !this.host.walking() && d < 1.3)) {
        this.walkIn = null;
        this.wanted = wi.id;
        this.wantedAt = performance.now();
        this.camBefore = this.camOff();
        room.send("car:enter", { id: wi.id, seat: wi.seat, via: wi.via });
      } else if ((t > 700 && !this.host.walking()) || t > 6000) this.walkIn = null;
      else this.wantedAt = performance.now();
    }
    this.updateEnv(tp);
    this.stepShoves(dt, room);
    this.syncParked(tp, dt);
    this.syncLive(room, dt, now);
    this.drive(room, dt, now);
    if (!this.mine?.sim) this.headlamps(null, "off");
    this.findMine(room, now);
    this.effects(dt);
    this.hearAi(dt);
    // (plan 93 S5) in a car, its cockpit's view: the world's ambience through its glass
    mixer.cabin(this.mine && this.cam.mode === "cockpit" ? this.cabinSeal() : 0);
    if (this.hudAt && this.time >= this.hudAt && this.mine) {
      this.hudAt = 0;
      this.showHud();
    }
    this.drawHud();
    this.kartsFrame(dt);
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
      const spec = l.spec;
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
          const b = l.pb.buf[l.pb.buf.length - 1];
          slip = b ? b.slip : 0;
        }
        const y = this.G.heightAt(x, z);
        this.tracks.mark(`${id}:${i}`, x, y, z, g, t, slip > 1.5);
        // (plan 94 G4: my car's front wheels' ruts, a stretch at a time, for the server to keep)
        if (sim && i < 2 && mine?.seat === 0) this.rutLane(i, x, z, g);
        const loose = g === "snow" || g === "deep" || g === "path" || g === "slush";
        const k = loose ? Math.min(1, (slip / 4) * (i >= 2 ? 1 : 0.5) + (speed > 6 ? (speed - 6) * 0.02 : 0)) : 0;
        if (k > 0.05) {
          const back = speed > 0.5 ? -1 : 1;
          this.spray.throw(x, y, z, ca * back, sa * back, k, g === "slush");
        }
        // (plan 98 phase 21) through water: a spray off each wheel by how fast, a bow wave off the front ones
        const wa = speed > 1.2 ? this.G.waterAt(x, z) : null;
        if (wa && wa.level > y - 0.03) {
          const wk = Math.min(1, speed / 9);
          const back = speed > 0.5 ? -1 : 1;
          this.spray.throw(x, wa.level, z, ca * back, sa * back, wk, true);
          if (i < 2 && Math.random() < wk * dt * 24)
            this.spray.puff(
              x + ca * 0.6 * -back,
              wa.level + 0.1,
              z + sa * 0.6 * -back,
              (Math.random() - 0.5) * 1.2 - sa * (i === 0 ? 1 : -1) * 1.5 * wk,
              1.2 + 1.8 * wk,
              (Math.random() - 0.5) * 1.2 + ca * (i === 0 ? 1 : -1) * 1.5 * wk,
              0.5 + 0.6 * wk,
              0.7,
              0xe8f0f6,
              0.55,
            );
        }
        // (docs/plan/92 phase 9) a tyre sliding: smoke off the asphalt (a burnout, a drift), a rooster
        // tail of powder off the snow — by how fast it slides
        if (slip > 2.5 && Math.random() < Math.min(1, (slip - 2.5) / 5 + 0.25) * dt * 40) {
          const ks = Math.min(1, (slip - 2.5) / 9);
          const hard = g === "asphalt" || g === "wet" || g === "walk" || g === "rock" || g === "earth";
          if (hard && g !== "wet")
            this.smoke.emit(
              x + (Math.random() - 0.5) * 0.3,
              y + 0.18,
              z + (Math.random() - 0.5) * 0.3,
              l.pose.v.x * 0.25 + (Math.random() - 0.5),
              0.4 + Math.random() * 0.5,
              l.pose.v.z * 0.25 + (Math.random() - 0.5),
              0.7 + ks * 0.6,
              4 + ks * 3,
              1.8 + ks * 1.6,
              night > 0.5 ? 0x9aa0a8 : 0xe2e3e4,
              0.16 + ks * 0.22,
            );
          else if (loose && g !== "slush")
            this.smoke.emit(
              x,
              y + 0.3,
              z,
              -l.pose.v.x * 0.15 + (Math.random() - 0.5) * 1.5,
              1.2 + ks * 2,
              -l.pose.v.z * 0.15 + (Math.random() - 0.5) * 1.5,
              0.5 + ks * 0.5,
              3 + ks * 2,
              1.0 + ks * 0.8,
              0xf3f6f9,
              // (spinning on the spot, dug in: a little — a rooster tail's for a car going)
              (0.14 + ks * 0.2) * Math.min(1, 0.3 + speed / 6),
            );
        }
      }
      // the exhaust's breath in the cold (thick while the engine's cold, torn away by speed)
      const last = l.pb.buf[l.pb.buf.length - 1];
      const engineOn = sim ? sim.rpm > 50 : !!((last?.fl ?? 0) & CAR_FLAGS.engine);
      // (the revs in it: quicker, bigger, pushed further out as it's worked — docs/plan/92 phase 9)
      const rpm = sim ? sim.rpm : (last?.rpm ?? 900);
      const work = Math.min(1, Math.max(0, (rpm - 900) / 5000)) * (sim ? 0.4 + 0.6 * sim.thr : 0.7);
      if (engineOn && t - l.exhaustAt > 0.14 - 0.09 * work) {
        l.exhaustAt = t;
        const e = m.lamps.exhaust;
        v3.copy(e).applyMatrix4(m.root.matrix);
        const cold = sim ? 1 - sim.temp / 0.55 : 0.3;
        const out = 0.6 + 2.2 * work;
        this.spray.puff(
          v3.x,
          v3.y,
          v3.z,
          -ca * out - l.pose.v.x * 0.2,
          0.25,
          -sa * out - l.pose.v.z * 0.2,
          0.5 + cold * 0.6 + work * 0.5,
          1.2 - work * 0.4,
          night > 0.5 ? 0x8b95a5 : 0xeef1f4,
          0.16 + 0.18 * cold + 0.1 * work,
        );
      }
      // (steam from a smashed front: under the bonnet's back edge, up through its gaps)
      // (plan 94 P1: on fire, its own smoke instead — fireFrame)
      const steam = (mine ? mine.dmg.fire : (l.fire ?? 0)) ? 0 : mine ? steamOf(mine.dmg) : (l.steam ?? 0);
      if (steam > 0 && t - (l.steamAt ?? 0) > 0.12 / steam) {
        l.steamAt = t;
        const h0 = m.lamps.head[0];
        const h1 = m.lamps.head[1] ?? h0;
        if (h0) {
          v3.set((h0.x + h1.x) / 2 + 0.55, Math.max(h0.y, h1.y) + 0.3, 0).applyMatrix4(m.root.matrix);
          this.smoke.emit(
            v3.x + (Math.random() - 0.5) * 0.5,
            v3.y,
            v3.z + (Math.random() - 0.5) * 0.5,
            l.pose.v.x * 0.5,
            0.8 + Math.random() * 0.6,
            l.pose.v.z * 0.5,
            0.45,
            4,
            2.2,
            night > 0.5 ? 0x8c949e : 0xf4f6f8,
            0.35 * steam,
          );
        }
      }
      // the doors: each open while someone gets in or out by it (the 4x4's back seats by its front ones,
      // the van's by its slide)
      // (plan 98 phase 6) the car's acceleration in its own frame: what swings a door left open
      const acc = this.bodyAcc(l, dt);
      // (plan 98 phase 11) its weight on its springs, seen: the nose down braking, up pulling away, out in a turn
      // (model axes: x its tail, z its left; braking, its acceleration toward its tail)
      // (on a spring: it rocks back a little as it comes to a stop)
      const wp = Math.max(-0.035, Math.min(0.035, (acc.x / 9.81) * 0.026));
      const wr = Math.max(-0.03, Math.min(0.03, (-acc.z / 9.81) * 0.012));
      const wt = (l.wt ??= { p: 0, pv: 0, r: 0, rv: 0 });
      if (dt > 0) {
        const h = Math.min(dt, 0.05);
        wt.pv += (70 * (wp - wt.p) - 9 * wt.pv) * h;
        wt.rv += (70 * (wr - wt.r) - 9 * wt.rv) * h;
        wt.p += wt.pv * h;
        wt.r += wt.rv * h;
      }
      m.setWeight?.(wt.p, wt.r);
      for (let d = 0; d < m.doors.length; d++) {
        let open = false;
        // (a door held by a hand getting in or out: the timer opens nothing beside it)
        const held = l.doorBy?.some((v) => v >= 0);
        for (let i = 0; i < l.doorUntil.length && !held; i++)
          if (t < l.doorUntil[i] && (m.doorOf ? m.doorOf(i) : i) === d) open = true;
        const was = l.doors[d] ?? 0;
        // (plan 93 C: held by a hand — getting in or out — it's where the hand has it)
        const by = l.doorBy?.[d] ?? -1;
        l.doorW ??= [];
        if (by >= 0) {
          l.doors[d] = by;
          l.doorW[d] = dt > 0 ? (by - was) / dt : 0;
        } else if (open) {
          l.doors[d] = was + (1.05 - was) * Math.min(1, dt * 7);
          l.doorW[d] = 0;
          (l.doorT ??= [])[d] = true;
        } else if (l.doorT?.[d]) {
          // (opened by the timer — someone seen getting in or out with no act —: shut by it)
          l.doors[d] = was * (1 - Math.min(1, dt * 5));
          l.doorW[d] = 0;
          if (l.doors[d] <= 0.08) {
            l.doors[d] = 0;
            l.doorT[d] = false;
            if (was > 0.08) this.clunk(l, false, d);
          }
        } else if (was > 0.002) {
          // (plan 98 F4a: let go open — on its hinge: swung by the car's going, held a little by the check strap,
          // stopped at its stop, latched shut if it comes in hard enough, else left ajar)
          const r = swingDoor(was, l.doorW[d] ?? 0, acc, m.doors[d].side, dt, this.vB.x);
          l.doors[d] = r.a;
          l.doorW[d] = r.w;
          if (r.latched) this.clunk(l, false, d, Math.min(1.4, 0.5 + r.hit * 0.5));
        } else {
          l.doors[d] = 0;
          l.doorW[d] = 0;
        }
        if (by >= 0 && was > 0.08 && l.doors[d] <= 0.08) this.clunk(l, false, d);
        m.doors[d].open(l.doors[d]);
      }
      // the roof's snow blown off at speed
      l.fast = speed > 12 ? l.fast + dt : 0;
      if (l.fast > 1.2)
        for (const sm of m.snow)
          if (sm.visible) {
            sm.visible = false;
            l.snowK = 0;
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
      // (plan 93 S6) the roof's snow off in a slab: pulled away hard from under it (back off its tail), a hard stop
      // (forward over the windscreen), or held at speed (blown back off it) — most of what's on it gone with it
      const fwdA =
        ((l.pose.v.x - (l.slabV?.x ?? l.pose.v.x)) * ca + (l.pose.v.z - (l.slabV?.z ?? l.pose.v.z)) * sa) /
        Math.max(dt, 1e-3);
      l.slabV ??= new Vector3();
      l.slabV.copy(l.pose.v);
      l.accF = (l.accF ?? 0) + (fwdA - (l.accF ?? 0)) * Math.min(1, dt * 8);
      const roofSnow = (l.snowK ?? 0) > 0.25 && !l.spec.pushed && !wxHold.on;
      const fwdV = l.pose.v.x * ca + l.pose.v.z * sa;
      const shed: 1 | -1 | 0 = !roofSnow
        ? 0
        : fwdV > 2 && l.accF < -4.5
          ? 1
          : (Math.abs(fwdV) < 9 && l.accF * Math.sign(fwdV || 1) > 2.6) || l.fast > 1.2
            ? -1
            : 0;
      if (shed) {
        const b = l.spec.body;
        const k = l.snowK ?? 0;
        m.root.updateWorldMatrix(true, false);
        // (the roof: its middle a little behind the car's, at its top)
        v3.set(ca * -0.15, b.height - l.spec.cog + 0.04 * k, sa * -0.15).add(l.pose.p);
        const dirOf = (fwdV >= 0 ? 1 : -1) as 1 | -1;
        this.slabs.shed(
          v3,
          new Vector3(ca, 0, sa),
          l.pose.v,
          Math.min(1.5, b.ahead + b.behind) * 0.36,
          b.width * 0.62,
          0.03 + 0.07 * k,
          (shed * dirOf) as 1 | -1,
        );
        l.snowK = k * 0.35;
      }
      // the snow on it (docs/plan/65, phase 5): what fell on it since it last moved — a car standing
      // has the world's, one driven sheds it (most of it in a minute at speed; at once blown off at
      // speed, above), and it settles on it again as it stands in a fall; never more than lies
      const lie = wx.wxSnow.value;
      // (the stills' held snow: every car the world's)
      if (l.snowK === undefined || wxHold.on) l.snowK = lie;
      if (speed > 1.5) l.snowK -= (dt * Math.min(1, speed / 12)) / 40;
      else if (wxNow.snowing > 0.02) l.snowK += (dt * 0.75 * Math.min(1, wxNow.snowing * 1.5)) / 3600;
      l.snowK = Math.max(0, Math.min(l.snowK, lie));
      m.setSnow(l.snowK);
      // its own shapes: pressed down onto it till enough lies, each car in at its own
      if (m.snow.length) {
        let h = 0;
        for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 997;
        const g = growOf(AT.roof[0] + ((AT.roof[1] - AT.roof[0]) * h) / 997, l.snowK, wx.wxMelt.value);
        for (const sm of m.snow) {
          if (sm.userData.y0 === undefined) {
            sm.geometry.computeBoundingBox();
            sm.userData.y0 = sm.geometry.boundingBox?.min.y ?? 0;
            sm.userData.py = sm.position.y;
          }
          sm.visible = g > SHOWN;
          sm.scale.y = Math.max(g, 1e-3);
          sm.position.y = sm.userData.py + sm.userData.y0 * (1 - sm.scale.y);
        }
      }
    }
    // the car I'm in: the snow on its windscreen, the lamps over its cabin, its mirror
    const mine = this.mine;
    const l = mine ? this.live.get(mine.vid) : null;
    // (a toboggan has none of them)
    if (l && mine && !l.spec.pushed) {
      if (this.screen?.vid !== mine.vid) {
        this.screen?.s.dispose();
        this.screen = { vid: mine.vid, s: new ScreenSnow(l.model) };
        // (stood out in the morning fog: its screen misted — docs/plan/64-the-fog.md F6; in the rain,
        // beaded — docs/plan/65)
        this.screen.s.amount = 0.85 * (this.host.tp()?.fogAir ?? 0);
        this.screen.s.wet = Math.min(1, 1.2 * wxNow.rain);
      }
      // (the wipers by the weather through the drive, till they're set by hand)
      if (mine.seat === 0 && this.wipersAuto) {
        const rain = this.host.storm() > 0.4 || wxNow.rain > 0.2;
        if (rain && this.wipers === 0) this.wipers = 2;
        else if (!rain && wxNow.rain < 0.05 && this.wipers !== 0) this.wipers = 0;
      }
      const speed = Math.hypot(l.pose.v.x, l.pose.v.z);
      const wipers = mine.seat === 0 ? this.wipers : ((l.pb.buf[l.pb.buf.length - 1]?.fl ?? 0) >> 8) & 3;
      // (what falls on it: as hard as it's snowing — none on a dry day, docs/plan/65)
      this.screen.s.step(
        dt,
        0.25 * Math.min(1, wxNow.snowing * 1.5) + 0.9 * storm * Math.min(1, wxNow.snowing * 3),
        speed,
        wipers,
        false,
        wxNow.rain,
      );
      // (a minute's driving clears a misted screen, out of a storm: the heater, the air over it)
      if (storm < 0.1 && speed > 2)
        this.screen.s.amount = Math.max(0, this.screen.s.amount - (dt * Math.min(1, speed / 10)) / 45);
      // (plan 98 phase 7: the dome light on while a door's open — and as I get in —, fading after)
      const open = l.doors.some((d) => d > 0.05) || (this.myActT() ?? 99) < ENTER_S;
      this.domeK = Math.max(0, Math.min(1, this.domeK + (open ? dt / 0.25 : -dt / 2.5)));
      this.cabin.step(l.model, night, this.domeK);
      const tp = this.host.tp();
      const mirror = gfxNow().mirror;
      if (this.cam.mode === "cockpit" && tp && mirror !== "off") {
        if (this.mirror?.vid !== mine.vid) {
          this.mirror?.m.dispose();
          this.mirror = { vid: mine.vid, m: new Mirror(l.model) };
        }
        this.mirror.m.render(tp.renderer, tp.scene, t, mirror === "high" ? 24 : 12);
      }
      // the radio, heard in the car
      const st = mine.seat === 0 ? this.station : ((l.pb.buf[l.pb.buf.length - 1]?.fl ?? 0) >> 14) & 3;
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
      if (Math.hypot(v.x - me.x, v.z - me.y) > 90) continue;
      const bx = v.x + cx * 4.6 - sx * 1.2;
      const bz = v.z + sx * 4.6 + cx * 1.2;
      // (at its own height when it says: the Kart Park's, under the bridge's span or up its ramps)
      const by = v.h ?? this.G.heightAt(bx, bz);
      this.spray.throw(bx, by + 0.3, bz, -sx, cx, Math.min(1, Math.abs(v.v ?? 0) / 8), false);
    }
    // …and the plough truck's, driven (in a storm: fresh snow to throw)
    if (this.host.storm() > 0.25)
      for (const l of this.live.values()) {
        const sp = Math.hypot(l.pose.v.x, l.pose.v.z);
        if (l.kind !== "ploughtruck" || sp < 1.5) continue;
        if (Math.hypot(l.pose.p.x - me.x, l.pose.p.z - me.y) > 90) continue;
        const a = headingFromQ(l.pose.q);
        const cx = Math.cos(a);
        const sx = Math.sin(a);
        const bx = l.pose.p.x + cx * 3.2 - sx * 1.5;
        const bz = l.pose.p.z + sx * 3.2 + cx * 1.5;
        this.spray.throw(bx, this.G.heightAt(bx, bz) + 0.3, bz, -sx, cx, Math.min(1, sp / 8), false);
      }
    this.tracks.fade(t, night);
    if (this.rutSend.length && t - this.rutSentAt > 2) {
      this.rutSentAt = t;
      this.host.room()?.send("car:ruts", { segs: this.rutSend.splice(0, 400) });
    }
    this.spray.step(dt, night);
    this.slabs.step(dt);
    this.drawRopes();
    this.smoke.step(dt, night);
    this.sparks.step(dt);
    this.shards.step(dt);
    this.debris.step(dt);
    this.fireFrame(dt, night);
    this.hopsFrame();
    // (plan 96 F5a: a parked car's tyre blowing out — its collapse, a frame at a time)
    for (const p of this.parked.values()) if (p.full?.flatsBusy?.()) p.full.flatsTick?.(true);
    this.warmFx();
  }
  /** (plan 94 phase 9) Once, when there's a view: the fire's sprites and the shards' mesh made ready (their shaders
   *  and textures) in the background — not on the frame a car first burns near (a 200–400 ms frame on Low). */
  private warmed = false;
  private warmFx() {
    const tp = this.host.tp();
    if (this.warmed || !tp) return;
    this.warmed = true;
    const fire = this.fires.warm();
    const sh = this.shards.warmMesh;
    const shWas = sh.visible;
    sh.visible = true;
    void tp.renderer
      .compileAsync(this.root, tp.camera, tp.scene)
      .catch(() => undefined)
      .then(() => {
        fire.done();
        sh.visible = shWas;
      });
  }
  private shownStation = -1;
  /** A door's clunk (opening: a click; shutting: a thud), heard by distance. */
  /** A door opened or shut: its kind's recording from the door itself (plan 98 phase 6: heard with the engine off
   *  too, each door from where it is); till the takes are in, the engine sound's own (a click and a thud). */
  private clunk(l: LiveView, open: boolean, door = -1, k = 1) {
    const d = door >= 0 ? l.model.doors[door] : undefined;
    if (d) {
      d.group.getWorldPosition(hE);
      const [o, sh] = doorSlots(l.kind);
      if (this.bodyShot(open ? o : sh, (open ? 0.3 : 0.45) * k, hE)) return;
    }
    const s = l.sound ?? (this.mine?.vid === l.id ? this.mine.sound : null);
    s?.door(open);
  }
  /** (plan 98 phase 23) The town's own cars heard — they were silent: the visitor's a saloon's engine, the plough's and
   *  the buses' a heavy diesel's — by their speed and how they're pulling, from where they are. */
  private aiSounds = new Map<string, { s: CarSound; v: number }>();
  private hearAi(dt: number) {
    const ctx = mixer.ctx;
    const me = this.host.me();
    const keep = new Set<string>();
    if (ctx && ctx.state === "running")
      for (const v of this.host.ai()) {
        const kind: CarKind | null =
          v.kind === "visitor"
            ? "sedan"
            : v.kind === "plough" || v.kind === "shuttle" || v.kind === "bus"
              ? "ploughtruck"
              : null;
        // (near only: an engine's recordings are tens of MB decoded — loaded when one's in earshot, let go after)
        if (!kind || !v.shown || Math.hypot(v.x - me.x, v.z - me.y) > AI_HEARD) continue;
        const key = `${v.kind}:${v.id ?? ""}`;
        keep.add(key);
        let a = this.aiSounds.get(key);
        if (!a) {
          const snd = soundOf(ctx, kind);
          if (!snd) continue;
          a = { s: snd, v: v.v ?? 0 };
          this.aiSounds.set(key, a);
        }
        const sp = Math.abs(v.v ?? 0);
        const pull = dt > 0 ? (sp - Math.abs(a.v)) / dt : 0;
        a.v = v.v ?? 0;
        const spec = SPECS[kind];
        const y = this.G.heightAt(v.x, v.z) + 1;
        const heard = this.heardAt(v.x, y, v.z);
        const fake = {
          rpm: spec.engine.idle + Math.min(1, sp / 12) * (spec.engine.limit - spec.engine.idle) * 0.35,
          thr: pull > 0.2 ? 0.6 : sp > 0.5 ? 0.2 : 0,
          clutch: 1,
          spec,
          wheels: [0, 1, 2, 3].map(() => ({
            contact: true,
            ground: this.groundUnder(v.x, v.z),
            used: 0.3,
            slip: 0,
            cv: 0,
          })),
          hit: null,
          v: { x: Math.cos(v.a) * (v.v ?? 0), y: 0, z: Math.sin(v.a) * (v.v ?? 0) },
          q: { x: 0, y: Math.sin(-v.a / 2), z: 0, w: Math.cos(-v.a / 2) },
          shiftT: 0,
          gear: 1,
          brk: pull < -0.8 ? 1 : 0,
          helping: 0,
        } as unknown as CarState;
        a.s.update(
          fake,
          { inside: false, dist: heard?.dist ?? 30, at: heard?.at ?? null, rain: wxNow.rain },
          dt,
          false,
          false,
          {},
        );
      }
    for (const [k, a] of this.aiSounds)
      if (!keep.has(k)) {
        a.s.dispose();
        this.aiSounds.delete(k);
      }
  }
  /** (plan 98 phase 7) The key's chime (in, the driver's door open): a soft two-note ding from the dash. */
  private chime(at: Vector3) {
    const ctx = mixer.ctx;
    if (!ctx || ctx.state !== "running") return;
    const local = this.root.worldToLocal(hF.copy(at));
    const heard = this.heardAt(local.x, local.y, local.z);
    const g = ctx.createGain();
    const t = ctx.currentTime;
    const lvl = 0.05 * (heard ? distanceGain(heard.dist) : 1);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(lvl, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    const p = ctx.createPanner();
    p.panningModel = "HRTF";
    const w = heard?.at ?? { x: 0, y: 0, z: -1 };
    p.positionX.value = w.x;
    p.positionY.value = w.y;
    p.positionZ.value = w.z;
    g.connect(p).connect(mixer.buses.effects);
    for (const f of [1318, 1976]) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      o.connect(g);
      o.start(t);
      o.stop(t + 0.42);
    }
    setTimeout(() => p.disconnect(), 600);
  }
  /** (plan 98 phase 6) A parked car's boot or bonnet heard from its end. */
  private lidHeard(id: string, which: "boot" | "bonnet", gain: number) {
    const m = this.parked.get(id)?.full;
    if (!m) return;
    const end = which === "boot" ? m.lamps.tail[0] : m.lamps.head[0];
    if (!end) return;
    this.bodyShot(which, gain, m.body.localToWorld(hA.set(end.x, end.y + 0.2, 0)));
  }
  /** (plan 98) A recorded take of a car's body (a door, a lid) heard from a point of the world: its level by distance,
   *  round me; loaded the first time it's asked for (false till then). */
  private bodyBufs = new Map<string, AudioBuffer[] | null>();
  /** (plan 98) a body take's file asked for ahead (a car near: its doors and lids) */
  private warmBody(slot: string): boolean {
    const ctx = mixer.ctx;
    if (!ctx || this.bodyBufs.has(slot)) return this.bodyBufs.has(slot);
    this.bodyBufs.set(slot, null);
    slotBuffers(ctx, slot)
      .then((b) => this.bodyBufs.set(slot, b))
      .catch(() => this.bodyBufs.set(slot, []));
    return false;
  }
  private bodyShot(slot: string, gain: number, at: Vector3): boolean {
    const ctx = mixer.ctx;
    if (!ctx || ctx.state !== "running") return false;
    if (!this.warmBody(slot)) return false;
    const bs = this.bodyBufs.get(slot);
    if (!bs?.length) return false;
    const local = this.root.worldToLocal(hF.copy(at));
    const heard = this.heardAt(local.x, local.y, local.z);
    const src = ctx.createBufferSource();
    src.buffer = bs[Math.floor(Math.random() * bs.length)];
    src.playbackRate.value = 0.96 + Math.random() * 0.08;
    const g = ctx.createGain();
    g.gain.value = gain * (heard ? distanceGain(heard.dist) : 1);
    const p = ctx.createPanner();
    p.panningModel = "HRTF";
    const w = heard?.at ?? { x: 0, y: 0, z: -1 };
    p.positionX.value = w.x;
    p.positionY.value = w.y;
    p.positionZ.value = w.z;
    src.connect(g).connect(p).connect(mixer.buses.effects);
    src.start();
    return true;
  }

  // the sky as the paint's and the chrome's reflections, renewed now and then
  private updateEnv(tp: ThirdPersonView | null) {
    if (!tp) return;
    const n = this.host.night();
    const dark = this.host.dark();
    // (plan 98 phase 22, F7) the world itself in the paint and the chrome — the street's lamps, the buildings, the snow —:
    // a probe caught round me every 5 s (my own car out of it), on High by itself or as set; else the sky's gradient
    // (plan 99 F4a: by hand only, for now — its faces compiled the world's materials on the spot, a 2.3 s freeze)
    const probe = prefs().carReflect === "on";
    if (probe) {
      // (a face of the cube a frame — all six at once was 30–230 ms on a frame —, every 10 s, out to 90 m)
      if (this.envMake?.for !== tp.renderer) this.envMake = this.makeEnv(tp);
      const r = tp.renderer;
      let pc = this.probeCube;
      if (!pc) {
        const rt = new WebGLCubeRenderTarget(128, { type: HalfFloatType });
        const cam = new CubeCamera(0.3, 60, rt);
        pc = this.probeCube = { rt, cam, face: -1, ready: -1, waiting: false };
      }
      if (pc.face < 0) {
        if (this.time - this.envAt < 10 && this.envProbe) return;
        // (not on the move: what's new round a fast car is uploaded the first time a face draws it — long frames)
        const mv = this.mine?.sim?.v;
        if (this.envProbe && mv && Math.hypot(mv.x, mv.z) > 8) return;
        const mine = this.mine ? this.live.get(this.mine.vid) : undefined;
        const at = mine ? mine.model.root.getWorldPosition(hE).add(hF.set(0, 1.6, 0)) : tp.camera.position;
        pc.cam.position.copy(at);
        if (pc.cam.coordinateSystem !== r.coordinateSystem) {
          pc.cam.coordinateSystem = r.coordinateSystem;
          pc.cam.updateCoordinateSystem();
        }
        pc.cam.updateMatrixWorld(true);
        pc.face = 0;
      }
      // (its materials compiled for the cube's target first, off the frame — a target's programs are their own
      // (no tone mapping): each material's first time in a face was a 200–780 ms stall)
      const faceCam = pc.cam.children[pc.face] as PerspectiveCamera;
      if (pc.ready !== pc.face) {
        if (pc.waiting) return;
        pc.waiting = true;
        const prev0 = r.getRenderTarget();
        r.setRenderTarget(pc.rt, pc.face);
        const face = pc.face;
        const cube = pc;
        r.compileAsync(tp.scene, faceCam)
          .catch(() => {})
          .then(() => {
            cube.waiting = false;
            cube.ready = face;
          });
        r.setRenderTarget(prev0);
        return;
      }
      const t0 = performance.now();
      const mine = this.mine ? this.live.get(this.mine.vid) : undefined;
      const was = mine?.model.root.visible;
      if (mine) mine.model.root.visible = false;
      const prev = r.getRenderTarget();
      r.setRenderTarget(pc.rt, pc.face);
      r.render(tp.scene, faceCam);
      r.setRenderTarget(prev);
      if (mine) mine.model.root.visible = was ?? true;
      pc.face++;
      if (pc.face === 6) {
        pc.face = -1;
        this.envAt = this.time;
        this.envNight = n;
        this.envDark = dark;
        this.envProbe = true;
        this.setEnvAll(this.envMake.pm.fromCubemap(pc.rt.texture));
      }
      this.envMs = performance.now() - t0;
      this.envFaces.push(+this.envMs.toFixed(1));
      if (this.envFaces.length > 24) this.envFaces.shift();
      return;
    }
    if (this.probeCube) {
      this.probeCube.rt.dispose();
      this.probeCube = null;
    }
    if (this.envProbe) this.envAt = -99;
    this.envProbe = false;
    if (this.time - this.envAt < 20 && Math.abs(n - this.envNight) < 0.15 && Math.abs(dark - this.envDark) < 0.15)
      return;
    this.envDark = dark;
    this.envAt = this.time;
    this.envNight = n;
    if (this.envMake?.for !== tp.renderer) this.envMake = this.makeEnv(tp);
    const { pm, scene, dome } = this.envMake;
    const u = (dome.material as ShaderMaterial).uniforms;
    u.top.value.set("#8f9ca8").lerp(new Color("#04070c"), n);
    u.hor.value.set("#d5dbe0").lerp(new Color("#141c27"), n);
    u.low.value.set("#dfe5ea").lerp(new Color("#0b1016"), n);
    // (in the pitch dark, nothing up there to shine in the paint)
    for (const c of [u.top.value, u.hor.value, u.low.value]) c.multiplyScalar(1 - 0.92 * dark);
    // (the render target it's drawn into let go whole with it — its texture alone left the target on
    // the GPU, one every 20 s: the memory checker's soak, plan 72 phase 13)
    this.setEnvAll(pm.fromScene(scene, 0.04, 0.1, 100));
  }
  /** (plan 98) the cars' reflection map: this target's texture on every car, the last one let go */
  private envProbe = false;
  /** (plan 98) the probe's last face's cost on the main thread (ms), and the last two dozen */
  envMs = 0;
  envFaces: number[] = [];
  private probeCube: {
    rt: WebGLCubeRenderTarget;
    cam: CubeCamera;
    face: number;
    ready: number;
    waiting: boolean;
  } | null = null;
  private setEnvAll(rt: WebGLRenderTarget) {
    const next = rt.texture;
    const old = this.envTarget;
    this.envTarget = rt;
    this.env = next;
    for (const p of this.parked.values()) p.full?.setEnv(next);
    for (const l of this.live.values()) l.model.setEnv(next);
    old?.dispose();
  }
  private makeEnv(tp: ThirdPersonView): NonNullable<Cars["envMake"]> {
    {
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
      return { pm: new PMREMGenerator(tp.renderer), for: tp.renderer, scene, dome };
    }
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
  private looks = new WeakMap<object, { props: unknown; kind: CarKind; look: CarLook; role: string; key: string }>();
  private syncParked(tp: ThirdPersonView | null, dt: number) {
    const seen = new Set<string>();
    // (a car's whole model made, or made still, at most one a frame: several coming near at once were one frame of
    // tens of ms — docs/plan/90-the-friends-machines.md phase 7; one waiting shows its far model meanwhile)
    let heavy = 0;
    const me = this.host.me();
    const mx = me.x;
    const mz = me.y;
    const camAt = tp ? tp.camera.position : null;
    // (Low and Lowest: a car's whole model only right by it — a parked row walked past is a model made a car)
    const q = this.host.quality();
    // (and none while I drive past faster than a walk: a parked car's whole model — its cabin's materials made
    // the first time — is a long frame, and nobody looks into a cabin going by at 50)
    const mv = this.mine?.sim?.v;
    const going = !!mv && Math.hypot(mv.x, mv.z) > 4;
    const near = going ? 0 : q === "low" || q === "lowest" ? NEAR_LOW : NEAR;
    for (const o of this.host.objects()) {
      if (o.kind !== "car" || (Number(o.props?.level ?? 0) | 0) !== 0 || o.props?.driven) continue;
      // (its driven model still there, someone climbing out of it: not two of it)
      if (this.live.get(`car:${o.id}`)?.linger) continue;
      seen.add(o.id);
      const pose = parkedPose(o);
      let x = pose.x;
      let z = pose.y;
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
      // (its look and key worked out again only when its props change: not every car every frame)
      let lk = this.looks.get(o);
      if (!lk || lk.props !== o.props) {
        const kind = carKindOf(o.props?.model);
        const look = lookFor(o.id, kind, o.props ?? {});
        const role = typeof o.props?.role === "string" ? o.props.role : "";
        lk = { props: o.props, kind, look, role, key: `${kind}|${JSON.stringify(look)}|${role}|${o.props?.plate}` };
        this.looks.set(o, lk);
      }
      const { kind, look, role, key } = lk;
      let p = this.parked.get(o.id);
      if (!p || p.key !== key) {
        this.dropParked(p);
        p = {
          key,
          kind,
          spec: variantSpec(kind, look.variant),
          look,
          full: null,
          level: null,
          old: null,
          far: null,
          stillDone: false,
          pose: { x, z, a, y: pose.h ?? this.G.heightAt(x, z) },
        };
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
        if (p.old) placeModel(p.old.root, P.x, P.y, P.z, P.a);
        if (p.far) placeModel(p.far.root, P.x, P.y + 0.02, P.z, P.a);
      }
      const y = P.y;
      // near: the whole car; round me: its mid model; far: its body's outline (a work vehicle has
      // none: its mid one)
      const camD = camAt
        ? Math.hypot(P.x - (camAt.x - this.root.position.x), P.z - (camAt.z - this.root.position.z))
        : Math.hypot(P.x - mx, P.z - mz);
      const body = bodyOf(look.variant);
      const pad = p.level === "near" ? 2 : 0;
      const padM = p.level === "mid" || p.level === "near" ? 4 : 0;
      const want: "near" | "mid" | "far" = camD < near + pad ? "near" : camD < MID + padM || !body ? "mid" : "far";
      // (nothing built till the cars' manifest is in: a moment after the chunk)
      const r = carManifest() ? tp?.renderer : undefined;
      // (its dents changed since its still model was made — knocked where it stands: made again, the old one
      // shown till the new one's in)
      const wk = `${o.props?.dmg ?? ""}|${o.props?.holes ?? ""}|${chainsOf(o.props)}`;
      // (plan 94 P3: shot where it stands — a pane gone since I last saw it, its glass out of its frame)
      const dNow = dmgOf(o.props?.dmg);
      const partsNow = dNow.parts;
      if (p.partsSeen !== undefined && partsNow & ~p.partsSeen) {
        const mm = p.full ?? p.old;
        if (mm?.ready) this.glassOut(mm, partsNow & ~p.partsSeen, 0, 0, parseHoles(o.props?.holes));
      }
      p.partsSeen = partsNow;
      // (plan 94 P2: parts off since — onto the road; its model made again, its shadow without them)
      const blown = p.fireSeen !== undefined && dNow.fire === 3 && p.fireSeen < 3;
      if (p.wreckSeen !== undefined && dNow.wreck !== p.wreckSeen) {
        const mm = p.full ?? p.old;
        if (mm?.ready && dNow.wreck & ~p.wreckSeen)
          this.partsOff(mm, dNow.wreck & ~p.wreckSeen, blown ? BLOWN : { x: 0, y: 0, z: 0 });
        if (p.stillDone && p.full) p.level = null;
      }
      // (burnt out since: its model made again, charred)
      if (blown && p.stillDone && p.full) p.level = null;
      p.wreckSeen = dNow.wreck;
      p.fire = dNow.fire;
      p.fireSeen = dNow.fire;
      if (p.stillDone && p.full && p.baked !== undefined && p.baked !== wk) p.level = null;
      // (plan 99 F3a) the car it was a moment ago, driven: its own model taken on as it is — no still copy made, no swap
      const ho = this.handoff.get(o.id);
      if (ho && want === "near" && !p.full) {
        this.handoff.delete(o.id);
        p.full = ho.model;
        p.level = "near";
        p.stillDone = true;
        p.wearKey = undefined;
        placeModel(p.full.root, P.x, y, P.z, P.a);
        p.full.root.userData.still = true;
      } else if (ho && (want !== "near" || this.time - ho.at > 5)) {
        this.handoff.delete(o.id);
        this.root.remove(ho.model.root);
        ho.model.dispose();
      }
      if (r && want !== "far" && p.level !== want && heavy < 1) {
        heavy++;
        // (the one it had shows till the new one's in)
        if (p.full && !p.old) p.old = p.full;
        else p.full?.dispose();
        p.full = buildCar({
          variant: look.variant,
          look,
          role: role || undefined,
          plate: typeof o.props?.plate === "string" ? o.props.plate : undefined,
          level: want,
          renderer: r,
          priority: camD,
          pad: SEATS_OF[kind],
        });
        p.level = want;
        p.stillDone = false;
        p.full.setEnv(this.env);
        placeModel(p.full.root, P.x, y, P.z, P.a);
        p.full.root.userData.still = true; // (parked: the 3D view may leave it out when hidden, tp/below-cull.ts)
        this.root.add(p.full.root);
      }
      if (r && (want === "far" || !p.full?.ready) && !p.far && body) {
        p.far = buildFar(body, look.colour, r, camD);
        placeModel(p.far.root, P.x, y + 0.02, P.z, P.a);
        p.far.root.userData.still = true;
        this.root.add(p.far.root);
      }
      // (its new model in: the old one goes, and it's made a still model — nothing on a parked car moves,
      // fewer draws; one a frame)
      if (p.full?.ready && p.old) {
        p.old.dispose();
        p.old = null;
      }
      if (p.full?.ready && !p.stillDone && tp && heavy < 1) {
        heavy++;
        p.stillDone = true;
        const dm = dmgOf(o.props?.dmg);
        p.full.setWear(Number(o.props?.grime) || 0, dm.zones, dm.parts, dm.wreck, dm.fire);
        p.full.setHoles?.(parseHoles(o.props?.holes));
        p.full.setChains?.(chainsOf(o.props), p.spec.wheel.r, p.spec.wheel.width);
        p.wearKey = wk;
        // (a mid model's dents pressed in and its pieces merged: most parked cars round you; a near one — a car or
        // two, its whole cabin — left as it was: merging it is a long frame, every time one comes near)
        if (p.level === "mid") {
          p.full.bakeStill?.();
          p.baked = wk;
        } else p.baked = undefined;
        tp.culling.stillModel(p.full.root);
      }
      // (plan 93 S1: shot where it stands — a whole model's dents, glass and holes as they are now; a merged
      // one's made again, above)
      if (p.full?.ready && p.stillDone && p.level === "near" && p.wearKey !== wk) {
        p.wearKey = wk;
        const dm = dmgOf(o.props?.dmg);
        p.full.setWear(Number(o.props?.grime) || 0, dm.zones, dm.parts, dm.wreck, dm.fire);
        p.full.setHoles?.(parseHoles(o.props?.holes));
        p.full.setChains?.(chainsOf(o.props), p.spec.wheel.r, p.spec.wheel.width);
      }
      // gone far: its model let go once its outline's in
      if (want === "far" && p.far?.ready() && (p.full || p.old)) {
        p.full?.dispose();
        p.old?.dispose();
        p.full = p.old = null;
        p.level = null;
      }
      // (gone far but its outline not in yet: its model stays)
      const shown = (want !== "far" || !p.far?.ready()) && !!p.full?.ready;
      if (p.full) {
        p.full.root.visible = shown;
        if (shown) {
          if (p.stillDone && p.level === "near") {
            const dm = dmgOf(o.props?.dmg);
            p.full.setWear(Number(o.props?.grime) || 0, dm.zones, dm.parts, dm.wreck, dm.fire);
          }
          if (role === "taxi") p.full.setBeacon(this.host.night() > 0.2, this.time);
        }
      }
      if (p.old) p.old.root.visible = !shown;
      if (p.far) p.far.root.visible = !shown && !p.old;
    }
    for (const [id, p] of this.parked)
      if (!seen.has(id)) {
        this.dropParked(p);
        this.parked.delete(id);
        this.unparked.set(id, this.time);
      }
    // the lot's empty bays snowed in (only where no car stands)
    if (!this.baySnow.mesh.parent) this.root.add(this.baySnow.mesh);
    this.baySnow.set([...this.parked.values()].map((p) => p.pose));
  }
  private baySnow = new BaySnow();
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
        spec: p.spec,
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
    p.full?.dispose();
    p.old?.dispose();
    p.far?.dispose();
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
        const r = this.host.tp()?.renderer;
        if (!r || !carManifest()) return;
        // (its look: its object's — chosen, or seeded from its id —, so it's the car that was parked there)
        const obj = this.objById(String(v.obj ?? ""));
        const look = lookFor(obj?.id ?? id, v.kind, obj?.props ?? { variant: v.colour, role: v.role });
        const model = buildCar({
          variant: look.variant,
          look,
          role: v.role || undefined,
          plate: v.plate || undefined,
          level: "near",
          renderer: r,
          pad: SEATS_OF[v.kind],
        });
        model.setEnv(this.env);
        this.root.add(model.root);
        const n = SEATS_OF[v.kind].at.length;
        l = {
          id,
          kind: v.kind,
          spec: variantSpec(v.kind, look.variant),
          look,
          model,
          pb: new CarPlayback<Sample>(),
          seq: -1,
          jump: -1,
          spin: 0,
          people: new Map(),
          sound: null,
          pose: { p: new Vector3(v.x, v.y, v.z), q: new Quaternion(v.qx, v.qy, v.qz, v.qw), v: new Vector3() },
          doors: model.doors.map(() => 0),
          doorUntil: new Array(n).fill(0),
          doorBy: model.doors.map(() => -1),
          win: 0,
          // (plan 62: a car parked here a moment ago has just been got into — its seats were empty;
          // one first seen out on the road already had them in it)
          prevSeats: this.wasParked(id) ? new Array(n).fill("") : String(v.seats ?? "|||").split("|"),
          role: v.role ?? "",
          fast: 0,
          exhaustAt: 0,
          pets: new Map(),
        };
        this.live.set(id, l);
        // (plan 98: its doors' and lids' takes in ahead — heard the first time, the engine off or on)
        for (const sl of [...doorSlots(l.kind), "boot", "bonnet"]) this.warmBody(sl);
      }
      // a new state from the server: a sample (or the server's put it somewhere: a jump)
      if (v.seq !== l.seq || (v.jump ?? 0) !== l.jump || !l.pb.buf.length) {
        l.seq = v.seq;
        l.jump = v.jump ?? 0;
        l.pb.push(
          {
            t: now,
            st: v.st ?? 0,
            p: new Vector3(v.x, v.y, v.z),
            q: new Quaternion(v.qx, v.qy, v.qz, v.qw).normalize(),
            v: new Vector3(v.vx, v.vy, v.vz),
            steer: v.steer,
            rpm: v.rpm,
            gear: v.gear,
            fl: v.fl,
            slip: v.slip,
            grip: (v.grip ?? 0) / 100,
            wc: v.wc,
            wy: v.wy ?? 0,
            thr: v.thr === undefined ? undefined : v.thr / 100,
          },
          now,
          l.jump,
        );
      }
      // (plan 93 S5) the windows wound down (a gun out of one: seatGun's)
      l.win = v.win ?? 0;
      for (let i = 0; i < l.model.seats.length; i++) {
        const door = l.model.doorOf ? l.model.doorOf(i) : -1;
        const sid = String(v.seats ?? "").split("|")[i];
        if (door >= 0 && !l.people.get(sid)?.gun && l.model.windowDown?.(door, !!(l.win & (1 << i))))
          this.windowMotor(l, door);
      }
      // (plan 93 S6) its chains
      l.model.setChains?.(v.chains ?? 0, l.spec.wheel.r, l.spec.wheel.width);
      // (plan 93 S1) where it's been shot
      if ((v.holes ?? "") !== (l.holes ?? "")) {
        l.holes = v.holes ?? "";
        l.model.setHoles?.(parseHoles(l.holes));
      }
      // its wear (mine: as my sim counts it — wearOn)
      if (this.mine?.vid !== id || this.mine.seat !== 0) {
        const dm = dmgOf(v.dmg);
        this.partsChanged(l, dm);
        l.steam = steamOf(dm);
        l.fire = dm.fire;
        l.model.setWear(v.grime ?? 0, dm.zones, dm.parts, dm.wreck, dm.fire);
      }
      const seats = String(v.seats ?? "|||").split("|");
      // someone in or out: their door swings open a moment (and shuts with a clunk)
      seats.forEach((sid, i) => {
        if ((sid || "") !== (l.prevSeats[i] || "")) {
          // (plan 98 phase 24: someone across inside it — the seat they left, the one they took —: no door)
          const moved = (sid && l.prevSeats.includes(sid)) || (!!l.prevSeats[i] && seats.includes(l.prevSeats[i]));
          if (moved) return;
          l.doorUntil[i] = this.time + 1.1;
          this.clunk(l, true, l.model.doorOf ? l.model.doorOf(i) : -1);
        }
      });
      l.prevSeats = seats;
      seats.forEach((sid, i) => {
        if (!sid) return;
        this.seated.add(sid);
        if (sid === mySid) mine = { vid: id, seat: i };
      });
      this.seatPeople(room, l, seats);
      this.seatPets(room, l);
    });
    for (const [id, l] of this.live)
      if (!seen.has(id)) {
        // (plan 93 C: parked as its last one got out — kept, drawn, till they've climbed out and shut it)
        if (l.people.size) {
          for (const e of l.people.values()) e.gone ??= this.time;
          l.linger = true;
          this.seatPeople(room, l, []);
          if (l.people.size) continue;
        }
        if (l.pulled) this.physics()?.carWorld.removePulled(l.pulled);
        // (plan 99 F3a: one car — parked now, its model kept where it stopped for its parked self to take on, not one
        // made again: a few seconds at most)
        if (id.startsWith("car:") && l.model.ready) {
          const old = this.handoff.get(id.slice(4));
          if (old) {
            this.root.remove(old.model.root);
            old.model.dispose();
          }
          l.model.doors.forEach((d) => d.open(0));
          l.model.setWeight?.(0, 0);
          this.handoff.set(id.slice(4), { model: l.model, at: this.time });
        } else {
          this.root.remove(l.model.root);
          l.model.dispose();
        }
        l.sound?.dispose();
        for (const p of l.people.values()) p.m.root.removeFromParent();
        for (const e of l.pets.values()) e.model.dispose();
        this.live.delete(id);
      }
    this.become(mine);
    // pose everyone else's from their samples (and pull their bodies in my Jolt world there)
    const ph = this.physics();
    for (const [id, l] of this.live) {
      if (this.mine?.vid === id && this.mine.sim) continue;
      if (this.coast?.vid === id) continue;
      this.poseRemote(l, now, dt);
      this.pullRemote(ph, l, dt);
    }
    this.coastFrame(room, dt, now);
    this.pullAi(ph, dt);
  }

  /** (docs/plan/92 phase 3) Someone else's car as a body in my Jolt world, pulled to where it's drawn. */
  private pullRemote(ph: BrowserPhysics | null, l: LiveView, dt: number) {
    if (!ph) return;
    const me = this.host.me();
    const far = Math.hypot(l.pose.p.x - me.x, l.pose.p.z - me.y) > 160;
    if (far) {
      if (l.pulled) ph.carWorld.removePulled(l.pulled);
      l.pulled = null;
      return;
    }
    const spec = l.spec;
    const p = l.pose;
    if (!l.pulled) {
      l.pulled = ph.carWorld.addPulled(
        { ...defOf(spec).hull, pts: hullPoints(l.look.variant, spec.cog) },
        spec.mass,
        p.p.x,
        p.p.y,
        p.p.z,
        [p.q.x, p.q.y, p.q.z, p.q.w],
        l.id,
      );
      if (!l.pulled) return;
    }
    l.pulled.pull(p.p.x, p.p.y, p.p.z, [p.q.x, p.q.y, p.q.z, p.q.w], [p.v.x, p.v.y, p.v.z], 0, dt);
  }
  /** (docs/plan/92 phase 3) The Grounds' own vehicles near me: the same, heavy. */
  private pullAi(ph: BrowserPhysics | null, dt: number) {
    if (!ph) return;
    const me = this.host.me();
    const keep = new Set<string>();
    for (const v of this.host.ai()) {
      if (!v.shown || Math.hypot(v.x - me.x, v.z - me.y) > 120) continue;
      const key = `ai:${v.kind}:${v.id ?? ""}`;
      keep.add(key);
      const b = aiBox(v.kind);
      const hull = { hx: b.hx, hy: 1.3, hz: b.hz, cx: 0, cy: 0 };
      const y = this.G.heightAt(v.x, v.z) + 1.6;
      const q: [number, number, number, number] = [0, Math.sin(-v.a / 2), 0, Math.cos(-v.a / 2)];
      let pc = this.aiPulled.get(key);
      if (!pc) {
        pc = ph.carWorld.addPulled(hull, 9000, v.x, y, v.z, q, key) ?? undefined;
        if (!pc) continue;
        this.aiPulled.set(key, pc);
      }
      const sp = v.v ?? 0;
      pc.pull(v.x, y, v.z, q, [Math.cos(v.a) * sp, 0, Math.sin(v.a) * sp], 0, dt);
    }
    for (const [k, pc] of this.aiPulled)
      if (!keep.has(k)) {
        ph.carWorld.removePulled(pc);
        this.aiPulled.delete(k);
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
        // (the life look: who a neutral avatar is drawn as, by their name — as out of the car)
        m.seed = C.nameSeed(p.name || sid);
        const hip = l.model.seats[i]?.hip ?? l.model.seats[0].hip;
        m.root.position.set(hip.x, 0, hip.z);
        m.root.rotation.y = -Math.PI / 2;
        // (plan 62: full size in a car whose cabin is drawn to fit — its pedals known —, else as before)
        m.root.scale.setScalar(l.model.pedals ? 1 : SEATED_OLD);
        l.model.body.add(m.root);
        // (sliding in only as they get in — its door just opened —, not a model remade or a car
        // first seen with them in it)
        const getting = (!e || e.seat !== i) && this.time < l.doorUntil[i];
        // (remade in the same seat — the camera into the cockpit as they get in —: still getting in)
        const at = e && e.seat === i ? e.at : getting ? this.time : -9;
        // (plan 93 F3a: the wheel taken from the passenger's side of an empty car — they stood there —: in by
        // that door, across after)
        let via: number | undefined = e && e.seat === i ? e.via : undefined;
        if (
          at === this.time &&
          i === 0 &&
          sid === room.sessionId &&
          this.myVia &&
          (this.myVia.id === l.id || `car:${this.myVia.id}` === l.id)
        )
          via = this.myVia.via;
        else if (at === this.time && i === 0) {
          // (plan 98: the server's word for it — the door they came in by)
          const vv = (room.state.vehicles.get(l.id) as VehWire | undefined)?.via ?? -1;
          if (vv > 0 && l.model.seats[vv] && !seats[vv]) via = vv;
        }
        // (plan 98 phase 24: across from another seat of it — a slide, no act at the door)
        if (e && e.seat !== i && e.gone === undefined) {
          via = e.seat;
          e.m.root.removeFromParent();
          e = { m, seat: i, key, at: this.time - ENTER_S, via, belted: true };
        } else e = { m, seat: i, key, at, via, belted: at < 0 };
        // (plan 98: in from where I stood — my walker's place —: the act's first beat steps onto the door's spot)
        if (at === this.time && sid === room.sessionId) {
          const me = this.host.me();
          const b = this.bodyPoint(l, me.x, me.y);
          if (Math.hypot(b.x - l.model.seats[via ?? i].hip.x, b.z - l.model.seats[via ?? i].hip.z) < 2.5)
            e.from = { ...b, yaw: Math.atan2(0, -Math.sign(b.z) || -1) };
        }
        l.people.set(sid, e);
      }
    });
    for (const [sid, e] of l.people)
      if (!keep.has(sid)) {
        // (plan 62: just got out — the door open —: kept a moment, climbing out by it; hidden as a
        // person till then, so there's one of them)
        // (plan 98: let go of getting in — gone at once, no climbing out)
        if (sid === room.sessionId && this.cancelled === l.id) {
          this.cancelled = "";
          e.gone = this.time - EXIT_S;
          // (out on the move: the door flung open behind them, on its hinge from there)
          const d = l.model.doorOf ? l.model.doorOf(e.seat) : -1;
          if (d >= 0 && Math.hypot(l.pose.v.x, l.pose.v.z) > 2.5) {
            l.doorUntil[e.seat] = 0;
            l.doors[d] = Math.max(l.doors[d] ?? 0, 0.7);
            (l.doorW ??= [])[d] = 2.5;
          }
        }
        if (e.gone === undefined && this.time < l.doorUntil[e.seat]) e.gone = this.time;
        if (e.gone !== undefined && this.time - e.gone < EXIT_S) {
          this.seated.add(sid);
          continue;
        }
        e.m.root.removeFromParent();
        for (const g of Object.values(e.drv?.grips ?? {})) g?.a.removeFromParent();
        e.handle?.removeFromParent();
        e.pull?.removeFromParent();
        e.gun?.held?.drop();
        // (the door they held let go: the timer's again)
        l.doorBy?.fill(-1);
        l.people.delete(sid);
      } else e.gone = undefined;
    // posed: sitting, the driver's hands on the wheel (plan 62: fitted to the seat — the back to its
    // back, the feet to the pedals or the floor —, getting in and out by the door)
    const C2 = C;
    const A = C2.actsNow();
    // (plan 93 S8) how the car's going, for its people's bodies: the road wheels' angle, the speed, the horn,
    // the indicator, the gear (mine from my sim; another's from its driver's last state)
    const own = this.mine?.vid === l.id && this.mine.sim ? this.mine : null;
    const last = l.pb.buf[l.pb.buf.length - 1];
    const fl = own ? this.flags(own.sim as CarState) : (last?.fl ?? 0);
    const going = {
      steer: own ? (own.sim as CarState).str : (last?.steer ?? 0),
      v: Math.hypot(l.pose.v.x, l.pose.v.z),
      horn: own ? this.hornNow() : !!(fl & CAR_FLAGS.horn),
      ind: fl & CAR_FLAGS.hazard ? 0 : fl & CAR_FLAGS.left ? 1 : fl & CAR_FLAGS.right ? -1 : 0,
      gear: own ? (own.sim as CarState).gear : (last?.gear ?? 0),
      manual: !!own && !!prefs().carManual,
    };
    // the car's sideways g (m/s², + turning right: its people pushed to their left) and their lean by it
    const latG = (going.v * going.v * Math.tan(going.steer)) / Math.max(1.5, l.spec.wheelbase);
    const lean = Math.max(-0.12, Math.min(0.12, (latG / 9.81) * 0.12));
    const dtSeat = Math.min(0.1, Math.max(0, this.time - (l.seatT ?? this.time)));
    l.seatT = this.time;
    const jolt = this.crashOf(l, dtSeat);
    for (const [sid, e] of l.people) {
      // (plan 93 S2) aimed out of their window: mine with the right button; another's a moment after their shot
      const aimDir = this.aimOf(l, sid, e.seat);
      // (plan 98) getting in or out by hand: the act's pose (car/getin.ts) — the hips on their path, each foot planted
      // or over the sill, ducked, the hands on the door and the roof —, blended into the seat's own as they settle
      const g = this.carAct(l, e, sid);
      const seat = l.model.seats[g.seat];
      const seatAt = seat.hip;
      const act = g.act;
      const across = act ? 1 - act.sat : 0;
      if (act) {
        e.m.root.position.set(act.hips.x, 0, act.hips.z);
        e.m.root.rotation.y = act.yaw;
      } else {
        e.m.root.position.set(g.slide?.x ?? seatAt.x, 0, g.slide?.z ?? seatAt.z);
        e.m.root.rotation.y = -Math.PI / 2;
      }
      if (!e.m.update()) continue;
      const s = e.m.root.scale.x;
      // (the driver at the wheel only once across in it)
      const driver = e.seat === 0 && g.seat === 0;
      if (A) {
        const fit = carFit(e.m, seat, driver, l.model, s, -1);
        // (plan 93 S8: everyone leans with the g; the driver looks into the turn, and at a mirror as the
        // indicator goes on)
        fit.lean = lean * (1 - across);
        if (driver) fit.look = this.driverLook(e, going) * (1 - across);
        // (plan 93 S8: backing up, round in the seat — the head over the shoulder toward the car's middle, the trunk
        // turned with it)
        const backing = driver && going.gear === -1 && across <= 0 && !aimDir;
        e.rev = Math.max(0, Math.min(1, (e.rev ?? 0) + (backing ? dtSeat / 0.5 : -dtSeat / 0.4)));
        if (e.rev > 0) {
          const k = e.rev * e.rev * (3 - 2 * e.rev);
          const toMiddle = -(Math.sign(seatAt.z) || 1);
          fit.look = (fit.look ?? 0) * (1 - k) + toMiddle * 1.45 * k;
          fit.twist = toMiddle * 0.5 * k;
        }
        if (jolt) fit.jolt = jolt * (1 - across);
        // (aiming: the head turned out of their side's window)
        if (aimDir) fit.look = (Math.sign(l.model.seats[e.seat]?.hip.z ?? 1) || 1) * 1.1;
        const sat = A.car3(fit, this.time, e.seat * 1.7);
        const l3 = sat.lift ?? [0, 0, 0];
        if (act && act.sat < 1) {
          // (the act in her own space: the root under the hips, facing `yaw`)
          const cy = Math.cos(act.yaw);
          const sy = Math.sin(act.yaw);
          const own = (p: Vector3): [number, number, number] => {
            const dx = p.x - act.hips.x;
            const dz = p.z - act.hips.z;
            return [(dx * cy - dz * sy) / s, p.y / s, (dx * sy + dz * cy) / s];
          };
          const side = Math.sign(seat.hip.z) || 1;
          const step = A.carStep(
            {
              hipY: act.hips.y / s,
              feet: [own(act.feet[0]), own(act.feet[1])],
              toe: act.toe,
              duck: act.duck,
              // (toward the car: her right on its +z side)
              side: act.lean * side,
            },
            this.time,
          );
          const k = act.sat;
          const ly = act.hips.y / s - fit.stand;
          e.m.setPose(k > 0 ? C2.blend(step.pose, sat.pose, k) : step.pose, [
            l3[0] * k,
            ly + (l3[1] + fit.drop - ly) * k,
            l3[2] * k,
          ]);
          if (k > 0 && sat.hands)
            e.m.handsTo({
              L: sat.hands.L && { ...sat.hands.L, w: k },
              R: sat.hands.R && { ...sat.hands.R, w: k },
            });
        } else {
          e.m.setPose(sat.pose, [l3[0], l3[1] + fit.drop, l3[2]]);
          if (sat.hands) e.m.handsTo(sat.hands);
        }
      } else e.m.setPose(C2.carPose(driver), [0, e.m.sitDrop((seatAt.y + 0.02) / s), 0]);
      if (driver && across < 1) this.driverHands(l, e, 1 - across, going);
      // (plan 98) the hands on the door and the roof: its handle from outside, its frame, its pull from in (after the
      // wheel's: they win)
      if (act && g.way)
        for (const h of act.hands) {
          const at =
            h.at === "roof"
              ? l.model.body.localToWorld(roofGrip(g.way, hB))
              : h.at === "seat"
                ? l.model.body.localToWorld(seatGrip(g.way, hB))
                : h.at === "saddle"
                  ? l.model.body.localToWorld(hB.set(g.way.hip.x + 0.28, g.way.hip.y + 0.06, g.way.hip.z))
                  : h.at === "wheel"
                    ? l.model.body.localToWorld(l.model.rim(g.way.s * 0.75, hB))
                    : ((h.at === "handle" ? e.handle : h.at === "pull" ? e.pull : e.top) as Object3D).getWorldPosition(
                        hB,
                      );
          e.m.reachTo(h.S, at, h.w, [-0.6, -1, -0.45]);
          const dbg = (globalThis as { __actDbg?: unknown[] }).__actDbg;
          if (dbg) {
            const w = e.m.bones[`wrist${h.S}`].getWorldPosition(hE);
            const sh = e.m.bones[`shoulder${h.S}`].getWorldPosition(hF);
            const L = (v: Vector3) =>
              l.model.body
                .worldToLocal(v.clone())
                .toArray()
                .map((x) => +x.toFixed(2));
            dbg.push({ S: h.S, at: h.at, w: +h.w.toFixed(2), target: L(at), wrist: L(w), shoulder: L(sh) });
          }
        }
      this.seatGun(l, sid, e, aimDir, across);
      this.armOut(l, e, across, going, dtSeat);
      this.bodyLife(l, e, driver, across, going, latG, dtSeat);
    }
  }

  /** (plan 93 S8) The rest of a body in a car, after its hands are set: the driver backing up with an arm over the
   *  passenger's seat back; at a stop a while, a hand off the wheel onto the thigh; a passenger in a hard turn,
   *  the hand by their door up on the grab handle over it. Each eased in and out. */
  private bodyLife(
    l: LiveView,
    e: LiveView["people"] extends Map<string, infer P> ? P : never,
    driver: boolean,
    across: number,
    g: { v: number; horn: boolean; gear: number },
    latG: number,
    dt: number,
  ) {
    const seat = l.model.seats[e.seat];
    if (!seat || across > 0 || e.gun) return;
    const body = l.model.body;
    const side = Math.sign(seat.hip.z) || 1;
    const ease = (k: number) => k * k * (3 - 2 * k);
    const inner: "L" | "R" = side > 0 ? "R" : "L";
    if (driver) {
      // (the arm toward the car's middle over the seat beside: its back's top)
      const k = ease(e.rev ?? 0);
      const beside = l.model.seats[1];
      if (k > 0 && beside) {
        const at = body.localToWorld(hA.set(beside.hip.x + 0.18, beside.hip.y + 0.62, beside.hip.z * 0.7));
        e.m.reachTo(inner, at, k, [-0.9, -0.2, -0.6], false);
      }
      // (stopped two seconds, not backing, nothing on the horn, the lever left: the hand by the middle on the thigh)
      e.still = g.v < 0.3 ? (e.still ?? 0) + dt : 0;
      const resting = e.still > 2 && !e.rev && !g.horn;
      e.rest = Math.max(0, Math.min(1, (e.rest ?? 0) + (resting ? dt / 0.7 : -dt / 0.2)));
      if (e.rest > 0) {
        const knee = e.m.bones[`knee${inner}`];
        const thigh = e.m.bones[`thigh${inner}`];
        if (knee && thigh) {
          const at = knee.getWorldPosition(hB).lerp(thigh.getWorldPosition(hC), 0.4);
          at.y += 0.07;
          e.m.reachTo(inner, at, ease(e.rest), [-0.4, -1, -0.2], false);
        }
      }
      return;
    }
    // a passenger: pushed toward their door by the g (+ latG: turning right, pushed to their left) — a hand up
    const toDoor = side > 0 ? latG : -latG;
    e.grab = Math.max(0, Math.min(1, (e.grab ?? 0) + (toDoor > 3.5 ? dt / 0.25 : -dt / 0.6)));
    if (e.grab > 0 && l.model.doorOf && l.model.doorOf(e.seat) >= 0) {
      const sill = l.model.sillOf?.(l.model.doorOf(e.seat));
      // (over the door, inside: just under the roof's edge, in from the glass, a little ahead of the shoulder)
      const top = beltOf(l.spec).roof - 0.14;
      const out = sill ? sill.out - 0.24 : Math.abs(seat.hip.z) + 0.18;
      const at = body.localToWorld(hA.set(seat.hip.x - 0.12, top, side * out));
      e.m.reachTo(side > 0 ? "L" : "R", at, ease(e.grab), [-0.8, -0.6, -0.4]);
    }
  }

  /** (plan 93 S5, F9a) A big crash — the speed lost in a tenth of a second, past ~6 m/s: its people thrown in
   *  their belts (forward by its front's, back into the seat by its back's), nobody out of their seat; in it
   *  myself, the blow felt (`daze`). Returns this frame's jolt (rad, + forward), 0 none. */
  private crashOf(l: LiveView, dt: number): number {
    const v = l.pose.v;
    if (!l.prevV || l.jumpSeen !== l.jump) {
      l.prevV = (l.prevV ?? new Vector3()).copy(v);
      l.jumpSeen = l.jump;
      l.dvSum = 0;
      l.dvV?.set(0, 0, 0);
    }
    const dv = Math.hypot(v.x - l.prevV.x, v.y - l.prevV.y, v.z - l.prevV.z);
    const fade = Math.exp(-dt / 0.08);
    l.dvV ??= new Vector3();
    const dV = l.dvV.multiplyScalar(fade);
    if (dv < 30) dV.add(hA.copy(v).sub(l.prevV));
    l.dvSum = (l.dvSum ?? 0) * fade + (dv < 30 ? dv : 0);
    if (l.dvSum > 6 && (!l.crash || this.time - l.crash.t > 1.2)) {
      const a = headingFromQ(l.pose.q);
      // (they go on as it was going: thrown against its change — its nose stopped, forward over the belt; struck
      // from behind or backed into something, back into the seat; from the side, a little forward)
      const along = dV.x * Math.cos(a) + dV.z * Math.sin(a);
      const dir = Math.abs(along) < l.dvSum * 0.25 ? 0.5 : Math.sign(-along);
      l.crash = { t: this.time, k: Math.min(1, (l.dvSum - 4) / 10), dir };
      if (this.mine?.vid === l.id) this.daze(l.crash.k);
    }
    l.prevV.copy(v);
    const c = l.crash;
    const u = c ? this.time - c.t : 9;
    if (!c || u > 1.4) return 0;
    // (out and back: the belt's give, then the seat's back)
    return c.k * c.dir * 0.55 * Math.exp(-3.5 * u) * Math.sin(Math.min(Math.PI * 3, u * 11));
  }

  /** (plan 93 S5) The blow felt in a crash (0..1): the camera knocked, the picture blurred a moment, the ears
   *  ringing over the world's dulled sound — plan 88's struck feel, from the belt's side. */
  private dazeEnd = 0;
  private daze(k: number) {
    this.cam.knock(0.6 + 0.4 * k);
    const cv = (this.host.tp() as { renderer?: { domElement: HTMLCanvasElement } } | null)?.renderer?.domElement;
    if (cv && !this.cam.reduced) {
      cv.style.transition = "none";
      cv.style.filter = `blur(${(2 + 5 * k).toFixed(1)}px)`;
      const end = performance.now() + 120;
      this.dazeEnd = end;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (this.dazeEnd !== end) return;
          cv.style.transition = `filter ${(0.9 + 1.2 * k).toFixed(2)}s ease-out`;
          cv.style.filter = "";
        }),
      );
    }
    const c = mixer.ctx;
    if (!c || c.state !== "running") return;
    const t = c.currentTime;
    const len = 1.6 + 2.4 * k;
    // (the ring: a high tone with a slow waver, in the ears — not out there, not dulled with the world)
    const o = c.createOscillator();
    o.frequency.value = 3400 + Math.random() * 900;
    const lfo = c.createOscillator();
    lfo.frequency.value = 3.1;
    const lg = c.createGain();
    lg.gain.value = 14;
    lfo.connect(lg).connect(o.frequency);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.03 + 0.04 * k, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(mixer.clear);
    o.start(t);
    lfo.start(t);
    o.stop(t + len + 0.05);
    lfo.stop(t + len + 0.05);
    mixer.stun(0.5 + 0.4 * k, len * 0.8);
  }

  /** (plan 93 S5) An arm out on the sill: their own window down, at a cruise (past ~25 km/h, the wheel near
   *  straight), not aiming — the forearm across the door's top, the hand over its outer edge, the elbow out in
   *  the air; the driver's window-side hand off the wheel for it, back to it as a turn comes. */
  private armOut(
    l: LiveView,
    e: LiveView["people"] extends Map<string, infer P> ? P : never,
    across: number,
    g: { steer: number; v: number },
    dt: number,
  ) {
    const seat = l.model.seats[e.seat];
    const door = l.model.doorOf ? l.model.doorOf(e.seat) : -1;
    const want =
      !!seat &&
      door >= 0 &&
      !!(l.win & (1 << e.seat)) &&
      across <= 0 &&
      !e.gun &&
      g.v > ((e.sill ?? 0) > 0 ? 5 : 7) &&
      Math.abs(g.steer) < (e.seat === 0 ? 0.06 : 0.25) &&
      (e.seat !== 0 || !this.input.horn);
    e.sill = Math.max(0, Math.min(1, (e.sill ?? 0) + (want ? dt / 0.9 : -dt / 0.35)));
    const k = e.sill;
    if (k <= 0 || !seat) return;
    const hip = seat.hip;
    const side = hip.z > 0 ? 1 : -1;
    const S: "L" | "R" = side > 0 ? "L" : "R";
    // (the sill: the door's glass's foot as the model has it, else the spec's belt; the hand on the door's top just
    // ahead of the shoulder, over its outer edge — the forearm along the sill)
    const sill = l.model.sillOf?.(door) ?? { y: beltOf(l.spec).belt, out: Math.abs(hip.z) + 0.45 };
    const body = l.model.body;
    const at = body.localToWorld(hA.set(hip.x - 0.32, sill.y + 0.05, side * (sill.out + 0.06)));
    const kk = k * k * (3 - 2 * k);
    // (the elbow out and a little back: past the glass's line)
    e.m.reachTo(S, at, kk, [-1, -0.25, -0.5], false);
  }

  /** (plan 98 phases 1–3) Someone getting into a car or out of it, by hand (car/getin.ts): in by the door of the
   *  seat they're for — from the passenger's side of an empty car, across to the wheel after (SLIDE_S) —, out by
   *  their own seat's. The act's pose (null sat, or sliding across); the door's opening held where the hand has it,
   *  for everyone who sees them. */
  private carAct(
    l: LiveView,
    e: LiveView["people"] extends Map<string, infer P> ? P : never,
    sid: string,
  ): { seat: number; act: ActPose | null; slide: Vector3 | null; way: Doorway | null } {
    const mod = l.model;
    const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
    const tIn = this.time - e.at;
    const leaving = e.gone !== undefined;
    const t0 = (globalThis as { __actAt?: { t: number; out?: boolean } | null }).__actAt;
    const t = t0 ? t0.t : leaving ? this.time - (e.gone as number) : tIn;
    const out = t0 ? !!t0.out : leaving;
    // (out by their own seat's door: the passenger's was only the way in)
    const via = e.via !== undefined && !out && (t0 ? t0.t : tIn) < ENTER_S + SLIDE_S ? e.via : undefined;
    const seatIn = via ?? e.seat;
    const door = mod.doorOf ? mod.doorOf(seatIn) : -1;
    const acting = out ? t < EXIT_S : t < ENTER_S;
    const way = door >= 0 ? this.doorway(l, e, seatIn, door) : this.doorway(l, e, seatIn, -1);
    let act: ActPose | null = null;
    let slide: Vector3 | null = null;
    if (acting && way && door < 0) {
      // (plan 98 phase 4: no door — straddled)
      act = straddleAt(way, Math.max(0, t), out, out ? null : (e.from ?? null), (e.act ??= newActPose()));
    } else if (acting && way) {
      // (where they stood as it began: mine, my walker's; the way out — to where the server has them now)
      const p = this.host.room()?.state.players.get(sid) as { x: number; y: number } | undefined;
      const to = out && p ? this.bodyPoint(l, p.x, p.y) : null;
      act = actAt(way, Math.max(0, t), out, out ? null : (e.from ?? null), to, (e.act ??= newActPose()));
      this.doorMarks(l, e, door, way);
      // (plan 98 phase 7) the belt clicked home as they settle, undone as they start out; the key's chime with the
      // driver's door open on the way out
      const hipW = l.model.body.localToWorld(hA.copy(way.hip));
      if (!out && t >= ENTER_S - 0.3 && !e.belted) {
        e.belted = true;
        this.bodyShot("belt", 0.2, hipW);
      }
      if (out && e.belted && t > 0.05) {
        e.belted = false;
        this.bodyShot("belt", 0.16, hipW);
      }
      if (out && way.driver && sid === this.host.room()?.sessionId && t > 0.25 && t < 1.7) {
        const k = Math.floor((t - 0.25) / 0.55);
        if (k !== e.chimed) {
          e.chimed = k;
          this.chime(hipW);
        }
      }
    } else if (!out && via !== undefined && t >= ENTER_S) {
      const k = ease((t - ENTER_S) / SLIDE_S);
      const a = mod.seats[via].hip;
      const b = mod.seats[e.seat].hip;
      slide = hC.set(a.x + (b.x - a.x) * k, 0, a.z + (b.z - a.z) * k);
    }
    if (door >= 0 && l.doorBy) l.doorBy[door] = act && act.door >= 0 ? Math.min(1.05, act.door * 1.05) : -1;
    return { seat: slide && t < ENTER_S + SLIDE_S * 0.5 ? (via as number) : act ? seatIn : e.seat, act, slide, way };
  }
  /** (plan 99 F2a) The car I jumped out of, rolling on: stepped on Jolt as mine was — its wheel let go, no pedals —,
   *  drawn from that, said to the server twenty times a second (it takes it from me: I'm its `coaster`), heard; let go
   *  once it's been still a second (the server parks it), someone takes its wheel, or 30 s. */
  private coastFrame(room: RoomLike, dt: number, now: number) {
    const m = this.coast;
    if (!m) return;
    const l = this.live.get(m.vid);
    const s = m.sim;
    const d = m.drive;
    const ph = this.physics();
    const vw = room.state.vehicles.get(m.vid) as VehWire | undefined;
    const taken = !!String(vw?.seats ?? "").split("|")[0];
    const speed = s ? Math.hypot(s.v.x, s.v.z) : 0;
    this.coastStill = speed < 0.3 ? this.coastStill + dt : 0;
    if (!l || !s || !d || !ph || taken || this.coastStill > 1 || this.time - this.coastAt > 30) {
      if (s && vw && !taken) room.send("car:state", toWire(s, ++m.seq, 0, m.simMs));
      if (d && ph) {
        ph.carWorld.removeCar(d.car);
        ph.ownCar(m.vid, false);
      }
      m.sound?.switchOff();
      m.sound?.dispose();
      this.coast = null;
      return;
    }
    const c = { up: 0, down: 0, steer: 0, hand: 0, digital: false };
    m.acc += Math.min(dt, 0.25);
    let n = 0;
    while (m.acc >= CAR_STEP && n < CAR_STEPS_MAX) {
      d.pre(c, this.world, CAR_STEP, this.helps);
      ph.carStep(CAR_STEP);
      d.post(this.world, CAR_STEP);
      m.rig?.stepped();
      m.simMs += CAR_STEP * 1000;
      m.acc -= CAR_STEP;
      n++;
    }
    if (n === CAR_STEPS_MAX) m.acc = Math.min(m.acc, CAR_STEP);
    ph.carStepped = true;
    m.rig?.pose(Math.min(1, m.acc / CAR_STEP), dt, this.time);
    l.pose.p.set(s.p.x, s.p.y, s.p.z);
    l.pose.q.set(s.q.x, s.q.y, s.q.z, s.q.w);
    l.pose.v.set(s.v.x, s.v.y, s.v.z);
    if (now - m.sentAt >= 1000 / CAR_HZ) {
      m.sentAt = now;
      room.send("car:state", toWire(s, ++m.seq, s.rpm > 50 ? CAR_FLAGS.engine : 0, m.simMs));
    }
    const heard = this.heardAt(s.p.x, s.p.y, s.p.z);
    m.sound?.update(s, { inside: false, dist: heard?.dist ?? 0, at: heard?.at ?? null }, dt, false, false, {});
  }
  /** (plan 99 F5a) My own body still climbing out of a car (its act's), or null. */
  private myExit() {
    const sid = this.host.room()?.sessionId;
    if (!sid) return null;
    for (const l of this.live.values()) {
      const e = l.people.get(sid);
      if (e?.gone !== undefined && this.time - e.gone < EXIT_S) return e;
    }
    return null;
  }
  /** (plan 99 F5a) the walking keys held now (a move while climbing out hurries the act) */
  private moveKeys = new Set<string>();
  private keysOn = false;
  private watchKeys() {
    if (this.keysOn || typeof window === "undefined") return;
    this.keysOn = true;
    const MOVE = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
    window.addEventListener("keydown", (ev) => MOVE.has(ev.code) && this.moveKeys.add(ev.code));
    window.addEventListener("keyup", (ev) => this.moveKeys.delete(ev.code));
    window.addEventListener("blur", () => this.moveKeys.clear());
  }
  /** (plan 98) How far into getting in I am (s), or null: not getting in (sat, out, or seen sat already). */
  private myActT(): number | null {
    const m = this.mine;
    const sid = this.host.room()?.sessionId;
    const e = m && sid ? this.live.get(m.vid)?.people.get(sid) : undefined;
    if (!e || e.gone !== undefined || e.at < 0) return null;
    const t = this.time - e.at;
    return t < ENTER_S + SLIDE_S ? t : null;
  }
  /** (plan 98) The car I let go of getting into (walked off early): out at once, not climbing out. */
  private cancelled = "";
  /** (plan 99 F2a) the car I jumped out of, rolling on: still mine to drive on Jolt (nobody's hands on it) and to say to
   *  everyone, till it's settled; and the one to keep so, asked as I jump */
  private coast: NonNullable<Cars["mine"]> | null = null;
  private coastWant = "";
  private coastStill = 0;
  /** (plan 99 F3a) a car just parked: the model it was driven with, kept for its parked self (by its object's id) */
  private handoff = new Map<string, { model: Sedan; at: number }>();
  private coastAt = 0;
  /** (plan 98) The camera's place off me as the act began (the world's): kept as I go in, then the car's. */
  private actCam: Vector3 | null = null;
  /** (plan 98) the on-foot camera off what it looks at (my head), as I asked to get in */
  private camBefore: Vector3 | null = null;
  private camOff(): Vector3 | null {
    const tp = this.host.tp();
    return tp ? tp.camera.position.clone().sub(tp.target) : null;
  }
  /** (plan 98) when the car's HUD comes up: once I'm sat */
  private hudAt = 0;
  /** (plan 98) Where someone stands to get in by a seat's door of a parked car (the Grounds' x, y): beside the
   *  door's back edge, a forearm out from it — the act's first beat — as its model measures it. */
  private stanceOf(id: string, seat: number): { x: number; y: number } | null {
    const mod = this.parked.get(id)?.full;
    const door = mod?.doorOf?.(seat) ?? -1;
    const op = door >= 0 ? mod?.openingOf?.(door) : null;
    if (!mod || !op || !mod.seats[seat]) return null;
    const s = Math.sign(mod.seats[seat].hip.z) || 1;
    mod.root.updateMatrixWorld(true);
    const w = mod.body.localToWorld(hA.set(op.x1 + 0.2, 0, s * (op.out + 0.42)));
    const g = this.root.worldToLocal(w);
    return { x: g.x, y: g.z };
  }
  /** (plan 98 phase 6) A car's acceleration this frame in its body's own frame (m/s², eased a little, at most 30). */
  private bodyAcc(l: LiveView, dt: number): Vector3 {
    const out = (l.accB ??= new Vector3());
    if (dt <= 0) return out;
    const prev = (l.accV ??= l.pose.v.clone());
    const a = hD.copy(l.pose.v).sub(prev).divideScalar(dt);
    prev.copy(l.pose.v);
    if (a.length() > 30) a.setLength(30);
    l.model.body.getWorldQuaternion(this.qAcc).invert();
    a.applyQuaternion(this.qAcc);
    this.vB.copy(l.pose.v).applyQuaternion(this.qAcc);
    return out.lerp(a, Math.min(1, dt * 20));
  }
  private qAcc = new Quaternion();
  /** (plan 98) the car's velocity in its body's frame, as last worked out by bodyAcc */
  private vB = new Vector3();
  /** (plan 98) A point of the Grounds (x, y) in a car body's frame. */
  private bodyPoint(l: LiveView, x: number, y: number): { x: number; z: number } {
    const w = this.root.localToWorld(hD.set(x, l.pose.p.y, y));
    const b = l.model.body.worldToLocal(w);
    return { x: b.x, z: b.z };
  }
  /** (plan 98) The car's measures for a seat and its door, for the act (fitted to the person in it). */
  private doorway(
    l: LiveView,
    e: LiveView["people"] extends Map<string, infer P> ? P : never,
    seatIn: number,
    door: number,
  ): Doorway | null {
    const mod = l.model;
    const seat = mod.seats[seatIn];
    // (no door: straddled from the side they stood on — the seat's own side, else the left)
    const fs = e.from ? Math.sign(e.from.z - (seat?.hip.z ?? 0)) : 0;
    const op =
      door >= 0
        ? (mod.openingOf?.(door) ?? null)
        : seat && !mod.doors.length
          ? {
              x0: seat.hip.x - 0.4,
              x1: seat.hip.x + 0.4,
              y0: 0,
              y1: seat.hip.y,
              out: Math.abs(seat.hip.z) + 0.3,
              glass: seat.hip.y,
              slide: false,
            }
          : null;
    if (!seat || !op) return null;
    const k = e.m.root.scale.x || 1;
    const fit = carFit(e.m, seat, seatIn === 0, mod, k, -1);
    // (each foot sat, from her own space — x out to its side, ahead, up — into the body's: sat facing −x)
    const satFeet = fit.feet.map((f, i) => {
      const left = (i === 0 ? 1 : -1) * f[0];
      return new Vector3(seat.hip.x - f[1] * k, f[2] * k, seat.hip.z + left * k);
    }) as [Vector3, Vector3];
    const s = door < 0 ? fs || Math.sign(seat.hip.z) || 1 : Math.sign(seat.hip.z) || 1;
    return {
      s,
      op,
      hip: seat.hip,
      floor: seat.floor ?? mod.floor ?? seat.hip.y - 0.4,
      stand: fit.stand * k,
      satHip: (fit.stand + fit.drop) * k,
      satFeet,
      k,
      driver: seatIn === 0 && !!mod.rim,
    };
  }
  /** (plan 93 C, plan 98) The door's handle, its inside pull and its frame's top at the back: marks on the door's own
   *  group, put on while it's shut, so a hand stays on them as it swings. */
  private doorMarks(
    l: LiveView,
    e: LiveView["people"] extends Map<string, infer P> ? P : never,
    door: number,
    way: Doorway,
  ) {
    const mod = l.model;
    const dg = mod.doors[door].group;
    if (e.handle && e.handle.parent === dg && e.top) return;
    const a = l.doors[door] ?? 0;
    mod.doors[door].open(0);
    mod.root.updateMatrixWorld(true);
    e.handle?.removeFromParent();
    e.pull?.removeFromParent();
    e.top?.removeFromParent();
    const h = new Object3D();
    const pu = new Object3D();
    const tp = new Object3D();
    dg.add(h, pu, tp);
    const { op, s } = way;
    const mid = (op.y0 + op.y1) / 2;
    // (the handle: just ahead of the door's back edge, under the glass, on its skin; the pull inside, ahead of it,
    // at the armrest; the frame's top at the back, over the glass)
    h.position.copy(dg.worldToLocal(mod.body.localToWorld(hA.set(op.x1 - 0.1, mid + 0.06, s * (op.out + 0.01)))));
    pu.position.copy(dg.worldToLocal(mod.body.localToWorld(hA.set(op.x1 - 0.42, mid + 0.02, s * (op.out - 0.1)))));
    tp.position.copy(
      dg.worldToLocal(mod.body.localToWorld(hA.set(op.x1 - 0.14, op.glass + 0.02, s * (op.out - 0.04)))),
    );
    e.handle = h;
    e.pull = pu;
    e.top = tp;
    mod.doors[door].open(a);
  }

  /** (plan 93 S4) A car's own storage open here (the pack shows it in the ground's place): sat in its front, its
   *  glove box; the boot I opened, while I'm still behind it. */
  store(): { kind: "boot" | "glove"; id: string; label: string; items: Stored[] } | null {
    const room = this.host.room();
    if (!room) return null;
    const m = this.mine;
    if (m) {
      const obj = String((room.state.vehicles.get(m.vid) as VehWire | undefined)?.obj ?? "");
      // (plan 98: not while still getting in)
      const at = this.myActT();
      if (m.seat > 1 || !obj || (at !== null && at < ENTER_S)) return null;
      return { kind: "glove", id: obj, label: t("carGlove"), items: storeOf(this.propsOf(obj), "glove") };
    }
    const b = this.bootOpen;
    if (!b || this.bootNear(b.id) !== b.id) return null;
    return { kind: "boot", id: b.id, label: t("carBootIn"), items: storeOf(this.propsOf(b.id), "boot") };
  }
  private propsOf(id: string): Record<string, unknown> | null {
    const o = this.host.room()?.state.objects.get(id) as { props?: string } | undefined;
    try {
      return o?.props ? (JSON.parse(o.props) as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  /** (plan 93 S7) A car's tow eye (`end`: its back's, its front's) where it is now — driven (as drawn) or parked —,
   *  the cars' group's frame, and its velocity; by its object's id. */
  private eyeOf(obj: string, end: "back" | "front", out: Vector3): { at: Vector3; v: Vector3 } | null {
    let pos: { x: number; y: number; z: number; a: number; up: number; v: Vector3 } | null = null;
    let spec: CarSpec | null = null;
    const room = this.host.room();
    for (const l of this.live.values()) {
      const vw = room?.state.vehicles.get(l.id) as VehWire | undefined;
      if (vw?.obj !== obj) continue;
      spec = l.spec;
      pos = { x: l.pose.p.x, y: l.pose.p.y, z: l.pose.p.z, a: headingFromQ(l.pose.q), up: -l.spec.cog, v: l.pose.v };
    }
    const p = pos ? null : this.parked.get(obj);
    if (p) {
      spec = p.spec;
      pos = { x: p.pose.x, y: p.pose.y, z: p.pose.z, a: p.pose.a, up: 0, v: ZERO_V };
    }
    if (!pos || !spec) return null;
    const u = end === "back" ? -(spec.body.behind + 0.05) : spec.body.ahead + 0.05;
    out.set(pos.x + Math.cos(pos.a) * u, pos.y + pos.up + spec.clearance + 0.12, pos.z + Math.sin(pos.a) * u);
    return { at: out, v: pos.v };
  }
  /** (plan 93 S7) The rope's pull on my car (its eye's end): stretched past its length, a spring and its damping,
   *  along it (never a push) — the other end where its driver's car says it is (or parked: an anchor). */
  private ropeTold = "";
  private ropePull(s: CarState, vw: VehWire | undefined): Drive["ext"] {
    const other = vw?.towing || vw?.towedBy || "";
    if (!vw || !other) return null;
    const mine = vw.towing ? "back" : "front";
    const c = Math.cos(headingOf(s.q));
    const sn = Math.sin(headingOf(s.q));
    const spec = s.spec;
    const u = mine === "back" ? -(spec.body.behind + 0.05) : spec.body.ahead + 0.05;
    const A = ropeA.set(s.p.x + c * u, s.p.y - spec.cog + spec.clearance + 0.12, s.p.z + sn * u);
    const B = this.eyeOf(other, mine === "back" ? "front" : "back", ropeB);
    if (!B) return null;
    const d = A.distanceTo(B.at);
    const stretch = d - TOW_LEN;
    if (stretch <= 0 || d < 1e-3) return null;
    const nx = (B.at.x - A.x) / d;
    const ny = (B.at.y - A.y) / d;
    const nz = (B.at.z - A.z) / d;
    const rel = (B.v.x - s.v.x) * nx + (B.v.y - s.v.y) * ny + (B.v.z - s.v.z) * nz;
    const f = Math.min(TOW_MAX, Math.max(0, TOW_K * stretch + TOW_C * rel));
    // (the other end parked, nobody at its wheel: it holds — said once)
    if (this.parked.has(other) && stretch > 0.3 && this.ropeTold !== other) {
      this.ropeTold = other;
      this.host.toast(t("carRopeNeedsDriver"));
    }
    return { f: [nx * f, ny * f, nz * f], at: [A.x, A.y, A.z] };
  }
  /** (plan 93 S7) Every tow rope, from the towing car's back to the towed car's front. */
  private drawRopes() {
    const room = this.host.room();
    const list: { a: Vector3; b: Vector3; len: number }[] = [];
    const seen = new Set<string>();
    const add = (from: string, to: string) => {
      if (!to || seen.has(from)) return;
      seen.add(from);
      const a = this.eyeOf(from, "back", new Vector3());
      const b = this.eyeOf(to, "front", new Vector3());
      if (a && b && a.at.distanceTo(b.at) < 30) list.push({ a: a.at, b: b.at, len: TOW_LEN });
    };
    for (const l of this.live.values()) {
      const vw = room?.state.vehicles.get(l.id) as VehWire | undefined;
      if (vw?.obj && vw.towing) add(vw.obj, vw.towing);
    }
    for (const id of this.parked.keys()) {
      const to = this.propsOf(id)?.towing;
      if (typeof to === "string") add(id, to);
    }
    this.ropes.draw(list);
  }
  /** (plan 93 S6, S7) my work on a car (a chain, a mend): its prompt's key, the car, since when (performance.now),
   *  how long, where I stood; told how it went (`done`) */
  private job: {
    key: string;
    id: string;
    at: number;
    ms: number;
    x: number;
    y: number;
    label: string;
    done: () => string | null;
  } | null = null;
  /** (plan 93 S7) a tow rope's first end tied: which car's, its back or its front */
  private rope: { id: string; end: "back" | "front" } | null = null;
  /** (plan 93 S4, S6, S7) A parked car's spot I'm stood at, the nearest: its boot (behind it), a wheel (out from
   *  its side: a flat to change for the spare, else a chain to fit or take off), its nose (the bonnet: the next
   *  thing to mend), a tow eye (its back's or its front's, off to its right). What can't be done there is said. */
  private workSpot(): { objectId: string; kind: string; label: string } | null {
    const me = this.host.me();
    const chains = this.host.items("chains");
    const wrench = this.host.items("wrench") > 0;
    const ropes = this.host.items("towrope");
    let best: { objectId: string; kind: string; label: string } | null = null;
    let bd = Number.POSITIVE_INFINITY;
    const offer = (x: number, y: number, reach: number, o: { objectId: string; kind: string; label: string }) => {
      const d = Math.hypot(me.x - x, me.y - y);
      if (d < reach && d < bd) {
        bd = d;
        best = o;
      }
    };
    if (this.rope && !this.parked.has(this.rope.id)) this.rope = null;
    for (const [id, p] of this.parked) {
      const P = p.pose;
      if (Math.hypot(me.x - P.x, me.y - P.z) > 7) continue;
      const c = Math.cos(P.a);
      const s = Math.sin(P.a);
      const at = (u: number, w: number) => ({ x: P.x + c * u - s * w, y: P.z + s * u + c * w });
      const b = p.spec.body;
      const props = this.propsOf(id);
      // (MOTORS' cars on show, one retired: the dealer's, nothing of theirs to work on)
      if (props?.role === "show" || props?.retire) continue;
      const dm = dmgOf(props?.dmg);
      // the boot
      const bk = at(-(b.behind + 0.35), 0);
      offer(bk.x, bk.y, 1.5, { objectId: id, kind: "car:boot", label: t("carBoot") });
      // the wheels: a flat, a chain
      if (!p.spec.pushed && !p.spec.feet)
        for (let i = 0; i < 4; i++) {
          const ws = chainSpot(p.spec, P.x, P.z, P.a, i);
          const o = (b.ahead - b.behind) / 2;
          const garage = this.G.atPump(P.x + c * o, P.z + s * o);
          if (dm.parts & FLATS[i]) {
            const ok = mayMend("tyre", { garage, wrench, spare: spareOf(props) });
            offer(ws.x, ws.y, CHAIN_REACH * 0.85, {
              objectId: ok ? `${id}#tyre#${i}` : `${id}#${t("carNoSpare")}`,
              kind: ok ? "car:mend" : "car:no",
              label: ok ? t("carMend_tyre") : `${t("carMend_tyre")} · ${t("carNoSpare")}`,
            });
            continue;
          }
          const on = !(chainsOf(props) & (1 << i));
          if (!on || chains > 0)
            offer(ws.x, ws.y, CHAIN_REACH * 0.85, {
              objectId: `${id}#${i}`,
              kind: "car:chain",
              label: t(on ? "carChainOn" : "carChainOff"),
            });
        }
      // the bonnet: the next thing to mend
      const o = (b.ahead - b.behind) / 2;
      const garage = this.G.atPump(P.x + c * o, P.z + s * o);
      const next = nextMend(dm, garage);
      const ns = at(b.ahead + 0.45, 0);
      if (next) {
        const ok = mayMend(next, { garage, wrench, spare: 1 });
        const why = next === "glass" ? t("carNeedsGarage") : t("carNeedsWrench");
        offer(ns.x, ns.y, MEND_REACH * 0.9, {
          objectId: ok ? `${id}#${next}` : `${id}#${why}`,
          kind: ok ? "car:mend" : "car:no",
          label: ok ? t(`carMend_${next}`) : `${t(`carMend_${next}`)} · ${why}`,
        });
      } else if (dm.parts & GLASS_BITS)
        offer(ns.x, ns.y, MEND_REACH * 0.9, {
          objectId: `${id}#${t("carNeedsGarage")}`,
          kind: "car:no",
          label: `${t("carMend_glass")} · ${t("carNeedsGarage")}`,
        });
      // the tow eyes: off its right, at its back and its front
      for (const end of ["back", "front"] as const) {
        const e = end === "back" ? at(-(b.behind + 0.35), 0.75) : at(b.ahead + 0.35, 0.75);
        const tied = String(props?.[end === "back" ? "towing" : "towedBy"] ?? "");
        if (tied) offer(e.x, e.y, 1.1, { objectId: `${id}#${end}`, kind: "car:untow", label: t("carUntow") });
        else if (this.rope && this.rope.end !== end && this.rope.id !== id)
          offer(e.x, e.y, 1.1, { objectId: `${id}#${end}`, kind: "car:tow", label: t("carRopeTie2") });
        else if (!this.rope && ropes > 0)
          offer(e.x, e.y, 1.1, {
            objectId: `${id}#${end}`,
            kind: "car:tow",
            label: t(end === "back" ? "carRopeBack" : "carRopeFront"),
          });
      }
    }
    return best;
  }
  /** (plan 93 S6, S7) My work: stood up and walked off, dropped; its time up, told how it went. Everyone at work on
   *  a car (the server's `busy`) drawn at it: knelt at a wheel, bent over an engine — its bonnet up. */
  private bonnets = new Map<string, number>();
  private workFrame(room: RoomLike, dt: number) {
    const j = this.job;
    if (j) {
      const me = this.host.me();
      if (Math.hypot(me.x - j.x, me.y - j.y) > 0.4) {
        room.send("car:chain-stop", {});
        this.job = null;
      } else if (performance.now() - j.at > j.ms + 500) {
        this.job = null;
        const said = j.done();
        if (said) this.host.toast(said);
      }
    }
    const tp = this.host.tp();
    const up = new Set<string>();
    tp?.kneeling.clear();
    // (plan 94 G5: a tyre being changed — the jack, the corner up, the wheel off and the spare on)
    const tyres = new Set<string>();
    room.state.players.forEach((p: { busy?: string }, sid: string) => {
      const b = p.busy ?? "";
      const tm = /^mend:(.+):tyre(\d)$/.exec(b);
      if (tm) {
        const key = `${sid}|${b}`;
        tyres.add(key);
        if (!this.tyreJobs.has(key))
          this.tyreJobs.set(key, { id: tm[1], wheel: Number(tm[2]) & 3, at: this.time, jack: null });
      }
      if (b.startsWith("chain:") || /^mend:.*:tyre\d$/.test(b)) tp?.kneeling.set(sid, "kneel");
      else if (b.startsWith("mend:")) {
        tp?.kneeling.set(sid, "bonnet");
        up.add(b.split(":")[1]);
      }
    });
    for (const [key, j] of this.tyreJobs) {
      const m = this.parked.get(j.id)?.full;
      if (!tyres.has(key) || !m) {
        m?.liftCorner?.(j.wheel, 0);
        m?.wheelShown?.(j.wheel, true);
        j.jack?.removeFromParent();
        j.jack?.traverse((o) => (o as Mesh).geometry?.dispose());
        this.tyreJobs.delete(key);
        continue;
      }
      this.tyreJob(j, m);
    }
    for (const id of up) if (!this.bonnets.has(id)) this.bonnets.set(id, 0);
    for (const [id, a] of this.bonnets) {
      const to = up.has(id) ? 1.0 : 0;
      const next = a + (to - a) * Math.min(1, dt * (to > a ? 3 : 5));
      this.parked.get(id)?.full?.setPart?.("bonnet", next);
      // (plan 98 phase 6: its catch heard going up, its slam coming down)
      if (a === 0 && next > 0) this.lidHeard(id, "bonnet", 0.35);
      if (to === 0 && next < 0.01) {
        this.lidHeard(id, "bonnet", 0.55);
        this.parked.get(id)?.full?.setPart?.("bonnet", 0);
        this.bonnets.delete(id);
      } else this.bonnets.set(id, next);
    }
  }
  /** (plan 94 G5) Tyres being changed (by whose `busy`): which car, which wheel, since when (my clock), its jack. */
  private tyreJobs = new Map<string, { id: string; wheel: number; at: number; jack: Group | null }>();
  private jackMats: Material[] = [];
  /** (plan 94 G5) One tyre change as it goes, over MEND_MS.tyre: the jack set under the sill by the wheel and wound
   *  up (the first 15%), the wheel off (30–55%) and the spare on, wound down (the last 15%). */
  private tyreJob(j: { id: string; wheel: number; at: number; jack: Group | null }, m: Sedan) {
    const u = (this.time - j.at) / (MEND_MS.tyre / 1000);
    const k = u < 0.15 ? u / 0.15 : u > 0.85 ? Math.max(0, (1 - u) / 0.15) : 1;
    m.liftCorner?.(j.wheel, k);
    m.wheelShown?.(j.wheel, !(u > 0.3 && u < 0.55));
    if (!j.jack) {
      if (!this.jackMats.length)
        this.jackMats = [
          litMaterial({ color: 0x7a2a1e, roughness: 0.6 }),
          litMaterial({ color: 0x3b3b3e, roughness: 0.5 }),
        ];
      const [red, steel] = this.jackMats;
      const jack = new Group();
      const base = new Mesh(new BoxGeometry(0.26, 0.03, 0.12), steel);
      base.position.y = 0.015;
      const post = new Mesh(new BoxGeometry(0.05, 1, 0.05), red);
      post.name = "post";
      const pad = new Mesh(new BoxGeometry(0.1, 0.025, 0.08), steel);
      pad.name = "pad";
      jack.add(base, post, pad);
      this.root.add(jack);
      j.jack = jack;
    }
    // (under its sill, a hand inside the wheel, toward the car's middle along it)
    const w = m.wheels[j.wheel];
    if (!w) return;
    m.root.updateMatrixWorld(true);
    w.steer.getWorldPosition(v3);
    this.root.updateMatrixWorld();
    v3.applyMatrix4(this.inv.copy(this.root.matrixWorld).invert());
    m.root.getWorldPosition(v4).applyMatrix4(this.inv);
    const ax = v4.x - v3.x;
    const az = v4.z - v3.z;
    const a = Math.atan2(az, ax);
    const jx = v3.x + Math.cos(a) * 0.55;
    const jz = v3.z + Math.sin(a) * 0.55;
    const g = this.G.heightAt(jx, jz);
    const h = 0.16 + 0.06 * k;
    const jack = j.jack as Group;
    jack.position.set(jx, g, jz);
    jack.rotation.y = -a;
    const post = jack.getObjectByName("post") as Mesh;
    post.scale.y = h;
    post.position.y = 0.03 + h / 2;
    (jack.getObjectByName("pad") as Mesh).position.y = 0.03 + h;
  }
  /** (plan 93 S4) A parked car whose back I'm stood at (its middle, a step behind it: the server's own reach) —
   *  that one (`only`), or the nearest. */
  private bootNear(only?: string): string | null {
    const me = this.host.me();
    let best: string | null = null;
    let bd = 1.5;
    for (const [id, p] of this.parked) {
      if (only && id !== only) continue;
      const back = (p.spec.body.behind ?? 2.4) + 0.35;
      const d = Math.hypot(
        me.x - (p.pose.x - Math.cos(p.pose.a) * back),
        me.y - (p.pose.z - Math.sin(p.pose.a) * back),
      );
      if (d < bd) {
        bd = d;
        best = id;
      }
    }
    return best;
  }
  /** (plan 93 S4) The boot I opened: its lid up while the pack's open on it — down as it's shut, or I walk off. */
  /** (plan 95 F4a) A round's line — from `o` along the unit `d` (the server's frame: x, y on the ground, z up), as
   *  far as `range` — against the cars' models as drawn here (not `skip`, the one I sit in): the nearest it meets,
   *  where on it (the car's own frame) and what — its glass and which pane, a wheel, a lamp, its skin (the engine
   *  behind the front's); 0: none it met; null: a car by its line isn't drawn here to tell (the server's box). */
  shotAlong(
    o: { x: number; y: number; z: number },
    d: { x: number; y: number; z: number },
    range: number,
    skip?: string,
  ): { claim: CarClaim; t: number } | 0 | null {
    const tp = this.host.tp();
    if (!tp) return null;
    const cam = tp.camera;
    const near = (x: number, y: number) => {
      const rx = x - o.x;
      const ry = y - o.y;
      const along = rx * d.x + ry * d.y;
      if (along < -6 || along > range + 6) return false;
      return Math.abs(rx * d.y - ry * d.x) < 5 + Math.abs(d.z) * Math.max(0, along);
    };
    const cands: { id: string; roots: Object3D[]; at: ShotCar }[] = [];
    let blind = false;
    for (const l of this.live.values()) {
      if (l.id === skip || !near(l.pose.p.x, l.pose.p.z)) continue;
      const q = l.pose.q;
      const at = wireCar(l.pose.p.x, l.pose.p.y, l.pose.p.z, [q.x, q.y, q.z, q.w], l.spec);
      cands.push({ id: l.id, roots: [l.model.root], at });
    }
    for (const [id, p] of this.parked) {
      if (`car:${id}` === skip || !near(p.pose.x, p.pose.z)) continue;
      const roots: Object3D[] = [];
      for (const r of [p.full?.root, p.old?.root, p.far?.root]) if (r && shownAll(r)) roots.push(r);
      if (!roots.length) {
        blind = true;
        continue;
      }
      cands.push({ id, roots, at: levelCar(p.pose.x, p.pose.z, p.pose.y, p.pose.a, p.spec) });
    }
    if (!cands.length) return blind ? null : 0;
    // (its line in the view: the cars' group's frame — the Grounds' — to the world)
    this.root.updateMatrixWorld();
    const from = this.root.localToWorld(new Vector3(o.x, o.z, o.y));
    const dir = new Vector3(d.x, d.z, d.y).transformDirection(this.root.matrixWorld);
    const rc = (this.rc ??= new Raycaster());
    rc.set(from, dir);
    rc.far = range;
    const hits: import("three").Intersection[] = [];
    let best: { hit: import("three").Intersection; c: (typeof cands)[number] } | null = null;
    for (const c of cands)
      for (const r of c.roots)
        r.traverseVisible((x) => {
          const m = x as Mesh;
          if (!m.isMesh || (m as { isInstancedMesh?: boolean }).isInstancedMesh || !m.layers.test(cam.layers)) return;
          hits.length = 0;
          m.raycast(rc, hits);
          for (const h of hits)
            if (h.distance <= rc.far && (!best || h.distance < best.hit.distance)) best = { hit: h, c };
        });
    if (!best) return blind ? null : 0;
    const { hit, c } = best as { hit: import("three").Intersection; c: (typeof cands)[number] };
    const at = c.at;
    const spec = at.spec;
    // (the point and its skin's way out, the server's frame — then the car's own)
    const lp = this.root.worldToLocal(hit.point.clone());
    const rx = lp.x - at.x;
    const ry = lp.z - at.y;
    const rz = lp.y - at.z;
    const dot = (a: [number, number, number], x: number, y: number, z: number) => a[0] * x + a[1] * y + a[2] * z;
    const u = dot(at.fwd, rx, ry, rz);
    const w = dot(at.right, rx, ry, rz);
    const h = dot(at.up, rx, ry, rz) + spec.cog;
    const nw3 = (hit.face?.normal.clone() ?? new Vector3(0, 1, 0)).transformDirection(hit.object.matrixWorld);
    if (nw3.dot(dir) > 0) nw3.negate();
    const inv = new Matrix4().copy(this.root.matrixWorld).invert();
    const nl = nw3.transformDirection(inv);
    const nu = dot(at.fwd, nl.x, nl.z, nl.y);
    const nr = dot(at.right, nl.x, nl.z, nl.y);
    const nh = dot(at.up, nl.x, nl.z, nl.y);
    // (what it is: the glass's pane, a lamp's lens, a wheel — its tyre, its rim —, else the skin)
    const m = hit.object as Mesh;
    const mats = m.material;
    const mat = Array.isArray(mats) ? mats[hit.face?.materialIndex ?? 0] : mats;
    const name = mat?.name ?? "";
    const ud = m.userData;
    const pane = (ud.pane ?? ud.crackOf ?? ud.paneOf) as number | undefined;
    let inWheel = false;
    for (let x: Object3D | null = m; x && !inWheel; x = x.parent)
      inWheel = /^(spin_|wheel_|p:wheel)|^wheel/.test(x.name) && !/steer/.test(x.name);
    const cm = (x: number) => Math.round(x * 100) / 100;
    const claim: CarClaim = { id: c.id, u: cm(u), w: cm(w), h: cm(h), f: 0, s: "panel" };
    if (typeof pane === "number" || /glass/.test(name)) {
      claim.s = "glass";
      claim.f = faceOf(spec, u, nu, nr, nh);
      if (typeof pane === "number") claim.p = pane;
    } else if (mirrorOf(m)) {
      // (plan 96 F4a: a door mirror — its glass a "reflector" too, not a lamp's)
      claim.s = "panel";
      claim.f = w < 0 ? 2 : 3;
      claim.part = mirrorOf(m) as string;
    } else if (/lens|emit_|reflector/.test(name)) {
      claim.s = "lamp";
      claim.f = u > 0 ? 0 : 1;
      claim.n = w < 0 ? 0 : 1;
    } else if (inWheel || /tyre|tire|alloy|rim|hubcap|spoke/.test(name)) {
      claim.s = "tyre";
      claim.f = w < 0 ? 2 : 3;
      const rear = -(spec.wheelbase - spec.front);
      claim.n = (u > (spec.front + rear) / 2 ? 0 : 2) + (w < 0 ? 0 : 1);
    } else {
      claim.f = faceOf(spec, u, nu, nr, nh);
      claim.s = bodyStruck(spec, u, h, claim.f);
      // (plan 96 F4a: the part of its skin — its mesh's or a holder's name: "door_fr-paint", "bonnet", …)
      for (let x: Object3D | null = m; x; x = x.parent) {
        const k = /^(bonnet|boot|bumper_[fr]|mirror_[lr]|door_(?:fl|fr|rl|rr))(?:-|$)/.exec(x.name);
        if (k) {
          claim.part = k[1];
          break;
        }
      }
    }
    claim.nu = Math.round(nu * 100);
    claim.nw = Math.round(nr * 100);
    claim.nh = Math.round(nh * 100);
    return { claim, t: hit.distance };
  }
  private rc: Raycaster | null = null;
  /** (plan 95 F4a) the car I sit in (its live vehicle's id), if I do */
  myCarId(): string | null {
    return this.mine?.vid ?? null;
  }

  /** (plan 95 F1a) A window's motor heard: by its car's sound (its door's side), mine or another's. */
  private windowMotor(l: LiveView, door: number) {
    const snd = l.sound ?? (this.mine?.vid === l.id ? this.mine.sound : null);
    snd?.windowMotor(door);
  }
  private lidsFrame(dt: number) {
    const b = this.bootOpen;
    if (b) {
      const open = this.host.packOpen();
      if (open) b.packed = true;
      if ((b.packed && !open) || this.bootNear(b.id) !== b.id) {
        this.bootOpen = null;
        this.host.room()?.send("car:boot", { id: b.id, open: false });
      }
    }
    // (plan 94 G3: mine, and everyone else's open — the server's `boot:<id>`)
    const want = new Set<string>();
    if (this.bootOpen) want.add(this.bootOpen.id);
    this.host.room()?.state.players.forEach((p: { busy?: string }) => {
      if (p.busy?.startsWith("boot:")) want.add(p.busy.slice(5));
    });
    for (const id of want) if (!this.lids.has(id)) this.lids.set(id, 0);
    for (const [id, a] of this.lids) {
      const to = want.has(id) ? 1.15 : 0;
      const next = a + (to - a) * Math.min(1, dt * (to > a ? 4 : 6));
      const p = this.parked.get(id);
      p?.full?.setPart?.("boot", next);
      // (plan 98 phase 6: its catch going up, its slam coming down)
      if (a === 0 && next > 0) this.lidHeard(id, "boot", 0.35);
      if (to === 0 && next < 0.01) {
        this.lidHeard(id, "boot", 0.5);
        p?.full?.setPart?.("boot", 0);
        this.lids.delete(id);
      } else this.lids.set(id, next);
    }
  }

  /** (plan 93 S3) A horn heard: everyone near turns to it (the view's own `heard` — a shot's: a glance, a
   *  startle close by), again every 0.8 s while it's held — a long blast keeps them looking */
  private hornHeard(l: LiveView, on: boolean, from: string) {
    if (!on) {
      l.hornAt = undefined;
      return;
    }
    if (l.hornAt !== undefined && this.time - l.hornAt < 0.8) return;
    l.hornAt = this.time;
    this.host.tp()?.heard(l.pose.p.x, l.pose.p.z, from || undefined);
  }

  /** (plan 93 S2) Which way someone sat in this car is aiming out of their window (world), or null: me with the
   *  right button held; another for two seconds after their shot (its way, as `arms:shot` had it). */
  private aimOf(l: LiveView, sid: string, seat: number): Vector3 | null {
    const room = this.host.room();
    if (sid === room?.sessionId)
      return this.mine?.vid === l.id && this.gunSeat()?.aiming ? this.aimDir(l, seat, new Vector3()) : null;
    const sb = this.shotsBy.get(sid);
    if (!sb || this.time - sb.t > 2) return null;
    const c = Math.cos(sb.pitch);
    return new Vector3(Math.cos(sb.yaw) * c, Math.sin(sb.pitch), Math.sin(sb.yaw) * c);
  }
  /** (plan 93 S2) A gun out, sat in a car: in their right hand (its life model, the view's); aimed, the arm out
   *  of the window along it and the window wound down. */
  private seatGun(
    l: LiveView,
    sid: string,
    e: LiveView["people"] extends Map<string, infer P> ? P : never,
    aim: Vector3 | null,
    across: number,
  ) {
    const room = this.host.room();
    const key = String((room?.state.players.get(sid) as { gun?: string } | undefined)?.gun ?? "");
    const want = across < 0.5 ? key : "";
    // (the hand by their window: the left on the car's left — the driver's —, the right on its right)
    const S: "L" | "R" = (l.model.seats[e.seat]?.hip.z ?? 0) > 0 ? "L" : "R";
    if ((e.gun?.key ?? "") !== want || (want && !e.gun?.held)) {
      e.gun?.held?.drop();
      const held = want ? (this.host.tp()?.seatedGun(e.m, want, S) ?? null) : null;
      e.gun = want ? { key: want, held } : undefined;
    }
    const door = l.model.doorOf ? l.model.doorOf(e.seat) : -1;
    // (a gun out of it: down quicker — plan 95 F1a's 1.5 s is the switch's)
    if (
      door >= 0 &&
      l.model.windowDown?.(door, (!!aim && across < 0.5) || !!(l.win & (1 << e.seat)), aim ? 0.5 : undefined)
    )
      this.windowMotor(l, door);
    const held = e.gun?.held;
    if (!aim || across >= 0.5) {
      held?.rest();
      held?.grip();
      return;
    }
    // (the gun out of the window along the aim, a little under the line of sight; the hand brought to it as a
    // walker's is to theirs — the fingers round its grip, the index on the trigger)
    // (out along the aim from the shoulder, as far as a walker's arm holds it — out of the window, in reach —
    // and a little toward the car's front: before the eye that sights over it, not off at its edge)
    // (plan 94 G2: a long gun — the shotgun, the AK, the sniper, the Daybreak — shouldered: its grip a forearm
    // out from the shoulder, its barrel out of the window, the other hand on its fore-end as a walker holds it)
    const long = !!held?.fore(hF2);
    const at = this.gunAt(e, S, aim, hF, long ? 0.3 : 0.52).addScaledVector(
      hI.set(-1, 0, 0).transformDirection(l.model.body.matrixWorld),
      long ? 0 : 0.08,
    );
    const pole: [number, number, number] = S === "R" ? [-0.6, -1, -0.45] : [0.6, -1, -0.45];
    if (held) {
      held.aimAt(at, aim, 1 - across, pole);
      held.grip();
      const fore = long ? held.fore(hF2) : null;
      if (fore) e.m.reachTo(S === "R" ? "L" : "R", fore, 1 - across, S === "R" ? [-0.5, -1, 0.2] : [0.5, -1, 0.2]);
    } else e.m.reachTo(S, at, 1 - across, pole);
  }

  /** (plan 93 S2) Where a seated shooter's gun goes: out from their shooting shoulder along the aim, a walker's
   *  reach (AIM_REACH's 0.55 of her, a little less sat), a hair up */
  private gunAt(
    e: { m: { bone(j: string): Object3D | null; root: Object3D } },
    S: "L" | "R",
    aim: Vector3,
    out: Vector3,
    reach = 0.52,
  ) {
    const sh = e.m.bone(S === "L" ? "shoulderL" : "shoulderR");
    const k = e.m.root.scale.x || 1;
    if (!sh) return out.set(0, 0, 0);
    sh.updateWorldMatrix(true, false);
    return sh
      .getWorldPosition(out)
      .addScaledVector(aim, reach * k)
      .add(hG.set(0, 0.06 * k, 0));
  }
  /** (plan 93 S2) Me, sat in my car (my person there), or null */
  private meSat(l: LiveView) {
    const room = this.host.room();
    return (room && l.people.get(room.sessionId)) ?? null;
  }

  /** (plan 93 S2) Sat in a car, for the guns (dark/arms.ts sees the seat through it): whether a gun may be
   *  drawn here (a passenger; the driver slower than 30 km/h), whether I'm aiming out of my window (the right
   *  button, a gun out — the driver's the revolver alone), and the muzzle out of it (the floor's frame, z up). */
  gunSeat(): { canDraw: boolean; aiming: boolean; muzzle(): { x: number; y: number; z: number } } | null {
    const m = this.mine;
    const l = m ? this.live.get(m.vid) : undefined;
    if (!m || !l) return null;
    const driver = m.seat === 0;
    const slow = Math.hypot(l.pose.v.x, l.pose.v.z) < DRIVER_SHOT_V;
    const gun = this.myGun();
    const canDraw = !driver || slow;
    // (gun mode: a gun drawn here — the 2–5 keys, as on foot; put away the same way, and the car's as ever)
    const aiming = !!gun && (!driver || (gun === "revolver" && slow));
    return {
      canDraw,
      aiming,
      muzzle: () => {
        // (the gun's own muzzle, as it's drawn; else out of the window along the aim)
        const held = this.meSat(l)?.gun?.held;
        const at = held
          ? held.muzzle(hD)
          : this.windowAt(l, m.seat, 0.62, hD).addScaledVector(this.aimDir(l, m.seat, hE), 0.3);
        const p = this.root.worldToLocal(at);
        return { x: p.x, y: p.z, z: p.y };
      },
    };
  }
  /** The gun in my hand (the server's: Player.gun), or "". */
  private myGun(): string {
    const room = this.host.room();
    return String((room?.state.players.get(room.sessionId) as { gun?: string } | undefined)?.gun ?? "");
  }
  /** A point at a seat's window (world): `out` from the seat's middle toward its side (m), at the eyes' height. */
  private windowAt(l: LiveView, seat: number, out: number, o: Vector3): Vector3 {
    const hip = l.model.seats[seat]?.hip ?? l.model.seats[0].hip;
    const side = Math.sign(hip.z) || 1;
    l.model.root.updateMatrixWorld(true);
    return l.model.body.localToWorld(o.set(hip.x - 0.08, hip.y + 0.72, hip.z + side * out));
  }
  /** Out of a seat's window along the aim (world): straight out of its side, turned by the aim's yaw (+ to my
   *  right as I face out of it) and pitch — mine from the mouse, another's from their last shot. */
  private aimDir(l: LiveView, seat: number, o: Vector3, yaw = this.aimLook.yaw, pitch = this.aimLook.pitch): Vector3 {
    const hip = l.model.seats[seat]?.hip ?? l.model.seats[0].hip;
    const side = Math.sign(hip.z) || 1;
    const c = Math.cos(pitch);
    return o
      .set(-side * Math.sin(yaw) * c, Math.sin(pitch), side * Math.cos(yaw) * c)
      .transformDirection(l.model.body.matrixWorld);
  }

  /** (plan 93 S8) Where the driver looks (rad, + their left): into the turn by the road wheels' angle, and to
   *  the mirror on the indicator's side a moment as it's put on. */
  private driverLook(
    e: LiveView["people"] extends Map<string, infer P> ? P : never,
    g: { steer: number; ind: number },
  ) {
    e.drv ??= { grips: {}, gear: 0, leverT: -9, ind: 0, glanceT: -9, glanceTo: 0, t: this.time };
    const d = e.drv;
    if (g.ind !== d.ind) {
      if (g.ind !== 0) {
        d.glanceT = this.time;
        d.glanceTo = g.ind > 0 ? 0.95 : -0.75;
      }
      d.ind = g.ind;
    }
    const into = -Math.max(-0.45, Math.min(0.45, g.steer * 1.8));
    const u = (this.time - d.glanceT) / 0.9;
    const glance = u < 0 || u > 1 ? 0 : Math.sin(Math.PI * Math.min(1, u * 1.4)) ** 0.6;
    return into + (d.glanceTo - into) * glance;
  }

  /** (plan 93 D) The driver's hands on the wheel as it turns: each holds a point of the rim (a mark on the
   *  steering wheel, carried round with it). Carried ~70° from its place, a hand lets go and reaches back up
   *  the rim to grip again — one at a time, the other turning it: hand over hand (F4a), so the 80s cars'
   *  three turns lock to lock are followed. The right hand goes to the horn's pad while it sounds, and to
   *  the lever a moment on a gear changed by hand. */
  private driverHands(
    l: LiveView,
    e: LiveView["people"] extends Map<string, infer P> ? P : never,
    w: number,
    g: { horn: boolean; gear: number; manual: boolean },
  ) {
    const mod = l.model;
    e.drv ??= { grips: {}, gear: 0, leverT: -9, ind: 0, glanceT: -9, glanceTo: 0, t: this.time };
    const d = e.drv;
    const dt = Math.min(0.1, Math.max(0, this.time - d.t));
    d.t = this.time;
    mod.root.updateMatrixWorld(true);
    const body = mod.body;
    // the wheel's middle and its face's axes (world): 12 o'clock up it, the driver's right across it
    const c = mod.rim(0, hA).add(mod.rim(Math.PI, hB)).multiplyScalar(0.5);
    const up = hB.copy(mod.rim(0, hC)).sub(c);
    const right = hD.copy(mod.rim(Math.PI / 2, hC)).sub(c);
    body.localToWorld(c);
    up.transformDirection(body.matrixWorld);
    right.transformDirection(body.matrixWorld);
    // (toward the driver: off the wheel's face, the eyes' side)
    const toward = hE.crossVectors(right, up).normalize();
    body.localToWorld(hC.copy(mod.eye));
    if (toward.dot(hC.sub(c)) < 0) toward.negate();
    const phiOf = (p: Vector3) => {
      hF.copy(p).sub(c);
      return Math.atan2(hF.dot(right), hF.dot(up));
    };
    // (a rim point at `phi` as the wheel's at rest: where on the rim a hand reaches to)
    const at = (phi: number, out: Vector3) => body.localToWorld(mod.rim(phi, out));
    const st = mod.steering;
    st.updateWorldMatrix(true, false);
    const hold = (gr: Grip, phi: number) => {
      gr.a.position.copy(st.worldToLocal(at(phi, hG)));
    };
    const wrap = (x: number) => Math.atan2(Math.sin(x), Math.cos(x));
    const leverOn = g.manual && g.gear !== d.gear && g.gear > 0;
    if (g.gear !== d.gear) {
      if (leverOn) d.leverT = this.time;
      d.gear = g.gear;
    }
    // (how fast the wheel's turning, rad/s)
    const wheelNow = st.rotation.z;
    const spin = Math.abs(wheelNow - (d.wheel ?? wheelNow)) / Math.max(dt, 1e-3);
    d.wheel = wheelNow;
    for (const S of ["L", "R"] as const) {
      const home = S === "L" ? -1.0 : 1.0;
      let gr = d.grips[S];
      if (!gr || gr.a.parent !== st) {
        const a = new Object3D();
        st.add(a);
        gr = d.grips[S] = { a, moving: false, t: 0, from: new Vector3(), to: home };
        hold(gr, home);
      }
      const held = gr.a.getWorldPosition(hH);
      const other = d.grips[S === "L" ? "R" : "L"];
      if (!gr.moving) {
        const off = wrap(phiOf(held) - home);
        // (carried too far: let go, back up the rim against the turn — one hand at a time)
        if (Math.abs(off) > 1.2 && !other?.moving) {
          gr.moving = true;
          gr.t = 0;
          gr.from.copy(held);
          gr.to = home - Math.sign(off) * 0.45;
        }
      }
      const target = hI;
      if (gr.moving) {
        // (quicker as the wheel's wound quicker: 0.24 s, down to 0.12)
        gr.t += dt / Math.max(0.12, 0.24 - 0.012 * spin);
        const k = Math.min(1, gr.t);
        const kk = k * k * (3 - 2 * k);
        target.lerpVectors(gr.from, at(gr.to, hJ), kk).addScaledVector(toward, Math.sin(Math.PI * k) * 0.05);
        if (gr.t >= 1) {
          gr.moving = false;
          hold(gr, gr.to);
        }
      } else target.copy(held);
      // the right hand: the horn's pad while it sounds; the lever a moment on a change by hand
      if (S === "R") {
        const lu = (this.time - d.leverT) / 0.55;
        if (lu >= 0 && lu < 1 && mod.leverAt?.(hJ)) {
          body.localToWorld(hJ);
          target.lerp(hJ, Math.sin(Math.PI * lu) ** 0.5);
        } else if (g.horn) target.copy(c).addScaledVector(toward, 0.03);
      }
      e.m.reachTo(S, target, w, [-0.75, -1, -0.35]);
    }
  }

  /** The pets in a car's seats (docs/plan/51-the-pet.md): their models, sitting — a dog turned to
   *  its window, in from the door (its paws would come through it). */
  private seatPets(room: RoomLike, l: LiveView) {
    const P = this.host.pets();
    if (!P) return;
    const keep = new Set<string>();
    room.state.pets.forEach((pet, id) => {
      const seat = l.model.seats[pet.seat];
      if (pet.ride !== l.id || !pet.alive || !seat) return;
      keep.add(id);
      const key = `${pet.species}|${pet.look}|${pet.outfit}|${pet.seat}`;
      let e = l.pets.get(id);
      if (e && e.key === key) return;
      if (e) {
        e.holder.removeFromParent();
        e.model.dispose();
      }
      const json = (s: string) => {
        try {
          return JSON.parse(s);
        } catch {
          return {};
        }
      };
      const model = new P.PetModel(
        pet.species as import("@yutopia/shared/pets").Species,
        json(pet.look),
        json(pet.outfit),
        (c, o) => P.petMaterial(c, o),
      );
      const holder = new Group();
      holder.add(model.root);
      const side = Math.sign(seat.hip.z) || 1;
      const dog = pet.species === "dog";
      holder.position.set(seat.hip.x, seat.hip.y - 0.06, seat.hip.z - (dog ? side * 0.34 : 0));
      holder.rotation.y = Math.PI + (dog ? side * 1.3 : 0);
      holder.scale.setScalar(PET_SEAT);
      l.model.body.add(holder);
      e = { holder, model, key };
      l.pets.set(id, e);
    });
    for (const [id, e] of l.pets)
      if (!keep.has(id)) {
        e.holder.removeFromParent();
        e.model.dispose();
        l.pets.delete(id);
      }
    for (const e of l.pets.values())
      e.model.pose(
        { kind: "sit", t: (this.time * 0.25) % 1, face: "happy", look: 0, carry: null },
        1 / 60,
        this.time * 1000,
      );
  }

  /** Someone else's car: played back on its driver's clock (playback.ts), its wheels, lamps, sound. */
  private wcs = [0, 0, 0, 0];
  private wcsB = [0, 0, 0, 0];
  private poseRemote(l: LiveView, now: number, dt: number) {
    if (!l.pb.buf.length) return;
    const { pose, at } = l.pb.pose(now, dt);
    const s1 = at ?? l.pb.buf[l.pb.buf.length - 1];
    const p = l.pose;
    p.p.copy(pose.p);
    p.q.copy(pose.q);
    p.v.copy(pose.v);
    const m = l.model;
    const spec = l.spec;
    // the root: the CoG back to the model's origin
    const origin = v3.set(m.dims.axleF + spec.front - m.dims.L / 2, -spec.cog, 0).applyQuaternion(p.q);
    m.root.position.copy(p.p).add(origin);
    m.root.quaternion.copy(p.q).multiply(FLIP);
    // wheels: rolling at its speed, the fronts steered
    const fwd = v3.set(1, 0, 0).applyQuaternion(p.q);
    const sp = p.v.dot(fwd);
    // (plan 98 phase 13: the steering and the springs blended between the two states round the clock — taken from one,
    // they stepped 20 times a second)
    const sa = l.pb.pairA ?? s1;
    const sb = l.pb.pairB ?? s1;
    const u = l.pb.pairU;
    const steer = sa.steer + (sb.steer - sa.steer) * u;
    // (each on its spring, as its driver's car has it: docs/plan/92 phase 3)
    unpackWheels(sa.wc, this.wcs);
    unpackWheels(sb.wc, this.wcsB);
    for (let i = 0; i < 4; i++) this.wcs[i] += ((this.wcsB[i] ?? 0) - (this.wcs[i] ?? 0)) * u;
    // (plan 98 phase 13: its driven wheels spun by their slip as well as its speed — a burnout spins, a lock stops them)
    const slipV = (s1.slip ?? 0) * (s1.fl & CAR_FLAGS.brake ? -1 : 1);
    l.spin += (sp / spec.wheel.r) * dt;
    l.spinD = (l.spinD ?? l.spin) + ((sp + slipV) / spec.wheel.r) * dt;
    const driven = spec.drive === "all" ? [0, 1, 2, 3] : spec.drive === "front" ? [0, 1] : [2, 3];
    m.wheels.forEach((w, i) => {
      const locked = s1.fl & CAR_FLAGS.brake && (s1.slip ?? 0) > Math.abs(sp) * 0.6 && Math.abs(sp) > 2;
      const a = driven.includes(i) ? (l.spinD ?? l.spin) : l.spin;
      w.spin.rotation.z = (locked ? w.spin.rotation.z / (w.turnK ?? 1) : a) * (w.turnK ?? 1);
      if (w.front) w.steer.rotation.y = -steer;
      // (plan 93 S1: a flat, down on its rim)
      if (w.rest) w.steer.position.y = w.rest.y + (this.wcs[i] ?? 0) + (m.flatY?.[i] ?? 0);
    });
    // (plan 95 F6a: its flats squashed where its wheels are now — posed)
    if ((l.parts ?? 0) & (PART.flatFL | PART.flatFR | PART.flatRL | PART.flatRR)) m.flatsTick?.();
    m.steering.rotation.z = -steer * spec.steer.ratio;
    // (plan 98 phase 20: its rims blurred at speed)
    m.setWheelFx?.(sp / spec.wheel.r, 0);
    // its lamps from its switches
    const fl = s1.fl;
    // (plan 98 phase 17: the bulb's filament — up over 50 ms, dying away over 100)
    const bp = this.time % 0.9;
    const blink = bp < 0.55;
    const indK = bp < 0.45 ? Math.min(1, bp / 0.05) : Math.max(0, 1 - (bp - 0.45) / 0.1);
    m.setLights({
      indK,
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
    this.rimSparks(l, dt);
  }

  /** Someone else's car heard: its engine and tyres from what it sends, by distance. */
  private hearRemote(l: LiveView, s: Sample, sp: number, dt: number) {
    const me = this.host.me();
    const d = Math.hypot(l.pose.p.x - me.x, l.pose.p.z - me.y);
    // (no engine — the toboggan —: heard while it's ridden)
    const flag = !!(s.fl & CAR_FLAGS.engine) || !voiceOf(l.kind, l.look.variant);
    const was = l.engOn;
    l.engOn = flag;
    const on = d < HEARD && flag && mixer.ctx?.state === "running";
    if (on && !l.sound && mixer.ctx) {
      l.sound = soundOf(mixer.ctx, l.kind, l.look.variant);
      // (plan 98 phase 7: switched on while I'm near — its starter heard, not just its engine)
      if (was === false) l.sound?.start(0.4);
    }
    if (!on && l.sound) {
      // (switched off — not only gone out of earshot: its stop and its tick as it cools)
      if (was && !flag) l.sound.switchOff();
      l.sound.dispose();
      l.sound = null;
    }
    if (!l.sound) return;
    // (plan 98 phase 15: each wheel's own ground — one under its middle for all four before)
    const a = headingFromQ(l.pose.q);
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const hw = l.spec.track / 2;
    const hl = l.spec.wheelbase / 2;
    const gs = [
      [hl, -hw],
      [hl, hw],
      [-hl, -hw],
      [-hl, hw],
    ].map(([u, w]) => this.groundUnder(l.pose.p.x + u * ca - w * sa, l.pose.p.z + u * sa + w * ca));
    // (plan 98 phase 15: a crash heard — a sudden change of its velocity, as its driver's car felt it)
    const dv = l.hv ? Math.hypot(l.pose.v.x - l.hv.x, l.pose.v.y - l.hv.y, l.pose.v.z - l.hv.z) : 0;
    (l.hv ??= new Vector3()).copy(l.pose.v);
    const hit = dt > 0 && dv > 2.2 && dv / dt > 40 ? { what: "car", j: l.spec.mass * dv, v: dv, at: this.time } : null;
    const fake = {
      rpm: s.rpm,
      // (plan 98 phase 15: its throttle as sent — on load, off it, a lift's pops; guessed from the revs before)
      thr: s.thr ?? Math.min(1, Math.max(0, (s.rpm - 1200) / 4000)),
      clutch: 1,
      spec: l.spec,
      hb: s.fl & CAR_FLAGS.hand ? 1 : 0,
      // (plan 93: the grip its tyres use, as its driver's car has it — the scrub and squeal heard rising)
      wheels: [0, 1, 2, 3].map((i) => ({
        contact: true,
        ground: gs[i],
        used: s.grip || (s.slip > 1 ? 1.3 : 0.4),
        slip: s.slip,
        cv: 0,
      })),
      hit,
      v: { x: l.pose.v.x, y: l.pose.v.y, z: l.pose.v.z },
      q: { x: l.pose.q.x, y: l.pose.q.y, z: l.pose.q.z, w: l.pose.q.w },
      shiftT: 0,
      gear: s.gear,
      // (plan 95 F3a: braking, by its lamps — its ABS taken as at work: no lock's squeal heard from it)
      brk: s.fl & CAR_FLAGS.brake ? 1 : 0,
      helping: s.fl & CAR_FLAGS.brake ? 1 : 0,
    } as unknown as CarState;
    const heard = this.heardAt(l.pose.p.x, l.pose.p.y, l.pose.p.z);
    const extras: CarExtras = {
      wipers: (s.fl >> 8) & 3,
      bumperHang: !!((l.parts ?? 0) & PART.bumperHang) && !((l.parts ?? 0) & PART.bumperGone),
      chains: bitsN(Number((this.host.room()?.state.vehicles.get(l.id) as VehWire | undefined)?.chains ?? 0)),
    };
    // (plan 93 S5: from inside my car in its cockpit, another car through my glass)
    const through = this.mine && this.cam.mode === "cockpit" && this.mine.vid !== l.id ? this.cabinSeal() : 0;
    // (plan 98 phase 15: its indicator's relay heard, in step with its lamps)
    const blinkOn = !!(s.fl & (CAR_FLAGS.left | CAR_FLAGS.right | CAR_FLAGS.hazard)) && this.time % 0.9 < 0.45;
    // (plan 98 phase 16) going by: its pitch by how fast it closes on me (I may be driving too); behind a wall or the
    // land, muffled (the sight ray, a few times a second)
    const tpv = this.host.tp();
    let doppler = 1;
    let occl = l.occl ?? 0;
    if (tpv) {
      const cp = tpv.camera.position;
      const w = this.root.localToWorld(hE.copy(l.pose.p));
      const dx = w.x - cp.x;
      const dy = w.y - cp.y;
      const dz = w.z - cp.z;
      const dd = Math.hypot(dx, dy, dz) || 1;
      const mv = this.mine?.sim?.v;
      const rel = (l.pose.v.x - (mv?.x ?? 0)) * dx + (l.pose.v.z - (mv?.z ?? 0)) * dz;
      const closing = -rel / dd;
      doppler = Math.max(0.85, Math.min(1.18, 343 / (343 - closing)));
      if (this.time - (l.occlAt ?? -9) > 0.25) {
        l.occlAt = this.time;
        const hitD = dd > 3 ? this.physics()?.ray(cp.x, cp.y, cp.z, dx / dd, dy / dd, dz / dd, dd - 1.5) : null;
        l.occlWant = hitD !== null && hitD !== undefined ? 0.7 : 0;
      }
      occl += ((l.occlWant ?? 0) - occl) * Math.min(1, dt * 4);
      l.occl = occl;
    }
    l.sound.update(
      fake,
      {
        inside: false,
        dist: heard?.dist ?? d,
        at: heard?.at ?? null,
        through: Math.max(through, occl),
        doppler,
        rain: wxNow.rain,
      },
      dt,
      blinkOn,
      false,
      extras,
    );
    l.sound.horn(!!(s.fl & CAR_FLAGS.horn) && d < HEARD);
    this.hornHeard(
      l,
      !!(s.fl & CAR_FLAGS.horn),
      String(this.host.room()?.state.vehicles.get(l.id)?.seats ?? "").split("|")[0],
    );
    l.sound.siren(!!(s.fl & CAR_FLAGS.siren) && d < HEARD);
    void sp;
  }

  /** Where a car (at a point in the cars' group) is from the camera — the ears: how far, and its place in
   *  the camera's frame (x right, y up, −z ahead) for the 3D panner. */
  private heardAt(x: number, y: number, z: number): { dist: number; at: { x: number; y: number; z: number } } | null {
    const tp = this.host.tp();
    if (!tp) return null;
    const c = tp.camera;
    const to = v3.set(x, y, z).applyMatrix4(this.root.matrixWorld).sub(c.position);
    const dist = to.length();
    to.applyQuaternion(this.camInv.copy(c.quaternion).invert());
    return { dist, at: { x: to.x, y: to.y, z: to.z } };
  }
  private camInv = new Quaternion();

  // ── mine ───────────────────────────────────────────────────────────────────
  private become(now: { vid: string; seat: number } | null) {
    const was = this.mine;
    if (was && !now && this.coastWant === was.vid && was.seat === 0 && was.drive && was.sim) {
      // (plan 99 F2a) jumped out: it rolls on — its Jolt car, its sim and its sound kept, driven on with nobody's hands
      this.coastWant = "";
      this.coast?.drive && this.physics()?.carWorld.removeCar(this.coast.drive.car);
      this.coast = was;
      this.coastStill = 0;
      this.coastAt = this.time;
      this.mine = null;
      this.camNow = null;
      this.hudAt = 0;
      this.input.clear();
      this.hideHud();
      return;
    }
    if (was && (!now || now.vid !== was.vid || now.seat !== was.seat)) {
      // out (or moved seat): my sim, its Jolt car and sound go (the driver out: the engine's stop, its tick)
      if (was.seat === 0 && was.started) was.sound?.switchOff();
      was.sound?.dispose();
      if (was.drive) {
        this.physics()?.carWorld.removeCar(was.drive.car);
        this.physics()?.ownCar(was.vid, false);
      }
      // (plan 98 F3a: out — the camera behind me on the door's side, looking at the car: I'm seen getting out)
      const lw = this.live.get(was.vid);
      const tpv = this.host.tp();
      const seat = lw?.model.seats[was.seat];
      if (lw && tpv && seat && !this.cancelled) {
        const out = hE.set(0, 0, Math.sign(seat.hip.z) || 1).transformDirection(lw.model.body.matrixWorld);
        tpv.yaw = Math.atan2(-out.z, -out.x) + 0.35 * (Math.sign(seat.hip.z) || 1);
      }
      this.mine = null;
      this.camNow = null;
      this.hudAt = 0;
      this.input.clear();
      this.hideHud();
    }
    if (now && !this.mine) {
      const l = this.live.get(now.vid);
      if (!l) return;
      this.wanted = "";
      // (plan 93 S2: in with a gun out — put away: the car's as ever till one's drawn here)
      if (this.myGun()) this.host.room()?.send("arms:draw", { slot: -1 });
      this.mine = {
        vid: now.vid,
        seat: now.seat,
        sim: null,
        rig: null,
        drive: null,
        acc: 0,
        seq: 0,
        sentAt: 0,
        simMs: 1,
        sound: null,
        started: false,
        grime: 0,
        dmg: noDamage(),
        wearSent: "",
        wearAt: 0,
        hitAt: -1,
        dry: false,
      };
      if (now.seat === 0) {
        const room = this.host.room();
        const v = room?.state.vehicles.get(now.vid) as VehWire;
        const spec = l.spec;
        const sim = createCar(spec, v.x, v.y - spec.cog, v.z, headingFromQ(new Quaternion(v.qx, v.qy, v.qz, v.qw)));
        // (its tank and its wear: as it was left)
        sim.fuel = Math.max(0, Math.min(1, v.fuel ?? 0.7)) * spec.fuel.litres;
        this.mine.grime = v.grime ?? 0;
        this.mine.dmg = dmgOf(v.dmg);
        this.mine.wearSent = `${this.mine.grime}|${damageString(this.mine.dmg)}`;
        l.parts = this.mine.dmg.parts;
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
        // (its yaw as it was going: the Jolt car takes it all)
        sim.w = { x: 0, y: Math.hypot(v.vx, v.vz) < 0.2 ? 0 : sim.w.y, z: 0 };
        // (someone else's car pulled in my world till now: mine on Jolt instead)
        if (l.pulled) {
          this.physics()?.carWorld.removePulled(l.pulled);
          l.pulled = null;
        }
        this.joltUp(this.mine);
        // (on after dark, and in the morning fog — docs/plan/64 F4)
        this.beams = Math.max(this.host.night(), this.host.lampFog()) > 0.4 && !sim.spec.pushed ? "low" : "off";
        // (on in a storm, and in the rain: docs/plan/65 W7)
        this.wipers = this.host.storm() > 0.4 || wxNow.rain > 0.2 ? 2 : 0;
        this.wipersAuto = true;
      }
      this.cam.mode = "chase";
      this.enteredAt = this.time;
      this.siren = false;
      // (plan 98 F3a: the HUD once I'm sat; the camera with me till then)
      this.hudAt = this.time + ENTER_S - 0.35;
      this.actCam = null;
    }
  }

  /** My car on Jolt (docs/plan/92 phase 3): made in the 3D view's physics once it's in. */
  private joltUp(m: NonNullable<Cars["mine"]>): Drive | null {
    if (m.drive) return m.drive;
    const s = m.sim;
    const ph = this.physics();
    if (!s || !ph) return null;
    ph.drivingAt(s.p.x, s.p.z, s.v.x, s.v.z);
    ph.ownCar(m.vid, true);
    // (its hull the model's own collider, where the manifest has it: docs/plan/92 phase 9)
    const def = defOf(s.spec);
    const lv = this.live.get(m.vid);
    if (lv) def.hull.pts = hullPoints(lv.look.variant, s.spec.cog);
    const car = ph.carWorld.addCar(def, s.p.x, s.p.y + 0.03, s.p.z, [s.q.x, s.q.y, s.q.z, s.q.w], m.vid);
    if (!car) return null;
    car.setVelocity([s.v.x, s.v.y, s.v.z], [s.w.x, s.w.y, s.w.z]);
    if (Math.hypot(s.v.x, s.v.z) > 0.5)
      for (let i = 0; i < 4; i++) car.setSpin(i, Math.hypot(s.v.x, s.v.z) / s.spec.wheel.r);
    m.drive = new Drive(s, car);
    m.drive.prime();
    return m.drive;
  }

  private drive(room: RoomLike, dt: number, now: number) {
    const m = this.mine;
    if (!m) return;
    const l = this.live.get(m.vid);
    if (!l) return;
    const pad = activePad();
    const { c, switches } = this.input.read(pad);
    // (plan 98 F2a) still getting in: nothing drives it yet — the handbrake on; walked off (a move early, before a foot's
    // in), the act let go: out again, no climbing out
    const actT = this.myActT();
    const getting = actT !== null && actT < ENTER_S;
    if (getting) {
      const moved = Math.abs(c.steer) > 0.3 || c.up > 0.3 || c.down > 0.3;
      if (moved && actT < 1.2 && this.cancelled !== m.vid) {
        this.cancelled = m.vid;
        room.send("car:leave", {});
      }
      c.up = 0;
      c.down = 0;
      c.steer = 0;
      c.hand = 1;
    }
    for (const sw of switches) {
      // (on its roof or its side, still: R puts it back on its wheels — the radio's key otherwise)
      if (sw === "radio" && m.drive?.canRight && m.drive.right(this.world)) {
        m.rig?.snap();
        continue;
      }
      this.switch(sw);
    }
    // looking round: the right stick (back to ahead when let go)
    const rx = pad?.axes[2] ?? 0;
    const ry = pad?.axes[3] ?? 0;
    const look = this.cam.look;
    // (plan 98 phase 9: the stick's place is where you look — round as far as it's pushed, back as it's let go;
    // a round dead zone)
    if (Math.hypot(rx, ry) > 0.15) {
      const k = 1 - Math.exp(-dt * 10);
      look.yaw += (rx * 2.2 - look.yaw) * k;
      look.pitch += (Math.max(-0.5, Math.min(0.4, -ry * 0.5)) - look.pitch) * k;
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
      // (plan 93 S7) a tow rope: its pull on my car
      if (m.drive) m.drive.ext = this.ropePull(s, vw);
      const tank = s.spec.fuel.litres;
      if (vw && (vw.filling || (vw.fuel ?? 0) * tank > s.fuel + 0.5)) s.fuel = (vw.fuel ?? 0) * tank;
      // the engine: on as I sit down (the starter turns it over first); dry, it won't; filled, it
      // starts again
      // (plan 93 S1: shot dead — it won't start, and stops if it's running)
      const dead = !!(m.dmg.parts & PART.engineDead);
      if (dead && s.rpm > 0) {
        setEngine(s, false);
        m.sound?.switchOff();
        this.host.toast(t("carShotDead"));
      }
      // (plan 98 phase 7, F6a) sat: the key turned — the dash's self-test, the starter cranking (longer cold) and
      // heard by others, then it catches; the throttle cuts the crank short
      if (!dead && !getting && (!m.started || (m.dry && s.fuel > 0.3 && !vw?.filling))) {
        if (m.crankAt === undefined) {
          const cold = Math.max(0, Math.min(1, 1 - s.temp / 0.55));
          m.crankAt = this.time;
          m.keyAt = this.time;
          m.crankS = 0.8 + 0.7 * cold;
          if (mixer.ctx) {
            m.sound ??= soundOf(mixer.ctx, l.kind, l.look.variant);
            m.sound?.start(cold, m.crankS);
          }
        }
        const cr = this.time - m.crankAt;
        if (c.up > 0.5 && (m.crankS ?? 0) - cr > 0.3) m.crankS = cr + 0.3;
        if (cr >= (m.crankS ?? 0)) {
          m.crankAt = undefined;
          m.started = true;
          m.dry = false;
          setEngine(s, true);
        }
      }
      if (m.rig) {
        m.rig.state.key = m.keyAt !== undefined && this.time - m.keyAt < 3 ? this.time - m.keyAt : -1;
        // (plan 98 phase 18: read in the cockpit, redrawn twice as often)
        m.rig.clusterHz = this.cam.mode === "cockpit" ? 20 : 8;
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
      // on Jolt (docs/plan/92): stepped here, at a fixed 1/60 s (two collision steps — the bench's, its
      // feel tuned there), each step its hands and feet, the world's step, read back; drawn between the
      // last two (the rig's alpha). (Plan 92 feedback: stepped by the frame's dt after it was drawn, the
      // car was a frame behind the camera, which went on by this frame's — on uneven frames it flicked
      // back.) The view doesn't step the world again this frame (BrowserPhysics.carStepped).
      const d = this.joltUp(m);
      const ph = this.physics();
      this.helps.auto = !prefs().carManual;
      if (d && ph) {
        ph.drivingAt(s.p.x, s.p.z, s.v.x, s.v.z);
        // (a bad front pulls the steering a little: docs/plan/92 phase 9)
        const pull = steerPull(m.dmg);
        if (pull) c.steer = Math.max(-1, Math.min(1, c.steer + pull));
        m.acc += Math.min(dt, 0.25);
        let n = 0;
        while (m.acc >= CAR_STEP && n < CAR_STEPS_MAX) {
          d.pre(c, this.world, CAR_STEP, this.helps);
          ph.carStep(CAR_STEP);
          d.post(this.world, CAR_STEP);
          m.rig.stepped();
          m.simMs += CAR_STEP * 1000;
          if (s.hit) this.hitBy(room, s);
          m.acc -= CAR_STEP;
          n++;
        }
        // (a long stall: the time beyond a few steps let go, not caught up)
        if (n === CAR_STEPS_MAX) m.acc = Math.min(m.acc, CAR_STEP);
        ph.carStepped = true;
        this.scraping(s);
        if (d.canRight && this.time - this.rightToast > 8) {
          this.rightToast = this.time;
          toast(t("carRight"), "info");
        }
      }
      this.wearOn(room, s, l, dt, now);
      const rig = m.rig;
      rig.state.beams = this.beams;
      rig.state.ind = this.ind;
      rig.state.hazard = this.hazard;
      rig.state.wipers = this.wipers;
      rig.state.dash = this.host.night() > 0.4 ? 1 : 0.45;
      rig.state.clock = new Date().toTimeString().slice(0, 5);
      // (the air's: the room's weather — docs/plan/65 W9)
      rig.state.outside = Math.round(wxNow.temp);
      rig.pose(d ? Math.min(1, m.acc / CAR_STEP) : 1, dt, this.time);
      l.pose.p.set(s.p.x, s.p.y, s.p.z);
      l.pose.q.set(s.q.x, s.q.y, s.q.z, s.q.w);
      l.pose.v.set(s.v.x, s.v.y, s.v.z);
      // to the server, twenty times a second
      if (now - m.sentAt >= 1000 / CAR_HZ) {
        m.sentAt = now;
        room.send("car:state", toWire(s, ++m.seq, this.flags(s), m.simMs));
      }
      // sound, the pad's rumble
      const rough = s.wheels.reduce((a, w) => a + GRIP[w.ground].rough, 0) / 4;
      if (s.hit) this.cam.knock(Math.min(1, s.hit.j / 8000));
      // (heard from the camera: in the cockpit inside it, else round it as anyone's)
      const inside = this.cam.mode === "cockpit";
      const heard = inside ? null : this.heardAt(s.p.x, s.p.y, s.p.z);
      this.scrapeK = Math.max(0, this.scrapeK - dt * 4);
      // (plan 93 S5: my window down lets the outside in — and the wind; another's, a little)
      const win = l.win & (1 << m.seat) ? 1 : l.win ? 0.35 : 0;
      m.sound?.update(
        s,
        {
          inside,
          dist: heard?.dist ?? 0,
          at: heard?.at ?? null,
          open: win,
          // (plan 98 phase 16: from the chase camera, outside it, its cabin's own sounds lower; the rain on its roof)
          cabinK: this.cam.mode === "cockpit" ? 1 : 0.55,
          rain: wxNow.rain,
        },
        dt,
        this.ind !== 0 && this.time % 0.9 < 0.45,
        true,
        {
          hand: c.hand,
          wipers: this.wipers,
          indicating: this.ind !== 0 || this.hazard,
          bumperHang: !!(m.dmg.parts & PART.bumperHang) && !(m.dmg.parts & PART.bumperGone),
          scrape: this.scrapeK,
          chains: bitsN(m.drive?.chains ?? 0),
        },
      );
      m.sound?.horn(this.hornNow());
      this.hornHeard(l, this.hornNow(), this.host.room()?.sessionId ?? "");
      m.sound?.siren(this.siren);
      this.beaconOf(l, this.siren);
      const slip = s.wheels.reduce((a, w) => Math.max(a, w.slip), 0);
      // (plan 98 phase 12) and what a driver feels through the wheel and the seat: a gear's kick (40 ms), the limiter's
      // buzz, the ABS's pump, a bump or a kerb (the springs' speed), coming down off a jump
      const bump = s.wheels.reduce((a, w) => Math.max(a, Math.abs(w.cv)), 0);
      if (s.gear !== this.gearWas) {
        if (this.gearWas !== null && s.gear !== 0) this.kickAt = this.time;
        this.gearWas = s.gear;
      }
      const shiftKick = this.time - this.kickAt < 0.05 ? 0.35 : 0;
      const limiter = s.rpm > s.spec.engine.limit - 100 ? 0.25 : 0;
      const abs = s.helping & 1 ? 0.3 : 0;
      const land = this.wasAir && s.wheels.some((w) => w.contact) ? Math.min(1, Math.abs(s.v.y) / 4) : 0;
      this.wasAir = s.wheels.every((w) => !w.contact);
      this.input.rumble(
        pad,
        (s.hit ? Math.min(1, s.hit.j / 6000) : 0) +
          rough * 4 * Math.min(1, readout(s).speed / 15) +
          Math.max(0, bump - 0.4) * 0.5 +
          shiftKick +
          land,
        Math.min(1, slip / 8) * 0.5 + limiter + abs,
      );
      // lights for real at night (plan 93 S10: down at the drive-in; flashed up)
      const fu = this.time - this.flashAt;
      this.headlamps(l, fu < 0.9 && fu % 0.45 < 0.22 ? "high" : this.beams);
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
        m.sim ?? ({ v: { x: l.pose.v.x, y: l.pose.v.y, z: l.pose.v.z }, str: 0, spec: l.spec } as unknown as CarState);
      const rigFor = m.rig ?? this.passengerRig(l);
      const rough = m.sim ? m.sim.wheels.reduce((a, w) => a + GRIP[w.ground].rough, 0) * 2.5 : 0.02;
      // (plan 98 phase 8: the chase camera kept out of walls and the land — Jolt's sight, as the walker's)
      this.cam.ray ??= (x, y, z, dx, dy, dz, max) => this.physics()?.ray(x, y, z, dx, dy, dz, max) ?? null;
      this.cam.update(cam, rigFor, sim, dt, this.input.lookBack, rough);
      // (plan 93 S2: aiming out of my window — the camera at it, past my head, looking out along my aim)
      const gunMode = this.gunSeat()?.aiming ?? false;
      if (gunMode && !this.aimWas) this.aimLook = { yaw: 0, pitch: 0 };
      this.aimWas = gunMode;
      const aimNow = gunMode && !(globalThis as { __aimCamOff?: boolean }).__aimCamOff;
      if (aimNow) {
        const dir = this.aimDir(l, m.seat, hB);
        // (over the shooting shoulder, beside the head, sighting along the aim — else at the window)
        const meP = this.meSat(l);
        const S = (l.model.seats[m.seat]?.hip.z ?? 0) > 0 ? "shoulderL" : "shoulderR";
        const sh = meP?.m.bone(S);
        // (a little ahead of the shoulder and out toward the window: clear of the door's pillar behind it)
        const side = Math.sign(l.model.seats[m.seat]?.hip.z ?? 1) || 1;
        const k = meP?.m.root.scale.x || 1;
        const ahead = hE.set(-1, 0, 0).transformDirection(l.model.body.matrixWorld);
        const outward = hF.set(0, 0, side).transformDirection(l.model.body.matrixWorld);
        const eye = sh
          ? sh
              .getWorldPosition(hA)
              .add(hD.set(0, 0.16 * k, 0))
              .addScaledVector(ahead, 0.14 * k)
              .addScaledVector(outward, 0.1 * k)
          : this.windowAt(l, m.seat, 0.2, hA).add(hD.set(0, 0.03, 0));
        cam.position.copy(eye);
        cam.lookAt(hC.copy(eye).add(dir));
        cam.fov = 56;
        cam.updateProjectionMatrix();
      } else if (m.seat !== 0 && this.cam.mode === "cockpit") {
        // a passenger's own eyes: their seat's, not the driver's
        const seat = l.model.seats[m.seat];
        v3.set(seat.hip.x + 0.06, 1.3, seat.hip.z).applyMatrix4(l.model.root.matrixWorld);
        cam.position.copy(v3);
      }
      // (a probe's close look — e2e/car-gunseat.mts: from, to, the world's)
      const peek = (globalThis as { __camPeek?: () => { from: number[]; to: number[] } | null }).__camPeek?.();
      if (peek) {
        cam.position.set(peek.from[0], peek.from[1], peek.from[2]);
        cam.lookAt(peek.to[0], peek.to[1], peek.to[2]);
        cam.fov = 40;
        cam.updateProjectionMatrix();
      }
      const look = new Vector3(0, 0, -1).applyQuaternion(cam.quaternion).multiplyScalar(10).add(cam.position);
      // (plan 98 F3a) getting in: the camera kept where it was off me, following me through the act, then eased into
      // the car's over its last beats
      const actT = this.myActT();
      const meP = actT !== null && actT < ENTER_S ? this.meSat(l) : null;
      if (meP && actT !== null && !peek) {
        const focus = (meP.m.bones.head ?? meP.m.bones.chest)?.getWorldPosition(hE) ?? meP.m.root.getWorldPosition(hE);
        if (!this.actCam) {
          this.actCam = this.camBefore ?? tp.camera.position.clone().sub(focus);
          this.camBefore = null;
        }
        const k0 = (actT - (ENTER_S - 1.0)) / 1.0;
        const k = k0 <= 0 ? 0 : k0 >= 1 ? 1 : k0 * k0 * (3 - 2 * k0);
        const eye = hF.copy(focus).add(this.actCam).lerp(cam.position, k);
        look.copy(focus).lerp(look, k);
        cam.position.copy(eye);
      }
      this.camNow = {
        eye: [cam.position.x, cam.position.z, cam.position.y],
        look: [look.x, look.z, look.y],
        fov: cam.fov,
        showMe: false,
        // (held to it once I'm in — the act's own camera blends till then; probes and specs read it as "sat")
        snap: actT === null || actT >= ENTER_S,
      };
    }
  }
  private camScratch = new PerspectiveCamera(62, 1.6, 0.05, 3000);
  private passengerRigs = new Map<string, CarRig>();
  private passengerRig(l: LiveView): CarRig {
    let r = this.passengerRigs.get(l.id);
    if (!r) {
      // (a rig only for the camera's sake: the model is posed from the samples)
      const fake = createCar(l.spec, l.pose.p.x, l.pose.p.y, l.pose.p.z, 0);
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
    } else if (sw === "wipers") {
      this.wipers = ((this.wipers + 1) % 4) as 0 | 1 | 2 | 3;
      this.wipersAuto = false;
    } else if (sw === "camera") this.cam.cycle();
    // (plan 94 P10: the keys' slip, again — or away, if it's up)
    else if (sw === "keys") this.keysAt = this.time - this.keysAt < 9.5 ? -99 : this.time;
    // (plan 94 G6, F10b: its doors locked from the driver's seat — its empty seats then its keys' alone — or not)
    else if (sw === "lock") {
      const m = this.mine;
      if (m?.seat === 0) {
        const oid = m.vid.replace(/^car:/, "");
        const pr = this.propsOf(oid);
        if (pr?.ownerId && mayDrive(pr, this.host.uid(), Date.now()))
          this.host.room()?.send("car:lock", { id: oid, on: !pr.locked });
      }
    } else if (sw === "exit") this.act("car:leave", this.mine?.vid ?? "");
    else if (sw === "radio") {
      // (a passenger's: the driver's client keeps the station — the server tells it)
      if (this.mine && this.mine.seat !== 0) this.host.room()?.send("car:radio", {});
      else {
        // (plan 93 S10: a car near playing another station — tuned to theirs first, the drive-in's)
        const theirs = this.stationNear();
        if (theirs > 0 && theirs !== this.station && this.tunedTo !== theirs) {
          this.station = theirs;
          this.tunedTo = theirs;
          this.host.toast(t("carTunedTo"));
        } else {
          this.station = (this.station + 1) % 4;
          this.tunedTo = 0;
        }
      }
    } else if (sw === "flash" && this.mine?.seat === 0) this.flashAt = this.time;
    else if (sw === "toot" && this.mine?.seat === 0) this.tootAt = this.time;
    else if (sw === "unstick" && this.mine?.seat === 0) {
      this.host.room()?.send("car:unstick", {});
      this.stuckFor = 0;
    } else if (sw === "fill" && this.mine?.seat === 0) {
      const v = this.host.room()?.state.vehicles.get(this.mine.vid) as VehWire | undefined;
      this.host.room()?.send("car:fill", { on: !v?.filling });
    } else if (sw === "diff" && this.mine?.sim) this.mine.sim.lock = !this.mine.sim.lock;
    else if (sw === "range" && this.mine?.sim) this.mine.sim.low = !this.mine.sim.low;
    else if (sw === "window" && this.mine) {
      // (plan 93 S5) my seat's own window: down, or up again
      const v = this.host.room()?.state.vehicles.get(this.mine.vid) as VehWire | undefined;
      const down = !!((v?.win ?? 0) & (1 << this.mine.seat));
      this.host.room()?.send("car:window", { down: !down });
      // (plan 98 phase 16: the window's motor is windowMotor's alone — this made a second, synth one under it)
    }
  }

  /** (plan 93 S10) the lights flashed, the two-tone toot: when (this.time); a station tuned to from a car near */
  private flashAt = -9;
  private tootAt = -9;
  private tunedTo = 0;
  /** the horn: held, or the toot's two taps */
  private hornNow(): boolean {
    const u = this.time - this.tootAt;
    return this.input.horn || (u >= 0 && (u < 0.11 || (u > 0.2 && u < 0.31)));
  }
  /** (plan 93 S10) the station of the nearest other car playing one, within 25 m (0: none) */
  private stationNear(): number {
    const m = this.mine;
    const own = m ? this.live.get(m.vid) : null;
    if (!own) return 0;
    let best = 0;
    let bd = 25;
    for (const l of this.live.values()) {
      if (l === own) continue;
      const st = ((l.pb.buf[l.pb.buf.length - 1]?.fl ?? 0) >> 14) & 3;
      const d = l.pose.p.distanceTo(own.pose.p);
      if (st > 0 && d < bd) {
        bd = d;
        best = st;
      }
    }
    return best;
  }

  private flags(s: CarState): number {
    let f = 0;
    // (the lamps as switched — plan 95 F2a: no drive-in dip, the radio never puts them out; flashed: twice)
    if (this.beams === "low") f |= CAR_FLAGS.low;
    if (this.beams === "high") f |= CAR_FLAGS.low | CAR_FLAGS.high;
    const fu = this.time - this.flashAt;
    if (fu < 0.9 && fu % 0.45 < 0.22) f |= CAR_FLAGS.low | CAR_FLAGS.high;
    if (s.brk > 0.05) f |= CAR_FLAGS.brake;
    if (s.gear === -1) f |= CAR_FLAGS.reverse;
    if (this.ind === -1) f |= CAR_FLAGS.left;
    if (this.ind === 1) f |= CAR_FLAGS.right;
    if (this.hazard) f |= CAR_FLAGS.hazard;
    if (this.hornNow()) f |= CAR_FLAGS.horn;
    if (this.wipers & 1) f |= CAR_FLAGS.wipers1;
    if (this.wipers & 2) f |= CAR_FLAGS.wipers2;
    // (plan 98: cranking — others hear the starter from the flag's rise)
    if (s.rpm > 50 || this.mine?.crankAt !== undefined) f |= CAR_FLAGS.engine;
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

  /** My car hit something this step: someone (at speed: knocked down), or a dent where it hit. `told`: another car's
   *  driver's crash into mine, told (plan 98 phase 25) — not told back. */
  private hitBy(room: RoomLike, s: CarState, told = false) {
    const h = s.hit;
    const m = this.mine;
    if (!h || !m) return;
    // (plan 98 phase 25: into a car someone's driving — its driver told, once, so both of us feel the one crash)
    if (!told && h.what === "car" && h.id && this.live.has(h.id) && h.j > 2500) {
      if (this.time - (this.toldAt.get(h.id) ?? -9) > 0.4) {
        this.toldAt.set(h.id, this.time);
        room.send("car:hit", {
          other: h.id,
          j: Math.round(h.j),
          vx: s.v.x,
          vz: s.v.z,
          m: s.spec.mass,
          x: h.x,
          z: h.z,
        });
      }
    }
    if (h.what === "person" || h.what === "pet") {
      if (!h.id || (h.v ?? 0) < 2.2 || this.time - (this.knocked.get(h.id) ?? -9) < 4) return;
      this.knocked.set(h.id, this.time);
      if (h.what === "pet") room.send("pet:hit", { id: h.id });
      else room.send("car:knock", { sid: h.id });
      return;
    }
    // (a knock, not a lean or the ground under it: hard enough, and not the same one again)
    if (h.what === "bank" || h.j < 2500 || s.t - m.hitAt < 0.3) return;
    const k = Math.min(0.35, (h.j - 2500) / 16000);
    const l = this.live.get(m.vid);
    if (h.what === "ground") {
      // (the ground: only on its side or its roof — a roll's — the roof's dents; a landing on its wheels
      // is the springs')
      const up = 1 - 2 * (s.q.x * s.q.x + s.q.z * s.q.z);
      if (up > 0.35) return;
      m.hitAt = s.t;
      knock(m.dmg, 4, k, 0);
      if (l) this.partsChanged(l, m.dmg);
      this.scrape(s.p.x, s.p.y + 0.2, s.p.z, s.v.x, s.v.z, 0, 0, Math.min(1, Math.hypot(s.v.x, s.v.z) / 8));
      return;
    }
    m.hitAt = s.t;
    // where on it: the front, the back, or a side (the sim's x ahead, z to the right)
    const a = headingOf(s.q);
    const b = boxOf(s.spec);
    const dx = h.x - (s.p.x + Math.cos(a) * b.off);
    const dz = h.z - (s.p.z + Math.sin(a) * b.off);
    const u = dx * Math.cos(a) + dz * Math.sin(a);
    const w = -dx * Math.sin(a) + dz * Math.cos(a);
    const i = u > b.hx * 0.55 ? 0 : u < -b.hx * 0.55 ? 1 : w < 0 ? 2 : 3;
    // (across the front or back: −1 its left .. 1 its right; along a side: −1 its back .. 1 its front)
    const across = i < 2 ? Math.max(-1, Math.min(1, w / b.hz)) : Math.max(-1, Math.min(1, u / b.hx));
    knock(m.dmg, i as 0 | 1 | 2 | 3, k, across);
    if (l) this.partsChanged(l, m.dmg);
    // (metal on something hard: sparks where it struck, flung along the way it was going)
    if ((h.v ?? 0) > 3) {
      const sp = Math.hypot(s.v.x, s.v.z) || 1;
      this.scrape(h.x, s.p.y, h.z, s.v.x, s.v.z, -dx / sp, -dz / sp, Math.min(1, (h.v ?? 0) / 10));
    }
  }

  /** (plan 98 phase 25) Struck by another driver's car (their screen's crash, told): mine shoved by the momentum
   *  along the line of the hit, by both weights, and dented where it was struck — unless I felt it myself just now. */
  private struck(h: { by: string; j: number; vx: number; vz: number; m: number; x: number; z: number }) {
    const m = this.mine;
    const s = m?.sim;
    const room = this.host.room();
    if (!m || !s || m.seat !== 0 || !room) return;
    if (s.t - m.hitAt < 0.4) return;
    if (![h.j, h.vx, h.vz, h.m, h.x, h.z].every(Number.isFinite)) return;
    const nx0 = s.p.x - h.x;
    const nz0 = s.p.z - h.z;
    const nl = Math.hypot(nx0, nz0) || 1;
    const nx = nx0 / nl;
    const nz = nz0 / nl;
    const close = (h.vx - s.v.x) * nx + (h.vz - s.v.z) * nz;
    if (close > 0 && m.drive) {
      const k = (1.2 * Math.max(500, h.m)) / (Math.max(500, h.m) + s.spec.mass);
      const v: [number, number, number] = [s.v.x + nx * close * k, s.v.y, s.v.z + nz * close * k];
      m.drive.car.place(s.p.x, s.p.y, s.p.z, [s.q.x, s.q.y, s.q.z, s.q.w], v, [s.w.x, s.w.y, s.w.z]);
    }
    this.hitBy(
      room,
      { ...s, hit: { what: "car", j: h.j, x: h.x, z: h.z, v: Math.max(0, close), at: s.t } } as CarState,
      true,
    );
  }

  /** A car's broken parts as seen now: what broke since it was last seen falls and shatters (a bumper on
   *  the road, glass on the snow) — not what was broken before I first saw it (docs/plan/92 phase 9). */
  private partsChanged(l: LiveView, dm: Damage) {
    const parts = dm.parts;
    const was = l.parts;
    const wasW = l.wreck ?? 0;
    l.parts = parts;
    l.wreck = dm.wreck;
    if (was === undefined || was < 0) return;
    const newly = parts & ~was;
    const newlyW = dm.wreck & ~wasW;
    const blown = dm.fire === 3 && (l.fireSeen ?? 0) < 3;
    l.fireSeen = dm.fire;
    // (plan 94 P2: what's come off since: down onto the road — plan 94 P1: blown off, up and out)
    if (newlyW) this.partsOff(l.model, newlyW, blown ? BLOWN : l.pose.v);
    if (!newly) return;
    const m = l.model;
    m.root.updateMatrixWorld(true);
    // (heard: the bumper off, glass giving)
    const snd = l.sound ?? (this.mine?.vid === l.id ? this.mine.sound : null);
    if (newly & PART.bumperGone) snd?.bumperDrop();
    // (plan 94 P3: a pane gone, its burst; only cracked, a tick)
    const paneGone = PANE_GONE.some((b) => newly & b);
    if (newly & (PART.headL | PART.headR | PART.tailL | PART.tailR) || paneGone) snd?.glass("gone");
    else if (newly & GLASS_BITS) snd?.glass("crack");
    if (newly & PART.bumperGone) {
      const o = m.partCopy?.("bumper_f");
      if (o) {
        // (world → the cars' group)
        this.root.updateMatrixWorld(true);
        o.applyMatrix4(this.inv.copy(this.root.matrixWorld).invert());
        this.debris.drop(o, l.pose.v);
      }
    }
    // (glass: a lamp's lens, a side's windows, the windscreen giving)
    const glass: [number, number, number][] = [];
    const L = (x: number, y: number, z: number) => {
      v3.set(x, y, z).applyMatrix4(m.root.matrix);
      glass.push([v3.x, v3.y, v3.z]);
    };
    const head = m.lamps.head;
    if (newly & PART.headL && head[0]) L(head[0].x, head[0].y, head[0].z);
    if (newly & PART.headR && head[1]) L(head[1].x, head[1].y, head[1].z);
    if (newly & PART.tailL && m.lamps.tail[1]) L(m.lamps.tail[1].x, m.lamps.tail[1].y, m.lamps.tail[1].z);
    if (newly & PART.tailR && m.lamps.tail[0]) L(m.lamps.tail[0].x, m.lamps.tail[0].y, m.lamps.tail[0].z);
    for (const [x, y, z] of glass) {
      for (let k = 0; k < 3; k++) this.spray.throw(x, y, z, l.pose.v.x * 0.05, l.pose.v.z * 0.05, 0.9, false);
      // (plan 94 P2: a lamp's lens in bits)
      this.shards.burst(x, y, z, 10, l.pose.v.x, l.pose.v.z);
    }
    this.glassOut(m, newly, l.pose.v.x, l.pose.v.z, parseHoles(l.holes));
  }
  /** (plan 94 P1) Each frame, every car on fire near: smoking, thick black out of its engine bay; burning, its
   *  flames, more smoke, its light, its crackle and roar; burnt out, a thin smoke a while. The blasts' flashes. */
  private fireFrame(dt: number, night: number) {
    const lights: { x: number; y: number; z: number; k: number }[] = [];
    const t = this.time;
    const me = this.host.me();
    const ox = this.root.position.x;
    const oy = this.root.position.y;
    const oz = this.root.position.z;
    const each = (id: string, m: Sedan, fire: number, held: { fireAt?: number; fireHeard?: number }) => {
      if (m.engineAt) m.engineAt(v3);
      else v3.set(-1.2, 0.9, 0);
      v3.applyMatrix4(m.root.matrix);
      // (far off: none of it)
      if (Math.hypot(v3.x + ox - me.x, v3.z + oz - me.y) > 160) return;
      // (its sounds in before they're wanted: the bed, the catch, the blast)
      this.takes("fire");
      this.takes("fire-catch");
      this.takes("blast");
      // (just caught: its whoosh)
      if (fire === 2 && held.fireHeard !== undefined && held.fireHeard < 2) {
        const bs = this.takes("fire-catch");
        if (bs) this.playTake(bs, 1.1, v3.x, v3.y, v3.z);
      }
      held.fireHeard = fire;
      const dark = night > 0.5 ? 0x0c0b0a : 0x1a1714;
      if (fire === 1) {
        if (t - (held.fireAt ?? 0) > 0.09) {
          held.fireAt = t;
          this.smoke.emit(
            v3.x + (Math.random() - 0.5) * 0.6,
            v3.y + 0.2,
            v3.z + (Math.random() - 0.5) * 0.6,
            0,
            1.1 + Math.random() * 0.6,
            0,
            0.6,
            5.5,
            3.2,
            dark,
            0.55,
          );
        }
      } else if (fire === 2) {
        this.fires.burn(id, v3.x, v3.y, v3.z, 1);
        if (t - (held.fireAt ?? 0) > 0.06) {
          held.fireAt = t;
          this.smoke.emit(
            v3.x + (Math.random() - 0.5) * 0.8,
            v3.y + 1.1,
            v3.z + (Math.random() - 0.5) * 0.8,
            0,
            1.6 + Math.random() * 0.8,
            0,
            0.9,
            7,
            4.5,
            dark,
            0.8,
          );
          if (!this.fireLoop(id, v3.x, v3.y, v3.z) && Math.random() < 0.35) this.fireSound(v3.x, v3.y, v3.z);
        }
        lights.push({
          x: v3.x + ox,
          y: v3.z + oz,
          z: v3.y + oy + 0.9,
          k: 0.85 + 0.15 * Math.sin(t * 17 + v3.x) * Math.sin(t * 7.3),
        });
      } else if (fire === 3 && t - (held.fireAt ?? 0) > 0.5) {
        held.fireAt = t;
        this.smoke.emit(
          v3.x + (Math.random() - 0.5) * 2,
          v3.y,
          v3.z + (Math.random() - 0.5) * 2,
          0,
          0.7,
          0,
          0.5,
          4,
          3,
          dark,
          0.3,
        );
      }
    };
    for (const [id, l] of this.live) {
      const fire = this.mine?.vid === id ? this.mine.dmg.fire : (l.fire ?? 0);
      if (fire) each(id, l.model, fire, l);
    }
    for (const [id, p] of this.parked) {
      const m = p.full?.ready ? p.full : p.old?.ready ? p.old : null;
      if (p.fire && m && m.root.visible) each(id, m, p.fire, p);
    }
    for (const f of this.fires.flash()) lights.push({ x: f.x + ox, y: f.z + oz, z: f.y + oy, k: f.k });
    // (the beds of fires that aren't now: stopped)
    for (const [id, f] of this.fireLoops) {
      if (f.seen) {
        f.seen = false;
        continue;
      }
      f.src.stop();
      f.src.disconnect();
      f.g.disconnect();
      f.p.disconnect();
      this.fireLoops.delete(id);
    }
    this.fires.step(dt, t);
    const tp = this.host.tp();
    if (tp) tp.fireLights = lights;
  }
  /** (plan 94 P1) A car blew at (x, y, z) (the cars' coords, y up): the fireball, the boom by distance, my car's
   *  camera shaken if I'm near in one. */
  private blastFx(x: number, y: number, z: number) {
    this.fires.blast(x, y, z);
    // (the recorded one picked on /dev/car-sound; made, till it's in)
    const bs = this.takes("blast");
    if (bs) this.playTake(bs, 1.5, x, y, z);
    else this.boom(x, y, z);
    const me = this.host.me();
    const d = Math.hypot(x + this.root.position.x - me.x, z + this.root.position.z - me.y);
    if (this.mine && d < 30) this.cam.knock(Math.min(1, 1.4 - d / 25));
  }
  // ── (plan 96 F2a) the blast's hop, as in San Andreas: thrown up about a metre, tipping a way of its own, slammed
  // down where it was with a bounce, rocking a moment — drawn on every screen from car:blast, over where it is ──
  private hops = new Map<
    string,
    {
      t0: number;
      roll: number;
      pitch: number;
      root: Object3D | null;
      base: { p: Vector3; q: Quaternion } | null;
      landed: boolean;
    }
  >();
  private hop(id: string) {
    const r = () => (Math.random() < 0.5 ? -1 : 1) * (0.6 + 0.4 * Math.random());
    this.hops.set(id, { t0: this.time, roll: 0.28 * r(), pitch: 0.16 * r(), root: null, base: null, landed: false });
  }
  /** Each frame: each car hopping, its model (live: as its pose was just made; parked: as it was placed) lifted
   *  and tipped; done, put back as it was. */
  private hopsFrame() {
    for (const [id, h] of this.hops) {
      const l = this.live.get(`car:${id}`);
      const pk = this.parked.get(id);
      const root: Object3D | null = l?.model.root ?? pk?.full?.root ?? pk?.far?.root ?? null;
      const t = this.time - h.t0;
      // (its model made again — burnt out, merged —: the new one's place its base)
      if (root !== h.root) {
        h.root = root;
        h.base = root ? { p: root.position.clone(), q: root.quaternion.clone() } : null;
      }
      if (!root || !h.base) {
        if (t > HOP_S) this.hops.delete(id);
        continue;
      }
      // (a live car's posed afresh each frame: that's its base)
      if (l) h.base = { p: root.position.clone(), q: root.quaternion.clone() };
      if (t >= HOP_S) {
        root.position.copy(h.base.p);
        root.quaternion.copy(h.base.q);
        root.updateMatrix();
        root.updateMatrixWorld(true);
        this.hops.delete(id);
        continue;
      }
      // (up and down as a thrown thing — ~1 m at 0.45 s, down at HOP_UP —, a bounce, then still)
      let y = 0;
      let k = 0;
      let rock = 0;
      if (t < HOP_UP) {
        y = 4.43 * t - 4.905 * t * t;
        k = Math.sin((Math.PI * t) / HOP_UP);
      } else {
        const u = t - HOP_UP;
        if (u < 0.3) y = 0.12 * Math.sin((Math.PI * u) / 0.3);
        rock = 0.07 * Math.exp(-u * 4.5) * Math.sin(u * Math.PI * 2 * 3.2);
        if (!h.landed) {
          h.landed = true;
          // (the slam: its thud, the snow and dust up round it)
          const p = h.base.p;
          this.hitSound("hit-heavy", 0.8, p.x, p.y, p.z, 0.8);
          for (let i = 0; i < 10; i++) {
            const a = (i / 10) * Math.PI * 2;
            this.spray.puff(
              p.x + Math.cos(a) * 1.6,
              p.y + 0.1,
              p.z + Math.sin(a) * 1.6,
              Math.cos(a) * 2.2,
              0.6,
              Math.sin(a) * 2.2,
              1.4,
              1.3,
              0xd8d4cc,
              0.35,
            );
          }
        }
      }
      // (tipped about its own length and across it: the model faces −x)
      hq.setFromEuler(he.set(h.roll * k + rock, 0, h.pitch * k + rock * 0.6));
      root.position.copy(h.base.p);
      root.position.y += Math.max(0, y);
      root.quaternion.copy(h.base.q).multiply(hq);
      root.updateMatrix();
      root.updateMatrixWorld(true);
    }
  }
  /** (plan 94 P1) A recorded slot's takes once they're in (asked the first time: loading), else null. */
  private takes(slot: string): AudioBuffer[] | null {
    const ctx = mixer.ctx;
    if (!ctx) return null;
    const bs = this.hitBufs.get(slot);
    if (!bs) {
      this.hitBufs.set(slot, "loading");
      void slotBuffers(ctx, slot).then((b) => this.hitBufs.set(slot, b));
      return null;
    }
    return bs === "loading" || !bs.length ? null : bs;
  }
  /** One of `bs` where it happened, heard by distance. */
  private playTake(bs: AudioBuffer[], gain: number, x: number, y: number, z: number) {
    const ctx = mixer.ctx;
    if (!ctx || ctx.state !== "running") return;
    const src = ctx.createBufferSource();
    src.buffer = bs[Math.floor(Math.random() * bs.length)];
    src.playbackRate.value = 0.95 + Math.random() * 0.1;
    this.toEars(src, gain, x, y, z);
    src.start();
  }
  /** (plan 94 P1) A burning car's bed (the recording picked), looped where it burns as long as it does; false if
   *  it isn't in yet (the made crackle meanwhile). */
  private fireLoops = new Map<string, { src: AudioBufferSourceNode; g: GainNode; p: PannerNode; seen: boolean }>();
  private fireLoop(id: string, x: number, y: number, z: number): boolean {
    const ctx = mixer.ctx;
    if (!ctx || ctx.state !== "running") return false;
    const bs = this.takes("fire");
    if (!bs) return false;
    let f = this.fireLoops.get(id);
    if (!f) {
      const src = ctx.createBufferSource();
      src.buffer = bs[0];
      src.loop = true;
      const g = ctx.createGain();
      g.gain.value = 0;
      const p = ctx.createPanner();
      p.panningModel = "HRTF";
      src.connect(g).connect(p).connect(mixer.buses.effects);
      src.start(0, Math.random() * bs[0].duration);
      f = { src, g, p, seen: true };
      this.fireLoops.set(id, f);
    }
    f.seen = true;
    const heard = this.heardAt(x, y, z);
    const t = ctx.currentTime;
    f.g.gain.setTargetAtTime(0.9 * distanceGain(heard?.dist ?? 60), t, 0.15);
    const at = heard?.at ?? { x: 0, y: 0, z: -1 };
    f.p.positionX.setTargetAtTime(at.x, t, 0.05);
    f.p.positionY.setTargetAtTime(at.y, t, 0.05);
    f.p.positionZ.setTargetAtTime(at.z, t, 0.05);
    return true;
  }
  private boomBuf: AudioBuffer | null = null;
  private fireBufs: AudioBuffer[] = [];
  /** (plan 94 P1) The blast heard: a thump under a roar of noise falling away, its debris rattling after (made, not
   *  recorded — till one's picked). */
  private boom(x: number, y: number, z: number) {
    const ctx = mixer.ctx;
    if (!ctx || ctx.state !== "running") return;
    if (!this.boomBuf) {
      const len = 3;
      const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate);
      const d = b.getChannelData(0);
      let lp = 0;
      let lp2 = 0;
      for (let i = 0; i < d.length; i++) {
        const tt = i / ctx.sampleRate;
        const n = Math.random() * 2 - 1;
        // (the roar: noise ever darker as it falls away)
        const k = 0.02 + 0.25 * Math.exp(-tt * 3);
        lp += (n - lp) * k;
        lp2 += (lp - lp2) * k;
        const roar = lp2 * 3.2 * Math.exp(-tt * 1.6) * Math.min(1, tt / 0.004);
        const thump = Math.sin(2 * Math.PI * (38 + 30 * Math.exp(-tt * 8)) * tt) * Math.exp(-tt * 4) * 0.9;
        const rattle = tt > 0.5 && Math.random() < 0.0009 * Math.exp(-(tt - 0.5) * 1.5) ? Math.random() * 0.6 : 0;
        d[i] = Math.max(-1, Math.min(1, roar + thump + rattle));
      }
      this.boomBuf = b;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.boomBuf;
    this.toEars(src, 1.6, x, y, z);
    src.start();
  }
  /** (plan 94 P1) A burning car's crackle and its roar, a take at a time (made: noise, popped and darkened). */
  private fireSound(x: number, y: number, z: number) {
    const ctx = mixer.ctx;
    if (!ctx || ctx.state !== "running") return;
    if (!this.fireBufs.length)
      for (let v = 0; v < 4; v++) {
        const len = 0.9;
        const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate);
        const d = b.getChannelData(0);
        let lp = 0;
        for (let i = 0; i < d.length; i++) {
          const tt = i / ctx.sampleRate;
          const env = Math.sin((Math.PI * tt) / len);
          lp += (Math.random() * 2 - 1 - lp) * 0.06;
          const pop = Math.random() < 0.0016 ? (Math.random() * 2 - 1) * 0.9 : 0;
          d[i] = (lp * 1.6 * env + pop) * 0.6;
        }
        this.fireBufs.push(b);
      }
    const src = ctx.createBufferSource();
    src.buffer = this.fireBufs[Math.floor(Math.random() * this.fireBufs.length)];
    src.playbackRate.value = 0.85 + Math.random() * 0.3;
    this.toEars(src, 0.5, x, y, z);
    src.start();
  }
  /** (plan 94 G4) Where each of my front wheels' ruts began (deep snow or mud), and the stretches to send. */
  private rutStart: ({ x: number; z: number } | null)[] = [null, null];
  private rutSend: number[] = [];
  private rutSentAt = 0;
  private rutLane(i: number, x: number, z: number, g: Ground) {
    const st = this.rutStart[i];
    if (GRIP[g].trace !== "ruts") {
      this.rutStart[i] = null;
      return;
    }
    if (!st) {
      this.rutStart[i] = { x, z };
      return;
    }
    const d = Math.hypot(x - st.x, z - st.z);
    if (d < 1.5) return;
    if (d <= 3 && this.rutSend.length < 1200)
      this.rutSend.push(Math.round(st.x * 100), Math.round(st.z * 100), Math.round(x * 100), Math.round(z * 100));
    this.rutStart[i] = { x, z };
  }
  /** (plan 94 G4) The ruts others pressed before I came (cm, [ax, az, bx, bz] each): in my ruts — a wheel finds
   *  them —, their marks drawn. */
  private rutsIn(segs: number[]) {
    for (let i = 0; i + 3 < segs.length; i += 4) {
      const ax = segs[i] / 100;
      const az = segs[i + 1] / 100;
      const bx = segs[i + 2] / 100;
      const bz = segs[i + 3] / 100;
      if (![ax, az, bx, bz].every(Number.isFinite)) continue;
      this.ruts.lay(ax, az, bx, bz);
      this.tracks.stamp(ax, this.G.heightAt(ax, az), az, bx, this.G.heightAt(bx, bz), bz, "deep");
    }
  }
  /** (plan 94 P5) A flat tyre's rim on the road: sparks off it now and then at speed, on the hard ground. */
  private rimSparks(l: LiveView, dt: number) {
    const parts = l.parts ?? 0;
    if (!(parts & (PART.flatFL | PART.flatFR | PART.flatRL | PART.flatRR))) return;
    const sp = Math.hypot(l.pose.v.x, l.pose.v.z);
    if (sp < 3) return;
    const wheels = l.model.wheels;
    for (let i = 0; i < 4; i++) {
      if (!(parts & FLATS[i]) || !wheels[i] || Math.random() > dt * 9 * Math.min(1, sp / 12)) continue;
      // (its hub, in the cars' own coords — the sim's, as the ground's lookups take them)
      wheels[i].spin.getWorldPosition(v3);
      this.root.updateMatrixWorld();
      v3.applyMatrix4(this.inv.copy(this.root.matrixWorld).invert());
      const g = this.groundUnder(v3.x, v3.z);
      if (!(g === "asphalt" || g === "walk" || g === "floor" || g === "rock" || g === "wet")) continue;
      const y = this.G.heightAt(v3.x, v3.z) + 0.03;
      this.sparks.burst(v3.x, y, v3.z, l.pose.v.x, l.pose.v.z, 0, 0, 0.3 * Math.min(1, sp / 15));
    }
  }
  /** (plan 94 P2) A car's parts newly off (WRECK's gone bits), each a piece on the road as it was on the car — a
   *  door to lie flat on its face. `v`: the car's own way. */
  private partsOff(m: Sedan, gone: number, v: { x: number; y: number; z: number }) {
    if (!m.partCopy) return;
    m.root.updateMatrixWorld(true);
    this.root.updateMatrixWorld(true);
    this.inv.copy(this.root.matrixWorld).invert();
    const vel = new Vector3(v.x, v.y, v.z);
    // (the car's nose, the cars' group's: the model faces −x)
    const fwd = new Vector3(-1, 0, 0).applyQuaternion(m.root.quaternion);
    // (plan 94 P1: blown off — each out from the car's middle, and up)
    const blown = v === BLOWN;
    const mid = blown ? m.root.getWorldPosition(new Vector3()).applyMatrix4(this.inv) : null;
    const drop = (name: string, flat: boolean) => {
      const o = m.partCopy?.(name);
      if (!o) return;
      o.applyMatrix4(this.inv);
      const go = mid
        ? new Vector3(o.position.x - mid.x, 0, o.position.z - mid.z)
            .normalize()
            .multiplyScalar(2.2 + Math.random() * 2)
            .setY(3.5 + Math.random() * 2)
        : vel;
      this.debris.drop(
        o,
        go,
        flat ? new Quaternion().setFromAxisAngle(fwd, ((Math.random() < 0.5 ? 1 : -1) * Math.PI) / 2) : null,
        blown,
      );
    };
    for (const name of ["door_fl", "door_fr", "door_rl", "door_rr", "door_sr", "door_mr"]) {
      const slot = doorSlot(name);
      if (slot >= 0 && gone & DOOR_GONE[slot]) drop(name, true);
    }
    if (gone & WRECK.bonnetGone) drop("bonnet", false);
    if (gone & WRECK.bootGone) for (const n of ["boot", "boot_l", "boot_r"]) drop(n, n !== "boot");
    if (gone & WRECK.bumperRGone) drop("bumper_r", false);
    if (gone & WRECK.mirrorLOff) drop("mirror_l", false);
    if (gone & WRECK.mirrorROff) drop("mirror_r", false);
  }
  /** (plan 94 P3) Panes newly gone (or cracked) on a car's model: their glass out of their frames and down, the
   *  more the bigger the pane; cracked, a few bits where it starred. (vx, vz): the car's own way. `holes`: its
   *  rounds' (plan 95 F5a: a pane's shards from where the last went into it — the windscreen's falling in). */
  private glassOut(m: Sedan, newly: number, vx: number, vz: number, holes: readonly Hole[] = []) {
    m.root.updateMatrixWorld(true);
    // (a pane gone — its shards out of its frame and down, the more the bigger it is; cracked, a few
    // grains where it starred)
    const eye = m.eye;
    for (let i = 0; i < 6; i++) {
      const gone = !!(newly & PANE_GONE[i]);
      if (!gone && !(newly & PANE_CRACK[i])) continue;
      let struck: Hole | null = null;
      for (const h of holes) if (h.pane === i) struck = h;
      const at = m.paneAt?.(i);
      if (struck && m.skinAt) m.skinAt(struck.u, struck.w, struck.h, v3);
      else if (at) v3.copy(at);
      else v3.set(eye.x + (i === 0 ? 0.8 : i === 1 ? -1.2 : 0), eye.y, eye.z + (i < 2 ? 0 : i % 2 ? -0.7 : 0.7));
      v3.applyMatrix4(m.root.matrix);
      // (out of its side: the car's own right across — the windows' outward way; the windscreen shot in, into
      // the cabin: back along it)
      const out = i < 2 ? 0 : i % 2 ? 1 : -1;
      v4.set(i === 0 && struck ? 0.8 : 0, 0, -out).applyQuaternion(m.root.quaternion);
      this.shards.burst(v3.x, v3.y, v3.z, gone ? (i < 2 ? 46 : 28) : 3, vx, vz, v4.x, v4.z);
    }
  }
  private inv = new Matrix4();

  /** (plan 93 S1) Rounds into cars, as the server took them: sparks off metal, glass flying, a tyre's
   *  bang and its air going — heard where it struck. */
  private shotFx(hits: ShotHit[]) {
    for (const h of hits) {
      // (the server's frame — z up — to the cars' group's: y up)
      const x = h.x;
      const y = h.z;
      const z = h.y;
      // the face it came in by, out of the car: its heading's axes
      const l = this.live.get(h.id);
      const pk = l ? null : this.parked.get(h.id);
      const a = l ? headingFromQ(l.pose.q) : (pk?.pose.a ?? 0);
      const fx = Math.cos(a);
      const fz = Math.sin(a);
      const n: [number, number] =
        h.face === 0
          ? [fx, fz]
          : h.face === 1
            ? [-fx, -fz]
            : h.face === 2
              ? [fz, -fx]
              : h.face === 3
                ? [-fz, fx]
                : [0, 0];
      if (h.struck === "glass" || h.struck === "lamp") {
        for (let k = 0; k < 3; k++) this.spray.throw(x, y, z, n[0] * 0.6, n[1] * 0.6, 0.7, false);
        // (plan 94 P3: a few bits of it where the round went in)
        this.shards.burst(x, y, z, 5, 0, 0, n[0] * 0.5, n[1] * 0.5);
        this.hitSound("hit-glass", h.struck === "lamp" ? 0.25 : 0.4, x, y, z, 1.15);
      }
      if (h.struck !== "glass") this.sparks.burst(x, y, z, 0, 0, n[0], n[1], h.struck === "tyre" ? 0.25 : 0.55);
      if (h.struck === "panel" || h.struck === "engine")
        this.hitSound("hit-post", 0.22, x, y, z, 1.35 + Math.random() * 0.2);
      if (h.struck === "tyre") {
        this.tyreBang(x, y, z);
        // (plan 96 F5a: the blowout — dust off the road under it, bits of rubber, out of its side)
        const g = this.G.heightAt(x, z);
        for (let k = 0; k < 6; k++) {
          const a = Math.random() * Math.PI * 2;
          this.spray.puff(
            x + n[0] * 0.2,
            g + 0.1,
            z + n[1] * 0.2,
            n[0] * 1.6 + Math.cos(a) * 0.9,
            0.4 + Math.random() * 0.5,
            n[1] * 1.6 + Math.sin(a) * 0.9,
            0.7,
            1.1,
            0xcfc9bf,
            0.4,
          );
        }
        for (let k = 0; k < 4; k++)
          this.spray.puff(
            x,
            y,
            z,
            n[0] * 2.4 + (Math.random() - 0.5),
            1.2 + Math.random(),
            n[1] * 2.4 + (Math.random() - 0.5),
            0.18,
            0.7,
            0x242220,
            0.85,
          );
      }
    }
  }
  private hitBufs = new Map<string, AudioBuffer[] | "loading">();
  /** A take of a car slot where it happened (3D, by distance), a little brighter: a round, not a crash. */
  private hitSound(slot: string, gain: number, x: number, y: number, z: number, rate: number) {
    const ctx = mixer.ctx;
    if (!ctx || ctx.state !== "running") return;
    const bs = this.hitBufs.get(slot);
    if (!bs) {
      this.hitBufs.set(slot, "loading");
      void slotBuffers(ctx, slot).then((b) => this.hitBufs.set(slot, b));
      return;
    }
    if (bs === "loading" || !bs.length) return;
    const src = ctx.createBufferSource();
    src.buffer = bs[Math.floor(Math.random() * bs.length)];
    src.playbackRate.value = rate;
    this.toEars(src, gain, x, y, z);
    src.start();
  }
  /** (a tyre struck: a bang, then its air out — a hiss falling away) */
  private tyreBang(x: number, y: number, z: number) {
    const ctx = mixer.ctx;
    if (!ctx || ctx.state !== "running") return;
    const len = 1.6;
    const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      const t = i / ctx.sampleRate;
      const bang = t < 0.06 ? (1 - t / 0.06) ** 2 : 0;
      const hiss = t > 0.02 ? 0.28 * Math.exp(-(t - 0.02) / 0.5) : 0;
      d[i] = (Math.random() * 2 - 1) * (bang + hiss);
    }
    const src = ctx.createBufferSource();
    src.buffer = b;
    const bp = ctx.createBiquadFilter();
    bp.type = "highpass";
    bp.frequency.value = 900;
    src.connect(bp);
    this.toEars(bp, 0.5, x, y, z, src);
    src.start();
  }
  private toEars(node: AudioNode, gain: number, x: number, y: number, z: number, src?: AudioScheduledSourceNode) {
    const ctx = mixer.ctx as AudioContext;
    const heard = this.heardAt(x, y, z);
    const d = heard?.dist ?? 20;
    const g = ctx.createGain();
    g.gain.value = gain * distanceGain(d);
    const p = ctx.createPanner();
    p.panningModel = d < 30 ? "HRTF" : "equalpower";
    const at = heard?.at ?? { x: 0, y: 0, z: -1 };
    p.positionX.value = at.x;
    p.positionY.value = at.y;
    p.positionZ.value = at.z;
    node.connect(g).connect(p).connect(mixer.buses.effects);
    (src ?? (node as AudioScheduledSourceNode)).onended = () => {
      node.disconnect();
      g.disconnect();
      p.disconnect();
    };
  }

  /** Metal along something as it goes (docs/plan/92 phase 9): a side against a wall, a post, a trunk —
   *  short rays out of its four corners —, or its roof on the road: sparks, a few times a second. */
  private scraping(s: CarState) {
    const ph = this.physics();
    if (!ph || this.time - this.scrapeT < 0.06) return;
    const sp = Math.hypot(s.v.x, s.v.z);
    if (sp < 3.5) return;
    this.scrapeT = this.time;
    const a = headingOf(s.q);
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const b = boxOf(s.spec);
    const k = Math.min(1, sp / 16) * 0.7;
    for (const side of [-1, 1])
      for (const along of [0.75, -0.75]) {
        const lx = b.off + along * b.hx;
        const lz = side * (b.hz + 0.03);
        const x = s.p.x + ca * lx - sa * lz;
        const z = s.p.z + sa * lx + ca * lz;
        const d = ph.carWorld.rayHit(x, s.p.y, z, -sa * side, 0, ca * side, 0.16, "sight");
        if (d !== null)
          this.scrape(x - sa * side * d, s.p.y - 0.15, z + ca * side * d, s.v.x, s.v.z, sa * side, -ca * side, k);
      }
    // (on its roof or its side, sliding: the road under it)
    const up = 1 - 2 * (s.q.x * s.q.x + s.q.z * s.q.z);
    if (up < 0.3) this.scrape(s.p.x, this.G.heightAt(s.p.x, s.p.z) + 0.1, s.p.z, s.v.x, s.v.z, 0, 0, k);
  }
  private scrapeT = 0;
  /** (its sound: metal along something, kept up by each spark's scrape, falling off between) */
  private scrapeK = 0;

  /** Sparks where metal met something hard at speed (`k` 0..1). */
  private scrape(x: number, y: number, z: number, vx: number, vz: number, nx: number, nz: number, k: number) {
    if (k < 0.1) return;
    this.scrapeK = Math.max(this.scrapeK, Math.min(1, k * 1.3));
    this.sparks.burst(x, y, z, vx, vz, nx, nz, k);
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
    // (plan 93 S1: what the server's put on it — shot: glass, holes' dents, a flat, the engine — taken in;
    // only ever more)
    if (vw?.dmg) {
      const sv = dmgOf(vw.dmg);
      for (let i = 0; i < 5; i++) m.dmg.zones[i] = Math.max(m.dmg.zones[i] ?? 0, sv.zones[i] ?? 0);
      if (sv.parts & ~m.dmg.parts || sv.wreck & ~m.dmg.wreck || sv.fire > m.dmg.fire) {
        m.dmg.parts |= sv.parts;
        m.dmg.wreck |= sv.wreck;
        // (plan 94 P1: the fire's the server's)
        m.dmg.fire = Math.max(m.dmg.fire, sv.fire);
        l.fire = m.dmg.fire;
        this.partsChanged(l, m.dmg);
      }
    }
    const fl = FLATS.reduce((a, b, i) => (m.dmg.parts & b ? a | (1 << i) : a), 0);
    if (m.drive) {
      // (plan 94 P5: a tyre just shot out — the kick, then flat)
      if (fl & ~m.drive.flats) m.drive.burst(fl & ~m.drive.flats);
      m.drive.flats = fl;
      m.drive.chains = vw?.chains ?? 0;
    }
    if (m.rig) m.rig.flats = fl;
    // (washed at the pump: the server's count)
    if (vw?.filling) m.grime = Math.min(m.grime, vw.grime ?? 0);
    l.model.setWear(m.grime, m.dmg.zones, m.dmg.parts, m.dmg.wreck, m.dmg.fire);
    this.rimSparks(l, dt);
    const key = `${Math.round(m.grime * 100)}|${damageString(m.dmg)}`;
    if (key !== m.wearSent && now - m.wearAt > 1000 && !vw?.filling) {
      m.wearSent = key;
      m.wearAt = now;
      room.send("car:wear", { grime: m.grime, dmg: m.dmg.zones, parts: m.dmg.parts, wreck: m.dmg.wreck });
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
            at = { x: v.x, y: v.z };
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
    // (its Jolt car put there too, the land under it made first)
    const d = this.mine?.drive;
    if (d) {
      this.physics()?.drivingAt(s.p.x, s.p.z, 0, 0);
      d.car.place(s.p.x, s.p.y, s.p.z, [s.q.x, s.q.y, s.q.z, s.q.w], [s.v.x, s.v.y, s.v.z], [0, s.w.y, 0]);
      d.prime();
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
    if (tp && tp.eyes.carBeams !== this.beamLights) tp.eyes.carBeams = this.beamLights;
    const shadow = gfxNow().lightShadows;
    if (shadow !== this.beamShadow) {
      // (only when the tier changes: that recompiles anyway)
      this.beamShadow = shadow;
      this.beamLights[0].castShadow = shadow;
      this.beamLights[0].shadow.needsUpdate = true;
    }
    const night = Math.max(this.host.night(), this.host.lampFog()) > 0.25;
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
    const want = lit === "off" ? 0 : q === "high" || q === "medium" ? 2 : 1;
    // (a lamp broken is out, a bad front dims both: mine — docs/plan/92 phase 9)
    const dm = l && this.mine?.vid === l.id ? this.mine.dmg : null;
    const kA = dm ? headK(dm, "l") : 1;
    const kB = dm ? headK(dm, "r") : 1;
    this.beamLights.forEach((s, i) => {
      s.shadow.autoUpdate = i < want;
      if (i >= want) {
        s.intensity = 0;
        s.position.set(0, -500, 0);
        s.target.position.set(0, -501, 0);
        return;
      }
      // (one light only: from between the two lamps — or the one still lit)
      const at =
        want === 1
          ? kA + kB > 0
            ? A.clone()
                .multiplyScalar(kA / (kA + kB))
                .add(B.clone().multiplyScalar(kB / (kA + kB)))
            : A.clone().add(B).multiplyScalar(0.5)
          : i === 0
            ? A
            : B;
      const k = want === 1 ? (kA + kB) / 2 : i === 0 ? kA : kB;
      s.intensity = (lit === "high" ? 220 : 120) * k;
      s.angle = lit === "high" ? 0.36 : 0.5;
      s.position.copy(at);
      s.target.position.copy(at).addScaledVector(F, 30);
      s.target.position.y -= lit === "high" ? 0.4 : 1.3;
    });
    // (from inside my own car — the cockpit, over the bonnet —: its beams seen end on, layer on layer: a
    // white wall in the snow; thinned there — docs/plan/92 polish)
    this.airBeams(tp, want, !!l && this.cam.mode !== "chase");
  }
  /** Each lit headlamp's beam in the air (the flashlight's, view.ts airBeam): there in the morning
   *  fog and the snow, hardly on a clear night (docs/plan/64-the-fog.md F4). */
  private air: ReturnType<ThirdPersonView["airBeam"]>[] = [];
  private airBeams(tp: ThirdPersonView | null, want: number, inside = false) {
    if (!tp) return;
    if (!this.air.length)
      for (let i = 0; i < 2; i++) {
        const b = tp.airBeam(0xfff2da);
        this.root.add(b.mesh);
        this.air.push(b);
      }
    const thick = Math.max(tp.fogAir, this.host.storm());
    this.air.forEach((b, i) => {
      const s = this.beamLights[i];
      const op =
        i < want && s.intensity > 0 ? (0.015 + 0.5 * thick) * (s.intensity > 150 ? 1.2 : 1) * (inside ? 0.3 : 1) : 0;
      b.mat.uniforms.opacity.value = op;
      b.mesh.visible = op > 0.01;
      if (!b.mesh.visible) return;
      b.mat.uniforms.time.value = this.time;
      b.mat.uniforms.storm.value = this.host.storm();
      // (as long as the light reaches into the murk; as wide as it throws)
      const len = 20;
      const along = len / b.len;
      const across = (Math.tan(s.angle * 0.75) * len) / (Math.tan(b.half) * b.len);
      b.mesh.position.copy(s.position);
      b.mesh.lookAt(s.target.position);
      b.mesh.scale.set(across, across, along);
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
      const fl = l.pb.buf[l.pb.buf.length - 1]?.fl ?? 0;
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
    for (const v of tp.vehicles.vehicleLamps()) {
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
      const spec = p.spec;
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
      if (this.mine?.vid === id || this.coast?.vid === id) continue;
      const s1 = l.pb.buf[l.pb.buf.length - 1];
      if (!s1) continue;
      const ahead = Math.max(0, Math.min(0.3, (this.nowMs - s1.t) / 1000));
      const a = headingFromQ(s1.q);
      const spec = l.spec;
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
    // people out on the ground floor (never hurt: soft, the car stops) — not a flier over its
    // roof: it passes under them (the server's knock asks the same: world-server features/cars.ts)
    if (room)
      room.state.players.forEach((p: { x: number; y: number; z: number; level: number }, sid: string) => {
        if (p.level !== 0 || this.seated.has(sid)) return;
        const px = p.x;
        const pz = p.y;
        if (!near(px, pz, 0.4) || p.z - this.G.heightAt(px, pz) > CAR_ROOF) return;
        out.push({ kind: "circle", x: px, z: pz, r: 0.38, soft: true, what: "person", id: sid });
      });
    // pets out on the ground floor, not in a car (soft too; at speed, hit: docs/plan/51-the-pet.md)
    if (room)
      room.state.pets.forEach(
        (p: { x: number; y: number; floor: number; ride: string; alive: boolean }, id: string) => {
          if (p.floor !== 0 || p.ride || !p.alive) return;
          const px = p.x;
          const pz = p.y;
          if (near(px, pz, 0.35)) out.push({ kind: "circle", x: px, z: pz, r: 0.3, soft: true, what: "pet", id });
        },
      );
  }
  private groundUnder(x: number, z: number): Ground {
    return this.world.ground(x, z);
  }

  // ── the car's HUD (plan 94 P10: the walnut plate, the car at a glance, the keys' slip — car/hud.ts) ──
  private showHud() {
    const tp = this.host.tp();
    if (!tp || this.hud) return;
    this.hud = new CarHud(tp.hostEl ?? document.body, {
      kmh: t("carH_hudKmh"),
      fuel: t("carH_hudFuel"),
      engine: t("carH_hudEngine"),
      auto: t("carH_hudAuto"),
      manual: t("carH_hudManual"),
    });
    this.keysAt = this.time;
    // a phone: the wheel and the pedals on the screen
    if (window.matchMedia?.("(pointer: coarse)").matches && this.mine) {
      this.pads = touchControls(this.input, this.mine.seat === 0);
      (tp.hostEl ?? document.body).appendChild(this.pads);
    }
  }
  private hideHud() {
    this.hud?.dispose();
    this.hud = null;
    this.pads?.remove();
    this.pads = null;
    this.input.touch.on = false;
  }
  private pads: HTMLDivElement | null = null;
  /** The keys' slip for my seat in this car: rows of [keys, what]. */
  private keyRows(): [string[], string][] {
    const m = this.mine;
    if (!m) return [];
    if (m.seat !== 0)
      return [
        [["R"], t("carH_kRadio")],
        [["N"], t("carH_kWindow")],
        [["C"], t("carH_kCamera")],
        [["X"], t("carH_kOut")],
      ];
    if (m.sim?.spec.pushed)
      return [
        [["W"], t("carH_kPush")],
        [["S"], t("carH_kBack")],
        [["A", "D"], t("carH_kLean")],
        [["␣"], t("carH_kDrag")],
        [["C"], t("carH_kCamera")],
        [["X"], t("carH_kOff")],
      ];
    const rows: [string[], string][] = [
      [["W"], `${t("carH_kGo")} · S ${t("carH_kBrake")}`],
      [["A", "D"], `${t("carH_kSteer")} · ␣ ${t("carH_kHand")}`],
      [["L"], `${t("carH_kLights")} · H ${t("carH_kHorn")}`],
      [["V"], `${t("carH_kWipers")} · N ${t("carH_kWindow")}`],
      [["R"], `${t("carH_kRadio")} · C ${t("carH_kCamera")}`],
    ];
    if (prefs().carManual) rows.push([["E", "Q"], t("carH_kGears")]);
    const pr = this.propsOf(m.vid.replace(/^car:/, ""));
    if (pr?.ownerId && mayDrive(pr, this.host.uid(), Date.now())) rows.push([["O"], t("carH_kLock")]);
    if (m.sim?.spec.low) rows.push([["K"], `${t("carH_kDiff")} · J ${t("carH_kRange")}`]);
    const l = this.live.get(m.vid);
    if (l?.role === "police") rows.push([["G"], t("carH_kSiren")]);
    rows.push([["X"], t("carH_kOut")]);
    return rows;
  }
  private drawHud() {
    const h = this.hud;
    const m = this.mine;
    if (!h || !m) return;
    const room = this.host.room();
    const l = this.live.get(m.vid);
    const v = room?.state.vehicles.get(m.vid) as VehWire | undefined;
    // (down in the car — the dark's "Down" and its first aid in the same spot —: all of it out of the way)
    const meP = room?.state.players.get(room.sessionId) as { downAt?: number } | undefined;
    const down = !!meP?.downAt;
    // what to do now: at a pump (F), filling, stuck, low; my pets on their way to a door (docs/plan/51)
    let say = "";
    const coming: string[] = [];
    room?.state.pets.forEach((pet) => {
      if (pet.sid === room.sessionId && pet.act === "board") coming.push(pet.name);
    });
    if (m.sim) {
      const stopped = l ? Math.hypot(l.pose.v.x, l.pose.v.z) < 0.4 : false;
      const full = m.sim.fuel / m.sim.spec.fuel.litres;
      if (m.sim.spec.pushed) say = this.stuckFor > 3 ? t("carStuck") : "";
      else if (v?.filling) say = `${t("carFilling")} ${Math.round((v.fuel ?? 0) * 100)}%`;
      else if (stopped && l && this.atPumpNow(l) && (full < 0.98 || m.grime > 0.05)) say = t("carFill");
      else if (this.stuckFor > 3) say = t("carStuck");
      else if (full < 0.12) say = `${t("carLow")} ${Math.round(full * 100)}%`;
    }
    if (coming.length) say = t("carPetWait").replace("{name}", coming.join(", "));
    // the plate: mine as my sim has it; a passenger's from the car's wire
    const sim = m.sim;
    const spec = sim?.spec ?? l?.spec;
    const pushed = !!spec?.pushed;
    let kmh = 0;
    let gear = "";
    let rpm = 0;
    if (sim) {
      const r = readout(sim);
      kmh = r.kmh;
      gear = r.gear === -1 ? "R" : r.gear === 0 ? "N" : String(r.gear);
      rpm = sim.rpm;
    } else if (l) {
      kmh = Math.hypot(l.pose.v.x, l.pose.v.z) * 3.6;
      gear = (v?.gear ?? 0) === -1 ? "R" : (v?.gear ?? 0) === 0 ? "N" : String(v?.gear);
      rpm = v?.rpm ?? 0;
    }
    const top = spec ? spec.engine.limit : 7000;
    const dm = m.dmg;
    const dead = !!(dm.parts & PART.engineDead);
    let engine: { say: string; k: number; bad: boolean } | null = null;
    if (sim && !pushed) {
      const temp = sim.temp;
      const steam = steamOf(dm) > 0;
      const off = sim.rpm < 50;
      engine =
        dm.fire >= 2
          ? { say: t("carH_engBurning"), k: 1, bad: true }
          : dead
            ? { say: t("carH_engDead"), k: 0, bad: true }
            : steam
              ? { say: t("carH_engSteam"), k: Math.max(temp, 0.9), bad: true }
              : off
                ? { say: t("carH_engOff"), k: temp, bad: false }
                : temp < 0.3
                  ? { say: t("carH_engCold"), k: temp, bad: false }
                  : temp > 0.85
                    ? { say: t("carH_engHot"), k: temp, bad: true }
                    : { say: t("carH_engWarm"), k: temp, bad: false };
    }
    const fuel = pushed
      ? null
      : sim
        ? v?.filling
          ? (v.fuel ?? 0)
          : sim.fuel / sim.spec.fuel.litres
        : (v?.fuel ?? null);
    // the chips: the radio, the window, chains, locked, flats, the engine, the fire
    const chips: { say: string; warn?: boolean }[] = [];
    const st = m.seat === 0 ? this.station : this.shownStation;
    if (st > 0) chips.push({ say: `📻 FM ${[98.7, 88.4, 101.3][st - 1]}` });
    if (l && l.win & (1 << m.seat)) chips.push({ say: `🪟 ${t("carH_chipWindow")}` });
    const chains = Number(v?.chains ?? 0);
    if (chains) chips.push({ say: `⛓ ${t("carH_chipChains")}` });
    if (this.propsOf(m.vid.replace(/^car:/, ""))?.locked) chips.push({ say: `🔒 ${t("carH_chipLocked")}` });
    const wheels = ["carH_wFL", "carH_wFR", "carH_wRL", "carH_wRR"];
    FLATS.forEach((b, i) => {
      if (dm.parts & b) chips.push({ say: `${t("carH_chipFlat")} · ${t(wheels[i])}`, warn: true });
    });
    if (dm.fire >= 2) chips.push({ say: `🔥 ${t("carH_chipFire")}`, warn: true });
    else if (dm.fire === 1) chips.push({ say: t("carH_chipSmoke"), warn: true });
    else if (dead) chips.push({ say: t("carH_chipEngineDead"), warn: true });
    h.update({
      hidden: down,
      plate: this.cam.mode !== "cockpit",
      kmh,
      gear: pushed ? "" : gear,
      manual: !!prefs().carManual && m.seat === 0,
      rev: rpm / top,
      red: spec ? spec.engine.redline / top : 0.85,
      fuel: fuel === null ? null : Math.max(0, Math.min(1, fuel)),
      engine,
      chips,
      dmg: dm,
      note: say,
      keys: {
        rows: this.keyRows(),
        foot: t("carH_hudKeysAgain"),
        shown: !this.pads && this.time - this.keysAt < 10,
      },
      damageWord: t("carH_hudDamage"),
      touch: !!this.pads,
    });
  }

  /** Is this car (its middle, not its CoG) beside a pump? */
  private atPumpNow(l: LiveView): boolean {
    const b = boxOf(l.spec);
    const a = headingFromQ(l.pose.q);
    return this.G.atPump(l.pose.p.x + Math.cos(a) * b.off, l.pose.p.z + Math.sin(a) * b.off);
  }

  /** The car (and its seat) X would get me into: the nearest within reach, by the door I'm at. */
  private nearest(): {
    id: string;
    seat: number;
    owner: string;
    d: number;
    x: number;
    z: number;
    a: number;
    kind: CarKind;
    via?: number;
  } | null {
    const me = this.host.me();
    const bx = me.x;
    const bz = me.y;
    let best: {
      id: string;
      seat: number;
      d: number;
      owner: string;
      x: number;
      z: number;
      a: number;
      kind: CarKind;
      via?: number;
    } | null = null;
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
      // (only the seats it has: the snowmobile's one; the van's back rows after the four)
      const seats = SEATS_OF[kind].at.length;
      for (let i = 4; i < seats; i++) order.push(i);
      const seat = order.find((s) => s < seats && !taken[s] && (s > 0 || !own || own.wheel));
      if (seat === undefined) return;
      // (plan 93 F3a: the wheel of an empty car taken from its passenger's side: in by that door)
      const via = seat === 0 && !taken.some(Boolean) && w > 0 && seats > 1 ? 1 : undefined;
      best = { id, seat, d, owner: own ? own.owner : "", x, z, a, kind, via };
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
    const b = best as typeof best;
    return b;
  }

  dispose() {
    this.karts?.dispose();
    this.baySnow.dispose();
    this.unlistenMouse();
    for (const off of this.offMsg) off();
    for (const p of this.parked.values()) this.dropParked(p);
    const ph = this.physics();
    for (const l of this.live.values()) {
      l.model.dispose();
      l.sound?.dispose();
      if (l.pulled) ph?.carWorld.removePulled(l.pulled);
    }
    for (const pc of this.aiPulled.values()) ph?.carWorld.removePulled(pc);
    this.aiPulled.clear();
    if (this.mine?.drive) ph?.carWorld.removeCar(this.mine.drive.car);
    this.mine?.sound?.dispose();
    this.tracks.dispose();
    this.spray.dispose();
    this.slabs.dispose();
    this.ropes.dispose();
    this.smoke.dispose();
    this.sparks.dispose();
    this.debris.dispose();
    this.shards.dispose();
    this.fires.dispose();
    for (const j of this.tyreJobs.values()) j.jack?.traverse((o) => (o as Mesh).geometry?.dispose());
    for (const mt of this.jackMats) mt.dispose();
    for (const f of this.fireLoops.values()) {
      f.src.stop();
      f.src.disconnect();
      f.g.disconnect();
      f.p.disconnect();
    }
    this.fireLoops.clear();
    this.patches.dispose();
    this.cabin.dispose();
    this.mirror?.m.dispose();
    this.screen?.s.dispose();
    for (const b of this.air) b.mat.dispose(); // (their cone's the flashlight's: not ours to drop)
    this.radio.stop();
    this.root.removeFromParent();
    this.envTarget?.dispose();
    for (const h of this.handoff.values()) h.model.dispose();
    this.handoff.clear();
    this.probeCube?.rt.dispose();
    this.probeCube = null;
    this.envTarget = null;
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
  grip?: number;
  holes?: string;
  win?: number;
  chains?: number;
  towing?: string;
  towedBy?: string;
  seats: string;
  colour: number;
  seq: number;
  st?: number; // its driver's sim clock (ms; 0 or none: a driver's client from before it)
  jump?: number; // the times the server's put it somewhere (a new driver, pulled out)
  fuel?: number;
  grime?: number;
  dmg?: string;
  filling?: boolean;
  wc?: number;
  obj?: string;
  role?: string;
  plate?: string;
  /** (plan 98) its driver came in by this seat's door (−1: their own) */
  via?: number;
  wy?: number;
  thr?: number;
}

function headingFromQ(q: { x: number; y: number; z: number; w: number }): number {
  return headingOf(q);
}
/** A model's root at a car's middle (Grounds coords), on the ground, its nose along `a`. */
/** (plan 96 F2a) a blast's hop: in the air (s), all of it to still (s) */
const HOP_UP = 0.9;
const HOP_S = 2.2;
const hq = new Quaternion();
const he = new Euler();
function placeModel(root: TGroup | Mesh, x: number, y: number, z: number, a: number) {
  root.position.set(x, y, z);
  root.rotation.set(0, Math.PI - a, 0);
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
    col(7, "🪟", "window");
    col(8, "✨", "flash");
    col(9, "🎺", "toot");
  } else {
    col(0, "🚪", "exit");
    col(1, "📻", "radio");
    col(2, "🎥", "camera");
    col(3, "🪟", "window");
  }
  return root;
}

/** (plan 95 F4a) An object drawn: it and all it hangs from shown. */
function shownAll(o: Object3D): boolean {
  for (let x: Object3D | null = o; x; x = x.parent) if (!x.visible) return false;
  return true;
}

/** (plan 96 F4a) The door mirror a mesh is part of ("mirror_l", "mirror_r"), if one. */
function mirrorOf(o: Object3D): string | null {
  for (let x: Object3D | null = o; x; x = x.parent) {
    const k = /^(mirror_[lr])(?:-|$)/.exec(x.name);
    if (k) return k[1];
  }
  return null;
}
