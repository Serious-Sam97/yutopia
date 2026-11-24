import { type AvatarLayers, hqFloorsOf } from "@yutopia/shared";
import {
  Box3,
  type BufferGeometry,
  type Camera,
  CanvasTexture,
  Color,
  type InstancedMesh,
  LinearSRGBColorSpace,
  LineSegments,
  type Material,
  Mesh,
  type Object3D,
  type PointLight,
  Scene,
  type SpotLight,
  Sprite,
  SpriteMaterial,
  Vector4,
  WebGLRenderTarget,
} from "three";
import { type Graphics, graphicsFor, graphicsSig, reachOf, setGfxNow } from "@/lib/graphics";
import { drawnAs, type Quality } from "@/lib/prefs";
import { Post3, postKey } from "../post3d";
import { Proxy3, Vortex3 } from "../stand3d";
import type { ThirdPersonView } from "../view";

/** What Warmup reads of the ThirdPersonView (plan 72 phase 4: its dependencies, said). */
export type WarmupHost = Pick<
  ThirdPersonView,
  | "meId"
  | "potato"
  | "ratioNow"
  | "holdDraw"
  | "tier"
  | "around"
  | "building"
  | "camera"
  | "charF"
  | "cutWarm"
  | "dprAtStart"
  | "floors"
  | "gone"
  | "hands"
  | "handsSpare"
  | "host"
  | "lamps"
  | "nightLevel"
  | "people3"
  | "pool"
  | "post"
  | "quality"
  | "ratioAtStart"
  | "ratioFor"
  | "renderer"
  | "resize"
  | "scene"
  | "sun"
  | "torch3"
  | "warmAt"
  | "warmCam"
  | "warmTarget"
  | "world"
>;

export class Warmup {
  constructor(private readonly c: WarmupHost) {}

  // ── ready (docs/plan/35-the-loading.md) ──
  // Behind the loading screen everything is built as fast as it goes (a long
  // frame doesn't show there): the other floors one after another, the land and
  // the people with bigger budgets a frame. The screen goes when it's all built
  // and every shader in the scene is compiled.
  warm = false;

  drawn = 0; // frames drawn

  preparing = 0; // the Grounds' new things whose shaders are compiling

  compiled: "no" | "going" | "done" = "no";

  most = { blocks: 0, statics: 0 };

  get warming(): boolean {
    return this.warm;
  }

  set warming(on: boolean) {
    this.warm = on;
    if (this.c.around.grounds) this.c.around.grounds.boost = on;
    if (on) this.c.warmAt = 0;
  }

  /** How built this view is: its parts' shares done (each 0..1) of how many. Ready when
   *  done === of. */
  readiness(): { done: number; of: number } {
    const parts: number[] = [];
    // (a few frames first: the people and the land are only asked for by a frame)
    parts.push(Math.min(1, this.drawn / 3));
    // the sun's shadow map (made by the first frame drawn: the floors wait for it)
    parts.push(!this.c.sun.castShadow || this.c.sun.shadow.map ? 1 : 0);
    // every floor built and drawn once, and the building's cut (warmUp)
    const all = hqFloorsOf(this.c.building).length;
    parts.push(this.c.cutWarm ? 1 : Math.min(0.95, this.c.floors.size / Math.max(1, all)));
    // the land, the rest of the Grounds, their shaders
    const g = this.c.around.grounds;
    if (g) {
      this.most.blocks = Math.max(this.most.blocks, g.left.blocks);
      this.most.statics = Math.max(this.most.statics, g.left.statics);
      parts.push(this.most.blocks ? 1 - g.left.blocks / this.most.blocks : 1);
      parts.push(this.most.statics ? 1 - g.left.statics / this.most.statics : 1);
      parts.push(this.preparing ? 0 : 1);
    }
    // the people (their chunk, then a model in — the life look's: its body and the garments it wears in,
    // Model.ready — so the people's shaders are in the scene when every shader in it is compiled below, not
    // compiled on their first frame in play; one is enough, theirs are the same materials, and the rest come in
    // as they load: docs/plan/89-the-weight.md phase 5 — the loading screen's own cap still holds: ctl/loading.ts)
    let people = 0;
    let ready = 0;
    for (const p of this.c.people3.values()) {
      people++;
      if (p.model.ready) ready++;
    }
    parts.push(!this.c.charF ? 0 : this.c.charF.pending ? 0.5 : people && !ready ? 0.5 : 1);
    // …and whoever's to be seen as soon as it lifts: me, and those within NEAR_M of me, in (their own body and
    // clothes — not a stand-in: one ready anywhere, an NPC out on the Grounds, was enough — plan 90)
    const mine = this.c.people3.get(this.c.meId);
    const at = mine?.root.position ?? this.c.camera.position;
    let near = 0;
    let nearIn = 0;
    for (const p of this.c.people3.values()) {
      if (p !== mine && p.root.position.distanceTo(at) > NEAR_M) continue;
      near++;
      if (p.model.ready) nearIn++;
    }
    parts.push(near ? nearIn / near : 1);
    // last: every shader in the scene (and my hands') compiled, once all the rest is in it
    const rest = parts.every((p) => p >= 1);
    if (rest && this.compiled === "no") this.compileAll();
    parts.push(this.compiled === "done" ? 1 : 0);
    return { done: parts.reduce((a, b) => a + b, 0), of: parts.length };
  }

