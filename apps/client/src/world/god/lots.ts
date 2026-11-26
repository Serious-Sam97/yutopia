import { BASE_HOME_LOTS, type HomeLotDef, inLot, LOT_MAX, LOT_MIN, lotFault, SIGN_REACH } from "@yutopia/shared";
import { BUILDINGS, HOME_LOTS, lotGroundWhy, terrainAt } from "@yutopia/shared/grounds";
import type { GroundsEdits } from "@yutopia/shared/grounds-edits";
import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineLoop,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  type Scene,
} from "three";
import { type GodHud, hud, toast } from "../store";

// God mode's home lots tool (docs/plan/130-the-house-build.md, phase 1 — F1a): the panel's lot size under the pointer
// as a rectangle on the land — green where it can go, red with why (too small or big, on another lot or a building);
// a click lays it; a lot under the pointer dragged moves it (a claimed one stays: the publish refuses it); a click on
// one picks it, Delete takes it away. Its name and neighbourhood are the panel's.

type Ground = { x: number; z: number; h: number } | null;
export interface LotsHost {
  draft(): GroundsEdits;
  change(next: GroundsEdits): void;
  /** Who owns the lot now (live — claims are the structure's), or null: it's free. */
  ownerOf(key: string): string | null;
}
const OK = 0x52d24a;
const BAD = 0xe0442c;
const PICK = 0x3aa8ff;

const snap = (v: number) => Math.round(v);
const snapHalf = (v: number) => Math.round(v * 2) / 2;

export class LotsTool {
  private readonly root = new Group();
  private readonly fill: Mesh;
  private readonly edge: LineLoop;
  private readonly picked: LineLoop;
  private drag: { key: string; dx: number; dz: number; d: HomeLotDef; at: HomeLotDef } | null = null;

  constructor(
    private readonly host: LotsHost,
    scene: Scene,
  ) {
    this.fill = new Mesh(
      new PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({ color: OK, transparent: true, opacity: 0.25, depthWrite: false, side: DoubleSide }),
    );
    this.fill.renderOrder = 20;
    this.edge = new LineLoop(new BufferGeometry(), new LineBasicMaterial({ color: OK, depthTest: false }));
    this.picked = new LineLoop(new BufferGeometry(), new LineBasicMaterial({ color: PICK, depthTest: false }));
    this.edge.renderOrder = this.picked.renderOrder = 21;
    this.root.add(this.fill, this.edge, this.picked);
    this.root.visible = false;
    scene.add(this.root);
  }

  private get o() {
    return hud.get().god.lots;
  }
  private setO(p: Partial<GodHud["lots"]>) {
    hud.set((s) => ({ god: { ...s.god, lots: { ...s.god.lots, ...p } } }));
  }
  /** The draft's lot under (x, z), or null. */
  private lotAt(x: number, z: number): HomeLotDef | null {
    return HOME_LOTS.find((l) => x >= l.x0 && x <= l.x1 && z >= l.z0 && z <= l.z1) ?? null;
  }
  /** Why a lot can't go where it is (null: it can). */
  private why(d: HomeLotDef): string | null {
    const f = lotFault(d, [
      ...HOME_LOTS,
      ...BUILDINGS.map((b) => ({ key: `b:${b.key}`, x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1 })),
    ]);
    if (f) return f;
    // (what Publish checks too: ground that stays as it is — the campus, an anchored building —, the edge, a way)
    const g = lotGroundWhy(d);
    return g ? `${g[0].toUpperCase()}${g.slice(1)}.` : null;
  }
  private rect(line: LineLoop, d: HomeLotDef, lift = 0.15) {
    const pts: number[] = [];
    for (const [x, z] of [
      [d.x0, d.z0],
      [d.x1, d.z0],
      [d.x1, d.z1],
      [d.x0, d.z1],
    ])
      pts.push(x, terrainAt(x, z) + lift, z);
    line.geometry.setAttribute("position", new Float32BufferAttribute(pts, 3));
    line.geometry.computeBoundingSphere();
    line.visible = true;
  }
  private ghost(d: HomeLotDef, bad: boolean) {
    const col = bad ? BAD : OK;
    (this.fill.material as MeshBasicMaterial).color.setHex(col);
    (this.edge.material as LineBasicMaterial).color.setHex(col);
    this.fill.scale.set(d.x1 - d.x0, 1, d.z1 - d.z0);
    this.fill.position.set(
      (d.x0 + d.x1) / 2,
      terrainAt((d.x0 + d.x1) / 2, (d.z0 + d.z1) / 2) + 0.12,
      (d.z0 + d.z1) / 2,
    );
    this.fill.visible = true;
    this.rect(this.edge, d);
  }
  /** A new lot's rectangle round (x, z), its corners on whole metres. */
  private placed(x: number, z: number, key = ""): HomeLotDef {
    const { w, d } = this.o;
    const x0 = snap(x - w / 2);
    const z0 = snap(z - d / 2);
    return {
      key,
      name: this.o.name.trim() || this.nextName(),
      area: this.o.area.trim() || undefined,
      x0,
      z0,
      x1: x0 + w,
      z1: z0 + d,
    };
  }
  private nextName(): string {
    for (let n = HOME_LOTS.length + 1; ; n++) if (!HOME_LOTS.some((l) => l.name === `Lot ${n}`)) return `Lot ${n}`;
  }

