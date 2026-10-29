import type { ServerMessages } from "@yutopia/shared";
import { CHUNK, checkEdits, GROUNDS, groundSurfaceAt, placeAt, terrainAt, treesIn } from "@yutopia/shared/grounds";
import {
  BRUSH,
  LandStroke,
  liftIn,
  oneTree,
  PaintStroke,
  paintIn,
  slopeIssues,
  WoodsStroke,
} from "@yutopia/shared/grounds-brush";
import { buildingAt } from "@yutopia/shared/grounds-buildings";
import { type EditsCount, editsCount, mergeEdits, type Overlap } from "@yutopia/shared/grounds-draft";
import type { GroundsEdits } from "@yutopia/shared/grounds-edits";
import { addThing, newThingKey, thingBlocked } from "@yutopia/shared/grounds-things";
import { Vector3 } from "three";
import { api } from "@/lib/api";
import { addStrings, type Key, tr } from "@/lib/i18n";
import { GOD_STRINGS } from "@/lib/i18n-god";
import type { WorldController } from "../controller";
import { layDraft, layings, onPublished, publishedEdits } from "../grounds-load";
import { GOD_READY, GOD_TOOLS, type GodDraftRow, type GodHud, type GodTool, hud, toast } from "../store";
import type { GodInput, ThirdPersonView } from "../tp/view";
import { BuildingsTool } from "./buildings";
import { BrushRing } from "./ring";
import { RoadsTool } from "./roads";
import { ThingsTool } from "./things";

// God mode (docs/plan/53-the-god-mode.md, phase 5): an admin building the open world. Going in,
// my body stays where it stood (held here; marked "building" to everyone by the world server) and
// a camera rises out of my head to 80 m over the land: a SimCity camera, panned, turned, tilted
// and zoomed over the Grounds, the land streamed round where it looks. My draft (the API's, one
// an admin) is laid over what's published for me alone; each change is a step to undo, saved a
// few seconds on. Walk it puts me down where the camera looks, on foot in the draft; Publish
// sends it to the world server, which checks it and makes it everyone's. Someone else's publish
// meanwhile is merged into the draft (what both changed: mine kept, and said). The land and paint
// brushes (phase 6: shared grounds-brush.ts) press with the left button (one finger), held to
// keep going: a stroke is a step to undo, laid a few times a second as it goes (each lay makes
// the chunks it touched again: not every frame). Its own chunk: an admin's only.

addStrings(GOD_STRINGS, "yutopia-god"); // its interface text comes with this chunk

const UP = { min: 4, max: 600, start: 80 }; // the camera's metres over the land
const PITCH = { min: 0.16, max: Math.PI / 2 - 0.02, start: 0.78 }; // down from level
const HISTORY = 200; // undo's steps
const SAVE_MS = 2500; // a change saved this long after the last
const RETRY_MS = 10_000;
const EDGE_PX = 10; // the screen's edge pans
const MAX_BYTES = 6_000_000; // (the API's and the rule book's)
const STROKE_LAY_MS = 300; // a stroke laid as it goes, this often

/** The draft open: its id and name (docs/plan/55-the-drafts.md; id null: none yet), the revision
 *  it's made on, the whole edits set as I want it. */
type Draft = { id: number | null; name: string; baseRev: number; data: GroundsEdits };
type DraftRow = GodDraftRow;
const NAME_MAX = 60;
// the draft open last (a convenience: the list is the API's)
const LAST = "yutopia:god-draft";
const lastOpen = (): number | null => {
  try {
    const v = Number(localStorage.getItem(LAST));
    return v > 0 ? v : null;
  } catch {
    return null;
  }
};
const setLast = (id: number | null) => {
  try {
    if (id) localStorage.setItem(LAST, String(id));
    else localStorage.removeItem(LAST);
  } catch {}
};
type Cam = ThirdPersonView["gameCam"];

/** What a publish would change, and what's in the way of it (the dialog's). */
export interface PublishSummary {
  count: EditsCount;
  problems: string[];
  bytes: number;
  maxBytes: number;
  /** people standing where the land changes (lifted onto it) */
  standing: number;
  /** what the draft's land does to what stands on it (warnings) */
  issues: string[];
  /** the chunks that change, the Grounds' coords (the dialog's little map) */
  chunks: [number, number][];
}

export class GodController {
  /** in god mode (on foot in the draft too) */
  on = false;
  walking = false;
  // the camera: the ground point it looks at (the Grounds' coords), how high over it, the way
  private at = { x: 0, z: 0 };
  private up = UP.start;
  private yaw = 0;
  private pitch = PITCH.start;
  private readonly keys = new Set<string>();
  // the draft: what it's made on (what's published), and its history
  private base: GroundsEdits = { rev: 0 };
  private draft: Draft | null = null;
  private past: GroundsEdits[] = [];
  private future: GroundsEdits[] = [];
  private saving: ReturnType<typeof setTimeout> | null = null;
  private saved: GroundsEdits | null = null;
  private loading: Promise<void> | null = null;
  // the pointers on the canvas (a finger or two, the mouse), and the mouse's last place
  private pointers = new Map<
    number,
    { x: number; y: number; button: number; touch: boolean; x0: number; y0: number; t: number }
  >();
  // the roads tool (phase 7: ./roads.ts), and the pointer dragging one of its points
  private roads: RoadsTool | null = null;
  private roadDrag: number | null = null;
  // the things tool (phase 8: ./things.ts), and the pointer dragging a thing
  private things: ThingsTool | null = null;
  private thingDrag: number | null = null;
  // the buildings tool (phase 9: ./buildings.ts), and the pointer dragging a building
  private buildings: BuildingsTool | null = null;
  private buildingDrag: number | null = null;
  private mouse: { x: number; y: number } | null = null;
  private pinch: { d: number; a: number; mx: number; my: number } | null = null;
  private readonly offs: (() => void)[] = [];
  private readonly ground = new Vector3();
  // a brush's stroke under way: its pointer, where it is, when it was last laid, made a step yet
  private stroke: {
    s: LandStroke | PaintStroke | WoodsStroke;
    id: number;
    at: { x: number; y: number };
    laid: number;
    first: boolean;
    /** the stroke's version laid */
    v: number;
  } | null = null;
  private ring: BrushRing | null = null;
  // the land under the pointer this frame (a stroke, the ring and the readout share it)
  private under: { x: number; z: number; h: number } | null = null;
  private shown = { up: 0, yaw: 0, place: "", pointer: "" };

