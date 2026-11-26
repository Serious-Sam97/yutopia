import type { ClientMessages } from "@yutopia/shared";
import {
  type Flight,
  type FlightShape,
  flightBounds,
  flightRects,
  flightsOf,
  type Structure,
} from "@yutopia/shared/structure";
import type { PolyGhost } from "../model";

// Build mode's stair tool (docs/plan/130-the-house-build.md, phase 6 — F6a): the stairs the panel has (straight, an
// L, a U, a spiral, a ship's ladder; its width, its look, its rail) under the pointer as their footprint — its foot
// on the half metre, R a quarter round, T an L's or a U's turn the other way —, a click builds them, up to the storey
// over them (its hole there, railed round); ⌘/Ctrl and a click on stairs takes them away.

export interface FlightHost {
  structure(): Structure | null;
  level(): number;
  opts(): { shape: FlightShape; width: number; style: string; rail: string; dir: number; turn: 1 | -1 };
  /** how high: up to the storey over this floor (none: up a storey) */
  rise(): number;
  removing(): boolean;
  send(m: ClientMessages["struct:flight"]): void;
  show(polys: PolyGhost[]): void;
}

const snap = (v: number) => Math.round(v * 2) / 2;

export class FlightTool {
  constructor(private h: FlightHost) {}

  private draft(x: number, y: number): Flight {
    const o = this.h.opts();
    return {
      id: "",
      x: snap(x),
      y: snap(y),
      dir: o.dir,
      shape: o.shape,
      turn: o.turn,
      width: o.width,
      rise: this.h.rise(),
      style: o.style,
      rail: o.rail,
    };
  }
  /** The stairs built under (x, y), or null. */
  private under(x: number, y: number): Flight | null {
    const st = this.h.structure();
    if (!st) return null;
    for (const f of flightsOf(st, this.h.level())) {
      const b = flightBounds(f);
      if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) return f;
    }
    return null;
  }

  hover(x: number, y: number) {
    if (this.h.removing()) {
      const f = this.under(x, y);
      this.h.show(f ? flightRects(f).map((r) => ({ pts: r, ok: true, closed: true, remove: true })) : []);
      return;
    }
    this.h.show(flightRects(this.draft(x, y)).map((r) => ({ pts: r, ok: true, closed: true })));
  }
  click(x: number, y: number) {
    const level = this.h.level();
    if (this.h.removing()) {
      const f = this.under(x, y);
      if (f) this.h.send({ level, remove: f.id });
      return;
    }
    const f = this.draft(x, y);
    this.h.send({
      level,
      add: { x: f.x, y: f.y, dir: f.dir, shape: f.shape, turn: f.turn, width: f.width, style: f.style, rail: f.rail },
    });
  }
}