  frame(under: Ground, f?: { y: number }) {
    this.root.visible = true;
    // (on the land as it's drawn: shifted down by the floor I'm on — the pointer's `under` is the land's own)
    this.root.position.y = f?.y ?? 0;
    const sel = this.o.sel ? HOME_LOTS.find((l) => l.key === this.o.sel) : null;
    if (sel) this.rect(this.picked, sel, 0.2);
    else this.picked.visible = false;
    if (this.drag) {
      this.ghost(this.drag.at, !!this.why(this.drag.at));
      return;
    }
    // (placing the picked lot's sign: a small square where it'd stand — green on the lot or within reach of it)
    if (sel && this.o.signing) {
      this.edge.visible = false;
      if (!under) {
        this.fill.visible = false;
        return;
      }
      const ok = inLot(sel, under.x, under.z, SIGN_REACH);
      (this.fill.material as MeshBasicMaterial).color.setHex(ok ? OK : BAD);
      this.fill.scale.set(0.8, 1, 0.8);
      this.fill.position.set(snapHalf(under.x), terrainAt(under.x, under.z) + 0.12, snapHalf(under.z));
      this.fill.visible = true;
      return;
    }
    if (!under || this.lotAt(under.x, under.z)) {
      this.fill.visible = this.edge.visible = false;
      this.setO({ why: null });
      return;
    }
    const d = this.placed(under.x, under.z, "god-lot-ghost");
    const why = this.why(d);
    this.ghost(d, !!why);
    if (why !== this.o.why) this.setO({ why });
  }

