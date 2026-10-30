# 58 — The animation

Every way a person moves, made again: standing, walking, running, jumping, Flowmotion, sitting, the
phone, the dark, the shadowed. Inspired by Kingdom Hearts 3 and Alan Wake 2. Planned 2026-10-30.

## Where we are

- **How it's made.** Every animation is keyed in code:
  - `chars/moves.ts`: the run, crouch, strafe, landing, aiming, the verbs, Flowmotion and the dark's
    poses. Key poses on channels, eased by Hermite splines, the feet planted by solving the leg.
  - `chars/motion.ts`: standing, the walk, sitting, the phone, busy, social acts, emotes, the jump.
  - `chars/locomotion.ts`: picks and blends the gaits and lays the verbs over them.
  - The parts are good: key poses, quaternion blends, a leg solve, an arm solve (`ik.ts`).
- **What's weak:**
  - The walk is one sine wave per joint, with no heel strike, push-off or weight.
  - Standing is still but for a breath and a glance.
  - Nothing starts, stops or turns: a gait just fades into the next.
  - The feet don't follow the ground: on a slope or a stair they float or sink.
  - The head only glances at random; it doesn't look at anyone.
  - Nothing follows through: hair, jackets and scarves are rigid.
- **The body.** 16 joints: hips, spine, neck, head, and shoulder, elbow, wrist, thigh, knee and
  ankle each side.
  - There's no chest, so the torso bends in one piece.
  - There are no toes, so a foot can't push off or roll through a landing.
  - There are no hand joints, so a hand can't grip, point or make a fist.
  - Each outfit piece rides one joint (`kit.ts` `Part`; a skirt's front can follow a second).
    They're merged into one skinned mesh by `bake.ts`.
- **Size.** The 3D people's chunk (`yutopia-chars`) is 40.4 KB of its 45.
- **How many.** About 80 animations, counted in F.

## The idea

1. **Kingdom Hearts 3 where you play; Alan Wake 2 where you live and where it's dark.**
   - KH3: running, jumping, Flowmotion, emotes, games, high fives. Snappy timing, big readable
     arcs, anticipation before a move and overshoot after it, hang time at the top of a jump.
     Hair and clothes trail.
   - Alan Wake 2: standing, walking, the torch and the gun, being hurt, fear. Grounded weight,
     the small constant motion of a real body, heavy feet, tense shoulders, breath, checking
     over your shoulder.
   - **The mood moves it.** A `tension` dial (0..1) from the hour, the dark, the shadowed near,
     your vitals. At night and in the dark everything leans toward Alan Wake 2: the walk slows
     and lowers, the idle looks around, and the run stays tight.
2. **Keyed in code, with real craft** (decided). Not mocap: our bodies are stylized, and
   retargeted capture looks wrong on them. Each animation is keyed again:
   - its key poses (contact, down, passing, up), timing and spacing;
   - anticipation, follow-through and overlap;
   - then the procedural layers on top: feet on the ground, hands on what they hold, the head
     on what it looks at, springs for what hangs.
3. **A bigger body** (decided). A chest, toes, hands with fingers and a thumb, and spring bones
   for hair, hems and scarves.
4. **One system, every body.** Players, the folk and others' bodies all run on it; so do the
   shadowed (`shadePose`). Pets are their own (plans 51–52) and stay as they are.
5. **Animation follows the body; it never moves it.** The movement core, Jolt and the server are
   untouched: the same steps and the same positions. The animation reads the body and draws it.

## The mechanics

### A. The style bible (written and shown before any keying)

| | Kingdom Hearts 3 | Alan Wake 2 |
|---|---|---|
| Timing | fast in, a hold at the key, fast out | even and continuous, small overlaps |
| Weight | light, springy, up on the toes | heavy, down in the heels, knees soft |
| Arcs | big, readable from far | small, true to a real body |
| Silhouette | clear in every key pose | natural, sometimes closed in (cold, fear) |
| Head | leads the move, looks where it goes | checks around, looks at sounds and people |
| Secondary | hair and clothes trail, then settle | breath, small shifts, hands never fully still |
| Landings | a squash and a pop back up | a real absorb, by height; a heavy one hurts |

- **The tension dial** (C.6) blends between the two where a move has both: the idle, the walk,
  crouching and the torch.
- **Our own work, not theirs.** We take the principles (timing, weight, arcs) and key our own
  poses. No frames, curves or assets are copied.
- **Phase 0 shows it.** Before keying, the bible is a page of reference notes and our own
  thumbnails (stick poses) for the key moments of each family. Sign-off first.

### B. The body (`chars/rig.ts`, the outfit builders, `bake.ts`)

- **New joints:**
  - `chest`, between spine and neck. The torso twists and bends in two places, and breath
    lifts the chest.
  - `toeL`/`toeR`. The shoe's front rides it: push-off, tiptoe, and a landing that rolls
    through.
  - `fingersL`/`fingersR`, the four fingers as one hinge, and `thumbL`/`thumbR`. Hand shapes
    come from them: open, relaxed, fist, grip, point, thumbs up, the phone's thumb.
  - **Springs:** up to four a person, by what they wear. Hair at the back and sides, a long
    top's hem front and back, a scarf, a skirt. Each is a damped spring off its parent,
    stepped in the frame.
- **The builders** (`build/*.ts`) put their parts on the new joints:
  - the chest takes the upper body;
  - the shoe's front goes on the toe;
  - the hands become a palm, a mitt of fingers and a thumb;
  - hair and hems are split onto springs where they hang.
- **Every look still builds.** `chars.test.ts` builds all of them with the new skeleton.
  `/dev/chars` sheets, before and after, show nothing broke at rest.
- **Cost.** The joints go from 16 to about 26, plus up to 4 springs. Measured on the weak
  machine before going on (E).

### C. The animation system (`chars/anim/`, new)

The layers, in order:

1. **The base.** A cycle or clip by state: idle, walk, run, crouch, a verb, a Flowmotion
   move, sit, busy and so on. It's picked by a small state machine with set blend times per
   pair. The cycles are **distance-matched**: their phase follows the ground covered, and
   their stride stretches with speed. So the feet don't slide at any speed.
2. **Transitions**, short keyed clips between states:
   - **Starts:** a lean-in and a push-off, faster from a sprint key.
   - **Stops:** a plant, a settle and a weight shift; from a sprint, a skid and a catch.
   - **Pivots:** a turn of 135° or more on the move plants a foot and turns over it.
   - **Turns in place:** step-turns of 90° and 180°.
   - **Getting up:** from a landing, from down, from a seat.
3. **Additive layers** on top of the base:
   - breath (chest and shoulders, faster when winded);
   - lean and bank (into turns, into speed);
   - tension (C.6);
   - flinches;
   - the hands' shapes.
4. **IK:**
   - **Feet on the ground.** The land's height and Jolt's rays under each foot. The hips drop
     to the lower foot, and the foot tilts to the slope. Stairs, kerbs, hills and the snow's
     edge.
   - **Hands on what they touch:** a ledge (the hang), a rail or pole (Flowmotion), the other
     person's hand (a high five, a hand-over), the torch, the gun, the phone, a cup, a door's
     handle.
   - **Look-at:** the eyes, then the head, neck and chest, each taking a share and each
     limited. Targets come from D.
5. **Springs.** The secondary bones swing from the body's motion and settle.
6. **The mood.** `tension` 0..1 from:
   - the hour (night),
   - the dark (plan 30: in its fog),
   - a shadowed near,
   - a hit taken,
   - low vitals.

   It blends the idle, walk, crouch and torch between their KH and AW keys, and slows the walk
   and lowers the chest.

### C2. Jolt in it (the world's physics: plan 50)

The animation reads Jolt's world, the same one the body walks on:

- **The feet:**
  - A short ray down from each foot finds the ground under it: the land, a kerb, a stair, a
    rail, the top of a car.
  - A sphere cast keeps the toes out of a step's riser.
  - On the land's heightfield and on every solid, not the grid's guess.
- **The hands:**
  - Rays and contacts find what a hand goes to: the ledge's edge for a hang, the pole's side for
    a swing, the wall's face for a wall run's hand.
  - A wall you walk along close: the near hand brushes it.
- **Falls, hits and deaths: a ragdoll.**
  - Jolt's `Ragdoll` on the same skeleton: a capsule a bone, with joint limits.
  - Blended in when keyed motion can't sell it: a high fall, a car's hit, the pool ball's
    knock-down, a shadowed's death, being downed.
  - Then blended back to a keyed get-up from wherever it lands.
  - Near people only, one or two at a time, made and freed as needed (guardrail: one owner of
    every Jolt object).
- **The springs:** each spring bone sphere-tests the body's own capsules, so hair and hems don't
  go through the shoulders or the legs. Not the world: too costly for what it shows.
- **The camera's people:** the look-at's line of sight (D) asks Jolt's sight ray, so you don't
  look at someone through a wall.
- **Cost:** the rays are batched, a few a person a frame, near people only (E).

### D. Looking at things (new)

- **What the head looks at,** best first:
  - whoever's talking to me;
  - whoever I'm focused or locked on;
  - a sound near (a door, a car, a scream in the dark);
  - someone walking by;
  - what my hands are doing;
  - nothing: ahead, with the idle's own glances.
- Others' bodies look the same way, from what this browser knows: their focus, who's talking,
  their pitch when aiming. Nothing new on the wire.

### E. Cost and detail by distance

- **Near** (≤ 12 m, or me): every layer.
- **Mid** (≤ 30 m): feet IK only; springs at half rate; no hand shapes.
- **Far:** the base at 15 Hz, as people are drawn far now.
- **On the Lowest tier,** mid starts at 6 m.
- **Every frame is measured** (`perf` stages: `anim`). The weak machine holds its 15 fps with
  20 people near.
- **Jolt's share:** foot rays near only; at most two ragdolls at once; neither on the Lowest
  tier past 6 m.
- **Budget.** The keys and the system go in their own lazy chunk (`yutopia-anim`), loaded with
  the 3D people. The page doesn't grow, and `yutopia-chars` stays under its 45.

### G. Not a robot: the feel (planned 2026-10-30 after the first round)

You still feel her as a robot, standing and moving. The new keys aren't the cause; how she's
driven is.

**What makes it robotic, measured in `/dev/move`:**

1. **The body is instant.** It reaches a run in 82 ms (5 frames) and stops from one in 50 ms
   (3 frames). It turns at 24 rad/s, so round in 0.13 s. The legs go from still to a full
   stride in a blink, and the whole model turns like a turret. Nothing shows the effort: no
   lean-in, no push-off, no skid, no pivot.
2. **Changes are cross-fades.** From standing to running, walk to run, running to standing:
   the weights blend over about 0.1 s. A real body moves through a transition (a first step,
   a plant) instead.
3. **Every cycle is the same.** Each step of the walk and run, and each breath, repeats
   exactly, with nothing varying. Perfect repetition reads as a machine.
4. **The trunk has no inertia.** The hips ride the body's position exactly. Starting,
   stopping or turning doesn't swing the chest or head; the leans that exist are small and
   clamped.
5. **Nothing leads.** The head turns with the body, never ahead of it. People look where
   they're going before they go, and look at things.
6. **The face is still.** The eyes only blink.
7. **The timing is too even.** Hermite curves through every key give the same smoothness
   everywhere. Real motion snaps into a key, holds, and eases out unevenly.
8. **The feet slide.** Nothing locks a foot while it's on the ground (phase 4's IK, by Jolt).

