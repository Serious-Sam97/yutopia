// The skate HUD (docs/plan/104-the-skate-again.md F7b, F8a, F9a): Tony Hawk's layout, in our own punk print — a
// photocopied zine pasted over the game. The trick string lower centre, each trick a cut-out clipping, the base ×
// the multiplier on a price sticker under it; the score on a torn sheet top right, the best on masking tape, the
// special bar under them (lit: it strobes); a grind's balance an arc sticker over the string with a needle, a
// manual's / lip's an upright bar beside centre. Landing: the pot stamps "+1,234" and flies into the score, which
// counts up to it; a bail: the string struck through in red marker, shaken, dropped. Gaps pop their names on tape.
// Plain DOM + CSS (transform / opacity only while it plays, one-shots by the Web Animations API), made when a board's
// first ridden — none of it on the page. The app's reduced-motion pref turns the movement off (fades only).
// Lettering: the system's heavy condensed sans (Impact; Inter 900 where there's none) and the page's Special Elite.

import { prefs } from "@/lib/prefs";

export interface SkateHudState {
  /** the combo going on (none: hidden): its trick names in order, the base points and the multiplier (trick count) */
  combo: { names: string[]; base: number; mult: number } | null;
  /** the balance needle −1..1 and which meter: a grind's arc (above the trick string), a manual's / lip's upright bar */
  bal?: { v: number; kind: "grind" | "manual" | "lip" };
  /** the session: score, best, the special meter 0..1 and whether it's lit (full: pulsing) */
  score: number;
  best: number;
  special: number;
  lit: boolean;
  /** "FAKIE" near the string */
  fakie: boolean;
  /** the tag's word when not "FAKIE" (e.g. "SWITCH") */
  stance?: string;
}

const MAX_NAMES = 14; // longer strings keep their last 14 behind a "…"
const PAPERS = ["#f3ecda", "#ffe14a", "#ffffff", "#ff9cc6", "#93e4f2", "#f3ecda", "#cdf27e", "#ffd2a1"];
const TILT = [-2.4, 1.7, -1.1, 2.6, -2.9, 0.9, 2.1, -1.7, 1.3, -0.7];

const FACE = `Impact,Haettenschweiler,"Arial Narrow Bold","Franklin Gothic Heavy","Arial Black",var(--font-inter),sans-serif`;
const TYPE = `var(--font-special-elite),"Special Elite","Courier New",monospace`;
// photocopied paper: a halftone's dots, the copier's streaks, the sheet
const PAPER = (c: string) =>
  `radial-gradient(circle,rgba(20,18,16,.15) .9px,transparent 1.3px) 0 0/5px 5px,repeating-linear-gradient(96deg,rgba(0,0,0,.045) 0 1px,transparent 1px 9px),linear-gradient(170deg,${c},color-mix(in srgb,${c} 86%,#7a6a48))`;

