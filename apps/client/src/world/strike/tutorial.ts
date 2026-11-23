// The Strike Park's guided run (docs/plan/115-the-strike-park-again.md, phase 19): the first time in a match, a short
// checklist at the screen's left, each line ticked by doing it — move, stop dead (counter-strafe), crouch, switch guns,
// buy, hit someone, throw a grenade (ticked from the match's own state, not keys); on a bomb map, plant and defuse too. Skippable from the match menu, started again
// from it; remembered once done (or skipped) on this browser.

const KEY = "yutopia:strike-tutorial";

export type TutStep = "move" | "stop" | "crouch" | "switch" | "buy" | "hit" | "nade" | "plant" | "defuse";

const LINES: { id: TutStep; text: string; how: string; bomb?: boolean }[] = [
  { id: "move", text: "Move", how: "WASD — walk 10 m" },
  { id: "stop", text: "Stop dead", how: "run, then let go (or tap the other way): still is accurate" },
  { id: "crouch", text: "Crouch", how: "C or Ctrl — steadier, quieter" },
  { id: "switch", text: "Switch guns", how: "1 rifle · 2 pistol · 3 knife (left slashes, right stabs)" },
  { id: "buy", text: "Buy", how: "B in the buy zone, at the round's start" },
  { id: "hit", text: "Land a hit", how: "a bot, or the lobby range's targets" },
  { id: "nade", text: "Throw a grenade", how: "4 (or N) to take it, click to throw (right click lobs it)" },
  { id: "plant", text: "Plant the charge", how: "Raiders: 5 takes it out, on a site hold the left button", bomb: true },
  { id: "defuse", text: "Defuse", how: "Wardens, at the charge: hold E", bomb: true },
];

function load(): "done" | "" {
  try {
    return localStorage.getItem(KEY) === "done" ? "done" : "";
  } catch {
    return "";
  }
}
function save() {
  try {
    localStorage.setItem(KEY, "done");
  } catch {}
}

export class Tutorial {
  on = false;
  private got = new Set<TutStep>();
  private walked = 0;
  private last: { x: number; z: number; t: number } | null = null;
  private fast = 0;
  private money = -1;
  private nades = -1;
  private gun: string | null = null;
  private el: HTMLDivElement | null = null;
  private drawn = "";
  private doneAt = 0;
  private off: () => void;

  constructor(private toast: (s: string) => void) {
    // (the match menu's buttons: start it again, skip it)
    const ev = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d === "start") this.start();
      else if (d === "skip") this.skip();
    };
    addEventListener("strike:tutorial", ev);
    this.off = () => removeEventListener("strike:tutorial", ev);
  }

  /** On joining a match: shown if it's never been done here. */
  joined() {
    if (!this.on && load() !== "done") this.start();
  }
  start() {
    this.on = true;
    this.got.clear();
    this.walked = 0;
    this.last = null;
    this.money = this.nades = -1;
    this.gun = null;
    this.doneAt = 0;
    this.drawn = "";
  }
  skip() {
    this.on = false;
    save();
    this.el?.remove();
    this.el = null;
  }

  tick(s: TutStep) {
    if (!this.on || this.got.has(s)) return;
    this.got.add(s);
  }

  /** Each frame in the match: where I am (world x, z), my money and grenades (the member's), whether the map has sites. */
  frame(
    x: number,
    z: number,
    money: number,
    nades: string,
    bomb: boolean,
    gun: string,
    crouch: boolean,
    parent: HTMLElement,
  ) {
    if (!this.on) return;
    const now = performance.now();
    // (the gun in hand changed: switched; crouched: the match's own flag)
    if (this.gun !== null && gun !== this.gun) this.tick("switch");
    this.gun = gun;
    if (crouch) this.tick("crouch");
    if (this.last) {
      const d = Math.hypot(x - this.last.x, z - this.last.z);
      const dt = Math.max(1e-3, (now - this.last.t) / 1000);
      const v = d / dt;
      if (d < 3) this.walked += d;
      if (this.walked >= 10) this.tick("move");
      // (counter-strafe: from a run to still inside a quarter second)
      if (v > 4) this.fast = now;
      else if (v < 0.4 && this.fast && now - this.fast < 250) this.tick("stop");
    }
    this.last = { x, z, t: now };
    if (this.money >= 0 && money < this.money) this.tick("buy");
    this.money = money;
    const n = nades ? nades.split(",").filter(Boolean).length : 0;
    if (this.nades >= 0 && n < this.nades) this.tick("nade");
    this.nades = n;

    const core = LINES.filter((l) => !l.bomb);
    const need = LINES.filter((l) => !l.bomb || bomb);
    const done = need.every((l) => this.got.has(l.id)) || (core.every((l) => this.got.has(l.id)) && !bomb);
    if (done && !this.doneAt) {
      this.doneAt = now;
      this.toast("Tutorial done — that's the game. Good luck out there.");
      save();
    }
    if (this.doneAt && now - this.doneAt > 4000) {
      this.on = false;
      this.el?.remove();
      this.el = null;
      return;
    }
    const key = need.map((l) => (this.got.has(l.id) ? "1" : "0")).join("") + (bomb ? "b" : "");
    if (!this.el) {
      this.el = document.createElement("div");
      this.el.style.cssText =
        "position:fixed;left:18px;top:50%;transform:translateY(-50%);width:270px;padding:12px 14px;background:rgba(14,16,18,.82);border:1px solid rgba(233,220,192,.18);border-left:3px solid #e8a33a;border-radius:3px;color:#e9dcc0;font:500 13px 'Avenir Next',sans-serif;pointer-events:none;z-index:6";
      parent.appendChild(this.el);
      this.drawn = "";
    }
    if (this.el.parentElement !== parent) parent.appendChild(this.el);
    if (key === this.drawn) return;
    this.drawn = key;
    const rows = need
      .map((l) => {
        const ok = this.got.has(l.id);
        return `<div style="display:flex;gap:8px;margin:6px 0;opacity:${ok ? 0.55 : 1}"><span style="width:14px;color:${ok ? "#8fbf6a" : "#e8a33a"}">${ok ? "✓" : "○"}</span><div><div style="font-weight:700;${ok ? "text-decoration:line-through" : ""}">${l.text}</div><div style="font-size:11px;opacity:.7">${l.how}</div></div></div>`;
      })
      .join("");
    this.el.innerHTML = `<div style="font:800 12px 'Avenir Next Condensed',sans-serif;letter-spacing:.14em;color:#e8a33a">FIRST MATCH · ${need.filter((l) => this.got.has(l.id)).length}/${need.length}</div>${rows}<div style="font-size:11px;opacity:.55;margin-top:6px">Esc → skip the tutorial</div>`;
  }

  /** Hidden while a menu's open or I'm out of the match (kept, not reset). */
  hide() {
    if (this.el) this.el.style.display = "none";
  }
  show() {
    if (this.el) this.el.style.display = "";
  }

  dispose() {
    this.off();
    this.el?.remove();
    this.el = null;
  }
}
