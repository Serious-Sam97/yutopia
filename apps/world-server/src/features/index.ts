import type { ChatScope } from "@yutopia/shared";
import type { SpaceClient, SpaceRoom } from "../SpaceRoom.ts";
import type { Player } from "../schema.ts";

// Room features (rituals, radio, whiteboard, Vortex…) plug into these hooks so
// SpaceRoom stays about movement, hearing and presence.
export interface Feature {
  tick?(dt: number, now: number): void;
  join?(client: SpaceClient, p: Player): void;
  leave?(client: SpaceClient, p: Player): void;
  areaChange?(client: SpaceClient, p: Player, from: string, to: string): void;
  chat?(client: SpaceClient, p: Player, text: string, scope: ChatScope): void;
  dispose?(): void;
}

type Installer = (room: SpaceRoom) => Feature;
const installers: Installer[] = [];

export function registerFeature(i: Installer) {
  installers.push(i);
}

export function installFeatures(room: SpaceRoom): Feature[] {
  return installers.map((i) => i(room));
}
