# Plan 94 — the car takes a beating

Asked 2026-11-16, after plans 92 and 93 were pushed (559aaa33): fix plan 93's small gaps, and ten points of the
user's (in Portuguese, here in short):

1. it explodes if shot a lot after the smoke starts;
2. better destruction: doors falling off, other pieces falling, left properly wrecked;
3. glass breakable by a shot or an impact;
4. damage from shots;
5. a shot tyre bursts and turns the car;
6. the tyres hiss too much, a bit crazy: keep it for a real squeal or a handbrake drift;
7. the car is so light a person can push it;
8. the car is weak on dirt: it can't climb a small hill;
9. get out with E, not X;
10. a better car UI.

Status: **planned; forks decided 2026-11-16**, one by one:
- F1a: smoke, fire, a blast.
- F2a: the doors, lids, bumpers and mirrors come off.
- F3a: each pane breaks on its own, cracked and then gone.
- F4a: the people inside and the car both take shot damage.
- F5a: a shot tyre kicks, pulls and throws sparks.
- F6a: people never move a car.
- F7: **X stays as the way out.** The fix is the prompt: it says "E Get out" while the key is X.
- F8: the three UI looks mocked, and the user picked **A, walnut**.
- F9b: the server keeps recent ruts.
- F10b: a car stays locked while driven if the driver locked it.

## Where we are, from the code

- **Damage** (`shared car/damage.ts`):
  - five zones (front, rear, left, right, roof) and parts as bits: the bumper hanging and gone, mirrors, four
    lamps, the windscreen cracked or badly, each side's glass (all of that side's windows at once), four flats,
    engineDead;
  - `knock` breaks them at fixed marks;
  - `glb.ts setParts`: the bumper drops at one end, then hides; mirrors fold; a side's door glass hides; the
    windscreen gets a crack pane; a flat sits 4 cm lower;
  - the doors, bonnet and boot lid only swing on their hinges. Only the front bumper ever falls (`Debris` in
    `car/fx.ts`: Jolt crates, at most 6, gone after 45 s).
- **Glass:** the windscreen and each side as a whole break by impacts and shots. The rear window has no part bit:
  a shot through it sets nothing, the round just goes on.
- **Shots into a car:** a round through glass or a door goes on (`arms.ts`), but anyone seated is skipped as a
  target (`busy` `ride:`/`drive:`). Nobody in a car is ever hit.
- **The steam, the dead engine:**
  - steam from 0.8 on the front zone (`steamOf`), puffs off the bonnet;
  - a shot into the engine past 0.9 sets engineDead: it stops and won't start;
  - plan 93's F6a: never burns, never explodes.
- **A flat:**
  - ±0.08 of steering input per flat front tyre, half its grip, more drag;
  - a bang and a hiss when it's shot;
  - no kick at the moment it goes; a rear flat pulls nothing.
- **The tyres' voice** (`car/sound.ts`), on the hard ground only:
  - `scrub` from 50% of the grip used (`smooth(0.5, 0.9, used)`): it starts in an ordinary corner. This is the
    "too much hiss";
  - `squeal-loop` from 82%;
  - `skid` past the peak and sliding;
  - a chirp when the grip used rises fast.
- **Pushing:**
  - the walker is a Jolt `CharacterVirtual` (its mass and push strength never set);
  - parked cars and other people's cars are kinematic boxes on each client (a walker can't move them);
  - the driver's own car on its client yields to a person standing against it (`drive.ts soft()`: "they give").
    A person leaning on a stopped car with someone at its wheel moves it;
  - masses: sedan 1280 kg, hatch 920, van 1480, pickup 1560.
- **Dirt:**
  - grip: earth 0.6, grass 0.55, mud 0.35, effective `0.1 + 1.08×mu`;
  - the sedan: 185 N·m (×1.42 × 0.9), first gear 3.71, final 3.73, rear drive, open diff;
  - mud and snow dig in a spinning wheel (sink above 4 cm);
  - why a small hill stops it isn't measured yet.
- **Keys:** X gets out; E and Q are gear up and down (manual only); on foot E is "use" (getting in).
- **The UI:**
  - a DOM overlay (`cars.ts showHud/drawHud`): a note line (pump, filling, stuck, fuel low, pets), the keys' hint
    for 10 s, a VFD readout (km/h, gear, fuel %) outside the cockpit view;
  - in the cockpit, the dash's own cluster (`vfd.ts`).

## Plan 93's small gaps (G)

- **G1, the Daybreak from a seat:** its charge reads the walker's aim; seated, give it the window's aim as the
  other guns have (`cars.gunSeat()`).
