import { canPlace } from "./build.ts";
import { entry, placedFootprint, quarterYaw, type WorldObjectDef } from "./catalog.ts";
import type { Point } from "./geom.ts";
import { hangEdges, hangOf } from "./hang.ts";
import { atLevel, floorOf, onLevel } from "./levels.ts";
import { type AreaDef, inArea, type MapDef } from "./map.ts";
import { isOpening } from "./openings.ts";
import { hostOf, splitAll } from "./tops.ts";

// The Office (docs/plan/67-the-furniture.md, phase 10): rooms furnished again with the new pieces,
// by plan — open plan, a meeting room, a kitchen, a lounge, focus booths, a reception — laid out in
// any room's own rectangle on its floor, never in front of a door, nothing that doesn't fit (the
// one placement rule, build.ts canPlace). Applied to a world only by choice: a builder furnishing
// the room they stand in, an admin refurnishing a whole floor (each room by what its name says it
// is), and either undone (the world-server keeps what was there). Plan 68 adds a café, a games room
// and a library, from its new pieces.

export type RoomPlan =
  | "open_plan"
  | "meeting"
  | "kitchen"
  | "lounge"
  | "booths"
  | "reception"
  | "cafe"
  | "games"
  | "library";
export const ROOM_PLANS: { key: RoomPlan; name: string }[] = [
  { key: "open_plan", name: "Open plan" },
  { key: "meeting", name: "Meeting room" },
  { key: "kitchen", name: "Kitchen" },
  { key: "lounge", name: "Lounge" },
  { key: "booths", name: "Focus booths" },
  { key: "reception", name: "Reception" },
  { key: "cafe", name: "Café" },
  { key: "games", name: "Games room" },
  { key: "library", name: "Library" },
];
export const isRoomPlan = (k: unknown): k is RoomPlan => ROOM_PLANS.some((p) => p.key === k);

/** What a room's name says it's for. */
export function planFor(a: Pick<AreaDef, "name" | "key">): RoomPlan {
  const n = `${a.name} ${a.key}`.toLowerCase();
  // (plan 68's three by whole words — a "Display Lab" isn't a playroom — and a "Board Game Room" a
  // games room before the board's meeting)
  if (/\b(games?|gaming|arcade|rec ?room|play ?room)\b/.test(n)) return "games";
  if (/meet|war room|conference|board|huddle/.test(n)) return "meeting";
  if (/\b(caf[eé](teria)?|bistro|canteen|diner)\b/.test(n)) return "cafe";
  if (/\b(library|reading|study)\b/.test(n)) return "library";
  if (/kitchen|coffee|pantry|break/.test(n)) return "kitchen";
  if (/lounge|living|rest|chill/.test(n)) return "lounge";
  if (/booth|focus|phone|quiet|call/.test(n)) return "booths";
  if (/lobby|reception|entrance|front|foyer|hall/.test(n)) return "reception";
  return "open_plan";
}

/** The pieces a furnishing takes out of a room first (its furniture: never what's on the walls, the
 *  doors and windows, the screens and games, the stairs and lifts). */
const FURNITURE = new Set([
  "desk",
  "standing_desk",
  "chair",
  "bar_stool",
  "armchair",
  "sofa",
  "beanbag",
  "bench",
  "meeting_table",
  "coffee_table",
  "side_table",
  "high_table",
  "reception",
  "counter",
  "cupboard",
  "bookcase",
  "shelving",
  "tape_shelf",
  "filing_cabinet",
  "printer",
  "phone_booth",
  "partition",
  "fridge",
  "microwave",
  "water_cooler",
  "coffee_machine",
  "coat_rack",
  "plant",
  "lamp",
  "pendant_light",
  "rug",
  "decor",
  "tabletop",
  "computer",
  // (plan 68's: what its café, games room and library put down — a games room's tables are its
  // furniture, as a TV someone set up isn't)
  "cafe_counter",
  "card_table",
  "drinks_fridge",
  "ice_cream_freezer",
  "edison_cluster",
  "jukebox",
  "air_hockey",
  "foosball",
  "pinball",
  "claw_machine",
  "chess_table",
  "ladder_bookcase",
  "round_rug",
  "egg_chair",
  "rocking_chair",
  "nesting_tables",
  "uplighter",
  "indoor_tree",
  "floor_vase",
  "chandelier",
]);
export const furnishes = (kind: string): boolean => FURNITURE.has(kind);