  // (into the target the frame draws to, so they're the programs it uses: High's
  // finish draws the scene into a linear buffer — as warmDraw)
  compileAll() {
    this.compiled = "going";
    const r = this.c.renderer;
    if (this.c.post) {
      this.c.warmTarget ??= new WebGLRenderTarget(4, 4, { colorSpace: LinearSRGBColorSpace });
      r.setRenderTarget(this.c.warmTarget);
    }
    const jobs = [
      r.compileAsync(this.c.scene, this.c.camera),
      r.compileAsync(this.fadeSamples(), this.c.camera, this.c.scene),
      r.compileAsync(this.standSamples(), this.c.camera, this.c.scene),
    ];
    const h = this.c.hands ?? this.c.handsSpare;
    if (h) jobs.push(r.compileAsync(h.scene, h.camera));
    r.setRenderTarget(null);
    void Promise.all(jobs)
      .catch(() => {})
      .then(() => {
        if (!this.c.gone) this.drawAll();
        this.compiled = "done";
      });
  }

  // The see-through copies my floor's pieces take when they fade (applyFade), one of each
  // kind, kept: their shaders compiled too — else the first wall to fade linked one then
  fadeKept: Material[] = [];

  fadeSamples(): Scene {
    const s = new Scene();
    const seen = new Set<string>();
    for (const f of this.c.world.fades)
      for (const m of f.objects) {
        if (!(m instanceof Mesh || m instanceof LineSegments)) continue;
        const base = (m.userData.base ?? m.material) as Material;
        const a = m.geometry.attributes;
        const k = `${base.uuid}|${m.type}|${Object.keys(a).map((n) => n + a[n].itemSize)}`;
        if (seen.has(k)) continue;
        seen.add(k);
        const own = base.clone();
        own.transparent = true;
        own.depthWrite = false;
        this.fadeKept.push(own);
        s.add(m instanceof LineSegments ? new LineSegments(m.geometry, own) : new Mesh(m.geometry, own));
      }
    return s;
  }

  // Someone not built yet (their stand-in, its shadow and speaking ring) and Vortex's drawing: one
  // of each, kept — else the first of them to come into view linked their shaders then
  private standKept: (Proxy3 | Vortex3)[] = [];
  private spritesKept: Sprite[] = [];
  private spriteTex: CanvasTexture | null = null;
  standSamples(): Scene {
    const s = new Scene();
    const p = new Proxy3("warm");
    const avatar = { skin: "#c8a07a", topColor: "#5a6a7a", bottomColor: "#3a3a40", hairColor: "#2a2018" };
    p.update({ avatar: avatar as AvatarLayers, x: 0, y: 0, angle: 0, a: 0, speaking: true }, new Color(1, 1, 1));
    const v = new Vortex3("warm-vortex");
    v.plane.visible = true; // (compiled only what's shown)
    this.standKept.push(p, v);
    s.add(p.root, v.root);
    // (and a sprite, with a picture and without — a breath's puff in the cold, a car's spray, a gun's glint: the first
    // of them linked its shader then, ~40 ms waiting on the GPU — plan 121's specs)
    if (!this.spriteTex) {
      const cv = document.createElement("canvas");
      cv.width = cv.height = 2;
      this.spriteTex = new CanvasTexture(cv);
    }
    // (with a map and without, tone-mapped and not: view.puff's dust is a plain toneMapped:false one)
    for (const [map, toneMapped] of [
      [this.spriteTex, true],
      [null, true],
      [this.spriteTex, false],
      [null, false],
    ] as const) {
      const sp = new Sprite(new SpriteMaterial({ map, transparent: true, depthWrite: false, toneMapped }));
      this.spritesKept.push(sp);
      s.add(sp);
    }
    return s;
  }