const CSS = `
.skh{position:fixed;inset:0;pointer-events:none;z-index:39;--ink:#121110;--pink:#ff3d8b;--yel:#ffe14a;--cyan:#2ec4e6;--red:#e8322b;
  font-family:${FACE};font-synthesis:none;font-weight:900;color:var(--ink);-webkit-font-smoothing:antialiased}
.skh *{box-sizing:border-box}
.skh .ol{color:#fff;-webkit-text-stroke:.085em var(--ink);paint-order:stroke fill;text-shadow:.07em .07em 0 var(--pink)}
.skh:not(.ready) .skh-top,.skh.off .skh-top,.skh.off .skh-low,.skh.off .skh-man{visibility:hidden;opacity:0}

/* ── the session: top right, under the game's clock ── */
.skh-top{position:absolute;top:84px;right:16px;display:flex;flex-direction:column;align-items:flex-end;gap:9px;transition:opacity .2s}
.skh-card{position:relative;transform:rotate(-2deg);filter:drop-shadow(3px 4px 0 rgba(18,17,16,.85))}
.skh-card .pap{padding:14px 18px 6px 22px;min-width:150px;text-align:right;background:${PAPER("#f3ecda")};
  clip-path:polygon(0 6%,7% 0,19% 4%,33% 1%,48% 5%,62% 0,79% 3%,92% 0,100% 5%,98% 30%,100% 58%,97% 82%,100% 100%,84% 96%,68% 100%,51% 95%,36% 100%,20% 96%,6% 100%,0 94%,2% 66%,0 38%)}
.skh-card .num{display:block;font-size:40px;line-height:1;letter-spacing:.01em;color:var(--ink);text-shadow:3px 2px 0 var(--pink)}
.skh-tape{position:absolute;left:-10px;top:-9px;padding:3px 12px 2px;font:400 12px/1.1 ${TYPE};letter-spacing:.14em;color:#fff;background:var(--ink);transform:rotate(-5deg);
  clip-path:polygon(0 10%,4% 0,96% 4%,100% 0,98% 50%,100% 100%,3% 92%,0 100%,2% 50%)}
.skh-best{padding:4px 14px 3px;font:400 13px/1.1 ${TYPE};letter-spacing:.06em;color:#2b241a;background:rgba(240,226,160,.88);transform:rotate(1.5deg);
  clip-path:polygon(0 0,3% 14%,1% 30%,4% 48%,0 66%,3% 84%,0 100%,100% 100%,97% 86%,100% 70%,96% 52%,100% 34%,97% 16%,100% 0)}
.skh-best b{font-family:${FACE};font-weight:900;font-size:16px;letter-spacing:.02em;color:var(--ink);margin-left:4px}
.skh-best.new{background:rgba(255,225,74,.95)}
.skh-spec{position:relative;width:clamp(150px,28vw,230px);margin-top:12px}
.skh-spec .lab{position:absolute;left:4px;top:-15px;font:400 11px/1 ${TYPE};letter-spacing:.2em;color:#fff;text-shadow:1px 1px 0 var(--ink),-1px -1px 0 var(--ink),1px -1px 0 var(--ink),-1px 1px 0 var(--ink)}
.skh-spec .bar{position:relative;height:17px;transform:skewX(-16deg);border:3px solid var(--ink);overflow:hidden;
  background:radial-gradient(circle,rgba(255,255,255,.14) .9px,transparent 1.3px) 0 0/4px 4px,#2b2723;box-shadow:3px 3px 0 var(--ink)}
.skh-spec .fill{position:absolute;inset:0;transform-origin:0 50%;transform:scaleX(0);background:linear-gradient(90deg,var(--pink),#ff8a3d 55%,var(--yel))}
.skh-spec .str{position:absolute;inset:0 -40px 0 0;opacity:0;
  background:repeating-linear-gradient(-60deg,rgba(255,255,255,.55) 0 6px,transparent 6px 14px)}
.skh-spec .glow{position:absolute;inset:-6px;border-radius:2px;opacity:0;box-shadow:0 0 16px 4px var(--yel),0 0 4px 2px #fff}
.skh-spec.lit .fill{background:linear-gradient(90deg,var(--yel),#fff6b0 50%,var(--cyan))}
.skh-spec.lit .str{opacity:1;animation:skh-run .45s linear infinite}
.skh-spec.lit .glow{animation:skh-glow .5s ease-in-out infinite alternate}
.skh-spec.lit .lab{color:var(--yel)}
@keyframes skh-run{to{transform:translateX(-28px)}}
@keyframes skh-glow{from{opacity:.25}to{opacity:1}}

/* ── the combo: lower centre ── */
.skh-low{position:absolute;left:50%;bottom:clamp(26px,7vh,90px);transform:translateX(-50%);width:min(94vw,900px);
  display:flex;flex-direction:column;align-items:center;gap:8px;font-size:clamp(17px,4.6vw,30px)}
.skh-sw{position:relative;display:flex;flex-direction:column;align-items:center;gap:6px;font-size:clamp(17px,4.6vw,30px);max-width:100%;transition:opacity .15s}
.skh-low:not(.on) .skh-sw{opacity:0}
.skh-str{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:.22em .08em;font-size:calc(1em * var(--k,1));line-height:1;transform-origin:50% 100%}
.skh-it{display:inline-flex;align-items:center;gap:.08em}
.skh-it .pl{font-style:normal;font-size:1.15em;margin:0 .06em;color:#fff;-webkit-text-stroke:.09em var(--ink);paint-order:stroke fill}
.skh-it b{display:inline-block;padding:.12em .32em .06em;text-transform:uppercase;letter-spacing:.015em;font-weight:900;color:var(--ink);
  box-shadow:.09em .11em 0 var(--ink);white-space:nowrap}
.skh-pts{display:flex;align-items:center;gap:.25em;font-size:1.35em;line-height:1;transform-origin:50% 50%}
.skh-pts .b{letter-spacing:.02em}
.skh-pts .x{font-size:.7em;color:#fff;-webkit-text-stroke:.1em var(--ink);paint-order:stroke fill}
.skh-pts .m{display:inline-grid;place-items:center;min-width:1.55em;height:1.55em;padding:0 .2em;border-radius:999px;font-size:.78em;color:#fff;
  background:var(--red);border:.12em solid var(--ink);transform:rotate(8deg);box-shadow:.08em .1em 0 var(--ink)}
.skh-fk{padding:.14em .42em .08em;margin-bottom:-4px;font-size:.62em;letter-spacing:.08em;color:#fff;background:var(--ink);
  transform:translateX(-6em) rotate(-7deg);box-shadow:.08em .08em 0 var(--pink);display:none}
.skh-fk.on{display:block}

/* a grind's arc: a die-cut sticker over the string */
.skh-arc{position:relative;width:200px;height:112px;margin-bottom:-6px;opacity:0;transform:scale(.85);transition:opacity .12s,transform .12s;display:none}
.skh-arc.on{display:block;opacity:1;transform:none}
.skh-arc svg{position:absolute;inset:0;overflow:visible}
.skh-arc .nd{position:absolute;left:98px;top:6px;width:4px;height:98px;transform-origin:50% 100%;background:var(--ink);border-radius:2px;
  box-shadow:0 0 0 2px #fff}
.skh-arc .nd::before{content:"";position:absolute;left:-4px;top:-2px;width:12px;height:16px;background:var(--pink);clip-path:polygon(50% 0,100% 100%,0 100%);}
.skh-arc .pv{position:absolute;left:91px;top:95px;width:18px;height:18px;border-radius:50%;background:var(--ink);border:3px solid #fff}
.skh-arc.hot .nd{background:var(--red)}
.skh-arc.hot svg{animation:skh-jit .09s steps(2) infinite}
@keyframes skh-jit{50%{transform:translate(1px,-1px) rotate(.6deg)}}

/* a manual's / a lip's upright bar, beside centre */
.skh-man{position:absolute;left:calc(50% + clamp(86px,22vw,190px));bottom:clamp(150px,30vh,300px);width:28px;height:clamp(104px,18vh,148px);
  opacity:0;transform:rotate(3deg) scale(.85);transition:opacity .12s,transform .12s}
.skh-man.on{opacity:1;transform:rotate(3deg)}
.skh-man .tube{position:absolute;inset:0;border:3px solid var(--ink);box-shadow:3px 3px 0 var(--ink),0 0 0 3px #f3ecda;
  background:radial-gradient(circle,rgba(20,18,16,.2) .9px,transparent 1.3px) 0 0/4px 4px,
  linear-gradient(to top,var(--red) 0 12%,var(--yel) 12% 30%,#49c35d 30% 70%,var(--yel) 70% 88%,var(--red) 88%)}
.skh-man .rail{position:absolute;inset:0}
.skh-man .nd{position:absolute;left:-11px;right:-11px;top:50%;height:7px;margin-top:-3.5px;background:var(--ink);box-shadow:0 0 0 2px #fff}
.skh-man .nd::after{content:"";position:absolute;right:-9px;top:-5px;width:10px;height:17px;background:var(--pink);clip-path:polygon(100% 0,0 50%,100% 100%)}
.skh-man.hot .nd{background:var(--red)}
.skh-man .lab{position:absolute;left:38px;bottom:0;font:400 12px/1 ${TYPE};letter-spacing:.2em;color:#fff;writing-mode:vertical-rl;transform:rotate(180deg);
  text-shadow:1px 1px 0 var(--ink),-1px -1px 0 var(--ink),1px -1px 0 var(--ink),-1px 1px 0 var(--ink)}

/* the gaps and the notes, upper middle */
.skh-mid{position:absolute;left:50%;top:max(150px,22vh);transform:translateX(-50%);width:min(94vw,760px);display:flex;flex-direction:column;align-items:center;gap:10px}
.skh-gap{display:flex;align-items:center;gap:.4em;font-size:clamp(17px,4.4vw,28px);line-height:1}
.skh-gap .nm{padding:.16em .5em .08em;text-transform:uppercase;letter-spacing:.02em;background:${PAPER("#ffe14a")};box-shadow:.1em .12em 0 var(--ink);transform:rotate(-2deg);
  clip-path:polygon(0 4%,3% 0,97% 6%,100% 0,99% 52%,100% 100%,2% 94%,0 100%,1% 50%)}
.skh-gap .pp{font-style:normal;font-size:1.1em}
.skh-note{padding:6px 16px 5px;font:400 clamp(13px,3.4vw,16px)/1.2 ${TYPE};letter-spacing:.03em;color:#2b241a;background:rgba(240,226,160,.92);transform:rotate(-1deg);
  max-width:100%;text-align:center;clip-path:polygon(0 0,2% 18%,0 40%,2% 62%,0 82%,1% 100%,99% 100%,100% 80%,98% 60%,100% 38%,98% 18%,100% 0)}

/* what's flying: the banked or lost string, the stamps */
.skh-gh{position:fixed;margin:0;pointer-events:none}
.skh-gh.bail .skh-it b{background:#d9d3c4!important;color:#8e1a14}
.skh-gh.bail .skh-pts .b{color:#f6d3cf}
.skh-gh .strike{position:absolute;left:-4%;right:-4%;top:46%;height:.32em;background:var(--red);border-radius:.2em;transform:rotate(-3deg) scaleX(0);transform-origin:0 50%;
  box-shadow:0 .06em 0 rgba(0,0,0,.35)}
.skh-stamp{position:fixed;left:0;top:0;font-size:clamp(30px,8vw,58px);line-height:1;white-space:nowrap;letter-spacing:.01em}
.skh-stamp.lost{font-size:clamp(24px,6vw,40px);padding:.12em .3em .04em;color:var(--red);border:.12em solid var(--red);border-radius:.12em;background:rgba(243,236,218,.82);
  text-shadow:none;-webkit-text-stroke:0}
@media (max-width:639px){
  .skh-top{top:80px;right:10px;gap:7px}
  .skh-mid{top:30vh}
  .skh-card .pap{min-width:112px;padding:12px 12px 4px 16px}
  .skh-card .num{font-size:30px}
  .skh-arc{transform:scale(.8);margin:-10px 0 -16px}
  .skh-arc.on{transform:scale(.8)}
}
.skh.rm *{animation:none!important;transition:none!important}
`;