**What we do about it, as layers on the animation system (C):**

- **A. A little real momentum** (decided). The move core gets a KH-tuned ramp, tunable in
  `/dev/move`, so the animation and the motion agree and the feet don't slide:
  - about 0.2 s to reach a run;
  - about 0.25 s to stop, with a skid from a sprint;
  - turns on the run in a tight arc (about 10–12 rad/s), and in place as fast as now;
  - in the dark (tension) heavier: slower starts, longer stops, wider turns.

  It's a new KH spec field like the others: `MOVE` and the bench are unchanged, and the
  server takes moves as sent.
- **B. Transitions, keyed**, chosen from what the core reports (speed, its change, the turn):
  - **Start:** a lean-in and two driving steps.
  - **Stop:** a plant, the weight going over and back, and settling into the idle. From a
    sprint, a skid.
  - **Pivot:** past 135° on the move, a foot planted and the body turned over it.
  - **Turn in place:** a step-turn for 90°, two for 180°.
  - **Walk ⇄ run:** on matching phases, so the feet never jump.
  - **Landing into a run:** the first stride out of the squash.
- **C. The trunk's inertia.** A spring-and-mass model of the chest and head, driven by the
  root's acceleration and turn rate:
  - speeding up, the chest trails back, then drives forward;
  - stopping, it pitches forward, overshoots and settles;
  - turning, it leans in and the arms and head swing out;
  - the head stays level against the bob, as eyes do.

  It replaces today's clamped leans.
- **D. The head and eyes lead** (decided: eyes that look):
  - **Faces:** the eyes get two morph targets on their dots (left–right, up–down), as blink
    and talk are now.
  - **A gaze system:** the eyes go to a target first, then the head (about 80 ms), the neck,
    the chest, and on a turn the hips.
  - **Targets:** where you're going (into a curve), whoever's talking, your focus or lock-on,
    sounds, people passing. Between them, small darts, and blinks with big head turns.
  - **In the dark,** more darting, more checking behind.
- **E. Variation.** No two cycles alike:
  - each stride varies its length, its arm swing and its bounce by a few percent, from a
    slow noise;
  - each person has their own asymmetry (one arm swinging more, a head carried a little to
    one side), from their seed and persona (decision 5);
  - every channel gets a little slow noise;
  - a library of idle variants (a look round, a stretch, adjusting clothes, a real
    foot-shuffle step, checking the phone) scheduled at random, never on a beat.
- **F. Timing per key.** Keys get their own ease in and out, holds and snaps (tension and bias
  on the splines), so a stride can strike and hold, and a jump can snap up and float.
- **G. Feet locked.** In stance a foot stays where it landed (IK against Jolt's ground,
  section C2), brought forward from phase 4 into this one.

**Done looks like:**
- In `/dev/move`, starting, stopping, reversing, circling and standing for a minute show no
  turret turns and no snapping, and no two strides or breaths alike.
- A foot that's planted doesn't slide (the meter in `/dev/anim`).
- You play it and stop feeling a robot.

### F. Every animation, and what it becomes

| Family | Animations | Style | Phase |
|---|---|---|---|
| Standing | stand, idle life, idle variants (stretch, look round, check the phone, rub hands, stamp in the cold), turn in place | AW (KH by day) | 2 |
| Walking | walk, starts, stops, pivots, slopes and stairs, sneak, strafe, back up, winded, hurt | AW ⇄ KH by mood | 3 |
| Running | jog, run, sprint, starts, stops, skid, pivot, bank | KH | 3 |
| In the air | hop, flip, double jump, air dash, fall, high fall, landings by height, vault, mantle, roll, slide | KH | 4 |
| Flowmotion | wall run up and along, swing, grind, hang, climb, kick, the spin | KH | 4 |
| Sitting | sit down, seated, typing (fingers), get up, in a car | AW | 5 |
| Hands | hold, sip, the phone (text, call, video, photo, selfie, its poses), busy (coffee, throw, arcade, piano, gamepad, pool, pong, computer, whiteboard) | AW, KH for games | 5 |
| Together | wave, high five, fist bump, cheers, give and take | KH | 5 |
| Emotes | wave, clap, laugh, heart, question, fire, coffee, tape | KH | 5 |
| The dark | torch held and aimed, gun stance, recoil, reload, hit from each side, down, crawl, kneel by someone, fear | AW | 6 |
| The shadowed | lurch, wind-up, strike, recoil, exposed, dissolve and die, lurk | AW, their own | 7 |
| Reactions and life | look at people and sounds, flinch, shiver, catch breath, idle by persona | AW | 8 |
| Gaits by who | the folk's by persona (old, kid, tired…), yours chosen (calm, bouncy, heavy) | both | 3, 8 |
| The cold | breath puffs, hunching, rubbing hands, stamping | AW | 8 |
| Ragdoll | high falls, a car's hit, knocked down, the shadowed's death, downed; the get-ups | AW | 4, 6, 7 |

## Phases

Each phase ends with your sign-off on its videos and stills in `/dev/anim`. Nothing reaches the
world before you've passed it.

