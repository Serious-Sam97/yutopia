import type { WorldObjectDef } from "../catalog.ts";
import { convertV1 } from "../convert.ts";
import { type AreaDef, entryWallItem, hWall, MapBuilder, type MapDef, setEdge, vWall, type WallMat } from "../map.ts";

// "The Studio Building" — a 1984 recording studio that's a bit too big inside.
// Rooms are written as wall-inclusive rectangles; see docs/plan/04-world-and-art.md.

const tiles = new MapBuilder(48, 36)
  .room(0, 0, 28, 20, ".") // Tracking Room (main floor)
  .room(28, 0, 47, 11, ",") // War Room
  .room(28, 11, 47, 14, "_") // Booth hall
  .room(28, 14, 34, 20, ":") // Booth 1
  .room(34, 14, 40, 20, ":") // Booth 2
  .room(40, 14, 47, 20, ":") // Booth 3
  .room(0, 20, 13, 35, "_") // Lobby
  .room(13, 20, 25, 35, ",") // Lounge
  .room(25, 20, 41, 35, ".") // Live Room
  .room(41, 20, 47, 35, "x") // Server room
  .floor(26, 21, 40, 23, "~") // the stage
  .door(6, 20, ".")
  .door(7, 20, ".")
  .door(18, 20, ".")
  .door(19, 20, ".")
  .door(26, 20, ".")
  .door(27, 20, ".")
  .door(28, 5, ",")
  .door(28, 6, ",")
  .door(28, 12, "_")
  .door(28, 13, "_")
  .door(31, 14, ":")
  .door(37, 14, ":")
  .door(43, 14, ":")
  .door(13, 27, "_")
  .door(13, 28, "_")
  .door(25, 27, ",")
  .door(25, 28, ",")
  .door(41, 33, "x")
  .build();

const areas: AreaDef[] = [
  { key: "tracking", name: "Tracking Room", kind: "open", x: 1, y: 1, w: 27, h: 19, dressing: "lived" },
  { key: "standup", name: "Standup Corner", kind: "standup", x: 20, y: 13, w: 8, h: 7, priority: 2 },
  { key: "war-room", name: "War Room", kind: "private", x: 29, y: 1, w: 18, h: 10, dressing: "tidy" },
  { key: "hall", name: "Booth Hall", kind: "open", x: 29, y: 12, w: 18, h: 2 },
  { key: "booth-1", name: "Booth 1", kind: "booth", x: 29, y: 15, w: 5, h: 5 },
  { key: "booth-2", name: "Booth 2", kind: "booth", x: 35, y: 15, w: 5, h: 5 },
  { key: "booth-3", name: "Booth 3", kind: "booth", x: 41, y: 15, w: 6, h: 5 },
  { key: "lobby", name: "Lobby", kind: "open", x: 1, y: 21, w: 12, h: 14, dressing: "tidy" },
  { key: "lounge", name: "Lounge", kind: "open", x: 14, y: 21, w: 11, h: 14, dressing: "busy" },
  { key: "live-room", name: "Live Room", kind: "open", x: 26, y: 21, w: 15, h: 14, dressing: "lived" },
  { key: "stage", name: "Stage", kind: "stage", x: 26, y: 21, w: 15, h: 3, priority: 2 },
  { key: "server-room", name: "Server Room", kind: "private", x: 42, y: 21, w: 5, h: 14 },
];

const objects: WorldObjectDef[] = [];
const add = (id: string, kind: string, x: number, y: number, rot = 0, props?: Record<string, unknown>) =>
  objects.push({ id, kind, x, y, rot, ...(props ? { props } : {}) });

// ── Tracking Room ────────────────────────────────────────────────────────────
for (const [i, bx] of [3, 8, 13, 18].entries()) add(`board-${i + 1}`, "board_wall", bx, 1);
add("tr-whiteboard", "whiteboard", 23, 1);
add("tr-poster-1", "poster", 1, 1, 0, { art: "tape" });
add("tr-poster-2", "poster", 26, 1, 0, { art: "vu" });

// Desk pods: two back-to-back desks with two seats on each side. Seats marked
// `desk` are what people get assigned as their own desk.
for (const px of [3, 7, 11, 15]) {
  for (const py of [5, 11]) {
    const pod = `${px}-${py}`;
    add(`seat-${pod}-a`, "chair", px, py, 0, { desk: true });
    add(`seat-${pod}-b`, "chair", px + 1, py, 0, { desk: true });
    add(`desk-${pod}-n`, "desk", px, py + 1, 0);
    add(`desk-${pod}-s`, "desk", px, py + 2, 2);
    add(`seat-${pod}-c`, "chair", px, py + 3, 2, { desk: true });
    add(`seat-${pod}-d`, "chair", px + 1, py + 3, 2, { desk: true });
  }
}
add("standup-ring", "standup_mat", 21, 14);
add("tr-shelf", "tape_shelf", 20, 9);
add("tr-coffee", "coffee_machine", 22, 9);
for (const [i, [x, y]] of [
  [1, 4],
  [27, 9],
  [19, 4],
  [1, 18],
].entries())
  add(`tr-lamp-${i}`, "lamp", x, y);
for (const [i, [x, y]] of [
  [2, 1],
  [27, 1],
  [1, 19],
  [12, 19],
  [27, 19],
].entries())
  add(`tr-plant-${i}`, "plant", x, y);

