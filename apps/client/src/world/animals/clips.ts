// An animal's clip: for what it's doing and its pace (clipOf), and — whatever that is — its legs going while it really
// goes somewhere (onTheMove): a clip made standing still (the attack, eating, looking) played as it moves slides it
// along the ground, its legs still (a bear, a wolf coming at you).
import type { Doing, Pace } from "@yutopia/shared/animals/mind";

/** Clips made standing still: not played while it really goes somewhere (its legs go instead). */
export const STILL_CLIPS = new Set<string>(["attack", "eat", "look", "idle", "stamp", "sniff", "drink", "groom", "howl", "play"]);
/** How long a strike's attack plays (ms): a lunge, then on. */
export const STRIKE_MS = 650;

/** The clip for a doing and a pace. */
export function clipOf(doing: Doing, pace: Pace, flies: boolean, h: number) {
  const aloft = h > 0.6;
  switch (doing) {
    case "dead":
      return "die" as const;
    case "sleep":
    case "rest":
      return "lie" as const;
    case "graze":
    case "eat":
      return "eat" as const;
    case "alert":
    case "warn":
      return "look" as const;
    case "attack":
      return "attack" as const;
    case "ridden":
      return pace === "still" ? ("idle" as const) : pace === "walk" ? ("walk" as const) : pace === "trot" ? ("trot" as const) : ("run" as const);
    case "perch":
      return "idle" as const;
    // (plan 128: its day's own — made in Blender where a model hadn't them; the nearest it has otherwise)
    case "drink":
      return "drink" as const;
    case "sniff":
      return "sniff" as const;
    case "groom":
      return "groom" as const;
    case "play":
      return "play" as const;
    case "call":
      return "howl" as const;
    case "alarm":
      return "stamp" as const;
  }
  if (flies && (pace === "fly" || aloft)) return "fly" as const;
  if (pace === "swim") return "swim" as const;
  if (pace === "run") return "run" as const;
  if (pace === "trot") return "trot" as const;
  if (pace === "walk") return "walk" as const;
  return "idle" as const;
}


/** The clip it plays, moving or not: its attack while it strikes; a still clip, if it's really going somewhere on the
 *  ground, its gait instead (the caller picks walk, trot or run by its speed). */
export function onTheMove<C extends string>(
  clip: C,
  o: { walking: boolean; striking: boolean; aloft: boolean; h: number },
): C | "attack" | "run" {
  if (o.striking) return "attack";
  if (o.walking && !o.aloft && o.h < 0.05 && STILL_CLIPS.has(clip)) return "run";
  return clip;
}