  constructor(private readonly w: WorldController) {
    this.offs.push(onPublished((e) => this.published(e)));
    const room = w.room;
    if (room) {
      this.offs.push(room.onMessage("god:published", (m: ServerMessages["god:published"]) => this.done(m.rev)));
      this.offs.push(room.onMessage("god:refused", (m: ServerMessages["god:refused"]) => this.refused(m)));
    }
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("pointerout", this.onOut);
  }

  dispose() {
    if (this.on) this.leave();
    for (const off of this.offs) off();
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("pointerout", this.onOut);
  }

  // ── in and out ─────────────────────────────────────────────────────────────
  toggle() {
    if (this.on) this.leave();
    else void this.enter();
  }

  async enter(): Promise<void> {
    const tp = this.w.tp;
    if (this.on || !tp || !hud.get().isAdmin) return;
    this.on = true;
    this.walking = false;
    // (out of my head: where I stand, looking the way I look)
    const me = this.w.meTile();
    const f = tp.floorOffset(this.w.level);
    this.at = { x: me.x + f.x, z: me.y + f.z };
    this.up = UP.start;
    this.pitch = PITCH.start;
    this.yaw = tp.yaw;
    tp.god = { at: new Vector3(), dist: this.up, input: this.input };
    this.w.send("god:enter", {});
    this.set({ on: true, walking: false, publish: null });
    toast(tr("godIn"));
    await this.loadDraft();
    // (published since, while I was out: brought up to date)
    const live = publishedEdits();
    if (this.draft && live.rev !== this.base.rev) {
      this.rebase(this.base, live);
      this.counts();
    }
    if (this.on && this.draft) layDraft(this.draft.data);
  }

  leave() {
    if (!this.on) return;
    if (this.walking) this.walk(false);
    this.end();
    this.ring?.dispose();
    this.ring = null;
    this.roads?.cancel();
    this.roads?.dispose();
    this.roads = null;
    this.things?.cancel();
    this.things?.dispose();
    this.things = null;
    this.buildings?.dispose();
    this.buildings = null;
    this.on = false;
    const tp = this.w.tp;
    if (tp) tp.god = null;
    this.keys.clear();
    this.pointers.clear();
    this.w.send("god:leave", {});
    // (a first change's name still being asked: kept by the name in the box, or the one offered)
    const ask = hud.get().god.naming;
    if (ask?.why === "first" && this.changes()) void this.named(ask.name);
    else void this.saveNow();
    // (the draft kept, not shown: what's published again)
    layDraft(null);
    const n = this.changes();
    const name = this.draft?.name || ask?.name || "";
    this.set({ on: false, walking: false, publish: null, pointer: null, naming: null, drafts: this.listShut() });
    if (n && name) toast(tr("godKept").replace("{name}", name).replace("{n}", String(n)));
  }

  /** Walk it: on foot where the camera looks, in the draft (Esc: back up, where it was). */
  walk(on: boolean) {
    if (!this.on || on === this.walking) return;
    const tp = this.w.tp;
    if (!tp) return;
    this.end();
    this.ring?.show(null, 0, { x: 0, z: 0, y: 0 });
    this.roads?.cancel();
    this.roads?.hide();
    this.things?.cancel();
    this.things?.hide();
    this.buildings?.hide();
    this.walking = on;
    this.keys.clear();
    this.pointers.clear();
    this.w.send("god:walk", { on });
    if (on) {
      // (the ground floor's coords: where the camera looks)
      const f = tp.floorOffset(0);
      this.w.teleport({ x: this.at.x - f.x, y: this.at.z - f.z, level: 0 });
      tp.god = null;
    } else tp.god = { at: new Vector3(), dist: this.up, input: this.input };
    this.set({ walking: on, publish: null });
  }

  // ── each frame ─────────────────────────────────────────────────────────────
  /** The camera this frame (the controller's game camera), null when it's mine. */
  camera(dt: number): Cam {
    const tp = this.w.tp;
    if (!this.on || this.walking || !tp?.god) return null;
    this.move(dt);
    const g = terrainAt(this.at.x, this.at.z);
    // (behind the ground point, up: never under the land)
    const back = this.up / Math.tan(this.pitch);
    const ex = this.at.x - Math.cos(this.yaw) * back;
    const ez = this.at.z - Math.sin(this.yaw) * back;
    const ey = Math.max(g + this.up, terrainAt(ex, ez) + 2);
    const f = tp.groundsFrame();
    tp.god.at.set(this.at.x - f.x, g + f.y, this.at.z - f.z);
    tp.god.dist = Math.hypot(back, ey - g);
    // (the billboards — trees' cards, the people — face back along this camera)
    tp.yaw = this.yaw;
    this.ground.set(this.at.x, g, this.at.z);
    const pt = this.stroke?.at ?? this.mouse;
    this.under = pt ? tp.landUnder(pt.x, pt.y) : null;
    this.strokeFrame(dt);
    this.showRing(f);
    const tool = hud.get().god.tool;
    if (tool === "select") this.selectFrame(this.under, f);
    else {
      if (tool === "roads") this.roadsTool()?.frame(this.under, f);
      else this.roads?.hide();
      if (tool === "things") this.thingsTool()?.frame(this.under, f);
      else this.things?.hide();
      if (tool === "buildings") this.buildingsTool()?.frame(this.under, f);
      else this.buildings?.hide();
    }
    this.readouts();
    return {
      eye: [ex - f.x, ez - f.z, ey + f.y],
      look: [this.at.x - f.x, this.at.z - f.z, g + f.y],
      showMe: true,
      snap: true,
    };
  }

