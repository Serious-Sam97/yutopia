import {
  type AvatarLayers,
  cutsSig,
  depthOf,
  EMOTES,
  type Emote,
  edgeAt,
  entry,
  entryWallItem,
  floorOf,
  footprint,
  HALF_WALL,
  HANG_HIGH,
  HANG_LOW,
  hangOf,
  hangStrip,
  hasActions,
  hostOf,
  isDoorKind,
  isFloor,
  isOpening,
  isSocial,
  type JumpNow,
  type MapDef,
  placedFootprint,
  Q,
  type Ray,
  registerKinds,
  SOCIAL_MS,
  surfaceAt,
  TILE_H,
  TILE_W,
  tileAt,
  topCentre,
  topRect,
  toScreen,
  toWorld,
  WANTS,
  type Want,
  WB_H,
  WB_W,
  type WbItem,
  type WorldObjectDef,
  WQ,
  WZ_PX,
  wallCuts,
  ZPX_TILE,
} from "@yutopia/shared";
import {
  Application,
  BlurFilter,
  Container,
  type FederatedPointerEvent,
  Graphics,
  GraphicsContext,
  ImageSource,
  Matrix,
  Rectangle,
  Sprite,
  Text,
  TextStyle,
  Texture,
} from "pixi.js";
import type { Quality } from "@/lib/prefs";
import type { Motion } from "./art/avatar-motion";
import { chars, loadChars } from "./art/chars-load";
import { type Daylight, daylight, hourForNight } from "./art/daylight";
import { FloorBake, floorRes } from "./art/floors";
import { WALL_H } from "./art/furniture";
import { MUG_COLORS } from "./art/held";
import { PERSON, WORLD_SCALE } from "./art/iso";
import type { ItemArt } from "./art/items/kit";
import { affectsLight, PX as LIGHT_PX, type LightMap, lightMapFor } from "./art/light";
import { C } from "./art/palette";
import { pawnContext } from "./art/pawn";
import { loadPeople, people } from "./art/people-load";
import { loadPets, pets as petsArt } from "./art/pets-load";
import {
  drawFlat,
  drawFloors,
  dressParts,
  itemArtLoaded,
  loadItemArt,
  objectFlat,
  objectParts,
  objectShadow,
  type Part,
  setArtRes,
  wallParts,
} from "./art/scene";
import {
  acquireItem,
  avatarTexture,
  emoteTexture,
  itemsPending,
  itemTextureStats,
  setItemUploader,
  vortexTexture,
} from "./art/textures";
import type { ThemeView } from "./art/themes";
import { loadThemes } from "./art/themes-load";
import { viewFor } from "./art/views";
import type { VortexMood } from "./art/vortex/vortexArt";
import { jumps } from "./jumps-load";
import type { Life, Swayable } from "./life";
import { PET_HURT_MS, type PetView } from "./petview";
import type { Post } from "./post";
import type { RigView } from "./rig-draw";

const VORTEX_MOODS = new Set([
  "smug",
  "curious",
  "happy",
  "hungry",
  "judging",
  "sleepy",
  "dizzy",
  "mourning",
  "bored",
  "paranoid",
  "malicious",
  "focused",
]);
function toVortexMood(m: string | undefined): VortexMood {
  return (m && VORTEX_MOODS.has(m) ? m : "smug") as VortexMood;
}

declare module "pixi.js" {
  interface Container {
    sortIndex?: number; // where setDepth found it last time (engine.ts)
  }
}

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
  phone?: string;
  phoneCase?: string;
  phonePose?: string;
  ringing?: boolean;
  recording?: boolean; // its camera recording (a red light)
  torch?: boolean; // the phone's flashlight on (the Grounds at night)
  jump?: JumpNow; // jumping (shared/jump.ts): its stage (the controller tracks it)
  z?: number; // feet off the floor (up on something, in a jump), tiles
  ground?: number; // the top under them (the floor: 0), tiles
}

// a tile of height in a person's own px (they're drawn at PERSON: their feet land right on a top)
const JUMP_PX = ZPX_TILE / PERSON;

interface AvatarView {
  petPhase?: number; // a pet's walk cycle (steps)
  petLift?: number; // a pet's height off the ground last frame (tiles)
  eyes?: Graphics;
  sprite: Sprite;
  blinkUntil?: number;
  nextBlink?: number;
  root: Container;
  body: Graphics;
  shadow: Graphics;
  ring: Graphics;
  tag: Container;
  tagText: Text;
  tagBg: Graphics;
  dot: Graphics;
  emote: Sprite;
  bubble: Container;
  bubbleText: Text;
  bubbleBg: Graphics;
  bubbleUntil: number;
  flash?: Graphics; // a photo's flash going off in their hand
  flashAt?: number;
  state: AvatarState;
  iso?: import("./chars").IsoMem; // the model's sprite: what it remembers between frames
  rig?: RigView; // the rig being drawn
  rigNext?: RigView; // a new view / look while its parts decode
  motion?: Motion;
  last?: { x: number; y: number };
  shownDir?: number; // the facing drawn (turns one step at a time)
  turnAt?: number;
  // a move with someone, timed from when it showed up here (not the server's clock)
  actKey?: string;
  actSeen?: number;
  avatarKey: string;
  ringOn?: boolean; // the speaking ring is drawn
  dotKey?: string; // what the status dot shows
  drawnFor: string; // whose look the sprite's current drawing is (avatar JSON)
  local: boolean;
}

// A drawn slice of an object: the quick box art first, the illustrated sprite
// (and its emissive layer) once the texture has decoded.
interface PartView {
  root: Container;
  release: (() => void)[];
  emit: Sprite | null;
  box?: Graphics; // the quick box art (fallback)
  sprite?: Sprite; // the illustrated drawing
  at?: [number, number]; // where its light is sampled (world tiles)
  bloom?: Sprite; // a copy of the emissive layer in the bloom pass
  edge?: Part["edge"]; // the wall it is (or hangs on), for wall-down
  high?: Container; // walls: the upper layer, faded on its own
  highBox?: Graphics;
  highSprite?: Sprite;
  art?: boolean; // has an illustrated drawing
  ready?: boolean; // …and it's showing
  onReady?: () => void;
  piece?: { id: string; kind: string }; // dressing: the generated piece it draws
}

interface ObjectView {
  parts: PartView[];
  def: WorldObjectDef;
  displays: Container[];
  shadow: PartView | null;
  flat: PartView | null; // rugs / rings on the floor layer
  flatReady: boolean;
  dropped: boolean;
  hands?: Graphics; // a wall clock's hands, drawn live
}

export interface BoardContent {
  name: string;
  sections: { name: string; count: number }[];
}

// emote art in world px (the bubble's tail points at the head)
const EMOTE_PX = 34;

// A steady 0..1 from a string (who someone is → their own rhythm of blinks).
function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}
// (an emote, or what a pet wants: both ride the emote slot over a head)
const isEmote = (e: string): e is Emote | Want =>
  (EMOTES as readonly string[]).includes(e) || (WANTS as readonly string[]).includes(e);

// What about an object changes the light map (doors: shut or not; lamps, radio: on).
function lightKey(o: WorldObjectDef | undefined): string {
  if (!o) return "";
  const st = String(o.props?.state ?? "open");
  const shut = (st === "closed" || st === "locked") && !o.props?.passing;
  // (a lamp's shade colours its light; a neon sign's look is its colour)
  return `${shut}|${o.props?.on}|${o.props?.color}|${o.props?.variant}`;
}

function isFloorAt(map: MapDef, x: number, y: number): boolean {
  return isFloor(tileAt(map, Math.floor(x), Math.floor(y)));
}

// Solid furniture darkens the floor around it (AO) and doors get a sill.
function affectsFloor(o: WorldObjectDef): boolean {
  const e = entry(o.kind);
  return isDoorKind(o.kind) || (e.solid && !e.wall && !e.opening);
}

// What a thing covers on the floor, for outlines (world tiles): its footprint,
// or a strip `depth` deep along the wall it hangs on (in front of its face).
function wallStrip(o: WorldObjectDef, depth: number): { x0: number; y0: number; x1: number; y1: number } {
  if (entry(o.kind).wall) return hangStrip(o, depth);
  const { w, h } = placedFootprint(o);
  return { x0: o.x, y0: o.y, x1: o.x + w, y1: o.y + h };
}
const rectPts = (r: { x0: number; y0: number; x1: number; y1: number }) => [
  toScreen(r.x0, r.y0),
  toScreen(r.x1, r.y0),
  toScreen(r.x1, r.y1),
  toScreen(r.x0, r.y1),
];

// Soft contact shadows: stacked ellipses fading out from the feet.
function softShadow(rx: number, ry: number, alpha: number): GraphicsContext {
  const c = new GraphicsContext();
  for (const [k, a] of [
    [1, 0.18],
    [0.78, 0.26],
    [0.56, 0.32],
    [0.34, 0.3],
  ])
    c.ellipse(0, 0, rx * k, ry * k).fill({ color: C.shadow, alpha: a * alpha });
  return c;
}
const PERSON_SHADOW = softShadow(16, 7.5, 1);
const VORTEX_SHADOW = softShadow(15, 6.5, 1.1);
const PET_SHADOW = softShadow(13, 6, 1);
const petSpriteTextures = new WeakMap<HTMLCanvasElement, Texture>(); // a sprite per rendered pet frame
const personTextures = new WeakMap<HTMLCanvasElement, Texture>(); // a sprite per rendered person frame (world/chars/iso.ts)

const NAME_STYLE = new TextStyle({
  fontFamily: "Share Tech Mono, ui-monospace, monospace",
  fontSize: 12,
  fill: C.cream,
  letterSpacing: 0.3,
});
const BUBBLE_STYLE = new TextStyle({
  fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
  fontSize: 12,
  fill: C.ink,
  wordWrap: true,
  wordWrapWidth: 180,
  lineHeight: 15,
});
const VFD_STYLE = new TextStyle({ fontFamily: "VT323, ui-monospace, monospace", fontSize: 15, fill: C.vfd });
const VFD_SMALL = new TextStyle({ fontFamily: "VT323, ui-monospace, monospace", fontSize: 11, fill: C.vfd });

export interface ClickMods {
  shift: boolean;
  right: boolean;
}
export interface EngineEvents {
  onTileClick?: (x: number, y: number, mods?: ClickMods) => void;
  onToyClick?: (id: string) => void; // a pet's toy on the floor
  onAvatarClick?: (id: string, at: { x: number; y: number }) => void; // at: client px
  onObjectClick?: (id: string, at: { x: number; y: number }) => void;
  onHoverObject?: (id: string | null) => void;
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

export class WorldEngine {
  app!: Application;
  map: MapDef;
  private world = new Container();
  // what surrounds the studio (the snow campus): a backdrop + the building below the floor
  private theme: ThemeView | null = null;
  // the land round the ground floor (docs/plan/27): the Grounds once loaded
  grounds: import("./art/grounds-iso").IsoGrounds | null = null;
  private groundsMod: {
    G: typeof import("@yutopia/shared/grounds");
    Iso: typeof import("./art/grounds-iso");
    items: typeof import("./art/grounds-items");
    things: import("./art/grounds-items").Thing[];
  } | null = null;
  private themeKey = "";
  private backdropLayer = new Container();
  private shellBody = new Graphics();
  private shellLights = new Graphics();
  private floorLayer = new Graphics(); // quick floor, until the bake is in
  private floorArt = new Container(); // baked floor chunks
  private flatLayer = new Graphics();
  private flatArtLayer = new Container();
  private shadowLayer = new Container();
  private lifeFront = new Container();
  private sortLayer = new Container();
  private darkLayer = new Graphics();
  private floorLight = new Sprite(); // ambient + baked light, multiplied onto the floor
  private bloomLayer = new Container(); // blurred emissive copies (High)
  private overlay = new Container();
  private highlightG = new Graphics();
  private markerG = new Graphics();
  // how far my voice carries (tiles; 0 = hidden): a dashed ring on the floor
  earshot = 0;
  private earshotG = new Graphics();
  // which of the frame-by-frame Graphics hold a drawing (cleared only then)
  private earshotOn = false;
  private markerOn = false;
  private highlightOn = false;
  private outlineOn = false;
  private fxOn = false;
  // when something last happened here (pointer, a person moving, a bubble):
  // the controller drops to a low frame rate while nothing does
  activeAt = 0;
  private noteActivity = () => {
    this.activeAt = performance.now();
  };
  private fpsNow = 0;
  private renderedAt = 0;
  private ghostLayer = new Container();
  private walls: PartView[] = [];
  private dress: PartView[] = []; // the rooms' clutter
  private bumps: { parts: PartView[]; t: number; len: number; amp: number }[] = [];
  private life: Life | null = null; // ambient motion
  private post: Post | null = null; // High: warm grade, vignette, film grain
  private dressDue = 0;
  private objectViews = new Map<string, ObjectView>();
  private avatars = new Map<string, AvatarView>();
  private boardContent = new Map<string, BoardContent>();
  private screenVideo = new Map<string, HTMLVideoElement>();
  localId: string | null = null;
  zoom = 1.25 * WORLD_SCALE;
  private targetZoom = 1.25 * WORLD_SCALE;
  private cam = { x: 0, y: 0 };
  private camFocus = { x: 0, y: 0 };
  private marker: { x: number; y: number; t: number } | null = null;
  private highlightId: string | null = null;
  private quality: Quality = "high";
  private reducedMotion = false;
  private night = 0;
  private time = 0;
  events: EngineEvents = {};
  private destroyed = false;

  constructor(map: MapDef) {
    this.map = map;
  }

  // autoStart false: the caller draws each frame with render() (the world
  // controller paces frames itself); on, Pixi's ticker draws every screen frame
  async init(host: HTMLElement, opts: { quality: Quality; reducedMotion: boolean; autoStart?: boolean }) {
    this.quality = opts.quality;
    this.reducedMotion = opts.reducedMotion;
    setArtRes(this.artRes());
    const app = new Application();
    await app.init({
      resizeTo: host,
      background: 0x17110d,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(
        window.devicePixelRatio || 1,
        opts.quality === "high" ? 2 : opts.quality === "medium" ? 1.5 : 1,
      ),
      preference: "webgl",
      autoStart: opts.autoStart ?? true,
    });
    if (this.destroyed) {
      app.destroy(true);
      return;
    }
    this.app = app;
    setItemUploader((t) => this.upload(t));
    host.appendChild(app.canvas);
    app.canvas.style.display = "block";
    app.canvas.setAttribute("aria-label", "Yutopia world");
    // Pixi 8 rebuilds a render group's whole draw list whenever one of its
    // Graphics is redrawn — and the world's list is ~2000 nodes. Everything
    // redrawn frame by frame (rings, hands, meters, outlines, dust) gets a
    // group of its own, so only that little list is rebuilt.
    for (const g of [this.highlightG, this.markerG, this.earshotG, this.outlineG, this.fxG]) g.isRenderGroup = true;

    this.sortLayer.sortableChildren = true;
    this.overlay.sortableChildren = true;
    this.overlay.isRenderGroup = true; // tags re-sort as people move: a list of their own
    this.world.addChild(
      this.shellBody,
      this.shellLights,
      this.floorLayer,
      this.floorArt,
      this.gridG,
      this.flatLayer,
      this.flatArtLayer,
      this.shadowLayer,
      this.floorLight,
      this.highlightG,
      this.markerG,
      this.earshotG,
      this.sortLayer,
      this.lifeFront,
      this.ghostFloorG,
      this.ghostLayer,
      this.darkLayer,
      this.bloomLayer,
      this.overlay,
      this.outlineG,
      this.fxG,
    );
    app.stage.addChild(this.backdropLayer, this.world);
    // the finish (High) and ambient life load in their own chunk, after the world is up
    void Promise.all([import("./post"), import("./life")]).then(([{ Post }, { Life }]) => {
      if (this.destroyed) return;
      this.post = new Post(app.stage);
      this.life = new Life(this.sortLayer, this.shadowLayer);
      this.lifeFront.addChild(this.life.front);
      this.applyPost();
      this.rebuildDressing(true); // gives life its scene
    });
    this.darkLayer.blendMode = "multiply";
    this.floorLight.blendMode = "multiply";
    this.floorLight.visible = false;
    this.bloomLayer.blendMode = "add";
    const blur = new BlurFilter({ strength: 7, quality: 2 });
    // a quarter-resolution blur is plenty for a glow, and it's cheap
    blur.resolution = 0.25;
    // a filtered container is composited with the filter's blend mode: add, so
    // the black (occluding) parts of the emissive layer add nothing
    blur.blendMode = "add";
    this.bloomLayer.filters = [blur];

    this.drawStatic();
    // illustrated items replace the box art as soon as their drawings load
    // the 3D people load alongside (a pawn until they're here); their
    // vector drawing only where WebGL can't draw them — or only on the CPU, or the chunk won't come
    loadChars()
      .then((C) => {
        if (!C.isoPeople().canDraw()) void loadPeople();
      })
      .catch(() => void loadPeople());
    loadItemArt().then(() => {
      if (this.destroyed) return;
      for (const v of [...this.objectViews.values()]) this.upsertObject(v.def, false);
      this.drawStatic(); // walls too
    });

    // input
    app.stage.eventMode = "static";
    app.stage.hitArea = new Rectangle(-1e5, -1e5, 2e5, 2e5);
    app.stage.on("pointertap", (e: FederatedPointerEvent) => this.handleTap(e));
    app.stage.on("pointermove", (e: FederatedPointerEvent) => this.handleHover(e));
    app.stage.on("pointerdown", (e: FederatedPointerEvent) => {
      const w = this.eventWorld(e);
      this.events.onPointerDown?.(w.x, w.y);
    });
    app.stage.on("pointerup", (e: FederatedPointerEvent) => {
      const w = this.eventWorld(e);
      this.events.onPointerUp?.(w.x, w.y);
    });
    app.stage.on("pointerupoutside", (e: FederatedPointerEvent) => {
      const w = this.eventWorld(e);
      this.events.onPointerUp?.(w.x, w.y);
    });
    app.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    app.canvas.addEventListener("pointerdown", this.onTouch);
    app.canvas.addEventListener("pointermove", this.onTouch);
    app.canvas.addEventListener("pointerup", this.onTouchEnd);
    app.canvas.addEventListener("pointercancel", this.onTouchEnd);
    app.canvas.style.touchAction = "none";
    for (const ev of ["pointermove", "pointerdown", "wheel"] as const)
      app.canvas.addEventListener(ev, this.noteActivity, { passive: true });

    const c = toScreen(this.map.spawn.x, this.map.spawn.y);
    this.cam = { x: c.x, y: c.y };
    this.camFocus = { ...this.cam };
  }

