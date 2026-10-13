// The "On TV" card (docs/plan/10-media.md): where a YouTube TV or the radio's
// YouTube plays while you're in earshot — YouTube's picture can't be drawn
// into the world, and its rules want a visible player — and the big view when
// you Watch (YouTube or Jellyfin). Plain DOM in the media chunk (the world
// page has a size budget); styled like the HUD's cabinet.

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

export class MediaCard {
  readonly el: HTMLElement;
  readonly body: HTMLElement;
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
    // iframe never moves (moving it would reload the video)
    const main = document.querySelector("main");
    const canvas = main?.firstElementChild;
    if (main && canvas) canvas.after(this.back, el);
    else document.body.append(this.back, el);
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
    this.el.remove();
    this.back.remove();
  }
}
