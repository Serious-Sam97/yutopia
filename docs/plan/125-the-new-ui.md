# Plan 125 — The new UI

Asked 2026-11-24, after plan 124:

> New Feature! and a awesome one
>
> PS: DONT TOUCH BUILDING UI, we just had a feature improving that UI
> Improve our current UI
> I dont like too much of what we have today (All UI), feels strange, without a soul
>
> Im thinking on a new UI a mix of GTA and The Sims

and then:

> when i say redesign UI, is EVERYTHING like we dont have anything ok, menus too, dont get the old as reference visual

So this is the whole UI built again from nothing — what's on screen in play, where it sits, and every menu — in one
look the user picked from mocks. **Build mode's screen (plan 124, glass) is not part of it** and stays as it is.

Status: **planned 2026-11-24. The look is chosen (F, below). Forks decided 2026-11-24, one by one:**

- **F1a** every member screen (play HUD, wheel, pack, pause/map, settings, the car/skate/bike/kart HUDs, the games'
  panels, pets, toasts, the pages); the Strike Park's match HUD, God mode, the admin pages and build mode keep theirs;
- **F2c** the bars show the **real vitals now** (health, stamina, warmth, torch battery); The Sims' needs come later in
  a plan of their own, and the bars are made to take either;
- **F3a** the cash slot is built but **hidden until the town has money** (as plan 124 F7);
- **F4a** the quick wheel by **kind**, GTA's (eight kinds, Q/E cycles, keys 1–8 pick kinds, 1 stays the left hand);
  phone · emote · pack · build on their own keys;
- **F5a** the pack is **RE4's grid by size** (R turns, pickups placed where they fit, bigger cases more room; the
  hands are shortcuts into the case);
- **F6a** **all the case's extras, earned by playing** (charms, case colours, the lid's stickers from places reached
  and a polaroid from the phone's camera, a handwritten note for every kind of thing, in the player's own name);
- **F7a** the map **on screen everywhere**, tilted, waypoints from the pause map, a gold route;
- **F8a** subtitles for NPCs and the town; the feed carries **only the game's real news**;
- **F9a** the cuts stand: **no people list, no objective line**;
- **F10b** **the phone is left as it is** (not redrawn; it keeps working over the new HUD);
- **F11a** the plumbob **over my head only**, its colour my status;
- **F12c** **desktop only**: phones keep today's UI (so the old HUD stays for narrow screens; the new one is the
  desktop's);
- **F13a** mock what isn't mocked first, then build straight through, checks at the end.

