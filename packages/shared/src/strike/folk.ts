// The Strike Park's people (docs/plan/115-the-strike-park-again.md, arc F, phases 51–52): the lobby's staff at their
// posts — the quartermaster at the armory's door, the instructor by the desk, the canteen's cook, the bar's keeper,
// the war room's officer — and recruits going between the canteen, the bar, the armory, the board, the trophy hall
// and the gallery's stairs, saying a line now and then. Room NPCs (world-server features/strike-life.ts walks them);
// the client draws them from these looks (grounds-life.ts folk), as the Kart Park's folk.

import { STRIKE_BOARD, STRIKE_DESK, STRIKE_GATE, STRIKE_YARD } from "./land.ts";

export type StrikeRole = "quartermaster" | "instructor" | "cook" | "keeper" | "officer" | "recruit";

export interface StrikeFolk {
  id: string;
  name: string;
  role: StrikeRole;
  look: Record<string, string>;
}

const look = (o: Record<string, string>) => o;
export const STRIKE_FOLK: StrikeFolk[] = [
  {
    id: "marta",
    name: "Marta",
    role: "quartermaster",
    look: look({
      gait: "heavy",
      gender: "feminine",
      shoes: "boots",
      body: "broad",
      skin: "#c58c63",
      hair: "bun",
      hairColor: "#2a1d14",
      top: "jacket",
      topColor: "#4b5a3a",
      bottom: "trousers",
      bottomColor: "#2f3328",
    }),
  },
  {
    id: "dimas",
    name: "Dimas",
    role: "instructor",
    look: look({
      gait: "brisk",
      gender: "masculine",
      shoes: "boots",
      body: "athletic",
      skin: "#8d5a3b",
      hair: "buzz",
      hairColor: "#140e0a",
      top: "shirt",
      topColor: "#2b3036",
      bottom: "trousers",
      bottomColor: "#3a3f2e",
      accessory: "cap",
      accessoryColor: "#e8a33a",
    }),
  },
  {
    id: "nell",
    name: "Nell",
    role: "cook",
    look: look({
      gait: "bouncy",
      gender: "feminine",
      shoes: "sneakers",
      body: "slim",
      skin: "#f0c7a0",
      hair: "ponytail",
      hairColor: "#b5562f",
      top: "shirt",
      topColor: "#e9dcc0",
      bottom: "trousers",
      bottomColor: "#3c3c3c",
    }),
  },
  {
    id: "otto",
    name: "Otto",
    role: "keeper",
    look: look({
      gait: "old",
      gender: "masculine",
      shoes: "boots",
      body: "broad",
      skin: "#e4b48e",
      hair: "short",
      hairColor: "#9a9a9a",
      top: "sweater",
      topColor: "#6b2d2a",
      bottom: "trousers",
      bottomColor: "#2a2018",
    }),
  },
  {
    id: "ines",
    name: "Inês",
    role: "officer",
    look: look({
      gait: "brisk",
      gender: "feminine",
      shoes: "boots",
      body: "slim",
      skin: "#a8693f",
      hair: "bob",
      hairColor: "#1c1410",
      top: "jacket",
      topColor: "#2e3f52",
      bottom: "trousers",
      bottomColor: "#1f262e",
      accessory: "headphones",
      accessoryColor: "#20262c",
    }),
  },
  // the recruits: in the teams' colours, between the rooms
  ...(
    [
      ["kai", "Kai", "masculine", "#d9a066", "#7a5230", "short", "#2b1d12"],
      ["ana-l", "Lena", "feminine", "#6fa3c7", "#f0c7a0", "ponytail", "#e0c080"],
      ["rui", "Rui", "masculine", "#6fa3c7", "#8d5a3b", "buzz", "#120c08"],
      ["sol", "Sol", "feminine", "#d9a066", "#c58c63", "bun", "#3a2414"],
      ["teo", "Teo", "masculine", "#d9a066", "#e4b48e", "short", "#6b4a2a"],
      ["ivy", "Ivy", "feminine", "#6fa3c7", "#a8693f", "bob", "#1c1410"],
    ] as const
  ).map(
    ([id, name, gender, team, skin, hair, hairColor], i): StrikeFolk => ({
      id,
      name,
      role: "recruit",
      look: look({
        gait: ["brisk", "bouncy", "heavy", "brisk", "tired", "bouncy"][i],
        gender,
        shoes: i % 2 ? "sneakers" : "boots",
        body: ["athletic", "slim", "broad", "slim", "athletic", "slim"][i],
        skin,
        hair,
        hairColor,
        top: i % 3 ? "hoodie" : "jacket",
        topColor: team,
        bottom: "trousers",
        bottomColor: "#2c2f2a",
      }),
    }),
  ),
];

