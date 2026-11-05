import { type Point, placedFootprint } from "@yutopia/shared";
import { CABLE_REACH, gap } from "@yutopia/shared/games";
import { tr } from "@/lib/i18n";
import { mixer } from "../audio";
import type { WorldController } from "../controller";
import { hud, toast } from "../store";

/** What Cable reads of the WorldController (plan 72 phase 4: its dependencies, said). */
export type CableHost = Pick<WorldController, "me" | "model">;

export class Cable {
  constructor(private readonly c: CableHost) {}

  // ── a console's cable: taken from its panel, plugged in at a TV ─────────
  grabCable(consoleId: string) {
    mixer.blip("click");
    hud.set({ cable: { consoleId }, panel: { kind: null } });
  }

  dropCable(why?: string) {
    if (!hud.get().cable) return;
    hud.set({ cable: null });
    if (why) toast(why, "warn");
  }

  // still in hand: the console's there, not plugged in yet, and I haven't
  // walked further off than the cable goes
  checkCable() {
    const c = hud.get().cable;
    if (!c) return;
    const o = this.c.model?.getObject(c.consoleId);
    if (!o) return this.dropCable();
    if (typeof o.props?.tv === "string") {
      mixer.blip("pop");
      return this.dropCable();
    }
    const { w, h } = placedFootprint(o);
    const me = { x: this.c.me.x, y: this.c.me.y, w: 0, h: 0 };
    if (gap({ x: o.x, y: o.y, w, h }, me) > CABLE_REACH + 2) this.dropCable(tr("cableTooFar"));
  }

  // the cable from the console to my hands (the 3D view draws it)
  cableEnds(): { from: Point; to: Point } | null {
    const c = hud.get().cable;
    const o = c ? this.c.model?.getObject(c.consoleId) : undefined;
    if (!o) return null;
    return { from: { x: o.x + 0.5, y: o.y + 0.3 }, to: { x: this.c.me.x, y: this.c.me.y } };
  }
}
