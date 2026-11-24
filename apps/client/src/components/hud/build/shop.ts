// Build mode's catalog as data (docs/plan/124-the-build-view.md, phase 4): every thing in it, sorted twice as The
// Sims 3's Buy mode sorts — By Room (where it goes) and By Function (what it's for, with its subcategories) — and
// what goes to the Build tab instead (doors, windows, stairs). No React: Catalog.tsx shows it, shop.test.ts checks
// every thing has its places. (The categories it grew from, plans 67/68/113, are kept as `CATS`.)
import { entry, FAM_KINDS } from "@yutopia/shared";
import { addStrings, type Key, trMaybe } from "@/lib/i18n";
import type { IconName } from "../icons";

// A catalog entry: a kind, and for decor what it is (props.d).
export interface Item {
  key: string;
  kind: string;
  props?: Record<string, unknown>;
}
export const it = (kind: string): Item => ({ key: kind, kind });
const decor = (kind: "decor" | "tabletop" | "frame", d: string): Item => ({
  key: `${kind}:${d}`,
  kind,
  props: { d, seed: 0.37 },
});
// (plan 68's families, in their own order: shared fam/)
const fam = (...names: string[]): Item[] => names.flatMap((n) => FAM_KINDS[n] ?? []).map(it);

export const CATS: { key: string; label: Key; icon: IconName; items: Item[] }[] = [
  {
    key: "seating",
    label: "catSeating",
    icon: "sofa",
    items: [...["chair", "armchair", "sofa", "loveseat", "beanbag", "bench", "bar_stool"].map(it), ...fam("seating2")],
  },
  {
    // (plan 113: the town's buildings' own — a bedroom's, a diner's and a bar's, a grocery's, a barn's)
    key: "town",
    label: "catTown",
    icon: "home",
    items: fam("town"),
  },
  {
    key: "surfaces",
    label: "catSurfaces",
    icon: "desk",
    items: [
      "desk",
      "standing_desk",
      "meeting_table",
      "coffee_table",
      "side_table",
      "high_table",
      "reception",
      "counter",
    ]
      .map(it)
      .concat(fam("tables2")),
  },
  {
    // (plan 67: what holds things, and the office's own pieces)
    key: "storage",
    label: "catStorage",
    icon: "board",
    items: [
      "cupboard",
      "bookcase",
      "shelving",
      "tape_shelf",
      "filing_cabinet",
      "locker", // (a kit a day: docs/plan/30-the-dark.md)
      "coat_rack",
      "wall_shelf",
    ]
      .map(it)
      .concat(fam("storage2")),
  },
  {
    key: "office",
    label: "catOffice",
    icon: "hammer",
    items: ["printer", "phone_booth", "partition", "water_cooler", "vending"]
      .map(it)
      .concat(fam("office2").filter((i) => i.kind !== "drinks_fridge")),
  },
  {
    // what goes on them: as many as fit, a quarter tile at a time
    key: "tops",
    label: "catTops",
    icon: "mug",
    items: [
      it("computer"),
      ...(["keyboard", "desklamp", "phone"] as const).map((d) => decor("tabletop", d)),
      it("radio"),
      it("turntable"),
      ...(["mug", "papers", "book", "binder", "tapes", "vinyl", "photo", "succulent", "cards", "bell"] as const).map(
        (d) => decor("tabletop", d),
      ),
      ...fam("desktop2"),
    ],
  },
  {
    // YouTube / Jellyfin on them for everyone nearby (docs/plan/10-media.md)
    key: "screens",
    label: "catScreens",
    icon: "tv",
    items: [
      "tv_wall",
      "tv_hd",
      "tv_giant",
      "projector_screen",
      "cinema_screen",
      "projector",
      "tv_console",
      "tv_portable",
      "computer",
    ]
      .map(it)
      .concat(fam("screens2")),
  },
  {
    key: "games",
    label: "catGames",
    icon: "gamepad",
    items: [
      "crt_tv",
      "console_2600",
      "console_nes",
      "console_snes",
      "console_md",
      "console_gb",
      "console_ps1",
      "console_ps1_slim",
      "cart_shelf",
      "disc_rack",
    ]
      .map(it)
      .concat(fam("gameroom")),
  },
  {
    key: "tech",
    label: "catTech",
    icon: "radio",
    items: ["arcade", "slot_track", "pool_table", "pingpong_table", "piano", "mixing_desk", "speaker_cab", "mic_stand"]
      .map(it)
      .concat(fam("music")),
  },
  {
    key: "lights",
    label: "catLights",
    icon: "globe",
    items: [
      it("lamp"),
      it("pendant_light"),
      it("panel_light"),
      it("lava_lamp"),
      decor("tabletop", "desklamp"),
      ...fam("lights2"),
    ],
  },
  {
    key: "walls",
    label: "catWalls",
    icon: "frame",
    items: [
      ...[
        "board_wall",
        "screen_wall",
        "whiteboard",
        "notice_board",
        "clock",
        "neon",
        "light_switch",
        "acoustic_panel",
        "poster",
        "marquee_sign",
        "vfd_ticker",
        "split_flap",
      ].map(it),
      decor("frame", "frame"),
      ...fam("walls2"),
    ],
  },
  {
    // set into a wall (shared openings.ts): the wall keeps its material
    key: "doors",
    label: "catDoors",
    icon: "door",
    items: [
      // (shown shut in the catalog; they go in open)
      { key: "door", kind: "door", props: { state: "closed" } },
      { key: "door:glass", kind: "door", props: { glass: true, state: "closed" } },
      { key: "door_double", kind: "door_double", props: { state: "closed" } },
      { key: "door_studio", kind: "door_studio", props: { state: "closed" } },
      { key: "door_barn", kind: "door_barn", props: { state: "closed" } },
      { key: "door_saloon", kind: "door_saloon", props: { state: "closed" } },
      ...["door_auto", "door_revolving", "door_garage"].map((k) => ({ key: k, kind: k, props: { state: "closed" } })),
      it("archway"),
    ],
  },
  {
    // windows, set into a wall the same way
    key: "windows",
    label: "catWindows",
    icon: "window",
    items: [
      it("window"),
      it("window_wide"),
      it("window_tall"),
      it("window_round"),
      it("window_arched"),
      it("window_high"),
      it("window_stained"),
      it("window_blinds"),
      it("window_studio"),
      ...fam("doors2"),
    ],
  },
  {
    key: "decor",
    label: "catDecor",
    icon: "leaf",
    items: [
      it("plant"),
      decor("decor", "plant"),
      it("fireplace"),
      it("column"),
      decor("decor", "boxes"),
      decor("decor", "bin"),
      decor("decor", "cable"),
      ...fam("decor2"),
    ],
  },
  { key: "floor", label: "catFloor", icon: "marquee", items: ["rug", "standup_mat"].map(it).concat(fam("floor2")) },
  {
    // the building (docs/plan/25): stairs up to the floor above, an elevator's
    // stop (it joins the shaft of the ones above or below), and outside
    key: "building",
    label: "catBuilding",
    icon: "stairs",
    items: ["stairs", "flight", "elevator", "car", "lamp_post"].map(it),
  },
  {
    key: "pets",
    label: "catPets",
    icon: "paw",
    items: ["pet_bed", "pet_bowl", "water_bowl", "scratch_post", "pet_house", "toy_box"].map(it).concat(fam("pets2")),
  },
  {
    // out of doors only (shared catalog `outdoor`): Flowmotion's, off indoors
    key: "parkour",
    label: "catParkour",
    icon: "walk",
    items: ["pk_rail", "pk_rail_long", "pk_wall", "pk_wall_tall", "pk_pole", "pk_pole_tall"]
      .map(it)
      .concat(fam("parkour2"))
      // (plan 103 F6a: the skate park's pieces)
      .concat(fam("skate")),
  },
  {
    // (plan 68 phase 2: Christmas, the first of the seasons)
    key: "seasonal",
    label: "catSeasonal",
    icon: "gift",
    items: [
      "xmas_tree",
      "xmas_tree_small",
      "present",
      "stocking",
      "wreath",
      "garland",
      "mistletoe",
      "advent_calendar",
      "poinsettia",
      "nutcracker",
      "candle_arch",
      "gingerbread_house",
      "xmas_village",
      "cocoa_station",
      "wrapping_table",
    ]
      .map(it)
      .concat(fam("seasons")),
  },
  {
    // out of doors only (shared catalog `outdoor`)
    key: "outdoors",
    label: "catOutdoors",
    icon: "land",
    items: ["candy_cane", "reindeer", "sleigh", "inflatable_snowman", "snow_globe"].map(it).concat(fam("outdoors")),
  },
  {
    // (plan 68 phase 19: the kitchen and the café, with the office's fridge, microwave and coffee)
    key: "kitchen",
    label: "catKitchen",
    icon: "mug",
    items: [...fam("kitchen"), ...["fridge", "drinks_fridge", "microwave", "coffee_machine"].map(it)],
  },
];

