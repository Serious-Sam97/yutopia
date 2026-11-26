// The animals' cast (docs/plan/126-animal-life.md, phase 0): every species the world keeps — where it lives, how
// it moves and in what numbers, when it's about, what it fears and what it hunts, what it eats from a hand, what it
// leaves when it's shot, whether it can be befriended (grown, or only young) and what it sounds like. Metres,
// seconds, metres a second. The server runs every species here (F4b); the tiny ones (insects, fish shoals, far
// flocks) are the client's (`TINY`), seeded by place and time.

/** Where an animal lives (animals/habitat.ts `habitatAt`). */
export const HABITATS = [
  "town", // the town's streets and squares, the campus
  "field", // open land: the fields round the campus
  "meadow", // grown meadows and hills
  "forest", // woods
  "deepwoods", // the deep woods (trees ≥ 0.9): the wild
  "water", // open water: the pond, the river, Silver Lake, a grown lake
  "shore", // a bank by the water
  "alpine", // high and bare: Hawk Pass, the mountains
  "farm", // the farmland, the barn's pens
  "desert",
  "beach",
] as const;
export type Habitat = (typeof HABITATS)[number];

export const GROUPS = ["bird", "small", "big", "farm"] as const;
export type AnimalGroup = (typeof GROUPS)[number];

/** How a group keeps together. */
export type PackKind = "herd" | "flock" | "pack" | "pair" | "alone" | "colony";
/** When it's about: by day, by night, at dawn and dusk (and some of the day), always. */
export type Hours = "day" | "night" | "twilight" | "always";
/** What it eats in the wild (the mind's food drive: what it looks for). */
export type Diet = "grazer" | "browser" | "omnivore" | "predator" | "seeds" | "insects" | "fish";
/** The print it leaves in the snow (F10a). */
export type Print = "hoof" | "paw" | "pad" | "hop" | "bird" | "web" | "none";

/** What can be held out to an animal (phase 9): items (shared inventory STACKS). */
export const FOODS = ["bread", "seed", "nut", "apple", "carrot", "meat", "meat_cooked", "fish_raw"] as const;
export type Food = (typeof FOODS)[number];

/** The hides an animal leaves (phase 7), made into warm clothes (phase 8). */
export const HIDES = ["fur", "pelt", "leather", "wool", "feathers"] as const;
export type Hide = (typeof HIDES)[number];

/** The common clip names every model is exported with (phase 1: tools/art/animals renames the packs' clips). */
export const CLIPS = [
  "idle",
  "idle2",
  "look", // head up, ears pricked: alert
  "eat", // grazing, pecking, nibbling
  "walk",
  "trot",
  "run",
  "jump",
  "attack",
  "kick",
  "hitL",
  "hitR",
  "die",
  "lie", // lying down, breathing: rest and sleep
  "sit",
  "fly",
  "glide",
  "swim",
  "ridden", // (the horse) under a rider: its gaits are walk/trot/run, this the stand still
  // (plan 128 F11b: made in Blender where a model hasn't them)
  "drink", // head down to the water, lapping
  "sniff", // nose down, a step, nose down
  "groom", // a lick, a scratch
  "play", // a bound, a pounce (the young)
  "howl", // head up, a call (a wolf's howl; the others' own call)
  "stamp", // a stamp, a snort: the alarm
] as const;
export type Clip = (typeof CLIPS)[number];

export interface Danger {
  /** how far round its den it holds as its own (m); none: anywhere */
  territory: number;
  /** a growl, a stare, a bluff charge at this distance (m) */
  warn: number;
  /** it comes for you at this distance (m) — in its territory, or when you're too close anywhere */
  charge: number;
  /** health off a bite or a swipe */
  hit: number;
  /** between strikes (ms) */
  every: number;
  /** how much bolder by night (distances ×) */
  night: number;
  /** a lit torch or a fire keeps it this far (m) */
  fire: number;
  /** how fast it comes at a person (m/s): under a runner's 7 — running away saves you, walking doesn't */
  chase: number;
}

