# Plan 103 — the skate

Asked 2026-11-18:

> Lets work on new addition! Skate! Lets use Blender for the models, and you can use the Tony hawks Series as a
> reference of animations, models and mechanics. Lets plan!

The second of the two additions asked with the bikes (plan 101). The bike left the parts they share in shared code
for this one: the trick's timing and its "finished?" test, and the landing judge (`shared/bike/tricks.ts`).

Status: **planned 2026-11-18; forks decided 2026-11-18 one by one: the recommendations for F1, F3–F6 and F8–F13;
**F2b**, the whole of Tony Hawk's (huge airs, moon gravity, everything forgiven), the same everywhere; **F7c**, both
an indoor hall and an outdoor park; **F14b**, I pick the sounds, you veto; **F15b**, no sign-off, built straight
through, you test at the end. Built 2026-11-18 (phases 0–8), committed to main, not pushed.**

**How to try it:** get a board — at a park's rack (the hall's or the yard's, east of the townhouses), in loot, or an
admin's `give board_street_pop` (any of the nine: `board_vert_classic`, `board_vert_fish`, `board_vert_square`,
`board_street_pop`, `board_street_slick`, `board_street_tech`, `board_cruiser_classic`, `board_cruiser_wood`,
`board_cruiser_mini`). Put it in the left hand (the pack, I) and press **1**: you're on. **W** push, **S** stop, **A/D**
carve (in the air, spin), **Space** held crouches — let go to ollie (held going down a ramp, it pumps), **E** + a
direction a flip (E twice quickly, its double), **R** + a direction a grab (held), **F** + a direction at a rail, a ledge
or a coping a grind (at a coping going up slowly, a lip trick; at a wall in the air, a wallride), **W then S** quickly a
manual (**S then W** a nose manual), **Q** just after landing in a ramp the revert, **X** (or 1) off. Regular or goofy:
the avatar editor's body tab. Your best combo is kept in this browser.

## Where we are, from the code

- **There's no skateboard.** Nothing in the world rolls under your feet. The only "skating" is the walker sliding on
  ice (`move.test.ts`: "skates on for metres on ice").
- **The walker has more than one way to move.** `shared/move/step.ts` steps one body, and the water's swim and wade
  (plan 66, `move/swim.ts`) is a mode of that body: pure, deterministic, the same step on both ends, on Jolt
  (plan 50). A board ridden is the same kind of thing: you're still the walker, standing on something that rolls.
- **The world already knows its rails, ledges and walls.** Flowmotion (plan 56, `move/flow.ts` `FlowWorld`) asks the
  world for `rail()` (nearest point on its top, its direction, how far to each end), `wall()` (face normal, top, can
  it be run) and `pole()`; ledges are the collider's own tops (`physics/flow.ts` `GroundsFlow`). Grinds, slides,
  wallrides and lip tricks are those same questions asked from a board.
- **The bike's shared trick code** (`bike/tricks.ts`): a trick is a timed move, its length by skill, finished or not
  when you land; `landingOf()` judges a landing as clean, shaky or a fall by the heading against the velocity, the
  nose up or down, and the drop. A board's landing is the same question.