  private move(dt: number) {
    const k = this.keys;
    const fast = k.has("ShiftLeft") || k.has("ShiftRight") ? 3 : 1;
    let fx = 0;
    let sx = 0;
    if (k.has("KeyW") || k.has("ArrowUp")) fx += 1;
    if (k.has("KeyS") || k.has("ArrowDown")) fx -= 1;
    if (k.has("KeyD") || k.has("ArrowRight")) sx += 1;
    if (k.has("KeyA") || k.has("ArrowLeft")) sx -= 1;
    // the screen's edges, the mouse resting there (not dragging)
    const m = this.mouse;
    const c = this.w.tp?.renderer.domElement.getBoundingClientRect();
    if (m && c && !this.pointers.size) {
      if (m.x <= c.left + EDGE_PX) sx -= 1;
      if (m.x >= c.right - EDGE_PX) sx += 1;
      if (m.y <= c.top + EDGE_PX) fx += 1;
      if (m.y >= c.bottom - EDGE_PX) fx -= 1;
    }
    if (fx || sx) this.pan(fx, sx, Math.max(10, this.up * 0.9) * fast * dt);
    if (k.has("KeyQ")) this.yaw -= dt * 1.6;
    if (k.has("KeyE")) this.yaw += dt * 1.6;
    if (k.has("KeyR")) this.tilt(-dt * 0.9);
    if (k.has("KeyF")) this.tilt(dt * 0.9);
    if (k.has("Equal") || k.has("NumpadAdd")) this.zoom(Math.exp(-dt * 1.6));
    if (k.has("Minus") || k.has("NumpadSubtract")) this.zoom(Math.exp(dt * 1.6));
  }
  /** Along the way it looks (`ahead`) and across it (`side`), so many metres. */
  private pan(ahead: number, side: number, m: number) {
    const l = Math.hypot(ahead, side) || 1;
    const a = (ahead / l) * m;
    const s = (side / l) * m;
    const cx = Math.cos(this.yaw);
    const cz = Math.sin(this.yaw);
    // (right of the way it looks: −sin, cos)
    this.at.x = clamp(this.at.x + cx * a - cz * s, GROUNDS.x0, GROUNDS.x1);
    this.at.z = clamp(this.at.z + cz * a + cx * s, GROUNDS.z0, GROUNDS.z1);
  }
  zoom(by: number) {
    this.up = clamp(this.up * by, UP.min, UP.max);
  }
  private tilt(by: number) {
    this.pitch = clamp(this.pitch + by, PITCH.min, PITCH.max);
  }

  // what the HUD shows of the camera and the pointer (set when it changes enough to see)
  private readouts() {
    const up = Math.round(this.up);
    const yaw = Math.round((this.yaw * 180) / Math.PI / 3) * 3;
    const place = placeAt(this.at.x, this.at.z).name;
    const land = this.under;
    const pointer = land
      ? {
          x: Math.round(land.x),
          z: Math.round(land.z),
          h: Math.round(land.h * 10) / 10,
          surface: "",
          was: null as number | null,
          wasSurface: null as string | null,
        }
      : null;
    // (again once the draft's laid again: what's under it may have changed)
    const pk = pointer ? `${pointer.x},${pointer.z},${pointer.h},${layings()}` : "";
    if (up === this.shown.up && yaw === this.shown.yaw && place === this.shown.place && pk === this.shown.pointer)
      return;
    this.shown = { up, yaw, place, pointer: pk };
    if (pointer && land) {
      pointer.surface = groundSurfaceAt(land.x, land.z);
      // (what it was published, where the draft changed it)
      const d = this.draftNow();
      const lift = liftIn(d, land.x, land.z) - liftIn(this.base, land.x, land.z);
      if (Math.abs(lift) > 0.05) pointer.was = Math.round((land.h - lift) * 10) / 10;
      const p0 = paintIn(this.base, land.x, land.z);
      if (paintIn(d, land.x, land.z) !== p0) pointer.wasSurface = p0 ?? "generated";
    }
    this.set({ up, yaw: (yaw * Math.PI) / 180, place, pointer });
  }

  // ── keys (the controller's, while in god mode and not on foot) ─────────────
  /** A key down or up: god mode's (true) or not. */
  key(e: KeyboardEvent, down: boolean): boolean {
    if (!this.on) return false;
    if (this.walking) {
      if (!down || e.repeat) return false;
      if (e.key === "Escape") {
        this.walk(false);
        return true;
      }
      return false;
    }
    if (!down) {
      this.keys.delete(e.code);
      return true;
    }
    const k = e.key.toLowerCase();
    if ((e.metaKey || e.ctrlKey) && (k === "z" || k === "y")) {
      if (k === "y" || e.shiftKey) this.redo();
      else this.undo();
      return true;
    }
    if (e.metaKey || e.ctrlKey) return false;
    // the things tool: R turns (Shift: back), Delete takes the picked one away; a fence drawn as a way is
    const th = hud.get().god.tool === "things" ? this.things : null;
    if (th && !hud.get().god.publish && !e.repeat) {
      if (k === "r") {
        th.turn(e.shiftKey ? -15 : 15);
        return true;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && !th.drawing) {
        th.removePicked();
        return true;
      }
    }
    // the buildings tool: R turns a quarter, Delete takes the picked one away, Esc lets it go
    const bt = hud.get().god.tool === "buildings" ? this.buildings : null;
    if (bt && !hud.get().god.publish && !e.repeat) {
      if (k === "r") {
        bt.turn();
        return true;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        bt.removePicked();
        return true;
      }
      if (e.key === "Escape" && hud.get().god.buildings.sel) {
        bt.deselect();
        return true;
      }
    }
    // the select tool: R turns the picked thing or building, Delete takes the picked one away, Esc
    // lets it go
    const picked = hud.get().god.tool === "select" ? hud.get().god.picked : null;
    if (picked && !hud.get().god.publish && !e.repeat) {
      if (k === "r" && picked !== "way") {
        this.turnPicked(e.shiftKey);
        return true;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        this.removePicked();
        return true;
      }
      if (e.key === "Escape") {
        this.deselect();
        return true;
      }
    }
    // drawing a way (or a fence): Enter ends it, Backspace takes a point back, Esc lets it go
    const r = hud.get().god.tool === "roads" ? this.roads : th;
    if (r?.drawing && !hud.get().god.publish) {
      const act = e.key === "Enter" ? r.finish : e.key === "Backspace" ? r.back : e.key === "Escape" ? r.cancel : null;
      if (act) {
        act.call(r);
        return true;
      }
    }
    if (e.key === "Escape") {
      // (what's open over the camera closes first: the publish dialog, a name asked, the drafts)
      const g = hud.get().god;
      if (g.publish) this.closePublish();
      else if (g.naming) this.cancelNaming();
      else if (g.drafts.open) this.toggleDrafts(false);
      else this.leave();
      return true;
    }
    if (e.repeat) return true;
    if (k === "o" || e.key === "0") this.leave();
    else if (e.key === "[" || e.key === "]") this.resize(e.key === "]" ? 1.25 : 0.8);
    else if (e.key >= "1" && e.key <= "7") this.setTool(GOD_TOOLS[Number(e.key) - 1]);
    else this.keys.add(e.code);
    return true;
  }
  private onBlur = () => this.keys.clear();
  private onOut = (e: PointerEvent) => {
    // (the mouse out of the window: no edge to pan from)
    if (!e.relatedTarget) this.mouse = null;
  };

