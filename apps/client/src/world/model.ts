import {
  type AvatarLayers,
  entry,
  type JumpNow,
  type MapDef,
  placedFootprint,
  type Ray,
  topCentre,
  WB_H,
  WB_W,
  type WbItem,
  type WorldObjectDef,
} from "@yutopia/shared";
import type { Quality } from "@/lib/prefs";
import { type Daylight, daylight, hourForNight } from "./art/daylight";
import { C } from "./art/palette";
import type { PetView } from "./petview";

// The room as the client knows it, with no drawing in it (docs/plan/50-the-volume.md, 7b): the
// things on my floor as they are this moment (a door swung open for someone passing, a seat
// taken, a radio on), who's where, what the wall displays show, the hour's light, and what build
// mode is showing. The 3D view draws from it, and answers it what's on the screen where (`view`).
// It was the iso engine's own state, before iso was retired.

export type PuffKind = "drop" | "poof" | "spark" | "confetti" | "land" | "kick";

export interface AvatarState {
  vortexMood?: string;
  name: string;
  avatar: AvatarLayers;
  x: number;
  y: number;
  d: number;
  a: number; // 0 idle, 1 walk, 2 sit
  status: string;
  speaking: boolean;
  emote: string;
  mic: boolean;
  bot?: boolean;
  npc?: boolean;
  held?: string; // what they carry (shared/held.ts)
  heldAt?: number; // when they took it (server ms)
  busy?: string; // what they're using (shared USES)
  act?: string; // with someone (shared SOCIAL, or "take"), since actAt (server ms)
  actAt?: number;
  actWith?: string;
  pet?: PetView; // a pet, not a person (world/petview.ts)
  // the phone (shared/phone.ts): what it's doing in the hand, its case, a photo
  // pose, ringing in the pocket
  phone?: string; // ("bud": on a call with it put away, an earbud in the ear)
  phoneCase?: string;
  phonePose?: string;
  ringing?: boolean;
  recording?: boolean; // its camera recording (a red light)
  torch?: boolean; // the phone's flashlight on (the Grounds at night)
  focused?: boolean; // …focused while aiming (docs/plan/30-the-dark.md D4)
  gun?: string; // the weapon in the hand (D6)
  arm?: number; // what the hand's doing with it (shared ARM: drawing, reloading, broken open)
  fellAt?: number; // knocked down by a pool ball (shared/pool-throw.ts): server ms, 0 on their feet
  fellYaw?: number; // …the way the ball was going
  angle?: number; // facing as they turned, world radians (not 8 ways): where a beam points
  jump?: JumpNow; // jumping (shared/jump.ts): its stage (the controller tracks it)
  z?: number; // feet off the floor (up on something, in a jump), tiles
  ground?: number; // the top under them (the floor: 0), tiles
  mv?: number; // the gait, crouching, aiming (shared/move packMv)
  // a vault, a mantle, a roll, a slide: how far in (`at`: since when, performance.now ms)
  verb?: { kind: string; t: number; at?: number };
  pitch?: number; // aiming: up from level (radians)
  shaded?: boolean; // one of the shadowed, wrapped in the dark (world/dark): drawn dark, no name
  fade?: number; // 0..1: how there it is (one of the shadowed coming into range, or going out of it)
}

export interface BoardContent {
  name: string;
  sections: { name: string; count: number }[];
}

export interface ClickMods {
  shift: boolean;
  right: boolean;
}
export interface ModelEvents {
  onTileClick?: (x: number, y: number, mods?: ClickMods) => void;
  onToyClick?: (id: string) => void; // a pet's toy on the floor
  onAvatarClick?: (id: string, at: { x: number; y: number }) => void; // at: client px
  onObjectClick?: (id: string, at: { x: number; y: number }) => void;
  onPointerWorld?: (x: number, y: number) => void;
  onPointerDown?: (x: number, y: number) => void;
  onPointerUp?: (x: number, y: number) => void;
  // build mode: return true to use the wheel (rotate what you hold) instead of zooming
  onWheel?: (deltaY: number) => boolean;
}

