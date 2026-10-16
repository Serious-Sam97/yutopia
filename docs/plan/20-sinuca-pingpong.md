# Fita 13 — Sinuca and Ping-pong (plan, 2026-10-16 — delivered the same day: see PROGRESS "Fita 13")

Ask: "Sinuca and Ping Pong (Tênis de mesa). Like we did on Autorama, a real game
that you can play with others. Sinuca inspired by 8 Ball Pool. Ping pong you can
play with others or the CPU (Vortex appears), you control the racket with the
mouse. I want quality on both, let's plan first."

Bar (see the pets lesson): real 3D models, real physics, things that exist in
the world (balls roll on the table everyone sees, rackets are held, Vortex is
really standing at the far end), and a designed console in the 80s hi-fi
language. Checked visually in iso and 3D before it is called done.

---

## 0. What we copy from the Autorama (and what we change)

| Autorama did | We keep | We change |
|---|---|---|
| Pure physics + geometry in shared, subpath export (`@yutopia/shared/slotcar`) | Same: `@yutopia/shared/pool`, `@yutopia/shared/pong` | Real units (metres, kg, seconds), not tiles |
| Server referee checks reports (`plausibleCar`) | Same idea | Pool: the **server runs the shot** (it is turn-based, so it can). Pong: the hitter reports the hit, the server checks it |
| Lazy client chunk draws it for everyone (`world/slots.ts`) | Same: `world/pool.ts`, `world/pong.ts` | Tables, balls and rackets are **three.js models** in the 3D view, and iso sprites rendered from the same models (like pets), so both views match |
| Camera leans in over the table, console under it | Same: **the game is played in the world** (your pick, 2026-10-16), in whichever view you're in | Each game gets its own **game cameras** inside the world views (below) |
| `busy: "slotcar"` pose | `busy: "pool"` / `"pong"` | New poses: lean over the cue and strike; ready stance and swing |

### Game cameras in the world (shared, built once)

No separate scene: you play on the real table in the room, and everyone around
sees exactly what you see. A small shared module (`world/tablegame.ts`, lazy)
gives both games:

- **Iso**: the Autorama's lean-in (`engine.pinCamera({ ease })` + zoom), people
  in front go see-through (`engine.seeThrough`), minimap and dock hide. The
  pointer is read **on the table's plane** (pointer ray → cloth height), so the
  aim, the cue ball you drag and the racket follow the mouse exactly where it
  is on the table, not on the floor under it.
