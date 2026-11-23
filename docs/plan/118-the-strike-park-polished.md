# 118 — The Strike Park, polished

Ask (2026-11-22, the user, after plans 114–117 and their feedback rounds): "now that we have everything working, this
last plan of this feature will be: improve everything — UI improvement in all UI, in game, buy screen etc…;
mechanics; visuals; lobby; all."

Status: **planned 2026-11-22; forks decided by the user one by one 2026-11-22**: F1a three mocked looks (the user
picks), F2a CS2's HUD layout, F3a one buy screen, **F4c movement as it is** (no CS step, no tagging for people), F5a
spray patterns, F6a the park's own damage table, F7a CS's hit feedback, F8a weapons on the floor, F9a all the effects,
F10a every lobby building with a job, F11a all the sound, **F12c no sign-offs** (straight through; the look's mocks
still shown, since F1 is your pick), **F13b frame rate best effort**. Follows plans 114 (the park), 115 (the
park again), 116 (first person), 117 (the bots). Third-person gun handling stays untouched (the user's rule since plan
114); this plan touches the park's rules, its HUD, its effects and its lobby, not how the world's people hold guns.

## Where we are — read from the code (an inventory of the park, 2026-11-22)

**What's good:** five modes and six maps that play end to end; CS2's round flow and money; bots that plan, talk and
fight (117); a first-person view model with reloads in frame (116); a lobby with a desk, a Map Board, a kit corner, a
practice range, six buildings and folk; per-map climates; baked light; the swap show.

