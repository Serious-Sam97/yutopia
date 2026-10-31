# 61 — The sway

What people carry and wear reacts to what they do, on Jolt. A bag swings as you walk, bounces
when you run, lifts when you jump and thumps down when you land, rests on the seat when you sit,
and knocks against a wall instead of going through it. Hair, scarf ends, a tie and a badge do the
same. Planned 2026-10-31.

## Where we are

- **Springs (plan 58 phase 2d, `chars/model.ts` `step`).** Four spring joints exist: `hair`,
  `skirt`, `scarf` and `pack`.
  - Each is one damped spring off its parent. Its tip chases where it would hang, it's kept out of
    a few spheres (the head and the chest), and the bone is turned after it.
  - They react a little to motion, since the tip lags behind the parent.
  - They know nothing else:
    - no gravity of their own beyond a fixed "hang" share;
    - no collision with the legs, the hips, the world, a seat or a car;
    - no impulse from a jump or a landing.
  - The bags (`satchel`, `crossbody`, `tote`, `fannypack`) and the tie and lanyard have no joint at
    all: they're rigid on the spine or the hips.
- **Jolt (plan 50, `packages/shared/src/physics/world.ts`).** It's the world's physics:
  - statics (walls, floors, land, furniture), things that move, vehicles;
  - ragdolls since plan 58 5d (`addRagdoll`: a body per bone, hinge and swing-twist constraints,
    read back as bones).
- **On the client (`tp/physics3d.ts`, `tp/view.ts`):** the physics world is only stepped while
  someone is down on a ragdoll (`limpNow`). My own body moves on it by queries, not by the step.
- **Code size.** `yutopia-chars` is 57.3 of 58 KB. Anything new for this can't go there; it needs a
  chunk of its own.

## The idea

**Dangles.** A dangle is something hung off a person that Jolt swings.

1. **A dangle's shape.** It's one to three dynamic bodies, chained by constraints, hanging from an
   anchor on a bone.
   - **Satchel, crossbody, tote:** a box on a long strap. A swing-twist from the shoulder point, its
     length the strap. It swings fore and aft as you walk, out as you turn, and bounces on a run.
   - **Backpack:** a box held close to the back. A stiff cone (small swing) with a little vertical
     give, so it bounces but doesn't flap.
   - **Ponytail, high ponytail, pigtails, braids:** two or three capsules, swing-twist each.
   - **Scarf ends, a tie, a lanyard's badge:** two light segments each, lying on the chest (they
     collide with it).
   - **Earrings:** a tiny pendulum each, only near.
   - **Long hair, a skirt, a coat's hem:** they keep their springs, since cloth wants many bodies.
     The springs get better inputs instead (item 5).
2. **The anchor and the body proxies.** Each person near gets kinematic bodies, moved every frame
   to where their bones are (`MoveKinematic`, so contacts get the right velocity):
   - the anchor points (a shoulder for the strap, the neck for a scarf, the head for a ponytail);
   - a few capsules for the body (hips, the thighs, the chest, the upper arms).

   A bag then rests against the hip and the thigh, and swings off them as the leg comes forward,
   instead of through it.
3. **Never gameplay.** Two new object layers:
   - `cosmetic`, which meets the statics (solid, land, floor, wall, door) and the proxies;
   - `proxy`, which meets only `cosmetic`.

   So a bag hits a wall, a table or a car seat, but never pushes a person, a car or anything that
   moves, and nothing gameplay ever hits a proxy. It's client-only: each player's screen swings its
   own; nothing is sent over the network.
4. **Read back as bones.** Each dangle's bodies are read back onto joints, as the ragdoll does.
   - The bags, the tie, the badge and the ponytail get joints of their own: `bag`, `tie`, `badge`,
     the `hair` chain. The builders weight their parts to them, as the skirt and the pack are now.
   - The skeleton grows by about six joints. It stays the same at every level of detail (the test).
5. **Events.**
   - **A jump:** the anchors' sudden upward velocity throws the bag down and back. Real inertia,
     no fakes needed.
   - **A landing:** the bag carries on down, hits the thigh proxy, bounces.
   - **A stop from a sprint:** it swings forward past the hip.
   - **Sitting:** the seat is a static. The bag drops onto it, or onto the lap.
   - **A car:** the bag rests in the seat. In first person, my own dangles are hidden.
   - **Going limp:** the proxies follow the ragdoll's bones, so the bag tumbles with them.
   - **Teleports, floor changes, a model swapped:** everything snaps back to hanging, with no
     velocity.
   - The springs that stay (long hair, skirts, coat hems) are given the root's acceleration, so they
     lag and lift in jumps too.