// What build mode can pick under the pointer: a placed object, or a generated
// piece of a room's clutter.
export type Pick = { id: string; dress: false } | { id: string; dress: true; kind: string };
export interface Outline {
  id: string;
  dress?: boolean;
  color: number;
  fill?: number; // alpha of the inside
}
export interface EdgeGhost {
  e: { x: number; y: number; dir: "h" | "v" };
  ok: boolean;
  remove?: boolean;
}
export interface FaceGhost {
  p: { x: number; y: number; dir: "h" | "v"; side: 1 | -1 };
  mat: string | null; // a material to preview on it
  ok: boolean;
  sel?: boolean; // selected (the inspector's)
}
export interface SpotPin {
  at: { x: number; y: number };
  pick: { x: number; y: number; ok: boolean } | null;
}

/** What the 3D view answers about the screen (set while it's up). `z`s in tiles; client px. */
export interface ModelView {
  picks(filter?: (o: WorldObjectDef) => boolean): Pick[];
  project(x: number, y: number, z: number): { x: number; y: number } | null;
  floorAt(clientX: number, clientY: number, z: number): { x: number; y: number } | null;
  rayAt(clientX: number, clientY: number): Ray;
  lookedThrough(): Set<string>;
  puff(x: number, y: number, kind: PuffKind, lift: number, hard: number): void;
}

// a height in iso px (as the build controller and the shared hang code measure) → tiles
const ZPX = 39.19;
// a wall display's picture, px per tile along the wall (shared hang.ts: the panels sit as they did)
const S = 36;
const css = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

export class WorldModel {
  map: MapDef;
  localId: string | null = null;
  /** goes up whenever a thing is set, changed or removed (the 3D view skips work while it doesn't) */
  objRev = 0;
  // when something last happened here (a person moving, a bubble): the controller drops to a
  // low frame rate while nothing does
  activeAt = 0;
  events: ModelEvents = {};
  view: ModelView | null = null;
  private objects = new Map<string, WorldObjectDef>();
  private avatars = new Map<string, AvatarState>();
  private quality: Quality = "high";
  private reducedMotion = false;

  constructor(map: MapDef) {
    this.map = map;
  }

  // The map changed (builders painted walls, added rooms, resized).
  setMap(map: MapDef) {
    this.map = map;
  }

  // ── things ───────────────────────────────────────────────────────────────
  setObjects(objects: WorldObjectDef[]) {
    this.objRev++;
    this.workCache.clear();
    this.objects.clear();
    this.panels.clear();
    for (const o of objects) this.upsertObject(o);
  }

  upsertObject(o: WorldObjectDef) {
    this.objRev++;
    this.workCache.clear();
    this.objects.set(o.id, o);
    if (o.kind === "board_wall" || o.kind === "screen_wall") this.keepDisplay(o);
    if (o.kind === "whiteboard") {
      const scene = o.props?.scene;
      this.keepWhiteboard(o, this.wbLive.get(o.id) ?? (Array.isArray(scene) ? (scene as WbItem[]) : []));
    }
  }

  removeObject(id: string) {
    this.objRev++;
    this.workCache.clear();
    this.objects.delete(id);
    this.panels.delete(id);
  }

  getObject(id: string): WorldObjectDef | undefined {
    return this.objects.get(id);
  }

  allObjects(): WorldObjectDef[] {
    return [...this.objects.values()];
  }

  // Any object covering a tile (build mode picks non-interactive things too).
  objectAtTile(x: number, y: number): WorldObjectDef | undefined {
    let best: WorldObjectDef | undefined;
    for (const o of this.objects.values()) {
      const { w, h } = placedFootprint(o);
      if (x >= o.x && x < o.x + w && y >= o.y && y < o.y + h) {
        // prefer things on the floor over rugs
        if (!best || best.kind === "rug" || best.kind === "standup_mat") best = o;
      }
    }
    return best;
  }

