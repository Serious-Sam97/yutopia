import type { WorldController } from "../controller";
import type { Walker } from "../input/walker";

// The quiet HUD's rest (docs/plan/30-the-dark.md D9, the mock 02-hud-night):
// health as a dark red vignette, deepening under 60 and beating under 30; the
// cold as frost growing in from the corners as warmth goes; and over the others
// out here, under their names, how far they are and their health.

const TEAM = 60; // tiles: the others' distance and health, this far

// frost: branching hairlines from a corner, the same every time (a seed)
function frostSvg(): string {
  let s = 7;
  const r = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  const lines: string[] = [];
  const branch = (x: number, y: number, a: number, len: number, depth: number) => {
    if (depth > 4 || len < 6) return;
    const x2 = x + Math.cos(a) * len;
    const y2 = y + Math.sin(a) * len;
    lines.push(`M${x.toFixed(1)} ${y.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`);
    const n = 2 + Math.floor(r() * 2);
    for (let i = 0; i < n; i++) branch(x2, y2, a + (r() - 0.5) * 1.6, len * (0.45 + r() * 0.3), depth + 1);
  };
  for (let i = 0; i < 9; i++) branch(0, 0, Math.PI * 0.05 + (i / 9) * Math.PI * 0.4, 40 + r() * 70, 0);
  return `<svg viewBox="0 0 240 240" width="240" height="240"><path d="${lines.join("")}" stroke="rgba(235,245,255,.75)" stroke-width="1.1" fill="none" stroke-linecap="round"/></svg>`;
}

export class VitalsHud {
  private readonly vignette = document.createElement("div");
  private readonly frost = document.createElement("div");
  private readonly tags = new Map<string, HTMLDivElement>();

  constructor(
    private readonly ctl: WorldController,
    private readonly walker: Walker,
    private readonly root: HTMLElement,
  ) {
    this.vignette.className = "dk-vig";
    this.frost.className = "dk-frost";
    const corner = frostSvg();
    this.frost.innerHTML = ["tl", "tr", "bl", "br"].map((c) => `<i class="${c}">${corner}</i>`).join("");
    // (over the world, under the app's own panels — the top bar, the minimap stay readable: right
    // after the canvas's host, which the panels follow)
    if (ctl.host.parentElement) ctl.host.after(this.vignette, this.frost);
    else document.body.append(this.vignette, this.frost);
  }

  dispose(): void {
    this.vignette.remove();
    this.frost.remove();
    for (const el of this.tags.values()) el.remove();
  }

  frame(): void {
    const ctl = this.ctl;
    const room = ctl.room;
    const lp = room?.state.players.get(room.sessionId);
    const out = this.walker.outside;
    // health: from 60 down, the edges dark red; under 30 it beats (the heart's)
    const hp = (lp?.hp as number) ?? 100;
    const hurt = out && !lp?.downAt ? Math.max(0, Math.min(1, (60 - hp) / 60)) : 0;
    this.vignette.style.opacity = String(hurt * 0.9);
    this.vignette.classList.toggle("beat", hp < 30 && hurt > 0);
    // the cold: frost from the corners as warmth goes under 50
    const wm = (lp?.wm as number) ?? 100;
    const cold = out ? Math.max(0, Math.min(1, (50 - wm) / 50)) : 0;
    this.frost.style.opacity = String(cold);
    this.frost.style.setProperty("--k", String(0.6 + 0.4 * cold));

    // the others out here: how far, their health, under their names
    const me = this.walker.where();
    const myUid = lp?.uid as number | undefined;
    const seen = new Set<string>();
    if (out)
      room?.state.players.forEach(
        (p: { sid: string; uid: number; x: number; y: number; z: number; level: number; hp: number; bot: boolean }) => {
          // (not me — nor another tab of mine)
          if (p.sid === room.sessionId || p.uid === myUid || p.level !== 0 || p.bot) return;
          const d = Math.hypot(p.x - me.x, p.y - me.y);
          if (d > TEAM || !ctl.grid.onLand(p.x, p.y)) return;
          // (out of every light in the dark, unseen: no tag over them either — docs/plan/44 N4)
          if (ctl.tp?.isUnseen(p.sid)) return;
          seen.add(p.sid);
          let el = this.tags.get(p.sid);
          if (!el) {
            el = document.createElement("div");
            el.className = "abs dk-team";
            this.root.append(el);
            this.tags.set(p.sid, el);
          }
          const c = ctl.clientAt(p.x, p.y, (p.z + 1.95) * 39.19);
          const r = ctl.hostRect();
          el.style.left = `${c.x + r.left}px`;
          el.style.top = `${c.y + r.top}px`;
          const low = p.hp < 30;
          el.innerHTML = `<span>${Math.round(d)} m</span><b><i style="width:${p.hp}%;background:${low ? "#d9534f" : "#e9ecef"}"></i></b>`;
        },
      );
    for (const [sid, el] of this.tags)
      if (!seen.has(sid)) {
        el.remove();
        this.tags.delete(sid);
      }
  }
}

export const VITALS_CSS = `
.dk-vig{position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(ellipse at center,rgba(80,0,0,0) 45%,rgba(110,8,8,.75) 100%);transition:opacity .4s}
.dk-vig.beat{animation:dkbeat .86s ease-in-out infinite}
@keyframes dkbeat{0%,100%{filter:brightness(1)}12%{filter:brightness(1.5)}24%{filter:brightness(1)}36%{filter:brightness(1.3)}}
.dk-frost{position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity 1.5s;background:radial-gradient(ellipse at center,rgba(220,235,255,0) 55%,rgba(220,235,255,.22) 100%)}
.dk-frost i{position:absolute;width:240px;height:240px;transform-origin:0 0}
.dk-frost i svg{transform:scale(var(--k,1));transform-origin:0 0}
.dk-frost .tl{left:0;top:0}
.dk-frost .tr{right:0;top:0;transform:scaleX(-1);transform-origin:center}
.dk-frost .bl{left:0;bottom:0;transform:scaleY(-1);transform-origin:center}
.dk-frost .br{right:0;bottom:0;transform:scale(-1,-1);transform-origin:center}
.dk-team{transform:translate(-50%,0);display:flex;flex-direction:column;align-items:center;gap:2px;font-size:10px;color:rgba(233,236,239,.85);text-shadow:0 1px 2px #000}
.dk-team b{display:block;width:26px;height:3px;background:rgba(255,255,255,.2);border-radius:2px;overflow:hidden}
.dk-team b i{display:block;height:100%}
`;
