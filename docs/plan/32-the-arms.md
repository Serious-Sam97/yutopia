# The arms — guns that feel like guns (plan — proposed 2026-10-21)

> Follows `30-the-dark.md` (D6: you aim, the server decides) and `29-the-move.md`
> (aim, the bladed stance). Workflow rule: mocks first (phase 0), approved before
> any code; **the feel is signed off (phase 5)**.

Ask (2026-10-21): "Let's improve the weapon handling and make a better quality.
And also make better models of the current ones."

## Where we are

- **The numbers** (`shared/dark/arms.ts` `ARMS`, `shared/inventory.ts` `WEAPONS`):
  the revolver (6 rounds, 50 a hit, 40 tiles, 0.42 s a shot); the shotgun (2
  shells, 8 pellets × 18, 14 tiles). Spread is a constant; damage is flat to the
  end of the range; one body column, no head.
- **The server** (`world-server/features/arms.ts`): checks the hand, the rate, the
  muzzle, rewinds the targets, casts the pellets (`pellets(seed)`, the same on
  both sides). A reload is a round at a time; a shot stops it. Drawing is instant.
- **My side** (`client/world/dark/arms.ts`): fire through the crosshair from the
  hand, the flash and tracers at once, a rumble, the sound. **No kick, no sway,
  no zoom, no animation**: the gun is perfectly still from the first shot to the
  last, a reload is only a spinning HUD ring and a tick.
- **The models** — three of them, all different:
  - held (`tp/person3d.ts` `gunFrame`): **three boxes** a gun;
  - on the snow (`tp/items3d.ts`): seven primitives;
  - the HUD: CSS.
  - **The shotgun is two guns**: 2 shells and "the barrels" when held (a
    double-barrel), a tube magazine and a pump sound on the snow.