  // Seated at a desk with a keyboard or a screen in reach: typing.
  private workCache = new Map<string, boolean>();
  atWork(x: number, y: number): boolean {
    const k = `${Math.floor(x)},${Math.floor(y)}`;
    let w = this.workCache.get(k);
    if (w === undefined) {
      const objs = this.allObjects();
      const seat = objs.find(
        (o) => entry(o.kind).seat && o.x === Math.floor(x) && o.y === Math.floor(y) && o.props?.desk,
      );
      w =
        !!seat &&
        objs.some((o) => {
          if (
            o.kind !== "computer" &&
            (o.kind !== "tabletop" || (o.props?.d !== "keyboard" && o.props?.d !== "monitor"))
          )
            return false;
          const c = topCentre(o);
          return Math.hypot(c.x - x, c.y - y) < 1.7;
        });
      this.workCache.set(k, w);
    }
    return w;
  }

  // ── people ───────────────────────────────────────────────────────────────
  upsertAvatar(id: string, s: AvatarState) {
    const o = this.avatars.get(id);
    if (
      !o ||
      (o !== s &&
        (o.x !== s.x ||
          o.y !== s.y ||
          o.a !== s.a ||
          o.d !== s.d ||
          o.emote !== s.emote ||
          o.speaking !== s.speaking ||
          o.status !== s.status ||
          o.held !== s.held ||
          o.act !== s.act ||
          o.busy !== s.busy ||
          o.phone !== s.phone ||
          o.phonePose !== s.phonePose ||
          o.ringing !== s.ringing ||
          o.recording !== s.recording))
    )
      this.activeAt = performance.now();
    this.avatars.set(id, s);
  }
  removeAvatar(id: string) {
    this.avatars.delete(id);
  }
  clearAvatars() {
    this.avatars.clear();
  }
  hasAvatar(id: string) {
    return this.avatars.has(id);
  }
  // where someone is right now (world tiles), sitting or not, facing which way
  avatarAt(id: string): { x: number; y: number; sitting: boolean; dir: number } | null {
    const s = this.avatars.get(id);
    return s ? { x: s.x, y: s.y, sitting: s.a === 2, dir: s.d } : null;
  }

  // ── wall displays ────────────────────────────────────────────────────────
  // Board walls show a VU meter of cards per section; big screens the board or
  // a live screen share; whiteboards a miniature of their scene. The 3D view
  // puts each on its wall's face (tp/live.ts), from `ox` along it, `zTop` (iso
  // px) its top, `pw` × `ph` its size (px, S a tile).
  private boardContent = new Map<string, BoardContent>();
  private screenVideo = new Map<string, HTMLVideoElement>();
  private wbLive = new Map<string, WbItem[]>();
  private panels = new Map<
    string,
    {
      def: WorldObjectDef;
      ox: number;
      oy: number;
      zTop: number;
      pw: number;
      ph: number;
      draw: (g: CanvasRenderingContext2D) => void;
      version: number;
    }
  >();
  private panelVersion = 0;

  setBoardContent(objectId: string, content: BoardContent | null) {
    if (content) this.boardContent.set(objectId, content);
    else this.boardContent.delete(objectId);
    const o = this.objects.get(objectId);
    if (o) this.keepDisplay(o);
  }
  setScreenVideo(objectId: string, video: HTMLVideoElement | null) {
    if (video) this.screenVideo.set(objectId, video);
    else this.screenVideo.delete(objectId);
    const o = this.objects.get(objectId);
    if (o) this.keepDisplay(o);
  }
  setWhiteboard(objectId: string, items: WbItem[]) {
    this.wbLive.set(objectId, items);
    const o = this.objects.get(objectId);
    if (o) this.keepWhiteboard(o, items);
  }
  livePanels() {
    return this.panels;
  }
  // the screen share on a big screen right now (its video), if any
  shareVideo(id: string): HTMLVideoElement | null {
    return this.screenVideo.get(id) ?? null;
  }
  showsShare(id: string): boolean {
    return this.screenVideo.has(id);
  }
  /** One panel's picture, `res` canvas px a panel px (transparent round it). */
  panelCanvas(id: string, res = 4): HTMLCanvasElement | null {
    const p = this.panels.get(id);
    if (!p) return null;
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(p.pw * res);
    canvas.height = Math.ceil(p.ph * res);
    const g = canvas.getContext("2d");
    if (!g) return null;
    g.scale(res, res);
    p.draw(g);
    return canvas;
  }

