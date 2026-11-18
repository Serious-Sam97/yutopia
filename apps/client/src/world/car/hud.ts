// The car's own HUD (docs/plan/94-the-car-takes-a-beating.md P10, fork F8: A, walnut — design/car-ui/a-walnut.png):
//   - a walnut plate low on the left: km/h big in the book face, the gear in its box (AUTO or MANUAL), the revs with
//     their red, the fuel and the engine's warmth; chips under it — the radio, the window, chains, locked, a flat,
//     the engine dead, on fire (not in the cockpit: the dash's own cluster says it there);
//   - over it, the car at a glance (shown once it's taken any): its sides dented by how much, the lamps, the glass
//     cracked or gone, a flat, a door off, the steam, the smoke, the fire; burnt out, all of it black;
//   - the keys on a paper slip up on the right: a while after getting in, and again on F1;
//   - what to do now (at a pump, filling, stuck, fuel low, the pets coming) in a pill of the HUD's own;
//   - on a phone: smaller, no keys (the wheel and the pedals are on the screen).
// Plain DOM over the 3D view; car/cars.ts says what's so each frame (`update`), and nothing's written that hasn't
// changed.
import { DOOR_GONE, PANE_CRACK, PANE_GONE, PART, WRECK } from "@yutopia/shared/car";

export interface HudDamage {
  zones: readonly number[];
  parts: number;
  wreck: number;
  fire: number;
}
export interface HudView {
  /** nothing at all (down, or not in a car) */
  hidden: boolean;
  /** the plate (not in the cockpit: the dash's own) */
  plate: boolean;
  kmh: number;
  /** "R", "N", "1"…; "" none (a toboggan) */
  gear: string;
  manual: boolean;
  /** the revs, 0..1 of the top of the scale; where its red starts */
  rev: number;
  red: number;
  /** 0..1; null: none (a toboggan) */
  fuel: number | null;
  /** the engine: its words, how warm (0..1), and whether that's bad; null: not shown (a passenger) */
  engine: { say: string; k: number; bad: boolean } | null;
  chips: { say: string; warn?: boolean }[];
  dmg: HudDamage;
  note: string;
  /** the keys' slip: its rows of [keys…, what], shown or not */
  keys: { rows: [string[], string][]; foot: string; shown: boolean };
  /** the damage card's word */
  damageWord: string;
  touch: boolean;
}

const CSS = `
.carhud { position:absolute; inset:0; pointer-events:none; z-index:4; }
.carhud .left { position:absolute; left:24px; bottom:76px; display:flex; flex-direction:column; align-items:flex-start; gap:10px; }
.carhud .plate { width:300px; }
.carhud .plate .in { padding:12px 14px; display:grid; grid-template-columns:1fr auto; column-gap:12px; row-gap:9px; }
.carhud .speed { font:600 54px/0.9 var(--font-title); color:var(--cream); letter-spacing:-1px; font-variant-numeric:lining-nums tabular-nums; }
.carhud .speed small { font:13px var(--font-mono); color:var(--cream-dim); letter-spacing:1px; margin-left:6px; }
.carhud .gearbox { grid-row:1 / 3; grid-column:2; width:78px; border:1px solid var(--edge-strong); border-radius:6px; display:grid; place-items:center; padding:6px 0 4px; background:var(--pit-2); }
.carhud .gearbox span { font:700 44px/1 var(--font-title); color:var(--amber); font-variant-numeric:lining-nums; }
.carhud .gearbox em { font:10px var(--font-mono); color:var(--cream-dim); font-style:normal; letter-spacing:1px; }
.carhud .rev { height:8px; border-radius:4px; background:var(--track); overflow:hidden; position:relative; }
.carhud .rev i { position:absolute; left:0; top:0; bottom:0; background:linear-gradient(90deg, var(--edge-hover), var(--amber)); }
.carhud .rev b { position:absolute; top:0; bottom:0; right:0; background:rgba(200,85,63,.4); }
.carhud .rev.hot i { background:linear-gradient(90deg, var(--edge-hover), var(--rust)); }
.carhud .bars { grid-column:1 / 3; display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.carhud .row { font:11px var(--font-mono); color:var(--cream-dim); letter-spacing:1px; display:flex; gap:8px; margin-bottom:4px; }
.carhud .row span { color:var(--cream); }
.carhud .bar { height:6px; border-radius:3px; background:var(--track); position:relative; overflow:hidden; }
.carhud .bar i { position:absolute; left:0; top:0; bottom:0; background:var(--amber); }
.carhud .bar.low i { background:var(--rust); }
.carhud .bar.eng i { background:var(--olive); }
.carhud .bar.eng.bad i { background:var(--rust); }
.carhud .chips { grid-column:1 / 3; display:flex; gap:6px; flex-wrap:wrap; }
.carhud .chips:empty { display:none; }
.carhud .chip { font:11px var(--font-mono); letter-spacing:.5px; padding:3px 8px; border-radius:999px; border:1px solid var(--edge-strong); color:var(--cream); background:var(--panel-2); }
.carhud .chip.warn { border-color:var(--edge-warn); color:#f0b49a; }
.carhud .dmgcard { width:112px; }
.carhud .dmgcard .in { padding:8px; text-align:center; }
.carhud .dmgcard .word { font:10px var(--font-mono); color:var(--cream-dim); letter-spacing:1px; margin-top:4px; }
.carhud .dmgcard .in { background:var(--panel); border-radius:3px; }
.carhud .keys { position:absolute; right:24px; top:110px; width:236px; transition:opacity .6s; }
.carhud .keys .slip { padding:10px 12px; font:12px/1.75 var(--font-mono); }
.carhud .keys b { display:inline-grid; place-items:center; min-width:18px; height:17px; padding:0 3px; margin-right:3px; border:1px solid var(--edge-strong); border-radius:3px; font-weight:400; line-height:1; }
.carhud .keys .foot { color:var(--edge-strong); }
.carhud .note { position:absolute; left:50%; bottom:172px; transform:translateX(-50%); padding:7px 16px; border-radius:999px; background:var(--panel); border:1px solid var(--edge-cabinet); box-shadow:0 8px 22px rgba(0,0,0,.45); font:15px var(--font-mono); color:var(--amber); white-space:nowrap; }
.carhud.touch .left { left:10px; bottom:auto; top:84px; flex-direction:row; transform:scale(.6); transform-origin:top left; }
.carhud.touch .keys { display:none; }
.carhud.touch .note { bottom:auto; top:64px; font-size:13px; }
@media (max-width: 760px) {
  .carhud .left { transform:scale(.8); transform-origin:bottom left; left:10px; }
  .carhud .keys { transform:scale(.85); transform-origin:top right; right:10px; }
}
`;

