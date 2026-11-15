import { isFloor, STAIRS_D, STOREY } from "@yutopia/shared";
import { cellOf } from "@yutopia/shared/structure";
import { Box3, Frustum, Matrix4, type Mesh, type Object3D, type Vector3 } from "three";
import { BelowCull, boxInParent, HIDDEN_LAYER } from "../below-cull";
import type { World3 } from "../build";
import { type Gather, lazyMatrices, seal } from "../lazy-matrices";
import { mergeStill, shadowProxy } from "../merge-static";
import { splitTwoPass } from "../two-pass";
import type { ThirdPersonView } from "../view";

/** What Culling reads of the ThirdPersonView (plan 72 phase 4: its dependencies, said). */
export type CullingHost = Pick<
  ThirdPersonView,
  "around" | "camera" | "floors" | "games3" | "level" | "lifts3" | "quality" | "scene" | "stairs3" | "world"
>;

export class Culling {
  constructor(private readonly c: CullingHost) {}

  // ── what my floor hides (below-cull.ts) ─────────────────────────────────────
  below3 = new BelowCull();

  cullUnits: { obj: Object3D; box: Box3 }[] = [];

  belowBoxes = new WeakMap<Object3D, { at: Vector3; box: Box3 }>();

  /** (tests: nothing left out — the same picture, the long way) */
  noCull = false;

  looseFrustum = new Frustum();

  viewHid: Object3D[] = []; // (parked cars out of the current render's view)

  looseM = new Matrix4();

  /** (tests: every floor drawn the old way, piece by piece — the same picture: World3) */
  setUnmerged(on: boolean) {
    this.viewCull = !on;
    for (const b of this.c.floors.values()) b.world.setUnmerged(on);
    this.c.games3?.setUnmerged(on);
  }

  viewCull = true;

  // ── what's built outside, out of a camera's sight (docs/plan/89-the-weight.md phase 4) ──
  /** (tests: e2e/weight.mts' A/B — off, nothing outside left out: the same picture, the long way) */
  outCull = true;

  /** The Grounds' still pieces — the statics, the kart park, the districts — off for one render when wholly
   *  outside its camera (view.ts' scene.onBeforeRender; the shadow pass has them on again, as the parked cars).
   *  Three tests each mesh against the view as it walks them; a piece left out isn't walked at all — the kart
   *  park's 2,000 meshes, out of sight from almost everywhere. A piece is what three's own culling would trust
   *  (stillBox: no particles, sprites, instances, skinned or unculled meshes — its box made again when it moves);
   *  one that isn't is looked into, a level at a time. What's wholly outside the camera draws nothing: the same
   *  picture. */
  cullOutdoors(f: Frustum) {
    if (!this.outCull) return;
    const g = this.c.around.grounds;
    if (!g) return;
    for (const r of g.stillRoots()) if (r.visible && r.parent) this.cullIn(r, f, 3);
  }

  private cullIn(o: Object3D, f: Frustum, depth: number) {
    for (const c of o.children) {
      if (!c.visible) continue;
      const b = this.stillBox(c);
      if (b) {
        if (!f.intersectsBox(b)) {
          c.visible = false;
          this.viewHid.push(c);
        }
      } else if (depth > 0 && c.children.length) this.cullIn(c, f, depth - 1);
    }
  }

  /** Glass and ink merged too (World3.setMergeClear: a few overlapping see-through pixels
   *  blend in another order). */
  setMergeClear(on: boolean) {
    for (const b of this.c.floors.values()) b.world.setMergeClear(on);
  }

  // (made at its first use: the view makes its parts before its scene — plan 72 phase 4)
  private gatherMade: Gather | null = null;
  get gather(): Gather {
    this.gatherMade ??= { root: this.c.scene, below: 0, out: [] };
    return this.gatherMade;
  }

  gathered: Gather["out"] | null = null;