  /** The left button down: a lot under it picked up to drag (true), else a click's (false). */
  down(at: Ground): boolean {
    if (!at) return false;
    const l = this.lotAt(at.x, at.z);
    if (!l) return false;
    this.drag = { key: l.key, dx: at.x - l.x0, dz: at.z - l.z0, d: l, at: l };
    this.setO({ sel: l.key, name: l.name, area: l.area ?? "", w: l.x1 - l.x0, d: l.z1 - l.z0 });
    return true;
  }
  move(at: Ground) {
    if (!this.drag || !at) return;
    const { d, dx, dz } = this.drag;
    const x0 = snap(at.x - dx);
    const z0 = snap(at.z - dz);
    this.drag.at = { ...d, x0, z0, x1: x0 + (d.x1 - d.x0), z1: z0 + (d.z1 - d.z0) };
  }
  /** The button up: a dragged lot laid where it is; a click on the land a new lot laid there. */
  up(at: Ground, click: boolean) {
    const drag = this.drag;
    this.drag = null;
    if (drag) {
      const a = drag.at;
      if (a.x0 === drag.d.x0 && a.z0 === drag.d.z0) return;
      const why = this.why(a);
      if (why) return toast(why, "warn");
      // (a sign it has goes with it)
      const sign = drag.d.sign;
      this.set(drag.key, {
        x0: a.x0,
        z0: a.z0,
        x1: a.x1,
        z1: a.z1,
        ...(sign ? { sign: [sign[0] + a.x0 - drag.d.x0, sign[1] + a.z0 - drag.d.z0] as [number, number] } : {}),
      });
      return;
    }
    if (!click || !at) return;
    // (the picked lot's sign put where it's clicked)
    if (this.o.sel && this.o.signing) {
      const l = HOME_LOTS.find((q) => q.key === this.o.sel);
      if (!l) return this.setO({ signing: false });
      if (!inLot(l, at.x, at.z, SIGN_REACH))
        return toast(`Its sign stands on the lot or within ${SIGN_REACH} m of it.`, "warn");
      this.set(l.key, { sign: [snapHalf(at.x), snapHalf(at.z)] });
      return this.setO({ signing: false });
    }
    // (unpicked: its name and area out of the panel, or the next lot laid takes them — two "Lot 6")
    if (this.o.sel) return this.setO({ sel: null, name: "", area: "" });
    const d0 = this.host.draft();
    const n = (d0.homeLots?.add ?? []).length;
    let key = `god-lot-${n + 1}`;
    for (
      let i = n + 1;
      HOME_LOTS.some((l) => l.key === key) || (d0.homeLots?.add ?? []).some((l) => l.key === key);
      i++
    )
      key = `god-lot-${i}`;
    const d = this.placed(at.x, at.z, key);
    const why = this.why(d);
    if (why) return toast(why, "warn");
    this.host.change({ ...d0, homeLots: { ...d0.homeLots, add: [...(d0.homeLots?.add ?? []), d] } });
    this.setO({ sel: key, name: d.name, area: d.area ?? "" });
  }
  /** The picked lot changed (moved, sized, renamed) in the draft. */
  set(key: string, c: Partial<Omit<HomeLotDef, "key">>) {
    const d0 = this.host.draft();
    const s = d0.homeLots ?? {};
    const own = (s.add ?? []).find((l) => l.key === key);
    if (own) {
      this.host.change({
        ...d0,
        homeLots: { ...s, add: (s.add ?? []).map((l) => (l.key === key ? { ...l, ...c } : l)) },
      });
      return;
    }
    if (!BASE_HOME_LOTS.some((l) => l.key === key)) return;
    this.host.change({ ...d0, homeLots: { ...s, change: { ...s.change, [key]: { ...s.change?.[key], ...c } } } });
  }
  /** The picked lot's size from the panel (its near corner kept). */
  resizePicked() {
    const key = this.o.sel;
    const l = key ? HOME_LOTS.find((q) => q.key === key) : null;
    if (!l) return;
    const w = Math.max(LOT_MIN, Math.min(LOT_MAX, Math.round(this.o.w)));
    const d = Math.max(LOT_MIN, Math.min(LOT_MAX, Math.round(this.o.d)));
    const next = { ...l, x1: l.x0 + w, z1: l.z0 + d };
    const why = this.why(next);
    if (why) return toast(why, "warn");
    this.set(l.key, { x1: next.x1, z1: next.z1 });
  }
  removePicked() {
    const key = this.o.sel;
    if (!key) return;
    // (someone's: freed first — the panel's Free it —, not refused only at Publish)
    const who = this.host.ownerOf(key);
    if (who) return toast(`${HOME_LOTS.find((l) => l.key === key)?.name ?? "It"} is ${who}'s: free it first.`, "warn");
    const d0 = this.host.draft();
    const s = d0.homeLots ?? {};
    const own = (s.add ?? []).some((l) => l.key === key);
    this.host.change({
      ...d0,
      homeLots: own
        ? { ...s, add: (s.add ?? []).filter((l) => l.key !== key) }
        : { ...s, remove: [...(s.remove ?? []).filter((k) => k !== key), key] },
    });
    this.setO({ sel: null, name: "", area: "" });
  }
  hide() {
    this.root.visible = false;
    this.drag = null;
  }
  dispose() {
    this.root.removeFromParent();
    for (const m of [this.fill, this.edge, this.picked]) {
      m.geometry.dispose();
      (m.material as MeshBasicMaterial).dispose();
    }
  }
}
