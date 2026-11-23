import { parseAvatar } from "../avatar.ts";
import { KART_FOLK } from "../kart/park.ts";
import { STRIKE_FOLK, STRIKE_LINES } from "../strike/folk.ts";
import { defaultBehaviour, type NpcDef, type NpcType, type Words } from "./cast.ts";

// The town's people as they were code (docs/plan/120-god-mode-npcs.md): the cast's first entries, sent to the API
// once by the world server (seeded, never again: a town NPC deleted stays deleted), and the cast offline. With these
// the world is exactly as it was: the same names over their heads, the same looks, lines and pace.

/** The night guard's look (the client's GUARD_LOOK, before the cast): his rounds walked heavy. */
const GUARD_LOOK = {
  gait: "heavy",
  body: "broad",
  skin: "#c9a27e",
  hair: "short",
  hairColor: "#2a2420",
  top: "jacket",
  topColor: "#1f2a3a",
  bottom: "trousers",
  bottomColor: "#1a1f28",
  accessory: "cap",
  accessoryColor: "#1f2a3a",
};

/** The Kart Park's folk's lines (world-server park-life.ts's FOLK_LINES, before the cast), by role. */
const KART_LINES: Record<string, string[]> = {
  control: [
    "Karts are on the rack: X at the desk takes one.",
    "Next race is up to you: a Grand Prix or the Bowl.",
    "Vortex holds the lap record. For now.",
    "Mind the jump on the north straight!",
  ],
  mechanic: ["She pulls left. Always pulls left.", "Who put snow in the carburettor?", "Tyres are warm. Go on."],
  cocoa: ["Hot cocoa! Marshmallows on top.", "Warm your hands by the fire.", "A free cocoa for whoever beats Vortex."],
  visitor: [
    "Did you see that drift?",
    "I'm doing the Bowl next.",
    "Brr. Cocoa?",
    "That jump, though!",
    "Purple sparks!",
  ],
};

/** What each does, as the client named them over their heads (grounds-life.ts, before the cast). */
const KART_ROLE: Record<string, Words> = {
  control: { en: "Race control", pt: "Direção de prova" },
  mechanic: { en: "Mechanic", pt: "Mecânico" },
  cocoa: { en: "Hot cocoa", pt: "Chocolate quente" },
  visitor: { en: "", pt: "" },
};
const STRIKE_ROLE: Record<string, Words> = {
  quartermaster: { en: "Quartermaster", pt: "Intendente" },
  instructor: { en: "Instructor", pt: "Instrutor" },
  cook: { en: "Canteen", pt: "Cantina" },
  keeper: { en: "The Last Round", pt: "O Último Round" },
  officer: { en: "War room", pt: "Sala de guerra" },
  recruit: { en: "Recruit", pt: "Recruta" },
};
const KART_NOTES: Record<string, string> = {
  control: "Kart Park: at the race desk.",
  mechanic: "Kart Park: at the kart up on its stand, now and then round its side.",
  cocoa: "Kart Park: at the cocoa cart.",
  visitor: "Kart Park: goes between the cocoa, the fire's benches, the rack, the stands and the podium.",
};
const STRIKE_NOTES: Record<string, string> = {
  quartermaster: "Strike Park lobby: at the armory's door.",
  instructor: "Strike Park lobby: by the desk.",
  cook: "Strike Park lobby: in the canteen.",
  keeper: "Strike Park lobby: at the bar, The Last Round.",
  officer: "Strike Park lobby: in the war room.",
  recruit: "Strike Park lobby: walks from the yard's hub to a door, the board, the desk, the stairs or the gate.",
};

const ambient = (l: string[]) => l.map((en) => ({ when: "ambient", en, pt: "" }));

function town(key: string, name: string, role: Words, look: Record<string, string> | null, type: NpcType) {
  const d: NpcDef = {
    key,
    name,
    role,
    look: look ? parseAvatar(look) : null,
    voice: look?.gender === "feminine" ? "woman" : "man",
    lines: [],
    notes: "",
    behaviour: defaultBehaviour(type),
    town: true,
  };
  return d;
}

/** The town's people, as they were code. */
export function townCast(): NpcDef[] {
  const out: NpcDef[] = [];
  const guard = town("guard", "", { en: "Night guard", pt: "Vigia" }, GUARD_LOOK, "guard-rounds");
  guard.notes = "By day at his post in the gatehouse; as it gets dark he walks out to the fence and does his rounds.";
  out.push(guard);
  const vortex = town("vortex", "VORTEX", { en: "", pt: "" }, null, "vortex");
  vortex.notes =
    "The studio's mascot: wanders the building, dances to the radio, sleeps in the server room, and fights back " +
    "when shot (plan 88). His lines come by moment; the personal ones (with your name) stay his own.";
  out.push(vortex);
  for (const f of KART_FOLK) {
    const d = town(`folk-${f.id}`, f.name, KART_ROLE[f.role], f.look, `kart-${f.role}` as NpcType);
    d.lines = ambient(KART_LINES[f.role] ?? KART_LINES.visitor);
    d.notes = KART_NOTES[f.role] ?? "";
    out.push(d);
  }
  for (const f of STRIKE_FOLK) {
    const d = town(`strike-${f.id}`, f.name, STRIKE_ROLE[f.role], f.look, `strike-${f.role}` as NpcType);
    d.lines = ambient(STRIKE_LINES[f.role] ?? STRIKE_LINES.recruit);
    d.notes = STRIKE_NOTES[f.role] ?? "";
    out.push(d);
  }
  return out;
}
