# Plan 114 — the Strike Park: a tactical team shooter in the world

Asked 2026-11-21:

> Counter Strike Zone Park. A zone like Kart, with dynamic park. The focus here is to have something 100% like
> Counter Strike, the maps, game mods all of it. Use CS images and content as reference.
>
> Lets plan

Status: **planned 2026-11-21; the guns, their sounds and their third-person handling kept as they are (the user,
2026-11-21: only first person is new); first pass BUILT 2026-11-21, second pass 2026-11-22 ("do it all, I'll test at the end"), uncommitted (see "Built" at the end); forks decided 2026-11-21 one by one (below). Changed from the proposals: F3 both
cameras everywhere, F11 sound picks mine, F13 no sign-offs, built straight through and checked at the end.**

## The line we hold

The Kart Park works like Mario Kart and Smash Karts, but its karts, items, circuit and names are the world's own
(plan 46). This plan does the same with Counter-Strike:

- **Carried over exactly: the game.** The rounds, the economy and its numbers, the bomb and the hostages, the buy
  menu, how movement and spray feel, the damage model, the grenades, the modes, how you spectate when dead, the
  scoreboard, and what a good map is made of (lanes, chokes, timings, sightlines). These are rules and numbers. We
  measure them from public references (the wikis, the patch notes, players' measurements) and write them into this
  plan as targets.
- **Our own: everything you see and hear.** The maps' layouts, the names (no "Counter-Strike", no Dust/Mirage/Inferno),
  the teams, the weapons' looks, the HUD, the sounds and the voices. No copied map, texture, model, logo or sound in
  the repo, and no CS screenshots in `design/`. References are read for their numbers and conventions, never traced.
  Our maps are new, built on CS's map-design rules and *measured* against them (timings, choke widths, sightline
  lengths). They should play like a competitive map without being a copy of one.

## What there is now

- **The Kart Park** (plans 46–47): a fenced venue on its own land, a road in, a lobby at a desk, Vortex bots that
  fill empty slots, a race run by the server, and a record on its tower. **The track changer** (plan 47) is the
  "dynamic park": a board in the paddock picks a layout, and the real world changes. The server sets
  `park.layout`, the ground's chunks are rebuilt, and the 3D park is rebuilt a little each frame, then swapped.
- **The guns** (plans 79–84, `shared/dark/arms.ts`, `features/arms.ts`): revolver, double-barrel, AK, sniper and
  Daybreak. Each shot is a ray checked by the server against where the others *were*: `REWIND`, a second of past
  positions per player. Spread is `spreadOf`, bloom grows and calms, damage falls off with range, a head hit does
  more, PvP does half (`pvpDamage`), walls stop shots. They are the Alan Wake 2 kind: a low ready, an over-the-shoulder
  aim, slow deliberate reloads. That is the opposite of CS.
- **First person** exists (`controller.firstPerson()`, `/dev/3p` with first-person hands and a gun that aims).
- **Health and downs** (`features/survival.ts`): 100 hp; at 0 you are downed, crawling, until a friend gets you up.
  CS has no downs: you die and watch.
- **Bots that fight** (plan 88: Vortex with moves, targets, health that scales with the group) and **the navmesh**
  (plan 72, recast tile cache built from Jolt's solids, obstacles added and removed as things change).
- **Built from data** (plans 110–113): a Blender kit GLB, a layout grammar shared by the server and the client,
  Jolt solids and the navmesh from the same data, real glass, storeys.
- **Limits we know**: 64 fields on `Player` (a match keeps its own schema map, `state.strike`); hidden pages draw
  no frames; budgets raised freely when measured.

## The idea

**The Strike Park**: a walled compound on its own land, set back from a road like the Kart Park. Inside is one big
level pad (~200 × 200 m) where **the map stands as a real place in the world**. A board at the gate's lobby, the
**Map Board**, picks the next map. Between matches, the old map is struck and the new one goes up. You walk in, pick a
team, play. Anyone outside can watch from the gallery on the wall and on the big screen over the gate.

Inside the compound you play **by CS's rules, not the world's**: first person (third person too, F3), CS movement, the world's five guns
bought with the match's money, death and spectating. Walk out the gate and you're back to the world: your own
pockets, the AW2 guns and downs. Nothing crosses the gate either way.

## The mechanics

### S-M1 — Movement (the zone's own walker mode, like the skate's)

CS's movement is a big part of its feel. Numbers in metres (CS's unit is an inch, 0.0254 m; its player is 72 units,
1.83 m, which is close to ours).