- **G2, long guns out of a window:** the shotgun, AK, sniper from a passenger's window, held with both hands
  through it (the seated pistol grip's way: `seatedGun`); checked by close stills.
- **G3, lids seen by others:** the boot lid (and the bonnet up for a mend) on the wire. Whoever has it open:
  `busy` `boot:<id>`, the others' clients lift it.
- **G4, tracks and ruts for someone joining later:** each client lays its own today (fork F9).
- **G5, the tyre change:** a jack under the sill, the car lifted 6 cm that corner, the wheel off and the spare on
  (the hands at it), 20 s as today.
- **G6, a driven car's empty seats:** today a stranger can sit in. Fork F10.

## The points (P)

- **P1, it explodes** (fork F1). The ladder:
  - shot or crashed past the steam: smoke, black and thicker;
  - shot more: fire under the bonnet (a flame, its light, the crackle);
  - a while burning, or more shots: it explodes. A blast, the bonnet and doors thrown off, people near knocked
    down and hurt by distance (in a fight's rules, plan 93 F8);
  - after: a burnt-out wreck (the paint charred black, the glass gone, the tyres burnt), towed home after a while
    and made new;
  - the server owns the stages (it hears the shots and the crashes); everyone sees and hears it.
- **P2, wrecked properly** (fork F2):
  - the doors, the bonnet, the boot lid, both bumpers and the mirrors come off by their hinge's or mount's damage
    (each a Jolt piece on the road, as the bumper's now; kept longer and more of them);
  - the panels dented deeper (the dent morphs' range);
  - the lamps' lenses broken (shards);
  - a door hanging off its lower hinge before it goes;
  - the parts gone are kept on the car (the damage string's bits), so a parked wreck stays a wreck for everyone.
- **P3, glass** (fork F3):
  - every pane breakable: the windscreen, the rear window (a new bit), each door's window on its own;
  - by a shot, by an impact on its side, by the blast;
  - cracked first (a crack texture at the hit, a star where the round went in), then gone (a burst of shards
    falling, the tinkle);
  - a broken pane lets the outside in (plan 93 S5's seal).
- **P4, damage from shots** (fork F4): the people inside hit through the glass and the doors (the side it comes
  in by, the seat it reaches), and/or the car's own wear from rounds made heavier (more dent, a hole's ring).
- **P5, a shot tyre** (fork F5):
  - it bursts at once, a kick:
    - at speed a front flat yanks the steering its way for half a second (a yaw impulse);
    - a rear flat swings the tail;
  - the pull afterwards stronger (×2 today's);
  - on asphalt, sparks from the rim after a while;
  - the tyre's rubber flapping (the model's tyre scaled on that side).
- **P6, the tyres' voice:**
  - the scrub only from 85% of the grip (not 50%), and quieter;
  - the squeal from the peak and sliding;
  - the handbrake drift's own: its squeal loud as the rear slides;
  - the chirp kept;
  - checked by ear on `/dev/car-sound` and a drive: an ordinary corner silent, a hard one squealing.
- **P7, too light** (fork F6):
  - a person against a car no longer moves it: the driver's car doesn't yield to someone standing still or walking
    into it (`soft()` for people only above a walk's push, as a car's weight would);
  - a person's push on a parked car: none;
  - the car still stops for a person in its way (plan 93 S3) and knocks them at speed;
  - and the car's own feel of weight checked (its mass, the springs' sag, the suspension's damping on a kerb).
- **P8, climbing on dirt:**
  - measured first: a ramp of earth and of grass at 15%, 20%, 25%, 30% in the bench (`feel-probe.ts`): does the
    sedan get up from a stop, and why not (the wheels spinning, the torque, the open diff, the clutch slipping)?
  - then fixed where it fails: a soft ground's grip at low slip, the first gear's torque at a crawl, the open diff
    (a limited-slip feel on loose ground), the traction help easing less;
  - target: the sedan up 25% of earth or grass from a stop, the 4x4 up 35%.
- **P9, the way out's key** (F7, decided: X stays):
  - the prompt in a car says "E · Get out" (the walker's prompt draws the use key) while X does it;
  - the prompt and the hint show X (the car's own key from `car/controls.ts`), on a pad its button;
  - E in a car stays the manual's gear up.
- **P10, the car's UI** (fork F8), mocks first (`design/car-ui`, three looks), then built:
  - speed, gear (and its shift light in manual), the revs, fuel, the engine's temperature;
  - damage at a glance (a small car outline: dented zones, lamps, glass, flats, smoke);
  - the radio's station, the windows, the chains, locked;
  - the keys' hint as a card that can be shown again (a key);
  - the in-car prompts (the pump, stuck, out of fuel) in the HUD's own style;
  - the phone's layout too.

## Forks (decided 2026-11-16 — asked one by one)

- **F1, the explosion:**
  - a) the ladder: smoke, then fire, then a blast after a while burning or more shots;
  - b) straight to a blast once it's shot enough after the smoke (no fire stage);
  - c) fire only, burning out (no blast).
- **F2, how wrecked:**
  - a) the doors, bonnet, boot lid, bumpers and mirrors can all come off, hanging first;
  - b) as a), the wheels too after a big crash;
  - c) the bumpers and the bonnet only.
- **F3, the glass:**
  - a) every pane on its own, cracked first, then gone;
  - b) every pane, gone at once (no crack stage);
  - c) as today plus the rear window.
- **F4, "damage from shots":**
  - a) the people inside are hit through the glass and doors, and the car takes more from rounds;
  - b) the people inside only;
  - c) the car only (more wear from rounds).
- **F5, a shot tyre:**
  - a) a kick at the moment, a stronger pull, rim sparks;
  - b) a kick only.
- **F6, the weight:**
  - a) people never move a car; it's heavy as it is;
  - b) as a), and the cars heavier and stiffer (masses +15%, springs firmer);
  - c) a strong push moves a car in neutral a little (a slow roll), people can't move one in gear.
- **F7, the keys:**
  - a) E out (and in), the manual gears on Shift and Ctrl;
  - b) E out, the gears on E/Q kept, getting out a held E;
  - c) both E and X get out, the gears off E;
  - **decided: none of these.** X stays as the way out, and the UI says X.
- **F8, the UI's look:**
  - a) in the HUD's style (ink on walnut);
  - b) the 80s car's own instruments (the dash's VFD look on the screen);
  - c) minimal (speed and gear, the rest on a key);
  - mocks of the chosen one or of all three before it's built;
  - **decided: all three mocked, and the user picked A, walnut** (`design/car-ui/a-walnut.png`).
- **F9, tracks and ruts for those joining later:**
  - a) as today (each client's own);
  - b) the server keeps the last few minutes' ruts (deep snow only) and sends them to whoever joins.
- **F10, a driven car's empty seats:**
  - a) anyone can sit in (as today);
  - b) locked while driven if the driver locked it (L as they got in: the lights' key in a car stays the lights;
    the lock from a key in the car);
  - c) the owner's car only takes their friends (by the server's friends).

## Phases

- **0, measures and mocks:**
  - the dirt ramps measured (P8);
  - the explosion's and the wreck's look mocked as stills (Blender: the burnt paint, a door off, a blast frame);
  - the UI mocks (F8).

  The gates are the user's: the mocks.