export interface AnimalDef {
  key: string;
  label: readonly [en: string, pt: string];
  group: AnimalGroup;
  /** the model's file (public/life/animals/<model>.glb) and its colour variant */
  model: string;
  /** body length nose to tail (m) — its size, its hit capsule's length */
  len: number;
  /** its back's height (m) — the model's scale, its hit capsule's height */
  height: number;
  hp: number;
  walk: number;
  run: number;
  /** flies: its speed and how high it keeps over the ground (m) */
  flies?: { speed: number; alt: readonly [number, number] };
  /** swims on the water (ducks, geese, the beaver) — open water is its ground too */
  swims?: boolean;
  /** climbs trees (the squirrel, the raccoon, the lynx): it flees up one */
  climbs?: boolean;
  pack: readonly [min: number, max: number];
  packKind: PackKind;
  hours: Hours;
  /** where it lives, and how much (0..1): a group is made where the land's habitat weighs */
  habitat: Partial<Record<Habitat, number>>;
  /** how many groups a square km of its best habitat keeps */
  density: number;
  /** how far it sees and hears a person (m) */
  sight: number;
  /** how far it keeps from a person walking (m); running, in a car, a shot: twice that and more */
  flee: number;
  /** 0 bold … 1 skittish: how fast it bolts and how long till it settles */
  wary: number;
  diet: Diet;
  /** the species it hunts */
  prey?: readonly string[];
  /** it attacks people (F5c): where and how hard */
  danger?: Danger;
  /** cornered or its young near: it turns and charges (a boar, a moose, a bull) */
  defends?: boolean;
  /** what it leaves when shot and skinned (F6c) */
  meat: number;
  hide?: Hide;
  /** what it takes from a hand (phase 9) */
  feed: readonly Food[];
  /** befriended grown, or only young (F7c: a wolf, a bear are raised from a pup, a cub) */
  befriend: "grown" | "young";
  /** days of feeding (one a day at most) till it trusts you enough to follow you home */
  trustDays: number;
  /** its young (what a young one's called): grown in this many days */
  young: { label: readonly [string, string]; days: number };
  /** the farm's (phase 11): what it gives */
  gives?: "egg" | "milk" | "wool";
  /** ridden (phase 11) */
  ride?: boolean;
  print: Print;
  /** (m) a print's step */
  stride: number;
  /** its sounds' keys (public/sfx/animals: <sound>-call, -alarm, -hurt, -die) */
  sound: string;
}

const D = (d: Omit<AnimalDef, "key">) => d;

