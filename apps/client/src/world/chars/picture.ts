import type { AvatarLayers } from "@yutopia/shared";
import { PerspectiveCamera, Scene, SRGBColorSpace, WebGLRenderer } from "three";
import { INK } from "./ink";
import { CharFactory, lookKey, PersonModel, type Reach } from "./model";
import { VERB_LEN, type Verb } from "./moves";
import type { Euler3, Pose } from "./rig";

// The HUD's pictures of people (docs/plan/22-people-3d.md, P7): the model in a small renderer of
// its own — a live turntable (the look editor, the profile), portraits, the look's option thumbs. (It
// drew the iso view's sprites too; that went with iso — docs/plan/72-the-3d-core.md, phase 12.)

// models kept (the live turntable's and a few more: the portraits and the editor's thumbs are kept by
// the HUD as pictures, each drawn once — 40 kept here were ~3 MB a person seen, plan 72 phase 13's
// memory pass)
const LOOKS = 6;
const SIZE = 256; // the renderer's own canvas between pictures

/** A pose for the HUD's pictures (a Motion3's output). */
export interface PictureMotion {
  pose: Pose;
  lift: Euler3;
  blink: number;
  talk: number;
  reach?: Reach;
}

/** A verb as far as it's got (`at`: since when — someone else's — else its own `t`), or null
 *  (not a verb, or over). */
export function verbAt(
  v: { kind: string; t: number; at?: number } | undefined,
  now: number,
): { kind: Verb; t: number } | null {
  const len = v ? VERB_LEN[v.kind as Verb] : undefined;
  if (!v || !len) return null;
  const t = v.at !== undefined ? (now - v.at) / (len * 1000) : v.t;
  return t >= 0 && t <= 1 ? { kind: v.kind as Verb, t } : null;
}

interface Look {
  model: PersonModel;
}

class Pictures {
  private renderer: WebGLRenderer | null = null;
  private failed = false;
  private scene = new Scene();
  private persp = new PerspectiveCamera(28, 1, 0.05, 20);
  private factory = new CharFactory(20_000, 2);
  private looks = new Map<string, Look>();
  private mounted: Look | null = null;

  /** WebGL drawn on the CPU (no GPU, or a blocked one): a picture costs 0.1–1 s there, so the HUD
   *  keeps its drawn faces (`canDraw`) */
  software = false;

  /** People can be drawn from the model here (a GPU to draw them); otherwise the HUD keeps its own. */
  canDraw(): boolean {
    return !!this.gl() && !this.software;
  }

  private gl(): WebGLRenderer | null {
    if (this.renderer || this.failed) return this.renderer;
    try {
      const r = new WebGLRenderer({ alpha: true, antialias: true, premultipliedAlpha: true });
      r.setSize(SIZE, SIZE, false);
      r.setClearColor(0x000000, 0);
      r.outputColorSpace = SRGBColorSpace;
      this.renderer = r;
      const g = r.getContext();
      const info = g.getExtension("WEBGL_debug_renderer_info");
      const name = String(info ? g.getParameter(info.UNMASKED_RENDERER_WEBGL) : "");
      this.software = /swiftshader|llvmpipe|software|basic render/i.test(name);
    } catch {
      this.failed = true; // (no WebGL: the HUD's own faces stay)
    }
    return this.renderer;
  }

  private look(avatar: AvatarLayers, lk: string, lod: 0 | 1 = 1): Look {
    const k = lod === 1 ? lk : `${lk}|L${lod}`;
    let l = this.looks.get(k);
    if (l) {
      // (the last used last: the one let go is the longest unused — a turntable drawn every frame
      // outlives a run of the look's option thumbs)
      this.looks.delete(k);
      this.looks.set(k, l);
    } else {
      l = { model: new PersonModel(this.factory, avatar, lod) };
      this.looks.set(k, l);
      if (this.looks.size > LOOKS) {
        const [oldKey, old] = this.looks.entries().next().value as [string, Look];
        this.looks.delete(oldKey);
        if (this.mounted === old) this.mounted = null;
        old.model.dispose();
      }
    }
    return l;
  }

  private mount(l: Look) {
    if (this.mounted === l) return;
    if (this.mounted) this.scene.remove(this.mounted.model.root);
    this.scene.add(l.model.root);
    this.mounted = l;
  }