  // ── the map (walls + floors) ─────────────────────────────────────────────
  private drawStatic() {
    this.mountGrounds();
    this.floorLayer.clear();
    drawFloors(this.floorLayer, this.map);
    this.applyTheme();
    this.bakeFloors(true);
    for (const w of this.walls) this.unmountPart(w);
    this.mountWalls();
    this.bakeLight(true);
    this.rebuildDressing(true);
    this.applyLight();
    this.drawLabels();
  }

  // The walls, cut where doors and windows are (shared openings.ts).
  private cutSig = "";
  private cutsDue = false;
  private mountWalls() {
    const objs = [...this.objectViews.values()].map((v) => v.def);
    this.cutSig = cutsSig(objs);
    for (const w of this.walls) this.unmountPart(w);
    this.walls = wallParts(this.map, wallCuts(objs)).map((part) => this.mountPart(part, this.sortLayer));
  }
  // A door or window came, went or moved: the walls again (once, after a batch).
  private cutsChanged() {
    if (this.cutsDue) return;
    this.cutsDue = true;
    queueMicrotask(() => {
      this.cutsDue = false;
      if (!this.app) return;
      const sig = cutsSig([...this.objectViews.values()].map((v) => v.def));
      if (sig !== this.cutSig) this.mountWalls();
    });
  }

  // The stairwells on this floor (shared wellsOf): open, no floor drawn there.
  private wells = new Set<string>();
  setWells(wells: Set<string>) {
    const sig = [...wells].sort().join(";");
    if (sig === [...this.wells].sort().join(";")) return;
    this.wells = wells;
    this.bakeFloors();
  }

  // The map changed (builders painted walls, added rooms, resized).
  setMap(map: MapDef) {
    this.map = map;
    if (!this.app) return;
    this.drawStatic();
    this.redrawFlat();
    this.drawSpawn(); // the arrival point may have moved
  }

  private eventWorld(e: FederatedPointerEvent) {
    this.pointerAt = { gx: e.global.x, gy: e.global.y };
    return toWorld((e.global.x - this.world.position.x) / this.zoom, (e.global.y - this.world.position.y) / this.zoom);
  }

  // Signs: a room's name (and owner) over its door, nameplates over assigned
  // desks. Drawn above the scene so walls never hide them.
  private labelLayer = new Container();
  private drawLabels() {
    for (const c of this.labelLayer.removeChildren()) c.destroy();
    if (!this.labelLayer.parent) this.overlay.addChild(this.labelLayer);
    this.labelLayer.zIndex = -1;
    const plate = (text: string, x: number, y: number, z: number, dark: boolean) => {
      const c = new Container();
      const t = new Text({
        text,
        style: dark
          ? { fontFamily: "VT323, monospace", fontSize: 15, fill: C.vfd, letterSpacing: 0.5 }
          : { fontFamily: "Share Tech Mono, monospace", fontSize: 10, fill: C.ink },
        resolution: 2,
      });
      t.anchor.set(0.5);
      const bg = new Graphics()
        .roundRect(-t.width / 2 - 6, -t.height / 2 - 2, t.width + 12, t.height + 4, 3)
        .fill({ color: dark ? 0x120d09 : C.cream, alpha: dark ? 0.92 : 0.9 })
        .stroke({ width: 1, color: dark ? C.walnutLight : C.walnut });
      c.addChild(bg, t);
      const p = toScreen(x, y);
      c.position.set(p.x, p.y - z);
      this.labelLayer.addChild(c);
    };
    const doors = [...this.objectViews.values()].map((v) => v.def).filter((o) => isDoorKind(o.kind));
    for (const a of this.map.areas) {
      if (!a.ownerName && !a.key.startsWith("room-")) continue;
      const text = a.ownerName ? `${a.name.toUpperCase()} · ${a.ownerName}` : a.name.toUpperCase();
      const door = doors.find((d) => d.props?.roomKey === a.key);
      if (door) plate(text, door.x + 0.5, door.y + 0.9, 98, true);
      else plate(text, a.x + a.w / 2, a.y + a.h / 2, 6, true);
    }
    for (const v of this.objectViews.values()) {
      const name = v.def.props?.ownerName;
      if (typeof name !== "string" || !name) continue;
      plate(name.split(" ")[0], v.def.x + 0.5, v.def.y + 0.5, 68, false);
    }
  }

  // A wall brush over an edge: a see-through wall where it would go.
  private edgeG = new Graphics();
  setEdgeGhost(e: { x: number; y: number; dir: "h" | "v" } | null, ok: boolean) {
    this.setEdgeGhosts(e ? [{ e, ok }] : []);
  }
  // Walls about to go on edges (a run being drawn): each one's footprint and
  // the face that would stand up, olive where it can, rust where not; `remove`:
  // walls about to go (a cross over them).
  setEdgeGhosts(list: EdgeGhost[]) {
    this.edgeGhosts = list;
    if (!this.edgeG.parent) this.world.addChild(this.edgeG);
    this.edgeG.clear();
    const t = 0.1;
    const at = (x: number, y: number, z = 0) => {
      const p = toScreen(x, y);
      return [p.x, p.y - z];
    };
    for (const { e, ok, remove } of list) {
      const [a0, a1, b0, b1] = e.dir === "h" ? [e.x, e.x + 1, e.y - t, e.y + t] : [e.x - t, e.x + t, e.y, e.y + 1];
      const col = ok && !remove ? C.olive : C.rust;
      // footprint on the floor + the face that would stand up
      this.edgeG.poly([...at(a0, b0), ...at(a1, b0), ...at(a1, b1), ...at(a0, b1)]).fill({ color: col, alpha: 0.6 });
      const face =
        e.dir === "h"
          ? [...at(a0, b1), ...at(a1, b1), ...at(a1, b1, WALL_H), ...at(a0, b1, WALL_H)]
          : [...at(a1, b0), ...at(a1, b1), ...at(a1, b1, WALL_H), ...at(a1, b0, WALL_H)];
      this.edgeG
        .poly(face)
        .fill({ color: col, alpha: remove ? 0.12 : 0.22 })
        .stroke({ width: 1.5, color: ok && !remove ? C.vfd : C.rust, alpha: 0.9 });
      if (remove) {
        const m = e.dir === "h" ? [a0 + 0.5, b1] : [a1, b0 + 0.5];
        const [cx, cy] = at(m[0], m[1], WALL_H / 2);
        this.edgeG
          .moveTo(cx - 7, cy - 7)
          .lineTo(cx + 7, cy + 7)
          .moveTo(cx + 7, cy - 7)
          .lineTo(cx - 7, cy + 7)
          .stroke({ width: 2.5, color: C.rust, alpha: 0.95 });
      }
    }
  }

  // Wall faces the Walls tool points at (panels: one face of one edge): an
  // outline on the face, the brush's material on it (a preview), an arrow strip
  // on the floor into the room it looks into. The faces this view can't see
  // (a wall's far side) show through their wall as a dashed ghost.
  private faceG = new Graphics();
  private faceGhosts: FaceGhost[] = [];
  setFaceGhosts(list: FaceGhost[]) {
    this.faceGhosts = list;
    if (!this.faceG.parent) this.world.addChild(this.faceG);
    const g = this.faceG.clear();
    const F = 0.105; // just off the face
    for (const f of list) {
      const p = f.p;
      const top = edgeAt(this.map, p) === HALF_WALL ? 34 : WALL_H;
      const plane = (p.dir === "h" ? p.y : p.x) + p.side * F;
      const at = (u: number, z: number) => {
        const s = p.dir === "h" ? toScreen(p.x + u, plane) : toScreen(plane, p.y + u);
        return [s.x, s.y - z];
      };
      const quad = (u0: number, u1: number, z0: number, z1: number) => [
        ...at(u0, z1),
        ...at(u1, z1),
        ...at(u1, z0),
        ...at(u0, z0),
      ];
      const far = p.side < 0 && !this.seesAllSides;
      const col = !f.ok ? C.rust : f.sel ? C.vfd : C.amber;
      // the floor strip in front, and a chevron into the room
      const d = 0.32;
      const [b0, b1] = p.side > 0 ? [0, d] : [-d, 0];
      const base = p.dir === "h" ? p.y : p.x;
      const fl = (u: number, v: number) => {
        const s = p.dir === "h" ? toScreen(p.x + u, base + v) : toScreen(base + v, p.y + u);
        return [s.x, s.y];
      };
      g.poly([...fl(0.04, b0), ...fl(0.96, b0), ...fl(0.96, b1), ...fl(0.04, b1)]).fill({ color: col, alpha: 0.28 });
      const tip = p.side * (d + 0.14);
      g.poly([...fl(0.38, p.side * d), ...fl(0.62, p.side * d), ...fl(0.5, tip)]).fill({ color: col, alpha: 0.8 });
      // the brush's material on the face (what it will look like)
      if (f.mat && f.ok) previewMat(g, f.mat, quad, top, far ? 0.4 : 0.82);
      else g.poly(quad(0, 1, 0, top)).fill({ color: col, alpha: far ? 0.1 : 0.18 });
      // the outline: solid on a face this view sees, dashed through the wall on one it doesn't
      if (far) {
        const corners: [number, number][] = [
          [0, top],
          [1, top],
          [1, 0],
          [0, 0],
        ];
        for (let i = 0; i < 4; i++) {
          const [u0, z0] = corners[i];
          const [u1, z1] = corners[(i + 1) % 4];
          for (let k = 0; k < 8; k += 2) {
            const a = at(u0 + ((u1 - u0) * k) / 8, z0 + ((z1 - z0) * k) / 8);
            const b = at(u0 + ((u1 - u0) * (k + 1)) / 8, z0 + ((z1 - z0) * (k + 1)) / 8);
            g.moveTo(a[0], a[1]).lineTo(b[0], b[1]);
          }
        }
        g.stroke({ width: 1.5, color: col, alpha: 0.95 });
      } else g.poly(quad(0, 1, 0, top)).stroke({ width: f.sel ? 2.5 : 1.8, color: col, alpha: 0.95 });
    }
  }

  // how the walls show in build mode (up / cut away round the focus / down);
  // null outside it (cut away, as always)
  wallView: "up" | "cut" | "down" | null = null;

  // Room drafts in build mode.
  private rectG = new Graphics();
  // Build mode (Map): where people arrive — a pin on its tile — and, while a
  // new one is being picked, the tile under the pointer (olive fits, rust doesn't).
  private spawnG = new Graphics();
  private spawnOn = false;
  private spawnPick: { x: number; y: number; ok: boolean } | null = null;
  showSpawn(on: boolean, pick: { x: number; y: number; ok: boolean } | null = null) {
    this.spawnOn = on;
    this.spawnPick = pick;
    this.drawSpawn();
  }
  private drawSpawn() {
    if (!this.spawnG.parent) this.world.addChild(this.spawnG);
    const g = this.spawnG;
    g.clear();
    if (!this.spawnOn) return;
    const tile = (x: number, y: number) =>
      [toScreen(x, y), toScreen(x + 1, y), toScreen(x + 1, y + 1), toScreen(x, y + 1)].flatMap((p) => [p.x, p.y]);
    const pk = this.spawnPick;
    if (pk)
      g.poly(tile(pk.x, pk.y))
        .fill({ color: pk.ok ? C.olive : C.rust, alpha: 0.35 })
        .stroke({ width: 2, color: pk.ok ? C.vfd : C.rust });
    const s = this.map.spawn;
    const tx = Math.floor(s.x);
    const ty = Math.floor(s.y);
    g.poly(tile(tx, ty)).fill({ color: C.amber, alpha: 0.22 }).stroke({ width: 2, color: C.vfd });
    const c = toScreen(tx + 0.5, ty + 0.5);
    g.ellipse(c.x, c.y, 9, 4.5).fill({ color: 0x2a1a12, alpha: 0.3 });
    g.moveTo(c.x, c.y)
      .lineTo(c.x, c.y - 26)
      .stroke({ width: 2.5, color: 0x2a1a12 });
    g.circle(c.x, c.y - 32, 8)
      .fill(C.amber)
      .stroke({ width: 2, color: 0x2a1a12 });
    g.circle(c.x, c.y - 32, 3).fill(0xf7f0de);
  }

  // My own arrival point (anyone, outside build mode): an olive pin on its
  // tile while I pick one — the tile under the pointer too — and for a moment
  // after it's set.
  private mineG = new Graphics();
  showMine(at: { x: number; y: number } | null, pick: { x: number; y: number; ok: boolean } | null = null) {
    if (!this.mineG.parent) this.world.addChild(this.mineG);
    const g = this.mineG;
    g.clear();
    const tile = (x: number, y: number) =>
      [toScreen(x, y), toScreen(x + 1, y), toScreen(x + 1, y + 1), toScreen(x, y + 1)].flatMap((p) => [p.x, p.y]);
    if (pick)
      g.poly(tile(pick.x, pick.y))
        .fill({ color: pick.ok ? C.olive : C.rust, alpha: 0.35 })
        .stroke({ width: 2, color: pick.ok ? C.vfd : C.rust });
    if (!at) return;
    const tx = Math.floor(at.x);
    const ty = Math.floor(at.y);
    g.poly(tile(tx, ty)).fill({ color: C.olive, alpha: 0.25 }).stroke({ width: 2, color: C.cream });
    const c = toScreen(tx + 0.5, ty + 0.5);
    g.ellipse(c.x, c.y, 9, 4.5).fill({ color: 0x2a1a12, alpha: 0.3 });
    g.moveTo(c.x, c.y)
      .lineTo(c.x, c.y - 26)
      .stroke({ width: 2.5, color: 0x2a1a12 });
    g.circle(c.x, c.y - 32, 8)
      .fill(C.olive)
      .stroke({ width: 2, color: 0x2a1a12 });
    g.circle(c.x, c.y - 32, 3).fill(C.cream);
  }

  setRectGhost(r: { x: number; y: number; w: number; h: number; ok: boolean } | null) {
    this.rectGhost = r;
    if (!this.rectG.parent) this.world.addChild(this.rectG);
    this.rectG.clear();
    if (!r) return;
    const pts = [
      toScreen(r.x, r.y),
      toScreen(r.x + r.w, r.y),
      toScreen(r.x + r.w, r.y + r.h),
      toScreen(r.x, r.y + r.h),
    ];
    this.rectG
      .poly(pts.flatMap((p) => [p.x, p.y]))
      .fill({ color: r.ok ? C.olive : C.rust, alpha: 0.25 })
      .stroke({ width: 2, color: r.ok ? C.vfd : C.rust });
    // the wall ring it will get
    const q = [
      toScreen(r.x - 1, r.y - 1),
      toScreen(r.x + r.w + 1, r.y - 1),
      toScreen(r.x + r.w + 1, r.y + r.h + 1),
      toScreen(r.x - 1, r.y + r.h + 1),
    ];
    this.rectG.poly(q.flatMap((p) => [p.x, p.y])).stroke({ width: 1, color: C.walnutLight, alpha: 0.8 });
  }

  // ── objects ──────────────────────────────────────────────────────────────
  setObjects(objects: WorldObjectDef[]) {
    for (const id of [...this.objectViews.keys()]) this.removeObject(id);
    this.flatLayer.clear();
    // surfaces before what stands on them (it sorts against its host)
    const order = [...objects].sort((a, b) => Number(!!entry(a.kind).onSurface) - Number(!!entry(b.kind).onSurface));
    for (const o of order) this.upsertObject(o, false);
    this.redrawFlat();
  }

  upsertObject(o: WorldObjectDef, redrawFlat = true) {
    this.workCache.clear();
    // A changed object (door swinging, someone sitting) keeps its old drawing
    // until the new one has decoded, so it never flashes back to box art.
    const old = this.objectViews.get(o.id);
    const swap = !!old && old.parts.some((p) => p.ready);
    if (old) this.objectViews.delete(o.id);
    const host = entry(o.kind).onSurface ? hostOf(this.allObjects(), o) : undefined;
    const parts = objectParts(o, host).map((p) => this.mountPart(p, this.sortLayer, 1, swap));
    const pending = parts.filter((p) => p.art && !p.ready);
    const done = () => {
      if (old) this.dropView(old);
    };
    if (old && (!swap || !pending.length)) done();
    else if (old) {
      let left = pending.length;
      for (const p of pending)
        p.onReady = () => {
          if (--left === 0 && this.objectViews.get(o.id)?.parts === parts) done();
        };
      // never wait forever (a failed decode): fall back after a moment
      setTimeout(() => {
        if (left > 0 && !old.dropped) {
          for (const p of parts) if (p.box && !p.ready) p.box.visible = true;
          done();
        }
      }, 1500);
    }
    const view: ObjectView = {
      parts,
      def: o,
      displays: [],
      shadow: this.mountFloorArt(o, objectShadow(o), this.shadowLayer),
      flat: null,
      flatReady: false,
      dropped: false,
    };
    // rugs and rings: an illustrated floor sprite; the box version until it loads
    view.flat = this.mountFloorArt(o, objectFlat(o), this.flatArtLayer, () => {
      view.flatReady = true;
      this.redrawFlat();
    });
    if (o.props?.ownerName || o.kind === "chair" || o.kind === "armchair" || isDoorKind(o.kind))
      this.labelsDirty = true;
    if (isOpening(o.kind) && (!old || old.def.x !== o.x || old.def.y !== o.y || old.def.rot !== o.rot))
      this.cutsChanged();
    this.objectViews.set(o.id, view);
    this.hulls.delete(o.id);
    if (this.hidden.has(o.id)) this.showView(view, false);
    const moved = !old || old.def.x !== o.x || old.def.y !== o.y || old.def.rot !== o.rot;
    // feedback: a door swings as it opens or shuts, a chair wobbles as someone sits or stands
    if (old && !moved && this.animated()) {
      const swung = isDoorKind(o.kind) && lightKey(old.def) !== lightKey(o);
      const sat =
        (o.kind === "chair" || o.kind === "armchair" || o.kind === "beanbag") &&
        !!old.def.props?.occupied !== !!o.props?.occupied;
      if (swung || sat) this.bumps.push({ parts, t: 0, len: swung ? 0.28 : 0.45, amp: swung ? 0.22 : 0.07 });
    }
    if (affectsFloor(o) && moved) this.bakeFloors();
    if (moved) this.rebuildDressing();
    if (affectsLight(o) && (moved || lightKey(old?.def) !== lightKey(o))) this.bakeLight();
    this.tintObject(view);
    if (o.kind === "board_wall" || o.kind === "screen_wall") this.drawDisplay(o.id);
    if (o.kind === "clock") {
      view.hands = new Graphics();
      view.hands.isRenderGroup = true; // redrawn every frame
      const hg = hangOf(o);
      view.hands.zIndex = hg.line + (hg.u0 + hg.u1) / 2 / WQ + 0.02;
      this.sortLayer.addChild(view.hands);
    }
    if (o.kind === "whiteboard") {
      const scene = o.props?.scene;
      this.drawWhiteboard(o.id, this.wbLive.get(o.id) ?? (Array.isArray(scene) ? (scene as WbItem[]) : []));
    }
    if (redrawFlat) this.redrawFlat();
  }