| | CS | Ours |
|---|---|---|
| Run, nothing in the hand | 250 u/s | 6.35 m/s |
| Run with the revolver / AK / sniper / sniper scoped | 240 / 215 / 200 / 100 u/s | 6.1 / 5.46 / 5.08 / 2.54 m/s |
| Walk (Shift) | 52 % | 52 %, silent footsteps |
| Crouch (Ctrl) | 34 %, smaller hitbox, more accurate | same |
| Accel / friction | top speed in ~0.25 s, stop in ~0.1 s | same (sv_accelerate 5.5, friction 5.2 equivalents) |
| Counter-strafe | tap the opposite key: stopped and accurate | same, the tell is the accuracy meter |
| Jump | ~55 u high, a crate in one jump, two people stack-jump | 1.4 m, crouch-jump 1.7 m; a jump has big inaccuracy |
| Tagging | being hit slows you hard for a moment | same |
| Air | a little air strafe, no bunny-hop speed | same |
| Footsteps | heard ~1100 u away | ~28 m, through floors weaker |

Hitboxes on the life rig (plan 73): head, neck, chest, stomach, arms, legs, the same bones on everyone. Bodies
can't be pushed through. Teammates don't block each other's shots the way enemies do. Friendly fire is on in
Competitive and off in Casual.

### S-M2 — Shooting: the guns as they are, a first-person view added

**The guns are done** (plans 79–84): their handling in third person, their numbers, spread and bloom, reloads,
sounds. **None of it changes.** The user, 2026-11-21: "Third person gun mechanics is already done, no need to change
that, only first person. Guns and guns sounds are also done."

What's new is **first person** for them:
- **The view model**: the same five guns' GLBs (plans 79–84) and the life hands (plan 78), held in the camera, CS's
  way: the gun low right, the sights brought up on the right mouse (the scoped sniper's lens, as in third person).
  The reloads, draws, bolts and racks are the **same acts** (`ARM`, the same timings), played on the view-model rig
  so what you see in first person matches what the others see on your body.
- **Where shots go**: from the eye down the crosshair, with each gun's own `spreadOf` and bloom. The shot's ray and
  the server's checks stay `features/arms.ts`'s; only its origin moves to the eye in first person (the server
  already checks the muzzle is where it has you; an eye origin gets the same check).
- **A crosshair** that opens with the gun's spread (CS's dynamic crosshair), its own HUD piece.
- **Third person stays as it is**; F3: both cameras everywhere.

**The zone's rules over damage** (match rules, not gun changes):
- **Full damage**: inside the park PvP isn't halved (`pvpDamage`'s half is off there). Every gun's own `damage`,
  falloff and `HEAD.mult` apply as they are.
