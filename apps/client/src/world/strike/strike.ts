// The Strike Park on the client (docs/plan/114-the-strike-park.md): the map standing drawn and solid (it
// follows the room's `strike.map`), the compound, the bots (Vortex in each team's kit: F9), the lobby's desk and
// the Map Board (the E prompts), the HUD while in the match (health, armor, money, the clock, the score, the kill
// feed, the radar, the charge), the buy grid (B: CS2's grid by role, F10), the scoreboard (Tab), use held
// (E: plant, defuse, a hostage), G drops the charge; dead, I watch a living teammate. Loaded near the park
// (car/cars.ts strikeFrame), a chunk of its own. The look is the park's own (plan 118: one look for every surface).

import type { ServerMessages } from "@yutopia/shared";
import { ARMS, pellets } from "@yutopia/shared/dark";
import { arenaChanged, groundAt } from "@yutopia/shared/grounds";
import {
  BRIEF_SECS,
  type BriefStop,
  briefStops,
  climateOf,
  gridOf,
  inRect,
  inStrikeArena,
  inStrikeCompound,
  isGun,
  KNIFE,
  lossBonus,
  MATS,
  type MatchEvent,
  MODES,
  MONEY,
  type ModeId,
  nodeNear,
  nodePos,
  ROUND,
  rayFirst,
  STRIKE_BOARD,
  STRIKE_DESK,
  STRIKE_HUB,
  STRIKE_KIT,
  STRIKE_PARK,
  STRIKE_SPOTS,
  STRIKE_TARGETS,
  STRIKE_YARD,
  type StrikeSpot,
  setStrikeMap,
  shotThrough,
  speedWith,
  strikeDist,
  strikeMap,
  TEAMS,
  toLocal,
} from "@yutopia/shared/strike";
import type { MeshStandardMaterial, Object3D } from "three";
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
} from "three";
import { mixer } from "../audio";
import type { CarsHost } from "../car/cars";
import { hud, type StrikeMemberView, type StrikeView } from "../store";
import { itemModel } from "../tp/items3d";
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
import { canvasFont, GLYPH, glyph, HEAD, KEY, LABEL, LOOK, NUM, PANEL, teamCol, teamInk } from "./look";
import { radar } from "./radar";
import { Highlights, type Replay, type Who } from "./replay";
import { CALLS, RADIO, StrikeSound } from "./sound";
import { Tutorial } from "./tutorial";