  removeObject(id: string, redrawFlat = true) {
    this.workCache.clear();
    const v = this.objectViews.get(id);
    if (!v) return;
    if (affectsFloor(v.def)) this.bakeFloors();
    this.rebuildDressing();
    if (affectsLight(v.def)) this.bakeLight();
    this.dropView(v);
    this.objectViews.delete(id);
    // (its name plate goes with it: a desk on a floor I just left)
    if (v.def.props?.ownerName || isDoorKind(v.def.kind)) this.labelsDirty = true;
    if (isOpening(v.def.kind)) this.cutsChanged();
    this.panels.delete(id);
    this.hulls.delete(id);
    if (redrawFlat) this.redrawFlat();
  }

  private dropView(v: ObjectView) {
    if (v.dropped) return;
    v.dropped = true;
    for (const pv of v.parts) this.unmountPart(pv);
    if (v.shadow) this.unmountPart(v.shadow);
    if (v.flat) this.unmountPart(v.flat);
    this.clearDisplays(v);
    v.hands?.destroy();
  }

  // Low: people are the only thing that moves; reduced motion: nothing extra.
  animated(): boolean {
    return this.quality !== "low" && !this.reducedMotion;
  }

  private applyPost() {
    this.post?.setEnabled(this.quality === "high");
  }

  // Everything drawn and baked: drawings decoded, floor + light + dressing
  // built, the theme in (screenshot tests wait for this).
  settled(): boolean {
    return (
      !!itemArtLoaded() &&
      itemsPending() === 0 &&
      !this.floorJob &&
      !this.floorDue &&
      !this.lightDue &&
      !this.dressDue &&
      !!this.theme &&
      !!this.post &&
      !!this.life &&
      this.themeKey.startsWith("snow")
    );
  }

  // Rough GPU texture memory: item drawings, the baked floor, the light map.
  textureMB(): number {
    let bytes = itemTextureStats().mb * 1048576;
    for (const c of this.floorArt.children as Sprite[]) {
      const src = c.texture?.source;
      if (src) bytes += src.pixelWidth * src.pixelHeight * 4 * 1.33;
    }
    if (this.lightCanvas) bytes += this.lightCanvas.width * this.lightCanvas.height * 4;
    return Math.round(bytes / 1048576);
  }

  getQuality(): Quality {
    return this.quality;
  }

  // ── dressing ─────────────────────────────────────────────────────────────
  private rebuildDressing(now = false) {
    this.dressDue = now ? performance.now() : performance.now() + 250;
  }

  private stepDressing() {
    if (!this.dressDue || performance.now() < this.dressDue) return;
    this.dressDue = 0;
    for (const v of this.dress) this.unmountPart(v);
    this.dress = [];
    for (const { part, item, shadow } of dressParts(this.map, this.allObjects())) {
      const pv = this.mountPart(part, this.sortLayer);
      pv.piece = { id: item.id, kind: item.kind };
      pv.root.visible = !this.hidden.has(item.id);
      this.dress.push(pv);
      const pseudo = { id: item.id, kind: "dress", x: item.x - 0.5, y: item.y - 0.5 } as WorldObjectDef;
      const sh = this.mountFloorArt(pseudo, shadow, this.shadowLayer);
      if (sh) this.dress.push(sh);
    }
    for (const v of this.dress) {
      const t = v.at ? this.tintAt(v.at[0], v.at[1]) : 0xffffff;
      if (v.sprite) v.sprite.tint = t;
    }
    // ambient life follows the same scene
    const sways: Swayable[] = [];
    for (const v of this.objectViews.values())
      if (v.def.kind === "plant" && v.parts[0])
        sways.push({ root: v.parts[0].root, x: v.def.x + 0.5, y: v.def.y + 0.5, kick: 0 });
    const items = dressParts(this.map, this.allObjects());
    let k = 0;
    for (const v of this.dress) {
      const it = items[k];
      if (v.sprite && it?.item.kind === "plant") sways.push({ root: v.root, x: it.item.x, y: it.item.y, kick: 0 });
      if (v.sprite) k++;
    }
    this.life?.setScene(this.map, this.allObjects(), sways);
  }

  private updateLife(dt: number) {
    const life = this.life;
    if (!life) return;
    life.enabled = this.quality !== "low" && !this.reducedMotion;
    const emits: { sprite: Container; base: number; kind: string; seed: number }[] = [];
    const base = Math.min(0.75, this.night * 0.85);
    if (life.enabled)
      for (const v of this.objectViews.values()) {
        const kind = v.def.kind;
        if (kind !== "desk" && kind !== "crt_terminal" && kind !== "arcade") continue;
        for (const p of v.parts)
          if (p.emit?.visible) emits.push({ sprite: p.emit, base, kind, seed: v.def.x * 0.13 + v.def.y * 0.71 });
      }
    const people: { x: number; y: number }[] = [];
    for (const a of this.avatars.values()) people.push({ x: a.state.x, y: a.state.y });
    let radio = false;
    for (const v of this.objectViews.values()) if (v.def.kind === "radio" && v.def.props?.on) radio = true;
    life.update({ dt, time: this.time, people, radio, night: this.night, emits });
  }

  // ── the Grounds (docs/plan/27): the land round the ground floor ─────────
  /** The Grounds are loaded (the controller fetches them once): draw the land. */
  setGrounds(G: typeof import("@yutopia/shared/grounds"), prints?: import("./footprints").Footprints) {
    this.prints = prints ?? null;
    void Promise.all([import("./art/grounds-iso"), import("./art/grounds-items"), loadItemArt()]).then(
      ([Iso, Items, art]) => {
        if (this.destroyed) return;
        // the Grounds' things: kinds of their own, drawn as items
        const { kinds, gens } = Items.groundKinds(G);
        registerKinds(kinds);
        (art as typeof import("./art/items")).registerItems(gens);
        this.groundsMod = { G, Iso, items: Items, things: Items.groundThings(G) };
        this.mountGrounds();
      },
    );
  }

  // ── the Grounds' things: items on the land round the camera (not the floor's:
  // never picked, built, or baked into its floor, light or dressing) ──
  private groundViews = new Map<string, ObjectView>();
  private setGroundThing(o: WorldObjectDef, lift: number) {
    this.dropGroundThing(o.id);
    const dy = lift * ZPX_TILE;
    const parts = objectParts(o).map((p) => this.mountPart({ ...p, y: p.y - dy }, this.sortLayer));
    const shadow = this.mountFloorArt(o, objectShadow(o), this.shadowLayer);
    if (shadow) shadow.root.y -= dy;
    const v: ObjectView = { parts, def: o, displays: [], shadow, flat: null, flatReady: false, dropped: false };
    this.groundViews.set(o.id, v);
  }
  /** Put a texture on the GPU now, not the frame it's first drawn. */
  private upload(t: Texture) {
    if (!this.destroyed && !t.destroyed) this.app.renderer.texture.initSource(t.source);
  }
  private dropGroundThing(id: string) {
    const v = this.groundViews.get(id);
    if (!v) return;
    this.dropView(v);
    this.groundViews.delete(id);
  }
  // the land's light by the hour: darker than the rooms' at night (off the lit
  // ways the Grounds are truly dark: docs/plan/27, the mood)
  private landAmbient(): [number, number, number] {
    const k = 1 - 0.55 * this.day.night;
    const a = this.day.ambient;
    return [a[0] * k, a[1] * k, a[2] * k];
  }

  // the ground floor of a building: its land (made again if the floor moved);
  // any other floor: none
  private mountGrounds() {
    const m = this.groundsMod;
    const ground = floorOf(this.map) === 0 && !!this.map.levels?.length;
    if (!m || !ground) {
      this.grounds?.setVisible(false);
      return;
    }
    const ox = this.map.ox ?? 0;
    const oy = this.map.oy ?? 0;
    if (this.grounds && (this.groundsAt.x !== ox || this.groundsAt.y !== oy)) {
      this.grounds.destroy();
      this.grounds = null;
    }
    if (!this.grounds) {
      this.grounds = new m.Iso.IsoGrounds(m.G, ox, oy, (x, y) => isFloorAt(this.map, x, y), this.sortLayer, {
        things: m.things,
        add: (o, lift) => this.setGroundThing(o, lift),
        remove: (id) => this.dropGroundThing(id),
        insideThings: (i) => m.items.insideThings(m.G, i),
        upload: (t) => this.upload(t),
        roots: (id) => {
          const v = this.groundViews.get(id);
          return v ? [...v.parts, ...(v.shadow ? [v.shadow] : [])].map((p) => p.root) : [];
        },
      });
      this.groundsAt = { x: ox, y: oy };
      this.world.addChildAt(this.grounds.land, 0);
      this.world.addChildAt(this.grounds.lights, this.world.getChildIndex(this.sortLayer));
      this.world.addChildAt(this.grounds.weather.root, this.world.getChildIndex(this.overlay));
      this.grounds.setAmbient(this.landAmbient());
    }
    this.grounds.setVisible(true);
  }
  private groundsAt = { x: 0, y: 0 };

  // footprints in the snow (footprints.ts): a small sprite each, fading
  private prints: import("./footprints").Footprints | null = null;

  // ── what's around the building ─────────────────────────────────────────
  // The backdrop loads in its own chunk; the shell is drawn once it's in.
  private applyTheme() {
    const key = `snow|${this.quality}`;
    // the ground floor of a building stands on the ground: nothing hangs under it
    const ground = floorOf(this.map) === 0 && !!this.map.levels?.length;
    this.shellBody.visible = !ground;
    this.shellLights.visible = !ground;
    if (key === this.themeKey) {
      this.theme?.drawShell(
        this.shellBody,
        this.shellLights,
        (x, y) => isFloorAt(this.map, x, y),
        this.map.width,
        this.map.height,
      );
      return;
    }
    this.themeKey = key;
    loadThemes().then(({ makeTheme }) => {
      if (this.destroyed || this.themeKey !== key) return;
      this.theme?.destroy();
      this.theme = makeTheme(this.animated(), this.quality);
      this.backdropLayer.addChild(this.theme.root);
      this.theme.setDay(this.day);
      this.theme.drawShell(
        this.shellBody,
        this.shellLights,
        (x, y) => isFloorAt(this.map, x, y),
        this.map.width,
        this.map.height,
      );
    });
  }

  // ── baked floors ───────────────────────────────────────────────────────────
  // Rebaked when the map or the solid furniture changes; built a few chunks per
  // frame and swapped in whole, so edits never hitch or flash.
  private floorJob: { bake: FloorBake; i: number; sprites: Sprite[] } | null = null;
  private floorStats = { setupMs: 0, maxChunkMs: 0, chunks: 0, bakes: 0 };
  private floorDue = 0;
  private bakeFloors(now = false) {
    this.floorDue = now ? performance.now() : performance.now() + 250;
  }

  private stepFloorBake() {
    if (this.floorDue && performance.now() >= this.floorDue) {
      this.floorDue = 0;
      for (const sp of this.floorJob?.sprites ?? []) sp.destroy(true);
      const t = performance.now();
      const bake = new FloorBake(
        this.map,
        this.allObjects(),
        floorRes(this.map, this.quality, WORLD_SCALE),
        1024,
        this.wells,
      );
      this.floorStats = {
        setupMs: performance.now() - t,
        maxChunkMs: 0,
        chunks: bake.chunks.length,
        bakes: this.floorStats.bakes + 1,
      };
      this.floorJob = { bake, i: 0, sprites: [] };
    }
    const job = this.floorJob;
    if (!job) return;
    const t0 = performance.now();
    while (job.i < job.bake.chunks.length && performance.now() - t0 < 6) {
      const k = job.bake.chunks[job.i];
      const tc = performance.now();
      const c = job.bake.draw(job.i++);
      this.floorStats.maxChunkMs = Math.max(this.floorStats.maxChunkMs, performance.now() - tc);
      const sp = new Sprite(new Texture({ source: new ImageSource({ resource: c, autoGenerateMipmaps: true }) }));
      sp.position.set(k.x, k.y);
      sp.width = k.w;
      sp.height = k.h;
      job.sprites.push(sp);
    }
    if (job.i < job.bake.chunks.length) return;
    for (const old of this.floorArt.removeChildren()) old.destroy(true);
    for (const sp of job.sprites) this.floorArt.addChild(sp);
    this.floorLayer.visible = false;
    this.floorJob = null;
  }

  private artRes() {
    const dpr = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
    // the camera sits WORLD_SCALE closer, so the art is drawn that much finer
    return (this.quality === "high" ? (dpr >= 2 ? 2.5 : 2) : this.quality === "medium" ? 1.5 : 1.25) * WORLD_SCALE;
  }

  // Box art right away; the illustrated drawing replaces it once decoded.
  private mountPart(p: Part, parent: Container, alpha = 1, hideBox = false): PartView {
    const root = new Container();
    root.position.set(p.x, p.y);
    root.zIndex = p.key;
    root.alpha = alpha;
    const box = new Graphics(p.ctx);
    root.addChild(box);
    parent.addChild(root);
    const view: PartView = { root, release: [], emit: null, box, at: p.at ?? [p.wx + 0.5, p.wy + 0.5], edge: p.edge };
    if (p.high) this.mountHigh(view, p.high, this.artRes());
    const pa = p.art;
    const art = pa?.get();
    if (!pa || !art) return view;
    view.art = true;
    box.visible = !hideBox;
    const res = this.artRes();
    const place = (sp: Sprite) => {
      sp.position.set(art.x - pa.ox, art.y - pa.oy);
      sp.scale.set(1 / res);
    };
    const sprite = new Sprite();
    sprite.visible = false;
    place(sprite);
    root.addChild(sprite);
    view.sprite = sprite;
    // a wall's upper layer always draws over its lower one
    if (view.high) root.addChild(view.high);
    view.release.push(
      acquireItem(
        pa.key,
        () => art.svg,
        (t) => {
          sprite.texture = t;
          sprite.scale.set(art.w / t.width, art.h / t.height);
          sprite.visible = true;
          box.visible = false;
          view.ready = true;
          view.onReady?.();
        },
      ),
    );
    if (art.emit && alpha === 1) {
      const emit = new Sprite();
      emit.blendMode = "add";
      emit.visible = false;
      place(emit);
      root.addChild(emit);
      view.emit = emit;
      const svg = art.emit;
      view.release.push(
        acquireItem(
          `${pa.key}|e`,
          () => svg,
          (t) => {
            emit.texture = t;
            emit.scale.set(art.w / t.width, art.h / t.height);
            view.bloom = this.bloomTwin(emit, root);
            this.lightEmit(view);
          },
        ),
      );
    }
    return view;
  }

  // A floor-level drawing (contact shadow, rug) placed at the object's origin.
  private mountFloorArt(
    o: WorldObjectDef,
    ref: { key: string; get: () => ItemArt | null } | null,
    layer: Container,
    onReady?: () => void,
  ): PartView | null {
    const art = ref?.get();
    if (!ref || !art) return null;
    const root = new Container();
    const at = toScreen(o.x, o.y);
    root.position.set(at.x + art.x, at.y + art.y);
    layer.addChild(root);
    const sp = new Sprite();
    sp.visible = false;
    root.addChild(sp);
    const view: PartView = { root, emit: null, release: [] };
    view.release.push(
      acquireItem(
        ref.key,
        () => art.svg,
        (t) => {
          sp.texture = t;
          sp.width = art.w;
          sp.height = art.h;
          sp.visible = true;
          onReady?.();
        },
      ),
    );
    const svg = art.emit;
    if (svg) {
      const emit = new Sprite();
      emit.blendMode = "add";
      emit.visible = false;
      root.addChild(emit);
      view.emit = emit;
      view.release.push(
        acquireItem(
          `${ref.key}|e`,
          () => svg,
          (t) => {
            emit.texture = t;
            emit.width = art.w;
            emit.height = art.h;
            view.bloom = this.bloomTwin(emit, root);
            this.lightEmit(view);
          },
        ),
      );
    }
    return view;
  }

  // A wall's upper layer: its own box art + drawing, in a child that fades.
  private mountHigh(view: PartView, h: NonNullable<Part["high"]>, res: number) {
    const hc = new Container();
    const box = new Graphics(h.ctx);
    hc.addChild(box);
    view.root.addChild(hc);
    view.high = hc;
    view.highBox = box;
    const pa = h.art;
    const art = pa?.get();
    if (!pa || !art) return;
    const sprite = new Sprite();
    sprite.visible = false;
    sprite.position.set(art.x - pa.ox, art.y - pa.oy);
    sprite.scale.set(1 / res);
    hc.addChild(sprite);
    view.highSprite = sprite;
    view.release.push(
      acquireItem(
        pa.key,
        () => art.svg,
        (t) => {
          sprite.texture = t;
          sprite.scale.set(art.w / t.width, art.h / t.height);
          sprite.visible = true;
          box.visible = false;
        },
      ),
    );
  }

  // The emissive layer again, in the blurred bloom pass (High only).
  private bloomTwin(emit: Sprite, root: Container): Sprite {
    const b = new Sprite(emit.texture);
    b.position.set(root.position.x + emit.position.x, root.position.y + emit.position.y);
    b.scale.copyFrom(emit.scale);
    b.visible = false;
    this.bloomLayer.addChild(b);
    return b;
  }

