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
}

const PRIVATE: AreaKind[] = ["private", "booth", "standup"];

export function isPrivate(a: AreaDef | null): boolean {
  return !!a && PRIVATE.includes(a.kind);
}

// 0 = can't hear, (0..1] = volume before stereo panning.
export function hearingGain(map: MapDef, listener: Ear, speaker: Ear, wasHearing = false): number {
  if (listener.dnd || speaker.dnd) return 0;
  const la = areaAt(map, listener.x, listener.y);
  const sa = areaAt(map, speaker.x, speaker.y);
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

// Stereo position in [-1, 1] from where the speaker is on screen relative to me.
export function stereoPan(listener: Ear, speaker: Ear): number {
  const sx = speaker.x - speaker.y - (listener.x - listener.y);
  return Math.max(-1, Math.min(1, sx / 6));
}