// ── War Room ─────────────────────────────────────────────────────────────────
add("war-screen", "screen_wall", 34, 1, 0, { source: "board" });
add("war-whiteboard", "whiteboard", 40, 1);
for (const x of [30, 31, 44, 45]) add(`war-panel-${x}`, "acoustic_panel", x, 1);
add("war-table", "meeting_table", 34, 4);
for (let x = 34; x <= 39; x++) {
  add(`war-seat-n-${x}`, "chair", x, 3, 0);
  add(`war-seat-s-${x}`, "chair", x, 6, 2);
}
for (const y of [4, 5]) {
  add(`war-seat-w-${y}`, "chair", 33, y, 1);
  add(`war-seat-e-${y}`, "chair", 40, y, 3);
}
for (const [i, [x, y]] of [
  [29, 1],
  [46, 1],
  [29, 10],
  [46, 10],
].entries())
  add(`war-plant-${i}`, "plant", x, y);
add("war-lamp", "lamp", 46, 6);

// ── Booths ───────────────────────────────────────────────────────────────────
for (const [i, bx] of [29, 35, 41].entries()) {
  const n = i + 1;
  const right = n === 3 ? bx + 5 : bx + 4;
  add(`booth-${n}-chair-a`, "armchair", bx + 1, 17, 1);
  add(`booth-${n}-chair-b`, "armchair", right - 1, 17, 3);
  add(`booth-${n}-panel-a`, "acoustic_panel", bx, 15);
  add(`booth-${n}-panel-b`, "acoustic_panel", right, 15);
  add(`booth-${n}-lamp`, "lamp", bx, 19);
  add(`booth-${n}-mic`, "mic_stand", right, 19);
}
add("hall-plant", "plant", 46, 12);

// ── Lobby ────────────────────────────────────────────────────────────────────
add("lobby-reception", "reception", 4, 24);
add("lobby-notice", "notice_board", 2, 21);
add("lobby-poster", "poster", 10, 21, 0, { art: "yondra" });
add("lobby-sofa", "sofa", 2, 33);
add("lobby-table", "coffee_table", 2, 31);
add("lobby-armchair", "armchair", 5, 31, 3);
add("lobby-lamp", "lamp", 11, 31);
for (const [i, [x, y]] of [
  [1, 21],
  [12, 21],
  [1, 34],
  [12, 34],
].entries())
  add(`lobby-plant-${i}`, "plant", x, y);

// ── Lounge ───────────────────────────────────────────────────────────────────
add("lounge-arcade-1", "arcade", 21, 21);
add("lounge-arcade-2", "arcade", 22, 21);
add("lounge-radio", "radio", 24, 24);
add("lounge-rug", "rug", 15, 27);
add("lounge-sofa", "sofa", 15, 31);
add("lounge-table", "coffee_table", 16, 28);
add("lounge-armchair", "armchair", 19, 28, 3);
add("lounge-shelf", "tape_shelf", 14, 24, 3);
add("lounge-coffee", "coffee_machine", 14, 22);
add("lounge-lamp", "lamp", 20, 33);
for (const [i, [x, y]] of [
  [24, 21],
  [24, 34],
  [14, 34],
].entries())
  add(`lounge-plant-${i}`, "plant", x, y);

// ── Live Room ────────────────────────────────────────────────────────────────
add("live-screen", "screen_wall", 31, 21, 0, { source: "stage" });
add("live-speaker-l", "speaker_cab", 29, 21);
add("live-speaker-r", "speaker_cab", 37, 21);
add("live-mic", "mic_stand", 33, 23);
for (const x of [28, 32, 36]) {
  add(`live-bench-a-${x}`, "bench", x, 26, 0);
  add(`live-bench-b-${x}`, "bench", x, 28, 0);
}
add("live-mixer", "mixing_desk", 32, 31);
add("live-lamp-l", "lamp", 26, 34);
add("live-lamp-r", "lamp", 40, 34);

// ── Server room (don't) ──────────────────────────────────────────────────────
for (let x = 42; x <= 46; x++) add(`rack-a-${x}`, "server_rack", x, 21);
for (let x = 42; x <= 44; x++) add(`rack-b-${x}`, "server_rack", x, 25);
for (let x = 44; x <= 46; x++) add(`rack-c-${x}`, "server_rack", x, 28);
add("vortex-terminal", "crt_terminal", 46, 31);

// The Studio as it was first written: walls as tiles (map v1). Spaces seeded
// before map v2 are converted from it (convert.ts).
export const studioV1: MapDef = {
  key: "studio",
  name: "The Studio Building",
  width: 48,
  height: 36,
  tiles,
  hWalls: [],
  vWalls: [],
  spawn: { x: 6.5, y: 28.5 },
  areas,
  objects,
};

// Wall materials per room.
const MATS: Record<string, WallMat> = {
  "war-room": "k",
  lounge: "b",
  "live-room": "w",
  "server-room": "w",
  "booth-1": "f",
  "booth-2": "f",
  "booth-3": "f",
};

function withWindows(m: MapDef): MapDef {
  // windows in the outer back walls (north and west), every few tiles, never
  // where something hangs on the wall
  const hung = new Set<string>();
  for (const o of m.objects)
    if (entryWallItem(o.kind)) for (let i = 0; i < entryWallItem(o.kind); i++) hung.add(`${o.x + i},${o.y}`);
  for (let x = 1; x < m.width - 1; x++) {
    const ch = hWall(m, x, 0);
    if (ch !== "." && x % 4 === 2 && !hung.has(`${x},0`)) setEdge(m, { x, y: 0, dir: "h" }, ch.toUpperCase());
  }
  for (let y = 1; y < m.height - 1; y++) {
    const ch = vWall(m, 0, y);
    if (ch !== "." && y % 4 === 2) setEdge(m, { x: 0, y, dir: "v" }, ch.toUpperCase());
  }
  return m;
}

export const studio: MapDef = withWindows(
  convertV1(studioV1, studioV1.objects, (a) => (a ? (MATS[a.key] ?? (a.kind === "booth" ? "f" : "p")) : "p")).map,
);