let styled = false;

export class CarHud {
  readonly el: HTMLDivElement;
  private q: Record<string, HTMLElement> = {};
  private was: Record<string, string> = {};
  /** (plan 98 phase 26) the plate's words, in the player's language (they were English only) */
  private words: { kmh: string; fuel: string; engine: string; auto: string; manual: string };
  constructor(
    host: HTMLElement,
    words: { kmh: string; fuel: string; engine: string; auto: string; manual: string } = {
      kmh: "KM/H",
      fuel: "FUEL",
      engine: "ENGINE",
      auto: "AUTO",
      manual: "MANUAL",
    },
  ) {
    this.words = words;
    if (!styled) {
      styled = true;
      const st = document.createElement("style");
      st.dataset.carhud = "";
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    const d = document.createElement("div");
    d.className = "carhud";
    d.innerHTML = `
      <div class="left">
        <div class="cabinet dmgcard" data-q="card"><div class="in"><div data-q="car"></div><div class="word" data-q="word"></div></div></div>
        <div class="cabinet plate" data-q="plate"><div class="in">
          <div class="speed"><span data-q="kmh">0</span><small>${words.kmh}</small></div>
          <div class="gearbox" data-q="gearbox"><span data-q="gear">N</span><em data-q="mode">${words.auto}</em></div>
          <div class="rev" data-q="revbar"><b data-q="red"></b><i data-q="rev"></i></div>
          <div class="bars">
            <div data-q="fuelbox"><div class="row">${words.fuel}<span data-q="fueln"></span></div><div class="bar" data-q="fuelbar"><i data-q="fuel"></i></div></div>
            <div data-q="engbox"><div class="row">${words.engine}<span data-q="engn"></span></div><div class="bar eng" data-q="engbar"><i data-q="eng"></i></div></div>
          </div>
          <div class="chips" data-q="chips"></div>
        </div></div>
      </div>
      <div class="cabinet keys" data-q="keys"><div class="faceplate slip" data-q="slip"></div></div>
      <div class="note" data-q="note"></div>`;
    for (const e of d.querySelectorAll<HTMLElement>("[data-q]")) this.q[e.dataset.q as string] = e;
    host.appendChild(d);
    this.el = d;
  }
  /** Only what's changed written. */
  private set(key: string, v: string, write: (s: string) => void) {
    if (this.was[key] === v) return;
    this.was[key] = v;
    write(v);
  }
  private show(key: string, on: boolean) {
    this.set(`show:${key}`, on ? "1" : "0", () => {
      this.q[key].style.display = on ? "" : "none";
    });
  }
  update(v: HudView) {
    const q = this.q;
    this.set("hidden", v.hidden ? "1" : "0", (s) => {
      this.el.style.visibility = s === "1" ? "hidden" : "";
    });
    this.set("touch", v.touch ? "1" : "0", (s) => this.el.classList.toggle("touch", s === "1"));
    if (v.hidden) return;
    // the plate
    this.show("plate", v.plate);
    if (v.plate) {
      this.set("kmh", String(Math.abs(Math.round(v.kmh))), (s) => {
        q.kmh.textContent = s;
      });
      this.show("gearbox", !!v.gear);
      this.set("gear", v.gear, (s) => {
        q.gear.textContent = s;
      });
      this.set("mode", v.manual ? this.words.manual : this.words.auto, (s) => {
        q.mode.textContent = s;
      });
      this.show("revbar", !!v.gear);
      this.set("rev", (Math.round(Math.max(0, Math.min(1, v.rev)) * 50) / 50).toFixed(2), (s) => {
        q.rev.style.width = `${Number(s) * 100}%`;
      });
      this.set("hot", v.rev >= v.red ? "1" : "0", (s) => q.revbar.classList.toggle("hot", s === "1"));
      this.set("red", v.red.toFixed(2), (s) => {
        q.red.style.left = `${Number(s) * 100}%`;
      });
      this.show("fuelbox", v.fuel !== null);
      if (v.fuel !== null) {
        const pct = Math.round(v.fuel * 100);
        this.set("fuel", String(pct), (s) => {
          q.fueln.textContent = `${s} %`;
          q.fuel.style.width = `${s}%`;
          q.fuelbar.classList.toggle("low", Number(s) < 15);
        });
      }
      this.show("engbox", !!v.engine);
      if (v.engine) {
        const e = v.engine;
        this.set("eng", `${e.say}|${Math.round(e.k * 20)}|${e.bad}`, () => {
          q.engn.textContent = e.say;
          q.eng.style.width = `${Math.round(e.k * 100)}%`;
          q.engbar.classList.toggle("bad", e.bad);
        });
      }
      this.set("chips", v.chips.map((c) => `${c.warn ? "!" : ""}${c.say}`).join("|"), () => {
        q.chips.innerHTML = "";
        for (const c of v.chips) {
          const s = document.createElement("span");
          s.className = c.warn ? "chip warn" : "chip";
          s.textContent = c.say;
          q.chips.appendChild(s);
        }
      });
    }
    // the car at a glance: once it's taken any
    const d = v.dmg;
    const any = d.zones.some((z) => z > 0.04) || !!d.parts || !!d.wreck || !!d.fire;
    this.show("card", any);
    if (any)
      this.set("car", `${d.zones.map((z) => Math.round(z * 10)).join(",")}|${d.parts}|${d.wreck}|${d.fire}`, () => {
        q.car.innerHTML = outline(d);
      });
    this.set("word", v.damageWord, (s) => {
      q.word.textContent = s;
    });
    // the keys
    this.set("keysrows", JSON.stringify(v.keys.rows) + v.keys.foot, () => {
      const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string);
      q.slip.innerHTML =
        v.keys.rows.map(([ks, what]) => `${ks.map((k) => `<b>${esc(k)}</b>`).join("")}${esc(what)}`).join("<br />") +
        `<br /><span class="foot">${esc(v.keys.foot)}</span>`;
    });
    this.set("keysshown", v.keys.shown ? "1" : "0", (s) => {
      q.keys.style.opacity = s === "1" ? "1" : "0";
    });
    // what to do now
    this.show("note", !!v.note);
    this.set("note", v.note, (s) => {
      q.note.textContent = s;
    });
  }
  dispose() {
    this.el.remove();
  }
}