  private keepDisplay(o: WorldObjectDef) {
    const wide = o.kind === "screen_wall";
    const tiles = wide ? 4 : 3;
    const z0 = wide ? 21 : 27;
    const z1 = wide ? 73 : 67;
    const pw = (tiles - 0.28) * S;
    const ph = z1 - z0;
    this.panels.set(o.id, {
      def: o,
      ox: 0.14,
      oy: 0.06,
      zTop: z1,
      pw,
      ph,
      draw: (g) => this.drawDisplay(g, o.id, wide, pw, ph),
      version: ++this.panelVersion,
    });
  }

  private keepWhiteboard(o: WorldObjectDef, items: WbItem[]) {
    if (!items.length) {
      this.panels.delete(o.id);
      return;
    }
    const pw = 1.72 * S;
    const ph = 34;
    this.panels.set(o.id, {
      def: o,
      ox: 0.14,
      oy: 0.065,
      zTop: 61,
      pw,
      ph,
      draw: (g) => drawWhiteboard(g, items, pw, ph),
      version: ++this.panelVersion,
    });
  }

  private drawDisplay(g: CanvasRenderingContext2D, objectId: string, wide: boolean, pw: number, ph: number) {
    g.textBaseline = "top";
    // (a screen share: the 3D view shows its video itself — this is what's under it)
    if (this.screenVideo.has(objectId)) {
      g.font = "11px VT323, ui-monospace, monospace";
      g.fillStyle = css(C.red);
      g.fillText("● LIVE", 4, 2);
      return;
    }
    const content = this.boardContent.get(objectId);
    if (!content) {
      g.font = "15px VT323, ui-monospace, monospace";
      g.globalAlpha = 0.55;
      g.fillStyle = css(C.vfd);
      const text = wide ? "NO SIGNAL" : "— NO BOARD —";
      g.fillText(text, pw / 2 - g.measureText(text).width / 2, ph / 2 - 8);
      g.globalAlpha = 1;
      return;
    }
    g.font = "11px VT323, ui-monospace, monospace";
    g.fillStyle = css(C.vfd);
    g.fillText(content.name.toUpperCase().slice(0, wide ? 30 : 20), 4, 0);
    const secs = content.sections.slice(0, wide ? 8 : 6);
    const max = Math.max(1, ...secs.map((s) => s.count));
    const colW = (pw - 8) / Math.max(1, secs.length);
    const top = 12;
    const barH = ph - top - 11;
    const segs = Math.max(4, Math.floor(barH / 3.5));
    const segH = barH / segs;
    secs.forEach((s, i) => {
      const x = 4 + i * colW;
      const lit = s.count === 0 ? 0 : Math.max(1, Math.round((s.count / max) * segs));
      for (let k = 0; k < segs; k++) {
        const on = k < lit;
        const col = k >= segs - 1 ? C.rust : k >= segs - 2 ? C.amber : C.vfd;
        g.globalAlpha = on ? 1 : 0.7;
        g.fillStyle = css(on ? col : 0x3a2c1f);
        g.fillRect(x + 1.5, top + barH - (k + 1) * segH + 0.5, colW - 4, Math.max(1, segH - 1));
      }
      g.globalAlpha = 1;
      g.fillStyle = css(C.vfd);
      g.font = "9.35px VT323, ui-monospace, monospace"; // (11 px at 0.85)
      g.fillText(
        `${s.name.toUpperCase().slice(0, Math.max(3, Math.floor(colW / 5.5) - 2))} ${s.count}`,
        x + 1,
        ph - 10,
      );
    });
  }

