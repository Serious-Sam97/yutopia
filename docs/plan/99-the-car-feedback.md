# Plan 99 — the car, feedback on plan 98

Asked 2026-11-17, the user testing plan 98 (in Portuguese, here in short):

1. getting in and a fast crash can freeze the game a moment — investigate;
2. getting out of a moving car is bad: turn the ragdoll on; and the car doesn't go on, it stops on the spot;
3. out of the car it seems to go into another state — it should be the same car with people in it or not;
4. the getting-out act doesn't hold the character: you can walk off in the middle of it, and you're teleported.

Status: **planned 2026-11-17; forks decided 2026-11-17 one by one, all recommended; every phase straight through
(F6).**

## Where we are, from the code and a probe

### 1. The freezes (`e2e/car-hitch.mts`, new: in by the act, the engine, then put 14 m behind a parked car at 18 m/s;
every frame over 50 ms named by a CPU profile)

| when (s from X) | long frame | what it was |
|---|---|---|
| 0.47 | 109 ms | taking the wheel: my car onto Jolt (`joltUp`) builds the land round it (`groundChunk`), and the walker's model disposed |
| 0.82 | 355 ms | shaders compiled in the main view the first time something's drawn (`onFirstUse` → `getProgramInfoLog`) — something new on screen as I sit |
| 5.21 | 102 ms | shaders again (the engine running: the exhaust's breath, the rain's sky?) |
| 5.55 | 125 ms | shaders again, on reaching speed — most likely the rims' blur discs (plan 98 phase 20: a new transparent material) |
| 9.35 | **2322 ms** | **the reflection probe** (plan 98 phase 22): a cube face drawn into its render target compiles that target's own version of every material it sees (no tone mapping: a different program) — synchronously, despite the `compileAsync` before it; after a crash there's more new on screen (debris, sparks) |

- The probe is on by itself on High ("auto"). Everything else above is the first sight of a material.

### 2. Out of a moving car
- `car:leave {jump}` (plan 98 phase 4): the server sets `fellAt` (a fall) or `hitAt` (a stagger); the client plays the
  fall it plays when a car knocks someone down — the ragdoll isn't thrown with the car's velocity, she drops by the door.
- **The car stops on the spot:** my client stops driving it the moment I'm out (the Jolt car's gone with `become(null)`);
  the server takes it over (`QUIET` roll: 1.6 m/s² with nobody at the wheel, plan 98 phase 24) — but what's drawn is the
  server's line, and it's parked 2 s after it stops.

### 3. With people in it or not
- A car someone's in is a **live** car (`Vehicle`): driven on Jolt by its driver's client, played back on everyone
  else's, its own model. Empty and still 2 s, the server **parks** it: it becomes a world object, drawn by `syncParked` —
  its **parked model** (a "still" copy, made again), a kinematic box in Jolt; its lamps, its springs' sag, its steering,
  its doors as a parked car's. Getting in, the reverse. So what you see changes as you get out (the model swapped, it
  settles differently, the doors timer's), and the empty car is no longer a car on Jolt (it can't roll, be pushed by
  physics, coast down a hill).

### 4. The getting-out act
- Out, `this.mine` goes at once: `carry()` (which holds the walker in my seat) lets go; the walker's hidden for the act
  (`seatedIds`) but **free** — keys walk it away, and when the act ends (2.5 s) it shows where it walked to.

## Forks (decided 2026-11-17 — asked one by one, in Portuguese)

- **F1 the jump:** (a) the Jolt ragdoll thrown out of the door with the car's velocity, tumbling and bouncing, then up
  (plan 58's get-up); under ~15 km/h a stumble on her feet; hurt by speed only in a fight, as today · (b) the ragdoll at
  any speed past a walk · (c) ragdoll and hurt always. **a.**
- **F2 the car after the jump:** (a) on, on its physics — rolling with what it had, the wheel let go, hitting what's
  ahead, slowed by its tyres; my client drives it on till it stops, everyone sees the same · (b) on in a line, a light
  handbrake, stopped in a few metres. **a.**
- **F3 with people in it or not:** (a) one car always — the same model and the same Jolt body empty or not; empty it's
  still a car on Jolt (rolls down a slope, is pushed by a crash) till it settles, then stays exactly as it was (pose,
  springs, wheels, doors), no model swapped · (b) the parked object underneath, with no change you can see. **a.**
- **F4 the reflection probe:** (a) off by default till it's smooth (the sky's gradient as before; the Settings switch
  kept), the probe redone in a phase of its own to compile nothing new, then back to on High · (b) redo it now, on High
  · (c) take it out. **a.**
- **F5 the getting-out act:** (a) it holds you; a move doesn't teleport, it hurries the end (out and the step in
  ~0.4 s) and you walk on from where she is · (b) held to the end · (c) a move cuts it at once, the walker where the
  act's body is. **a.**
- **F6 the pace:** (a) every phase straight through, measured and committed each, the user tests at the end · (b)
  phase by phase. **a.**