- **3D (third / first person)**: the chase camera hands over to a game camera
  while you play — pool: *Top* (over the table, looking down) and *Cue* (low,
  behind the cue ball, swings with your aim), `C` switches; pong: *Behind your
  end* (the classic table-tennis view), easing sideways with the ball. Walls and
  people between the camera and the table fade (the 3D view's existing fades).
  It returns to the chase camera when you leave.
- The console sits under the picture like the Autorama's (lazy panel).
- **Watching** needs nothing special: anyone in the room sees the game live in
  their own view; standing by the table, a *Follow the game* toggle lends you
  the same lean-in / game camera without a seat.
- Esc: pong first releases the mouse (pointer lock), second leaves the game
  (gives the seat back, camera returns) — same as Esc on the Autorama.
- Phone: pool fully playable by touch; pong by dragging the racket.
- Tip on the console in iso: "Pong plays best in 3D (T)" — your choice, never forced.

---

## 1. Sinuca — 8-ball pool

### 1.1 The item — `pool_table` (4 × 2, catalog → Games)

- A 7-ft bar table to the room's scale (≈ 2.4 × 1.4 m outside): turned legs,
  walnut rails with mother-of-pearl diamond sights, green cloth (variants:
  green, blue, wine red), six leather pockets with brass corners, a ball return
  tray at the foot end.
- **The lamp**: a three-shade billiards lamp hanging over it (warm light pool on
  the cloth; lit at night in iso, a real light in 3D).
- A cue rack (wall item, optional) and a chalk cube on the rail.
- Solid: you walk around it; you can't walk through it. Room around it to
  stand and shoot (the item warns in build mode if a side is against a wall —
  you can still place it, the cue just shortens like in a real bar).

### 1.2 The game (rules as in 8 Ball Pool, WPA-flavoured)

- Two players (seat A / seat B), or **vs Vortex** (optional, see decisions).
- Rack: triangle, 8 in the middle, a solid and a stripe in the back corners,
  shuffled otherwise. Who breaks: alternates game to game.
- **Break**: legal if a ball is potted or 4 balls reach a cushion; otherwise
  foul → opponent gets ball in hand. 8 potted on the break → re-spotted, keep
  shooting (scratch on it → re-spot + ball in hand).
- **Open table** until someone pots a ball legally after the break → that's
  their group (solids or stripes).
- **Fouls** → ball in hand anywhere for the opponent: cue ball potted
  (scratch), no ball hit, wrong group hit first, no cushion after contact (and
  nothing potted), ball off the table, shot clock ran out.
- **The 8**: once your group is cleared you **call the pocket** (click it).
  Win: 8 in the called pocket on a legal shot. Lose: 8 potted early, in another
  pocket, or with a scratch.
- Shot clock: off / 30 s / 60 s (table setting). Rematch button; break swaps.

### 1.3 Physics (`shared/pool.ts`, pure and tested)

Real numbers so it plays like a table, not like air hockey:

- Balls 57.15 mm, 170 g; cue ball same. State per ball: position, velocity,
  spin (ω, 3 axes), and its **orientation** (so numbers and stripes roll
  correctly on screen).
- **Sliding → rolling**: a struck ball slides, cloth friction (μ ≈ 0.2) turns
  slide into roll; then rolling resistance (≈ 0.01) slows it; side spin decays
  on its own. This is what makes **draw, follow and stun** work.
- **Ball–ball**: near-elastic (e ≈ 0.95) plus **throw** (friction between balls
  pushes the object ball a little off the line, more on slow cut shots) — the
  thing that makes real pool feel real.
- **Cushions**: the cushion nose sits above the ball's centre, so rebound
  depends on angle and speed and side spin changes the angle off the rail
  (running / check english). Restitution ≈ 0.75–0.85.
- **Pockets**: modelled jaws (corner and side pockets have different mouths
  and angles); a ball can **rattle in the jaws** and stay out, or drop. Potted
  balls roll down to the return tray (drawn in the world, too).
- Stepping: fixed 1 ms substeps with time-of-impact for ball contacts (a hard
  break never tunnels); a shot ends when everything is still. A full break
  resolves in a few ms on the server.
- **The cue strike**: direction, power, tip offset (spin: up/down/left/right
  within 0.5 R — beyond that a **miscue**), small squirt (side spin pushes the
  cue ball off line, like a real cue).

### 1.4 Who decides (netcode)

Turn-based, so it's simple and cheat-proof:

1. The shooter aims; their aim (angle, power pulled, spin dot) streams 10×/s so
   the opponent and watchers see the cue move — exactly like 8 Ball Pool.
2. Release → `pool:shot { angle, power, spin }`. The shooter's client starts the
   shot **at once** with the shared simulation (no wait).
3. The server runs the same simulation from its own table state, applies the
   rules (`shared/pool-rules.ts`: first contact, cushions, pots, foul, whose
   turn, groups, win), and sends the outcome: final layout + events + next turn.
4. Everyone animates the shot locally from the shot parameters and, at rest,
   eases to the server's final layout (Chrome↔Firefox maths can drift by a
   hair over a long shot; the ease hides it, the server's layout is the truth).

Ball in hand: the shooter drags the cue ball (streamed so others see it move),
server checks it's on the cloth and not overlapping a ball.

### 1.5 How you play it (in the world)

- **Camera**: iso leans in over the table; in 3D *Top* (the default, like
  8 Ball Pool) or *Cue*, `C` switches. People following the game get the
  shooter's 3D camera.
- **Aim**: move the mouse over the table — the cue turns around the cue ball
  towards it (the point under the pointer on the cloth, in both views).
  Hold Shift (or right button) for fine aim (×0.1); the wheel nudges by 0.1°.
- **Shoot**: press and **pull the mouse back** — the cue draws back with you,
  the power meter (LED bar) climbs; push forward / release to strike. A power
  slider on the side for touch and for people who prefer it.
- **Spin**: the cue-ball disc in the corner — click where the tip hits (draw,
  follow, left/right english). Chalk dust puffs off the tip when you change it.
- **Guideline**: the aim line to the first ball, the ghost ball, the object
  ball's path and the cue ball's deflection line. Table setting: *Long* (to the
  cushion), *Short* (like 8 Ball Pool), *Pro* (none).
- **Calling the 8**: when it's your 8, pockets glow — click one.
- **Console** (bottom bar, hi-fi style): two player plates (face, name, their
  7 balls as little LEDs that go out as they're potted), whose turn on the VFD,
  the shot clock as a ring round the shooter's face, foul / ball-in-hand
  call-outs (big, like the Autorama's GO!), the settings knob.

### 1.6 In the world (for everyone)

- The balls are **live on the table** in iso and 3D (rendered from the same
  ball models: numbers and stripes rolling).
- The shooter's avatar **walks to where the shot is** (stands behind the cue
  ball along the rail in the aim direction), leans over with the cue, strokes
  and strikes; the other player waits by the table holding their cue, chalks.
- Sounds from where the table is (fade over ~12 tiles): the break, clacks by
  impact speed, cushion thumps, the drop into the pocket and the roll down the
  return, chalk. Synthesized like the rest of Yutopia (`foley.ts` style).
- A little score board on the table's end shows the current game.

### 1.7 Vortex at the pool table (your pick: yes)

Server-side player: for each candidate (ball, pocket) it computes the ghost
ball shot, runs the shared simulation with noise to score it (pot? cue ball
safe? next position?), and picks by level (Easy / Medium / Hard / Turbo —
Easy: straight-ish shots, big noise; Hard: position play and safeties; Turbo:
runs racks). He appears at the table (see 3 — *A Vortex for every game*), his
cue sweeps over candidate lines while he "thinks", then shoots through the
same `pool:shot` path as a person.

---

## 2. Ping-pong — Tênis de mesa

### 2.1 The item — `pingpong_table` (4 × 2, catalog → Games)

- Regulation shape to scale (2.74 × 1.525 m): blue top with the white lines,
  net and posts, the folding undercarriage on wheels (variants: blue, green,
  outdoor grey), a ball box and two rackets resting on it when nobody plays.
- Needs room at both ends to run back (build mode shows the play zone).

### 2.2 The game

- 1 vs 1: two people, or **vs Vortex** (Easy / Medium / Hard / Turbo).
- Rules: to 11, win by 2; serve changes every 2 points (every point at
  10–10); a serve must bounce once on your side, then once on theirs; a serve
  touching the net and landing in is a **let**. Match: 1 game / best of 3 / best of 5.
- Point lost on: double bounce, missing the table, into the net, hitting the
  ball before it bounces on your side (volley), missing it.

### 2.3 Physics (`shared/pong.ts`, pure and tested)

- Ball 40 mm, 2.7 g: **gravity, air drag (strong — it slows a lot) and the
  Magnus force** from spin, so topspin dips, backspin floats, sidespin curves.
- **Table bounce**: restitution ≈ 0.9 vertically; friction couples spin and
  speed (topspin kicks forward, backspin checks up).
- **Net**: the ball can clip it and dribble over, or die.
- **Racket contact**: the outgoing ball is the racket's velocity + the ball's
  velocity reflected on the racket face (rubber restitution), and the rubber's
  grip turns the racket's sliding along the face into **spin** — brush up =
  topspin, chop down = backspin, sweep sideways = sidespin.
- **Assist** (per player, Settings): a well-timed swing is gently steered to
  clear the net and land (*Assisted*, the default — fun from the first rally);
  *Pro* gives raw physics. The assist only bends the result, never invents a
  hit: miss the ball and it's missed.

### 2.4 Controls — the racket follows the mouse

- **Pointer lock** while you play (no cursor drifting off the window).
- The mouse moves the racket in a plane over your end: left/right = across
  the table, up/down = closer to / further from the net (and a little height).
  The racket turns **forehand / backhand** by itself depending on which side
  of your body the ball is.
- **Swinging is moving the mouse fast**: the hit takes the racket's real
  velocity at contact — speed is power, direction is aim, the curve of the
  stroke is spin. A small trail behind the racket shows the swing.
- **Serve**: hold the button to toss the ball up, release/swing to hit it.
- Mouse sensitivity in Settings; touch: drag the racket with your finger.

### 2.5 Who decides (netcode) — the hard part

A ball crosses the table in 0.3–0.8 s; 80 ms of lag is a metre of flight, so
the server can't be in the loop of every hit:

- The ball's flight is always **one event + the shared physics**: (time,
  position, velocity, spin). Everyone computes the same flight from the same
  event on the synced server clock (`/time`, already used by media).
- **The receiver is the authority for their own hit**: their client checks
  the contact with their own racket (zero lag for them) and sends `pong:hit`.
  The server checks it's plausible (the ball really was there then, the racket
  was there per its streamed path, speed within reach) and relays it.