// ── the car from above, as it is (72 × 120: its nose up) ──
const C = {
  body: "#2b2a26",
  edge: "#6b5d48",
  glass: "#1d1e24",
  glassEdge: "#a7a094",
  ok: "#a7a094",
  bad: "#c8553f",
  cream: "#ece6da",
};
/** A zone's paint by how dented: the body's own, to rust. */
function dent(z: number): string {
  const k = Math.max(0, Math.min(1, z));
  const a = [0x2b, 0x2a, 0x26];
  const b = [0x8a, 0x4a, 0x2a];
  return `rgb(${a.map((x, i) => Math.round(x + (b[i] - x) * k)).join(",")})`;
}
function outline(d: HudDamage): string {
  const burnt = d.fire >= 3;
  const z = d.zones;
  const out: string[] = [];
  const r = (x: number, y: number, w: number, h: number, fill: string, extra = "") =>
    out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(3, w / 2)}" fill="${fill}" ${extra}/>`);
  // the body; its sides, nose, tail, roof shaded by their dents
  out.push(`<rect x="12" y="8" width="48" height="104" rx="14" fill="${burnt ? "#111" : C.body}" stroke="${C.edge}"/>`);
  if (!burnt) {
    if (z[0] > 0.04)
      out.push(`<path d="M12 30 v-8 a14 14 0 0 1 14 -14 h20 a14 14 0 0 1 14 14 v8 z" fill="${dent(z[0])}"/>`);
    if (z[1] > 0.04)
      out.push(`<path d="M12 90 v8 a14 14 0 0 0 14 14 h20 a14 14 0 0 0 14 -14 v-8 z" fill="${dent(z[1])}"/>`);
    if (z[2] > 0.04) r(12, 32, 6, 56, dent(z[2]));
    if (z[3] > 0.04) r(54, 32, 6, 56, dent(z[3]));
    if ((z[4] ?? 0) > 0.04) r(22, 54, 28, 22, dent(z[4]));
  }
  // the glass: whole, cracked (dashed), gone (just its frame, red)
  const pane = (i: number, x: number, y: number, w: number, h: number) => {
    const gone = !!(d.parts & PANE_GONE[i]);
    const cracked = !!(d.parts & PANE_CRACK[i]);
    out.push(
      `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2" fill="${gone ? "none" : C.glass}" stroke="${gone ? C.bad : cracked ? C.cream : C.edge}" ${cracked && !gone ? 'stroke-dasharray="3 2"' : ""}/>`,
    );
  };
  pane(0, 18, 34, 36, 15);
  pane(1, 18, 84, 36, 11);
  pane(2, 14, 50, 4, 14);
  pane(3, 54, 50, 4, 14);
  pane(4, 14, 66, 4, 14);
  pane(5, 54, 66, 4, 14);
  // the wheels: a flat red
  const flats = [PART.flatFL, PART.flatFR, PART.flatRL, PART.flatRR];
  [
    [5, 18],
    [60, 18],
    [5, 86],
    [60, 86],
  ].forEach(([x, y], i) => r(x, y, 7, 16, d.parts & flats[i] || burnt ? C.bad : C.ok));
  // the lamps: out, red
  const lamp = (x: number, y: number, bit: number) =>
    out.push(
      `<circle cx="${x}" cy="${y}" r="2.6" fill="${d.parts & bit ? C.bad : "#f1d79a"}" opacity="${d.parts & bit ? 1 : 0.7}"/>`,
    );
  lamp(20, 11, PART.headL);
  lamp(52, 11, PART.headR);
  lamp(20, 109, PART.tailL);
  lamp(52, 109, PART.tailR);
  // a door off: its side open (a gap in the outline)
  const doors: [number, number, number][] = [
    [0, 9, 48],
    [1, 59, 48],
    [2, 9, 66],
    [3, 59, 66],
  ];
  for (const [i, x, y] of doors)
    if (d.wreck & DOOR_GONE[i]) out.push(`<rect x="${x}" y="${y}" width="4" height="16" fill="#17181d"/>`);
  if (d.wreck & WRECK.bonnetGone)
    out.push(
      `<rect x="20" y="13" width="32" height="18" rx="3" fill="#0e0f12" stroke="${C.bad}" stroke-dasharray="2 2"/>`,
    );
  if (d.wreck & WRECK.bootGone)
    out.push(
      `<rect x="20" y="96" width="32" height="12" rx="3" fill="#0e0f12" stroke="${C.bad}" stroke-dasharray="2 2"/>`,
    );
  // the engine: steam, smoke, fire
  if (d.fire === 2)
    out.push(
      `<path d="M36 10 c6 6 8 10 2 16 c2 -6 -3 -7 -4 -3 c-5 -4 -3 -9 2 -13 z" fill="#ff9a3a"/><path d="M36 15 c3 4 3 6 0 9 c-2 -3 -2 -5 0 -9 z" fill="#ffe2a0"/>`,
    );
  else if (d.fire === 1)
    out.push(
      `<circle cx="36" cy="18" r="6" fill="#141210" opacity=".9"/><circle cx="40" cy="12" r="4" fill="#141210" opacity=".8"/>`,
    );
  else if (!burnt && z[0] > 0.8) out.push(`<circle cx="36" cy="20" r="5" fill="${C.cream}" opacity=".7"/>`);
  return `<svg width="72" height="120" viewBox="0 0 72 120" aria-hidden="true">${out.join("")}</svg>`;
}
