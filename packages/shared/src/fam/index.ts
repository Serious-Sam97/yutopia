import * as decor2 from "./decor2.ts";
import * as desktop2 from "./desktop2.ts";
import * as doors2 from "./doors2.ts";
import * as floor2 from "./floor2.ts";
import * as gameroom from "./gameroom.ts";
import * as kitchen from "./kitchen.ts";
import * as lights2 from "./lights2.ts";
import * as music from "./music.ts";
import * as office2 from "./office2.ts";
import * as outdoors from "./outdoors.ts";
import * as parkour2 from "./parkour2.ts";
import * as pets2 from "./pets2.ts";
import * as screens2 from "./screens2.ts";
import * as seasons from "./seasons.ts";
import * as seating2 from "./seating2.ts";
import * as storage2 from "./storage2.ts";
import * as tables2 from "./tables2.ts";
import * as walls2 from "./walls2.ts";

// Plan 68's families (docs/plan/68-more-furniture.md, phases 3–20), each its own file: merged here
// and spread into the shared tables.
export const FAM_CATALOG = {
  ...seating2.CATALOG,
  ...tables2.CATALOG,
  ...storage2.CATALOG,
  ...office2.CATALOG,
  ...desktop2.CATALOG,
  ...screens2.CATALOG,
  ...gameroom.CATALOG,
  ...music.CATALOG,
  ...lights2.CATALOG,
  ...walls2.CATALOG,
  ...doors2.CATALOG,
  ...decor2.CATALOG,
  ...floor2.CATALOG,
  ...pets2.CATALOG,
  ...parkour2.CATALOG,
  ...kitchen.CATALOG,
  ...outdoors.CATALOG,
  ...seasons.CATALOG,
};
export const FAM_SHAPES = {
  ...seating2.SHAPES,
  ...tables2.SHAPES,
  ...storage2.SHAPES,
  ...office2.SHAPES,
  ...desktop2.SHAPES,
  ...screens2.SHAPES,
  ...gameroom.SHAPES,
  ...music.SHAPES,
  ...lights2.SHAPES,
  ...walls2.SHAPES,
  ...doors2.SHAPES,
  ...decor2.SHAPES,
  ...floor2.SHAPES,
  ...pets2.SHAPES,
  ...parkour2.SHAPES,
  ...kitchen.SHAPES,
  ...outdoors.SHAPES,
  ...seasons.SHAPES,
};
export const FAM_SEATS = {
  ...seating2.SEATS,
  ...tables2.SEATS,
  ...storage2.SEATS,
  ...office2.SEATS,
  ...desktop2.SEATS,
  ...screens2.SEATS,
  ...gameroom.SEATS,
  ...music.SEATS,
  ...lights2.SEATS,
  ...walls2.SEATS,
  ...doors2.SEATS,
  ...decor2.SEATS,
  ...floor2.SEATS,
  ...pets2.SEATS,
  ...parkour2.SEATS,
  ...kitchen.SEATS,
  ...outdoors.SEATS,
  ...seasons.SEATS,
};
export const FAM_SURFACES = {
  ...seating2.SURFACES,
  ...tables2.SURFACES,
  ...storage2.SURFACES,
  ...office2.SURFACES,
  ...desktop2.SURFACES,
  ...screens2.SURFACES,
  ...gameroom.SURFACES,
  ...music.SURFACES,
  ...lights2.SURFACES,
  ...walls2.SURFACES,
  ...doors2.SURFACES,
  ...decor2.SURFACES,
  ...floor2.SURFACES,
  ...pets2.SURFACES,
  ...parkour2.SURFACES,
  ...kitchen.SURFACES,
  ...outdoors.SURFACES,
  ...seasons.SURFACES,
};
export const FAM_STANDS = {
  ...seating2.STANDS,
  ...tables2.STANDS,
  ...storage2.STANDS,
  ...office2.STANDS,
  ...desktop2.STANDS,
  ...screens2.STANDS,
  ...gameroom.STANDS,
  ...music.STANDS,
  ...lights2.STANDS,
  ...walls2.STANDS,
  ...doors2.STANDS,
  ...decor2.STANDS,
  ...floor2.STANDS,
  ...pets2.STANDS,
  ...parkour2.STANDS,
  ...kitchen.STANDS,
  ...outdoors.STANDS,
  ...seasons.STANDS,
};
export const FAM_HANGS = {
  ...seating2.HANGS,
  ...tables2.HANGS,
  ...storage2.HANGS,
  ...office2.HANGS,
  ...desktop2.HANGS,
  ...screens2.HANGS,
  ...gameroom.HANGS,
  ...music.HANGS,
  ...lights2.HANGS,
  ...walls2.HANGS,
  ...doors2.HANGS,
  ...decor2.HANGS,
  ...floor2.HANGS,
  ...pets2.HANGS,
  ...parkour2.HANGS,
  ...kitchen.HANGS,
  ...outdoors.HANGS,
  ...seasons.HANGS,
};
/** Each family's kinds in its own order (the Furnish panel puts them in their categories). */
export const FAM_KINDS: Record<string, string[]> = {
  seating2: Object.keys(seating2.CATALOG),
  tables2: Object.keys(tables2.CATALOG),
  storage2: Object.keys(storage2.CATALOG),
  office2: Object.keys(office2.CATALOG),
  desktop2: Object.keys(desktop2.CATALOG),
  screens2: Object.keys(screens2.CATALOG),
  gameroom: Object.keys(gameroom.CATALOG),
  music: Object.keys(music.CATALOG),
  lights2: Object.keys(lights2.CATALOG),
  walls2: Object.keys(walls2.CATALOG),
  doors2: Object.keys(doors2.CATALOG),
  decor2: Object.keys(decor2.CATALOG),
  floor2: Object.keys(floor2.CATALOG),
  pets2: Object.keys(pets2.CATALOG),
  parkour2: Object.keys(parkour2.CATALOG),
  kitchen: Object.keys(kitchen.CATALOG),
  outdoors: Object.keys(outdoors.CATALOG),
  seasons: Object.keys(seasons.CATALOG),
};
