// The graphics switched behind a photograph (docs/plan/91-the-big-map.md phase 10, "the photograph"): on Apply the
// frame on screen is copied into a still — drawn from the 3D canvas into a 2D one right after it's rendered, a copy
// on the GPU, no readback (toDataURL waits on the GPU 20–90 ms) — and laid over the game. Nothing under it is drawn
// while the new settings are put in and their shaders compiled (in parallel, KHR_parallel_shader_compile): what was
// a 1–2 s freeze is a still that keeps "developing" — its only motion the compositor's (transform, opacity), so it
// moves even while the main thread's busy. Once the new frames come steady, a wipe sweeps the old picture off to
// show the new one: the change seen to land, before beside after. The still is kept for "hold to compare" till the
// new settings are kept or put back.

export class StillSwitch {
  private want: ((c: HTMLCanvasElement | null) => void) | null = null;
  private box: HTMLDivElement | null = null;
  private img: HTMLCanvasElement | null = null;
  private dev: HTMLDivElement | null = null;
  private edge: HTMLDivElement | null = null;
  private anims: Animation[] = [];

  /** The next frame, as a still (null: none drawn within a second — a hidden page). */
  capture(): Promise<HTMLCanvasElement | null> {
    return new Promise((done) => {
      this.want = done;
      setTimeout(() => {
        if (this.want === done) {
          this.want = null;
          done(null);
        }
      }, 1000);
    });
  }

  /** Right after a frame's rendered (the drawing buffer still whole): copied, if a still's wanted. */
  afterRender(src: HTMLCanvasElement) {
    const done = this.want;
    if (!done) return;
    this.want = null;
    try {
      const c = document.createElement("canvas");
      // (at the page's size, not the frame's pixels: it's a moment on screen)
      c.width = Math.max(1, src.clientWidth);
      c.height = Math.max(1, src.clientHeight);
      c.getContext("2d")?.drawImage(src, 0, 0, c.width, c.height);
      done(c);
    } catch {
      done(null);
    }
  }

  /** Laid over the 3D view (`host`), "developing" till the wipe. */
  show(host: HTMLElement, still: HTMLCanvasElement) {
    this.drop();
    const box = document.createElement("div");
    box.style.cssText = "position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:1;will-change:transform";
    still.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;will-change:transform";
    // (the developing: a warm wash breathing over it, the way a print comes up in the tray)
    const dev = document.createElement("div");
    dev.style.cssText =
      "position:absolute;inset:0;background:radial-gradient(ellipse at 50% 55%, rgba(255,214,150,0.0) 30%, rgba(40,26,12,0.55) 100%);opacity:0.35;will-change:opacity";
    // (the wipe's edge: a thin line of light riding its left side)
    const edge = document.createElement("div");
    edge.style.cssText =
      "position:absolute;top:0;bottom:0;left:0;width:3px;background:linear-gradient(#fff3d6,#ffd28a);box-shadow:0 0 18px 6px rgba(255,210,140,0.55);opacity:0";
    box.append(still, dev, edge);
    if (getComputedStyle(host).position === "static") host.style.position = "relative";
    host.appendChild(box);
    this.box = box;
    this.img = still;
    this.dev = dev;
    this.edge = edge;
    this.anims.push(
      dev.animate([{ opacity: 0.18 }, { opacity: 0.5 }], {
        duration: 900,
        direction: "alternate",
        iterations: Number.POSITIVE_INFINITY,
        easing: "ease-in-out",
      }),
    );
  }

  /** The old picture swept off to the right, the new one under it. */
  async wipe(ms = 700): Promise<void> {
    const { box, img, dev, edge } = this;
    if (!box || !img || !dev || !edge) return;
    for (const a of this.anims) a.cancel();
    this.anims = [];
    dev.style.opacity = "0";
    edge.style.opacity = "1";
    const o: KeyframeAnimationOptions = { duration: ms, easing: "cubic-bezier(.65,0,.35,1)", fill: "forwards" };
    const a = box.animate([{ transform: "translateX(0)" }, { transform: "translateX(100%)" }], o);
    // (the picture held where it was while its frame slides off it)
    const b = img.animate([{ transform: "translateX(0)" }, { transform: "translateX(-100%)" }], o);
    this.anims.push(a, b);
    await a.finished.catch(() => {});
    this.compare(false);
  }

  /** The old picture shown again while it's held (hold to compare), or put away. */
  compare(on: boolean) {
    const { box, img, edge, dev } = this;
    if (!box || !img) return;
    for (const a of this.anims) a.cancel();
    this.anims = [];
    box.style.transform = "none";
    img.style.transform = "none";
    if (edge) edge.style.opacity = "0";
    if (dev) dev.style.opacity = "0";
    box.style.visibility = on ? "visible" : "hidden";
  }

  get held(): boolean {
    return !!this.box;
  }

  drop() {
    for (const a of this.anims) a.cancel();
    this.anims = [];
    this.box?.remove();
    this.box = this.img = this.dev = this.edge = null;
  }
}