// ── the two sortings ─────────────────────────────────────────────────────────

export type Room =
  | "living"
  | "kitchen"
  | "dining"
  | "bedroom"
  | "office"
  | "studio"
  | "games"
  | "shop"
  | "outdoors"
  | "pets"
  | "seasonal";
export type Func =
  | "comfort"
  | "surfaces"
  | "storage"
  | "lighting"
  | "electronics"
  | "appliances"
  | "decor"
  | "play"
  | "outdoors"
  | "pets"
  | "seasonal";
/** What the Build tab holds of the catalog (set into walls, or the way up). */
export type BuildPart = "doors" | "windows" | "stairs";

/** A room's or a function's face in the category column: one of its own things' pictures. */
export const ROOMS: { key: Room; face: string }[] = [
  { key: "living", face: "sofa" },
  { key: "kitchen", face: "kitchen_stove" },
  { key: "dining", face: "dining_table" },
  { key: "bedroom", face: "double_bed" },
  { key: "office", face: "desk" },
  { key: "studio", face: "mixing_desk" },
  { key: "games", face: "arcade" },
  { key: "shop", face: "grocery_shelf" },
  { key: "outdoors", face: "picnic_table" },
  { key: "pets", face: "cat_tree" },
  { key: "seasonal", face: "xmas_tree" },
];
export const FUNCS: { key: Func; face: string; subs: string[] }[] = [
  { key: "comfort", face: "armchair", subs: ["seating", "beds"] },
  { key: "surfaces", face: "coffee_table", subs: ["tables", "desks", "counters"] },
  { key: "storage", face: "bookcase", subs: ["shelves", "cabinets", "racks"] },
  { key: "lighting", face: "lamp", subs: ["lamps", "ceiling", "strings"] },
  { key: "electronics", face: "tv_hd", subs: ["screens", "computers", "music"] },
  { key: "appliances", face: "fridge", subs: ["kitchen", "office"] },
  { key: "decor", face: "plant", subs: ["tops", "walls", "plants", "floor", "more"] },
  { key: "play", face: "pool_table", subs: ["games", "tables", "parkour"] },
  { key: "outdoors", face: "fire_pit", subs: ["yard", "street", "farm"] },
  { key: "pets", face: "pet_bed", subs: ["pets"] },
  { key: "seasonal", face: "present", subs: ["christmas", "autumn", "party"] },
];
export const BUILD_PARTS: { key: BuildPart; face: string }[] = [
  { key: "doors", face: "door" },
  { key: "windows", face: "window" },
  { key: "stairs", face: "stairs" },
];