- **Armor**: kevlar takes half of a body hit and wears down by what it took; the helmet does the same for the head.
  The sniper and the Daybreak go through it (CS's armor penetration for its heavy guns).
- **Tagging**: a hit slows you for 0.4 s (S-M1).
- **Wallbangs**: a shot goes through thin map surfaces by material (wood, drywall, thin metal, glass, doors) and
  loses damage; concrete and brick stop it, as walls stop it today.

### S-M3 — The arsenal: the five guns, gear and grenades

The buy menu sells **the world's own five guns**, priced by the CS role each fills, plus gear and grenades. One
gun each in the primary and pistol slots (CS's), and the left hand's torch stays the world's (plan 87) outside
the park only.

| Gun | Role (CS's) | Price | Kill reward |
|---|---|---|---|
| **Revolver** (6) | the pistol: everyone spawns with it, free | 0 (a spare 500) | 300 |
| **Double-barrel** (2) | shotgun | 1 100 | 900 |
| **AK** (30) | rifle | 2 700 | 300 |
| **Sniper** (5) | AWP-class | 4 750 | 100 |
| **Daybreak** (3) | the heavy, one a team | 5 200 | 100 |

| Gear | Price |
|---|---|
| Kevlar / kevlar + helmet | 650 / 1 000 |
| Defuse kit (Wardens) | 400 |
| HE / flash (max 2) / smoke / molotov (Raiders) or incendiary (Wardens) / decoy | 300 / 200 / 300 / 400 or 500 / 50 |

Ammo in the zone: a full mag and the reserve CS gives that role (the pockets' rounds aren't used; nothing crosses
the gate). A dead player's gun drops where they fell and can be picked up (E), as in CS.

**Grenades** are new (the flare, plan 30, is how one is thrown today; they follow its arc and bounce on Jolt):
- **HE**: damage by distance, through armor less.
- **Flash**: whiteout by how squarely you looked at it and how near, a ringing in the ears. Friendly too.
- **Smoke**: a volume that grows in ~1 s, lasts 18 s and blocks sight for people and for bots. An HE thins it for a
  moment, a molotov dies in it. A real volume on every setting (F8).
- **Molotov / incendiary**: fire that spreads over floors (not walls), 7 s, damage over time, a smoke puts it out.
- **Decoy**: plays a gun's shots (the gun's own sounds), shows on the enemy's radar.
- Thrown with left click (far), right click (short), both (middle), and jump-throws. Lineups learnable: the same
  throw lands in the same place (determinism, a test).

### S-M4 — The match

All of it on the server, in `state.strike` (its own schema; nothing on `Player`).

- **Teams**: two of 5 (Competitive), 10 (Casual), 2 (Wingman). Our names (fork F4): the **Raiders** (attack, carry
  the charge) and the **Wardens** (defend, rescue hostages). Sides swap at half.
- **A round**: freeze time 15 s (buy, can't move), round 1:55, buy time 20 s from the start in the buy zone.
- **Bomb defusal**: one Raider carries the charge (dropped on death, picked up by a teammate). Plant on a site (3.2 s,
  standing, sights shown). Then 40 s, beeps that quicken. Defuse 10 s, 5 s with a kit; moving stops it. Raiders win
  by detonation or elimination; Wardens by defusal, elimination, or the clock with no plant.
- **Hostage rescue**: two hostages. Wardens carry one (slowed), and rescue at the zone. Raiders win on time. Hurting
  a hostage costs money.
- **The economy** (CS2's numbers, the targets):

| | $ |
|---|---|
| Start (Competitive) / max | 800 / 16 000 |
| Win: elimination or time / bomb detonated or defused / hostage rescued | 3 250 / 3 500 / 3 500 |
| Loss bonus | 1 400, +500 a loss in a row to 3 400; a win steps it down one |
| Raiders lose a round after planting | +800 to the team |
| Plant / defuse (the player) | +300 |
| Kill: double-barrel / AK, revolver / sniper, Daybreak / HE | 900 / 300 / 100 / 300 |
| Overtime | MR3 at 10 000 each |

- **Competitive**: MR12, first to 13, overtime MR3. Warmup before it. Team kills and team damage cost money; a
  vote kick and a timeout (four 30 s each).
- **The buy menu**: B, CS2's grid by role (F10), the team's money shown, "drop for a teammate" (G while
  buying). Your gun is kept if you survive the round.
- **Dead**: you watch your living teammates (first person, their view), the scoreboard on Tab. Text and voice chat
  only to the dead in Competitive.
- **HUD** (the manuscript in walnut, our own): health, armor, money, ammo, the round clock, the score, the kill feed
  (who, with what, a headshot or wallbang mark), the radar with teammates and spotted enemies, the charge carrier,
  the bomb's sites, damage given and taken at round end, the MVP of the round, and the match's end screen.
- **Comms**: radio commands on Z/X/C (our voices), a ping on the map (middle mouse), callouts named on the radar
  (each map's places named in the plan).

### S-M5 — The modes

| Mode | Players | Rules |
|---|---|---|
| **Competitive** | 5v5 | as above, bomb or hostage by map |
| **Casual** | up to 10v10 | shorter (first to 8), free armor and kit, no friendly fire, $1 000 start |
| **Wingman** | 2v2 | a small map, one site, first to 9 |
| **Deathmatch** | free-for-all up to 16, or teams | 10 min, respawn at once, free buys, points by kill and gun |
| **Arms Race** | free-for-all | a kill moves you up a ladder (Daybreak, sniper, AK, double-barrel, revolver); a revolver kill last wins |
| **Retakes** | 4 Raiders on a planted site vs 3 Wardens | quick rounds, cards for loadouts |

Empty slots are filled with **Vortex bots** (S-M7), so one person can always play.

### S-M6 — The maps and the dynamic park

**How a map is made** (the plan 110 way, built for this):
- A map is **data in shared** (`@yutopia/shared/strike/maps/*.ts`): a blockout grammar of floors, walls with
  thickness and material, ramps, stairs, ladders, crates, doors (that open and close in round), windows, the buy
  zones, the sites, the hostage and rescue zones, the spawns (10 each side), callout names by area.
- From that one data come **the Jolt solids, the navmesh, the wallbang materials, the radar picture and the 3D**:
  the 3D is pieces from a **Strike kit GLB** (Blender, as plan 110's) plus each map's own hero pieces modelled in
  Blender.
- **Measured against CS's map rules** by tests (`strike-maps.test.ts`), on the navmesh with CS's run speed:
  - both sides reach the middle of the map at about the same time; Wardens reach each site a few seconds before
    Raiders (target: 5–10 s);
  - three lanes from the Raiders' spawn: two to the sites and the middle that links them;
  - each choke is 2–5 m wide; no sightline over the AWP-class's comfortable range except a few planned long ones;
  - from each site, a rotation to the other in ~15 s for Wardens;
  - no spot where a person can see out of the map or stand outside it.

**The dynamic park** (plan 47's swap, bigger):
- The Map Board at the lobby: a card per map (its radar, mode, size, the record), "Set this map" when no match is on.
- The server sets `strike.map`. The ground under the pad is flat and stays flat. The map's solids, navmesh and 3D
  are loaded as one swap: its chunks and kit stream in, the old map is shown until the new is ready, and then it is
  swapped (no hitch, the plan 47 rule).
- The show (fork F6): a crew of Vortexes and cranes strike the set and put up the new one, ~20 s.

**The maps at launch** (proposed, our own; each gets a site plan and timings in phase 0):

| Map | Mode | What it is | Plays like |
|---|---|---|---|
| **Sawmill** | bomb | a snowed-in mill town: A in the log yard, B in the grain store, the middle a frozen river with a covered bridge | the classic three-lane, long middle |
| **Glass Tower** | hostage | an office block half built: the hostages on the 4th floor, rescue at the loading dock; lifts off, stairs and scaffolds | tight, vertical, wallbang drywall |
| **Freight** | bomb | a rail yard: containers, a freight train across the middle, sites at the depot and the crane | long sightlines, AWP-class map |
| **The Lodge** | bomb | a mountain hotel: A on the terrace by the lift, B in the cellar kitchens | close quarters, utility map |
| **Boathouse** | Wingman | one site, a boathouse and its jetty | 2v2 |
| **The Range** | aim, Deathmatch | a training yard, targets, bots that strafe | warm-up |

Theme (fork F5): built in the world's snow and time of day, or every map has its own climate (a studio's backlot).

### S-M7 — The bots (Vortex, as in the Kart Park)

Server-driven on the navmesh, the same rules as people (they buy, move with S-M1, shoot with S-M2's spread and
recoil, throw utility).
- **Buy** by the team's money (eco, force, full).
- **Play** a role per round: entry, support, lurker, AWPer, anchor. They take the map's lanes, hold the angles named
  in its data, rotate on a call, plant and defuse, save when it's lost.
- **See** like people: smoke blocks them, flashes blind them, they hear footsteps and shots.
- **Levels** (fork F9): Easy, Normal, Hard, Expert, by reaction time, aim error and how well they use utility. Their
  looks: Vortex in each team's kit (VHS shimmer on a spawn).

### S-M8 — In the world, for everyone

- **Where** (fork F2): a new clearing off a road, like the Kart Park. The site plan in phase 0, for you to circle.
- **The compound**: a concrete wall round the pad, a gate, the lobby (desk, Map Board, the team rack), a car park.
  The gallery on the wall lets anyone watch from above. The big screen over the gate shows the score and the
  kill feed.
- **Watching** (fork F7): from the gallery, or "Follow the match" at the lobby gives you a free spectator camera
  (players' views, the radar), with a delay so it can't be used to call positions.
- **Records** at the lobby: the last 10 matches, the most kills, the most MVPs. Stats in `apps/api` later if wanted.

### S-M9 — Sound

Sound is information in CS: steps by surface and by who walks, the direction of a shot, a reload heard round a
corner. **The guns' sounds are done** (plan 79 phase 9 and each gun's plan) and used as they are; steps are plan 63's.
What's new: the grenades' sounds (pins, bounces, the bang, the flash's ring, the smoke's hiss, the fire), the charge
(the plant's keys, the beeps quickening, the defuse, the blast), the round's calls in our words and the radio
voices. CC0 picks, mine (F11). Occlusion by the map's walls on the existing hearing.

## Where it lives

| Piece | Where |
|---|---|
| Movement, economy, the round's rules, maps' data, map checks, grenades | `packages/shared/src/strike/` (`@yutopia/shared/strike`) |
| The match | `apps/world-server/src/features/strike.ts`, bots `features/strike-bots.ts`; `state.strike` |
| The client | lazy chunk `yutopia-strike` (`world/strike/`): the walker mode, the first-person view model, the HUD, the buy menu |
| The park on the land | `shared/strike/land.ts` (read by the Grounds as `kart/land.ts` is) |
| Art | `tools/art/strike/` (Blender: the map kit, hero pieces, grenades, the charge), `design/strike/` (mocks) |
| Tuning | `/dev/strike`: the aim yard, sliders, a bot to duel |

## Phases (each ends with something you can try)

| # | Phase | Exit test |
|---|---|---|
| 0 | **Mocks and the maps' blockouts**: the site plan, the compound, the six maps as data with their lanes and timings measured, a still of each, the HUD (round, buy menu, scoreboard, round end, dead and spectating), the Map Board, the team kits | the images in `design/strike/`; each map's timings measured on its blockout |
| 1 | **The feel**: `/dev/strike` aim yard. S-M1 movement, the first-person view model for the five guns (their own acts), the crosshair, hitboxes, armor, tagging, counter-strafing | the numbers below, measured in the yard |
| 2 | **Grenades**: HE, flash, smoke volumes, fire that spreads and is put out, decoy, throws and lineups | a smoke blocks a bot; a lineup lands the same 100 of 100 times |
| 3 | **The park and the map engine**: the land, the compound, the map grammar → Jolt, navmesh, radar, wallbang materials, kit 3D; the Map Board swaps a map in the world with the crew's show | the map checks pass on all six; a swap with no frame > 50 ms |
| 4 | **The match**: teams, rounds, freeze and buy, economy, the charge, plant and defuse, halves, overtime, scoreboard, death and spectating, kill feed, MVP, radio and ping, Competitive and Casual, on Sawmill | Ana and Bia's teams play a full match to 13 |
| 5 | **Hostages and Glass Tower** | a rescue and a timeout both win right |
| 6 | **The bots**: buys, roles, lanes, utility, plant/defuse, levels | a 5v5 of bots finishes a match; Easy beatable, Expert hard; 9 bots < 2 ms a tick |
| 7 | **More modes**: Deathmatch, Arms Race (the five guns as its ladder, the revolver last), Wingman (Boathouse), Retakes; The Range | each mode played to its end |
| 8 | **Freight and The Lodge** in play | a match on each |
| 9 | **Sound**: grenades, the charge, the calls, the radio | each event heard from the right side and floor |
| 10 | **Watching and records**: the gallery, the big screen, Follow the match with its delay, the record | a third person watches a whole round |
| 11 | **Checks**: e2e `strike.spec`, perf (10 players + smokes + fire at night, Low and High), memory over map swaps, budget, PROGRESS | all green; numbers in PROGRESS |

### The numbers phase 1 must hit

| Test | Target |
|---|---|
| Run with the revolver / the AK / the sniper | 6.1 / 5.46 / 5.08 m/s (CS's 240 / 215 / 200 u/s) |
| Stop from a run by counter-strafing | accurate in ≤ 0.1 s |
| First person and third person | a shot from either at the same target, still, lands on the same spot |
| The five guns' acts in first person | draw, reload, bolt, rack in the same seconds as `ARM`'s in third |
| Hit registration at 150 ms ping | what you saw hit, hits (rewind) |
| A frame in the yard on Low (M1 16 GB) | ≤ 8 ms |

## Risks

- **"100 % like CS" vs our own maps.** The rules and feel can be the same. The maps can't be copies, and new maps
  are hard to make good: hence the map checks (timings, chokes, sightlines) and bot matches on each before you play.
- **The feel**: CS players notice tiny differences in movement. Hence the sandbox and its numbers first
  (no sign-off: F13), each measured against its target before anything is built on it.
- **Netcode** at CS's rate: CS runs its server at 64 ticks with sub-tick input. Ours checks shots on arrival with
  rewind. Hits must agree with what the shooter saw at 150 ms ping (measured in phase 1).
- **Smokes and fire** cost GPU on Low. A volume per smoke, measured.
- **Map swaps** are big: a whole map of kit and hero pieces streamed in. The plan 47 rule: the old one stays shown
  until the new is ready.
- **Two worlds of rules** at one gate: your pockets and guns must not cross it, and downs must not happen inside.
  Tests at the gate.

## Forks — decided 2026-11-21

| # | Question | Decided |
|---|---|---|
| F1 | What "100 % CS" means for us; the maps | **CS's rules and numbers exactly; our own maps, names, art and sounds.** CS's maps are Valve's work and aren't rebuilt. **The six proposed at launch**: Sawmill, Glass Tower, Freight, The Lodge, Boathouse, The Range |
| F2 | Where on the land | **A new clearing off a road**, its site picked on phase 0's site plan |
| F3 | Camera | **Both, everywhere**: first and third person in every mode, Competitive too, switched at any time. The third-person camera is kept tight on the shoulder and never sees past a wall's edge further than the head could (a ray from the head clamps it), so it gives no wallhack |
| F4 | Names | **Our own**: the Raiders and the Wardens, each gun its own name |
| F5 | The maps' world | **In the world's snow and hour** |
| F6 | The map swap | **A show: the crew strikes the set, ~20 s** |
| F7 | Watching | **The gallery, the big screen and Follow the match, on a delay** |
| F8 | Smokes | **Real volumes on every setting**, measured on Low |
| F9 | Bots | **Vortex in each team's kit, four levels** (Easy, Normal, Hard, Expert) |
| F10 | Buy menu | **CS2's grid by role** |
| F11 | Sound | **CC0 and recordings, my picks**; the user changes any afterwards |
| F12 | Order | **Bomb defusal and Competitive first** (Sawmill, 5v5), then hostages, bots, modes, maps |
| F13 | Sign-offs | **None: built straight through, mocks to checks; the user checks at the end** |

## Built — the first pass (2026-11-21, uncommitted)

What's in, and how it was checked:

- **The land** (`shared/strike/land.ts`): the compound west of the Kart Park, its centre at (−270, −735). The
  pieces:
  - a 208 × 238 m concrete wall, 9 m tall, with the gallery's parapets on top;
  - a lobby yard behind the gate, with the desk, the Map Board, the big screen over the gate, and stairs up to the
    gallery;
  - the arena pad behind the inner wall, with its two team doors;
  - the Strike Park road, 8 m wide, in off the county road's bend by the gatehouse, ending at a turning circle and
    a lay-by.

  The land is a region of its own (`land.ts` STRIKE_LAND), levelled and cleared. Pinned tests were updated with
  dated notes (`land.test`, `grounds-edits` TODAY, `grounds-town`), and `grounds-town.test` now checks that
  nothing changed outside the park's own ground, its ridges and its road.
- **Maps as data** (`strike/map.ts`, `carve.ts`): a grammar of boxes, walls, slabs, ramps, stairs, crates and
  props, with materials for wallbangs. From the same data come:
  - the walk grid (`grid.ts`: floors, steps, jumps, drops that land on the first floor below);
  - the checks (`check.ts`): spawns, reach, Wardens first by ≥ 3 s, Raiders 9–32 s, two or more lanes, rotation
    ≤ 24 s, nobody out of the map;
  - the physics solids (`shapes/grounds.ts` strike_map, by `strikeVersion`);
  - the 3D (`client strike/arena3d.ts`, tiled canvas textures, snow on what's open to the sky).
- **Six original maps, all passing the checks.** Sawmill was mine; the other five were designed by helper agents
  on the same rules:

  | Map | Mode | Raiders to sites | Wardens to sites |
  |---|---|---|---|
  | Sawmill | bomb | 19.4 / 19.7 s | 5.8 / 4.8 s |
  | Glass Tower | hostage | Raiders reach the hostages ~11 s before the Wardens | |
  | Freight | bomb | 20.4 / 22 s | 5.7 / 11.7 s |
  | The Lodge | bomb | 13.3 / 13.2 s | 3.3 / 6.3 s |
  | Boathouse | Wingman | 12 s | 1.1 s |
  | The Range | aim, Deathmatch | | |
- **The rules** (`rules.ts`, `match.ts`), pure and tested:
  - CS2's economy: the loss bonus ladder, the plant +800, kill rewards by the role each of the world's guns fills;
  - the charge: plant 3.2 s, fuse 40 s, defuse 10 s or 5 s with a kit; hostages, where one rescued wins;
  - halves at 12, first to 13, overtime MR3 at 10 000;
  - Casual, Deathmatch, Arms Race (the five guns as its ladder), Retakes;
  - armor and its penetration, friendly fire by mode, warmup respawns.
- **CS movement** (`move.ts`: CS's accel, friction, stop speed, air cap; a counter-strafe accurate in ≤ 0.12 s).
  In the game it's a walker spec of the park's own (`input/walker.ts` strikeSpec): the run set by the gun in the
  hand, walk and crouch at 52 % and 34 %, no sprint, double jump or air dash. The pure model is ready for the
  bots and the tests.
- **Grenades** (`nades.ts`): an arc that bounces off the map's boxes, deterministic (a lineup lands the same
  100 of 100). What each does:
  - HE: damage by distance;
  - flash: whiteout by distance and facing, none through walls;
  - smoke: grows into a volume, blocks the bots' sight, puts fire out;
  - molotov / incendiary: fire on the floor, 7 s;
  - decoy: plays shots.

  Keys: N picks, J throws far, Shift+J short.
- **The server** (`features/strike.ts`, `strike-bots.ts`, schema `StrikeArena`/`StrikeMember`/`StrikeHostage`/
  `StrikeNade`):
  - joining in the compound;
  - Vortex bots filling both teams at four levels; they buy, take a site's lane, see through the map's walls and
    smokes (and not when flashed), shoot with the world's guns' own damage, plant, defuse and carry hostages;
  - **the pockets lent** (`survival.lend`): your own are kept and saved as yours, the park's loadout given back
    on leaving or walking out of the gate;
  - match hits never down you (`survival.hurt` skips them);
  - `features/arms.ts`: inside the match, full damage, the map's wallbangs instead of Jolt's sight, and the bots
    along the ray; outsiders can't hit players and players can't hit outsiders;
  - the shadowed keep out of the compound (`dark.ts` lampAt);
  - the Map Board's swap: the old map struck, the arena bare 20 s, the new one up (`arenaChanged`: the physics'
    chunks made again on both sides).
- **The client** (`world/strike/strike.ts`, loaded within 520 m of the park):
  - the map and compound in 3D, lit from within after dark;
  - the bots as Vortex in their team's tint;
  - the HUD in walnut frames: score, clock, health, armor, money, the charge, guns and grenades, the kill feed
    (headshot and wallbang marks), a radar with teammates;
  - the buy grid (B), the scoreboard (Tab), use held (E), drop the charge (G);
  - the lobby panel at the desk (mode, bots and their level, join a team, start, leave, the last matches) and the
    Map Board panel (a card per map with its radar);
  - **first person with a gun in the match** (`camWanted`: the game's own first-person arms hold it; K switches
    to over the shoulder);
  - watching a living teammate when dead;
  - smokes as puff volumes, fire, the HE's and flash's bursts, the flash's whiteout.
- **Checked**:
  - shared: 30 strike tests (every map's checks, the economy, the charge, halves and overtime, the modes, armor,
    the movement, the grenades) and the Grounds' pinned tests;
  - world-server: `strike.test` 2 (join, bots fill 5 v 5, the loadout lent and given back, a buy, round 1 with the
    charge; the Map Board swaps Sawmill → Freight → Glass Tower with its four hostages), plus `arms`, `schema`
    and `down` (25);
  - stills of it in the game (`e2e/strike-shots.mts` → `design/strike/`): the gate, the lobby, the arena in
    warmup, the buy grid, the round, the scoreboard, a smoke thrown in first person. All 9 bots drawn.

**Not done yet (the next pass):**
- **Sounds:** the grenades', the charge's, the round calls and the radio. The guns' own sounds play as they are.
  A bot's shot reaches the client as `strike:shot`, but no tracer or sound is played for it yet.
- **The swap's show:** no crew or cranes yet. The arena is bare for 20 s, with a toast.
- **Watching from outside:** "Follow the match" with its delay. The gallery is walkable and the big screen shows
  the score.
- **Not checked yet:** the third-person camera's clamp at corners (F3); perf with 10 players, smokes and fire on
  Low; memory over map swaps; an e2e spec of a full match; Firefox.
- **The 3D look:** the maps are textured blocks (a kit pass in Blender to dress them is phase 3's polish), and the
  props named by the agents' maps ("bull-wheel", "boat", "signal"…) aren't drawn yet.

## Built — the second pass (2026-11-22, uncommitted)

The user: "Do it all, gonna test at the end."

- **Sounds**, F11, my picks (`client strike/sound.ts`). All synthesized, nothing fetched, and placed by distance
  and side:
  - the charge's beeps, quickening as it runs out;
  - the keypad's ticks while planting or defusing;
  - the pin pulled on a throw, the HE's blast, the charge's big blast, the flash's crack and the ears ringing
    after it, the smoke's hiss, the fire's crackle;
  - the round's calls and the radio, in our words, said by the browser's voice. U opens the radio, 1–6 picks a
    line, and the line goes to your team over the server's `strike:radio`.

  The guns' sounds are the world's, untouched. A bot's or a decoy's shot is now sent as the world's `arms:shot`,
  so its sound, flash and tracer are the same as a person's.
- **The swap's show**, F6. The old map sinks into the snow over 8 s while two tower cranes swing their jibs over
  the arena and a crew of four Vortexes walks it; the new map rises in 4 s. When it goes up, the server moves
  anyone still out on the arena to the lobby yard, so nobody is shut inside a wall that comes up where they stood.
- **Follow the match**, F7. A button at the lobby's desk for whoever's outside the match: a camera behind any
  player, 3 s behind them. N goes to the next player, Esc stops.
- **No peeking round corners**, F3. In the match the over-the-shoulder camera sits straight behind your head,
  with no side offset (`tp.centred`).
- **What the maps are made of, drawn**:
  - window facades on every building look (mill houses, hotel, depot, boathouse…), lit from within after dark;
  - every prop kind the maps use: crane, rail signal, the lift's bull wheel and chairs, sofa, signs (with lamps,
    ice and targets as before);
  - the charge where it lies, its light blinking faster as the fuse runs down;
  - the hostages, held or carried.
- **Fixed on the way**:
  - the dead player's camera points were in the wrong order;
  - a person's facing byte was read backwards (the flash's facing, the follow camera);
  - B and Use were taken first by the dark module's keys (now `strike/flag.ts`), and Tab by the focus cycle.
- **Checked**:
  - e2e `strike.spec.ts` passes (2.1 min, the GPU flags): Bia joins and bots fill both teams; first person with
    the revolver, K switches to the centred shoulder camera and back; the AK and a smoke are bought and the smoke
    thrown and drawn; Ana, in a second browser, follows the match from the lobby; the Map Board swaps to Freight
    (cranes, rise) and back.
  - `e2e/strike-perf.mts`, on Low on this machine with the dev build:
    - in the match: 24–25 fps, the same with a smoke, a fire, an HE and a flash going off;
    - the park drawn and hidden at the same spot: 3,483 and 3,474 draw calls, 46–47 fps both. The park itself
      adds next to nothing;
    - the spot's cost is the woods round the clearing, as anywhere deep in the woods (37 fps there). Elsewhere:
      the town 76 fps, the Kart Park 96.
  - Memory over three map swaps and back: geometries 3,934 → 3,425, textures 507 → 473, programs 281 → 278. No
    leak.
  - Shared strike 30, world-server strike, arms and schema 19.
  - Stills in `design/strike/` (13 now), in daylight: the overview of Sawmill, the show, Freight.

**Left:**
- Firefox, not tried.
- A Blender kit dressing the maps (the facades and props are drawn in code for now).
- The record in `apps/api` (it lives on the room for now).
- The woods' cost round the clearing: the Grounds' own.
