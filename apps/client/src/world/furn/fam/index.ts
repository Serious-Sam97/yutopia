import type { Look, Model } from "../kit";
import * as decor2 from "./decor2";
import * as desktop2 from "./desktop2";
import * as doors2 from "./doors2";
import * as floor2 from "./floor2";
import * as gameroom from "./gameroom";
import * as kitchen from "./kitchen";
import * as lights2 from "./lights2";
import * as music from "./music";
import * as office2 from "./office2";
import * as outdoors from "./outdoors";
import * as parkour2 from "./parkour2";
import * as pets2 from "./pets2";
import * as screens2 from "./screens2";
import * as seasons from "./seasons";
import * as seating2 from "./seating2";
import * as storage2 from "./storage2";
import * as tables2 from "./tables2";
import * as walls2 from "./walls2";

// Plan 68's families (docs/plan/68-more-furniture.md, phases 3–20): each its own file, merged here
// for native.ts (drawn, signed: each family goes in when it's built).
export const FAM_LOOKS: Record<string, readonly string[]> = {
  ...seating2.LOOKS,
  ...tables2.LOOKS,
  ...storage2.LOOKS,
  ...office2.LOOKS,
  ...desktop2.LOOKS,
  ...screens2.LOOKS,
  ...gameroom.LOOKS,
  ...music.LOOKS,
  ...lights2.LOOKS,
  ...walls2.LOOKS,
  ...doors2.LOOKS,
  ...decor2.LOOKS,
  ...floor2.LOOKS,
  ...pets2.LOOKS,
  ...parkour2.LOOKS,
  ...kitchen.LOOKS,
  ...outdoors.LOOKS,
  ...seasons.LOOKS,
};
export const FAM_DRAW: Record<string, (m: Model, o: Look) => void> = {
  ...seating2.DRAW,
  ...tables2.DRAW,
  ...storage2.DRAW,
  ...office2.DRAW,
  ...desktop2.DRAW,
  ...screens2.DRAW,
  ...gameroom.DRAW,
  ...music.DRAW,
  ...lights2.DRAW,
  ...walls2.DRAW,
  ...doors2.DRAW,
  ...decor2.DRAW,
  ...floor2.DRAW,
  ...pets2.DRAW,
  ...parkour2.DRAW,
  ...kitchen.DRAW,
  ...outdoors.DRAW,
  ...seasons.DRAW,
};
