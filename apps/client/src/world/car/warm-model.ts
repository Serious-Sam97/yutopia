// A driven car's model made ready before it's drawn: its shaders compiled in the background, a few things a frame, as
// the frame will draw them (view.compileAhead), then each drawn once off screen (view.drawAhead) — a few a frame too.
// All at once was the blink as you got in: 53 programs handed to the compiler in one go and the next frame waiting on
// them (getShaderInfoLog, ~200 ms on an M1), their first draws ~40 ms more; a car's model first drawn on the spot, a
// frame with no car (the parked one gone, the driven one not in yet).
import type { Material, Mesh, Object3D } from "three";
import type { Sedan } from "../tp/car/model";
import type { ThirdPersonView } from "../tp/view";

/** how many of a model's things (one of each material) handed to the compiler a frame */
export const WARM_PER_FRAME = 3;
/** how many first drawn a frame (each ~0.7 ms on Metal, and the scene round it walked once) */
export const DRAW_PER_FRAME = 8;

type Drawn = Mesh & { isInstancedMesh?: boolean; isSkinnedMesh?: boolean; isPoints?: boolean };

export class WarmModel {
  private queue: Object3D[] | null = null;
  private toDraw: Object3D[] = [];
  private all: Object3D[] = [];
  private jobs: Promise<unknown>[] = [];
  private stage: "compile" | "wait" | "draw" | "done" = "compile";
  constructor(
    private readonly m: Sedan,
    /** where it's hung to be drawn, if it hangs nowhere yet (the cars' root) */
    private readonly parent: Object3D,
  ) {}

  get done() {
    return this.stage === "done";
  }

  /** A frame's share. */
  step(tp: ThirdPersonView) {
    if (!this.m.ready) return;
    if (this.stage === "compile") this.compile(tp);
    else if (this.stage === "draw") this.draw(tp);
  }

  private compile(tp: ThirdPersonView) {
    if (!this.queue) {
      // (one of each: a material, and how it's drawn — a second mesh with it costs a lookup)
      const seen = new Set<string>();
      const q: Object3D[] = [];
      this.m.root.traverse((o) => {
        const mat = (o as Mesh).material as Material | Material[] | undefined;
        if (!mat) return;
        this.all.push(o);
        const x = o as Drawn;
        const k = `${x.isInstancedMesh ? 1 : 0}${x.isSkinnedMesh ? 1 : 0}${x.isPoints ? 1 : 0}|${(Array.isArray(mat) ? mat : [mat]).map((y) => y.uuid).join(",")}`;
        if (seen.has(k)) return;
        seen.add(k);
        q.push(o);
      });
      this.queue = q;
      this.toDraw = q.slice();
    }
    for (let i = 0; i < WARM_PER_FRAME && this.queue.length; i++) {
      const o = this.queue.shift() as Object3D;
      // (its own things only: three's compile walks what it's given, and what's under it; one hidden till it's
      // needed — a wiper's blade, a part knocked off — made too)
      const kids = o.children;
      const vis = o.visible;
      o.children = [];
      o.visible = true;
      try {
        this.jobs.push(tp.compileAhead(o).catch(() => undefined));
      } finally {
        o.children = kids;
        o.visible = vis;
      }
    }
    if (this.queue.length) return;
    this.stage = "wait";
    void Promise.all(this.jobs).then(() => {
      this.jobs = [];
      if (this.stage === "wait") this.stage = "draw";
    });
  }

  private draw(tp: ThirdPersonView) {
    const chunk = this.toDraw.slice(0, DRAW_PER_FRAME);
    if (!chunk.length) {
      this.stage = "done";
      return;
    }
    // (only this frame's few shown for it: the rest drawn on their own frames)
    const on = new Set(chunk);
    const was = this.all.map((o) => o.visible);
    const hid: Object3D[] = [];
    for (const o of this.all) o.visible = on.has(o);
    // (and what each hangs under shown with it: a hidden group's meshes aren't drawn)
    for (const o of chunk) for (let p = o.parent; p && p !== this.m.root; p = p.parent) if (!p.visible) hid.push(p);
    for (const p of hid) p.visible = true;
    this.m.shell?.(true);
    let drew = false;
    try {
      drew = tp.drawAhead(this.m.root, this.parent);
    } finally {
      this.m.shell?.(false);
      for (const p of hid) p.visible = false;
      this.all.forEach((o, i) => {
        o.visible = was[i];
      });
    }
    if (drew) this.toDraw.splice(0, chunk.length);
  }
}