- **The effects** (`tp/arms3d.ts`): a 50 ms glow sprite, 90 ms line tracers that
  go **through walls** on screen (the server stops the hit, the line doesn't),
  four sparks, a crosshair ring that changes colour.
- **First person** (`tp/hands1p.ts`): the arms come up with the gun to the side,
  under the crosshair. Nothing lines up with the sights.

## Decided (2026-10-21)

| Question | Answer |
| --- | --- |
| The shotgun | **A double-barrel** (break-action), 2 shells. The pump goes. |
| How far the handling goes | **The full pass**: kick, spread that blooms and settles, zoom, animations, brass, hit feedback |
| The rules | **Shotgun falloff** and **head hits** |
| Aiming in first person | **Down the sights**, with a small zoom |

## The idea

**Every shot costs something you can see and feel.** The gun kicks up and you
bring it back down; fire fast or on the run and the shots open up, stand still
and crouch and they close in; the crosshair shows it. Each gun has a body that
works: the revolver's cylinder turns and its hammer falls, the double-barrel
breaks open and throws its empties into the snow. A hit you hear before you see it.

## The guns

### The revolver — a single-action .38, loading gate

One round at a time already fits a **loading gate** (the Colt SAA kind): open
the gate, punch out a spent case, thumb a round in, turn a notch. So the model
and the reload agree with the rules we have.

- **Model**: a long barrel with a crowned muzzle and a blade front sight; the
  ejector rod's housing under it; a **fluted cylinder with six chambers you can
  see** (brass in the full ones); the frame from a bevelled side profile; the
  hammer (moves), the trigger (moves) and its guard; walnut grip panels with a
  screw; the rear sight a notch in the frame.
- **Moves**: a shot: the hammer falls, the cylinder turns 60°, the muzzle
  climbs. A reload: the gate swings open, the cylinder turns a notch per round,
  a spent case drops for each one loaded.

### The double-barrel — side by side, 12 gauge

- **Model**: two barrels side by side with a rib between them and a bead at
  the muzzle; the action and its hinge pin; the top lever (moves); two triggers
  in a guard; a splinter fore-end; a stock with a pistol grip, a cheek line and
  a rubber butt pad. Walnut, blued steel worn bright at the edges.
- **Moves**: a shot: one barrel, then the other (left, right). A reload: the
  top lever over, **the barrels drop open**, the fired shells kick out, shells
  go in one at a time, it snaps shut.
- **Rules** (shared + server):
  - open 0.3 s, then 0.45 s a shell, then shut 0.25 s;
  - a shot while it's open snaps it shut first (0.2 s) if a shell is in;
  - only the fired shells eject (a live one stays).
- **Sounds**: the pump goes. New: the break, the shell in, the snap shut.

### One model, three sizes (`tp/guns3d.ts`, new)

One builder per gun, used everywhere so they can't drift apart again:

| Where | Detail | Moving parts |
| --- | --- | --- |
| My hands in first person (close) | full: bevelled profiles (`ExtrudeGeometry`), turned barrels and cylinder (`LatheGeometry`), sights, screws, worn edges in the vertex colours | all |
| Others' hands, my hands in third person | medium: the same shapes, fewer segments | hammer, cylinder, barrels |
| On the snow (`items3d.ts`) | medium, static | — |

Vertex-coloured like `items3d.ts`, the shared materials (`mats.prop`) — **no new
lights and no new material kinds** (a lit material compiled late stalls a frame;
memory: a shadow light with no map breaks every lit draw on High).

## The handling (my side, `dark/arms.ts`, `tp/view.ts`, `tp/hands1p.ts`)

- **Kick**: the camera's pitch jumps up and a little sideways (seeded, so it
  doesn't feel random), then recovers about two-thirds of it in ~0.25 s; you pull
  down for the rest. The revolver kicks small and settles fast; the double-barrel
  kicks hard. The gun in the hands kicks back and up with it (its own spring,
  separate from the camera's).
- **Spread you can read**: a bloom that grows with each shot and with moving,
  sprinting or falling; shrinks when you stand still; tighter crouched and fully
  aimed. **The crosshair is four ticks that open and close with it** (not the ring).
- **Aiming**:
  - **First person, down the sights**: aiming brings the gun up to the eye; the
    revolver's front blade sits in the frame's notch, the double-barrel's bead on
    its rib. A small zoom (62° → 50°); the crosshair hides once the sights are up.
  - **Third person**: the over-the-shoulder camera comes in a touch closer and
    zooms a little (50° → 44°).
  - Coming up to aim takes 0.18 s (revolver) / 0.26 s (double-barrel). Firing
    before you're fully up is allowed, wider.
- **Sway**: a slow figure-eight from breathing (already in `aimPose`'s breath),
  more after a sprint (`MV_WINDED`), less crouched; the gun trails the mouse a
  little (`hands1p` LAG, tuned per gun); a step bob while walking.
- **Drawing and putting away**: 0.35 s up from the hip, 0.25 s down; you can't
  fire until it's up (server-checked too). Switching weapons is put-away + draw.
- **A click that's slightly early still counts**: one click within 120 ms of the
  gun being ready is held and fired when it is (no more dead clicks between shots).
- **The pad**: the same kick, a rumble shaped per gun (a sharp hit for the
  revolver, a long thump for the double-barrel), RT's trigger weight unchanged.

## The rules (shared `dark/arms.ts`, server `features/arms.ts`)

All in shared functions the server and the shooter both call, as `pellets()` is now.

- **Spread** — `spreadOf(gun, bloom, stance)`:
  - the server keeps each hand's bloom from **its own** shot times and the
    player's `mv` (moving, crouched, aiming, winded);
  - it uses that, not the client's figure, and puts the spread it used in
    `arms:shot`, so others' tracers match;
  - the shooter predicts the same; a small difference only moves a tracer.
- **Falloff** — `damageAt(gun, t)`: the double-barrel's pellets do full damage to
  5 tiles, then less down to 40% at 14. The revolver stays flat (it's the
  precise one).
- **Head hits** — `rayMeets` also reports **where up the body** the ray went
  in:
  - the top 0.3 of the 1.8 (scaled down for one crouched) is the head:
    **×1.5**, on the shadowed and on us;
  - the crosshair and the sound tell you (`arms:hit` kind `head`);
  - the shadowed's shroud still decides whether it's hurt at all.
- **Draw time** and **the double-barrel's reload phases** as above, on the server.
- **What others see**:
  - `Player.arm`, one small field: idle, drawing, reloading, open, aiming-up;
  - others' bodies play the same draw and reload and the same kick (from
    `arms:shot`);
  - a few bytes when it changes, nothing otherwise.

## The show (`tp/arms3d.ts`, `dark/synth.ts`)

- **Muzzle**: a star-shaped flash (crossed quads, random roll) instead of one
  round glow, longer and wider for the double-barrel; a smoke puff that drifts
  and fades over a second; a moment's pool of warm light on the snow under it,
  through the ground lamps' pool the flares already use (not a real light).
- **Brass**: spent cases and shells fly out, bounce once on the ground's
  height, and lie for 8 s (a pool of 24, the oldest go).
- **Tracers**:
  - a short bright streak that travels (not a line from muzzle to target);
  - **stopped at the first wall or trunk** the client knows of (the same grid
    the server checks), so you see where it really went;
  - a little snow or splinter puff where a miss lands.
- **Hits**:
  - a tick in the ear for a hit, a deeper one for the head, a thud for a kill;
  - the crosshair's ticks flash (white, gold for the head, red for a kill);
  - a hit on one of us: a short dark spray.
- **Sounds**: the revolver's hammer cock and gate; the double-barrel's break,
  the shell in, the snap shut, the two triggers; the shot's tail shorter indoors
  (`room()` vs `outdoors()` already exist).

## Phases

| # | Phase | Needs | Exit test |
| --- | --- | --- | --- |
| 0 | **Mocks**: stills of both guns (on the snow, held in 3P, 1P at the hip, 1P down the sights) and a sheet of the crosshair's states and the HUD's double-barrel | — | **you approve** |
| 1 | **The models**: `guns3d.ts`, both guns in three sizes, moving parts named; `person3d`, `items3d`, `hands1p` on it | 0 | stills match the mocks; the page budget holds |
| 2 | **The handling** (client only): kick, sway, bob, zoom, down the sights in 1P, draw / put away / reload animations, the early click, the crosshair ticks | 1 | firing on a range: kick recovers, sights line up with the crosshair's point in 1P and 3P (a shot at a mark lands on it) |
| 3 | **The rules** (shared + server): bloom, falloff, head hits, draw time, the double-barrel's reload; `Player.arm` | — (beside 1–2) | `arms.test.ts`: the head ×1.5; a pellet at 14 does 40%; no shot before it's drawn; a shot while open closes it; the server's spread is used, not the client's |
| 4 | **The show**: flash, smoke, brass, travelling tracers stopped at walls, impacts, hit sounds, the new synth sounds; others see your draw, kick and reload | 1, 3 | GPU e2e: two browsers, A reloads and fires, B sees it; no frame over budget with 24 brass and 8 flares out |
| 5 | **The checks and the feel**: perf, the page budget, unit + e2e; **you shoot and sign off the feel**, tuning numbers together | 2–4 | your sign-off |

Phases 1 and 3 can run side by side (different files: client models vs shared + server).

## Risks

| Risk | What we do |
| --- | --- |
| The page budget (554 KB) | `guns3d.ts` in the `tp` chunk (others' hands need it); the HUD and handling in the lazy `yutopia-dark` chunk; no value imports from the shared index in lazy chunks (memory: page budget traps) |
| A new material compiled mid-fight stalls a frame | reuse `mats.prop`; build the models when the dark loads, not on the first draw |
| Kick moving the camera makes the server's aim disagree | it can't: the server takes the yaw and pitch the shot was sent with, kick and all |
| The bloom differs between shooter and server | the server's wins and is broadcast; the shooter only predicts a tracer |
| Down the sights depends on the arm pose meeting the eye | the 1P aim frame is solved from the gun's sight line, not tuned by eye; a test checks the sights' line passes through the camera's axis |
| Two-browser e2e frame times (memory) | the "B sees it" check waits for B's 3D view to finish loading before timing anything |

## Yours to decide (later, not blocking)

- The exact feel numbers (kick, recovery, bloom) — tuned together in phase 5.
- Aim assist for the pad (a slight slow-down over a target) — not in this plan
  unless you want it.
- More guns (a rifle, a flare pistol) — after this, on the same `guns3d.ts`.

## Delivered (2026-10-21): phases 0–2

- **Phase 0 — mocks**: `design/screens/arms/` (the model sheet, held, on the snow, first person),
  from `/dev/guns` and `/dev/3p?me=gun:revolver` (`e2e/guns-shots.mts`). Approved ("Ok go").
- **Phase 1 — the models**: `tp/guns3d.ts` — the single-action revolver and the side-by-side, in
  the hand (mine near: ~9k / 12k triangles; anyone else's far: ~3k), on the snow (`gunLying`),
  their moving parts posed by `poseGun`. Held a little larger than life (1.4, 1.2), level, not
  rolled however the wrist turns.
- **Phase 2 — the handling** (client only):
  - the kick on the look (`view.kick`), most of it settling back; in the hands, back and up;
  - down the sights in first person (`hands1p` turns and moves the arms so the sight line runs
    through the eye; the revolver at 0.46, the double-barrel at the shoulder, 0.34; the lens
    50 → 41, the hands' 62 → 53); both arms up to the eye when aiming a gun (`aimPose`);
  - sway (the breath, more winded, less crouched or down the sights);
  - the crosshair as four ticks that open with the spread (the bloom is the client's own until
    phase 3 gives the shared one);
  - a click up to 120 ms early is held and fired;
  - the hammer, the cylinder's turn (a shot, a round loaded), the gate or the barrels open while
    reloading, the reload pose (`reloadPose`: before the chest; framed into first person);
  - the rumble per gun.
- **Checks**: `e2e/arms-feel.spec.ts` (GPU): kick and settle, the ticks open and close, the early
  click, down the sights, both reloads. `arms.spec`, `first-person.spec`, `drops.spec` green.
  The page 554.0 KB (unchanged); `yutopia-dark` 28.6 KB.
- **Left for phase 4**: the double-barrel's own sounds (the reload tick is still the pump's);
  others seeing my kick and reload (needs phase 3's `Player.arm`).

## Delivered (2026-10-21): the flashlight with a gun, phases 3–5

- **The flashlight with a gun out** (the user's ask): F on, aim as ever; the hands placed by the
  rig's arm IK (`PersonModel.reachTo`) after the pose (`Person3D.gunHands`):
  - the revolver: the left wrist under the right, back to back, the beam along the barrel;
  - the double-barrel **shouldered** (the user's ask): its butt in the right shoulder's pocket, the
    right hand on the grip, the left under the fore-end (the torch there too, along the barrels).
- **Phase 3 — the rules** (shared `dark/arms.ts`, server `features/arms.ts`, `dark.ts`):
  - `spreadOf` (the gun's own, the bloom, moving, crouched, from the hip, winded); `bloomShot` /
    `bloomCalm`; the server's own from its shot times and the player's trail, sent in
    `arms:shot.spread` (others' tracers and the shooter's crosshair use the same);
  - `falloff` / `damageAt`: the double-barrel full to 5 tiles, 40% at 14; the revolver flat;
  - `atHead`: the top 0.3 of 1.8 (crouched, of 1.25) ×1.5 — the shadowed and us; `arms:hit.head`;
  - the draw: 0.35 s before a shot counts;
  - the double-barrel: open 0.3 s, a shell 0.45 s, shut 0.25 s; a shot while open snaps it shut
    (0.2 s) instead;
  - `Player.arm` (shared `ARM`: idle, draw, reload, open).
  - Tests: shared 242 (5 new), world-server 110 (4 new in `arms.test.ts`).
- **Phase 4 — the show**:
  - a star of a flash (twice the size for the double-barrel) out of the drawn muzzle
    (`Person3D.gunMuzzle`; in first person through the hands' lens), a warm glow on the ground,
    smoke that drifts and thins;
  - tracers that fly (a 3 m streak at 170 m/s) and stop at the first wall or the ground
    (`view.rayStop`), a puff of snow or dust there;
  - brass: a spent case out of the gate per round loaded, the fired shells out of the broken-open
    double-barrel (anyone's), bouncing once, lying 8 s;
  - sounds (synth, `dark/synth.ts`): `shotgun-break`, `shotgun-shell`, `shotgun-shut`, `brass`,
    `hit-tick`, `hit-head`, `hit-kill` (the pump's gone from the double-barrel). Not yet in the
    audition's `design/screens/dark/sounds/synth.mjs`;
  - others' guns: their kick on `arms:shot`, their hammer and cylinder, the gate or the barrels
    open and the reload pose from `Player.arm`;
  - the crosshair gold for the head; a soft shadow under what lies on the snow.
  - `e2e/arms-fx.spec.ts`: review shots of the show, slowed down 20× (`tp.arms().slow`).
- **Phase 5 — the checks**: the page 554.0 KB (unchanged); `yutopia-dark` 29.5 KB; `pnpm perf`
  0.43 ms, `DARK=1` 1.0 ms (as before); GPU e2e: arms, arms-feel, dark, dark-hud, down, drops,
  first-person, inventory green. **Left: the user's sign-off on the feel, the numbers tuned
  together** (`FEEL` in `world/dark/arms.ts`, `ARMS` in shared).
