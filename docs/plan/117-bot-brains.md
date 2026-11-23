# 117 — The bots' brains

Ask (2026-11-22, the user, after plan 116): the Strike Park's bots are bad.
1. They repeat the same thing on the radio, many times.
2. They have no strategy.
3. The enemies are strange: **how they move, how they aim and shoot, where they go** (the user's answer; not how they
   look).
4. They bunch up in one place.

"Let's improve it! The plan can be big, this is complex."

Status: **planned 2026-11-22; forks decided by the user one by one 2026-11-22**: F1a layered brains, F2a maps
computed with hand hints, F3a the playbook with reads, F4a moving like a person (all of it), F5a a person's aim, F6a
sight, hearing and memory, F7a the team's voice on the radio, F8a bots take your commands, F9a levels change the brain
too, F10a the lab. F11: **b, no sign-offs: built straight through, tested by the user at the end** (phase 5 dropped). Follows plans 114–115 (the Strike Park,
its bots: `apps/world-server/src/features/strike-bots.ts`, phases 86–87 of 115) and 116 (first person). Third-person
gun handling stays untouched (the user's rule since plan 114).

## Where we are — read from the code, measured in simulated matches

**The code.** One file, `features/strike-bots.ts` (409 lines), driven 20 times a second from `features/strike.ts`:
- **Where to go:**
  - the site is fixed by the id's last character (odd A, even B), and every bot walks to the site's **middle**
    (`botGoal`);
  - the carrier goes to the most covered corner (`plantSpot`);
  - after the plant, everyone goes to the charge;
  - three small habits sit on top (`botAim`): a late Warden saves, a bot goes where a teammate fell in the last 6 s,
    some Wardens go toward enemy fire heard in the last 8 s.
- **No team:**
  - nothing decides as a side: no plan for the round, no roles, no setup;
  - two bots never know each other's spot, so they meet on the same middle cell (the bunching).
- **Seeing:**
  - the nearest enemy in a ±75° cone (all round within 6 m), in range, with no wall or smoke between;
  - no hearing of footsteps, no memory, no idea where enemies might be.
- **Moving:**
  - cell to cell on the 0.5 m walk grid (`pathOf`, 8 ways, no smoothing): 45° zigzags;
  - the facing is set to each segment's way at once, a snap;
  - it stops dead to shoot, never strafes, peeks or uses cover, and walks the same whether hunting or holding.
- **Aim:**
  - after the level's reaction time, it faces the target exactly in one frame;
  - each shot is a dice roll on a fixed error (`L.aim × (1 + d/30)`), not the guns' spread rules that players get;
  - it doesn't track a mover, has no recoil, and doesn't care whether it was looking that way (surprise).
- **The radio:**
  - one line only, "Contact!": every bot calls it on its own whenever it spots someone new, every 8 s at most per bot;
  - no place names, no counts, no "enemy down", no plan.
- **The utility:** one smoke and one flash thrown at the site's middle, at fixed distances.
- **Two copies of the driver:** the server's tick (`strike.ts` 1205–1300) and the simulated match in
  `strike-bots.test.ts` repeat the same loop by hand. A change to one isn't tested in the other.

**Measured** (a scratch lab over `strike-bots.test.ts`'s simulated Casual matches, ten Normal bots, seed 7):

| | Sawmill | Freight | Lodge |
|---|---|---|---|
| "Contact!" moments per round (each bot's first sight of someone new) | 26.1 | 20.2 | 26.8 |
| Share of live time with 3+ of a side bunched (each with 2 mates within 4 m) | 23 % | 35 % | 7 % |
| Mean distance to the nearest teammate | 6.6 m | 6.0 m | 9.4 m |
| Kills on a bot that wasn't looking at its killer | 39 % | 51 % | 42 % |
| Rounds won by elimination / by a defuse / by a plant | 8 / 1 / 0 | 14 / 0 / 0 | 8 / 1 / 0 |
| Standing still with nothing to do | 14 % | 13 % | 5 % |
| Mean round | 59 s | 52 s | 45 s |

So: the radio is roughly every encounter times every bot; one side in four is a crowd; half the deaths come from not
checking an angle; and the bomb mode barely plays as a bomb mode (no round won by the charge exploding).

**What helps:**
- the maps already carry named places (`StrikeMap.calls`: the radar's callouts), sites, spawns, buy zones and hostage
  spots;
- the walk grid, `shotThrough` (walls and their thickness), smokes and flashes are all in shared code;
- the simulated match runs a full Casual match in seconds;
- the radio is voiced by the browser's speech voice plus a chat line (`strike/sound.ts say`).

## References

- **Counter-Strike's own bot.** Michael Booth (Valve), "The Making of the Official Counter-Strike Bot", GDC 2004
  ([GDC Vault](https://gdcvault.com/play/1013625/The-Making-of-the-Official)). A navigation mesh with named
  **places**, **hiding spots** and **sniper spots** computed from it, approach points and encounter spots; bots that
  say where things happen by place name ([Valve's nav mesh notes](https://developer.valvesoftware.com/wiki/Nav_Mesh_Editing)).
  The model for our map knowledge and the radio's place names.
- **Killzone's tactical positions.** Straatman and Beij, "Killzone's AI: dynamic procedural combat tactics", GDC Europe
  2005 ([slides](https://www.guerrilla-games.com/media/News/Files/gdce05_killzone_ai.pdf),
  [paper](https://www.cp.eng.chula.ac.th/~vishnu/gameResearch/AI/KillzoneAI_Worapoj.pdf)): positions scored by
  evaluation functions (cover, line of fire, distance) rather than scripted; tactical path-finding that avoids
  enemy lines of fire.
- **Killzone 2's multiplayer bots.** Verweij, "A Hierarchically-Layered Multiplayer Bot System"
  ([pdf](https://www.guerrilla-games.com/media/News/Files/VUA07_Verweij_Hierarchically-Layered-MP-Bot_System.pdf)):
  a commander for the side, squads, individuals; each layer hands orders down and reports up. The shape of our
  team brain → bot brain.
- **F.E.A.R.** Orkin, "Three States and a Plan" ([pdf](https://pages.cs.wisc.edu/~dyer/cs540/handouts/gdc2006_orkin_jeff_fear.pdf)),
  and "Combat Dialogue in F.E.A.R.: The Illusion of Communication" (Game AI Pro 2,
  [O'Reilly](https://www.oreilly.com/library/view/game-ai-pro/9781482254792/K23980_C002.xhtml)): squads that seem to
  coordinate because **one** member says what the squad does — "if the AI didn't say it, it didn't happen". The
  rule for our radio: one voice per event, and the words match what they then do.
- **Utility AI and influence maps.** Dave Mark: the Infinite Axis Utility System ([summary](https://gameai.com/iaus.php)) and
  "Modular Tactical Influence Maps", Game AI Pro 2 ch. 30 ([pdf](https://www.gameaipro.com/GameAIPro2/GameAIPro2_Chapter30_Modular_Tactical_Influence_Maps.pdf)):
  each action scored from considerations (distance, danger, cover, the plan); where enemies might be held as a map
  that spreads and fades.
- **Left 4 Dead.** Booth, "The AI Systems of Left 4 Dead" ([pdf](https://cdn.fastly.steamstatic.com/apps/valve/2009/ai_systems_of_l4d_mike_booth.pdf)):
  path smoothing, reactive path following, and believable movement on a nav mesh.
- **How CS is played** (the playbook's moves, from common knowledge of the game, our own words): defaults and map
  control, executes with smokes and flashes, splits, fakes, lurks; the Wardens' setups (anchors, rotators, a stack),
  rotations on information, retakes; team economy (eco, force, full buy, save); trading kills; counter-strafing to
  stop before a shot; checking one angle at a time; jiggle and wide peeks.

## The idea

Three layers, like Killzone 2's, over map knowledge baked once per map:

1. **The map, understood** (shared, computed per map, cached, tested):
   - **areas** from the callouts and the walk grid, and the graph between them;
   - **which area sees which** (sampled rays);
   - **routes** from each spawn to each site (two or three distinct lanes, not one shortest path);
   - **chokes** where lanes narrow;
   - **hold spots**: cover with a view of an approach, Booth's hiding and sniper spots, Killzone's scored positions;
   - **clear-angle lists** along each lane: the corners to check, in order;
   - **smoke and flash spots** per site entrance.
2. **The team brain**, one per side:
   - picks the round's plan from a playbook by economy, score, time and what happened in earlier rounds;
   - hands out roles and spots: entry, support, lurk, sniper, anchor, rotator;
   - keeps spacing by construction: no two bots get the same spot, and lanes are shared out;
   - re-plans on events: contact, a death, the charge seen, a plant, the clock.
3. **The bot brain**, one per bot (utility AI):
   - each tick, actions are scored and the best kept, with hysteresis: go to my spot, hold an angle, clear the next
     angle, peek, fall back to reload, trade a teammate, investigate a sound, plant, defuse, save, throw utility;
   - **senses and memory:** sight (cone, light, smoke, flash), hearing (running steps, shots, reloads, the defuse),
     and the last place each enemy was known, fading;
   - **moving and aiming like a person:** smoothed paths, turn rates, the look leading toward danger rather than the
     path, counter-strafe before shooting, peeks from cover, the guns' own spread and bloom, an aim that flicks and
     settles, tracks with lag, and is slower when surprised.

**The radio** becomes the team's voice: an event is said **once** per side, by the bot who saw it, with the place's
name and a count. Lines have cooldowns and the side has a rate limit. Every line is backed by what the bots then do:
"Rotating B" only when they do.

**The lab** comes first:
- one driver runs the bots both on the server and in the simulation;
- thousands of simulated rounds yield the table above as tests with limits;
- a `/dev/strike` overlay shows each bot's plan, spot, route, what it knows and why it chose what it does.

## Forks — decided 2026-11-22 (F1–F10 the recommended; F11 b)

| # | Fork | Options | Recommended |
|---|---|---|---|
| F1 | The brain's shape | **a)** layered: map knowledge → team brain (playbook, roles, spots) → each bot's utility AI → movement and aim (Killzone 2's layers, Dave Mark's utility) · **b)** behaviour trees per bot with simple team roles (Halo's style) · **c)** a planner per bot and side (F.E.A.R.'s GOAP, Killzone 2's HTN) | **a** (readable, tunable by numbers, fits the lab; a planner is heavy for a 5-a-side game) |
| F2 | How a map is understood | **a)** computed from each map (areas, visibility, routes, chokes, hold spots, angles, utility spots) **plus** a few hand hints per map where it gets one wrong · **b)** computed only · **c)** all by hand per map, CS-nav style | **a** |
| F3 | Strategy depth | **a)** the CS playbook — Raiders: default and map control, rush, split, fake, lurk, eco; Wardens: setups (2-1-2 style anchors and rotators), stacks, aggression, retakes, saves — plus reads: they adapt to where rounds were won and lost earlier in the match (your habits included) · **b)** the playbook without reads · **c)** a few plans only (rush or split; a standard hold) | **a** |
| F4 | Moving like a person | **a)** all of it: smoothed paths, turn rates, the look leading toward danger while walking, clearing angles one by one, counter-strafe before shooting, wide and jiggle peeks from cover, walking quietly when sneaking, crouching at range, falling back to reload · **b)** smoothing and turn rates only | **a** |
| F5 | Aiming and shooting | **a)** a person's aim: a flick that overshoots and settles, tracking a mover with lag, slower when it wasn't looking that way, the guns' own spread and bloom (the rules players get: moving is inaccurate, the first shot standing is true), recoil control by level, prefire on known angles at Expert; no wallbangs on what they don't know · **b)** today's dice roll, plus a turn rate and varied reactions | **a** |
| F6 | Senses and memory | **a)** sight (cone, light, smoke, flash), hearing (running steps, shots, reloads, the charge's defuse) with direction and distance, memory of last-known positions that fades, and a side's shared picture of only what was called on the radio · **b)** sight and gunfire only, as today | **a** |
| F7 | The radio | **a)** the team's voice: one voice per event, the place's name and a count ("Two at Mill Yard!"), the round's plan called at its start, "Enemy down", "Planting", "Rotating B", "Need backup at Long", "Reloading", "Clear"; cooldowns per line and per side, a rate limit; the browser's speech through a radio filter, plus the chat line · **b)** the same lines, text only (no voice) · **c)** fewer lines (contact, down, planted) | **a** |
| F8 | Bots on your team | **a)** they take your radio commands (Follow me, Hold this spot, Go A / Go B, Regroup, Storm the front) and play the plan around you as one of the roles · **b)** they play their plan and ignore you | **a** |
| F9 | Difficulty levels | **a)** each level changes the brain too: Easy (no utility, slow, loud, simple plans), Normal, Hard, Expert (the whole playbook, lineups, prefire, trades, reads) — with aim and reactions as today · **b)** levels change aim and reactions only | **a** |
| F10 | Checking it | **a)** the lab: one driver for the server and the simulation; thousands of simulated rounds per map with limits as tests (the table above), the `/dev/strike` overlay; then a real match per map in the game · **b)** today's tests plus playtests | **a** |
| F11 | Sign-offs | **a)** one: after the movement and aim phases, a short recording of bots in `/dev/strike` for you to judge before the brains are built on them · **b)** none, straight through, tested by you at the end (as plan 116) · **c)** one per part | **a** (movement is the most "feel" of it; cheaper to correct before everything sits on it) |

## Phases

| # | Phase | Exit check |
|---|---|---|
| 0 | **The lab.**<br>• One bot driver (`strike-brain/drive.ts`) used by `strike.ts` and the simulation, and the test's copy of the loop removed.<br>• Metrics per round: spacing, bunching, radio lines and repeats, deaths not looking at the killer, plants, defuses, trades, standing still, outcome by plan.<br>• A bench script that plays N matches per map and level and prints the table.<br>• Today's numbers recorded as the baseline. | the table above reproduced from the shared driver; the server's match unchanged (`strike.test.ts`, `strike.spec`) |
| 1 | **The map, understood** (`shared/strike/know.ts`):<br>• areas from the callouts and the walk grid, and their graph;<br>• area-to-area visibility;<br>• 2–3 distinct routes from each spawn to each site and to the hostages;<br>• chokes;<br>• hold spots scored by cover and view of an approach;<br>• sniper spots;<br>• ordered angle lists along each lane;<br>• smoke and flash spots for each site entrance;<br>• cached per map, under a time budget. | per map: every site reached by ≥ 2 routes that share < 50 % of their cells; every site has ≥ 4 hold spots and ≥ 1 smoke spot; computed < 2 s, then cached |
| 2 | **The overlay** in `/dev/strike`: areas, routes, hold spots, angles; each bot's plan, role, spot, route, look, what it knows, and its top three scored actions. Shown for a simulated round, or live. | stills of every map's knowledge drawn |
| 3 | **Moving like a person:**<br>• paths smoothed (string-pulled on the walk grid);<br>• turn rates and speed changes;<br>• the look apart from the walk (it leads toward the danger, not the path);<br>• clearing angles in order;<br>• counter-strafe and stop before shooting;<br>• peeks (wide, jiggle) from a hold spot;<br>• quiet walking when sneaking;<br>• cover to reload.<br>The client draws a bot looking one way and walking another (strafing, backing). | no 45° zigzags (a path's turns < 15° where the grid allows); turning ≤ the level's rate; a still of strafing and peeking bots |
| 4 | **Aiming like a person:**<br>• a flick that overshoots and settles;<br>• tracking lag;<br>• surprise (slower reaction outside the look);<br>• the guns' own spread and bloom from the shared rules;<br>• recoil by level;<br>• prefire for Expert;<br>• wallbangs only on what's known.<br>The levels re-tuned. | Hard bots beat Easy ones over 200 simulated rounds; a duel bench: Easy loses to a still target at 20 m less than half the time, Expert wins > 80 % |
| 5 | ~~Sign-off~~ — dropped (F11b: straight through). A recording of moving and aiming is still made in `/dev/strike` as the reference. | the recording kept in `design/bots117/` |
| 6 | **Senses and memory:**<br>• sight with light, smoke, flash;<br>• hearing: running steps (walking and crouching quiet), shots, reloads, the defuse, with direction and distance;<br>• last-known positions that fade;<br>• an estimate of where enemies are (spawn timing spreads into the areas, sightings pin it). | a bot turns to a sound behind it; a walking player passes a bot's back unheard, a running one is heard |
| 7 | **The bot brain:** a utility AI over the actions (go to spot, hold, clear, peek, fall back, reload in cover, trade, investigate, plant, defuse, save, throw), its considerations named and tuned in one table, with hysteresis. | in the lab: deaths not looking at the killer < 25 % at Hard; standing still with nothing to do < 3 % |
| 8 | **The team brain, Raiders:** the playbook (default and map control, rush, split, fake, lurk, eco, save), roles and spots handed out, spacing by construction, re-planning on contact, deaths and time, and the carrier protected. | bunching (3+ within 4 m) < 5 % outside an execute's last 5 s; ≥ 40 % of bomb rounds see a plant; every play in the playbook seen in the lab |
| 9 | **The team brain, Wardens:**<br>• setups per map (anchors, rotators, a sniper's spot);<br>• stacks and aggression from reads;<br>• rotations on called information (not on every sound);<br>• retakes together after a plant (not one by one);<br>• saves when it's lost. | rotations only after a call; retakes start with ≥ 2 together; the side balance in the lab 40–60 % over 500 rounds per map |
| 10 | **Economy as a side:**<br>• eco, force or full buy decided together;<br>• drops for a teammate short of money;<br>• saving a rifle when a round is lost. | no half-buys: a side's buys agree in ≥ 90 % of rounds |
| 11 | **Utility:**<br>• smokes and flashes from the computed spots for executes and retakes;<br>• pop-flashes for a peek;<br>• HE on a known group;<br>• fire to stop a push, if the Park has it. | executes in the lab use ≥ 1 smoke and 1 flash at Hard |
| 12 | **The radio:**<br>• the side's events → one speaker each, the place's name and a count;<br>• the plan called at the start;<br>• cooldowns per line and side, a rate limit;<br>• new lines voiced through the browser's speech with a radio filter, and a chat line;<br>• bots heard only by their own side, and by the dead of it. | in the lab: no line repeated by the side within 10 s; ≤ 8 lines a round on average; every line backed by an action within 3 s |
| 13 | **Bots with you:**<br>• your radio commands (Follow me, Hold this spot, Go A/B, Regroup, Storm the front) obeyed;<br>• you counted as a role in their plan;<br>• your calls heard (a call adds to their picture). | e2e: "Follow me" → two bots follow within 5 m; "Go B" → they go B |
| 14 | **Difficulty across the layers** (F9a): Easy to Expert in plans, utility, senses, movement and aim; balance re-checked. | Easy beatable by a new player (the user), Expert beats Hard ≥ 70 % in the lab |
| 15 | **The other modes:**<br>• hostages: escorts, holding the hostage room, the rescue route;<br>• Wingman 2v2;<br>• the Range and Deathmatch (spawn, hunt, no bunching). | each mode played to its end in the lab with its own checks |
| 16 | **Stuck and odd cases:** stuck detection and recovery; a dropped charge picked up; a bot never in spawn after 20 s unless it's saving; ladders and stairs on every map. | no bot still > 5 s without a reason across 1,000 lab rounds |
| 17 | **Performance:**<br>• 9 bots under 2 ms a tick at 20 Hz on the server;<br>• map knowledge cached;<br>• nothing allocated per tick in the hot paths. | the budget met with a measured profile |
| 18 | **Checks:**<br>• lab limits as tests on every map;<br>• server tests;<br>• a real match per map in the game with bots, checked by the overlay and stills;<br>• `strike.spec`, `fp-guard`, `arms-feel`;<br>• notes, memory. | all green; the before and after table in this file |

## Risks

- **Too much at once.** Each layer is useful alone and is built and measured in turn (the lab first), so a phase
  that disappoints is visible in numbers before the next sits on it.
- **The lab lies.** The simulation has no human; humans are slower, noisier and less predictable. A real match per
  map in the game (phase 18) and your playtest stay the final judges.
- **Server time.** Visibility and utility scoring for 9 bots at 20 Hz: precomputed area visibility, spot lists and
  scoring at a few Hz (not every tick) keep it under 2 ms; measured in phase 17.
- **The bots' look on the client.** Strafing and backing need a bot drawn looking one way and walking another. If
  the world's people can't do that yet (their walk follows the facing), phase 3 adds it for the Park's bots only.
- **The voice.** The browser's speech voices vary by machine; the radio filter and the chat line keep it readable
  everywhere. Recorded lines could replace the voice later (CC0 or our own).
- **Fair, not cheating.** Bots must not know what they can't see or hear: one rule, checked by a lab test that hides
  a player out of sight and quiet and expects no reaction.
- **Strong but beatable.** The user plays alone with bots; Easy and Normal must stay fun to beat. The levels are
  tuned in phase 14 against the lab and then by the user's playtest.

## Progress (built straight through 2026-11-22, F11b; uncommitted)

**The brain:** shared, `packages/shared/src/strike/bots/` (`@yutopia/shared/strike/bots`, its own entry point so the
game's page never loads it). The server, the lab and the dev page run the same code.
- **The map, understood** (`know.ts`):
  - areas from the callouts and the grid;
  - what sees what;
  - 2–3 distinct named routes per objective ("via Catwalk");
  - entrances;
  - hold, sniper and post-plant spots;
  - an info spot for the rotator;
  - a stage per lane unseen by the holders, per metre;
  - grenade lineups found by throwing them with the match's own flight;
  - each side's arrival times per area.

  Objectives sit at their real floor (Glass Tower's hostages are on the 3rd). It's worked out in steps (≤ 90 ms
  each), kept, and saved and loaded by the map's fingerprint.
- **Feet** (`walk.ts`):
  - paths pulled straight (no 45° zigzags), each straight line ending on its waypoint's floor;
  - CS's own acceleration and friction (counter-strafing);
  - the floor followed: no falls off ledges by accident, drops through openings where the path goes;
  - stuck detection.
- **Aim** (`aim.ts`):
  - a reaction that's slower when surprised;
  - a flick that overshoots and settles, a turn-rate cap, lag behind a mover;
  - the guns' own spread, bloom and pellets;
  - shots that meet bodies (head or body) through the map's walls;
  - fights only within the gun's reach.
- **Senses** (`senses.ts`): a sight cone (wider close, all round just after a hit), smoke, flashes; hearing (running
  steps, shots, reloads, plant, defuse); memory; the side's picture from what was called.
- **The bot** (`brain.ts`):
  - **in a fight:** strafe and stop to shoot, crouch at range, cover to reload; a lone holder against three falls
    back;
  - **on the move:** corners checked one by one, teammates traded;
  - **lineups:** thrown at their nodes; holders throw a delay smoke, fire or HE once their door's hit;
  - **objectives:** plant at the covered spot, one elected defuser, the charge picked up, hostages walked to and
    carried at the match's 0.6 pace.
- **The side** (`team.ts`):
  - **Raiders:** rush, split (staged unseen, released together), default (map control, then a late call on the
    weaker site), fake and lurk, with reads.
  - **Wardens:** setups with anchors and a rotator at the info spot, stacks from reads, an early peek at Hard.
    Rotations go on called contacts, heard footsteps and the charge seen. Retakes are spread over the doors and go
    in with two or three. Saves.
  - **Every round:** post-plant spots, the hostage carry with escorts, a late call. Economy as a side, by CS's rule
    (save for the next full buy; force only when it wouldn't come anyway, or the round decides).
  - **Your commands:** Move in, Fall back, Hold this spot, Need help, Follow me, Go A, Go B, Regroup.
- **The radio** (`radio.ts`):
  - an event once per side, with the place and a count ("Two at Catwalk!");
  - plans called ("Split A: Middle and Yard Road.");
  - "Footsteps at…", "Enemy down. 3 left.", "Last one, The Gap!", planting, defusing, rotating, reloading, hit;
  - windows, cooldowns, one line at a time, stale lines dropped; silent in the respawn modes.
- **The driver** (`drive.ts`): one per match. Shots land after every bot's step, so none gains by going first. The
  old `features/strike-bots.ts` and the test's copy of the loop are gone.

**Server** (`features/strike.ts`):
- bots drawn from the driver's views (facing, gun up while holding or fighting, crouched, at the charge);
- players' shots heard; hits turned to;
- bot lines sent to their side as text (`strike:radio {text}`);
- your radio's ten lines (keys 1–9, 0) obeyed;
- the map's knowledge readied a little each tick before any match and cached in `$TMPDIR/yutopia-strike-know`.

**Client:**
- the radio says a bot's own words;
- the menu gains Follow me, Go A, Go B and Regroup;
- `/dev/bots`: the overlay (areas, routes, entrances, spots, lineups) and a lab match played back (each bot's order,
  why, who it's on, its path, the grenades, the charge, the radio).

**Before and after** (the lab; 5v5 Competitive, Normal, 24 rounds, 3–5 seeds):

| | Before | After |
|---|---|---|
| The radio a player hears a round | 20–27 "Contact!" moments, every bot's own | ~8–11 lines, none repeated within 10 s |
| 3+ of a side bunched | 7–35 % | 4–10 % |
| Kills on a bot not looking at its killer | 39–51 % | 4–10 % |
| Bomb rounds with a plant | almost none | 58–92 % |
| Standing about | 5–14 % | 0–2 % (Boathouse ~10 %) |
| Raiders' round share | — | Sawmill 46–52 %, Lodge 51–64 %, Glass Tower 53 %, Freight 65 %, Boathouse 27 % |
| Levels | — | Hard 52–0 Easy, Normal 52–1 Easy, Expert 52–29 Hard |
| A tick of all bots | — | ≤ 0.7 ms |

**Checked:**
- `strike/bots/lab.test.ts` 11/11: every map plays with the limits; Retakes 4 v 3 with both sides winning; Casual's
  ten (radio ≤ 13, bunching < 0.2); the levels in order; the maps understood; the radio's rules; fair hearing (a walk
  behind a bot unheard, a run heard);
- shared 843, client 477, server Strike 3/3 (its "ready up" hung up twice in a row once, then passed: timing);
- e2e `strike.spec` 2/2;
- in the game (`e2e/zz-bots-live.mts`): "Rush A! Everyone with me.", "Contact, Mill Door!", then your "Follow me!",
  "Roger that.", and two bots at 3.8 m and 7.8 m;
- stills: `design/bots117/`, the overlay of every map mid-round.

**Balance pass (2026-11-22, "arrume o ainda desequilibrado")** — the lab, 10 seeds, Normal v Normal:

- Retakes is what its card says: 4 Raiders hold the planted charge against 3 Wardens (`MODES.retakes.maxW`,
  `squadSize`; the server's bot fill and the lab both). The Wardens spawn round the site, 24–34 m out on foot and out
  of its sight, a different quarter each round (`spawnPoint`, CS's Retakes). Both sides AKs and armour; the
  Wardens get a smoke and a flash, the Raiders a flash. Before (4 v 4, from base): Raiders 9 / 32 / 47 % on
  Sawmill / Lodge / Freight; now 60 / 75 / 55 %.
- Casual's ten a side: "Enemy down" only for the last three; a big side's radio one line per 2.4 s and contacts
  held 16 s; a rush down two ways at once; stage columns 4.5 m apart; control spots spread along the lanes; three
  escort a hostage, the rest go back for another. Lines a side a round 13.5–17 → 10–12; bunching 21–35 % →
  12–22 %.
- Every side gives way to a teammate within 4.2 m ahead (was 2.6): one spray doesn't find two. Sawmill's Raiders
  39 → 52 %; rounds ~5–15 % longer (the lab test now allows 50 simulated minutes for 24 rounds).
- Two bugs: hold spots on things nobody can climb (Boathouse's boats on their trestles, a Tower ledge) — spots
  now only where their holders can walk to (`KNOW_V` 4); bots heading for a charge dropped on a boat aimed at its
  top — now the site's floor beside it (`chargeNode`).
- Post-plant: the posts paired on the two likeliest ways in, one watching the charge; the Raiders push the charge
  on a defuse.
- Tried and dropped (measured worse or no better): a crosshair-placement flick bonus; the info player falling back
  on contact; retakers walking to their lineups first; retakes through one door together; dropping the long-way
  retake routes; corner pre-aim as "expected"; hiding post spots from the retakers' corner checks; the Boathouse
  Wardens' spawn moved south (it put them below the Landing's deck — the gain was them stuck).
- The maps (asked for after: "Yes", 2026-11-22):
  - Freight's **Signal Box**: a stair from the Wardens' Yard Office onto the containers (5.2 m), a parapet and a hut
    over the Switchyard — no way down but the stair. The info spot search now scores spots on the attackers' lanes
    at 0.75 (see them come without standing where they walk), so Freight's info player watches from there; Sawmill's
    and Lodge's info spots are unchanged by it (`KNOW_V` 5).
  - Boathouse's **Lake Window**: an unglazed opening in the hall's west wall (sill 1 m, head 2.1 m: seen and shot
    through, not climbed), the hall's south corner watched from the ice.
  - Stills: `design/bots117/freight-signal-box-*.png`, `boathouse-lake-window-*.png` (`e2e/zz-maps117.mts`).
- And the post-plant: posts watch where an enemy was last seen or heard near them (6 s), not only their door; one or
  two left take an angle of their own near the charge — random among the covered places with a line to it, off the
  map's known spots (Boathouse's 1 v 1s after the plant went the Wardens' way 27 in 30). In Retakes the Wardens go
  in at once from where they spawned, each from its side.
- The radio on a big side one line per 3.4 s (Casual's ten: 8.6–11.5 lines a round).
- The lab test plays two matches a map (seeds 7 and 11) and checks the rates over both: one match can snowball 18–1.

**Now** (10 seeds, Normal v Normal; Raiders' share of rounds):

| | Before this pass | Now |
|---|---|---|
| Sawmill | 46–52 % | 55 % |
| Lodge | 51–64 % | 61 % |
| Glass Tower | 53 % | 51 % |
| Freight | 65–77 % | 59–61 % (20 seeds) |
| Boathouse (Wingman) | 19–27 % | 39 % |
| Retakes Sawmill / Lodge / Freight | 9 / 32 / 47 % (4 v 4) | 53 / 71 / 52 % (4 v 3) |
| Casual 10 v 10: lines a side a round · bunched | 13.5–17 · 21–35 % | 8.6–11.5 · 14–22 % |

**Open:**
- Lodge leans to the Raiders in Retakes (71 %) and to the Wardens in Casual's 10 v 10 (22 %, 4 seeds): its sites are
  indoors up stairs.
- Boathouse at 39 % is still Warden-sided (CS's Wingman maps run ~45–55 %).
- Server Strike test "ready up" takes ~4 s and sometimes ends in "socket hang up" (2 of 6 runs this pass).
- Glass Tower's knowledge has one 157 ms step (not this pass's).
- A bot's Daybreak is a hit-scan shot after its charge, not the server's flying ball.
- `arms.test`'s Daybreak test flakes (it did before this plan).
- No recording made (F11b); the stills stand in.