/** The room's things a furnishing takes out (its furniture, on its floor, inside it), and whatever
 *  stands on a top it takes (a radio on its side table). Someone's own desk stays (a seat with an
 *  owner, and what it's at: WorldRoom's desk assignments), and so does what's on it. */
export function furnishedIn(objects: WorldObjectDef[], a: AreaDef, map: MapDef): WorldObjectDef[] {
  const floor = onLevel(objects, map);
  const inside = (o: WorldObjectDef) => {
    const { w, h } = placedFootprint(o);
    const cx = o.x + w / 2;
    const cy = o.y + h / 2;
    return inArea(a, cx, cy);
  };
  const owned = floor.filter((o) => inside(o) && o.props?.ownerId != null);
  const ownedAt = (o: WorldObjectDef) => {
    const { w, h } = placedFootprint(o);
    return owned.some((s) => s.x >= o.x - 1 && s.x <= o.x + w && s.y >= o.y - 1 && s.y <= o.y + h);
  };
  const out = floor.filter(
    (o) => furnishes(o.kind) && inside(o) && o.props?.ownerId == null && !(entry(o.kind).surface && ownedAt(o)),
  );
  const gone = new Set(out.map((o) => o.id));
  for (const o of floor)
    if (!gone.has(o.id) && entry(o.kind).onSurface) {
      const host = hostOf(floor, o);
      if (host && gone.has(host.id)) out.push(o);
    }
  return out;
}

/** A room laid out by `plan` inside its rectangle on `map`'s floor, around what stays (`keep`: the
 *  rest of the floor's things, its doors among them): each piece only where it can be put down and
 *  clear of the doors, the desks set up (their monitors, keyboards, a mug — tops.ts splitAll). */
