# Plan 128 — Animal minds

Asked 2026-11-25, after plans 126–127:

> I notice that they do not go around so much, we need to improve this system, lets create a plan just for the animal
> inteligence, interactions etc....
>
> lets plan

Status: **planned 2026-11-25; forks decided 2026-11-25, one by one; built 2026-11-25 straight through (F12a), tested — not committed.** What was built is under "Built" at the end.

The forks:
- **F1c** everything: movement, the day, groups, senses, people, and the animals' life with each other;
- **F2b** utility scoring with inertia;
- **F3a** ranges scaled from the real ones, in the species sheet;
- **F4a** places per group from the land (bed, feeding, water, den or roost) and trails between them;
- **F5a** flocking round a lead;
- **F6a** sight cone with line of sight, hearing by gait, alarm calls passed on (no smell or wind);
- **F7a** graded reactions, getting used to people, and remembering danger;
- **F8a** pack hunts, mothers and young, scavengers, calls (no rivalry, play or seasons);
- **F9a** the navmesh for long trips, steering for short ones;
- **F10a** a dev overlay plus the day-long bench;
- **F11b** clips by real speed and turning in place, **plus new Blender clips** (drink, sniff, groom, play, howl, alarm stamp) where the models lack them;
- **F12a** built straight through, tested at the end.

## What there is today (measured)

The mind is plan 126's `think()` (shared `animals/mind.ts`): a fixed list of rules checked in order (danger, fear, food held out, friend, prey, storm or night, pack lead, then an ordinary hour), re-thought about once a second. The server moves the animal straight at its spot or its target, turning aside when the way is blocked (`features/animals.ts move`).

A mind run alone on open land for a whole in-game day (no people, no weather; a probe, not a test):

| species | time on the move | farthest from home | how the day goes |
|---|---|---|---|
| deer, elk, boar, wolf, bear | ~12% | ~30 m (their range: 140 m) | wander 62%, graze 22%, rest 14% |
| hare, fox | 12% | ~17 m | the same |
| crow, duck | 5% | ~32 m | perch 33%, wander 32% |
| squirrel | 8% | ~14 m | wander 40%, sleep 33% |

Why:
1. **Short hops pulled back home.** `wanderSpot` aims somewhere round home, then goes only 35% of the way there while it's within 70% of its range. Every walk is a few metres and drifts back, so a deer lives in a 30 m circle of a 140 m range.
2. **"Wander" is mostly standing.** After arriving it keeps "wander" for about 20 s with nowhere to go. Its pace stays walk on the wire, so the client walks it on the spot.
3. **No day.** A twilight deer moves as much at noon as at dusk (12%, 11%, 13%). Nothing gives the hours a shape: nowhere it beds down, feeds, drinks, nor the trails between.
4. **A person nearby freezes them.** Within 1.6× its flee distance (45 m for a deer), every thought has a 70% chance of being "alert", standing still. Round the player, where the animals are actually seen, they stand and stare.
5. **Groups aren't groups.** A follower only follows its lead once it's 2.5× its spacing away. A herd is a scatter of animals doing their own thing; birds don't flock, a pack doesn't travel as one.
6. **Thin senses.** Distances only. No line of sight (trees, hills), no hearing by gait beyond fast/slow, no smell or wind, no alarm passed from one to another (a crow's call warning the deer).
7. **Little between animals.** Predators chase the nearest prey alone. No mother keeps her young close, no scavenger comes to a kill, no play, no calls, no rivalry.
8. **No memory.** A shot near a herd scares it for half a minute. The next day it's back on the same spot. Nothing gets used to a path walked every day (the town's pigeons aside, by their numbers).

## The proposal (before the forks)

A brain in layers, like the Strike Park bots (plan 117), on the server for everything that's the server's (plan 126, F4b):

