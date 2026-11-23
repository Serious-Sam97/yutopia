# Plan 115 — the Strike Park, again: soul (100 phases)

Asked 2026-11-22, after the user tried plan 114:

> EVERYTHING IS HORRIBLE DAMN. LETS CREATE A new PLAN with 100 phases fixing every aspect of this mode
> 1- The menus are horribles
> 2- I dont know how to exit a game
> 3- The menu selections didnt work for me when i press a button to select casual for example
> 4- ALL THE VISUALS ARE HORRIBLE, the new structures, maps etc....
> 5- When on this mode, the weapon should aways appear, not only when im pressing the right mouse button
> 6- Add a billboard on the beggining of the new road like we did with the Kart Billboard
> 7- The lobby is SHIT, add life, add things, add visuals
> BE INSPIRED ON COUNTER STRIKE lets add soul on this thing

Status: **planned 2026-11-22; forks decided 2026-11-22 one by one (below). Changed from the proposals: F2 all six
maps together, F3 varied climates (two hot, two wet, two snow; each map's own sky inside the walls), F6 no
penalty for leaving, F8 recorded sounds my picks, F11 own clothes with a team armband and vest, F12 no
sign-offs: built straight through, tested by the user at the end.**

## What went wrong in plan 114 (honest list)

1. **The menus** were raw `<div>`s added to the page by `strike.ts`, not the game's own panels: no real layout,
   no states, no hover or focus, no sound. They don't open in the HUD's panel slot (`hud.panel`), so the game
   doesn't know a menu is open: WASD still walks and the mouse can be the camera under them.
2. **The selections didn't work** (the user's "casual"). Two real bugs:
   - the lobby panel is drawn once (`renderLobby`) and never redrawn, so a click never shows;
   - the server refuses a mode change once anyone has joined (`strike:settings` only sets `mode` with no match,
     and joining makes the match), so after you join the click does nothing at all.