  // …and all of it drawn once, every piece in view (from above, off screen): each mesh's
  // buffers and each texture go up to the GPU behind the screen — else the first look
  // round put them up then, tens of MB in a second or two
  drawAll() {
    const box = sceneBox(this.c.scene);
    if (box.isEmpty()) return;
    const c = this.c.warmCam;
    const r = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2 + 2;
    const x = (box.min.x + box.max.x) / 2;
    const z = (box.min.z + box.max.z) / 2;
    Object.assign(c, { left: -r, right: r, top: r, bottom: -r, far: box.max.y - box.min.y + 20 });
    c.position.set(x, box.max.y + 10, z);
    c.lookAt(x, box.min.y, z);
    c.updateProjectionMatrix();
    this.warmDraw(c);
    c.far = 400;
  }

  // One draw of the warm-up, as the screen draws (so the shaders compiled are the
  // ones it uses): High into a tiny linear target, as its finish's buffer;
  // Medium and Low into one pixel of the screen itself — its tones and colours —
  // which the frame then draws over.
  warmView = new Vector4();

  warmDraw(cam: Camera) {
    const r = this.c.renderer;
    const shadows = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false;
    // a light that casts a shadow and has no map yet (a car's headlamp on High, made while loading
    // the lot): drawn without a shadow pass, every lit draw fails (GL_INVALID_OPERATION — a sampler
    // with no texture: ~200 failed draws entering on the lot, plan 72 phase 3). Its map is made in
    // this draw (that light's pass only), as the first frame would.
    if (r.shadowMap.enabled) {
      let unmade = false;
      this.c.scene.traverseVisible((o) => {
        const l = o as SpotLight;
        if (!l.isLight || !l.castShadow || !l.shadow || l.shadow.map) return;
        l.shadow.needsUpdate = true;
        unmade = true;
      });
      if (unmade) r.shadowMap.needsUpdate = true;
    }
    if (this.c.post) {
      this.c.warmTarget ??= new WebGLRenderTarget(4, 4, { colorSpace: LinearSRGBColorSpace });
      r.setRenderTarget(this.c.warmTarget);
      r.render(this.c.scene, cam);
      r.setRenderTarget(null);
    } else {
      r.getViewport(this.warmView);
      r.setViewport(0, 0, 1, 1);
      r.setScissor(0, 0, 1, 1);
      r.setScissorTest(true);
      r.render(this.c.scene, cam);
      r.setScissorTest(false);
      r.setViewport(this.warmView);
    }
    r.shadowMap.autoUpdate = shadows;
  }

  // High: shadows in detail, bloom and the finish; Medium: softer shadows, no
  // finish; Low: no shadows, fewer lamps, 1× pixels; Lowest: fewer still, ¾ of a
  // pixel a pixel (and no antialiasing, from the start: ViewOpts).
  // A change mid-game (auto quality, Settings): every shader the new one needs (the lamps
  // lit, the shadows cast change them all) compiled first, a few a frame, against stand-ins
  // for the scene's lights — the scene drawn as it was meanwhile — then switched. At once,
  // every lit thing's shader was linked in one frame: 0.8 s here, seconds in Firefox.
  qualityTo: Quality | null = null;
  /** the settings drawn now, and those being compiled for (lib/graphics.ts graphicsSig, with the tier) */
  private drawnSig = "";
  private toSig = "";

  /** To a tier — its preset, with what's set by hand over it (the settings: plan 91 phase 9) — compiled first. */
  toQuality(q: Quality, g: Graphics = graphicsFor(q)) {
    const sig = `${q}|${graphicsSig(g)}`;
    if (sig === (this.qualityTo ? this.toSig : this.drawnSig)) return;
    this.qualityTo = q;
    this.toSig = sig;
    void this.compileFor(q, g).then(() => {
      if (!this.c.gone && this.qualityTo === q && this.toSig === sig) this.setQuality(q, g);
    });
  }