const ARC = (() => {
  // the sticker: an arc of 120° round a pivot (100,104), r 88: green ±14°, yellow to ±38°, red to ±60°
  const pt = (deg: number) => {
    const r = (deg * Math.PI) / 180;
    return `${(100 + 88 * Math.sin(r)).toFixed(2)} ${(104 - 88 * Math.cos(r)).toFixed(2)}`;
  };
  const seg = (a: number, b: number, c: string, w: number) =>
    `<path d="M${pt(a)} A88 88 0 0 1 ${pt(b)}" stroke="${c}" stroke-width="${w}" fill="none"/>`;
  const ticks = [-60, -38, -14, 14, 38, 60]
    .map((d) => {
      const r = (d * Math.PI) / 180;
      const x1 = 100 + 79 * Math.sin(r);
      const y1 = 104 - 79 * Math.cos(r);
      const x2 = 100 + 97 * Math.sin(r);
      const y2 = 104 - 97 * Math.cos(r);
      return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#121110" stroke-width="3"/>`;
    })
    .join("");
  return `<svg viewBox="0 0 200 112" width="200" height="112" aria-hidden="true">
<g transform="translate(5 5)" opacity=".85">${seg(-60, 60, "#121110", 36).replace("<path", '<path stroke-linecap="round"')}</g>
${seg(-60, 60, "#f3ecda", 36).replace("<path", '<path stroke-linecap="round"')}
${seg(-60, 60, "#121110", 22)}
${seg(-60, -38, "#e8322b", 15)}${seg(-38, -14, "#ffe14a", 15)}${seg(-14, 14, "#49c35d", 15)}${seg(14, 38, "#ffe14a", 15)}${seg(38, 60, "#e8322b", 15)}
${ticks}</svg>`;
})();

