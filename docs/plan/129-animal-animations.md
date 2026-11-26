# Plan 129 — Every animal's animations, checked

Asked 2026-11-25, after plan 128's running fix:

> The bears still have weird animations and dont have for run
>
> MAN CREATE A PLAN JUST TO CHECK ALL ANIMATIONS OF ALL ANIMALS

Status: **planned 2026-11-25; forks decided 2026-11-25, one by one; built 2026-11-25 straight through (F8a), tested — not committed.** What was built is under "Built" at the end.

The forks:
- **F1a** every model, every clip;
- **F2a** the browser bench `/dev/animals`, a test that measures every clip, and still boards for review;
- **F3a** a proper CC0 animated source for each borrowed animal where one exists (restyled to the life look), else its own clips made in Blender;
- **F4a** real gaits per species: a real trot (diagonal legs together), each species' own run (a bear's lope, a deer's bound, a hare's hop), a bird's hop and waddle;
- **F5, both** (a follow-up): the game's speeds and playback rates set from each clip's measured stride, **plus the animals' bodies on Jolt on the server** (colliding with walls, cars, each other, as people do), **plus each foot placed on the real ground by IK on the client** (Jolt ray casts: slopes, steps, rocks) for animals near you;
- **F6a** full transitions: blends between gaits by speed, start and stop, turning in place, once-played clips ending cleanly, lying down and getting up;
- **F7a** I check every clip against real footage and the measured checks; you look over the before-and-after board at the end;
- **F8a** built straight through, tested at the end.

## What there is today

31 models, built by `tools/art/animals/build_animals.py` from **9 sources**. Most animals don't have their own animations: each borrows a source animal's skeleton and clips, morphed to its shape.

| source (its clips) | made from it |
|---|---|
| Quaternius deer | deer |
| Quaternius stag | buck, **elk**, **moose** |
| Quaternius wolf | wolf, **bear** |
| Quaternius cow | cow, **boar**, **pig**, **sheep** |
| Quaternius fox | fox, **lynx**, **squirrel**, **beaver**, **cat**, raccoon |
| Quaternius horse | horse, white horse |
| rabbit | hare, **frog** |
| a hawk's skeleton, clips made in code | crow, songbird, duck, goose, gull, owl, pigeon, chicken, chick |
| bat, fish | bat, fish |

So:
- A **bear moves as a wolf does**: hunched, a wolf's gallop as its run, a wolf's lie and death. It still has the **wolf's tail**, which sticks out in its death pose (`design/screens/animals/poses-bear.jpg`).
- A squirrel, a beaver and a cat move as a fox; a boar, a pig and a sheep as a cow; a frog as a rabbit.
- The **trot** is the walk sped up (×1.55), not a trot.
- Most birds' clips are code-made, and the chick has no jump.
- The clips made in plan 128 (drink, sniff, groom, play, howl, stamp) were checked on four species only.
- Nobody has checked the clips against the speeds they're played at in game. A clip's stride against the animal's walk, trot and run speed decides whether the feet slide.
- **What exists to check with:**
  - stills, a few frames per clip (`contact_sheet.py`);
  - `/dev` benches for guns and the get-in (none for animals);
  - plan 128's in-game probe of clip against speed, for one animal at a time.

## The proposal (before the forks)

1. **A bench to look at them all:** `/dev/animals` in the browser.
   - Every model, every clip, played at the speeds the game plays it, on a grid floor with a ruler.
   - A side view that follows it, and a turntable.
   - Slow motion, and frame stepping.
   - Pinned to its game speed or free, side by side with another species or a reference.
   - The live game's clip choice from plan 128 (walk, trot, run by real speed) driven by a slider, so the switches show.
