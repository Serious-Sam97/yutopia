import {
  type AvatarLayers,
  depthOf,
  EMOTES,
  type Emote,
  entry,
  entryWallItem,
  footprint,
  type HeldKind,
  hasActions,
  heldState,
  hostOf,
  isFloor,
  isHeld,
  isSocial,
  type MapDef,
  placedFootprint,
  Q,
  SOCIAL_MS,
  surfaceAt,
  TILE_H,
  TILE_W,
  tileAt,
  topCentre,
  topRect,
  toScreen,
  toWorld,
  WB_H,
  WB_W,
  type WbItem,
  type WorldObjectDef,
  wallRot,
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
import { avatarContext, viewFor } from "./art/avatar";
import type { Motion } from "./art/avatar-motion";
import type { Aff, PartName, Pose } from "./art/avatar-rig";
import type { AvatarRig } from "./art/avatar-svg";
import { loadPeople, people } from "./art/people-load";
import { loadThemes } from "./art/themes-load";

type People = NonNullable<ReturnType<typeof people>>;

import { type Daylight, daylight, hourForNight } from "./art/daylight";
import { FloorBake, floorRes } from "./art/floors";
import { WALL_H } from "./art/furniture";
import { HELD_BOX, MUG_COLORS } from "./art/held";
import { PERSON, WORLD_SCALE } from "./art/iso";
import type { ItemArt } from "./art/items/kit";
import { affectsLight, PX as LIGHT_PX, LightMap } from "./art/light";
import { C } from "./art/palette";
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
  heldTexture,
  itemsPending,
  itemTextureStats,
  RIG_PX,
  rigPartTexture,
  vortexTexture,
} from "./art/textures";
import type { ThemeView } from "./art/themes";
import type { VortexMood } from "./art/vortex/vortexArt";
import type { Life, Swayable } from "./life";
import type { Post } from "./post";

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
}

