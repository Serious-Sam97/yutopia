import {
  type AvatarLayers,
  depthOf,
  entry,
  footprint,
  isFloor,
  type MapDef,
  TILE_H,
  TILE_W,
  tileAt,
  toScreen,
  toWorld,
  WB_H,
  WB_W,
  type WbItem,
  type WorldObjectDef,
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
import { avatarContext, viewFor, WALK_FRAMES } from "./art/avatar";
import { type Daylight, daylight, hourForNight } from "./art/daylight";
import { FloorBake, floorRes } from "./art/floors";
import type { ItemArt } from "./art/items/kit";
import { affectsLight, PX as LIGHT_PX, LightMap } from "./art/light";
import { C } from "./art/palette";
import {
  drawFlat,
  drawFloors,
  itemArtLoaded,
  loadItemArt,
  objectFlat,
  objectParts,
  objectShadow,
  type Part,
  setArtRes,
  wallParts,
} from "./art/scene";
import { acquireItem, avatarTexture, itemTextureStats, vortexTexture } from "./art/textures";
import type { VortexMood } from "./art/vortex/vortexArt";

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
  emote: Text;
  bubble: Container;
  bubbleText: Text;
  bubbleBg: Graphics;
  bubbleUntil: number;
  state: AvatarState;
  walkT: number;
  frame: number;
  avatarKey: string;
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
  art?: boolean; // has an illustrated drawing
  ready?: boolean; // …and it's showing
  onReady?: () => void;
}

interface ObjectView {
  parts: PartView[];
  def: WorldObjectDef;
  displays: Container[];
  shadow: PartView | null;
  flat: PartView | null; // rugs / rings on the floor layer
  flatReady: boolean;
  dropped: boolean;
}

export interface BoardContent {
  name: string;
  sections: { name: string; count: number }[];
}

const EMOJI: Record<string, string> = {
  wave: "👋",
  heart: "❤️",
  laugh: "😂",
  clap: "👏",
  fire: "🔥",
  question: "❓",
  coffee: "☕",
  tape: "📼",
};

// What about an object changes the light map (doors: shut or not; lamps, radio: on).
function lightKey(o: WorldObjectDef | undefined): string {
  if (!o) return "";
  const st = String(o.props?.state ?? "open");
  const shut = (st === "closed" || st === "locked") && !o.props?.passing;
  return `${shut}|${o.props?.on}`;
}

function isFloorAt(map: MapDef, x: number, y: number): boolean {
  return isFloor(tileAt(map, x, y));
}

// Solid furniture darkens the floor around it (AO) and doors get a sill.
function affectsFloor(o: WorldObjectDef): boolean {
  const e = entry(o.kind);
  return o.kind === "door" || (e.solid && !e.wall);
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
  onAvatarClick?: (id: string) => void;
  onObjectClick?: (id: string) => void;
  onHoverObject?: (id: string | null) => void;
  onPointerWorld?: (x: number, y: number) => void;
  onPointerDown?: (x: number, y: number) => void;
  onPointerUp?: (x: number, y: number) => void;
}

export class WorldEngine {
  app!: Application;
  map: MapDef;
  private world = new Container();
  private floorLayer = new Graphics(); // quick floor, until the bake is in
  private floorArt = new Container(); // baked floor chunks
  private flatLayer = new Graphics();
  private flatArtLayer = new Container();
  private shadowLayer = new Container();
  private sortLayer = new Container();
  private darkLayer = new Graphics();
  private floorLight = new Sprite(); // ambient + baked light, multiplied onto the floor
  private bloomLayer = new Container(); // blurred emissive copies (High)
  private overlay = new Container();
  private highlightG = new Graphics();
  private markerG = new Graphics();
  private ghostLayer = new Container();
  private walls: { sprite: Graphics; part: Part }[] = [];
  private objectViews = new Map<string, ObjectView>();
  private avatars = new Map<string, AvatarView>();
  private boardContent = new Map<string, BoardContent>();
  private screenVideo = new Map<string, HTMLVideoElement>();
  localId: string | null = null;
  zoom = 1.25;
  private targetZoom = 1.25;
  private cam = { x: 0, y: 0 };
  private camFocus = { x: 0, y: 0 };
  private marker: { x: number; y: number; t: number } | null = null;
  private highlightId: string | null = null;
  private quality: "high" | "low" = "high";
  private reducedMotion = false;
  private night = 0;
  private time = 0;
  events: EngineEvents = {};
  private destroyed = false;

