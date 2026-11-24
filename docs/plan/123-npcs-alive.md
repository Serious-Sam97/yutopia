# Plan 123 — NPCs alive

Asked 2026-11-23, after plan 122:

> Ok next plan
>
> - Precisamos adicionar inteligencia neles
> - Precisamos configurar onde eles vao trabalhar
> - Precisamos adicionar interações estilo the sims com eles
> - Quando chove eles pegam um guarda chuva
>
> lets plan

Plans 120 (the cast) and 121 (NPCs on the map) made the NPCs and put them in the world: each has a look, a name, a
role, lines, a behaviour (stand, wander, route, counter, sit; hours; greet, answer; shots) and, on the map, a place,
a floor and maybe a home they walk to off duty. This plan gives them a life of their own: they want things and act on
it, they go to work somewhere, you can do things with them as in The Sims, and the rain sends them under umbrellas.

Status: **planned 2026-11-23; forks decided 2026-11-23, one by one; built 2026-11-24 (phases 0–9), not committed —
the user tests it (F10b).** What was built is under "Built" below.

The forks:
- **F1a** needs + a mind run by the server, deterministic, as the pets' — no LLM;
- **F2a** work set on the placement in God mode (a building, a spot in it, the shift), as the home is;
- **F3c** jobs with their acts, serving players — **and NPCs come to be served by NPCs** (a coffee at the counter, a
  meal at the diner, a drink at the bar: the places that meet their needs are the ones someone works at);
- **F4c** the Sims menu with a relationship per player — **plus new two-body acts**: a hug, a handshake, a kiss on the
  cheek (made for today's bodies);
- **F5a** the relationship kept by the API, per player per NPC;
- **F6a** NPCs meet and chat, with friends (and dislikes) among them by their traits — kept too;
- **F7a** the placed NPCs get the mind; the town's own (the guard, the parks' folk, Vortex) stay as they are;
- **F8b** a Sims-like panel: their needs' bars, mood, job and how they feel about you — with the want over them when
  you're near;
- **F9a** every NPC outdoors in rain or sleet opens an umbrella and closes it going in — **and players can have one**
  (taken from an umbrella stand, kept in the pockets);
- **F10b** built straight through, tested at the end (stills at the end).

## What there is today

- **Their mind: none.** A placed NPC on the server (`features/npc-life.ts`, `Life`) has a mode (life, home, duck,
  flee), a walk and a few timers. No needs, mood, memory, schedule beyond its hours, or relationships. Only Vortex
  remembers anyone (his scars, a grudge per user, saved by the API).
- **The pets' mind** (shared `mind.ts`, `pets.ts` `Needs`): traits, drives (hunger, thirst, rest, play, attention,
  curiosity, comfort, company), `choose()` with hysteresis, a want's icon, mood, memory and bonds — run by the server
  for every pet. The model for an NPC's would be the same shape.
- **Work: none.** Nothing ties an NPC to a building but its `home`. The town's buildings have counters, tills, desks,
  stools and booths as fits (`fitsNative`: the bar, the diner, the market's till, the office, the police, the clinic,
  the hotel, the school, the library); a styled (kit) building's inside is empty unless furnished.
- **Talking:** one act. "Talk" (X, or a click) sends `npc:talk`; the server answers with a random `answer` line in a
  bubble everyone near sees. What you say isn't read; there's no chat box. No LLM anywhere in the project.
- **The Sims-style menu exists for people and pets**: `ctl/menu.ts` `ActionMenu` (a ring, number keys, a bottom sheet
  on phones; held Use opens it). Its targets are self, object, person, pet — **not NPCs** (they get one act, no
  menu). People already have `SOCIAL` acts (wave, high five, fist bump, cheers, give a drink), their two-body poses
  (`together2`), emotes (wave, heart, laugh, clap…), photo poses. No hug or handshake.
