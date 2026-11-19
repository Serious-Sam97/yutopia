# Plan 108 — through the skate park's floor after a jump

Asked 2026-11-19, after plan 107's fix:

> When i jump with skate, for example now happens with the skatepark, i pass thought the ground. Randomly

Status: **fixed 2026-11-19.**

## Why

Plan 107 fixed one way through (landing on bare ground inside a corner ramp's plan box). Random rides found the
other: over a park the air is our own free fall (Jolt's mover isn't used there: the ramps' stepped boxes would catch
the board), and that free fall only looked for a ramp's surface *below* her. Flying into a ramp's side (a hip's, a
quarter's, a box's) below its top put her inside the ramp's body: its surface was above her, so there was nothing to
land on, no wall to stop her, and no floor under it. She fell through the ramp and the floor, and once under the
ground the mover can't lift her back.

## Now (`packages/shared/src/skate/step.ts`, `pieces.ts`)

- In the air, a ramp's side is a wall. Flying into it, she's put back out and the way in is stopped (a little
  bounce). A low edge (under 0.3 m above her) on the way down is landed on instead. Already inside one by some other
  way, she's lifted up onto it.
- Over the park she can never go below the floor the ramps stand on (`SkatePark.baseAt`, the lowest ramp's foot
  there): she lands on it.

## Checks

`park-falls.test.ts`: random rides over both town parks (random start, heading, speed, steering, pushes, pops, spins)
on a mover like Jolt's over the floor (it can't lift a body that's under it). Before the fix 17 rides in 300 went under
the floor; after, none in 3,000 (`RUNS=1500`), and none rides in the air inside a ramp's body. In the game, 16 random
rides with jumps in the hall and the yard: never below the floor. The skate's Node tests (36), tsc.
