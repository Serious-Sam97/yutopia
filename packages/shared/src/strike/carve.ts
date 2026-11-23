// Laying a map out by cells (docs/plan/114-the-strike-park.md, S-M6): a map's mass starts as a block of
// solid cells (the town's buildings, the yard's walls) with its streets, lanes and rooms carved out of
// it; the solid cells left are merged into as few boxes as can be, each with its height and look. Then
// the map adds its details as pieces (crates, low walls, stairs, balconies).

import type { Mat, Piece, Rect } from "./map.ts";

/** A rectangle of cells, inclusive: [c0, r0, c1, r1] (column = x, row = z, row 0 the north). */
export type Cells = [number, number, number, number];

export interface Carving {
  /** a cell's side (m) */
  cell: number;
  /** the north-west corner of cell (0, 0), local metres */
  x0: number;
  z0: number;
  nx: number;
  nz: number;
}

export class Carver {
  readonly solid: Uint8Array;
  /** per cell: its block's height, material, look */
  readonly h: Float32Array;
  readonly m: Mat[];
  readonly look: string[];
  constructor(
    readonly c: Carving,
    h: number,
    m: Mat,
    look = "",
  ) {
    const n = c.nx * c.nz;
    this.solid = new Uint8Array(n).fill(1);
    this.h = new Float32Array(n).fill(h);
    this.m = new Array(n).fill(m);
    this.look = new Array(n).fill(look);
  }
  private each(r: Cells, f: (i: number) => void) {
    const [c0, r0, c1, r1] = r;
    for (let j = Math.max(0, Math.min(r0, r1)); j <= Math.min(this.c.nz - 1, Math.max(r0, r1)); j++)
      for (let i = Math.max(0, Math.min(c0, c1)); i <= Math.min(this.c.nx - 1, Math.max(c0, c1)); i++)
        f(j * this.c.nx + i);
  }
  /** carve cells open */
  open(...rs: Cells[]) {
    for (const r of rs)
      this.each(r, (i) => {
        this.solid[i] = 0;
      });
    return this;
  }
  /** fill cells solid again, with this height/material/look */
  fill(r: Cells, h: number, m: Mat, look = "") {
    this.each(r, (i) => {
      this.solid[i] = 1;
      this.h[i] = h;
      this.m[i] = m;
      this.look[i] = look;
    });
    return this;
  }
  /** restyle the solid cells in r (their height, material, look) */
  style(r: Cells, h: number, m: Mat, look = "") {
    this.each(r, (i) => {
      this.h[i] = h;
      this.m[i] = m;
      this.look[i] = look;
    });
    return this;
  }
  isOpen(col: number, row: number) {
    return !this.solid[row * this.c.nx + col];
  }
  /** a rectangle of cells in local metres */
  rect(r: Cells): Rect {
    const [c0, r0, c1, r1] = r;
    const C = this.c;
    return {
      x0: C.x0 + Math.min(c0, c1) * C.cell,
      z0: C.z0 + Math.min(r0, r1) * C.cell,
      x1: C.x0 + (Math.max(c0, c1) + 1) * C.cell,
      z1: C.z0 + (Math.max(r0, r1) + 1) * C.cell,
    };
  }
  /** a cell's middle in local metres (fractions allowed) */
  at(col: number, row: number): [number, number] {
    return [this.c.x0 + (col + 0.5) * this.c.cell, this.c.z0 + (row + 0.5) * this.c.cell];
  }
  /** the solid cells as boxes: greedy rectangles of cells alike */
  pieces(): Piece[] {
    const C = this.c;
    const done = new Uint8Array(C.nx * C.nz);
    const out: Piece[] = [];
    const same = (a: number, b: number) =>
      this.solid[b] && !done[b] && this.h[a] === this.h[b] && this.m[a] === this.m[b] && this.look[a] === this.look[b];
    for (let j = 0; j < C.nz; j++)
      for (let i = 0; i < C.nx; i++) {
        const a = j * C.nx + i;
        if (!this.solid[a] || done[a]) continue;
        let w = 1;
        while (i + w < C.nx && same(a, j * C.nx + i + w)) w++;
        let hgt = 1;
        grow: for (; j + hgt < C.nz; hgt++) {
          for (let k = 0; k < w; k++) if (!same(a, (j + hgt) * C.nx + i + k)) break grow;
        }
        for (let jj = j; jj < j + hgt; jj++) for (let k = 0; k < w; k++) done[jj * C.nx + i + k] = 1;
        const r = this.rect([i, j, i + w - 1, j + hgt - 1]);
        const look = this.look[a];
        out.push({ k: "box", ...r, y1: this.h[a], m: this.m[a], ...(look ? { look } : {}) });
      }
    return out;
  }
}
