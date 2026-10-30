# 56 — The controls: keys and a pad, played like Kingdom Hearts 3 (plan — draft 2026-10-29)

> The ask (2026-10-29): "Lets improve the movimentation, today movimentation is very bad. First,
> lets drop the mouse actions and movimentation, its gonna be only keyboard and controller. And
> after for the improvements of control, im really think on Kingdom Hearts 3."
>
> Then (2026-10-29): "I still want the mouse to look and be the camera … I said no mouse for no
> mouse pointers like we had." So the **pointer** goes (clicking on the world, the cursor in play);
> **the mouse stays as the camera**, always on in play, as in a PC action game.
>
> Builds on plan 29 (the move core in `@yutopia/shared/move`) and plan 50 (Jolt). The rules from
> before still hold: **mocks first (phase 0), approved before any code**, and **the feel signed off
> in the `/dev/move` sandbox before it goes into the world** (phase 1).

## Where we are

**The body** (`packages/shared/src/move/spec.ts`, run by `input/walker.ts` on a 1/120 s step over
Jolt's CharacterVirtual):

- **Slow by default.** Keys and a full tilt go at the **jog, 4.2 tiles/s**. You only go fast while
  you hold **Shift** (sprint 6.8). A pad's sprint is a click of L3 that lasts until you let go.
- **Soft starts and stops.** The floor's accel is 30 and decel 38, so you need about 0.15–0.25 s to
  get going or stop. Snow is softer, deep snow heavy.
- **A small, floaty jump.** It peaks at 0.8 tiles held and 0.55 tapped, with gravity 20 both up and
  down. There's no double jump and nothing to do in the air.
- **Stiff in the air.** You keep 30% of the ground's accel and turn at 4 rad/s (12 on the ground).
- The verbs (vault, mantle, roll, slide) are there, but they only fire at the right height.

**The camera** (`tp/view.ts`):

- **It looks down on you.** The chase pitch runs 0.35–1.0 rad (20–57° down), a leftover from the
  drawn people reading best from above.
- **It's slow to come round.** It swings in behind only after 0.4 s going roughly ahead, and only
  1.2 s after you last touched it, at 1.4/s (:2187).
- **The right stick is linear and slow:** 2.2 rad/s with no response curve (:2158).
- **You can't turn it from the keyboard at all.** Q/E are wired in the view but switched off
  (`keys: false`, `controller.ts:2803`). Q is the dodge, E is use, and the arrows walk.
- **Three modes:** chase, free (an orbit "with the mouse") and first person.

**The mouse does most of the world's work.** Each item below needs a key or pad path, or has to go:

| What | Where | Without the mouse today |
|---|---|---|
| Click the floor → walk there (A* path) | `view.ts:4268` pick → `controller.ts:388` → `walkTo` :1829 | WASD only |
| Click a person → their menu; yourself → your menu | `controller.ts:402` → `openMenu` :2107 | **none** |
| Click a pet → its menu; Vortex → poke | same | **none** (the pet wheel only by pointer) |
| Click an object → its menu (sofa: sit / lie / …) | `controller.ts:410` | E does its default action; **the menu is click-only** |
| Click a toy → pick it up; Shift/right-click the floor → throw | `:401`, `throwAt` :2490 | **none** |
| Click a stair flight → climb it | `climbAt` :3118 | walking onto the flights works |
| Lift-car buttons in 3D | `pressLiftButton` :3028 | LiftPanel's G / 1–9 |
| Pick the arrival point | `:390`, `:2600` | the self menu's "arrive here" (click-only too) |
| Drag to orbit the camera; wheel zoom | `view.ts:3892–3960`, :4486 | right stick; +/− zoom |
| Mouse look (Z, pointer lock, crosshair, click uses) | `view.ts:4514–4590` | — |
| Aim with RMB, fire with LMB | `walker.ts:241`, `dark/index.ts:299` → `arms.ts:155` | LT / RT on a pad |
| Throw a pool ball, shoot the cue at the pointer | `tables/pballs.ts:48–128` | **none** |
| The car camera by mouse | `car/cars.ts:395–420` | right stick |
| The pet wheel chosen by pointer angle | `PetWheel.tsx:86–164` | **none** |
| Pool, pong, the pockets, the quick slots, the kart menus | their panels | keys mostly; pool has no pad |

(The full inventory, e2e included, is in the appendix.)

## The idea

**Sora's feel: you go where the stick points, at once, fast, and the camera keeps up on its own.**

What makes Kingdom Hearts 3 feel good, and what we take from it:

1. **Running is the default and it's quick.** No sprint key. A full tilt is a real run, a light one
   a walk, and the turn is instant, with no skid indoors.
2. **A jump you enjoy.** It's higher, with a little hang at the top and a quicker fall, and full
   control in the air. A second jump in the air, and a short air dash.
3. **Roll and dash.** The dodge is a quick roll. Held, it carries straight into a dash, which is
   the sprint now.
4. **Flowmotion.** Momentum off the world: roll into a wall and you kick off it or run up it, grab
   a lamp post or a trunk and swing round it, grind a rail, vault the bench mid-run.
5. **A camera that frames you.** It sits low and behind, settles in behind your run with a soft
   lag, and pulls back when you're fast or up in the air. One button puts it behind you again.
6. **Lock-on.** One button holds on a target: the camera frames you both, you circle it, and a
   flick of the stick goes to the next one.
7. **Situation commands.** The nearest thing you can do shows as a prompt by the HUD (Sit, Talk,
   Open, Pick up), and one button does it. It replaces every click on the world.
8. **Shortcuts.** Hold a shoulder button and the four face buttons become four quick actions
   (KH's L1 set): emotes, an item, the lantern once it's an item.

## The mechanics

### A. The pointer leaves the world; the mouse is the camera

- **Gone:** click-to-walk (`walkTo` from a click), `pick()` on a click (people, objects, toys, the
  floor), drag-orbit, the Z toggle and the crosshair's click-to-use, the pool ball's throw at the
  pointer, the pet wheel's pointer, the HUD menu placed at the click point, and the hover cursor.
- **The mouse is the camera, always, in play** (decided 2026-10-29): the pointer is locked to the
  page the whole time you play, so moving the mouse turns the camera (as Z's mouse look does today,
  but without a key to turn it on). There's no cursor and nothing to click on. The wheel zooms,
  **RMB aims** and **LMB fires or throws** while aiming. The car camera keeps its mouse. Esc (the
  browser's own) lets the pointer go, and a click on the page takes it back. Locking needs a click
  or a key from you first, so the first one into the world locks it.
- **Kept:** `walkTo` and `findPath` as code. The pets, NPCs, e2e helpers and "go there" in the
  admin pages use them, so only the click goes. The ray-and-box tests in `pickObject` /
  `nearestPick` are reused by the focus (C).
- **Free camera mode goes.** It's the mouse orbit, and chase and free merge into one camera (D).
  The settings' "3rd-person camera" choice becomes **auto-follow: on / gentle / off**.
- **The arrows leave walking** and become the camera.
- **The cursor rule** (decided 2026-10-29): **in play there's no cursor** (the pointer's locked, and
  the mouse turns the camera). **Any UI that needs it brings it back**: the phone, settings, a
  panel, the pockets, the catalog, the editors (build mode and god mode keep their pointer tools).
  The pointer is let go and the cursor shows; back to play, it's locked again (`resumeLook`, as
  the phone and the pockets do today). One owner decides this, a `pointerWanted()` that reads the
  HUD's state (`hud.panel`, `phone.open`, `build.on`, god mode, an open menu), so no panel has to
  remember to give it back.
- **Touch on phones** (the dock, the car and kart pads, pinch zoom) stays as it is. It isn't the
  mouse.

### B. The body, KH-tuned (the spec, tuned in `/dev/move`)

Starting values, settled in the sandbox:

| | Today | New | Note |
|---|---|---|---|
| default (full tilt / keys) | jog 4.2 | **run 5.8** | a light tilt (<0.5) or the walk key walks at 2.2: Ctrl on a Mac, Alt on Windows and Linux (there Ctrl+W closes the tab) |
| fast run: Shift held · the pad's X held | sprint 6.8 on Shift | **8.2** | breath outdoors at night, as the sprint costs now (plan 30) |
| floor accel / decel | 30 / 38 | **70 / 80** | at full speed in ~0.08 s, stopped in ~0.07 s |
| ground turn | 12 rad/s | **24**, a reverse turns on the spot | no wide arcs |
| air control | 30% | **85%** | |
| air turn | 4 rad/s | **14** | |
| jump apex: tap / held | 0.55 / 0.8 | **0.7 / 1.5** | |
| gravity up / down | 20 / 20 | **26 / 44** | the hang at the top: ×0.5 while \|vz\| < 1.5 |
| double jump | — | **0.9 more**, once per air time | a flip pose |
| air dash | — | **3 tiles in 0.18 s**, once per air time, no fall during it | the dodge in the air |
| fall speed cap | none | **14 t/s** | |

- Ice and deep snow keep their character (plan 29 M2), scaled to the new numbers: ice still slides.
- **Indoors** might want the run lower (5.0) in narrow offices. The sandbox has a corridor strip to
  judge it.
- `allow.ts` ceilings and the `JUMPS` / `VERBS` lists grow with the new verbs. The server takes
  moves as sent (plan 50, no anticheat for now), so this is for the log and the others' drawing.

### C. The focus and situation commands (instead of every click)

- **The focus** is the one thing in front of you that you could act on: a person, a pet, Vortex, an
  object with something to do, a toy, a lift button, a flight of stairs. It's scored by distance
  (reach from `shared/reach.ts`), the angle from your facing and from the camera, and how recently
  it was focused (so it doesn't flicker between two). Twice a second, plus at once when you stop.
  Today's `nearestInteractable` (:1854) becomes this, now with people, pets and toys.
- **The prompt**: a KH-style command stack by the hand slots, in the ink-and-walnut look. It shows
  the focus's name, its main action and the button glyph. Several things in reach stack up, and
  d-pad ↑↓ or `[` `]` pick between them.
- **Tap Use** (E · pad Y): its main action, the one E does today (sit, open, pick up the toy, call
  the lift, talk to Vortex).
- **Hold Use** (0.35 s): **its menu**. That's the click menu from today (`openMenu`), anchored over
  the target on screen and moved through with W/S, ↑↓, the stick or the d-pad; Use / A picks,
  Esc / B goes back. A person's menu, a pet's menu and an object's menu all open this way.
- **Your own menu** (look, put down, arrive here, call pets): hold Use with nothing in focus, or
  LB + Y.
- **Toys and balls**: pick up with Use. Throw by aiming (LT · Z held) and firing (RT · Space): it
  goes where the camera aims, or to the lock-on target. The pool balls and cue work the same way.
- **The arrival point**: the self menu's "arrive here". Picking a spot with the pointer goes.

### D. The camera (one camera, two places: behind you and in your head)

- **Low and behind.** Pitch from −0.15 (a little under you) to 0.75, starting at 0.25. Distance
  4.2, out to +1.2 when you dash and +1.5 up in the air, eased.
- **Auto-follow** comes round behind your velocity at a rate that grows with speed and how far off
  it is. There's no 0.4 s wait, but it lets go while you hold the stick or keys, and for 0.6 s after
  you let them go. "Gentle" halves it, "off" leaves it alone.
- **The mouse** turns it directly, by how far it moves (no curve, no ramp): 0.0024 rad a pixel ×
  its own sensitivity, the way mouse look does today. A turn by the mouse holds auto-follow off for
  the same 0.6 s as the stick.
- **The stick and keys**: a response curve (an exponent of 1.6) with up to 4.5 rad/s across and
  2.2 up and down, ramping in over 0.12 s. The arrows (and IJKL if you rebind) work the same way.
  Sensitivity (the mouse's and the stick's apart) and invert X/Y go in Settings.
- **Recenter**: R3 · R puts it behind you in 0.2 s.
- **Zoom**: the wheel, +/− and the settings. On a pad, hold View plus the right stick.
- **Walls**: `camView` keeps it out of them, as now. In tight rooms it comes in closer before it
  lifts.
- **First person** stays (Y key · pad View). The mouse, the stick and the arrows look, a small dot
  shows the focus, and Use acts on what's under it.
- **The car camera**: the mouse, the right stick and the arrows.

### E. Lock-on

- **F · RB** (or the wheel's click) **focuses** on someone or something: it locks onto the focus, or the best target in the camera's cone if nothing is in focus:
  people, pets, Vortex, the dark's things, and objects you can use. Press it again to let go.
  Going out of range or out of sight for 1.5 s lets go too.
- **Locked**: the camera frames you and the target (its yaw between, pulled back to fit) and you
  face it. Left and right circle round it (the aim gait's strafe, at the run's speed).
- **Switch**: flick the right stick, or press ← →, to go to the next target that way.
- **Use acts on the locked target** first, so you can talk to someone across a crowd.
- **With a gun**: aiming at a locked target snaps the aim to it (shared `beam.ts`'s hit test is
  unchanged). With the mouse you aim yourself, as now. On a pad or the keys, without lock-on, the
  aim has **assist**: it slows over a target and pulls gently towards one near the reticle.

### F. Flowmotion (its own phase, after the rest is signed off)

The campus already has what KH builds Flowmotion from. The things it hangs on come from Jolt's
shapes and the shapes table (plan 50), plus tags as data:

| Move | How | What it does | On what |
|---|---|---|---|
| **wall kick** | jump at a wall in the air, or roll into it | a kick up and back, jump to chain | any wall |
| **wall run** | sprint into it | up a building's face for ~1 s, then over the top or a kick off | walls tagged to run |
| **pole swing** | dodge or dash into a pole | round it while you hold, let go flung out at speed | lamp posts, trunks, the stop's sign |
| **rail grind** | jump onto a rail | slide along it, faster downhill, jump off | fences, the stairs' handrails, kerbs, the bridge's rail |
| **ledge grab** | miss a mantle by a little in the air | hang, then up | roofs, walls, the car's roof |
| **flow jump** | jump off a flowmotion move | a high, long jump (the double jump comes back) | |

Others see each move as a verb on the `jump` message (`hop | flip | vault | mantle | slide | roll`
\+ `djump | adash | wallkick | wallrun | swing | grind | hang`), drawn from the verb's own curve, as
the vault is now.

### G. The look of it (`chars/motion.ts`)

- A real run cycle at the faster speed: a flight phase and a lean into it.
- The dash: lower, the arms back.
- The double jump: a flip or tuck. The air dash: a streak. The landing: a squash by speed. A quick
  turn: a plant of the foot.
- A lock-on strafe, and later the flowmotion poses (the kick, the run up the wall, the swing, the
  grind).
- A dash's trail and the double jump's puff. The FOV goes +5° in a dash. Both are off with reduced
  motion.

### H. Jolt, used as the advantage it is

Asked 2026-10-29: "Are we using Jolt right? I want this as an advantage."

**What's on Jolt today (plan 50):**
- **The world's walker** moves on Jolt's `CharacterVirtual` (`shared/physics/world.ts`
  `moveCharacter` → `ExtendedUpdate`). Jolt handles walking up a step, keeping to the floor going
  down, sliding along walls, and stopping on slopes past 45°.
- **The vault and mantle probes** ask Jolt (`JoltCollider`: `fits`, `groundUnder`).
- **The dark's sight** uses `sees`.
- **The same world** runs on the server and in the browser.

**What isn't:**
1. **The sandbox.** `/dev/move` runs on the old tile grid, so the feel signed off there is not quite
   the world's: stairs, slopes, the land's bumps and walls at an angle behave differently.
   → **Phase 1b:** the sandbox's pad built as Jolt solids (`setStatic`: the same boxes, plus ramps
   at 20°, 35° and 50°, a bumpy hill, a lamp post, a fence and a round trunk), and the body moved
   by the same `CharacterMover` as the world. The sign-off happens on that.
2. **Gravity** is fixed in the movers (`JUMP_G`). The core makes up the difference for the KH spec.
   → The mover takes the step's gravity from the spec.
3. **The ground under you.** Jolt knows its normal (`GetGroundNormal`) and how it moves
   (`GetGroundVelocity`).
   → **Slopes:** slower up a hill, a little faster down it, sliding down what's too steep. Landing
   on a slope keeps its speed along it.
   → **Moving ground:** a moving platform, a car's roof or a lift carries you. The lift has its
   own code for this today.
4. **The walls you touch.** Jolt reports the contacts (`GetActiveContacts`: the normal, the
   shape).
   → **Flowmotion (F)** on any wall at any angle, not just the grid's edges: the wall kick
   bounces off the wall's normal, and the wall run goes up whatever is tall enough.
5. **Shapes with a meaning.** The shapes table (plan 50) already makes lamp posts and trunks
   cylinders, and fences boxes.
   → A kind on the shape (`pole`, `rail`, `ledge`) lets Flowmotion find them with one query: swing
   round a pole, grind a rail along its length, grab a ledge's edge with a cast up the wall.
6. **The camera.** `camView` keeps the camera out of walls from its own lists (the floor's fading
   walls, the Grounds' buildings). It doesn't know trees, cars, fences or the hills, and a low KH
   camera outdoors will go into them.
   → A sphere cast through Jolt's world, from you back to the camera, pulls it in before anything
   solid (phase 5). One rule everywhere, indoors and out.
7. **Focus and lock-on** see through walls today.
   → `sees` (the dark's) means nothing behind a wall is focused, and 1.5 s out of sight lets go.
8. **Pushing things.** The character could push what's loose (balls, toys) as it runs into them
   (Jolt's character strength against dynamic bodies), the way Sora knocks things about.
   → Tried in the sandbox with a few balls.
9. **Speed.** A dash at 8.2 and an air dash at ~16 t/s move 0.07–0.14 tiles a step, under the
   0.2-thick office walls. The sweep holds; the sandbox gets a thin wall to prove it.

## Controls

Every binding can be changed (`input/bindings.ts`, saved on this device). The prompts show the glyph
of whichever device you last touched (`PadState.live` already tracks it).

| | Keyboard (by position, `e.code`) | Pad (Xbox · PS) | Was |
|---|---|---|---|
| Move | WASD | left stick (tilt = walk → run) | arrows also walked |
| Camera | **the mouse** · arrows | right stick | the mouse only with Z on |
| Recenter camera | **R** | **R3** | R3 swapped the shoulder |
| Walk | Alt (held) | light tilt | |
| Jump · double jump | Space | A · ✕ | |
| Run fast (held) | Shift | X held (after the roll) | Shift · L3 |
| Roll · air dash | Q | **X · □** | Q · LB |
| Crouch · slide out of a dash | C | B · ○ | |
| Use (tap) · its menu (hold) | E | **Y · △** | E · X · pad X |
| Focus (lock-on) · switch target | **F** · wheel click · ← → | **RB** · flick right stick | |
| Zoom | wheel · +/− | View + right stick | |
| Aim | RMB · Z (held; a toggle in settings) | LT | RMB |
| Fire · throw | LMB · Space while aiming | RT | LMB |
| Reload (gun out) | E while aiming | Y while aiming | pad X |
| Flare | — (as now) | RB while aiming | RB |
| Shortcuts (4) | 1–4 | **LB held + A/B/X/Y** | |
| Lantern | — (an item in the pockets: later) | — | F · d-pad ↑ |
| First aid | — | d-pad ↓ | |
| Emote wheel (held, chosen with the stick or the arrows) | held X (G is the flare) | d-pad ← | 1–8 |
| Pets wheel (held, chosen with the stick or the arrows) | T | d-pad → | T, pointer |
| 1st / 3rd person | Y | **View** | Y · pad Y |
| Pockets | I | Menu | |
| Swap shoulder (aiming) | V | R3 while aiming | |
| Phone · mic · camera · zoom | P · M · (moves off V) · +/− | | V both swapped the shoulder and toggled the camera |

Shift runs and Q rolls on the keys, as before (the user's call, 2026-10-29). F focuses (the
lock-on), and the lantern leaves its key: it becomes an inventory item, put in the hand slots and
used from there (its own work, later). X (it doubled E) is free, and Z (no longer the mouse-look
toggle) aims. Ctrl is never bound. Flying (admins) keeps a
double-tap of Space, and C / Ctrl to sink.

## Phases

0. **Mocks** (approved before any code): the prompt stack and its glyphs; the hold-menu over a
   target; the lock-on ring and frame; the aim reticle with assist; Settings → Controls with both
   columns, rebinding, sensitivity, invert, auto-follow; the emote and pet wheels on a stick. A
   control sheet (one page, keyboard and pad).
   **Made 2026-10-29:** `design/controls/01-camera.png` … `08-sheet.png` (camera, prompt, hold,
   lockon, aim, wheel, controls, sheet), the states of `design/controls/mock/controls.html?s=…`,
   drawn over real stills from the dev world (`apps/client/e2e/controls-shots.mts`: today's camera
   and the low one behind you, the lobby and the lot by day and night).
1. **The feel in `/dev/move`** (the gate), **on Jolt (H.1, phase 1b)**: the new spec (B) and camera (D) in the sandbox, with
   strips for a corridor, a stair, a bench, ice and deep snow, and a target dummy for lock-on. A
   live tuning panel (it's data). **Signed off by you, playing it on a pad and on keys.**
   **Built 2026-10-29, waiting on your sign-off:** `KH_MOVE` in `shared/move/spec.ts`. Its new
   fields (`gDown`, `hang`, `fallCap`, `airJumps`, `airJump`, `airDash`, `grip`) are off in `MOVE`,
   so the world's body is unchanged: the core tests pass and the physics bench hashes match.
   The double jump and the air dash are in `stepBody`. The KH keys and pad are `KH_KEYS` /
   `KH_PAD` in `input/bindings.ts`, used by the sandbox only. /dev/move starts in KH, and its
   panel switches to today's (or open `?today=1`) to compare. The pad now has a tower (1.6 · 2.2
   · 2.8) to double-jump onto, 5- and 6-tile gaps a metre up to air-dash across, and five
   dummies to lock on to. The panel has sliders for the air, the grip and the camera, and "copy
   the numbers" includes the camera.
   **Phase 1b, built 2026-10-29:** the sandbox runs on Jolt (`tp/move/jolt-pad.ts`). The pad's
   tops are Jolt boxes and its dummies posts. South of the footings are a yard (a lamp post, a
   trunk, a 1.1 m fence, a 0.2 m wall, six loose balls) and two chunks of land (ramps at 20°, 35°
   and 50° up to a 3 m top, and a bumpy hill). The body moves on the world's `CharacterMover`,
   asks the world's `JoltCollider`, and the camera stops short of anything solid (a ray through
   Jolt: H.6's first cut). `?grid=1` brings back the old grid to compare. Found on the way: on a
   slope Jolt's character only kept the speed along the ground and the core took that as the new
   speed each step (60% up 20°, 16% up 35°). `CharacterMover.along` sends it along the ground's
   plane instead, at full pace (H.3). It's on in the sandbox only, so the world and the bench's
   hashes are unchanged until the sign-off. Checked: stairs walked up and down, the 50° ramp
   stops you, neither a dash nor an air dash goes through the 0.2 m wall, a run knocks a ball on,
   and `shared/physics/move.test.ts` has the slope test.
2. **The pointer out of the world** (A): the clicks and modes removed, the mouse always the camera (pointer locked in play), the cursor rule, the arrows to the camera,
   the binding table above with old saved bindings migrated, and free mode merged in. The e2e that
   clicked moved to keys: `actions`, `wall-sofa-menu`, `third-person`, `first-person`, `pets`,
   `floors`, and the aim/fire specs (`arms*`, `beam`, `shades`, `dark-hud`, `pool-balls`).
   `mouse-look.spec` becomes the always-on mouse camera's (no Z; the crosshair's click goes).
   **Built 2026-10-29** (after the sandbox was signed off):
   - **No clicks on the world:** a mouse in play is the camera's (`view.ts` `mouseCam`). A click
     takes the pointer and picks nothing: not people, objects, toys or the floor. Touch, build mode
     and choosing my arrival still point.
   - **The mouse is always the camera:** there's no Z toggle, and first person no longer locks on
     its own. Anything that wants the pointer lets it go, and the camera takes it back once that's
     gone: a menu, a panel, build mode, god mode, choosing my arrival, a side panel, the phone
     (`controller.ts` `pointerWanted`, `watchLook`; the view's `canLock`). The hint asks "Click to
     look around with the mouse" when the camera hasn't got it.
   - **The KH keys and pad in the world** (`bindings.ts` `DEFAULT_KEYS` / `DEFAULT_PAD`). F and the
     pad's ↑ stay the lantern's until plan 57, and the lock-on is only on the wheel's button until
     phase 5. A device's saved bindings that were plan 29's defaults move to the new ones; ones you
     set yourself are kept.
   - **The arrows turn the camera** (`view.keyLook` from the walker). X no longer uses, and a pool
     ball thrown with the mouse as the camera goes through the middle of the view.
   - **e2e:** `mouse-look` was rewritten; `first-person`, `inventory` and `use-things` moved to the
     new keys and clicks, and pass. `arms`, `arms-feel`, `arms-fx`, `arms-empty`, `beam` (twice) and
     `pool-balls` pass. `dark-hud` and `shades` are red on HEAD too.
   - **Red until phase 3 gives them keys:** clicking people and objects for their menus (`actions`
     ×3, `wall-sofa-menu` ×2, `pets`, `third-person` ×2: its floor click and its sofa click).
3. **Focus and situation commands** (C): the focus, the prompt stack, tap and hold, the menus on
   keys and pad, toys and balls, the self menu.
   **Built 2026-10-29:**
   - **The focus** (`input/targets.ts`, in the input chunk). Candidates: people (not bots), pets
     (by their `floor`: a pet's `level` is how far it's come on), Vortex, toys on the floor, and
     objects in reach that have a use of their own or a menu (a seat, my desk). They're scored by
     distance and how far off my facing and the camera's line; behind me only counts right by me,
     the one I had is held a little, and the best three make the stack.
   - **The prompt** (`Overlays.tsx` `Prompt`): the focus at the bottom with its picture, name,
     E or Y, its action and "hold: more", and the others smaller above. `[` `]` cycle them. A
     car's door, the shuttle and a cable keep their own prompt.
   - **Tap Use** (on release) does the main action: an object's use, else its first menu action
     (Sit); a wave to someone; pet a pet; poke Vortex; pick up a toy.
   - **Hold Use** (0.35 s) opens the ring over the target, with the first item chosen; with
     nothing in focus it's my own menu.
   - **In the open ring:** W/S, A/D or the arrows move the choice; E, Enter or Space does it;
     Esc closes it; numbers still pick. On a pad: the stick or d-pad moves, A or Y picks, B
     closes, and the walker is off the pad meanwhile.
   - **Also changed:** E leaves a kart (X too); the queue's Focus resends until the room has me
     seated (it lost that race now and then).
   - **e2e:** `helpers.actOn` (walk near, face, focus, hold or tap E) replaces clicking.
     `actions` ×3, `wall-sofa-menu` ×3, `pets`, `third-person` ×3, `games` ×5, `disc-console`,
     `slotcar`, `pingpong`, `park-life`, `kart-play`, `use-things`, `mouse-look`, `first-person`
     and `inventory` pass. Red on HEAD too: the lot car's passenger, `pets-car`, `hud`. The car
     under a flier is flaky.
4. **The body in the world** (B, G): the new spec and poses live, the double jump and the air dash,
   others drawing them, the dash's breath.
   **Built 2026-10-29:**
   - **The KH body is live:** the walker runs `KH_MOVE` (an admin's fast power scales it), and
     everyone's poses are drawn on its speeds (`chars/locomotion.ts`).
   - **Slopes:** the world's Jolt mover goes along the ground (`physics3d.ts` `along`), at full
     pace up and down hills, while the bench's hashes stay the same.
   - **The double jump and the air dash on the wire.** The second jump is sent as `flip` with
     `air`. The air dash is the verb `adash` (shared `VERBS`; the body keeps it as `airDash`), with
     its speed cap, its pose (`chars/moves.ts` `ADASH`: leaning in, arms swept back) and my own
     verb while it lasts. The server takes jumps marked `air` (and an `adash`) from the air, and
     right after the jump they follow; the 200 ms "not twice at once" rule is for ground jumps
     only. Checked live: hop, flip, hop, adash all reach the room.
   - **The night's rule** that you're sprinting starts above the KH run (`SPRINT_SEEN` = 1.2 × 5.8).
     The dash's breath is the sprint's, as before.
   - **Checks:** shared (427), the world server's `down` (including the new air-jump test),
     `survival`, `dark` and `rooms`, and the physics bench. e2e: `jump`, `move`, `fence` and
     `move-others` (its numbers moved to the KH body's) pass; `one-building`'s lift door is red on
     HEAD too.
   - **Not done here:** the dash's trail and the double jump's puff, and a reviewed look at the
     air-dash pose (a first cut, not yet looked at on screen).
5. **The camera** (D) and **lock-on and aim assist** (E).
   **Built 2026-10-29:**
   - **The camera behind you** (`tp/view.ts`) is the KH camera (`follow-cam.ts`). It owns yaw,
     pitch and distance, rests at 0.25 pitch and 4.2 back, comes round behind your run, and backs
     off in a dash or in the air. The mouse, the right stick and the arrows turn it. The wheel and
     +/− set how far back it rests.
   - **Build mode, god mode, the free camera the tests hold, and first person** turn as they did.
   - **The free camera is gone from Settings.** In its place: follows me / gently / stays put
     (`prefs.camFollow`; a stored free camera became "stays put"), the stick and arrows' speed, and
     invert left/right.
   - **Kept out of solids by Jolt** (H.6): a ray of sight's mask from me back to the camera
     (`BrowserPhysics.ray`) pulls it in front of a tree, a fence, the hill. Not in build mode.
   - **R / R3** put it behind you in 0.2 s.
   - **The lock-on:** F, the wheel's button or RB. The lantern moved to L until plan 57 makes it an
     item. It locks on to the focus, or the best one in the camera's 70° out to 14 tiles (people,
     pets, Vortex, things). The camera frames you both, you face it, and Use acts on it (the
     prompt is its). ← →, a flick of the right stick or of the mouse goes to the next one that
     way. F again, or 1.5 s gone or out of range, lets go. There's a ring at its feet (a person's,
     where they're drawn) and the chip "F FOCUS name · ← → next".
   - **Aim help** on a pad or the keys (not the mouse's camera): over someone within 0.12 rad of
     the reticle the turn halves and is drawn onto them. Locked on, the camera's lock aims at them.
   - **Also changed:** the queue's Focus stops resending once the room has me focusing (it could
     switch focus back on after "Stop focusing").
   - **e2e:** the new `lock-on` spec passes, as do `mouse-look` (its turn read as an angle
     between), `first-person` (the settings' new label), `third-person` (build mode),
     `actions`, `wall-sofa-menu`, `pets`, `move-others`, `beam`, `arms` and `inventory`.
   - **Not done:** the arrows on the car's camera; sight for the lock-on (it holds on through walls,
     by distance only); aim help onto the dark's shades (people only).
6. **The wheels and minigames on keys and pad**: the emote and pet wheels, pool on a pad, pong and
   the pockets' keys checked, the kart menus, the lift panel. **The pointer leaves those panels too.**
   **Built 2026-10-29:**
   - **One chooser for both wheels** (`components/hud/useWheel.ts`): the slice the pointer, the
     arrows or WASD, or a stick (the right, else the left) points at. Letting go of the key or
     the pad's button that holds the wheel open does it; Esc or B, nothing.
   - **The emote wheel** (`EmoteWheel.tsx`, lazy) is held on **X**, not G: G is the night's flare
     (plan 30), and X has been free since phase 2. On a pad it's the d-pad's ←.
   - **The pets' wheel** is on the same chooser; on a pad it's the d-pad's →.
   - **LB held** makes A B X Y the quick slots 1–4, not their own actions (`controls.ts`, the
     dark's `presses`).
   - **The lift's panel on a pad:** the d-pad or stick picks a floor, A sends the car, B steps out.
   - **Pool on a pad:** the stick turns the cue, A held charges and let go shoots, Y swaps the
     camera, B lets the charge go or leaves.
   - **Pong on a pad:** the stick or d-pad moves, A serves, B leaves (`usePad.ts`: a pad read a
     frame).
   - **The Kart Park's lobby and circuits** give the mouse back while they're up (`hud.kartUi` in
     `pointerWanted`): since phase 2 their buttons couldn't be clicked.
   - **The pointer isn't taken out of these panels:** it still clicks, as decision 3 has it.
     Keys and pad come alongside.
   - **Checks:** a new `emote-wheel` spec; `pets-wheel`, `pool`, `pingpong`, `kart-play`,
     `actions`, `mouse-look` and `arms` pass. `inventory`'s drag helper raced once, then passed
     alone. Unit tests: 63.
   - **Not done:** the kart lobby and circuits on keys or a pad (the arrows steer the kart: left
     for the whole-HUD plan).
7. **Flowmotion** (F): the tags (poles, rails, runnable walls) as data, each move in the sandbox
   first, then the world.
   **Built 2026-10-29 in the sandbox; signed off and brought into the world 2026-10-30.**
   - **The core** (`shared/move/flow.ts`): only the KH spec has `flow`, so today's body and the
     bench's hashes are untouched. The world says what is tagged through `FlowWorld` (`pole`,
     `wall`, `rail`). Ledges need no tag: any top the collider has works.
   - **The moves:**
     - **Wall kick:** jump at a wall in the air, or roll into one. You go up and back, and keep
       some of your sideways way.
     - **Wall run:** sprint into a wall that can be run. You run up it for up to 1 s, then climb
       over the top if it's in reach, or kick off.
       - **Its limit** (measured 2026-10-30, a test holds it): from the ground you get over a top
         up to ~6.4 m; from a jump, up to ~7.6 m. Higher, you run ~5.5 m up and kick off.
       - A wall under 2.2 m over your feet isn't run up: it's mantled or jumped (`RUN_MIN`).
       - The height is `runUp × runLen`, both on the sandbox's sliders.
     - **Wall run along (2026-10-30, after your question):** sprint at a runnable wall slantwise
       (7–27° into it). You run along it in a low arc, up to 1.25 m high, for up to 1.1 s. A
       jump is the flow jump, off it, out and on. Letting go of Shift drops you; the wall's end
       or the ground ends it too.
     - **Pole swing:** roll or sprint into a pole. You swing round while Shift is held, and are
       flung out on letting go. A jump flings you higher.
     - **Rail grind:** land on a rail, or cross it on the way up with your feet over it. You slide
       along it at 7 t/s or faster, off its end or jumped off.
     - **Ledge grab:** fall at a top 1.2–2.4 over your feet that a mantle can't reach. You hang,
       then W or a jump takes you up, and S or C drops you. Going up (from a hang, or over a
       wall run's top) is a 0.34 s climb, not a jump cut.
     - **Flow jump:** a jump off any of these goes 2 tiles up and gives back the air jump and the
       air dash. For 0.35 s after a kick or a fling, your way carries.
       - It's a whole arc: letting go of jump doesn't cut it short, nor a wall kick (2026-10-30;
         they were cut to a tap's 0.9).
       - Jumping off a rail no longer gets caught by the same rail on the way up (2026-10-30: it
         used to grind on at once).
   - **A rail isn't vaulted:** a jump at a solid rail in a vault's reach is a jump, so you land on
     it and grind.
   - **The sandbox's yard** (`tp/move/jolt-pad.ts`, on Jolt) has rails at 0.9 and 1.7 to grind,
     a 6 m wall to run up, a 22 m one to run along, and the pole, the trunk, the fence and the thin wall tagged. The pad's
     outer walls can be run. The panel has a "KH: Flowmotion" group of sliders.
   - **Checks:**
     - Six core tests (wall kick, wall run, wall run along, pole swing, grind, ledge grab), plus
       a solid rail jumped onto, not vaulted.
     - Headless on Jolt, all seven pass: the wall run (to 6 m and over), the swing, the fling,
       both rails ridden to their ends, the kick, and the 3.5 m pillar (hang, then up). The 2.8
       tower is still mantled.
     - Shared tests: 435. The bench's hashes are the same.
   - **In the world (2026-10-30, after your sign-off):**
     - **What's tagged comes from the shapes table** (`shared/physics/flow.ts` `GroundsFlow`).
       It reads the Grounds' solids by what each one is; no tags are kept anywhere else, so god
       mode's edits and the park's layouts are in it once their chunks are made again.
       - Poles: anything upright, 0.5 m or thinner and 2 m or taller (lamp posts, trunks, snow
         poles, masts, the sign posts).
       - Rails: fences, the tower's fence, the bridge's railings and the kart fence.
       - Walls to run: buildings' faces, the tower, the kart shed and tower, and Motors. Any
         other wall of 1.6 m or more can be kicked off.
     - **Out on the land only**: indoors a lamp post outside would be in reach through the wall.
       Not when going through walls either. A move under way ends if the world stops handing
       Flowmotion in.
     - **A grind carries on along a fence**: past a post, onto its next stretch, as one grind.
     - **Others see it:** a new `flow` byte on each player (`flowCode`: the kind, and the side
       its wall or pole is on), set by a `flow` message and taken as sent.
       - Each person's 3D body draws it from that byte (`flowOfCode`), timed from when it shows,
         as their verbs are.
       - The kick and the flow jump go as a `flip` on the `jump` message, marked `air`.
     - **The camera on a pole** in the world: the view's `swingAt` gives the same hold as the
       sandbox's.
     - **The moves load with the physics, not with the walker**:
       - The step gets them from the world it's handed (`FlowWorld.moves`, `flow-moves.ts`).
       - They used to sit in the input chunk: 16.0 KB against its 15. Now 14.2.
       - The page is 419.3 of 421.
   - **Checks in the world:**
     - The `flowmotion` e2e: the driveway lamp is swung round with the camera's turn held
       still, and the company fence is ground along. A jump off it rises 1.2 m or more and
       comes back down onto it. The server carries each move (`Player.flow`).
     - `fence`, `mouse-look`, `third-person`, `lock-on`, `move-others`, `move` and
       `weak-machine` pass.
     - Unit tests: what's tagged (made up, turned, a floor's frame, the real Grounds' lamps and
       fences), a grind past a post, the wire's byte, and the server's `flow` message.
     - Shared tests: 440. The bench's hashes are the same.
   - **Each move has its own animation** (2026-10-30, `chars/moves.ts` `flowPose`, eased in by
     `Locomotion`; stills in `design/controls/09-flowmotion.png`):
     - Up a wall: a sprint pitched back off the face, soles on it, knees driven high, looking up.
     - Along a wall: a sprint rolled off it, feet on the face, the outer arm out wide.
     - The swing: one hand on the pole, the body flung out level from it, legs scissoring.
     - The grind: side-on, low, feet apart on the rail, arms out, swaying for balance.
     - The hang: both hands on the edge, a swing from the catch that settles.
     - The climb: pulled up, a knee onto the top, pushed over, stood up.
     - The flow jump (off a rail, a pole, a wall run along) is KH's corkscrew. She turns once
       round in a tuck and opens out to land (`spinPose`, 0.6 s). The wall kicks keep the flip,
       which reads as a backflip off the wall.
     - Polish (2026-10-30): the knees give as she lands on a rail; the swing bobs; the swing
       and the run along a wall ease in slower (0.16 s).
     - Checked by where the bones land: the soles reach the wall's face, and the head stays
       clear of the trunk.
   - **The camera on a pole** (2026-10-30): it used to flick, following her spinning velocity,
     and the trunk passing between kept snapping it in.
     - `FollowCam`'s `hold` keeps its turn and drops the dash pull-back.
     - The view looks at the pole, not at her, and the camera's wall check starts outside the
       trunk.
     - Measured over a swing: the turn doesn't change; ~1 cm a frame.
     - The world's view has the same (2026-10-30).
8. **The checks**: e2e for the focus (walk up, prompt, tap, hold → menu → choice; a person's menu
   by pad), lock-on (lock, circle, switch), the double jump onto the bench and the stop's roof,
   aim assist; on a weak machine; the two-browser check that each sees the other's new verbs;
   `pnpm budget` (the focus and prompt in the page; flowmotion lazy, with the input chunk).
   **Built 2026-10-30:**
   - **New e2e:**
     - `controls-checks`:
       - Bia's menu on a gamepad: Y held opens it, the d-pad moves through it both ways, and
         A does the high five on both sides. The pad is a stand-in for `navigator.getGamepads`.
       - The lock-on circled: D held, at the same distance from her all the way, facing her.
         Then switched to Cai and back with the arrows.
       - The double jump from a run onto the bus stop's roof, at the roof's own height.
       - Aim assist: aiming on the keys a little off Bia, the crosshair is drawn onto her.
     - `moves-seen`: in Bia's own browser, Ana's flip off a double jump, her air dash, her
       roll, a swing round the driveway lamp and its spin are each drawn on her. Each 3D
       person keeps what it was last drawn doing (`Person3D.drawn`) for the test to read.
     - `flowmotion`, out on the town's walls:
       - Up the 4.2 m house and over its roof's first step.
       - Up the 8.4 m one and kicked off.
       - 9 m and more along a 26 m face.
       - A hang from a 3.2 m top, then up onto it.
     - `weak-machine`: Flowmotion on the Lowest tier with the CPU slowed 4×. Still up and over
       the house, about 20 fps (median 50 ms).
   - **Fixed on the way:**
     - Circling a lock-on spiralled out (1.4 m in 1.6 s). Steering went by the camera's turn,
       which comes round after the target. Locked on, the walker now steers by the true way to
       the target.
     - A building's wall with its roof's first step flush on top is one wall up to that step.
       The 4.2 m house is really 5.7 m to run over, and before this she could never get onto
       it. Roofs are walls now.
   - **Notes from the checks:**
     - Aim assist works on the crosshair's way (`lookYaw`: the view's turn plus the aim's own
       over the shoulder) and reaches 0.12 rad.
     - Switching the lock-on reads the arrows as held each frame, so a tap shorter than a
       frame is missed. That's not a hand's tap, but on a very slow machine it might be.
     - The bench is a seat: landing on it sits you down. So the double jump went onto the bus
       stop's roof.
   - **Budget:** the page 419.4 of 421; the input chunk 14.2 of 15. The bench's hashes are the
     same.
   - **The sweep**, run alone:
     - Passing: `controls-checks`, `flowmotion`, `moves-seen`, `third-person`, `actions`,
       `use-things`, `pets-wheel` and `first-person`, but for one test. Earlier, alone:
       `lock-on`, `emote-wheel`, `mouse-look`, `move`, `move-others`, `fence` and
       `weak-machine`.
     - The one red: "first person: facing where I look", red on HEAD since 10-26 (the known
       red list).
     - Two runs at once log the same accounts in twice and knock each other out: run them one
       at a time.

## Guardrails

- The sandbox gate: no world change for B, D or F until you've played and passed it.
- Faster bodies on Jolt: check the CharacterVirtual's sub-steps and the LinearCast at a dash's 8.2
  and the air dash's ~16 t/s, so you don't tunnel through thin walls (the 0.2-thick office walls).
- Speed and reach: interactions stay on `shared/reach.ts`, and the faster body doesn't widen them.
- No deep compare of three objects in any new test (memory: compare by identity).
- The phone stays as it was (plan 45).

## Decided (2026-10-29)

1. **The cursor:** none in play (the pointer's locked), back whenever a UI needs it (the phone,
   settings, panels, the editors), and locked again on the way back (A, the cursor rule).
2. **The mouse is the camera**, always on in play: no Z to turn mouse look on. RMB aims, LMB fires,
   the wheel zooms. What goes is the pointer: clicking things in the world.
3. **The HUD's panels** stay clickable for now. Everything the world opens (menus, wheels, prompts,
   the lift, the minigames) works on keys and pad in this plan. A whole-HUD pad focus system is its
   own plan.
4. **Flowmotion** is phase 7 here, after phases 1–6.
5. **The pad goes to KH3's layout** (Use Y, dodge and dash X, lock-on RB, camera mode View). Old
   saved bindings are migrated, not dropped.
6. **F focuses** (locks on to someone or something); the lantern loses its key and becomes an
   inventory item, later.

## Open questions (yours)

1. **Indoors speed**: the same run everywhere, or a calmer one inside? *Recommended: decide in the
   sandbox.*
2. **Keyboard aim and fire** (Z held to aim, Space to fire while aiming): fine, or do you want them
   elsewhere? *Recommended: try it in the sandbox.*

## Appendix: the mouse in the code today

- **The view** (`tp/view.ts`): `onDown` :3892, `onMove` :3917, `onUp` :3947, `onWheel` :4486,
  `noMenu`, the pinch `onTouch` :3872, `pick` :4268, `hover` :4160, mouse look `setLook` :4514 /
  `onLockChange` :4549 / `aimAt` :4571.
- **The world's events** (`controller.ts:387–435`): floor (build, arrival, close menu, throw, climb,
  walk), toy, person (pet, npc, self, other), object (lift button, build, cable, elevator, stairs,
  menu), aim, look and lookRefused.
- **Elsewhere:** `walker.ts:241` (Mouse2 → aim), `dark/index.ts:299` → `arms.ts:155` (LMB fires),
  `tables/pballs.ts:48–128`, `car/cars.ts:395–420`, `PetWheel.tsx:86–164`, the pockets' click and
  drag (`dark/inventory.ts:203–250`), the quick-slot strip (`dark/index.ts:434`), the pool and pong
  panels, and the kart menus.
- **Pointer-lock plumbing to remove:** `phone/index.ts:86,115`, `dark/inventory.ts:98–110`.
- **e2e:** world clicks in `actions`, `wall-sofa-menu`, `third-person`, `first-person`,
  `mouse-look`, `pets`, `floors`; RMB/LMB in `arms`, `arms-feel`, `arms-fx`, `arms-empty`, `beam`,
  `shades`, `dark-hud`; `pool-balls`, `pool`, `pingpong`, `pets-wheel`, `inventory`, `games` (the
  touch pad). `helpers.walkTo` is already programmatic and stays.