interface AvatarView {
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
  state: AvatarState;
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

// A person drawn as a rig: one sprite per part, posed every frame.
interface RigView {
  key: string;
  def: AvatarRig;
  root: Container;
  sprites: Map<PartName, Sprite>;
  held?: Sprite; // what's in the right hand
  steam?: Graphics; // …and the steam off it
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
const RIG_M = new Matrix(); // scratch for posing rig parts

// A steady 0..1 from a string (who someone is → their own rhythm of blinks).
function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}
const isEmote = (e: string): e is Emote => (EMOTES as readonly string[]).includes(e);

// What about an object changes the light map (doors: shut or not; lamps, radio: on).
function lightKey(o: WorldObjectDef | undefined): string {
  if (!o) return "";
  const st = String(o.props?.state ?? "open");
  const shut = (st === "closed" || st === "locked") && !o.props?.passing;
  // (a lamp's shade colours its light; a neon sign's look is its colour)
  return `${shut}|${o.props?.on}|${o.props?.color}|${o.props?.variant}`;
}

function isFloorAt(map: MapDef, x: number, y: number): boolean {
  return isFloor(tileAt(map, x, y));
}

// Solid furniture darkens the floor around it (AO) and doors get a sill.
function affectsFloor(o: WorldObjectDef): boolean {
  const e = entry(o.kind);
  return o.kind === "door" || (e.solid && !e.wall);
}

// What a thing covers on the floor, for outlines (w, d in tiles from its
// corner): its footprint, or a strip `depth` deep along the wall it hangs on.
function wallStrip(o: WorldObjectDef, depth: number): [number, number] {
  const { w, h } = placedFootprint(o);
  if (!entry(o.kind).wall) return [w, h];
  return wallRot(o.rot) === 3 ? [depth, h] : [w, depth];
}

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

export interface EngineEvents {
  onTileClick?: (x: number, y: number) => void;
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
  // what surrounds the studio (the space's theme): a backdrop + the building below the floor
  private theme: ThemeView | null = null;
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
    // the people's drawing loads alongside (a quick figure until it's here)
    void loadPeople();
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
    this.floorLayer.clear();
    drawFloors(this.floorLayer, this.map);
    this.applyTheme();
    this.bakeFloors(true);
    for (const w of this.walls) this.unmountPart(w);
    this.walls = wallParts(this.map).map((part) => this.mountPart(part, this.sortLayer));
    this.bakeLight(true);
    this.rebuildDressing(true);
    this.applyLight();
    this.drawLabels();
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
    const doors = [...this.objectViews.values()].map((v) => v.def).filter((o) => o.kind === "door");
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
      // with what they're on in Yondra, lit like a display
      const ticket = this.deskTasks.get(Number(v.def.props?.ownerId));
      if (!ticket) {
        plate(name.split(" ")[0], v.def.x + 0.5, v.def.y + 0.5, 68, false);
        continue;
      }
      const c = new Container();
      const n = new Text({
        text: name.split(" ")[0],
        style: { fontFamily: "Share Tech Mono, monospace", fontSize: 10, fill: C.ink },
        resolution: 2,
      });
      const k = new Text({
        text: ticket,
        style: { fontFamily: "VT323, monospace", fontSize: 13, fill: C.vfd, letterSpacing: 0.5 },
        resolution: 2,
      });
      const h = Math.max(n.height, k.height) + 4;
      const w = n.width + k.width + 20;
      n.position.set(-w / 2 + 6, -n.height / 2);
      k.position.set(-w / 2 + n.width + 14, -k.height / 2);
      const bg = new Graphics()
        .roundRect(-w / 2, -h / 2, w, h, 3)
        .fill({ color: C.cream, alpha: 0.92 })
        .stroke({ width: 1, color: C.walnut })
        .roundRect(-w / 2 + n.width + 10, -h / 2 + 1.5, k.width + 8, h - 3, 2)
        .fill({ color: 0x120d09, alpha: 0.95 });
      c.addChild(bg, n, k);
      const p = toScreen(v.def.x + 0.5, v.def.y + 0.5);
      c.position.set(p.x, p.y - 68);
      this.labelLayer.addChild(c);
    }
  }

  // What each desk's owner is on in Yondra (user id → ticket), for their nameplate.
  private deskTasks = new Map<number, string>();
  setDeskTasks(m: Map<number, string>) {
    const same = m.size === this.deskTasks.size && [...m].every(([k, v]) => this.deskTasks.get(k) === v);
    if (same) return;
    this.deskTasks = m;
    this.drawLabels();
  }

  // A wall brush over an edge: a see-through wall where it would go.
  private edgeG = new Graphics();
  setEdgeGhost(e: { x: number; y: number; dir: "h" | "v" } | null, ok: boolean) {
    this.edgeGhost = e ? { e, ok } : null;
    if (!this.edgeG.parent) this.world.addChild(this.edgeG);
    this.edgeG.clear();
    if (!e) return;
    const t = 0.1;
    const [a0, a1, b0, b1] = e.dir === "h" ? [e.x, e.x + 1, e.y - t, e.y + t] : [e.x - t, e.x + t, e.y, e.y + 1];
    const at = (x: number, y: number, z = 0) => {
      const p = toScreen(x, y);
      return [p.x, p.y - z];
    };
    const col = ok ? C.olive : C.rust;
    // footprint on the floor + the face that would stand up
    this.edgeG.poly([...at(a0, b0), ...at(a1, b0), ...at(a1, b1), ...at(a0, b1)]).fill({ color: col, alpha: 0.6 });
    const face =
      e.dir === "h"
        ? [...at(a0, b1), ...at(a1, b1), ...at(a1, b1, WALL_H), ...at(a0, b1, WALL_H)]
        : [...at(a1, b0), ...at(a1, b1), ...at(a1, b1, WALL_H), ...at(a1, b0, WALL_H)];
    this.edgeG
      .poly(face)
      .fill({ color: col, alpha: 0.22 })
      .stroke({ width: 1.5, color: ok ? C.vfd : C.rust, alpha: 0.9 });
  }

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
    if (o.props?.ownerName || o.kind === "chair" || o.kind === "armchair" || o.kind === "door") this.labelsDirty = true;
    this.objectViews.set(o.id, view);
    this.hulls.delete(o.id);
    if (this.hidden.has(o.id)) this.showView(view, false);
    const moved = !old || old.def.x !== o.x || old.def.y !== o.y || old.def.rot !== o.rot;
    // feedback: a door swings as it opens or shuts, a chair wobbles as someone sits or stands
    if (old && !moved && this.animated()) {
      const swung = o.kind === "door" && lightKey(old.def) !== lightKey(o);
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
      view.hands.zIndex = o.x + 0.75 + o.y + 0.02;
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
      this.themeKey.startsWith(this.map.theme ?? "clouds")
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

  // ── the theme around the studio ──────────────────────────────────────────
  // Themes load in their own chunk; the shell is drawn once the theme is in.
  private applyTheme() {
    const key = `${this.map.theme ?? "clouds"}|${this.quality}`;
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
      this.theme = makeTheme(this.map.theme ?? "clouds", this.animated(), this.quality);
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
      const bake = new FloorBake(this.map, this.allObjects(), floorRes(this.map, this.quality, WORLD_SCALE));
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
    // on the face of the thin wall (WALL_FACE in front of the tile edge); on a
    // west wall the panel runs from its south end (the item turned to rot 3)
    const tiles = entryWallItem(o.kind);
    const west = wallRot(o.rot) === 3;
    const origin = west ? toScreen(o.x + oy + 0.1, o.y + tiles - ox) : toScreen(o.x + ox, o.y + oy + 0.1);
    // a quarter of a tile per slice, like the wall and the board it's on
    for (let k = 0; k < tiles * 4; k++) {
      const u0 = Math.max(0, (k / 4 - ox) * S);
      const u1 = Math.min(pw, ((k + 1) / 4 - ox) * S);
      if (u1 <= u0) continue;
      const wrap = new Container();
      wrap.setFromMatrix(
        new Matrix(TILE_W / 2 / S, ((west ? -1 : 1) * TILE_H) / 2 / S, 0, 1, origin.x, origin.y - zTop),
      );
      const content = build();
      // neighbouring slices overlap by a hair (no hairline gap between them)
      const mask = new Graphics().rect(u0 - 0.5, -2, u1 - u0 + 1, ph + 4).fill(0xffffff);
      wrap.addChild(content, mask);
      content.mask = mask;
      // just over the item's next slice too: its art's edge pixels (dark glass,
      // a bezel) bleed a pixel into this one and drew a dark line at every
      // quarter tile across the picture
      wrap.zIndex = o.x + o.y + (west ? tiles - (k + 0.5) / 4 : (k + 0.5) / 4) + 0.27;
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
        o.busy !== s.busy)
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
    return { dir: v.shownDir, view, mirror, rigged: !!v.rig?.root.visible, walking: v.state.a === 1 };
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
      this.camFocus = { x: p.x, y: p.y - 30 };
    }
    const k = this.reducedMotion ? 1 : 1 - Math.exp(-dt * 7);
    this.cam.x += (this.camFocus.x - this.cam.x) * k;
    this.cam.y += (this.camFocus.y - this.cam.y) * k;
    this.zoom += (this.targetZoom - this.zoom) * (this.reducedMotion ? 1 : 1 - Math.exp(-dt * 10));
    this.drawEarshot(local);
    const W = this.app.renderer.width / this.app.renderer.resolution;
    const H = this.app.renderer.height / this.app.renderer.resolution;
    this.world.scale.set(this.zoom);
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

  private updateAvatar(v: AvatarView, dt: number, now: number) {
    const s = v.state;
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
    const lift = sitting ? 12 : 0; // the drawing sits its hips on the seat
    const rim = this.night > 0.5 ? "night" : "day";
    const look = JSON.stringify(s.avatar);
    // the distance covered this frame: the walk cycle follows it
    let dist = v.last ? Math.hypot(s.x - v.last.x, s.y - v.last.y) : 0;
    if (dist > 1.5) dist = 0; // a jump (sitting down, a teleport), not a step
    v.last = { x: s.x, y: s.y };
    const rigged = this.drawRig(v, view, mirror, sitting, rim, look, dt, dist, walking, lift);
    if (rigged) {
      v.sprite.visible = false;
      v.body.visible = false;
    } else {
      // the rig's parts are still decoding: the whole drawing, or the quick figure
      v.sprite.visible = false;
      const tex = avatarTexture(s.avatar, view, 0, sitting, rim);
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
        const key = `${view}|${sitting}|${look}`;
        if (key !== v.avatarKey) {
          v.body.context = avatarContext(s.avatar, view, 0, sitting);
          v.avatarKey = key;
        }
        v.body.visible = true;
        v.body.scale.set((mirror ? -1 : 1) * 1.35, 1.35); // same size as the drawing it stands in for
        v.body.position.set(0, lift);
      }
    }
    v.root.position.set(p.x, p.y);
    this.setDepth(v.root, depthOf(s.x, s.y) + (sitting ? 0 : 0.01));
    // people take the light where they stand
    const tint = this.tintAt(s.x, s.y);
    v.sprite.tint = tint;
    v.body.tint = tint;
    if (v.rig) for (const sp of v.rig.sprites.values()) sp.tint = tint;
    v.root.alpha = s.status === "away" ? 0.55 : 1;
    if (this.seeThrough && this.inFrontOf(this.seeThrough, s.x, s.y)) v.root.alpha *= 0.28;
    v.shadow.visible = !sitting;

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
    v.tag.scale.set(inv);
    this.setDepth(v.tag, v.local ? 1e6 : p.y);
    const dotColor = s.status === "dnd" ? C.rust : s.status === "away" ? C.alumDark : s.npc ? C.red : C.olive;
    const slash = !s.mic && !s.npc && !s.bot;
    const dotKey = `${dotColor}|${slash}`;
    if (v.dotKey !== dotKey) {
      v.dotKey = dotKey;
      v.dot.clear().circle(0, 0, 3.2).fill(dotColor);
      if (slash) v.dot.moveTo(-3, -3).lineTo(3, 3).stroke({ width: 1.4, color: C.cream });
    }
    if (v.bubble.visible) {
      v.bubble.position.set(p.x, p.y + (-120 + lift) * PERSON);
      v.bubble.scale.set(inv);
      v.bubble.zIndex = 2e6;
      if (now > v.bubbleUntil) v.bubble.visible = false;
    }
  }

  // A person as a rig: the parts for this look, view and seat (a new view
  // waits for its parts to decode while the last one keeps moving), posed by
  // their Motion. False while nothing's ready to draw.
  private drawRig(
    v: AvatarView,
    view: ReturnType<typeof viewFor>["view"],
    mirror: boolean,
    sitting: boolean,
    rim: "day" | "night",
    look: string,
    dt: number,
    dist: number,
    walking: boolean,
    lift: number,
  ): boolean {
    const P = people();
    if (!P) return false; // the people chunk is still loading: the quick figure
    const s = v.state;
    const key = `${look}|${view}|${sitting ? 1 : 0}|${rim}`;
    let want = v.rig?.key === key ? v.rig : v.rigNext?.key === key ? v.rigNext : undefined;
    if (!want) {
      if (v.rigNext) this.dropRig(v.rigNext);
      want = this.makeRig(v, key, P.avatarRig(s.avatar, view, sitting, rim));
      v.rigNext = want;
    }
    if (want !== v.rig && this.rigReady(want)) {
      if (v.rig) this.dropRig(v.rig);
      v.rig = want;
      v.rigNext = undefined;
    }
    const r = v.rig;
    v.motion ??= new P.Motion(seedOf(s.name + (v.local ? "me" : "")));
    const held = isHeld(s.held) && s.heldAt ? { kind: s.held, since: Date.now() - s.heldAt } : null;
    const pose = v.motion.update(r?.def ?? want.def, dt, {
      held,
      busy: s.busy ?? "",
      act: this.actOf(v),
      dist,
      walking,
      speed: dt > 0 ? dist / dt : 0,
      typing: sitting && this.atWork(s.x, s.y),
      speaking: s.speaking,
      emote: s.emote,
      reduced: this.reducedMotion,
    });
    if (!r) return false;
    const def = r.def;
    const b = P.bones(def, pose);
    P.drawOrder(def, pose).forEach((part, i) => {
      const sp = r.sprites.get(part.name);
      if (!sp) return;
      sp.zIndex = i;
      const head = part.name === "head";
      const face = head && !def.back ? pose.face : undefined;
      const tex = head
        ? (rigPartTexture(r.key, part, face, face ? def.heads[face] : def.heads.open) ??
          rigPartTexture(r.key, part, def.back ? undefined : "open", def.heads.open))
        : rigPartTexture(r.key, part);
      if (tex) sp.texture = tex;
      sp.visible = !!tex;
      // the part's box, at RIG_PX texture px per board unit, moved by its bone
      const m: Aff = P.mul(b[part.name], [1 / RIG_PX, 0, 0, 1 / RIG_PX, part.box[0], part.box[1]]);
      sp.setFromMatrix(RIG_M.set(m[0], m[1], m[2], m[3], m[4], m[5]));
    });
    this.drawHeld(P, r, s, pose, b, held);
    r.root.visible = true;
    r.root.pivot.set(60, 168);
    r.root.scale.set((mirror ? -1 : 1) * P.FIT * def.squash, P.FIT);
    r.root.position.set(0, lift + 2 + (sitting ? P.SIT_DROP * P.FIT : 0));
    return true;
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

  // The thing in the right hand: at the hand, upright (tipped towards the mouth
  // while sipping), in front of the body (behind it, seen from the back), with
  // a little steam while it's hot.
  private drawHeld(
    P: People,
    r: RigView,
    s: AvatarState,
    _pose: Pose,
    b: Record<PartName, Aff>,
    held: { kind: HeldKind; since: number } | null,
  ) {
    if (!held) {
      if (r.held) r.held.visible = false;
      r.steam?.clear();
      return;
    }
    const st = heldState(held.kind, held.since);
    const color = MUG_COLORS[Math.floor(seedOf(s.name) * MUG_COLORS.length)];
    const tex = heldTexture(held.kind, color, Math.round(st.level * 4));
    if (!r.held || !r.steam) {
      r.held = new Sprite();
      r.steam = new Graphics();
      r.root.addChild(r.held, r.steam);
    }
    const sp = r.held;
    if (tex) sp.texture = tex;
    sp.visible = !!tex;
    const def = r.def;
    const hand = P.apply(b.armRf, def.joints.hand);
    const up = P.sipEnv(st.sip);
    const tip = (def.side ? -38 : -22) * up;
    const k = 1 / RIG_PX;
    const rad = (tip * Math.PI) / 180;
    const c = Math.cos(rad);
    const sn = Math.sin(rad);
    // the grip (0, 0) of the drawing at the hand; its box, scaled to board units
    const m: Aff = [c * k, sn * k, -sn * k, c * k, 0, 0];
    const at = P.apply(m, [HELD_BOX[0] * RIG_PX, HELD_BOX[1] * RIG_PX]);
    sp.setFromMatrix(RIG_M.set(m[0], m[1], m[2], m[3], hand[0] + at[0], hand[1] + at[1]));
    const armZ = r.sprites.get("armRf")?.zIndex ?? 50;
    const torsoZ = r.sprites.get("torso")?.zIndex ?? 40;
    sp.zIndex = def.back ? torsoZ - 0.5 : armZ + 0.5;
    sp.tint = r.sprites.get("torso")?.tint ?? 0xffffff;
    // steam: two wisps rising off a hot mug (not mid-sip, not from behind)
    const g = r.steam;
    g.clear();
    g.zIndex = sp.zIndex + 0.1;
    if (st.level > 0.4 && up === 0 && !def.back && !this.reducedMotion) {
      const t = this.time;
      for (let i = 0; i < 2; i++) {
        const ph = (t * 0.7 + i * 0.5) % 1;
        const x0 = hand[0] - 2.5 + i * 2;
        const y0 = hand[1] - 12 - ph * 9;
        const sway = Math.sin(t * 3 + i * 2) * 1.6;
        g.moveTo(x0, y0)
          .quadraticCurveTo(x0 + sway, y0 - 3, x0 - sway * 0.5, y0 - 6)
          .stroke({ width: 1.1, color: 0xffffff, alpha: 0.42 * (1 - ph) });
      }
    }
  }

  private makeRig(v: AvatarView, key: string, def: AvatarRig): RigView {
    const root = new Container();
    root.sortableChildren = true;
    root.visible = false;
    const sprites = new Map<PartName, Sprite>();
    for (const p of def.parts) {
      const sp = new Sprite();
      sp.visible = false;
      root.addChild(sp);
      sprites.set(p.name, sp);
    }
    v.root.addChildAt(root, v.root.getChildIndex(v.sprite));
    return { key, def, root, sprites };
  }

  // all of a rig's parts decoded (and the faces it blinks and talks with asked for)
  private rigReady(r: RigView): boolean {
    let ok = true;
    for (const p of r.def.parts) {
      if (p.name === "head") {
        if (!rigPartTexture(r.key, p, r.def.back ? undefined : "open", r.def.heads.open)) ok = false;
        if (!r.def.back) {
          rigPartTexture(r.key, p, "blink", r.def.heads.blink);
          rigPartTexture(r.key, p, "talk", r.def.heads.talk);
        }
      } else if (!rigPartTexture(r.key, p)) ok = false;
    }
    return ok;
  }

  private dropRig(r: RigView) {
    r.root.destroy({ children: true }); // the textures belong to the cache
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
          if (o.kind !== "tabletop" || (o.props?.d !== "keyboard" && o.props?.d !== "monitor")) return false;
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
      const show = !!part?.root.visible;
      const fresh = show && !g.visible; // just revealed: draw now
      g.visible = show;
      g.alpha = part?.high?.alpha ?? part?.root.alpha ?? 1;
      if (!g.visible || !(redraw || fresh)) continue;
      g.clear();
      const o = v.def;
      const c = toScreen(o.x + 0.5, o.y + 0.134);
      const cy = c.y - 52;
      const ex = TILE_W / 2;
      const ey = TILE_H / 2;
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
      const down =
        e.dir === "h"
          ? e.y > py && e.y - py < 9 && Math.abs(e.x + 0.5 - px) < 8
          : e.x > px && e.x - px < 9 && Math.abs(e.y + 0.5 - py) < 8;
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
    this.lightMap = new LightMap(this.map, this.allObjects());
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
    const { w, h } = placedFootprint(o);
    const a = 0.55 + (this.reducedMotion ? 0 : Math.sin(this.time * 5) * 0.25);
    // wall items: flush with their wall
    const west = e.wall && wallRot(o.rot) === 3;
    const x0 = west ? o.x : o.x - 0.08;
    const y0 = e.wall && !west ? o.y : o.y - 0.08;
    const pts = [
      toScreen(x0, y0),
      toScreen(o.x + w + 0.08, y0),
      toScreen(o.x + w + 0.08, o.y + h + 0.08),
      toScreen(x0, o.y + h + 0.08),
    ];
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
      const [sw, sh] = wallStrip(o, 0.25);
      const pts = [toScreen(o.x, o.y), toScreen(o.x + sw, o.y), toScreen(o.x + sw, o.y + sh), toScreen(o.x, o.y + sh)];
      g.poly(pts.flatMap((p) => [p.x, p.y]))
        .fill({ color: ok ? C.olive : C.rust, alpha: 0.38 })
        .stroke({ width: 2, color: ok ? C.vfd : C.rust, alpha: 0.95 });
      if (this.ghostLift > 0 && !e.wall) {
        // the shadow of something held above the floor
        const c = toScreen(o.x + w / 2, o.y + h / 2);
        g.ellipse(c.x, c.y, 14 * Math.max(w, h), 7 * Math.max(w, h)).fill({ color: 0x000000, alpha: 0.22 });
      }
    }
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
  private edgeGhost: { e: { x: number; y: number; dir: "h" | "v" }; ok: boolean } | null = null;
  private rectGhost: { x: number; y: number; w: number; h: number; ok: boolean } | null = null;
  private gridOn = false;
  buildLook() {
    return {
      ghosts: this.ghostItems.map((g) => ({ def: g.def, ok: g.ok })),
      lift: this.ghostLift,
      edge: this.edgeGhost,
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
  onPuff: ((x: number, y: number, kind: "drop" | "poof" | "spark" | "confetti", lift: number) => void) | null = null;

  puff(x: number, y: number, kind: "drop" | "poof" | "spark" | "confetti" = "drop", lift = 0) {
    this.onPuff?.(x, y, kind, lift);
    if (!this.animated()) return;
    const c = toScreen(x, y);
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
    const [w, d] = wallStrip(o, 0.12);
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
        : [toScreen(o.x, o.y), toScreen(o.x + w, o.y), toScreen(o.x + w, o.y + d), toScreen(o.x, o.y + d)]
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
      // the person's body: ~92 px tall since the City-pop redraw
      if (gx > p.x - 16 * PERSON && gx < p.x + 16 * PERSON && gy > p.y - 92 * PERSON && gy < p.y + 4) {
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
        // wall items are hit on the wall plane above their tiles
        const a = toScreen(o.x, o.y);
        const b = wallRot(o.rot) === 3 ? toScreen(o.x, o.y + h) : toScreen(o.x + w, o.y);
        const t = (gx - a.x) / (b.x - a.x);
        const yLine = a.y + (b.y - a.y) * t;
        hit = t >= 0 && t <= 1 && gy <= yLine && gy >= yLine - 80;
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

  // Build mode: taps go through people (and Vortex) to the floor and furniture.
  passAvatars = false;

  private handleTap(e: FederatedPointerEvent) {
    const gx = (e.global.x - this.world.position.x) / this.zoom;
    const gy = (e.global.y - this.world.position.y) / this.zoom;
    const w = toWorld(gx, gy);
    const av = this.passAvatars ? null : this.pickAvatar(gx, gy);
    // clicking yourself is handled too (it opens your look)
    const at = { x: e.clientX, y: e.clientY };
    if (av) return this.events.onAvatarClick?.(av, at);
    const obj = this.pickObject(w.x, w.y, gx, gy);
    if (obj) return this.events.onObjectClick?.(obj, at);
    this.events.onTileClick?.(w.x, w.y);
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
  pinCamera(at: { x: number; y: number; zoom?: number; z?: number; ease?: boolean } | null) {
    if (!at) {
      this.camPin = null;
      return;
    }
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
    this.targetZoom = Math.max(0.55 * WORLD_SCALE, Math.min(2.4 * WORLD_SCALE, z));
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