- The other player gets the hit late by ~half a ping; instead of the ball
  jumping, it plays **slightly fast** on their screen for the first part of
  the flight until it is in sync — near the far end, where nobody notices. It
  still arrives at the right time for them to return.
- The server scores from the flight + events (bounces, net, out, a miss when no
  hit came by the time the ball passed). Rackets (pose + velocity) stream 30×/s
  so you see your opponent's real swing.

### 2.6 Vortex as the CPU

- Choosing *Play Vortex* puts **a Vortex at the far end** (see 3 — *A Vortex
  for every game*): any number of tables can play him at once.
- He runs on the server like a real player: predicts where the ball will be,
  moves his racket there with a reaction delay and error by level, chooses a
  target (Easy: the middle, slow; Hard: wide angles, spin, smashes high balls;
  Turbo: nearly unbeatable), and sends his hits through the same `pong:hit`
  path — so watchers see the same thing.
- In both views he's **his own drawing (exactly Yondra's)** floating at the
  far end, a real racket beside him that swings with his hits; his mood changes
  with the score (smug when ahead, rattled when behind) and he says a line
  between points through the Vortex voice budget (Laravel lines, new ones for
  pong and pool).

### 2.7 How you play it (in the world)

- **Camera**: in 3D behind and above your end (the classic table-tennis view),
  easing sideways with the ball; in iso the lean-in over the table, with the
  ball's shadow and a height tick on the console to judge the bounce.