export function furnishRoom(
  plan: RoomPlan,
  a: AreaDef,
  map: MapDef,
  keep: WorldObjectDef[],
  bodies: Point[] = [],
  tag = "",
): WorldObjectDef[] {
  const level = floorOf(map);
  const here = onLevel(keep, map);
  // the doors' tiles and their neighbours: kept clear
  const clear = new Set<string>();
  for (const d of here)
    if (isOpening(d.kind) && entry(d.kind).opening === "door") {
      const { w, h } = placedFootprint(d);
      for (let y = d.y - 1; y <= d.y + h; y++) for (let x = d.x - 1; x <= d.x + w; x++) clear.add(`${x},${y}`);
    }
  // …the tiles before what hangs on the walls (a screen, a whiteboard: nothing tall stood over them)
  const hung = new Set<string>();
  for (const w of here)
    if (entry(w.kind).wall)
      for (const e of hangEdges(hangOf(w))) {
        const side = hangOf(w).side;
        hung.add(e.dir === "h" ? `${e.x},${side > 0 ? e.y : e.y - 1}` : `${side > 0 ? e.x : e.x - 1},${e.y}`);
      }
  // …and the smaller places inside the room (a standup corner, a stage): theirs
  for (const s of map.areas)
    if (s !== a && (s.priority ?? 0) > (a.priority ?? 0))
      for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) clear.add(`${x},${y}`);
  const out: WorldObjectDef[] = [];
  let n = 0;
  const put = (kind: string, x: number, y: number, rot = 0, props: Record<string, unknown> = {}): boolean => {
    const o = atLevel(
      { id: `${a.key}-${plan}-${level}${tag && `-${tag}`}-${n++}`, kind, x, y, yaw: quarterYaw(rot), props },
      level,
      map,
    );
    const { w, h } = placedFootprint(o);
    const e = entry(kind);
    if (!e.onSurface)
      for (let dy = 0; dy < h; dy++)
        for (let dx = 0; dx < w; dx++) {
          const t = `${x + dx},${y + dy}`;
          if (clear.has(t) || ((e.solid || e.seat) && hung.has(t))) return false;
        }
    // (never onto someone standing there: canPlace keeps solids off bodies)
    if (!canPlace(map, [...here, ...out], o, bodies)) return false;
    out.push(o);
    return true;
  };
  /** Something on a host's top (a coffee machine on a counter): its surface's height with it. */
  const onTop = (kind: string, host: WorldObjectDef | undefined, dx = 0, props: Record<string, unknown> = {}) => {
    if (!host) return;
    put(kind, host.x + dx, host.y, 0, { ...props, z: entry(host.kind).surface ?? 0 });
  };
  const last = () => out[out.length - 1];
  // the room inside a tile of walkway along its walls; its back row against the north wall
  const x0 = a.x + 1;
  const y0 = a.y + 1;
  const x1 = a.x + a.w - 1; // (exclusive)
  const y1 = a.y + a.h - 1;
  const W = x1 - x0;
  const H = y1 - y0;
  const back = a.y; // (the row along the north wall)
  const corners = () => {
    for (const [x, y] of [
      [a.x, a.y],
      [a.x + a.w - 1, a.y],
      [a.x, a.y + a.h - 1],
      [a.x + a.w - 1, a.y + a.h - 1],
    ])
      put("plant", x, y, 0, { variant: (x + y) % 5 });
  };
  /** A piece's w × h (turned) inside the room's walkway-edged rectangle. */
  const fits = (kind: string, x: number, y: number, rot = 0) => {
    const { w, h } = placedFootprint({ kind, yaw: quarterYaw(rot) });
    return x >= x0 && y >= y0 && x + w <= x1 && y + h <= y1;
  };
  if (W < 2 || H < 2) return [];
  switch (plan) {
    case "open_plan": {
      // pods of four desks (two facing two), two tiles of aisle round each (room to walk and to pull
      // a chair out); the office's corner along the back
      for (let py = y0 + 1; py + 4 <= y1; py += 6)
        for (let px = x0 + 1; px + 2 <= x1; px += 4) {
          if (!put("desk", px, py + 1, 0)) continue;
          put("desk", px, py + 2, 2);
          put("chair", px, py, 0, { desk: true });
          put("chair", px + 1, py, 0, { desk: true });
          put("chair", px, py + 3, 2, { desk: true });
          put("chair", px + 1, py + 3, 2, { desk: true });
        }
      put("printer", x1, back + 1, 3);
      put("filing_cabinet", x1, back + 2, 3);
      put("water_cooler", a.x, back + 1, 1);
      for (let x = a.x + 2; x + 2 <= x1; x += 6) put("pendant_light", x + 1, y0 + Math.floor(H / 2));
      corners();
      break;
    }
    case "meeting": {
      // the long table in the middle (a shorter one in a small room), chairs round it, a light over it
      const tw = W >= 8 ? 6 : W >= 4 ? 2 : 0;
      const tx = x0 + Math.floor((W - tw) / 2);
      const ty = y0 + Math.floor((H - 2) / 2);
      if (tw === 6 && put("meeting_table", tx, ty, 0)) {
        for (let k = 0; k < 6; k++) {
          put("chair", tx + k, ty - 1, 0);
          put("chair", tx + k, ty + 2, 2);
        }
        // (rot 3 faces +x, rot 1 −x: each end chair turned to the table)
        put("chair", tx - 1, ty, 3);
        put("chair", tx + 6, ty + 1, 1);
        put("pendant_light", tx + 1, ty);
        put("pendant_light", tx + 4, ty);
      } else if (tw === 2 && put("coffee_table", tx, ty, 0)) {
        put("chair", tx, ty - 1, 0);
        put("chair", tx + 1, ty - 1, 0);
        put("chair", tx, ty + 1, 2);
        put("chair", tx + 1, ty + 1, 2);
      }
      put("coat_rack", a.x, back);
      corners();
      break;
    }
    case "kitchen": {
      // counters along the back wall, the fridge at their end, the espresso machine and a microwave
      // on them; a high table or two with stools in the middle; water and a bin
      // (along the back wall, or the first row clear of what's there: a stage, a door)
      const counters: WorldObjectDef[] = [];
      let x = a.x + 1;
      for (let row = back; row < back + 4 && !counters.length; row++) {
        x = a.x + 1;
        while (x + 2 <= a.x + a.w - 2 && counters.length < 3) {
          if (put("counter", x, row, 0)) counters.push(last());
          else if (counters.length) break;
          x += 2;
        }
      }
      if (counters.length) put("fridge", x, counters[0].y, 0);
      onTop("coffee_machine", counters[0]);
      onTop("microwave", counters[1] ?? counters[0], 1);
      for (let k = 0; k < Math.min(2, Math.floor(W / 4)); k++) {
        const hx = x0 + 1 + k * 4;
        const hy = y0 + Math.max(1, Math.floor(H / 2) - 1);
        if (!put("high_table", hx, hy)) continue;
        put("bar_stool", hx - 1, hy, 3);
        put("bar_stool", hx + 1, hy, 1);
        put("bar_stool", hx, hy + 1, 2);
        put("pendant_light", hx, hy);
      }
      put("water_cooler", a.x, a.y + a.h - 1, 1);
      put("decor", a.x + a.w - 1, a.y + a.h - 1, 0, { d: "bin", seed: 0.3 });
      break;
    }
    case "lounge": {
      // a rug, the sofa behind it facing in, armchairs either side, a coffee table on it; lamps, a
      // bookcase on the back wall, plants
      const rx = x0 + Math.max(0, Math.floor((W - 4) / 2));
      const ry = y0 + Math.max(0, Math.floor((H - 3) / 2));
      if (W >= 4 && H >= 3) put("rug", rx, ry, 0);
      put("sofa", rx, ry - 1 >= y0 ? ry - 1 : ry, 0);
      put("coffee_table", rx + 1, ry + 1, 0);
      put("armchair", rx - 1, ry + 1, 3);
      put("armchair", rx + 4, ry + 1, 1);
      put("lamp", rx - 1, ry - 1, 0);
      put("lamp", rx + 4, ry - 1, 0, { variant: 1 });
      put("bookcase", a.x + a.w - 3, back, 0);
      put("beanbag", rx + 1, ry + 3, 2);
      corners();
      break;
    }
    case "booths": {
      // phone booths along the back wall, dividers down the middle, a standing desk or two
      for (let x = a.x + 1; x < a.x + a.w - 1; x += 2) put("phone_booth", x, back, 0);
      for (let x = x0; x + 2 <= x1; x += 3) put("partition", x, y0 + Math.floor(H / 2) + 1, 0);
      for (let x = x0; x + 2 <= x1 && x < x0 + 6; x += 3) put("standing_desk", x, y1 - 1, 2);
      corners();
      break;
    }
    case "reception": {
      // the desk facing the way in (south), a chair behind it; visitors' sofa and table, the coat rack
      const rx = x0 + Math.max(0, Math.floor((W - 3) / 2));
      const ry = y0 + 1;
      if (put("reception", rx, ry, 0)) put("chair", rx + 1, ry - 1, 0, { desk: true });
      // the visitors' sofa facing the desk, its table before it (a row up when a door's in the way)
      for (let sy = y1 - 1; sy > ry + 3; sy--)
        if (put("sofa", rx, sy, 2)) {
          put("coffee_table", rx, sy - 2, 0);
          break;
        }
      put("coat_rack", a.x, a.y + a.h - 1);
      for (const x of [rx - 1, rx + 3]) put("pendant_light", x, ry);
      corners();
      break;
    }
    case "cafe": {
      // the café counter on the back wall (the first row clear), the espresso machine on its till's
      // end; the drinks fridge on its right, the ice-cream freezer on its left; little tables for two
      // in rows, a light over each; the jukebox in a corner
      const cx = a.x + Math.max(1, Math.floor((a.w - 3) / 2));
      let counter: WorldObjectDef | undefined;
      for (let row = back; row < back + 3 && !counter; row++) if (put("cafe_counter", cx, row, 0)) counter = last();
      if (counter) {
        onTop("coffee_machine", counter, 2);
        put("drinks_fridge", cx + 3, counter.y, 0);
        put("ice_cream_freezer", cx - 2, counter.y, 0);
      }
      const ty0 = (counter?.y ?? back) + 3;
      for (let ty = ty0; ty < y1; ty += 3)
        for (let tx = x0 + 1; tx + 2 <= x1; tx += 4) {
          if (!fits("card_table", tx, ty) || !put("card_table", tx, ty, 0)) continue;
          put("chair", tx - 1, ty, 3);
          put("chair", tx + 1, ty, 1);
          put("edison_cluster", tx, ty);
        }
      put("jukebox", a.x, a.y + a.h - 1, 0);
      corners();
      break;
    }
    case "games": {
      // the machines along the back wall (pinballs, the claw, the jukebox); the tables in the
      // middle — air hockey, foosball, a chess table — each with room round it to play; lights
      // over them
      let bx = a.x + 1;
      for (const k of ["pinball", "pinball", "claw_machine", "jukebox"]) {
        while (bx < a.x + a.w - 1 && !put(k, bx, back, 0)) bx++;
        bx += 1;
      }
      const my = y0 + 2;
      let mx = x0 + 1;
      for (const k of ["air_hockey", "foosball"]) {
        if (fits(k, mx, my) && put(k, mx, my, 0)) {
          put("pendant_light", mx + 1, my);
          mx += entry(k).w + 2;
        }
      }
      const cy = my + 4;
      if (fits("chess_table", x0 + 1, cy) && put("chess_table", x0 + 1, cy, 0)) put("lamp", x0, cy, 0);
      if (fits("card_table", x0 + 5, cy) && put("card_table", x0 + 5, cy, 0)) {
        put("chair", x0 + 4, cy, 3);
        put("chair", x0 + 6, cy, 1);
      }
      corners();
      break;
    }
    case "library": {
      // the bookcases with their ladders along the back wall; a round rug in the middle with an egg
      // chair and a rocking chair on it, a nest of tables between; a reading desk with its green
      // lamp; uplighters, a tree in a corner
      // (along the back wall, or the first row clear of what hangs there)
      let shelves = 0;
      for (let row = back; row < back + 3 && !shelves; row++)
        for (let x = a.x + 1; x + 3 <= a.x + a.w - 1; x += 3) if (put("ladder_bookcase", x, row, 0)) shelves++;
      const rx = x0 + Math.max(0, Math.floor((W - 3) / 2));
      const ry = y0 + Math.max(1, Math.floor((H - 3) / 2));
      if (fits("round_rug", rx, ry)) {
        put("round_rug", rx, ry, 0);
        put("egg_chair", rx, ry + 1, 3);
        put("rocking_chair", rx + 2, ry + 1, 1);
        put("nesting_tables", rx + 1, ry + 1, 0);
        put("chandelier", rx + 1, ry + 1);
      }
      // (in the south-east, or the nearest place along the south it can go)
      desk: for (let dy = y1 - 2; dy >= y1 - 4; dy--)
        for (let dx = x1 - 2; dx >= x0 && dx >= x1 - 10; dx--)
          if (fits("desk", dx, dy) && put("desk", dx, dy, 2)) {
            onTop("bankers_lamp", last(), 0);
            put("chair", dx, dy + 1, 2, { desk: true });
            break desk;
          }
      for (const [x, y] of [
        [a.x, a.y + 1],
        [a.x + a.w - 1, a.y + 1],
      ])
        put("uplighter", x, y, 0);
      put("indoor_tree", a.x, a.y + a.h - 2, 0);
      put("floor_vase", a.x + a.w - 1, a.y + a.h - 1, 0);
      break;
    }
  }
  return splitAll(out).objects;
}