/** The cast (F2c, 2026-11-25). */
export const ANIMAL_DEFS = {
  // ── birds ──────────────────────────────────────────────────────────────────────────────────────────────────────
  crow: D({
    label: ["Crow", "Corvo"],
    group: "bird",
    model: "crow",
    len: 0.45,
    height: 0.3,
    hp: 15,
    walk: 0.45,
    run: 1.6,
    flies: { speed: 11, alt: [6, 30] },
    pack: [2, 7],
    packKind: "flock",
    hours: "day",
    habitat: { field: 1, town: 0.6, farm: 0.9, forest: 0.4, shore: 0.3 },
    density: 8,
    sight: 40,
    flee: 9,
    wary: 0.6,
    diet: "omnivore",
    meat: 0,
    hide: "feathers",
    feed: ["bread", "seed", "nut", "meat"],
    befriend: "grown",
    trustDays: 3,
    young: { label: ["Fledgling", "Filhote"], days: 3 },
    print: "bird",
    stride: 0.08,
    sound: "crow",
  }),
  songbird: D({
    label: ["Songbird", "Passarinho"],
    group: "bird",
    model: "songbird",
    len: 0.15,
    height: 0.12,
    hp: 5,
    walk: 0.3,
    run: 1,
    flies: { speed: 9, alt: [3, 14] },
    pack: [3, 10],
    packKind: "flock",
    hours: "day",
    habitat: { forest: 1, field: 0.6, town: 0.5, farm: 0.6, shore: 0.4 },
    density: 8,
    sight: 20,
    flee: 5,
    wary: 0.8,
    diet: "seeds",
    meat: 0,
    feed: ["seed", "bread"],
    befriend: "grown",
    trustDays: 2,
    young: { label: ["Fledgling", "Filhote"], days: 2 },
    print: "bird",
    stride: 0.04,
    sound: "songbird",
  }),
  duck: D({
    label: ["Duck", "Pato"],
    group: "bird",
    model: "duck",
    len: 0.55,
    height: 0.35,
    hp: 20,
    walk: 0.4,
    run: 1.8,
    flies: { speed: 14, alt: [4, 25] },
    swims: true,
    pack: [3, 9],
    packKind: "flock",
    hours: "day",
    habitat: { water: 1, shore: 0.8 },
    density: 90,
    sight: 30,
    flee: 7,
    wary: 0.5,
    diet: "seeds",
    meat: 1,
    hide: "feathers",
    feed: ["bread", "seed"],
    befriend: "grown",
    trustDays: 2,
    young: { label: ["Duckling", "Patinho"], days: 3 },
    print: "web",
    stride: 0.1,
    sound: "duck",
  }),
  goose: D({
    label: ["Goose", "Ganso"],
    group: "bird",
    model: "goose",
    len: 0.85,
    height: 0.6,
    hp: 30,
    walk: 0.5,
    run: 2.2,
    flies: { speed: 16, alt: [10, 60] },
    swims: true,
    pack: [4, 12],
    packKind: "flock",
    hours: "day",
    habitat: { water: 0.9, shore: 1, field: 0.3 },
    density: 40,
    sight: 35,
    flee: 6,
    wary: 0.35,
    diet: "grazer",
    // (geese hiss and nip at those who come too close to their young — a nip, no more)
    defends: true,
    meat: 2,
    hide: "feathers",
    feed: ["bread", "seed", "carrot"],
    befriend: "grown",
    trustDays: 3,
    young: { label: ["Gosling", "Gansinho"], days: 4 },
    print: "web",
    stride: 0.14,
    sound: "goose",
  }),
  owl: D({
    label: ["Owl", "Coruja"],
    group: "bird",
    model: "owl",
    len: 0.5,
    height: 0.45,
    hp: 18,
    walk: 0.3,
    run: 0.8,
    flies: { speed: 8, alt: [4, 16] },
    pack: [1, 1],
    packKind: "alone",
    hours: "night",
    habitat: { forest: 1, deepwoods: 1, farm: 0.4 },
    density: 1.5,
    sight: 50,
    flee: 10,
    wary: 0.5,
    diet: "predator",
    prey: ["frog", "songbird"],
    meat: 0,
    hide: "feathers",
    feed: ["meat", "fish_raw"],
    befriend: "young",
    trustDays: 5,
    young: { label: ["Owlet", "Corujinha"], days: 6 },
    print: "bird",
    stride: 0.1,
    sound: "owl",
  }),
  gull: D({
    label: ["Gull", "Gaivota"],
    group: "bird",
    model: "gull",
    len: 0.6,
    height: 0.4,
    hp: 18,
    walk: 0.4,
    run: 1.8,
    flies: { speed: 12, alt: [8, 40] },
    swims: true,
    pack: [3, 10],
    packKind: "colony",
    hours: "day",
    habitat: { water: 0.7, shore: 1, beach: 1 },
    density: 20,
    sight: 30,
    flee: 6,
    wary: 0.4,
    diet: "fish",
    meat: 0,
    hide: "feathers",
    feed: ["bread", "fish_raw", "meat"],
    befriend: "grown",
    trustDays: 3,
    young: { label: ["Chick", "Filhote"], days: 4 },
    print: "web",
    stride: 0.12,
    sound: "gull",
  }),
  pigeon: D({
    label: ["Pigeon", "Pombo"],
    group: "bird",
    model: "pigeon",
    len: 0.32,
    height: 0.25,
    hp: 10,
    walk: 0.35,
    run: 1.4,
    flies: { speed: 10, alt: [3, 18] },
    pack: [5, 16],
    packKind: "flock",
    hours: "day",
    habitat: { town: 1, farm: 0.3 },
    density: 25,
    sight: 20,
    flee: 3,
    wary: 0.3,
    diet: "seeds",
    meat: 0,
    feed: ["bread", "seed"],
    befriend: "grown",
    trustDays: 1,
    young: { label: ["Squab", "Filhote"], days: 2 },
    print: "bird",
    stride: 0.06,
    sound: "pigeon",
  }),
  bat: D({
    label: ["Bat", "Morcego"],
    group: "bird",
    model: "bat",
    len: 0.12,
    height: 0.08,
    hp: 4,
    walk: 0.2,
    run: 0.5,
    flies: { speed: 7, alt: [2, 12] },
    pack: [2, 8],
    packKind: "colony",
    hours: "night",
    habitat: { forest: 0.7, farm: 0.7, shore: 1, town: 0.3 },
    density: 10,
    sight: 25,
    flee: 2,
    wary: 0.7,
    diet: "insects",
    meat: 0,
    feed: ["apple"],
    befriend: "grown",
    trustDays: 4,
    young: { label: ["Pup", "Filhote"], days: 3 },
    print: "none",
    stride: 0.05,
    sound: "bat",
  }),

  // ── small ones ─────────────────────────────────────────────────────────────────────────────────────────────────
  squirrel: D({
    label: ["Squirrel", "Esquilo"],
    group: "small",
    model: "squirrel",
    len: 0.42,
    height: 0.18,
    hp: 8,
    walk: 0.5,
    run: 5,
    climbs: true,
    pack: [1, 2],
    packKind: "pair",
    hours: "day",
    habitat: { forest: 1, deepwoods: 0.7, town: 0.35, field: 0.15 },
    density: 14,
    sight: 20,
    flee: 5,
    wary: 0.7,
    diet: "seeds",
    meat: 0,
    hide: "fur",
    feed: ["nut", "seed", "apple"],
    befriend: "grown",
    trustDays: 2,
    young: { label: ["Kit", "Filhote"], days: 3 },
    print: "hop",
    stride: 0.35,
    sound: "squirrel",
  }),
  hare: D({
    label: ["Snowshoe hare", "Lebre"],
    group: "small",
    model: "hare",
    len: 0.5,
    height: 0.3,
    hp: 10,
    walk: 0.6,
    run: 12,
    pack: [1, 2],
    packKind: "alone",
    hours: "twilight",
    habitat: { field: 1, forest: 0.6, farm: 0.5, alpine: 0.4, meadow: 1 },
    density: 16,
    sight: 30,
    flee: 9,
    wary: 0.9,
    diet: "grazer",
    meat: 1,
    hide: "fur",
    feed: ["carrot", "apple"],
    befriend: "grown",
    trustDays: 3,
    young: { label: ["Leveret", "Filhote"], days: 3 },
    print: "hop",
    stride: 1.1,
    sound: "hare",
  }),
  fox: D({
    label: ["Red fox", "Raposa"],
    group: "small",
    model: "fox",
    len: 1.0,
    height: 0.4,
    hp: 30,
    walk: 0.9,
    run: 13,
    pack: [1, 2],
    packKind: "pair",
    hours: "twilight",
    habitat: { forest: 1, field: 0.8, farm: 0.7, town: 0.2, deepwoods: 0.5 },
    density: 3,
    sight: 45,
    flee: 18,
    wary: 0.75,
    diet: "predator",
    prey: ["hare", "squirrel", "songbird", "chicken", "frog", "duck"],
    meat: 1,
    hide: "pelt",
    feed: ["meat", "meat_cooked", "fish_raw", "bread", "apple"],
    befriend: "grown",
    trustDays: 5,
    young: { label: ["Kit", "Filhote"], days: 5 },
    print: "pad",
    stride: 0.32,
    sound: "fox",
  }),
  raccoon: D({
    label: ["Raccoon", "Guaxinim"],
    group: "small",
    model: "raccoon",
    len: 0.8,
    height: 0.3,
    hp: 25,
    walk: 0.6,
    run: 6,
    climbs: true,
    pack: [1, 3],
    packKind: "pair",
    hours: "night",
    habitat: { forest: 0.8, town: 0.7, shore: 0.9, farm: 0.6 },
    density: 4,
    sight: 20,
    flee: 6,
    wary: 0.35,
    diet: "omnivore",
    meat: 1,
    hide: "pelt",
    feed: ["bread", "apple", "nut", "fish_raw", "meat_cooked", "carrot", "seed"],
    befriend: "grown",
    trustDays: 3,
    young: { label: ["Kit", "Filhote"], days: 4 },
    print: "pad",
    stride: 0.25,
    sound: "raccoon",
  }),
  beaver: D({
    label: ["Beaver", "Castor"],
    group: "small",
    model: "beaver",
    len: 1.1,
    height: 0.35,
    hp: 35,
    walk: 0.4,
    run: 2.2,
    swims: true,
    pack: [2, 5],
    packKind: "colony",
    hours: "twilight",
    habitat: { water: 0.6, shore: 1 },
    density: 3,
    sight: 20,
    flee: 9,
    wary: 0.6,
    diet: "browser",
    meat: 2,
    hide: "pelt",
    feed: ["apple", "carrot"],
    befriend: "grown",
    trustDays: 4,
    young: { label: ["Kit", "Filhote"], days: 5 },
    print: "pad",
    stride: 0.22,
    sound: "beaver",
  }),
  frog: D({
    label: ["Frog", "Sapo"],
    group: "small",
    model: "frog",
    len: 0.09,
    height: 0.05,
    hp: 2,
    walk: 0.2,
    run: 1.6,
    swims: true,
    pack: [2, 8],
    packKind: "colony",
    hours: "twilight",
    habitat: { shore: 1, water: 0.4 },
    density: 40,
    sight: 6,
    flee: 2,
    wary: 0.8,
    diet: "insects",
    meat: 0,
    feed: [],
    befriend: "grown",
    trustDays: 2,
    young: { label: ["Froglet", "Girino"], days: 2 },
    print: "none",
    stride: 0.2,
    sound: "frog",
  }),
  cat: D({
    label: ["Stray cat", "Gato de rua"],
    group: "small",
    model: "cat",
    len: 0.75,
    height: 0.28,
    hp: 20,
    walk: 0.7,
    run: 8,
    climbs: true,
    pack: [1, 1],
    packKind: "alone",
    hours: "always",
    habitat: { town: 1, farm: 0.4 },
    density: 3,
    sight: 25,
    flee: 4,
    wary: 0.5,
    diet: "predator",
    prey: ["songbird", "pigeon", "frog"],
    meat: 0,
    hide: "fur",
    feed: ["meat", "meat_cooked", "fish_raw", "bread"],
    befriend: "grown",
    trustDays: 3,
    young: { label: ["Kitten", "Filhote"], days: 4 },
    print: "pad",
    stride: 0.2,
    sound: "cat",
  }),

  // ── big ones ───────────────────────────────────────────────────────────────────────────────────────────────────
  deer: D({
    label: ["White-tailed deer", "Cervo"],
    group: "big",
    model: "deer",
    len: 1.8,
    height: 1.0,
    hp: 80,
    walk: 1.4,
    run: 15,
    pack: [2, 6],
    packKind: "herd",
    hours: "twilight",
    habitat: { forest: 1, field: 0.7, farm: 0.4, deepwoods: 0.6, meadow: 1 },
    density: 8,
    sight: 60,
    flee: 28,
    wary: 0.8,
    diet: "browser",
    meat: 4,
    hide: "leather",
    feed: ["apple", "carrot", "bread"],
    befriend: "grown",
    trustDays: 6,
    young: { label: ["Fawn", "Filhote de cervo"], days: 7 },
    print: "hoof",
    stride: 0.5,
    sound: "deer",
  }),
  elk: D({
    label: ["Elk", "Alce-americano"],
    group: "big",
    model: "elk",
    len: 2.4,
    height: 1.45,
    hp: 160,
    walk: 1.5,
    run: 12,
    pack: [3, 10],
    packKind: "herd",
    hours: "twilight",
    habitat: { field: 0.8, forest: 0.6, alpine: 0.9, meadow: 1 },
    density: 2,
    sight: 60,
    flee: 30,
    wary: 0.6,
    diet: "grazer",
    defends: true,
    meat: 8,
    hide: "leather",
    feed: ["apple", "carrot"],
    befriend: "young",
    trustDays: 7,
    young: { label: ["Calf", "Filhote de alce"], days: 9 },
    print: "hoof",
    stride: 0.7,
    sound: "elk",
  }),
  moose: D({
    label: ["Moose", "Alce"],
    group: "big",
    model: "moose",
    len: 2.8,
    height: 1.9,
    hp: 220,
    walk: 1.4,
    run: 8,
    swims: true,
    pack: [1, 2],
    packKind: "alone",
    hours: "twilight",
    habitat: { shore: 1, water: 0.5, deepwoods: 0.6, forest: 0.4 },
    density: 1,
    sight: 40,
    flee: 18,
    wary: 0.3,
    diet: "browser",
    defends: true,
    // (a moose that's crowded turns on you: no territory, close only)
    danger: { territory: 0, warn: 9, charge: 4, hit: 14, every: 3000, night: 1, fire: 6, chase: 5 },
    meat: 10,
    hide: "leather",
    feed: ["apple", "carrot"],
    befriend: "young",
    trustDays: 8,
    young: { label: ["Calf", "Filhote de alce"], days: 10 },
    print: "hoof",
    stride: 0.85,
    sound: "moose",
  }),
  boar: D({
    label: ["Wild boar", "Javali"],
    group: "big",
    model: "boar",
    len: 1.5,
    height: 0.85,
    hp: 110,
    walk: 1.2,
    run: 8,
    pack: [2, 8],
    packKind: "herd",
    hours: "twilight",
    habitat: { forest: 1, deepwoods: 0.8, farm: 0.5, field: 0.3 },
    density: 3,
    sight: 25,
    flee: 14,
    wary: 0.45,
    diet: "omnivore",
    defends: true,
    danger: { territory: 0, warn: 7, charge: 3, hit: 8, every: 2600, night: 1.1, fire: 5, chase: 5.2 },
    meat: 5,
    hide: "leather",
    feed: ["apple", "carrot", "bread", "nut"],
    befriend: "young",
    trustDays: 6,
    young: { label: ["Piglet", "Leitão"], days: 6 },
    print: "hoof",
    stride: 0.38,
    sound: "boar",
  }),
  wolf: D({
    label: ["Grey wolf", "Lobo"],
    group: "big",
    model: "wolf",
    len: 1.6,
    height: 0.8,
    hp: 90,
    walk: 1.6,
    run: 11,
    pack: [3, 7],
    packKind: "pack",
    hours: "always",
    habitat: { deepwoods: 1, alpine: 0.9, forest: 0.45 },
    density: 0.2,
    sight: 70,
    flee: 0,
    wary: 0.3,
    diet: "predator",
    prey: ["deer", "elk", "hare", "boar", "sheep", "chicken"],
    // (F5c: the wolves' pass — theirs at any hour, bolder at night)
    danger: { territory: 90, warn: 22, charge: 10, hit: 7, every: 2400, night: 1.25, fire: 9, chase: 5.8 },
    meat: 3,
    hide: "fur",
    feed: ["meat", "meat_cooked"],
    befriend: "young",
    trustDays: 7,
    young: { label: ["Pup", "Filhote de lobo"], days: 8 },
    print: "pad",
    stride: 0.6,
    sound: "wolf",
  }),
  lynx: D({
    label: ["Lynx", "Lince"],
    group: "big",
    model: "lynx",
    len: 1.0,
    height: 0.6,
    hp: 60,
    walk: 1.1,
    run: 10,
    climbs: true,
    pack: [1, 1],
    packKind: "alone",
    hours: "twilight",
    habitat: { alpine: 1, deepwoods: 0.8, forest: 0.3 },
    density: 0.2,
    sight: 60,
    flee: 25,
    wary: 0.7,
    diet: "predator",
    prey: ["hare", "squirrel", "songbird", "deer"],
    // (F5c: the lynx's ridge — it leaps from cover at whoever comes into it)
    danger: { territory: 40, warn: 12, charge: 6, hit: 7, every: 2200, night: 1.15, fire: 7, chase: 6.2 },
    meat: 2,
    hide: "fur",
    feed: ["meat", "meat_cooked", "fish_raw"],
    befriend: "young",
    trustDays: 7,
    young: { label: ["Kit", "Filhote de lince"], days: 7 },
    print: "pad",
    stride: 0.45,
    sound: "lynx",
  }),
  bear: D({
    label: ["Black bear", "Urso"],
    group: "big",
    model: "bear",
    len: 1.8,
    height: 1.0,
    hp: 300,
    walk: 1.2,
    run: 9,
    climbs: true,
    swims: true,
    pack: [1, 1],
    packKind: "alone",
    hours: "always",
    habitat: { deepwoods: 1, alpine: 0.6, forest: 0.35, shore: 0.4 },
    density: 0.12,
    sight: 35,
    flee: 0,
    wary: 0.2,
    diet: "omnivore",
    prey: ["deer", "boar"],
    defends: true,
    // (F5c: the bear's woods)
    danger: { territory: 60, warn: 16, charge: 7, hit: 16, every: 3000, night: 1.15, fire: 8, chase: 5.4 },
    meat: 9,
    hide: "fur",
    feed: ["fish_raw", "meat", "meat_cooked", "apple", "bread", "nut"],
    befriend: "young",
    trustDays: 9,
    young: { label: ["Cub", "Filhote de urso"], days: 10 },
    print: "pad",
    stride: 0.6,
    sound: "bear",
  }),

  // ── the farm (F1c) ─────────────────────────────────────────────────────────────────────────────────────────────
  chicken: D({
    label: ["Chicken", "Galinha"],
    group: "farm",
    model: "chicken",
    len: 0.45,
    height: 0.4,
    hp: 12,
    walk: 0.4,
    run: 3,
    pack: [4, 10],
    packKind: "flock",
    hours: "day",
    habitat: { farm: 1 },
    density: 0,
    sight: 12,
    flee: 2.5,
    wary: 0.5,
    diet: "seeds",
    meat: 1,
    hide: "feathers",
    feed: ["seed", "bread", "carrot"],
    befriend: "grown",
    trustDays: 1,
    young: { label: ["Chick", "Pintinho"], days: 3 },
    gives: "egg",
    print: "bird",
    stride: 0.1,
    sound: "chicken",
  }),
  cow: D({
    label: ["Cow", "Vaca"],
    group: "farm",
    model: "cow",
    len: 2.4,
    height: 1.4,
    hp: 200,
    walk: 1.1,
    run: 6,
    pack: [3, 8],
    packKind: "herd",
    hours: "day",
    habitat: { farm: 1 },
    density: 0,
    sight: 20,
    flee: 2,
    wary: 0.1,
    diet: "grazer",
    meat: 10,
    hide: "leather",
    feed: ["carrot", "apple", "bread"],
    befriend: "grown",
    trustDays: 2,
    young: { label: ["Calf", "Bezerro"], days: 6 },
    gives: "milk",
    print: "hoof",
    stride: 0.65,
    sound: "cow",
  }),
  sheep: D({
    label: ["Sheep", "Ovelha"],
    group: "farm",
    model: "sheep",
    len: 1.3,
    height: 0.8,
    hp: 60,
    walk: 1,
    run: 6,
    pack: [4, 12],
    packKind: "herd",
    hours: "day",
    habitat: { farm: 1 },
    density: 0,
    sight: 20,
    flee: 3,
    wary: 0.4,
    diet: "grazer",
    meat: 4,
    hide: "wool",
    feed: ["carrot", "apple", "bread"],
    befriend: "grown",
    trustDays: 2,
    young: { label: ["Lamb", "Cordeiro"], days: 5 },
    gives: "wool",
    print: "hoof",
    stride: 0.35,
    sound: "sheep",
  }),
  pig: D({
    label: ["Pig", "Porco"],
    group: "farm",
    model: "pig",
    len: 1.4,
    height: 0.8,
    hp: 90,
    walk: 1,
    run: 5,
    pack: [2, 6],
    packKind: "herd",
    hours: "day",
    habitat: { farm: 1 },
    density: 0,
    sight: 15,
    flee: 2,
    wary: 0.2,
    diet: "omnivore",
    meat: 6,
    hide: "leather",
    feed: ["apple", "carrot", "bread", "nut"],
    befriend: "grown",
    trustDays: 2,
    young: { label: ["Piglet", "Leitão"], days: 5 },
    print: "hoof",
    stride: 0.35,
    sound: "pig",
  }),
  horse: D({
    label: ["Horse", "Cavalo"],
    group: "farm",
    model: "horse",
    len: 2.4,
    height: 1.6,
    hp: 180,
    walk: 1.7,
    run: 14,
    pack: [2, 5],
    packKind: "herd",
    hours: "day",
    habitat: { farm: 1 },
    density: 0,
    sight: 30,
    flee: 3,
    wary: 0.35,
    diet: "grazer",
    meat: 0,
    feed: ["apple", "carrot"],
    befriend: "grown",
    trustDays: 3,
    young: { label: ["Foal", "Potro"], days: 7 },
    ride: true,
    print: "hoof",
    stride: 0.8,
    sound: "horse",
  }),
} satisfies Record<string, Omit<AnimalDef, "key">>;