  cullBelow(slab: ReturnType<World3["slab"]>) {
    this.below3.setSlab(slab?.slab ?? null, slab?.key ?? null);
    if (!slab) return;
    // (and its walls: solid ones hide what's outside below their top — not while faded)
    const shell = this.c.world.shell();
    const map = this.c.world.map;
    this.below3.setShell(shell, shell.key, (x, y) => !isFloor(cellOf(map, x, y)));
    this.below3.faded = this.c.world.fades.filter((f) => f.alpha < 0.999 && (!f.item || f.wall));
    const units = this.cullUnits;
    let n = 0;
    const unit = () => {
      units[n] ??= { obj: this.c.scene, box: new Box3() };
      return units[n];
    };
    // the floors below mine: each thing built on them (a still mesh, an area, a card…)
    for (const [f, b] of this.c.floors) {
      if (f >= this.c.level || !b.world.root.visible || !b.world.root.parent) continue;
      const at = b.world.root.position;
      for (const c of b.world.root.children) {
        const u = unit();
        // (a still piece's box kept while its floor stays where it is; cards turn: every frame)
        const had = this.belowBoxes.get(c);
        if (had && !c.matrixAutoUpdate && had.at.equals(at)) u.box.copy(had.box);
        else if (c.userData.loose) {
          // (an area's loose pieces: their bounds, kept by the floor while they don't change)
          const lb = b.world.looseBox(c);
          if (!lb) continue;
          u.box.copy(lb).translate(at);
        } else {
          if (!boxInParent(c as Mesh, u.box)) continue;
          u.box.translate(at);
          if (!c.matrixAutoUpdate) this.belowBoxes.set(c, { at: at.clone(), box: u.box.clone() });
        }
        u.obj = c;
        n++;
      }
    }
    // the stairwells and lift stops below: round their footprint, a storey (and a bit) high
    const around = (o: Object3D, r: number, top: number) => {
      if (!o.visible || o.position.y > -0.01) return;
      const u = unit();
      const p = o.position;
      u.box.min.set(p.x - r, p.y - 0.5, p.z - r);
      u.box.max.set(p.x + r, p.y + top, p.z + r);
      u.obj = o;
      n++;
    };
    // things that stand still outside: the parked cars, the campus (boxes made when they move)
    const still = (o: Object3D) => {
      const b = this.stillBox(o);
      if (!b) return;
      const u = unit();
      u.box.copy(b);
      u.obj = o;
      n++;
    };
    for (const top of this.c.scene.children)
      if (top.userData.cullKids) for (const o of top.children) if (o.userData.still && o.visible) still(o);
    // (the campus mesh by mesh: its groups move inside it — with my floor — so a group's box
    // can't be kept by its own place; each mesh's can, by its own world matrix)
    const got = this.gathered;
    if (got)
      // (gathered by the matrices' pass: those low enough to be under my floor)
      for (let i = 0; i < got.length; i += 2) {
        const u = unit();
        u.box.copy(got[i + 1] as Box3);
        u.obj = got[i] as Object3D;
        n++;
      }
    else
      this.c.around.root.traverseVisible((o) => {
        const d = o as Mesh & { isLine?: boolean };
        if (d.isMesh || d.isLine) still(o);
      });
    for (const o of this.c.stairs3.root.children) around(o, STAIRS_D / 2 + 1, STOREY + 1.5);
    for (const o of this.c.lifts3?.root.children ?? []) around(o, 2, STOREY + 0.5);
    units.length = n;
    this.below3.begin(this.c.camera, units);
  }

  /** A model that stands still from now on (a parked car: nothing on it moves): the pieces at
   *  its origin drawn merged, a material each, its shadow in a draw or two (merge-static.ts),
   *  its parts' own matrices made once (the model itself may still be slid by a knock). */
  stillModel(root: Object3D) {
    mergeStill(root);
    shadowProxy(root, HIDDEN_LAYER);
    // (its glass's two passes as two meshes: no shader worked out again every draw — two-pass.ts)
    splitTwoPass(root);
    root.traverse((o) => {
      if (o === root) return;
      o.updateMatrix();
      o.matrixAutoUpdate = false;
    });
    seal(root);
  }

  /** `root`'s world matrices made now (Low and Lowest: only where something moved). */
  matrices(root: Object3D) {
    if (this.c.quality === "low" || this.c.quality === "lowest") lazyMatrices(root);
    else root.updateMatrixWorld();
  }

  // A still thing's world box, made again only when it moves; null if its bounds can't be
  // trusted (anything three itself doesn't cull by its box: particles, sprites, instances,
  // skinned or unculled meshes — their points move without the box knowing).
  stillBoxes = new WeakMap<Object3D, { m: Matrix4; box: Box3 | null }>();

  matricesMade = false; // (this frame's, all of them: frame())

  stillBox(o: Object3D): Box3 | null {
    if (!this.matricesMade) o.updateWorldMatrix(true, false);
    const had = this.stillBoxes.get(o);
    if (had?.m.equals(o.matrixWorld)) return had.box;
    // (one that says how far its shader moves its points from where they are — a crowd's people — boxed with
    // that: its instances' own boxes, `cullPad` round them)
    const pad = o.userData.cullPad as number | undefined;
    if (typeof pad === "number") {
      const box = new Box3().setFromObject(o);
      const out = box.isEmpty() ? null : box.expandByScalar(pad);
      this.stillBoxes.set(o, { m: o.matrixWorld.clone(), box: out });
      return out;
    }
    let ok = true;
    o.traverse((x) => {
      const d = x as Mesh & {
        isPoints?: boolean;
        isSprite?: boolean;
        isInstancedMesh?: boolean;
        isSkinnedMesh?: boolean;
        isLine?: boolean;
      };
      if (d.isPoints || d.isSprite || d.isInstancedMesh || d.isSkinnedMesh) ok = false;
      else if ((d.isMesh || d.isLine) && !d.frustumCulled) ok = false;
    });
    const box = ok ? new Box3().setFromObject(o) : null;
    if (box?.isEmpty()) {
      this.stillBoxes.set(o, { m: o.matrixWorld.clone(), box: null });
      return null;
    }
    this.stillBoxes.set(o, { m: o.matrixWorld.clone(), box });
    return box;
  }
}
