import { entry, type WorldObjectDef } from "./catalog.ts";
import { isHeld } from "./held.ts";

// The action menu, Sims-style: click a thing or a person and pick what to do.
// Picks queue up and play out in order (walk there, do it, the next one). The
// first action of a thing is what X does next to it. Labels are i18n keys on
// the client (`act_<id>`).

export type ObjectAction =
  | "sit"
  | "brew"
  | "pour"
  | "buy"
  | "play"
  | "tune"
  | "race"
  | "watch"
  | "open"
  | "lightOn"
  | "lightOff"
  | "roomLightsOn"
  | "roomLightsOff"
  | "musicOn"
  | "musicOff"
  | "doorOpen"
  | "doorClose"
  | "doorLock"
  | "doorUnlock"
  | "work"
  | "focus"
  | "unfocus"
  | "openCard"
  | "fillFood"
  | "fillWater"
  | "takeBall"
  | "takeFrisbee"
  | "takeRope"
  | "takeFeather"
  | "takeLaser"
  | "useComputer";

export interface ActionContext {
  uid: number;
  focus: boolean; // I'm focusing (at my desk, headphones on)
  mayLock: (o: WorldObjectDef) => boolean; // the room's owner or a builder
  radioOn: boolean;
  task: { ticket: string } | null; // my current Yondra card, if any
}

// Things that hand out a drink, and things you sit on.
const SEATS = new Set(["chair", "armchair", "beanbag", "bench", "sofa"]);

export function objectActions(o: WorldObjectDef, ctx: ActionContext): ObjectAction[] {
  const e = entry(o.kind);
  const props = o.props ?? {};
  const out: ObjectAction[] = [];
  if (SEATS.has(o.kind)) out.push("sit");
  if (o.kind === "desk" && props.ownerId === ctx.uid) {
    // my desk: sit down to work, with focus on or off
    out.push(ctx.focus ? "unfocus" : "focus", "work");
    if (ctx.task) out.push("openCard");
  }
  switch (e.interact) {
    case "coffee":
      out.push("brew");
      break;
    case "water":
      out.push("pour");
      break;
    case "vending":
      out.push("buy");
      break;
    case "piano":
      out.push("play", "tune");
      break;
    case "arcade":
      out.push("play");
      break;
    case "slotcar":
      out.push("race");
      break;
    case "pool":
    case "pong":
      out.push("play");
      break;
    case "console":
      out.push("play");
      break;
    case "computer":
      out.push("useComputer");
      break;
    case "tv":
      out.push("watch");
      break;
    case "lamp":
      out.push(props.on === false ? "lightOn" : "lightOff");
      break;
    case "switch":
      out.push(props.on === false ? "roomLightsOn" : "roomLightsOff");
      break;
    case "radio":
      out.push(ctx.radioOn ? "musicOff" : "musicOn", "open");
      break;
    case "petbowl":
      out.push("fillFood");
      break;
    case "waterbowl":
      out.push("fillWater");
      break;
    case "toybox":
      out.push("takeBall", "takeFrisbee", "takeRope", "takeFeather", "takeLaser");
      break;
    case "door": {
      const st = String(props.state ?? "open");
      if (st === "locked") {
        if (ctx.mayLock(o)) out.push("doorUnlock");
      } else {
        out.push(st === "closed" ? "doorOpen" : "doorClose");
        if (ctx.mayLock(o)) out.push("doorLock");
      }
      break;
    }
    case undefined:
      break;
    default:
      out.push("open");
  }
  // a desk lamp on a desk (a tabletop piece): switched like a lamp
  if (o.kind === "tabletop" && props.d === "desklamp") out.push(props.on === false ? "lightOn" : "lightOff");
  return out;
}

// Whether clicking it outside build mode does anything (cheap: checked as the
// pointer moves) — things you use, seats, assigned desks, desk lamps.
export function hasActions(o: WorldObjectDef): boolean {
  if (entry(o.kind).interact || SEATS.has(o.kind)) return true;
  if (o.kind === "desk") return !!o.props?.ownerId;
  return o.kind === "tabletop" && o.props?.d === "desklamp";
}

// ── between people ──────────────────────────────────────────────────────────
export const SOCIAL = ["wave", "highfive", "fistbump", "cheers", "give"] as const;
export type Social = (typeof SOCIAL)[number];
export const isSocial = (s: unknown): s is Social => typeof s === "string" && (SOCIAL as readonly string[]).includes(s);

// How long each one takes (ms), and when the hands meet (0..1 of it).
export const SOCIAL_MS: Record<Social, number> = {
  wave: 2200,
  highfive: 1500,
  fistbump: 1400,
  cheers: 1700,
  give: 1500,
};
export const CONTACT = 0.45;
// how close you have to be (tiles between the two); a wave carries across a room
export const SOCIAL_REACH: Record<Social, number> = { wave: 7, highfive: 1.7, fistbump: 1.7, cheers: 1.7, give: 1.7 };
// the other one's side of it (a give is a take)
export const answerOf = (s: Social): string => (s === "give" ? "take" : s);

export interface SocialSide {
  held: string;
  status: string;
}

// What I can do with someone right now (the menu greys out the rest).
export function socialFor(me: SocialSide, them: SocialSide): Social[] {
  const out: Social[] = ["wave"];
  // nobody gets bumped while they've asked not to be disturbed
  if (them.status === "dnd") return out;
  out.push("highfive", "fistbump");
  if (isHeld(me.held) && isHeld(them.held)) out.push("cheers");
  if (isHeld(me.held) && !them.held) out.push("give");
  return out;
}
