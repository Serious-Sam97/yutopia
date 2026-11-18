# Plan 105 — the skate's feedback, round 1

Asked 2026-11-18 after plan 104 (three at a time):

> 1- O skate ainda anda via diagonal quando tu muda a camera
> 2- O skate e o char se mantem reto mesmo indo em uma rampa, quando claramente o mesmo deveria mudar o angulo junto
> (Pensar uma forma natural de fazer)
> 3- Andar de skate faz barulho de pegadas tambem

Status: **planned, decided and built 2026-11-18** (point 1: the camera was changed by moving the mouse to look; point 2:
Tony Hawk's air tilt). Built: see Progress.

## What's wrong, from the code (each measured in the browser)

1. **Diagonal after looking with the mouse.**
   - While riding, the board, her body and the skate camera stay together: the nose against the way it rolls is 0°,
     the body against the nose 0°, the camera against the way it rolls 0°, through Y, a drag and a turned view.
   - The mouse is ignored on a board: the skate camera (a game camera) overrides the view, so looking moves nothing.
   - **Getting on:** looking around with the mouse turns the camera, not her body. Getting on (`startSkate`) rolls
     along her body's facing, which can be anywhere against where you're looking. The board sets off diagonal on the
     screen, then the camera swings round behind it.
2. **No tilt on ramps.**
   - The step's normal is right: on the yard's quarter it goes from flat to 63°.
   - Person3D tips her root to it (`tipped=true`, right after `update` the root has the tilt).
   - Then the view calls `seats.rideSeat(p3.root)` for every person, and its first line zeroes any tilt every frame
     ("the person sets only its heading each frame"). She's drawn upright on every ramp.
   - Also: on the town's own ground the normal is always straight up (a hill, a kerb's ramp: no lean), the tilt
     snaps at a kink (the flat onto a kicker), and in the air it stays the take-off's.
3. **Footsteps on a board.**
   - The walk's locomotion still runs under the skate clip (she's moving), and its feet put down fire `onStep`.
   - Steps by the way gone (off screen, first person) do too: mine (`Steps.myStep`, `feet.ok`) and others'
     (`Footfalls.moving`).

## What it'll be

1. **The way you look is the way you go.**
   - Getting on: the board turned to where the camera looks (third person: the view's heading), so it rolls straight
     away from you.
   - Riding: the mouse looks around Tony Hawk's way — the skate camera turned off its heading by the mouse (up to
     ±70°), easing back behind the board when you let it be (~1 s); never moving the board.
2. **Tilted with what she rides.**
   - `rideSeat` leaves a skater's tilt alone.
   - The drawn tilt eased to the surface (a quarter turn in ~0.1 s: no snap at a kink).
   - The town's slopes lean her too (the land's slope along the board, from the step).
   - In the air (Tony Hawk's, ~5° a frame): she comes upright off a street ramp; on the way down she turns to meet the
     face she's landing on (the park's surface under her, within ~1.5 m).
3. **No footsteps on a board.** `onStep` skipped for a skater, mine and others'; the steps by the way gone too. The
   board's own sound is the only one.

Checks: the tilt measured on the yard's quarter (the drawn up against the step's normal, ≤ 10° once eased), the
direction e2e with a turned view before getting on, no footstep while riding (the steps' counter), the Node tests.

## Progress (2026-11-18, built)

- **1**: getting on turns the board to the camera's heading (checked: the view turned 0.9 rad off her body, the nose
  set off along the view exactly); the mouse looks round on a board (the skate camera turned off its heading up to
  ±70°, back behind it after 0.6 s still); the board never follows it. The direction e2e: nose 0.0°, body 1.0° (was
  6.8°), camera 28°.
- **2**: `rideSeat` skips a skater; the drawn up eased to the surface (on the yard's quarter: drawn 0.85 up against the
  step's 0.78, a frame or two behind); the land's slopes lean her; in the air she comes upright ~5° a frame and turns
  to the face below within 1.5 m.
- **3**: no `onStep` for a skater (mine and others'), no steps by the way gone (`feet.ok`, `Footfalls.moving`):
  0 steps in a ride up the quarter.
- Node: the skate's 19, the client's pose 6.
