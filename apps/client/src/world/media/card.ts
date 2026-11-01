// The "On TV" card (docs/plan/10-media.md): where a YouTube TV or the radio's
// YouTube plays while you're in earshot — YouTube's picture can't be drawn
// into the world, and its rules want a visible player — and the big view when
// you Watch (YouTube or Jellyfin). Plain DOM in the media chunk (the world
// page has a size budget); styled like the HUD's cabinet. YouTube's player is
// a layer of its own (`yt`): over the card's picture, or — while its TV is in
// sight — behind the 3D canvas, lined up with the TV's glass, which the view
// leaves as a hole (tp/live.ts): what's in front of the TV still covers it.

const CSS = `
.ymc{position:fixed;right:16px;bottom:92px;width:320px;pointer-events:auto;
  background:linear-gradient(180deg,#3b2618,#2a1b11);border:1px solid #5b3a26;border-radius:12px;
  box-shadow:0 10px 30px #0008,inset 0 1px 0 #ffffff14;padding:8px;display:flex;flex-direction:column;gap:6px;
  transition:opacity .25s,transform .25s;font-family:inherit}
.ymc[hidden]{display:none}
.ymc.big{right:50%;bottom:50%;transform:translate(50%,50%);width:min(1040px,94vw);z-index:60}
.ymc-back{position:fixed;inset:0;background:#0d0906cc;z-index:59;pointer-events:auto}
.ymc:not(.big){z-index:auto}
.ymc-back[hidden]{display:none}
.ymc-head{display:flex;align-items:center;gap:8px;min-width:0}
.ymc-tag{font-family:var(--font-lcd,monospace);font-size:12px;letter-spacing:.08em;color:#ffb35c;
  background:#1a1210;border:1px solid #3a2a1c;border-radius:6px;padding:2px 6px;white-space:nowrap;text-shadow:0 0 6px #ffa63080}
.ymc-title{flex:1;min-width:0;color:#efe4cc;font-size:12px;line-height:1.25;overflow:hidden}
.ymc-title b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600}
.ymc-title i{display:block;font-style:normal;color:#c9b99a;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ymc-btn{flex:none;height:28px;min-width:28px;padding:0 8px;border-radius:7px;border:1px solid #5b3a26;
  background:linear-gradient(180deg,#4a3020,#36231a);color:#efe4cc;font-size:12px;cursor:pointer}
.ymc-btn:hover{border-color:#b5562f}
.ymc-btn:focus-visible{outline:2px solid #ffa630;outline-offset:1px}
.ymc-body{position:relative;width:100%;aspect-ratio:16/9;background:#000;border-radius:8px;overflow:hidden}
.ymc-body>div,.ymc-body iframe,.ymc-body video{position:absolute;inset:0;width:100%;height:100%;border:0;object-fit:contain;background:#000}
.ymc-sound{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);z-index:2;border-radius:999px;
  padding:6px 12px;border:1px solid #ffa630;background:#1a1210e6;color:#ffb35c;font-size:12px;cursor:pointer}
.ymc-sound[hidden]{display:none}
.ymc.ontv .ymc-body{aspect-ratio:auto;background:none;overflow:visible;text-align:center}
.ymc.ontv .ymc-sound{position:static;transform:none}
.ymc-yt{position:fixed;left:0;top:0;width:0;height:0;background:#000;border-radius:8px;overflow:hidden;pointer-events:auto}
.ymc-yt[hidden]{display:none}
.ymc-yt.big{z-index:61}
.ymc-yt.ontv{z-index:-1;border-radius:0;pointer-events:none;transform-origin:0 0}
.ymc-yt>div,.ymc-yt iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
@media (max-width:640px){.ymc{right:8px;left:8px;width:auto;bottom:88px}.ymc.big{left:50%;right:auto;transform:translate(-50%,50%)}}
@media (prefers-reduced-motion:reduce){.ymc{transition:none}}
`;

const T = {
  onTv: ["ON TV", "NA TV"],
  onRadio: ["ON THE RADIO", "NO RÁDIO"],
  watch: ["Watch", "Assistir"],
  small: ["Smaller", "Menor"],
  hide: ["Not now (until I walk away)", "Agora não (até eu me afastar)"],
  sound: ["🔈 Click for sound", "🔈 Clique para ouvir"],
  soundTouch: ["🔈 Tap the video for sound", "🔈 Toque no vídeo para ouvir"],
  cc: ["CC", "Legendas"],
} as const;

