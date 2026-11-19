import type { Way } from "@yutopia/shared/grounds";
import {
  addBridge,
  alongAt,
  BRIDGE_LIMITS,
  BRIDGE_LOOK,
  type Bridge,
  bridgeAt,
  bridgeDefOf,
  bridgeOf,
  bridgeWay,
  bridgeWayAt,
  changeBridge,
  fitSpan,
  newBridgeKey,
  newBridgeStyle,
  pointAlong,
  removeBridge,
} from "@yutopia/shared/grounds-bridges";
import type { BridgeDef, GroundsEdits } from "@yutopia/shared/grounds-edits";
import {
  BufferGeometry,
  CircleGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Scene,
} from "three";
import { tr } from "@/lib/i18n";
import { type GodHud, hud, toast } from "../store";

// God mode's bridges (docs/plan/109-bridges.md): a bridge is a stretch of a way. The Bridges tool's Add: a click on a
// road, street or trail where it starts, another where it ends (the stretch shown between, red where it can't be: on
// another bridge, too short); Edit: a bridge picked, either end dragged along its way; Remove: a click takes one away.
// Select's too: a bridge picked by its deck (over its way), its ends dragged, Delete takes it away. Its style, colour,
// sides and piers from the panel. Each a step of the draft.

type Frame = { y: number };
type Ground = { x: number; z: number; h: number } | null;
export interface BridgesHost {
  draft(): GroundsEdits;
  change(next: GroundsEdits): void;
  /** the camera's metres over the land (how near an end must be to be grabbed) */
  up(): number;
}
const AMBER = 0xf1d79a; // (the HUD's lamp)
const RED = 0xc8553f;
const PICKED = 0x8fc6e8;
const MAX = 1200;

/** A stretch of a way shown over its deck (or its road): a band as wide as the way, a dot at each end. */
class BridgeGhost {
  readonly root = new Group();
  private readonly band: Mesh;
  private readonly mat = new MeshBasicMaterial({
    color: AMBER,
    transparent: true,
    opacity: 0.32,
    depthTest: false,
    side: DoubleSide,
  });
  private readonly dotMat = new MeshBasicMaterial({ color: AMBER, depthTest: false, transparent: true });
  private readonly dots: Mesh[];
  private key = "";
  constructor(scene: Scene) {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(new Float32Array(MAX * 6), 3));
    this.band = new Mesh(g, this.mat);
    const dot = new CircleGeometry(1, 24).rotateX(-Math.PI / 2);
    this.dots = [new Mesh(dot, this.dotMat), new Mesh(dot, this.dotMat)];
    for (const o of [this.band, ...this.dots]) {
      o.renderOrder = 21;
      o.frustumCulled = false;
      this.root.add(o);
    }
    this.root.visible = false;
    scene.add(this.root);
  }
  /** Way w from `m0` to `m1` metres along it, in `col`; `dot`: how big its ends' dots (0: none). Null: hidden. */
  show(w: Way | null, m0: number, m1: number, col: number, dot: number, f: Frame) {
    if (!w) {
      this.root.visible = false;
      this.key = "";
      return;
    }
    this.root.visible = true;
    const a = Math.min(m0, m1);
    const b = Math.max(m0, m1);
    const k = `${w.key}|${a}|${b}|${col}|${dot}|${f.y}|${w.h.length}`;
    if (k === this.key) return;
    this.key = k;
    this.mat.color.setHex(col);
    this.dotMat.color.setHex(col);
    const n = Math.min(MAX - 1, Math.max(1, Math.ceil(b - a)));
    const p = this.band.geometry.getAttribute("position") as Float32BufferAttribute;
    const idx: number[] = [];
    const half = w.w / 2 + 0.6;
    const at = (m: number): [number, number, number] => {
      const [x, z] = pointAlong(w, m);
      return [x, heightAlong(w, m) + 0.35 + f.y, z];
    };
    for (let i = 0; i <= n; i++) {
      const m = a + ((b - a) * i) / n;
      const [x, y, z] = at(m);
      const [ax, , az] = at(Math.max(a, m - 0.5));
      const [bx, , bz] = at(Math.min(b, m + 0.5));
      const l = Math.hypot(bx - ax, bz - az) || 1;
      const nx = (-(bz - az) / l) * half;
      const nz = ((bx - ax) / l) * half;
      p.setXYZ(i * 2, x + nx, y, z + nz);
      p.setXYZ(i * 2 + 1, x - nx, y, z - nz);
      if (i) idx.push(i * 2 - 2, i * 2 - 1, i * 2, i * 2 - 1, i * 2 + 1, i * 2);
    }
    p.needsUpdate = true;
    this.band.geometry.setIndex(idx);
    this.band.geometry.setDrawRange(0, idx.length);
    for (const [d, m] of [
      [this.dots[0], a],
      [this.dots[1], b],
    ] as const) {
      d.visible = dot > 0;
      const [x, y, z] = at(m);
      d.position.set(x, y + 0.05, z);
      d.scale.setScalar(Math.max(0.01, dot));
    }
  }
  dispose() {
    this.root.removeFromParent();
    this.band.geometry.dispose();
    this.dots[0].geometry.dispose();
    this.mat.dispose();
    this.dotMat.dispose();
  }
}
/** A way's height `m` metres along it (between its samples). */
function heightAlong(w: Way, m: number): number {
  const [x, z] = pointAlong(w, m);
  let best = 0;
  let d = Number.POSITIVE_INFINITY;
  for (let i = 0; i < w.line.length; i++) {
    const e = Math.hypot(w.line[i][0] - x, w.line[i][1] - z);
    if (e < d) {
      d = e;
      best = i;
    }
  }
  return w.h[best];
}