/** A thing in the shop: the catalog's item with its places. */
export interface ShopItem extends Item {
  rooms: Room[];
  func: Func | null; // (null: the Build tab's)
  sub: string;
  build?: BuildPart;
}

// what each first category of the catalog is, by function — its things' own kinds below where they differ
const CAT_FUNC: Record<string, [Func, string] | BuildPart> = {
  seating: ["comfort", "seating"],
  surfaces: ["surfaces", "tables"],
  storage: ["storage", "shelves"],
  office: ["appliances", "office"],
  tops: ["decor", "tops"],
  screens: ["electronics", "screens"],
  games: ["play", "games"],
  tech: ["electronics", "music"],
  lights: ["lighting", "lamps"],
  walls: ["decor", "walls"],
  doors: "doors",
  windows: "windows",
  decor: ["decor", "more"],
  floor: ["decor", "floor"],
  building: "stairs",
  pets: ["pets", "pets"],
  parkour: ["play", "parkour"],
  seasonal: ["seasonal", "christmas"],
  outdoors: ["outdoors", "yard"],
  kitchen: ["appliances", "kitchen"],
  town: ["surfaces", "tables"],
};
const KIND_FUNC: Record<string, [Func, string]> = {
  // comfort
  double_bed: ["comfort", "beds"],
  booth_seat: ["comfort", "seating"],
  counter_stool: ["comfort", "seating"],
  pet_sofa: ["pets", "pets"],
  // surfaces
  desk: ["surfaces", "desks"],
  standing_desk: ["surfaces", "desks"],
  corner_desk: ["surfaces", "desks"],
  drafting_table: ["surfaces", "desks"],
  reception: ["surfaces", "counters"],
  counter: ["surfaces", "counters"],
  workbench: ["surfaces", "desks"],
  bar_counter: ["surfaces", "counters"],
  back_bar: ["surfaces", "counters"],
  checkout: ["surfaces", "counters"],
  kitchen_island: ["surfaces", "counters"],
  cafe_counter: ["surfaces", "counters"],
  security_desk: ["surfaces", "desks"],
  sorting_desk: ["surfaces", "desks"],
  // storage
  wardrobe: ["storage", "cabinets"],
  cupboard: ["storage", "cabinets"],
  filing_cabinet: ["storage", "cabinets"],
  locker: ["storage", "cabinets"],
  plan_chest: ["storage", "cabinets"],
  display_cabinet: ["storage", "cabinets"],
  office_safe: ["storage", "cabinets"],
  mail_cubbies: ["storage", "cabinets"],
  first_aid_cabinet: ["storage", "cabinets"],
  coat_rack: ["storage", "racks"],
  shoe_rack: ["storage", "racks"],
  umbrella_stand: ["storage", "racks"],
  tape_shelf: ["storage", "racks"],
  cassette_rack: ["storage", "racks"],
  record_crates: ["storage", "racks"],
  grocery_shelf: ["storage", "shelves"],
  cart_shelf: ["storage", "racks"],
  disc_rack: ["storage", "racks"],
  // lighting
  pendant_light: ["lighting", "ceiling"],
  panel_light: ["lighting", "ceiling"],
  chandelier: ["lighting", "ceiling"],
  track_lights: ["lighting", "ceiling"],
  edison_cluster: ["lighting", "ceiling"],
  fairy_lights: ["lighting", "strings"],
  paper_lanterns: ["lighting", "strings"],
  festoon_lights: ["lighting", "strings"],
  candles: ["lighting", "strings"],
  // electronics
  computer: ["electronics", "computers"],
  "tabletop:keyboard": ["electronics", "computers"],
  "tabletop:phone": ["electronics", "computers"],
  security_monitors: ["electronics", "screens"],
  radio: ["electronics", "music"],
  turntable: ["electronics", "music"],
  walkman: ["electronics", "music"],
  headphones_stand: ["electronics", "music"],
  typewriter: ["electronics", "computers"],
  film_camera: ["electronics", "computers"],
  crt_tv: ["electronics", "screens"],
  console_2600: ["electronics", "computers"],
  console_nes: ["electronics", "computers"],
  console_snes: ["electronics", "computers"],
  console_md: ["electronics", "computers"],
  console_gb: ["electronics", "computers"],
  console_ps1: ["electronics", "computers"],
  console_ps1_slim: ["electronics", "computers"],
  jukebox: ["electronics", "music"],
  // the tech list's games (not music)
  arcade: ["play", "games"],
  slot_track: ["play", "tables"],
  pool_table: ["play", "tables"],
  pingpong_table: ["play", "tables"],
  air_hockey: ["play", "tables"],
  foosball: ["play", "tables"],
  chess_table: ["play", "tables"],
  wizard_chess: ["play", "tables"],
  card_table: ["play", "tables"],
  // decor
  "tabletop:desklamp": ["lighting", "lamps"],
  plant: ["decor", "plants"],
  "decor:plant": ["decor", "plants"],
  indoor_tree: ["decor", "plants"],
  hanging_plant: ["decor", "plants"],
  moss_wall: ["decor", "plants"],
  terrarium: ["decor", "plants"],
  "tabletop:succulent": ["decor", "plants"],
  bonsai: ["decor", "plants"],
  fruit_bowl: ["decor", "tops"],
  // outdoors
  car: ["outdoors", "street"],
  lamp_post: ["outdoors", "street"],
  bike_rack: ["outdoors", "street"],
  bus_shelter: ["outdoors", "street"],
  mailbox: ["outdoors", "street"],
  street_sign: ["outdoors", "street"],
  flag_pole: ["outdoors", "street"],
  hay_bale: ["outdoors", "farm"],
  hay_stack: ["outdoors", "farm"],
  horse_stall: ["outdoors", "farm"],
  produce_stand: ["outdoors", "farm"],
  candy_cane: ["seasonal", "christmas"],
  reindeer: ["seasonal", "christmas"],
  sleigh: ["seasonal", "christmas"],
  inflatable_snowman: ["seasonal", "christmas"],
  snow_globe: ["seasonal", "christmas"],
  // seasonal
  pumpkins: ["seasonal", "autumn"],
  jack_o_lantern: ["seasonal", "autumn"],
  leaf_garland: ["seasonal", "autumn"],
  bunting: ["seasonal", "party"],
  paper_chains: ["seasonal", "party"],
};