/** How near the park this loads (m from the arena's middle), and draws the map. */
export const STRIKE_NEAR = 520;
// (plan 118: the old walnut frame, now the one look's panel)
const FRAME = PANEL;

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
  /** the kill feed (plan 118, F2a: who, the gun, the marks, whom — as glyphs) */
  private feed: {
    by: string;
    byTeam: string;
    assist: string;
    gun: string;
    marks: string[];
    victim: string;
    vTeam: string;
    until: number;
    mine: boolean;
  }[] = [];
  /** the radio's lines, apart from the kills (under the radar) */
  private radioFeed: { name: string; team: string; line: string; until: number; mine: boolean }[] = [];
  /** the HUD's regions, each redrawn only when its own markup changes */
  private hudParts = new Map<string, HTMLDivElement>();
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
  /** The grenade chosen, thrown along my look (`short`: lobbed, CS's right click). */
  private throwNade(short: boolean) {
    this.pinned = false;
    const room = this.host.room();
    const ns = String(this.mine()?.nades || "")
      .split(",")
      .filter(Boolean);
    const kind = ns[this.nadeSel % Math.max(1, ns.length)];
    const cam = this.host.tp()?.camera;
    if (!room || !kind || !cam || !this.mine()?.alive) return;
    const d = cam.getWorldDirection(new Vector3());
    room.send("strike:throw", {
      kind,
      short,
      yaw: Math.atan2(d.z, d.x),
      pitch: Math.asin(Math.max(-1, Math.min(1, d.y))),
    });
    // (the last one gone: back to the gun)
    if (ns.length <= 1) strikeKeys.nadeReady = false;
  }
  /** (plan 118) a grenade in hand: the button held pulls the pin, let go throws (left long, right short). */
  private readonly onNadeMouse = (e: MouseEvent) => {
    if (!strikeKeys.nadeReady || !this.mine()?.alive || hud.get().panel.kind) return;
    if (e.button !== 0 && e.button !== 2) return;
    // (a click into the scene only, as the gun's: dark/index.ts's press — and not the click that takes the pointer
    // back, which only locks it; where the browser won't lock, every click's a throw: the double check 2's leftover)
    if (e.type === "mousedown" && !document.pointerLockElement) {
      if (!(e.target instanceof HTMLCanvasElement)) return;
      if (!this.noLock) return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.type === "mousedown") {
      if (!this.pinned) this.sound?.pin();
      this.pinned = true;
      this.pinShort = e.button === 2;
    } else if (this.pinned) this.throwNade(this.pinShort);
  };
  private pinShort = false;
  /** the browser refused the pointer (an error since the last lock): a click on the scene throws, there's no re-lock */
  private noLock = false;
  private readonly onLockErr = () => {
    this.noLock = true;
  };
  private readonly onLockOn = () => {
    if (document.pointerLockElement) this.noLock = false;
  };
  /** (the right button's pointerdown is the walker's aim: with a grenade in hand it's the lob, never the sights — the
   *  double check 2. Its pointerup goes through, so sights already up come down. Plan 119: the knife's stab, the
   *  charge's hands — no sights either.) */
  private readonly onNadePointer = (e: PointerEvent) => {
    const mine = strikeKeys.nadeReady || strikeKeys.knife || strikeKeys.chargeSel;
    if (e.button !== 2 || !mine || !this.mine()?.alive || hud.get().panel.kind) return;
    e.stopImmediatePropagation();
  };
  // ── (plan 119) the knife's two attacks (F2a) and the charge's plant (F4a): the mouse is theirs while in hand ──
  private knifeDown = [false, false];
  /** a click in the swing's wait: swung when it ends (true the right's stab) — CS eats none */
  private knifeQueued: boolean | null = null;
  private knifeNext = 0;
  private knifeN = 0;
  private planting = false;
  private readonly onGearMouse = (e: MouseEvent) => {
    const knife = strikeKeys.knife;
    const charge = strikeKeys.chargeSel;
    if (e.type === "mouseup" && e.button === 0 && this.planting) this.plantStop();
    // (the range's pad: its plant the left button held too — let go before it's done, it starts again)
    const d = this.drill;
    if (d?.kind === "plant" && d.stage === "plant" && e.button === 0 && !hud.get().panel.kind) {
      if (e.type === "mousedown" && !document.pointerLockElement && !(e.target instanceof HTMLCanvasElement)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.type === "mousedown" && !d.held) d.held = performance.now();
      if (e.type === "mouseup") {
        d.held = 0;
        d.done = 0;
      }
      return;
    }
    if (e.type === "mouseup") this.knifeDown[e.button === 0 ? 0 : 1] = false;
    if ((!knife && !charge) || !strikeKeys.playing || !this.mine()?.alive || hud.get().panel.kind) return;
    if (e.button !== 0 && e.button !== 2) return;
    if (e.type === "mousedown" && !document.pointerLockElement && !(e.target instanceof HTMLCanvasElement)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const down = e.type === "mousedown";
    if (knife) {
      const k = e.button === 0 ? 0 : 1;
      this.knifeDown[k] = down;
      if (down) this.knifeQueued = k === 1;
      return;
    }
    if (e.button === 0 && down) this.plantStart();
  };
  /** The swing due, if one is: a queued click first, else a button held (CS swings on while it's held). */
  private knifeFrame() {
    if (!strikeKeys.knife || !this.mine()?.alive || !this.playing()) {
      this.knifeDown[0] = this.knifeDown[1] = false;
      this.knifeQueued = null;
      return;
    }
    const now = performance.now();
    const want = this.knifeQueued ?? (this.knifeDown[1] ? true : this.knifeDown[0] ? false : null);
    if (want === null || now < this.knifeNext) return;
    this.knifeQueued = null;
    this.knifeNext = now + (want ? KNIFE.heavySwing : KNIFE.swing) * 1000;
    this.host.room()?.send("strike:stab", { heavy: want });
    strikeKeys.swings.set(this.myId(), { at: now, heavy: want, n: ++this.knifeN });
  }
  /** (plan 119) The gear the bodies draw (tp/person3d.ts strikeHands): the charge in hand or knelt over, the knife's
   *  swings (strikeKeys.swings), the pack on the carrier's back (the models: the view's, tp/view.ts lifeGear). */
  private gearFrame(a: Arena) {
    const G = strikeKeys.gear;
    G.clear();
    strikeKeys.packs.clear();
    if (!this.playing() && !a.members?.size) return;
    const st = String(a.charge || "");
    // (a bot's body is the room's NPC "strike-bot:<id>", drawn as npc:<that>: its pack, its kneel the same)
    const body = (id: string, m: Arena | undefined) => (m?.bot ? `npc:strike-bot:${id}` : id);
    for (const [id, m] of (a.members ?? new Map()) as Map<string, Arena>) {
      if (!m.alive) continue;
      const pl = m.bot ? undefined : (this.host.room()?.state.players.get(id) as { held?: string } | undefined);
      if (m.bomb && st === "planting") G.set(body(id, m), "plant");
      else if (pl?.held === "charge") G.set(id, "hold");
      else if (m.bomb) strikeKeys.packs.add(body(id, m));
    }
    const dz = String(a.defuser || "");
    if (dz && st === "planted") G.set(body(dz, a.members?.get(dz)), "defuse");
    // (the charge where it's knelt over: its spot, the floor's coords)
    strikeKeys.gearAt = st === "planting" || st === "planted" ? [Number(a.cx), Number(a.cz)] : null;
  }
  /** The left button down with the charge drawn: on a site, planting (held still, crouched: walker's `holding`). */
  private plantStart() {
    const room = this.host.room();
    if (!room || this.planting) return;
    if (!this.onSite()) {
      this.host.toast("Plant the charge on a bomb site (A or B)");
      return;
    }
    this.planting = true;
    this.using = true;
    room.send("strike:use", { on: true, plant: true });
  }
  private plantStop() {
    if (!this.planting) return;
    this.planting = false;
    this.using = false;
    this.host.room()?.send("strike:use", { on: false });
  }
  /** (plan 118, F9a) the marks a match leaves: bullet holes where rounds stopped, blood behind and under a hit —
   *  two instanced pools (holes, blood), the oldest reused; cleared each round. */
  private marks: { holes: InstancedMesh; blood: InstancedMesh; nh: number; nb: number } | null = null;
  private markPools() {
    if (this.marks) return this.marks;
    const tex = (draw: (g: CanvasRenderingContext2D) => void) => {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      draw(c.getContext("2d") as CanvasRenderingContext2D);
      const t = new CanvasTexture(c);
      t.colorSpace = SRGBColorSpace;
      return t;
    };
    const hole = tex((g) => {
      const r = g.createRadialGradient(32, 32, 2, 32, 32, 30);
      r.addColorStop(0, "rgba(10,10,10,1)");
      r.addColorStop(0.22, "rgba(20,18,16,.95)");
      r.addColorStop(0.38, "rgba(60,55,50,.55)");
      r.addColorStop(1, "rgba(60,55,50,0)");
      g.fillStyle = r;
      g.fillRect(0, 0, 64, 64);
    });
    const blood = tex((g) => {
      g.fillStyle = "rgba(110,12,10,.9)";
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = i < 4 ? Math.random() * 8 : 6 + Math.random() * 20;
        g.beginPath();
        g.arc(
          32 + Math.cos(a) * d,
          32 + Math.sin(a) * d,
          i < 4 ? 9 + Math.random() * 6 : 1.5 + Math.random() * 4,
          0,
          Math.PI * 2,
        );
        g.fill();
      }
    });
    const mat = (map: CanvasTexture) =>
      new MeshBasicMaterial({
        map,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -6,
        polygonOffsetUnits: -14,
      });
    const make = (m: MeshBasicMaterial, n: number) => {
      const im = new InstancedMesh(new PlaneGeometry(1, 1), m, n);
      im.count = 0;
      im.frustumCulled = false;
      im.renderOrder = 2;
      this.root.add(im);
      return im;
    };
    this.marks = { holes: make(mat(hole), 256), blood: make(mat(blood), 64), nh: 0, nb: 0 };
    return this.marks;
  }
  private readonly mQ = new Quaternion();
  private readonly mM = new Matrix4();
  private readonly mV = new Vector3();
  private readonly mN = new Vector3();
  private readonly mZ = new Vector3(0, 0, 1);
  /** A mark at local (x, y, z) on a face with normal n (local), `size` m across. */
  private mark(
    kind: "hole" | "blood",
    x: number,
    y: number,
    z: number,
    n: readonly number[],
    size: number,
    /** (plan 119: the knife's cut) stretched `long` times along `along` (local, in the wall's plane) */
    cut?: { long: number; along: readonly number[] },
  ) {
    const k = this.markPools();
    const im = kind === "hole" ? k.holes : k.blood;
    const cap = kind === "hole" ? 256 : 64;
    const i = (kind === "hole" ? k.nh++ : k.nb++) % cap;
    this.mN.set(n[0], n[1], n[2]).normalize();
    this.mQ.setFromUnitVectors(this.mZ, this.mN);
    let roll = Math.random() * Math.PI * 2;
    if (cut) {
      // (the quad's own x turned onto the cut's line, about the face's normal)
      const x0 = new Vector3(1, 0, 0).applyQuaternion(this.mQ);
      const d = new Vector3(cut.along[0], cut.along[1], cut.along[2]).normalize();
      roll = Math.atan2(this.mN.dot(new Vector3().crossVectors(x0, d)), x0.dot(d));
    }
    this.mQ.multiply(new Quaternion().setFromAxisAngle(this.mZ, roll));
    // (off the face a little: the park's ground is drawn 5 cm over its 0 — arena3d.ts "strike-ground")
    const off = n[1] > 0.7 ? 0.085 : 0.015;
    this.mV.set(x + STRIKE_PARK.x + n[0] * off, y + STRIKE_PARK.h + n[1] * off, z + STRIKE_PARK.z + n[2] * off);
    this.mM.compose(this.mV, this.mQ, new Vector3(size * (cut?.long ?? 1), size, 1));
    im.setMatrixAt(i, this.mM);
    im.count = Math.min(cap, Math.max(im.count, i + 1));
    im.instanceMatrix.needsUpdate = true;
  }
  /** (plan 118, F9a) A round along a line (local) through a smoke: the puffs by it cleared a moment. */
  private cutSmoke(o: readonly number[], d: readonly number[]) {
    for (const v of this.nadeViews.values()) {
      if (!v.puffs.length || v.kind !== "smoke") continue;
      const c = v.g.position;
      for (const sp of v.puffs) {
        const px = c.x + sp.position.x - STRIKE_PARK.x - o[0];
        const py = c.y + sp.position.y - STRIKE_PARK.h - o[1];
        const pz = c.z + sp.position.z - STRIKE_PARK.z - o[2];
        const t = px * d[0] + py * d[1] + pz * d[2];
        if (t < 0) continue;
        const q = Math.hypot(px - d[0] * t, py - d[1] * t, pz - d[2] * t);
        if (q < Math.max(0.5, sp.scale.x * 0.35)) (sp.userData as { cut?: number }).cut = 1.2;
      }
    }
  }
  /** Where a round (local origin, direction) stopped in the map: a hole there (not glass: it goes on). */
  private holeAlong(o: [number, number, number], d: [number, number, number], range: number) {
    const map = this.mapKey ? strikeMap(this.mapKey) : null;
    if (!map) return;
    this.cutSmoke(o, d);
    const r = rayFirst(map, o, d, range);
    if (!r || r.m === "glass") return;
    this.mark("hole", o[0] + d[0] * r.t, o[1] + d[1] * r.t, o[2] + d[2] * r.t, r.n, 0.1 + Math.random() * 0.04);
  }
  /** (plan 119) The knife on a wall: a gash where the blade met it — a short row of small marks across the slash's
   *  way (the stab's: one, deeper). Local coords; `y` the swing's height. */
  private knifeMark(x: number, y: number, z: number, yaw: number, heavy: boolean) {
    const map = this.mapKey ? strikeMap(this.mapKey) : null;
    if (!map) return;
    const d: [number, number, number] = [Math.cos(yaw), 0, Math.sin(yaw)];
    const r = rayFirst(map, [x, y, z], d, KNIFE.reach + 0.3);
    if (!r || r.m === "glass") return;
    const px = x + d[0] * r.t;
    const pz = z + d[2] * r.t;
    // (the slash: one long thin cut along the wall, level and a little down across its way; the stab: a short deep one)
    const along = [-r.n[2], 0.35, r.n[0]];
    if (heavy) this.mark("hole", px, y, pz, r.n, 0.07, { long: 1.6, along: [0, 1, 0] });
    else this.mark("hole", px, y, pz, r.n, 0.05, { long: 7, along });
  }
  /** Blood from a hit at local p, the round going on along d: on the wall behind (if near) and the floor under. */
  private bloodAt(p: [number, number, number], d: [number, number, number], head: boolean) {
    if (!parkPrefs().blood) return;
    const map = this.mapKey ? strikeMap(this.mapKey) : null;
    if (!map) return;
    const back = rayFirst(map, p, d, 2.6);
    if (back)
      this.mark("blood", p[0] + d[0] * back.t, p[1] + d[1] * back.t, p[2] + d[2] * back.t, back.n, head ? 0.9 : 0.6);
    const down = rayFirst(map, [p[0] + d[0] * 0.4, p[1], p[2] + d[2] * 0.4], [0, -1, 0], 2.4);
    if (down) this.mark("blood", p[0] + d[0] * 0.4, p[1] - down.t, p[2] + d[2] * 0.4, down.n, 0.55);
  }
  /** A person's shot (arms:shot, the floor's coords): its rounds' holes, from the seed the server shot with. */
  private shotMarks(m: {
    gun: string;
    ox: number;
    oy: number;
    oz: number;
    yaw: number;
    pitch: number;
    seed: number;
    spread: number;
  }) {
    if (!this.mapUp || !inStrikeArena(m.ox, m.oy, 2)) return;
    const [lx, lz] = toLocal(m.ox, m.oy);
    const o: [number, number, number] = [lx, m.oz - STRIKE_PARK.h, lz];
    const range = isGun(m.gun) ? ARMS[m.gun].range : 60;
    for (const pe of isGun(m.gun)
      ? pellets(m.gun, m.yaw, m.pitch, m.seed, m.spread)
      : [{ yaw: m.yaw, pitch: m.pitch }]) {
      const c = Math.cos(pe.pitch);
      this.holeAlong(o, [Math.cos(pe.yaw) * c, Math.sin(pe.pitch), Math.sin(pe.yaw) * c], range);
    }
  }
  /** (plan 118, F8a) the charge chosen (5): G lets it go */
  /** (plan 118, F8a) the guns on the floor, drawn as they lie (tp/items3d.ts's lying models) */
  private floorViews = new Map<string, Mesh>();
  private floorMat: MeshLambertMaterial | null = null;
  private drawFloor(a: Arena) {
    const seen = new Set<string>();
    for (const [id, g] of (a.floor ?? new Map()) as Map<string, Arena>) {
      seen.add(id);
      if (this.floorViews.has(id)) continue;
      this.floorMat ??= new MeshLambertMaterial({ vertexColors: true });
      const m = new Mesh(itemModel(String(g.gun)), this.floorMat);
      let h = 0;
      for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
      m.rotation.y = (h % 628) / 100;
      m.position.set(Number(g.x) + STRIKE_PARK.x, Number(g.y) + STRIKE_PARK.h + 0.01, Number(g.z) + STRIKE_PARK.z);
      this.root.add(m);
      this.floorViews.set(id, m);
    }
    for (const [id, m] of this.floorViews)
      if (!seen.has(id)) {
        m.removeFromParent();
        this.floorViews.delete(id);
      }
  }
  /** The floor's gun within reach of me (E takes it), or null. */
  private floorNear(): { id: string; gun: string } | null {
    const a = this.arena();
    const me = this.mine();
    if (!a?.floor || !me?.alive) return null;
    const p = this.host.me();
    const [x, z] = toLocal(p.x, p.y);
    let best: { id: string; gun: string } | null = null;
    let bd = 1.8;
    for (const [id, g] of a.floor as Map<string, Arena>) {
      const d = Math.hypot(Number(g.x) - x, Number(g.z) - z);
      if (d < bd) {
        bd = d;
        best = { id, gun: String(g.gun) };
      }
    }
    return best;
  }
  /** (plan 118, F7a) when my screen last saw my shot land (ms) */
  private predictedAt = -1e9;
  /** (plan 118, F7a) blood where a shot struck: a few red flecks out and down, gone in half a second (the park's
   *  setting can turn it off) — pooled */
  private bloodPuffs: { s: Sprite; v: Vector3; t: number }[] = [];
  private blood(x: number, y: number, z: number, head: boolean) {
    if (!parkPrefs().blood) return;
    const tp = this.host.tp();
    if (!tp) return;
    if (!this.bloodMat)
      this.bloodMat = new SpriteMaterial({ color: 0x8a1410, transparent: true, opacity: 0.85, depthWrite: false });
    const n = head ? 9 : 6;
    for (let i = 0; i < n; i++) {
      let p = this.bloodPuffs.find((q) => q.t <= 0);
      if (!p) {
        if (this.bloodPuffs.length >= 48) break;
        const sp = new Sprite(this.bloodMat.clone());
        sp.renderOrder = 5;
        this.root.add(sp);
        p = { s: sp, v: new Vector3(), t: 0 };
        this.bloodPuffs.push(p);
      }
      p.s.position.set(x, z, y);
      p.v.set((Math.random() - 0.5) * 2.4, Math.random() * 1.6, (Math.random() - 0.5) * 2.4);
      p.t = 0.45 + Math.random() * 0.2;
      p.s.scale.setScalar(0.06 + Math.random() * (head ? 0.1 : 0.07));
      p.s.visible = true;
    }
  }
  private bloodMat: SpriteMaterial | null = null;
  private stepPuffs(dt: number) {
    for (const p of this.bloodPuffs) {
      if (p.t <= 0) continue;
      p.t -= dt;
      p.v.y -= 9 * dt;
      p.s.position.addScaledVector(p.v, dt);
      (p.s.material as SpriteMaterial).opacity = Math.max(0, Math.min(0.85, p.t * 2));
      if (p.t <= 0) p.s.visible = false;
    }
  }
  /** (plan 118) the round's damage report (strike:report), shown with the round's card */
  private report: { rows: ServerMessages["strike:report"]["rows"]; until: number } | null = null;
  /** (plan 118) the scoreboard's ping: when the last went, the last round trip (ms; −1 none yet) */
  private pingAt = 0;
  private rtt = -1;
  /** my kills and headshots this round (the round-end card's line) */
  private roundKills = 0;
  private roundHeads = 0;
  private card: { team: "r" | "w"; why: string; mvp: string; mine: string; until: number } | null = null;
  private drawAt = 0;
  /** the park's own sounds (sound.ts), made once the mixer's up */
  private sound: StrikeSound | null = null;
  private keyAt = 0;
  private warmed = false;
  private crackleAt = 0;
  private radioOpen = false;
  /** (plan 118, F10a) the briefing hall's briefing running: the map flown over, stop by stop, its captions */
  private brief: { t0: number; stops: BriefStop[]; el: HTMLDivElement; key: string } | null = null;
  private briefCam: ThirdPersonView["gameCam"] = null;
  /** (F10a) a drill on the range: the aim drill's lit targets, or the pad's plant then defuse */
  private drill:
    | { kind: "aim"; t0: number; lit: number; litAt: number; hits: number; wrong: number; times: number[] }
    | { kind: "plant"; t0: number; stage: "plant" | "defuse"; held: number; done: number; plantAt: number }
    | null = null;
  private drillEl: HTMLDivElement | null = null;
  private litRing: Mesh | null = null;
  private padMesh: Mesh | null = null;
  /** (plan 118, F10a) the warmup's map vote open (V): 1–3 vote */
  private voteOpen = false;
  /** the ready check's countdown: the last second it beeped on */
  private goBeep = 0;
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
  private chargeGlb: { g: Object3D; led: MeshStandardMaterial | null } | null = null;
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
        // (plan 118, F9a) people's shots too: their holes in the map
        room.onMessage("arms:shot", (m: ServerMessages["arms:shot"]) => this.shotMarks(m)),
        room.onMessage("strike:flash", (m: ServerMessages["strike:flash"]) => {
          this.flash = Math.max(this.flash, m.secs);
          this.sound?.ring(m.secs);
        }),
        // (plan 118) the round's end: my damage report, shown under the round's card
        room.onMessage("strike:report", (m: ServerMessages["strike:report"]) => {
          this.report = { rows: m.rows, until: performance.now() + 7000 };
        }),
        // (plan 118) the scoreboard's ping: a round trip measured, told the server with the next one
        room.onMessage("strike:pong", (m: ServerMessages["strike:pong"]) => {
          this.rtt = Math.max(0, performance.now() - Number(m.t));
        }),
        room.onMessage("strike:radio", (m: ServerMessages["strike:radio"]) => {
          const name = String(this.arena()?.members.get(m.by)?.name ?? "someone");
          // (a bot's own words — plan 117 — or a menu line)
          const line = m.text ?? RADIO[m.i] ?? "";
          this.radioFeed.push({
            name,
            team: String(this.arena()?.members.get(m.by)?.team ?? ""),
            line,
            until: performance.now() + 5000,
            mine: m.by === this.myId(),
          });
          if (this.radioFeed.length > 4) this.radioFeed.shift();
          this.sound?.say(line, true);
        }),
        room.onMessage("strike:boom", (m: ServerMessages["strike:boom"]) => this.boom(m)),
        // (plan 115 phase 95) hit feedback: my hits marked at the crosshair; struck, the screen's edge goes red
        room.onMessage(
          "arms:hit",
          (m: { id?: string; kind?: string; head?: boolean; x?: number; y?: number; z?: number }) => {
            if (!this.playing() || m.kind !== "person") return;
            this.tut.tick("hit");
            const prefs = parkPrefs();
            if (prefs.hitmarker) this.hitMark = { until: performance.now() + 180, head: !!m.head };
            // (plan 118, F7a: the server's word — a headshot rings off a helmet, or cracks; a body hit already played
            // when my screen saw it, else now; blood where it struck, if it wasn't already)
            const predicted = performance.now() - this.predictedAt < 350;
            if (m.head) {
              const v = m.id ? this.arena()?.members.get(m.id) : undefined;
              if (v?.helmet) this.sound?.dink();
              else this.sound?.crack();
            } else if (!predicted) this.sound?.hitBody();
            if (!predicted && m.x !== undefined && m.y !== undefined && m.z !== undefined)
              this.blood(m.x, m.y, m.z, !!m.head);
            if (m.x !== undefined && m.y !== undefined && m.z !== undefined) {
              const cam = this.host.tp()?.camera.position;
              if (cam) {
                const [lx, lz] = toLocal(m.x, m.y);
                const dir = new Vector3(m.x - cam.x, m.z - cam.y, m.y - cam.z).normalize();
                this.bloodAt([lx, m.z - STRIKE_PARK.h, lz], [dir.x, dir.y, dir.z], !!m.head);
              }
            }
          },
        ),
        room.onMessage("dark:hit", (m: { n?: number }) => {
          if (!this.playing()) return;
          this.hurt = Math.min(1, this.hurt + Math.max(0.25, Number(m.n ?? 20) / 60));
          // (plan 118, F6a: the aim punch — struck, my view jolts up and a little aside, and settles; more for more)
          const k = Math.min(1, Number(m.n ?? 20) / 50);
          this.host.tp()?.guns.kick(0.035 * k, (Math.random() - 0.5) * 0.03 * k, 0.9);
        }),
        // (plan 115 phase 47) the lobby range: each hit scored, a running total this visit
        room.onMessage("strike:target", (m: ServerMessages["strike:target"]) => {
          if (this.drillHit(m.i)) return;
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
      setTimeout(() => this.sound?.warmPicks(), 1500);
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
    this.lobbyFrame(a);
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
        // (plan 118, F11a: the lobby's music in the compound, out of the arena; quieter out by the road)
        this.sound.music(
          inArena || this.playing() ? 0 : inStrikeCompound(c.x, c.z) ? 1 : Math.max(0, 1 - (d - 60) / 60) * 0.5,
          mixer.buses.music,
        );
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
    // (plan 118, F7a: my screen's hit — a thud and blood at once; the server's word follows)
    strikeKeys.predictHit = this.playing()
      ? (x, y, z) => {
          this.predictedAt = performance.now();
          this.sound?.hitBody();
          this.blood(x, y, z, false);
        }
      : null;
    this.stepPuffs(dt);
    this.drawFloor(a);
    strikeKeys.onShot = this.playing() ? (m) => this.shotMarks(m) : null;
    // (plan 118, F11a: the arena's footsteps — its floors, its walls between)
    if (this.mapUp && this.mapKey) {
      const map = strikeMap(this.mapKey);
      const ground = climateOf(this.mapKey).ground;
      strikeKeys.footing = (x, y, z) => {
        if (!inStrikeArena(x, y, 0)) return null;
        const [lx, lz] = toLocal(x, y);
        const r = rayFirst(map, [lx, z - STRIKE_PARK.h + 0.4, lz], [0, -1, 0], 1.2);
        // (its ground as its climate has it: sand, mud, or the world's snow)
        if (!r || r.m === "ground") return ground === "sand" ? "earth" : ground === "mud" ? "mud" : "snow";
        const st = MATS[r.m as keyof typeof MATS]?.step ?? "concrete";
        return st === "metal" ? "sheet" : st;
      };
      const me = this.host.me();
      strikeKeys.muffle = (x, y, z) => {
        if (!inStrikeArena(x, y, 0) || !inStrikeArena(me.x, me.y, 0)) return 1;
        const [ax, az] = toLocal(me.x, me.y);
        const [bx, bz] = toLocal(x, y);
        const mz = Number(this.host.room()?.state.players.get(this.myId())?.z ?? STRIKE_PARK.h);
        const walls = shotThrough(map, [ax, mz - STRIKE_PARK.h + 1.5, az], [bx, z - STRIKE_PARK.h + 0.3, bz]).walls;
        return walls ? Math.max(0.12, 0.35 ** walls) : 1;
      };
    } else strikeKeys.footing = strikeKeys.muffle = null;
    // (plan 118) in a match, a ping every 2 s: the round trip shown on the scoreboard
    if (this.mine() && performance.now() - this.pingAt > 2000) {
      this.pingAt = performance.now();
      this.host.room()?.send("strike:ping", { t: this.pingAt, ...(this.rtt >= 0 ? { rtt: this.rtt } : {}) });
    }
    this.snapshot(a);
    // the Esc menu (plan 115 phase 4): in the match, the pointer let go (Esc) with no menu open → the match's menu
    const locked = !!document.pointerLockElement;
    if (this.wasLocked && !locked && this.playing() && !hud.get().panel.kind) this.openPanel("strike-esc");
    this.wasLocked = locked;
    this.record(a);
    if (this.following) this.follow(a);
    else this.spectate(a, tp);
    strikeKeys.playing = this.playing();
    const meNow = this.mine();
    strikeKeys.dead = this.playing() && !!meNow && !meNow.alive;
    strikeKeys.loadout.primary = String(meNow?.primary ?? "");
    strikeKeys.loadout.pistol = String(meNow?.pistol ?? "");
    // (a grenade in hand only while I'm up and have one: killed holding it, or out of them, the gun's back — else
    // dark/index.ts keeps eating the clicks the next round)
    if (strikeKeys.nadeReady && (!this.playing() || !this.mine()?.alive || !String(this.mine()?.nades || ""))) {
      strikeKeys.nadeReady = false;
      this.pinned = false;
    }
    // (the charge gone from me — planted, dropped, died, a new round: not "in hand" any more, nor on the next one I
    // pick up; the double check 2)
    if (strikeKeys.chargeSel && (!this.playing() || !this.mine()?.alive || !this.mine()?.bomb))
      strikeKeys.chargeSel = false;
    if (a.phase !== "warmup") this.voteOpen = false;
    strikeKeys.digits = this.playing() && (!!a.voteTo || this.radioOpen || this.voteOpen);
    strikeKeys.holding = this.using && this.playing();
    this.knifeFrame();
    // (plan 119) who's holding the charge, planting it, defusing it — and the carriers' packs: the bodies draw them
    this.gearFrame(a);
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
    // (plan 119: the charge drawn is the server's word — slot 5, in both hands — not a flag of mine)
    strikeKeys.chargeSel = this.playing() && plk?.held === "charge";
    if (!strikeKeys.chargeSel && this.planting) this.plantStop();
    if (this.playing() && this.mine()?.alive && a.phase !== "idle" && !strikeKeys.knife && !strikeKeys.chargeSel) {
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
    g.fillStyle = LOOK.panelSolid;
    g.fillRect(0, 0, 640, 384);
    const map = strikeMap(key);
    g.fillStyle = LOOK.ink;
    g.font = canvasFont(34, true);
    g.fillText(map.name.toUpperCase(), 24, 48);
    g.font = canvasFont(18, false, 500);
    g.fillStyle = "#b8b1a2";
    g.fillText(a.up ? `${modeName(map.mode)} · ${map.plays}` : "THE CREW IS PUTTING IT UP…", 24, 76);
    radar(g, map, 300, 92, 320, 280);
    g.font = canvasFont(15, false, 500);
    g.fillStyle = LOOK.ink;
    wrap(g, map.blurb, 24, 120, 260, 20);
    g.fillStyle = LOOK.r;
    g.fillText("E  CHOOSE THE MAP", 24, 360);
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
    g.fillStyle = LOOK.panelSolid;
    g.fillRect(0, 0, 512, 280);
    g.textAlign = "center";
    g.fillStyle = LOOK.r;
    g.font = canvasFont(30, true);
    g.fillText(`STRIKE PARK · ${strikeMap(String(a.map)).name.toUpperCase()}`, 256, 46);
    if (a.phase === "idle") {
      g.fillStyle = LOOK.ink;
      g.font = canvasFont(24, false, 500);
      g.fillText("WALK IN · JOIN AT THE DESK", 256, 150);
    } else {
      const sw = !!a.swapped;
      const [ra, wa] = sw ? [a.scoreB, a.scoreA] : [a.scoreA, a.scoreB];
      g.font = canvasFont(92, true);
      g.fillStyle = LOOK.r;
      g.fillText(String(ra), 140, 170);
      g.fillStyle = LOOK.w;
      g.fillText(String(wa), 372, 170);
      g.font = canvasFont(20, false, 500);
      g.fillStyle = LOOK.r;
      g.fillText(TEAMS.r.name.toUpperCase(), 140, 206);
      g.fillStyle = LOOK.w;
      g.fillText(TEAMS.w.name.toUpperCase(), 372, 206);
      g.fillStyle = LOOK.ink;
      g.font = canvasFont(34, true);
      g.fillText(clock(Number(a.left)), 256, 150);
      g.font = canvasFont(18, false, 500);
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
      this.hudParts.clear();
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
    this.radioFeed = this.radioFeed.filter((f) => f.until > now);
    this.ticks = this.ticks.filter((t) => t.until > now);
    const team = me.team as "r" | "w";
    const sw = !!a.swapped;
    const [ra, wa] = sw ? [a.scoreB, a.scoreA] : [a.scoreA, a.scoreB];
    const members = [...(a.members as Map<string, Arena>).entries()];
    const planted = a.phase === "planted";
    const clockText =
      a.phase === "warmup"
        ? `Warmup ${clock(Number(a.left))}`
        : a.phase === "freeze"
          ? `Buy ${Math.ceil(Number(a.left))}`
          : planted
            ? "Charge"
            : a.phase === "half"
              ? "Half time"
              : a.phase === "over"
                ? "Final"
                : clock(Number(a.left));
    const round = Number(a.round ?? 0);
    // ── the top: a portrait per player each side of the score (dark when they're down), the clock and the round ──
    const portraits = (t: "r" | "w") =>
      members
        .filter(([, m]) => m.team === t)
        .sort(([x], [y]) => (x < y ? -1 : 1))
        .map(([id, m]) => {
          const up = !!m.alive || a.phase === "warmup";
          const mine = id === this.myId();
          const carry = t === team && t === "r" && !!m.bomb;
          return `<div title="${esc(String(m.name))}" style="position:relative;width:30px;height:34px;border-radius:3px;display:flex;align-items:center;justify-content:center;${HEAD};letter-spacing:0;font-size:14px;${up ? `background:${teamCol(t)};color:${teamInk(t)}` : `background:rgba(30,32,32,.85);color:${LOOK.dim}`};${mine ? "outline:2px solid #fff;outline-offset:1px;" : ""}">${up ? esc(shortName(String(m.name))) : "✕"}${carry ? `<span style="position:absolute;bottom:-9px;left:50%;transform:translateX(-50%);height:10px;color:${LOOK.r}">${GLYPH.charge}</span>` : ""}</div>`;
        })
        .join("");
    const ch = String(a.charge ?? "");
    const chargeLine = planted
      ? `<span style="color:${LOOK.bad}">${glyph("charge", 14)} The charge is down · site ${esc(String(a.site))}</span>`
      : ch === "dropped" && team === "r"
        ? `<span style="color:${LOOK.r}">${glyph("charge", 14)} The charge is dropped</span>`
        : "";
    this.hudPart(
      "top",
      "position:absolute;top:14px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:8px",
      `<div style="display:flex;align-items:center;gap:12px">
  <div style="display:flex;gap:4px">${portraits("r")}</div>
  <div style="${PANEL};display:flex;align-items:center;gap:14px;padding:5px 16px">
    <span style="${HEAD};${NUM};font-size:32px;letter-spacing:0;color:${LOOK.r}">${ra}</span>
    <span style="text-align:center;min-width:84px"><span style="${NUM};font-size:24px;font-weight:600;${planted ? `color:${LOOK.bad}` : ""}">${clockText}</span><br><span style="${LABEL};font-size:10px">${round ? `Round ${round}` : esc(strikeMap(this.mapKey).name)}</span></span>
    <span style="${HEAD};${NUM};font-size:32px;letter-spacing:0;color:${LOOK.w}">${wa}</span>
  </div>
  <div style="display:flex;gap:4px">${portraits("w")}</div>
</div>
${chargeLine ? `<div style="${HEAD};font-size:12px;text-shadow:0 1px 2px #000">${chargeLine}</div>` : ""}`,
    );
    // ── the kill feed, top right: names in their team's colour, the gun and the marks as glyphs ──
    this.hudPart(
      "feed",
      "position:absolute;top:14px;right:14px;display:flex;flex-direction:column;align-items:flex-end;gap:4px",
      this.feed
        .map(
          (f) =>
            `<div style="${PANEL};display:flex;align-items:center;gap:8px;padding:4px 10px;font-size:14px;font-weight:600;${f.mine ? `border-color:${LOOK.bad};` : ""}"><span style="color:${teamCol(f.byTeam)}">${esc(f.by)}</span>${f.assist ? `<span style="color:${LOOK.mute};font-weight:500">+ ${esc(f.assist)}</span>` : ""}${glyph(gunGlyph(f.gun), 16, LOOK.ink)}${f.marks.map((m) => glyph(m, 15, LOOK.ink)).join("")}<span style="color:${teamCol(f.vTeam)}">${esc(f.victim)}</span></div>`,
        )
        .join(""),
    );
    // ── the radar, top left, and the place I'm at; the radio's lines under it ──
    const where = placeOf(strikeMap(this.mapKey), this.host.room()?.state.players.get(this.myId()));
    this.hudPart(
      "radar",
      "position:absolute;left:14px;top:14px",
      `${this.radarHtml(a)}${where ? `<div style="${LABEL};margin-top:6px;color:${LOOK.ink};text-shadow:0 1px 2px #000">${esc(where)}</div>` : ""}`,
    );
    this.hudPart(
      "radio",
      "position:absolute;left:14px;top:262px;display:flex;flex-direction:column;gap:3px;max-width:320px",
      this.radioFeed
        .map(
          (r) =>
            `<div style="font-size:13px;text-shadow:0 1px 2px #000"><span style="color:${teamCol(r.team)};font-weight:700">${esc(r.name)}</span> <span style="color:${LOOK.mute}">(radio)</span> ${esc(r.line)}</div>`,
        )
        .join(""),
    );
    // ── health, armour and money, bottom left ──
    const hp = me.alive ? Number(me.hp) : 0;
    const hpCol = hp <= 25 ? LOOK.bad : LOOK.ink;
    const bar = (v: number, col: string) =>
      `<div style="height:4px;background:rgba(255,255,255,.12);margin-top:6px;border-radius:1px;overflow:hidden"><div style="width:${Math.max(0, Math.min(100, v))}%;height:100%;background:${col}"></div></div>`;
    const tick = this.ticks[this.ticks.length - 1];
    this.hudPart(
      "vitals",
      "position:absolute;left:14px;bottom:14px;display:flex;flex-direction:column;align-items:flex-start;gap:6px",
      `${me.bomb ? `<div style="${PANEL};padding:4px 10px;font-size:13px;color:${LOOK.r}">${glyph("charge", 14)} You carry the charge · <b style="${KEY}">5</b> takes it out, hold the left button on a site</div>` : ""}
<div style="${PANEL};display:flex">
  <div style="padding:9px 16px;min-width:76px"><div style="${LABEL}">Health</div><div style="${HEAD};${NUM};letter-spacing:0;font-size:40px;line-height:1;color:${hpCol}">${hp}</div>${bar(hp, hpCol)}</div>
  <div style="padding:9px 16px;min-width:76px;border-left:1px solid ${LOOK.line}"><div style="${LABEL}">Armour ${me.helmet ? glyph("helmet", 10, LOOK.ink) : ""}</div><div style="${HEAD};${NUM};letter-spacing:0;font-size:40px;line-height:1">${me.armor}</div>${bar(Number(me.armor), LOOK.w)}</div>
  <div style="padding:9px 16px;min-width:110px;border-left:1px solid ${LOOK.line}"><div style="${LABEL}">Money ${me.kit ? glyph("kit", 10, LOOK.ink) : ""}</div><div style="${HEAD};${NUM};letter-spacing:0;font-size:40px;line-height:1;color:${LOOK.good}">$${Number(me.money).toLocaleString("en-US")}</div><div style="font-size:12px;margin-top:3px;min-height:15px;color:${tick ? (tick.n >= 0 ? LOOK.good : LOOK.bad) : "transparent"}">${tick ? `${tick.n >= 0 ? "+" : "−"}$${Math.abs(tick.n)} ${tick.why}` : "·"}</div></div>
</div>`,
    );
    // ── the gun, its rounds, the slots: bottom right ──
    const gun = String(this.host.room()?.state.players.get(this.myId())?.gun ?? "");
    const mag = gun ? (this.host.loaded?.(gun) ?? 0) : 0;
    const reserve = gun ? this.host.items(AMMO[gun] ?? "") : 0;
    const nades = String(me.nades || "")
      .split(",")
      .filter(Boolean);
    const sel = nades[this.nadeSel % Math.max(1, nades.length)];
    const nadeHeld = strikeKeys.nadeReady && nades.length ? (sel ?? "") : "";
    const held = nadeHeld ? nadeGlyph(nadeHeld) : strikeKeys.chargeSel ? "charge" : strikeKeys.knife ? "knife" : gun;
    const slot = (k: string, name: string, on: boolean) =>
      `<span style="display:inline-flex;align-items:center;gap:4px;margin-left:10px;color:${on ? LOOK.ink : LOOK.mute}"><b style="${KEY}${on ? `;background:${teamCol(team)};color:${teamInk(team)};border-color:transparent` : ""}">${k}</b>${name}</span>`;
    this.hudPart(
      "ammo",
      `position:absolute;right:14px;bottom:14px;${PANEL};padding:9px 16px;text-align:right;min-width:220px`,
      `<div style="display:flex;align-items:center;justify-content:flex-end;gap:10px;color:${LOOK.ink}">${glyph(gunGlyph(held), 24)}<span style="${LABEL}">${esc(nadeHeld ? shortNade(nadeHeld) : held === "charge" ? "The charge" : held === "knife" ? "Knife" : gunName(gun) || "No gun")}</span></div>
<div style="line-height:1;margin-top:2px">${nadeHeld ? `<span style="font-size:13px;color:${LOOK.mute}">Left click throws · right click lobs it</span>` : held === "charge" ? `<span style="font-size:13px;color:${LOOK.mute}">On a site: hold the left button</span>` : held === "knife" ? `<span style="font-size:13px;color:${LOOK.mute}">Left slashes · right stabs</span>` : !gun ? "" : `<span style="${HEAD};${NUM};letter-spacing:0;font-size:46px;${gun && mag === 0 ? `color:${LOOK.bad}` : ""}">${gun ? mag : "–"}</span><span style="${NUM};font-size:20px;color:${LOOK.mute}"> / ${gun ? reserve : "–"}</span>`}</div>
<div style="margin-top:6px;font-size:12px;white-space:nowrap">${me.primary ? slot("1", gunName(String(me.primary)), held === me.primary) : ""}${me.pistol ? slot("2", gunName(String(me.pistol)), held === me.pistol) : ""}${slot("3", "Knife", held === "knife")}${nades.length ? slot("4", `${glyph(nadeGlyph(sel ?? ""), 11)} ${shortNade(sel ?? "")}${nades.length > 1 ? ` <span style="color:${LOOK.mute}">+${nades.length - 1}</span>` : ""}`, !!nadeHeld) : ""}${me.bomb ? slot("5", `${glyph("charge", 11)} Charge`, held === "charge") : ""}</div>`,
    );
    // ── the rest: the banners, the cards, the boards — each its own when it's up ──
    const card = this.card && this.card.until > now ? this.card : null;
    const dead = !me.alive && a.phase !== "warmup";
    const html = `
${this.banner.until > now ? `<div style="position:absolute;top:26%;left:50%;transform:translateX(-50%);${PANEL};padding:12px 30px;${HEAD};font-size:28px">${this.banner.text}</div>` : ""}
${card && !this.scoreOpen ? this.cardHtml(card) : ""}
${a.phase === "over" ? this.endHtml(a) : ""}
${a.phase === "warmup" ? this.warmupHtml(a) : ""}
${a.call ? this.callHtml(a) : ""}
${a.phase === "half" ? `<div style="position:absolute;top:24%;left:50%;transform:translateX(-50%);${PANEL};min-width:420px;text-align:center;overflow:hidden"><div style="padding:12px 20px;border-bottom:1px solid ${LOOK.line};${HEAD};font-size:30px">Half time</div><div style="padding:12px 20px;font-size:16px">The sides swap — you're the <b style="color:${teamCol(team)}">${TEAMS[team].name}</b> now. Your money starts again.</div></div>` : ""}
${dead ? this.watchHtml(a) : ""}
${dead && this.death && !this.scoreOpen ? this.deathHtml(this.death) : ""}
${a.charge === "planted" && a.defuser === this.myId() ? `<div style="position:absolute;top:30%;left:50%;transform:translateX(-50%);${PANEL};padding:8px 14px;width:240px"><div style="${LABEL}">Defusing</div>${bar(100 - (Number(a.defuseLeft) / (me.kit ? 5 : 10)) * 100, LOOK.r)}</div>` : ""}
${(() => {
  const f = me.alive ? this.floorNear() : null;
  return f
    ? `<div style="position:absolute;top:60%;left:50%;transform:translateX(-50%);${PANEL};padding:6px 14px;font-size:14px;display:flex;align-items:center;gap:8px"><b style="${KEY}">E</b> take the ${glyph(gunGlyph(f.gun), 14, LOOK.ink)} ${esc(gunName(f.gun))}</div>`
    : "";
})()}
${strikeKeys.chargeSel && me.bomb ? `<div style="position:absolute;right:14px;bottom:150px;${PANEL};padding:6px 12px;font-size:13px;color:${LOOK.r}">${glyph("charge", 14)} The charge in hand · on a site hold the <b style="${KEY}">left button</b> · <b style="${KEY}">G</b> drops it</div>` : ""}
${a.charge === "planting" && me.bomb ? `<div style="position:absolute;top:30%;left:50%;transform:translateX(-50%);${PANEL};padding:8px 14px;width:240px"><div style="${LABEL}">Planting</div>${bar(100 - (Math.max(0, Number(a.fuse)) / ROUND.plant) * 100, LOOK.r)}</div>` : ""}
${this.scoreOpen ? this.scoreHtml(a) : ""}
${this.radioOpen ? `<div style="position:absolute;left:14px;top:262px;${PANEL};padding:8px 14px;font-size:14px"><div style="${LABEL};color:${LOOK.r}">Radio</div>${RADIO.map((l, i) => `<div style="margin-top:3px"><b style="${KEY}">${(i + 1) % 10}</b> ${l}</div>`).join("")}</div>` : ""}`;
    this.hudPart("over", "position:absolute;inset:0", html);
    // (the frame's own: the flash, the hurt, the hit, the crosshair — apart, as they change every frame)
    this.hudPart(
      "fx",
      "position:absolute;inset:0",
      `${this.flash > 0.005 ? `<div style="position:absolute;inset:0;background:${parkPrefs().flash === "dark" ? "#050505" : "#fff"};opacity:${Math.min(1, this.flash).toFixed(2)}"></div>` : ""}
${this.hurt > 0.02 ? `<div style="position:absolute;inset:0;box-shadow:inset 0 0 ${Math.round(120 * this.hurt)}px ${Math.round(40 * this.hurt)}px rgba(190,30,20,${(0.55 * this.hurt).toFixed(2)})"></div>` : ""}
${this.hitMark && this.hitMark.until > now ? hitMarker(this.hitMark.head) : ""}
${dead || (this.host.tp()?.handsAds ?? 0) > 0.5 || (this.host.tp()?.scopeK ?? 0) > 0.5 ? "" : crosshair()}`,
    );
  }
  /** One region of the HUD: made once, its style and markup set only when they change. */
  /** The markup last written to each HUD element: compared, not the element's innerHTML — a browser never hands that
   *  back as written (`<img/>` → `<img>`, an SVG's `<path/>` → `<path></path>`, `&#38;` → `&amp;`), so every part with
   *  a glyph in it was parsed and laid out again each frame (the double check 2). */
  private written = new WeakMap<HTMLElement, string>();
  private setHtml(el: HTMLElement, html: string) {
    if (this.written.get(el) === html) return;
    this.written.set(el, html);
    el.innerHTML = html;
  }
  private hudPart(key: string, css: string, html: string) {
    if (!this.hudEl) return;
    let el = this.hudParts.get(key);
    if (!el) {
      el = document.createElement("div");
      this.hudEl.appendChild(el);
      this.hudParts.set(key, el);
      el.dataset.css = "";
    }
    if (el.dataset.css !== css) {
      el.style.cssText = css;
      el.dataset.css = css;
    }
    this.setHtml(el, html);
  }
  /** The map vote (phase 13): three maps, their votes, mine; 1–3 (plan 118: the warmup's too, its own title). */
  private voteHtml(a: Arena, title = ""): string {
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
    return `<div style="padding:8px 16px 6px"><div style="${LABEL};color:${LOOK.r}">${title || `Vote the next map · ${left}s`}</div>
  <div style="display:flex;gap:8px;justify-content:center;margin-top:7px">${keys
    .map((k, i) => {
      const n = Object.values(votes).filter((x) => x === k).length;
      return `<div style="padding:7px 12px;border:1px solid ${mine === k ? LOOK.r : LOOK.line};background:${mine === k ? "rgba(232,163,58,.12)" : "transparent"};min-width:128px;text-align:left"><div><b style="${KEY}">${i + 1}</b> <span style="${HEAD};font-size:17px">${esc(strikeMap(k).name)}</span></div><div style="font-size:12px;color:${LOOK.mute}">${climateOf(k).name}${k === a.map ? " · this one" : ""} · <span style="${NUM};color:${LOOK.ink}">${n}</span> vote${n === 1 ? "" : "s"}</div></div>`;
    })
    .join("")}</div></div>`;
  }
  /** The warmup's board (plan 115 phase 14; plan 118 F10a): who's ready (F3), the map vote (V, then 1–3), the
   *  ready check's countdown once everyone is. */
  private warmupHtml(a: Arena): string {
    const ready = new Set(
      String(a.ready ?? "")
        .split(",")
        .filter(Boolean),
    );
    const people = [...(a.members as Map<string, Arena>).entries()].filter(([, m]) => !m.bot);
    const mine = ready.has(this.myId());
    const goLeft = a.goTo ? Math.max(0, Math.ceil((Number(a.goTo) - Date.now()) / 1000)) : 0;
    if (goLeft && goLeft !== this.goBeep) {
      this.goBeep = goLeft;
      this.sound?.beep(goLeft <= 1 ? 1 : 0);
      if (goLeft <= 5) this.sound?.call(String(goLeft));
    } else if (!goLeft) this.goBeep = 0;
    let votes: Record<string, string> = {};
    try {
      votes = a.votes ? JSON.parse(String(a.votes)) : {};
    } catch {
      votes = {};
    }
    const myVote = votes[this.myId()];
    const keys = String(a.vote ?? "")
      .split(",")
      .filter(Boolean);
    return `<div style="position:absolute;right:14px;top:300px;${PANEL};padding:10px 14px;min-width:220px">
  <div style="${LABEL};color:${LOOK.r}">Warmup</div>
  <div style="font-size:13px;margin:4px 0 6px;color:${LOOK.mute}">Free buys, respawns. Ready <b style="${NUM};color:${LOOK.ink}">${ready.size}/${people.length}</b></div>
  ${people.map(([id, m]) => `<div style="font-size:13px"><span style="color:${ready.has(id) ? LOOK.good : LOOK.mute}">${ready.has(id) ? "✔" : "·"}</span> ${esc(m.name)}${votes[id] ? ` <span style="color:${LOOK.mute}">→ ${esc(strikeMap(votes[id]).name)}</span>` : ""}</div>`).join("")}
  <div style="margin-top:8px;font-size:12px"><b style="${KEY}">F3</b> ${mine ? "not ready" : "I'm ready"}${keys.length > 1 ? ` &nbsp;<b style="${KEY}">V</b> ${myVote ? `the map: ${esc(strikeMap(myVote).name)}` : "vote the map"}` : ""}</div>
</div>
${this.voteOpen && keys.length > 1 ? `<div style="position:absolute;left:50%;top:18%;transform:translateX(-50%);${PANEL};overflow:hidden">${this.voteHtml(a, "The map we play · 1–3 · V closes")}</div>` : ""}
${goLeft ? `<div style="position:absolute;left:50%;top:30%;transform:translateX(-50%);${PANEL};padding:12px 34px;text-align:center"><div style="${LABEL};color:${LOOK.r}">Everyone's ready</div><div style="${HEAD};${NUM};font-size:54px;line-height:1.05">${goLeft}</div><div style="font-size:13px;color:${LOOK.mute}">${keys.length > 1 && myVote !== undefined ? "the votes are counted at the end" : "the match starts"} · <b style="${KEY}">F3</b> stops it</div></div>` : ""}`;
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
  <div style="padding:0 18px 12px;text-align:left">${this.scoreHtml(a, true)}</div>
  ${a.voteTo ? this.voteHtml(a) : ""}
  <div style="padding:10px 20px 16px;font-size:14px;opacity:.85">${a.voteTo ? "The next match starts on the map with the most votes" : "The next one's being set up"} · <b style="${KEY}">ESC</b> leaves${this.hl.best ? ` · <b style="${KEY}">H</b> watch your best round` : ""}</div>
</div></div>`;
  }
  /** Killed: by whom, with what, their health left; my round's damage and hits to and from each (plan 118: the
   *  look's). */
  private deathHtml(d: ServerMessages["strike:death"]): string {
    const rows = d.report
      .map(
        (r) =>
          `<tr><td style="padding:4px 14px">${esc(r.name)}</td><td style="text-align:right;color:${LOOK.good};${NUM}">${r.dealt} <span style="color:${LOOK.mute}">in ${r.hits}</span></td><td style="text-align:right;padding-right:14px;color:${LOOK.bad};${NUM}">${r.taken} <span style="color:${LOOK.mute}">in ${r.hitsTaken ?? 0}</span></td></tr>`,
      )
      .join("");
    return `<div style="position:absolute;top:22%;left:50%;transform:translateX(-50%);${PANEL};min-width:360px;overflow:hidden">
  <div style="padding:9px 14px;border-bottom:1px solid ${LOOK.line};display:flex;align-items:center;gap:10px"><span style="${LABEL};color:${LOOK.bad}">Killed by</span><b style="font-size:18px">${esc(d.name || "the fall")}</b><span style="margin-left:auto;height:18px;color:${LOOK.ink}">${glyph(gunGlyph(d.gun), 18)}</span></div>
  <div style="padding:7px 14px;font-size:14px;color:${LOOK.mute}">${esc(gunName(d.gun))}${d.head ? " · a headshot" : ""}${d.name ? ` · they had <b style="color:${LOOK.ink}">${d.hp}</b> health left` : ""}</div>
  ${rows ? `<table style="width:100%;font-size:13px;border-collapse:collapse;border-top:1px solid ${LOOK.line}"><tr style="${LABEL};font-size:10px"><td style="padding:6px 14px">This round</td><td style="text-align:right">Given</td><td style="text-align:right;padding-right:14px">Taken</td></tr>${rows}</table>` : ""}
</div>`;
  }
  /** The round-end card: who won and how, the MVP, my round — and under it my damage report, a tile per enemy with
   *  what passed between us (CS2's round-end report; plan 118). */
  private cardHtml(c: { team: "r" | "w"; why: string; mvp: string; mine: string }): string {
    const rep = this.report && this.report.until > performance.now() ? this.report.rows : [];
    const tiles = rep
      .map(
        (r) =>
          `<div style="width:112px;${PANEL};padding:7px 8px;text-align:center;${r.dealt || r.taken ? "" : "opacity:.5;"}">
  <div style="display:flex;align-items:center;gap:6px;justify-content:center"><span style="display:inline-flex;width:22px;height:22px;border-radius:3px;align-items:center;justify-content:center;background:${r.dead ? "rgba(40,42,42,.9)" : teamCol(r.team)};color:${r.dead ? LOOK.dim : teamInk(r.team)};${HEAD};letter-spacing:0;font-size:11px">${r.dead ? "✕" : esc(shortName(r.name))}</span><span style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70px">${esc(r.name)}</span></div>
  <div style="font-size:12px;margin-top:5px;${NUM}"><span style="color:${LOOK.good}">${r.dealt}</span><span style="color:${LOOK.mute}"> in ${r.hits}</span></div>
  <div style="font-size:12px;${NUM}"><span style="color:${LOOK.bad}">${r.taken}</span><span style="color:${LOOK.mute}"> in ${r.hitsTaken}</span></div>
</div>`,
      )
      .join("");
    return `<div style="position:absolute;top:20%;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:10px">
<div style="${PANEL};min-width:440px;text-align:center;overflow:hidden">
  <div style="background:${teamCol(c.team)};color:${teamInk(c.team)};padding:9px 20px;${HEAD};font-size:30px">${TEAMS[c.team].name} win the round</div>
  <div style="padding:9px 20px;font-size:15px">${c.why}</div>
  ${c.mvp ? `<div style="padding:0 20px 9px;font-size:14px"><span style="${LABEL};color:${LOOK.r}">MVP</span> ${c.mvp}</div>` : ""}
  ${c.mine ? `<div style="padding:7px 20px;border-top:1px solid ${LOOK.line};font-size:13px;color:${LOOK.mute}">${c.mine}</div>` : ""}
</div>
${tiles ? `<div style="${LABEL};text-shadow:0 1px 2px #000">Damage · given <span style="color:${LOOK.good}">green</span> · taken <span style="color:${LOOK.bad}">red</span></div><div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;max-width:720px">${tiles}</div>` : ""}
</div>`;
  }
  /** (plan 118) out of the round: whom I watch — their health, armour, gun, money — and the clicks that change it. */
  private watchHtml(a: Arena): string {
    const w = a.members.get(this.watch) as Arena | undefined;
    if (!w)
      return `<div style="position:absolute;bottom:120px;left:50%;transform:translateX(-50%);${PANEL};padding:8px 18px;font-size:15px">You're out · back next round</div>`;
    const gun = w.bot ? String(w.gun ?? "") : String(this.host.room()?.state.players.get(this.watch)?.gun ?? "");
    const t = String(w.team);
    return `<div style="position:absolute;bottom:110px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:6px">
  <div style="${LABEL};text-shadow:0 1px 2px #000">You're out · watching</div>
  <div style="${PANEL};display:flex;align-items:center;gap:16px;padding:8px 16px">
    <span style="display:inline-flex;width:30px;height:30px;border-radius:3px;align-items:center;justify-content:center;background:${teamCol(t)};color:${teamInk(t)};${HEAD};letter-spacing:0;font-size:13px">${esc(shortName(String(w.name)))}</span>
    <b style="font-size:17px">${esc(String(w.name))}</b>
    <span style="${NUM};font-size:15px">${glyph("cross", 13, LOOK.ink)} ${Number(w.hp)}</span>
    <span style="${NUM};font-size:15px">${glyph("shield", 13, LOOK.w)} ${Number(w.armor)}${w.helmet ? ` ${glyph("helmet", 11, LOOK.ink)}` : ""}</span>
    ${gun ? `<span style="display:inline-flex;align-items:center;gap:6px;color:${LOOK.mute}">${glyph(gunGlyph(gun), 15, LOOK.ink)}${esc(gunName(gun))}</span>` : ""}
    <span style="${NUM};color:${LOOK.good}">$${Number(w.money).toLocaleString("en-US")}</span>
  </div>
  <div style="font-size:12px;color:${LOOK.mute};text-shadow:0 1px 2px #000"><b style="${KEY}">Left click</b> next · <b style="${KEY}">Right click</b> back · back next round</div>
</div>`;
  }
  /** The radar (plan 115 phases 35, 80): the map's picture drawn once (radar.ts, its climate's ground, its places'
   *  names) and kept; my teammates, the charge, as markers over it — nothing re-encoded a frame. */
  private radarPic = { key: "", url: "" };
  /** (plan 118, phase 19) the radar drawn ten times a second, not each frame: its marks rebuilt the region's DOM (a
   *  layout) every time anyone on my side moved a pixel */
  private radarMemo = { at: 0, html: "" };
  private radarDir = new Vector3();
  private radarHtml(a: Arena): string {
    const now = performance.now();
    if (now - this.radarMemo.at < 100 && this.radarMemo.html) return this.radarMemo.html;
    this.radarMemo = { at: now, html: this.radarFresh(a) };
    return this.radarMemo.html;
  }
  private radarFresh(a: Arena): string {
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
      if (mine) {
        // (me: a white arrow the way I look)
        // (the way the camera looks — the world's x and z are the map's x and z, its +z down the radar; the arrow's 0°
        // points up, turning clockwise. The view's `yaw` was the camera's orbit angle, not where I look: the user's
        // feedback, 2026-11-23)
        const cam = this.host.tp()?.camera;
        const dir = cam ? cam.getWorldDirection(this.radarDir) : this.radarDir.set(0, 0, -1);
        const deg = (Math.atan2(dir.x, -dir.z) * 180) / Math.PI;
        marks.push(
          `<i style="position:absolute;left:${Math.round((x - S.x0) * k - 7)}px;top:${Math.round((z - S.z0) * k - 7)}px;width:14px;height:14px;transform:rotate(${deg.toFixed(0)}deg)"><svg viewBox="0 0 14 14" width="14" height="14"><path d="M7 1L12 12L7 9.5L2 12Z" fill="#fff" stroke="rgba(0,0,0,.75)" stroke-width="1"/></svg></i>`,
        );
        continue;
      }
      dot(x, z, team === "r" ? AMBER : STEEL, 4);
    }
    // (plan 118: the smokes as grey discs, the fires orange, where they are now — everyone's, as anyone can see them)
    for (const [, n] of a.nades as Map<string, Arena>) {
      const st = String(n.state);
      if (st !== "smoke" && st !== "fire") continue;
      const r = Math.max(3, (st === "smoke" ? smokeRadius(Number(n.left)) : 3) * k);
      marks.unshift(
        `<i style="position:absolute;left:${Math.round((Number(n.x) - S.x0) * k - r)}px;top:${Math.round((Number(n.z) - S.z0) * k - r)}px;width:${Math.round(r * 2)}px;height:${Math.round(r * 2)}px;border-radius:50%;background:${st === "smoke" ? "rgba(205,208,210,.75)" : "rgba(232,120,40,.7)"}"></i>`,
      );
    }
    // (the charge as its own glyph, not a dot — under the people's marks, and not over my own arrow when it's on my
    // back: the HUD says I carry it)
    const carried = a.charge === "carried" || a.charge === "planting";
    if ((a.charge === "dropped" || a.charge === "planted" || (a.charge && team === "r")) && !(carried && me?.bomb))
      marks.unshift(
        `<span style="position:absolute;left:${Math.round((Number(a.cx) - S.x0) * k - 8)}px;top:${Math.round((Number(a.cz) - S.z0) * k - 8)}px;height:16px;color:${a.charge === "planted" ? LOOK.bad : LOOK.r};filter:drop-shadow(0 0 1px #000)">${GLYPH.charge}</span>`,
      );
    return `<div style="${PANEL};padding:4px"><div style="position:relative;width:${SZ}px;height:${SZ}px;overflow:hidden;border-radius:2px"><img src="${this.radarPic.url}" width="${SZ}" height="${SZ}" style="display:block"/>${marks.join("")}</div></div>`;
  }
  /** (plan 118) The scoreboard, as the user's pick "A": each side's table on the same columns — K, A, D, ADR, HS %,
   *  MVP, money, ping — with a strip of the rounds between them (who won each, and how). `bare`: no place of its own
   *  (the match's end lays it in its card). */
  private scoreHtml(a: Arena, bare = false): string {
    const sw = !!a.swapped;
    const [ra, wa] = sw ? [a.scoreB, a.scoreA] : [a.scoreA, a.scoreB];
    const hist = String(a.history ?? "")
      .split(",")
      .filter(Boolean)
      .map((h) => h.split(":"));
    const played = Math.max(1, hist.length);
    const myTeam = String(this.mine()?.team ?? "");
    const cols = `<colgroup><col style="width:34%"><col><col><col><col><col><col><col><col></colgroup>`;
    const th = `<tr style="${LABEL};font-size:10px">${["", "K", "A", "D", "ADR", "HS %", "MVP", "$", "Ping"].map((c, i) => `<td style="padding:6px 10px;${i ? "text-align:right" : ""}">${c}</td>`).join("")}</tr>`;
    const rows = (t: "r" | "w") =>
      [...(a.members as Map<string, Arena>).entries()]
        .filter(([, m]) => m.team === t)
        .sort(([, x], [, y]) => y.kills - x.kills || x.deaths - y.deaths)
        .map(([id, m]) => {
          const mine = id === this.myId();
          const showMoney = t === myTeam || a.phase === "over";
          const cells = [
            m.kills,
            m.assists,
            m.deaths,
            Math.round(Number(m.damage ?? 0) / played),
            m.kills > 0 ? `${Math.round((Number(m.heads ?? 0) / m.kills) * 100)}%` : "—",
            m.mvps
              ? `<span style="color:${LOOK.r}">${"★".repeat(Math.min(5, m.mvps))}${m.mvps > 5 ? `×${m.mvps}` : ""}</span>`
              : "",
            showMoney ? `$${Number(m.money).toLocaleString("en-US")}` : "",
            m.bot ? `<span style="color:${LOOK.mute}">bot</span>` : Number(m.ping ?? 0) || "—",
          ];
          return `<tr style="${mine ? "background:rgba(255,255,255,.08);" : ""}${m.alive || a.phase === "over" || a.phase === "warmup" ? "" : "opacity:.45;"}">
  <td style="padding:5px 10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><span style="display:inline-flex;width:24px;height:24px;border-radius:3px;align-items:center;justify-content:center;vertical-align:middle;margin-right:9px;background:${teamCol(t)};color:${teamInk(t)};${HEAD};letter-spacing:0;font-size:12px">${esc(shortName(String(m.name)))}</span><b style="font-weight:600">${esc(String(m.name))}</b></td>
  ${cells.map((c) => `<td style="padding:5px 10px;text-align:right;${NUM}">${c}</td>`).join("")}</tr>`;
        })
        .join("");
    const table = (t: "r" | "w", score: number) => `<div style="${PANEL};padding:0;overflow:hidden">
  <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 12px;border-bottom:1px solid ${LOOK.line}"><span style="${HEAD};font-size:18px;color:${teamCol(t)}">${TEAMS[t].name}</span><span style="${HEAD};${NUM};letter-spacing:0;font-size:24px;color:${teamCol(t)}">${score}</span></div>
  <table style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:14px">${cols}${th}${rows(t)}</table></div>`;
    const SYM: Record<string, string> = { elim: "✕", bomb: "✸", defuse: "✓", time: "⧗", rescue: "⇧", hostages: "⇧" };
    const total = Math.min(30, (MODES[a.mode as ModeId]?.first ?? 13) * 2 - 1);
    const strip = MODES[a.mode as ModeId]?.rounds
      ? `<div style="${PANEL};display:flex;flex-wrap:wrap;gap:3px;padding:7px 12px;align-items:center"><span style="${LABEL};margin-right:8px">Rounds</span>${hist
          .map(
            ([t, why]) =>
              `<span title="${esc(String(WIN_WHY[why] ?? why))}" style="width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;border-radius:2px;background:${teamCol(t)};color:${teamInk(t)};font-size:12px;font-weight:700">${SYM[why] ?? "·"}</span>`,
          )
          .join(
            "",
          )}${Array.from({ length: Math.max(0, total - hist.length) }, () => `<span style="width:20px;height:20px;border:1px dashed ${LOOK.line};border-radius:2px"></span>`).join("")}</div>`
      : "";
    const body = `<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px"><div style="${HEAD};font-size:22px">${esc(strikeMap(String(a.map)).name)} <span style="font-size:14px;color:${LOOK.mute}">· ${esc(MODES[a.mode as ModeId]?.name ?? "")}${a.round ? ` · round ${a.round}` : ""}</span></div></div>
<div style="display:flex;flex-direction:column;gap:8px">${table("r", Number(ra))}${strip}${table("w", Number(wa))}</div>`;
    return bare
      ? body
      : `<div style="position:absolute;top:9%;left:50%;transform:translateX(-50%);width:min(980px,94vw)">${body}</div>`;
  }

  // ── the events ──
  private events(evs: ServerMessages["strike:ev"]) {
    const a = this.arena();
    const name = (id: string) => String(a?.members.get(id)?.name ?? "someone");
    const me = this.myId();
    for (const e of evs as MatchEvent[]) {
      if (e.e === "kill") {
        const teamOfId = (id: string) => String(a?.members.get(id)?.team ?? "");
        const ev = e as typeof e & { smoke?: boolean; blind?: boolean; noscope?: boolean };
        this.feed.push({
          by: name(e.by),
          byTeam: teamOfId(e.by),
          assist: e.assist ? name(e.assist) : "",
          gun: e.gun,
          marks: [
            ...(ev.blind ? ["blind"] : []),
            ...(ev.noscope ? ["noscope"] : []),
            ...(ev.smoke ? ["through"] : []),
            ...(e.walls ? ["wall"] : []),
            ...(e.head ? ["head"] : []),
          ],
          victim: name(e.victim),
          vTeam: teamOfId(e.victim),
          until: performance.now() + 7000,
          mine: e.by === me || e.victim === me,
        });
        if (this.feed.length > 6) this.feed.shift();
        if (e.victim === me) this.watch = "";
        if (e.by === me && e.victim !== me) {
          this.roundKills++;
          if (e.head) this.roundHeads++;
          this.sound?.key();
          this.hl.kill(e.victim, e.head);
        }
      } else if (e.e === "round") {
        this.clearMarks();
        this.roundKills = 0;
        this.roundHeads = 0;
        this.card = null;
        if (e.n === 1) this.hl.clear();
        this.hl.start(e.n);
        this.say(`ROUND ${e.n}`, 1.6);
      } else if (e.e === "live") {
        this.say("GO", 0.9);
        // (plan 118, F11a: the round's start — a stinger and the announcer's "go")
        this.sound?.sting("start");
        this.sound?.call("go", CALLS.live);
      } else if (e.e === "planted") {
        if (e.by === me) this.tut.tick("plant");
        this.say(`THE CHARGE IS PLANTED · ${e.site}`, 2.2);
        // (the Raiders hear their objective done, the Wardens to hurry)
        if (this.mine()) this.sound?.call(this.mine()?.team === "r" ? "objective_achieved" : "hurry_up", CALLS.planted);
        else this.sound?.say(CALLS.planted);
      } else if (e.e === "defused") {
        if (e.by === me) this.tut.tick("defuse");
        this.say("THE CHARGE IS DEFUSED", 2.4);
        if (this.mine())
          this.sound?.call(this.mine()?.team === "w" ? "mission_completed" : "mission_failed", CALLS.defused);
        else this.sound?.say(CALLS.defused);
      } else if (e.e === "exploded") {
        this.say("THE CHARGE WENT OFF", 2.4);
        if (a) this.sound?.blast(Number(a.cx) + STRIKE_PARK.x, Number(a.cz) + STRIKE_PARK.z, true);
      } else if (e.e === "win") {
        this.hl.end();
        // (plan 118 phase 0: the round-end card, coded since 115 and never shown — who won and how, the MVP, my round)
        const k = this.roundKills;
        this.card = {
          team: e.team,
          why: WIN_WHY[e.why] ?? "",
          mvp: e.mvp ? esc(name(e.mvp)) : "",
          mine: k
            ? `You: ${k} kill${k > 1 ? "s" : ""}${this.roundHeads ? ` · ${this.roundHeads} headshot${this.roundHeads > 1 ? "s" : ""}` : ""}`
            : "",
          until: performance.now() + 5500,
        };
        // (mine won or lost: a stinger and "you win" or "you lose"; watching, the browser's voice names the side)
        const myTeam = this.mine()?.team;
        if (myTeam) {
          this.sound?.sting(myTeam === e.team ? "won" : "lost");
          setTimeout(() => this.sound?.call(myTeam === e.team ? "you_win" : "you_lose"), 700);
        } else this.sound?.say(e.team === "r" ? CALLS.winR : CALLS.winW);
      } else if (e.e === "timeout") {
        const sw = !!this.arena()?.swapped;
        const t: "r" | "w" = (e.squad === 0) !== sw ? "r" : "w";
        this.say(`TIMEOUT · THE ${TEAMS[t].name.toUpperCase()}`, 3);
      } else if (e.e === "vote" && e.state !== "called") {
        const what = e.kind === "timeout" ? "The timeout" : e.kind === "surrender" ? "The surrender" : "The kick";
        this.host.toast(
          `${what} vote ${e.state}${e.state === "passed" && e.kind === "timeout" && this.arena()?.phase !== "freeze" ? ": at the next freeze" : ""}`,
        );
      } else if (e.e === "kicked") {
        this.host.toast(`${String(this.arena()?.members.get(e.id)?.name ?? "A bot")} is out: its place stays empty`);
      } else if (e.e === "half") {
        this.say("HALF TIME · SIDES SWAP", 3);
        this.sound?.say(CALLS.half);
      } else if (e.e === "overtime") {
        this.say("OVERTIME", 3);
        this.sound?.say(CALLS.overtime);
      } else if (e.e === "rescued") {
        this.say("A HOSTAGE IS OUT", 2.4);
        this.sound?.say(CALLS.rescued);
      } else if (e.e === "money") {
        // (my money's moves, under it: the round's win or loss bonus, a kill's reward, a plant's — plan 118 phase 0)
        if (e.id === me && e.amount && e.why !== "buy" && e.why !== "refund")
          this.ticks.push({
            n: e.amount,
            why: esc(e.why.replace(/kill with the (\w+)/, (_, g: string) => `a kill (${gunName(g)})`)),
            until: performance.now() + 4000,
          });
        if (this.ticks.length > 4) this.ticks.shift();
      } else if (e.e === "level") this.say(`UP: ${gunName(String(e.level))}`, 1.2);
      else if (e.e === "over") {
        this.say("MATCH OVER", 5);
        const t = this.mine()?.team;
        const sw = !!this.arena()?.swapped;
        const won: "r" | "w" | "" = e.squad < 0 ? "" : (e.squad === 0) !== sw ? "r" : "w";
        if (t) this.sound?.sting(won && t !== won ? "defeat" : "victory");
        this.sound?.call(t && !won ? "its_a_tie" : "game_over", CALLS.over);
      }
    }
  }
  /** (plan 118, phase 17) the vote open and my side's timeouts, for the menus and the HUD. */
  private callView(a: Arena): { timeouts: number; call: StrikeView["call"] } {
    const me = this.mine();
    const sw = !!a.swapped;
    const tos = String(a.timeouts ?? "")
      .split(",")
      .filter(Boolean)
      .map(Number);
    // (squad 0 the Raiders till the sides swap)
    const squadOf = (t: string) => ((t === "r") !== sw ? 0 : 1);
    const timeouts = me && tos.length === 2 ? tos[squadOf(String(me.team))] : -1;
    let call: StrikeView["call"] = null;
    try {
      const c = a.call ? JSON.parse(String(a.call)) : null;
      if (c) {
        const team: "r" | "w" = (c.squad === 0) !== sw ? "r" : "w";
        const nameOf = (id: string) => String(a.members.get(id)?.name ?? "someone");
        const mine = c.yes.includes(this.myId()) ? "yes" : c.no.includes(this.myId()) ? "no" : "";
        call = {
          kind: c.kind,
          team,
          by: nameOf(c.by),
          target: c.target ? nameOf(c.target) : "",
          yes: c.yes.length,
          no: c.no.length,
          need: c.need,
          left: c.left,
          mine,
        };
      }
    } catch {
      call = null;
    }
    return { timeouts, call };
  }
  /** The vote open, on the HUD: what, who called it, the count; F1 yes, F2 no for my side. */
  private callHtml(a: Arena): string {
    const c = this.callView(a).call;
    if (!c) return "";
    const what =
      c.kind === "timeout" ? "a timeout" : c.kind === "surrender" ? "to surrender" : `to kick ${esc(c.target)}`;
    const mySide = this.mine()?.team === c.team;
    return `<div style="position:absolute;top:96px;left:50%;transform:translateX(-50%);${PANEL};padding:8px 16px;text-align:center;min-width:320px">
  <div style="${LABEL};color:${teamCol(c.team)}">${TEAMS[c.team].name} vote · ${c.left}s</div>
  <div style="font-size:15px;margin:3px 0">${esc(c.by)} calls ${what}</div>
  <div style="font-size:13px;color:${LOOK.mute}">${mySide ? `${c.mine ? `you said ${c.mine} · ` : `<b style="${KEY}">F1</b> yes · <b style="${KEY}">F2</b> no · `}` : ""}<span style="${NUM};color:${LOOK.good}">${c.yes}</span> yes of <span style="${NUM}">${c.need}</span> needed · <span style="${NUM};color:${LOOK.bad}">${c.no}</span> no</div>
</div>`;
  }
  private say(text: string, secs: number) {
    this.banner = { text, until: performance.now() + secs * 1000 };
  }
  /** The holes and the blood gone (a round; the map swapped — or they hung in the air where the old map's walls were;
   *  the double check 2). */
  private clearMarks() {
    if (!this.marks) return;
    this.marks.holes.count = this.marks.blood.count = 0;
    this.marks.nh = this.marks.nb = 0;
  }
  private show(m: ServerMessages["strike:show"]) {
    this.clearMarks();
    if (m.to)
      this.host.toast(`The crew's taking ${strikeMap(m.from ?? "").name} down: ${strikeMap(m.to).name} is going up`);
    if (m.done) this.host.toast(`${strikeMap(m.done).name} is up`);
  }
  private botShot(m: ServerMessages["strike:shot"]) {
    // (its tracer and sound are the world's guns': the arms view hears "arms:shot" from people; a bot's shot
    // reaches here — the flash on me when it's my hit)
    if (m.victim === this.myId()) this.flash = Math.max(this.flash, 0.12);
    // (plan 118, F9a: a hole where it stopped, or blood behind the one it struck)
    const c = Math.cos(m.pitch);
    const d: [number, number, number] = [Math.cos(m.yaw) * c, Math.sin(m.pitch), Math.sin(m.yaw) * c];
    if (!m.victim) {
      this.holeAlong(m.o, d, isGun(m.gun) ? ARMS[m.gun].range : 60);
      return;
    }
    const a = this.arena();
    const v = a?.members.get(m.victim) as Arena | undefined;
    let vx = Number(v?.x ?? 0);
    let vz = Number(v?.z ?? 0);
    if (v && !v.bot) {
      const p = this.host.room()?.state.players.get(m.victim);
      if (p) [vx, vz] = toLocal(p.x, p.y);
    }
    const t = (vx - m.o[0]) * d[0] + (vz - m.o[2]) * d[2];
    if (t > 0) this.bloodAt([m.o[0] + d[0] * t, m.o[1] + d[1] * t, m.o[2] + d[2] * t], d, m.head);
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
    g.fillStyle = LOOK.panelSolid;
    g.fillRect(0, 0, 512, 312);
    const map = strikeMap(this.mapKey || String(a.map ?? "sawmill"));
    const mode = MODES[String(a.mode) as ModeId]?.name ?? "";
    const me = this.mine();
    g.font = canvasFont(30, true);
    g.fillStyle = LOOK.ink;
    g.fillText(map.name.toUpperCase(), 18, 40);
    g.font = canvasFont(18, false, 600);
    g.fillStyle = "#b8b1a2";
    g.fillText(`${mode} · ${a.phase === "idle" ? "no match on — join to start one" : String(a.phase)}`, 18, 66);
    const ms = [...(a.members as Map<string, Arena>).entries()];
    for (const [i, t] of (["r", "w"] as const).entries()) {
      const x = 18 + i * 248;
      const list = ms.filter(([, m]) => m.team === t);
      const people = list.filter(([, m]) => !m.bot);
      g.fillStyle = t === "r" ? AMBER : STEEL;
      g.fillRect(x, 82, 228, 34);
      g.fillStyle = t === "r" ? "#1b1d1a" : "#081521";
      g.font = canvasFont(22, true);
      g.fillText(
        `${TEAMS[t].name.toUpperCase()}  ${people.length}${list.length > people.length ? ` +${list.length - people.length} bots` : ""}`,
        x + 10,
        107,
      );
      g.font = canvasFont(17, false, 600);
      people.slice(0, 5).forEach(([id, m], k) => {
        g.fillStyle = id === this.myId() ? "#f6c467" : "#e9dcc0";
        g.fillText(`${id === this.myId() ? "▶ " : ""}${String(m.name).slice(0, 18)}`, x + 8, 142 + k * 24);
      });
    }
    // the bottom line: mine
    g.fillStyle = me ? "#2f5d3a" : "#2a2e31";
    g.fillRect(0, 262, 512, 50);
    g.font = canvasFont(24, true);
    g.fillStyle = LOOK.ink;
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
    g.fillStyle = LOOK.panelSolid;
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
    g.font = canvasFont(22, true);
    g.fillStyle = LOOK.ink;
    g.fillText(map.name.toUpperCase(), 364, 48);
    g.font = canvasFont(16, false, 600);
    g.fillStyle = "#b8b1a2";
    g.fillText(a.phase === "idle" ? "No match on" : `Round ${a.round} · ${a.phase}`, 364, 74);
    g.font = canvasFont(72, true);
    g.fillStyle = AMBER;
    g.fillText(String(ra ?? 0), 364, 170);
    g.fillStyle = STEEL;
    g.fillText(String(wa ?? 0), 520, 170);
    g.font = canvasFont(14, true);
    g.fillStyle = AMBER;
    g.fillText("RAIDERS", 364, 192);
    g.fillStyle = STEEL;
    g.fillText("WARDENS", 520, 192);
    g.font = canvasFont(34, true);
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
    // (plan 119, F3a: the charge's own model — the view's — over the drawn stand-in once it's in; its light the model's
    // own, a copy of its material to blink)
    if (!this.chargeGlb) {
      const o = this.host.tp()?.lifeGear("charge") ?? null;
      if (o) {
        const led = o.getObjectByName("led") as Mesh | undefined;
        if (led) led.material = (led.material as MeshStandardMaterial).clone();
        this.chargeGlb = { g: o, led: (led?.material as MeshStandardMaterial | undefined) ?? null };
        for (const c of [...this.chargeV.g.children]) c.visible = false;
        this.chargeV.g.add(o);
      }
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
    this.chargeGlb?.led?.emissive.setHex(lit ? 0xff2010 : 0x200400);
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
        // (plan 118: the grenade as itself — a body in its kind's colour, the cap and the spoon dark; the molotov a
        // bottle — not a dark ball)
        const kind = String(n.kind);
        const body = new Group();
        body.name = "body";
        const col =
          kind === "he"
            ? 0x4f5a2e
            : kind === "flash"
              ? 0x9aa0a6
              : kind === "smoke"
                ? 0x6f7c74
                : kind === "molotov"
                  ? 0x5e7a3a
                  : kind === "incendiary"
                    ? 0x8a3a24
                    : 0x5c5f63;
        const shell = new Mesh(
          kind === "molotov"
            ? new CylinderGeometry(0.035, 0.045, 0.2, 10)
            : kind === "he"
              ? new SphereGeometry(0.045, 10, 8)
              : new CylinderGeometry(0.032, 0.032, 0.11, 10),
          new MeshLambertMaterial({ color: col }),
        );
        const cap = new Mesh(
          new CylinderGeometry(0.018, 0.018, 0.035, 8),
          new MeshLambertMaterial({ color: kind === "molotov" ? 0xd8c8a0 : 0x2c3236 }),
        );
        cap.position.y = kind === "molotov" ? 0.115 : 0.07;
        body.add(shell, cap);
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
        // (plan 118, F9a: blown open by an HE — thinner as it fills back in; a round through it leaves a hole a moment)
        const r = smokeRadius(Number(n.left)) * (1 - 0.85 * Number(n.thin ?? 0));
        v.puffs.forEach((sp, i) => {
          const u = sp.userData as { dx: number; dy: number; dz: number; s: number; cut?: number };
          sp.position.set(u.dx * r, Math.max(0.3, (u.dy * 0.6 + 0.6) * r), u.dz * r);
          sp.scale.setScalar(u.s * r * 1.25);
          if (u.cut) u.cut = Math.max(0, u.cut - dt);
          (sp.material as SpriteMaterial).opacity =
            Math.min(0.95, Number(n.left) / 2) * 0.9 * (u.cut ? 1 - Math.min(1, u.cut / 0.6) * 0.85 : 1);
          sp.material.rotation += dt * 0.05 * (i % 2 ? 1 : -1);
        });
      } else if (n.state === "fire") {
        if (!v.puffs.length) v.puffs = this.puffs(v.g, 18, 0xff8a2a, 1, true);
        // (plan 118, F9a: the fire runs on the way the bottle was going — its flames along that line)
        const fx = Number(n.fx ?? 0);
        const fz = Number(n.fz ?? 0);
        v.puffs.forEach((sp, i) => {
          const u = sp.userData as { dx: number; dy: number; dz: number; s: number };
          const f = 0.7 + 0.3 * Math.sin(now / 90 + i * 1.7);
          const run = ((i * 7) % 18) / 17;
          sp.position.set(u.dx * 2.6 + fx * run * 2.5, 0.35 + Math.abs(u.dy) * 0.6 * f, u.dz * 2.6 + fz * run * 2.5);
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
    else if (m.kind === "swing") {
      // (plan 119: whose — drawn on them, mine already as I clicked — which attack, and what it struck)
      // (a bot's body is its NPC's: npc:strike-bot:<id>)
      const bot = !!m.by && !!this.arena()?.members?.get(m.by)?.bot;
      if (m.by && m.by !== this.myId())
        strikeKeys.swings.set(bot ? `npc:strike-bot:${m.by}` : m.by, {
          at: performance.now(),
          heavy: !!m.heavy,
          n: m.n ?? 1,
        });
      this.sound?.swing(wx, wz, !!m.heavy);
      if (m.struck === "body") this.sound?.slice(wx, wz, !!m.heavy);
      else if (m.struck === "wall") {
        this.sound?.scrape(wx, wz);
        if (typeof m.yaw === "number") this.knifeMark(m.x, m.y, m.z, m.yaw, !!m.heavy);
      }
    } else if (m.kind === "molotov" || m.kind === "incendiary") this.sound?.ignite(wx, wz);
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
    if (!this.mouseOn) {
      this.mouseOn = true;
      window.addEventListener("mousedown", this.onMouse, true);
      window.addEventListener("mousedown", this.onNadeMouse, true);
      window.addEventListener("mouseup", this.onNadeMouse, true);
      window.addEventListener("pointerdown", this.onNadePointer, true);
      window.addEventListener("mousedown", this.onGearMouse, true);
      window.addEventListener("mouseup", this.onGearMouse, true);
      document.addEventListener("pointerlockerror", this.onLockErr);
      document.addEventListener("pointerlockchange", this.onLockOn);
    }
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
    return this.stillCam ?? this.replayCam ?? this.briefCam ?? this.camNow;
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
    this.setHtml(this.followEl, html);
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
    const me = this.host.me();
    if (!inStrikeCompound(me.x, me.y)) return null;
    // (plan 118, F10a: the briefing or a drill on — E is theirs, nothing else's prompt over them)
    if (this.brief) return { objectId: "strike-brief", kind: "strike:stop", label: "Stop the briefing" };
    if (this.drill?.kind === "plant")
      return {
        objectId: "strike-pad",
        kind: "strike:hold",
        label: this.drill.stage === "plant" ? "Hold the left button: plant" : "Hold: defuse",
      };
    if (this.drill) return { objectId: "strike-range", kind: "strike:stop", label: "Stop the drill" };
    // (plan 118, F10a: inside a lobby building I'm on its own floor — its ground storey, by my height, counts)
    if (this.host.level() !== 0) {
      if (this.playing() || this.drill || this.brief) return null;
      const h = Number(this.host.room()?.state.players.get(this.myId())?.z ?? -99);
      if (Math.abs(h - groundAt(me.x, me.y)) > 1.6) return null;
      for (const [k, sp] of Object.entries(STRIKE_SPOTS))
        if (Math.hypot(me.x - sp.x, me.y - sp.z) < sp.r)
          return { objectId: `strike-${k}`, kind: `strike:${k}`, label: sp.label };
      return null;
    }
    if (Math.hypot(me.x - STRIKE_DESK.x, me.y - STRIKE_DESK.z) < 3)
      return { objectId: "strike-desk", kind: "strike:lobby", label: this.playing() ? "The match" : "Join the match" };
    if (Math.hypot(me.x - STRIKE_BOARD.x, me.y - STRIKE_BOARD.z) < 3.5)
      return { objectId: "strike-board", kind: "strike:board", label: "Choose the map" };
    if (Math.hypot(me.x - STRIKE_KIT.stand.x, me.y - STRIKE_KIT.stand.z) < 2.4)
      return { objectId: "strike-kit", kind: "strike:kit", label: "Your kit" };
    // (plan 118, F10a) the buildings' jobs, the range's drills — out of a match
    if (!this.playing() && !this.drill && !this.brief)
      for (const [k, sp] of Object.entries(STRIKE_SPOTS))
        if (Math.hypot(me.x - sp.x, me.y - sp.z) < sp.r)
          return { objectId: `strike-${k}`, kind: `strike:${k}`, label: sp.label };
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
    if (kind === "strike:stop") {
      this.stopBrief();
      this.stopDrill();
      return true;
    }
    if (kind === "strike:hold") return true;
    if (kind.startsWith("strike:") && kind.slice(7) in STRIKE_SPOTS) {
      this.spotUse(kind.slice(7) as StrikeSpot);
      return true;
    }
    return false;
  }

  // ── (plan 118, F10a) the lobby: each building's job, the range's drills ──
  private spotUse(k: StrikeSpot) {
    const a = this.arena();
    if (k === "armory") this.openPanel("strike-kit");
    else if (k === "trophies") this.openPanel("strike", "strike:record");
    else if (k === "war") {
      const on = a && a.phase !== "idle" && a.phase !== "over" && a.members.size > 0;
      if (on) this.following = true;
      else this.host.toast("No match on: the screen shows the next one when it starts");
    } else if (k === "briefing") {
      if (!this.mapUp || !this.mapKey) return this.host.toast("The crew's putting the map up: in a moment");
      const el = document.createElement("div");
      el.style.cssText = `position:fixed;left:50%;bottom:15%;transform:translateX(-50%);z-index:40;${PANEL};padding:12px 22px;max-width:640px;pointer-events:none`;
      document.body.appendChild(el);
      this.brief = { t0: performance.now(), stops: briefStops(strikeMap(this.mapKey)), el, key: "" };
    } else if (k === "range") {
      this.drill = { kind: "aim", t0: performance.now(), lit: -1, litAt: 0, hits: 0, wrong: 0, times: [] };
      this.nextLit();
      this.sound?.beep(0);
    } else if (k === "pad") {
      this.drill = { kind: "plant", t0: performance.now(), stage: "plant", held: 0, done: 0, plantAt: 0 };
    }
  }
  private stopBrief() {
    this.brief?.el.remove();
    this.brief = null;
    this.briefCam = null;
  }
  private stopDrill(why = "") {
    this.drill = null;
    this.drillEl?.remove();
    this.drillEl = null;
    if (this.litRing) this.litRing.visible = false;
    if (why) this.host.toast(why);
  }
  /** The aim drill: the next target lit (never the same twice running). */
  private nextLit() {
    const d = this.drill;
    if (d?.kind !== "aim") return;
    let n = Math.floor(Math.random() * STRIKE_TARGETS.length);
    if (n === d.lit) n = (n + 1 + Math.floor(Math.random() * (STRIKE_TARGETS.length - 1))) % STRIKE_TARGETS.length;
    d.lit = n;
    d.litAt = performance.now();
    if (!this.litRing) {
      this.litRing = new Mesh(
        new RingGeometry(0.5, 0.62, 40),
        new MeshBasicMaterial({ color: LOOK.r, side: DoubleSide, transparent: true, opacity: 0.95, toneMapped: false }),
      );
      this.root.add(this.litRing);
    }
    const t = STRIKE_TARGETS[n];
    this.litRing.position.set(t.x, groundAt(t.x, t.z) + t.y, t.z - 0.02);
    this.litRing.rotation.y = Math.PI;
    this.litRing.visible = true;
  }
  /** A range hit (the server's): in the aim drill, the lit one scores and the next lights. */
  private drillHit(i: number) {
    const d = this.drill;
    if (d?.kind !== "aim") return false;
    if (i === d.lit) {
      d.hits++;
      d.times.push(performance.now() - d.litAt);
      this.sound?.hitBody();
      this.nextLit();
    } else d.wrong++;
    return true;
  }
  /** Bests kept on this machine (each drill's). */
  private drillBest(
    kind: string,
    score: number,
    more: (a: number, b: number) => boolean,
  ): { best: number; new: boolean } {
    let all: Record<string, number> = {};
    try {
      all = JSON.parse(localStorage.getItem("yutopia:strike-drills") ?? "{}");
    } catch {
      all = {};
    }
    const old = all[kind];
    const isNew = old === undefined || more(score, old);
    if (isNew) {
      all[kind] = score;
      try {
        localStorage.setItem("yutopia:strike-drills", JSON.stringify(all));
      } catch {
        /* private window */
      }
    }
    return { best: isNew ? score : old, new: isNew };
  }
  /** Each frame: the briefing's camera and captions, the drills' clocks and boards. */
  private lobbyFrame(a: Arena) {
    const now = performance.now();
    // the practice pad, painted in the yard
    if (!this.padMesh) {
      const c = document.createElement("canvas");
      c.width = c.height = 256;
      const g = c.getContext("2d") as CanvasRenderingContext2D;
      g.strokeStyle = "rgba(232,163,58,.9)";
      g.lineWidth = 10;
      g.strokeRect(12, 12, 232, 232);
      g.fillStyle = "rgba(232,163,58,.85)";
      g.font = canvasFont(120, true);
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("A", 128, 116);
      g.font = canvasFont(26, true);
      g.fillText("PRACTICE", 128, 206);
      const tex = new CanvasTexture(c);
      tex.colorSpace = SRGBColorSpace;
      const sp = STRIKE_SPOTS.pad;
      this.padMesh = new Mesh(
        new PlaneGeometry(3.4, 3.4).rotateX(-Math.PI / 2),
        new MeshBasicMaterial({
          map: tex,
          transparent: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -4,
        }),
      );
      this.padMesh.position.set(sp.x, groundAt(sp.x, sp.z) + 0.05, sp.z);
      this.root.add(this.padMesh);
    }
    // the briefing: each stop BRIEF_SECS, eased from the last; the caption the stop's
    const b = this.brief;
    if (b) {
      if (!this.mapUp || this.playing()) this.stopBrief();
      else {
        const t = (now - b.t0) / 1000;
        const i = Math.floor(t / BRIEF_SECS);
        if (i >= b.stops.length) this.stopBrief();
        else {
          const f = t / BRIEF_SECS - i;
          const ease = Math.min(1, f / 0.35);
          const k = ease * ease * (3 - 2 * ease);
          const pose = (st: BriefStop, n: number, u: number) => {
            const ang = n * 1.3 + u * 0.35 + 0.6;
            return {
              eye: [
                st.at[0] + STRIKE_PARK.x + Math.cos(ang) * st.far,
                st.at[1] + STRIKE_PARK.z + Math.sin(ang) * st.far,
                STRIKE_PARK.h + st.far * 0.95 + 8,
              ],
              look: [st.at[0] + STRIKE_PARK.x, st.at[1] + STRIKE_PARK.z, STRIKE_PARK.h + 0.5],
            };
          };
          const cur = pose(b.stops[i], i, f);
          const prev = i ? pose(b.stops[i - 1], i - 1, 1) : cur;
          const mix = (p: number[], q: number[]) => p.map((v, j) => v + (q[j] - v) * k) as [number, number, number];
          this.briefCam = { eye: mix(prev.eye, cur.eye), look: mix(prev.look, cur.look), showMe: false };
          const st = b.stops[i];
          const key = `${i}`;
          if (b.key !== key) {
            b.key = key;
            b.el.innerHTML = `<div style="${LABEL};color:${LOOK.r}">Briefing · ${i + 1} of ${b.stops.length}</div><div style="${HEAD};font-size:24px;margin:2px 0 4px">${esc(st.name)}</div><div style="font-size:15px;line-height:1.35">${esc(st.say)}</div><div style="margin-top:6px;font-size:12px;color:${LOOK.mute}"><b style="${KEY}">Esc</b> stops</div>`;
          }
        }
      }
    }
    // the drills
    const d = this.drill;
    if (!d) return;
    const me = this.host.me();
    if (this.playing()) return this.stopDrill();
    if (!this.drillEl) {
      this.drillEl = document.createElement("div");
      this.drillEl.style.cssText = `position:fixed;left:50%;top:14%;transform:translateX(-50%);z-index:40;${PANEL};padding:10px 20px;min-width:300px;text-align:center;pointer-events:none`;
      document.body.appendChild(this.drillEl);
    }
    let html = "";
    if (d.kind === "aim") {
      const sp = STRIKE_SPOTS.range;
      const left = 30 - (now - d.t0) / 1000;
      if (Math.hypot(me.x - sp.x, me.y - sp.z) > 9) return this.stopDrill("Aim drill stopped: you left the line");
      if (left <= 0) {
        const mean = d.times.length ? d.times.reduce((x, y) => x + y, 0) / d.times.length : 0;
        const best = this.drillBest("aim", d.hits, (x, y) => x > y);
        this.stopDrill(
          `Aim drill: ${d.hits} hits, ${d.wrong} wrong · ${mean ? `${(mean / 1000).toFixed(2)} s a target` : "no hits"} · ${best.new ? "a new best!" : `best ${best.best}`}`,
        );
        this.sound?.beep(1);
        return;
      }
      html = `<div style="${LABEL};color:${LOOK.r}">Aim drill</div><div style="${HEAD};${NUM};font-size:40px;line-height:1.05">${d.hits}</div><div style="font-size:13px;color:${LOOK.mute}">hit the lit target · <span style="${NUM};color:${LOOK.ink}">${Math.ceil(left)}</span> s · ${d.wrong} wrong</div>`;
    } else {
      const sp = STRIKE_SPOTS.pad;
      if (Math.hypot(me.x - sp.x, me.y - sp.z) > 2.6)
        return this.stopDrill("Plant drill stopped: you stepped off the pad");
      const need = (d.stage === "plant" ? ROUND.plant : ROUND.defuseKit) * 1000;
      const prog = d.held ? Math.min(1, (d.done + now - d.held) / need) : d.done / need;
      if (prog >= 1) {
        if (d.stage === "plant") {
          d.stage = "defuse";
          d.plantAt = now;
          d.held = 0;
          d.done = 0;
          this.sound?.pin();
        } else {
          const total = (now - d.t0) / 1000;
          const best = this.drillBest("plant", total, (x, y) => x < y);
          this.sound?.beep(1);
          return this.stopDrill(
            `Planted in ${((d.plantAt - d.t0) / 1000).toFixed(1)} s, defused in ${((now - d.plantAt) / 1000).toFixed(1)} s · ${best.new ? "a new best!" : `best ${best.best.toFixed(1)} s`}`,
          );
        }
      }
      html = `<div style="${LABEL};color:${LOOK.r}">${d.stage === "plant" ? "Plant the charge" : "Defuse it (a kit's 5 s)"}</div><div style="height:8px;margin:8px 0;background:${LOOK.line}"><div style="height:100%;width:${(prog * 100).toFixed(1)}%;background:${LOOK.r}"></div></div><div style="font-size:13px;color:${LOOK.mute}">hold <b style="${KEY}">E</b> — let go and it starts again · ${((now - d.t0) / 1000).toFixed(1)} s</div>`;
    }
    this.setHtml(this.drillEl, html);
    void a;
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
    // (plan 118, F10a) the briefing and the drills: Esc stops them; E held on the pad plants, then defuses
    if ((this.brief || this.drill) && e.code === "Escape") {
      if (down) {
        this.stopBrief();
        this.stopDrill();
      }
      return true;
    }
    // (plan 119, F4a: the pad's plant is the left button held, as a match's; E only its defuse)
    if (this.drill?.kind === "plant" && e.code === "KeyE" && this.drill.stage !== "plant") return true;
    if (this.drill?.kind === "plant" && e.code === "KeyE") {
      const d = this.drill;
      if (down && !e.repeat && !d.held) d.held = performance.now();
      if (!down) {
        // (let go before it's done: it starts again, as a real plant)
        d.held = 0;
        d.done = 0;
      }
      return true;
    }
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
        this.throwNade(e.shiftKey);
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
      // (plan 118, F8a: by a gun on the floor, E takes it — what was in its slot left there)
      if (!e.repeat && this.floorNear()) {
        room.send("strike:pickup", {});
        return true;
      }
      return false;
    }
    if ((e.code === "KeyN" || e.code === "Digit4") && !e.repeat) {
      const ns = String(this.mine()?.nades || "")
        .split(",")
        .filter(Boolean);
      // (plan 118: a grenade in hand — the clicks throw it, left long, right short; again: the next one)
      if (ns.length) {
        if (strikeKeys.nadeReady) this.nadeSel = (this.nadeSel + 1) % ns.length;
        strikeKeys.nadeReady = true;
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
    // (plan 118, phase 17) a vote of my side's open: F1 yes, F2 no
    if ((e.code === "F1" || e.code === "F2") && !e.repeat && this.arena()?.call) {
      e.preventDefault();
      room.send("strike:ballot", { yes: e.code === "F1" });
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
    // (plan 118, F10a) the warmup's map vote: V opens it, 1–3 votes (and closes it)
    if (
      e.code === "KeyV" &&
      !e.repeat &&
      this.arena()?.phase === "warmup" &&
      String(this.arena()?.vote ?? "").includes(",")
    ) {
      this.voteOpen = !this.voteOpen;
      return true;
    }
    if (this.voteOpen && /^Digit[1-3]$/.test(e.code)) {
      const key = String(this.arena()?.vote ?? "").split(",")[Number(e.code.slice(5)) - 1];
      if (key) room.send("strike:vote", { key });
      this.voteOpen = false;
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
    // (plan 118, F8a: G lets go of the gun in hand — or the charge once 5's chosen it, CS's)
    // (plan 119) 5: the charge drawn into both hands (CS's slot 5) — the server puts the gun away; again: the gun back
    if (e.code === "Digit5" && !e.repeat && this.mine()?.bomb && this.mine()?.alive) {
      strikeKeys.nadeReady = false;
      if (strikeKeys.chargeSel) {
        room.send("strike:charge", { on: false });
        this.drawAt = 0;
      } else room.send("strike:charge", { on: true });
      return true;
    }
    if (e.code === "KeyG" && !e.repeat && this.mine()?.alive) {
      room.send("strike:drop", strikeKeys.chargeSel && this.mine()?.bomb ? { charge: true } : {});
      return true;
    }

    return false;
  }
  /** (plan 119) Whether I stand on a bomb site (the charge's to plant). */
  private onSite(): boolean {
    const a = this.arena();
    if (!a) return false;
    const p = this.host.me();
    const [x, z] = toLocal(p.x, p.y);
    const map = strikeMap(String(a.map));
    return !!map.sites && (inRect(map.sites.A, x, z) || (!!map.sites.B && inRect(map.sites.B, x, z)));
  }
  /** Whether held Use is the match's where I stand: the planted charge, a hostage (plan 119: not the plant). */
  private canUseHere(): boolean {
    const me = this.mine();
    const a = this.arena();
    if (!me?.alive || !a) return false;
    const p = this.host.me();
    const [x, z] = toLocal(p.x, p.y);
    // (plan 119, F4a: E never plants — the charge drawn, the left button held does; E defuses, takes a hostage)
    const byCharge = a.charge === "planted" && me.team === "w" && Math.hypot(Number(a.cx) - x, Number(a.cz) - z) < 1.6;
    const byHostage =
      me.team === "w" &&
      [...(a.hostages ?? [])].some((h: Arena) => !h.by && !h.rescued && Math.hypot(h.x - x, h.z - z) < 2);
    return byCharge || byHostage;
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
  private openPanel(kind: "strike" | "strike-buy" | "strike-esc" | "strike-board" | "strike-kit", on: string = kind) {
    if (kind === "strike") this.host.room()?.send("strike:card", {});
    hud.set({ panel: { kind, objectId: on } });
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
        damage: Number(m.damage ?? 0),
        heads: Number(m.heads ?? 0),
        ping: Number(m.ping ?? 0),
        want: String(m.want ?? ""),
        refunds: String(m.refunds ?? "")
          .split(",")
          .filter(Boolean),
      });
    const me = members.find((m) => m.me) ?? null;
    const sw = !!a.swapped;
    const p = this.host.me();
    const [x, z] = toLocal(p.x, p.y);
    const map = strikeMap(String(a.map));
    const buyTime =
      a.phase === "warmup" ||
      a.phase === "freeze" ||
      (a.phase === "live" && ROUND.round - Number(a.left) <= ROUND.buy) ||
      a.mode === "deathmatch";
    const canBuy = !!me?.alive && buyTime && inRect(map.buy[me.team], x, z);
    const buyLeft =
      a.phase === "freeze"
        ? Math.ceil(Number(a.left)) + ROUND.buy
        : a.phase === "live"
          ? Math.max(0, Math.ceil(ROUND.buy - (ROUND.round - Number(a.left))))
          : 0;
    // (the least I'll have next round: what I have now and a loss's bonus at my side's streak)
    const streak = Number((me?.team === "w" ? a.streakW : a.streakR) ?? 0);
    const nextLeast = me ? Math.min(MONEY.max, me.money + lossBonus(streak + 1)) : 0;
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
      quota: Number(a.quota ?? 0),
      level: String(a.level),
      members,
      me,
      canBuy,
      record: String(a.record ?? ""),
      last: String(a.last ?? ""),
      card: this.myCard,
      following: this.following,
      buyLeft,
      nextLeast,
      ...this.callView(a),
      history: String(a.history ?? "")
        .split(",")
        .filter(Boolean)
        .map((h) => {
          const [t, why] = h.split(":");
          return { team: t === "w" ? ("w" as const) : ("r" as const), why: why ?? "" };
        }),
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

  /** (plan 118) out of the round: a left click watches the next of my side, a right click the one before. */
  private readonly onMouse = (e: MouseEvent) => {
    const a = this.arena();
    const me = this.mine();
    if (!a || !me || me.alive || a.phase === "warmup" || a.phase === "idle" || a.phase === "over") return;
    if (hud.get().panel.kind) return;
    if (this.death?.at && performance.now() < this.death.until) return;
    if (e.button !== 0 && e.button !== 2) return;
    const mates = [...(a.members as Map<string, Arena>).entries()]
      .filter(([, m]) => m.alive && m.team === me.team)
      .map(([id]) => id)
      .sort();
    if (!mates.length) return;
    const i = mates.indexOf(this.watch);
    this.watch = mates[(i + (e.button === 0 ? 1 : -1) + mates.length) % mates.length];
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  private mouseOn = false;
  dispose() {
    if (this.mouseOn) {
      window.removeEventListener("mousedown", this.onMouse, true);
      window.removeEventListener("mousedown", this.onNadeMouse, true);
      window.removeEventListener("mouseup", this.onNadeMouse, true);
      window.removeEventListener("pointerdown", this.onNadePointer, true);
      window.removeEventListener("mousedown", this.onGearMouse, true);
      window.removeEventListener("mouseup", this.onGearMouse, true);
      document.removeEventListener("pointerlockerror", this.onLockErr);
      document.removeEventListener("pointerlockchange", this.onLockOn);
    }
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
    // (plan 118's hooks: nothing of a gone park left answering for it)
    strikeKeys.footing = strikeKeys.muffle = null;
    strikeKeys.onShot = null;
    strikeKeys.predictHit = null;
    strikeKeys.nadeReady = strikeKeys.chargeSel = false;
    strikeKeys.dead = false;
    strikeKeys.digits = false;
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
/** How a round was won, in the card's words. */
const WIN_WHY: Record<string, string> = {
  elim: "Every one of them down",
  time: "The clock ran out",
  bomb: "The charge went off",
  defuse: "The charge was defused",
  rescue: "The hostages are out",
  hostages: "The hostages are out",
};
const AMBER = LOOK.r;
const STEEL = LOOK.w;
// (plan 118: the old names, now the one look's — look.ts)
const STENCIL = HEAD;
const PLATE = PANEL;
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
/** (plan 118) the park's settings as StrikePanels.tsx keeps them: the hit marker, the blood. */
function parkPrefs(): { hitmarker: boolean; blood: boolean; flash: string } {
  try {
    return {
      hitmarker: true,
      blood: true,
      flash: "white",
      ...JSON.parse(localStorage.getItem("yutopia:strike") ?? "{}"),
    };
  } catch {
    return { hitmarker: true, blood: true, flash: "white" };
  }
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
  ({ he: "HE", flash: "Flash", smoke: "Smoke", molotov: "Molotov", incendiary: "Incendiary", decoy: "Decoy" })[n] ?? n;
/** A grenade's glyph (look.ts). */
const nadeGlyph = (n: string) =>
  n === "flash" || n === "smoke" || n === "molotov" || n === "incendiary" || n === "decoy" ? n : "he";
/** A kill's weapon's glyph: a gun, the knife, a grenade, the charge. */
const gunGlyph = (g: string) => (g === "charge" ? "charge" : GLYPH[g] ? g : g === "fire" ? "molotov" : "revolver");
/** A portrait's label: "Vortex VII" → "V7", "Bia Demo" → "BD", "Ana" → "AN". */
function shortName(name: string): string {
  const w = name.trim().split(/\s+/);
  const ROMAN: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 };
  const last = w[w.length - 1] ?? "";
  if (w.length > 1 && ROMAN[last]) return `${w[0][0] ?? ""}${ROMAN[last]}`.toUpperCase();
  if (w.length > 1) return `${w[0][0] ?? ""}${w[1][0] ?? ""}`.toUpperCase();
  return (w[0] ?? "?").slice(0, 2).toUpperCase();
}
/** The callout I'm in (the map's own names), from where my body stands. */
function placeOf(map: ReturnType<typeof strikeMap>, p: { x: number; y: number } | undefined): string {
  if (!p) return "";
  const [x, z] = toLocal(p.x, p.y);
  for (const c of map.calls ?? []) if (inRect(c.r, x, z)) return c.name;
  return "";
}

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
