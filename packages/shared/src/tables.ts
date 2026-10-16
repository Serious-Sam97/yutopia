// The two game tables (Fita 13): the pool table (pool.ts, 8-ball) and the
// ping-pong table (pong.ts). The games run in real units — metres, with the
// playing surface's centre at 0, x along the table's length, y across it, z up,
// a right-handed frame seen from above (x right, y up the plan) — and the world
// draws them in tiles. The world's tiles seen from above run y DOWN the plan,
// so the table's y is flipped on the way: without that the games would play in
// a mirror (right english would curve left). This is where the two meet: how big a metre is
// on each table, where the playing surface lies on the item, and how high.
//
// Heights in the world are iso px (the item kit's z). Furniture heights are
// drawn short (a desk's top is 23 px), so a table's top sits at furniture
// height, but anything ABOVE it — a ball in flight, the net — is drawn to the
// table's own true scale (metres × tiles-per-metre × px-per-tile), so arcs and
// bounces keep their real shape.

// iso px of height per tile (the item kit: a tile edge is 45.25 px, seen 30° down)
const ZPX = 45.25 * Math.cos(Math.PI / 6);

export type TableKind = "pool_table" | "pingpong_table";

export interface TableGeo {
  w: number; // footprint, tiles (rot 0)
  h: number;
  tpm: number; // tiles per metre on this table
  top: number; // px: the playing surface
  len: number; // m: the playing surface (x)
  wid: number; // m (y)
}

export const TABLES: Record<TableKind, TableGeo> = {
  // a 7-ft table: 1.981 × 0.991 m of cloth (pool.ts), rails round it
  pool_table: { w: 4, h: 2, tpm: 1.55, top: 25, len: 1.981, wid: 0.991 },
  // regulation: 2.74 × 1.525 m (pong.ts)
  pingpong_table: { w: 4, h: 2, tpm: 1.26, top: 24, len: 2.74, wid: 1.525 },
};

export const isGameTable = (kind: string): kind is TableKind => Object.hasOwn(TABLES, kind);

// how far from a table's edge you can play at it (and a little slack before
// walking away frees your seat)
export const TABLE_REACH = 2.2;
export const TABLE_WALK_AWAY = TABLE_REACH + 1.5;

// metres on the table → the item's own tiles at rot 0 (x along its 4 tiles)
export function tableTiles(kind: TableKind, mx: number, my: number): [number, number] {
  const g = TABLES[kind];
  return [g.w / 2 + mx * g.tpm, g.h / 2 - my * g.tpm];
}
// …and back
export function tableMetres(kind: TableKind, tx: number, ty: number): [number, number] {
  const g = TABLES[kind];
  return [(tx - g.w / 2) / g.tpm, (g.h / 2 - ty) / g.tpm];
}
// a height over the playing surface (m) → iso px
export function tablePx(kind: TableKind, mz: number): number {
  const g = TABLES[kind];
  return g.top + mz * g.tpm * ZPX;
}
export function tableMz(kind: TableKind, px: number): number {
  const g = TABLES[kind];
  return (px - g.top) / (g.tpm * ZPX);
}

// rot-0 item tiles → the object's turned footprint (90° clockwise steps, the
// same turn as the items' drawings), and back
export function tableTurn(x: number, y: number, rot: number, w: number, h: number): [number, number] {
  let X = x;
  let Y = y;
  let W = w;
  let H = h;
  for (let i = 0; i < (rot & 3); i++) {
    [X, Y] = [H - Y, X];
    [W, H] = [H, W];
  }
  return [X, Y];
}
export function tableUnturn(X: number, Y: number, rot: number, w: number, h: number): [number, number] {
  // turning back by 1 step is turning forward by 3 on the turned footprint
  const r = rot & 3;
  const [W, H] = r % 2 ? [h, w] : [w, h];
  return tableTurn(X, Y, (4 - r) & 3, W, H);
}
// a heading on the table (radians, 0 = +x, counter-clockwise seen from above)
// → a world heading (atan2 of a step in world tiles), and back
export const tableHeading = (a: number, rot: number) => -a + ((rot & 3) * Math.PI) / 2;
export const tableAngle = (h: number, rot: number) => -(h - ((rot & 3) * Math.PI) / 2);

// A table object's frame: world tiles ↔ table metres.
export interface TableObj {
  kind: string;
  x: number;
  y: number;
  rot?: number;
}
export function toWorld(o: TableObj, mx: number, my: number): { x: number; y: number } {
  const kind = o.kind as TableKind;
  const g = TABLES[kind];
  const [tx, ty] = tableTiles(kind, mx, my);
  const [X, Y] = tableTurn(tx, ty, o.rot ?? 0, g.w, g.h);
  return { x: o.x + X, y: o.y + Y };
}
export function toTable(o: TableObj, x: number, y: number): { x: number; y: number } {
  const kind = o.kind as TableKind;
  const g = TABLES[kind];
  const [tx, ty] = tableUnturn(x - o.x, y - o.y, o.rot ?? 0, g.w, g.h);
  const [mx, my] = tableMetres(kind, tx, ty);
  return { x: mx, y: my };
}
// the table's centre in the world
export function tableCentre(o: TableObj): { x: number; y: number } {
  return toWorld(o, 0, 0);
}
// how far a world point is from the table's footprint edge (0 on or inside it)
export function tableAway(o: TableObj, x: number, y: number): number {
  const g = TABLES[o.kind as TableKind];
  const [w, h] = (o.rot ?? 0) % 2 ? [g.h, g.w] : [g.w, g.h];
  const cx = Math.max(o.x, Math.min(x, o.x + w));
  const cy = Math.max(o.y, Math.min(y, o.y + h));
  return Math.hypot(x - cx, y - cy);
}

// Where someone stands to play a spot on the table: just off the rail, on the
// line from the spot back along `heading` (the way the cue points / the way a
// player faces the net), clamped to stay off the table. World tiles.
export function standFor(o: TableObj, mx: number, my: number, heading: number, gap = 0.42): { x: number; y: number } {
  const kind = o.kind as TableKind;
  const g = TABLES[kind];
  // walk back from the spot until off the footprint (rot-0 tiles; the table's
  // y runs up, the tiles' down)
  const [tx, ty] = tableTiles(kind, mx, my);
  const dx = -Math.cos(heading);
  const dy = Math.sin(heading);
  let t = 0;
  const inside = (x: number, y: number) => x > -gap && x < g.w + gap && y > -gap && y < g.h + gap;
  while (t < 6 && inside(tx + dx * t, ty + dy * t)) t += 0.05;
  const [X, Y] = tableTurn(tx + dx * t, ty + dy * t, o.rot ?? 0, g.w, g.h);
  return { x: o.x + X, y: o.y + Y };
}