6. **Level of detail and cost.**
   - Jolt dangles for me and the nearest people: about six, within 12 m.
   - Everyone else keeps today's springs, and the bags stay rigid far off.
   - A dangle is swapped in or out at rest, so nothing pops.
   - The physics world is then stepped every frame while anyone has a dangle, not only while someone
     is limp.
   - Budget: under 0.5 ms a frame for six people with a bag and a ponytail each. It's measured
     (plan 58's cost check: 20 people, 1.2 ms for animation) before the step goes on for everyone.
7. **Reduced motion.** Dangles off; everything hangs still.

## Phases

0. **Mock** on `/dev/anim`: one person with a satchel and a ponytail, today's springs beside the
   Jolt dangles. Walk, run, sprint, jump, a high fall, landing, stopping, turning back, sitting,
   standing up. Clips and a reel for sign-off on the feel.
1. **Physics** (`packages/shared/src/physics`):
   - the `cosmetic` and `proxy` layers;
   - `addDangle` (an anchor, a chain of bodies, its constraints), `moveProxies`, `dangleParts`,
     `removeDangle`;
   - the sizes' room for them.

   Tests:
   - a pendulum swings and settles;
   - a jump throws it and a landing bounces it;
   - it never pushes a character or a vehicle;
   - a static stops it;
   - a soak of 20 people for a minute: no leaks, no NaNs.
2. **The rig.** The new joints (`bag`, `tie`, `badge`, the ponytail's chain), and the builders
   weighting the bags, the tie, the badge and the tails to them. The skeleton and baking tests are
   extended to cover them.
3. **The driver** (client, its own lazy chunk, `yutopia-sway`, loaded with the 3D view's physics):
   - which people are near;
   - their proxies and anchors moved each frame;
   - the dangles made, stepped and read back;
   - swapped with the springs by distance;
   - reset on a teleport.

   The physics stepped every frame while it runs.
4. **The things:**
   - the four bags;
   - the backpack;
   - the ponytails, pigtails and braids;
   - the scarf's ends, the tie, the badge;
   - earrings (near only).

   Each one is a recipe: bodies, sizes, masses, joint limits, damping.
5. **Events and the springs that stay:**
   - sitting, cars, first person, going limp, teleports;
   - the root's acceleration fed to the remaining springs.
6. **Checks:**
   - the cost at 6 and at 20 people;
   - the page and chunk budgets;
   - the anim sheet;
   - e2e in the world with two browsers (each sees the other's bag swing);
   - nothing gameplay changes (the move tests and plan 50's checks).

## Phase 0, the mock (built and signed off 2026-10-31)

`/dev/anim?sway=1`, or the bench's "sway (S)" button:
- She wears a satchel and a ponytail, or whatever the query asks for.
- On the left they swing on Jolt; on the right, the same moves on today's springs. The satchel is
  rigid there, as it is in the world today.
- The sway's own Jolt world takes the clip's ground (ledges, drops), its things (the seat) and its
  solids.
- The loop coming round, or a seek, puts everything back to hanging.

The reel and sheets are in `design/sway` (`e2e/sway-reel.mts`, `e2e/sway-look.mts`).

What it taught, folded into the design:
- **No ropes, and the pivot low.** A bag on two rope ends from the top of the back swung right over
  her head at the start of a jog:
  - the move core gets to a run in about 0.2 s, about 2 g;
  - a free pendulum overshoots to twice that angle.
  
  Each dangle is now one six-way joint (`SixDOFConstraint`):
  - its x along the hang;
  - swung no further than a limit fore and aft and a smaller one out, twisted a little;
  - friction in the joint.

  The satchel hangs from where its strap leaves the body above it, at the waist, not the shoulder.
- **The strap's slack is short and stiff:**
  - The bag may rise 6 cm up its strap: it lifts in a jump's fall, since the game's gravity is about
    2.6 g.
  - It stops on a 14 Hz spring. At 4 Hz, a jump's take-off left it 30 cm behind.
- **One joint for every extra.** A look wears one extra, so a satchel, a backpack, a scarf and a tie
  never meet. The satchel swings on the backpack's `pack` joint, set at the bag's middle; its lower
  strap is weighted to the joint. Phase 2 needs fewer new joints than planned: perhaps only the
  ponytail's chain.
- **Its world must be the clip's.** On a flat world under a 4 m drop, the bag caught on the land and
  was dragged behind her.
- **Squeezed, it can still jump.** A bag caught between a moving leg and a static (the seat as she
  stands up) gets a hard shove. Its joint now holds it, so it no longer flies; phase 5 looks at
  sitting again.

The physics:
- `addProxies`, `moveProxies`, `addDangle`, `moveDangle`, `dangleParts`, `removeDangle` in
  `shared/physics/world.ts`.
- Three new object layers: `cosmetic`, `proxy`, and the anchor's, which meets nothing.
- Tests in `dangle.test.ts`:
  - a swing that settles;
  - a jump's lift and the landing's thump;
  - a stand-in holding the bag off it and knocking it;
  - a wall stopping it;
  - a ball passing through it;
  - nothing left behind.

The driver: `world/sway/sway.ts`. It's only on the dev page so far, so the main page is unchanged
at 420.6 KB. `yutopia-chars` is 57.5 of 58 KB: the satchel's strap spec and `PersonModel.worn` /
`step(skip)`. Phase 2's joints will need room or a budget call.

## Phases 1–6 (built 2026-10-31)

1. **The physics.**
   - `sizesFor` takes `worn`: the client's world keeps room for 7 × 16 bodies.
   - Each dangle is a single six-way joint. Its swing limits are a pyramid's, so they can differ each
     way: a thing lying on the body swings `back` into it less than forward. A test checks the
     direction.
   - The soak test runs 20 people for a minute. There are no NaNs, the body count holds, and Jolt's
     heap is flat once its contact caches have grown. It costs about 0.6 ms a step for all 20.
2. **The rig.**
   - Each builder records what swings as a `HangSpec`: its joint, its kind, where it hangs from, its
     middle, and its shape (a box, or a rod).
   - Since a look wears one extra, every bag, the backpack and the badge share `pack`.
   - The tie (the extra, or a shirt-and-tie top) hangs on `scarf`. A scarf worn over it wins.
   - The ponytail stays one rod on `hair`. The chain planned for it wasn't needed.
   - The only new joints are `earL` and `earR` on the head, for the earrings: 31 joints.
3. **The driver**, `world/sway`, its own chunk `yutopia-sway` (4.6 KB), loaded once the 3D view's
   physics is in.
   - `SwayHub` picks me and the six nearest within 12 m of the camera. Someone already swinging is
     kept until they're 14 m off.
   - Each gets a `Sway`, which moves the stand-ins and anchors in the world's coordinates (the scene's
     less the floor's frame) and reads the bones back.
   - The world is stepped every frame while anything swings.
   - `Person3D` gives each person's distance (never, with reduced motion or plan 58 off), and its
     springs skip the swung joints.
   - If someone is put more than 1 m away, or the floor seen changes, everything goes back to hanging.
4. **The things.** One recipe each, in `sway.ts`: satchel, crossbody, tote, fannypack, backpack,
   badge, tie, scarf, tail (ponytail, high ponytail, pigtails, braids) and earring.
   - What lies on the chest (the badge, the tie, the scarf) never meets the chest's stand-ins or the
     upper arms: an arm swinging through flung the light badge.
   - The fannypack sits inside the waist's stand-ins, so it never meets them; only its limits hold it.
5. **Events.**
   - First person: my body is hidden, so nothing of mine swings.
   - Going limp: the stand-ins follow the ragdoll's bones, and the bag tumbles with it.
   - Teleports and floor changes: everything goes back to hanging.
   - Cars and karts draw their own driver models, so the bag stays as built, in the seat.
   - The springs that stay (long hair, skirts, coat hems) already lag the body's moves: they run in
     the world's space, so a jump's fall lifts them.
   - Sitting: in the mock the bag rests by the seat, and its joint holds it when she stands.
6. **Checks.**
   - Cost: 0.24 ms a frame for 7 swinging (p99 0.39), 0.28 after the quality pass. With 20 near,
     it's capped at 7.
     Measured with `e2e/sway-cost.mts`.
   - Budgets: the page is unchanged at 420.6 KB. `yutopia-chars` is 58.0 of 58 KB: nothing more fits
     there without a call.
   - `e2e/sway.spec.ts`, two browsers: Ana in a satchel and a ponytail runs and jumps. On her screen
     and on Bia's, her `pack` and `hair` swing on Jolt, with no NaN and no page errors.
   - Plan 50's `pnpm physics` passes with its hashes unchanged. The move e2e (`move-others`,
     `moves-seen`, `down`) is green.
   - Reels are in `design/sway`: `0-reel.mp4` (the moves) and `1-items.mp4` (each thing).

## The quality pass (2026-10-31)

The user's look: the swing's strength was right; the quality wasn't. The tie broke up as it swung.
Each item was looked at close, frame by frame, running and jumping and at rest.

- **The tie swings whole.**
  - Its blade was weighted to the joint along a soft blend below the knot, so as it swung it bent into
    an S and kinked under the knot.
  - A tie is stiff: the blade is now on the joint whole, from just under the knot.
  - It stands a little further off the shirt (1.1 cm at head height, was 0.5) so the belly's own bend
    never meets it.
- **What lies on the body lies there.**
  - The tie, the badge, the scarf's ends, the backpack and the fannypack were let hang by gravity:
    plumb off a sloped chest, a backpack 11° off the back.
  - They now have a rest spring: Jolt's six-way joint's position motors, `rest` Hz, drawing them back
    to lie as they were built. A run or a jump still swings them.
  - The backpack swings at most 0.06 off the back and 0.02 into it, held by its straps.
- **Never through the body as drawn.**
  - On a quickly turned anchor (a chest pitching 0.3 rad at 3 Hz in a run), Jolt holds a swing limit
    a frame or two late: a light badge went 0.2 rad, about 5 cm, into the shirt.
  - More solver iterations didn't help, and doubled the cost. Jolt's sub-steps did (4: 0.04 rad), at
    0.85–1.1 ms for seven people.
  - So the drawn bone is turned back within its fore-and-aft limits, about where it hangs from (cheap,
    the picture only).
  - Measured as drawn through a jog and a jump: the badge and the tie 0..0.7, the scarf −0.02..0.6,
    the backpack −0.06..0: each in its limits.
- **The arms and hands are stand-ins too**, forearms and hands added (16 in all), so a bag at the hip
  is knocked by the hand instead of the fist going through it.
  - What lies on the chest, and the earrings, meet none of the stand-ins: the chest it lies on, the
    arms swinging past, a knee tucked up in a jump all pressed it into the shirt or flung it.
  - The fannypack sits inside the waist's stand-ins and meets none of the trunk's, the forearms or
    the hands.
- **The tote** is heavier (2 kg) and more damped (0.25 N·m), with less out (0.15): the arm's swing
  knocks it, never flings it.
- **The badge** stands 0.45 cm further off the chest, twists less (0.2) and swings out less (0.3): as
  the trunk twists under the chest it hangs from, it stays clear.
- **The satchel's strap** follows the bag over a longer stretch (from 0.62 of the trunk, was 0.45),
  so it no longer kinks where it meets the bag.
- The patterns (plaid, stripes…) are drawn off each cloth's rest place, so a swinging thing's pattern
  goes with it.

Checks:
- tests: client 88, shared 454 (a rest spring holds a thing as it was built);
- the two-browser e2e passes;
- the cost: 0.28 ms for seven (p99 0.45);
- `yutopia-sway` 5.0 KB, `yutopia-chars` 58.0 of 58, the page 420.6.

Stills are in `design/sway` (`2-*.png`); `1-items.mp4` is made again.

## Decided (2026-10-31)

- **Everything on the list dangles:**
  - the four bags and the backpack;
  - the ponytails, pigtails and braids;
  - the scarf's ends, the tie, the badge;
  - earrings, near only.

  Long hair, skirts and coat hems keep their springs, fed the root's acceleration.
- **Me and about six nearest people** within 12 m; the rest on springs.
- **A bag may push things in the world.** Today there's nothing loose to push: furniture, cups and
  the rest are statics, and Jolt's only loose bodies are the test balls (`addThing`, plan 50 F). So
  it's its own phase, last:
  7. **Things that move:**
     - Some props become loose bodies: a cup, a can, a book, a chair, a cone.
     - The server owns them: where each one is, and who last touched it.
     - A dangle on the `cosmetic` layer meets them, and a hit is sent as a nudge, an impulse the
       server applies and passes on.
     - The client predicts it and the server corrects it, as cars are today.
     - Guardrails: a bag's push is capped (no launching a chair); a prop at rest sleeps; a prop
       that's knocked over stays so, synced, until someone puts it back.

     This is new gameplay state, so it gets its own plan once phases 0–6 are signed off.