  // ── the hour's light ─────────────────────────────────────────────────────
  private day: Daylight = daylight(12);
  setClock(hour: number) {
    this.day = daylight(hour);
  }
  getDaylight(): Daylight {
    return this.day;
  }
  // compat: a 0..0.85 "night level" as a time of day
  setNight(level: number) {
    this.setClock(hourForNight(level));
  }
  // 0 by day … 1 at night
  nightLevel(): number {
    return this.day.night;
  }
  setQuality(q: Quality, reducedMotion: boolean) {
    this.quality = q;
    this.reducedMotion = reducedMotion;
  }
  getQuality(): Quality {
    return this.quality;
  }
  // Low: people are the only thing that moves; reduced motion: nothing extra.
  animated(): boolean {
    return this.quality !== "low" && this.quality !== "lowest" && !this.reducedMotion;
  }
  // reduced motion: live things skip their flourishes (a crashed car's spin)
  stillMotion(): boolean {
    return this.reducedMotion;
  }

  // ── build mode: what it shows (the 3D view draws it: tp/build3d.ts) ──────
  private ghostItems: { def: WorldObjectDef; ok: boolean }[] = [];
  private ghostLift = 0;
  private edgeGhosts: EdgeGhost[] = [];
  private faceGhosts: FaceGhost[] = [];
  private rectGhost: { x: number; y: number; w: number; h: number; ok: boolean } | null = null;
  private spawnOn = false;
  private spawnPick: { x: number; y: number; ok: boolean } | null = null;
  private mine: SpotPin | null = null;
  private outlines: Outline[] = [];
  private hidden = new Set<string>();
  private gridOn = false;
  // how the walls show in build mode (up / cut away round the focus / down); null outside it
  wallView: "up" | "cut" | "down" | null = null;
  // the pointer, client px (drags measure by it)
  pointerAt = { x: 0, y: 0 };
  // build mode: clicks go through people (and Vortex) to the floor and furniture; with the Walls
  // tool, through things too
  passAvatars = false;
  passObjects = false;

  // One held thing (kept for the walls tool's door brush).
  setGhost(o: WorldObjectDef | null, valid: boolean) {
    this.setGhosts(o ? [{ def: o, ok: valid }] : [], 0);
  }
  // What you're holding: one or many, lifted `lift` iso px with a gentle bob.
  setGhosts(items: { def: WorldObjectDef; ok: boolean }[], lift: number) {
    this.ghostItems = items;
    this.ghostLift = lift;
  }
  // A wall brush over an edge: a see-through wall where it would go.
  setEdgeGhost(e: { x: number; y: number; dir: "h" | "v" } | null, ok: boolean) {
    this.setEdgeGhosts(e ? [{ e, ok }] : []);
  }
  // Walls about to go on edges (a run being drawn); `remove`: walls about to go.
  setEdgeGhosts(list: EdgeGhost[]) {
    this.edgeGhosts = list;
  }
  // Wall faces the Walls tool points at (one face of one edge each).
  setFaceGhosts(list: FaceGhost[]) {
    this.faceGhosts = list;
  }
  // a room being drawn
  setRectGhost(r: { x: number; y: number; w: number; h: number; ok: boolean } | null) {
    this.rectGhost = r;
  }
  // Build mode (Map): where people arrive — a pin on its tile — and, while a
  // new one is being picked, the tile under the pointer (olive fits, rust doesn't).
  showSpawn(on: boolean, pick: { x: number; y: number; ok: boolean } | null = null) {
    this.spawnOn = on;
    this.spawnPick = pick;
  }
  // My own arrival point (anyone, outside build mode): a pin while I pick one
  // — the tile under the pointer too — and for a moment after it's set.
  showMine(at: { x: number; y: number } | null, pick: { x: number; y: number; ok: boolean } | null = null) {
    this.mine = at || pick ? { at: at ?? { x: -1e3, y: -1e3 }, pick } : null;
  }
  setOutlines(list: Outline[]) {
    this.outlines = list;
  }
  // Hide placed things while they're in your hand (or being moved).
  setHidden(ids: Iterable<string>) {
    this.hidden = new Set(ids);
  }
  setBuildGrid(on: boolean) {
    this.gridOn = on;
  }
  buildLook() {
    return {
      ghosts: this.ghostItems,
      lift: this.ghostLift,
      edges: this.edgeGhosts,
      faces: this.faceGhosts,
      wallView: this.wallView,
      rect: this.rectGhost,
      spawn: this.spawnOn ? { at: this.map.spawn, pick: this.spawnPick } : null,
      mine: this.mine,
      outlines: this.outlines,
      hidden: this.hidden,
      grid: this.gridOn,
    };
  }
  // my arrival pin (it shows outside build mode too: buildLook's `mine`)
  minePin(): SpotPin | null {
    return this.mine;
  }