  constructor(map: MapDef) {
    this.map = map;
  }

  async init(host: HTMLElement, opts: { quality: "high" | "low"; reducedMotion: boolean }) {
    this.quality = opts.quality;
    this.reducedMotion = opts.reducedMotion;
    setArtRes(this.artRes());
    const app = new Application();
    await app.init({
      resizeTo: host,
      background: 0x17110d,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(window.devicePixelRatio || 1, opts.quality === "high" ? 2 : 1),
      preference: "webgl",
    });
    if (this.destroyed) {
      app.destroy(true);
      return;
    }
    this.app = app;
    host.appendChild(app.canvas);
    app.canvas.style.display = "block";
    app.canvas.setAttribute("aria-label", "Yutopia world");

    this.sortLayer.sortableChildren = true;
    this.overlay.sortableChildren = true;
    this.world.addChild(
      this.floorLayer,
      this.floorArt,
      this.flatLayer,
      this.flatArtLayer,
      this.shadowLayer,
      this.floorLight,
      this.highlightG,
      this.markerG,
      this.sortLayer,
      this.ghostLayer,
      this.darkLayer,
      this.bloomLayer,
      this.overlay,
    );
    app.stage.addChild(this.world);
    this.darkLayer.blendMode = "multiply";
    this.floorLight.blendMode = "multiply";
    this.floorLight.visible = false;
    this.bloomLayer.blendMode = "add";
    const blur = new BlurFilter({ strength: 7, quality: 3 });
    blur.resolution = 0.5;
    // a filtered container is composited with the filter's blend mode: add, so
    // the black (occluding) parts of the emissive layer add nothing
    blur.blendMode = "add";
    this.bloomLayer.filters = [blur];

    this.drawStatic();
    // illustrated items replace the box art as soon as their drawings load
    loadItemArt().then(() => {
      if (!this.destroyed) for (const v of [...this.objectViews.values()]) this.upsertObject(v.def, false);
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

    const c = toScreen(this.map.spawn.x, this.map.spawn.y);
    this.cam = { x: c.x, y: c.y };
    this.camFocus = { ...this.cam };
  }

  // ── the map (walls + floors) ─────────────────────────────────────────────
  private drawStatic() {
    this.floorLayer.clear();
    drawFloors(this.floorLayer, this.map);
    this.bakeFloors(true);
    for (const w of this.walls) w.sprite.destroy();
    this.walls = [];
    for (const part of wallParts(this.map)) {
      const g = new Graphics(part.ctx);
      g.position.set(part.x, part.y);
      g.zIndex = part.key;
      this.sortLayer.addChild(g);
      this.walls.push({ sprite: g, part });
    }
    this.bakeLight(true);
    this.applyLight();
    this.drawLabels();
  }

  // The map changed (builders painted walls, added rooms, resized).
  setMap(map: MapDef) {
    this.map = map;
    if (!this.app) return;
    this.drawStatic();
    this.redrawFlat();
  }

  private eventWorld(e: FederatedPointerEvent) {
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
      plate(name.split(" ")[0], v.def.x + 0.5, v.def.y + 0.5, 46, false);
    }
  }

  // Room drafts in build mode.
  private rectG = new Graphics();
  setRectGhost(r: { x: number; y: number; w: number; h: number; ok: boolean } | null) {
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
    for (const o of objects) this.upsertObject(o, false);
    this.redrawFlat();
  }

  upsertObject(o: WorldObjectDef, redrawFlat = true) {
    // A changed object (door swinging, someone sitting) keeps its old drawing
    // until the new one has decoded, so it never flashes back to box art.
    const old = this.objectViews.get(o.id);
    const swap = !!old && old.parts.some((p) => p.ready);
    if (old) this.objectViews.delete(o.id);
    const parts = objectParts(o).map((p) => this.mountPart(p, this.sortLayer, 1, swap));
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
    const moved = !old || old.def.x !== o.x || old.def.y !== o.y || old.def.rot !== o.rot;
    if (affectsFloor(o) && moved) this.bakeFloors();
    if (affectsLight(o) && (moved || lightKey(old?.def) !== lightKey(o))) this.bakeLight();
    this.tintObject(view);
    if (o.kind === "board_wall" || o.kind === "screen_wall") this.drawDisplay(o.id);
    if (o.kind === "whiteboard") {
      const scene = o.props?.scene;
      this.drawWhiteboard(o.id, this.wbLive.get(o.id) ?? (Array.isArray(scene) ? (scene as WbItem[]) : []));
    }
    if (redrawFlat) this.redrawFlat();
  }

  removeObject(id: string, redrawFlat = true) {
    const v = this.objectViews.get(id);
    if (!v) return;
    if (affectsFloor(v.def)) this.bakeFloors();
    if (affectsLight(v.def)) this.bakeLight();
    this.dropView(v);
    this.objectViews.delete(id);
    if (redrawFlat) this.redrawFlat();
  }

  private dropView(v: ObjectView) {
    if (v.dropped) return;
    v.dropped = true;
    for (const pv of v.parts) this.unmountPart(pv);
    if (v.shadow) this.unmountPart(v.shadow);
    if (v.flat) this.unmountPart(v.flat);
    this.clearDisplays(v);
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
      const bake = new FloorBake(this.map, this.allObjects(), floorRes(this.map, this.quality === "high"));
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
    return this.quality === "high" ? (dpr >= 2 ? 2.5 : 2) : 1.25;
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
    const view: PartView = { root, release: [], emit: null, box, at: [p.wx + 0.5, p.wy + 0.5] };
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
    const on = this.quality === "high" && this.night > 0.02 && s.texture !== Texture.EMPTY;
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
      if ((v.def.kind === "rug" || v.def.kind === "standup_mat") && !v.flatReady) drawFlat(this.flatLayer, v.def);
  }

  // Any object covering a tile (build mode picks non-interactive things too).
  objectAtTile(x: number, y: number): WorldObjectDef | undefined {
    let best: WorldObjectDef | undefined;
    for (const v of this.objectViews.values()) {
      const o = v.def;
      const { w, h } = footprint(o.kind, entry(o.kind).wall ? 0 : (o.rot ?? 0));
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
    if (!items.length) return;
    const S = 36;
    const pw = 1.72 * S;
    const ph = 34;
    this.mountWall(v, 0.14, 0.065, 61, pw, ph, () => this.whiteboardContent(items, pw, ph));
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
    const origin = toScreen(o.x + ox, o.y + oy);
    const tiles = footprint(o.kind, 0).w;
    for (let k = 0; k < tiles; k++) {
      const u0 = Math.max(0, (k - ox) * S);
      const u1 = Math.min(pw, (k + 1 - ox) * S);
      if (u1 <= u0) continue;
      const wrap = new Container();
      wrap.setFromMatrix(new Matrix(TILE_W / 2 / S, TILE_H / 2 / S, 0, 1, origin.x, origin.y - zTop));
      const content = build();
      const mask = new Graphics().rect(u0, -2, u1 - u0, ph + 4).fill(0xffffff);
      wrap.addChild(content, mask);
      content.mask = mask;
      wrap.zIndex = o.x + k + o.y + 0.03;
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
    this.mountWall(v, 0.14, 0.06, z1, pw, ph, () => this.displayContent(objectId, wide, pw, ph));
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
      const body = new Graphics();
      const sprite = new Sprite();
      sprite.anchor.set(0.5, 0.96);
      sprite.visible = false;
      const emote = new Text({ text: "", style: { fontSize: 22 } });
      emote.anchor.set(0.5, 1);
      emote.visible = false;
      root.addChild(shadow, ring, body, sprite, emote);
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
        walkT: 0,
        frame: 0,
        avatarKey: "",
        local,
      };
      this.avatars.set(id, v);
      this.layoutTag(v);
    }
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
  }

  private layoutTag(v: AvatarView) {
    const w = v.tagText.width + 20;
    v.tagBg.clear();
    v.tagBg.roundRect(-w / 2, -9, w, 18, 9).fill({ color: 0x1e1712, alpha: 0.78 });
    v.tagText.anchor.set(0, 0.5);
    v.tagText.position.set(-w / 2 + 14, 0);
    v.dot.position.set(-w / 2 + 8, 0);
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
    const W = this.app.renderer.width / this.app.renderer.resolution;
    const H = this.app.renderer.height / this.app.renderer.resolution;
    this.world.scale.set(this.zoom);
    this.world.position.set(Math.round(W / 2 - this.cam.x * this.zoom), Math.round(H / 2 - this.cam.y * this.zoom));

    this.stepFloorBake();
    this.stepLight();
    if (this.labelsDirty) {
      this.labelsDirty = false;
      this.drawLabels();
    }
    for (const v of this.avatars.values()) this.updateAvatar(v, dt, now);
    this.updateWalls(local);
    this.drawMarker(dt);
    this.drawHighlight();
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
    v.root.zIndex = depthOf(s.x, s.y) + 0.02;
    // Vortex glows a little on his own: only half the shading
    const t = this.tintAt(s.x, s.y);
    v.sprite.tint =
      (((((t >> 16) & 255) + 255) >> 1) << 16) | (((((t >> 8) & 255) + 255) >> 1) << 8) | (((t & 255) + 255) >> 1);
    v.ring.clear();
    v.emote.visible = false;
    const inv = 1 / Math.max(0.7, this.zoom * 0.85);
    v.tag.position.set(p.x, p.y - 66 + bob);
    v.tag.scale.set(inv);
    v.dot.clear().circle(0, 0, 3.2).fill(0xff2d95);
    if (v.bubble.visible) {
      v.bubble.position.set(p.x, p.y - 80 + bob);
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
    if (walking) {
      v.walkT += dt * 9;
      v.frame = Math.floor(v.walkT) % WALK_FRAMES;
    } else {
      v.walkT = 0;
      v.frame = 0;
    }
    const { view, mirror } = viewFor(s.d);
    const breathe = walking || this.reducedMotion ? 1 : 1 + Math.sin(this.time * 2.2 + p.x) * 0.012;
    const lift = sitting ? -9 : 0;
    const tex = avatarTexture(s.avatar, view, v.frame, sitting);
    if (tex) {
      v.sprite.texture = tex;
      v.sprite.visible = true;
      v.body.visible = false;
      const k = 0.37; // 128×200 texture → ~47×74 px
      v.sprite.scale.set((mirror ? -1 : 1) * k, k * breathe);
      v.sprite.position.set(0, lift + 2);
    } else {
      // first frames while the drawing decodes: the quick procedural figure
      const key = `${view}|${v.frame}|${sitting}|${JSON.stringify(s.avatar)}`;
      if (key !== v.avatarKey) {
        v.body.context = avatarContext(s.avatar, view, v.frame, sitting);
        v.avatarKey = key;
      }
      v.body.visible = true;
      v.sprite.visible = false;
      v.body.scale.set(mirror ? -1 : 1, breathe);
      v.body.position.set(0, lift);
    }
    v.root.position.set(p.x, p.y);
    v.root.zIndex = depthOf(s.x, s.y) + (sitting ? 0 : 0.01);
    // people take the light where they stand
    const tint = this.tintAt(s.x, s.y);
    v.sprite.tint = tint;
    v.body.tint = tint;
    v.root.alpha = s.status === "away" ? 0.55 : 1;
    v.shadow.visible = !sitting;

    // speaking ring
    v.ring.clear();
    if (s.speaking) {
      const pulse = this.reducedMotion ? 0.7 : 0.55 + Math.sin(this.time * 12) * 0.25;
      v.ring.ellipse(0, 0, 17, 8.5).stroke({ width: 2.5, color: C.amber, alpha: pulse });
    }

    // emote
    if (s.emote && EMOJI[s.emote]) {
      v.emote.text = EMOJI[s.emote];
      v.emote.visible = true;
      v.emote.position.set(0, -80 + lift + (this.reducedMotion ? 0 : Math.sin(this.time * 6) * 2));
    } else v.emote.visible = false;

    // name tag + bubble (overlay, scale-compensated so text stays crisp)
    const inv = 1 / Math.max(0.7, this.zoom * 0.85);
    v.tag.position.set(p.x, p.y - 84 + lift);
    v.tag.scale.set(inv);
    v.tag.zIndex = v.local ? 1e6 : p.y;
    v.dot.clear();
    const dotColor = s.status === "dnd" ? C.rust : s.status === "away" ? C.alumDark : s.npc ? C.red : C.olive;
    v.dot.circle(0, 0, 3.2).fill(dotColor);
    if (!s.mic && !s.npc && !s.bot) v.dot.moveTo(-3, -3).lineTo(3, 3).stroke({ width: 1.4, color: C.cream });
    if (v.bubble.visible) {
      v.bubble.position.set(p.x, p.y - 98 + lift);
      v.bubble.scale.set(inv);
      v.bubble.zIndex = 2e6;
      if (now > v.bubbleUntil) v.bubble.visible = false;
    }
  }

  // Tall walls between you and the camera turn see-through.
  private updateWalls(local: AvatarView | undefined) {
    const px = local?.state.x ?? -99;
    const py = local?.state.y ?? -99;
    const lp = toScreen(px, py);
    for (const { sprite, part } of this.walls) {
      if (!part.tall) continue;
      const behind =
        part.key > px + py && part.wx + part.wy - (px + py) < 4.5 && part.wx >= px - 1.5 && part.wy >= py - 1.5;
      const near = Math.abs(part.x - lp.x) < 70;
      const target = behind && near ? 0.28 : 1;
      sprite.alpha += (target - sprite.alpha) * 0.2;
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

  setQuality(q: "high" | "low", reducedMotion: boolean) {
    const changed = q !== this.quality;
    this.quality = q;
    this.reducedMotion = reducedMotion;
    if (changed) {
      // textures are drawn at a resolution that depends on quality
      setArtRes(this.artRes());
      for (const v of [...this.objectViews.values()]) this.upsertObject(v.def, false);
      this.bakeFloors(true);
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
    return this.quality === "high" && !!this.lightMap;
  }

  private tintAt(x: number, y: number): number {
    return this.lit() ? (this.lightMap as LightMap).tintAt(x, y, this.day.ambient) : 0xffffff;
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
      this.lightCanvas = lm.composite(this.day.ambient, fresh ? undefined : (this.lightCanvas ?? undefined));
      if (fresh || this.floorLight.texture === Texture.EMPTY) {
        this.floorLight.texture?.destroy(true);
        this.floorLight.texture = Texture.from(this.lightCanvas, true);
      } else this.floorLight.texture.source.update();
      this.floorLight.setFromMatrix(
        new Matrix(TILE_W / 2 / LIGHT_PX, TILE_H / 2 / LIGHT_PX, -TILE_W / 2 / LIGHT_PX, TILE_H / 2 / LIGHT_PX, 0, 0),
      );
    }
    // walls take the light of the floor in front of them, averaged along the
    // wall so neighbouring wall tiles don't step from lit to dark
    for (const { sprite, part } of this.walls) {
      const south = isFloorAt(this.map, part.wx, part.wy + 1);
      const east = !south && isFloorAt(this.map, part.wx + 1, part.wy);
      if (!lit || (!south && !east)) {
        sprite.tint = lit ? this.tintAt(part.wx + 0.5, part.wy + 0.5) : 0xffffff;
        continue;
      }
      let r = 0;
      let g = 0;
      let b = 0;
      for (const k of [-1.2, -0.6, 0, 0.6, 1.2]) {
        const t = south
          ? this.tintAt(part.wx + 0.5 + k, part.wy + 1.15)
          : this.tintAt(part.wx + 1.15, part.wy + 0.5 + k);
        r += (t >> 16) & 255;
        g += (t >> 8) & 255;
        b += t & 255;
      }
      sprite.tint = (Math.round(r / 5) << 16) | (Math.round(g / 5) << 8) | Math.round(b / 5);
    }
    for (const v of this.objectViews.values()) {
      this.tintObject(v);
      for (const p of v.parts) this.lightEmit(p);
      if (v.flat) this.lightEmit(v.flat);
    }
    this.bloomLayer.visible = this.quality === "high" && this.night > 0.02 && !this.reducedMotion;
    // Low quality: the old flat dimming, nothing baked
    this.darkLayer.clear();
    this.darkLayer.visible = false;
  }

  // ── markers / highlight ──────────────────────────────────────────────────
  showMarker(x: number, y: number) {
    this.marker = { x, y, t: 0 };
  }

  private drawMarker(dt: number) {
    this.markerG.clear();
    if (!this.marker) return;
    this.marker.t += dt;
    const t = this.marker.t;
    if (t > 0.9) {
      this.marker = null;
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
    this.highlightG.clear();
    const o = this.highlightId ? this.objectViews.get(this.highlightId)?.def : undefined;
    if (!o) return;
    const e = entry(o.kind);
    const { w, h } = footprint(o.kind, o.rot ?? 0);
    const a = 0.55 + (this.reducedMotion ? 0 : Math.sin(this.time * 5) * 0.25);
    const y0 = e.wall ? o.y : o.y - 0.08;
    const pts = [
      toScreen(o.x - 0.08, y0),
      toScreen(o.x + w + 0.08, y0),
      toScreen(o.x + w + 0.08, o.y + h + 0.08),
      toScreen(o.x - 0.08, o.y + h + 0.08),
    ];
    this.highlightG
      .poly(pts.flatMap((p) => [p.x, p.y]))
      .fill({ color: C.amber, alpha: 0.12 })
      .stroke({ width: 2, color: C.amber, alpha: a });
  }

  // ── build-mode ghost ──────────────────────────────────────────────────────
  private ghostParts: PartView[] = [];
  setGhost(o: WorldObjectDef | null, valid: boolean) {
    for (const pv of this.ghostParts) this.unmountPart(pv);
    this.ghostParts = [];
    for (const c of this.ghostLayer.removeChildren()) c.destroy();
    if (!o) return;
    const g = new Graphics();
    const { w, h } = footprint(o.kind, o.rot ?? 0);
    const pts = [toScreen(o.x, o.y), toScreen(o.x + w, o.y), toScreen(o.x + w, o.y + h), toScreen(o.x, o.y + h)];
    g.poly(pts.flatMap((p) => [p.x, p.y]))
      .fill({ color: valid ? C.olive : C.rust, alpha: 0.35 })
      .stroke({ width: 2, color: valid ? C.vfd : C.rust });
    this.ghostLayer.addChild(g);
    for (const p of objectParts(o)) this.ghostParts.push(this.mountPart(p, this.ghostLayer, 0.6));
  }

  // ── input ────────────────────────────────────────────────────────────────
  screenToWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.app.canvas.getBoundingClientRect();
    const sx = (clientX - rect.left - this.world.position.x) / this.zoom;
    const sy = (clientY - rect.top - this.world.position.y) / this.zoom;
    return toWorld(sx, sy);
  }

  worldToClient(x: number, y: number, z = 0): { x: number; y: number } {
    const p = toScreen(x, y);
    return { x: this.world.position.x + p.x * this.zoom, y: this.world.position.y + (p.y - z) * this.zoom };
  }

  private pickAvatar(gx: number, gy: number): string | null {
    let best: string | null = null;
    let bestKey = -1;
    for (const [id, v] of this.avatars) {
      const p = toScreen(v.state.x, v.state.y);
      if (gx > p.x - 14 && gx < p.x + 14 && gy > p.y - 62 && gy < p.y + 4) {
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
      const { w, h } = footprint(o.kind, o.rot ?? 0);
      let hit = wx >= o.x && wx < o.x + w && wy >= o.y && wy < o.y + h;
      if (e.wall) {
        // wall items are hit on the wall plane above their tiles
        const a = toScreen(o.x, o.y);
        const b = toScreen(o.x + w, o.y);
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
    return best;
  }

  private handleTap(e: FederatedPointerEvent) {
    const gx = (e.global.x - this.world.position.x) / this.zoom;
    const gy = (e.global.y - this.world.position.y) / this.zoom;
    const w = toWorld(gx, gy);
    const av = this.pickAvatar(gx, gy);
    if (av && av !== this.localId) return this.events.onAvatarClick?.(av);
    const obj = this.pickObject(w.x, w.y, gx, gy);
    if (obj) return this.events.onObjectClick?.(obj);
    this.events.onTileClick?.(w.x, w.y);
  }

  private hoverId: string | null = null;
  private labelsDirty = false;
  private handleHover(e: FederatedPointerEvent) {
    const gx = (e.global.x - this.world.position.x) / this.zoom;
    const gy = (e.global.y - this.world.position.y) / this.zoom;
    const w = toWorld(gx, gy);
    this.events.onPointerWorld?.(w.x, w.y);
    const id = this.pickObject(w.x, w.y, gx, gy);
    const av = this.pickAvatar(gx, gy);
    this.app.canvas.style.cursor = id || (av && av !== this.localId) ? "pointer" : "default";
    if (id !== this.hoverId) {
      this.hoverId = id;
      this.events.onHoverObject?.(id);
    }
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
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
  private camPin: { x: number; y: number } | null = null;
  pinCamera(at: { x: number; y: number; zoom?: number } | null) {
    if (!at) {
      this.camPin = null;
      return;
    }
    const p = toScreen(at.x, at.y);
    this.camPin = { x: p.x, y: p.y };
    this.cam = { ...this.camPin };
    if (at.zoom) this.zoom = this.targetZoom = at.zoom;
  }

  setZoom(z: number) {
    this.targetZoom = Math.max(0.55, Math.min(2.4, z));
  }

  getZoom() {
    return this.targetZoom;
  }

  stats() {
    return {
      fps: this.app?.ticker.FPS ?? 0,
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
