import { aboveOf, across, belowOf, homeOf, levelMap, spaceFloor } from "./levels.ts";
import { type AreaDef, type AreaKind, areaAt, type MapDef } from "./map.ts";

// Who hears whom. The world-server runs this to decide LiveKit subscriptions
// (so it's enforced), the client runs it to set volume and stereo position.

export const HEAR_RADIUS = 6; // tiles, open floor
export const HEAR_FULL = 1.6; // full volume inside this
export const CROSS_ROOM_RADIUS = 3; // open rooms joined by a doorway
export const HYSTERESIS = 1; // keep hearing until R + this, to avoid flapping

export interface Ear {
  x: number;
  y: number;
  dnd?: boolean;
  level?: number; // the floor (levels.ts; none: the home floor)
  stairs?: boolean; // in a stairwell: voices carry one floor up and down it, faintly
}

const STAIRWELL_GAIN = 0.3;

const PRIVATE: AreaKind[] = ["private", "booth", "standup"];

export function isPrivate(a: AreaDef | null): boolean {
  return !!a && PRIVATE.includes(a.kind);
}

// 0 = can't hear, (0..1] = volume before stereo panning. `map`: the building
// (its home map); each ear says its floor. Other floors are silent — but in the
// stairwell, one floor up or down, faintly.
export function hearingGain(map: MapDef, listener: Ear, speaker: Ear, wasHearing = false): number {
  if (listener.dnd || speaker.dnd) return 0;
  const home = homeOf(map);
  // (plan 112: a town building's ground storey is the land's to the ears — its door open on the street, as the
  // walk-ins were; its storeys a stairwell apart as the HQ's floors are)
  const ear = (l: number) => (spaceFloor(l)?.storey === 0 ? 0 : l);
  const l0 = listener.level ?? home;
  const s0 = speaker.level ?? home;
  const ll = ear(l0);
  const sl = ear(s0);
  if (ll !== sl) {
    const next = aboveOf(l0) === s0 || belowOf(l0) === s0;
    if (!next || !listener.stairs || !speaker.stairs) return 0;
    const s = across(map, sl, ll, speaker);
    return Math.hypot(listener.x - s.x, listener.y - s.y) < HEAR_RADIUS ? STAIRWELL_GAIN : 0;
  }
  // (each ear's rooms its own floor's: the street's and a ground storey's are two floors' — a private room built in
  // one stays private — plan 113 review)
  const on = (l: number) => (l !== home ? (levelMap(map, l) ?? map) : map);
  const la = areaAt(on(l0), listener.x, listener.y);
  const sa = areaAt(on(s0), speaker.x, speaker.y);
  if (sa?.kind === "stage") return 1;
  if (isPrivate(la) || isPrivate(sa)) return la?.key === sa?.key ? 1 : 0;
  const d = Math.hypot(listener.x - speaker.x, listener.y - speaker.y);
  const sameRoom = (la?.key ?? null) === (sa?.key ?? null) || la?.kind === "stage" || !la || !sa;
  const radius = (sameRoom ? HEAR_RADIUS : CROSS_ROOM_RADIUS) + (wasHearing ? HYSTERESIS : 0);
  if (d >= radius) return 0;
  if (d <= HEAR_FULL) return 1;
  const t = (d - HEAR_FULL) / (radius - HEAR_FULL);
  // smooth falloff, never fully silent while still "in range"
  return Math.max(0.04, 1 - t * t * (3 - 2 * t));
}