  /** Switched behind a still (plan 91 phase 10): the new settings put in at once, nothing drawn meanwhile
   *  (`holdDraw`), every shader the scene now needs compiled in parallel — the real lights, the real shadows,
   *  into what the frame draws to — and only then drawn: no frame stuck linking them (1–2 s at once before). */
  async switchBehind(q: Quality, g: Graphics = graphicsFor(q)): Promise<void> {
    const c = this.c;
    this.qualityTo = q;
    this.toSig = `${q}|${graphicsSig(g)}`;
    c.holdDraw = true;
    try {
      this.setQuality(q, g);
      // (two of the game's frames first, not drawn: what reads the settings each frame — the cars' headlamps'
      // shadows, the mood's fog banks — on the new ones before the shaders are made for them; compiled before,
      // 81 programs were made again at the first draw, a second's freeze)
      for (let i = 0; i < 2; i++) await new Promise((done) => requestAnimationFrame(done));
      if (c.gone) return;
      const r = c.renderer;
      const to = r.getRenderTarget();
      if (g.finish) {
        c.warmTarget ??= new WebGLRenderTarget(4, 4, { colorSpace: LinearSRGBColorSpace });
        r.setRenderTarget(c.warmTarget);
      } else r.setRenderTarget(null);
      r.setRenderTarget(to);
      c.scene.updateMatrixWorld();
      // (a lot a frame, 4 ms of making programs each — all of them at once was a 370 ms frame, under the still
      // but the game's own frame too —, with the scene's real lights; each lot linked in parallel; a few seconds at
      // most: a driver with no parallel compile links them at the first draw, as before)
      const reps: [Object3D, Camera, Scene][] = this.repsOf(c.scene).map((o) => [o, c.camera, c.scene]);
      if (c.hands) for (const o of this.repsOf(c.hands.scene)) reps.push([o, c.hands.camera, c.hands.scene]);
      const t0 = performance.now();
      for (let i = 0; i < reps.length && performance.now() - t0 < 8000; ) {
        if (c.gone) return;
        const lot: Promise<unknown>[] = [];
        const at = performance.now();
        const was = r.getRenderTarget();
        r.setRenderTarget(g.finish ? c.warmTarget : null);
        while (i < reps.length && performance.now() - at < 4) lot.push(r.compileAsync(...reps[i++]));
        r.setRenderTarget(was);
        await Promise.all(lot).catch(() => {});
        await new Promise((done) => requestAnimationFrame(done));
      }
    } finally {
      c.holdDraw = false;
    }
  }

  /** One of each kind of thing drawn under `root` (its materials, what its geometry carries): what a compile
   *  needs to make every program the frame will (one holding a light: compiled when it's drawn). */
  private repsOf(root: Object3D): Object3D[] {
    const reps: Object3D[] = [];
    const kinds = new Set<string>();
    root.traverseVisible((o) => {
      const m = (o as Mesh).material as Material | Material[] | undefined;
      if (!m || (o as PointLight).isLight) return;
      const g = (o as Mesh).geometry as BufferGeometry | undefined;
      const a = g?.attributes ?? {};
      const k = `${(Array.isArray(m) ? m : [m]).map((x) => x.uuid)}|${o.type}|${Object.keys(a).map((n) => n + a[n].itemSize)}|${Object.keys(g?.morphAttributes ?? {})}`;
      if (kinds.has(k)) return;
      kinds.add(k);
      let lit = false;
      o.traverse((x) => {
        lit ||= !!(x as PointLight).isLight;
      });
      if (!lit) reps.push(o);
    });
    return reps;
  }

  async compileFor(q: Quality, g: Graphics = graphicsFor(q)) {
    const r = this.c.renderer;
    // the lights as `q` has them (setQuality): how many lamps, which cast shadows
    const stand = new Scene();
    stand.fog = this.c.scene.fog;
    stand.environment = this.c.scene.environment;
    const lamps = g.lamps;
    const torches = this.c.torch3.map((t) => t.spot as Object3D);
    const shown = (o: Object3D) => {
      for (let x: Object3D | null = o; x; x = x.parent) if (!x.visible) return false;
      return true;
    };
    this.c.scene.traverse((o) => {
      if (!(o as PointLight).isLight) return;
      const lamp = this.c.pool.indexOf(o as PointLight);
      if (lamp >= 0 ? lamp >= lamps || !(o.parent && shown(o.parent)) : !shown(o)) return;
      const l = o.clone(false);
      l.visible = true; // (a lamp `q` lights that's off now)
      if (o === this.c.sun) l.castShadow = g.shadows > 0;
      const t = torches.indexOf(o);
      if (t >= 0) l.castShadow = g.lightShadows && t === 0;
      stand.add(l);
    });
    // one of each kind of thing drawn (its materials, what its geometry carries)
    const reps = this.repsOf(this.c.scene);
    // a few a frame, each lot ready before the next — into what the frame draws to (Medium
    // and High: their finish's linear buffer, as compileAll; Low: the screen)
    for (let i = 0; i < reps.length; ) {
      if (this.c.gone || this.qualityTo !== q) return;
      const t0 = performance.now();
      const lot: Promise<unknown>[] = [];
      const to = r.getRenderTarget();
      if (g.finish) {
        this.c.warmTarget ??= new WebGLRenderTarget(4, 4, { colorSpace: LinearSRGBColorSpace });
        r.setRenderTarget(this.c.warmTarget);
      } else r.setRenderTarget(null);
      while (i < reps.length && performance.now() - t0 < 4) lot.push(r.compileAsync(reps[i++], this.c.camera, stand));
      r.setRenderTarget(to);
      await Promise.all(lot).catch(() => {});
      await new Promise((done) => requestAnimationFrame(done));
    }
  }