/** Each role's lines (our own). */
export const STRIKE_LINES: Record<StrikeRole, string[]> = {
  quartermaster: [
    "Sign for it, bring it back clean.",
    "The AK pulls up and right. Learn it.",
    "No live rounds past the armory door.",
  ],
  instructor: [
    "E at the desk: pick a side, pick a mode.",
    "Counter-strafe, then shoot. Every time.",
    "Smoke the choke, then go together.",
    "Warmup's free. Buy everything, try everything.",
  ],
  cook: [
    "Stew's hot. Eat before the match.",
    "Coffee in the canteen, not on the range.",
    "Seconds for whoever gets the MVP.",
  ],
  keeper: ["The Last Round's open. Always is.", "Losers buy the next one. House rule.", "Tell me about that clutch."],
  officer: [
    "The war room has the match up on its screen.",
    "Sawmill's B is too far for a rotation. Plan it.",
    "Comms, people. Call what you see.",
  ],
  recruit: [
    "Did you see that defuse?",
    "Raiders again? Fine.",
    "I always buy a smoke. Always.",
    "One more round and I'm done.",
    "Who took the sniper?",
    "Mid is a trap on Sawmill.",
  ],
};

/** The staff's posts: where each stands, which way they look (atan2(dz, dx)). Building doors along the yard. */
export function strikePosts(): Record<Exclude<StrikeRole, "recruit">, { x: number; z: number; a: number }> {
  const zn = STRIKE_YARD.z0 + 1.3;
  const zs = STRIKE_YARD.z1 - 1.3;
  return {
    quartermaster: { x: -228, z: zn + 11.2, a: Math.PI / 2 },
    instructor: { x: STRIKE_DESK.x - 2.2, z: STRIKE_DESK.z - 1.6, a: Math.PI / 2 },
    cook: { x: -333, z: zn + 15.2, a: Math.PI / 2 },
    keeper: { x: -364, z: zs - 17.2, a: -Math.PI / 2 },
    officer: { x: -184, z: zs - 10.2, a: -Math.PI / 2 },
  };
}
/** The yard's hub (its open middle): the recruits go out from it to a stop along the stop's own way, and back. */
export const STRIKE_HUB = { x: -265, z: -612 };
/** Where the recruits go, each by its way out from the hub (the last point the stop): the doors, the board, the desk,
 *  the foot of the gallery's stairs, the gate. Kept clear of every building in the yard. */
export function strikeStops(): { name: string; way: { x: number; z: number }[] }[] {
  return [
    {
      name: "canteen",
      way: [
        { x: -300, z: -612.4 },
        { x: -335, z: -613.6 },
      ],
    },
    {
      name: "bar",
      way: [
        { x: -300, z: -612.4 },
        { x: -347, z: -613.4 },
        { x: -351, z: -619.6 },
        { x: -364, z: -619.8 },
      ],
    },
    {
      name: "stairs",
      way: [
        { x: -300, z: -612.4 },
        { x: -347, z: -613.4 },
        { x: -351, z: -620.5 },
        { x: -371, z: -623.6 },
      ],
    },
    {
      name: "armory",
      way: [
        { x: -240, z: -614 },
        { x: -228, z: -618.2 },
      ],
    },
    {
      name: "hall",
      way: [
        { x: -205, z: -613.6 },
        { x: -190, z: -616.2 },
      ],
    },
    { name: "trophies", way: [{ x: -310, z: -612.6 }] },
    {
      name: "war",
      way: [
        { x: -205, z: -613.2 },
        { x: -184, z: -612.6 },
      ],
    },
    { name: "board", way: [{ x: STRIKE_BOARD.x, z: STRIKE_BOARD.z + 2.6 }] },
    { name: "desk", way: [{ x: STRIKE_DESK.x + 2, z: STRIKE_DESK.z + 2.6 }] },
    {
      name: "gate",
      way: [
        { x: -222, z: -608 },
        { x: STRIKE_GATE.x, z: STRIKE_GATE.z - 4 },
      ],
    },
  ];
}