- **NPC bodies** are drawn as players' are (the same avatar recipes, life look, clips: idle, walk, sit, emotes), but
  the wire's `Npc` has no `held`, `act` or `emote` — only a `mood` string the client maps to a wave, a crouch, a jog.
- **Rain:** shared `weather.ts` (`skyAt`: showers by the clock; admins can call it), the room's `Weather` (`kind`,
  `fall`, `wet`…); the client draws rain. Nothing reacts to it but the survival chill and scared pets. **No umbrella**
  for anyone — only the karts' power-up model and an umbrella stand (furniture).

## The proposal (before the forks)

1. **A mind for each NPC** — needs that fall over the day (hunger, energy, fun, social, bladder/comfort…), traits
   from the cast (outgoing, lazy, neat…), and a chooser that picks what to do next from what the town offers: eat at
   the diner, a coffee at the counter, a bench in the sun, a chat with another NPC, home to sleep, and **work** in
   their hours. A want shown over them as the pets' is (or not).
2. **Work** — a workplace per placed NPC: a town building, a spot in it (a counter, a till, a desk, a patrol),
   a job (barista, cashier, bartender, cook, waiter, librarian, guard, cleaner…) and a shift. At work they do the job's
   acts: behind the counter facing who comes, serving, wiping, walking the floor.
3. **Interactions as in The Sims** — the action menu on an NPC: talk, greet, joke, compliment, ask about their day or
   their job, high five / fist bump / cheers (the people's), give a drink, order (from one at work: a drink handed to
   you), and maybe hug / handshake (new two-body acts). Each changes how they feel about you: a **relationship** per
   player, remembered.
4. **Umbrellas** — in rain or sleet, an NPC outdoors opens an umbrella (a new held prop, its own model) and closes
   it going in; one without hurries or takes shelter.

## The forks

Asked one by one 2026-11-23 (the answers in the status above). Each lists its options; ⭐ the one recommended.

