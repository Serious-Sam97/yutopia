import type { Player } from "../schema.ts";
import type { WorldClient, WorldRoom } from "../WorldRoom.ts";

// Room features (rituals, radio, whiteboard, Vortex…) plug into these hooks so
// WorldRoom stays about movement, hearing and presence.
export interface Feature {
  tick?(dt: number, now: number): void;
  join?(client: WorldClient, p: Player): void;
  leave?(client: WorldClient, p: Player): void;
  // the line dropped (a closed tab, the network): the room keeps them for
  // RECONNECT_SECONDS, then leave() — unless they're back() first, on a new client
  drop?(client: WorldClient, p: Player): void;
  back?(client: WorldClient, p: Player): void;
  areaChange?(client: WorldClient, p: Player, from: string, to: string): void;
  // someone went to another floor (the stairs, an elevator, a teleport)
  levelChange?(client: WorldClient, p: Player, from: number, to: number): void;
  dispose?(): void;
}

type Installer = (room: WorldRoom) => Feature;
const installers: Installer[] = [];
/** Each feature's name (its file's), in install order: a slow tick says whose (metrics.ts). */
export const featureNames: string[] = [];

export function registerFeature(i: Installer) {
  installers.push(i);
  // (the file that registered it, off the call's stack)
  const at = /features\/([\w-]+)\.ts/.exec(new Error().stack?.split("\n").slice(2).join("\n") ?? "")?.[1];
  featureNames.push(at ?? `feature ${installers.length}`);
}

export function installFeatures(room: WorldRoom): Feature[] {
  return installers.map((i) => i(room));
}