// where things go: by the first category, and by kind where it differs
const CAT_ROOMS: Record<string, Room[]> = {
  seating: ["living"],
  surfaces: ["living"],
  storage: ["living", "office"],
  office: ["office"],
  tops: ["living", "office"],
  screens: ["living", "bedroom"],
  games: ["games"],
  tech: ["studio"],
  lights: ["living", "bedroom", "dining", "office"],
  walls: ["living", "bedroom"],
  decor: ["living"],
  floor: ["living", "bedroom"],
  building: ["outdoors"],
  pets: ["pets"],
  parkour: ["outdoors"],
  seasonal: ["seasonal", "living"],
  outdoors: ["outdoors"],
  kitchen: ["kitchen"],
  town: ["dining"],
  doors: [],
  windows: [],
};
const R = (...r: Room[]) => r;
const KIND_ROOMS: Record<string, Room[]> = {
  chair: R("dining", "office", "living"),
  bench: R("dining", "outdoors"),
  bar_stool: R("dining", "kitchen"),
  gaming_chair: R("games", "office"),
  bleachers: R("outdoors"),
  hammock: R("outdoors"),
  window_seat: R("living", "bedroom"),
  rocking_chair: R("living", "bedroom"),
  egg_chair: R("living", "bedroom"),
  hanging_chair: R("living", "bedroom"),
  desk: R("office"),
  standing_desk: R("office"),
  meeting_table: R("office"),
  reception: R("office", "shop"),
  corner_desk: R("office"),
  drafting_table: R("office", "studio"),
  round_table: R("office", "dining"),
  high_table: R("dining", "kitchen"),
  counter: R("kitchen"),
  workbench: R("studio", "office"),
  dining_table: R("dining", "kitchen"),
  bedside_table: R("bedroom"),
  folding_table: R("dining", "outdoors"),
  filing_cabinet: R("office"),
  locker: R("office"),
  plan_chest: R("office", "studio"),
  mail_cubbies: R("office"),
  office_safe: R("office"),
  tape_shelf: R("studio", "office"),
  record_crates: R("studio", "living"),
  cassette_rack: R("studio", "living"),
  display_cabinet: R("living", "shop"),
  shoe_rack: R("living", "bedroom"),
  coat_rack: R("living", "office"),
  umbrella_stand: R("living", "shop"),
  vending: R("office", "shop"),
  water_cooler: R("office", "shop"),
  security_desk: R("office", "shop"),
  computer: R("office", "bedroom"),
  "tabletop:keyboard": R("office"),
  "tabletop:phone": R("office"),
  "tabletop:papers": R("office"),
  "tabletop:binder": R("office"),
  "tabletop:mug": R("kitchen", "office", "dining"),
  "tabletop:desklamp": R("office", "bedroom", "living"),
  "tabletop:tapes": R("studio"),
  "tabletop:vinyl": R("studio", "living"),
  "tabletop:cards": R("games", "living"),
  "tabletop:bell": R("shop", "office"),
  typewriter: R("office"),
  rolodex: R("office"),
  pencil_cup: R("office"),
  radio: R("living", "studio", "kitchen"),
  turntable: R("living", "studio"),
  video_wall: R("office", "studio"),
  security_monitors: R("office", "shop"),
  cinema_screen: R("living", "studio"),
  projector: R("living", "office"),
  projector_screen: R("living", "office"),
  ceiling_projector: R("living", "office"),
  outdoor_cinema: R("outdoors"),
  arcade: R("games"),
  slot_track: R("games"),
  pool_table: R("games"),
  pingpong_table: R("games"),
  piano: R("living", "studio"),
  whiteboard: R("office"),
  notice_board: R("office"),
  board_wall: R("office"),
  screen_wall: R("office", "studio"),
  wall_calendar: R("office", "kitchen"),
  members_map: R("office"),
  world_clocks: R("office"),
  acoustic_panel: R("studio"),
  neon: R("studio", "games", "shop"),
  marquee_sign: R("studio", "shop"),
  vfd_ticker: R("studio", "office"),
  split_flap: R("studio", "office"),
  framed_records: R("studio", "living"),
  guitar_hooks: R("studio"),
  pegboard: R("studio", "office"),
  wall_skateboard: R("games", "bedroom"),
  exit_sign: R("office", "shop"),
  fire_alarm: R("office", "shop"),
  "decor:boxes": R("office"),
  "decor:bin": R("office", "kitchen"),
  "decor:cable": R("office", "studio"),
  fountain: R("outdoors"),
  big_aquarium: R("living", "office"),
  trophy: R("living", "games"),
  dance_floor: R("studio"),
  stage_riser: R("studio"),
  stage_steps: R("studio"),
  floor_tape: R("office"),
  standup_mat: R("office"),
  floor_decal: R("office", "shop"),
  puzzle_mat: R("games", "bedroom"),
  welcome_mat: R("living"),
  ice_cream_freezer: R("kitchen", "shop"),
  drinks_fridge: R("kitchen", "shop", "office"),
  coffee_machine: R("kitchen", "office"),
  cafe_counter: R("kitchen", "shop", "dining"),
  microwave: R("kitchen", "office"),
  fridge: R("kitchen", "office"),
  double_bed: R("bedroom"),
  wardrobe: R("bedroom"),
  hay_bale: R("outdoors"),
  hay_stack: R("outdoors"),
  horse_stall: R("outdoors"),
  grocery_shelf: R("shop"),
  checkout: R("shop"),
  produce_stand: R("shop", "outdoors"),
  candy_cane: R("outdoors", "seasonal"),
  reindeer: R("outdoors", "seasonal"),
  sleigh: R("outdoors", "seasonal"),
  inflatable_snowman: R("outdoors", "seasonal"),
  snow_globe: R("outdoors", "seasonal"),
  car: R("outdoors"),
  lamp_post: R("outdoors"),
};