  // ── the pointer on the canvas (the view hands it over: tp.god.input) ───────
  private readonly input: GodInput = {
    down: (e) => {
      // a brush: the left button (one finger) presses it
      const tool = hud.get().god.tool;
      const touches = [...this.pointers.values()].filter((q) => q.touch).length;
      const woods = tool === "nature" && ["plant", "clear", "generated"].includes(hud.get().god.nature.mode);
      if ((tool === "land" || tool === "paint" || woods) && e.button === 0 && !touches && !this.stroke) {
        this.begin(e);
        if (e.pointerType !== "touch") return;
      } else if (this.stroke && e.pointerType === "touch") this.end(); // (a second finger: moving, not painting)
      // the roads tool: a point of a way picked to drag (else the press pans, or is a click)
      if (tool === "roads" && e.button === 0 && !touches && this.roadsTool()?.down(this.landAt(e))) {
        this.roadDrag = e.pointerId;
        return;
      }
      if (tool === "things" && e.button === 0 && !touches && this.thingsTool()?.down(this.landAt(e))) {
        this.thingDrag = e.pointerId;
        return;
      }
      if (tool === "buildings" && e.button === 0 && !touches && this.buildingsTool()?.down(this.landAt(e))) {
        this.buildingDrag = e.pointerId;
        return;
      }
      // the select tool: whatever's under it picked up to drag (else the press pans, or a click
      // on nothing lets the picked one go)
      if (tool === "select" && e.button === 0 && !touches) {
        const at = this.landAt(e);
        const kind = this.selectHit(at);
        const grabbed =
          kind === "thing"
            ? this.thingsTool()?.grab(at)
            : kind === "building"
              ? this.buildingsTool()?.down(at)
              : kind === "way"
                ? this.roadsTool()?.grabWay(at)
                : false;
        if (kind && grabbed) {
          this.selDrag = { id: e.pointerId, kind };
          return;
        }
      }
      this.pointers.set(e.pointerId, {
        x: e.clientX,
        y: e.clientY,
        button: e.button,
        touch: e.pointerType === "touch",
        x0: e.clientX,
        y0: e.clientY,
        t: performance.now(),
      });
      this.pinch = null;
    },
    move: (e) => {
      if (e.pointerType === "mouse") this.mouse = { x: e.clientX, y: e.clientY };
      if (this.stroke?.id === e.pointerId) {
        this.stroke.at = { x: e.clientX, y: e.clientY };
        return;
      }
      if (this.roadDrag === e.pointerId) return this.roads?.move(this.landAt(e));
      if (this.thingDrag === e.pointerId) return this.things?.move(this.landAt(e));
      if (this.buildingDrag === e.pointerId) return this.buildings?.move(this.landAt(e));
      if (this.selDrag?.id === e.pointerId) {
        const at = this.landAt(e);
        const k = this.selDrag.kind;
        return k === "thing"
          ? this.things?.move(at)
          : k === "building"
            ? this.buildings?.move(at)
            : this.roads?.move(at);
      }
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      const touches = [...this.pointers.values()].filter((q) => q.touch);
      if (touches.length >= 2) return this.twoFingers(touches[0], touches[1]);
      if (p.button === 2) {
        // the right button: turn and tilt
        this.yaw += dx * 0.005;
        this.tilt(dy * 0.004);
      } else if (p.button === 1) this.tilt(dy * 0.005);
      else this.drag(dx, dy);
    },
    up: (e) => {
      if (this.stroke?.id === e.pointerId) this.end();
      if (this.roadDrag === e.pointerId) {
        this.roadDrag = null;
        this.roads?.up(this.landAt(e), false, e);
        return;
      }
      if (this.thingDrag === e.pointerId) {
        this.thingDrag = null;
        this.things?.up(this.landAt(e), false, e);
        return;
      }
      if (this.buildingDrag === e.pointerId) {
        this.buildingDrag = null;
        this.buildings?.up(this.landAt(e), false);
        return;
      }
      if (this.selDrag?.id === e.pointerId) {
        const k = this.selDrag.kind;
        this.selDrag = null;
        if (k === "thing") this.things?.up(this.landAt(e), false, e);
        else if (k === "building") this.buildings?.up(this.landAt(e), false);
        else this.roads?.upWay();
        this.pickedNow(k);
        return;
      }
      const p = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      this.pinch = null;
      // a click (not a pan): the roads tool's, the things tool's, one tree, one rock
      if (
        p &&
        p.button === 0 &&
        e.type === "pointerup" &&
        Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < 6 &&
        performance.now() - p.t < 600
      ) {
        const tool = hud.get().god.tool;
        if (tool === "roads") this.roads?.up(this.landAt(e), true, e);
        else if (tool === "things") this.thingsTool()?.up(this.landAt(e), true, e);
        else if (tool === "buildings") this.buildingsTool()?.up(this.landAt(e), true);
        else if (tool === "nature") this.natureClick(this.landAt(e));
        else if (tool === "select") this.deselect();
      }
    },
    wheel: (e) => {
      // (shift: tilt; else zoom, a trackpad's small steps as smooth as a wheel's)
      if (e.shiftKey) this.tilt((e.deltaY || e.deltaX) * 0.002);
      else this.zoom(Math.exp(clamp(e.deltaY, -120, 120) * 0.0016));
    },
  };
  private landAt(e: { clientX: number; clientY: number }) {
    return this.w.tp?.landUnder(e.clientX, e.clientY) ?? null;
  }