  setQuality(tier: Quality, g: Graphics = graphicsFor(tier)) {
    // (potato: drawn as lowest, lighter — its pixels and its lamps: plan 90 phase 2)
    this.c.potato = tier === "potato";
    const q = drawnAs(tier);
    this.c.quality = q;
    this.qualityTo = null;
    this.drawnSig = `${tier}|${graphicsSig(g)}`;
    // (what's drawn with: every setting, the tier's preset with what's set by hand — lib/graphics.ts)
    setGfxNow(g, tier);
    this.c.renderer.setPixelRatio(this.c.ratioNow());
    if (!this.c.ratioAtStart && this.c.host) {
      this.c.ratioAtStart = this.c.renderer.getPixelRatio();
      this.c.dprAtStart = window.devicePixelRatio || 1;
    }
    this.c.sun.castShadow = g.shadows > 0;
    const size = g.shadows || 1024;
    if (this.c.sun.shadow.mapSize.x !== size) {
      this.c.sun.shadow.mapSize.set(size, size);
      this.c.sun.shadow.map?.dispose();
      this.c.sun.shadow.map = null;
    }
    this.c.lamps = g.lamps;
    this.c.around.grounds?.far?.setQuality(g.horizon, g.farTrees);
    // (how far the land and the districts are made: by the tier and the device's memory — plan 91 phase 6 — or set)
    this.c.around.grounds?.setReach(reachOf(g.view));
    // the first flashlight (mine) throws shadows on High — its shadow map drawn once now, so it's
    // there even while it's off (a shadow-casting light with no map yet: every lit draw failed —
    // "mismatch between texture format and sampler type" — and only the ink was left)
    for (const [i, tc] of this.c.torch3.entries()) {
      tc.spot.castShadow = g.lightShadows && i === 0;
      if (tc.spot.castShadow) tc.spot.shadow.needsUpdate = true;
    }
    this.c.pool.forEach((l, i) => {
      l.visible = i < this.c.lamps;
    });
    if (g.finish) {
      const flags = { bloom: g.bloom, grain: g.grain, ao: g.ao };
      if (this.c.post && postKey(this.c.post.flags) !== postKey(flags)) {
        this.c.post.dispose();
        this.c.post = null;
      }
      this.c.post ??= new Post3(this.c.renderer, this.c.scene, this.c.camera, flags);
      this.c.post.setNight(this.c.nightLevel);
    } else {
      this.c.post?.dispose();
      this.c.post = null;
    }
    this.c.resize();
  }
}

// the lamps lit at a tier (the pool's first n)
// (the loading screen: these near me in before it lifts — plan 90)
const NEAR_M = 20;

/** All of a scene's things in one box, each thing's own box left out when it isn't finite: an
 *  instanced pool hides a block's trees with all-zero matrices (grounds-stream.ts), which three's box
 *  maths divides by (w = 0) into NaN — Box3.setFromObject on the whole scene came out NaN, and the
 *  warm-up drew from a NaN camera (its clipping plane threw "firstElem.toArray is not a function"). */
function sceneBox(scene: Scene): Box3 {
  scene.updateMatrixWorld();
  const box = new Box3();
  const one = new Box3();
  scene.traverse((o) => {
    const m = o as Mesh;
    if (!m.geometry) return;
    const im = o as InstancedMesh;
    if (im.isInstancedMesh) {
      if (im.boundingBox === null) im.computeBoundingBox();
      one.copy(im.boundingBox as Box3);
    } else {
      if (m.geometry.boundingBox === null) m.geometry.computeBoundingBox();
      one.copy(m.geometry.boundingBox as Box3);
    }
    if (one.isEmpty()) return;
    one.applyMatrix4(o.matrixWorld);
    const v = [one.min.x, one.min.y, one.min.z, one.max.x, one.max.y, one.max.z];
    if (v.every(Number.isFinite)) box.union(one);
  });
  return box;
}
