// The combo on the screen (docs/plan/103-the-skate.md F5a): the tricks linked, their points × how many, the
// balance needle on a grind or a manual, the last combo banked (or lost) — in the HUD's walnut and ink
// (ui-look: a manuscript in wood). Plain DOM: one small box over the game, made when a board's first ridden.

export interface ComboShow {
  name: string;
  base: number;
  count: number;
  /** a balance needle (−1..1) and which way it reads (a grind's across, a manual's up) */
  bal?: number;
  vertical?: boolean;
}

const CSS = `
.sk-hud{position:fixed;left:50%;bottom:118px;transform:translateX(-50%);pointer-events:none;z-index:30;
  display:flex;flex-direction:column;align-items:center;gap:6px;font-family:var(--font-serif,Georgia,serif)}
.sk-combo{max-width:min(78vw,720px);padding:6px 14px 7px;border-radius:6px;text-align:center;color:#f3ead7;
  background:linear-gradient(#5a3a24,#3e2716);border:2px solid #2a190d;box-shadow:inset 0 0 0 1px #8a6040,0 3px 10px #0007;
  opacity:0;transition:opacity .25s}
.sk-combo.on{opacity:1}
.sk-name{font-size:15px;line-height:1.25;letter-spacing:.01em}
.sk-pts{font-size:22px;font-weight:600;color:#f6d79a;margin-top:2px}
.sk-pts small{font-size:14px;color:#e9dcc3;font-weight:400}
.sk-done{font-size:20px;font-weight:600;color:#f6d79a;text-shadow:0 2px 6px #000a;opacity:0;transition:opacity .4s}
.sk-done.on{opacity:1}
.sk-done.lost{color:#e98d72;text-decoration:line-through}
.sk-bal{position:relative;width:160px;height:10px;border-radius:5px;background:#2a190d;border:1px solid #8a6040;display:none}
.sk-bal.on{display:block}
.sk-bal.v{width:10px;height:90px;position:fixed;left:calc(50% + 120px);bottom:150px}
.sk-bal i{position:absolute;top:-3px;width:4px;height:14px;margin-left:-2px;background:#f6d79a;border-radius:2px;left:50%}
.sk-bal.v i{left:-3px;top:auto;width:14px;height:4px;margin:0 0 -2px;bottom:50%}
.sk-best{font-size:12px;color:#e9dcc3;opacity:.8}
`;

export class SkateHud {
  private el: HTMLDivElement;
  private combo: HTMLDivElement;
  private name: HTMLDivElement;
  private pts: HTMLDivElement;
  private done: HTMLDivElement;
  private bal: HTMLDivElement;
  private needle: HTMLElement;
  private doneUntil = 0;
  best = 0;
  constructor() {
    if (!document.getElementById("sk-hud-css")) {
      const s = document.createElement("style");
      s.id = "sk-hud-css";
      s.textContent = CSS;
      document.head.appendChild(s);
    }
    this.el = document.createElement("div");
    this.el.className = "sk-hud";
    this.el.innerHTML =
      '<div class="sk-bal"><i></i></div><div class="sk-done"></div><div class="sk-combo"><div class="sk-name"></div><div class="sk-pts"></div></div>';
    document.body.appendChild(this.el);
    this.bal = this.el.querySelector(".sk-bal") as HTMLDivElement;
    this.needle = this.bal.querySelector("i") as HTMLElement;
    this.done = this.el.querySelector(".sk-done") as HTMLDivElement;
    this.combo = this.el.querySelector(".sk-combo") as HTMLDivElement;
    this.name = this.el.querySelector(".sk-name") as HTMLDivElement;
    this.pts = this.el.querySelector(".sk-pts") as HTMLDivElement;
    try {
      this.best = Number(localStorage.getItem("yutopia.skate.best") ?? 0) || 0;
    } catch {
      this.best = 0;
    }
  }
  /** The combo going on (none: hidden). */
  show(c: ComboShow | null) {
    this.combo.classList.toggle("on", !!c && c.count > 0);
    if (c && c.count > 0) {
      this.name.textContent = c.name;
      this.pts.innerHTML = `${c.base.toLocaleString()} <small>× ${c.count}</small>`;
    }
    const b = c?.bal;
    this.bal.classList.toggle("on", b !== undefined);
    this.bal.classList.toggle("v", !!c?.vertical);
    if (b !== undefined) {
      const k = Math.max(-1, Math.min(1, b));
      if (c?.vertical) this.needle.style.bottom = `${50 + k * 46}%`;
      else this.needle.style.left = `${50 + k * 46}%`;
    }
    if (this.doneUntil && performance.now() > this.doneUntil) {
      this.done.classList.remove("on");
      this.doneUntil = 0;
    }
  }
  /** A combo ended: banked (its score up a moment) or lost (struck through). */
  ended(score: number, lost: boolean) {
    this.done.textContent = lost ? `${score.toLocaleString()}` : `+${score.toLocaleString()}`;
    this.done.classList.toggle("lost", lost);
    this.done.classList.add("on");
    this.doneUntil = performance.now() + 1800;
    if (!lost && score > this.best) {
      this.best = score;
      try {
        localStorage.setItem("yutopia.skate.best", String(score));
      } catch {
        /* (a private window) */
      }
    }
  }
  dispose() {
    this.el.remove();
  }
}