  private unmountPart(v: PartView) {
    v.bloom?.destroy();
    for (const r of v.release) r();
    v.root.destroy({ children: true });
  }

  // emissive bits (screens, VFDs, lamp shades) light up as the room darkens;
  // on High a blurred copy of them blooms
  private lightEmit(v: PartView) {
    const s = v.emit;
    if (!s) return;
    const on = this.quality !== "low" && this.night > 0.02 && s.texture !== Texture.EMPTY;
    s.visible = on;
    s.alpha = Math.min(0.75, this.night * 0.85);
    if (v.bloom) {
      v.bloom.visible = on;
      v.bloom.alpha = Math.min(0.9, this.night * 1.1);
    }
  }

  refreshFlat() {
    this.redrawFlat();
  }

  private redrawFlat() {
    this.flatLayer.clear();
    for (const v of this.objectViews.values())
      if ((v.def.kind === "rug" || v.def.kind === "standup_mat") && !v.flatReady && !this.hidden.has(v.def.id))
        drawFlat(this.flatLayer, v.def);
  }

  // Any object covering a tile (build mode picks non-interactive things too).
  objectAtTile(x: number, y: number): WorldObjectDef | undefined {
    let best: WorldObjectDef | undefined;
    for (const v of this.objectViews.values()) {
      const o = v.def;
      const { w, h } = placedFootprint(o);
      if (x >= o.x && x < o.x + w && y >= o.y && y < o.y + h) {
        // prefer things on the floor over rugs
        if (!best || best.kind === "rug" || best.kind === "standup_mat") best = o;
      }
    }
    return best;
  }

  getObject(id: string): WorldObjectDef | undefined {
    return this.objectViews.get(id)?.def;
  }

  /** Another floor's things, drawn ahead (their art built, decoded and on the
   *  GPU) so the first visit there doesn't build them all in one frame. A few
   *  at a time; the textures stay in the shared cache (idle, under its budget). */
  async prewarm(objects: WorldObjectDef[], map?: MapDef, each = 6): Promise<void> {
    // its light (kept per floor, art/light.ts)
    if (map && this.quality !== "low") lightMapFor(map, objects);
    const prepare = (this.app.renderer as unknown as { prepare?: { upload(t: unknown): Promise<void> } }).prepare;
    for (let i = 0; i < objects.length; i += each) {
      for (const o of objects.slice(i, i + each)) {
        const host = entry(o.kind).onSurface ? hostOf(objects, o) : undefined;
        for (const p of objectParts(o, host)) {
          const pa = p.art;
          const art = pa?.get();
          if (!pa || !art) continue;
          // (ready may come at once, from the cache: let go after, either way)
          let release: (() => void) | null = null;
          let done = false;
          release = acquireItem(
            pa.key,
            () => art.svg,
            (t) => {
              void (prepare?.upload(t) ?? Promise.resolve()).finally(() => {
                done = true;
                release?.();
              });
            },
          );
          if (done) release();
        }
      }
      // (a frame between batches)
      await new Promise((r) => setTimeout(r, 16));
      if (this.destroyed) return;
    }
  }

  allObjects(): WorldObjectDef[] {
    return [...this.objectViews.values()].map((v) => v.def);
  }

  // In-world displays: board walls show a VU-meter of cards per section; big
  // screens show the board or a live screen share. Drawn on the wall plane.
  setBoardContent(objectId: string, content: BoardContent | null) {
    if (content) this.boardContent.set(objectId, content);
    else this.boardContent.delete(objectId);
    this.drawDisplay(objectId);
  }

  setScreenVideo(objectId: string, video: HTMLVideoElement | null) {
    if (video) this.screenVideo.set(objectId, video);
    else this.screenVideo.delete(objectId);
    this.drawDisplay(objectId);
  }

  private wbLive = new Map<string, WbItem[]>();

  setWhiteboard(objectId: string, items: WbItem[]) {
    this.wbLive.set(objectId, items);
    this.drawWhiteboard(objectId, items);
  }

  // Miniature of the whiteboard scene, drawn on the wall plane.
  private drawWhiteboard(objectId: string, items: WbItem[]) {
    const v = this.objectViews.get(objectId);
    if (!v) return;
    this.clearDisplays(v);
    this.panels.delete(objectId);
    if (!items.length) return;
    const S = 36;
    const pw = 1.72 * S;
    const ph = 34;
    const build = () => this.whiteboardContent(items, pw, ph);
    this.mountWall(v, 0.14, 0.065, 61, pw, ph, build);
    this.keepPanel(v.def, 0.14, 0.065, 61, pw, ph, build);
  }

  // ── for the third-person view: what's on each wall display ─────────────────
  // (board walls, the big screens' board or share, whiteboard miniatures), as
  // the iso view mounts it; `panelCanvas` draws one into a canvas.
  private panels = new Map<
    string,
    {
      def: WorldObjectDef;
      ox: number;
      oy: number;
      zTop: number;
      pw: number;
      ph: number;
      build: () => Container;
      version: number;
    }
  >();
  private panelVersion = 0;
  private keepPanel(
    def: WorldObjectDef,
    ox: number,
    oy: number,
    zTop: number,
    pw: number,
    ph: number,
    build: () => Container,
  ) {
    this.panels.set(def.id, { def, ox, oy, zTop, pw, ph, build, version: ++this.panelVersion });
  }
  livePanels() {
    return this.panels;
  }
  // The view as it is (the phone's camera): the whole stage, at the screen's
  // resolution, without the name tags.
  tagsHidden = false;
  snapshot(): HTMLCanvasElement | null {
    if (!this.app) return null;
    const r = this.app.renderer;
    const overlay = this.overlay.visible;
    this.overlay.visible = false;
    const canvas = r.extract.canvas({
      target: this.app.stage,
      frame: new Rectangle(0, 0, r.screen.width, r.screen.height),
      resolution: r.resolution,
    }) as HTMLCanvasElement;
    this.overlay.visible = overlay;
    return canvas;
  }

  panelCanvas(id: string, res = 4): HTMLCanvasElement | null {
    const p = this.panels.get(id);
    if (!p || !this.app) return null;
    const c = p.build();
    const canvas = this.app.renderer.extract.canvas({
      target: c,
      frame: new Rectangle(0, 0, p.pw, p.ph),
      resolution: res,
      clearColor: "#00000000",
    }) as HTMLCanvasElement;
    c.destroy({ children: true });
    return canvas;
  }
  // the screen share on a big screen right now (its video), if any
  shareVideo(id: string): HTMLVideoElement | null {
    return this.screenVideo.get(id) ?? null;
  }

  private whiteboardContent(items: WbItem[], pw: number, ph: number): Container {
    const panel = new Container();
    const g = new Graphics();
    const sx = pw / WB_W;
    const sy = ph / WB_H;
    for (const it of items.slice(-400)) {
      const col = Number.parseInt(it.c.slice(1), 16);
      if (it.k === "stroke") {
        g.moveTo(it.p[0] * sx, it.p[1] * sy);
        for (let i = 2; i < it.p.length; i += 2) g.lineTo(it.p[i] * sx, it.p[i + 1] * sy);
        g.stroke({
          width: Math.max(0.6, it.w * sx * 1.4),
          color: col,
          alpha: it.w > 12 ? 0.35 : 1,
          cap: "round",
          join: "round",
        });
      } else if (it.k === "note") {
        g.rect(it.x * sx, it.y * sy, 120 * sx, 80 * sy).fill(col);
      } else {
        g.rect(it.x * sx, it.y * sy + 2, Math.min(it.text.length * 9, 300) * sx, 1.2).fill(col);
      }
    }
    panel.addChild(g);
    return panel;
  }

  private clearDisplays(v: { displays: Container[] }) {
    for (const d of v.displays) d.destroy({ children: true });
    v.displays = [];
  }

  // Content on a back wall, cut into one masked slice per tile so each slice
  // sorts with the wall tile behind it (a single sprite would be covered by
  // the wall tiles to its right).
  private mountWall(
    v: { def: WorldObjectDef; displays: Container[] },
    ox: number,
    oy: number,
    zTop: number,
    pw: number,
    ph: number,
    build: () => Container,
  ) {
    const o = v.def;
    const S = 36;
    const hg = hangOf(o);
    // on its wall's far face this view never sees it (the 3D view draws it, from keepPanel)
    if (hg.side < 0) return;
    // on the face of the thin wall (WALL_FACE in front of the tile edge); on a
    // west wall the panel runs from its south end (the item turned to rot 3)
    const tiles = entryWallItem(o.kind);
    const west = hg.dir === "v";
    const origin = west ? toScreen(hg.ax + oy + 0.1, hg.ay + tiles - ox) : toScreen(hg.ax + ox, hg.ay + oy + 0.1);
    // a quarter of a tile per slice, like the wall and the board it's on
    for (let k = 0; k < tiles * 4; k++) {
      const u0 = Math.max(0, (k / 4 - ox) * S);
      const u1 = Math.min(pw, ((k + 1) / 4 - ox) * S);
      if (u1 <= u0) continue;
      const wrap = new Container();
      wrap.setFromMatrix(
        new Matrix(TILE_W / 2 / S, ((west ? -1 : 1) * TILE_H) / 2 / S, 0, 1, origin.x, origin.y - zTop - hg.lift),
      );
      const content = build();
      // neighbouring slices overlap by a hair (no hairline gap between them)
      const mask = new Graphics().rect(u0 - 0.5, -2, u1 - u0 + 1, ph + 4).fill(0xffffff);
      wrap.addChild(content, mask);
      content.mask = mask;
      // just over the item's next slice too: its art's edge pixels (dark glass,
      // a bezel) bleed a pixel into this one and drew a dark line at every
      // quarter tile across the picture
      wrap.zIndex = hg.ax + hg.ay + (west ? tiles - (k + 0.5) / 4 : (k + 0.5) / 4) + 0.27;
      this.sortLayer.addChild(wrap);
      v.displays.push(wrap);
    }
  }

  private drawDisplay(objectId: string) {
    const v = this.objectViews.get(objectId);
    if (!v) return;
    this.clearDisplays(v);
    const o = v.def;
    const wide = o.kind === "screen_wall";
    const tiles = wide ? 4 : 3;
    const z0 = wide ? 21 : 27;
    const z1 = wide ? 73 : 67;
    const S = 36; // panel px per tile along the wall
    const pw = (tiles - 0.28) * S;
    const ph = z1 - z0;
    const build = () => this.displayContent(objectId, wide, pw, ph);
    this.mountWall(v, 0.14, 0.06, z1, pw, ph, build);
    this.keepPanel(o, 0.14, 0.06, z1, pw, ph, build);
  }