## Phases (once the forks are decided)

0. **Measures:** `e2e/car-hitch.mts` kept as the check; a second run naming each new program (its material) at each
   moment; the jump at 30/60 km/h filmed.
1. **No freezes:** the reflection probe off by default (F4a: "auto" now off; On by hand), redone last (phase 5); the rims' blur, the brake discs' glow, the act's door marks and
   anything else plan 98 puts on screen mid-drive compiled ahead, when the car's model is made (not when first seen);
   taking the wheel's land built ahead (as I walk to the door).
2. **The jump:** the ragdoll thrown with the car's velocity out of its door, tumbling, then up (plan 58's get-up) —
   fork F1 for how hard; the car goes on (fork F2).
3. **One car, people in it or not** (fork F3).
4. **The act holds you:** fork F5.
5. **The probe, redone (F4a):** a reflection that compiles nothing new (its own few programs: the world drawn into the
   cube with one plain lit material of each object's colour, or a slower cycle that renders only what's already
   compiled for it), measured with `car-hitch`; on High again only if no frame passes 100 ms.
6. **Checks:** `car-hitch` (no frame over 100 ms getting in or crashing, on High and Low), the act and jump probes, the
   car specs.

## Guardrails
- The plan 98 traps: the car camera's `snap` means "sat"; probes wait for `cars.mine.started` before driving.
- Shared dev world; no full e2e unasked; waits on events, not sleeps.

## Phase 1 — built (2026-11-17): no freezes

- **The reflection probe off by default** (F4a): Settings → "Car reflections" On / Off, Off unless set; a saved "auto"
  reads as Off. Its faces compiled the world's materials for their own target on the spot — the 2.3 s after a crash, and
  the 355 ms as I sat (its first face, my car just taken).
- **The rims' blur** made as soon as a car's model is in, drawn at nothing (opacity 0): compiled with the car, not the
  first time it goes fast.
- Measured (`e2e/car-hitch.mts`, High): getting in, the engine, a crash at 65 km/h — no frame past 71 ms (the 0.4 s one
  is taking the wheel: the land round it built for Jolt); no new program as I sit or start.

## Phase 2 — built (2026-11-17): the jump

- **The car goes on (F2a):** jumping from the wheel, my client keeps its Jolt car, its sim and its sound (`coast`) and
  drives it on with nobody's hands on it (the wheel let go, no pedals), drawn and said to the server 20 times a second;
  the server takes its states from me (`Live.coaster`) till someone takes its wheel, I leave, or it's been still a
  second (then it parks). `e2e/car-jump.mts`: out at 26 km/h, the car rolling on 7.8 → 5.6 m/s over 2 s (its tyres and the
  engine's drag), its door left open. It stopped on the spot before (the server's line, then parked).
- **Thrown on the ragdoll (F1a):** the server says `car:thrown` (who, the car's velocity ×0.85) as it sets the fall;
  every client's model of that person goes limp on Jolt's ragdoll at that speed with a turn on it (`tp/thrown.ts`,
  `person3d`), and gets up where it lies (plan 58's `Downed`; my walker follows the body's drift). Under 15 km/h still a
  stumble on her feet. Filmed (`VIDEO=dir e2e/car-jump.mts`): out, tumbling, lying on the snow as the car rolls on.
- Checked: typecheck clean (client, world-server).

## Phase 3 — built (2026-11-17): one car, people in it or not

- **Parked just where and how it stopped:** the server's `park` no longer squares a car left in a free lot bay (a jump
  everyone saw); the lot's own put-back (`home`) still does.
- **The same model:** a live car that parks hands its model (`handoff`) to its parked self, which takes it on as it is —
  no still copy made, no merge, no swap; only a car that goes out of reach or comes back later is made again as a parked
  one. `e2e/car-one.mts`: in, out, parked 2.6 s later — the very model it was driven with, moved 0.000 m.
- Its physics left as before: rolling on is phase 2's (it parks once still); a parked car knocked slides on its locked
  wheels (plan 94).
- Checked: world-server car, park-life and spot tests 27/27; typecheck clean.

## Phase 4 — built (2026-11-17): the way out holds you

- **Held (F5a):** climbing out, my walker's held where the act ends — the server's spot for me — no path, no actions,
  no keys walking it off (`carry` holds it while my own act's running, not only while I'm in).
- **A move hurries it:** a walking key held while she's climbing out brings the act's clock to its last 0.45 s (out and
  the step), then I walk on from where she stands.
- **No jump as it lets go:** the walker's speed and its clock let go while held (`walker.still()`): it had the speed it
  walked to the door with, and its first frame back counted a quarter second at once (a 0.6 m step).
- `e2e/car-hold.mts`: out, W held 0.5 s after — the act over 0.45 s after W, my walker's biggest step 0.16 m (a frame's
  walk), none as it's let go. A jump (out on the move) isn't held: the ragdoll's.
