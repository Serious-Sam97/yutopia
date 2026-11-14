// The fight with Vortex's sound candidates (docs/plan/88-vortex-fight.md phase 5): each slot's searches on
// Freesound (CC0, the most downloaded first — tools/sfx-search.mjs) → tools/sfx-vortex.json, for
// tools/sfx-weather.mjs (LIST=tools/sfx-vortex.json DIR=vortex) to fetch and cut. The user picks by ear on
// /dev/vortex-sound.
//   node tools/sfx-vortex-search.mjs
//   ONLY=vx-hit,vx-rew node tools/sfx-vortex-search.mjs
import { searchSlots } from "./sfx-search.mjs";

const ROOT = new URL("../", import.meta.url).pathname;
const OUT = `${ROOT}tools/sfx-vortex.json`;
const only = process.env.ONLY?.split(",");

// slot: [kind, [queries], [min s, max s], how many]
const SLOTS = {
  // shot, he's hurt: hollow plastic, a cassette's shell; act III's distorted
  "vx-hit": [
    "shot",
    ["plastic hit hollow", "plastic toy impact", "plastic box hit", "cassette case drop"],
    [0.1, 10],
    4,
  ],
  "vx-hit-dark": [
    "shot",
    ["distorted impact", "glitch impact", "tape distortion hit", "bass distorted hit"],
    [0.1, 10],
    4,
  ],
  // his voice: tape chirps cut into syllables (a babble a line), *kkzzt* a burst of static
  "vx-babble": [
    "shot",
    ["tape rewind chirp", "cassette fast forward", "tape scrubbing", "reel to reel rewind", "chipmunk gibberish"],
    [0.3, 40],
    4,
  ],
  "vx-kkzzt": [
    "shot",
    ["static burst", "radio static short", "tv static burst", "electric crackle short"],
    [0.2, 10],
    4,
  ],
  // act I: a side-step
  "vx-dodge": ["shot", ["quick whoosh", "swish", "cartoon dodge whoosh"], [0.1, 5], 4],
  // act II: the tape whip, taped up, cut free; REW, PAUSE, PLAY; the confiscation (and the duck); the radio's blast;
  // HR
  "vx-whip": ["shot", ["whip crack", "whip lash", "rope whip swish"], [0.1, 6], 4],
  "vx-bound": ["shot", ["duct tape wrap", "packing tape roll", "tape roll unwind", "duct tape"], [0.3, 15], 4],
  "vx-free": ["shot", ["duct tape rip", "tape tear", "tearing tape", "rip tape off"], [0.2, 10], 4],
  "vx-rew": ["shot", ["vhs rewind", "cassette rewind", "tape rewind", "vcr rewind"], [0.4, 20], 4],
  "vx-pause": [
    "shot",
    ["vcr button press", "cassette player button", "tape deck button", "cassette stop button"],
    [0.1, 6],
    4,
  ],
  "vx-play": ["shot", ["cassette play button", "tape deck play", "vcr play", "cassette insert play"], [0.1, 6], 4],
  "vx-steal": ["shot", ["snatch whoosh", "quick swipe whoosh", "magic poof", "cartoon steal"], [0.1, 6], 4],
  "vx-duck": ["shot", ["rubber duck squeak", "squeaky toy", "rubber duck"], [0.1, 6], 4],
  "vx-radio": [
    "shot",
    ["funk loop", "disco loop", "dance music loop", "retro music loop", "boombox music loud"],
    [1, 30],
    4,
  ],
  "vx-hr": ["shot", ["service bell ding", "desk bell", "office bell", "rubber stamp"], [0.1, 6], 4],
  // act III: the lights out (a breaker, the hum dying), their flicker; the music's turn; his clones, one popped; his
  // blow; possession; the glitch
  "vx-dark": ["shot", ["power down", "electricity shut off", "breaker power off", "generator shut down"], [0.5, 15], 4],
  "vx-flicker": [
    "shot",
    ["fluorescent light flicker", "light flicker buzz", "neon flicker", "electrical buzz flicker"],
    [0.3, 15],
    4,
  ],
  "vx-music3": [
    "loop",
    ["dark ambient drone loop", "horror drone loop", "ominous drone", "dark ambience loop"],
    [10, 600],
    4,
  ],
  "vx-clones": ["shot", ["glitch stutter", "digital glitch", "glitch split", "glitch effect"], [0.1, 6], 4],
  "vx-pop": ["shot", ["pop cartoon", "bubble pop", "balloon pop small"], [0.05, 4], 4],
  "vx-strike": ["shot", ["punch impact heavy", "body hit thud", "heavy punch"], [0.1, 5], 4],
  "vx-possess": ["shot", ["demonic whisper", "horror whisper", "creepy whisper", "ghost whisper"], [0.6, 15], 4],
  "vx-glitch": ["shot", ["data glitch noise", "digital noise burst", "glitch noise", "corrupted audio"], [0.3, 10], 4],
  // the end: he's down (the tape stopping), his tape unspooling, the cassette taken; the grudge's sting
  "vx-down": ["shot", ["tape stop", "tape slow down", "record slow down", "power down slow"], [0.4, 10], 4],
  "vx-unspool": [
    "shot",
    [
      "cassette tape pulled out",
      "tape unspool",
      "magnetic tape",
      "pulling tape",
      "cassette tape crumple",
      "film reel unspool",
      "tape unwinding",
      "film strip",
    ],
    [0.4, 20],
    4,
  ],
  "vx-pickup": [
    "shot",
    ["cassette tape handling", "cassette case open close", "cassette insert", "plastic case click"],
    [0.1, 6],
    4,
  ],
  "vx-grudge": ["shot", ["horror sting", "ominous stinger", "suspense sting", "creepy sting"], [0.5, 10], 4],
};

await searchSlots(
  SLOTS,
  OUT,
  "The fight with Vortex's sound candidates (docs/plan/88-vortex-fight.md phase 5): CC0 on Freesound, the most downloaded of each slot's searches (tools/sfx-vortex-search.mjs), fetched as their HQ previews and cut by tools/sfx-weather.mjs (LIST=tools/sfx-vortex.json DIR=vortex). The user picks by ear on /dev/vortex-sound.",
  only,
);