  private displayContent(objectId: string, wide: boolean, pw: number, ph: number): Container {
    const panel = new Container();
    const video = this.screenVideo.get(objectId);
    if (video) {
      const tex = Texture.from(video);
      const sp = new Sprite(tex);
      const ar = (video.videoWidth || 16) / (video.videoHeight || 9);
      const vh = Math.min(ph, pw / ar);
      sp.width = vh * ar;
      sp.height = vh;
      sp.position.set((pw - sp.width) / 2, (ph - vh) / 2);
      panel.addChild(sp);
      const live = new Text({ text: "● LIVE", style: VFD_SMALL });
      live.tint = C.red;
      live.position.set(4, 2);
      panel.addChild(live);
    } else {
      const content = this.boardContent.get(objectId);
      const g = new Graphics();
      panel.addChild(g);
      if (!content) {
        const t = new Text({ text: wide ? "NO SIGNAL" : "— NO BOARD —", style: VFD_STYLE });
        t.alpha = 0.55;
        t.position.set(pw / 2 - t.width / 2, ph / 2 - t.height / 2);
        panel.addChild(t);
      } else {
        const title = new Text({ text: content.name.toUpperCase().slice(0, wide ? 30 : 20), style: VFD_SMALL });
        title.position.set(4, 0);
        panel.addChild(title);
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
            g.rect(x + 1.5, top + barH - (k + 1) * segH + 0.5, colW - 4, Math.max(1, segH - 1)).fill({
              color: on ? col : 0x3a2c1f,
              alpha: on ? 1 : 0.7,
            });
          }
          const label = new Text({
            text: `${s.name.toUpperCase().slice(0, Math.max(3, Math.floor(colW / 5.5) - 2))} ${s.count}`,
            style: VFD_SMALL,
          });
          label.scale.set(0.85);
          label.position.set(x + 1, ph - 10);
          panel.addChild(label);
        });
      }
    }
    return panel;
  }

  // ── avatars ──────────────────────────────────────────────────────────────
  upsertAvatar(id: string, s: AvatarState, local = false) {
    let v = this.avatars.get(id);
    if (!v) {
      const root = new Container();
      const shadow = new Graphics(PERSON_SHADOW);
      const ring = new Graphics();
      ring.isRenderGroup = true; // pulses while they speak
      const body = new Graphics();
      const sprite = new Sprite();
      sprite.anchor.set(0.5, 0.96);
      sprite.visible = false;
      const emote = new Sprite();
      emote.anchor.set(0.5, 1);
      emote.visible = false;
      root.addChild(shadow, ring, body, sprite, emote);
      root.scale.set(PERSON); // people (and Vortex) are drawn smaller than the world
      this.sortLayer.addChild(root);

      const tag = new Container();
      const tagBg = new Graphics();
      const tagText = new Text({ text: s.name, style: NAME_STYLE, resolution: 2 });
      const dot = new Graphics();
      tag.addChild(tagBg, dot, tagText);
      const bubble = new Container();
      const bubbleBg = new Graphics();
      const bubbleText = new Text({ text: "", style: BUBBLE_STYLE, resolution: 2 });
      bubble.addChild(bubbleBg, bubbleText);
      bubble.visible = false;
      this.overlay.addChild(tag, bubble);
      v = {
        sprite,
        root,
        body,
        shadow,
        ring,
        tag,
        tagText,
        tagBg,
        dot,
        emote,
        bubble,
        bubbleText,
        bubbleBg,
        bubbleUntil: 0,
        state: s,
        avatarKey: "",
        drawnFor: "",
        local,
      };
      this.avatars.set(id, v);
      this.layoutTag(v);
    }
    const o = v.state;
    if (
      o !== s &&
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
        o.recording !== s.recording)
    )
      this.activeAt = performance.now();
    const prevName = v.state.name;
    v.state = s;
    v.local = local;
    if (prevName !== s.name) {
      v.tagText.text = s.name;
      this.layoutTag(v);
    }
  }

  removeAvatar(id: string) {
    const v = this.avatars.get(id);
    if (!v) return;
    v.root.destroy({ children: true });
    v.tag.destroy({ children: true });
    v.bubble.destroy({ children: true });
    this.avatars.delete(id);
  }

  clearAvatars() {
    for (const id of [...this.avatars.keys()]) this.removeAvatar(id);
  }

  hasAvatar(id: string) {
    return this.avatars.has(id);
  }

  // How someone is drawn right now (tests, debugging): the facing shown, the
  // view and whether it's mirrored, and whether the posed rig is up.
  // where someone is drawn right now (world tiles), sitting or not, facing which way
  avatarAt(id: string): { x: number; y: number; sitting: boolean; dir: number } | null {
    const v = this.avatars.get(id);
    return v ? { x: v.state.x, y: v.state.y, sitting: v.state.a === 2, dir: v.shownDir ?? v.state.d } : null;
  }
  // 0 by day … 1 at night
  nightLevel(): number {
    return this.night;
  }

  avatarShown(id: string): { dir: number; view: string; mirror: boolean; rigged: boolean; walking: boolean } | null {
    const v = this.avatars.get(id);
    if (!v || v.shownDir === undefined) return null;
    const { view, mirror } = viewFor(v.shownDir);
    // (posed: the drawn rig, or the 3D model's sprite)
    const rigged = !!v.rig?.root.visible || (!!v.iso?.last && v.sprite.visible);
    return { dir: v.shownDir, view, mirror, rigged, walking: v.state.a === 1 };
  }

  // Someone took a photo: the flash, over their hand.
  flash(id: string) {
    const v = this.avatars.get(id);
    if (!v) return;
    if (!v.flash) {
      const g = new Graphics();
      g.blendMode = "add";
      g.circle(0, 0, 26).fill({ color: 0xfff6e0, alpha: 0.18 });
      g.circle(0, 0, 13).fill({ color: 0xffffff, alpha: 0.45 });
      g.circle(0, 0, 5).fill({ color: 0xffffff, alpha: 1 });
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 4;
        g.moveTo(Math.cos(a) * -22, Math.sin(a) * -22)
          .lineTo(Math.cos(a) * 22, Math.sin(a) * 22)
          .stroke({ width: 1.6, color: 0xffffff, alpha: 0.7 });
      }
      v.flash = g;
      this.overlay.addChild(g);
    }
    v.flashAt = performance.now();
    this.activeAt = performance.now();
  }

  say(id: string, text: string, ms = 6000) {
    const v = this.avatars.get(id);
    if (!v) return;
    v.bubbleText.text = text.length > 140 ? `${text.slice(0, 137)}…` : text;
    const w = Math.min(196, v.bubbleText.width + 16);
    const h = v.bubbleText.height + 10;
    v.bubbleBg.clear();
    v.bubbleBg
      .roundRect(-w / 2, -h, w, h, 8)
      .fill({ color: C.paper, alpha: 0.96 })
      .stroke({ width: 1, color: C.walnut, alpha: 0.6 });
    v.bubbleBg.poly([-5, 0, 5, 0, 0, 6]).fill({ color: C.paper, alpha: 0.96 });
    v.bubbleText.position.set(-w / 2 + 8, -h + 5);
    v.bubble.visible = true;
    v.bubbleUntil = performance.now() + ms;
    this.activeAt = performance.now();
  }

  private layoutTag(v: AvatarView) {
    const w = v.tagText.width + 20;
    v.tagBg.clear();
    v.tagBg.roundRect(-w / 2, -9, w, 18, 9).fill({ color: 0x1e1712, alpha: 0.78 });
    v.tagText.anchor.set(0, 0.5);
    v.tagText.position.set(-w / 2 + 14, 0);
    v.dot.position.set(-w / 2 + 8, 0);
  }

  // A circle of `earshot` tiles around me, as the iso camera sees it (an
  // ellipse), dashed and turning slowly.
  private drawEarshot(local: AvatarView | undefined) {
    const g = this.earshotG;
    if (!this.earshot || !local) {
      if (this.earshotOn) {
        g.clear();
        this.earshotOn = false;
      }
      return;
    }
    g.clear();
    this.earshotOn = true;
    const c = toScreen(local.state.x, local.state.y);
    const rx = this.earshot * (TILE_W / 2) * Math.SQRT2;
    const ry = this.earshot * (TILE_H / 2) * Math.SQRT2;
    const N = 44;
    const phase = this.reducedMotion ? 0 : this.time * 0.08;
    for (let i = 0; i < N; i++) {
      const a0 = ((i + phase) / N) * Math.PI * 2;
      const a1 = ((i + 0.55 + phase) / N) * Math.PI * 2;
      g.moveTo(c.x + Math.cos(a0) * rx, c.y + Math.sin(a0) * ry).lineTo(
        c.x + Math.cos(a1) * rx,
        c.y + Math.sin(a1) * ry,
      );
    }
    g.stroke({ width: 2, color: C.vfd, alpha: 0.38 });
  }

  // ── frame ────────────────────────────────────────────────────────────────
  update(dt: number) {
    if (!this.app) return;
    this.time += dt;
    const now = performance.now();
    const local = this.localId ? this.avatars.get(this.localId) : undefined;
    if (this.camPin) this.camFocus = { ...this.camPin };
    else if (local) {
      const p = toScreen(local.state.x, local.state.y);
      // (out on the land: the camera rides the ground's rise and fall)
      const lift = isFloorAt(this.map, local.state.x, local.state.y) ? 0 : (local.state.ground ?? 0) * ZPX_TILE;
      this.camFocus = { x: p.x, y: p.y - 30 - lift };
    }
    if (this.grounds?.land.visible) {
      const f = local ? local.state : toWorld(this.camFocus.x, this.camFocus.y);
      this.grounds.update(f.x, f.y, local ? local.state : null);
      if (this.prints) this.grounds.drawPrints(this.prints, now);
      // the night's light: the lamps, and whoever has a flashlight on
      this.grounds.setNight(this.night, this.avatars.values(), f.x, f.y);
    }
    const k = this.reducedMotion ? 1 : 1 - Math.exp(-dt * 7);
    this.cam.x += (this.camFocus.x - this.cam.x) * k;
    this.cam.y += (this.camFocus.y - this.cam.y) * k;
    this.zoom += (this.targetZoom - this.zoom) * (this.reducedMotion ? 1 : 1 - Math.exp(-dt * 10));
    this.drawEarshot(local);
    // Pixi 8's renderer.width is already in CSS pixels (it's screen.width, not
    // the canvas's pixel width) — dividing it by the resolution again made the
    // camera and the finish think the screen was half its size on 2× displays
    const { width: W, height: H } = this.app.renderer.screen;
    this.world.scale.set(this.zoom);
    this.grounds?.weatherFrame(dt, W, H, this.zoom, this.cam, this.animated(), this.map, this.landAmbient());
    this.theme?.update(dt, W, H, this.cam.x, this.cam.y, this.zoom);
    this.post?.update(W, H, dt > 0 && !this.reducedMotion); // grain only moves while time does
    this.world.position.set(Math.round(W / 2 - this.cam.x * this.zoom), Math.round(H / 2 - this.cam.y * this.zoom));

    this.stepFloorBake();
    this.stepDressing();

    this.updateLife(dt);
    for (const b of this.bumps) {
      b.t += dt;
      const k = Math.max(0, 1 - b.t / b.len);
      for (const p of b.parts) if (!p.root.destroyed) p.root.skew.x = Math.sin(b.t * 28) * b.amp * k * k;
    }
    this.bumps = this.bumps.filter((b) => b.t < b.len);
    this.stepLight();
    if (this.labelsDirty) {
      this.labelsDirty = false;
      this.drawLabels();
    }
    for (const v of this.avatars.values()) this.updateAvatar(v, dt, now);
    this.updateWalls(local);
    this.drawClocks();
    this.drawMarker(dt);
    this.drawHighlight();
    this.drawBuild(dt);
  }

  // Vortex, drawn by Yondra's own vortexSvg: same body, rim, swirl, eyes, arms.
  private updateVortex(v: AvatarView, now: number) {
    const s = v.state;
    const p = toScreen(s.x, s.y);
    const asleep = s.a === 2;
    const talking = v.bubble.visible;
    const mood: VortexMood = asleep ? "asleep" : s.emote === "fire" ? "possessed" : toVortexMood(s.vortexMood);
    // blink now and then (closed-eye drawing for ~120 ms)
    if (!v.nextBlink || now > v.nextBlink) {
      v.nextBlink = now + 2600 + Math.random() * 3400;
      v.blinkUntil = now + 130;
    }
    const blinking = !asleep && mood !== "possessed" && (v.blinkUntil ?? 0) > now;
    const tex = vortexTexture(blinking ? "dormant" : mood) ?? vortexTexture(mood);
    v.body.visible = false;
    if (v.shadow.context !== VORTEX_SHADOW) v.shadow.context = VORTEX_SHADOW;
    if (tex) {
      v.sprite.texture = tex;
      v.sprite.visible = true;
      v.sprite.anchor.set(0.5, 0.78);
    }
    const bob = this.reducedMotion ? 0 : Math.sin(this.time * (talking ? 9 : 2.4)) * (talking ? 1.6 : 3);
    const jitter = mood === "possessed" && !this.reducedMotion ? (Math.random() - 0.5) * 4 : 0;
    const k = 0.3;
    v.sprite.scale.set(
      (s.d >= 5 && s.d <= 7 ? -1 : 1) * k,
      k * (talking && !this.reducedMotion ? 1 + Math.sin(this.time * 18) * 0.025 : 1),
    );
    v.sprite.position.set(jitter, -12 + bob);
    v.root.position.set(p.x, p.y);
    this.setDepth(v.root, depthOf(s.x, s.y) + 0.02);
    // Vortex glows a little on his own: only half the shading
    const t = this.tintAt(s.x, s.y);
    v.sprite.tint =
      (((((t >> 16) & 255) + 255) >> 1) << 16) | (((((t >> 8) & 255) + 255) >> 1) << 8) | (((t & 255) + 255) >> 1);
    if (v.ringOn) {
      v.ring.clear();
      v.ringOn = false;
    }
    v.emote.visible = false;
    const inv = 1 / Math.max(0.7, this.zoom * 0.85);
    v.tag.position.set(p.x, p.y + (-66 + bob) * PERSON);
    v.tag.scale.set(inv);
    if (v.dotKey !== "vortex") {
      v.dotKey = "vortex";
      v.dot.clear().circle(0, 0, 3.2).fill(0xff2d95);
    }
    if (v.bubble.visible) {
      v.bubble.position.set(p.x, p.y + (-80 + bob) * PERSON);
      v.bubble.scale.set(inv);
      v.bubble.zIndex = 2e6;
      if (now > v.bubbleUntil) v.bubble.visible = false;
    }
  }

  // A pet (world/petview.ts): its 3D model (art/pets3d.ts) rendered from the
  // iso camera into a sprite for the way it faces and what it's doing
  // (art/pets-render.ts), its name over it.
  private updatePet(v: AvatarView, dt: number, now: number) {
    const s = v.state;
    const pet = s.pet as PetView;
    const p = toScreen(s.x, s.y);
    const P = petsArt();
    v.body.visible = false;
    if (v.shadow.context !== PET_SHADOW) v.shadow.context = PET_SHADOW;
    v.root.position.set(p.x, p.y);
    this.setDepth(v.root, depthOf(s.x, s.y) + 0.01);
    if (!P) {
      void loadPets();
      v.sprite.visible = false;
      return;
    }
    // turning goes through the facings in between, as people do
    if (v.shownDir === undefined) v.shownDir = s.d;
    if (v.shownDir !== s.d && now > (v.turnAt ?? 0)) {
      const diff = ((((s.d - v.shownDir + 12) % 8) + 8) % 8) - 4;
      v.shownDir = (v.shownDir + (diff > 0 ? 1 : -1) + 8) % 8;
      v.turnAt = now + 38;
    }
    const wall = Date.now();
    const sp = P.petRenderer().sprite(
      pet.species,
      pet.look,
      pet.outfit,
      v.shownDir,
      {
        species: pet.species,
        a: s.a,
        mode: pet.mode,
        act: pet.act,
        actAt: pet.actAt,
        feeling: pet.feeling,
        carry: pet.carry,
      },
      wall,
      s.name,
    );
    if (sp) {
      let tex = petSpriteTextures.get(sp.canvas);
      if (!tex) {
        tex = Texture.from(sp.canvas);
        tex.source.autoGenerateMipmaps = true;
        tex.source.scaleMode = "linear";
        petSpriteTextures.set(sp.canvas, tex);
      }
      v.sprite.texture = tex;
      v.sprite.visible = true;
      v.sprite.anchor.set(sp.anchorX, sp.anchorY);
      v.sprite.scale.set(sp.scale, sp.scale);
      v.sprite.rotation = 0;
      v.sprite.position.set(0, 0);
      // off the ground (a jump, a hop): the shadow stays down and shrinks; dust when it lands
      const lift = sp.lift;
      const k = 1 / (1 + lift * 2.2);
      v.shadow.scale.set(k);
      v.shadow.alpha = 0.45 + 0.55 * k;
      if ((v.petLift ?? 0) > 0.06 && lift <= 0.005) this.puff(s.x, s.y, "drop");
      v.petLift = lift;
    }
    const hurt = pet.hurtAt && wall - pet.hurtAt < PET_HURT_MS;
    v.sprite.tint = hurt ? 0xff6a5a : this.tintAt(s.x, s.y);
    if (v.ringOn) {
      v.ring.clear();
      v.ringOn = false;
    }
    v.emote.visible = false;
    const inv = 1 / Math.max(0.7, this.zoom * 0.85);
    const height = P.petRenderer().model(pet.species, pet.look, pet.outfit).height;
    const top = -(height * 39.19 + 14);
    v.tag.position.set(p.x, p.y + top * PERSON);
    v.tag.scale.set(inv);
    this.setDepth(v.tag, p.y);
    const dotKey = `pet|${pet.look.color}`;
    if (v.dotKey !== dotKey) {
      v.dotKey = dotKey;
      v.dot.clear().circle(0, 0, 3.2).fill(pet.look.color);
    }
    if (v.bubble.visible) {
      v.bubble.position.set(p.x, p.y + (top - 16) * PERSON);
      v.bubble.scale.set(inv);
      v.bubble.zIndex = 2e6;
      if (now > v.bubbleUntil) v.bubble.visible = false;
    }
    void dt;
  }

  private updateAvatar(v: AvatarView, dt: number, now: number) {
    const s = v.state;
    if (s.pet) return this.updatePet(v, dt, now);
    if (s.npc) return this.updateVortex(v, now);
    const p = toScreen(s.x, s.y);
    const sitting = s.a === 2;
    const walking = s.a === 1;
    // turning goes through the facings in between (S → SW → W), never a snap
    if (v.shownDir === undefined || s.npc) v.shownDir = s.d;
    if (v.shownDir !== s.d && now > (v.turnAt ?? 0)) {
      const diff = ((((s.d - v.shownDir + 12) % 8) + 8) % 8) - 4;
      v.shownDir = (v.shownDir + (diff > 0 ? 1 : -1) + 8) % 8;
      v.turnAt = now + 38;
    }
    const { view, mirror } = viewFor(v.shownDir);
    // off the floor (in a jump, up on something): the body up, the shadow on what's under
    // them, smaller the higher they are over it
    const z = sitting ? 0 : (s.z ?? 0);
    const ground = sitting ? 0 : Math.min(z, s.ground ?? 0);
    const air = z * JUMP_PX;
    const lift = (sitting ? 12 : 0) - air; // the drawing sits its hips on the seat
    const look = JSON.stringify(s.avatar);
    // the distance covered this frame: the walk cycle follows it
    let dist = v.last ? Math.hypot(s.x - v.last.x, s.y - v.last.y) : 0;
    if (dist > 1.5) dist = 0; // a jump (sitting down, a teleport), not a step
    v.last = { x: s.x, y: s.y };
    // the 3D model from the iso camera (world/chars/iso.ts); the drawn rig until it's in
    const model = this.modelSprite(v, dt, dist, sitting, now);
    const rigged = model || this.drawRig(v, view, mirror, sitting, look, dt, dist, walking, lift);
    if (model) {
      v.body.visible = false;
      if (v.rig) v.rig.root.visible = false;
    } else if (rigged) {
      v.sprite.visible = false;
      v.body.visible = false;
    } else {
      // nothing posed yet: the whole drawing (if the drawings are in), or a pawn
      v.sprite.visible = false;
      const tex = avatarTexture(s.avatar, view, 0, sitting);
      const keep = !tex && v.drawnFor === look && v.sprite.texture !== Texture.EMPTY && !v.sprite.texture.destroyed;
      if (tex || keep) {
        if (tex) {
          v.sprite.texture = tex;
          v.drawnFor = look;
        }
        v.sprite.visible = true;
        v.body.visible = false;
        const k = 0.5; // 128×200 texture → 64×100 px: City-pop people stand ~92 px tall
        v.sprite.scale.set((mirror ? -1 : 1) * k, k);
        v.sprite.position.set(0, lift + 2);
      } else {
        const key = `${sitting}|${look}`;
        if (key !== v.avatarKey) {
          v.body.context = pawnContext(s.avatar, sitting);
          v.avatarKey = key;
        }
        v.body.visible = true;
        v.body.scale.set((mirror ? -1 : 1) * 1.35, 1.35); // same size as the drawing it stands in for
        v.body.position.set(0, lift);
      }
    }
    v.root.position.set(p.x, p.y);
    // (up on something: drawn over it — its slice under their feet sorts after where they stand)
    const depth = depthOf(s.x, s.y) + (sitting ? 0 : 0.01);
    this.setDepth(
      v.root,
      ground > 0 && isFloorAt(this.map, s.x, s.y) ? Math.max(depth, this.topKey(s.x, s.y) + 0.02) : depth,
    );
    // people take the light where they stand
    const tint = this.tintAt(s.x, s.y);
    v.sprite.tint = tint;
    v.body.tint = tint;
    if (v.rig) for (const sp of v.rig.sprites.values()) sp.tint = tint;
    v.root.alpha = s.status === "away" ? 0.55 : 1;
    if (this.seeThrough && this.inFrontOf(this.seeThrough, s.x, s.y)) v.root.alpha *= 0.28;
    v.shadow.visible = !sitting;
    const shrink = 1 / (1 + (z - ground) * 1.6);
    v.shadow.scale.set(shrink);
    v.shadow.alpha = 0.4 + 0.6 * shrink;
    v.shadow.y = -ground * JUMP_PX;

    // speaking ring (cleared only once it was drawn: any redraw costs a rebuild)
    if (s.speaking) {
      const pulse = this.reducedMotion ? 0.7 : 0.55 + Math.sin(this.time * 12) * 0.25;
      v.ring.clear().ellipse(0, 0, 17, 8.5).stroke({ width: 2.5, color: C.amber, alpha: pulse });
      v.ringOn = true;
    } else if (v.ringOn) {
      v.ring.clear();
      v.ringOn = false;
    }

    // emote
    const emoteTex = s.emote && isEmote(s.emote) ? emoteTexture(s.emote) : null;
    if (emoteTex) {
      v.emote.texture = emoteTex;
      v.emote.width = EMOTE_PX;
      v.emote.height = EMOTE_PX;
      v.emote.visible = true;
      v.emote.position.set(0, -126 + lift + (this.reducedMotion ? 0 : Math.sin(this.time * 6) * 2));
    } else v.emote.visible = false;

    // name tag + bubble (overlay, scale-compensated so text stays crisp)
    const inv = 1 / Math.max(0.7, this.zoom * 0.85);
    v.tag.position.set(p.x, p.y + (-106 + lift) * PERSON);
    v.tag.visible = !this.tagsHidden;
    v.tag.scale.set(inv);
    this.setDepth(v.tag, v.local ? 1e6 : p.y);
    const dotColor = s.status === "dnd" ? C.rust : s.status === "away" ? C.alumDark : s.npc ? C.red : C.olive;
    const slash = !s.mic && !s.npc && !s.bot;
    // on a call: a little handset instead of the dot (so nobody waves at someone mid-call)
    const onCall = s.phone === "call" || s.phone === "video";
    const dotKey = `${dotColor}|${slash}|${onCall}`;
    if (v.dotKey !== dotKey) {
      v.dotKey = dotKey;
      if (onCall)
        v.dot
          .clear()
          .circle(0, 0, 4.2)
          .fill(0x00b8a8)
          .moveTo(-2.2, -1.6)
          .quadraticCurveTo(-1.6, 2.2, 2.2, 1.8)
          .stroke({ width: 1.6, color: 0xffffff, cap: "round" });
      else {
        v.dot.clear().circle(0, 0, 3.2).fill(dotColor);
        if (slash) v.dot.moveTo(-3, -3).lineTo(3, 3).stroke({ width: 1.4, color: C.cream });
      }
    }
    if (v.bubble.visible) {
      v.bubble.position.set(p.x, p.y + (-120 + lift) * PERSON);
      v.bubble.scale.set(inv);
      v.bubble.zIndex = 2e6;
      if (now > v.bubbleUntil) v.bubble.visible = false;
    }
    if (v.flash) {
      const k = (now - (v.flashAt ?? 0)) / 280;
      v.flash.visible = k < 1;
      if (k < 1) {
        v.flash.alpha = 1 - k * k;
        v.flash.scale.set((0.7 + k * 0.9) * PERSON * 1.4);
        v.flash.position.set(p.x + (s.phone === "selfie" ? -14 : 4) * PERSON, p.y + (-92 + lift) * PERSON);
        v.flash.zIndex = 2e6 - 1;
      }
    }
  }

  // A person as their 3D model drawn from the iso camera: a sprite per look,
  // facing, pose and frame, made on demand by the chars chunk (iso.ts). False
  // while the chunk or their model isn't in yet (the drawn rig stands in).
  private modelSprite(v: AvatarView, dt: number, dist: number, sitting: boolean, now: number): boolean {
    const C = chars();
    if (!C) {
      void loadChars();
      return false;
    }
    const iso = C.isoPeople();
    if (!iso.canDraw()) return false; // (no GPU: every sprite would stall the frame — the drawn rig)
    iso.onDrop ??= (c) => {
      personTextures.get(c)?.destroy(true);
      personTextures.delete(c);
    };
    const P = petsArt();
    if (P && !iso.toy) iso.toy = P.toyMesh;
    const s = v.state;
    v.iso ??= {};
    const sp = iso.sprite(
      v.iso,
      {
        avatar: s.avatar,
        dir: v.shownDir ?? s.d,
        a: s.a,
        dist,
        dt,
        held: s.held,
        heldAt: s.heldAt,
        phone: s.phone,
        phonePose: s.phonePose,
        phoneCase: s.phoneCase,
        mugColor: MUG_COLORS[Math.floor(seedOf(s.name) * MUG_COLORS.length)],
        recording: s.recording,
        busy: s.busy,
        emote: s.emote,
        speaking: s.speaking,
        typing: sitting && (s.busy === "computer" || this.atWork(s.x, s.y)),
        reduced: this.reducedMotion,
        act: this.actOf(v),
        jump: sitting ? null : s.jump,
      },
      now,
    );
    if (!sp) return false;
    let tex = personTextures.get(sp.canvas);
    if (!tex || tex.destroyed) {
      tex = Texture.from(sp.canvas);
      tex.source.autoGenerateMipmaps = true;
      tex.source.scaleMode = "linear";
      personTextures.set(sp.canvas, tex);
    }
    v.sprite.texture = tex;
    v.sprite.visible = true;
    v.sprite.anchor.set(sp.anchorX, sp.anchorY);
    v.sprite.scale.set(sp.scale, sp.scale);
    v.sprite.rotation = 0;
    v.sprite.position.set(0, s.a === 2 ? 0 : -(s.z ?? 0) * JUMP_PX);
    return true;
  }

  // A person as the drawn rig (the fallback where the 3D model can't be
  // drawn): posed by the people chunk (rig-draw.ts). False while nothing's
  // ready (the pawn).
  private drawRig(
    v: AvatarView,
    view: ReturnType<typeof viewFor>["view"],
    mirror: boolean,
    sitting: boolean,
    look: string,
    dt: number,
    dist: number,
    walking: boolean,
    lift: number,
  ): boolean {
    const P = people();
    if (!P) return false; // the people chunk is still loading: the pawn
    const s = v.state;
    const at = {
      reduced: this.reducedMotion,
      time: this.time,
      night: this.night,
      low: this.quality === "low",
      act: this.actOf(v),
      typing: sitting && (s.busy === "computer" || this.atWork(s.x, s.y)),
    };
    return P.drawRig(at, v, view, mirror, sitting, look, dt, dist, walking, lift, P);
  }

  // The sort key of the slice of whatever's under (x, y) (as art/scene.ts slices
  // things: a tile column along a long thing, a row across a deep one, one piece).
  private topKey(x: number, y: number): number {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    for (const v of this.objectViews.values()) {
      const o = v.def;
      const { w, h } = footprint(o.kind, o.rot ?? 0);
      if (tx < o.x || ty < o.y || tx >= o.x + w || ty >= o.y + h || !entry(o.kind).solid) continue;
      if (w > h) return tx + 0.5 + o.y + h / 2;
      if (h > w) return o.x + w / 2 + ty + 0.5;
      return o.x + w / 2 + o.y + h / 2;
    }
    return 0;
  }

  // A move with someone (shared SOCIAL): what, and how far into it.
  private actOf(v: AvatarView): { what: string; t: number; len: number } | null {
    const s = v.state;
    if (!s.act) {
      v.actKey = undefined;
      return null;
    }
    const key = `${s.act}|${s.actAt}`;
    if (v.actKey !== key) {
      v.actKey = key;
      v.actSeen = performance.now();
    }
    const kind = s.act === "take" ? "give" : s.act;
    const len = (isSocial(kind) ? SOCIAL_MS[kind] : 1500) / 1000;
    return { what: s.act, t: (performance.now() - (v.actSeen ?? 0)) / 1000, len };
  }

  // Seated at a desk with a keyboard or a screen in reach: typing.
  private workCache = new Map<string, boolean>();
  atWork(x: number, y: number): boolean {
    const k = `${Math.floor(x)},${Math.floor(y)}`;
    let w = this.workCache.get(k);
    if (w === undefined) {
      const objs = [...this.objectViews.values()].map((o) => o.def);
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

  // Wall clocks tell the time where you are: hour, minute and a red second
  // hand on the face's plane (the face is drawn by the clock's art at z 52).
  private clockTick = -1;
  private drawClocks() {
    const now = new Date();
    // the second hand sweeps in tenths: 10 redraws a second (each one rebuilds
    // the hands' draw list), and nobody can tell it from 60
    const tick = this.reducedMotion ? now.getSeconds() : Math.floor(now.getTime() / 100);
    const redraw = tick !== this.clockTick;
    this.clockTick = tick;
    const sec = now.getSeconds() + (this.reducedMotion ? 0 : Math.floor(now.getMilliseconds() / 100) / 10);
    const min = now.getMinutes() + sec / 60;
    const hr = (now.getHours() % 12) + min / 60;
    for (const v of this.objectViews.values()) {
      const g = v.hands;
      if (!g) continue;
      const part = v.parts[0];
      // (on a wall's far face it's behind the wall)
      const show = !!part?.root.visible && hangOf(v.def).side > 0;
      const fresh = show && !g.visible; // just revealed: draw now
      g.visible = show;
      g.alpha = part?.high?.alpha ?? part?.root.alpha ?? 1;
      if (!g.visible || !(redraw || fresh)) continue;
      g.clear();
      const hg = hangOf(v.def);
      const mid = (hg.u0 + hg.u1) / 2 / WQ;
      const c = hg.dir === "h" ? toScreen(mid, hg.line + 0.134) : toScreen(hg.line + 0.134, mid);
      const cy = c.y - 52 - hg.lift;
      // across the face: along +x (walls along x) or −y (west walls: left to right is north)
      const ex = hg.dir === "h" ? TILE_W / 2 : TILE_W / 2;
      const ey = hg.dir === "h" ? TILE_H / 2 : -TILE_H / 2;
      const hand = (turns: number, l: number, w: number, color: number) => {
        const a = turns * Math.PI * 2;
        const u = Math.sin(a) * 0.15 * l;
        const z = Math.cos(a) * 6.5 * l;
        g.moveTo(c.x, cy)
          .lineTo(c.x + u * ex, cy + u * ey - z)
          .stroke({ width: w, color, cap: "round" });
      };
      hand(hr / 12, 0.55, 1.5, 0x2a1430);
      hand(min / 60, 0.82, 1, 0x2a1430);
      hand(sec / 60, 0.86, 0.5, 0xc4402b);
    }
  }

  // Wall-down: the upper part of walls standing between the camera and what
  // it looks at (south / east of the view's focus) fades to its skirting, like The Sims; so do
  // the boards on them and the doors in them.
  private updateWalls(_local: AvatarView | undefined) {
    // around what you're looking at: the camera's focus (you, when it follows
    // you), or in build mode what you're carrying / pointing at
    const focus = this.focusAt ?? toWorld(this.camFocus.x, this.camFocus.y + 30);
    const px = focus.x;
    const py = focus.y;
    const k = this.reducedMotion ? 1 : 0.2;
    const fade = (v: PartView) => {
      const e = v.edge;
      if (!e?.high) return;
      const node = v.high ?? v.root;
      const cut =
        e.dir === "h"
          ? e.y > py && e.y - py < 9 && Math.abs(e.x + 0.5 - px) < 8
          : e.x > px && e.x - px < 9 && Math.abs(e.y + 0.5 - py) < 8;
      // build mode's walls up / down override it
      const down = this.wallView === "up" ? false : this.wallView === "down" ? true : cut;
      const target = down ? 0.06 : 1;
      if (Math.abs(node.alpha - target) > 0.005) node.alpha += (target - node.alpha) * k;
      else node.alpha = target;
    };
    for (const w of this.walls) fade(w);
    for (const d of this.dress) fade(d);
    for (const v of this.objectViews.values()) {
      for (const p of v.parts) fade(p);
      // live displays (boards, screens, whiteboards) go with the wall they're on
      if (v.displays.length && v.parts[0]) for (const d of v.displays) d.alpha = v.parts[0].root.alpha;
    }
  }

  // ── lighting ─────────────────────────────────────────────────────────────
  // The hour sets the ambient light; lamps, screens and displays add baked
  // light on top (walls and shut doors block it). The floor is multiplied by
  // it; walls, items and people are tinted by it where they stand. Low quality
  // keeps flat light.
  private day: Daylight = daylight(12);
  private lightMap: LightMap | null = null;
  private lightDue = 0;
  private lightCanvas: HTMLCanvasElement | null = null;
  private lightBakeMs = 0;
  private lightApplyMs = 0;

  setClock(hour: number) {
    this.day = daylight(hour);
    this.night = this.day.night;
    this.applyLight();
  }

  getDaylight(): Daylight {
    return this.day;
  }

  // compat: a 0..0.85 "night level" as a time of day
  setNight(level: number) {
    this.setClock(hourForNight(level));
  }

  setQuality(q: Quality, reducedMotion: boolean) {
    const changed = q !== this.quality;
    this.quality = q;
    this.reducedMotion = reducedMotion;
    if (changed) {
      // textures are drawn at a resolution that depends on quality
      setArtRes(this.artRes());
      for (const v of [...this.objectViews.values()]) this.upsertObject(v.def, false);
      this.bakeFloors(true);
      this.applyTheme();
      this.rebuildDressing(true);
    }
    this.applyLight();
  }

  private bakeLight(now = false) {
    this.lightDue = now ? performance.now() : performance.now() + 200;
  }

  private stepLight() {
    if (!this.lightDue || performance.now() < this.lightDue) return;
    this.lightDue = 0;
    const t = performance.now();
    this.lightMap = lightMapFor(this.map, this.allObjects());
    this.lightBakeMs = performance.now() - t;
    this.applyLight();
    this.lightApplyMs = performance.now() - t - this.lightBakeMs;
  }

  private lit(): boolean {
    return this.quality !== "low" && !!this.lightMap;
  }

  // The light at a point (baked: lamps, windows). On Low everything is white
  // here and one flat multiply layer over the scene sets the hour instead.
  private tintAt(x: number, y: number): number {
    // (out on the land: the Grounds' light, the lamps' and the flashlights')
    if (this.grounds?.land.visible && !isFloorAt(this.map, x, y)) return this.grounds.lightAt(x, y);
    return this.lit() ? (this.lightMap as LightMap).tintAt(x, y, this.day.ambient, this.day.window) : 0xffffff;
  }

  private tintObject(v: ObjectView) {
    for (const p of v.parts) {
      if (!p.at) continue;
      const t = this.tintAt(p.at[0], p.at[1]);
      if (p.sprite) p.sprite.tint = t;
      if (p.box) p.box.tint = t;
    }
  }

  private applyLight() {
    const lit = this.lit();
    // the floor: one plan-space image through the iso transform, multiplied
    this.floorLight.visible = lit;
    if (lit) {
      const lm = this.lightMap as LightMap;
      const fresh = !this.lightCanvas || this.lightCanvas.width !== lm.w || this.lightCanvas.height !== lm.h;
      this.lightCanvas = lm.composite(
        this.day.ambient,
        this.day.window,
        fresh ? undefined : (this.lightCanvas ?? undefined),
      );
      if (fresh || this.floorLight.texture === Texture.EMPTY) {
        this.floorLight.texture?.destroy(true);
        this.floorLight.texture = Texture.from(this.lightCanvas, true);
      } else this.floorLight.texture.source.update();
      this.floorLight.setFromMatrix(
        new Matrix(TILE_W / 2 / LIGHT_PX, TILE_H / 2 / LIGHT_PX, -TILE_W / 2 / LIGHT_PX, TILE_H / 2 / LIGHT_PX, 0, 0),
      );
    }
    // walls take the light of the floor in front of their face (per slice, so
    // the light runs smoothly along them)
    for (const d of this.dress) if (d.sprite && d.at) d.sprite.tint = this.tintAt(d.at[0], d.at[1]);
    for (const w of this.walls) {
      const t = w.at ? this.tintAt(w.at[0], w.at[1]) : 0xffffff;
      for (const n of [w.sprite, w.box, w.highSprite, w.highBox]) if (n) n.tint = t;
    }
    for (const v of this.objectViews.values()) {
      this.tintObject(v);
      for (const p of v.parts) this.lightEmit(p);
      if (v.flat) this.lightEmit(v.flat);
    }
    this.bloomLayer.visible = this.quality === "high" && this.night > 0.02 && !this.reducedMotion;
    // the sky outside: clouds drift unless motion is reduced
    this.theme?.setAnimate(this.animated());
    this.applyPost();
    this.theme?.setDay(this.day);
    this.grounds?.setAmbient(this.landAmbient());
    const a = this.day.ambient;
    this.shellBody.tint = (Math.round(a[0] * 255) << 16) | (Math.round(a[1] * 255) << 8) | Math.round(a[2] * 255);
    this.shellLights.alpha = Math.min(1, this.day.night * 1.1);
    this.shellLights.visible = this.day.night > 0.05;
    // Low: nothing baked — one multiply layer in the hour's ambient colour over everything
    this.darkLayer.clear();
    this.darkLayer.visible = !lit;
    if (!lit) {
      const a = this.day.ambient;
      const w = (this.map.width + this.map.height) * (TILE_W / 2);
      this.darkLayer
        .rect(-w, -WALL_H - 200, w * 2, w + 400)
        .fill((Math.round(a[0] * 255) << 16) | (Math.round(a[1] * 255) << 8) | Math.round(a[2] * 255));
    }
  }

  // ── markers / highlight ──────────────────────────────────────────────────
  showMarker(x: number, y: number) {
    this.marker = { x, y, t: 0 };
  }

  private drawMarker(dt: number) {
    if (!this.marker) {
      if (this.markerOn) {
        this.markerG.clear();
        this.markerOn = false;
      }
      return;
    }
    this.markerG.clear();
    this.markerOn = true;
    this.marker.t += dt;
    const t = this.marker.t;
    if (t > 0.9) {
      this.marker = null;
      this.markerOn = false;
      return;
    }
    const c = toScreen(this.marker.x, this.marker.y);
    const r = 6 + t * 18;
    this.markerG.ellipse(c.x, c.y, r, r / 2).stroke({ width: 2, color: C.amber, alpha: 1 - t / 0.9 });
  }

  setHighlight(id: string | null) {
    this.highlightId = id;
  }

  private drawHighlight() {
    const o = this.highlightId ? this.objectViews.get(this.highlightId)?.def : undefined;
    if (!o) {
      if (this.highlightOn) {
        this.highlightG.clear();
        this.highlightOn = false;
      }
      return;
    }
    this.highlightG.clear();
    this.highlightOn = true;
    const e = entry(o.kind);
    const a = 0.55 + (this.reducedMotion ? 0 : Math.sin(this.time * 5) * 0.25);
    // wall items: the floor in front of them, flush with their wall
    const r = e.wall ? hangStrip(o, 0.6) : wallStrip(o, 0);
    const g = e.wall ? 0 : 0.08;
    const pts = rectPts({ x0: r.x0 - g, y0: r.y0 - g, x1: r.x1 + g, y1: r.y1 + g });
    this.highlightG
      .poly(pts.flatMap((p) => [p.x, p.y]))
      .fill({ color: C.amber, alpha: 0.12 })
      .stroke({ width: 2, color: C.amber, alpha: a });
  }

  // ── build mode ────────────────────────────────────────────────────────────
  // Sims-style: pick what you see (an item's drawn shape, not the floor under
  // it), outlines for hover and selection, held items lifted off the floor
  // with their footprint in green/red below, the originals hidden while held,
  // a floor grid, and dust puffs when things land or go.
  private gridG = new Graphics();
  private ghostFloorG = new Graphics();
  private outlineG = new Graphics();
  private fxG = new Graphics();
  private ghostParts: PartView[] = [];
  private ghostItems: { def: WorldObjectDef; ok: boolean; root: Container }[] = [];
  private ghostLift = 0;
  private outlines: Outline[] = [];
  private hidden = new Set<string>();
  private hulls = new Map<string, { hull: number[]; at: number }>();
  private fx: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    t: number;
    life: number;
    r: number;
    c: number;
    sq?: boolean; // a scrap of confetti (a square, spinning), else a soft dot
    g?: number; // its fall (px/s²)
    drag?: number; // slowing down (1/s): dust that's thrown out and hangs
  }[] = [];
  pointerAt = { gx: 0, gy: 0 };
  // build mode: walls lower around this spot (world tiles) instead of the camera's focus
  focusAt: { x: number; y: number } | null = null;

  // One held thing (kept for the walls tool's door brush).
  setGhost(o: WorldObjectDef | null, valid: boolean) {
    this.setGhosts(o ? [{ def: o, ok: valid }] : [], 0);
  }

  // What you're holding: one or many, lifted `lift` px with a gentle bob.
  setGhosts(items: { def: WorldObjectDef; ok: boolean }[], lift: number) {
    for (const pv of this.ghostParts) this.unmountPart(pv);
    this.ghostParts = [];
    for (const c of this.ghostLayer.removeChildren()) c.destroy({ children: true });
    this.ghostItems = [];
    this.ghostLift = lift;
    for (const it of items) {
      const root = new Container();
      this.ghostLayer.addChild(root);
      for (const p of objectParts(it.def)) this.ghostParts.push(this.mountPart(p, root, it.ok ? 0.94 : 0.6));
      this.ghostItems.push({ ...it, root });
    }
    this.drawGhostFloor();
  }

  private drawGhostFloor() {
    const g = this.ghostFloorG.clear();
    for (const { def: o, ok } of this.ghostItems) {
      const e = entry(o.kind);
      if (e.onSurface) {
        // its cells on the top it would stand on
        this.cellsOnTop(g, o, ok);
        continue;
      }
      const { w, h } = placedFootprint(o);
      const pts = rectPts(wallStrip(o, 0.25));
      g.poly(pts.flatMap((p) => [p.x, p.y]))
        .fill({ color: ok ? C.olive : C.rust, alpha: 0.38 })
        .stroke({ width: 2, color: ok ? C.vfd : C.rust, alpha: 0.95 });
      if (e.wall) this.cellsOnWall(g, o, ok);
      if (this.ghostLift > 0 && !e.wall) {
        // the shadow of something held above the floor
        const c = toScreen(o.x + w / 2, o.y + h / 2);
        g.ellipse(c.x, c.y, 14 * Math.max(w, h), 7 * Math.max(w, h)).fill({ color: 0x000000, alpha: 0.22 });
      }
    }
  }

  // A thing on a wall: its spot on the face (the quarter tiles it takes, along
  // and up) with the face's grid faintly around it — on the faces this view
  // sees (the others are behind their wall: the strip on the floor shows it).
  private cellsOnWall(g: Graphics, o: WorldObjectDef, ok: boolean) {
    const h = hangOf(o);
    if (h.side < 0) return;
    const F = 0.1; // the face, out from the wall's line
    const at = (u: number, z: number) => {
      const p = h.dir === "h" ? toScreen(u / WQ, h.line + F) : toScreen(h.line + F, u / WQ);
      return [p.x, p.y - z];
    };
    const quad = (u0: number, u1: number, z0: number, z1: number) => [
      ...at(u0, z1),
      ...at(u1, z1),
      ...at(u1, z0),
      ...at(u0, z0),
    ];
    // the grid: a tile either side, from the skirting to the cap
    const a = Math.floor(h.u0) - WQ;
    const b = Math.ceil(h.u1) + WQ;
    for (let u = a; u <= b; u++)
      g.moveTo(...(at(u, HANG_LOW) as [number, number])).lineTo(...(at(u, HANG_HIGH) as [number, number]));
    for (let k = 0; HANG_LOW + k * WZ_PX <= HANG_HIGH; k++) {
      const z = h.z0 + (Math.round((HANG_LOW - h.z0) / WZ_PX) + k) * WZ_PX;
      if (z < HANG_LOW - 0.01 || z > HANG_HIGH) continue;
      g.moveTo(...(at(a, z) as [number, number])).lineTo(...(at(b, z) as [number, number]));
    }
    g.stroke({ width: 1, color: C.cream, alpha: 0.18 });
    g.poly(quad(h.u0, h.u1, h.z0, h.z1))
      .fill({ color: ok ? C.olive : C.rust, alpha: 0.22 })
      .stroke({ width: 1.5, color: ok ? C.vfd : C.rust, alpha: 0.9 });
  }

  // A thing on a surface: its spot (the quarter-tile cells it takes) drawn on
  // the top, with the grid of the rest of that top faintly around it.
  private cellsOnTop(g: Graphics, o: WorldObjectDef, ok: boolean) {
    const z = Number(o.props?.z) || 0;
    const quad = (x0: number, y0: number, x1: number, y1: number) =>
      [toScreen(x0, y0), toScreen(x1, y0), toScreen(x1, y1), toScreen(x0, y1)].flatMap((p) => [p.x, p.y - z]);
    const host = hostOf(this.allObjects(), o) ?? surfaceAt(this.allObjects(), Math.floor(o.x), Math.floor(o.y));
    // (not a desk that's in hand itself: its grid would show where it was)
    if (host && z > 0 && !this.hidden.has(host.id)) {
      const { w, h } = footprint(host.kind, host.rot ?? 0);
      for (let qy = 0; qy < h * Q; qy++)
        for (let qx = 0; qx < w * Q; qx++) {
          const x = host.x + qx / Q;
          const y = host.y + qy / Q;
          g.poly(quad(x + 0.025, y + 0.025, x + 1 / Q - 0.025, y + 1 / Q - 0.025))
            .fill({ color: 0xfff0d0, alpha: 0.13 })
            .stroke({ width: 0.75, color: 0xfff0d0, alpha: 0.35 });
        }
    }
    const r = topRect(o);
    g.poly(quad(r.x / Q, r.y / Q, (r.x + r.w) / Q, (r.y + r.h) / Q))
      .fill({ color: ok ? C.olive : C.rust, alpha: 0.45 })
      .stroke({ width: 1.5, color: ok ? C.vfd : C.rust, alpha: 0.95 });
  }

  // Hide placed things while they're in your hand (or being moved).
  setHidden(ids: Iterable<string>) {
    const next = new Set(ids);
    for (const id of this.hidden) if (!next.has(id)) this.showOne(id, true);
    for (const id of next) if (!this.hidden.has(id)) this.showOne(id, false);
    this.hidden = next;
    this.redrawFlat();
  }
  private showOne(id: string, on: boolean) {
    const v = this.objectViews.get(id);
    if (v) this.showView(v, on);
    for (const d of this.dress) if (d.piece?.id === id) d.root.visible = on;
  }
  private showView(v: ObjectView, on: boolean) {
    for (const p of v.parts) p.root.visible = on;
    if (v.shadow) v.shadow.root.visible = on;
    if (v.flat) v.flat.root.visible = on;
    for (const d of v.displays) d.visible = on;
  }

  setOutlines(list: Outline[]) {
    this.outlines = list;
  }

  // ── while the third-person view shows ──────────────────────────────────────
  // it answers what's under the pointer and where things are on screen, and
  // draws what build mode shows (from `buildLook`)
  picksOverride: ((filter?: (o: WorldObjectDef) => boolean) => Pick[]) | null = null;
  clientOverride: ((x: number, y: number, z: number) => { x: number; y: number }) | null = null;
  floorOverride: ((clientX: number, clientY: number, z: number) => { x: number; y: number }) | null = null;
  private edgeGhosts: EdgeGhost[] = [];
  private rectGhost: { x: number; y: number; w: number; h: number; ok: boolean } | null = null;
  private gridOn = false;
  buildLook() {
    return {
      ghosts: this.ghostItems.map((g) => ({ def: g.def, ok: g.ok })),
      lift: this.ghostLift,
      edges: this.edgeGhosts,
      faces: this.faceGhosts,
      wallView: this.wallView,
      rect: this.rectGhost,
      spawn: this.spawnOn ? { at: this.map.spawn, pick: this.spawnPick } : null,
      outlines: this.outlines,
      hidden: this.hidden,
      grid: this.gridOn,
    };
  }

  setBuildGrid(on: boolean) {
    this.gridOn = on;
    const g = this.gridG.clear();
    if (!on) return;
    for (let y = 0; y < this.map.height; y++)
      for (let x = 0; x < this.map.width; x++) {
        if (!isFloor(tileAt(this.map, x, y))) continue;
        const a = toScreen(x, y);
        const b = toScreen(x + 1, y);
        const c = toScreen(x + 1, y + 1);
        const d = toScreen(x, y + 1);
        g.moveTo(a.x, a.y).lineTo(b.x, b.y).lineTo(c.x, c.y).lineTo(d.x, d.y).closePath();
      }
    g.stroke({ width: 1, color: 0xfff0d0, alpha: 0.12 });
  }

  // Dust when something lands, a poof when it goes (world tiles).
  // the third-person view draws the same bursts (set while it shows)
  onPuff: ((x: number, y: number, kind: PuffKind, lift: number, hard: number) => void) | null = null;

  /** `lift`: px off the floor; `hard` (a jump's "land" / "kick"): how hard, 0..1 */
  puff(x: number, y: number, kind: PuffKind = "drop", lift = 0, hard = 1) {
    this.onPuff?.(x, y, kind, lift, hard);
    if (!this.animated()) return;
    const c = toScreen(x, y);
    if (kind === "land" || kind === "kick") {
      // a jump: its dust (jumps.ts), once that's in
      for (const p of jumps()?.jumpDust(kind, hard, c.x, c.y - lift) ?? []) this.fx.push(p);
      return;
    }
    if (kind === "spark") {
      // where two hands meet: a few warm sparks
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + Math.random() * 0.3;
        const sp = 46 * (0.6 + Math.random() * 0.6);
        this.fx.push({
          x: c.x,
          y: c.y - lift,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp * 0.8,
          t: 0,
          life: 0.45,
          r: 1.6 + Math.random() * 1.4,
          c: Math.random() < 0.5 ? 0xffd27a : 0xfff1d0,
          g: 10,
        });
      }
      return;
    }
    if (kind === "confetti") {
      // a card done: confetti over their head
      const colors = [0xffa630, 0xc4402b, 0x9aa67e, 0xf1e4cf, 0x6fa3b8, 0xffd27a];
      for (let i = 0; i < 36; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
        const sp = 70 + Math.random() * 70;
        this.fx.push({
          x: c.x + (Math.random() - 0.5) * 10,
          y: c.y - lift,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          t: 0,
          life: 1.5 + Math.random() * 0.6,
          r: 1.8 + Math.random() * 1.4,
          c: colors[i % colors.length],
          sq: true,
          g: 150,
        });
      }
      return;
    }
    const n = kind === "poof" ? 18 : 10;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const sp = (kind === "poof" ? 38 : 26) * (0.6 + Math.random() * 0.6);
      this.fx.push({
        x: c.x,
        y: c.y - (kind === "poof" ? 18 : 2),
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp * 0.5 - (kind === "poof" ? 18 : 4),
        t: 0,
        life: kind === "poof" ? 0.55 : 0.4,
        r: kind === "poof" ? 4 + Math.random() * 3 : 2.5 + Math.random() * 2,
        c: kind === "poof" ? 0xf1e4cf : 0xd9c6a4,
      });
    }
  }

  private drawBuild(dt: number) {
    // held items bob a little above the floor
    if (this.ghostItems.length) {
      const bob = this.ghostLift > 0 && !this.reducedMotion ? Math.sin(this.time * 4) * 2 : 0;
      for (const it of this.ghostItems) it.root.y = -this.ghostLift + bob;
    }
    const g = this.outlineG;
    if (this.outlines.length || this.outlineOn) g.clear();
    this.outlineOn = this.outlines.length > 0;
    for (const o of this.outlines) {
      const hull = o.dress ? this.dressHull(o.id) : this.hullOf(o.id);
      if (!hull) continue;
      g.poly(hull)
        .fill({ color: o.color, alpha: o.fill ?? 0.08 })
        .stroke({ width: 2, color: o.color, alpha: 0.95 });
    }
    const f = this.fxG;
    if (this.fx.length || this.fxOn) f.clear();
    this.fxOn = this.fx.length > 0;
    if (!this.fx.length) return;
    for (const p of this.fx) {
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += (p.g ?? 30) * dt;
      if (p.drag) {
        const d = Math.max(0, 1 - p.drag * dt);
        p.vx *= d;
        p.vy *= d;
      }
      const k = 1 - p.t / p.life;
      if (k <= 0) continue;
      if (p.sq) {
        // confetti: drifts, flutters (squashed as it turns)
        p.vx *= 1 - dt * 1.5;
        const flip = Math.abs(Math.sin(p.t * 9 + p.r * 3));
        f.rect(p.x - p.r, p.y - p.r * flip, p.r * 2, p.r * 2 * flip + 0.4).fill({
          color: p.c,
          alpha: Math.min(1, k * 2),
        });
      } else f.circle(p.x, p.y, p.r * (1.3 - k * 0.3)).fill({ color: p.c, alpha: 0.55 * k });
    }
    this.fx = this.fx.filter((p) => p.t < p.life);
  }

  // An object's silhouette on screen: its footprint on the floor, raised to the
  // top of its drawing, as one convex shape (world px). Cached briefly.
  private hullOf(id: string): number[] | null {
    const v = this.objectViews.get(id);
    if (!v) return null;
    const c = this.hulls.get(id);
    if (c && performance.now() - c.at < 500) return c.hull;
    const o = v.def;
    const e = entry(o.kind);
    const strip = wallStrip(o, 0.12);
    // things on a surface stand on their cells, raised to the top
    const r = e.onSurface ? topRect(o) : null;
    const lift = r ? Number(o.props?.z) || 0 : 0;
    const base = (
      r
        ? [
            toScreen(r.x / Q, r.y / Q),
            toScreen((r.x + r.w) / Q, r.y / Q),
            toScreen((r.x + r.w) / Q, (r.y + r.h) / Q),
            toScreen(r.x / Q, (r.y + r.h) / Q),
          ]
        : rectPts(strip)
    ).map((p) => ({ x: p.x, y: p.y - lift }));
    let top = Number.POSITIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;
    for (const p of v.parts) {
      const b = p.root.getLocalBounds();
      if (!Number.isFinite(b.minY) || b.maxY <= b.minY) continue;
      top = Math.min(top, p.root.y + b.minY);
      bottom = Math.max(bottom, p.root.y + b.maxY);
    }
    const ground = Math.min(...base.map((p) => p.y));
    const groundLow = Math.max(...base.map((p) => p.y));
    const zTop = Number.isFinite(top) ? Math.max(e.wall ? 10 : 3, ground - top) : 18;
    // wall items hang above the floor: start at the bottom of their drawing
    const zLow = e.wall && Number.isFinite(bottom) ? Math.max(0, groundLow - bottom) : 0;
    const pts: { x: number; y: number }[] = [];
    for (const p of base) pts.push({ x: p.x, y: p.y - zLow }, { x: p.x, y: p.y - zTop });
    const hull = convexHull(pts).flatMap((p) => [p.x, p.y]);
    this.hulls.set(id, { hull, at: performance.now() });
    return hull;
  }

  private dressHull(id: string): number[] | null {
    const pv = this.dress.find((d) => d.piece?.id === id);
    if (!pv) return null;
    const b = pv.root.getLocalBounds();
    if (!Number.isFinite(b.minX)) return null;
    // the drawing's box, trimmed of its transparent margin
    const ix = (b.maxX - b.minX) * 0.18;
    const iy = (b.maxY - b.minY) * 0.12;
    const x0 = pv.root.x + b.minX + ix;
    const x1 = pv.root.x + b.maxX - ix;
    const y0 = pv.root.y + b.minY + iy;
    const y1 = pv.root.y + b.maxY - iy;
    return [x0, y0, x1, y0, x1, y1, x0, y1];
  }

  // Build mode's pick at the pointer: the front-most drawn thing (rugs last),
  // or a piece of clutter. `filter` skips objects (held ones, say).
  pickAt(gx?: number, gy?: number, filter?: (o: WorldObjectDef) => boolean): Pick | null {
    return this.picksAt(gx, gy, filter)[0] ?? null;
  }

  // Everything under the pointer, front first (Tab steps through them in build
  // mode: a plant's leaves over the one behind it, a mug on a desk…).
  picksAt(gx?: number, gy?: number, filter?: (o: WorldObjectDef) => boolean): Pick[] {
    // (at the pointer, in third person: what its camera sees there)
    if (gx === undefined && this.picksOverride) return this.picksOverride(filter);
    gx ??= this.pointerAt.gx;
    gy ??= this.pointerAt.gy;
    return this.picksAtLocal(
      (gx - this.world.position.x) / this.zoom,
      (gy - this.world.position.y) / this.zoom,
      filter,
    );
  }
  private picksAtLocal(px: number, py: number, filter?: (o: WorldObjectDef) => boolean): Pick[] {
    const found: { pick: Pick; key: number }[] = [];
    for (const [id, v] of this.objectViews) {
      const o = v.def;
      const e = entry(o.kind);
      if (!e.buildable || this.hidden.has(id) || (filter && !filter(o))) continue;
      const hull = this.hullOf(id);
      if (!hull || !inConvex(hull, px, py)) continue;
      const { w, h } = placedFootprint(o);
      const flat = o.kind === "rug" || o.kind === "standup_mat";
      // small things on a surface win over the surface (and what's behind it)
      const top = e.onSurface ? topCentre(o) : null;
      const key = top ? 500 + top.x + top.y : (flat ? -1000 : 0) + o.x + o.y + (w + h) / 2;
      found.push({ pick: { id, dress: false }, key });
    }
    for (const d of this.dress) {
      if (!d.piece || !d.root.visible) continue;
      const hull = this.dressHull(d.piece.id);
      if (!hull || !inConvex(hull, px, py)) continue;
      const key = (d.at ? d.at[0] + d.at[1] : 0) + 0.7;
      found.push({ pick: { id: d.piece.id, dress: true, kind: d.piece.kind }, key });
    }
    return found.sort((a, b) => b.key - a.key).map((f) => f.pick);
  }

  // ── input ────────────────────────────────────────────────────────────────
  screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    if (this.floorOverride) return this.floorOverride(clientX, clientY, 0);
    const rect = this.app.canvas.getBoundingClientRect();
    const sx = (clientX - rect.left - this.world.position.x) / this.zoom;
    const sy = (clientY - rect.top - this.world.position.y) / this.zoom;
    return toWorld(sx, sy);
  }

  // The world point under the pointer at height `z` px (on a surface that
  // high), as this view sees it — or the third-person view's camera.
  // the third-person view is showing (it sees every side of things)
  get seesAllSides(): boolean {
    return this.floorOverride !== null;
  }

  // The ray from the camera through the pointer (world tiles, z in iso px):
  // straight down the view here, or the third-person camera's.
  rayOverride: ((clientX: number, clientY: number) => Ray) | null = null;
  pointerRay(): Ray | null {
    const r = this.app.canvas.getBoundingClientRect();
    if (this.rayOverride) return this.rayOverride(r.left + this.pointerAt.gx, r.top + this.pointerAt.gy);
    const H = 600;
    const a = this.pointerWorld(H);
    const b = this.pointerWorld(0);
    return { o: { x: a.x, y: a.y, z: H }, d: { x: b.x - a.x, y: b.y - a.y, z: -H } };
  }
  // The same ray from any point on the screen (client px): the game tables read
  // the pointer through their own overlay.
  rayAt(clientX: number, clientY: number): Ray {
    if (this.rayOverride) return this.rayOverride(clientX, clientY);
    const H = 600;
    const a = this.screenToWorld(clientX, clientY + H * this.zoom);
    const b = this.screenToWorld(clientX, clientY);
    return { o: { x: a.x, y: a.y, z: H }, d: { x: b.x - a.x, y: b.y - a.y, z: -H } };
  }
  // The walls this view looks through right now (cut away / faded): "h3,4" keys.
  throughOverride: (() => Set<string>) | null = null;
  lookedThrough(): Set<string> {
    if (this.throughOverride) return this.throughOverride();
    const out = new Set<string>();
    for (const v of this.walls) {
      const e = v.edge;
      if (e && (v.high ?? v.root).alpha < 0.5) out.add(`${e.dir}${e.x},${e.y}`);
    }
    return out;
  }

  pointerWorld(z = 0): { x: number; y: number } {
    if (this.floorOverride) {
      const r = this.app.canvas.getBoundingClientRect();
      return this.floorOverride(r.left + this.pointerAt.gx, r.top + this.pointerAt.gy, z);
    }
    const r = this.app.canvas.getBoundingClientRect();
    return this.screenToWorld(r.left + this.pointerAt.gx, r.top + this.pointerAt.gy + z * this.zoom);
  }

  worldToClient(x: number, y: number, z = 0): { x: number; y: number } {
    if (this.clientOverride) return this.clientOverride(x, y, z);
    const p = toScreen(x, y);
    return { x: this.world.position.x + p.x * this.zoom, y: this.world.position.y + (p.y - z) * this.zoom };
  }

  private pickAvatar(gx: number, gy: number): string | null {
    let best: string | null = null;
    let bestKey = -1;
    for (const [id, v] of this.avatars) {
      const p = toScreen(v.state.x, v.state.y);
      // the person's body: ~92 px tall since the City-pop redraw; a pet: wide and low
      const [hw, hh] = v.state.pet ? [30 * PERSON, 44 * PERSON] : [16 * PERSON, 92 * PERSON];
      if (gx > p.x - hw && gx < p.x + hw && gy > p.y - hh && gy < p.y + 6) {
        const k = v.state.x + v.state.y;
        if (k > bestKey) {
          bestKey = k;
          best = id;
        }
      }
    }
    return best;
  }

  private pickObject(wx: number, wy: number, gx: number, gy: number): string | null {
    let best: string | null = null;
    let bestKey = -1;
    for (const [id, v] of this.objectViews) {
      const o = v.def;
      const e = entry(o.kind);
      if (!e.interact) continue;
      const { w, h } = placedFootprint(o);
      let hit = wx >= o.x && wx < o.x + w && wy >= o.y && wy < o.y + h;
      if (e.wall) {
        // wall items are hit on their face of the wall (the faces this view sees)
        const hg = hangOf(o);
        const at = (u: number) => (hg.dir === "h" ? toScreen(u / WQ, hg.line) : toScreen(hg.line, u / WQ));
        const a = at(hg.u0);
        const b = at(hg.u1);
        const t = (gx - a.x) / (b.x - a.x);
        const yLine = a.y + (b.y - a.y) * t;
        hit = hg.side > 0 && t >= 0 && t <= 1 && gy <= yLine - hg.z0 + 4 && gy >= yLine - hg.z1 - 4;
        // on a wall's far face (behind its wall here): the floor in front of it
        if (hg.side < 0) {
          const r = hangStrip(o, 0.8);
          hit = wx >= r.x0 && wx < r.x1 && wy >= r.y0 && wy < r.y1;
        }
      } else if (!hit) {
        // tall things: allow clicking on the body above the footprint
        const c = toScreen(o.x + w / 2, o.y + h / 2);
        hit = Math.abs(gx - c.x) < 22 * Math.max(w, h) && gy < c.y + 8 && gy > c.y - 56;
      }
      if (hit && o.x + o.y > bestKey) {
        bestKey = o.x + o.y;
        best = id;
      }
    }
    if (best) return best;
    // the rest with something to do (a chair to sit on, my desk…): by their drawn outline
    return this.picksAtLocal(gx, gy, (o) => !entry(o.kind).interact && hasActions(o)).find((p) => !p.dress)?.id ?? null;
  }

  // ── pets' toys (shared/pets.ts): in the air, on the floor ────────────────
  private toyViews = new Map<string, { root: Container; sprite: Sprite; shadow: Graphics; kind: string }>();
  setToys(list: { id: string; kind: string; x: number; y: number; z: number }[]) {
    const seen = new Set<string>();
    const P = petsArt();
    if (!P && list.length) void loadPets();
    for (const t of list) {
      seen.add(t.id);
      let v = this.toyViews.get(t.id);
      if (!v) {
        const root = new Container();
        const shadow = new Graphics(PET_SHADOW);
        shadow.scale.set(0.5);
        const sprite = new Sprite();
        sprite.visible = false;
        root.addChild(shadow, sprite);
        root.scale.set(PERSON);
        this.sortLayer.addChild(root);
        v = { root, sprite, shadow, kind: t.kind };
        this.toyViews.set(t.id, v);
      }
      if (!v.sprite.visible && P) {
        const sp = P.toySpriteOf(P.petRenderer(), t.kind);
        if (sp) {
          let tex = petSpriteTextures.get(sp.canvas);
          if (!tex) {
            tex = Texture.from(sp.canvas);
            petSpriteTextures.set(sp.canvas, tex);
          }
          v.sprite.texture = tex;
          v.sprite.anchor.set(sp.anchorX, sp.anchorY);
          v.sprite.scale.set(sp.scale, sp.scale);
          v.sprite.visible = true;
        }
      }
      const p = toScreen(t.x, t.y);
      v.root.position.set(p.x, p.y);
      v.sprite.position.y = -t.z * 39.19;
      const k = 1 / (1 + t.z * 1.6);
      v.shadow.scale.set(0.5 * k);
      v.shadow.alpha = 0.5 + 0.5 * k;
      v.sprite.tint = this.tintAt(t.x, t.y);
      this.setDepth(v.root, depthOf(t.x, t.y) + 0.005);
    }
    for (const [id, v] of this.toyViews)
      if (!seen.has(id)) {
        v.root.destroy({ children: true });
        this.toyViews.delete(id);
      }
  }
  private pickToy(gx: number, gy: number): string | null {
    for (const [id, v] of this.toyViews) {
      const p = v.root.position;
      if (Math.abs(gx - p.x) < 16 && gy > p.y - 30 && gy < p.y + 6) return id;
    }
    return null;
  }

  // Build mode: taps go through people (and Vortex) to the floor and furniture;
  // with the Walls tool, through things too (an elevator's car stood over the
  // walls round it, and a click on them did nothing).
  passAvatars = false;
  passObjects = false;

  private handleTap(e: FederatedPointerEvent) {
    const gx = (e.global.x - this.world.position.x) / this.zoom;
    const gy = (e.global.y - this.world.position.y) / this.zoom;
    let w = toWorld(gx, gy);
    // out on the land the ground rises: the point drawn there is that much higher
    if (this.grounds?.land.visible && this.groundsMod && !isFloorAt(this.map, w.x, w.y)) {
      const { x: ox, y: oy } = this.groundsAt;
      for (let i = 0; i < 4; i++) w = toWorld(gx, gy + this.groundsMod.G.heightAt(w.x + ox, w.y + oy) * ZPX_TILE);
    }
    const av = this.passAvatars ? null : this.pickAvatar(gx, gy);
    // clicking yourself is handled too (it opens your look)
    const at = { x: e.clientX, y: e.clientY };
    if (av) return this.events.onAvatarClick?.(av, at);
    const toy = this.pickToy(gx, gy);
    if (toy) return this.events.onToyClick?.(toy);
    const obj = this.passObjects ? null : this.pickObject(w.x, w.y, gx, gy);
    if (obj) return this.events.onObjectClick?.(obj, at);
    this.events.onTileClick?.(w.x, w.y, { shift: e.shiftKey, right: e.button === 2 });
  }

  private hoverId: string | null = null;
  private labelsDirty = false;
  private handleHover(e: FederatedPointerEvent) {
    this.pointerAt = { gx: e.global.x, gy: e.global.y };
    const gx = (e.global.x - this.world.position.x) / this.zoom;
    const gy = (e.global.y - this.world.position.y) / this.zoom;
    const w = toWorld(gx, gy);
    this.events.onPointerWorld?.(w.x, w.y);
    const id = this.pickObject(w.x, w.y, gx, gy);
    const av = this.passAvatars ? null : this.pickAvatar(gx, gy);
    this.app.canvas.style.cursor = id || av ? "pointer" : "default";
    if (id !== this.hoverId) {
      this.hoverId = id;
      this.events.onHoverObject?.(id);
    }
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (this.events.onWheel?.(e.deltaY)) return;
    this.setZoom(this.targetZoom * (e.deltaY > 0 ? 0.9 : 1.1));
  };

  // two-finger pinch to zoom (phones, tablets)
  private touches = new Map<number, { x: number; y: number }>();
  private pinchFrom = 0;
  private onTouch = (e: PointerEvent) => {
    if (e.pointerType !== "touch") return;
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.touches.size !== 2) return;
    const [a, b] = [...this.touches.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (!this.pinchFrom) this.pinchFrom = d / this.targetZoom;
    else this.setZoom(d / this.pinchFrom);
  };
  private onTouchEnd = (e: PointerEvent) => {
    this.touches.delete(e.pointerId);
    if (this.touches.size < 2) this.pinchFrom = 0;
  };

  // Fixed camera on a world point (review shots, screenshot regression); null follows you again.
  // `ease`: glide there (and to the zoom) instead of cutting (leaning in on the slot-car track).
  private camPin: { x: number; y: number } | null = null;
  // `zoomMax`: how far it may lean in while pinned (a game table fills the view)
  private zoomCap = 0;
  pinCamera(at: { x: number; y: number; zoom?: number; z?: number; ease?: boolean; zoomMax?: number } | null) {
    if (!at) {
      this.camPin = null;
      this.zoomCap = 0;
      return;
    }
    this.zoomCap = at.zoomMax ?? 0;
    const p = toScreen(at.x, at.y);
    this.camPin = { x: p.x, y: p.y - (at.z ?? 0) };
    if (!at.ease) this.cam = { ...this.camPin };
    if (at.zoom && at.ease) this.setZoom(at.zoom);
    else if (at.zoom) this.zoom = this.targetZoom = at.zoom;
  }

  // Leaning in over something (the slot-car track): people standing between it
  // and the camera turn see-through, so they don't hide what you're watching.
  seeThrough: { x: number; y: number; w: number; h: number } | null = null;
  private inFrontOf(r: { x: number; y: number; w: number; h: number }, x: number, y: number): boolean {
    const sx = x - y;
    if (sx < r.x - r.y - r.h - 0.6 || sx > r.x + r.w - r.y + 0.6) return false; // beside it on screen
    const d = x + y - (r.x + r.y);
    return d > Math.min(r.w, r.h) && d < r.w + r.h + 4;
  }

  // Things drawn live by a lazy module (the slot cars): sorted with the room.
  mountLive(c: Container) {
    this.sortLayer.addChild(c);
  }
  // the draw order of a thing's front-most piece (a live picture goes just over it)
  frontKey(id: string): number | null {
    const v = this.objectViews.get(id);
    if (!v?.parts.length) return null;
    return Math.max(...v.parts.map((p) => p.root.zIndex));
  }
  // live content on a wall item's face, sliced like the wall (mountWall); the
  // caller destroys what comes back
  mountWallLive(
    o: WorldObjectDef,
    ox: number,
    oy: number,
    zTop: number,
    pw: number,
    ph: number,
    build: () => Container,
  ) {
    const holder = { def: o, displays: [] as Container[] };
    this.mountWall(holder, ox, oy, zTop, pw, ph, build);
    return holder.displays;
  }
  // how faded a thing is right now (a wall you're behind, cut away; 0 while a
  // builder carries it): live pictures on it go with it
  partAlpha(id: string): number {
    const r = this.objectViews.get(id)?.parts[0]?.root;
    if (!r) return 1;
    return r.visible ? r.alpha : 0; // hidden: in a builder's hand
  }
  // a big screen showing someone's screen share right now
  showsShare(id: string): boolean {
    return this.screenVideo.has(id);
  }
  // the light where a live thing is (its tint)
  liveTint(x: number, y: number): number {
    return this.tintAt(x, y);
  }
  // reduced motion: live things skip their flourishes (a crashed car's spin)
  stillMotion(): boolean {
    return this.reducedMotion;
  }

  setZoom(z: number) {
    this.targetZoom = Math.max(0.55 * WORLD_SCALE, Math.min(Math.max(2.4 * WORLD_SCALE, this.zoomCap), z));
  }

  getZoom() {
    return this.targetZoom;
  }

  // Draw a frame now (the controller paces them; see init's autoStart).
  render() {
    if (!this.app) return;
    this.app.render();
    const now = performance.now();
    if (this.renderedAt) this.fpsNow += (1000 / Math.max(1, now - this.renderedAt) - this.fpsNow) * 0.05;
    this.renderedAt = now;
  }

  // A thing's depth in the sort layer (or the overlay). Pixi re-sorts the
  // whole layer — and rebuilds its draw list — on any zIndex change, so the
  // value is only set when the order would change: while the new depth still
  // lies between the neighbours', the drawn order is already right.
  private setDepth(node: Container, z: number) {
    if (node.zIndex === z) return;
    const parent = node.parent;
    if (parent && !parent.sortDirty) {
      const kids = parent.children;
      let i = node.sortIndex ?? -1;
      if (kids[i] !== node) i = kids.indexOf(node);
      node.sortIndex = i;
      if (i >= 0) {
        const lo = i > 0 ? kids[i - 1].zIndex : -Infinity;
        const hi = i < kids.length - 1 ? kids[i + 1].zIndex : Infinity;
        if (z >= lo && z <= hi) return;
      }
    }
    node.zIndex = z;
  }

  // Something is in motion that wants every frame (the camera settling, a
  // marker, dust, a held item); otherwise idle frames can be skipped.
  busy(): boolean {
    return (
      !!this.marker ||
      this.fx.length > 0 ||
      this.bumps.length > 0 ||
      this.ghostItems.length > 0 ||
      Math.abs(this.targetZoom - this.zoom) > 0.002 ||
      Math.hypot(this.camFocus.x - this.cam.x, this.camFocus.y - this.cam.y) > 0.5
    );
  }

  stats() {
    return {
      fps: this.fpsNow || (this.app?.ticker.FPS ?? 0),
      avatars: this.avatars.size,
      objects: this.objectViews.size,
      children: this.sortLayer.children.length,
      items: { ...itemTextureStats(), art: itemArtLoaded() },
      floor: this.floorStats,
      light: { bakeMs: Math.round(this.lightBakeMs * 10) / 10, applyMs: Math.round(this.lightApplyMs * 10) / 10 },
    };
  }

  destroy() {
    this.destroyed = true;
    if (!this.app) return;
    this.app.canvas.removeEventListener("wheel", this.onWheel);
    this.app.canvas.removeEventListener("pointerdown", this.onTouch);
    this.app.canvas.removeEventListener("pointermove", this.onTouch);
    this.app.canvas.removeEventListener("pointerup", this.onTouchEnd);
    this.app.canvas.removeEventListener("pointercancel", this.onTouchEnd);
    this.app.destroy(true, { children: true });
  }
}