const shopOf = (cat: string, i: Item): ShopItem => {
  const f = KIND_FUNC[i.key] ?? KIND_FUNC[i.kind];
  const c = CAT_FUNC[cat];
  const rooms = KIND_ROOMS[i.key] ?? KIND_ROOMS[i.kind] ?? CAT_ROOMS[cat] ?? [];
  // (the Build tab's: doors, windows, the stairs and lift — a car and a lamp post stay the shop's)
  if (!f && typeof c === "string") return { ...i, rooms: [], func: null, sub: c, build: c };
  const [func, sub] = f ?? (c as [Func, string]);
  return { ...i, rooms, func, sub };
};

/** Every thing in the catalog, once (a computer was in two lists), with its places. */
export const SHOP: ShopItem[] = (() => {
  const seen = new Set<string>();
  const out: ShopItem[] = [];
  for (const c of CATS)
    for (const i of c.items) {
      if (seen.has(i.key)) continue;
      seen.add(i.key);
      out.push(shopOf(c.key, i));
    }
  return out;
})();
export const ALL: Item[] = SHOP;

/** What's shown for a room or a function (and its subcategory: "" all of it). */
export function shopShelf(by: "room" | "func", key: string, sub = ""): ShopItem[] {
  if (by === "room") return SHOP.filter((i) => i.func && i.rooms.includes(key as Room));
  return SHOP.filter((i) => i.func === key && (!sub || i.sub === sub));
}
/** The Build tab's things of one part. */
export function buildShelf(part: BuildPart): ShopItem[] {
  return SHOP.filter((i) => i.build === part);
}
/** A room's subcategories: the functions of what's in it, in the functions' order. */
export function roomSubs(room: Room): Func[] {
  const have = new Set(shopShelf("room", room).map((i) => i.func));
  return FUNCS.map((f) => f.key).filter((f) => have.has(f));
}