  // A picture of someone for the HUD: the model at `lod`, built now if it must be,
  // posed (rest when no pose), with the line sized for `px` (the canvas's px).
  private picture(avatar: AvatarLayers, lod: 0 | 1, yaw: number, px: number, mo?: PictureMotion | null): Look | null {
    const gl = this.gl();
    if (!gl) return null;
    const l = this.look(avatar, lookKey(avatar), lod);
    for (let i = 0; i < 4 && !l.model.update(2); i++) this.factory.pump(100);
    if (!l.model.ready) return null;
    this.mount(l);
    l.model.root.rotation.y = yaw;
    l.model.setPose(mo?.pose ?? {}, mo?.lift ?? [0, 0, 0], mo?.reach);
    l.model.setFace(mo?.blink ?? 0, mo?.talk ?? 0);
    INK.res.value.set(px, px);
    INK.px.value = Math.max(1.4, px / 150);
    return l;
  }

  private shoot(gl: WebGLRenderer, size: number) {
    gl.setSize(size, size, false);
    this.persp.aspect = 1;
    this.persp.updateProjectionMatrix();
    gl.render(this.scene, this.persp);
  }

  /** Someone on a stand into a (square-ish) canvas, turned `yaw`, posed by `mo` (a Motion3's output).
   *  (The middle level of detail: plenty at a HUD picture's size.) */
  turntable(target: HTMLCanvasElement, avatar: AvatarLayers, yaw: number, mo?: PictureMotion | null): boolean {
    const size = Math.min(target.width, target.height);
    const res = INK.res.value.clone();
    const px = INK.px.value;
    const l = this.picture(avatar, 1, yaw, size, mo);
    const gl = this.renderer;
    if (l && gl) {
      const h = l.model.height;
      // (room over the head for hair and hats)
      this.persp.position.set(0, h * 0.58, h * 2.6);
      this.persp.lookAt(0, h * 0.53, 0);
      this.shoot(gl, size);
      const g = target.getContext("2d") as CanvasRenderingContext2D;
      g.clearRect(0, 0, target.width, target.height);
      g.drawImage(gl.domElement, 0, 0, size, size, (target.width - size) / 2, (target.height - size) / 2, size, size);
      gl.setSize(SIZE, SIZE, false);
    }
    INK.res.value.copy(res);
    INK.px.value = px;
    return !!(l && gl);
  }

  /** Head and shoulders, facing you a little turned, as a data URL (null without WebGL). */
  portrait(avatar: AvatarLayers, px = 128): string | null {
    return this.still(avatar, 0.32, px, (l) => {
      const head = l.model.jointPosition("head");
      const hh = l.model.height / 5;
      this.persp.position.set(0, head.y + hh * 0.62, hh * 3.9);
      this.persp.lookAt(0, head.y + hh * 0.4, 0);
    });
  }

  /** One option of the look, framed on the part it's about (the avatar editor's buttons, docs/plan/60):
   *  the head, the chest, the legs or the feet, three-quarter on, as a data URL (null without WebGL). */
  thumb(avatar: AvatarLayers, focus: "head" | "chest" | "legs" | "feet", px = 96): string | null {
    return this.still(avatar, 0.5, px, (l) => {
      const h = l.model.height;
      // (the point to look at, up the figure, and how far back to frame it)
      const [y, d] = { head: [0.88, 0.62], chest: [0.66, 0.85], legs: [0.3, 1.05], feet: [0.05, 0.6] }[focus];
      this.persp.position.set(0, h * (y + 0.04), h * d);
      this.persp.lookAt(0, h * y, 0);
    });
  }

  // a picture as a data URL: posed at rest turned `yaw`, the camera framed by `frame`
  private still(avatar: AvatarLayers, yaw: number, px: number, frame: (l: Look) => void): string | null {
    const res = INK.res.value.clone();
    const ipx = INK.px.value;
    const l = this.picture(avatar, 1, yaw, px, null);
    const gl = this.renderer;
    let url: string | null = null;
    if (l && gl) {
      frame(l);
      this.shoot(gl, px);
      const c = document.createElement("canvas");
      c.width = px;
      c.height = px;
      (c.getContext("2d") as CanvasRenderingContext2D).drawImage(gl.domElement, 0, 0, px, px, 0, 0, px, px);
      gl.setSize(SIZE, SIZE, false);
      url = c.toDataURL();
    }
    INK.res.value.copy(res);
    INK.px.value = ipx;
    return url;
  }

  dispose() {
    for (const l of this.looks.values()) l.model.dispose();
    this.looks.clear();
    this.factory.dispose();
    this.renderer?.dispose();
    this.renderer = null;
  }
}

let shared: Pictures | null = null;
/** The HUD's one renderer for pictures of people (made on first use). */
export function pictures(): Pictures {
  shared ??= new Pictures();
  return shared;
}