1. **Movement that goes somewhere.** Destinations across the whole range, walked to and moved on from, with no walking on the spot. Smooth steering and arrival. Long trips on the land's navmesh (shared `nav`, the NPCs'), short ones steered. Trails form where they walk (plan 126's prints).
2. **A day of its own.** Each group gets places from the land: a bed in thick cover, feeding grounds (open, edges, browse), water, a den or a roost. Its species' hours shape the day: a deer beds by day, feeds at dusk and dawn, drinks, moves between them by the same trails. Weather bends it (a storm to cover, deep snow to the trodden trails).
3. **Choosing by need, not by order (utility).** Each choice (feed, drink, rest, move on, watch, flee, hunt, play, follow) is scored from needs, the hour, the place, the group and what's sensed. The best one is taken and held a while, so there's no twitching. A small set of species traits tunes the scores.
4. **Groups as groups.**
   - Herds move together round a lead, spaced, one or two keeping watch while the rest graze.
   - Packs travel single file, patrol their territory, and hunt together (one drives, the others cut it off).
   - Flocks lift, wheel and land as one; ducks paddle in a raft.
5. **Senses.**
   - Sight in a cone, cut by trees and the land.
   - Hearing by how you move: sprint, walk, crouch, a car, a shot, a door.
   - Smell carried by the wind: from upwind they know you're there before they see you.
   - Alarm calls passed on, across species.
6. **People, graded.**
   - Notice, then watch (briefly), then an alarm (a snort, a stamp), then move off at a walk, then bolt.
   - They get used to people where people always are: along paths, in town.
   - They remember danger: a shot or a kill on a spot is avoided for a day or more.
   - Curiosity: the young, foxes and crows come closer or follow.
7. **Between animals.**
   - Mothers keep their young close.
   - Scavengers (crows, foxes, a bear) come to a kill or a shot carcass.
   - Calls: wolves howl at night, owls call, birds sing at dawn.
   - Rivals, and the young playing.
8. **Seeing it work.**
   - A dev overlay: each animal's choice, its scores, its target, what it senses.
   - A bench: the probe above made a test, minds run for a day per species, with numbers that must hold (time on the move, range used, a day's shape), so it can be tuned and can't slip back.

## The forks

- **F1 Scope:** (a) movement, the day, groups (the core); (b) also senses and graded reactions to people; (c) everything, the animals' life with each other too. (c) recommended.
- **F2 How the mind chooses:** (a) the rule list, extended; (b) utility scoring with inertia, recommended; (c) behaviour trees or goal planning.
- **F3 How far they roam:** (a) a species' range scaled from the real one (a deer's daily round a few hundred metres), recommended; (b) the 140 m kept, but used fully; (c) per species, God mode editable.
- **F4 The day:** (a) places per group from the land (bed, feeding, water, den) and trails between, recommended; (b) the hours bias random wandering only.
- **F5 Groups:** (a) flocking round a lead (keep together, keep apart, go the same way), recommended; (b) following the lead, improved.
- **F6 Senses:** (a) sight cone with line of sight, hearing by gait, alarm calls passed on, recommended; (b) also smell on the wind; (c) distances only, as now.
- **F7 People:** (a) graded, plus getting used to people and remembering danger, recommended; (b) graded only.
- **F8 Between animals:** (a) hunts together, mothers and young, scavengers, calls, recommended; (b) also rivalry, play and seasons; (c) as now.
- **F9 Getting there:** (a) the navmesh for long trips, steering for short ones, recommended; (b) steering only, improved.
- **F10 Seeing it work:** (a) dev overlay plus the day-long bench with numbers to hold, recommended; (b) the bench only.
- **F11 Animation:** (a) clips by real speed (no walking on the spot), turning in place, better use of the clips there are, recommended; (b) also new Blender clips (drink, sniff, groom, play, howl); (c) as now.
- **F12 Building:** (a) straight through, tested at the end, recommended; (b) phase by phase with sign-offs.

## Phases (sketch, refined after the forks)

0. The bench first: today's numbers, written down. The two bugs fixed (hops pulled home, walking on the spot), measured again.
1. Movement: destinations, steering, arrival, the navmesh for long trips, trails.
2. The day: places per group from the land, the hours' shape, the weather's bend.
3. Utility mind: the choices, their scores, inertia, species traits. `think()` replaced, plan 126's danger and nerf kept as they are.
4. Groups: herds, packs, flocks, rafts.
5. Senses: sight cone, line of sight, hearing, wind (F6), alarms passed on.
6. People: graded reactions, getting used to them, memory of danger, curiosity.
7. Between animals: pack hunts, mothers and young, scavengers, calls (F8).
8. Animation (F11b): clips by real speed, turning in place, gait blends; new Blender clips (drink, sniff, groom, play, howl, alarm stamp) added to the models that lack them (tools/art/animals), the life look kept.
9. Dev overlay; the bench's numbers made checks. Server cost measured with the bigger cast of plan 126.
10. Checks: the bench, the animal server tests, the animal e2e, a still of a herd at dusk on the move.

## Built (2026-11-25)

**Shared** (`packages/shared/src/animals/`):
- **`traits.ts` (new): how each species lives.**
  - Its range, scaled from the real one (F3a): deer 450 m, elk 650, moose 500, boar 420, wolf 900, bear 700, lynx 600, fox 380, hare 130, squirrel 60, crow 320; the farm's 0, kept in their pens.
  - Where it beds and feeds.
  - Whether it drinks.
  - How its group keeps: a herd, a file, a flock or a raft.
  - Whether one keeps watch as lookout, whether it scavenges, how curious it is.
  - Its sight cone, its hearing, how far its alarm carries.
  - Its calls: when, how often, and whether as a chorus.
  - `noiseOf` gives a person's noise by gait; `callsNow` says whether it calls at this hour.
- **`places.ts` (new): a group's day places (F4a).** A bed in its cover, up to three feeding grounds, and the nearest bank to drink at. They're found by sampling the land in rings round home, seeded by the group's id, so the same group walks the same ways every day and its prints wear trails.
- **`mind.ts`, rewritten.**
  - **Urgent reactions come first and outweigh any choice of the day:**
    - a predator's danger, plan 126's rules and nerf kept;
    - a threat by degrees (F7a): unnoticed, then a watch of 3–7 s and a glance now and then, then off at a walk or trot if it comes on, then an alarm (snort or stamp) when there's a moment, then the bolt. People on a path, in town, or passing harmlessly day after day are let nearer;
    - a defender at bay;
    - food held out;
    - its friend;
    - its pack's hunt, with flanks;
    - its prey;
    - its mother (a young one follows her and flees with her);
    - a storm (to its bed);
    - a kill to scavenge (waiting its turn if something bigger is at it);
    - its group: a file behind the one ahead, a herd round its lead;
    - its call.
  - **Then the day, scored (F2b).** Bed down, go to bed, feed, go to feed, drink, go to water, roam a far corner of its range, a few steps on, sniff, groom, play (the young), idle.
    - The scores come from its needs (hunger, tiredness, and a new thirst), how awake it is at the hour (`awakeAt`: its species' hours, and those active at any hour ease off by day and lie up at noon), and its places.
    - A trip costs by its length, and being settled (bedded down, or feeding while still hungry) holds it there.
    - Each choice is held for a while (`HOLD`), a trip till it arrives, and feeding moves on a few steps every half minute.
    - A herd's lookout takes its turn.
    - Its short steps never drift past its range.
  - **New doings,** added at the end so the old indexes stand: travel, leave, alarm, drink, sniff, groom, play, call.
- **`sim.ts` and `bench.test.ts` (new, F10a).** A group's day run on its own, and the numbers it has to hold:
  - the big game moves 15–45% of its day, reaches over 60% of its range, is busiest at dusk and dawn, bedded by day, and goes between its bed and its feeding grounds;
  - wolves and bears ease off by day; night species sleep by day; birds and squirrels sleep at night;
  - a herd or pack keeps within 25 m of its lead.

  Also tested: alarms passed on, calls, the young, pack flanks, scavengers, memory of danger, the lookout.
- **Measured with the sim, before and after:**

  | | before | after |
  |---|---|---|
  | deer on the move | 12% of the day | about 20% |
  | busiest when | the same at every hour | 1% by day, 52% at dusk and dawn, 13% at night |
  | reach | 30 m | about 88% of its 450 m range |
  | its day | wander, graze, rest at random | bed to feeding grounds to water and back |

  Wolves move 45% (13% by day); owls and bats only by night.

**Server** (`features/animals.ts`):
- **Each group's day:** its places, made when its first member spawns. Where the land isn't made yet a place is taken as standable, and the way there finds out.
- **What it remembers:**
  - a shot heard within 70 m, or a member killed, keeps that spot away for 24 h (90 m round, six spots at most, kept past its cell);
  - people about with nothing coming of it make the group a little more used to them (up to 0.5).
- **Senses (F6a), in `sense()` and `sightLine()`:**
  - a sight cone by species, halved in the dark (a lit torch seen farther);
  - the land and the trees along the line block it;
  - hearing by gait;
  - awareness that builds while it sees or hears someone and fades after;
  - how fast someone is closing.
- **Alarms passed on.** An animal's alarm or bolt adds an alarm for six seconds, pointing at what it's from; prey within the alarm's range get it as a threat seen there. Carcasses (a guarded one if a predator is at it) are seen by scavengers.
- **Calls.** Species and hour decide when; a chorus joins the lead a moment after. They're sent as `animal:call` to people within hearing: a wolf's howl 1.5 km, an elk 900 m, an owl 500 m. Alarms are heard within 160 m.
- **Movement:**
  - arriving at its goal makes it choose again, and it stands while it does: no walking on the spot;
  - its pace on the wire is what it really does each tick, so stood still reads still;
  - a pack's hunt goes to the prey's sides, ahead of it;
  - a group keeps a body's length apart.
- **The navmesh (F9a)** is asked only when steering is stuck on a long trip (over 40 m, not straight): one way at a time, at most one every two seconds, and the goal is kept while the way is coming. At first every long trip that wasn't straight asked for one up front, and building those navmesh windows cost about 8.5 s of main-thread time in a 54 s run.
- **The dev overlay's feed:** `animal:debug` for admins who ask, twice a second, for animals within 120 m.

**Client** (`world/animals/`):
- Clips by real speed: measured from the played-back samples, so stood still with a walking pace shows idle. Standing and turning, it steps round.
- The new doings' clips, with fallbacks.
- Calls and alarms come from the server's `animal:call`, placed and quieter with distance. The client's own random call timers are gone.
- `debug.ts` (`?animals=debug`, admins): a label over each animal (what it's doing and why, its needs, how sure it is of you) and a line to where it's going. The client asks for the feed again every few seconds until it comes, and the room's handlers are hooked once the room is there.

**Blender** (`tools/art/animals/build_animals.py`, F11b):
- **Four-legged:** drink, sniff, groom, a play bow, howl, stamp (played once), on every four-legged model.
- **Birds:** a drink, and a call (head up).
- **Hare and frog:** a sniff and a hind-foot thump.
- All 31 rebuilt: 20.4 MB, up from about 17. Checked on deer and wolf in `design/screens/animals/poses-day.jpg`; the first play bow lifted the deer's hind legs and was fixed.

**Checks:**
- **Shared:** animal tests 27/27, including the bench; typecheck clean.
- **Server:** animals 8/8 twice, with two new tests:
  - a herd at dusk went 20 m in its first minute, kept together, and never walked on the spot;
  - a walker coming at a herd set off a heard alarm.

  Pets, arms, the dark, God mode and nests pass, 49/49. (Each test file can only open six sandbox rooms in time; the new tests use rooms already made.)
- **Client:** unit tests 485/486, the one failure being the known colours check on another session's lamp files; typecheck clean; budgets ok (the page 504.7 of 505).
- **In game:** `e2e/animals.spec.ts` now has a second test, at dusk with the overlay. Of the ground animals round Ana, 12 of 12 moved on within 45 s, and 7 labels showed. The still is in the scratch shots folder.
- **Server cost** (an offline room, 40 groups, 158 animals in one player's view): the event loop went from 6.8% to 13.2% busy. The animals' own tick is about 4% of the main thread; most of the rest is sending them to the client.

**What's left:**
- In one e2e run Ana was bitten down to 60 health at dusk with the dark turned off, by an animal not yet identified.
- The groom pose is subtle.
- Animals don't smell or use the wind (F6b, not chosen).
- No rivalry, play-fights or seasons (F8b, not chosen).
- The server's cost grows with the cast. The next step would be fewer state updates for distant animals.

### Double-checked (2026-11-25)

Two fresh reviews, one of the shared and server code and one of the client and the Blender build, given the code, not the conclusions. Every finding was checked against the code. Fixed:

- **Server and mind:**
  - **The sight cone failed once an animal had turned a lot.** Its yaw is never wrapped, and the cone test used `%` on a raw difference: past about 4π of net turning nobody was seen from any side, only heard. It now uses `angleDiff`.
  - **A bird in flight re-chose its trip every think** and zigzagged. A flight somewhere of its day is now held till it lands.
  - **`stuck` was never reset between trips,** so a later trip gave up at its first blocked step and never asked the navmesh. It's reset on every new goal, and only an animal whose own way is coming waits longer.
  - **Birds never called an alarm,** since a bird's bolt is "fly" and a duck's "swim". Those count now: crows 90 m, geese 70 m.
  - **A herd's members walked on the spot at a shared goal** while the lead lay on it and the separation pushed them back. Each member now takes its own spot round the place and arrives a body's length off it.
  - **A befriended animal lost its friend** once its awareness of them faded (behind it, still, crouched). Its friend is always known now; this was a plan 126 regression.
  - **Getting used to people took about 4 minutes instead of days,** and nothing undid it. It now takes about a quarter of an hour of calm company to reach half, and a shot or a kill resets it.
  - **A fleeing animal's alarm pointed 30 m past the threat.** The threat is now named, and the alarm points at it.
  - **The path queue** is cleared when the room closes.
- **Client and Blender:**
  - **The stamp left its hoof planted** and stretched the leg: the lifted leg's IK foot wasn't attached. Every foot follows its leg now, and all 31 models were rebuilt.
  - **Young birds "played"** by looping jump or run on the spot (no play clip). Play is for those that don't fly.
  - **Calls weren't heard as far as the server sent them.** The client cut a wolf off at 600 m of the server's 1500, a wolf at 300 m came out at volume 0.007, and the first call of each species was silent while its take loaded.
    - The ranges are now shared (`CALL_HEARD`, `ALARM_HEARD` in traits.ts).
    - Far calls fall off more gently.
    - The far callers' takes are loaded ahead.
  - **Walk and idle flickered 120–150 m out,** where animals are stepped only twice a second. Speed is now taken only from a fresh pair of samples, with hysteresis between walking and still.
  - **The dev overlay** made a GPU buffer and rewrote every label each frame. It now keeps one buffer (grown as needed, drawn to a range) and writes text only when it changes. It also stops asking after six unanswered tries, for a non-admin.
  - **Room messages after a reconnect.** `animal:did`, `animal:strike` and `dark:pockets` were hooked only in the constructor, so they stopped working after a reconnect (plan 126). All of the module's room messages are now hooked once per room, at the top of the frame.
  - **The e2e** now puts the dark back to normal after each test as well as the hour, and checks the overlay while the animals are still near.

**The bite on Ana** (from the first build) wasn't an animal. Her 60 health was carried over in her saved vitals from earlier; no `animal:strike` came in that run.

**Not changed:**
- The lookout's watch has no target to turn to.
- The in-game test counts an animal that left the area as moved, and doesn't check clip against speed.
- The server's alarm test moves faster than the snort's limit, so it covers the alarm on a bolt, not the snort before it.
- The sim's lookout timing differs from the server's.

**Re-checked:**
- Shared: animal tests 28/28 (with a new test for these fixes); typechecks clean.
- Server: animals 8/8 twice; pets, arms, the dark, God mode and nests 49/49.
- Client: unit tests 485/486 (the known colours check).
- The in-game e2e (2 tests): 9 overlay labels, and 19 of 19 ground animals moved on in 45 s.
- The stamp checked on deer, wolf, bear and cow (`design/screens/animals/poses-day.jpg`).

### Running (2026-11-25, the user: "the animals don't have animation to run")

Every model has its run clip (the packs' gallop; birds and the hare a quickened walk), so the clips weren't missing. A probe in the browser showed what was wrong:
- **A bolt lasted under a second.** A fox ran about 5 m at 13 m/s on its run clip, then on its next think stood beyond its flee distance (cut by Ana standing still and by being near a path) and went straight back to grazing. Fear was never raised by a bolt, and nothing held the bolt to its spot.
- **The trot played as a slow walk.** The trot clip is the walk made 1.55 times as fast, but its rate was set against the gallop's speed, so a trotting deer played it at about 0.45: a slow walk.
- **When a flee reached its spot**, the animal stood idle while still "fleeing" for seconds; flee wasn't counted as arriving.

Fixed:
- **Bolts.**
  - A bolt (flee, or a bird's flight or a duck's swim from a threat) now runs on to its spot unless what it's from comes nearer than half its flee distance. A bolt raises fear to 0.75, which fades after.
  - Fleeing again with nothing to see now needs a real fright (over 0.85: hurt, shot at), so a bolt's own fear doesn't send it off at random.
  - A flee counts as arrived at its spot.
- **The gait comes from how fast it really goes:** past a quick walk (1.7 × its walk) the trot, past halfway from trot to run the run. Each clip plays at its own natural speed (the trot's is 1.55 × the walk).
- **More trotting.** Foxes and wolves trot wherever they go (`trots` in traits). The others trot on a trip over 120 m (was 220), and walk off at a trot from anyone closing at more than 1 m/s (was 1.6).
- **Being near a path counts for less** (0.3, not 0.5; the town stays 0.5), and habit cuts the flee distance by half of itself (was 0.6), so animals near paths still bolt.

**Probe, in game:** Ana starts 30 m in front of a fox and walks at it. The fox walks off, bolts at about 13 m/s on its run clip for 7 s and about 80 m (trot into run and back), then goes on its way at a trot on the trot clip.

**Re-checked:**
- Shared animal tests 29/29, with a new one: a bolt is a run all the way, and the dog kind trots.
- Server animals and pets 18/18; typechecks clean.
- The in-game e2e passes 2/2.