2. **Measured, not only looked at,** as a test that runs every clip of every model, so nothing slips back:
   - **feet sliding:** a planted foot moving along the ground, at its game speed;
   - **feet through the ground, or floating;**
   - **loop seams:** the first frame against the last;
   - **parts left behind:** a bone at its rest pose through a whole clip that should move it (a clip that's really the rest pose);
   - **the stride:** distance a cycle covers, against the game's speed for its gait, giving each clip's right playback rate;
   - **what each model has and lacks:** its fallbacks, a once-played clip's end pose, a looped clip's loop.
3. **Every model gone through,** clip by clip, against real animals' gaits (footage of each). The worst first: the bear, the cat-likes made from the fox, the pigs and sheep made from the cow, the moose, the frog, the birds. Each gets a list: what's wrong, how bad, what fixes it.
4. **The fixes, by what each needs:**
   - **another source** where a CC0 pack has the animal itself, animated (a bear, a cat, a pig, a squirrel…), restyled to the life look like the others;
   - **its own clips made in Blender** where none has it: a bear's amble and lope, a real trot (diagonal legs together), a hare's hop, a frog's hop, a bird's hop and waddle;
   - **the morph tuned** where the borrowed clip is nearly right: posture, stride, tail;
   - **the game's speeds or playback rates set from the measured strides,** so no feet slide.
5. **A board** at the end: every model, every clip, before and after, for you to look over.

## The forks

- **F1 Scope:** (a) every model, every clip, recommended; (b) the wild ones only (not the farm); (c) the worst offenders only (the bear and the borrowed ones).
- **F2 How it's checked:** (a) the browser bench plus the measured checks plus stills for review, recommended; (b) stills only; (c) the bench only.
- **F3 The bear and the borrowed animals:** (a) a proper animated source for each where a CC0 one exists, else its own clips made in Blender, recommended; (b) its own clips in Blender for all of them; (c) the morphs tuned only.
- **F4 Gaits:** (a) the trot a real trot, each species' run its own (a bear's lope, a deer's bound, a hare's hop), recommended; (b) keep the clips, fix only the speeds so feet don't slide.
- **F5 Feet against the ground:** (a) the game's speeds and playback rates set from each clip's measured stride, recommended; (b) feet planted by IK at play time (more work, every frame's cost).
- **F6 Transitions:** (a) blends between gaits, start and stop, turning in place, a once-played clip's end, recommended; (b) the clips only.
- **F7 Who judges:** (a) I check each against real footage and you look over the board at the end, recommended; (b) your sign-off species by species.
- **F8 Building:** (a) straight through, tested at the end, recommended; (b) phase by phase with sign-offs.

## Phases (sketch, refined after the forks)

0. **What's there:** each model's clips and what they come from, sizes, and the plan 128 clips' coverage.
1. **The checks:** the measuring test over every clip of every model (sliding, ground, seams, rest-pose clips, strides) and its first report.
2. **The bench:** `/dev/animals`.
3. **The review:** each model against footage, with a list of what's wrong.
4. **New sources and new clips:** a CC0 search for the animals that lack their own; the clips made in Blender where none has them; the morphs tuned.
5. **Speeds and rates** set from the strides (F5).
6. **Bodies on Jolt** on the server (F5): each animal a body or character on the land's physics, as people and plan 101's bikes are, its size from its capsule (plan 126 `body.ts`). Walls, cars and each other collide; a cost budget per player, with those far off kept off Jolt.
7. **Feet on the ground** on the client (F5): foot IK on the four legs (and a bird's two), each foot's ground from a Jolt ray cast, for animals near the camera, the body pitched on a slope.
8. **Transitions** (F6).
9. **Checks:** the measuring test passing everywhere, the board, the animal e2e, and the server's and client's cost with Jolt bodies and IK feet.

## Built (2026-11-25)

**The measuring test** (`tools/art/animals/audit.py`, F2a):
- Blender loads each built model and skins every clip, frame by frame.
- **What it measures:**
  - the speed of the feet on the ground (the foot bones where the rig has them, else the lowest vertices), which is the clip's own speed;
  - the slide;
  - floating and sinking;
  - the loop seam;
  - clips that barely move.
- **Out:** `tools/art/animals/audit.json`, and each model's speeds in the manifest.
- **The first run, before any fix:**
  - deer: walk clip 0.75 m/s against the game's 1.4, run clip 3.4 against 15;
  - fox: walk 0.23 against 1.3, run 1.6 against 13;
  - bear, raccoon, beaver: walks that sank and had no stride;
  - every bird, the hare and the frog: no stride at all;
  - every run: a seam where its loop restarts.

  So most runs slid at up to five times their clip's speed, which is why "they don't run".

**The gaits, made** (`tools/art/animals/gaits.py`, F4a/F5):
- **How they're made:**
  - each foot follows a path of its own: planted and going back under the body at the ground's speed, then lifted and swung forward;
  - each gait has its own foot timing:
    - walk: one leg after another;
    - trot: real diagonals;
    - gallop: rotary;
    - lope: the bear's, raccoon's, beaver's and pig's;
    - bound: the squirrel's;
    - for two legs, a bird's walk and a small bird's hop, and a hare's or frog's hop;
  - the legs are solved to reach each foot (CCD about the side-to-side axis);
  - the spine, neck, head, tail and ears come from the source's own clip, retimed;
  - the body bobs, and the spine flexes in a gallop;
  - feet stay level.
- **Sized to the game.** The stride comes from the shortest leg's reach. The cycle comes from the game's speed for that gait (read from `species.ts`). Where a small animal's cycle would be quicker than six frames, its feet spend less of the cycle on the ground.
- **Exact speeds.** The made clips' speeds go into the manifest, and the game plays each at its speed ÷ that (`models.ts gaitOf`).
- **Every model but the bat and the fish** now walks, trots and runs on made gaits. The four-legged walks and trots measure what they were made for:
  - deer 1.42 and 3.36, wolf 1.60 and 3.84, bear 1.20 and 2.88, horse 1.70 and 4.04;
  - fox 0.90 and 2.16, raccoon 0.60 and 1.44, cat 0.70 and 1.68, pig 1.00 and 2.40, sheep 1.01 and 2.37.
- **Small animals' game walking speeds made real** (they were too quick for their size to step at all):
  - duck 0.4, goose 0.5, gull 0.4, pigeon 0.35, chicken 0.4, crow 0.45, songbird 0.3;
  - squirrel 0.5, raccoon 0.6, cat 0.7, beaver 0.4, fox 0.9, hare 0.6, frog 0.2.

**The borrowed animals (F3a):**
- **What the research found:** no CC0 animated bear, moose, lynx, beaver, squirrel, goose or gull anywhere. CC0 Quaternius models exist for the cat, pig, sheep, raccoon, chicken, chick and pigeon.
- **The seven were downloaded, with your approval, and none fitted.** The pig, sheep, raccoon and chick are blocky, Minecraft-like; the cat, chicken and pigeon are round cartoon toys with no leg bones. They're left out, kept only in the scratch folder.
- **Every borrowed animal has its own made gaits instead.**
- **The bear rebuilt in Blender:** legs 0.95 of the wolf's height (were 0.7), its feet back under it, a stub of a tail. It stands, ambles, trots and lopes on its own legs now (`design/screens/animals/gaits-bear2.jpg`).

**The game:**
- **Clip choice and rate** (`models.ts gaitOf`, shared with the bench): walk, trot or run by how fast the animal really goes, each clip at its manifest speed.
- **Transitions (F6):**
  - from one gait to another the new clip starts at the same point of the stride;
  - lying down and getting up blend over at least 0.7 s;
  - turning in place and once-played clips as in plan 128.
- **Feet on the ground (F5, client):** within 40 m, an animal on the ground (not lying, ridden or swimming) is pitched to the slope between its fore and hind ends. Each four-legged foot (its IK root) that's down is raised or lowered to the land under it, by up to 0.3 of its height.
- **Bodies on Jolt (F5, server):**
  - near people, each step is tested against the Jolt ground grid (`room.gridFor(0, 0).fits`), so walls, buildings, fences and rocks stop them;
  - people shove them aside;
  - the herds keep apart as before.

  They aren't Jolt bodies themselves: animals as kinematic boxes in the world would stop cars dead, so animal and car stay as plan 126 had them (they flee cars). With 153 animals round one player the server goes from 2.3% to 11.0% busy, about 2 points more than without the Jolt checks.

**The bench** (`/dev/animals`, `world/animals/bench.ts`, F2a):
- every model and clip on a treadmill marked in metres, so a sliding foot shows against the lines;
- the game's own gait choice at the speed set;
- slowed, paused, stepped a frame;
- side by side, or every model at once;
- each clip's own speed and the audit's flags shown.

**The board** (F7a), `design/screens/animals/`:
- `board-big.jpg`: deer, elk, moose, wolf, bear, boar, lynx, cow, horse — idle, walk, trot, run;
- `board-small.jpg`: fox, raccoon, squirrel, beaver, cat, hare, frog, pig, sheep;
- `board-birds.jpg`, `board-hop.jpg`;
- before: `poses-bear.jpg` (the wolf-bear), and the first audit above.

**Checks:**
- **Shared** animal tests 29/29, the bench's day numbers holding at the new walk speeds.
- **Server:** animals, pets, pets-lost and arms 38/38; typecheck clean.
- **Client:** typecheck clean; unit tests 485/486 (the known colours check on another session's lamp files).
- **In game:** the animal e2e passes 2/2.

**What's left:**
- The bear's hind legs still bend at the hock like a dog's, where a bear puts its heel down.
- The beaver's hind legs trail behind it (its proportions, as the bear's were).
- The hare's and frog's hops only show their lift when played (a still can't).
- The audit can't read a gallop (few contacts) or a small bird whose tail is as low as its feet; those clips' speeds are the made ones.
- The walks sink up to about 4% of the body at the deepest frame.
- The owl and chick barely walk (their legs are short under the body).

## Double-checked (2026-11-26)

Three independent reviews (client, Blender, server), plus a new end-to-end measure in the real client: `__animalBench.measure(model, speed)` on `/dev/animals`. It plays the game's clip at the game's rate (gaitOf), steps three's mixer 240 times a second without drawing, and reads the down feet's speed as the audit does. The bench's live readout now shows the same median.

**Found and fixed:**
- **Foot planting never ran.** three drops the dot from a bone's name as it loads it (`IKFrontLeg.L` → `IKFrontLegL`), so `AnimalBody.feet` was empty and `plant()` returned at once: no slope pitch, no feet on the land. The match now takes either spelling.
- **Runs slid 1.3–5×.** The gallop, lope and bound asked for a reach the leg can't make (2.2–2.5 × leg). At 24 keys a second a fast foot was down for under two keys, so it swept past the ground and never planted.
  - Gaits are now keyed at their own rate: at least 5 keys while a foot is down, up to 120 a second (`write_action(step)`, the meta's `fps`, read back by the audit).
  - Reach is now 1.6 for the gallop and 1.7 for the lope and bound.
  - A small body's quickest cycle shortens with the root of its leg's length.
  - A hop's body rises only while no foot is down.
  - The audit's 4 mm floor became a share of the foot's own lift.
- **Birds played their run clip, timed as a trot.** gaitOf picked "trot", which birds don't have, so the feet went about 3× too fast. A model with no trot now goes from its walk to its run halfway between the two speeds.
- **A tilt was kept after planting stopped** (lying down, swimming, far off). It turned into a roll as the animal turned. The rotation is now set whole each frame.
- **Swim strokes ignored the swim clip's own speed.** They're now rated by it.
- **The chick was shrunk twice** (its model is already chick-sized), down to 5 cm. `ownYoung()` stops that.
- **A body made before the manifest arrived kept no speeds.** A model is now ready only with its speeds.
- **The gait flickered at the walk/trot line.** gaitOf takes the gait it's in, with a tenth's give before changing down.
- **The trot ran past the rate clamp.** The run now starts at the earlier of halfway (trot→run) and twice the trot.
- **Planting moved the hoof away from the leg** (three solves no IK). The per-foot lift is now ±6% of the height drawn, and the scale is counted.
- **Server walls checks ran within 120 m of anyone** (about 4 Jolt queries a step, 10 steps for a stuck animal). Now:
  - they run within 25 m of a person, after the cheap slope check;
  - a step longer than the body is checked halfway too, so a small animal can't pass through a fence between ticks;
  - the unchecked half-step fallback is checked;
  - an animal already inside a solid (spawned in a rock or a parked car) is let out, not frozen.
- Bench cleanup: the floor, orbit and `window.__animalBench` are disposed.

**Measured in the client after the fixes** (down feet against the speed the clip was made for):

| | walk | trot | run |
|---|---|---|---|
| deer, elk, moose, wolf, lynx, fox, cat | 100–101% | 99–100% | 97–99% |
| bear, raccoon, beaver, pig | 100% | 98–100% | 96–100% |
| sheep, boar | 100–101% | 98–99% | 94% |
| horse | 100% | 99% | 91% |
| cow | 100% | 98% | 83% |
| birds (walk) | 87–100%; the owl walks exactly (the audit reads birds' feet short, so the client's word is kept) | — | rough |

The runs strip is `design/screens/animals/runs-after.jpg` (deer, wolf, bear, horse at a gallop or lope, six steps of a stride).

**Checks after the fixes:**
- **Shared:** animal tests pass.
- **Server:** animals 8/8, pets + arms 27/27, pets-lost + nests 9/9; typecheck clean.
- **Client:** typecheck clean; unit tests 485/486 (the known colours check on another session's lamp files).
- **In game:** the animal e2e passes 2/2 against the updated server.

**Still left:**
- The hare's run at 12 m/s doesn't plant: its foot is down for about 15 ms, which no keying catches.
- The chick's walk, and the duck's and chicken's runs, measure rough: too few down samples.
- The cow's gallop is at 83%.
- A small animal's wall check still uses a person-height box, so a cat can't pass under a bench (`fits` has no height).
- Plus the earlier leftovers above (bear hock, beaver hind legs, walk sink).

## The leftovers fixed (2026-11-26)

**What was really wrong:** the strides were longer than the legs could reach. At each end of a step, a straight leg can't touch the ground with its foot that far ahead or behind, so feet floated at landing and lift-off. The client's median measure hid this, because it reads the middle of the stance. The cow's front feet never touched down at all in its gallop: the spine's flex lifted the shoulders out of reach.

**The gaits (`tools/art/animals/gaits.py`):**
- **Each leg's window:** how far ahead and behind its foot can stand on the ground (`leg_reach`). Each foot's stance is centred in its own window, and the stride is no longer than every leg can plant.
- **A little crouch where the stride needs it:** walks up to 4% of the leg, trots 8%, gallops 12%, birds 4%. A frame where a planted foot still falls short lets the body sink a little more, smoothed across neighbouring frames. Where that would sink a body more than its gait's `give`, the stride is shortened instead (a duck takes short steps rather than going down on its belly).
- **The body and tail stay out of the ground:** a frame where the belly would go through is raised back, and a tail swung down (the source gallop's) is lifted at its root.
- **A new leg solver:** damped least squares in place of CCD. It is faster, keeps a knee bending its own way, and keeps a step only if it brings the foot closer. CCD flipped elbows and fell short of targets.
- **The fore leg starts at the shoulder blade**, which gives most of a fore stride.
- **Feet leave and land moving back at ground speed** (a Hermite swing). Before, the foot stopped dead against the body at lift-off and touch-down, and was dragged forward along the ground for a frame or two.
- **Quick feet are keyed by count:** at least 5 keys while a foot is down, at most 72 a cycle, with no fixed cap on keys a second. The hare's 12 m/s run is keyed at 641 a second over a 0.1 s cycle.
- **Each made clip reports in its meta** its crouch (`drop`) and the share of its time down that each foot is on its mark (`miss[2]`).

**Bear and beaver, heel down** (`plantigrade()`, species `plant={"heel": …}`):
- The hind foot comes forward under the hip, and the sole (the leg's last bone) lies flat behind it.
- The thigh and shin are solved to the heel, and the sole is aimed at the paw. Each gait's steps are centred under the hip.
- The heel lifts as the foot lifts, or where the leg can't reach it flat, within the leg's near and far reach.
- The beaver stands with its heel further back (`heel` 2.0), because its short thigh can't bring the heel in under the hip.

**The server:**
- `Place.fits`/`fitsAt` take a body's height (a person's by default).
- An animal is tested at its back's height × 1.2, so a cat passes under a bench seat, a frog under a low rail, and a deer doesn't.
- A small body's box starts at its own step (40% of its height), not a person's 12 cm, so the box never floats above it.
- Test: `packages/shared/src/physics/fits-height.test.ts`.

**The tools:**
- `contact_sheet.py --what strips`: each clip at six points of its cycle on the true ground, with a ground line. Poses are taken between whole frames too.
- The bench's `measure()` also reports `p90`, the worst tenth's slip, which the median hides.

**Measured in the client** (`__animalBench.measure`, 240 Hz; median of down feet against the speed, then p90 slip):

| | walk | trot | run |
|---|---|---|---|
| deer, elk, moose, wolf, lynx, fox, cat, raccoon, squirrel | 100%, ≤2% | 100%, 1–16% | 99–100%, 7–19% |
| bear, pig, sheep, boar, horse | 100%, 1–3% | 100%, 1–19% | 99–100%, 7–12% |
| cow | 100%, 2% | 100%, 28% | 100% (was 83%), 15% |
| beaver | 100%, 15% | 100%, 46%* | 100%, 9% |
| hare, frog | 98–100%, 20% | 98–99%, 15–17% | 95–98% (the hare was 72%), 18–22% |
| birds | 100–103%, 7–27% | — | 96–102%, 2–23% |

\* The beaver's hind feet lift only about 2 cm, so its "down" band holds samples taken mid-lift. In Blender each of its feet slides under 1 cm/s while down.

The audit now reads every four-legged walk, trot and run within 1% of its made speed, and the birds within 3%. The walks no longer sink (wolf 0.4%, bear 0.5% of their size).

Board: `design/screens/animals/strides-after.jpg` (bear, beaver, cow, horse, wolf, hare and duck, walk and run).

**Checks:**
- **Shared:** physics and animal tests 114/114, including fits-height.
- **Server:** animals 8/8; typecheck clean.
- **Client:** typecheck clean; unit tests 485/486 (the known HUD colours check).
- **In game:** the animal e2e passes 2/2.
- **Server `arms.test.ts`:** 7 of 17 fail. Each test's setup teleports two people to the pond at (−250, −60), and the teleport is refused: they stay at the arrival on floor 4. It fails the same with this round's `place.ts` and `animals.ts` changes taken out, so it isn't this work. It passed earlier on 11-26. The tests read the world from the dev API, which other sessions share.

**Still left:**
- The owl plants 80% of its walk and 64% of its run (its legs are short under the body). It rarely walks.
- The hare's run is a crouched hop, not a stretched-out gallop: the rabbit model sits with its legs folded.
- The bear's lope gathers into a ball for a frame. Its big spine flexes as a wolf's does.

**Legs while attacking (2026-11-26, reported by the user):**
- **The fault:** a bear or wolf coming at you kept its legs still. The server moves an attacker at up to its `chase` speed, but the client played its attack clip, which plays once and holds its last pose, so it slid along after you.
- **The fix:** `world/animals/clips.ts` holds `clipOf`, moved out of index.ts, and a new `onTheMove`:
  - any clip made standing still (the attack, eating, looking, stamping, sniffing, drinking, grooming, howling, playing), played while the animal really moves on the ground, becomes its gait, picked by its speed;
  - the attack plays when it strikes: `animal:strike` starts it from the beginning for 0.65 s, then the gait carries on;
  - it also plays when the animal stands in reach.
  - `AnimalBody.play(…, restart)` starts a strike's attack over.
- **Tests:** `clips.test.ts`. Live in the game, an animal held at "attack" while walking played its walk (40 of 40 samples), struck → attack, and was walking again 0.9 s later.

**Lying and sitting, the paw animals (2026-11-26, reported by the user):**
- **The fault:** the bear's back legs stuck up behind its rump when it lay down. The wolf, lynx, fox, raccoon, squirrel, beaver and cat had the same fault, and sitting too. Their lying and sitting poses were the wolf's fixed joint angles, which a reshaped body turns into nonsense.
- **The fix:** the poses are now built from targets (`paw_lie`, `paw_sit` in `build_animals.py`, used for the wolf's and fox's rigs; the hoofed animals keep theirs).
  - **Lying:** the body comes down until the belly is on the ground. The chest tips down about the hips, and the rump comes back down after each tip.
  - **Each leg is folded flat** (`_fold`): the hind hock on the ground beside the hip with the sole forward to the paw, and the fore elbow on the ground under the shoulder with the forearm forward.
  - **Sitting:** the body tips up about the hips, by less where the front legs wouldn't reach the ground, and the rump goes onto the ground. The hind legs fold flat under it and the front legs are solved upright to the ground.
- **Audit:** lying and sitting sink or float at most 1.4% of the body.
- **Board:** `design/screens/animals/lie-sit-after.jpg`.
- **The bear's rump, lying down (11-26):**
  - **The tail stub:** the tail had been squeezed into a 4 cm stub, but 713 vertices of the rump still hung on its eight bones, and they crumpled as the hips folded. The tail's skin now belongs to `Back` (`merge_weights={r"Tail\d": "Back"}`, `merge_weights()` in the build), so the stub moves with the rump.
  - **The fold:** a bear's thigh is too bulky to fold beside its belly without its skin pinching into spikes. It now lies with its hind legs stretched out behind it along the ground (`lie.hind = "stretch"`), as bears do.
  - **Sitting:** its hock sits further back under it (`sit_pose.hock` 0.3).
  - `contact_sheet.py` has a `--view rear` for the rump.