const fmt = (n: number) => Math.round(n).toLocaleString();

function div(cls: string, parent?: HTMLElement, text?: string): HTMLDivElement {
  const el = document.createElement("div");
  el.className = cls;
  if (text !== undefined) el.textContent = text;
  parent?.appendChild(el);
  return el;
}

export class SkateHud {
  private root: HTMLDivElement;
  private card: HTMLDivElement;
  private num: HTMLElement;
  private bestEl: HTMLDivElement;
  private bestNum: HTMLElement;
  private spec: HTMLDivElement;
  private fill: HTMLDivElement;
  private low: HTMLDivElement;
  private sw: HTMLDivElement;
  private str: HTMLDivElement;
  private pts: HTMLDivElement;
  private ptsBase: HTMLElement;
  private ptsMult: HTMLElement;
  private fk: HTMLDivElement;
  private arc: HTMLDivElement;
  private arcNd: HTMLDivElement;
  private man: HTMLDivElement;
  private manRail: HTMLDivElement;
  private manLab: HTMLDivElement;
  private mid: HTMLDivElement;

  private rm = false;
  private off = false;
  private ready = false;
  // what's drawn (so a frame writes only what changed)
  private items: string[] = [];
  private allLen = 0;
  private baseShown = -1;
  private multShown = -1;
  private comboOn = false;
  private specShown = -1;
  private litShown = false;
  private bestShown = -1;
  private fkShown = "";
  private balKind = "";
  private balShown = 99;
  private hotShown = false;
  // the score as counted: from → to over 0.45 s, after the pot's flight lands
  private disp = -1;
  private numShown = -1;
  private countFrom = 0;
  private countTo = 0;
  private countAt = 0;
  private holdUntil = 0;
  // a combo banked or lost stays gone though the same one's passed again
  private spent: string | null = null;
  private last: SkateHudState["combo"] = null;