- **Things you carry.** The pack (plan 86, eight pockets, items drawn from 3D), the left hand (plan 87, key 1),
  quick slots 2–5, `Player.held` (`held.ts`; `features/held.ts` clears kinds it doesn't know, [held-sweep-clears-unknown]),
  saves through the API's `Survivor::STACKS` ([api-item-whitelist]).
- **The body.** Plan 58's 29-joint rig with foot lock and ragdoll falls, plan 77's gait numbers, plan 78's hands and
  grips, plan 100's pose rules. The bike (plan 101) put feet on pedals and hands on grips procedurally; the board does
  the same with feet on the deck.
- **The pipeline for models.** `tools/art/cars/` and `tools/art/bikes/` (scripted Blender, GLBs near/mid/far, named
  pivots, a `manifest.json` of the measures, `check_glb.py`). Furniture is native 3D at true scale with its own kit
  (plans 67–68), buildable indoors and out, and in God mode (plan 53).
- **There's a bowl.** The Kart Park's battle bowl (plan 46, `kart/bowl.ts`): a flat floor with banked walls up to a
  rim, in the woods north of the county road. Built for karts, not for a board.
- **The world is winter** (plan 65): snow over a green base, ploughed roads and paths, slush, black ice, deep snow off
  the paths. A skateboard doesn't roll on snow.

## The reference — the Tony Hawk's series

What it's known for, game by game (mechanics only; nothing of its levels, skaters or art is copied):

- **Pro Skater (1999)**: the ollie (hold to crouch, let go to pop), flip tricks and grab tricks on their buttons with a
  direction, grinds by direction on a rail, spins in the air, the special meter filled by landing tricks, two-minute
  runs.
- **Pro Skater 2**: the **manual** (up then down, a balance on two wheels on flat ground), which links tricks between
  ramps and rails. More grinds and lip tricks. The park editor.
- **Pro Skater 3**: the **revert** (a button on landing in a quarter-pipe, switching to fakie), which links vert to the
  manual, so a combo never has to end.
- **Pro Skater 4 / Underground**: the spine transfer, wallplants, getting off the board and walking (the caveman back
  on), a free-roaming world.

**The scoring.** Every trick has base points. A **combo** is the tricks linked without touching down cleanly in
between (a manual or a grind keeps it going). It scores the sum × the number of tricks in it. The same trick again in
one combo is worth less each time. Spins (180, 360, 540) and switch stance add to a trick. A **balance meter** shows on
grinds and manuals: a needle drifts and you hold it centred; if it reaches the end, you bail. **Bail** and the
combo's points are lost.

**The feel.** Arcade and forgiving. Rails snap you on within reach. A quarter-pipe sends you straight up and back
down into it (the game takes away the speed that would carry you off the lip). Landings are forgiven well past what's
real. Speed builds by pumping down the ramps. Ollies are big, airs are huge.

**The animation, what makes it read as skating:**
- the stance: sideways on the deck, front foot over the front bolts, back foot on the tail; regular (left foot
  forward) or goofy;
- pushing: the back foot off, kicked along the ground, back on the tail;
- the ollie: a crouch, the tail popped, the front foot sliding up the grip to level the board; knees up in the air;
  a crouch on landing;
- flips: the board turns under the feet (kicked by the toe or heel), the feet catch it and stamp it down;
- grabs: the knees up, a hand to the board (which hand and where gives the name), held as long as the button is;
- grinds: the trucks or the deck on the rail, arms out, the body leaning to the balance;
- turning: the body leans, the board tilts on its trucks and carves;
- the board stays under the feet through spins: they turn together;
- bails: the board shoots off, the body tumbles or slides.

## The idea

**A board you carry in your pack, drop and ride anywhere it's hard underfoot.** Quicker than walking, a little slower
than a bike. You link tricks off the town's kerbs, benches, stair rails and ledges, and somewhere to skate in winter,
with ramps. **Tony Hawk's rules, the whole of them** (F2b): huge airs, the moon's gravity in the air, snapping on to rails,
landings forgiven, combos that score, a balance meter on grinds and manuals. The same feel on the street as in the
park. **The snow counts**: ploughed ground and indoors ride; packed snow drags; deep snow stops the board dead and
throws you. **Made in Blender** at the bikes' quality, late 80s / early 90s like the rest of the world, the brands
invented. **The skater is the real body**: feet on the deck, a hand on the board for a grab, arms out on a rail.

## Forks — decided 2026-11-18 (asked one by one)

| # | Question | Options | Decided |
| --- | --- | --- | --- |
| F1 | How it's built | **a)** a mode of the walker, as the swim is: its own board step on Jolt's queries. It follows the surface's normal (slopes, quarter-pipes, vert), snaps to rails, ledges and coping (Flowmotion's `rail()`/`wall()` + the park pieces' lines), the same step on both ends; the board an item, its state on the move message · **b)** a vehicle, as the bike is (`CarKind` on Jolt's wheeled constraint): owning, parking and the wire for free, but a vehicle constraint can't grind, stall on coping or ride a vert wall || **a** |
| F2 | The feel | **a)** Tony Hawk's rules at pro heights: an ollie ≈ 0.9 m, vert airs up to ≈ 3 m, rails snap on within reach, landings forgiven to ≈ 35°, a quarter-pipe sends you up and back in · **b)** Tony Hawk's whole: huge airs, the moon's gravity, everything forgiven · **c)** real (as the Skate games): an ollie ≈ 0.5 m, landings exact, rails not snapped || **b**: the whole of Tony Hawk's, huge airs and moon gravity, everywhere alike (street, park, hall: one feel) (the user, 2026-11-18) |
| F3 | Controls | **a)** Tony Hawk's buttons on keys, the mouse still the camera: W push (held keeps pushing), S slow/stop, A/D carve, and in the air spin; **Space** held crouches, let go ollies; **E** + direction a flip; **R** + direction a grab (held, held longer); **F** + direction a grind or slide on a rail (at the coping a lip trick); W then S quickly a manual, S then W a nose manual; **Q** on landing a revert; **X** off the board · **b)** fewer: one trick key + direction, as the bike's E; the board picks flip, grab or grind by where you are · **c)** a gamepad first, keys second || **a** |
| F4 | The tricks | **a)** Pro Skater 2–3's core, about 35: 8 flips (kickflip, heelflip, pop shove-it, impossible, varial, hardflip, 360 flip, inward heel), double-tapped for the doubles; 8 grabs (indy, melon, method, nosegrab, tailgrab, stalefish, japan, airwalk); 11 grinds and slides (50-50, 5-0, nosegrind, crooked, smith, feeble, boardslide, lipslide, tailslide, noseslide, bluntslide); manual and nose manual; 4 lip tricks (rock to fakie, axle stall, nose stall, handplant); the revert; the wallride · **b)** Pro Skater 1's, about 16: no manual, no revert, no lip tricks · **c)** (a) plus 4 / Underground's: spine transfer, wallplant, the caveman, special tricks on a full special meter || **a** |
| F5 | Score | **a)** Tony Hawk's combos: each trick's points, spins and switch added, the combo × its trick count, repeats worth less, the balance meter on grinds and manuals, a bail loses the combo. Shown in the walnut HUD (plan 94's, [ui-look-manuscript-wood]); your best kept, others see your combo's name over you · **b)** no score, as the bike · **c)** (a) plus goals: two-minute sessions, letters to collect, a best-runs board at the park || **a** |
| F6 | Where you skate | **a)** anywhere hard: the ploughed roads and paths, the square, the campus, indoors. The street's spots come from what's there (kerbs, benches, stair rails, ledges, planters, low walls, from Flowmotion's tags and the structure). Plus a skatepark (F7), and park pieces as furniture anyone can build in their lot or God mode: quarter-pipe, half-pipe, mini ramp, fun box, flat and kinked rails, ledge, manual pad, spine · **b)** only at the skatepark · **c)** only the street, no park || **a** |
| F7 | The skatepark | **a)** an indoor hall: a disused warehouse in town, open in every weather, a vert half-pipe, a street course, a small bowl, rails and ledges (ours, no game's layout) · **b)** an outdoor concrete park in town, the snow ploughed out of it, a bowl · **c)** both · **d)** none: the Kart Park's bowl opened to boards, and the furniture pieces || **c**: both, the indoor hall and an outdoor park (the user, 2026-11-18) |
| F8 | Snow and surfaces | **a)** by the ground under the wheels: asphalt and concrete fast, wood fast and loud, paving rough; ploughed snow slows; packed snow drags hard; deep snow stops the board and throws you forward; ice slides sideways and a push slips; wet slows. In the green season (plan 65) everything hard rides · **b)** winter is indoors only: the board doesn't go down outside on snow · **c)** surfaces ignored || **a** |
| F9 | The boards | **a)** three shapes in Blender, three variants each: an 80s vert deck (wide, shaped, big soft wheels, rails on the bottom), an early-90s street popsicle (narrow, both kicks, small hard wheels), a cruiser (a kicktail, soft wheels, quick on rough ground, worse at flips); invented brands and graphics, the grip, the trucks and wheels in colours · **b)** one popsicle, colours only · **c)** (a) plus a longboard || **a** |
| F10 | Getting one, carrying it | **a)** an item: bought in a shop (a sports page on MOTORS' panel, or a skate shop), kept in the pack or carried in the hand. A key drops it and you're on; X steps off and kicks it up to the hand. It lies where it's left, anyone can pick it up, and it goes back to its owner as things do. Boards to borrow on a rack at the park · **b)** a vehicle, owned and parked like the bike · **c)** always yours, no item: a key puts you on one || **a** |
| F11 | The skater's body | **a)** procedural on the rig, as the bike's rider: feet locked to the deck (front bolts, tail, nose by the trick), push with the back foot, the ollie's pop and front-foot slide, the knees up in the air, a hand to the board for a grab (IK to a point on it), arms out on a rail, leaning to the balance. The board's flips are curves in data; the reference for every pose is the game · **b)** clips keyed in Blender on our rig, fitted by IK at runtime || **a** |
| F12 | Stance | **a)** regular or goofy, picked in the avatar; riding backwards (fakie) and switch counted as the game does (switch adds) · **b)** everyone regular, no switch || **a** |
| F13 | Bails | **a)** Tony Hawk's: a bad landing, the balance meter at its end, a wall at speed, deep snow → the ragdoll (plan 58). The board shoots on as a body and rolls to a stop; you get up and walk to it (or press the key near it). Small slips are a stumble and a step off · **b)** the ragdoll only for big falls, everything else a step off || **a** |
| F14 | The sound | **a)** recorded (CC0, or CC-BY credited in `sources.json`): rolling on asphalt, concrete, wood, paving; the pop; the land; grinds on metal and concrete; slides on wood and paint; the bail; the push. Picked by your ear on `/dev/skate-sound`, as the bike's · **b)** I pick, you veto || **b**: I pick, you veto (the user, 2026-11-18) |
| F15 | Sign-offs | **a)** phase 0's Blender mocks signed off by you, then straight through, you test at the end · **b)** no sign-off, build straight, as plans 101–102 · **c)** a sign-off after each phase || **b**: no sign-off, build straight (the user, 2026-11-18) |