  // ── the select tool (the mock 08-select): anything, generated, placed or edited ──
  private selDrag: { id: number; kind: "thing" | "building" | "way" } | null = null;
  /** What's under `at`: the smallest first (a thing, a building, a way). */
  private selectHit(at: { x: number; z: number } | null): "thing" | "building" | "way" | null {
    if (!at) return null;
    if (this.thingsTool()?.hits(at)) return "thing";
    if (buildingAt(at.x, at.z)) return "building";
    if (this.roadsTool()?.hits(at)) return "way";
    return null;
  }
  /** Each frame: the box or line round what's under the pointer (else round the picked one). */
  private selectFrame(at: { x: number; z: number; h: number } | null, f: { x: number; z: number; y: number }) {
    const g = hud.get().god;
    const kind = this.selDrag?.kind ?? this.selectHit(at) ?? g.picked;
    // (the picked one's tool shows it when the pointer's on nothing: no hover for the others)
    const over = this.selDrag || this.selectHit(at) ? at : null;
    if (kind === "thing") this.thingsTool()?.frame(over, f, true);
    else this.things?.hide();
    if (kind === "building") this.buildingsTool()?.frame(over, f, true);
    else this.buildings?.hide();
    if (kind === "way") this.roadsTool()?.frame(over, f, true);
    else this.roads?.hide();
  }
  /** `kind` picked (if its tool has it picked): the others let go. */
  private pickedNow(kind: "thing" | "building" | "way") {
    const g = hud.get().god;
    const has = kind === "thing" ? !!g.things.sel : kind === "building" ? !!g.buildings.sel : !!g.roads.sel;
    if (kind !== "thing") this.things?.deselect();
    if (kind !== "building") this.buildings?.deselect();
    if (kind !== "way") this.roads?.deselect();
    this.set({ picked: has ? kind : null });
  }
  /** Select's: what's picked let go. */
  deselect() {
    this.things?.deselect();
    this.buildings?.deselect();
    this.roads?.deselect();
    this.set({ picked: null });
  }
  /** Select's: the picked thing turned 15° (back: −15), or the picked building a quarter. */
  turnPicked(back = false) {
    const k = hud.get().god.picked;
    if (k === "thing") this.thingsTool()?.turn(back ? -15 : 15);
    else if (k === "building") this.buildingsTool()?.turn();
  }
  /** Select's: the picked one taken away. */
  removePicked() {
    const k = hud.get().god.picked;
    if (k === "thing") this.thingsTool()?.removePicked();
    else if (k === "building") this.buildingsTool()?.removePicked();
    else if (k === "way") this.roadsTool()?.removePicked();
    const g = hud.get().god;
    if (!(k === "thing" ? g.things.sel : k === "building" ? g.buildings.sel : g.roads.sel)) this.set({ picked: null });
  }
  /** Select's: the picked way's points edited (the roads tool, Edit points, the way picked). */
  editWay() {
    const sel = hud.get().god.roads.sel;
    if (!sel) return;
    this.setTool("roads");
    this.set({ roads: { ...hud.get().god.roads, mode: "edit", sel } });
  }
  /** The roads tool (made the first time it's needed). */
  roadsTool(): RoadsTool | null {
    const tp = this.w.tp;
    if (!this.roads && tp)
      this.roads = new RoadsTool(
        {
          draft: () => this.draftNow(),
          change: (next) => this.change(next),
          up: () => this.up,
          snap: () => hud.get().god.snap,
        },
        tp.scene,
      );
    return this.roads;
  }

  /** The things tool (made the first time it's needed). */
  thingsTool(): ThingsTool | null {
    const tp = this.w.tp;
    if (!this.things && tp)
      this.things = new ThingsTool(
        {
          draft: () => this.draftNow(),
          change: (next) => this.change(next),
          up: () => this.up,
          snap: () => hud.get().god.snap,
        },
        tp.scene,
      );
    return this.things;
  }
  /** The buildings tool (made the first time it's needed). */
  buildingsTool(): BuildingsTool | null {
    const tp = this.w.tp;
    if (!this.buildings && tp)
      this.buildings = new BuildingsTool(
        { draft: () => this.draftNow(), change: (next) => this.change(next) },
        tp.scene,
      );
    return this.buildings;
  }
  /** One tree (a cell with one: none; without: one of the kind asked for), or one rock. */
  private natureClick(at: { x: number; z: number } | null) {
    const n = hud.get().god.nature;
    if (!at) return;
    if (n.mode === "tree") {
      const i = Math.floor(at.x / 3.2);
      const j = Math.floor(at.z / 3.2);
      const has = treesIn(Math.floor(at.x / CHUNK), Math.floor(at.z / CHUNK)).some(
        (t) => Math.floor(t.x / 3.2) === i && Math.floor(t.z / 3.2) === j,
      );
      this.change(oneTree(this.draftNow(), at.x, at.z, has ? null : n.pick));
    } else if (n.mode === "rock") {
      const why = thingBlocked("boulder", at.x, at.z);
      if (why) return void toast(tr("godThingBlocked").replace("{why}", why), "warn");
      const d = this.draftNow();
      const s = Math.round((0.8 + Math.random() * 0.7) * 10) / 10;
      this.change(addThing(d, { key: newThingKey(d), kind: "boulder", x: at.x, z: at.z, ry: Math.random() * 6.28, s }));
    }
  }

  // ── the brushes ───────────────────────────────────────────────────────────
  private begin(e: PointerEvent) {
    const tp = this.w.tp;
    const at = tp?.landUnder(e.clientX, e.clientY);
    if (!at || !this.draft) return;
    const g = hud.get().god;
    const n = g.nature;
    const s =
      g.tool === "land"
        ? new LandStroke(this.draft.data, g.land.mode, g.land.size, g.land.strength, at)
        : g.tool === "nature"
          ? new WoodsStroke(this.draft.data, n.mode as "plant" | "clear" | "generated", n.pick, n.thick / 100, n.size)
          : new PaintStroke(this.draft.data, g.paint.surface, g.paint.size);
    this.stroke = {
      s,
      id: e.pointerId,
      at: { x: e.clientX, y: e.clientY },
      laid: performance.now(),
      first: true,
      v: 0,
    };
    if (!(s instanceof LandStroke)) s.apply(at.x, at.z);
  }
  /** The brush held this frame where the pointer is (paint: along the way it moved). */
  private strokeFrame(dt: number) {
    const st = this.stroke;
    const at = this.under;
    if (!st || !at) return;
    if (st.s instanceof LandStroke)
      st.s.apply(at.x, at.z, dt, this.keys.has("ShiftLeft") || this.keys.has("ShiftRight"));
    else st.s.apply(at.x, at.z);
    if (performance.now() - st.laid > STROKE_LAY_MS) this.layStroke();
  }
  private layStroke() {
    const st = this.stroke;
    if (!st || !this.draft) return;
    st.laid = performance.now();
    if (st.s.version === st.v) return;
    st.v = st.s.version;
    const next = st.s.edits();
    // (its first lay a step to undo; the rest of it the same step)
    if (st.first) this.change(next);
    else this.lay(next);
    st.first = false;
  }
  private end() {
    if (!this.stroke) return;
    this.layStroke();
    this.stroke = null;
  }
  private showRing(f: { x: number; z: number; y: number }) {
    const g = hud.get().god;
    const woods = g.tool === "nature" && ["plant", "clear", "generated"].includes(g.nature.mode);
    const on = g.tool === "land" || g.tool === "paint" || woods;
    if (on && !this.ring && this.w.tp) this.ring = new BrushRing(this.w.tp.scene);
    const size = g.tool === "land" ? g.land.size : woods ? g.nature.size : g.paint.size;
    this.ring?.show(on ? this.under : null, size / 2, f);
  }

