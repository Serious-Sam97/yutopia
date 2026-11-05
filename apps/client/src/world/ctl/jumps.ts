import { isJump, type JumpNow, jumpArc, jumpNowAt } from "@yutopia/shared";
import type { Player } from "@yutopia/state";
import type { WorldController } from "../controller";
import { jumps, loadJumps } from "../jumps-load";
import { steps } from "../steps-load";
import { INTERP_MS, type Remote } from "./common";

/** What Jumps reads of the WorldController (plan 72 phase 4: its dependencies, said). */
export type JumpsHost = Pick<
  WorldController,
  | "groundUnder"
  | "height"
  | "inLiftCar"
  | "jumpHold"
  | "jumpStages"
  | "jumpTrack"
  | "me"
  | "model"
  | "room"
  | "steps"
  | "tp"
  | "water"
>;

export class Jumps {
  constructor(private readonly c: JumpsHost) {}

  // my jump as the views show it, my feet's height and what's under them
  myJump(now: number): { jump?: JumpNow; z: number; ground: number } {
    const h = this.c.height;
    // (what's really under me — up on a roof, the roof — as the move core has it)
    const ground = this.c.groundUnder(this.c.me.x, this.c.me.y, h.z);
    const hold = this.c.jumpHold;
    if (hold) return { jump: jumpNowAt(hold.kind, hold.t) ?? undefined, z: h.z + jumpArc(hold.kind, hold.t).h, ground };
    return { jump: this.c.jumpTrack.update(now, h.up) ?? undefined, z: h.z, ground };
  }

  // someone's Flowmotion move: from when it showed up here, as late as their position is drawn
  theirFlow(r: Remote, p: Player, now: number): { flowCode: number; flowAt: number } {
    const f = p.flow ?? 0;
    if (f !== r.flow) {
      r.flow = f;
      r.flowAt = now + INTERP_MS;
    }
    return { flowCode: f, flowAt: r.flowAt };
  }

  // someone else's: from when it showed up here, as late as their position is drawn
  theirJump(r: Remote, p: Player, at: { x: number; y: number; z: number }, now: number) {
    const key = `${p.jump}|${p.jumpAt}`;
    if (key !== r.jumpKey) {
      r.jumpKey = key;
      if (isJump(p.jump)) r.track.begin(p.jump, now + INTERP_MS);
      r.verbAt = now + INTERP_MS;
      void loadJumps();
    }
    const ground = this.c.groundUnder(at.x, at.y, at.z);
    // (afloat in the water isn't in the air: plan 66)
    const jump = r.track.update(now, at.z > ground + 0.03 && !this.c.water.swimOf(at.x, at.y, at.z)) ?? undefined;
    return { jump, z: at.z, ground };
  }

  // dust kicked up at take-off and thrown out on landing, a whoosh, a thud (`near`: 0..1, how loud)
  jumpEffects(id: string, st: { x: number; y: number; jump?: JumpNow; ground?: number }, near: number) {
    const stage = st.jump?.stage ?? "";
    const was = this.c.jumpStages.get(id) ?? "";
    if (stage === was) return;
    if (stage) this.c.jumpStages.set(id, stage);
    else this.c.jumpStages.delete(id);
    const j = st.jump;
    if (!j) return;
    const hard = j.kind !== "hop" ? 1 : 0.6;
    // (up on something the dust is on its top)
    const lift = st.ground ?? 0;
    // (the soles off and onto what's under them: the steps' recordings, once they're in)
    const S = steps();
    const pan =
      id === this.c.room?.sessionId
        ? 0
        : { pan: this.c.tp?.pan(this.c.me, st) ?? 0, lp: this.c.steps.ears.lp?.({ id, ...st }) ?? 0 };
    if (stage === "air" && was === "crouch") {
      this.c.model?.puff(st.x, st.y, "kick", lift, hard);
      if (near > 0) jumps()?.jumpSound(j.kind, near);
      if (near > 0 && S)
        this.c.steps.stepPlayer(S).step(this.c.steps.footingAt(st.x, st.y, st.ground ?? 0), {
          gait: "sprint",
          shoe: "soft",
          gain: near * 0.8,
          pan,
        });
    } else if (stage === "land") {
      this.c.model?.puff(st.x, st.y, "land", lift, hard);
      const f = this.c.steps.footingAt(st.x, st.y, st.ground ?? 0);
      if (near > 0) jumps()?.landSound(j.kind, f, near, !S);
      if (near > 0 && S) {
        this.c.steps.stepPlayer(S).land(f, hard, { gain: near, pan, thud: false });
        // (in a lift's car: its floor on its cables answers)
        if (this.c.inLiftCar(st.x, st.y)) this.c.steps.stepPlayer(S).liftCar(hard, near, pan);
      }
    }
  }
}