- The racket follows the pointer **on a plane over your end of the table**
  (pointer ray in both views), so it sits under the mouse.
- Your racket is a real 3D paddle (red / black rubbers, wood handle); its
  shadow on the table helps judge height. The ball has a soft shadow too.
- **Opponent**: their avatar drawing (same rig as in the world) at the far
  end in a ready stance, their 3D racket moving with their real swing.
- **Console**: a flip-card **scoreboard** (the real table-tennis kind) + VFD
  with games won, the serve indicator, speed of the last smash on the LED meter.
- Big call-outs: LET, NET, OUT, GAME POINT, MATCH.

### 2.8 In the world (for everyone)

- The rally is **live in the world** in iso and 3D: the ball arcs over the net
  with its shadow on the table, players stand at their ends, sway with their
  racket and swing on every hit.
- Sounds from the table: the pock on the table, the tock on the racket (louder
  on smashes), the net, the ball bouncing away on the floor after a point.

---

## 3. Common to both

- **Server**: `features/pool.ts`, `features/pong.ts`, `state.pool` / `state.pong`
  per table (like `state.slots`): seats, phase (lobby / playing / done), the
  game state; walking away or leaving frees your seat; removing the table ends it.
- **A Vortex for every game** (your pick): each CPU game gets its own Vortex
  for as long as it lasts — kept in the table's game state, not the wandering
  NPC. If the building's Vortex is free and nearby he floats over and *is* that
  player; otherwise a Vortex **beams in** at the far end (his VHS-glitch
  shimmer) and beams out after the handshake. Many tables, many Vortexes.
- **Lobby** (the panel when you click a table): two seats, *Play Vortex* with
  his level, settings (pool: guideline, shot clock; pong: points, match
  length, Vortex level), Start, Follow the game. Same flow as the Autorama's lanes.
- **House record**: each table keeps a small chalkboard in its props (last 10
  results + wins per person), saved with the object like the Autorama's track.
- Strings in their own `i18n-tables.ts` (like `i18n-pets.ts`) — the world page
  budget is tight; everything new lives in lazy chunks (`yutopia-pool`,
  `yutopia-pong`, `yutopia-tableview`, budget markers).
- `/dev/pool` and `/dev/pong`: offline pages — play both seats yourself (pool
  hot-seat; pong vs a local Vortex), physics sliders for tuning, and the review
  sheet of the models (tables, balls, rackets, iso sprites next to 3D).

