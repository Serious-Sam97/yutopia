// The animals' minds shown (docs/plan/128-animal-minds.md, F10a): `?animals=debug` in the address (an admin's), a
// label over each round me — what it's doing and why, its needs, how sure it is of me — and a line to where it's
// going, from the server's `animal:debug` twice a second. Dev only: nothing's made unless it's asked for.
import type { ServerMessages } from "@yutopia/shared";
import { heightAt } from "@yutopia/shared/grounds";
import { BufferGeometry, Float32BufferAttribute, LineBasicMaterial, LineSegments, type PerspectiveCamera, type Scene, Vector3 } from "three";

type Row = ServerMessages["animal:debug"]["list"][number];

export class AnimalDebug {
  private rows: Row[] = [];
  private layer: HTMLDivElement;
  private labels = new Map<string, HTMLDivElement>();
  private lines: LineSegments;
  private v = new Vector3();
  private cap = 0;

  constructor(scene: Scene) {
    this.layer = document.createElement("div");
    this.layer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:40;font:11px/1.25 ui-monospace,monospace";
    document.body.appendChild(this.layer);
    this.lines = new LineSegments(new BufferGeometry(), new LineBasicMaterial({ color: 0xffd84a, depthTest: false, transparent: true, opacity: 0.8 }));
    this.lines.renderOrder = 9;
    this.lines.frustumCulled = false;
    scene.add(this.lines);
  }

  told(m: ServerMessages["animal:debug"]) {
    this.rows = m.list;
  }

  /** Each frame: the labels where they are on the screen, the lines to where they're going. */
  frame(camera: PerspectiveCamera, at: (id: string) => { x: number; y: number; h: number } | null) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const seen = new Set<string>();
    const pts: number[] = [];
    for (const r of this.rows) {
      const p = at(r.id);
      if (!p) continue;
      const y = heightAt(p.x, p.y) + p.h;
      this.v.set(p.x, y + 1.6, p.y).project(camera);
      if (this.v.z > 1 || Math.abs(this.v.x) > 1.1 || Math.abs(this.v.y) > 1.1) continue;
      seen.add(r.id);
      let el = this.labels.get(r.id);
      if (!el) {
        el = document.createElement("div");
        el.style.cssText = "position:absolute;transform:translate(-50%,-100%);background:rgba(10,12,16,.72);color:#f2efe6;padding:2px 5px;border-radius:3px;white-space:pre";
        this.layer.appendChild(el);
        this.labels.set(r.id, el);
      }
      el.style.left = `${((this.v.x + 1) / 2) * w}px`;
      el.style.top = `${((1 - this.v.y) / 2) * h}px`;
      const text = `${r.id.replace(/^l-?\d+_-?\d+_/, "")}  ${r.d}${r.why ? ` · ${r.why}` : ""}${r.path ? ` · path ${r.path}` : ""}\nfood ${r.hunger} water ${r.thirst} tired ${r.tired} fear ${r.fear} sees ${r.aware}`;
      if (el.textContent !== text) el.textContent = text;
      if (r.to) pts.push(p.x, y + 0.3, p.y, r.to[0], heightAt(r.to[0], r.to[1]) + 0.3, r.to[1]);
    }
    for (const [id, el] of this.labels)
      if (!seen.has(id)) {
        el.remove();
        this.labels.delete(id);
      }
    // (one buffer, grown when it must, the rest drawn up to what's used)
    if (pts.length > this.cap) {
      this.cap = Math.max(pts.length, this.cap * 2, 96);
      this.lines.geometry.dispose();
      const g = new BufferGeometry();
      g.setAttribute("position", new Float32BufferAttribute(new Float32Array(this.cap), 3));
      this.lines.geometry = g;
    }
    // (nothing drawn yet: no buffer to fill)
    if (!this.cap) return;
    const attr = this.lines.geometry.getAttribute("position") as Float32BufferAttribute;
    (attr.array as Float32Array).set(pts);
    attr.needsUpdate = true;
    this.lines.geometry.setDrawRange(0, pts.length / 3);
  }

  dispose() {
    this.layer.remove();
    this.labels.clear();
    this.lines.removeFromParent();
    this.lines.geometry.dispose();
    (this.lines.material as LineBasicMaterial).dispose();
  }
}

/** Is the overlay asked for (the address's `?animals=debug`)? */
export const debugAsked = () => typeof location !== "undefined" && new URLSearchParams(location.search).get("animals") === "debug";
