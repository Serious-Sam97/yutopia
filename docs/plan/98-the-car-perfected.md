# Plan 98 — the car, perfected

Asked 2026-11-17, after plans 92–97 (the cars on Jolt, in the world, beaten up, and their memory), all pushed. The
user: "make it perfect, down to the minor details of what we already have, and improve it even more". At least 20
phases. One named: **how a person gets into a car — a nice animation; what we have today is trash.**

Status: **planned 2026-11-17; forks decided 2026-11-17 one by one** (below): recommended for F1–F6, F8, F9, F12;
**F7** a reflection probe on High with its own Settings switch; **F10b** real AI traffic on Jolt; **F11c** every
phase straight through. Next: phase 0. Investigated from the code (four read-only audits: handling
and camera, sound, visuals, the world) and from a video of today's get-in and get-out (`e2e/zz-getin-video.mts`, a
recording copy of `e2e/car-getin.mts`).

## Where we are, from the code and the video

### Getting in and out (plan 93 phase 4) — what the video shows

`car/cars.ts carAct` (2802–2915) is three numbers over time: `across` (how far out of the seat, sideways), `out`
(the blend from the seated pose to standing) and `yaw`. The body is the *seated* pose (`car3`) slid sideways along
the seat's hip line through the door, blended toward standing. There's no step, no foot planted, no head ducked,
no hand on the roof. The video, frame by frame at 10 fps (Ana, the Main Street sedan, driver's side):

1. **A pop before the act.** On X, for about 0.3 s, she's drawn in a *sitting* pose, standing in the air on the
   pavement, and the camera turns to face her from the car's place. Then it cuts.
2. **The camera cuts** to the car's chase cam at once, and the car HUD (speed, gear, the keys slip) comes up
   while she's still outside.
3. **In sideways, already sitting.** She stands at the door with a hand on it for a moment, then turns and is
   carried in on a straight line, knees bent, feet dangling over the sill, the whole seated body sliding through
   the opening. The door stays wide open a beat after she's in, then shuts.
4. **The act is fast:** 1.5 s door-to-shut (`ENTER_S`). A real entry, unhurried, is 2.5–3.5 s; games' (GTA V,
   RDR2, Mafia) are about 2.5–3 s, skippable.
5. **Getting out is unseen.** On X the camera cuts to the walker's camera on the car's *far* side, low and close
   to the body; she gets out behind the car, hidden by it. The HUD drops at once.