  constructor() {
    if (!document.getElementById("skh-css")) {
      const s = document.createElement("style");
      s.id = "skh-css";
      s.textContent = CSS;
      document.head.appendChild(s);
    }
    const root = div("skh");
    root.setAttribute("aria-hidden", "true");
    this.root = root;

    const top = div("skh-top", root);
    this.card = div("skh-card", top);
    const pap = div("pap", this.card);
    this.num = document.createElement("b");
    this.num.className = "num";
    this.num.textContent = "0";
    pap.appendChild(this.num);
    div("skh-tape", this.card, "SCORE");
    this.bestEl = div("skh-best", top, "BEST");
    this.bestNum = document.createElement("b");
    this.bestNum.textContent = "0";
    this.bestEl.appendChild(this.bestNum);
    this.spec = div("skh-spec", top);
    div("lab", this.spec, "SPECIAL");
    const bar = div("bar", this.spec);
    this.fill = div("fill", bar);
    div("str", this.fill);
    div("glow", this.spec);

    this.mid = div("skh-mid", root);

    this.low = div("skh-low", root);
    this.arc = div("skh-arc", this.low);
    this.arc.innerHTML = ARC;
    this.arcNd = div("nd", this.arc);
    div("pv", this.arc);
    this.fk = div("skh-fk", this.low, "FAKIE");
    this.sw = div("skh-sw", this.low);
    this.str = div("skh-str", this.sw);
    this.pts = div("skh-pts", this.sw);
    this.ptsBase = document.createElement("span");
    this.ptsBase.className = "b ol";
    const x = document.createElement("span");
    x.className = "x";
    x.textContent = "×";
    this.ptsMult = document.createElement("span");
    this.ptsMult.className = "m";
    this.pts.append(this.ptsBase, x, this.ptsMult);

    this.man = div("skh-man", root);
    div("tube", this.man);
    this.manRail = div("rail", this.man);
    div("nd", this.manRail);
    this.manLab = div("lab", this.man, "MANUAL");

    document.body.appendChild(root);
    this.motion();
  }

  /** Every frame while riding. */
  show(s: SkateHudState) {
    const now = performance.now();
    this.motion();
    if (!this.ready) {
      this.ready = true;
      this.root.classList.add("ready");
    }
    this.score(s.score, now);
    if (s.best !== this.bestShown) {
      if (this.bestShown > 0 && s.best > this.bestShown) this.newBest();
      this.bestShown = s.best;
      this.bestNum.textContent = fmt(s.best);
    }
    const sp = Math.round(Math.max(0, Math.min(1, s.special)) * 400) / 400;
    if (sp !== this.specShown) {
      this.specShown = sp;
      this.fill.style.transform = `scaleX(${sp})`;
    }
    if (s.lit !== this.litShown) {
      this.litShown = s.lit;
      this.spec.classList.toggle("lit", s.lit);
    }

    // the combo (one banked or lost a moment ago isn't drawn again)
    if (!s.combo) this.spent = null;
    const c = s.combo && s.combo.names.length > 0 && keyOf(s.combo) !== this.spent ? s.combo : null;
    if (this.spent && s.combo && keyOf(s.combo) !== this.spent) this.spent = null;
    this.last = c;
    if (!!c !== this.comboOn) {
      this.comboOn = !!c;
      this.low.classList.toggle("on", !!c);
      if (!c) this.clear();
    }
    if (c) {
      this.names(c.names);
      if (c.base !== this.baseShown) {
        this.baseShown = c.base;
        this.ptsBase.textContent = fmt(c.base);
      }
      if (c.mult !== this.multShown) {
        const up = c.mult > this.multShown && this.multShown > 0;
        this.multShown = c.mult;
        this.ptsMult.textContent = String(c.mult);
        if (up)
          this.play(this.pts, [{ transform: "scale(1.28) rotate(-2deg)" }, { transform: "none" }], 180, "ease-out");
      }
    }
    const fk = s.fakie ? (s.stance ?? "FAKIE") : "";
    if (fk !== this.fkShown) {
      this.fkShown = fk;
      this.fk.classList.toggle("on", !!fk);
      if (fk) this.fk.textContent = fk;
    }

    // the balance: the needle where it leans, red past 0.7
    const kind = s.bal?.kind ?? "";
    if (kind !== this.balKind) {
      this.balKind = kind;
      this.arc.classList.toggle("on", kind === "grind");
      this.man.classList.toggle("on", kind === "manual" || kind === "lip");
      if (kind === "manual" || kind === "lip") this.manLab.textContent = kind === "lip" ? "LIP" : "MANUAL";
      this.balShown = 99;
    }
    if (s.bal) {
      const v = Math.round(Math.max(-1, Math.min(1, s.bal.v)) * 500) / 500;
      if (v !== this.balShown) {
        this.balShown = v;
        if (kind === "grind") this.arcNd.style.transform = `rotate(${(v * 58).toFixed(2)}deg)`;
        else this.manRail.style.transform = `translateY(${(-v * 44).toFixed(2)}%)`;
      }
      const hot = Math.abs(v) > 0.7;
      if (hot !== this.hotShown) {
        this.hotShown = hot;
        this.arc.classList.toggle("hot", hot);
        this.man.classList.toggle("hot", hot);
      }
    } else if (this.hotShown) {
      this.hotShown = false;
      this.arc.classList.remove("hot");
      this.man.classList.remove("hot");
    }
  }

