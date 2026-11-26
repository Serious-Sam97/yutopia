// What each species is like to live with (docs/plan/128-animal-minds.md): how far its day takes it (F3a — scaled
// down from the wild's), where it beds and feeds (F4a), how its group keeps together (F5a), how it senses (F6a), what
// it makes of people (F7a), and what it does with the others (F8a): calls, carrion, curiosity. The species sheet
// (species.ts) is what it is; this is how it behaves.
import { ANIMALS, type AnimalKind, type Habitat } from "./species.ts";

export interface Traits {
  /** its day's round from home (m): its beds, its feeding grounds, its water inside it */
  range: number;
  /** where it beds (by habitat): cover */
  bed: Partial<Record<Habitat, number>>;
  /** where it feeds (by habitat) */
  feed: Partial<Record<Habitat, number>>;
  /** it goes to water to drink */
  drinks: boolean;
  /** how its group keeps: a herd round its lead, a file behind it (a pack, a line of deer), a flock that lifts and
   *  lands as one, a raft on the water; alone */
  keeps: "herd" | "file" | "flock" | "raft" | "alone";
  /** one of a grazing herd keeps watch */
  lookout: boolean;
  /** comes to a kill, a body left lying */
  scavenger: boolean;
  /** 0 never … 1 comes to see what you are (a fox, a crow; the young of anything a little) */
  curious: number;
  /** its sight's cone (degrees): prey sees round, a hunter ahead */
  cone: number;
  /** how well it hears (× a person's noise) */
  hearing: number;
  /** how far its alarm call carries to the others (m), 0 none */
  alarm: number;
  /** it goes at a trot, not a walk (a wolf, a fox: the dog kind's travelling gait) */
  trots?: boolean;
  /** its own call: when, how often (s, at most and at least), all of them at once */
  calls?: { when: "night" | "dawn" | "day" | "dusk" | "always"; every: readonly [number, number]; chorus?: boolean };
}

const woods = { deepwoods: 1, forest: 0.8 } as const;
const open = { field: 1, meadow: 1, forest: 0.3 } as const;