---

## 4. Phases (each ends with something you can try)

**T0 — Models + game cameras** · both table models + balls + rackets + cue +
lamp in three.js, iso sprites from them; both items in the catalog; the shared
game cameras (iso lean-in with table-plane pointer, 3D game cameras with
fades), pointer lock, the console frame, busy poses.
*Exit*: both tables look right in iso and 3D on `/dev/items` and in the Lab;
the camera leans in / hands over and comes back in both views.

**S1 — Pool physics** · `shared/pool.ts` + tests; `/dev/pool` sandbox.
*Exit*: draw, follow, stun, throw, English off the rail and pocket rattle all
visible in the sandbox; a break spreads like a real one.

**S2 — Pool game** · rules engine + tests, aiming UX (both cameras, pull-back
power, spin disc, guideline, call the 8, ball in hand), console, hot-seat on
`/dev/pool`. *Exit*: a full game hot-seat to a win and to a loss on the 8.

**S3 — Pool for real** · server feature, shot netcode, aim streaming, lobby,
follow the game, balls + players + sounds in the world, house record.
Vortex at the pool table with his levels.
*Exit*: Ana vs Bia full game in iso and in 3D; a third person watches in the
world and with *Follow the game*; Ana vs Vortex (two tables at once, two
Vortexes); e2e `pool.spec.ts`.

**P1 — Pong physics** · `shared/pong.ts` + tests (drag, Magnus, bounce, net,
racket contact, assist); `/dev/pong` with a ball machine. *Exit*: topspin
dips, backspin floats, chops come back low; the assist lands good swings.

**P2 — Pong vs Vortex** · the controls, cameras (3D + iso), console, rules,
server Vortex with levels, Vortex arriving at the table, his moods + lines.
*Exit*: a match to 11 vs each level; Easy is winnable on the first try,
Turbo is hard.

**P3 — Pong with people** · hit authority, catch-up flight, racket streaming,
scoring on the server, world view of the rally, sounds.
*Exit*: Ana vs Bia rallies with the stack's real latency; with 150 ms added
latency the ball never jumps; e2e `pingpong.spec.ts`.

**Q — Quality pass** · both views reviewed side by side, night/day light, phone,
reduced motion, budget, perf (frame time with a game running on High/Medium/Low,
the lamp's light in 3D), Firefox by you.

Order: T0 → S1–S3 → P1–P3 → Q. Pool first because its netcode is simpler and
its physics is the bigger risk; the shell from T0 then serves pong too.

## 5. Checks

- shared: pool physics (energy only goes down, no tunnelling on a 12 m/s break,
  draw/follow signs, throw angle in range, rattle cases), rules table (every
  foul, open table, groups, the 8 cases); pong flight (drag, Magnus signs,
  bounce, net), contact model, assist never turns a miss into a hit, Vortex
  levels' win rates against a simulated player.
- world-server: seats, walk-away, shots refused out of turn, a ball in hand
  on top of a ball refused, a pong hit from a racket that wasn't there refused,
  scoring, Vortex busy elsewhere.
- e2e: `pool.spec.ts`, `pingpong.spec.ts` (Ana + Bia in the Lab; a dev hook
  drives the racket/cue); shots of both views for review.
- typecheck, Biome on touched files, `pnpm budget` (new chunk markers),
  `pnpm perf`.

## 6. Risks

- **Pong over the network** is the riskiest piece — we measure it in P3 with
  added latency before polishing anything around it.
- **Physics feel** needs tuning by hand: the sandboxes come before the game UI.
- **Pong in iso**: judging a ball's height on a 2:1 diamond is hard; the
  shadow, the height tick and the assist carry it, and 3D stays a tip away.
  We try it early in P2, not at the end.
- **The 3D view's frame rate during a rally**: the idle 30/s cap must not kick
  in while a ball is in the air (`engine.busy()` / `tp.activeAt` see the game).
- Firefox isn't automatable here — you check it at Q.

## 7. Decisions (2026-10-16)

- Played **in the world camera** (iso lean-in, 3D game cameras), not a
  separate scene.
- **Vortex plays both** games, with levels.
- **A Vortex for every game** — any number of tables at once.
- Pong hits **Assisted** by default, *Pro* in Settings.
