// A map's radar (docs/plan/114–115): its pieces from above, the sites, the hostages, the buy zones — drawn on a
// canvas. Kept apart (no three.js): the menus' map cards draw it too (components/hud/StrikePanels.tsx).

import { climateOf, type StrikeMap } from "@yutopia/shared/strike";
import { canvasFont } from "./look";

/** A map's radar: its pieces from above, the sites, the spawns, the names. */
export function radar(
  g: CanvasRenderingContext2D,
  map: StrikeMap,
  x0: number,
  y0: number,
  w: number,
  h: number,
  names = false,
) {
  const S = map.size;
  const k = Math.min(w / (S.x1 - S.x0), h / (S.z1 - S.z0));
  const X = (x: number) => x0 + (x - S.x0) * k;
  const Y = (z: number) => y0 + (z - S.z0) * k;
  // the ground in its climate's colour (plan 115 F3: sand, mud, snow)
  const cg = climateOf(map.key).ground;
  g.fillStyle = cg === "sand" ? "#8a7550" : cg === "mud" ? "#4c4a3e" : "#7d8a90";
  g.fillRect(x0, y0, (S.x1 - S.x0) * k, (S.z1 - S.z0) * k);
  // the walkable ground light, the solids dark, by height
  for (const p of map.pieces) {
    if (p.k === "box" || p.k === "floor") {
      const top = p.k === "box" ? p.y1 : p.y;
      if (p.k === "box" && top > 3) {
        // (its shadow to the south-east: the radar reads as a place, not a plan)
        g.fillStyle = "rgba(0,0,0,0.28)";
        g.fillRect(X(p.x0) + 2, Y(p.z0) + 2, (p.x1 - p.x0) * k, (p.z1 - p.z0) * k);
      }
      const tall =
        p.m === "brick"
          ? "#5b3a31"
          : p.m === "wood" || p.m === "plank"
            ? "#5b4a36"
            : p.m === "sheet"
              ? "#3f4d55"
              : p.m === "rock"
                ? "#2c2f30"
                : "#3a4144";
      g.fillStyle = top > 3 ? tall : top > 1.3 ? "#6b7476" : "#9aa3a5";
      if (p.k === "floor") g.fillStyle = "rgba(200,205,206,0.28)";
      g.fillRect(X(p.x0), Y(p.z0), (p.x1 - p.x0) * k, (p.z1 - p.z0) * k);
    } else if (p.k === "wall") {
      g.strokeStyle = p.y1 > 1.3 ? "#1b1f21" : "#5a6467";
      g.lineWidth = Math.max(1, (p.t ?? 0.3) * k);
      g.beginPath();
      g.moveTo(X(p.a[0]), Y(p.a[1]));
      g.lineTo(X(p.b[0]), Y(p.b[1]));
      g.stroke();
    } else if (p.k === "crate") {
      g.fillStyle = "#6b5a40";
      g.fillRect(X(p.x - p.s / 2), Y(p.z - p.s / 2), p.s * k, p.s * k);
    }
  }
  const zone = (r: { x0: number; z0: number; x1: number; z1: number }, col: string, label?: string) => {
    g.strokeStyle = col;
    g.lineWidth = 2;
    g.strokeRect(X(r.x0), Y(r.z0), (r.x1 - r.x0) * k, (r.z1 - r.z0) * k);
    if (label) {
      g.fillStyle = col;
      g.font = canvasFont(Math.max(10, Math.round(w / 14)), true);
      g.fillText(label, X((r.x0 + r.x1) / 2) - 5, Y((r.z0 + r.z1) / 2) + 5);
    }
  };
  if (map.sites) {
    zone(map.sites.A, "#e2836b", "A");
    if (map.sites.B) zone(map.sites.B, "#e2836b", "B");
  }
  if (map.rescue) zone(map.rescue, "#b9d98a", "R");
  for (const hpos of map.hostages ?? []) {
    g.fillStyle = "#b9d98a";
    g.fillRect(X(hpos[0]) - 2, Y(hpos[1]) - 2, 4, 4);
  }
  zone(map.buy.r, "#d9a066");
  zone(map.buy.w, "#7fa6c9");
  // the places' names (callouts), small, where there's room
  if (names) {
    g.font = `600 ${Math.max(9, Math.round(w / 34))}px 'Avenir Next Condensed', 'Arial Narrow', sans-serif`;
    g.textAlign = "center";
    for (const c of map.calls) {
      const cx = X((c.r.x0 + c.r.x1) / 2);
      const cy = Y((c.r.z0 + c.r.z1) / 2);
      g.lineWidth = 3;
      g.strokeStyle = "rgba(0,0,0,0.65)";
      g.strokeText(c.name.toUpperCase(), cx, cy + 3);
      g.fillStyle = "#efe6d2";
      g.fillText(c.name.toUpperCase(), cx, cy + 3);
    }
    g.textAlign = "start";
  }
}