0. **The bible and a vertical slice.**
   - The style bible (A), as a page.
   - Four hero animations keyed again **on today's body**: the idle, the walk, the run, the
     jump. Shown before and after, side by side, as videos and stills: from the side, from
     behind, and from the chase camera.
   - It shows the direction cheaply before the body grows.
   **Built 2026-10-30, waiting on your sign-off** (the world unchanged):
   - **Where:** `chars/moves.ts` `idle2Pose`, `walk2Pose`, `run2Pose`, `jump2Pose`, behind
     `Motion3.v2` / `Locomotion.v2` and their `tension`. The world keeps the old ones.
   - **Standing:** the weight on one leg, moved over every few seconds with a dip; breath in
     the chest; a slow wander that never stops; glances through the eyes, head, neck and chest.
     In the dark: knees soft, looking round more, now and then over the shoulder. Pure: a seed
     gives each person their own rhythm.
   - **The walk:** keyed again, with a heel strike, a roll through, a push off the toes, the
     knee's give, the pelvis turning and dropping, the arms a beat behind. Distance-matched.
     In the dark: shorter, lower, leaning in, arms close, the head checking round.
   - **The run and sprint:** up on the toes, high knees, heels to the seat, arms pumping at a
     right angle a beat behind, a proud lean into speed, a springier bounce.
   - **The jumps:** a deeper wind-up, a full stretch, hang time (the hop's knees up and arms
     flung out, the flip balled tight), the legs reaching down, a squash by impact.
   - **Found on the way: the waist.** The trunk is two rigid pieces, so a spine bent forward
     or twisted opens them and skin shows through a fitted top. The old run shows it on the
     back.
     - Phase 0 takes the lean at the hips (`leanAtHips`: the spine bends at most 0.05, the
       thighs turned back by the rest), and the counter-roll is moved into the neck.
     - A blend of the waist's skinning by height was tried and made it worse; it's reverted.
     - Phase 2's chest joint and real skin weights fix it for good.
   - **To see:**
     - `/dev/move`: the "new animations (plan 58)" box and the mood slider.
     - `/dev/chars?anim=hero`, `idles`, `jumps2`, and the filmstrips (`walk2`, `walk2dark`,
       `run2`, `sprint2`, `hop2`, `flip2` beside `walkold`, `run`, `sprint`, `hopold`,
       `flipold`).
     - `design/anim/bible.html`: the style guide, the videos and the stills.
     - `e2e/anim-reel.mts` records the sandbox reel, old and new.
   - **Budget:** `yutopia-chars` 43.4 of 45 for now (phase 2 moves it to `yutopia-anim`); the
     page 419.4.
   - **Your first round of notes (2026-10-30), done:**
     - **The idle stood diagonal.** The hips are the root, so their roll and turn tilted the whole
       body, legs and all. The roll is now taken back out of the legs (`upright`), and the slow
       turn moved from the hips to the chest. The walk and run use `upright` too.
     - **Stiff, like a robot.** Follow-through on everything new: each upper-body joint (spine,
       neck, head, shoulders, elbows, wrists) follows its keyed pose by a damped spring, so it
       comes a touch late, goes a touch past and settles. The legs and hips stay exact.
     - **The run shook.** Its bounce at a sprint's cadence is about half the first pass's, and its
       sideways roll halved.
     - **The slide was horrible.** It's a baseball slide now: the plant, the drop with the lead
       leg kicked out, reclined from the hips, that leg along the ground toes up, the other
       folded under, the trailing hand on the ground, the other arm up, then a push back up
       into the run.
     - **Running's jump is a leap; the flip is the jump in the air.**
       - A new jump kind, `leap` (shared `jump.ts`), for the KH body's sprinting jump
         (`MoveSpec.leap`). It has the flip's height, so nothing about how far or high you jump
         changed.
       - Old `MOVE` keeps its flip, and the bench's hashes are the same.
       - Sounds, dust and others' bodies take it like a flip.
     - **To see:** the sandbox's block at the top of its panel (N: new / old, M: the mood), and
       `/dev/chars?anim=slides`, `jumps2` (with the leap), `slide2`, `leap2`.
