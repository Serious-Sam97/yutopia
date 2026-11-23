// What a bot knows (docs/plan/117-bot-brains.md, phase 6, F6a): what it sees (its view's cone, its level's range, the
// map's walls, smokes, a flash), what it hears (running steps — walking and crouching are quiet —, shots, reloads,
// the charge's plant and defuse, from how far), what it remembers (where each enemy was, fading), and its side's
// shared picture — only what was called on the radio — with where the enemy could be by now (their spawn's walking
// time, sightings, the areas its side has checked).

import type { StrikeMap, Team } from "../map.ts";
import type { Nade } from "../nades.ts";
import { throughSmoke } from "../nades.ts";
import { CHEST, clear, type Know } from "./know.ts";

/** Somewhere it saw or heard an enemy. */
export interface Contact {
  id: string;
  x: number;
  y: number;
  z: number;
  /** s (round clock) */
  at: number;
  /** seen (not just heard) */
  seen: boolean;
}
export type SoundKind = "step" | "shot" | "reload" | "plant" | "defuse" | "land";
export interface Sound {
  kind: SoundKind;
  by: string;
  x: number;
  y: number;
  z: number;
}
/** How far each sound carries (m, at a level's hearing 1). */
export const REACH: Record<SoundKind, number> = { step: 22, shot: 70, reload: 9, plant: 18, defuse: 16, land: 14 };

/** Whether an eye sees a body (its head or its chest) clear of walls and smokes. */
export function seesBody(
  map: StrikeMap,
  smokes: Nade[],
  eye: [number, number, number],
  x: number,
  y: number,
  z: number,
  h: number,
): boolean {
  for (const up of [h - 0.12, Math.min(h - 0.3, CHEST)]) {
    const b: [number, number, number] = [x, y + up, z];
    if (smokes.length && throughSmoke(smokes, eye, b)) continue;
    if (clear(map, eye, b)) return true;
  }
  return false;
}

/** How far into the view's side (0 straight ahead … 1 at its edge, more past it). */
export function offView(yaw: number, x0: number, z0: number, x1: number, z1: number): number {
  const a = Math.atan2(z1 - z0, x1 - x0);
  let d = Math.abs(a - yaw) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d / 1.05;
}

/** A side's shared picture. */
export interface Pic {
  team: Team;
  /** each enemy as last called */
  known: Map<string, Contact>;
  /** per area: how likely an enemy's there now (0…1) */
  threat: Float32Array;
  /** per area: when the side last checked it clear (s) */
  cleared: Float32Array;
  /** per area: when an enemy was last called there (s) */
  calledAt: Float32Array;
}
export const newPic = (k: Know, team: Team): Pic => ({
  team,
  known: new Map(),
  threat: new Float32Array(k.areas.length),
  cleared: new Float32Array(k.areas.length).fill(-99),
  calledAt: new Float32Array(k.areas.length).fill(-99),
});

/** The picture's step: where the enemy could be by now (`t` s into the round), what's been called fading. */
export function picStep(pic: Pic, k: Know, t: number) {
  const them: Team = pic.team === "r" ? "w" : "r";
  const eta = k.eta[them];
  for (let a = 0; a < k.areas.length; a++) {
    // (could they be there yet? — their walking time, a little early for a rush)
    const could = Math.max(0, Math.min(1, (t - eta[a] + 2) / 8));
    // (checked clear: little, coming back over 15 s)
    const since = t - pic.cleared[a];
    const checked = since < 15 ? since / 15 : 1;
    // (called: high, fading over 10 s)
    const called = Math.max(0, 1 - (t - pic.calledAt[a]) / 10);
    pic.threat[a] = Math.max(called, could * checked * 0.6);
  }
  for (const [id, c] of pic.known) if (t - c.at > 20) pic.known.delete(id);
}
/** An enemy called: the picture has them there. */
export function picCall(pic: Pic, k: Know, c: Contact, area: number) {
  pic.known.set(c.id, c);
  if (area >= 0) {
    pic.calledAt[area] = c.at;
    for (const b of k.adj[area] ?? []) pic.calledAt[b] = Math.max(pic.calledAt[b], c.at - 5);
  }
}
/** An area checked and nobody in it. */
export function picClear(pic: Pic, area: number, t: number) {
  if (area >= 0) pic.cleared[area] = t;
}
/** An enemy dead: off the picture. */
export function picGone(pic: Pic, id: string) {
  pic.known.delete(id);
}