/** What it costs (F7): nothing set yet — the money system's to come. */
export function priceOf(i: Item): number | null {
  return entry(i.kind).price ?? null;
}

/** The few things badged NEW: what this plan's catalog gained, not every family's piece. */
export const NEW_KEYS = new Set<string>(["umbrella_stand", "booth_seat", "booth_table", "checkout", "produce_stand"]);

// ── words ─────────────────────────────────────────────────────────────────────
addStrings(
  {
    bv_room_living: ["Living room", "Sala de estar"],
    bv_room_kitchen: ["Kitchen", "Cozinha"],
    bv_room_dining: ["Dining", "Jantar"],
    bv_room_bedroom: ["Bedroom", "Quarto"],
    bv_room_office: ["Office", "Escritório"],
    bv_room_studio: ["Studio & stage", "Estúdio e palco"],
    bv_room_games: ["Game room", "Sala de jogos"],
    bv_room_shop: ["Shop & town", "Loja e cidade"],
    bv_room_outdoors: ["Outdoors", "Área externa"],
    bv_room_pets: ["Pets", "Pets"],
    bv_room_seasonal: ["Seasonal", "Datas"],
    bv_func_comfort: ["Comfort", "Conforto"],
    bv_func_surfaces: ["Surfaces", "Superfícies"],
    bv_func_storage: ["Storage", "Armazenamento"],
    bv_func_lighting: ["Lighting", "Iluminação"],
    bv_func_electronics: ["Electronics", "Eletrônicos"],
    bv_func_appliances: ["Appliances", "Aparelhos"],
    bv_func_decor: ["Decor", "Decoração"],
    bv_func_play: ["Play", "Diversão"],
    bv_func_outdoors: ["Outdoors", "Área externa"],
    bv_func_pets: ["Pets", "Pets"],
    bv_func_seasonal: ["Seasonal", "Datas"],
    bv_sub_seating: ["Seating", "Assentos"],
    bv_sub_beds: ["Beds", "Camas"],
    bv_sub_tables: ["Tables", "Mesas"],
    bv_sub_desks: ["Desks", "Escrivaninhas"],
    bv_sub_counters: ["Counters", "Balcões"],
    bv_sub_shelves: ["Shelves", "Estantes"],
    bv_sub_cabinets: ["Cabinets", "Armários"],
    bv_sub_racks: ["Racks", "Suportes"],
    bv_sub_lamps: ["Lamps", "Luminárias"],
    bv_sub_ceiling: ["Ceiling", "Teto"],
    bv_sub_strings: ["Strings & candles", "Cordões e velas"],
    bv_sub_screens: ["Screens", "Telas"],
    bv_sub_computers: ["Computers & consoles", "Computadores e consoles"],
    bv_sub_music: ["Music", "Música"],
    bv_sub_kitchen: ["Kitchen", "Cozinha"],
    bv_sub_office: ["Office", "Escritório"],
    bv_sub_tops: ["On tables", "Sobre mesas"],
    bv_sub_walls: ["On walls", "Nas paredes"],
    bv_sub_plants: ["Plants", "Plantas"],
    bv_sub_floor: ["Rugs", "Tapetes"],
    bv_sub_more: ["More", "Mais"],
    bv_sub_games: ["Games", "Jogos"],
    bv_sub_parkour: ["Parkour & skate", "Parkour e skate"],
    bv_sub_yard: ["Yard", "Quintal"],
    bv_sub_street: ["Street", "Rua"],
    bv_sub_farm: ["Farm", "Fazenda"],
    bv_sub_pets: ["Pets", "Pets"],
    bv_sub_christmas: ["Christmas", "Natal"],
    bv_sub_autumn: ["Autumn", "Outono"],
    bv_sub_party: ["Party", "Festa"],
    bv_build_doors: ["Doors", "Portas"],
    bv_build_windows: ["Windows", "Janelas"],
    bv_build_stairs: ["Stairs & lifts", "Escadas e elevadores"],
  },
  "yutopia-build",
);
/** A word of the build view's own. */
export const bw = (k: string): string => trMaybe(k) ?? k;

