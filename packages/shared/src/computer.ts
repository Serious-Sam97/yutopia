// The studio's computers run VortexOS (docs/plan/19-vortexos.md): one person
// at a time sits down, the real OS runs in their panel, and everyone else sees
// a drawn picture of it on the monitor — the boot, the login, the desktop in
// that person's era with the app they have in front, a screensaver, the
// shutdown. Shared by the world-server (who's at which computer, the rules)
// and the client (the picture, the panel).

import { entry, type WorldObjectDef } from "./catalog.ts";
import { turnLocal } from "./games.ts";
import { topCentre } from "./tops.ts";

export const isComputer = (kind: string): boolean => kind === "computer";

// How near you must be to use one (tiles from it): seated at the desk, or
// standing at it. Walking further than LEAVE_REACH away switches it off.
export const COMPUTER_REACH = 1.9;
export const COMPUTER_LEAVE = COMPUTER_REACH + 1.6;

// What the monitor shows. `boot` plays the power-on self test and the logo by
// the clock from `since` (BOOT_POST_MS + BOOT_LOGO_MS), `shutdown` the
// shutdown screens before the server switches it off (SHUTDOWN_MS).
export const PHASES = ["boot", "login", "desktop", "saver", "shutdown"] as const;
export type ComputerPhase = (typeof PHASES)[number];
export const isPhase = (p: unknown): p is ComputerPhase =>
  typeof p === "string" && (PHASES as readonly string[]).includes(p);
export const BOOT_POST_MS = 2600;
export const BOOT_LOGO_MS = 2400;
export const SHUTDOWN_MS = 3200;
// Without word from the OS (a VortexOS that doesn't speak to Yutopia yet), the
// picture moves on from the boot on its own after this long.
export const BOOT_FALLBACK_MS = BOOT_POST_MS + BOOT_LOGO_MS + 2600;

// VortexOS's eras (its Time Machine): each draws its own chrome.
export const ERAS = ["dos", "nt4", "win95", "win98", "win2000", "winxp", "vista", "win7", "vortex"] as const;
export type Era = (typeof ERAS)[number];
export const isEra = (e: unknown): e is Era => typeof e === "string" && (ERAS as readonly string[]).includes(e);
export const DEFAULT_ERA: Era = "winxp"; // what VortexOS boots in before anyone signs in

// Who's at a computer and what it shows (the world-server's `computers` map,
// by object id).
export interface ComputerView {
  sid: string;
  uid: number;
  name: string;
  phase: ComputerPhase;
  era: Era;
  app: string; // the focused window's app ("" for none)
  user: string; // the VortexOS user name ("" before signing in)
  since: number; // server ms the phase started
}

// Only the shutdown is one-way: everything else may follow anything (a log
// off goes back to the login, a reload back to the boot).
export function nextPhaseOk(from: ComputerPhase, to: ComputerPhase): boolean {
  return from !== "shutdown" && isPhase(to);
}

// An app or user name from the OS: printable, short.
export function cleanLabel(s: unknown, max = 40): string {
  if (typeof s !== "string") return "";
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if (c < 32 || c === 127 || ch === "<" || ch === ">") continue;
    out += ch;
  }
  return out.trim().slice(0, max);
}

// ── the glass ────────────────────────────────────────────────────────────────
// In the item's own 1 × 1 frame (a thing on a desk: round its middle, lifted
// by props.z), rot 0. The monitor faces −y (whoever sits at the desk), so x0
// is the viewer's left: the +x side.
export const COMPUTER_GLASS = { x0: 0.665, x1: 0.335, y: 0.296, z0: 8, z1: 17.6, aspect: 4 / 3 };

// Where the picture goes, in world tiles + iso px (like media.ts glassCorners).
export function computerGlass(o: WorldObjectDef): {
  tl: [number, number];
  tr: [number, number];
  zTop: number;
  zBot: number;
} | null {
  if (!isComputer(o.kind)) return null;
  const g = COMPUTER_GLASS;
  const lift = Number(o.props?.z) || 0;
  const rot = (o.rot ?? 0) & 3;
  const c = topCentre(o);
  const a = turnLocal(g.x0, g.y, rot, 1, 1);
  const b = turnLocal(g.x1, g.y, rot, 1, 1);
  return {
    tl: [c.x - 0.5 + a[0], c.y - 0.5 + a[1]],
    tr: [c.x - 0.5 + b[0], c.y - 0.5 + b[1]],
    zTop: g.z1 + lift,
    zBot: g.z0 + lift,
  };
}

// Whether the iso camera (which sees the +x and +y faces) sees its glass:
// it faces −y at rot 0, +x at rot 1, +y at rot 2.
export function computerFacing(o: WorldObjectDef): boolean {
  const r = (o.rot ?? 0) & 3;
  return r === 1 || r === 2;
}

// ── desks set up before the computers ────────────────────────────────────────
// A monitor on a desk (a tabletop piece) becomes a computer, in its place,
// once: same id, cell, turn and lift.
export function monitorsToComputers(objects: WorldObjectDef[]): {
  objects: WorldObjectDef[];
  changed: WorldObjectDef[];
} {
  const changed: WorldObjectDef[] = [];
  const out = objects.map((o) => {
    if (o.kind !== "tabletop" || o.props?.d !== "monitor") return o;
    const { d: _, ...props } = o.props ?? {};
    const pc: WorldObjectDef = { ...o, kind: "computer", props };
    changed.push(pc);
    return pc;
  });
  return { objects: out, changed };
}

// How far someone is from a computer (its middle).
export function computerAway(o: WorldObjectDef, p: { x: number; y: number }): number {
  if (!entry(o.kind).onSurface) return Number.POSITIVE_INFINITY;
  const c = topCentre(o);
  return Math.hypot(p.x - c.x, p.y - c.y);
}