  /** Dragged so many px: the ground under the pointer stays under it (near enough). */
  private drag(dx: number, dy: number) {
    const tp = this.w.tp;
    if (!tp) return;
    const h = tp.renderer.domElement.clientHeight || 1;
    const dist = this.up / Math.sin(this.pitch);
    const m = (2 * dist * Math.tan(((tp.camera.fov / 2) * Math.PI) / 180)) / h;
    this.pan(dy / Math.sin(this.pitch), -dx, m * Math.hypot(dx, dy / Math.sin(this.pitch)));
  }
  // two fingers: their middle pans, apart or together zooms, a twist turns
  private twoFingers(a: { x: number; y: number }, b: { x: number; y: number }) {
    const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const p = this.pinch;
    if (p) {
      this.zoom(p.d / d);
      this.yaw -= Math.atan2(Math.sin(ang - p.a), Math.cos(ang - p.a));
      this.drag(mx - p.mx, my - p.my);
    }
    this.pinch = { d, a: ang, mx, my };
  }

  // ── the draft ─────────────────────────────────────────────────────────────
  /** The draft as it is (what a tool changes from). */
  draftNow(): GroundsEdits {
    return this.draft?.data ?? publishedEdits();
  }
  /** A change to the draft (a tool's, a step to undo): laid, and saved a moment on. */
  change(next: GroundsEdits) {
    if (!this.draft) return;
    this.past.push(this.draft.data);
    if (this.past.length > HISTORY) this.past.shift();
    this.future = [];
    this.lay(next);
    // (no draft open: the first change asks its name — kept here till it has one)
    if (this.draft.id === null && !hud.get().god.naming) this.ask("first");
  }
  undo() {
    this.end();
    const prev = this.past.pop();
    if (!prev || !this.draft) return;
    this.future.push(this.draft.data);
    this.lay(prev);
  }
  redo() {
    this.end();
    const next = this.future.pop();
    if (!next || !this.draft) return;
    this.past.push(this.draft.data);
    this.lay(next);
  }
  private lay(data: GroundsEdits) {
    if (!this.draft) return;
    this.draft = { ...this.draft, data };
    if (this.on) layDraft(data);
    this.counts();
    this.saveSoon();
  }
  /** What the draft changes against what it's made on. */
  changes(): number {
    return this.draft ? editsCount(this.base, this.draft.data).total : 0;
  }
  private counts() {
    this.set({
      changes: this.changes(),
      undo: this.past.length,
      redo: this.future.length,
      rev: this.base.rev,
      issues: this.draft ? slopeIssues(this.base, this.draft.data) : [],
    });
  }

  /** My drafts fetched (once): the one open last opened again (else the newest), brought up to
   *  date with what's published; none, nothing open till the first change asks a name. */
  loadDraft(): Promise<void> {
    if (this.draft) return Promise.resolve();
    this.loading ??= (async () => {
      const live = publishedEdits();
      const rows = await this.list();
      this.base = live;
      const want = rows?.find((r) => r.id === lastOpen()) ?? rows?.[0];
      if (!want || !(await this.fetchOpen(want.id, live))) this.blank(live);
      this.set({ loaded: true });
      this.counts();
    })().finally(() => {
      this.loading = null;
    });
    return this.loading;
  }
  /** No draft open: what's published, as it is. */
  private blank(live: GroundsEdits) {
    this.base = live;
    this.draft = { id: null, name: "", baseRev: live.rev, data: live };
    this.saved = live;
    this.past = [];
    this.future = [];
    setLast(null);
    this.set({ draft: { id: null, name: "" }, save: "saved" });
  }
  /** Draft `id` fetched and open (made on an older revision: brought up to date). */
  private async fetchOpen(id: number, live: GroundsEdits): Promise<boolean> {
    let d: DraftRow & { data: GroundsEdits };
    let base: GroundsEdits = { rev: 0 };
    try {
      d = (await api<{ draft: DraftRow & { data: GroundsEdits } }>(`/api/admin/grounds/drafts/${id}`)).draft;
      if (d.baseRev && d.baseRev !== live.rev)
        base = (await api<{ revision: { data: GroundsEdits } }>(`/api/admin/grounds/revisions/${d.baseRev}`)).revision
          .data;
    } catch (e) {
      console.warn("[god] the draft couldn't be fetched:", e);
      return false;
    }
    this.base = live;
    this.past = [];
    this.future = [];
    this.draft = { id: d.id, name: d.name, baseRev: d.baseRev, data: d.data };
    this.saved = d.data;
    this.set({ draft: { id: d.id, name: d.name }, save: "saved" });
    // (made on an older revision: brought up to date)
    if (d.baseRev !== live.rev) this.rebase(base, live);
    setLast(d.id);
    return true;
  }
  /** Brought up to date with what's published now (`live`), from what it was made on (`base`). */
  private rebase(base: GroundsEdits, live: GroundsEdits) {
    if (!this.draft) return;
    const { edits, overlaps } = mergeEdits(base, this.draft.data, live);
    // (the history's steps were made on the old: they go)
    this.past = [];
    this.future = [];
    this.base = live;
    this.draft = { ...this.draft, baseRev: live.rev, data: edits };
    if (overlaps.length)
      toast(tr("godMerged").replace("{rev}", String(live.rev)).replace("{what}", said(overlaps)), "warn", 8000);
    this.saveSoon();
  }
  /** What's published changed under the draft (someone's publish, a roll back, mine): merged in. */
  private published(live: GroundsEdits) {
    if (!this.draft || live.rev === this.base.rev) return;
    this.rebase(this.base, live);
    if (this.on) layDraft(this.draft.data);
    this.counts();
  }