Phase 5's forks, asked 2026-11-24 when the case's rules came up (one by one):
- **F14a** RE4's placing: what's found (the ground, a locker, a car's boot) hovers over the case, green where it fits;
  you put it there (R turns it) or leave it; a boot or a locker is a second, smaller grid beside the case;
- **F15a** a box per stack: a stack takes one spot of its size up to its limit (today's `STACKS`); a second box, a
  second spot;
- **F16a** a 10 × 7 case for everyone (70 cells); bigger cases later, as rewards;
- **F17a** today's packs auto-packed into the case on the way in; what doesn't fit goes to a **stash at home**.

**Phase 0 done 2026-11-24** (below): the remaining ten screens mocked; awaiting the user's look before phase 1.

## The look: F (chosen 2026-11-24)

Reached over a day of mocks (`design/ui-life/`, page `design/ui-life/mock/ui-life2.html?look=…&s=…`, stills
`design/ui-life/r2/`):

- round 1: A Street (GTA first) · B Live (The Sims first) · C Postcard — **C rejected**;
- round 2, everything from zero (positions and menus too): A, B, and C remade as GTA + The Sims + Alan Wake
  ("Lamplight"); then **D** — A's places and menus in C's look; **E** — D with more GTA; **F** — D's soul with GTA's
  signatures, between D and E — **picked**;
- the pack, separately: a list (ugly), three layouts on the game's real item pictures, two after Resident Evil, then
  **Ana's Case** after RE4's attaché case, given materials (pack 7) — **picked** (the version pushed onto a table,
  pack 8, was not).

**F, screen by screen** (`design/ui-life/r2/sheet-f.jpg`, `f-*.png`):

| Screen | What's on it |
|---|---|
| Play (`f-play`) | Help box top-left (GTA's black box, a gold edge, white key caps). Map bottom-left, **tilted like GTA V's**, a **gold route** to the waypoint and its name/distance on it; four coloured bars under it. Over the map: a text from someone, then the mic tag. Top-right: the clock (tall bold), **cash in green**, what's in hand as a **white picture** with its ammo, the torch as **glowing cells**, loaded shells drawn. Bottom-right: the place's name, heavy, a thin gold rule over it. Subtitles bottom-centre (name in gold). My **plumbob** over my head (the light shard). Film grain and soft dark edges over all of it. |
| Action ring (`f-act`) | The Sims' ring, GTA's way: white numbered pills round the thing, the picked one gold; the thing's name under. The queue top-left (round icons, the first ringed gold, what comes next). A tip flash under the cash. |
| Night (`f-night`) | The same, a gun out: ammo `2 | 14`, the shells, the torch's cells; pickups in a feed over the map; the aim keys in the help box; a small crosshair. |
| Quick wheel (`f-wheel`) | **GTA V's weapon wheel**: eight kinds (Left hand · Pistol · Shotgun · Rifle · Heavy · Throwable · Melee · Unarmed), each a **white silhouette made from the real item picture** with its ammo; see-through segments; the picked one lit warm with a **gold arc** and cycle arrows, its picture **in its own colours**; name, ammo, shells and `‹ 1/1 ›` in the middle; GTA's **stats card** top-right; the world greyed and soft behind it, **snow hanging in the air**, me seen through the hole. Phone, emote, pack, build: their own keys along the bottom. |
| Pack (`f-pack`) | **Ana's Case**: worn leather, real stitching, brass corners/latches/hinge/nameplate, foam pockets cut for each thing, RE4's grid (things take their size; R turns them; a found thing hovers green where it fits). The **lid**: a polaroid of Main Street, travel stickers (Silver Lake, Hawk Pass, Long Pine Road), a "property of" note under an elastic. **Charms** on the handle. Right: the hands, the picked thing on velvet, its numbers as segmented gauges, the case's colours and charms, and **a handwritten note about the thing** ("Grandpa's. Kicks like a mule — two shots, then run."). |
| Pause (`f-pause`) | **GTA V's**: the map is the screen — an illustrated town map (pine stands with shadows and snow, gabled and flat roofs, sidewalks, crosswalks, parked cars, lamps, snowbanks, river ice, the bridge, fenced fields, names along the roads), the gold route and waypoint, GTA's map cursor on a place with a card (a picture of the room, hours, people inside, distance). Over it: the title, me (portrait, day, weather, mic, cash), GTA's tab bar (Map · Pack · Pets · Build · Voice & video · Settings · Credits · Leave), a legend grouped like a road atlas, the place under the cursor, a scale, north, the keys. |

The mocks' names, hours, texts and street names (Walt, Elm Row, Pine River, "till 22:00"…) were made up for the
pictures; the real ones come from the game's data.

## What there is today

Everything below goes or is redrawn (bar build mode). Where it lives:

- **The HUD's frame** — `components/hud/WorldView.tsx` mounts it all: `TopBar` (top-left place card + top-right
  presence/me menu), `Dock` (bottom-centre: mic, camera, share, emote, phone, people, status, build, pets, settings),
  `Overlays.tsx` (`Prompt`, `LookHint`, `Toasts`, `HeldChip`, `LockChip`, `CableChip`, `WrapPicker`, `Knocks`,
  `VideoBubbles`, `ConnectionOverlay`, **`Minimap`** — shown only in the lot and the office, plan 45), `Actions.tsx`
  (the action ring, `ActionQueueBar`, `ArrivalChip`, `FocusChip`), `PanelHost`/`SidePanel`/`panels.tsx` (every side
  panel), `EmoteWheel`, `PetWheel`, `PetOverlays`, `ScreenTray`, `ChessStrip`, `LiftPanel`, `GfxConfirm`.
- **The look** — plan 45's walnut and ink: `app/globals.css` tokens (`cabinet`, `title`, `--amber`, `--cream-dim`…),
  Cormorant Garamond + Special Elite.
- **Hands and pack** — `world/dark/inventory.ts` (1100 lines, plain DOM: the I panel, plan 86's "open pack"),
  `world/dark/arms.ts` (the hands' strip, keys 1–5, plan 87: 1 is the left hand), the pickup slip; rules in
  `packages/shared` (8 pockets, rounds stay in the pack, plan 85/86) and the API's whitelist
  (`apps/api` `Survivor::STACKS`).
- **Vitals** — `packages/shared/src/vitals.ts`: **health, stamina, warmth, torch battery**, 0..100, settled by the
  server (`Player.hp` …). Today they show as a red vignette and frost (`world/dark/vitals-hud.ts`), the battery as the
  FOCUS bar.
- **Money** — none in the town (plan 124 F7 left the catalog's `price?` and hidden funds slots for it). The Strike
  Park has its own match money.
- **The phone** — `components/hud/phone/` (its own layer and screens).
- **Their own HUDs** — the car (`world/car/hud.ts`, plan 94's walnut plate), skate (plan 104's punk HUD), bike, kart;
  the games' panels (pool, pong, slots, dealer, piano, chess strip…); pets (`PetPanel`, `PetWheel`).
- **Separate worlds** — the Strike Park's match HUD and menus (plans 114–119, their own CS look), God mode's HUD
  (plan 53, admins), the admin pages (`app/admin`), **build mode (plan 124: out of scope)**.
- **Pages** — login/register/forgot/reset (`AuthCard`), the avatar editor (`app/avatar`), credits, the loading screen.
- **Esc** has no menu of its own today: it closes what's open; settings is a side panel off the Dock.
- **e2e** — many specs click the Dock's buttons and the TopBar's menu; they move with the UI.

## The proposal (before the forks)

1. **Foundations.** F's tokens in place of plan 45's: the palette (ink, warm gold `#f3d27a`, GTA green cash, the four
   bar colours), the faces (Bebas Neue, Anton, Inter Tight, Oswald, IBM Plex Mono, Caveat — all OFL, self-hosted,
   only the weights used), the key cap, the help box, the feed card, the gold rule, the film layer (grain + edges) —
   drawn cheaply: one small static noise image at low opacity, no blend modes over the 3D view (friends' iGPUs are
   GPU-bound, plan 90).
2. **The play HUD** in F's places: help box (takes `Prompt`/`LookHint`/the hints), the map (tilted, route), the bars,
   the top-right block (clock, cash, hand, torch cells, shells), the place card (on arrival), subtitles, the feed (takes
   `Toasts` and the pickup slip), the mic tag, my plumbob. **The Dock and the TopBar go**: what they did moves to keys,
   the wheel and the pause menu.
3. **The action ring and queue** redrawn (`Actions.tsx` keeps its logic).
4. **The quick wheel** after GTA V (fork F4).
5. **The pack: Ana's Case** (forks F5–F6).
6. **The pause menu** (Esc): GTA V's tabbed screen over **a map drawn from the world's own data** — roads, buildings
   and their roofs, trees, rivers, fields from the Grounds and the buildings list, not a picture; the tabs host what
   the Dock and side panels did (Pets, Build — which opens build mode, Voice & video, Settings, Credits, Leave).
7. **The phone** in F's look (fork F10).
8. **The other HUDs and panels** in F's look: car, skate, bike, kart, the games' panels, pets, toasts, the action
   ring's people card, NPC card.
9. **The pages**: login and friends, avatar editor, credits, loading.
10. **Phones (mobile)** (fork F12).
11. **Checks**: every e2e spec near the change, page/chunk budgets measured and noted, frame times on the friends'
    machines' settings, stills of every screen against the mocks.

Two things GTA does that this world can't: **time doesn't slow** when the wheel is open (other people are in the
world) — it only looks greyed and still; the mock's "time slowed" line goes. And there's no pausing — Esc opens the
menu over a world that goes on.

## The forks

**F1 — how far "everything" goes**
- **a** every screen a member sees: the play HUD, wheel, pack, pause/map, phone, settings, the car/skate/bike/kart
  HUDs, the games' panels, pets, toasts, the pages (login, avatar, credits, loading). The Strike Park's match HUD,
  God mode and the admin pages keep their own looks; build mode untouched *(recommended)*;
- **b** a, and the Strike Park and God mode too;
- **c** only what was mocked (play HUD, wheel, pack, pause) now; the rest later.

**F2 — the four bars under the map**
- **a** the vitals the game already has: **health, stamina, warmth, torch battery** (the red vignette and frost can
  stay as the body's feel, or go) *(recommended — real, no new system)*;
- **b** The Sims' needs as a new system (warmth, energy, fun, hunger: drain, refill at the diner/bed/home, moodlets);
- **c** a now, b later in its own plan, the bars made to take either.

**F3 — money (the green cash)**
- **a** the cash slot built but hidden until the town has money (as plan 124 F7) *(recommended)*;
- **b** a small money system now (earn and spend) in its own plan before this one;
- **c** no cash on screen at all.

**F4 — the quick wheel**
- **a** GTA's: by **kind** (eight), Q/E cycles within a kind, keys 1–8 pick kinds (1 stays the left hand), phone ·
  emote · pack · build on their own keys *(recommended)*;
- **b** GTA's look over today's five hand slots (no kinds);
- **c** kinds on the wheel, but keys 1–5 stay the hand slots as today.

**F5 — the pack's rules**
- **a** RE4's: a grid by size (things take their room; R turns them; a pickup is placed where it fits, or you place it;
  the case's room grows with bigger cases), the hands are shortcuts into it *(recommended — what was picked)*;
- **b** Ana's Case's look over today's rules (8 pockets + the hands, no sizes);
- **c** sizes but no turning.

**F6 — the case's extras**
- **a** all of them: **charms** (cosmetic, three on the handle), **case colours**, the **lid** filled by playing
  (a sticker when you first reach a place — Silver Lake, Hawk Pass, Long Pine Road…; a polaroid from the phone's
  camera), and **a handwritten note for every kind of thing**, in the player's own name *(recommended)*;
- **b** a fixed lid and notes, the same for everyone; charms and colours only;
- **c** the case alone, no extras.

**F7 — the map**
- **a** on screen everywhere (GTA), tilted; waypoints from the pause map; a gold route on foot and by road *(recommended)*;
- **b** everywhere but inside buildings;
- **c** as today (lot and office only).

**F8 — subtitles and texts**
- **a** subtitles for what NPCs and the town say (`npc-words`), and the feed carries the game's own news (pickups,
  arrivals, messages from people on the phone) — no made-up texts *(recommended)*;
- **b** a, and NPCs text you (a new feature: they write when something happens in town);
- **c** neither.

**F9 — people on the screen** (plan 45 cut the people panel and the objective line)
- **a** the cuts stand: no people list, no objective line *(recommended)*;
- **b** a GTA-style list of who's in (a pause tab);
- **c** both a list and an objective line.

**F10 — the phone**
- **a** redone in F's look, GTA V's way (rises bottom-right, apps in a grid), mocked first *(recommended)*;
- **b** left as it is.

**F11 — the plumbob**
- **a** over my head only, its colour my status (available · busy · don't disturb) *(recommended)*;
- **b** over everyone's head;
- **c** none in the world, only in the pause header.

**F12 — phones (mobile)**
- **a** desktop first, phones in their own phase at the end *(recommended)*;
- **b** both together, phase by phase;
- **c** desktop only.

**F13 — how to work**
- **a** mock what isn't mocked (phone, settings, car/skate HUDs, panels, pages, mobile) first, then build straight
  through, checks at the end *(recommended)*;
- **b** build what's mocked first, mock the rest as it comes;
- **c** a sign-off after every phase.

## Phase 0 — the rest mocked (2026-11-24)

Ten more screens in F's look (`design/ui-life/r2/sheet-f-phase0.jpg`, `f-<screen>.png`; page
`ui-life2.html?look=f&s=<screen>`), on new frames of the game (`design/ui-life/mock/bg/`: driving, skating, Ana with
a dog — adopted for the shot and let go after — captured by `apps/client/e2e/zz-uilife-ride.mts`):

- **settings** — the pause's Settings tab, GTA V's: categories on the left (Picture · Display · Sound · Controls ·
  Camera · Language · Account), the rows with `‹ value ›` or a bar of steps, a line about the picked row, and **"this
  machine"**: the frame's cost measured live, split world / people / shadows, what a change would add;
- **voice** — Voice & video: microphone, talk (M mutes), noise suppression, speakers, voices from where people stand,
  camera, screen share; the voice meter; the camera preview ("only you see this");
- **car** — the car's HUD: Pine Valley Radio's name at the top as it changes (GTA's), a plate over the map (km/h, gear,
  revs with their red, fuel cells, the engine's warmth, the body from above with its dents and a soft tyre), the car's
  name bottom-right on getting in, the driving keys in the help box;
- **skate** — the combo top-centre (tricks strung, score × length, the special bar), the manual's balance by her feet,
  score and best under the clock, the skate keys;
- **dealer** — Esker Motors (`DealerPanel`), a showroom after GTA's car sites: the models in a grid (the real lineup
  renders), the picked one large, its numbers (gold: with winter tyres and chains), colours, extras, "Take it"; the
  price waits for money (F3a);
- **pets** — Rex's card: level and XP, the needs (food, water, energy, fun, health — the pets' own), what he wants,
  the commands 1–5; a heart over his head, The Sims' way;
- **feed** — the feed's real news (cold, torch low), a text, and **GTA's big message** for a first visit ("Main Street
  · first time here · a sticker for your case", F6a);
- **login** — the town at dusk behind, the title, email and password, "Into town", the town's weather and who's in;
- **avatar** — "Your look", GTA Online's creator: the list (body, face, hair, beard, clothes), styles in a grid,
  colours, Ana in the street as the preview;
- **loading** — a frame of the town, a tip, "Loading the town · 64%", a thin gold bar.

F's six first screens were redrawn to the forks: the bars read **health · stamina · warmth · battery** (F2c) and **no
cash** shows (F3a).

## Phases

0. **Mocks of the rest** (F13a): the Settings and Voice & video tabs, the car/skate HUDs, a game panel, the pets
   panel, the toasts and feed, login, avatar, loading. (No phone — F10b; no mobile — F12c.)
1. **Foundations** — tokens, faces, the film layer, the shared pieces (key cap, help box, feed card, rule, bars,
   tabs, list rows, cards); a HUD layout with F's corners; the old `cabinet` look retired screen by screen.
2. **The play HUD** — help box, map + route everywhere (F7a), the four bars on the real vitals (F2c: health,
   stamina, warmth, battery; made to take needs later), top-right block, place card, subtitles + the real-news feed
   (F8a), mic tag, my plumbob in my status's colour (F11a); the Dock and TopBar gone on desktop, their jobs moved;
   the cash slot hidden (F3a).
3. **Action ring and queue** redrawn.
4. **Quick wheel** (F4a) — eight kinds, Q/E cycling, keys 1–8, stats card, silhouettes from `public/life/items`;
   phone/emote/pack/build keys moved (shown along the wheel's bottom).
5. **Ana's Case** (F5a, F6a) — the grid rules in `packages/shared` and the server (sizes per kind, placing, turning,
   auto-place on pickup, case sizes, saves, the API whitelist, a migration from today's pockets), the case's screen
   (materials baked once, not live SVG filters), charms and colours, the lid (stickers on first reaching a place, a
   polaroid from the phone's camera), a note per kind of thing written in the player's name.
6. **The pause menu** — Esc, the tabs, the map drawn from world data (cached, made off the frame: `after-frame.ts`),
   the legend from the places, waypoints; the panels moved into tabs.
7. ~~The phone~~ — dropped (F10b): it stays as it is; checked only that it opens, closes and hands the mouse back
   over the new HUD.
8. **The other HUDs and panels** — car, skate, bike, kart, games' panels, pets, people/NPC cards, toasts.
9. **The pages** — login and friends, avatar, credits, loading.
10. ~~Phones~~ — dropped (F12c): on a narrow screen the old HUD stays; the new one is chosen by width, and the
    split is tested both ways.
11. **Checks** — the e2e specs near each change and the known reds (not the full run: `no-full-e2e-unasked`), page
    and chunk budgets (raise and note), frame times (the film layer, the map), stills of every screen beside its mock,
    a double-check.

Build mode's screen is not touched in any phase. Its entry (B, and the Build tab) moves; its look doesn't.

## Built (2026-11-24 — all phases, not committed)

The new UI is the desktop's (`lib/lamp.ts` `useLamp`/`lampWanted`: a fine pointer and ≥ 900 px; `?ui=old` keeps the
old one); phones keep the old UI (F12c). Its look lives in `app/lamp.css` under `.lamp` (and `.lp-*` for the action
ring, which sits outside it); its faces are `next/font` (Bebas Neue, Anton, Inter Tight, Oswald, IBM Plex Mono,
Caveat — the last three not preloaded); the film is `public/lamp/grain.png` + a vignette, no blend modes.

- **Phase 1 — foundations**: the faces, the tokens and shared classes (`l-key`, `l-help`, `l-feed`, `l-bars`,
  `l-cells`, `l-shell`, `l-clock`, `l-place`, `l-sub`, `l-row`, `l-head`, `l-tabs`, `l-keys`), the film.
- **Phase 2 — the play HUD** (`components/hud/lamp/LampHud.tsx`, `LampPrompt.tsx`): the help box (the old prompt's
  logic and clicks, the look hint), the **radar** drawn from the Grounds (`WAYS`, `BUILDINGS`, `RIVER`, blips by kind,
  the way you face up, tilted, ~15 fps), the **four vitals bars** (health · stamina · warmth · battery, F2c), the
  top-right block (clock; what's drawn as a white picture of the real item with rounds `loaded | spare` and the
  shells; the left hand's torch and its battery cells), the place's name (big on arrival, then quiet), **subtitles**
  (NPC lines: `controller.ts` → `lampSay`, F8a), the **feed** (the dark's slips and toasts, the store's toasts —
  `lampFeed`), the mic tag, **my plumbob** over my head in my status's colour (F11a; not in first person or driving).
  The dark chunk publishes `hud.lamp` (vitals ~5×/s on change; hands, counts, gun on change) and hides its own quick
  bar, battery, gun counter and slips on the desktop. The old TopBar, Prompt, LookHint, Toasts and Minimap don't show
  there.
- **Phase 3 — the action ring and queue** (`Actions.tsx`): white numbered pills, the picked one gold, the thing's
  picture in a ring, its name in Bebas; the queue as GTA's round icons top-left.
- **Phase 4 — the quick wheel** (`LampWheel.tsx`, F4a): Tab held ¼ s opens it on foot; the mouse (locked) points at
  a kind, the camera holds (`tp/parts/pointer.ts`); Tab let go takes it; keys 1–8 pick kinds on the desktop
  (`ctl/input.ts` → `walker.kindKey` → `dark.kindKey`: 1 left hand, 2 pistol, 3 shotgun, 4 rifle — again: the next,
  5 heavy, 6 the flare, 7 melee (none yet), 8 put away). A weapon in the pack (not at hand) shows dim and says so.
  Emotes stay on X (the old 6–9 are kinds on the desktop).
- **Phase 6 — the pause menu** (`LampPause.tsx`, panel kind `pause`): Esc with nothing open (`ctl/input.ts`); GTA's
  tabs (Map · Pack · Pets · Build · Voice & video · Settings · Credits · Leave — Pack, Pets, Build, Settings open
  today's screens for now); me with mic/camera/share and my status (the Dock's jobs); **the map drawn from the world**
  (ways with names along them, the river and pond, every tree from `treesIn`, roofs pitched for houses and barns,
  blips, me), drag/scroll/click; the **legend** grouped, nearest first; a click sets the **waypoint** (F7a), the radar
  then draws its gold line **along the ways** (`world/lamp-route.ts`: the Grounds' `WAYS` sampled every 6 m into a
  graph, crossings where two ways come within 7 m, A* from the point nearest me to the one nearest the waypoint;
  made once, searched as you go) on the radar and the pause map. The Settings and Voice & video tabs show today's
  settings pages (`SettingsPanel.tsx` exports them: Me, Sound, Camera, View, Graphics, Controls) in F's dress.
  **The Dock is gone on the desktop.**

- **Phase 5 — Ana's Case** (F5a, F14a–F17a): the rules — `packages/shared/src/inventory.ts`: a 10 × 7 case
  (`CASE_W`, `CASE_H`), a size per thing (`SIZE`, turned with `sizeOf`), where each lies by slot (`Inventory.place`:
  `[x, y, turned]`, everything carried — the hands are shortcuts into it), `caseCells`, `fitsAt`, `spotFor`,
  `placeSlot`, `addItemAt`, `settle`; every add, split, swap and Organize respects room in the case (a new box only
  where it fits); `POCKETS` 8 → 16 (the room's the case's; the phones' old pack shows them all); an old pack is
  placed on the way in, what has no room goes to `Inventory.stash` (at home, F17a; `STASH_MAX` 40). The server:
  `dark:place` (moved/turned), `dark:pick` with `at` (laid where it was put). The API keeps `place` and `stash`
  (`DarkController`, `Survivor::POCKETS` 16). The screen — `components/hud/lamp/LampCase.tsx` (panel kind `case`;
  I, or the pause's Pack): the leather, foam, felt, card and brass **baked once** to `public/lamp/case/` (from the
  mock's lit noise: `design/ui-life/mock/bake.mjs`); the things where they lie, dragged to move (green where they
  fit, red where not), R turns what's held; what's on the ground in reach to take up and lay in; the hands (1–5) as
  brass-rimmed shortcuts; the picked one on velvet, its numbers, Use / Left hand / Drop, 1–5 to a hand, Q to drop,
  Organize; **a note about each kind in your own hand**, signed with your initial (EN/PT). **The lid** (F6a): a
  sticker for each place first reached (`packages/shared/src/stickers.ts`: eight places — Main Street, the Pond, the
  Farm, the Skate Hall, the Church, Long Pine Road, Hawk Pass, Silver Lake; the world-server's survival tick awards
  `sticker-<key>` into the survivor's pages, saved by the API, and says `dark:sticker` → the feed), and **the
  polaroid**: your latest photo from the phone's camera (`phoneApi.photos`). **Case colours** (4) and **charms** (6,
  three on the handle) are earned the same way — each comes with a place's sticker (brown and the plumbob charm are
  yours from the start); locked ones show a padlock and where to go; the choice is kept on the device
  (`yutopia:case`). **A car's boot is a second grid** beside the case (`car:take` with `at`). Not yet: a locker's
  search still puts what's found where it fits by itself (only the ground and the boot hover to be laid in).
  Tests: shared 890 (4 new for the case), world-server survival/arms/cars/down/vortex/car-shot green, API Survivor 9
  (1 new) — the dev DB checked untouched.

- **Phase 8 — the other HUDs and panels**, by a global dress rather than screen by screen: `components/LampRoot.tsx`
  puts `html.lamp-ui` on the desktop, and `app/lamp.css` re-dresses the old shared pieces under it (`.cabinet`,
  `.title`, `.lcd`, `.deck-btn`, `.ghost-btn`, `.keycap`, `.faceplate`, `.card`, `.slider`, `.rail-item`, `.zigzag`
  and the old tokens) — so the pets, the dealer, the games' panels, NPC cards and the rest wear F's black, gold and
  faces without each being rewritten. **Build mode's glass (`.gl`) is excluded** (`:not(.gl *)`, its tokens reset).
  The car's HUD (`world/car/hud.ts`, `.carhud`) in F's places: its plate over the radar, its keys under the clock;
  the skate's score and special (`.skh`) under the clock; the radio's station shown GTA-style, big and centred, as it
  changes.
- **Phase 9 — the pages**: the loading screen is GTA's (`LampLoading.tsx` in `Overlays.tsx`' connection overlay: a
  town frame, the tip, the spinner); the sign-in page on the dusk town (`public/lamp/town-{dusk,day,night}.jpg`,
  `.auth`); the avatar page and the credits in the dress.

- **A review's fixes** (an independent read of the whole change, 2026-11-24): the world-server never sent `place` and
  `stash` to the API (`recordOf`) — the layout reset on every join and the stash would have been lost; now saved. A
  gun that couldn't be placed (one of its kind carried, or no room) still had its rounds pulled into the pack by
  `addItem`, which said 0 — the drop, the boot or the dragged-in thing kept them too (duplicated rounds; `car:take`
  had it before this plan): `addItem` takes a gun whole or not at all (a search's `take` still empties a second gun's
  rounds, counting them). The board/umbrella into the left hand (`boardToHand`) and the admin's refill now give
  things real places (or refuse); `caseCells` doesn't wrap a bad place into the next row. Organize leaves the case
  as it was if repacking would leave anything out (never sends things home). The stash is reachable: **at home —
  your own room, or by the lobby's locker** — the case lists what's there to drag back in (`dark:unstash`), and the
  picked thing has *Leave at home* (`dark:stash`); `STASH_MAX` 100 (shared + API). Keys: the dark chunk no longer
  takes the case's and the pause's keys (1–5 to a hand, R to turn, E under the menu), and on the desktop the digits
  are the kinds (not the quick slots) outside a Strike Park match; the wheel opens on what's drawn and letting go
  without pointing elsewhere changes nothing. `addItemAt` lays the torch where it was put and tops up boxes first.
  Tests: shared 894, world-server survival (+1: place across a rejoin, the stash only at home) and cars green, API 9.
  Known: on a phone (old pack, F12c) the room is still the case's — a pickup can say "full" with pockets showing
  empty.

- **A second review's fixes** (the double check, 2026-11-24): the old toasts show again wherever the new feed is off
  (building, God mode over the map, a Strike Park match — their notices had gone dark on the desktop); a car's boot or
  glove box open, the case's Drop and Q put the thing in it (`car:put`, as the old pack did — they had thrown it on the
  ground), the button says where; the picked thing follows itself to the hand 1–5 sends it to (a second Q dropped
  what was swapped in); a search, a locker or the daily kit with no room for a gun leaves it whole (it had pulled its
  rounds: the lobby's locker handed out six a time); the lobby's locker counts a revolver or torch left at home (else
  stash it, take another); stash/unstash not while busy or down, and unstash names the thing it means; the stash
  holds up to `STASH_HOLD` (100 + every carried slot) once a load spills the case into it, never cut (shared + API);
  an admin refill's overflow is put down at their feet; the route's graph and the radar's road boxes are made again
  after an edit (WAYS is laid anew in place); **Esc in play**: Chrome keeps the Esc that frees a locked pointer from
  the page, so a let-go the game didn't make (`MouseLook.letGoAt`) opens the pause; the wheel open under Esc is let
  go without a pick; the wheel ignores Chrome's stray jumps around a lock change. Checked live
  (`e2e/zz-lamp-check.mts`, 23 checks: a phone's width keeps the old UI, build mode's glass and God mode over the
  new, keys 2/8, the wheel let go unmoved, the case's 5 and Esc, the stash refused out on Main Street and kept and
  taken back at the locker; `zz-lamp-glove.mts`: Q in the driver's seat into the glove box). World-server +1 test
  (the locker and the stash).
- **After the build, the user's calls (2026-11-24):** the film (grain + dark edges) **off by default**, on from
  Settings → Picture ("Dark screen edges and grain (new UI)": prefs `film`, `html.lamp-film-on` by `LampRoot`); the
  **plumbob only for away or busy (dnd) — over everyone's head, mine and others'** (F11a changed: it was mine only,
  in my status's colour, online included). It's drawn in the name tags now (`tp/parts/tags.ts`, desktop's new UI only;
  not pets, town NPCs or bots; not in the dark unseen, nor my own in first person); LampHud's own is gone. Checked with
  two people (`e2e/zz-lamp-bob2.mts`).
- **My own name off my head** (the user, 2026-11-24 — everywhere: `tp/parts/tags.ts`; my plumbob, bubbles and emotes
  still). **The old top bar's face menu had two ways in the new UI had lost**: the pause now has an **Admin** tab
  (admins only; it opens Run the place, `AdminPanel`) and **my face** in its header opens My look.
- **The pause map's lag** (the user, 2026-11-24: zooming out and dragging lagged, far out the game died): every move
  redrew every tree in view — `treesIn` isn't cached, ~5,000 chunk generations a draw far out — every road and the
  route search, more than once a frame. Now the land (water, woods, ways, buildings) is drawn once into 512 px tiles
  at five zooms (0.5–8 px/m, kept 56, made in a 9 ms budget a frame, a coarser one standing in meanwhile) and only
  moved and scaled; far out (< 2 px/m) the woods are the density sampled 64 × 64 a tile and scaled up smooth; the route
  is searched again only when I've moved 4 m or it has; at most one paint a frame; blips without blur. Measured
  (`e2e/zz-lamp-mapperf.mts`): zooming fully out 17 ms median, 35 p95; dragging far out 17/19. **The waypoint is
  unmarked** by a click on its pin, by its legend row again, or by getting there (14 m: `LampHud` radar,
  `ARRIVED_M`).
- **Phase 11 — checks** (2026-11-24): `e2e/lamp-ui.spec.ts` is the new UI's spec (HUD without the Dock, Esc's pause +
  a waypoint, Tab's wheel, I's case with a drag the server keeps); every other spec keeps the old UI on the desktop
  (`yutopia:ui` = "old": `playwright.config.ts` storageState and `helpers.ts` `enter`, which takes `{ ui: "new" }`;
  `lib/lamp.ts` honours it). Green: lamp-ui, inventory ×1, inventory-tools ×5, inventory-pack, left-hand, hud,
  phone ×6 (+1 skipped: shots), use-things ×2. Red, not this plan's: actions.spec ×3 — "Can't get there", the walk to
  a freshly put cooler on the Lab's studio floor finds no path (navigation). Page budget: 512.9 → 503.3 KB with the
  HUD, wheel and route made a lazy chunk (`WorldView.tsx`); raised 500 → 505 under the standing call
  (`tools/budget.mjs`); every lazy chunk within its own. Biome clean on the touched files (warnings: the car HUD's
  `!important`s, an older comma in `controller.ts`).

Checked in the game (`apps/client/e2e/zz-lamp-shot.mts`: Main Street, the diner, the ring, the wheel, the pause
map + route Main St → Church St, the case — opened with I, a thing picked, the first aid dragged [0,2] → [4,5] and
kept by the server, the polaroid from a real photo, the Main Street sticker earned; settings tab at 43 fps;
`zz-lamp-pages.mts`: sign-in, credits, avatar, a car driven; `zz-lamp-skate.mts`: riding Main Street): all draw,
`tsc` clean. The plumbob sits at feet + 2.08 m — higher, over the chase camera's eye (3.7 m), it reads as far down the
road.