**What's wrong — the UI:**
- **Three looks at once.** The world's walnut "manuscript" HUD (Georgia, `--amber` #f1d79a) stays on screen in a match
  (the location tag and online pill top-left/right, over the park's radar and kill feed); the park's own HUD and
  menus are a slate "tactical" skin (stencil Avenir, its own `--amber` #e8a33a); the in-world screens use a third and
  fourth (the big screen monospace orange, the Map Board Georgia). Team colours differ between them
  (#d9a066/#7fa6c9 vs #e8a33a/#6fa3c7). The lobby terminal's title is cut off by the radar.
- **The HUD** is one HTML string rebuilt on change (`strike.ts drawHud`): a score plate, pips for who's alive, a
  84 px kill feed of plain text (`Vortex + Ivy [Revolver ⊕] Bia`) that the radio's lines share, a 92 px radar, health
  and armour bars, a gun box. No portraits, no weapon icons.
- **The buy menu** (`StrikePanels.tsx StrikeBuy`) is five columns of text tiles; no pictures; `Number(e.key)` reaches
  items 1–9 only (13 are listed); the client's buy-time check is hard-coded (`115 - left <= 20`).
- **The scoreboard** (Tab) is a text table: K, A, D, MVP stars, money; its two halves' columns don't line up; no ping,
  ADR, HS %, no round history.
- **The round's end shows a banner only**: the round-end card and the money ticks are coded (`cardHtml`, `ticks`) but
  never assigned; the `money` event isn't handled.
- **Spectating** has no key to change who you watch; "Follow the match" still uses the old walnut frame.
- **Words that lie:** How to play says Shift walks quietly (it sprints, the user's pick) and the radio is "U then
  1–6" (it's 1–9 and 0); the tutorial says click to throw (it's J held); the desk says E, the board X.
- The replay's figures are boxes and cylinders, not the world's people; the swap crew are flat drawings.

**What's wrong — the mechanics:**
- **Players don't move like CS players.** CS acceleration, friction, air strafe, the landing slow, tagging (slowed when
  hit) and `moveInaccuracy` are in the shared code but used by the bots only; people move on the world's walker with
  CS's speed shares.
- **No spray pattern**: a camera kick and bloom per gun, no learnable recoil.
- **A headshot is ×1.5** (the world's), far from CS's; team damage is full when on.
- **No weapons on the floor**: the dead lose their gun; only the charge can be dropped.
- **Hits on bots** use their current positions (no rewind) with a fixed head share.
- **Grenades**: no jump-throw; no left/right-click throws; the arcs are good.
- **No timeouts, surrender or kick votes** (`ROUND.timeout` is defined, unused).
- **Footsteps are the world's**: not muffled by walls; the maps' materials' step sounds are never read.

**What's wrong — the visuals:**
- No bullet holes, no blood (a dark spark).
- Smokes are 34 growing sprites; fire 18 additive sprites; HE and flash an expanding sphere; a grenade in flight a
  dark ball.
- A flash is a plain white layer.

**What's wrong — the lobby:**
- The canteen, the bar, the armoury, the trophy room and the briefing hall are furniture and lines: the trophies
  aren't the records, the briefing hall has no briefing, the armoury sells nothing.
- No ready check with a countdown; the map vote is only at a match's end.

**Open from earlier plans:** music (115: the user's CC0 picks), the mode's own voices, the match's frame rate (Low
46–47 fps against 50, High 36–40 against 60), the knife's left sleeve, the 116 fingertips (5–17 mm), Lodge's and
Boathouse's balance (117), a bot's Daybreak as a hitscan, the "ready up" test's hang-up, Firefox untried.

## References

The brief is in this session's research (CS2 and Valorant); the points that shape the plan:

- CS2's HUD: radar top-left, timer between the scores with a portrait per player that goes dark on death, kill feed
  top-right with icons for headshot, through a wall, through smoke, blind, no-scope; health and armour bottom-left,
  ammo bottom-right. https://blog.cs2.ad/cs2-hud · https://www.ginx.tv/en/?p=4637
- The damage report at a round's end, per enemy: damage and hits both ways.
  https://ggrecon.com/guides/cs2-check-see-damage-dealt
- CS2's buy menu: one screen, fixed slots, two key presses (column, item), refund in the buy time; Valorant's stats
  panel and team requests ("buy for me"). https://dignitas.gg/articles/the-new-cs2-loadout-system-explained ·
  https://gamersdecide.com/articles/valorant-how-buy-someone
- The scoreboard: K, A, D, then HS %, ADR, utility damage, enemies flashed by a "cycle stats" key.
  https://prosettings.net/blog/cs2-scoreboard/
- Feel: hit sound and blood played at once and corrected by the server; the helmet's "dink"; the AK's spray that
  climbs then swings; moving spread ≈ 27× standing, back to true below ~34 % speed; tagging.
  https://blast.tv/cs/news/damage-prediction-in-cs2 · https://refrag.gg/blog/spray-science-how-does-weapon-recoil-function-in-cs2 ·
  https://metabot.gg/en/cs2/guides/cs2-counter-strafing-movement-accuracy
- Smokes that fill a space, are cut by bullets and cleared by an HE; fire that spreads toward the throw.
  https://www.videogamer.com/news/counter-strike-2-smoke-changes-explained ·
  https://community.skin.club/en/articles/how-molotov-works-cs2
- A pre-match flow: accept with a countdown, a team map vote with timers, a warmup you can shoot in, a range with
  drills. https://counterstrike.fandom.com/wiki/Premier · https://www.redbull.com/ca-en/the-practice-range-map-guide-valorant

## The idea

One park, one look, CS's feel. Five arcs, each finished before the next leans on it:

1. **One look** for every surface of the park — the HUD, the menus, the in-world screens — and the world's HUD out of
   the way in a match.
2. **The match's UI rebuilt**: a CS2-like HUD, a buy screen with pictures, a scoreboard with stats, the round's end and
   the damage report, spectating.
3. **The feel**: people move as CS players do (the shared code the bots already use), tagging, spray patterns, the
   park's own damage table, hits that land at once, weapons on the floor, grenades thrown as in CS.
4. **The visuals**: holes, blood, smokes, fire, flashes, the replay's people.
5. **The lobby**: its buildings with a job, a ready check and a vote, a range with drills, the records on the wall —
   and sound and music through it all.

Then the open items, the frame rate, and the checks.

## Forks — decided 2026-11-22 (F4 c, F12 c, F13 b; the rest the recommended)

| # | Fork | Options | Recommended |
|---|---|---|---|
| F1 | The look | **a)** three mocked looks for the HUD and the buy screen (the tactical skin refined, a clean CS2-like, a third), you pick one, then everything follows it · **b)** the tactical skin, refined, everywhere (no mocks) · **c)** the world's walnut manuscript everywhere in the park | **a** (taste; cheap to show before it's built) |
| F2 | The HUD's layout | **a)** CS2's: radar top-left, scores and portraits top-centre, kill feed with icons top-right, health/armour bottom-left, ammo bottom-right; the world's top bar, toasts and chips hidden in a match · **b)** today's places, restyled | **a** |
| F3 | The buy screen | **a)** one screen: each item a picture rendered from its 3D model, a stats panel on hover, two-press keys (column, item), refund in the buy time, "buy for me" requests and drops for a teammate · **b)** today's columns with pictures and the keys fixed | **a** |
| F4 | How people move | **a)** the shared CS movement the bots use, for people too: acceleration, friction, air strafe, the landing slow, tagging, moving inaccuracy · **b)** tagging only · **c)** as it is | **a** |
| F5 | Recoil | **a)** a fixed, learnable spray pattern per gun (the AK climbs then swings), true first shots, recovery when you stop; the server reads the same pattern · **b)** today's kick and bloom | **a** |
| F6 | Damage | **a)** the park's own table, as CS's: head ×4, stomach ×1.25, legs ×0.75 (a helmet takes the armour's share off a headshot, as the vest does the body's), team damage at a third, a hit's aim punch; only in the park · **b)** the world's ×1.5 kept | **a** |
| F7 | Hit feedback | **a)** CS's: the hit's sound and a blood puff at once on your screen (the server corrects), the helmet's "dink", the victim's flinch; the hit marker a setting (on by default) · **b)** the hit marker only, as today | **a** |
| F8 | Weapons on the floor | **a)** drop your gun (G), the dead drop theirs, walk over to pick up (E swaps), the kill-feed shows a pickup · **b)** no | **a** |
| F9 | Effects | **a)** bullet holes per material, blood on walls and floors (a gore setting), smokes as volumes that bullets cut and an HE clears, fire spreading toward the throw, a better flash (white or a dark-screen setting) · **b)** holes and blood only | **a** |
| F10 | The lobby | **a)** every building a job: the briefing hall a pre-match briefing (the map flown over, the plan); the armoury your loadout and kit; the trophy room the records; the war room the live match; a ready check with a countdown and a team map vote before each match; the range with drills (plant/defuse, aim) · **b)** polish what's there (the screens and desk in the one look, the vote and ready check only) | **a** |
| F11 | Sound | **a)** footsteps per surface, muffled by walls; round stingers and lobby music from CC0 picks you choose; recorded voice lines for the round's calls (CC0 or ours) instead of the browser's voice · **b)** footsteps only · **c)** footsteps and music | **a** |
| F12 | Sign-offs | **a)** two: the look's mocks (F1) before the UI's built, and a short recording of the feel (movement, recoil, hits) before the effects sit on it · **b)** the mocks only · **c)** none, straight through | **a** |
| F13 | Frame rate | **a)** the plan's targets as exit checks (Low ≥ 50 fps, High ≥ 60 on this Mac in a full match) · **b)** best effort, measured | **a** |

