// The parks' named gaps (docs/plan/104-the-skate-again.md F9a): Tony Hawk's gaps — leave one zone, land (or grind)
// in another, and the gap's name and points go on the combo. Our own names and our own layouts (skate/parks.ts
// TOWN_PARKS: gaps.test.ts holds each zone to a piece's face, a grind line or the floor). Plain numbers: the HUD
// and the scorer read these without the pieces.
//
// Frame: the floor's — x east, y south (the Grounds' z), z up (world heights: the parks' floors are at 1.5).

export type GapKind = "transfer" | "rail" | "hip" | "spine" | "stair" | "ledge";
/** A gap's zone: a ball (x, y, z, its radius r), m. */
export interface GapZone {
  x: number;
  y: number;
  z: number;
  r: number;
}
export interface Gap {
  id: string;
  name: string;
  pts: number;
  /** the park's key (TOWN_PARKS) */
  park: string;
  kind: GapKind;
  /** left from here… */
  from: GapZone;
  /** …and landed (or ground) in here */
  to: GapZone;
  /** how it's crossed: through the air, along a rail or coping, on two wheels */
  via?: "air" | "grind" | "manual";
}

const z = (x: number, y: number, h: number, r: number): GapZone => ({ x, y, z: h, r });

export const GAPS: Gap[] = [
  // ── the hall ──
  {
    id: "hall-ext-transfer",
    name: "Extension Transfer",
    pts: 750,
    park: "hall",
    kind: "transfer",
    // (off the vert's west wall beside the extension, onto the extension's coping 1.22 m higher)
    from: z(457.9, -525.6, 5.05, 1.4),
    to: z(457.9, -529.6, 6.27, 1.4),
    via: "air",
  },
  {
    id: "hall-mezz-drop",
    name: "Mezzanine Drop",
    pts: 250,
    park: "hall",
    kind: "transfer",
    // (off the mezzanine's open north edge, 8 ft to the floor)
    from: z(464, -511, 3.94, 1.5),
    to: z(464, -515, 1.5, 2.5),
    via: "air",
  },
  {
    id: "hall-fourteen",
    name: "Big Fourteen",
    pts: 1000,
    park: "hall",
    kind: "stair",
    // (the mezzanine's fourteen stairs, cleared)
    from: z(457.825, -510.9, 3.94, 1.2),
    to: z(457.825, -517, 1.5, 1.6),
    via: "air",
  },
  {
    id: "hall-mezz-rail",
    name: "Mezzanine Rail",
    pts: 750,
    park: "hall",
    kind: "rail",
    // (down a handrail of the fourteen, top kink to bottom)
    from: z(457.825, -511.5, 4.6, 1.5),
    to: z(457.825, -515.4, 2.47, 1.5),
    via: "grind",
  },
  {
    id: "hall-spine",
    name: "Hall Spine Transfer",
    pts: 300,
    park: "hall",
    kind: "spine",
    from: z(477, -527, 2.2, 1.2),
    to: z(479, -527, 2.2, 1.2),
    via: "air",
  },
  {
    id: "hall-hip",
    name: "Island Hip",
    pts: 400,
    park: "hall",
    kind: "hip",
    // (up the island's west face, over its hip, down its north face)
    from: z(485.2, -524.6, 2.1, 1.1),
    to: z(487.8, -527.2, 2.1, 1.1),
    via: "air",
  },
  {
    id: "hall-rail-bank",
    name: "Rail to Bank",
    pts: 350,
    park: "hall",
    kind: "rail",
    // (off the end of the flat rail onto the island's bank)
    from: z(487.675, -518.4, 1.88, 0.8),
    to: z(487.675, -520.6, 2.07, 1),
    via: "grind",
  },
  {
    id: "hall-seven",
    name: "Hall Seven",
    pts: 500,
    park: "hall",
    kind: "stair",
    from: z(493.525, -524.7, 2.72, 1.2),
    to: z(493.525, -521, 1.5, 1.4),
    via: "air",
  },
  {
    id: "hall-seven-rail",
    name: "Seven Rail",
    pts: 500,
    park: "hall",
    kind: "rail",
    from: z(493.525, -524.3, 3.4, 1.4),
    to: z(493.525, -522.6, 2.47, 1.4),
    via: "grind",
  },
  {
    id: "hall-manny-ledge",
    name: "Manny to Ledge",
    pts: 250,
    park: "hall",
    kind: "ledge",
    // (along the manual pad on two wheels, into a grind on the ledge after it)
    from: z(475.2, -517, 1.7, 0.6),
    to: z(477.9, -517, 1.95, 0.7),
    via: "manual",
  },
  {
    id: "hall-corner",
    name: "Corner Coping",
    pts: 300,
    park: "hall",
    kind: "rail",
    // (round the north-east corner's coping, north wall to east)
    from: z(495.8, -534.62, 2.72, 0.7),
    to: z(498.62, -531.8, 2.72, 0.7),
    via: "grind",
  },

  // ── the yard ──
  {
    id: "yard-pocket-hip",
    name: "Pocket Hip",
    pts: 400,
    park: "yard",
    kind: "hip",
    // (the bowl's hip at the pocket's mouth: up its pocket face, down its main face)
    from: z(493.9, -467.6, 2, 1),
    to: z(496.6, -470.1, 2, 1),
    via: "air",
  },
  {
    id: "yard-pocket-hop",
    name: "Pocket Hop",
    pts: 500,
    park: "yard",
    kind: "transfer",
    // (out of the pocket's west wall, over its floor, into the hip's face)
    from: z(486.6, -467.5, 2.4, 1.2),
    to: z(494.4, -467.5, 2.4, 1.2),
    via: "air",
  },
  {
    id: "yard-corner",
    name: "Snow Bowl Corner",
    pts: 300,
    park: "yard",
    kind: "rail",
    from: z(497.5, -479.725, 2.72, 0.7),
    to: z(500.4, -476.8, 2.72, 0.7),
    via: "grind",
  },
  {
    id: "yard-seven",
    name: "Plaza Seven",
    pts: 500,
    park: "yard",
    kind: "stair",
    from: z(467.525, -473.7, 2.72, 1.2),
    to: z(467.525, -470, 1.5, 1.4),
    via: "air",
  },
  {
    id: "yard-seven-rail",
    name: "Plaza Rail",
    pts: 500,
    park: "yard",
    kind: "rail",
    from: z(467.525, -473.3, 3.4, 1.4),
    to: z(467.525, -471.6, 2.47, 1.4),
    via: "grind",
  },
  {
    id: "yard-rail-bank",
    name: "Plaza Rail to Bank",
    pts: 350,
    park: "yard",
    kind: "rail",
    from: z(467.525, -481, 1.88, 0.8),
    to: z(467.525, -479, 1.98, 1),
    via: "grind",
  },
  {
    id: "yard-ledges",
    name: "Ledge Line",
    pts: 400,
    park: "yard",
    kind: "ledge",
    // (off the first ledge, over the manual pad on two wheels, onto the second)
    from: z(482.5, -484.3, 1.95, 0.7),
    to: z(482.5, -475.7, 1.95, 0.7),
    via: "manual",
  },
  {
    id: "yard-pyramid",
    name: "Pyramid Hop",
    pts: 250,
    park: "yard",
    kind: "transfer",
    from: z(471.3, -459.5, 1.9, 1),
    to: z(475.7, -459.5, 1.9, 1),
    via: "air",
  },
  {
    id: "yard-spine",
    name: "Yard Spine Transfer",
    pts: 300,
    park: "yard",
    kind: "spine",
    from: z(475.6, -489.4, 2.1, 1.2),
    to: z(477.4, -489.4, 2.1, 1.2),
    via: "air",
  },
  {
    id: "yard-kicker",
    name: "Kicker Gap",
    pts: 250,
    park: "yard",
    kind: "transfer",
    from: z(465.5, -468.4, 1.95, 0.9),
    to: z(465.5, -462.4, 1.9, 1),
    via: "air",
  },
];

/** Is (x, y, z) in a gap's zone? */
export const inZone = (g: GapZone, x: number, y: number, h: number) =>
  (x - g.x) ** 2 + (y - g.y) ** 2 + (h - g.z) ** 2 <= g.r * g.r;