export function labelOf(i: Item): string {
  if (i.props?.d) return trMaybe(`decor_${String(i.props.d)}`) ?? entry(i.kind).label;
  if (i.kind === "door" && i.props?.glass) return trMaybe("bv_glass_door") ?? "Glass door";
  return entry(i.kind).label;
}
addStrings(
  {
    bv_glass_door: ["Glass door", "Porta de vidro"],
    // the walls', floors' and fabrics' names (WallsPanel, Catalog: English in their lists)
    bv_sw_Plaster: ["Plaster", "Reboco"],
    bv_sw_Walnut: ["Walnut", "Nogueira"],
    bv_sw_Foam: ["Foam", "Espuma"],
    bv_sw_Brick: ["Brick", "Tijolo"],
    bv_sw_Cork: ["Cork", "Cortiça"],
    bv_sw_Glass: ["Glass", "Vidro"],
    "bv_sw_Half wall": ["Half wall", "Meia parede"],
    bv_sw_Wood: ["Wood", "Madeira"],
    bv_sw_Carpet: ["Carpet", "Carpete"],
    bv_sw_Tile: ["Tile", "Piso"],
    bv_sw_Felt: ["Felt", "Feltro"],
    bv_sw_Stage: ["Stage", "Palco"],
    bv_sw_Grate: ["Grate", "Grade"],
    "bv_sw_No floor": ["No floor", "Sem piso"],
    bv_sw_Rust: ["Rust", "Ferrugem"],
    bv_sw_Olive: ["Olive", "Oliva"],
    bv_sw_Amber: ["Amber", "Âmbar"],
    bv_sw_Cream: ["Cream", "Creme"],
    bv_sw_Slate: ["Slate", "Ardósia"],
    bv_sw_Charcoal: ["Charcoal", "Carvão"],
    bv_sw_Oxblood: ["Oxblood", "Vinho"],
    bv_sw_Oat: ["Oat", "Aveia"],
    bv_sw_Sage: ["Sage", "Sálvia"],
    bv_sw_Plum: ["Plum", "Ameixa"],
    bv_sw_Terracotta: ["Terracotta", "Terracota"],
  },
  "yutopia-build",
);
/** A swatch's or a fabric's name in my language. */
export const swName = (label: string): string => trMaybe(`bv_sw_${label}`) ?? label;