- **F1 — what "intelligence" is.** a ⭐ needs + mind run by the server, deterministic (as the pets'): they plan their
  day themselves; b an LLM (the Claude API) for what they say back — you type to them; c both: the mind for what they
  do, the LLM for talk.
- **F2 — where work is set.** a ⭐ on the placement in God mode (as the home: a building, a spot, the shift); b on the
  cast page (the NPC's job and building), God mode only places them; c the job on the cast, the spot in God mode.
- **F3 — what they do at work.** a just be there in the shift (the spot, facing the door); b ⭐ jobs with their acts
  (serve at a counter, a till, a desk, walk the floor, clean) and serving players (a drink handed over); c b and
  customers: NPCs too come to be served by NPCs.
- **F4 — the interactions.** a the people's socials + talk in a menu; b ⭐ a Sims menu (talk, joke, compliment, ask,
  greet, socials, give, order) with a relationship per player that changes what's offered and how they answer;
  c b plus new two-body acts (hug, handshake, kiss on the cheek…).
- **F5 — the relationship remembered.** a ⭐ kept by the API (as Vortex's grudge), per player per NPC; b for the
  session only.
- **F6 — NPCs with each other.** a ⭐ they meet and chat (stop, face, bubbles), friends among them by their traits;
  b no, only with players.
- **F7 — who gets the mind.** a ⭐ the placed NPCs (plan 121's), the town's own (kart, Strike Park, the guard, Vortex)
  as they are; b everyone, the town's too.
- **F8 — what's shown.** a ⭐ their want over them when you're near (the pets' icons) and their mood/relationship in
  the menu's header; b nothing shown, read from how they act; c a Sims-like panel with their needs.
- **F9 — the umbrella.** a ⭐ every NPC outdoors in rain/sleet opens one (its own prop), closed indoors; and players too
  as an item (from a stand, in the pockets); b NPCs only; c only some NPCs own one (a trait), the rest hurry or shelter.
- **F10 — sign-offs.** a mocks first (the umbrella, the menu, the want icons) for sign-off; b ⭐ built straight
  through, tested at the end.

## Phases

0. **Shared model** (`shared/npc/mind.ts`): needs (hunger, thirst, energy, fun, social, hygiene/bladder as one
   "comfort"), their fall by the hour, traits from the cast (a few: outgoing/shy, active/lazy, neat/messy, cheerful/
   grumpy — set on `/admin/npcs`, a default from the name's hash), mood from the needs, the chooser (the pets'
   `choose()` shape: drives → an activity, with hysteresis), activities and where they're met: home (sleep, eat),
   a workplace that's staffed (coffee, a meal, a drink, a shop), a bench, a friend. Tests.
1. **Work on the placement** (shared `NpcPlaceDef.work`: a building, a spot — a counter, a till, a desk, a stool, a
   floor to walk —, a job, the shift's hours; checked as the home is) and **God mode's tool**: pick the building, the
   spot on its storey (as the floor picker), the job, the shift. The behaviour's hours give way to the shift.
2. **The server's mind** (`features/npc-life.ts`): needs stepped slowly (a tick a second), the chooser picking what's
   next; walking there by plan 121's ways; at work the job's acts; as a customer: to a staffed place, queue, ordered,
   served (a held drink), sat, done. On the wire: `want`, `act`, `held`, the needs packed (for the panel), `with`
   (who they're with). The 64-field and 255-byte guards (colyseus-64-fields, colyseus-255-byte-strings).
3. **Jobs' acts**: barista/bartender (behind the counter, facing the next, making a drink, handing it over), cashier
   (the till), waiter (to a table and back), cook (the kitchen side), librarian/clerk (the desk), cleaner (walking the
   floor), guard (rounds). Serving a player: "Order" in the menu → made → handed (`held`).
4. **The menu on NPCs** (`ctl/menu.ts`: an `npc` target): talk, joke, compliment, ask about their day / their job,
   greet, the socials (wave, high five, fist bump, cheers, give), order (at work), hug, handshake, kiss on the cheek —
   what's offered by the relationship and their mood; their answers by moment (new line moments in the cast:
   joke, compliment, ask…, with defaults) and a reaction (a laugh, a shrug, a frown). The relationship (−100…100,
   friend/acquaintance/stranger/dislike) changed by each, kept by the API (a `npc_bonds` table: user, npc, value,
   last seen).
5. **The two-body acts**: hug, handshake, kiss on the cheek — `together2` poses for both (a player and an NPC, two
   NPCs, two players too), the contact as the socials'.
6. **NPCs with each other**: they meet (near, both free, social low), stop, face, chat (bubbles from their lines, the
   socials), and their bond grows or sours by their traits; kept by the API (`npc_bonds` with an npc as the other).
7. **The panel** (HUD): opened from the menu — their name, role, job, mood, needs' bars, what they want, how they feel
   about you; the want's icon over them near.
8. **Umbrellas**: the prop (Blender or made in code: a canopy that opens and folds, a handle — the kart's
   umbrella's shape as a start), held up in the left hand over the head (the hands library: a grip), open/closed
   by rain and sleet outdoors (the room's `Weather`), folded indoors; for players an `umbrella` item (shared HELD,
   the API's item whitelist — api-item-whitelist), taken from an umbrella stand, kept in the pockets (plan 86), opened
   from the left hand (plan 87).
9. **Checks**: unit tests (mind, chooser, work, bonds), world-server tests (a day: work, a coffee as a customer, home;
   rain → umbrellas), an e2e (the menu, order, hug, the panel, an umbrella), perf with 60/120 NPCs (plan 121's
   bench), stills at the end.

## Built (2026-11-24)

- **0 · the mind** (shared `npc/mind.ts`, tests `npc/mind.test.ts`): six needs that fall by the real minute (thirst
  empty in 80 min, hunger 150, fun 50, company 60, comfort 120, energy 14 h, the night's faster), four traits (outgoing,
  active, neat, cheerful — the cast's `behaviour.traits`, else from the key), activities and what they fill, the
  chooser (work in the shift; asleep at home deep in the night; else the best offer for what presses, a walk weighed;
  nothing pressing — a want under 45 — their placed way at their place, plan 121's), mood, bonds (−100…100, met n
  times, faded by half a week), the menu's acts by bond and mood, how an act lands, NPCs getting on. Lines for the new
  moments (`npc/lines.ts`: joke, laugh, compliment, a day by mood, a job, chat, order, served, refuse, thanks; theirs
  first). The API keeps traits and the moments (`Npc::clean`).
- **1 · work on the placement** (`NpcWork`, `checkNpcPlaces`, `inShift`, `jobFor`) and God mode's NPCs tool: "Pick a
  workplace" — a spot on a town building's storey (or the building on the land: its ground storey's middle), the job
  from its kind, the spot, the shift (sliders), drawn green with its facing. **Publishing now checks the draft's NPCs**
  (plan 121 never wired `checkNpcPlaces` in).
- **2–3 · the server** (`features/npc-life.ts`): needs a second at a time, the want on the wire; work in the shift
  (to the spot through doors and stairs, the line served — "make" 5 s, handed over, a word —, a wipe or the keys between;
  floor jobs walk the storey, a cleaner cleans); customers: to a staffed place's front, in line, served (a mug at a
  barista's, a soda at a bar), to a free seat with it, drinking/eating/reading; benches; chats (one walks to the other,
  a hug for a close friend, a handshake or a fist bump for a friend, lines in turn, the bond moved by how they get on);
  a rethink every 15 s on a bench or a walk when something presses that it doesn't meet; a walk for a plan given up
  dropped (`gen`). `Npc` gains `held`, `act`, `actAt`, `actWith`, `want`.
- **4 · the menu** (`npc:about`, `npc:act`, `npc:acted`): the ring opens on a placed NPC once the server says what's on
  offer (title, "Barista · Happy · Stranger"); talk, greet, joke, compliment, ask about their day / work, wave, high five,
  fist bump, cheers, give your drink, order (at work), handshake, hug (acquaintance+), kiss on the cheek (friend+);
  weighed, answered aloud, the bond kept by the API (`npc_bonds`: `GET/PUT /internal/npc-bonds`, 30 s batches, gone
  with the NPC).
- **5 · together**: handshake, hug and kiss in shared `SOCIAL` (players may handshake and hug each other; the kiss is
  only offered with NPCs, who can refuse it) and their poses (`acts.ts closeTogether`).
- **6 · NPCs with each other**: in 2–3 (chats, greetings, bonds kept).
- **the cast page**: "Who they are" — their own (from their key), or four sliders (shy–outgoing, laid-back–active,
  messy–neat, grumpy–cheerful).
- **7 · the card** (`NpcCard.tsx`, "About them" in the menu; its words its own, off the page): mood and what they're doing, the six needs as bars, how
  they feel about me (and how many times we've met), work and shift, home, traits; refreshed every 2 s. The want over
  their name (☕ 🍽️ 💤 🎈 💬 🏠).
- **8 · umbrellas**: NPCs out on the land in rain or sleet open one (`held: "umbrella"`), put away indoors or dry;
  players: an `umbrella` item (one), taken from any umbrella stand (X: "Take an umbrella") into the left hand — what
  was there to the pack —, kept in the pack; in the left hand it's a `worn` bit (Player is at 62 of Colyseus's 64
  fields), drawn open over them in rain out on the land, furled otherwise (props `umbrella`, `umbrellaShut`).
- **9 · checks**: shared tests (npc 20 + mind 8, actions, inventory), client 202 unit, world-server npc-life (a barista
  serving a customer and a player's order; rain and an umbrella) + cast, god mode, schema; API Npcs, NpcBonds,
  Survivor; e2e `npcs-alive.spec.ts` (menu, order, card, hug, umbrella; stills). Perf: npc-life's tick with 120 placed
  NPCs with minds, 8 at work: 0.33 ms mean, p95 0.83, max 3.7 (60: 0.29 / 0.78 / 4.3).

### Double-checked (2026-11-24)

Two fresh reviews of the diff (server + shared + API; client) and every check run again. Fixed:

- **Hugs in mid-air**: nothing passed the partner's place to the pose (always 1.2 m ahead) and the server leaves them
  ~1–1.5 m apart. `tp/close-in.ts` now draws the two stepped in for the act (hug 0.40 m, kiss 0.50, handshake 0.74),
  turned to face each other, eased in and out, drawn only; the arms aim at that distance (`actTo`). The hug's hands
  go round the back (one over the shoulder, one under the arm), seen side on (`123-hug-side`, `123-handshake-side`
  stills in the spec). My body turned to an NPC I act with (it looked only among players).
- **Bonds**: a room opened while the API was away saved its blank bonds over the kept ones → loaded with retries, none
  kept till loaded. A failed save lost every batch after it → all from it on kept for the next. A deleted NPC's bonds
  dropped from memory (and theirs in others').
- **Farming**: `give` with nothing to give (or their hand full) and `order` while already in line counted toward the
  bond → refused before it. Order only offered with free hands; `npc:about` within 25 m, ≤ 10 a second.
- **Hand-overs**: a customer who'd given up still got the cup; a player was handed it anywhere and over what they held;
  every job handed coffee → only to one still waiting, a player within 3 m with free hands; what the job sells
  (barista a coffee, bartender a soda, the rest nothing to carry). What an NPC was given or served is put down when
  what they're at ends (a given one idle: after a minute); a queue isn't given up while theirs is being made.
- A placement moved in God mode, a chat partner drafted: their plan ended properly (out of lines, walk dropped). An
  umbrella kept up on the walk home. Customers' "at the counter" as near as a worker's (1.2 m). A seat looked for
  every 3 s, not each tick.
- **Client**: the stand's prompt built every object's list each frame and took Use over doors/NPCs → looked for 4× a
  second, only with nothing in focus and no umbrella in hand. The NPC menu opened on its last answer → asked afresh
  every time, never over a menu opened meanwhile. The ring's margins by its real size (a sheet when it can't fit);
  keys shown 1–9 only. The card keeps its own NPC while another's answer comes, closes when they're gone. Players'
  umbrellas open seen from upstairs too. God mode: a work spot outside the storey or where one can't stand refused,
  the spot list by the job, both checked on publish (`within`, JOB_SPOTS). NPC card colours on tokens. The spec's
  cleanup runs each step on its own.

### Leftovers done (2026-11-24)

- **The kiss, seen**: an admin can set a placed NPC's bond with them outright (`mod:npcBond`, admins only, logged as
  `npcbond`) — the spec sets Tom to a friend's 50 and kisses him: drawn in at 0.50 m, leaned in, heads together, a
  hand on his shoulder (`123-kiss-side`).
- **A work spot's facing on its own**: R while picking their workplace turns the spot, not the placement; the panel's
  ⟲ ⟳ turn it 45°; moved, it keeps its facing.
- **Table service**: at a waiter's place a customer's shown to a free seat there (one each), sits, and waits; the
  waiter goes over, takes the order (a word, a chat act), to the pass — the cook at work in the same building (who
  makes it) or the waiter's own spot —, carries the plate out flat on the right hand (`plate`, `tray` drawn) and sets
  it down; they eat at the table. A player who orders from a waiter is walked to the same way. Gone off or left: the
  order dropped. World-server test over the diner; the spec's `123-waiter-side` still.
- **Umbrella stands**: in by the bar's, the diner's and the market's doors (against the glass: `atWindow`; the
  Strike Park's canteen and bar too, laid by the same layouts), the layouts' checks pass; the spec counts them in the
  world. A world laid before gets them once at loading: a piece added later carries `since`, appended at its layout's
  end (ids are by place), and a ground storey keeps `added` — the rounds it's had (spaces.ts `layoutAdditions`). One
  an admin takes away after isn't put back. The dev world got its five on 2026-11-24.
- A person's look seeded by their name alone (`seedName`), not the want icon before it.

### Double-checked again (2026-11-24)

Two more fresh reviews after the leftovers. Fixed:

- A player's order held a waiter for good (followed anywhere, no limit) → let go once they walk off the floor or 20 m
  from the spot, and any order after 3 minutes; the waiter takes and serves from 2 m.
- Cycling different acts kept a stranger warming fast → past four acts in the last minutes, each warms them 15% less
  (to a tenth); the last 40 remembered, not 12.
- Table customers gave up when two wanted the same seat → a seat someone's been shown to counts as taken; they sit
  from 1.6 m (a booth's seat past the walkable).
- A moved workplace (or a changed job) kept the old line and a plate → work left properly first.
- A drink given to someone at work was held all shift → put down after its minute there too.
- A worker's own "order" lines used before their job's stock line.
- Bonds of NPCs missing from the cast (deleted, or a stand-in cast while the API was away) no longer pruned from
  memory — only their unsaved changes dropped; the API writes no bonds for an NPC that's gone (a save already on its
  way when it was deleted).
- Players' handshake and hug toasts named ("shook your hand", "hugged you").
- NPC drinks were drawn empty, never sipped (timed from 1 ms) → from when first seen.
- God mode: picking a first workplace, R turned the NPC → turns the spot to be, starting from the NPC's facing.
- Players' umbrellas seen from another floor opened indoors → floor 0's own map asked.
- A close act with the partner too far: arms no longer aimed at them. The camera follows where I am, not the step a
  hug draws me in by. An NPC's umbrella furled while hugging. Movement style seeded by name alone too.
- The spec puts back an hour or sky someone else had called (not the schedule), waits out a late publish before
  deciding on a rollback, every cleanup step caught, Ana back where she stood.

### The last open ones (2026-11-24)

- **The stand's prompt** isn't offered with an umbrella anywhere on me — the pockets and quick slots too (the dark's
  `countOf`, through the walker's `carried`).
- **A furled umbrella**, seen on /dev/3p (`&me=umbrella:shut`): its handle stood up out of the fist, its crook turned
  with the world. Now turned with the body, let down 10 cm: the fist round the handle, the hook curled forward over the
  fingers, the tip down.
- **A waiter's plate**, seen (`&me=tray`): it sat on a hand hanging fingers down. Now on the palm turned up (the rig's
  `wristFor` / `gripTo`), the forearm forward before the waist, the elbow by the side.
- **A meal on the table**: sat to eat, the server finds the table (or counter) top in reach before them — its nearest
  point, a hand in from the edge, at its height — once (`Npc.dish`, "x,y,h"); the client sets a plate there
  (`dishFrame`) till they stand. World-server test: Ann's on the booth's top within 0.9 m; seen on /dev/3p
  (`&me=dish`).

Its review, fixed: the stand's prompt held what's in front of me as it was (a door by it couldn't be used) — looked
at again there; the stand reached from its middle (it's a free thing), client and server; a space made furnished in
a publish marked too (`markAdditions`), so a stand taken away after isn't put back at loading; sat again after a duck
or a flight, the plate set down again; far off (25 m), no reach worked out for an open umbrella, a plate's grip the
cheap one.

### Not done or not seen

- Before the dark's chunk is in (the first moments in the world), an umbrella in the pockets isn't known: the stand's
  prompt shows, and the server takes none.
- The plate on a real table seen in the world by eye (the bench has no table: seen at a table's height before her).
- Bonds load 50,000 rows at most: past that the oldest would be overwritten as new.