## Phases

| # | Phase | Exit check |
|---|---|---|
| 0 | **Before anything:** the words fixed (Shift, the radio's keys, the grenade's J, E for every use), the dead round-end card and money ticks wired, the buy keys past 9, the buy time from `ROUND`, the double-barrel's one name, stale comments. | the How to play, tutorial and HUD say what the keys do; a round's end shows its card |
| 1 | **The look (F1):** three mocks (HUD in a round, the buy screen, the scoreboard) as stills; you pick. | your pick recorded |
| 2 | **One look, built:** one set of tokens (type, colours, team colours, frames) for the park's DOM, React panels and canvas screens; the in-world screens (big screen, desk, board, war room) redrawn in it. | every park surface in the one look (stills of each) |
| 3 | **The HUD (F2):** CS2's places; scores with a portrait per player that goes dark when they die; a kill feed with gun icons and marks (head, wall, smoke, blind, no-scope) apart from the radio's lines; the world's HUD out of the way in a match; the radar bigger with smokes and fire on it; the bomb's icon. Drawn without rebuilding the DOM each change. | a still of a round; no layout jump as it updates; the HUD's frame cost measured |
| 4 | **The buy screen (F3):** pictures rendered from the 3D models, stats on hover, two-press keys, refund, "buy for me" and drops, the team's money. | every item bought by mouse and by keys; a refund; a drop to a teammate |
| 5 | **The scoreboard and the round's end:** columns that line up; K, A, D, ADR, HS %, MVP, money, ping, a cycle key; a round-history strip with win reasons; the round-end card with the damage report per enemy; the match's end with its highlights. | stills; numbers checked against a lab match |
| 6 | **Spectating:** cycle who you watch (left/right click), their HUD (health, gun, money), the death cam's last look at your killer; Follow the match in the one look. | e2e: dead, cycle three teammates |
| 7 | ~~Movement (F4)~~ — **dropped (F4c: as it is).** People keep the world's walker with CS's speed shares; no tagging. | — |
| 8 | **Recoil (F5):** a pattern per gun in shared data; the camera and the server follow it; true first shots; recovery. A spray bench drawing each pattern on a wall. | the bench's holes match the pattern; server and client agree |
| 9 | **Damage and hits (F6, F7):** the park's damage table; aim punch; the hit's sound and blood at once, corrected by the server; the helmet's dink; bots hit with a rewind. | unit tests on the table; e2e: a headshot on a helmet plays the dink |
| 10 | ~~Sign-off~~ — **dropped (F12c).** A recording of spraying and hitting is still made as the reference. | the recording kept in `design/strike118/` |
| 11 | **Weapons on the floor (F8):** drop, the dead's drop, pickups, a swap; the bots pick up too. | e2e: drop, pick up, a bot picks one up |
| 12 | **Grenades:** jump-throw, left/right-click throws (long, short), the flight's look (the real grenade's model). | a jump-throw lands as the lineup does |
| 13 | **Effects (F9):** bullet holes per material (pooled, capped), blood (a setting), smoke volumes cut by bullets and cleared by an HE, fire spreading, the flash's whiteout (or dark). | stills; the frame cost measured with 10 smokes and 200 holes |
| 14 | **The replay's people and the swap crew** as the world's 3D people. | a still of the best-round replay |
| 15 | **Sound (F11):** footsteps per surface, muffled by walls; CC0 candidates for stingers and music (you pick); the round's calls recorded. | your picks in; a step heard behind a wall is quieter |
| 16 | **The lobby (F10):** the ready check and a team map vote before a match; the briefing hall's briefing; the armoury's loadout and kit; the trophy room's records; the war room; the range's drills. | each building used once in an e2e |
| 17 | **Votes:** timeouts, surrender, kick a bot. | each vote passes and fails |
| 18 | **The open items:** the knife's sleeve, the fingertips, a bot's Daybreak as a ball, Lodge's and Boathouse's balance, the "ready up" test, Firefox. | each closed or written down why not |
| 19 | **Frame rate (F13b, best effort):** a full match profiled on Low and High; the cheap fixes taken. | before and after measured and written down |
| 20 | **Checks:** unit, lab, `strike.spec`, `fp-guard`, `arms-feel`, a match on every map with stills; notes and memory. | all green |

## Risks

- **It's big.** Five arcs, each usable alone; straight through (F12c), so each arc ends with its own stills and checks,
  and the look is your pick (F1) before the UI's built on it.
- **Movement stays (F4c)**, so recoil and spread are tuned for the world's walker as it is: counter-strafing isn't
  CS's two frames; the spray bench (phase 8) is the check.
- **Recoil on the server.** The pattern must be the same on both ends (shared data, the shot's index in the spray sent
  with it); a test fires a spray and checks the server's holes.
- **Decals and smokes cost frames** on Low: pooled, capped, measured (phases 13 and 19).
- **Blood.** A setting, on by default in the park only, off in the world.
- **Nothing committed yet.** Plans 114–117 and their feedback rounds are all uncommitted; a commit before this plan
  starts keeps it reviewable (your call).
