// The bots' shared shapes (docs/plan/117-bot-brains.md): a side's orders to its bots, a bot's whole state.

import type { GunId } from "../../dark/arms.ts";
import type { Aim } from "./aim.ts";
import type { Goal, Lineup, Route, Spot } from "./know.ts";
import type { BotLevel } from "./level.ts";
import type { Contact } from "./senses.ts";
import type { Feet } from "./walk.ts";

export type Role =
  | "entry"
  | "second"
  | "support"
  | "lurk"
  | "sniper"
  | "anchor"
  | "rotator"
  | "carrier"
  | "escort"
  | "free";
export type OrderKind =
  | "move" // along a route (or to a node) and on into the objective
  | "stage" // to a stage point, waiting there till released, then on
  | "hold" // at a spot, watching what it watches
  | "post" // the Raiders after the plant: a spot round the charge
  | "retake" // the Wardens after the plant: gather, then in to the charge
  | "follow" // after someone (your "Follow me")
  | "save" // the round's lost: away, alive
  | "hunt" // the respawn modes: where the enemy is
  | "carry" // a hostage out
  | "escort" // round whoever carries one
  | "pickup"; // the charge where it fell

export interface Order {
  kind: OrderKind;
  role: Role;
  route?: Route;
  /** a node to go to (when there's no route) */
  to?: number;
  spot?: Spot;
  watch?: [number, number, number];
  /** a stage: wait at this node till `go` */
  stage?: number;
  go?: boolean;
  quiet?: boolean;
  who?: string;
  /** utility to throw on the way, each from its lineup's node */
  throws?: Lineup[];
  /** what the overlay shows */
  why: string;
  /** the objective it's part of */
  goal?: Goal;
}

export interface BotState {
  id: string;
  level: BotLevel;
  feet: Feet;
  aim: Aim;
  /** where it's seen or heard each enemy */
  mem: Map<string, Contact>;
  order: Order | null;
  /** what it's doing now, and the top of its scores (the overlay's) */
  act: string;
  why: string[];
  /** the gun's rounds, reloading till (s) */
  gun: GunId | null;
  loaded: number;
  reloadTo: number;
  /** holding use (plant, defuse); crouched; walking quietly */
  using: boolean;
  crouch: boolean;
  quiet: boolean;
  /** in a fight with (id) */
  fighting: string;
  fightD: number;
  /** a strafe's way (±1) and till when; stepping back to cover till; re-peeking from */
  strafe: number;
  strafeTo: number;
  coverTo: number;
  coverNode: number;
  /** where it's looking when not on someone (a point), and since when it's been on that point */
  look: [number, number, number] | null;
  lookSince: number;
  /** the dangers it's checked (index → s) */
  checked: Map<number, number>;
  /** a throw under way: the lineup, turned since */
  throwing: Lineup | null;
  throwSince: number;
  /** its hp at the last step (a hit's news), last hurt at */
  hp: number;
  hurtAt: number;
  /** blinded till (s) */
  blindTo: number;
  /** the next decision at (s) */
  decideAt: number;
  /** footsteps: the next at (s) */
  stepAt: number;
  /** what it said last round-wise ("hit" said) */
  saidHit: boolean;
  /** aiming at the head this fight */
  aimHead: boolean;
  reloading: boolean;
  /** standing (a spot, a stage) and crouched there */
  holdStill: boolean;
  holdCrouch: boolean;
  /** the danger it's looking at (an index of the side's dangers; −1 a point of its own) */
  lookIdx: number;
  saidPlant: boolean;
  saidDefuse: boolean;
  /** a trade: of the fall at (s), going till (s) */
  tradeOf: number;
  tradeTo: number;
  /** the order its route was set for, and whether that was after the go */
  routeOf: Order | null;
  routeGo: boolean;
  /** its own spot on the objective once in */
  postSpot: import("./know.ts").Spot | null;
  postOf: Order | null;
  repathAt: number;
  /** the hunt's: on to the next place at (s), after whom */
  huntTo: number;
  huntOf: string;
  /** when it last said what it heard (s) */
  heardSaid: number;
  /** fallen back (outnumbered) till (s) */
  fallTo: number;
}

export function newBotState(id: string, level: BotLevel, feet: Feet, aim: Aim): BotState {
  return {
    id,
    level,
    feet,
    aim,
    mem: new Map(),
    order: null,
    act: "",
    why: [],
    gun: null,
    loaded: 0,
    reloadTo: 0,
    using: false,
    crouch: false,
    quiet: false,
    fighting: "",
    fightD: 0,
    strafe: 1,
    strafeTo: 0,
    coverTo: 0,
    coverNode: -1,
    look: null,
    lookSince: 0,
    checked: new Map(),
    throwing: null,
    throwSince: 0,
    hp: 100,
    hurtAt: -9,
    blindTo: 0,
    decideAt: 0,
    stepAt: 0,
    saidHit: false,
    aimHead: false,
    reloading: false,
    holdStill: false,
    holdCrouch: false,
    lookIdx: -1,
    saidPlant: false,
    saidDefuse: false,
    tradeOf: -1,
    tradeTo: -1,
    routeOf: null,
    routeGo: false,
    postSpot: null,
    postOf: null,
    repathAt: 0,
    huntTo: 0,
    huntOf: "",
    heardSaid: -99,
    fallTo: 0,
  };
}