const T: Record<AnimalKind, Traits> = {
  crow: { range: 320, bed: woods, feed: { field: 1, farm: 0.8, town: 0.6, meadow: 0.8 }, drinks: false, keeps: "flock", lookout: true, scavenger: true, curious: 0.6, cone: 300, hearing: 1, alarm: 90, calls: { when: "day", every: [40, 140] } },
  songbird: { range: 90, bed: woods, feed: { forest: 1, field: 0.6, meadow: 0.8, town: 0.4 }, drinks: false, keeps: "flock", lookout: false, scavenger: false, curious: 0.1, cone: 300, hearing: 1, alarm: 30, calls: { when: "dawn", every: [6, 25], chorus: true } },
  duck: { range: 220, bed: { water: 1, shore: 0.8 }, feed: { water: 1, shore: 0.9 }, drinks: false, keeps: "raft", lookout: true, scavenger: false, curious: 0.2, cone: 320, hearing: 1, alarm: 50, calls: { when: "day", every: [30, 120] } },
  goose: { range: 320, bed: { water: 1, shore: 0.8 }, feed: { field: 1, meadow: 1, shore: 0.8 }, drinks: false, keeps: "raft", lookout: true, scavenger: false, curious: 0.1, cone: 320, hearing: 1, alarm: 70, calls: { when: "day", every: [25, 90] } },
  owl: { range: 260, bed: woods, feed: { field: 1, meadow: 1, forest: 0.6 }, drinks: false, keeps: "alone", lookout: false, scavenger: false, curious: 0, cone: 140, hearing: 2.5, alarm: 0, calls: { when: "night", every: [30, 120] } },
  gull: { range: 420, bed: { shore: 1, water: 0.8 }, feed: { shore: 1, water: 0.8, town: 0.5 }, drinks: false, keeps: "flock", lookout: true, scavenger: true, curious: 0.4, cone: 300, hearing: 1, alarm: 60, calls: { when: "day", every: [20, 80] } },
  pigeon: { range: 140, bed: { town: 1 }, feed: { town: 1, farm: 0.6 }, drinks: false, keeps: "flock", lookout: false, scavenger: false, curious: 0.3, cone: 300, hearing: 1, alarm: 25, calls: { when: "day", every: [30, 100] } },
  bat: { range: 300, bed: woods, feed: { field: 1, shore: 1, meadow: 1, water: 0.8 }, drinks: false, keeps: "flock", lookout: false, scavenger: false, curious: 0, cone: 360, hearing: 3, alarm: 0 },
  squirrel: { range: 60, bed: woods, feed: { forest: 1, deepwoods: 0.8, town: 0.5 }, drinks: false, keeps: "alone", lookout: false, scavenger: false, curious: 0.3, cone: 300, hearing: 1.2, alarm: 35, calls: { when: "day", every: [60, 200] } },
  hare: { range: 130, bed: { forest: 1, field: 0.6 }, feed: open, drinks: false, keeps: "alone", lookout: false, scavenger: false, curious: 0, cone: 340, hearing: 2, alarm: 0 },
  fox: { trots: true, range: 380, bed: { forest: 1, deepwoods: 0.8 }, feed: { field: 1, meadow: 1, farm: 0.8, forest: 0.5 }, drinks: true, keeps: "alone", lookout: false, scavenger: true, curious: 0.7, cone: 200, hearing: 2, alarm: 0, calls: { when: "night", every: [120, 400] } },
  raccoon: { range: 220, bed: woods, feed: { shore: 1, town: 0.9, farm: 0.8, forest: 0.6 }, drinks: true, keeps: "alone", lookout: false, scavenger: true, curious: 0.6, cone: 200, hearing: 1.3, alarm: 0 },
  beaver: { range: 120, bed: { water: 1, shore: 1 }, feed: { shore: 1, forest: 0.6 }, drinks: false, keeps: "raft", lookout: false, scavenger: false, curious: 0.1, cone: 260, hearing: 1.4, alarm: 60 },
  frog: { range: 30, bed: { shore: 1, water: 1 }, feed: { shore: 1 }, drinks: false, keeps: "alone", lookout: false, scavenger: false, curious: 0, cone: 300, hearing: 1, alarm: 0, calls: { when: "dusk", every: [8, 30], chorus: true } },
  cat: { range: 160, bed: { town: 1, farm: 0.8 }, feed: { town: 1, farm: 1, field: 0.5 }, drinks: true, keeps: "alone", lookout: false, scavenger: true, curious: 0.5, cone: 200, hearing: 2, alarm: 0 },
  deer: { range: 450, bed: { deepwoods: 1, forest: 0.9 }, feed: { field: 1, meadow: 1, forest: 0.5, farm: 0.6 }, drinks: true, keeps: "file", lookout: true, scavenger: false, curious: 0.1, cone: 310, hearing: 2, alarm: 70 },
  elk: { range: 650, bed: { forest: 1, deepwoods: 0.8 }, feed: { meadow: 1, field: 1, alpine: 0.8, shore: 0.5 }, drinks: true, keeps: "file", lookout: true, scavenger: false, curious: 0.1, cone: 300, hearing: 1.8, alarm: 90, calls: { when: "dusk", every: [200, 600] } },
  moose: { range: 500, bed: { deepwoods: 1, shore: 0.6 }, feed: { shore: 1, water: 0.8, forest: 0.7 }, drinks: true, keeps: "alone", lookout: false, scavenger: false, curious: 0, cone: 280, hearing: 1.6, alarm: 0 },
  boar: { range: 420, bed: { deepwoods: 1, forest: 0.8 }, feed: { forest: 1, farm: 0.8, field: 0.6 }, drinks: true, keeps: "herd", lookout: false, scavenger: true, curious: 0.2, cone: 240, hearing: 1.6, alarm: 40 },
  wolf: { trots: true, range: 900, bed: { deepwoods: 1, alpine: 0.6 }, feed: { forest: 1, field: 0.8, meadow: 0.8 }, drinks: true, keeps: "file", lookout: false, scavenger: true, curious: 0.2, cone: 200, hearing: 2, alarm: 0, calls: { when: "night", every: [180, 480], chorus: true } },
  lynx: { range: 600, bed: { alpine: 1, deepwoods: 0.9 }, feed: { forest: 1, deepwoods: 0.8 }, drinks: true, keeps: "alone", lookout: false, scavenger: false, curious: 0.1, cone: 200, hearing: 2.2, alarm: 0 },
  bear: { range: 700, bed: { deepwoods: 1 }, feed: { forest: 1, shore: 0.9, field: 0.5 }, drinks: true, keeps: "alone", lookout: false, scavenger: true, curious: 0.3, cone: 200, hearing: 1.5, alarm: 0, calls: { when: "always", every: [400, 1200] } },
  // (the farm's: kept in their pens — their day's there)
  chicken: { range: 0, bed: { farm: 1 }, feed: { farm: 1 }, drinks: false, keeps: "herd", lookout: false, scavenger: false, curious: 0.3, cone: 300, hearing: 1, alarm: 15, calls: { when: "dawn", every: [40, 160] } },
  cow: { range: 0, bed: { farm: 1 }, feed: { farm: 1 }, drinks: false, keeps: "herd", lookout: false, scavenger: false, curious: 0.4, cone: 300, hearing: 1, alarm: 0, calls: { when: "day", every: [120, 400] } },
  sheep: { range: 0, bed: { farm: 1 }, feed: { farm: 1 }, drinks: false, keeps: "herd", lookout: false, scavenger: false, curious: 0.2, cone: 320, hearing: 1, alarm: 15, calls: { when: "day", every: [90, 300] } },
  pig: { range: 0, bed: { farm: 1 }, feed: { farm: 1 }, drinks: false, keeps: "herd", lookout: false, scavenger: false, curious: 0.5, cone: 280, hearing: 1, alarm: 0, calls: { when: "day", every: [90, 300] } },
  horse: { range: 0, bed: { farm: 1 }, feed: { farm: 1 }, drinks: false, keeps: "herd", lookout: true, scavenger: false, curious: 0.5, cone: 340, hearing: 1.4, alarm: 20, calls: { when: "day", every: [200, 600] } },
};