export class BridgesTool {
  private ghost: BridgeGhost | null = null;
  // Add's first click: on which way, how far along it
  private start: { way: string; m: number } | null = null;
  // an end dragged: the bridge, which end, its stretch now
  private drag: { key: string; end: 0 | 1; s0: number; s1: number; moved: boolean } | null = null;
  private pointerM: number | null = null;

  constructor(
    private readonly host: BridgesHost,
    private readonly scene: Scene,
  ) {}

  private get o(): GodHud["bridges"] {
    return hud.get().god.bridges;
  }
  private setO(p: Partial<GodHud["bridges"]>) {
    hud.set((s) => ({ god: { ...s.god, bridges: { ...s.god.bridges, ...p } } }));
  }
  get drawing(): boolean {
    return !!this.start;
  }
  get dragging(): boolean {
    return !!this.drag;
  }
  /** A bridge under `at` (Select's hit test: before the way it's on). */
  hits(at: { x: number; z: number } | null): boolean {
    return !!at && !!bridgeAt(at.x, at.z);
  }

  /** The panel's: the picked bridge (or the next one added) changed — its style, colour, sides, piers. */
  setOpts(p: Partial<Pick<BridgeDef, "style" | "colour" | "rails" | "piers">>) {
    const sel = this.o.sel;
    if (!sel) {
      if (p.style) this.setO({ style: p.style });
      return;
    }
    this.host.change(changeBridge(this.host.draft(), sel.key, p));
    const L = p.style ? BRIDGE_LOOK[p.style] : null;
    this.setO({
      sel: {
        ...sel,
        style: p.style ?? sel.style,
        colour: p.colour ?? L?.colour ?? sel.colour,
        rails: p.rails ?? L?.rails ?? sel.rails,
        piers: p.piers ?? L?.piers ?? sel.piers,
      },
      ...(p.style && { style: p.style }),
    });
  }
  private pick(b: Bridge | BridgeDef, made: boolean) {
    const d = "w" in b ? bridgeDefOf(b) : b;
    const L = BRIDGE_LOOK[d.style];
    const w = bridgeWay(d.way);
    this.setO({
      sel: {
        key: d.key,
        name: w?.name ?? d.way,
        made,
        style: d.style,
        colour: d.colour ?? L.colour,
        rails: d.rails ?? L.rails,
        piers: d.piers ?? L.piers,
        m: Math.round(Math.abs(d.s1 - d.s0)),
      },
    });
  }
  removePicked() {
    const sel = this.o.sel;
    if (!sel) return;
    this.host.change(removeBridge(this.host.draft(), sel.key));
    this.setO({ sel: null });
  }
  deselect() {
    this.drag = null;
    if (this.o.sel) this.setO({ sel: null });
  }
  cancel() {
    this.start = null;
    if (this.o.drawing) this.setO({ drawing: null });
  }