export type AnimalKind = keyof typeof ANIMAL_DEFS;
export const ANIMAL_KINDS = Object.keys(ANIMAL_DEFS) as AnimalKind[];
export const ANIMALS: Record<AnimalKind, AnimalDef> = Object.fromEntries(
  ANIMAL_KINDS.map((k) => [k, { key: k, ...ANIMAL_DEFS[k] } as AnimalDef]),
) as Record<AnimalKind, AnimalDef>;
export const isAnimalKind = (k: unknown): k is AnimalKind =>
  typeof k === "string" && Object.hasOwn(ANIMAL_DEFS, k);

/** The client's tiny life (F4b follow-up): drawn by each client, seeded by place and time, no server. */
export const TINY = ["butterfly", "firefly", "fishShoal", "farFlock", "leapingFish"] as const;
export type Tiny = (typeof TINY)[number];

/** A young one's look: smaller, with a bigger head and longer legs for its size (the client's bones). */
export const YOUNG = { scale: 0.45, head: 1.35, legs: 1.12 } as const;

/** Is it about at this hour (0..24)? 1 fully, 0 not at all (asleep, in its den). */
export function activeAt(hours: Hours, hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  // (dawn 5–8, dusk 17–21)
  const dawn = h >= 5 && h < 8;
  const dusk = h >= 17 && h < 21;
  const night = h >= 21 || h < 5;
  switch (hours) {
    case "always":
      return 1;
    case "day":
      return night ? 0 : dawn || dusk ? 0.6 : 1;
    case "night":
      return night ? 1 : dawn || dusk ? 0.6 : 0;
    case "twilight":
      return dawn || dusk ? 1 : night ? 0.55 : 0.35;
  }
}