/** The rooms a floor's refurnishing furnishes: its rooms, not the corners and stages inside them,
 *  the corridors, the stages or the server room. */
export function refurnished(a: AreaDef): boolean {
  if ((a.priority ?? 0) > 0 || a.w < 3 || a.h < 3) return false;
  if (a.kind === "stage" || a.kind === "standup") return false;
  return !/server|stair|lift|elevator|corridor|hall\b/i.test(`${a.name} ${a.key}`);
}

/** Every room on a floor furnished by what its name says it is, in the floor's order. */
export function refurnishFloor(
  map: MapDef,
  objects: WorldObjectDef[],
  bodies: Point[] = [],
  tag = "",
): { area: AreaDef; plan: RoomPlan; remove: WorldObjectDef[]; add: WorldObjectDef[] }[] {
  const out: { area: AreaDef; plan: RoomPlan; remove: WorldObjectDef[]; add: WorldObjectDef[] }[] = [];
  let keep = [...objects];
  for (const a of map.areas) {
    if (!refurnished(a)) continue;
    const plan = planFor(a);
    const remove = furnishedIn(keep, a, map);
    const gone = new Set(remove.map((o) => o.id));
    keep = keep.filter((o) => !gone.has(o.id));
    const add = furnishRoom(plan, a, map, keep, bodies, tag);
    keep = [...keep, ...add];
    out.push({ area: a, plan, remove, add });
  }
  return out;
}