3. **No way out was shown.** Leaving exists (a button deep in the desk's panel, or walking out of the gate), but
   nothing on screen says so. There's no Esc menu and no "Leave match".
4. **The visuals** are textured boxes: the maps are blockouts with tiling canvas textures, window decals and
   snow slabs. No modelled buildings, trims, props, decals, baked light or detail. The plan said "kit 3D from
   Blender" and that was never done.
5. **The gun shows only on right mouse.** The park kept the world's Alan Wake 2 handling (plans 79–84): the gun
   at low ready, out of view until aimed. In this mode it should always be held and on screen, as in CS.
6. **No billboard** on the county road where the Strike Park road starts (the Kart Park has its V billboard,
   `KART_SIGN`).
7. **The lobby is a bare paved yard** with a desk, a board and a screen. Nobody's there, nothing to do, no
   sound.
8. **Missing beyond the user's list** (in the spirit of "every aspect"):
   - team kit for people;
   - the bots are flat Vortex drawings;
   - synthesized, thin sounds;
   - no match flow screens: team select, map vote, warmup board, round-end card, end-of-match MVP;
   - no tutorial;
   - no ranks or stats;
   - no ping wheel;
   - no kill cam;
   - no damage report.

## The line we hold (unchanged from plan 114)

Inspired by Counter-Strike in **how it plays and feels**: its flow, its menus' clarity, its HUD conventions, its
rounds and economy, its map-design rules, its sound being information, its "one more round" pull. The **look,
names, maps, models, sounds and UI art are our own** (no CS screenshots, layouts, icons, fonts or audio in the
repo). Where CS has a convention players know (the buy grid by role, Tab for the scoreboard, a round-end card,
the kill feed, a C4-like charge that beeps faster), we keep the convention and draw it our way.

The guns stay the world's (the user, 2026-11-21: their numbers, sounds and third-person handling are done).
What this plan adds is how they're **held and shown in this mode**.

## Arcs

| Arc | Phases | What |
|---|---|---|
| A | 1–6 | Ground truth: bugs fixed first, the mode's state machine, a test harness |
| B | 7–20 | Menus and flow: the game's own panels, the main menu, the Esc menu, team select, map vote, end screens |
| C | 21–28 | The gun always in hand: the mode's own ready stance, a CS-style first-person view model, third person |
| D | 29–38 | The HUD again: designed, not divs |
| E | 39–43 | The road in: the billboard, the road's dressing, the arrival |
| F | 44–58 | The lobby with life: a base people want to hang out in |
| G | 59–64 | The art kit: Blender, a style guide, materials, decals, light |
| H | 65–82 | The maps rebuilt one by one, hand-made |
| I | 83–88 | People and bots: team kit, bots as real people |
| J | 89–93 | Sound with soul |
| K | 94–97 | The feel: kill cam, damage report, ranks, the pull |
| L | 98–100 | Checks, playtests, sign-off |

## The phases

### A — Ground truth (1–6)

| # | Phase | Exit test |
|---|---|---|
| 1 | **The two selection bugs.** Mode, bots and level can be changed during warmup by anyone in the match (a vote when more than one person is in); every panel redraws from the room's state when it changes | e2e: click Casual in warmup → mode Casual on every screen within 200 ms |
| 2 | **Panels in the HUD's panel slot.** Every menu of the mode opens through `hud.panel` (the React layer the rest of the game uses): the pointer freed, the walker stopped, Esc closes, gamepad focus | e2e: a menu open, WASD doesn't move you; Esc closes; clicks land |
| 3 | **The mode's state machine written down:** lobby → queued → team select → warmup → match → end screen → lobby, each with its UI, its keys and its way out. A diagram in this file | every state reachable and leavable in e2e |
| 4 | **A way out from everywhere:** Esc → "Leave match" (confirm) in any state; walking out of the gate; disconnect. The pockets always given back | e2e: leave from each state, pockets restored |
| 5 | **The test harness:** `/dev/strike` loads the arena alone (no world), a map by key, bots, a fixed hour, a free camera, stills | the page loads a map in < 5 s |
| 6 | **The 114 debt list closed:** the dead camera, the facing byte, the key capture order — covered by tests so they don't come back | tests green |

### B — Menus and flow (7–20)

| # | Phase | Exit test |
|---|---|---|
| 7 | **Mocks first** (Figma-like stills in `design/strike2/menus/`): the main menu, the play screen, team select, map vote, Esc menu, round-end, match-end, loadout, stats | reviewed against the style guide (F12: no sign-offs) |
| 8 | **The design system for the mode:** its own skin, inside the game's walnut-and-manuscript family but harder-edged (military stencil and paper tags, F1); type scale, colours per team, button states (rest, hover, focus, pressed, disabled), panel motion, click sounds | a storybook page `/dev/strike-ui` with every component |
| 9 | **The Strike terminal at the desk:** X opens the mode's main menu full screen over the blurred lobby: PLAY · LOADOUT · STATS · MAPS · SETTINGS · LEAVE | opens in < 150 ms; every item reachable by mouse, keys, pad |
| 10 | **PLAY:** mode cards (Competitive, Casual, Wingman, Deathmatch, Arms Race, Retakes) with what each is, players, length; a map pool picker; "Find match" | picking Casual starts a Casual lobby; the card shows selected |
| 11 | **The queue:** who's queued, bots filling at a countdown, "Start now" for the host, a ready check (accept within 15 s) | two people queue, accept, the match starts |
| 12 | **Team select:** two columns (Raiders · Wardens) with players and bots, auto-assign, a swap request, the team's kit shown | balanced teams by default; a swap moves one person |
| 13 | **Map vote** (Competitive/Casual): three maps from the pool, 15 s, ties random | the winner goes up with the swap show |
| 14 | **Warmup board:** a corner card while warming up: time left, who's ready, "Ready up" (all ready → starts) | all ready → freeze time at once |
| 15 | **The Esc menu in a match:** Resume · Settings · Scoreboard · Call a timeout (Competitive) · Leave match (confirm; no penalty, a bot takes your place: F6) | each item works; Leave returns you to the lobby, pockets back |
| 16 | **The round-end card:** who won and how (eliminated, the charge, time, rescue), the MVP with a reason line, your round (damage given and taken, kills), money next round | shown 5 s each round, readable at a glance |
| 17 | **Half time and overtime screens:** the score, sides swapping, a 15 s pause card | shown at 12 and in overtime |
| 18 | **The match-end screen:** winner, scoreboard with K/A/D/ADR/HS%/MVPs, the match MVP on a podium (their character in 3D), XP and rank change, "Play again" / "Back to the lobby" | shown at the end; both buttons work |
| 19 | **Tutorial** (first time in the mode): a 2-minute guided run on The Range — move, counter-strafe, buy, throw a smoke, plant, defuse | completable; skippable; remembered |
| 20 | **Settings for the mode:** crosshair editor (style, size, gap, colour), first/third person, view model position, mouse sensitivity in the mode, radio voice volume | changes apply live and persist |

### C — The gun always in hand (21–28)

| # | Phase | Exit test |
|---|---|---|
| 21 | **The mode's ready stance:** in the park the gun is always up, drawn on spawn and on buy, never holstered or at low ready (the world's handling untouched outside) | spawning, the gun's in hand and on screen within the draw time |
| 22 | **A first-person view model** made for this mode (F4): the world's gun models in the life hands, held CS-style (lower right, the sights on the right mouse), with idle sway, move bob, landing dip, firing kick | stills of each gun; no clipping at any FOV 70–100 |
| 23 | **Inspect** (F): each gun turned in the hands to show it off | each gun has an inspect |
| 24 | **Switching:** 1 primary, 2 pistol, 3 the combat knife (F5: the mode's own, Blender-made: stab, swing, inspect), 4 grenades, 5 the charge, mouse wheel cycles, Q last weapon (CS's keys, rebindable; the world's keys elsewhere) | every key does it; the HUD's slots match |
| 25 | **Reloads, bolts and racks** shown in first person, the same acts and timings as the world's | each gun's reload seen in first person |
| 26 | **Third person in the mode:** the gun always held at a ready, the body aiming where you look (others see you aiming) | others see your gun up, never holstered |
| 27 | **The crosshair** (dynamic with spread, or static: setting), the scope overlay for the sniper, the hit marker | hits marked; the scope covers the screen when scoped |
| 28 | **Grenades in hand:** the grenade held, pin pulled on press, thrown on release (left far, right short, both mid), its arc preview off (CS has none) | throwing feels like CS: hold, release |

### D — The HUD again (29–38)

| # | Phase | Exit test |
|---|---|---|
| 29 | Mocks of the match HUD in the mode's skin (with phase 7) | reviewed against the style guide |
| 30 | **Health and armor** bottom left, big numerals, bars that drain, a red edge when low | readable at a glance |
| 31 | **Ammo** bottom right: mag/reserve, the gun's silhouette, a reload prompt | correct for each gun |
| 32 | **The money** with the buy-zone icon; a +$ tick on rewards with the reason | each reward shows |
| 33 | **The top bar:** score, round clock, round number, the teams' alive pips (people icons) | pips drop as players die |
| 34 | **The kill feed** redesigned: gun icons (our own drawings of the world's guns), headshot, wallbang, through smoke, blind icons | each mark appears correctly |
| 35 | **The radar** redesigned: the map's own overview art, callout names, teammates, the charge, spotted enemies, sound pings | matches the map; rotates or not (setting) |
| 36 | **The buy menu** redesigned: the grid by role with the gun's picture, price, kill reward, stats; your loadout preview; team's money; "Drop for a teammate" | buying by mouse and number keys |
| 37 | **The scoreboard** redesigned: avatars, K/A/D, ADR, MVPs, ping, money (teammates), alive/dead, the charge carrier | Tab shows it instantly |
| 38 | **Notifications:** the charge planted/defused banners, "last one alive", "1 vs N", bomb timer ring, the defuse bar | each fires once, right |

### E — The road in (39–43)

| # | Phase | Exit test |
|---|---|---|
| 39 | **The billboard** at the Strike Park road's start on the county road (as `KART_SIGN`): a two-faced sign, lit at night, the park's own logo and art (F7) | seen from both ways down the county road |
| 40 | **The road dressed:** snow poles, a few warning signs, a security post with a barrier arm halfway, floodlit fence along the last stretch | stills along the road |
| 41 | **The gate:** a proper entrance (a concrete gatehouse, turnstiles, the park's name in steel letters, flags, the big screen above) | still of the arrival |
| 42 | **The car park** with a few parked vehicles, lit | still |
| 43 | **The view from the road:** the compound's walls with banners, the cranes of the next map visible, the floods | the park reads from 200 m |

### F — The lobby with life (44–58)

| # | Phase | Exit test |
|---|---|---|
| 44 | **The lobby's plan** (mocks): a base in a converted military depot — the hall, the armory, the range, the canteen, the trophy room, the war room with the screens, the outdoor yard | reviewed against the style guide |
| 45 | **The hall:** a real building (Blender), the desk's terminal in it, benches, lockers, team flags, posters (our own art) | walk in, it feels like a place |
| 46 | **The armory:** the five guns on racks (the world's models), a cleaning bench, ammo crates, a quartermaster NPC with lines | each gun shown, inspectable (X) |
| 47 | **The practice range** in the lobby: targets that pop up, a timer course, your best times on a board | a course run with a time |
| 48 | **The war room:** big screens showing the live match (Follow the match on screens), the map's radar, the scores | the screens show the live match |
| 49 | **The canteen:** tables, a coffee machine (the world's drinks), a TV, chatter | sit, get a coffee |
| 50 | **The trophy room:** the match records, the best players, MVP statues (their characters posed) | records shown on the walls |
| 51 | **NPCs:** instructors, a quartermaster, mechanics, a DJ in the canteen — idle, walking, talking (the world's people, team kit) | 8–12 NPCs going about |
| 52 | **Bots warming up:** players-in-waiting at the range, in the canteen, stretching (bots between matches) | life when nobody else is there |
| 53 | **Music and ambience:** the hall's radio, the range's shots, the canteen's murmur, the PA's calls ("Raiders to the briefing room") | each room sounds its own |
| 54 | **The briefing room:** before a match, the teams' spawn here with the map on a table (its 3D model, small) and a countdown | the match starts from here |
| 55 | **Customization corner:** your team kit, your gun's charms/stickers (our own art), a mirror | changes show in the match |
| 56 | **Lighting** of the lobby: warm interior light, practical lamps, night floods outside | stills at day and night |
| 57 | **Detail pass:** decals, wear, clutter, signage, cables, puddles of meltwater | still review |
| 58 | **Perf pass of the lobby** (instancing, LOD, culling): Low ≥ 55 fps on the M1 | measured |

### G — The art kit (59–64)

| # | Phase | Exit test |
|---|---|---|
| 59 | **A style guide** for the mode (`design/strike2/style/`): references studied for what makes competitive maps readable (contrast at chokes, clean floors, readable silhouettes, landmark per area, colour per site) — our own palette and materials in the world's life look (plan 73); the six climates' palettes (F3) | written; every later phase checked against it |
| 60 | **The kit in Blender** (`tools/art/strike/`): walls with trims and corners, doors, frames, windows, stairs, railings, catwalks, crates (3 sizes), barrels, pallets, sandbags, containers, scaffolds, roofs, pipes, lights — modular on a 0.5 m grid, LODs, collision proxies | the kit GLB in the game; each piece in a still |
| 61 | **Materials:** PBR-lite in the life look — concrete, brick, plaster, timber, steel, corrugated, tile, glass, snow, ice; wear masks, edge wear | material sheet still |
| 62 | **Decals:** grime, cracks, snow drift, posters, graffiti (our own), numbers and arrows for callouts, A/B site paint | decals on a test wall |
| 63 | **Light and sky:** each map's own sky, sun, hour and weather inside the walls (F3b: step in and the climate is the map's; from outside a lit stage), baked AO and bounce from Blender into lightmaps; the real lights on top at night | each map lit in its own climate at 60 fps on High |
| 64 | **The map grammar grows** (`strike/map.ts`): pieces reference kit pieces (`kit: "door-wide"`), the walk grid and solids from their collision proxies; blockout boxes become kit automatically where they can | Sawmill's blockout dressed by kit rules |

### H — The maps rebuilt (65–82)

Each map: its layout reviewed against the competitive rules, then built from the kit and its own hero pieces in
Blender, then light, decals, sound zones, bot paths, a playtest with bots. **F2: all six together** — the kit
first (G), then the six dressed side by side, each phase below done for every map it names before the next.

**Climates (F3, F3d):**

| Climate | Maps |
|---|---|
| Hot | Freight (a dry rail yard at golden hour), The Range (a desert training ground) |
| Wet | Sawmill (autumn rain), Glass Tower (a rainy city) |
| Snow | The Lodge (a mountain night), Boathouse (a frozen lake) |

| # | Phase | Exit test |
|---|---|---|
| 65 | **Sawmill: the layout review** (lanes, chokes, sightlines, cover heights, a landmark per area) | the checks + a written review |
| 66 | Sawmill: the mill town built (the sawmill with its saw hall, the log yard, the grain store, the covered bridge, the river under ice) | stills from each callout |
| 67 | Sawmill: light, decals, details, callouts painted on walls | stills day/night |
| 68 | Sawmill: bot paths, a 5 v 5 bot match | a match to the end |
| 69 | **Freight:** layout review | the checks |
| 70 | Freight: the rail yard built (wagons, containers, the depot, the gantry crane, the signal box) | stills |
| 71 | Freight: light, decals, bot match | a match |
| 72 | **The Lodge:** layout review | the checks |
| 73 | The Lodge: the hotel built (lobby, dining hall, kitchens, terrace, the lift station) | stills |
| 74 | The Lodge: light, decals, bot match | a match |
| 75 | **Glass Tower:** layout review (vertical play) | the checks |
| 76 | Glass Tower: the half-built office block (core, floors, scaffold, glazing, hoists) | stills |
| 77 | Glass Tower: light, decals, hostage rescue with bots | a match |
| 78 | **Boathouse:** review, build, light, bot Wingman | a match |
| 79 | **The Range:** rebuilt as the lobby's own training ground (kill house, firing line) | the tutorial runs in it |
| 80 | **Overviews:** each map's radar art drawn from its 3D (top-down render, inked) | radars in the HUD |
| 81 | **The swap show** redone with the real maps: crews, trucks, cranes lifting kit pieces, the map assembled piece by piece | a 20 s show that looks like construction |
| 82 | **A seventh map** (if F2 says so): a new bomb map in a different setting | the checks + a match |

### I — People and bots (83–88)

| # | Phase | Exit test |
|---|---|---|
| 83 | **Team marks** (F11): your own clothes with the team's armband and a plate-carrier vest in its colour (worn while in the match, off when you leave); the bots in full team kit | stills of 5 v 5 |
| 84 | **Bots as people** (F9 again: no more flat drawings): the world's 3D people in team kit, Vortex's mark on them (a patch, his face on a mask) | bots look like players |
| 85 | **Animations for the mode:** walking with the gun up, crouch-walk, strafing, planting, defusing, carrying a hostage, dying (ragdoll) | each seen in third person |
| 86 | **Bot brains, round two:** they use the new kit's cover, throw smokes on known spots, rotate on sound, trade kills, save weapons, plant in good spots | Hard bots beat a new player; Easy don't |
| 87 | **Bot chatter** in the radio voice (callouts by area name) | heard in a bot match |
| 88 | **Hostages** as people (scared idle, follow when taken) | a rescue looks right |

### J — Sound with soul (89–93)

| # | Phase | Exit test |
|---|---|---|
| 89 | **Recorded sounds** (F8: CC0, my picks) for everything new: grenades, the charge, doors, footsteps per surface on the kit's materials, menus | each sound in; the user changes any after |
| 90 | **Voices:** the round's announcer and the radio, recorded or chosen voices (our words), the team's own voice per side | every call voiced |
| 91 | **The mix:** footsteps' direction and floor clear over everything, occlusion through the kit's walls, reverb per room | a footstep's side and floor named right blind |
| 92 | **Music:** the main menu's theme, the round's tension, the last 10 s of the charge, the MVP sting — CC0 tracks, 2–3 offered per slot, the user's picks (F10) | picked and in |
| 93 | **The lobby's soundscape** (with phase 53) | each room sounds its own |

### K — The feel (94–97)

| # | Phase | Exit test |
|---|---|---|
| 94 | **The kill cam and damage report:** who killed you, from where, with what, their health left; your damage to each enemy that round | shown on death |
| 95 | **Hit feedback:** hit markers, blood decals on walls (setting), the target's flinch, your screen punch when hit | felt on every hit |
| 96 | **Ranks and stats:** XP per match, a rank ladder (our own names and badges), stats per gun and per map, kept in `apps/api` | rank goes up after wins |
| 97 | **The pull:** daily missions ("win 2 rounds with the AK"), a match history, a highlight replay of your best round | missions complete |

### L — Checks (98–100)

| # | Phase | Exit test |
|---|---|---|
| 98 | **Playtests with bots:** a full Competitive match per map, 5 v 5 bots and me, notes taken and fixed (the user's own test at the end: F12) | every map played to the end, notes fixed |
| 99 | **Perf and memory:** Low ≥ 50 fps in a 10-player match with smokes on the M1; High ≥ 60 on the dev Mac; no memory growth over 10 map swaps | measured |
| 100 | **The final review:** every phase's exit test re-run, e2e `strike-*.spec` green, PROGRESS written | all green |

## Forks — decided 2026-11-22

| # | Question | Decided |
|---|---|---|
| F1 | The menus' style | **The mode's own tactical skin** (stencil, paper tags, steel) in the game's walnut family |
| F2 | The maps | **All six together**: the kit, then the six dressed side by side |
| F3 | The setting | **Varied climates** (as CS's spread of places) |
| F3b | Climate vs the world's snow | **The map's own sky inside the walls**; from outside a lit stage |
| F3c/d | Which climates | **Two each:** hot Freight, The Range · wet Sawmill, Glass Tower · snow The Lodge, Boathouse |
| F4 | The gun on screen | **A CS-style first-person view model**, lower right, always shown |
| F5 | Melee | **A combat knife** of the mode's own in slot 3 |
| F6 | Leaving mid-match | **Any time, no penalty**; a bot takes the place |
| F7 | The billboard | **Two-faced and lit, like the kart's**, the park's own logo and art |
| F8 | Sounds | **Recorded CC0, my picks**; the user changes any after |
| F9 | Bots | **The world's 3D people in team kit with Vortex's mark** |
| F10 | Music | **CC0 tracks, 2–3 offered per slot, the user picks** |
| F11 | People's look | **Own clothes + the team's armband and vest** |
| F12 | Sign-offs | **None: built straight through, the user tests at the end** (the music picks the one stop) |

## Progress (built straight through, F12; uncommitted)

**2026-11-22, first session:**

- **A: ground truth.**
  - Phase 1: the mode, the bots and their level change in warmup. A mode change remakes the match with everyone
    kept on their side; a mode its map isn't played in is refused with the reason. The menus redraw from the
    room's state (`hud.strike`, written by `world/strike/strike.ts` when it changes). The e2e "menus" test clicks
    Casual and Hard in warmup and sees both taken and shown.
  - Phase 2: every menu is a real panel in `hud.panel` (`components/hud/StrikePanels.tsx`), so the walker stops
    and the pointer is freed while one's open.
  - Phase 4: Esc in the match (the pointer let go) opens the match's menu, with "Leave the match", a confirmation,
    and the pockets given back. The HUD always says "ESC the match menu · leave".
  - Fixed on the way: the dev world server's watcher had gone stale (restart it after editing world-server code).
- **B: menus.**
  - The terminal (X at the desk) in the mode's own skin (`StrikePanels.module.css`):
    - Play: mode cards, bots on/off and their level, join a side or auto, watch the match, start, back, leave,
      and both rosters;
    - Maps: cards with radars and climates;
    - Record;
    - How to play: the rules and every key;
    - Settings: crosshair style, size and colour.
  - The Map Board, the buy grid (by role, gun pictures of our own, number keys), the Esc menu, and a round-end card
    (who won and how, the MVP and why).
- **C: the gun in hand.**
  - Phase 21: in the match a gun is always drawn (on join, buy, respawn). The world's quick bar and gun counter
    hide.
  - Phase 22: a CS-style view model, lower right with the muzzle on the crosshair (`strike/flag.ts vm`, applied
    in `tp/hands1p.ts` only in the park, off the sights); tuned on stills.
- **D: the HUD**, in the skin:
  - the score bar with players-alive marks and the clock or phase;
  - health, armor and money with bars and +$ ticks;
  - the gun, magazine/reserve and slots;
  - the radar and kill feed;
  - the crosshair from the settings;
  - planting and defusing bars, the round-end card;
  - the world's dock hidden in the match.
- **E: the billboard** (`STRIKE_SIGN`): a two-faced lit V on the county road by the gatehouse, the park's own art
  (stencilled name, emblem, the teams, "turn here → 400 m"), its verge cleared, its posts solid.
- **G/H: the maps dressed with plan 110's Blender building kit** (`arena3d.ts kitPlan/buildKit`): every
  building-look block drawn as a kit building (townhouses, warehouses, barns, sheds, hotel, office, boathouse…).
  Long blocks split into rows of up to 30 m, doors to the lane they open on. The solids stay the map's own.
- **F: the lobby's six buildings** (real Grounds buildings, walk-in, furnished):
  - the canteen (the diner's twin, 90 pieces);
  - the bar "The Last Round" (the town bar's twin, 74);
  - the armory (lockers, workbenches, cases);
  - the briefing hall (a stage, a whiteboard, bleachers);
  - the trophy hall (cases and trophies);
  - the war room (desks and monitors; a planning room upstairs).

  All pass plan 113's furnishing checks; the Grounds pins were updated with a dated note.

**Later in the same session:**
- **F: the yard dressed.** Pavers over the dirt; the teams' banners down both walls (our own chevron and shield);
  the team doors signed "RAIDERS ▸ ARENA" and "WARDENS ▸ ARENA"; lamp posts along the walk; benches and planters
  about the hub; the teams' flags by the gate.
- **F phases 51–52: the lobby's people** (`shared strike/folk.ts`, `world-server features/strike-life.ts`). Five
  staff at their posts: Marta the quartermaster, Dimas the instructor, Nell the cook, Otto the keeper, Inês the
  officer. Six recruits in team colours walk from the yard's hub out to the doors, the board, the desk, the
  gallery's stairs and the gate, each along a way kept clear of the buildings. All say lines of our own, drawn as
  the world's people (`grounds-life.ts folk`).
- **I phase 84: the bots as the world's people.** Room NPCs `strike-bot:<id>` in team jackets and caps, the look
  varied by id, their gun in hand (the NPC's `mood` carries "<team>:<gun>"), walking or still, gone when dead. The
  flat Vortex drawings are only for the swap's crew now.
- **G phase 63 (F3, F3b, F3d): each map's own climate inside the walls** (`shared strike/climate.ts`). Step into
  the arena and the view takes the map's hour, weather, fog and ground (`controller.ts`, from `strikeKeys.climate`):
  - Freight: hot, golden hour; The Range: desert noon;
  - Sawmill: autumn rain; Glass Tower: a rainy city;
  - The Lodge: snow at night; Boathouse: a frozen lake in the morning.

  The hot maps lay sand over the pad and the wet ones mud with puddles; the snowy ones keep the world's snow
  layer. Checked on a still: Sawmill in rain, mud and puddles, the bots running in it.

**Then:**
- **I phase 83 (F11):** in the match people keep their own clothes with the team's vest over them, amber or steel
  (`controller.ts avatarState`).
- **J phase 89 (F8: my picks):** the HE, the charge's blast (plus a far boom), the flashbang's crack and the fire
  are now recordings, the repo's own CC0 library (`public/sfx/cars/blast-*`, `fire-*`, `guns/daybreak-burst-far`;
  credited in `sfx/CREDITS.md`), warmed ahead. The beeps, the keypad and the smoke's hiss stay synthesized
  (electronic or plain noise).
- **K phase 94: the kill cam and damage report.** On death the camera looks from where you fell to your killer for
  2.6 s; a card says who, with what, a headshot or not, their health left, and your round's damage given and taken
  per enemy (`strike:death`).
- **B phase 18: the match-end screen.** Victory or defeat, who took it and the score, the match MVP, both teams'
  boards, and how to go again or leave.
- **Checked:**
  - shared 59 (strike, furnishings, spaces, the Grounds' pins, land); world-server strike/arms/schema 19;
  - e2e `strike.spec.ts` 2 of 2 in the real game (2.3 min): join with bots, first person and K, a buy, a smoke,
    following from the lobby, the map swapped and back; the menus' Casual and Hard taken in warmup, the Esc
    menu's leave;
  - stills of the lobby with its people, the yard, the billboard, Sawmill dressed by the kit and in its rain, the
    bots as people, the HUD and the view model.

**Where the 100 phases stand (end of 2026-11-22):**
- **Done or done in substance:**
  - A: 1, 2, 4, 6;
  - B: 9, 10, 12 (team pick in the terminal), 15, 16, 18, 20;
  - C: 21, 22, 27 (crosshair);
  - D: 29–34, 37, 38 (most);
  - E: 39;
  - F: 44–46, 49–51, 52 (recruits), 57 (part);
  - G: 63 (climates); H: 65–79 in part (every map dressed by the kit, in its climate);
  - I: 83, 84;
  - J: 89 (the recorded blasts and fire);
  - K: 94.
- **Not yet:**
  - A 3: the state diagram written down. A 5: the `/dev/strike` harness.
  - B 11, 13, 14, 17, 19: the queue and ready check, the map vote, the warmup board, the half-time screen, the
    guided tutorial.
  - C 23–26, 28: inspect, the combat knife (a new Blender model), CS's weapon keys, first-person reloads checked,
    grenades held and released.
  - D 35, 36: radar art from each map's 3D, the buy menu's stats and "drop for a teammate".
  - E 40–43: the road's dressing, the gatehouse, the car park's cars.
  - F 47, 48, 53–56, 58: the practice range, the war room's live screens, the lobby's sound, the briefing room
    start, the customization corner, lobby lighting and perf.
  - G 59–62, 64: the style guide, a new Blender kit of the park's own, materials, decals, kit pieces in the map
    grammar.
  - H 66–82 in full: each map's own Blender hero pieces, its light baked, its decals, overviews; the swap show
    with real construction.
  - I 85–88: the mode's animations, bot brains round two, bot chatter, hostages as people.
  - J 90–93: voices, the mix with occlusion, music (F10: the user picks from 2–3 CC0 tracks per slot — the one
    stop), the lobby's soundscape.
  - K 95–97: hit feedback, ranks and stats in `apps/api`, missions.
  - L 98–100: bot playtests on every map, perf and memory, the final review.


**2026-11-22, second stretch ("Keep building"):**
- **B phases 11, 13, 14, 17: the vote, ready-up, half time.**
  - When a match ends, a 15 s vote on three maps the mode is played on, keys 1–3 on the match-end screen, live
    counts. The winner goes up with the swap's show if it's another map, and a new warmup starts with everyone
    kept on their sides.
  - In warmup, F3 (or the Esc menu) marks you ready; when every person is ready it starts, with a board of who's
    ready.
  - A half-time card: the sides swap and which side you're on now.
  - Server test: one person ready → the match starts.
- **I phase 88: the hostages as the world's people**, civilians in high-vis vests, on their floor or following
  whoever carries them (NPCs `strike-hostage:<i>`).
- **I phase 87: bot chatter.** A bot calls "Contact!" over its team's radio when it first sees an enemy, every
  8 s at most.
- **K phase 95: hit feedback.** A hit marker at the crosshair (red for the head); hit, the screen's edge goes red.
- **E phases 40–42.** The gatehouse outside the gate (a kit gatehouse, a real Grounds building); five cars in the
  car park (`car/homes.ts`); a striped barrier arm on the road in.
- **G phase 60: the park's own Blender prop kit** (`tools/art/strike/props.py` → `public/life/strike/props.glb`,
  310 KB): a corrugated 20 ft container with doors, rods, hinges and corner castings; a crate; an oil drum; a
  pallet; sandbags; a concrete barrier. Every map's containers are drawn as it, tiled along their block, stacked
  to its height, painted in the yard's colours and instanced; every crate is the kit's crate. Freight is now a
  real container yard.
- **D phases 35, 80: the radar.** Each map's picture drawn once and kept (its climate's ground, buildings tinted
  by material with shadows, the callouts' names); teammates and the charge as markers over it. This also fixed a
  perf fault: the radar was redrawn and re-encoded every frame.
- **C phases 24, 28: CS's keys in the match.** 1 the primary, 2 the pistol, 3 the knife, 4 a grenade, Q the last
  one. A grenade's J held is the pin out, let go is the throw. **Left click fires from the hip in the match**:
  the world's guns fired only while aiming, part of the user's "only when I press the right mouse button"; each
  gun's own hip spread, as it is.
- **C phase 24, F5: the combat knife** (a held kind, `held.ts knife`; its model in `tp/view.ts`):
  - 3 takes it out, drawing a gun puts it away, left click stabs;
  - the server takes the nearest enemy within 1.8 m in front: 40 damage from the front, 90 from behind;
  - a $1,500 kill reward; a swing sound; it sits in the view's lower right.
- **C phase 23: inspect (F).** The gun brought in and turned to show its side, held, back (2.4 s).
- **L phase 98: bot playtests.** `world-server strike-bots.test.ts` plays a Casual match of ten bots to its end
  on each bomb and hostage map in simulated time:

  | Map | Rounds | How they were won | Score |
  |---|---|---|---|
  | Sawmill | 13 | 8 eliminations, 4 bomb, 1 defuse | 8–5 |
  | Freight | 14 | 14 eliminations | 7–7 |
  | The Lodge | 14 | 13 eliminations, 1 bomb | 6–8 |
  | Glass Tower | 14 | 10 rescues, 4 eliminations | 7–7 |

  Glass Tower leans to the Wardens: a balance note.
- **Checked:** shared strike 31; world-server strike, arms, schema and bots 24; e2e `strike.spec` 2 of 2 (the first
  needed its opening swap given more time when another map was standing); stills of the knife, the inspect, the
  new radar and the warmup board, and Freight's container yard.

### Last stretch (2026-11-22)

- **F phase 47: the lobby's practice range.** Five targets on the outer wall's yard face (`STRIKE_TARGETS`), a
  firing line painted 15 m out, a "RANGE · 15 m" plate. Shots out of a match in the compound are checked against
  them on the server (`rangeHit` in shared `strike/land.ts`, asked by `features/arms.ts`); each hit comes back as
  `strike:target` (target, ring 1–10, metres) and a running score in a toast.
- **F phase 48: the war room's live screen.** A display stood in the war room facing its door: the map's radar
  with everyone on it (both sides: it's the war room), the score, the round and phase, the clock. One canvas
  redrawn twice a second, only within 40 m.
- **F phase 54: the briefing hall's model.** The map standing as a 1/68 table model on a plinth in the hall's
  aisle: its blocks coloured by material, heights ×3 so they read standing, the edge walls and roofs left off, the
  sites marked. Made again when the map swaps.
- **J phases 53, 91, 93: the beds and walls.** In the lobby the people's murmur (louder near the yard's middle)
  and a glass or a cue now and then from the bar; in the arena the map's wind and rain by its climate. Through the
  map's walls a sound is quieter and duller: each wall between my ear and it halves it again and takes the highs
  (`StrikeSound.at`, the map's own `shotThrough`).
- **B phase 19: the tutorial.** A checklist at the left the first time I'm in a match (`tutorial.ts`): move, stop
  dead, crouch, switch guns, buy, land a hit, throw a grenade; plant and defuse on a bomb map. Each one is ticked
  from the match's state (the gun in hand, the crouch, money and grenades going down, the hit and charge events),
  not from keys. Remembered once done; "Tutorial match" in the terminal's Play tab starts one (Casual), and the Esc
  menu has "Tutorial again" and "Skip".
- **H phase 81: the cranes carry.** Each crane in the swap's show has a cable, a hook and a spreader with a
  container on it, let down and hauled up as the jib swings.
- **K phases 96–97: ranks, stats, missions.** Shared `strike/ranks.ts`:
  - ten ranks of our own (Recruit to Snowline Legend), each with a badge colour and chevrons;
  - XP for a match: 100 for playing it out, 150 more for a win, plus kills, headshots, objectives, MVPs;
  - stats by gun and by map, the last ten matches;
  - three daily missions from a pool of 15 (the same three for everyone that day), paid once each.

  The world-server tallies each person's match by account (`features/strike.ts`, warmup not counted) and adds it
  to their card at the end. It sends `strike:card` (XP, missions done, a promotion as a toast) and keeps the cards
  in the world's settings through `apps/api` (`PUT /internal/world/strike`, like the Kart Park's record). The
  terminal's Record tab shows the badge, the XP bar, today's missions, stats and history, with the wall's last
  matches under them.
- **Checked:**
  - tests: shared strike 34; world-server strike, arms, schema and bots 24; the API's new route (Pest, in-memory DB;
    the dev DB's users counted before and after); e2e `strike.spec` 2 of 2;
  - the tutorial joined and ticked with real keys (move, stop, crouch, switch, hit), and my card arrives;
  - stills of the range, the war screen, the model and the cranes.
- **Perf and memory (L 99, `e2e/strike-perf.mts`, headless on the dev Mac with `next dev` running):**
  - Low, 10 in the match: 44 fps, and 47 with a smoke, a fire, an HE and a flash going (plan 114: 24–25);
  - High: 36–40 in the match. The lobby looking at the arena holds 60 (vsync) on High, so the cost is in the match
    itself, most likely the nine bots drawn as the world's people. **Not at the plan's targets (Low ≥ 50 on the M1,
    High ≥ 60): open.**
  - Memory over four swaps: geometries 4,506 → 3,903 and textures 603 → 556 after; no growth.

### The rest built (2026-11-22, after "do all the not built yet")

- **The freight train's wagons** were already the prop kit's models (boxcar, flatcar, tanker, brake van, buffer
  stop); the item on the list was stale. What did look unbuilt there were the relay huts, too small for the building
  kit's shed and falling back to a bare white block: they're now their own Blender model (door, louvres, cable trough).
- **H 66–79: a showpiece per map** (`tools/art/strike/props.py`: nine new parts in `props.glb`, 1.4 MB), standing
  in the band between each map's edge and the arena wall (never the south side: the gallery and the team doors),
  seen over the walls from inside (`arena3d.ts BACKDROPS`, instanced, no solids):

  | Map | Showpieces |
  |---|---|
  | Sawmill | a 24 m brick mill chimney, two timber water towers |
  | Freight | a 24 m container gantry crane, a signal box, a relay hut |
  | The Lodge | three chairlift pylons with their haul rope and chairs, a water tower |
  | Glass Tower | two 32 m tower cranes |
  | Boathouse | a banded lighthouse with its keeper's hut, a water tower |
  | The Range | two watchtowers with a windsock, a signal box |

- **H 67–79: the light baked** (`arena3d.ts` bakeBox, groundShade), worked out once as the map's built, with no
  lights to pay for each frame:
  - walls darken toward their foot (each side now cut in rows ~1.2 m high to grade it);
  - anything under a roof or an upper floor is darker still;
  - a soft shadow on the ground under every block and roof: a picture multiplied over it (three's multiply blending
    needs `premultipliedAlpha`, or it draws nothing and warns every frame).

  The building kit's buildings keep their own light; their feet get the ground's contact shadow.
- **I 85: the mode's animations** for the bots (people drawn as NPCs). Their `mood` now carries a pose: crouched (at
  the charge; Hard and Expert also crouch to shoot past 12 m), the gun up when someone's in sight, a flinch when hit,
  and a fall to the ground when killed. They stay down where they fell till the next round, where before they
  vanished. Human players killed in a match lie down the same way instead of standing. The guns' third-person
  handling is untouched (the user's rule).
- **I 86: bot brains, round two** (`strike-bots.ts` botAim, botHands, plantSpot; shared by the server and the
  playtest):
  - the carrier plants on the site's most covered spot (of points across it, the one with the most of eight ways
    closed by a wall within 2.5 m);
  - a teammate falls near → they trade (go where it happened);
  - a bomb map's Wardens rotate to enemy gunfire heard far off (one decision per sound, some go, the rest hold);
  - a Warden too late to defuse (the fuse shorter than the way there plus the defuse) saves and falls back;
  - crouching to plant, defuse and fight at range.

  Each habit is weighted by level (Easy none, Expert all). Exit test, `strike-bots.test.ts`: **Hard beat Easy 32–0**
  over four matches. Equal bots over ten matches came out 41 % / 59 %: high variance (the economy snowballs), no
  side favoured.
- **F 55: the customization corner** in the yard against the outer wall, west of the desk:
  - a team locker, a full-length live mirror (three's Reflector, drawn only with someone within 10 m), a bench and a
    "KIT" plate;
  - E opens "Your kit": the vest's shade (three per team), its pattern (plain, stripes, check, trim, dots), the team
    cap, and a charm on your gun (pine, snowflake, die, bear paw, Vortex: `tp/charm3d.ts`, hung at the trigger
    guard in first and third person);
  - standing there you wear it in the mirror out of a match;
  - it's kept on your rank card (`apps/api`), and the world-server puts it on your match member (`StrikeMember.look`)
    so everyone sees it.
- **K 97: the best round's replay** (`strike/replay.ts`):
  - while a round's played, everyone's place is sampled ten times a second and my kills are noted;
  - the round is kept if it beats my best (a kill 2, a headshot 1 more);
  - at the match's end, H plays it back over my shoulder, from 4 s before my first kill to 2.5 s after my last
    (25 s at most): everyone as a figure in their team's vest with a gun, the fallen tipping over, "KILL" /
    "HEADSHOT" called, the banner with the count. H or Esc stops it.
- **Checked:**
  - tests: shared 47 (strike, land, the Grounds' pins and town); world-server strike, arms and schema 20; bots 6
    (four maps to the end, Hard v Easy, even over seeds); e2e `strike.spec` 2 of 2;
  - stills: the showpieces from the gallery on every map, the relay huts, the corner (stripes, cap, revolver at the
    mirror), the replay;
  - perf on Low unchanged (46–47 fps), memory flat over four swaps.
- **Not checked in the game:** the bots' crouch, aim, flinch and fall were checked in code and types only, not
  watched in a live match. Neither was a real match's end-to-replay; the replay itself was checked with a made-up
  round.

### The user's bugs (2026-11-22)

1. **Leaving left you standing on the map.** Leaving from the menus now sends you back to the lobby yard by the
   desk (a little apart from each other); so does the match closing when its last person goes
   (`features/strike.ts` toLobby). The e2e checks you're in the yard after "Yes, leave".
2. **White flakes on the ground (Sawmill).** Two causes:
   - snow slabs were laid on every open top even on the wet and hot maps, so the low kerbs and floors showed white
     strips near-flush with the ground. Now only the snowy maps (the Lodge, the Boathouse) get them;
   - the map's ground plane sat 3 cm over the world's white ground with no depth bias. It now sits 5 cm up with a
     polygon offset; the ground shadow and the site paint sit over it with their own.
3. **The join desk.** Rebuilt as a heavy sign-up counter (`arena3d.ts` joinDesk) on the same footprint and solid:
   - the Raiders' and Wardens' halves, a walnut top with a brass edge;
   - a lamp at each end that glows brighter as that side fills, and pulses on yours;
   - a terminal screen showing the map, the mode, each side's people and bots, and "✓ YOU'RE IN · RAIDERS" once
     joined;
   - an overhead "JOIN THE MATCH · E" sign, and a dashed ring on the ground where E works (brighter while you
     stand in it).

   In the terminal, the join is two big team cards (count, roster, "Join the … ›"). A click shows "Joining…" and
   waits for the server; if it doesn't take within 3 s, a line says why to look at the top of the screen. Once in,
   a "✓ You're in · Raiders" banner says what's next, then the panel closes by itself. In the world, "YOU JOINED
   THE RAIDERS" is called with a tick.

**Still not done:**
- music (92: the user picks from CC0 candidates — the one stop);
- the mode's own voices beyond the browser's (90);
- the match's frame rate up to the targets (99: Low 46–47 against 50, High 36–40 against 60);
- the left sleeve that shows with the knife out.