  private saveSoon() {
    if (this.saving) clearTimeout(this.saving);
    // (no name yet: nowhere to save it till it has one)
    if (this.draft?.id === null) return;
    this.set({ save: "saving" });
    this.saving = setTimeout(() => void this.saveNow(), SAVE_MS);
  }
  /** Saved now (a publish, a switch, the Save button wait for it). */
  async saveNow(): Promise<boolean> {
    if (this.saving) clearTimeout(this.saving);
    this.saving = null;
    const d = this.draft;
    // (undone back to what's saved: nothing to send, but saved all the same)
    if (!d || d.data === this.saved) {
      if (d) this.set({ save: "saved" });
      return true;
    }
    if (d.id === null) return false;
    try {
      await api(`/api/admin/grounds/drafts/${d.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseRev: d.baseRev, data: d.data, changes: editsCount(this.base, d.data).total }),
      });
      this.saved = d.data;
      if (this.draft === d) this.set({ save: "saved" });
      return true;
    } catch (e) {
      console.warn("[god] the draft couldn't be saved:", e);
      if (this.draft?.id !== d.id) return false;
      this.set({ save: "failed" });
      this.saving = setTimeout(() => void this.saveNow(), RETRY_MS);
      return false;
    }
  }
  /** The strip's Save: kept now, and said (no name yet: it's asked). */
  async save() {
    const d = this.draft;
    if (!d) return;
    if (d.id === null) return this.ask("first");
    if (await this.saveNow()) toast(tr("godSaved").replace("{name}", d.name));
  }

  // ── my drafts (docs/plan/55-the-drafts.md; the mocks 15-drafts, 16-named) ──
  private listShut(): GodHud["drafts"] {
    return { ...hud.get().god.drafts, open: false };
  }
  /** My drafts, fetched again (the list's). */
  async list(): Promise<DraftRow[] | null> {
    try {
      const r = await api<{ drafts: DraftRow[]; max: number }>("/api/admin/grounds/drafts");
      this.set({ drafts: { ...hud.get().god.drafts, list: r.drafts, max: r.max, failed: false } });
      return r.drafts;
    } catch (e) {
      console.warn("[god] the drafts couldn't be fetched:", e);
      this.set({ drafts: { ...hud.get().god.drafts, failed: true } });
      return null;
    }
  }
  /** The list shown or not (shown: the open one saved first, so its count is right). */
  toggleDrafts(open = !hud.get().god.drafts.open) {
    this.set({ drafts: { ...hud.get().god.drafts, open } });
    if (open) void this.saveNow().then(() => this.list());
  }
  /** A new draft's name asked: the first change's (no draft open), or the list's New draft. */
  ask(why: "first" | "new", name = "") {
    const n = (hud.get().god.drafts.list?.length ?? 0) + 1;
    this.set({ naming: { why, name: name || tr("godDraftN").replace("{n}", String(n)) } });
  }
  setNaming(name: string) {
    const a = hud.get().god.naming;
    if (a) this.set({ naming: { ...a, name: name.slice(0, NAME_MAX) } });
  }
  /** The name dialog's Cancel: the first change's undone (nothing open, as before); else nothing. */
  cancelNaming() {
    const a = hud.get().god.naming;
    this.set({ naming: null });
    if (a?.why !== "first" || this.draft?.id !== null) return;
    this.blank(this.base);
    if (this.on) layDraft(this.base);
    this.counts();
  }
  /** The name dialog's Make it: the first change's draft kept by that name, or a new one opened. */
  async named(name: string) {
    const n = name.trim().slice(0, NAME_MAX);
    const a = hud.get().god.naming;
    if (!n || !a) return;
    this.set({ naming: null });
    if (a.why === "new") return this.newDraft(n);
    const d = this.draft;
    if (!d || d.id !== null) return;
    const row = await this.make(n, d.data);
    if (!row) return this.set({ naming: a });
    // (what's changed since it was sent: saved a moment on)
    if (!this.draft || this.draft.id !== null) return;
    this.draft = { ...this.draft, id: row.id, name: row.name };
    this.saved = d.data;
    setLast(row.id);
    this.set({ draft: { id: row.id, name: row.name } });
    if (this.draft.data !== d.data) this.saveSoon();
    else this.set({ save: "saved" });
    void this.list();
  }
  /** A draft made on the API (null: refused, said). */
  private async make(name: string, data: GroundsEdits): Promise<DraftRow | null> {
    try {
      const r = await api<{ draft: DraftRow }>("/api/admin/grounds/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          baseRev: this.base.rev,
          data,
          changes: editsCount(this.base, data).total,
        }),
      });
      return r.draft;
    } catch (e) {
      toast(tr("godDraftFailed").replace("{why}", (e as Error).message), "warn");
      return null;
    }
  }
  /** A new draft, from what's live, opened (the one open saved first). */
  async newDraft(name: string) {
    await this.saveNow();
    const live = publishedEdits();
    this.base = live;
    const row = await this.make(name.trim().slice(0, NAME_MAX), live);
    if (!row) return;
    this.closeTools();
    this.draft = { id: row.id, name: row.name, baseRev: live.rev, data: live };
    this.saved = live;
    this.past = [];
    this.future = [];
    setLast(row.id);
    if (this.on) layDraft(live);
    this.set({ draft: { id: row.id, name: row.name }, save: "saved", drafts: this.listShut() });
    this.counts();
    void this.list();
  }
  /** Draft `id` opened (the one open saved and closed first). */
  async openDraft(id: number) {
    if (this.draft?.id === id) return this.set({ drafts: this.listShut() });
    await this.saveNow();
    this.closeTools();
    if (!(await this.fetchOpen(id, publishedEdits()))) return toast(tr("godDraftGone"), "warn");
    if (this.on && this.draft) layDraft(this.draft.data);
    this.set({ drafts: this.listShut() });
    this.counts();
  }
  async renameDraft(id: number, name: string) {
    const n = name.trim().slice(0, NAME_MAX);
    if (!n) return;
    try {
      await api(`/api/admin/grounds/drafts/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: n }),
      });
    } catch (e) {
      return toast(tr("godDraftFailed").replace("{why}", (e as Error).message), "warn");
    }
    if (this.draft?.id === id) {
      this.draft = { ...this.draft, name: n };
      this.set({ draft: { id, name: n } });
    }
    void this.list();
  }
  /** A copy of draft `id` (to try another way), in the list. */
  async duplicateDraft(id: number) {
    if (this.draft?.id === id) await this.saveNow();
    try {
      const d = (await api<{ draft: DraftRow & { data: GroundsEdits } }>(`/api/admin/grounds/drafts/${id}`)).draft;
      await api("/api/admin/grounds/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: tr("godDraftCopy").replace("{name}", d.name).slice(0, NAME_MAX),
          baseRev: d.baseRev,
          data: d.data,
          changes: d.changes,
        }),
      });
    } catch (e) {
      return toast(tr("godDraftFailed").replace("{why}", (e as Error).message), "warn");
    }
    void this.list();
  }
  /** Draft `id` deleted (the list asked first); the open one: nothing open after it. */
  async deleteDraft(id: number) {
    const name = hud.get().god.drafts.list?.find((r) => r.id === id)?.name ?? "";
    try {
      await api(`/api/admin/grounds/drafts/${id}`, { method: "DELETE" });
    } catch (e) {
      return toast(tr("godDraftFailed").replace("{why}", (e as Error).message), "warn");
    }
    if (this.draft?.id === id) {
      if (this.saving) clearTimeout(this.saving);
      this.saving = null;
      this.closeTools();
      this.blank(publishedEdits());
      if (this.on) layDraft(this.base);
      this.counts();
    }
    toast(tr("godDraftDeleted").replace("{name}", name));
    void this.list();
  }
  /** The tools let go of what they had (another draft's coming in). */
  private closeTools() {
    this.end();
    this.roads?.cancel();
    this.things?.cancel();
    this.deselect();
  }

  // ── publishing ────────────────────────────────────────────────────────────
  openPublish() {
    if (!this.changes()) return;
    // (no name yet: asked first)
    if (this.draft?.id === null) return this.ask("first");
    this.set({ publish: { state: "open" } });
  }
  closePublish() {
    if (hud.get().god.publish?.state === "sending") return;
    this.set({ publish: null });
  }
  /** What a publish would change, and whether it can (the shared rule book, the size). */
  summary(): PublishSummary {
    const d = this.draftNow();
    const count = editsCount(this.base, d);
    const bytes = JSON.stringify(d).length;
    const chunks = new Map<string, [number, number]>();
    for (const f of ["height", "paint", "trees"] as const) {
      const a = this.base[f] ?? {};
      const b = d[f] ?? {};
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)]))
        if (a[k] !== b[k]) {
          const [cx, cz] = k.split(",").map(Number);
          chunks.set(k, [cx, cz]);
        }
    }
    // (who stands where the land's height changes: lifted onto it)
    const lifted = new Set<string>();
    const ha = this.base.height ?? {};
    const hb = d.height ?? {};
    for (const k of new Set([...Object.keys(ha), ...Object.keys(hb)])) if (ha[k] !== hb[k]) lifted.add(k);
    let standing = 0;
    const tp = this.w.tp;
    for (const p of this.w.room?.state.players.values() ?? []) {
      if (p.level !== 0 || !tp) continue;
      const f = tp.floorOffset(0);
      if (lifted.has(`${Math.floor((p.x + f.x) / 32)},${Math.floor((p.y + f.z) / 32)}`)) standing++;
    }
    return {
      count,
      problems: checkEdits(d),
      bytes,
      maxBytes: MAX_BYTES,
      standing,
      chunks: [...chunks.values()],
      issues: slopeIssues(this.base, d),
    };
  }
  async publish(note: string) {
    const id = this.draft?.id;
    if (!id || hud.get().god.publish?.state === "sending") return;
    this.set({ publish: { state: "sending" } });
    if (!(await this.saveNow())) {
      this.set({ publish: { state: "refused", reason: tr("godSaveFailed"), problems: [] } });
      return;
    }
    this.w.send("god:publish", { draftId: id, note: note.trim().slice(0, 140) });
  }
  private done(rev: number) {
    // (a roll back's answer is this too: only my publish makes the draft what's live)
    if (!this.draft || hud.get().god.publish?.state !== "sending") return;
    // (mine, published: what's live now, the draft gone from the API's list; nothing open)
    this.blank({ ...this.draft.data, rev });
    if (this.on) layDraft(this.base);
    this.set({ publish: null });
    this.counts();
    toast(tr("godPublished").replace("{rev}", String(rev)));
    void this.list();
  }
  private refused(m: ServerMessages["god:refused"]) {
    if (hud.get().god.publish) this.set({ publish: { state: "refused", reason: m.reason, problems: m.problems } });
  }

  // ── the HUD's ─────────────────────────────────────────────────────────────
  setTool(t: GodTool) {
    if (!GOD_READY.has(t)) toast(tr("godToolSoon").replace("{tool}", tr(`godTool_${t}` as Key)));
    else {
      this.end();
      this.roads?.cancel();
      this.roads?.hide();
      this.things?.cancel();
      this.things?.hide();
      this.buildings?.hide();
      // (into Select or out of it: nothing picked by it)
      this.set({ tool: t, picked: null });
    }
  }
  /** The land brush's or the paint brush's settings. */
  setLand(p: Partial<GodHud["land"]>) {
    this.set({ land: { ...hud.get().god.land, ...p } });
  }
  /** The roads tool's mode (Draw, Edit points, Remove): what was being drawn let go. */
  setRoadMode(mode: GodHud["roads"]["mode"]) {
    this.roads?.cancel();
    this.set({ roads: { ...hud.get().god.roads, mode, sel: null } });
  }
  /** The nature tool's settings. */
  setNature(p: Partial<GodHud["nature"]>) {
    this.end();
    this.set({ nature: { ...hud.get().god.nature, ...p } });
  }
  /** The brush made bigger or smaller (the [ and ] keys). */
  private resize(by: number) {
    const g = hud.get().god;
    if (g.tool === "land") this.setLand({ size: clamp(Math.round(g.land.size * by), BRUSH.land.min, BRUSH.land.max) });
    else if (g.tool === "paint")
      this.setPaint({ size: clamp(Math.round(g.paint.size * by), BRUSH.paint.min, BRUSH.paint.max) });
  }
  setPaint(p: Partial<GodHud["paint"]>) {
    this.set({ paint: { ...hud.get().god.paint, ...p } });
  }
  setSnap(s: GodHud["snap"]) {
    this.set({ snap: s });
  }
  /** Turned to face north (the compass's click). */
  north() {
    this.yaw = -Math.PI / 2;
  }
  private set(p: Partial<GodHud>) {
    hud.set((s) => ({ god: { ...s.god, ...p } }));
  }
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Where both changed the same things, in words ("the land in 2 chunks, a way"). */
function said(o: Overlap[]): string {
  const by = new Map<string, number>();
  for (const x of o) by.set(x.kind, (by.get(x.kind) ?? 0) + 1);
  return [...by].map(([k, n]) => tr(`godOverlap_${k}` as Key).replace("{n}", String(n))).join(", ");
}