  /** A combo banked: the pot stamps "+1,234" where the string was and flies into the score, which counts up to it. */
  landed(score: number) {
    const from = this.sw.getBoundingClientRect();
    const g = this.ghost(from);
    if (g) {
      this.play(
        g,
        this.rm
          ? [{ opacity: 1 }, { opacity: 0 }]
          : [
              { opacity: 1, transform: "none" },
              { opacity: 0, transform: "translateY(-22px) scale(1.06)" },
            ],
        260,
        "ease-in",
        () => g.remove(),
      );
    }
    this.retire();
    const st = div("skh-stamp ol", this.root, `+${fmt(score)}`);
    const at = this.at(from, st);
    const to = this.num.getBoundingClientRect();
    const r = st.getBoundingClientRect();
    const dx = to.left + to.width / 2 - (at.x + r.width / 2);
    const dy = to.top + to.height / 2 - (at.y + r.height / 2);
    const flies = !this.off && !this.rm && this.ready;
    const p = `translate(${at.x}px,${at.y}px)`;
    st.style.transform = p;
    this.play(
      st,
      this.rm
        ? [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }]
        : [
            { transform: `${p} scale(2.6) rotate(-9deg)`, opacity: 0 },
            { transform: `${p} scale(.92) rotate(-3deg)`, opacity: 1, offset: 0.12 },
            { transform: `${p} scale(1) rotate(-3deg)`, opacity: 1, offset: 0.2 },
            { transform: `${p} scale(1.04) rotate(-3deg)`, opacity: 1, offset: 0.66 },
            flies
              ? { transform: `translate(${at.x + dx}px,${at.y + dy}px) scale(.38) rotate(0deg)`, opacity: 0.2 }
              : { transform: `translate(${at.x}px,${at.y - 30}px) scale(1) rotate(-3deg)`, opacity: 0 },
          ],
      this.rm ? 900 : 980,
      "linear",
      () => st.remove(),
    );
    // (the score holds till the pot's there, then counts — see score(); a count already due waits for it too)
    this.holdUntil = performance.now() + (this.rm ? 0 : 900);
    if (this.disp >= 0 && this.countTo !== this.disp) {
      this.countFrom = this.disp;
      this.countAt = Math.max(this.countAt, this.holdUntil);
    }
  }

  /** A combo lost: the string struck through in red, shaken, dropped; the points it had stamped out. */
  bailed(score: number) {
    const from = this.sw.getBoundingClientRect();
    const g = this.ghost(from);
    if (g) {
      g.classList.add("bail");
      const strike = div("strike", g);
      this.play(
        strike,
        [{ transform: "rotate(-3deg) scaleX(0)" }, { transform: "rotate(-3deg) scaleX(1)" }],
        this.rm ? 1 : 170,
        "ease-out",
      );
      strike.style.transform = "rotate(-3deg) scaleX(1)";
      this.play(
        g,
        this.rm
          ? [{ opacity: 1 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }]
          : [
              { transform: "none", opacity: 1 },
              { transform: "translateX(-10px) rotate(-1.5deg)", offset: 0.12 },
              { transform: "translateX(9px) rotate(1.5deg)", offset: 0.22 },
              { transform: "translateX(-7px) rotate(-1deg)", offset: 0.32 },
              { transform: "translateX(5px) rotate(.8deg)", offset: 0.42 },
              { transform: "none", opacity: 1, offset: 0.6 },
              { transform: "translateY(46px) rotate(5deg)", opacity: 0 },
            ],
        1300,
        "ease-in",
        () => g.remove(),
      );
    }
    this.retire();
    const st = div("skh-stamp lost", this.root, score > 0 ? `BAILED  −${fmt(score)}` : "BAILED");
    const at = this.at(from, st);
    const p = `translate(${at.x}px,${at.y - (from.height > 0 ? from.height * 0.5 : 0)}px)`;
    st.style.transform = `${p} rotate(-7deg)`;
    this.play(
      st,
      this.rm
        ? [{ opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }]
        : [
            { transform: `${p} scale(2.2) rotate(4deg)`, opacity: 0 },
            { transform: `${p} scale(.95) rotate(-7deg)`, opacity: 1, offset: 0.1 },
            { transform: `${p} scale(1) rotate(-7deg)`, opacity: 1, offset: 0.8 },
            { transform: `${p} scale(1) rotate(-7deg)`, opacity: 0 },
          ],
      1400,
      "ease-out",
      () => st.remove(),
    );
  }

  /** A gap's name pops on tape ("HALL HIP TRANSFER +250"). */
  gap(name: string, pts: number) {
    const el = div("skh-gap", this.mid);
    div("nm", el, name);
    const p = document.createElement("i");
    p.className = "pp ol";
    p.textContent = `+${fmt(pts)}`;
    el.appendChild(p);
    this.pop(el, 2000);
  }

  /** A short message, typed on masking tape (shown off the board too). */
  note(text: string) {
    this.pop(div("skh-note", this.mid, text), 2400);
  }

  /** Off the board: the score, the string and the meters hidden (what's flying finishes; notes still show). */
  hidden(on: boolean) {
    if (on === this.off) return;
    this.off = on;
    this.root.classList.toggle("off", on);
    if (on) this.disp = -1; // (back on: the score as it is, no count)
  }

  dispose() {
    this.root.remove();
  }

  // ── bits ────────────────────────────────────────────────────────────────────

  private motion() {
    const rm = prefs().reducedMotion;
    if (rm !== this.rm) {
      this.rm = rm;
      this.root.classList.toggle("rm", rm);
    }
  }

  private score(score: number, now: number) {
    if (this.disp < 0 || score < this.disp) {
      this.disp = this.countFrom = this.countTo = score;
    } else if (score !== this.countTo) {
      this.countFrom = this.disp;
      this.countTo = score;
      this.countAt = Math.max(now, this.holdUntil);
    }
    if (this.disp !== this.countTo && now >= this.countAt) {
      const k = this.rm ? 1 : Math.min(1, (now - this.countAt) / 450);
      if (this.disp === this.countFrom && k > 0 && !this.rm)
        this.play(
          this.card,
          [{ transform: "rotate(-2deg) scale(1.14)" }, { transform: "rotate(-2deg)" }],
          220,
          "ease-out",
        );
      this.disp = k >= 1 ? this.countTo : this.countFrom + (this.countTo - this.countFrom) * (1 - (1 - k) ** 3);
    }
    const n = Math.round(this.disp);
    if (n !== this.numShown) {
      this.numShown = n;
      this.num.textContent = fmt(n);
    }
  }

  private newBest() {
    this.bestEl.classList.add("new");
    this.play(
      this.bestEl,
      [{ transform: "rotate(1.5deg) scale(1.25)" }, { transform: "rotate(1.5deg)" }],
      300,
      "ease-out",
    );
    setTimeout(() => this.bestEl.classList.remove("new"), 1600);
  }

  /** The trick string, grown in place: new tricks appended (and popped), a changed one rewritten. */
  private names(all: string[]) {
    const want = all.length > MAX_NAMES ? ["…", ...all.slice(-(MAX_NAMES - 1))] : all;
    const had = this.items;
    let p = 0;
    while (p < had.length && p < want.length && had[p] === want[p]) p++;
    if (p === had.length && p === want.length) return;
    const grew = Math.max(0, all.length - this.allLen);
    this.allLen = all.length;
    const kids = this.str.children;
    // a rewritten last one (a spin's count going up) without a pop: change it in place
    if (want.length === had.length && p === want.length - 1) {
      const b = kids[p]?.querySelector("b");
      if (b) b.textContent = want[p];
      this.items = want;
      const r = tilt(all.length - want.length + p);
      if (b)
        this.play(b, [{ transform: `rotate(${r}deg) scale(1.12)` }, { transform: `rotate(${r}deg)` }], 120, "ease-out");
      return;
    }
    while (kids.length > p) kids[kids.length - 1].remove();
    for (let i = p; i < want.length; i++) {
      const it = document.createElement("span");
      it.className = "skh-it";
      if (i > 0) {
        const pl = document.createElement("i");
        pl.className = "pl";
        pl.textContent = "+";
        it.appendChild(pl);
      }
      const b = document.createElement("b");
      b.textContent = want[i];
      // (the colour by the trick's place in the combo, not its index on screen, so a cut string keeps its colours)
      const n = all.length - want.length + i;
      b.style.background = PAPER(PAPERS[n % PAPERS.length]);
      b.style.transform = `rotate(${tilt(n)}deg)`;
      it.appendChild(b);
      this.str.appendChild(it);
      if (i >= want.length - grew && want[i] !== "…")
        this.play(
          b,
          [
            { transform: `rotate(${tilt(n) - 14}deg) scale(1.9)`, opacity: 0 },
            { transform: `rotate(${tilt(n) + 2}deg) scale(.94)`, opacity: 1, offset: 0.6 },
            { transform: `rotate(${tilt(n)}deg)`, opacity: 1 },
          ],
          200,
          "ease-out",
        );
    }
    const k = want.length <= 4 ? 1 : want.length <= 8 ? 0.86 : 0.74;
    this.str.style.setProperty("--k", String(k));
    if (grew > 0 && had.length > 0)
      this.play(this.str, [{ transform: "scale(1.07)" }, { transform: "none" }], 160, "ease-out");
    this.items = want;
  }

  private clear() {
    this.str.replaceChildren();
    this.items = [];
    this.allLen = 0;
    this.baseShown = -1;
    this.multShown = -1;
  }

  /** The combo just ended: gone from the live string, and not drawn again though it's passed a frame longer. */
  private retire() {
    if (this.last) this.spent = keyOf(this.last);
    this.last = null;
    this.comboOn = false;
    this.low.classList.remove("on");
    this.clear();
  }

  /** A copy of the string where it stands, to fly or fall on its own. */
  private ghost(r: DOMRect): HTMLElement | null {
    if (!this.comboOn || r.width < 1 || this.off) return null;
    const g = this.sw.cloneNode(true) as HTMLElement;
    g.classList.add("skh-gh");
    g.style.left = `${r.left}px`;
    g.style.top = `${r.top}px`;
    g.style.width = `${r.width}px`;
    this.root.appendChild(g);
    return g;
  }

  /** Where a stamp's top-left goes to sit centred on the string (or where it would be). */
  private at(r: DOMRect, st: HTMLElement): { x: number; y: number } {
    const s = st.getBoundingClientRect();
    const cx = r.width > 0 ? r.left + r.width / 2 : window.innerWidth / 2;
    const cy = r.width > 0 ? r.top + r.height / 2 : window.innerHeight - Math.min(160, window.innerHeight * 0.18);
    return { x: Math.round(cx - s.width / 2), y: Math.round(cy - s.height / 2) };
  }

  /** A gap or a note: slammed in on its tape, held, lifted off; three at most. */
  private pop(el: HTMLElement, ms: number) {
    while (this.mid.children.length > 3) this.mid.firstElementChild?.remove();
    this.play(
      el,
      this.rm
        ? [{ opacity: 0 }, { opacity: 1, offset: 0.08 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }]
        : [
            { transform: "translateX(-60px) skewX(-18deg) scale(1.3)", opacity: 0 },
            { transform: "translateX(6px) skewX(4deg) scale(.97)", opacity: 1, offset: 0.06 },
            { transform: "none", opacity: 1, offset: 0.1 },
            { transform: "none", opacity: 1, offset: 0.86 },
            { transform: "translateY(-16px)", opacity: 0 },
          ],
      ms,
      "ease-out",
      () => el.remove(),
    );
  }

  /** A one-shot (the Web Animations API: on the compositor, gone when done); reduced motion: only what's asked. */
  private play(el: HTMLElement, kf: Keyframe[], ms: number, easing: string, done?: () => void) {
    if (typeof el.animate !== "function") {
      if (done) setTimeout(done, ms);
      return;
    }
    const moves = kf.some((k) => k.transform !== undefined);
    if (this.rm && moves && !done) return;
    const a = el.animate(kf, { duration: ms, easing });
    if (done) {
      a.onfinish = done;
      a.oncancel = done;
    }
  }
}

function keyOf(c: NonNullable<SkateHudState["combo"]>): string {
  return `${c.names.join("|")}#${c.base}x${c.mult}`;
}

function tilt(n: number): number {
  return TILT[n % TILT.length];
}