/** Its danger tonight: distances scaled by how dark it is (0 day … 1 night). */
export function dangerAt(d: Danger, night: number): Danger {
  const k = 1 + (d.night - 1) * night;
  return { ...d, warn: d.warn * k, charge: d.charge * k, territory: d.territory };
}

/** Does `a` hunt `b`? */
export const hunts = (a: AnimalKind, b: AnimalKind): boolean => !!ANIMALS[a].prey?.includes(b);

/** What it eats from a hand: the food, if it takes it. */
export const takes = (a: AnimalKind, food: string): boolean => (ANIMALS[a].feed as readonly string[]).includes(food);

/** Who comes for people: those with a danger (by territory or cornered). */
export const isDangerous = (a: AnimalKind): boolean => !!ANIMALS[a].danger;

/** Can it be befriended at this age (young: under its days to grow)? */
export const befriendable = (a: AnimalKind, young: boolean): boolean =>
  ANIMALS[a].befriend === "grown" || young;

/** Where food is taken from (phase 9): a crate by the barn's doors, one outside the market (x, z: metres). */
export const FEED_CRATES = [
  { key: "barn", x: 437.5, z: -306 },
  { key: "market", x: 366, z: -398.6 },
] as const;
export const CRATE_REACH = 3;
/** What a crate gives, a handful at a time, into the left hand. */
export const CRATE_FOODS = ["bread", "seed", "nut", "apple", "carrot"] as const;