  // ── the screen (the 3D view's answers) ───────────────────────────────────
  // Everything under the pointer, front first (Tab steps through them in build mode).
  picksAt(filter?: (o: WorldObjectDef) => boolean): Pick[] {
    return this.view?.picks(filter) ?? [];
  }
  pickAt(filter?: (o: WorldObjectDef) => boolean): Pick | null {
    return this.picksAt(filter)[0] ?? null;
  }
  // where a world point (`z` iso px up) is on the screen: px from the world canvas's top-left
  // (the controller's hostRect() for client px)
  worldToClient(x: number, y: number, z = 0): { x: number; y: number } {
    return this.view?.project(x, y, z / ZPX) ?? { x: -9999, y: -9999 };
  }
  // the floor point under a client px
  screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    return this.view?.floorAt(clientX, clientY, 0) ?? { x: -1, y: -1 };
  }
  // the world point under the pointer at height `z` iso px (on a surface that high)
  pointerWorld(z = 0): { x: number; y: number } {
    return this.view?.floorAt(this.pointerAt.x, this.pointerAt.y, z / ZPX) ?? { x: -1, y: -1 };
  }
  // The ray from the camera through the pointer (world tiles, z in iso px).
  pointerRay(): Ray | null {
    return this.view?.rayAt(this.pointerAt.x, this.pointerAt.y) ?? null;
  }
  // The same ray from any point on the screen (client px): the game tables read the pointer
  // through their own overlay.
  rayAt(clientX: number, clientY: number): Ray | null {
    return this.view?.rayAt(clientX, clientY) ?? null;
  }
  // The walls the view looks through right now (cut away / faded): "h3,4" keys.
  lookedThrough(): Set<string> {
    return this.view?.lookedThrough() ?? new Set();
  }

  // Dust when something lands, a poof when it goes, sparks, confetti (world tiles; `lift` iso px
  // off the floor; `hard`, a jump's "land" / "kick": how hard, 0..1).
  puff(x: number, y: number, kind: PuffKind = "drop", lift = 0, hard = 1) {
    this.view?.puff(x, y, kind, lift, hard);
    this.activeAt = performance.now();
  }
}

// Miniature of a whiteboard's scene (its last 400 strokes, notes and texts).
function drawWhiteboard(g: CanvasRenderingContext2D, items: WbItem[], pw: number, ph: number) {
  const sx = pw / WB_W;
  const sy = ph / WB_H;
  g.lineCap = "round";
  g.lineJoin = "round";
  for (const it of items.slice(-400)) {
    g.fillStyle = g.strokeStyle = it.c;
    if (it.k === "stroke") {
      g.globalAlpha = it.w > 12 ? 0.35 : 1;
      g.lineWidth = Math.max(0.6, it.w * sx * 1.4);
      g.beginPath();
      g.moveTo(it.p[0] * sx, it.p[1] * sy);
      for (let i = 2; i < it.p.length; i += 2) g.lineTo(it.p[i] * sx, it.p[i + 1] * sy);
      g.stroke();
      g.globalAlpha = 1;
    } else if (it.k === "note") g.fillRect(it.x * sx, it.y * sy, 120 * sx, 80 * sy);
    else g.fillRect(it.x * sx, it.y * sy + 2, Math.min(it.text.length * 9, 300) * sx, 1.2);
  }
}
