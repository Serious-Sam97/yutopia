import type { Player } from "../schema.ts";
import type { WorldClient, WorldRoom } from "../WorldRoom.ts";

// Room features (rituals, radio, whiteboard, Vortex…) plug into these hooks so
// WorldRoom stays about movement, hearing and presence.
export interface Feature {
  tick?(dt: number, now: number): void;
  join?(client: WorldClient, p: Player): void;
  leave?(client: WorldClient, p: Player): void;
  areaChange?(client: WorldClient, p: Player, from: string, to: string): void;
  // someone went to another floor (the stairs, an elevator, a teleport)
  levelChange?(client: WorldClient, p: Player, from: number, to: number): void;
  dispose?(): void;
}

type Installer = (room: WorldRoom) => Feature;
const installers: Installer[] = [];

export function registerFeature(i: Installer) {
  installers.push(i);
}

export function installFeatures(room: WorldRoom): Feature[] {
  return installers.map((i) => i(room));
}