export type Quad = [[number, number], [number, number], [number, number], [number, number]];

export class MediaCard {
  readonly el: HTMLElement;
  readonly body: HTMLElement;
  readonly yt: HTMLElement; // YouTube's player
  private ytOnTv = false;
  private back: HTMLElement;
  private tag: HTMLElement;
  private titleEl: HTMLElement;
  private subEl: HTMLElement;
  private bigBtn: HTMLButtonElement;
  private ccBtn: HTMLButtonElement;
  private soundBtn: HTMLButtonElement;
  big = false;
  onBig: (big: boolean) => void = () => {};
  onHide: () => void = () => {};
  onSound: () => void = () => {};
  onCc: () => void = () => {};

  constructor(private pt: boolean) {
    if (!document.getElementById("ymc-css")) {
      const st = document.createElement("style");
      st.id = "ymc-css";
      st.textContent = CSS;
      document.head.append(st);
    }
    const t = (k: keyof typeof T) => T[k][pt ? 1 : 0];
    this.back = document.createElement("div");
    this.back.className = "ymc-back";
    this.back.hidden = true;
    this.back.addEventListener("pointerdown", () => this.setBig(false));
    const el = document.createElement("section");
    el.className = "ymc";
    el.hidden = true;
    el.setAttribute("role", "region");
    el.innerHTML = `<div class="ymc-head"><span class="ymc-tag"></span><div class="ymc-title"><b></b><i></i></div><button type="button" class="ymc-btn" data-k="cc" hidden></button><button type="button" class="ymc-btn" data-k="big"></button><button type="button" class="ymc-btn" data-k="hide">✕</button></div><div class="ymc-body"><button type="button" class="ymc-sound" hidden></button></div>`;
    this.el = el;
    this.body = el.querySelector(".ymc-body") as HTMLElement;
    this.tag = el.querySelector(".ymc-tag") as HTMLElement;
    this.titleEl = el.querySelector(".ymc-title b") as HTMLElement;
    this.subEl = el.querySelector(".ymc-title i") as HTMLElement;
    this.bigBtn = el.querySelector('[data-k="big"]') as HTMLButtonElement;
    this.ccBtn = el.querySelector('[data-k="cc"]') as HTMLButtonElement;
    this.soundBtn = el.querySelector(".ymc-sound") as HTMLButtonElement;
    this.yt = document.createElement("div");
    this.yt.className = "ymc-yt";
    this.yt.hidden = true;
    this.ccBtn.textContent = t("cc");
    const hide = el.querySelector('[data-k="hide"]') as HTMLButtonElement;
    hide.title = t("hide");
    hide.setAttribute("aria-label", t("hide"));
    const touch = matchMedia("(pointer: coarse)").matches;
    this.soundBtn.textContent = touch ? t("soundTouch") : t("sound");
    this.bigBtn.addEventListener("click", () => this.setBig(!this.big));
    hide.addEventListener("click", () => this.onHide());
    this.soundBtn.addEventListener("click", () => this.onSound());
    this.ccBtn.addEventListener("click", () => this.onCc());
    window.addEventListener("keydown", this.onKey);
    // inside the world, between the canvas and the HUD (panels, the dock and the
    // top bar draw over it); Watch lifts it above everything (z-index), so the
    // iframe never moves (moving it would reload the video) — nor does it going
    // onto its TV (only its layer's place and z-index change)
    const main = document.querySelector("main");
    const canvas = main?.firstElementChild;
    if (main && canvas) canvas.after(this.back, el, this.yt);
    else document.body.append(this.back, el, this.yt);
    this.label(false);
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape" && this.big) {
      e.stopPropagation();
      this.setBig(false);
    }
  };

  private label(radio: boolean) {
    this.tag.textContent = T[radio ? "onRadio" : "onTv"][this.pt ? 1 : 0];
    this.bigBtn.textContent = this.big ? `⤡ ${T.small[this.pt ? 1 : 0]}` : `⤢ ${T.watch[this.pt ? 1 : 0]}`;
    this.el.setAttribute("aria-label", this.tag.textContent);
  }

  private shown = "";
  show(o: { title: string; sub?: string; radio: boolean; cc?: boolean }) {
    // every frame: only touch the DOM when something changed
    const sig = `${o.title}|${o.sub ?? ""}|${o.radio}|${!!o.cc}|${this.el.hidden}`;
    if (sig === this.shown) return;
    this.shown = `${o.title}|${o.sub ?? ""}|${o.radio}|${!!o.cc}|false`;
    this.titleEl.textContent = o.title;
    this.subEl.textContent = o.sub ?? "";
    this.ccBtn.hidden = !o.cc;
    this.label(o.radio);
    this.el.hidden = false;
  }

  hide() {
    this.el.hidden = true;
    this.setBig(false);
    this.ytCard();
  }

  // YouTube's player over the card's picture (every frame while it plays there:
  // the card moves, grows for Watch)
  ytCard() {
    const y = this.yt;
    if (this.ytOnTv) {
      this.ytOnTv = false;
      this.el.classList.remove("ontv");
      y.classList.remove("ontv");
      y.style.transform = "";
    }
    y.hidden = this.el.hidden || !y.firstElementChild;
    y.classList.toggle("big", this.big);
    if (y.hidden) return;
    const r = this.body.getBoundingClientRect();
    y.style.left = `${r.left}px`;
    y.style.top = `${r.top}px`;
    y.style.width = `${r.width}px`;
    y.style.height = `${r.height}px`;
  }

  // … or behind the canvas on its TV's glass: `q` its corners on the page, `aspect`
  // the glass's shape (the player is laid out at that shape, then taken onto them)
  ytTv(q: Quad, aspect: number) {
    const y = this.yt;
    if (!this.ytOnTv) {
      this.ytOnTv = true;
      this.el.classList.add("ontv");
      y.classList.add("ontv");
      y.classList.remove("big");
      y.style.left = "0px";
      y.style.top = "0px";
    }
    y.hidden = !y.firstElementChild;
    // big enough for YouTube's rules (≥ 200 × 200 as laid out) whatever it looks
    const H = Math.max(200, 200 / aspect, Math.round(640 / aspect));
    const W = Math.round(H * aspect);
    const w = `${W}px`;
    const h = `${H}px`;
    if (y.style.width !== w) y.style.width = w;
    if (y.style.height !== h) y.style.height = h;
    y.style.transform = onto(grow(q, 1.5), W, H);
  }

  get onTv(): boolean {
    return this.ytOnTv;
  }

  get visible(): boolean {
    return !this.el.hidden;
  }

  setBig(big: boolean) {
    if (this.big === big) return;
    this.big = big;
    this.el.classList.toggle("big", big);
    this.back.hidden = !big;
    this.label(this.tag.textContent === T.onRadio[this.pt ? 1 : 0]);
    this.onBig(big);
  }

  needsSound(on: boolean) {
    this.soundBtn.hidden = !on;
  }

  destroy() {
    window.removeEventListener("keydown", this.onKey);
    this.yt.remove();
    this.el.remove();
    this.back.remove();
  }
}

// a quad pushed out from its middle by `px` (the canvas's edge of the hole covers
// the player's: no seam where the two don't meet exactly)
function grow(q: Quad, px: number): Quad {
  const cx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4;
  const cy = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4;
  return q.map(([x, y]) => {
    const d = Math.hypot(x - cx, y - cy) || 1;
    return [x + ((x - cx) / d) * px, y + ((y - cy) / d) * px];
  }) as Quad;
}

// The CSS transform taking a W × H box (from its top-left) onto a quad on the page:
// the projective map from the unit square to its corners (tl, tr, br, bl), scaled.
export function onto(q: Quad, W: number, H: number): string {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const dy3 = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1;
  const g = den ? (dx3 * dy2 - dx2 * dy3) / den : 0;
  const h = den ? (dx1 * dy3 - dx3 * dy1) / den : 0;
  const a = x1 - x0 + g * x1;
  const b = x3 - x0 + h * x3;
  const d = y1 - y0 + g * y1;
  const e = y3 - y0 + h * y3;
  const m = [a / W, d / W, 0, g / W, b / H, e / H, 0, h / H, 0, 0, 1, 0, x0, y0, 0, 1];
  return `matrix3d(${m.map((n) => +n.toFixed(9)).join(",")})`;
}