// Convex hull (monotone chain), clockwise on screen.
function convexHull(pts: { x: number; y: number }[]): { x: number; y: number }[] {
  const p = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: typeof p = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: typeof p = [];
  for (const q of [...p].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

// Is (x, y) inside a convex polygon given as flat [x0, y0, x1, y1, …]?
function inConvex(poly: number[], x: number, y: number): boolean {
  let sign = 0;
  const n = poly.length / 2;
  for (let i = 0; i < n; i++) {
    const ax = poly[i * 2];
    const ay = poly[i * 2 + 1];
    const bx = poly[((i + 1) % n) * 2];
    const by = poly[((i + 1) % n) * 2 + 1];
    const c = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    if (c === 0) continue;
    const s = Math.sign(c);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
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

// A wall material drawn flat on a face (the Walls tool's preview): its colours
// and its pattern, enough to tell plaster from brick at a glance.
function previewMat(
  g: Graphics,
  mat: string,
  quad: (u0: number, u1: number, z0: number, z1: number) => number[],
  top: number,
  alpha: number,
) {
  const lines = (pts: [number, number, number, number][], color: number, a = 0.55) => {
    for (const [u0, z0, u1, z1] of pts) {
      const q = quad(u0, u1, z0, z1);
      g.moveTo(q[6], q[7]).lineTo(q[2], q[3]);
    }
    g.stroke({ width: 0.8, color, alpha: a * alpha });
  };
  g.poly(quad(0, 1, 0, 5)).fill({ color: 0x3e2718, alpha }); // the skirting
  switch (mat) {
    case "w": {
      g.poly(quad(0, 1, 5, top)).fill({ color: 0x6b4430, alpha });
      lines(
        [1 / 3, 2 / 3].map((u) => [u, 5, u, top] as [number, number, number, number]),
        0x3e2718,
      );
      return;
    }
    case "f": {
      g.poly(quad(0, 1, 5, top)).fill({ color: 0x8a3b2e, alpha });
      for (let z = 8; z < top - 6; z += 8)
        for (let i = 0; i < 4; i++)
          if ((i + z / 8) % 2 === 0)
            g.poly(quad(i * 0.25 + 0.02, i * 0.25 + 0.23, z, z + 7)).fill({ color: 0x9e4a36, alpha });
      return;
    }
    case "b": {
      g.poly(quad(0, 1, 5, top)).fill({ color: 0x9a4a30, alpha });
      const ls: [number, number, number, number][] = [];
      for (let z = 10; z < top - 3; z += 5) ls.push([0, z, 1, z]);
      lines(ls, 0xd9cba9, 0.7);
      return;
    }
    case "k": {
      g.poly(quad(0, 1, 5, 28)).fill({ color: 0x5b3a26, alpha });
      g.poly(quad(0, 1, 28, top)).fill({ color: 0xc49a6c, alpha });
      for (let i = 0; i < 14; i++) {
        const u = ((i * 37) % 97) / 97;
        const z = 30 + (((i * 53) % 89) / 89) * (top - 36);
        g.poly(quad(u, u + 0.02, z, z + 1.2)).fill({ color: 0x9c754c, alpha });
      }
      return;
    }
    default: {
      // plaster over a walnut dado
      g.poly(quad(0, 1, 5, 29)).fill({ color: 0x5b3a26, alpha });
      g.poly(quad(0, 1, 29, 32)).fill({ color: 0x3e2718, alpha });
      g.poly(quad(0, 1, 32, top)).fill({ color: 0xefe4cc, alpha });
    }
  }
}