Decided without asking (as the bike, and as the game): **no music** (the game's soundtrack is licensed, ours would
need its own picks, a later plan); **no guns on a board** (hands free for grabs and balance; a hit or a shot throws
you); one rider per board; the camera is the walker's, pulled back and lower behind the board, the mouse still looking
around (plan 56); the client decides and the server takes it (no anticheat, [no-anticheat-for-now]).

## Guardrails

- **Nothing of the Tony Hawk's games copied**: its mechanics and the real skateboarding tricks' names only. No levels,
  skaters, characters, logos, art or music. The hall and the park are our own layouts. No real brands on the boards
  (plan 92 F8).
- **People are never hurt** by a board. A bail is a fall's knock, as now.
- **Every board fits by its measures** (the manifest): deck length and width, the wheelbase, bolts, tail and nose
  points, deck height. No pose made for one board.
- **The board step is pure and deterministic**, tested in Node with exact sim time (headless Chrome runs behind the
  sim's clock, as the bike found).
- **Jolt's limits** (plan 50) counted: a board's queries per frame measured on `pnpm physics`; `forget()`/`letGo()`
  for any wrappers ([jolt-wrapper-cache]).
- **The wire**: no 65th Player field ([colyseus-64-fields]). Board state goes on the move message or into an existing
  field; the board's held kind is exempt from the held sweep ([held-sweep-clears-unknown]); the item goes in
  `Survivor::STACKS` ([api-item-whitelist]).
- **The page budget** measured and raised as needed ([budgets-raise-freely]); the skate's code in its own lazy chunk,
  loaded when a board is first in hand ([page-budget-traps]).
- **memcheck** gets a board's life: on, ride, grind, bail, off, picked up ([car-memory-plan97]).
- Commit on main only; push when asked; no co-author line.

## The phases

0. **The mocks** (Blender, `tools/art/skate/` on the bikes' kit): each board shape and its variants as stills in
   `design/skate/`, a person on it for scale; the park pieces; the indoor hall and the outdoor park (F7c). No sign-off
   (F15b): my check on proportions, yours to look at. The skater's key poses on the
   rig as stills: stance, push, crouch, ollie's pop, a flip's catch, a grab, a 50-50, a boardslide, a manual.
1. **The models for the game**: `build_skate.py` → `public/life/skate/` GLBs near/mid/far + `manifest.json`: the
   deck, both trucks (pivoted on their kingpins for the carve), four wheels (spin), the points (nose, tail, front and
   back bolts, the feet's marks, a hand spot for each grab); the park pieces with their coping and grind lines named,
   so the game finds them without guessing.
2. **The board step** (shared `move/skate.ts`): rolling, pushing and its speed, carving by the trucks' lean, the
   surface's normal followed through transitions, vert (the lip's launch straight up and back in), the ollie (its
   crouch and pop), spins in the air, landings by the shared `landingOf`, bails; grip and drag by the surface (F8).
   Node tests with exact time; a `/dev/skate` bench.
3. **Rails, lips, manuals, walls**: the snap on to rails and ledges (Flowmotion's `rail()`, the park pieces' lines),
   coping for lip tricks, the manual's balance on flat ground, the wallride off `wall()`; the balance meter.
4. **The tricks and the score** (shared): each trick as data, a board curve (flips' rolls and yaws), its body pose,
   its points; the combo judge (sum × count, repeats less, spins and switch); the revert.
5. **The skater**: the procedural body on the board (stance, push, the ollie, the poses per trick, the balance lean,
   the grab's hand), getting on (the board dropped, stepped on) and off (kicked up to the hand), the bail on the
   ragdoll and the board shot off as a body, the get-up.
6. **In the world**: the board as an item (the shop, the pack, the hand, lying where it's left), the street's spots,
   the park pieces as furniture (build, God mode), the skatepark (F7), the wire and playback for others, the combo in
   the walnut HUD.
7. **The sound**: recorded candidates, the defaults picked by me (F14b), yours to change on `/dev/skate-sound`.
8. **Checks**: Node tests of the step and the judge, e2e (on, ride, ollie, grind, bail, off; another browser seeing
   it), memcheck's board life, the page budget, the physics bench, stills.

## Progress

### Phases 2–4 — the board's step (shared `skate/`, 2026-11-18)
- **A mode of the walker's body** (F1a), as the swim: `Body.skate` (`SkateNow`), stepped by `skate/step.ts`
  `stepSkate`, handed in with the park as `MoveEnv.skate` (`skateEnv(park)`) so the code loads only where boards are.
- **The pieces are exact** (`skate/pieces.ts`): a profile of lines and arcs swept along a width or round a centre;
  the board rides it by ℓ along and w across, so a vert wall is as smooth as the flat, the same on every machine. Jolt
  (boxes only) never sees the ramps' curves: walkers get stepped boxes. Twelve kinds in `PIECES`.
- **Tony Hawk's whole** (F2b, `skate/spec.ts`): g 8 m/s² everywhere; ollie 0.75 m tapped, 1.45 m crouched 0.32 s; push
  to 7.6 m/s; a vert lip sends you straight up ×1.22 and back in (fakie, or forwards with a 180); landings forgiven to
  52° sideways and 15 m/s down.
- **Tricks and the combo** (`skate/tricks.ts`, F4a/F5a): 8 flips (E + direction; E again quickly, the double), 8
  grabs (R held: more points held longer), 11 grinds and slides (F; across the rail, a slide), 4 lip tricks, manual
  and nose manual (W→S, S→W), the revert (Q), the wallride. The combo: the sum × the count, the same trick again
  75 %/50 %/25 %/10 %, + 100 a half turn of spin, × 1.2 fakie; a balance needle on grinds, manuals and lips.
- **Rails** are the park's lines and Flowmotion's tagged rails (the town's fences, the parkour rails); followed
  round kinks, off the end into the air.
- **Surfaces** (F8a): `UNDERWHEEL` by footing — asphalt fast, paving and paths rough, packed snow drags, deep snow and
  sand stop the board and throw you, ice: a push barely goes.
- 16 Node tests (`skate/skate.test.ts`).

### Phases 5–7 — in the world (2026-11-18)
- **The wire**: `Player.sk` (62 of 64 fields), the board's code (`skateCode`: mode, trick, fakie, stance, board,
  crouch, push, lean); `SKATE_BAIL` (7) for a moment after a bail, the others' ragdoll.
- **The client** (`apps/client/src/world/skate/`): `ride.ts` (the keys: E R F Q X the board's own, W A S D and Space
  shared with the walker; the park; the events), `pose.ts` (the skater on plan 100's `carStep`: sideways, the push
  with the back foot on the toe side, the crouch, knees up in the air, each grab's hand to its spot, arms out on a
  rail, the manual's lean), `board3d.ts` (the GLB, its hangers turned with the carve, the wheels, the flips about the
  deck's middle; a plain board till it loads), `hud.ts` (the combo and the needle in walnut), `sound.ts`.
- **She stands sideways**: the facing is the nose + 90° (regular) or − 90° (goofy); the camera follows the way it goes.
- **Stance** is in the avatar (`stance`: regular, goofy), the editor's body tab.
- **The board in the pack**: nine items (`board_<variant>`), whitelisted in `Survivor::STACKS`, pictures rendered from
  the GLBs, key 1 from the left hand rides it, `skate:take` at a park's rack, rare in loot.
- **The sound** is made in code for now (F14b): wheels by speed and roughness, the pop, the slap, grinds, a push's
  scuff, a bail. Recordings need your OK to fetch.