- **1, the keys and the voice:** P9, P6. Checked by ear and a drive.
- **2, weight and dirt:** P7, P8. Checked by the bench's numbers and a drive.
- **3, glass:** P3.
- **4, the wreck:** P2, the parts off and kept, the debris.
- **5, shots:** P4, P5.
- **6, fire and the blast:** P1, server stages, fx, the burnt wreck, the tow.
- **7, the UI:** P10.
- **8, the gaps:** G1–G6.
- **9, checks:** the specs near (`car.spec`, `car-look.spec`, `arms.spec`, the pack's); the car probes; a frame
  time drive on Low (fire and debris on screen); the memcheck (debris freed).

## Risks

- **Debris and fire cost:** each piece is a Jolt body and a draw; fire is particles and a light. Kept within a cap
  (pieces per car, burning cars near), and freed with the car.
- **The blast on the network:** it's the server's; clients play it from the damage string's stage and a message.
  A late joiner sees the wreck, not the blast.
- **People hit in cars:** hit rules in seats (which seat a round reaches, from which side) need care so a shot at a
  door doesn't hit the far passenger.
- **Keys:** moving the gears off E/Q touches the settings page and its help.

## Phase 0 — built (2026-11-16): measures and mocks

- **The dirt ramps** (the bench: sedan and 4x4 from a stop, throttle held 8 s, `flatWorld(ground, slope)`):

  | ramp | sedan earth | sedan grass | sedan asphalt | 4x4 earth | 4x4 grass |
  |---|---|---|---|---|---|
  | 15% | 42 km/h | 27 | 75 | 51 | 50 |
  | 20% | 26 | 12 | 66 | 46 | 45 |
  | 25% | 12 | 1 (stuck) | 57 | 46 | 45 |
  | 30% | 0 (stuck) | slides back | 48 | 40 | 39 |
  | 35% | slides back | slides back | 37 | 34 | 32 |

  The sedan's rear wheels spin at 9–15× its speed on soft ground (slip 9–15). It isn't the engine (asphalt climbs
  35%), it's wheelspin:
  - the open diff lets the lighter wheel spin;
  - the traction help doesn't hold it;
  - and a spinning tyre falls to its sliding grip.

  The 4x4 is fine. Phase 2 fixes the traction on loose ground (target: the sedan up 25% of earth and grass).
- **A constraint found for P2:** a parked car is a still model (`culling.stillModel`): its static meshes merged, its
  matrices made once. A part can't be hidden or moved on it: the bumper merged into the body stays. P2 builds a part
  off (or hanging) into the model as it's made again (the damage string changed: `wk`), not by moving it in place.
- **The wreck's mocks** (`design/car-wreck`):
  - on `/dev/cars` (`e2e/car-wreck-studio.mts`):
    - `s1-wrecked-front`: the bonnet and front bumper lying on the road, the driver's door hanging open off its
      lower hinge, the windscreen cracked, a mirror folded, the engine bay open;
    - `s2-wrecked-side`, the same from the front;
  - in the street at night (`e2e/car-wreck-mock.mts`):
    - `2-on-fire`: flames out of the engine bay (turbulent sprites, normal blending), their light;
    - `3-blast`: a fireball of hot puffs going to smoke at its edge;
    - `4-burnt-out`: charred black, the glass and tyres gone (on the rims). The rims, plate and chrome stay light in
      the mock (shared materials the mock can't reach); the build chars them too.
- **The UI's mocks** (`design/car-ui`, `mocks.html` → `e2e/car-ui-mocks.mts`), over a drive on Main Street:
  - `a-walnut`, in the HUD's style:
    - a walnut plate: km/h big in the book face, the gear in its box (AUTO or M), the revs bar with its red, fuel and
      the engine's warmth;
    - chips for the radio, the window, chains, locked, a flat;
    - a small damage outline above it (the front's zone rust-red, a flat tyre red, the windscreen dashed, steam);
    - the keys on a paper card (K shows it again);
  - `b-vfd`, the dash's own glowing amber segments in a black glass panel: km/h with its ghost 888, a revs ladder,
    the gear, fuel and temp cells, the status words (FM 2, WIN, CHN, LCK, TYRE FL, ENG in red);
  - `c-minimal`: km/h big and the gear in a ring on the right; warnings only when they matter (flat tyre, engine
    steaming); K for the keys;
  - all three: the prompt says **X · Get out** (F7's fix).

## Phase 1 — built (2026-11-16): the keys and the tyres' voice

- **P9, the way out says X:**
  - the store's `prompt` takes an optional `key` and `padKey` (`world/store.ts`);
  - the in-car prompt (`car:leave` in `cars.ts promptNow`) sets both to X, the car's own exit key (`KeyX`, pad
    button 2);
  - the HUD's Prompt (`components/hud/Overlays.tsx`) draws `prompt.key`, else E / Y as before;
  - checked in town (`e2e/car-tyres.mts`, which now logs it): `{"kind":"car:leave","key":"X"}`, keycap "X".
- **P6, the tyres' voice** (`car/sound.ts`):
  - the cause: the skid started at 85% of the grip (`(used − 0.85) × 1.6`) with barely any sliding, so a keyboard
    corner at full lock played it at 0.15–0.3 all the way round;
  - now:
    - the skid and the squeal start only past the peak (`used > 1`) and with the patch really sliding (1–3 m/s);
    - the held squeal starts from `used` 1–1.35;
    - the scrub starts from 85% of the grip, at 0.12 (was 50%, at 0.22);
    - a wheel locked braking in a line has half the skid of a tail out (by the body's slip angle);
    - the handbrake drift is loudest: its skid reaches 0.9 on dry ground and 0.63 on wet;
  - bench, a sedan on dry asphalt; levels are mean / peak (`feel-probe`-like drives):

    | drive | skid before | skid after |
    |---|---|---|
    | turn at 30 km/h, steer 0.7 | 0.07 / 0.39 | 0.00 / 0.03 |
    | full lock at 50 km/h | 0.15 / 0.29 | 0.00 / 0.03 |
    | brake to a lock from 60 km/h | 0.72 | 0.26 |
    | handbrake turn at 50 km/h | 0.73 | 0.54 / 0.90 |
  - in town (`car-tyres.mts`, wet Main Street):
    - an ordinary hard turn: skid 0.00–0.01, scrub 0.05;
    - with `HAND=1`, the handbrake held through the turn: skid 0.63.

## Phase 2 — built (2026-11-16): the weight and the dirt

- **P7, a person never moves a car** (`car/drive.ts soft()`):
  - the cause: a person pressed against the box (their soft 0.38 into it by what their walker's capsule and the
    lag let in) pushed the car off them at `depth × 80` m/s a step, even standing still. A stopped car was pushed
    ~5 m in 4 s of walking into it;
  - now a person or a pet only takes the car's speed into them. They hold it off by depth only while it's driven
    into them (the throttle on, its gear their way: plan 93 S3's bumper stop kept). Banks are pushed off as before;
  - other people's cars on my screen (dynamic hulls pulled to their driver's pose): a walker's default push
    (100 N) against 1,280 kg and a 0.08 s pull is nothing;
  - test `(plan 94 P7)` in `car.test.ts`: pressed 23 cm into its nose, side or tail for 6 s, it moves < 3 cm;
  - in game (`e2e/car-push.mts`, Ana sat in a town car, Bia walking into it with W held 4 s):

    | | nose | side | tail |
    |---|---|---|---|
    | before (the old push-out put back) | 4.8 m | 5.4 m | 4.9 m |
    | now | 0.000 m | 0.000 m | 0.000 m |
  - its own weight checked, no change:
    - a sedan corner gives 1.6 Hz springs, damping ratio 0.56, 10 cm sag;
    - yaw inertia 2,450 kg·m², as a ~1.3 t saloon.
- **P8, climbing on dirt** (`car/grip.ts`):
  - the cause: the rear tyres spun to their sliding grip;
  - fixed by loose ground's own curve: it peaks at a larger slip and keeps most of its grip spinning, as a tyre
    digging into earth or grass does:
    - grass: kappa 0.14 → 0.2, slide 0.65 → 0.88;
    - earth: mu 0.6 → 0.62, kappa 0.12 → 0.18, slide 0.7 → 0.9;
  - tried and dropped (measured no help or worse, so nothing of them is left):
    - the traction help at a crawl (it acts only above 1 m/s);
    - a clutch passing only what the tyres hold (Jolt's engine never drops below idle, so in first a stopped car's
      wheels are driven at idle speed);
    - a crawl-regularised slip ratio;
    - a tighter limited-slip diff;
  - the sedan from a stop, throttle held 8 s:

    | ramp | earth before | earth now | grass before | grass now |
    |---|---|---|---|---|
    | 15% | 42 km/h | 59 | 27 | 47 |
    | 20% | 26 | 47 | 12 | 33 |
    | 25% | 12 | 34 | 1 (stuck) | 18 |
    | 30% | 0 (stuck) | 19 | slides back | 4 |
    | 35% | slides back | 5 | slides back | 0 |
  - asphalt and the 4x4 are unchanged;
  - test `(plan 94 P8)`: up 25% earth and grass more than 12 m in 8 s; 35% grass still too much;
  - grass and earth now also hold a little more in a slide (the same floor works sideways);
  - snow is not touched. The sedan on snow from a stop:
    - packed snow: 15% at 16 km/h, stuck at 20%;
    - a snowy path: stuck at 25%;
    - deep snow: ~1 km/h even on the flat (the 4x4 does 25% deep at 28 km/h; chains help: plan 93 S6).

    The Grounds are winter by default: their hills are snow and deep snow, not earth.
- Checks:
  - shared: 698 tests pass (the car's 58 among them);
  - world-server: `cars.test.ts` 12 pass.

## Phase 3 — built (2026-11-16): the glass

- **Each pane on its own** (`shared car/damage.ts`):
  - the panes: the windscreen, the rear window, each side's front window and the one behind it (`PANES`: screen,
    rear, fl, fr, rl, rr);
  - eleven new part bits (17–27): the windscreen gone, the rear window cracked and gone, each side window cracked
    and gone. The parts number now uses 28 of its 31 bits; phase 4's parts falling off need a field of their own
    (the damage string's third part);
  - `hitPane`: whole → cracked → gone; the windscreen cracked → badly → gone; `hard` takes it at once.
    `shatterAll` is for the blast (phase 6);
  - knocks (`knock`), by the side struck:
    - a side's window cracks (from 0.35 if hard) and goes (0.6, or 0.42 if hard): the one ahead or behind its
      middle by where it was struck; past 0.82 both;
    - the rear window cracks at 0.45, goes at 0.72 (0.55 hard);
    - the windscreen goes only in a wreck (laminated: 0.97 and hard);
    - on its roof: past 0.6 every pane but the windscreen goes;
  - old saves: `sideL`/`sideR` (a side's windows shattered) read as both of that side's windows gone;
  - the garage's glass mends every glass bit (`GLASS_BITS`).
- **Shots** (`car/shot.ts`):
  - a round through glass breaks the pane it came in by (`CarShot.pane`). From the side: the front window ahead of
    the line between its first row of seats and the next (`frontRowEnd`), else the one behind;
  - the rear window is now a pane (before plan 94 a round there set nothing);
  - the server needed no change: the hit carries its pane, `shotDamage` breaks it.
- **The model** (`tp/car/glb.ts`):
  - at load each glass mesh is tagged with its pane (`userData.pane`, copied to two-pass twins):
    - `glass_ws` is the windscreen;
    - each door's glass is its window;
    - the boot's or the back doors' glass is the rear window;
    - the body's own glass (one mesh in the file: on the saloon its rear window and both quarters) is split by
      the way each triangle faces;
  - cracked: a crack laid over that pane (a copy of its glass a hair off it, a star in the middle reaching its
    edges). The windscreen keeps its own (cracked, badly);
  - gone: its glass and crack hidden. On a parked near car too: glass is never merged into a still model; a mid
    one is made again when its damage changes, the gone pane left out;
  - a window wound down still hides a door's glass (`paneDown`), never the quarter's fixed glass;
  - `paneAt(i)`: a pane's middle, for the shards.
- **In the world** (`car/cars.ts`, `car/fx.ts`):
  - `Shards`, one instanced mesh for every car: little triangles of glass tumbling down, glinting, lying 7–12 s
    where they fell, then gone:
    - a pane gone throws 28 (side) or 46 (windscreen, rear) out of its frame;
    - cracked, 3;
    - a round through glass, 5 where it went in;
  - for a parked car too (`partsSeen`: what broke since I last saw it);
  - the sound: gone, the glass's burst and its shards landing a moment after; cracked, a sharp tick;
  - the cabin's seal (plan 93 S5) by the panes gone: one 0.5, two 0.3, more 0.2, the windscreen gone 0.25.
- **Checks:**
  - tests: `(plan 94 P3)` in `damage.test.ts`:
    - the stages;
    - old saves;
    - the blast;
    - a round picks its pane by the rows;
  - plan 93 S7's mend test sends the new bits;
  - shared 700, client 420, world-server cars 12 pass;
  - in game (`e2e/car-glass.mts`, Ana's revolver into Main Street's first town car):

    | | server | glass shown | crack | shards |
    |---|---|---|---|---|
    | front-right window | cracked | yes | yes | 8 |
    | …again | gone | no | — | 41 |
    | rear-right window | cracked | yes | yes | 49 |
    | rear window (from behind) | cracked | yes | yes | 10 |
    | …again | gone | no | — | 56 |
  - stills: the rear window's star; the rear window gone with the cabin seen through it; the side's front window
    gone and its rear window starred;
  - not tried in game: a driven car's knocks breaking glass (the rules are the same `knock`; tested), and the
    windscreen gone.

## Phase 4 — built (2026-11-16): the wreck

- **What comes off** (`shared car/damage.ts`):
  - a third field in the damage string (`zones|parts|wreck`), `Damage.wreck`, `WRECK`'s 16 bits:
    - each door (FL FR RL RR by its name: `doorSlot`; the van's slide its right rear) hanging off its lower
      hinge, then gone;
    - the bonnet and the boot lid sprung, then gone;
    - the rear bumper hanging, then gone;
    - each mirror off;
  - what's gone hung first; only ever more (`mergeDamage`); an older string reads none;
  - knocks (`knock`):
    - the front: the bonnet sprung past 0.55, off past 0.88 hard (0.97 any);
    - the back: its bumper hangs past 0.3, off past 0.62 (0.45 hard); the boot lid as the bonnet;
    - a side: the door struck (ahead of its middle the front one) hangs past 0.7 (0.55 hard), off past 0.9
      (0.74 hard); its mirror off past 0.4, struck toward the front;
    - on its roof past 0.75 every door hangs;
  - `blowOff` (the doors and the lids) is ready for phase 6's blast;
  - mended with the panels (the wrench or the garage): everything back on.
- **Deeper dents:** past half a zone, its morph pressed past the file's own dent, to 1.4× at 1.
- **The model** (`tp/car/glb.ts`):
  - a door hanging: ajar (at least 0.55) whatever its opening's asked, its back edge dropped (0.24 about its own
    plane), in its `open()` (so a driven car's doors keep it);
  - a lid sprung: never shut past 0.13 (the bonnet) or 0.11 (the boot), even when shut for a mend;
  - gone: its part hidden (doors, lids, the van's two back doors, mirrors);
  - the rear bumper: the file has none of its own (it's in the body's chrome, trim and rubber), so it's split out
    at load (`splitRearBumper`): what's at the body's back end (0.6 m, round its corners) and below the front
    bumper's top + 0.17, made a part `bumper_r` about its middle (morphs kept); it hangs by its right end as the
    front's does. A painted one (none so far) would stay on the body;
  - parked cars: a near one is built again when its wreck changes (so its shadow loses the part too), a mid one
    already was.
- **Into the world** (`car/cars.ts`, `car/fx.ts`):
  - what's newly off falls as a piece (`partsOff`: a copy of the part as it was), on a Jolt crate;
  - a door settles flat on its face, the rest as they were on the car (`Debris.drop(o, v, flat)`: tumbling by
    quaternion now, settling by slerp);
  - 16 pieces at once, each 2 minutes (was 6, 45 s);
  - a lamp broken throws its lens' shards too;
  - for driven cars (mine, others') and parked ones (`wreckSeen`);
  - the driver's client sends its wreck with `car:wear` (and takes the server's); the server merges and keeps it.
- **Checks:**
  - tests: `(plan 94 P2)` in `damage.test.ts`:
    - doors hang then go;
    - lids, the bumper, mirrors;
    - the string and the merge;
    - the blast;
    - the mend;
  - shared 701, client 420, world-server cars 12 pass;
  - `car.spec` 3/3: its first test failed once on the parked car's walk-grid check, and passed on a rerun;
  - `/dev/cars` (`e2e/car-wreck-check.mts`):
    - the front-left door hanging open and dropped;
    - the rear-left gone;
    - the bonnet sprung;
    - the boot lid off;
    - the rear bumper hanging, then off with its corners;
    - the left mirror off;
  - in the world (`e2e/car-wreck-drop.mts`, Ana in Main Street's town car: right-front door, bonnet, boot lid,
    rear bumper and right mirror off):
    - 5 pieces fell, lying at their pose within 5 s;
    - the server's damage `…|0|48930` (the bits, and what hung first);
    - once she's out, the parked car shows them all gone and the left door on;
    - stills: the boot lid flying, the door on its face on the road by the bonnet-less car;
  - not tried in game: a real crash's knocks (the same `knock`, tested), the van's back doors.

## Phase 5 — built (2026-11-16): shots

- **P4, the people inside** (fork F4a):
  - before: a round through a car's glass or door went on, and anyone seated was skipped as a target;
  - now `shared car/shot.ts seatedAlong`: on its way through the car (from where it came in to where it'd go out),
    each taken seat is a person:
    - a torso 0.24 m round from just over the hip to the shoulders;
    - a head (0.13) over it, from `SEATS_OF`'s place and hip height;
    - the nearest along the round takes it, and it stops in them (a shot at a door never reaches the far
      passenger past the near one);
  - the server (`features/cars.ts` `seated()` on a live car's hit, `features/arms.ts`): hurt by the gun's damage
    by distance, ×0.85 through glass, ×0.6 through a door; their body thrown (`hitAt`, `hitYaw`); the shooter
    told (`arms:hit` person, head or not), the one hit too (`dark:hit`);
  - only while the round goes on through (glass; a door to a rifle, or a revolver from the side). A shotgun's
    pellets stop in a door;
  - the car takes more from each round: a panel 0.04 a hit (was 0.025), the engine block 0.09 (was 0.07).
- **P5, a shot tyre** (fork F5a):
  - `Drive.burst(bits)`, called by the driver's client the moment a flat arrives (`wearOn`), by how fast it's
    going (nothing under 3 m/s, full by 20):
    - a front's yanks the steering 0.35 toward it, easing over half a second;
    - a front's kicks the car about its upright toward its side (0.25 rad/s), a rear's harder (1.1: its tail
      swings out the other way);
  - the pull after (`steerPull`): a front flat 0.16 of the lock (was 0.08), a rear 0.05;
  - sparks off a flat's rim on the hard ground at speed, for every car's (`rimSparks`, mine and the others').
- **Checks:**
  - tests:
    - `(plan 94 P4)` in `damage.test.ts`: the nearer front seat, the head, the far seat alone, nobody, the back
      row's line;
    - `(plan 94 P5)` in `car.test.ts`: at 60 km/h in 1 s a front-right burst 1+ m to its right, front-left to
      its left, rear-right its tail swung (0.3+ m), all upright; at a crawl nothing;
    - world-server `(plan 94 P4)`: Bia's revolver through the window by Ana in the driver's seat: Ana hurt
      (100 → 68, a head hit), Bia told "person", a window on that side cracked;
  - shared 703, client 420, world-server cars 13 pass;
  - the bench (sedan, 60 km/h, hands off, throttle 0.3), 1 s after:

    | burst | heading | sideways |
    |---|---|---|
    | none | 0° | 0 m |
    | front right | +11° | 2.6 m right |
    | front left | −11° | 2.6 m left |
    | rear right | 3° | 0.7 m |
  - in game (`e2e/car-burst.mts`, Ana up Main Street at 50 km/h, the front-right's flat bit set as a shot sets
    it, W still held): heading 4° at 0.25 s, 17° at 0.5 s, 32° at 1.25 s (the pull, nobody steering against
    it), into the kerb on the right; the drive's flats 2; rim sparks from then on;
  - not tried in game: a real round into a tyre at speed from another player, and seated hits as two browsers
    (the server test covers the hit).

## Phase 6 — built (2026-11-16): fire and the blast

- **The stage** (`shared car/damage.ts`):
  - `Damage.fire`, the damage string's fourth field (`zones|parts|wreck|fire`), `FIRE`: none, smoke, burning,
    burnt;
  - the server's alone to step: a client's wear never puts it out (`mergeDamage` keeps the furthest);
  - `burnOut`: every pane, the doors and lids off, every side crushed, the lamps out, the engine dead, every tyre
    flat, both mirrors off, burnt;
  - mending: the engine's mend puts the smoke out; burning or burnt, nothing to mend (`nextMend` null).
- **The server** (`features/cars.ts`):
  - heat by the car's object, taken only by a wrecked engine (its front past 0.8, or dead):
    - a round into its engine 2, its front 1, elsewhere ½ (`apply(by)`: the shooter);
    - a crash pressing its front past 0.97: smoking (the heat at 2); a hard crash again while it smokes 1.5;
  - smoking at 2, burning at 5 (its engine dead), blown at 9, or after 25 s burning;
  - burning: whoever's sat in it burnt 6 a second;
  - the blast (`blast`):
    - burnt out;
    - its people out of it;
    - everyone within 9 m knocked down, thrown away from it;
    - hurt by how near (95 at its middle, 0 at 9 m, ^1.3), as a fight's rules have it: set alight by a shooter, or
      they're in a fight;
    - `car:blast` to everyone;
  - burnt out: towed home and made new after 3 minutes with nobody near (someone's own too; `put` clears its
    damage).
- **The client** (`car/cars.ts fireFrame`, `car/fx.ts Fires`, `tp/parts/sun.ts`, `tp/car/glb.ts`):
  - smoking: thick black smoke out of its engine bay (no white steam);
  - burning:
    - 16 flame tongues out of the bay (the phase 0 mock's turbulent blob sprites, normal blending), rising and
      flickering;
    - heavier smoke;
    - an orange flickering light through the Grounds' lamp pool (`tp.fireLights`, as the flares: no new light);
    - its crackle and roar (made from noise till recordings are picked);
  - the blast:
    - a fireball of 46 hot, warm and smoke puffs going out and up;
    - a flash of light falling off over 2 s;
    - a boom (made: a falling thump, a roar of noise darkening, debris rattling);
    - my car's camera knocked if I'm near in one;
    - what's blown off thrown out and up from its middle (on its own fall, not a Jolt crate: a parked car's box
      would hold it), landing 4–7 m out;
  - burnt out (`setBurnt`):
    - every material a charred copy (paint near black, metal dark, matt);
    - glass, lenses, lamps and tyres gone, down on its rims;
    - a thin smoke now and then;
    - made new: all back;
  - parked cars too (`p.fire`): a blast since makes its model again.
- **Checks:**
  - tests:
    - `(plan 94 P1)` in `damage.test.ts`: the wire, the merge, burnt out, no mend, the smoke's mend;
    - world-server `(plan 94 P1)`: crashed past its worst, smoking; two rounds into its engine, burning; two
      more, the blast; burnt out; Bia 3.5 m off knocked down and hurt, Ana 18 m off not;
  - shared 703+1, client 420, world-server cars and arms 30 pass;
  - in the world (`e2e/car-fire.mts`, at dusk; Ana crashed her town car past its worst, then shot its front wing):
    - smoking (`|0|0|1`), burning after two rounds (its light up);
    - the blast after two more (heard: `car:blast`);
    - Ana 7 m off knocked down, 100 → 87;
    - eight pieces thrown 4.5–7 m;
    - stills:
      - black smoke over the bonnet;
      - flames out of its bay;
      - the fireball turning to smoke over the charred car;
      - the burnt-out wreck on its rims, no glass, no doors;
  - not tried: the 25 s burn's own blast, the 3-minute tow and its making new, a driven car's fire with people in
    it (the server's tick does it), the sounds by ear (made, not recorded: the user may want recordings picked, as
    plan 63's).
- **The fire's sounds, recorded** (asked 2026-11-16: "Pick sounds first"):
  - three new car slots, searched on Freesound (CC0), ordered with my pick first, and cut (`tools/sfx-cars-search.mjs`,
    `sfx-cars-mine.mjs`, `sfx-weather.mjs` with `LIST=tools/sfx-cars.json DIR=cars`):
    - `fire`: a burning car's bed, looped (4 candidates);
    - `fire-catch`: the whoosh as it catches (4);
    - `blast`: the explosion (6; one of them, e, five takes);
  - on `/dev/car-sound` → "everything else" → "The fire", to be picked by ear (★, then "copy chosen.json");
  - the game (`cars.ts`):
    - loads them once a car near is on fire;
    - loops the picked bed where each car burns, by distance;
    - plays the catch as it catches, and the blast's take at the blast;
    - the made sounds stay only till they're in;
  - checked: all served; in game `fire`, `fire-catch` and `blast` in, one bed looping while it burns.
  - the user's picks (2026-11-16, `chosen.json`, and `pick` in `tools/sfx-cars.json`):
    - fire **d**: cpolcyn's "Fire 2016-12-21";
    - catch **c**: samararaine's "Bonfire Being Lit";
    - blast **b**: tommccann's "Explosion_01";
  - `/dev/car-sound?group=fire` opens on those alone.

## Phase 7 — built (2026-11-16): the car's UI (A, walnut)

- `car/hud.ts` (new), in the HUD's own pieces (`.cabinet` walnut frames, `.faceplate` paper, its tokens and fonts),
  replacing the old line of keys, the VFD readout and the note:
  - **the plate**, low on the left:
    - km/h big in the book face (lining figures), the gear in its box (AUTO or MANUAL);
    - the revs to the engine's limit, its red from the redline;
    - the fuel (rust under 15 %);
    - the engine: cold, warm, hot, steaming, off, dead, on fire, its bar olive or rust;
    - chips: the radio's station, my window down, chains, locked, each flat by its wheel, smoking, on fire, the
      engine dead;
    - a passenger's: the speed, gear and fuel from the car's wire;
    - not in the cockpit: the dash's own cluster says it;
  - **the car at a glance**, over the plate, once it's taken any (top view, 72 × 120):
    - each side, its nose, tail and roof shaded from the body's own to rust by its dent;
    - each pane whole, cracked (dashed) or gone (its frame, red);
    - the wheels, a flat red; the lamps, out red;
    - a door off (its side open), the bonnet and boot lid off;
    - the steam, the smoke, the fire; burnt out, black;
  - **the keys on a paper slip**, up on the right:
    - for my seat (driver, passenger, toboggan), two to a line as the mock;
    - with the manual's E/Q, the 4x4's K/J, the police car's G;
    - shown 10 s after getting in;
    - F1 shows them again, or puts them away (K was the 4x4's diff: F1 is a new car switch, `keys`);
  - **what to do now** (at a pump, filling, stuck, fuel low, the pets coming) in a pill above the prompt;
  - **on a phone** (touch): the card and the plate side by side, small, under the place's panel; no keys (the wheel
    and pedals are on the screen);
  - its words in English and Portuguese (`carH_…`: the world's own `kHand` and others already said other things);
  - nothing written that hasn't changed.
- **Checks:**
  - in the world (`e2e/car-ui.mts`, Ana in a town car):
    - in: the plate (0 km/h, N, AUTO, fuel 70 %, warm), the keys shown, no card, no old hint;
    - driving: 31 km/h in 1st;
    - knocked about: the card up (its front rust, the windscreen dashed, the front-left wheel red, smoke); the
      chips FM 88.4 · window down · flat · front left · smoking; the engine steaming;
    - the keys gone after 10 s; F1 back; F1 away;
  - `PHONE=1` (844 × 390, touch): the two side by side under the place's panel, clear of the bar and the wheel; no
    keys;
  - client tests 420 pass;
  - not looked at: the cockpit view's (the plate away), a passenger's, the toboggan's, the note in a real stop at a
    pump.

## Phase 8 — built (2026-11-16): plan 93's gaps

- **G1, the Daybreak from a seat:**
  - its charge (`arms:charge`) asked the walker's aim flag and a free body, so a seated passenger's was refused;
  - now a passenger's is taken as their shot is (`carShot.seatOf`); the driver's the revolver's alone (F7);
  - the client already gave the guns the window's aim.
- **G2, long guns out of a window** (the shotgun, AK, sniper, Daybreak):
  - `seatedGun` gives a long gun's fore-end (`fore()`, the life gun's own fore point, as `gripOnFore`);
  - aimed out of the window it's shouldered: its grip 0.30 out from the shoulder (a pistol's 0.52);
  - the other hand on its fore-end (`reachTo`), as a walker holds it;
  - checked in the world (`e2e/car-gaps.mts`, Ana in the passenger's seat, the shotgun, aiming straight out and a
    little forward): from her own view the shotgun comes up shouldered, out of her window over the street. A still
    from outside the car can't be had: the game culls what its own camera doesn't see, and a seated player's looks
    out of the window.
- **G3, lids seen by others:**
  - the bonnet up for a mend already was everyone's (the mender's `busy` `mend:<id>:…`);
  - now the boot's too: `car:boot` (open, shut) sets its opener's `busy` `boot:<id>` (the reach and the lock as
    the boot's own, `storeObj`);
  - shut when they walk off or the car goes (`bootsShut`, each tick);
  - every client lifts the lid of every boot open (`lidsFrame`).
- **G4, ruts for someone joining later** (F9b):
  - the driver's client sends its front wheels' ruts in deep snow and mud, a 1.5 m stretch at a time, every 2 s
    (`car:ruts`, cm);
  - the server keeps them 10 minutes (4000 at most), each a step or two long and near the car it's from;
  - a client asks once it listens (`car:ruts-hello`: sent on joining it was lost, before the client's handler);
    they're laid in its ruts (a wheel finds them) and their marks drawn (`Tracks.stamp`).
- **G5, the tyre change:**
  - for the changer's 20 s (`busy` `mend:<id>:tyreN`, from when each client first sees it):
    - a jack set under the sill by the wheel and wound up (the first 15%), the corner up 6 cm (`liftCorner`: the
      body turned about the far corner);
    - the wheel off (30–55%) and the spare on (`wheelShown`);
    - wound down (the last 15%);
  - the jack's geometry and materials let go after.
- **G6, a driven car's empty seats** (F10b):
  - a car its owner locked stays locked as it's driven (the lock no longer cleared on getting in): its empty seats
    refused to anyone without its keys ("locked");
  - its driver locks or unlocks it from the seat on O (`lock`: K was the 4x4's diff), on the keys' slip for an
    owned car;
  - plan 93 S9's test now says so.
- **Checks:**
  - world-server tests:
    - S9 (still locked driven, a stranger refused, unlocked from inside, then in);
    - `(plan 94 G3, G4)`: a boot opened, shut walking off; ruts said by a driver reach a later client, the far
      stretch left out;
  - world-server cars 15, arms 16, shared 704, client 420 pass;
  - in the world (`e2e/car-gaps.mts`):
    - a town car's front-right tyre shot out, then changed: at 3 s the corner up 3 cm into its lift, the jack
      there; at 8 s the wheel off; done, all down and mended;
    - stills of the jack under the sill and the empty arch;
  - not tried in game: G1's charge from a seat, G3 with two people, G4 with a real late joiner, G6 from two
    clients (the server tests cover them);
  - the world server's watch had gone stale after the edits (restarted, as memory has it).

## Phase 9 — checks (2026-11-16)

- **The e2e specs near it**, one at a time:
  - `car.spec` 3/3, `car-look.spec` 1/1, `pets-car.spec` 1/1;
  - `arms.spec` 1/1 and `inventory-pack.spec` 1/1 (with `YUTOPIA_GPU=1`: without it they skip).
- **The car probes**, all nine again on the final code, each as when its phase was built:
  - `car-tyres` (X on the prompt), `car-push` (0 m nose, side, tail);
  - `car-glass` (each pane cracked then gone, 41 and 56 shards);
  - `car-wreck-check`, `car-wreck-drop` (5 pieces lying, kept for everyone);
  - `car-burst` (4° at 0.25 s, 18° at 0.5 s), `car-fire` (smoke → burning → the blast, 8 pieces 4.6–7.5 m out);
  - `car-ui`, `car-gaps` (the tyre change through to mended, the shotgun shouldered from the passenger's seat).
- **The production build**:
  - every budget ok;
  - the world page 487.9 of 488 KB (0.1 to spare);
  - `yutopia-car` 52.2 of 120 KB.
- **A frame-time drive on Low** (`e2e/car-town-drive.mts`, the production build on :3107, `FIRE=1`: two cars
  burning ahead along Main Street, their smoke and light, and 3 s in a blast with a parked car's parts thrown):
  - the first fire near was a 210–440 ms frame: its sprites' and the shards' shaders made on first draw. Now they're
    made once, in the background, when the cars start (`warmFx`: `compileAsync` with a flame, a blast puff and the
    shards' mesh shown for it);
  - after:

    | | fps (mean) | frames over 50 ms |
    |---|---|---|
    | the plain drive | 105.5 | 4, the route's land coming in (~80 ms) |
    | with the fire, 4 runs | 81–89 | 0, 0, 5 (the land's, ~100 ms) and 6 (one 472 ms, a second after the blast, the first run after the server's start: not seen again) |
  - the fire on screen costs ~15% on Low.
- **The memcheck** (4 cycles, the production build):
  - the browser's all ok: heap, geometries (3399 → 3459, +170 allowed), textures, programs (370 → 372, +3 allowed),
    Jolt, bodies, blocks. Plan 93's open "geometries/programs OVER" doesn't come back;
  - the world-server's resident memory OVER (220 → 347 MB, +60 allowed), its heap in use flat (164 → 168 MB): as
    noisy before plan 94 (this session's earlier runs on plan 93's code: 254–575 MB, the same reserved heap
    climbing);
  - a Colyseus schema warning for a folk (`previousRef`) in its log, not the cars'.
- **The debris let go** (`e2e/car-debris-freed.mts`, three parked cars' parts, 16 kept):
  - 16 pieces and 16 Jolt crates;
  - two minutes on: 0 and 0, their groups off the scene (39 → 55 → 39), the geometries back under the start;
  - the scene's other new children were parked cars' models come near.
