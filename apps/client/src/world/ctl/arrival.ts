import type { Point } from "@yutopia/shared";
import type { WorldController } from "../controller";
import { hud } from "../store";

/** What Arrival reads of the WorldController (plan 72 phase 4: its dependencies, said). */
export type ArrivalHost = Pick<WorldController, "actions" | "grid" | "model" | "send">;

export class Arrival {
  constructor(private readonly c: ArrivalHost) {}

  // ── my own arrival point (features/arrival.ts on the server) ─────────────
  arrivalAsked = false; // I changed it this session (so the pin flashes)

  arrivalFlash: ReturnType<typeof setTimeout> | null = null;

  // choose it on the map: the next floor click sets it (Esc cancels)
  pickArrival(on: boolean) {
    hud.set({ pickArrival: on, menu: null });
    if (on) this.c.actions.clear();
    if (this.arrivalFlash) clearTimeout(this.arrivalFlash);
    this.c.model?.showMine(on ? hud.get().mySpawn : null);
  }

  // here (a tile), or null: back to the space's arrival point
  setArrival(at: Point | null) {
    this.arrivalAsked = true;
    this.c.send("spawn:mine", { at: at && { x: Math.floor(at.x), y: Math.floor(at.y) } });
    if (hud.get().pickArrival) this.pickArrival(false);
  }

  hoverArrival(x: number, y: number) {
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    const ok = this.c.grid.ok(tx, ty) && this.c.grid.fits(tx + 0.5, ty + 0.5);
    this.c.model?.showMine(hud.get().mySpawn, { x: tx, y: ty, ok });
  }

  flashArrival() {
    if (this.arrivalFlash) clearTimeout(this.arrivalFlash);
    this.c.model?.showMine(hud.get().mySpawn);
    this.arrivalFlash = setTimeout(() => {
      if (!hud.get().pickArrival) this.c.model?.showMine(null);
    }, 2500);
  }
}