  /** A press: an end of the bridge picked (or the one under it) grabbed to drag along its way — true if so. Select's
   *  (`select`): a bridge under it picked too, its deck pressed. */
  down(at: Ground, select = false): boolean {
    if (!at) return false;
    const tool = !select && hud.get().god.tool === "bridges";
    if (tool && this.o.mode !== "edit") return false;
    const under = bridgeAt(at.x, at.z);
    const sel = this.o.sel ? bridgeOf(this.o.sel.key) : null;
    for (const b of [sel, under]) {
      if (!b) continue;
      const d = bridgeDefOf(b);
      const reach = Math.max(2.5, this.host.up() * 0.025);
      for (const end of [0, 1] as const) {
        const [x, z] = pointAlong(b.w, end ? d.s1 : d.s0);
        if (Math.hypot(at.x - x, at.z - z) < reach) {
          this.pick(b, b.made);
          this.drag = { key: b.key, end, s0: d.s0, s1: d.s1, moved: false };
          return true;
        }
      }
    }
    if (select && under) {
      this.pick(under, under.made);
      return true;
    }
    return false;
  }
  move(at: Ground) {
    const dr = this.drag;
    if (!dr || !at) return;
    const b = bridgeOf(dr.key);
    if (!b) return;
    const m = alongAt(b.w, at.x, at.z);
    const [a0, a1] = dr.end ? [dr.s0, m] : [m, dr.s1];
    const fit = fitSpan(b.w, a0, a1, dr.key);
    if (!fit) return;
    dr.s0 = fit[0];
    dr.s1 = fit[1];
    dr.moved = true;
  }
  /** Let go (a drag's end: its stretch a step), or a click: Add's start or end, Edit's pick, Remove's. */
  up(at: Ground, click: boolean) {
    const dr = this.drag;
    if (dr) {
      this.drag = null;
      if (dr.moved) {
        this.host.change(changeBridge(this.host.draft(), dr.key, { s0: dr.s0, s1: dr.s1 }));
        const sel = this.o.sel;
        if (sel) this.setO({ sel: { ...sel, m: Math.round(dr.s1 - dr.s0) } });
      }
      return;
    }
    if (!click || !at) return;
    const mode = this.o.mode;
    const under = bridgeAt(at.x, at.z);
    if (mode === "remove") {
      if (!under) return;
      this.host.change(removeBridge(this.host.draft(), under.key));
      if (this.o.sel?.key === under.key) this.setO({ sel: null });
      return;
    }
    if (mode === "edit") {
      if (under) this.pick(under, under.made);
      else this.deselect();
      return;
    }
    // Add: the first click on a way (on a bridge: that one picked), the second where it ends
    const s = this.start;
    if (!s) {
      if (under) return this.pick(under, under.made);
      const hit = bridgeWayAt(at.x, at.z);
      if (!hit) return void toast(tr("godBridgeOnWay"), "warn");
      this.start = { way: hit.w.key, m: hit.m };
      this.setO({ sel: null, drawing: { name: hit.w.name, m: 0, blocked: null } });
      return;
    }
    const w = bridgeWay(s.way);
    if (!w) return this.cancel();
    const fit = fitSpan(w, s.m, alongAt(w, at.x, at.z));
    if (!fit) return void toast(tr("godBridgeNoRoom").replace("{n}", String(BRIDGE_LIMITS.min)), "warn");
    const e = this.host.draft();
    const style = this.o.style ?? newBridgeStyle(w);
    const d: BridgeDef = { key: newBridgeKey(e), way: w.key, s0: fit[0], s1: fit[1], style };
    this.host.change(addBridge(e, d));
    this.start = null;
    this.setO({ drawing: null });
    this.pick(d, false);
  }

  /** Each frame: the stretch being laid (Add's, from its first click to the pointer), an end dragged, the bridge under
   *  the pointer (or the one picked). `only`: Select's — nothing laid. */
  frame(at: Ground, f: Frame, only = false) {
    this.ghost ??= new BridgeGhost(this.scene);
    const g = this.ghost;
    const dr = this.drag;
    if (dr) {
      const b = bridgeOf(dr.key);
      return g.show(b?.w ?? null, dr.s0, dr.s1, PICKED, 1.1, f);
    }
    const s = this.start;
    if (s && !only) {
      const w = bridgeWay(s.way);
      if (!w || !at) return g.show(null, 0, 0, AMBER, 0, f);
      const m = alongAt(w, at.x, at.z);
      const fit = fitSpan(w, s.m, m);
      const len = Math.round(Math.abs(m - s.m));
      if (len !== this.pointerM || !!fit !== !this.o.drawing?.blocked) {
        this.pointerM = len;
        this.setO({
          drawing: {
            name: w.name,
            m: fit ? Math.round(fit[1] - fit[0]) : len,
            blocked: fit ? null : tr("godBridgeNoRoom").replace("{n}", String(BRIDGE_LIMITS.min)),
          },
        });
      }
      return g.show(w, fit ? fit[0] : s.m, fit ? fit[1] : m, fit ? AMBER : RED, 1, f);
    }
    const under = at ? bridgeAt(at.x, at.z) : null;
    const shown = under ?? (this.o.sel ? bridgeOf(this.o.sel.key) : null);
    if (shown) {
      const d = bridgeDefOf(shown);
      const picked = shown.key === this.o.sel?.key;
      const tone =
        this.o.mode === "remove" && !only && hud.get().god.tool === "bridges" ? RED : picked ? PICKED : AMBER;
      return g.show(shown.w, d.s0, d.s1, tone, picked ? 1.1 : 0, f);
    }
    g.show(null, 0, 0, AMBER, 0, f);
  }
  hide() {
    this.ghost?.show(null, 0, 0, AMBER, 0, { y: 0 });
  }
  dispose() {
    this.ghost?.dispose();
    this.ghost = null;
  }
}