6. **The passenger's side and across** (F3a) plays, but others see a plain driver's-door entry (plan 93's known
   gap: `via` isn't on the wire).
7. Plan 93's own "not done": nobody's walked round a door's swing; vehicles with no doors (snowmobile, toboggan)
   get the plain sit-down; the tractor and snowcat have no climb.

### The camera (`tp/car/camera.ts`)

- **Reversing swings the chase camera ~99° to the side** (72–77): above 3 m/s it leans toward the course, and in
  reverse the course is ~π off the heading, so `want = heading ± 0.55π`. At exactly π the sign can flip: the
  camera jumps sides. The most visible camera bug.
- No collision with walls or the ground (87–92): in alleys, garages, beside a wall or over a crest the eye goes
  through buildings or into the hill.
- The height is world-up: uphill the car hides the road.
- The shake is `Math.random()` every frame (94–95): jitter at the frame rate, stronger at 144 Hz.
- Look-back eases through the side view (rate 12, ~0.25 s); a cut reads better.
- Yaw follows at a fixed 3.2/s at every speed: floaty when parking.
- The hood view has no motion and no speed FOV; the FOV is eased twice (here and `view.ts:2760`).
- Cockpit sway and the air freshener take g per render frame from `s.v`, which moves on 1/60 steps: spiky above
  60 fps (`rig.ts:159–165`).

### The drive (`shared car/drive.ts`, `assist.ts`) and the controls (`car/controls.ts`)

- **No engine braking in auto:** Jolt's auto box drops to neutral off the throttle (drive.ts:211); lift-off and
  downhill feel are missing, the lift slide is synthesised (`liftGrip 0.86`).
- ABS is one number for all wheels (`clamp(1−lock·0.5)`), no pulse, off under 2 m/s; TCS off under 1 m/s.
- The rev limiter cuts to zero from last step's rpm (chatter).
- Pitch: no dive or squat beyond the springs; air levelling strong (`airLevel 14`, `airDamp 7`): every jump lands
  flat; short hops get no landing dip (`airT > 0.25`).
- `sw.cv = 0`: the suspension's speed is thrown away, so nothing can react to how hard a bump hit.
- No kerb as a ground. Dead `if` at drive.ts:466–470.
- Pad: triggers have no deadzone (a trigger resting at 0.03 beats the auto-hold); square stick deadzones; the pad
  steers at a flat 8 rad/s at every speed; the right stick pans (rate), not looks (position).
- Rumble: hits, ground and slip only; nothing for shifts, ABS, the limiter (promised in controls.ts:180).

### Others' cars (`car/playback.ts`)

- Past the newest state the position runs on along `v` but the rotation is held: a car mid-corner slides sideways
  without turning, then snaps. The yaw rate `wy` is on the wire but dropped (`cars.ts:2325`).
- Steering and the springs step at 20 Hz (taken from one sample, not lerped).
- Their wheels spin from body speed only: no burnout, no locked wheel, though `slip` is sent.
- Extrapolation stops dead at 500 ms.
- The brake lamp is on/off (mine is graded).

### The sound (`car/sound.ts`, `sound-bank.ts`, `public/sfx/cars`)

- **Engines missing rpm points:** the heavy diesel (snowcat, plough, tractor) has loops at 1909 and 2511 rpm only
  (idle plays the 1.9k at 0.34×); the V8 has two loops (×0.47 to ×2.2); the light diesel is off-load only; the
  four's exhaust off-load tops at 2432 (its pitch stops rising past ~5350); the far mic has one point.
- **Others' cars are much poorer than mine:** no starter, throttle faked from rpm (no on/off-load, no pops), no
  crash sounds, no indicator, handbrake, scrape or shift; one ground sample for four wheels.
- **A parked car's doors are silent:** `clunk()` needs a running engine's sound.
- The engine-off tick bypasses the panner (`sound.ts:607–612`): ~9 s of ticking, centred, full level, wherever
  you walk.
- No Doppler; no reverb or occlusion (the footsteps already have a room reverb, `steps.ts:388–409`).
- Idle is static; pops are one take for every voice above 3800 rpm; the gear whine a synth triangle; the limiter
  always the synth gate (the recorded `limiter` and `rumble` slots are never played).
- The indicator relay isn't in step with the lamps; others' indicators unheard.
- No suspension thumps or creaks; crashes the same for a hatch and a tractor (`j/9000`), plastic hits as metal,
  no debounce.
- Horn: take 0 always, 30 ms release. One door sound for every door, not placed; `lid()` never called (26 boot and
  bonnet takes unused); the belt clicks for the driver only.
- Weather isn't on the roof (no rain, no hail); no radio sound in the car's own space; no key chime.
- Inside means the cockpit cam only: in third person my own cabin beds play at cabin gain. The bay mic cuts at
  20 m instead of crossfading.
- The toboggan is silent (no engine voice → no sound object, its `runners` bed never plays).
- Two window paths can double up.

### The look (`tp/car/glb.ts`, `rig.ts`, `vfd.ts`, `car/fx.ts`)

- Indicators blink hard on/off; brake lamps light nothing; the reverse lamp lights nothing; only two real
  headlight spots in the scene (mine, or the nearest lit car), the beam a plain 20 m cone, no cut-off pattern.
- **The dome light does nothing:** `Lights.dome` is passed everywhere and never read.
- The cluster: a 10 Hz canvas VFD, fuel and temperature needles; no key-on self-test, no warning lamps' check.
- Wipers sweep but the snow on the glass ignores the blade (a lerp between three baked amounts); no drops running
  with speed; only the windscreen gets weather; mist inside reuses the snow texture.
- No spoke blur (strobing); the coil springs don't move with the wheel; brake discs never glow.
- Grime is one band up the sides; no spray behind the wheels, no snow caked in the arches; water is sound only (no
  splash, no bow wave).
- **Reflections are a three-colour sky gradient:** paint and chrome reflect no lamps, buildings or ground.
- LODs switch hard at 14 m / 70 m: visible pop.
- Plan 92's own leftovers: the snowcat's and snowmobile's belts don't move; steel and cover wheels are flat dishes;
  the work vehicles' cabs are rounded boxes; the dash face is a flat slab; the near model is at its 90k budget.

### The world (`world-server features/cars.ts`, `grounds-life.ts`, `long-road.ts`, `tp/parts/vehicles.ts`)

- **The town's traffic is scripted:** the visitor sedan, the shuttle, the plough and the bus ride route splines at
  0–17 m/s, no physics. They stop for people with one probe circle 3.6–4.5 m ahead (misses bends and people
  stepping in from the side, and pets), **drive through parked cars** (only players and live vehicles are
  obstacles), honk after 1.2 s and never go round.
- They show nothing: no indicators (`ind: 0`), brake lamps only when stopped *at night*, turned on yaw only (no
  pitch or roll on slopes, no front-wheel steer), **no driver**, no engine sound (`grounds-sound.ts` has a horn
  only).
- **A dropped driver's car rolls on through walls:** no state for 2.5 s (`QUIET_MS`) and the server rolls it on a
  straight line at 3.5 m/s² decel with only the land's height — up to ~130 m from 30 m/s, through buildings and
  water. A backgrounded tab does the same, then snaps back.
- **A passenger can't take the wheel** (no seat swap: `car:enter` while seated is "busy"), nor get out of a car
  still coasting (`OUT_V` 2.5 m/s). Nobody can jump out of a moving car.
- An owned car left mid-road is never towed; a dry owned car is stuck (fuel only at a pump, no jerry can).
- Parking outside a bay keeps the exact pose (no kerb snap).
- **Car-to-car crashes have no owner:** each driver hits the other as a kinematic copy drawn 110–600 ms in the
  past; each dents only itself; the two sides disagree. Parked cars shoved get no dents.
- Every client gets every car's 20 Hz patch (no distance culling).
- Seen only by the actor: the boot lid up, the slide across, the arm aimed from a seat before the shot, the
  radio.
- **Refusals with no words:** the server sends `chains`, `rope`, `tied`; the client has no `carNo_chains/rope/tied`
  (the toast shows the key). **The car HUD is English only** (`KM/H`, `FUEL`, `ENGINE`, `AUTO`, `MANUAL` in
  `car/hud.ts`).
- The buy panel sends and forgets: no pending state, refusals as toasts, the one-car swap retires the old car
  with no confirm.
- The minimap shows only my own car: no others, no shuttle or bus, no heading.

## The idea

Two kinds of work, in the order the user named them:

- **The act** (phases 1–5): getting in and out made a real animation — walked to the door round its swing, the
  door opened by the hand and swinging with it, a foot in, the head ducked under the roof, the hand on the frame,
  sat, the other leg in, the door pulled shut; out the same backwards, seen. The camera stays with the person
  through it and settles into the car's view as she sits.
- **The details** (phases 6–26): everything the audits found, grouped so each phase is one thing you can feel,
  hear or see, and checked by a probe or a still.

## Forks (decided 2026-11-17 — asked one by one)

- **F1 how the act is made:** (a) key poses fitted per body with IK, the feet planted · (b) retargeted CC0 mocap ·
  (c) Blender clips per body class. **a.**
- **F2 its length:** (a) about 2.8 s, X skips, moving off before sat cancels · (b) brisk, 2 s · (c) unhurried,
  3.5 s. **a.**
- **F3 the camera through it:** (a) the on-foot camera stays, swings behind as she sits, settles into the car's
  view; out the reverse, on the door's side; the HUD fades in once sat · (b) a short framed door shot · (c) the
  car's camera at once. **a.**
- **F4 a door left open:** (a) swings on its hinge with the car (inertia, check-strap detents, slams on a brake,
  half-latch), the same on every screen · (b) only hands move doors. **a.**
- **F5 out of a moving car:** (a) a stumble under ~15 km/h, a dive and roll above, hurt by speed in fight rules ·
  (b) the roll, never hurt · (c) refused while moving. **a**, and the user: *"remember we use Jolt, so enjoy"* —
  the roll is the Jolt ragdoll (plan 58 phase 5's falls) thrown with the car's velocity, then getting up.
- **F6 starting the engine:** (a) a short ritual: the dash's sweep and lamps, the starter ~0.8 s (longer cold),
  heard by others; throttle skips the wait · (b) instant, with the sweep · (c) as today. **a.**
- **F7 reflections:** (a) a probe on Medium and High · (b) everywhere · (c) fake highlights. **The user: a probe on
  High only, and its own switch in Settings** (on by default on High, off elsewhere; the player can turn it on or
  off by hand on any quality).
- **F8 the engines' missing rpm points:** (a) a new CC0 search, picked by ear on `/dev/car-sound` · (b) stretch the
  takes we have. **a.**
- **F9 two driven cars crashing:** (a) settled once, both dented and shoved · (b) as today. **a.**
- **F10 the town's traffic:** (a) the scripted cars polished · (b) **real AI on Jolt. b** — phase 23 becomes AI
  drivers on the same physics as ours.
- **F11 the pace:** (a) the act signed off phase by phase, the rest straight · (b) every phase signed off ·
  (c) **all straight through. c** — every phase built in order without stopping; stills, video and notes per
  phase; the report at the end. A real fork the plan can't settle still goes to the question tool.
- **F12 the order:** **the act first** (0, then 1–5), then 6–27 as written.

## Phases

0. **Measures and references.** The get-in video probe kept (`e2e/car-act-video.mts`: a fixed outside camera
   too, not only the player's); each body's door opening measured (sill height and width, roof line, the A-pillar,
   the seat's hip) for the act; the chase cam's worst places (alley, garage, crest); a reverse run; the sound
   gaps listed by ear on `/dev/car-sound`. Reference stills of a real get-in (the beats and their timing).
1. **The act I — to the door.** The walk ends at the handle on a stride, round the door's swing (a door spot
   outside the arc), the near hand rising on the last step. The 0.3 s sitting pop fixed. The on-foot camera and
   HUD stay until she's in.
2. **The act II — in.** Key poses fitted per body with IK: the hand opens the door and it follows the hand's arc;
   a half step back out of its swing; turned, the near hand on the roof edge or A-pillar; the inside foot over the
   sill, planted on the floor; the head ducked under the roof line (measured per body); the hips down onto the
   seat; the outside leg swung in; the inside pull reached; the door shut with a tug. Per body: the van and the
   pickup step up with a grab, the hatch ducks more, the estate's long rear door. About 2.6–3 s (fork), X skips,
   moving off before sat cancels.
3. **The act III — out, seen.** The door pushed open from inside; the outside foot planted on the ground; a hand
   on the door frame; up and out, ducking; a step clear; turned; the door pushed shut (a hand, or a hip when
   carrying something long). The camera eases from the car's view to the on-foot one *on the door's side*.
4. **The act IV — every seat and vehicle.** Back seats by the back doors; across from the passenger's side seen
   by others (`via` on the wire); the snowmobile and toboggan straddled (a leg over); the tractor, plough truck
   and snowcat climbed by their steps and grab handles; out of a moving car (F5a): a stumble under ~15 km/h, above
   it a dive and a roll on the Jolt ragdoll thrown with the car's velocity, then up (hurt by speed in fight
   rules); passengers too.
5. **The camera through the act.** The on-foot camera swings round behind as she sits and settles into the
   chase/hood/cockpit view; out, the reverse. No cuts. The HUD fades in when she's sat, out as she stands.
6. **The door itself.** A door not held swings on its hinge (inertia, a hinge spring, the check strap's detents):
   it swings with the car's acceleration if left open, slams on a hard brake, half-latched if pushed softly.
   Others see the same angle. Door sounds with the engine off, each from its own door; the boot and bonnet heard
   (`lid()`).
7. **Starting and stopping.** The key turned: the dash's self-test sweep and warning lamps for a second, the
   starter cranking (longer when cold), heard by others; the dome light on as a door opens, fading after; the
   belts clicked for every seat and undone on the way out; the key chime with a door open. Off: the engine
   ticking as it cools, from the car's place.
8. **The chase camera.** The reverse swing fixed; walls and ground (a cast from the car to the eye that pulls in,
   the land's height); pitched a little with the slope; stiffer at low speed; look-back a cut; the shake smooth
   noise at 8–15 Hz; short hops get a landing dip.
9. **The hood and cockpit views.** A stiff spring for bumps and braking on the hood view; a little speed FOV in
   both; one FOV ease, not two; the g for the head and the freshener from the fixed step; the right stick looks
   by position and springs back.
10. **The drive I — the engine.** Engine braking off the throttle in auto (and downhill); the limiter a soft cut;
    launch from a stop without a skid by default (the keyboard's all-or-nothing throttle eased in first gear).
11. **The drive II — the weight.** Dive under braking and squat on the throttle seen in the body; ABS and TCS by
    axle, with a pulse you feel; air control a little looser (throttle and brake pitch it), short hops dipped;
    the suspension's speed kept (`sw.cv`) for the sounds, the rig and the rumble; kerbs as a ground (a bump and
    a sound).
12. **Controls and rumble.** Trigger deadzones; radial stick deadzones with an outer one; the pad's steer rate by
    speed; rumble for shifts (a 40 ms kick), the limiter, ABS, kerbs and landings.
13. **Others' cars, smooth.** The yaw rate integrated past the newest state; steering and springs lerped; their
    wheels spun by their slip (burnouts, locks); extrapolation fading, not stopping; the brake lamp graded.
14. **The engines' voices.** The missing rpm points found and cut (the heavy diesel's idle to 1400, the V8's four
    a load, the light diesel's on-load, the four's high off-load, the far mic); idle alive (slow jitter, a per-car
    offset, the V8's lope); pops by voice and rpm with a crackle trail; the recorded gear whine and limiter. The
    user picks by ear on `/dev/car-sound`.
15. **Others' cars heard as mine.** Throttle on the wire (on/off-load, pops); their starter and stop; their
    crashes; their indicators, shifts, handbrake and scrape; four wheels' ground; the toboggan's runners.
16. **The space around the sound.** Doppler for passing cars; the steps' room reverb and an occlusion low-pass
    for cars; the bay mic crossfaded; the cabin mix right in third person; rain and hail on the roof; the rumble
    strips; suspension thumps and a body creak from the kept `sw.cv`; crashes by mass and material, debounced;
    the horn's takes and a release; one window path.
17. **The lamps.** Indicators with a bulb's ramp and the relay in step (mine and others'); brake lamps lighting
    the ground behind and the car behind (a cheap light or a decal) and the third brake lamp; the reverse lamp's
    pool; a headlight pattern (the low beam's cut-off, a hot spot) and light pools under other lit cars; the
    dome light working; flare on oncoming lamps.
18. **The dashboard.** Needles and the VFD eased between redraws; the key-on sweep; switch backlights; the dash
    face given shape (it's a flat slab).
19. **Glass and weather.** The wiper's blade clears a real arc (a mask by its angle), slush at the edge of the
    sweep; drops running up the glass with speed; frost and snow on the side and rear glass when parked, the rear
    demister clearing in lines; mist inside its own haze, cleared from the vents.
20. **Wheels and chassis.** Spoke blur past ~30 km/h; the coil springs moving with the wheel; brake discs
    glowing after hard braking; the tyre's bulge at the contact patch; the belts of the snowcat and snowmobile
    moving; the steel and cover wheels given depth.
21. **Wear, snow and water.** Grime by arch and on the tail, rain-washed streaks; snow caked in the arches and
    falling off as it warms; spray behind the wheels on wet roads; a splash and bow wave into water; the exhaust's
    shimmer and drips.
22. **Reflections and detail levels.** A small reflection probe caught near me every few seconds (street lamps,
    buildings, the snow) instead of the sky gradient (F7: on by default on High; a "Car reflections" switch in
    Settings to set it by hand on any quality); the LODs crossfaded by dither over ~0.3 s.
23. **Traffic on Jolt (F10b).** The town's cars (the visitor, the shuttle, the plough, the bus, and more on the
    roads) driven by AI drivers on the same `Drive` as ours, stepped by the server (or the nearest client, as the
    phase decides from a measure): a route along the roads' splines as a racing line with a speed plan (bends,
    junctions, stops), a steering/throttle controller with the assist layer, sight of people, pets and parked or
    driven cars (from the side, on bends), waiting, then going round, the horn; a driver sat in each; their
    engines heard as ours; indicators at turns and stops, brake lamps whenever they slow; crashes and damage as
    ours. Measured for the server's step cost and the wire before it's on for every road.
24. **When the driver's gone.** A dropped driver's car brakes where it is (or a passenger's client takes its
    sim), never rolling through walls; a backgrounded tab the same. A passenger slides across to the wheel
    (`car:swap`); getting out of a car still rolling (a stumble at a walk's pace, a roll above it — with phase 4);
    an owned car left in the road towed home after a while and its owner told; a jerry can for a dry car; parking
    off a bay squared to the kerb.
25. **Two cars meet.** A crash between two driven cars settled once: the faster-to-say side's contact sent to the
    other, both dented by it and both feel the shove; parked cars dented when shoved. Cars far off patched less
    often (distance culling). The boot lid, the slide across and the radio seen and heard by everyone.
26. **The words and the panels.** The missing refusals (`chains`, `rope`, `tied`); the car HUD in both languages;
    the buy panel waits for the server's answer and shows a refusal in place, and confirms before retiring the old
    car; the minimap shows other cars, the shuttle and the bus, with a heading.
27. **Checks.** The probes and specs near each phase (not the whole suite), stills and the video of the act, size
    limits, a Low drive, the memcheck's car life.

## Guardrails (from earlier plans)

- Waiting on events, never fixed sleeps; a probe cycle about a minute (plan 97).
- The dev world is shared: `ListAgents` and `/bin/ps` before e2e or a `yutopia-world` restart.
- Hands judged from close stills, never from far (plan 93 S2).
- The page at 488.1/489 KB: budgets raised as needed, measured and noted.
- Colyseus' 64 fields: anything new on the wire packs into existing fields.
- New items into the API's `Survivor::STACKS`.
- Compare three objects by identity, never deep-equal.

## Phases 0–3 — built (2026-11-17): the act, measured, in and out (and phase 5's camera)

- **Measures** (`tp/car/glb.ts openingOf`): a door's opening off the shut door's own meshes, its mirror left out — the
  front (hinge) and back edges, its foot and top, its outer face, the top of its glass (the roof's edge). The sedan's
  driver's door: x −0.61…0.50, foot 0.22, glass top 1.46, out 0.93; the seat's hip (0.36, 0.47, 0.42), floor 0.31.
  - Two old bugs found measuring: `sillOf` cached `null` when asked before the model's file was in (and measured
    the glass with the door open: 1.65 m out) — both measured shut now, cached only once the model's in.
- **The act** (`car/getin.ts`): every beat planned in the car body's frame from those measures — the hips' path,
  each foot planted, stepped or swung over the sill (keys through time, Hermite, a planted key arrived at and left
  from rest), which way she faces, the duck, the lean, which hand holds what, the door's opening.
  - In, `ENTER_S` 2.8 s: from where the walk ended onto the door's spot; the near hand on the handle, the door
    pulled open on a half step back (to ~41°, as people do — at 60° its frame was out of reach); let go, turned and
    stepped into the gap, the outside hand on the door's frame; the inside hand on the roof's edge as the inside
    foot goes over the sill onto the footwell's floor; ducked, the hips down and in; the inside hand down onto the
    wheel (a passenger: the seat's back); the outside leg swung in; the pull reached, the door shut; settled into
    the seat's own pose.
  - Out, `EXIT_S` 2.5 s: the pull, the door pushed open; the outside foot out onto the ground; up off the wheel,
    the roof's edge as she comes up, ducked; the inside foot out; stood in the gap; a step back facing the door's
    frame and the door pushed shut by it; a step on to where the server put the walker (only on this side, clear
    of the car).
  - The body (`acts.ts carStep`): the legs solved to the feet — the spread from the hip's joint, then the two-bone
    leg in its plane —, the toes pointed as a foot's lifted, the duck shared by the hips, the back and the neck;
    blended into `car3` (the seat's own) as she settles.
- **The walk** ends where the act begins (`stanceOf`: beside the door's back edge, measured off the parked model).
- **Phase 5's camera, built here:** the on-foot camera's offset off my head kept as I asked to get in, so the
  camera follows me through the act and eases into the car's over its last second (no cut); the HUD once I'm sat;
  out, the on-foot camera turned to look at the car from the door's side (it was on the far side). The car can't
  be driven or started while I'm getting in (the handbrake held); a move in the first 1.2 s lets go of it (out at
  once, no climbing out); X again skips to sat.
- **Checked:** `e2e/car-act.mts` (the act frozen at moments — `__actAt` — and shot from beside the door, the front
  and behind; `DBG=t` prints each hand's target and where its wrist got to) and `e2e/car-act-video.mts` (in real time
  from the player's view, `DOORS=1` logs the doors). Client car and chars tests 41/41, typecheck clean.
- Left for phase 4: a slung long gun isn't drawn on the act's body (it appears with the walker after); the car's
  prompts (the glove box) show while getting in.

## Phase 4 — built (2026-11-17): every seat and vehicle

- **Across from the passenger's side, seen by everyone:** `car:enter` says `via` (the door's seat); the server
  keeps it on the vehicle (`Vehicle.via`, int8, −1 their own) for the new driver; others' screens take it from
  there instead of guessing from where the server had them (plan 93's known gap).
- **Tall cabs climbed** (the plough truck, the snowcat, the tractor): the floor over a knee's height puts her on a
  step in the gap (`base`, up to 0.75 m), up from the ground and down to it again; hands up on the frame.
- **No door — straddled** (`straddleAt`: the snowmobile, the toboggan): beside it facing its front, the near leg
  swung up and over the seat, down onto it, the other foot onto its rest, a hand on the saddle; out backwards.
- **Out on the move (F5a):** X at speed asks `car:leave {jump}`: out at once (no climbing out), the server puts
  them by their door and throws them along its way — under 15 km/h a stagger (`hitAt`), past it down and rolling
  on the ragdoll (`fellAt`, plan 58's falls on Jolt), hurt by how fast only in a fight; the car rolls on. Asked
  without `jump`, still refused ("moving").
- Not while getting in: the glove box's prompt.
- `e2e/car-act.mts KIND=<kind>`: the act on another vehicle, its cameras sized to the door; waits for the model.
- Checked: stills of the plough truck's climb and the snowmobile's straddle; world-server car tests 24/24 (new:
  `(plan 98) in by the passenger's door …; out on the move …`); typecheck clean.
- Left: a slung long gun isn't on the act's body (it shows with the walker after).

## Phase 5 — built with phases 0–3 (2026-11-17): the camera through the act

(See phases 0–3.) The on-foot camera's offset off my head is taken as I press X, kept on me through the act, and
eased into the car's over the act's last second; the HUD comes up once I'm sat; out, the on-foot camera is turned
to look at the car from the door's side. Out on the move, the X key (the car's `exit` switch) throws me out.

## Phase 6 — built (2026-11-17): the door itself

- **On its hinge** (`car/door.ts swingDoor`, F4a): a door let go open swings by the car's acceleration in its own
  frame (a hard brake flings a front-hinged door to its stop, pulling away slams it), the air at speed (pressed
  shut), the check strap's detent half open, its hinges' damping and friction (at rest it stays where it was left),
  its stop (a bounce), its latch (shut with a clunk as hard as it came in; slower, left ajar). Held by a hand, it's
  where the hand has it; opened by the old timer (someone seen getting in with no act), shut by it.
- **Out on the move:** the door flung open behind them, swinging from there.
- **Heard with the engine off, each from its own door** (`bodyShot`: a recorded take placed where it is, its level by
  distance; the takes asked for ahead): opening, shutting, latching. **The boot and the bonnet heard** (their slots,
  26 takes never played till now): the catch going up, the slam coming down.
- Checked: `door.test.ts` (still at rest, flung open braking, slammed latched pulling away, pressed shut by the air);
  `e2e/car-jump.mts` (out at 27 km/h: down on the ragdoll, her door flung to its stop and staying there as the car
  rolls to a stop); typecheck clean.

## Phase 7 — built (2026-11-17): starting and stopping

- **The key (F6a):** once sat, the starter cranks 0.8 s (+0.7 cold) before the engine runs; the throttle cuts it to
  0.3 s more. The recorded starter take is started part-way through its crank so it catches when the engine runs
  (`CarSound.start(cold, catchIn)`). Nothing drives or starts while getting in.
- **The dash's self-test:** from the key, the rev bar and the speedo swept up and back over a second, every lamp
  lit, the dash lit while cranking (`RigState.key`).
- **Heard by others:** the engine's flag goes up as the starter turns, so other people's screens play the starter
  on its rise (only switched on near them, not on coming into earshot); on its fall the stop and the cooling ticks.
- **The cooling ticks from where the car is** (they went straight into the ears, full level, wherever one walked).
- **Belts for every seat:** clicked home as each settles, undone as they start out (the driver alone before).
- **The key's chime** with the driver's door open on the way out; **the dome light** on while a door's open and as
  I get in, fading over 2.5 s after (through the cabin's light, a little by day, full at night).
- Checked: `e2e/car-jump.mts` logs the start (cranking from 2.8 s, running ~1 s later, then driven); typecheck clean.

## Phases 8–9 — built (2026-11-17): the cameras

- **Chase** (`tp/car/camera.ts`):
  - backing up: the lean toward the course only going forward — straight behind it now at 48 km/h backwards (it
    swung ~99° to the side past 3 m/s, flipping sides at straight back);
  - walls and the land: Jolt's sight ray (the walker's camera's) from the car to the eye — in short of what's in the
    way fast, back out slowly;
  - on a slope: behind it down or up the slope with it (65%), so uphill the road ahead isn't under the car;
  - stiffer at a crawl (yaw rate 3.2 → 6.6 under 8 m/s): parking no longer floats;
  - looking back and again: a cut;
  - the shake a smooth noise (8–18 Hz sines) instead of a random each frame;
  - a short hop's landing dips it too (in the air 0.12 s, was 0.25).
- **Hood and cockpit:** the hood's own stiff spring (the body's dive, squat and bumps, its nose dipping braking), a
  little speed FOV in both (+5°, +7°); the g the head and the pine tree feel eased (it was spiky above 60 fps, the
  velocity moving on 1/60 s steps); the pad's right stick looks where it's pushed (position, a round dead zone) and
  springs back.
- Checked: `e2e/car-cam.mts` (backing up 0→48 km/h: the camera ±180° off the nose, i.e. straight behind, every
  sample; a still); typecheck clean.

## Phase 10 — built (2026-11-17): the engine

- **Engine braking in auto** (`shared car/drive.ts`): off the throttle in a gear, a pull back along the car — 1.4 m/s²
  in first at the limiter, less with the revs and the gear (÷ gear^0.7), downhill too; Jolt's auto box goes to
  neutral off the throttle, so it coasted free. On the body, not the brakes: a brake on all four ate the tyres' grip
  in a corner (the cornering test's packed snow fell to 0.45 g) and locked them in the air. Not while sliding (a
  keyboard drift's lifts between taps bled the slide) nor on the handbrake.
- **The limiter a soft cut** over 300 rpm round it (it cut to nothing from the last step's revs: a chatter).
- **A launch on keys grips:** while the driven wheels spin more than 1.5 m/s past the ground under 6 m/s (from their own
  spin — the slip's a ratio of nothing at a stand), the throttle eased back (to 45% at most). A blanket ramp was tried
  first: it changed every start, and the crest test's landing with it.
- Checked: shared car tests 69/69 (new: `(plan 98) let off at 60 km/h …`; the dry car's person test rolls on with a
  whisper of throttle now — let off, the engine stops it short of her).

## Phase 11 — built (2026-11-17): the weight

- **The weight seen** (`glb.ts setWeight`, from `cars.ts` for every live car — mine and everyone's, from its own
  acceleration in its body's frame): the nose down braking, up pulling away (2.6 cm a g at the bumpers' ~1.5°, at
  most 2°), leant out in a turn (0.7° a g) over Jolt's own; on a spring (70, 9), so it rocks back a little as it
  stops. Its people lean with it (they hang off the body).
- **ABS pulsed** ~12 times a second (the brake 70% on the off beat) — `s.helping` 1 for the rumble and the tyres.
- **The suspension's speed kept** (`sw.cv`, clamped ±5 m/s; it was always 0): for the bumps' thumps, the kerbs and
  the rumble (phases 12, 16).
- **Kept as it was:** the air's levelling (`airLevel` 14, `airDamp` 7) — set after the user's plan 92 feedback (a fast
  crest threw it nose-up past 60°); a crest test lands on that. Kerbs come through the bumps (`sw.cv`), not a ground.
- Checked: shared car tests 69/69; typecheck clean. Stills with phase 27.

## Phase 12 — built (2026-11-17): the controls and the rumble

- **The pad** (`car/controls.ts`): the stick's dead zone round (0.1) with an outer one (0.95) — a diagonal rest
  doesn't steer; the triggers' own (0.06: one resting at 0.03 held a whisper of throttle and beat the hold at a
  stop); its steering rate eased with speed (8 rad/s, half at 30 m/s — `shared drive.ts`: the keys' had their own).
- **The rumble** (`cars.ts`): over the ground and the knocks, now a gear's kick (40 ms on the change), the limiter's
  buzz, the ABS's pump, a bump or a kerb (the springs' speed past 0.4 m/s), coming down off a jump.
- Checked: shared car tests pass; typecheck clean. (No pad on this machine to feel it: the numbers by reading.)

## Phase 13 — built (2026-11-17): others' cars, smooth

- **Turning on past the newest state** (`car/playback.ts`): the yaw rate (`wy`, on the wire all along, dropped on the
  client) carried in the samples; past the newest the car turns on at it as it goes on along its velocity — a car
  mid-corner slid sideways without turning, then snapped round.
- **Easing off, not stopping dead:** straight on for 500 ms as before (a slow sender's half-second frames need all
  of it: the playback tests said so when it eased from the start), then easing off over 0.3 s instead of stopping.
- **The steering and the springs blended** between the two states round the clock (`pairA/pairB/pairU`): they stepped
  20 times a second.
- **Their driven wheels spun by their slip** (a burnout spins them past the road) and held still braking with a lock.
- Left: the brake lamp's on/off on the wire (a graded one would need a byte).
- Checked: playback tests 7/7; typecheck clean.

## Phase 14 — built in part (2026-11-17): the engines' voices

- **An idle that lives** (`car/sound.ts`): a slow waver (2.3 and 0.71 rad/s), each car a little off the book (±2%),
  the V8's lope (a dip 1.3 times a second) — gone as it revs past 600 over idle.
- **Pops by engine and revs, with a crackle trail:** the V8's from 3000 rpm, the four's from 3800, the two-stroke's from
  4500, a diesel's none; as loud as it was revving; then 2–4 smaller crackles 60–180 ms apart as it falls.
- **The recorded limiter wired:** picked over the made stutter (`limiter` out of chosen.json's `synth`), its take plays
  at the limit over the loops (it was loaded nowhere, so taking it out of `synth` did nothing); the `rumble` take
  loaded too (the strips: phase 16).
- **Waiting on the user — the missing rpm points (F8a).** New recordings mean downloading files, which needs the
  user's OK per file (its name, source and size). CC0 candidates found by search (licences to confirm on each page,
  nothing downloaded):
  - the heavy diesel's idle (the snowcat, the plough truck, the tractor: today 1909/2511 rpm only, idle played at
    0.34×): [Truck Engine Idle Loops](https://freesound.org/people/qubodup/sounds/187564/) (qubodup),
    [Diesel idle 1](https://freesound.org/people/C-V/sounds/565598/) (C-V),
    [Diesel Truck Idling Front](https://freesound.org/people/ibirdfilm/sounds/128160/) (ibirdfilm),
    [bus coach diesel idle](https://freesound.org/people/kyles/sounds/453415/) (kyles);
  - the light diesel's on-load (the van, the 4x4): [Motor Loop 3](https://freesound.org/s/325809/) (soundjoao, a
    diesel van);
  - the V8's low points (two loops today, 1373/2145): [v8 engine rev](https://freesound.org/people/overmedium/sounds/651534/)
    (overmedium, 8.5 s, idle and blips);
  - then cut into loops at the missing rpm (each measured from its pitch), and picked by ear on `/dev/car-sound`.
- Checked: typecheck clean.

## Phase 15 — built (2026-11-17): others' cars heard as mine

- **The throttle on the wire** (`CarWire.thr`, `Vehicle.thr` uint8 ×100): others hear a car on load and off it, and
  its pops on a lift (phase 14's) — it was guessed from the revs.
- **Their starter and stop** (phase 7, on the engine flag's rise and fall).
- **Their crashes:** a sudden change of its velocity as played back (over 2.2 m/s at more than 4 g) heard as a hit by its
  weight (`hit: null` before: silent).
- **Their indicators** (the relay with their lamps), **their handbrake**, **each wheel's own ground** (four samples, not
  one under its middle).
- **The toboggan heard:** no engine, but a sound of its own for its runners on the snow and its knocks (no voice, no
  sound object before).
- Left: their shifts are heard in the revs (the lever's click is the cabin's); their scrapes (not on the wire).
- Checked: typecheck clean (client, world-server).

## Phase 16 — built (2026-11-17): the space round the sound

- **Doppler:** a car's recorded engine pitched by how fast it closes on me (my own car's speed counted), 0.85–1.18.
- **Behind something:** Jolt's sight ray from the camera to each car heard, four times a second — behind a wall or the
  land, muffled (through the same low-pass a car's glass gives), eased in and out.
- **The bay mic faded** from 14 m to 26 (it cut at 20).
- **My cabin from the chase camera:** its own sounds (the relay, the belt, the wipers' motor) at 0.55 — the camera's
  outside; full in the cockpit.
- **Rain on the roof:** made (nothing recorded fits): noise through a high band, patting at 7–16 Hz, loud inside,
  a patter beside it, by the rain.
- **Bumps:** a thump up through the springs as hard as a wheel came up (`sw.cv` past 0.9 m/s, phase 11), a creak of the
  body at a crawl — kerbs, potholes, the verge; once in 0.14 s.
- **Crashes by weight**, one knock not a rattle of them grinding along a wall (0.15 s unless harder).
- **The horn:** each car its own take of its kind's; a release (0.35 s), not a cut.
- **One window motor:** the switch played a made one under the recorded one.
- Left: the rumble strips (`rumble` is loaded; nothing in the world marks strips yet); a room's reverb (the steps'
  reverb isn't shared yet).
- Checked: typecheck clean.

## Phase 17 — built in part (2026-11-17): the lamps

- **Indicators with a bulb's filament:** up over 50 ms, dying away over 100 ms after the relay lets go (`Lights.indK`;
  mine and others'), not on/off.
- **Another car's headlamps on the ground:** a warm pool ahead of it (`lampPatch`, 6.2 × 3.2 m, low 0.2, high 0.3) —
  only my car throws real lights (two spots in the scene); mine paints none.
- **The reversing lamps' white** on the ground behind, as the tail lamps' red is.
- The brake lamps already lit the ground behind (the tail patch, brighter braking) and the third brake lamp
  (`emit_brake`); the dome light is phase 7's.
- Not done: the low beam's cut-off pattern (three's spot cookie needs its shadow map — a shadow light with no map
  broke every lit draw before, see memory) and a flare on oncoming lamps; the relay's recorded loop isn't in step
  with the lamps (it loops at its own rate).
- Checked: typecheck clean. Stills with phase 27.

## Phase 18 — built in part (2026-11-17): the dashboard

- The cluster redrawn 20 times a second in the cockpit (8 outside, where it's not read), the revs and the speed eased
  between redraws: the VFD's bar sweeps instead of stepping at 10 Hz.
- The key-on sweep and the lamps' self-test: phase 7.
- Not done: the dash face's shape (a flat slab in the Blender files — a model change, at the near model's 90k budget).
- Checked: typecheck clean.

## Phase 19 — built in part (2026-11-17): glass and weather

- **The wipers clear what they sweep** (`fx.ts ScreenSnow.live`): while they go, the windscreen's snow or rain is a live
  picture — each blade's arc between where it was last frame and where it is now wiped off it, the weather coming back
  over all of it as it falls (snow slower than rain) — not one of three baked pictures with a fixed fan.
- Not done: drops running up the glass with speed, frost on the side and rear glass parked, the rear demister's
  lines, the morning's mist as its own haze (only the windscreen carries weather in the models).
- Checked: typecheck clean. Stills with phase 27.

## Phase 20 — built in part (2026-11-17): wheels

- **The rims blurred at speed** (`glb.ts setWheelFx`): a soft disc over each rim's face fading in past ~22 rad/s (about
  27 km/h for a saloon) to 0.85 — the spokes strobed; mine from its wheels' spin, others' from their speed.
- **The brake discs glow:** heated by hard braking at speed (my car: 0.55 a second at full brake past 90 km/h), cooling
  0.08 a second, orange from half heat — each car's own disc material, cloned the first time.
- Not done (Blender, at the near model's budget): the coil springs moving with the wheel, the tyre's bulge, the steel
  and cover wheels' depth; the snowcat's and snowmobile's belts (a plain `track` material, its UVs unknown: nothing to
  scroll).
- Checked: typecheck clean. Stills with phase 27.

## Phase 21 — built in part (2026-11-17): wear and water

- **The dirt where it's thrown** (the paint's shader, `uArch` from the hubs): round each wheel's arch, behind it, and up
  the tail's lower half, over the band up the sides as before — by the car's grime.
- **Through water:** a spray off each wheel in it by how fast (the world's `waterAt`), a bow wave off the front ones.
- Not done: rain-washed streaks, snow caked in the arches, the exhaust's shimmer and drips.
- Checked: typecheck clean; a still of the car (the shader compiles, no WebGL errors on the console).

## Phase 22 — built in part (2026-11-17): reflections

- **The world in the paint (F7):** a reflection probe — a 128 px cube caught round my car (my own car out of it), out
  to 60 m, PMREM'd for every car's paint and chrome — instead of the three-colour sky. **On High by itself; Settings →
  "Car reflections": On High / On / Off** (`prefs.carReflect`, EN/PT).
- **Its cost, measured** (`e2e/car-cam.mts`, High): all six faces at once was 30–230 ms a capture (900 with its
  compiles) — so a face a frame, every 10 s, each face's programs compiled first off the frame (`compileAsync`), and
  not while I'm going faster than 8 m/s (what's new round a fast car is uploaded the first time a face draws it:
  0.2–2 s frames). At rest: 3–28 ms a face, one face a frame for six frames every 10 s.
- Left: the first captures in a place still upload what they see the first time; the LODs' crossfade (a dither in
  every car material's shader — not done here).
- Checked: typecheck clean; the probe's faces timed in the game.

## Phase 23 — built in part (2026-11-17): traffic on Jolt (F10b)

- **A driver** (`shared car/ai.ts`): along a route (the town's polylines), steered by pure pursuit at a point ahead on
  it (3.5 m + 0.7 s of speed), as fast as it's let go but no faster than the bends within its stopping distance allow
  (2.2 m/s² of sideways grip, slowed into at 3 m/s²), a stop eased into and held on the brake. Test: a saloon on Jolt
  round an L of road (60 m, a 20 m quarter circle, 40 m) at up to 36 km/h — within 1.2 m of its line, under 33 km/h in
  the bend, to the end.
- **The town's cars on it** (`world-server features/grounds-life.ts`): the visitor's car (a saloon) and the plough (the
  plough truck) driven on Jolt in the server — a `JoltCarWorld` on the Grounds' own `groundsWorld` (its land in chunks
  round each car, its hard things as statics), stepped at 60 Hz once a tick for all of them with their own hands and
  feet; what everyone sees is that car (its place, heading, speed and its quaternion: pitch and roll on the land).
  Their routes' phases as before — the speed they're let go (someone in the way: 0, a honk after 1.2 s), a stop at the
  end. Off Jolt and on their routes as before: the visitor backing out of its bay (the Jolt car kept with it), the
  shuttle (it carries people; no spec), the long road's bus and car; the tests' fast trips.
  - In the dev world: the visitor down the driveway's bends at 7 m/s, 3 in the lot, to its bay.
- **Parked cars in the way:** the town's cars stop for a player's car left on their road (they drove through it).
- **Drawn as they go** (`tp/parts/vehicles.ts`): their pitch and lean from the quaternion, front wheels steered by how
  they turn, brake lamps whenever they slow (by day too). **Heard** (`cars.ts hearAi`): the visitor's a saloon's
  engine, the plough's, the shuttle's and the bus's a heavy diesel's — they were silent.
- Not done: a driver sat in each; going round something in the way (they wait); the shuttle and the long road's cars
  on Jolt; indicators before turns.
- Checked: shared car tests (new: the driver round the L); world-server grounds-life + park-life tests (the plough's
  snowstorm test red on HEAD too); typecheck clean; biome's safe fixes on the changed files.

## Phase 24 — built in part (2026-11-17): when the driver's gone

- **A car whose driver's gone quiet** (a tab in the background, a dropped line; `QUIET_MS` 2.5 s) braked where it is
  (9 m/s²); **one with nobody at its wheel** (jumped out) rolls on, slowing (1.6 m/s²); either way **stopped by what's
  hard in its way** (the Grounds' solids against its box) — it rolled in a line through walls and water, up to ~130 m.
- **A passenger across to the wheel** once it's empty (`car:swap`; the keys theirs): driving it without getting out;
  their prompt "E — Across to the wheel"; seen as a slide inside it (`via` their seat, no act at a door, no door's
  timer or clunk for a move within the car).
- Out of a rolling car (a passenger too): phase 4.
- Not done: an owned car left in the road towed home after a while (its owner told); a jerry can; parking off a bay
  squared to the kerb.
- Checked: world-server car tests 20/20 (new: across to the wheel); typecheck clean.

## Phase 25 — built in part (2026-11-17): two cars meet (F9a)

- **One crash, felt by both:** my car into a car someone's driving (its live id on my screen) tells the server
  (`car:hit`: the weight, the velocity, where on its hull), which tells that car's driver (`car:struck`) — unless they've
  told the same crash themselves within 0.4 s (both felt it already). Their car is shoved by the momentum along the
  line of the hit (by both weights, a little bouncy, ×1.2) and dented where it was struck, as if their own screen had
  felt it — unless it did, just now. Before, each side dented only itself off a copy of the other drawn 0.1–0.6 s in
  the past, and one could feel a hit the other never did.
- Already so: a boot's lid up is seen by everyone (plan 94 G3); the slide across, now (phases 4 and 24).
- Not done: parked cars dented when shoved; cars far off patched less often (Colyseus' state is everyone's);
  the radio in step between cars.
- Checked: world-server car tests (new: told once for one crash); typecheck clean.