/** How `kind` lives (the young: closer, more curious, no alarm of their own). */
export function traitsOf(kind: AnimalKind, young = false): Traits {
  const t = T[kind];
  if (!young) return t;
  return { ...t, range: t.range * 0.6, curious: Math.min(1, t.curious + 0.3), alarm: 0, calls: undefined };
}
export const TRAITS = T;

/** How far its call carries to people (m): a howl over the woods, an owl, the dawn's birds (the server sends it that far,
 *  the client hears it that far); an alarm's 160. */
export const CALL_HEARD: Partial<Record<AnimalKind, number>> = { wolf: 1500, elk: 900, moose: 600, owl: 500, bear: 500, fox: 400, goose: 400, crow: 350, gull: 350, cow: 300, horse: 300 };
export const CALL_NEAR = 200;
export const ALARM_HEARD = 160;

/** A person's noise (m heard by a hearing of 1): by how they move — a sprint, a walk, crouched and slow, still. */
export function noiseOf(v: number, low: boolean): number {
  if (v < 0.3) return 0;
  if (low && v < 1.5) return 4;
  if (v < 1.8) return 14;
  if (v < 3.5) return 26;
  return 45;
}

/** Is this species awake (its hours: species.ts activeAt) enough to call now, by its calls' `when`? */
export function callsNow(kind: AnimalKind, hour: number): boolean {
  const c = T[kind].calls;
  if (!c) return false;
  const night = hour < 5 || hour >= 20.5;
  const dawn = hour >= 4.5 && hour < 8;
  const dusk = hour >= 17 && hour < 20.5;
  switch (c.when) {
    case "night":
      return night;
    case "dawn":
      return dawn;
    case "dusk":
      return dusk;
    case "day":
      return hour >= 7 && hour < 18;
    case "always":
      return true;
  }
}

// (every species has its traits: a new one in the sheet and not here fails to type)
void ANIMALS;