1. **The feel: not a robot** (G; decided to come first, on today's body):
   - **1a:** momentum in the core (G.A); the transitions (G.B); the trunk's inertia (G.C).
     This is the most of what you feel.
     **Built 2026-10-30, waiting on your sign-off** (in `/dev/move` with plan 58 on; the world
     keeps `KH_MOVE`):
     - **The body with weight** (`KH_FEEL`, shared `move/spec.ts`), with three new fields:
       - `gripStop`, a stop's own grip;
       - `turnRun`, the facing's turn at a run;
       - `faceWay`, which faces the way the body goes on the move.

       Measured: a run in 183 ms (was 82), a stop from a sprint in about 0.5 s on the
       sandbox's path, arcs on the run, a reversal that faces on while it slows and turns
       round once it's slow. In the dark the sandbox makes it heavier (grip, stop and turn by
       the mood). `MOVE`, `KH_MOVE` and the bench are unchanged; a core test pins the new feel.
     - **Walk and run on one phase**, so the feet don't jump as the speed passes between them.
     - **The trunk's inertia:** a pitch spring (driving forward up to speed, braced back
       stopping, overshooting and settling) and a roll spring (leaning into a turn). Both are
       taken at the hips with the legs compensated, and the head is held level against them.
     - **The skid:** braking from speed it holds until she's nearly stopped, full from a
       sprint (0.84 measured) and a little from a run. It has its own pose: the lead foot
       braced on its heel, leaning back, arms out ahead.
     - **The stop's settle:** a small give in the knees as she comes to a stop from a run.
     - **Turning on the spot:** the feet step round, two steps a half turn.
     - **Seen in:** `design/anim/feel-new.mp4` beside `feel-old.mp4`;
       `e2e/anim-feel.mts` records them.
     - **Budget:** `yutopia-chars` is at 43.9 of 45, so the animations move to their own chunk
       before 1b.
     **Signed off; then a revision pass, detail by detail (2026-10-30):**
     - **Their own chunk:** plan 58's keys moved to `chars/anim/hero.ts` (`yutopia-anim`,
       3.6 KB). `Locomotion` and `Motion3` load it the first time a body asks for the new
       animations, and show the old ones till it's in. `yutopia-chars` is down to 35.4.
     - **A scripted feel loop** on `/dev/chars` (`feel`, and frozen moments: `feelstrip`,
       `feelstop`, `feelpivot`). It drives one body with `KH_FEEL`'s momentum through standing,
       a start, a run, a sprint, a hard stop, a settle, a pivot, a run back, an arc and a run's
       stop. Every transition plays the same each time, so it can be judged frame by frame.
     - **A bug found: she leant out of every turn and the old animations did too.** The floor's
       y is south, so a turn's rate is + to the right, and the lean read it the other way.
       Measured by where the head is against the hips in an arc. Now she leans into turns in
       both the old and the new; a unit test (`chars/feel.test.ts`) holds it.
     - **Start:** short quick driving steps while she speeds up (the stride up to 35 % shorter,
       the run's effort higher), on top of the trunk's drive forward.
     - **Turns:** the chest, neck and head lead into a turn ahead of the hips, and the outer arm
       swings out.
     - **Arms:** they swing with the trunk's inertia, forward braking and back driving.
     - **Turning on the spot:** steps of its own (`turnStepPose`: knees lifted, the feet set
       down turned, the thigh hardly swinging, low and leant into the turn). They come in at
       once (they used to reach 0.21 on a quick pivot) and are the body's 85 %.
     - **The skid:** braced as hard as she brakes (lower, further back, arms wider), the
       trailing foot chattering over the ground, the arms catching the balance (`skid2Pose`).
     - **The stop:** the stride finishes on both feet as she slows; no foot is left up once
       she's stood (it lingered about 0.2 s).
     - **Seen in:** `design/anim/feel-loop.mp4`, `feel-loop-turned.mp4`, and the sandbox's
       `feel-new.mp4` beside `feel-old.mp4`.
   - **1b:** the eyes and the gaze leading (G.D).
   - **1c:** variation and timing per key (G.E, G.F).
   - **1d:** feet locked by Jolt's rays (G.G).
   **1b, 1c and 1d built 2026-10-30; phase 1 signed off the same day** (in `/dev/move` with plan
   58 on; the world not yet switched):
   - **1b, the eyes and the gaze:**
     - Faces have two more morphs on the eye dots (`lookX`, `lookY` in `bake.ts`); each eye
       slides round the face's curve, so neither sinks under the skin. `PersonModel.setEyes`.
     - `Gaze` (`anim/hero.ts`):
       - the eyes go first, almost at once; the head follows on a spring, with the neck and
         chest sharing the turn, and the eyes cover what the head hasn't yet;
       - darts between looks, more in the dark;
       - its own blinks, every few seconds and now and then twice, plus one with a big look;
       - target, best first: a lock-on, else into a turn on the move, else the idle's glance.
     - `Motion3` passes the eyes and blinks to the 3D people (ready for the world's switch),
       and skips its own random blink then.
     - Measured: 7 darts in 30 s standing, the head turned by the gaze up to 0.19 rad.
   - **1c, variation and timing:**
     - **Keys can hold** (`Key.ease`): the hop's top, the leap's and the flip's tuck float; the
       slide holds.
     - **Each person's quirks**, from `Locomotion.seed`: one arm swinging more, a head carried
       a little to one side, a stride a little long or short.
     - **Each stride its own:** length, effort and arm swing wander a few percent. Measured
       running: 288 ms a cycle, varying by about 20 ms between strides.
     - **Never still:** a slow wander through the head and the chest.
     - **Idle variants,** seeded, never on a beat: by day a stretch, a neck roll, a foot
       shuffle, a look round, the shirt tugged straight; in the dark a look round, hands rubbed
       for the cold, a shuffle.
   - **1d, the feet on the ground** (`footPlant`):
     - Jolt's ground under each foot: the hips let down to the lower, each leg solved as two
       bones so its foot meets its own ground, the foot tipped to the slope.
     - Measured: across a stair edge each sole sits on its own step (0.12 and 0.24; the old
       had both at 0.19, one floating, one sunk); on the 20° ramp within 1 mm of the slope
       (the old 1.8 cm above it).
     - Unit test: a step up bends that knee for exactly 10 cm, and a step down drops the hips
       10 cm with the other leg taking it up.
   - **To see:** `/dev/move` (stand still a while: the eyes, the blinks, the variants; lock on
     with F: she looks at them, eyes first; walk the stairs and the ramps), `/dev/chars?anim=eyes`,
     and the feel loop.
   - **Budget:** `yutopia-anim` 5.3 KB; the page 419.5.
   - Each part signed off in `/dev/move`, against the old and today's new.

   **Before phase 2 (2026-10-30, the user's calls):**
   - **Out of a slide you stand:** the crouch press that slid isn't a crouch any more
     (`MoveControls.stand()` on the slide's start; a held crouch is up till it's let go).
   - **The jog (the run without Shift) slower, and keyed again:**
     - `KH_MOVE.jog` 5.8 → 5.0 m/s (the world's too).
     - The shiver measured: the old jog turned over at 3.4 strides (seven steps) a second, and
       its planted foot floated 7 cm and slid 9 cm a step (keyed legs under a calmed lift).
     - Now keyed by the feet: a foot on the ground stays where it landed, and the legs are
       solved to reach it; the hips keyed over the ground (a centimetre's give, a little rise
       in the air). Half of each step on the ground, half in the air, the heel flicked up, the
       knee lifting through, the foot pawing back to land under the knee; the arms easier.
     - Its stride 2.0 m: 2.5 strides a second at 5 m/s. It eases into the sprint's keys by half
       effort; the sprint is as it was. The run's strides don't vary any more (it slid the
       feet); the walk's still do.
     - Unit test: no slip and on the ground through the stance. `design/anim/jog.mp4`,
       `e2e/anim-jog.mts`.
   - **The jog tuned (same day): still shaking up and down, the hands too high.**
     - The shake measured frame by frame in `/dev/move` (`e2e/anim-jog-bob.mts`): the hips
       dropped 4–5 cm in a frame at every landing. `footPlant` took any foot under 5 cm as
       standing and pulled it to the floor by dropping the hips — a foot coming down to land,
       or up on its toes. Now it follows the ground's height only: a foot the pose has up stays
       up (one the pose has sunk is lifted). Unit test.
     - And the sandbox asked for the ground round a whole body's width under each foot, so it
       found the tops of things beside it (0.72 m under a foot on the flat, a leg jerked): a
       foot's own spot now.
     - The jog's own bob halved: the hips move 1 cm a step, smoothly.
     - The hands lower: the arms swing less far forward and the elbows open, the hands by the
       waist (the sprint's arms as they were).
   - **The jog investigated (same day: "the body is weird").** Side-on and front filmstrips
     (`/dev/chars?anim=jog2`, `&yaw=-1.5708` for the front), its angles measured against a real
     jog's:

     | | the jog then | a real jog / KH |
     |---|---|---|
     | thigh forward | 69° | 35–45° |
     | knee folded | 126° | 90–110° |
     | hips | 5 cm under standing, always | 2–3 cm at the plant, higher in the air |
     | lean | 11° (upright, with her big head) | 15–20° |
     | elbows | 52°: nearly straight | 80–90°, the hands low |
     | the step | 1.64 legs long, half on the ground | about a third on the ground |

     A high-knee march in a crouch, with a toy soldier's arms: the swing was keyed by the
     foot's path (it can't hold the joints to a jog's), and the hands lowered by opening the
     elbows. Rebuilt: the stance 20% of the cycle (a step 40% on the ground, 60% in the air), the
     hips up near standing, the swing keyed by the joints on a jog's curves (39° forward, 106°
     at most, the heel flicked up behind), joined to the stance at its own speed; the lean 17°;
     the elbows bent and the hands kept low by the upper arm's swing. Measured: 39°, 106°, the
     hips 0.639–0.651 (standing 0.673), the elbows 72°; the feet still planted (the unit test).
     The render checked against the numbers, ankle by ankle. `design/anim/07-jog.png` (before,
     after; side, front).
2. **The tools and the body:**
   - `/dev/anim`: any animation by name, scrubbed, slowed, looped, onion-skinned. Before and
     after side by side, a ground grid, the feet's slide shown, pops flagged.
   - The new joints and springs (B), every look built again and checked.
   - The layer system (C) with the feet's and the hands' IK and the look-at; the old
     animations run through it unchanged; the `yutopia-anim` chunk.

   **In steps (2026-10-30):** 2a `/dev/anim`; 2b the chest joint and real skin weights (the
   waist); 2c toes, fingers and thumbs; 2d the springs; 2e the layers and the chunk.

   **2a built 2026-10-30: `/dev/anim`, the bench** (`app/dev/anim/`):
   - **Clips by name** (`clips.ts`), two ways each: the **raw keys** (the pose at a moment) and
     **live**, a scripted run driven through `Locomotion` as the game drives it (its momentum's
     springs, follow-through, the gaze). Each has a **before**: the old keys, or plan 58 off.
     Standing, turning on the spot, the walk, jog, run and sprint, start–jog–stop,
     sprint–skid, jogging round, the hop, flip and leap, the slide and the skid.
   - A clip's worked out once into a table at 120 frames a second, so scrubbing, the onion
     skins (up to six ghosts, fading), the pops and the feet all read it.
   - **The feet:** posed frame by frame on the model, each ankle read off its bone. On the ground
     within 5 mm of its height standing; the timeline's lanes show each foot's time there, red
     where it slides past 10 cm/s; its trail on the ground; the readout: time on the ground, the
     worst slide (from a foot's second frame down: touching down it's still braking), how far a
     foot went into the floor.
   - **Pops:** a break in a joint's motion, found on its own table at 1000 a second — its speed
     changing in one sample by 0.6 rad/s more than the samples 3 ms either side. A hard but
     smooth swing (the sprint's ~600 rad/s²) doesn't count; a kink does. Marked on the
     timeline, named in the readout.
   - Views (side, front, back, ¾, above), speeds 0.05–1×, the mood, keys (Space, ← →, [ ],
     O, C, L, 1–5), the query (`?clip=jog&live=1&compare=1&onion=3&t=0.3&play=0`),
     `window.__anim` and `e2e/anim-bench.mts` for stills with their numbers.
   - **What it found on its first day:**
     - **The jog's planted foot still slid** (0.3–0.7 m/s): the pelvis twists each step and
       the thigh never turned against it (its yaw was always 0), so the leg swung with it. The
       2D unit test couldn't see it. Now each leg's world way is turned into the thigh's own
       through the hips' real turn (quaternions, in the anim chunk), and the foot's reached from
       where the twist puts the hip joint. The test is 3D now, with three's own sums.
     - **The jog hitched at each step** (pops at toe-off and landing): the swing joined the
       planted leg by speed only. Now by speed and its change (a quintic join), and the
       toes push off faster and faster, so the knee turns into the swing instead of locking.
       The jog: no pops, planted 15% of the time each foot, sliding at most 2.8 cm/s.
     - **Still to fix, by the phases that remake them:** the keyed walk rests only 9% of the
       time and slides 38 cm/s; the keyed sprint floats, slides 9 m/s, sinks 8 cm, and its knee
       kinks every stride (the fold's corner at 0.9) — phase 4. The idle slides a foot 16 cm/s
       and sinks one 1.3 cm at its weight shifts — phase 3. Driven, even the jog slides (up to
       7 m/s) and sinks 3 cm: the layers over it (the lean springs on the hips with the thighs
       turned back by Euler sums, the short starting strides the keys don't know) — 2e.

   **2b built 2026-10-30: the chest, and the trunk skinned for real:**
   - **A `chest` joint** (`rig.ts`: 17 joints) between the spine and the neck, at 0.66 of the
     trunk; the neck and both shoulders hang from it. The builders' parts didn't move (a joint's
     world place at rest is the same); the model's hand reaches go through it.
   - **Skin weights by height** (`bake.ts` `trunkSkin`): everything on the hips, the spine or the
     chest — the body and all it wears — rides those three by its height, blended across each
     joint (hips → spine round the spine's joint, spine → chest round the chest's). Skin and
     clothes at a height move together, so the trunk bends as one and the waist never opens.
     A part's own second bone still comes first (a skirt's front on the thighs). The top's old
     spine-to-hips blend (`build/index.ts`) is gone: the weights do it.
   - **The lean shared down the back** (`leanAtHips`): 40% at the hips (the thighs turned back
     by as much), 35% the spine, 25% the chest — it curves; phase 0 took all but 0.05 at the
     hips. The twist and the side bend are shared by the spine and the chest (`body()`), the
     chest has its own channels (`cx/cy/cz`), the head's held level against all three. The gaze's
     and the lead's turn of the chest is on the chest; it follows through (36), and aiming takes it.
   - **Checked:** a "trunk bend" clip in `/dev/anim` (forward, back, twisting, to the sides,
     through both; `&top=tank`… for the look), and the flip balled up and the slide reclined:
     no skin at the waist in a tee, a tank, a shirt. Every top and bottom on the wardrobe sheets
     as before at rest. The sprint's lean curves. Tests 72 and 443, budgets as they were.
     `design/anim/10-trunk-bends.png`, `11-sprint-curved.png`.

   **2c built 2026-10-30: toes, fingers and thumbs** (25 joints):
   - **A toe at each foot's ball** (`toeL/R`, on the sole 0.42 of the foot ahead): the shoe's
     front rides it, blended over the ball (a boot's over a longer stretch). Its top creases as
     it bends, as a shoe does. Checked in node: up on tiptoe the sole's front lies flat (within
     a centimetre) while the heel's up.
   - **The hand: the fingers as one hinge at the knuckles, the index on its own, the thumb**
     (`fingers`, `index`, `thumb` L/R). The mitten's weights blend wrist → fingers → index across
     it, and the thumb's lobe onto the thumb, so a bend stretches and never tears; the baker
     takes up to four bones a vertex now. First person's arms carry the hands.
   - **Hand shapes** (`rig.ts` `HANDS`, `handPose`): open, relaxed (everyone's at rest),
     loose, grip, fist, point, thumbs up. In channels, `h` −1 open … 0 relaxed … 1 a fist.
     Used: the run's hands loose at a jog, fists at a sprint; the slide's open; a grip on the
     mug, the phone (its thumb free), the torch, the gun and the reload; the photo poses' point,
     thumbs up and a peace (the index up, the rest half open: as near as one hinge gets); the
     wave's open.
   - **The toes on the ground:** in any keyed pose a foot's toes bend just as far as the ground
     presses them (their tip kept out of the floor while the ball's low; let go as it rises),
     eased, never switched — a push-off rolls through the ball. The jog's own: its push-off
     pivots on the ball with the toes flat, and lets them go over a fifth of the cycle,
     joined by speed and its change.
   - **The bench caught on the way:** a leg near straight stopped dead at the solver's limit
     (the knee kinked at the jog's toe-off: now it eases into straight), the toes snapping
     (switched on and off, hard maxima, a `max(0, f)`) — all smoothed; pops on small joints
     weigh by their size (×4 for toes and fingers). The jog: 0 pops, sliding 3 cm/s. The walk's
     toes let go in ~8 ms because its keyed foot really lifts that fast (it floats: phase 4).
   - **Budget, fresh build:** the page 419.5; `yutopia-chars` 36.6 (+0.5); `yutopia-anim` 6.8
     (+1.5 for 2a–2c). (`pnpm budget` reads the last `.next-prod` build: build first.)
   - `design/anim/12-hand-shapes.png`, `13-hands-posing.png`; `/dev/anim` "hands and toes"
     (`&zoom=3&at=0.98&ahead=0.38` for the hands).

   **2d built 2026-10-30: the springs** (29 joints):
   - **Four spring joints everyone has** (`hair` on the head, `skirt` on the hips, `scarf` and
     `pack` on the chest), weighted only on whoever wears what hangs on them — so a look without
     costs nothing. A builder puts its spring where the thing hangs from (`Kit.spring`) and
     weights the hanging part, more towards its tip:
     - long hair: the locks from the ears down; a bob's a little; a ponytail's tail from its tie;
     - a skirt (and a dress's, a long skirt's): what's left of the hem after the thighs' share;
     - a scarf's ends from under the knot; a backpack's bag (not its straps).
   - **The step** (`PersonModel.step(dt)`, after the pose, never in it): each tip a damped spring
     chasing where it'd hang — partly as its parent holds it, partly straight down — sub-stepped
     at 240 a second, held to its length, kept out of the head and the chest (spheres from the
     body), the bone turned after it no further than its limit. Its own frequency, damping and
     limit each: a ponytail loose (1.9 Hz), long hair 2.4, a bob 3.2, a skirt 2.4–3, a scarf
     2.6, a pack strapped tight (4.5 Hz, 0.12 rad, hardly hanging: the first try swung off the
     back like a board as she leant into a run). Nothing's made in the step.
   - **Where:** the world's people step theirs within 12 m, resting further off, with reduced
     motion, and in first person's arms; the sandbox, `/dev/anim` (as it plays; scrubbed they
     hold) and `/dev/chars`.
   - **Seen:** the ponytail flung up as she sets off, trailing on the jog, settling as she
     stops; the skirt flaring back and billowing; the long hair streaming; the pack riding the
     back. `design/anim/springs-ponytail-skirt.mp4`, `springs-hair-pack.mp4`, `14-…`, `15-…`
     (`e2e/anim-springs.mts`).
   - **Budget, fresh build:** the page 419.5; `yutopia-chars` 37.8 (+1.2); `yutopia-anim` 6.8.
   - Not yet: the springs only test their tips against the body (a lock's middle can cross the
     shoulder), and the weak machine's 20 people near is measured at the end of phase 2.

   **2e built 2026-10-30: the layers, and the foot lock last:**
   - **The order in `Locomotion`:** the base (a cycle or a pose by the state) → its transitions
     (the start, the skid, the stop's settle, turning steps) → *where the base has the feet is
     kept* → the additive layers (each person's variation, the trunk's lean springs, the dark's
     looking round) → the follow-through → the gaze → **the foot lock**. Plan 58 off, none of
     this runs: the old animations are as they were.
   - **The foot lock** (`anim/hero.ts` `FootLock`): a foot the base has on the ground (within
     1.2 cm, not rising or falling) is pinned where it lands, held in the ground's frame (carried
     back as the body goes on and turns), and the leg's solved again in 3D through the hips' real
     turn to reach it, at the base's height (its heel, its roll onto the toes) — so the layers
     lean and twist the body but can't move a planted foot. It lets go when the foot's lifted or
     the base has gone more than 22 cm from it; taken and let go eased, along the ground between
     the pin and the pose (never by blending the leg's angles: half-way the foot scraped the
     ground), and never pinned again till it's let go. A foot in the air is drawn back towards
     the base's as it nears the ground.
   - **Found on the way:** the start's drive (`pump`) swapped the jog's legs for the keyed
     sprint's (floating, sinking 9 cm, sliding): the drive pumps the arms and leans in now; the
     legs go by the speed (`run2Pose`'s `legs`).
   - **Measured, driven (`/dev/anim` live), worst slide on the ground:**

     | | before 2e | now |
     |---|---|---|
     | start, jog, stop | 740 cm/s, 3 cm in the floor | 28 cm/s, 0.8 |
     | jog round | 612 cm/s; one foot down 1% of the time | 47 cm/s; 15% / 15%, 0.1 |
     | walk | 40 cm/s | 12 cm/s |
     | idle | 16 cm/s | 0.6 cm/s |
     | turning on the spot | — | 2.2 cm/s |

     What's left is all in the first half second from standing (the first steps: phase 4's
     starts), and the keyed sprint, whose feet never touch down for the lock to take (phase 4).
     Moving, no pops on the jog, the walk or the curve.
   - **Tests:** the lock holds a foot within a centimetre under a hard swinging lean and twist
     (`feel.test.ts`). 73 client, 443 shared.
   - **Cost:** the springs 4.6 µs a person a frame for three (0.1 ms for 20 near); the lock a few
     quaternion sums a foot. **Budget, fresh build:** the page 419.5; `yutopia-chars` 37.9;
     `yutopia-anim` 7.8 (the lock, the jog, the gaze, the keys: the system's in its own chunk).
   - `design/anim/lock-jog-round.mp4`.

   **The jog's trunk (same day, your call: "it looks like it drags its feet — it's the trunk, it
   doesn't move, only the legs and the arms do").** Measured: the pelvis turned ±0.1 rad, the
   chest's counter-twist ±0.12, no hip drop, no give in the back, the hips up and down 1 cm (cut
   from 1.8, blamed for a shake that was really the feet's snaps). The trunk rode the legs dead
   level. Now, on the jog's steps (`jogTrunk`):
   - the hip over the swinging leg drops at mid-stance (0.06 rad, more in the dark), the chest
     leaning back over it;
   - the back gives as the foot takes the weight and straightens in the air (0.05 rad, the spine
     and the chest);
   - the pelvis turns with the leg going forward and the chest against it as much as a sprint's
     (±0.12 and ±0.2);
   - the hips rise and fall 2.6 cm, lowest as each foot takes the weight;
   - the head's held level against it all; the follow-through lets it overlap.
   The planted legs reach from where the drop and the twist put the hip joints: the jog still
   has no pops, its feet planted (6 cm/s), and driven none once moving. `design/anim/jog-trunk.mp4`,
   `jog-trunk-back.mp4`. **You passed it: "it's right now".**

   **Phase 2 signed off 2026-10-30.** Not yet done from its list: the hands' IK on things (a
   ledge, a rail, another's hand — phases 5–6 use it), the look-at's line of sight by Jolt's rays
   (phase 3), and the weak machine with 20 near (the world isn't on plan 58's animations yet: it's
   measured when it is).
3. **Standing and life:** the idle in both moods, its variants, turns in place, breath, the
   look-at in use (its line of sight by Jolt's rays).

   **Built and signed off 2026-10-30** (the sandbox and the dev pages; the world not yet
   switched):
   - **3a, the idle's feet placed:** they stay put — a relaxed stance each person has (one foot a
     little ahead); the weight shifts and the hips roll over them, and the legs are solved to
     reach, so the free knee bends because its hip's come down, as a body's does. The shuffle's
     a real small step (lifted, set on, set down), the stretch rises onto the balls of the feet.
     The idle's kinks smoothed (the weight shift's dip, the look over the shoulder, the shuffle:
     half-sines that started and stopped with speed; an `|w|`; the leg solver's hard stop near
     straight). Measured: 0 pops, 0 slide, nothing in the floor — by day, in the dark, driven
     (it slid 16 cm/s and sank 1.3 cm).
   - **3b, breath in the chest:** its own joint lifts and opens with each breath in (the spine a
     little), slow by day, quicker in the dark; `Locomotion` keeps the breath's place and how
     winded (`life()`): up as she sprints, down over a quarter of a minute's rest. Winded, the
     breath's fast and big, she leans forward a little, and past a point her hands go to her
     hips, elbows out, the chest heaving — the variants wait till she's got it back. The bench's
     "sprint, then winded". `design/anim/winded.mp4`.
   - **3c, the variants with hands:** the stretch's open, the shirt's tug gripped, the cold's rub
     open; a new one for the cold, the front foot stamped twice, arms in. The bench's idle runs 40
     s so they come.
   - **3d, turning on the spot:** its steps eased in over 0.15 s (they snapped in over 30 ms), a
     turn begun from standing starts on both feet, the stepping knee's rule softened; the foot
     lock holds the feet between steps and lets a released foot down gently (a pin's full reach
     dropped to a part at once had popped the knee). Pops 28 → 10, at turns stopping mid-step.
     `design/anim/turn-on-the-spot.mp4`.
   - **3e, looking at people** (`LookAt`): someone within 7 m and in front (±110°) — the nearer,
     the more ahead, whoever's moving first — held 1.2–4 s, a look away, then the next; never
     anyone the world's sight ray says is hidden (let go of 0.2 s after they go). Lock-on
     still wins. In the sandbox the dummies and the rolling balls: she looks, eyes first, the
     head after. Unit test. `design/anim/look-at.mp4`.
   - **Tests** 74 client; **budget, fresh build:** the page 419.5, `yutopia-chars` 38.1,
     `yutopia-anim` 8.8.
   - **Left for later phases:** a turn stopped mid-step still pops (phase 4's pivots and stops);
     the look-at's other targets — whoever's talking, a sound — come with the world's switch;
     the walk and the sprint (phase 4).
4. **Walking and running:** every gait again, distance-matched, with starts, stops, pivots,
   banking, the feet on slopes and stairs by Jolt's rays, the winded and hurt walks, sneaking,
   strafing. Gaits by persona and your own chosen one (in the look's editor, on the wire with
   your look).

   **In steps (2026-10-30):** 4a the walk; 4b the run and the sprint; 4c starts, stops and pivots;
   4d crouching, sneaking, strafing, backing up, the winded and hurt walks; 4e gaits by persona and
   your own in the look's editor; 4f slopes and stairs.

   **4a built 2026-10-30: the walk.**
   - **Your call: the walk 1.5 m/s** (KH_MOVE's; it was 2.2). At 2.2 her legs (0.61 m) had no
     reach for a walk — one foot always down caps a step near a leg's length — so it floated
     (down 9–20% of the time) and slid (up to 47 cm/s) at over four steps a second. Now 1.6
     strides a second.
   - **One gait engine** (`Gait`, `gaitPlanted`/`gaitLeg`/`gaitPlant`): the jog's way made
     general — the foot on the ground keyed by where it is, landing on its heel if the gait
     strikes with it, rocking down off the heel and up onto the ball (each staying put, the ankle
     swinging round it: `ANKLE·sin f`), the leg solved from where the hips' turn puts the hip
     joint; the leg in the air keyed by its joints, or late in the swing by where the foot's to be
     (solved from wherever the hips are: the dark's lower hips once put the landing heel 3 cm
     through the floor); joined by where, how fast and how that's changing. The jog runs on it
     too (its push-off's ball now stays put: it slid 9.5 mm with the ankle held).
   - **The walk on it:** a heel strike (toes up 0.3), down onto the flat foot, over it, up onto
     the toes and off; 58% of the cycle on the ground, a little of both at each change. The hips
     a pendulum — highest over the planted foot (its knee ~13°), lowest as the weight changes feet
     — the hip over the swinging leg dropping, the chest back over it; the arms and twist as keyed.
     In the dark shorter, lower, the swinging knee folded more. The leg solver's ease into
     straight starts at 98% now (a walking leg's near straight over its foot).
   - **Measured:** keyed, 0 pops by day and in the dark, nothing in the floor; driven, the feet
     planted but for setting off, one stray pop. Tests: the heel then the ball held within 8 mm
     and on the ground, no sole in the floor in any mood; the jog's ball held through its stance.
   - `design/anim/walk.mp4`, `walk-dark.mp4`, `16-walk-day-dark.png`.

   **4b built 2026-10-30: the run and the sprint.**
   - **The sprint a gait from its feet** (`SPRINT`): landing on the ball under the hip, never
     the heel (a tilt of 0.25 settling to 0.12 — the gait's new mid-stance tilt), driving off the
     toes; 30% of each step on the ground, the rest in the air; the heel kicked up to the seat, the
     knee driven high, the foot clawing back to land; the hips lowest as the foot takes them. Its
     stride 2.7 m (was 2.35): three strides a second, not three and a half.
   - **The run between, a gait between** (`lerpGait`): the jog's spec and the sprint's blended by
     the legs' effort, key by key — planted at any speed (blending two poses, each planted by its
     own stride, slid the feet). The keyed sprint's legs are gone (they floated, slid 9 m/s, sank
     9 cm and kinked at the knee every stride); the trunk's work fades from the jog's to the
     sprint's held drive.
   - **Smoother still:** the roll onto the toes a cube, not a square (a square started with a
     jolt in its acceleration — at a sprint's pace a pop), the toes' release matched to it.
   - **The bench:** a foot's contact is its heel or its ball, whichever's down (a sprinter's
     ankle never comes down: it read no contact); a slide is only from one contact to the same
     one; a pop's judged against the joint's own speed too (8% of it) — the eye judges a jolt by
     the motion it's in. The jog, the walk and the idle: 0 pops; the sprint still flags ~90 at its
     turning points (high jerk where it's near still), not seen at a quarter speed.
   - **Tests:** the ball planted at a run and a sprint, the cadence; 76 client, 443 shared.
   - `design/anim/sprint.mp4`, `sprint-slow.mp4`, `run.mp4`.

   **Fixed 2026-10-30: "our legs are smaller?"** The bones hadn't changed. Phase 3's idle stood
   in a half-squat: its hips 3.3 cm under standing, so both knees bent ~37° (~50° in the dark),
   and that reads as short legs. Now the hips are 0.7 cm down (+1.4 cm at the dark's full
   tension), the weight shift rolls them less (0.045, was 0.07: that dropped the free hip till
   its knee bent), and the free heel lifts 4 cm, not more (more bent the free knee to 48°). The
   leg solver's soft limit now starts at 99.2% of the leg's reach (was 98%): a leg at 99% of its
   reach already reads ~16° at the knee. Knees now: day 17–26° standing, 23–32° free; dark
   26–36°, 34–40°. The walk, jog and sprint benches are unchanged. `design/anim/17-idle-stance.png`.

   **4c built 2026-10-30: starts, stops and pivots — steps of their own.**
   - **The bench drives the move core itself** (`keys` clips: start/stop for the walk and jog, the
     sprint's skid, turning back at a walk, a jog and a sprint, a quarter-turn cut): the body as the
     game moves it. Found on the way: the bench's driven turn had the wrong sign.
   - **The foot lock holds what the foot stands on** — its heel, then its ball as it rolls up (it held
     the ankle, which dragged the ball back 0.7–1.9 m/s at every push-off in every gait).
   - **The stepper** (hero.ts `Stepper`; Locomotion's `idle` / `steps` / `start` / `cycle`): each foot
     put down where it's to go on the ground and kept there, the hips carried over them (a spring;
     never higher than a planted leg reaches), the legs solved to them, laid on by where the feet
     are (never by blending angles). A cycle can't do these: a jog never has both feet down.
     - **Setting off:** the foot behind steps out first, to where the cycle will have it as it lands
       — timed so the foot left behind is where the cycle has it then (a quick short first step);
       that one rolls up onto its ball and pushes; the cycle takes over on that foot.
     - **Stopping:** the cycle's feet taken as they are; one up is the brake — down where it was
       going — the body carried over it, the other brought through beside it, then the idle (whose
       foot spots are the stepper's targets).
     - **The skid** (from a sprint): the front foot out ahead on its heel, toes up, the other under on
       its ball, both sliding on with the body (85%) till it's nearly stopped; then they grip and the
       catch step brings her up.
     - **Pivots** (the core turns her half round in ~0.15 s): the planted foot under her turned on its
       ball at the turn's rate and drawn in under her (she turns about herself, not the foot: half a
       turn crossed the legs); the other swung round; no foot under her, a little hop round.
     - **Turning on the spot:** the feet step round as they fall behind the body's turn (the old
       turn-step pose is gone).
   - **Measured** (worst slide of a planted foot; frames over 0.3 m/s): start-walk-stop 4.4 m/s →
     0.27 (none); start-jog-stop 11 → 0.8 (2, touchdowns); walk turn back ~0.3–1.5 (1–5); jog turn
     back 8 → 3.3 (one heel frame as the pivot begins; ~18 short); sprint turn back 21 → 4.4 (the skid's
     own slide); turning on the spot 0 frames (was 27). Idle unchanged (0 pops).
   - **Left:** the pop count stays high on the runs' speed-ups (the stride shortening as she drives);
     the jog's start handover in the dark slides ~3 m/s for a few frames; the stop's settle holds the
     knees bent ~0.5 s.
   - **Tools:** `e2e/anim-strip.mts` (a filmstrip of a clip at set moments: `__anim.seek`),
     `e2e/anim-report.mts`. **Tests** 77 client (a new one: starts, stops, turning back — planted
     feet held, none in the floor). **Budget, fresh build:** page 419.5, `yutopia-chars` 39.2,
     `yutopia-anim` 11.6.
   - `design/anim/4c-jog-start-stop.mp4`, `4c-walk-start-stop.mp4`, `4c-jog-turn-back.mp4`,
     `4c-sprint-skid.mp4`, `4c-turn-on-the-spot.mp4` (half speed).
   **4c signed off 2026-10-30.**

   **4d built 2026-10-30: aside, backing up, crouched, aiming, winded, hurt.**
   - **Your calls:** the speeds stay — crouched 1.6 m/s, aiming 2.0, and facing the look (first
     person, lock-on) aside and backing up at the jog's 5 m/s.
   - **Aside and aslant:** the walk and the run turned the way the body goes — the hips and the legs'
     plane turned to it (up to 100°), the trunk twisted back so the chest and then the head still face
     ahead: how a body runs sideways, its feet as true as going forward. Only when the body faces the
     look (`LocoIn.facing`: first person, lock-on, aiming) — in third person a moment's velocity off
     the facing (turning round) isn't backing up.
   - **Backing up** (`back2Pose`): a walk the other way round (toes down first behind, back onto the
     heel, off it last, toes up) and a run on the balls of the feet for 5 m/s, between them by the
     speed; past a right angle off the facing, turned aslant up to 70°. The gait engine has a
     direction now (`Gait.dir`).
   - **Crouched** (`crouch2Pose`): a low sneak at 1.6 m/s with long heel-to-toe steps (low hips give
     the legs more reach, not less), the back round, the hands loose in front; crouched backing up on
     the back-walk's steps; crouched and still with the feet placed, the back one on its ball. The
     stepper works crouched (the crouch's own spots).
   - **Aiming:** the legs are the gait's (aside, backing up, starts and stops by the stepper); the top
     aims over them.
   - **Winded** (after a sprint): the walk bent over, the head down, the arms hanging, the chest
     heaving with the breath; easing as she gets it back.
   - **Hurt** (`LocoIn.hurt` 0…1, the vitals' health gone; a slider in /dev/move): a limp on the
     right leg — on it a shorter while (47% of the cycle, the left landing early), its knee kept
     stiff, swung through from the hip hiked up, the trunk lurching over it while it's down; the right
     arm held in against the side.
   - **On the way:** the swings near the floor keyed by where the foot's to be (by the joints the
     crouch's and the back-walk's went through it); the hips' height read at the body's phase (a
     limp's legs aren't half a cycle apart); crouching down, backing up and the skid's lean mixed by
     where the feet are (`blendLegs` — by the angles the feet sank 3.8 cm crouching); the skid over
     when the braking is; a swing never through the floor; an adopted first step takes the first
     step's time, and hands over early once the foot left behind is stretched; the bench's floor
     200 m (a long sprint ran off its edge).
   - **Measured** (worst slide; frames over 0.3 m/s): crouch start–sneak–stop 0.27 (0); aiming round
     a square 0.8 (14, touchdowns); back-up walk 0.26–3.1 (4); back-up jog 0.8–2.3 (8); aside walk/jog
     ≤2.7 (7–10); limp 0.3 (1); the turn-backs back to 4c's. Nothing sinks but the skid's brace (1.9
     cm, from 4c).
   - **Left:** a corner at the jog's 5 m/s facing on (a 90° cut sideways) slides 3–6 m/s for a few
     frames; crouched backing up as it sets off ~4 m/s for two; slowing from a sprint into a walk, one
     slide. `yutopia-anim` is 13.3 of 15 KB.
   - **Tests** 77 client (the planted-feet test now covers crouching, aiming round a square, backing
     up and the limp). **Budget:** page 419.5, `yutopia-chars` 39.7, `yutopia-anim` 13.3.
   - `design/anim/4d-back-up-jog.mp4`, `4d-aside-jog.mp4`, `4d-square-facing-on.mp4`,
     `4d-aim-square.mp4`, `4d-crouch.mp4`, `4d-crouch-back-aside.mp4`, `4d-walk-hurt.mp4`,
     `4d-winded.mp4` (half speed).
   **4d signed off 2026-10-30.**

   **4e built 2026-10-30: how someone walks — yours chosen, the folk's by who they are.**
   - **Six walks** (`GAIT_STYLES` in hero.ts): calm (today's), bouncy (up on the toes, the hips
     bobbing, quick short steps, the arms loose and wide), heavy (low, flat-footed, long steps, the
     shoulders rolling, arms out, a wider stance) — yours to choose; brisk (long steps, the arms
     working), tired (hunched, the head down, the arms hanging), old (stooped, the knees soft, short
     flat steps) — the folk's. Each shapes the walk from its feet (the stride, the hips' height and
     bob, the heel strike and the push-off, the swing's knee — the gait's hips' turn its own, so the
     legs reach true) and over them (the arms, the twist, the lean, the head), and how they stand
     (the stance, the stoop, how often the weight shifts). Lower hips get more knee in the swing, not
     less (less put the foot through the floor).
   - **Yours in the look** (`AvatarLayers.gait`, calm by default): the editor's Body tab has "How
     you walk" (calm, bouncy, heavy; English and Portuguese), and choosing one walks the preview —
     the preview now on plan 58's animations at the walk's 1.5 m/s. The API keeps it (`gait`, a
     slug; its test), it travels with the look, and `person3d` hands it to each person's motion:
     others see your walk. Bots draw theirs last from their seed (their looks unchanged).
   - **The folk:** Rosa (race control) brisk, Joe (the mechanic) heavy, Lia (cocoa) calm, Maya
     bouncy, Theo tired, Inês calm, Ben old — Ben's hair and beard grey for it; the night guard
     heavy. The world server walks them at their pace (old 0.7×, tired 0.85×, brisk 1.15×…).
   - **Tried:** /dev/move — B cycles the walk (the panel shows it); /dev/anim `&gait=bouncy`.
   - **Measured:** calm, bouncy, heavy and brisk driven at the walk's 1.5 m/s and from start to stop:
     0–4 frames over 0.3 m/s, nothing in the floor; old and tired at their own paces 0–2. Tests 78
     client (every style, every mood: planted feet held, none in the floor), the API's 21, shared,
     park-life. **Budget, fresh build:** page 419.7, `yutopia-chars` 39.8, `yutopia-anim` 14.0 of 15
     — the next phases need room (split the chunk, or raise it by your call).
   - **Left:** the run keeps one style (the walks differ; at a run everyone's KH); the limp on top of
     the tired or old walk scrapes (no folk are hurt; players can't pick those).
   - `design/anim/4e-walk-styles.mp4` (half speed; top: calm, bouncy, heavy; bottom: brisk, tired,
     old), `18-walk-styles.png` (a cycle each, side on).
   **4e signed off 2026-10-30.**

   **4f built 2026-10-30: slopes and stairs.**
   - **The ground in Locomotion** (`LocoIn.ground`: the height at a spot in the body's own space, from
     the ground under it). The last pass, after the foot lock (`Locomotion.grounded`): every pose till
     then stands on the flat; now each foot on its own ground — a foot down set on it and tipped to
     it along and across (pitch and roll, ±0.35 / ±0.3 rad), over a stair's edge resting flat on the
     nosing (the higher of its heel's and ball's ground), the rest over the step below; a foot up
     carried over what's under it and near it — out from its toes and its heel, less a centimetre a
     centimetre off (a cone: it rises as it nears a riser and comes down past an edge, the edge found
     between samples by bisection — sampled alone, the foot jumped by the samples' gap); the hips let
     down for the lower foot down, each foot weighted by how far it's down (never up: the body's
     height is the core's), eased. Legs on flat ground under hips that haven't moved are left as they
     were. The 3D legs (`groundLeg`: the solver, the foot tipped), so the pelvis's twist, the way-turn
     and the foot lock all hold.
   - **footPlant is gone** (phase 1d's: 2D legs after everything, wrong for the twisted pelvis and the
     3D feet); /dev/move hands Locomotion Jolt's ground under a spot (a foot's width) instead, its
     probe now `Locomotion.groundOut`.
   - **The bench:** slopes and stairs clips (a 15° ramp up and down, a 12° cross-slope, stairs up and
     down — 15 cm rises, 30 cm treads — at a walk and a jog, standing on a stair's edge), the ground
     drawn, the feet measured over the ground under each, the camera rising with her.
   - **Measured:** up and down the ramp and the stairs at a walk, across the slope: planted feet held
     (no frame over 0.3 m/s), nothing in the ground; the jog up the stairs 4 frames at touchdowns.
     The pop count on stairs is high (~140 a clip: the legs' solve as the ground changes under a
     swinging foot) and isn't seen at half speed. Test: a step up under one foot raises just it, a
     step down drops the hips 10 cm, the flat changes nothing (replacing footPlant's).
   - **Left:** a landing isn't moved onto a tread (a foot can land with its heel over the step's edge:
     it rests on the nosing); stairs taken a step a tread is the stride's luck, not planned; the
     world's people get the ground when the world switches to plan 58.
   - **Budget, fresh build:** page 419.7, `yutopia-chars` 40.4, `yutopia-anim` 13.7.
   - `design/anim/4f-up-stairs.mp4`, `4f-down-stairs.mp4`, `4f-jog-up-stairs.mp4`, `4f-up-ramp.mp4`,
     `4f-across-slope.mp4`, `4f-stair-edge.mp4` (half speed).

   **Fixes, 2026-10-30 (your four):**
   - **"Jumping when running isn't precise":** the core's jump was clean (off the ground 33 ms after
     the press, the run's speed kept), but (a) at a 120 Hz screen 1 frame in 100 runs no fixed step,
     and its press was lost — now carried to the next frame (`HeldOver`, controls.ts; the world's
     walker and /dev/move; a test); (b) the landing: the core has no landing stage, so the jump's pose
     dropped to the run's in a frame and a fall's deep crouch was held 0.3 s at a sprint, the feet
     sliding 18 m/s. Now the jump's own keyed landing plays — quick and light on the run, only the
     foot the run has down taking its height (a swinging one dragged along the floor), the run picked
     up on the foot that comes down first at the point of its stance where the jump put it; the
     stepper keeps out of a landing's check in the speed; going up from the run off the stride (no
     two-footed crouch at 4 m/s), the air's pose eased in. `blendLegs` now always solves each leg
     (a weight of 0 left the angle-mixed one). Bench: `jog, jump`, `sprint, jump` (the core's own).
     The sprint jump lands clean; the jog jump has one frame's hop of a few cm left.
   - **"Small steps catch you":** a jog at a 10 cm kerb fell from 5 to 1.3 m/s, at a 15 cm stair or
     a 20 cm kerb to 0 a moment. Two causes in the mover: a step's climb (less ground covered while
     Jolt lifts the body) was taken as a wall and the speed cut; and a capsule's round foot meets a
     kerb's edge as a walkable slope, not the wall Jolt walks stairs from — it slid up the edge. Now
     the climb keeps the speed (`CharacterMover`, along the ground), and a walking body held short
     at a step it may climb is put on it (`PhysicsWorld.moveCharacter`: the top just past its front,
     the room checked; Jolt's own `WalkStairs` gave up — a few cm on, a capsule's middle is still
     over the floor below). Kerbs and stairs to 20 cm, straight or aslant: the pace kept; 40 cm
     stops it. A physics test; the bench's checks and hashes unchanged.
   - **"Running fast and turning, the leg folds":** a cut at a sprint slows as its way swings round,
     and that started the skid — braced on a foot out ahead and slid on it while it turned: the knee
     83° off its foot, the foot 25 cm across her middle. The skid now waits for a stop, not a turn
     (`|turn| < 1.5`). Measured: 16° (a straight sprint's 8°), nothing across.
   - **"Sprinting, the legs look strange":** she leant 40° and ran with her legs streaming behind
     (the thigh 29° back, 59° forward, the knee on the ground 54°). Now leant ~26°, the thigh 17°
     back and driven 72° forward, the hips a centimetre up.
   - `design/anim/fix-sprint.mp4`, `fix-sprint-turn.mp4`, `fix-sprint-jump.mp4`, `fix-jog-jump.mp4`
     (half speed). Tests 79 client, 444 shared, the physics bench.
   - **"The legs look small" (and side on, running, the two legs one shape):** they were — 36% of 1.7 m
     (a real adult's ~50%, Sora's ~46%). Your calls: the legs 15% longer, she taller (head, trunk
     and arms as they were: 1.79 m, the head still 0.34 m), and the far leg a shade darker. The gaits'
     strides, landings, foot keys and hips' heights scale with the legs (`LEG_K`, moves.ts; `hipAt`,
     hero.ts), and today's world's old strides too. The far leg: each leg's vertex knows its leg and
     its hip at rest (bake.ts), the vertex shader finds both hips where the thighs' bones have them
     and darkens the one farther from the camera by 20% — side on, all; face on, none (`legShade`,
     model.ts, on the world's body materials after their light). Tests 79; budget: page 419.7,
     `yutopia-chars` 41.5, `yutopia-anim` 13.7. To watch: the car's and the kart's seated legs
     (fixed angles: 13% further toward the pedals); the physics body is still 1.75 m tall.
     `design/anim/19-longer-legs.png`, `legs-jog.mp4`, `legs-sprint.mp4`.
   **The fixes and the legs signed off 2026-10-30 ("they read right").**
5. **In the air and Flowmotion:**
   - the jumps, falls and landings, the verbs; the ragdoll (C2) for high falls and hits, and its
     get-ups;
   - Flowmotion on the new body: fingers gripping the ledge and the pole, toes pushing off.
6. **Everyday acts:** sitting, the phone, busy, together (the hands meeting by IK), emotes.
7. **The dark:** the torch, the gun, hits, down and crawling, fear.
8. **The shadowed** made again on the new body.
9. **Reactions and life:** flinches, shivers, catching breath, idles by persona, glances; the
   cold (breath puffs, hunching, stamping).
10. **The checks:**
   - e2e: a pose sheet of every animation, built and played, with no NaNs and no pops.
   - The feet's slide measured, under a set limit, in every cycle.
   - Two browsers: others drawn in step.
   - The weak machine with 20 people near; `pnpm budget`; a final reel.

## Guardrails

- **The sign-off gate:** every phase is shown in `/dev/anim` and passed by you before the world
  gets it.
- **Animation never moves the body.** The movement core's steps and the bench's hashes are
  unchanged by this plan.
- **Every look still builds after the body grows.** Hats, hair, skirts, coats, glasses and
  beards are checked on the `/dev/chars` sheets before and after.
- **Reduced motion** (the setting) still means no idle life, short gestures and no springs.
- **The weak machine** keeps its 15 fps, measured each phase. Cost per person is logged.
- **No copying.** KH3 and Alan Wake 2 are inspiration for timing and weight. Their frames,
  curves and assets aren't used.
- **The page doesn't grow.** The new code is lazy (E).

## Decided (2026-10-30)

1. Keyed in code, with procedural layers on top. Not mocap, not a pose editor.
2. The full body: chest, toes, fingers and thumb, springs for hair, hems and scarves.
3. KH3 and Alan Wake 2 by situation **and** by mood: the tension dial.
4. In scope: moving, everyday acts, the dark, the shadowed creatures, and new reactions and life.

5. **The folk walk as who they are:** an old man slower and stooped, a kid bouncy, someone
   tired, from their persona.
6. **Your own gait** is a choice in the look's editor (calm, bouncy, heavy). It's kept with
   your look, and others see it.
7. **The cold shows:** breath puffs outside on cold nights; people hunch, rub their hands and
   stamp in the snow.
8. **Jolt does real work:** the feet and hands find the world by its rays, falls and hits blend
   into a ragdoll, and the springs keep out of the body (C2).
9. **A little real momentum** in the KH body (G.A): about 0.2 s to a run, 0.25 s to a stop, arcs
   on the run, heavier in the dark. Not visual-only, and not heavy everywhere.
10. **Eyes that look** (G.D): two morph targets on the eyes, a gaze that leads the head.
11. **The feel comes first**, on today's body (phase 1); the bigger skeleton after (phase 2).
