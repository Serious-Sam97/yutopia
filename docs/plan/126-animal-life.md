# Plan 126 — Animal life

Asked 2026-11-25, after plan 125:

> New feature
>
> Animal life
>
> Lets plan

The world is big now (plan 91's map, the long road to Silver Lake and Hawk Pass, God mode's grown land: meadow,
hills, mountains, farmland, beach, desert), and it's empty of anything alive that isn't a person or a pet. This plan
fills it: wild animals that live their own day where they belong, react to you, to the weather and to each other —
and, at night, some that are part of the dark.

Status: **planned 2026-11-25; forks decided 2026-11-25, one by one (with four follow-ups); built 2026-11-25 straight
through (F12b), not committed — the user tests it.** What was built is under "Built" at the end.

The forks:
- **F1c** wildlife, danger and hunting — **and tame animals**: pigeons and a stray cat in town; **a farm** on the
  farmland (chickens, cows, sheep, pigs, horses; a barn and pens): fed, eggs and milk collected, **horses ridden**;
- **F2c** the large cast (20+, below);
- **F3c** CC0 packs (Quaternius' animated animals and the like) restyled to the life look, Blender for the gaps
  (young ones, missing clips, the farm's tack); any CC-BY credited in `sources.json` (plan 75);
- **F4b** all on the server — **but the tiny ones on each client** (follow-up): insects, fish shoals, far songbird
  flocks, seeded by place and time. Everything you can hunt, feed, ride or befriend is the server's;
- **F5c** predators day and night **by territory**: the bear's woods, the wolves' pass, the lynx's ridge — dangerous
  there at any hour (the dark makes them bolder, the torch and a fire keep them off);
- **F6c** they can be shot, fall, and leave **meat and hide**: cooked at a fire meat gives back health and warmth, raw
  makes you sick (follow-up); **hides craft warm clothes** (a fur coat, hat, gloves) worn from the wardrobe, slowing
  the cold;
- **F7c** watch, feed — **and befriend into pets, every species, wolves and bears too** (follow-up): fed over days
  until they trust you; a big or dangerous one is befriended young (a wolf pup, a bear cub, a fawn) and grows up a pet.
  Each becomes a pet species with the pets' mind and wheel (fish and insects aren't, being the client's);
- **F8a** pets and the wild meet: dogs chase squirrels and bark at deer, cats stalk birds, a lost pet can meet the
  wolves;
- **F9c** by biome, and God mode over it (herds, nests, dens, empty zones; draft → publish);
- **F10a** tracks in the snow (a trail to follow), breath in the cold, snow shaken off;
- **F11b** — I pick every sound (CC0 / CC-BY, credited); the user tests at the end and we change what doesn't fit;
- **F12b** built straight through, tested at the end (stills at the end).

### The cast (F2c)

- **Birds** — crows, songbirds (flocks: far ones the client's), ducks and geese (the pond, the lake, the river),
  an owl (night), gulls (Silver Lake), pigeons (town).
- **Small** — squirrels (trees), hares, a fox, a raccoon (bins at night), beavers (the river, a dam), frogs (by the
  water in the warm), a stray cat (town).
- **Big** — deer, elk, moose (by the lake), boars (woods), wolves (packs, the pass), a lynx (the ridge), a bear (deep
  woods, mountains).
- **Water** — fish (the client's shoals; jumping, seen under the surface).
- **Insects** (the client's) — butterflies on warm days, fireflies on warm nights, by the season and the snow layer.
- **The farm** — chickens, cows, sheep, pigs, horses (ridden).
- **Young** of those that can be befriended young: wolf pup, bear cub, fawn, calf (elk/moose), lynx kit, piglet
  (boar), foal.

## What there is today

- **Pets** (plans 51–52, shared `pets.ts`, `mind.ts`; server `features/pets.ts`, 3.3 k lines; client
  `art/pets3d.ts`, 3 k lines of models made in code): six species (dog, cat, rabbit, platypus, capybara, parrot),
  needs, traits, drives, `choose()` with hysteresis, moods, memory, bonds, tricks, the wheel on T. They walk the
  land by its height (not on Jolt). Lost pets can die "in the wild" (`wildAt`: deep woods ≥ 0.9 trees, the river's
  ice, past the road's closure) — the wild is only a chance roll, nothing is there.
- **No wild animals.** The only "animals" in the world: scarecrows by the corn (`grounds3d.ts` `crows`), a bear's paw
  on a keychain, and **birds as sound** (plan 65: on warm, dry, calm days, loudest round 6:30, none at night).
- **The land** (shared `land.ts` `Biome`): town, field, forest, gorge, alpine, lake + God mode's grown biomes;
  `treeDensity`; the pond (`POND`, −240/−60), the river (with ice), Silver Lake (`longroad.ts` `LAKE`, 9520/−2330),
  water you swim in (plan 66). Weather: green base, snow layer, rain, sleet, fog, blizzards (plans 64–65).
- **The dark** (plan 30): hostile things outdoors at night, health (`hp`), warmth (`wm`), the torch; guns (plans
  79–84, 116). Its "still open" line: *"Shadowed animals (crows, dogs) as a second kind, later?"*
- **NPC minds** (plan 123, shared `npc/mind.ts`) and the pets' — the shape an animal's would take, lighter.
- **Perf** (plans 89–90): friends' M1s on Low are CPU-bound by object count; High is GPU-bound. Anything with many
  of a kind must be instanced and cheap far away.
- **Vitals** have no hunger: `hp`, `wm`, `bat`.

## The proposal (before the forks)

1. **A cast of species by biome** — the birds (crows, small songbirds, ducks/geese on the pond and lake, an owl at
   night, gulls by the lake), the small ones (squirrels in the trees, hares, a fox), the big ones (deer, elk/moose by
   the lake, wolves in packs, a bear in the deep woods and the mountains), fish in the water, and in town pigeons and a
   stray cat. Each lives where it belongs: biome, trees, water, height, snow.
2. **Their day** — a light mind (a few drives: food, rest, safety, company), the hour (birds loud at dawn, deer at
   dusk, the owl and wolves at night), the weather (shelter in a blizzard, ducks off the frozen pond, tracks in the
   snow), the season's snow layer. Herds, flocks, packs move as one.
3. **They react** — flee from a runner, a car, a shot; curious when you stand still; startled flocks rise all at once;
   the predators hunt the small ones; pets chase squirrels and bark at deer.
4. **Shared and cheap** — the big ones run on the server (everyone sees the same deer); the small ambient ones (song
   birds, fish, insects, pigeons) on the client, seeded by place and time so everyone sees much the same; few near,
   instanced, baked animation far away.
5. **Danger and hunting** (by the forks) — wolves and a bear as part of the dark; animals you can shoot.
6. **God mode** — herds and nests placed by hand over the ones made by biome.
7. **Sound** — each species' calls, recorded (CC0 / CC-BY credited in `sources.json`).

## The forks

Each lists its options; ⭐ the one recommended. Asked one by one; the answers go in the status above.

- **F1 — how far it goes.** a wildlife you watch: they live, react, flee — no harm either way; b ⭐ a + danger and
  hunting (predators at night, animals can be shot); c b + tame ones in town and on the farmland (pigeons, a stray
  cat, chickens, cows, horses by the barn).
- **F2 — the cast.** a small (8): crows, songbirds, ducks, squirrels, hares, deer, a fox, fish; b ⭐ medium (14): a +
  geese, an owl, elk/moose, wolves, a bear, pigeons; c large (20+): b + gulls, a lynx, boars, beavers, frogs, insects
  (butterflies, fireflies), the farm's.
- **F3 — the models.** a ⭐ Blender, our own: rigged bodies and clips (walk, trot, run, graze, look, sit/lie, fly,
  swim, attack, die), the life look's fur and feathers, as the guns and cars were made; b made in code as the pets
  are (`pets3d.ts`), clips by hand in code; c CC0 packs (Quaternius' animated animals and the like) restyled to the
  life look, Blender for the gaps.
- **F4 — who runs them.** a ⭐ the big ones on the server (deer, elk, wolves, bear, fox, hares) shared by all; the
  small ambient ones (songbirds, fish, insects, pigeons, squirrels) on each client, seeded by place and time; b all on
  the server; c all on the client.
- **F5 — the danger.** a none — nothing attacks, everything flees; b ⭐ predators by night, part of the dark: wolves
  in packs after dark off the lit paths, the bear when you come too close or corner it; the torch and a fire keep them
  off; c predators day and night by territory (the bear's woods, the wolves' pass).
- **F6 — shooting them.** a guns pass them by — a shot only scares them; b ⭐ they can be shot: hit reactions, they
  fall, a body that fades in a few minutes, no loot; c b + meat and hide: cooked at a fire, meat gives back health
  and warmth (there's no hunger vital); hides as items.
- **F7 — getting close.** a watch only (they let you near if you're slow and quiet); b ⭐ a + feeding: bread for the
  ducks and pigeons, a nut for a squirrel, an apple held out to a deer — they come to your hand; c b + befriend a few
  into pets (a fox, a crow on your shoulder: new pet species).
- **F8 — pets and the wild.** a ⭐ they meet: dogs chase squirrels and bark at deer, cats stalk birds, a lost pet can
  meet the wolves (the "wild" death made real); b they ignore each other.
- **F9 — where they live.** a by biome only, made from the land; b placed only by hand in God mode; c ⭐ by biome, and
  God mode over it (a herd, a nest, a den placed; a place kept empty), draft → publish as everything else.
- **F10 — the snow.** a ⭐ tracks in the snow (prints that fade, a trail you can follow to the animal), breath in the
  cold, snow shaken off; b none of that.
- **F11 — the sound.** a ⭐ recorded calls for every species, picked by your ear on a `/dev/animal-sound` bench (as
  plans 63, 65, 101); b I pick, you veto.
- **F12 — sign-offs.** a stills of the Blender models signed off first (phase 0), then straight through; b ⭐ built
  straight through, tested at the end (stills at the end); c mocks and a sign-off at each phase.

## Phases

0. **The cast's sheet** (shared `animals/species.ts`): every species — biome, trees, water, height, group (herd,
   flock, pack, alone), active hours, speeds, senses (sight, hearing, smell), flee and charge distances, food,
   prey and predators, territory (F5c), the weather it shelters from, what it leaves (meat, hide: F6c), what it eats
   from your hand (F7), whether it's befriended grown or young, its young; who runs it (server, or the client's tiny
   ones). Tests.
1. **The models** (F3c): the CC0 packs fetched (pinned copies, as `tools/emu-vendor`), each checked for its licence;
   restyled in Blender to the life look (plan 73: painted fur and feathers, the ink line's weight, no toon flat);
   Blender for what's missing (the young, the lynx/beaver/raccoon if no pack has them, the saddle and bridle, clips:
   graze, drink, sit/lie, sleep, look, startle, flee, charge, bite, swipe, hit, fall, die, swim, fly/glide/land,
   eat-from-hand, ridden gaits). LODs: near skinned, far baked animation (vertex animation) instanced. A
   `/dev/animals` bench: every species and clip, Low/High, the life look's light. Credits in `sources.json`.
2. **Where they live** (`animals/habitat.ts`): made by biome and chunk as the land streams (plan 91's tiers), seeded,
   each group's home range, dens, nests, the territories; the pond's and the lake's birds; the town's own (pigeons,
   the stray cat, the raccoon at the bins). God mode's `animals` draft section (F9c): herds, nests, dens,
   territories, empty zones, and the farm's pens — with its tool, published as the rest.
3. **The mind** (shared `animals/mind.ts`, the pets' `choose()` made lighter): food, water, rest, safety, company;
   graze, browse, drink, wander, sleep, flee, stalk, hunt, fight, guard the young, shelter; groups steering as one
   (a herd's lead, a flock's turn, a pack's ring); the hour (dawn birds, dusk deer, night owl and raccoon), the
   weather (shelter in a blizzard, off the frozen pond), the seasons' snow layer. Predator and prey among them.
4. **The server** (`features/animals.ts`, F4b): every animal near players live, asleep or stepped coarsely when no one
   is; walking the land's height (as the pets), birds' flight paths, swimmers on the water; the wire — an `animals`
   map, its fields packed, within Colyseus' 64 fields and its 255-byte strings (colyseus-64-fields,
   colyseus-255-byte-strings); reactions to players (a runner, a car, a shot, a torch), to each other, to pets.
   Budgets: tick time with 300 animals across the map, 60 near one player; the wire's bytes.
5. **The client's tiny life**: songbird flocks in the trees and on the wires (rise when startled), fish shoals under
   the surface and jumping, butterflies and fireflies by season, hour and snow — instanced, seeded, no server.
6. **Danger by territory** (F5c): the wolves' pass, the bear's woods, the lynx's ridge, the boar when cornered;
   warning first (a growl, a stare, a bluff charge), then the strike (plan 30's `hurt`); bolder at night; the torch
   and a fire keep them off; packs ring and close; you can back away.
7. **Hunting** (F6c): hits on the guns' rays and the knife (plans 79–84, 116, 119), hit reactions, flight, a fall
   (ragdoll on Jolt or a clip), the body left a while then gone; skinning it (an act): `meat` and `hide_<kind>`
   items (shared `inventory.ts` STACKS **and** the API's `Survivor::STACKS` — api-item-whitelist; `features/held.ts`'s
   sweep — held-sweep-clears-unknown); cooking at a fire (raw → cooked: health and warmth; raw eaten: sick, warmth
   and stamina down a while).
8. **Hides into clothes**: a craft at a workbench or the fire — a fur coat, hat, gloves, boots (wardrobe items on
   the plan 60 recipes) that slow the cold (`chillOf`).
9. **Close up** (F7c): sneaking (slow and quiet lets you near, the wind's side for smell), feeding (bread, a nut, an
   apple, seed, a carrot: new items), trust built over days (kept by the API per player per animal); befriended →
   a pet (`shared/pets.ts` SPECIES grows by every server species; the young grow up over days); its model drawn by
   the new path (the pets' `pets3d.ts` models stay for the six of today). A wolf or a bear as a pet: how it walks
   in town, frightens NPCs, never hurts its owner.
10. **Pets and the wild** (F8a): chases, barks, stalks; a lost pet among the wolves (the "wild" death made real,
    the pets' `wildAt`).
11. **The farm** (F1c): the farmland's barn, pens, a coop, a trough, a field (God mode places it, a default one
    made); chickens, cows, sheep, pigs, horses living their day (out by day, in at night); feeding, eggs and milk
    collected (items); **riding a horse** — get on/off (plan 100's act's way), walk/trot/canter/gallop, jumps, on
    Jolt as the bikes are (plan 101's controller as the start), the camera, the rider's pose, falls.
12. **Town animals**: pigeons in the square (scatter, come for crumbs), the stray cat (befriendable), the raccoon at
    the bins at night.
13. **Snow and breath** (F10a): prints by gait and size that fade (a trail to the animal), breath in the cold, snow
    shaken off, a swimmer's ripple, a bird's splash.
14. **Sound** (F11b): calls by species, mood and hour (CC0 / CC-BY, credited), steps by size and ground, wings,
    splashes, the farm, the horse; plan 65's birds become the real birds'. Picked by me; changed after the user's
    test.
15. **Checks**: unit (species, habitat, mind, items, trust), world-server (a herd's day; a flock startled; wolves
    in their pass; a shot, skinning, cooking; feeding to trust; a pup to a pet; a pet's chase; a ride), API (items,
    trust, pets of new species), e2e (see a deer, startle a flock, feed the ducks, the wolves' pass, hunt and cook,
    a coat from hides, ride a horse, befriend a fox), perf (Low on an M1 with 60 near + flocks: frame and heap;
    memcheck nightly gains a walk in the woods), stills.

## Built (2026-11-25)

Sources: Google Drive refused the Quaternius packs (its download quota), so the same CC0 models came from Poly Pizza
(27 GLBs, approved), plus OpenGameArt's Animal Pack Vol.2; Sherkiz' rabbit and hawk are CC-BY 3.0 (credited). All in
`yutopia-art-src/polypizza`, `yutopia-art-src/oga` (outside the repo).

- **0 · the sheet** (shared `animals/species.ts`): 30 species (8 birds, 7 small, 7 big, 5 farm, + young of each) with
  habitat, numbers, hours, senses, flee/charge distances, prey, danger by territory (wolf, bear, lynx; moose and boar
  when crowded), meat and hide, food from the hand, befriending (grown, or young for the big and dangerous), the
  farm's gives, prints, sounds; `activeAt`, `dangerAt`, `FEED_CRATES`. Tests `animals/animals.test.ts` (12).
- **2 · where they live** (`animals/habitat.ts`): `habitatAt` (water, shore, town, farm, forest, deep woods, field,
  alpine by height, the grown biomes), seeded groups per 192 m cell (`landGroups`, `SPAWN_SCALE` 0.4), God mode's
  `animals` section (`AnimalPlaceDef`: herd, den, nest, empty, pen; `FARM_PENS` — paddock, pasture, sty, coop —
  changed or removed by key), `checkAnimalPlace` (godmode.ts checks a draft's before publishing).
- **3 · the mind** (`animals/mind.ts`): needs (hunger, tired, fear), `think()` — danger by territory (warn, charge,
  attack; a torch or fire keeps them off; friends safe; young never), fear (`fleeAt`: runners twice as far, a crouched
  sneak half, a shot 60 m), defenders turning at bay, food held out (approach, eat), friends followed, predators
  stalking and chasing prey, shelter in storms, sleep by the hour, packs following their lead, grazing and wandering
  round home or in the pen; trust (`fed`: a step a day, `trustDays` to a friend). `animals/body.ts`: a capsule for shots.
- **4 · the server** (`features/animals.ts`): cells round everyone outdoors (made 4 ms a tick, nearest first — a whole
  ring at once was ~300 ms), let go 3 min after; minds every ~0.9 s near people (twice as slow away), steps every tick
  within 120 m; walking the land (walkable, not up cliffs), swimming, flying and perching; `Animal` schema (StateView:
  each client the ones within 160 m); strikes on people (`survival.hurt`, `animal:strike`) and on prey; shots
  (`arms.ts` → `room.animals.shoot`, after the shadowed); `animal:act` feed / skin / collect / mount / dismount /
  stroke / name; `animal:take` from a crate; trust kept by the API in 30 s batches (`/internal/animal-trust`, table
  `animal_trust`; befriended ones given back their friend and name when made again).
- **5 · tiny life** (client `animals/tiny.ts`): butterflies (warm days, open ground), fireflies (warm nights, woods'
  edge and water), fish shoals with a leaper, far V-flocks by day — seeded by place and the wall clock.
- **6–7 · danger and hunting**: as above; meat, hides (`hide_fur/pelt/leather/wool/feathers`), eggs, milk, food
  (`bread, seed, nut, apple, carrot`) in `STACKS` and the API's `Survivor::STACKS`, their case sizes, icons, names;
  eating (`EATEN`: cooked +25 health +20 warmth; raw −8/−12, sick), cooking by a lit fire (`dark:cook`).
- **8 · warm clothes**: `CRAFTS` at the barn's workbench or any built one (`dark:craft`): fur coat, hat, gloves,
  boots; carried, they keep the cold off (`coldKept`: the coat halves it).
- **9 · close up**: feeding from the left hand (crates by the barn's doors and outside the market), trust a day at a
  time, a friend follows you, can be named, stroked, ridden (a horse). **Not done:** a befriended animal isn't yet a
  pet record with the pets' panel and wheel — it's the animals' own follower.
- **10 · pets and the wild**: dogs chase squirrels, hares, deer, ducks…; cats stalk birds; a lost pet near wolves, a
  bear or a lynx can be "gone" (online only).
- **11 · the farm**: the pens' animals (horses, cows, sheep, pigs, chickens and their young), eggs/milk/wool once a
  day, horses ridden — the walker takes the horse's gaits, the rider drawn sat up on its back (`riderSeat`).
- **12 · town**: pigeons (town habitat), the stray cat, the raccoon at night.
- **13 · snow**: tracks through the footprints system.
- **God mode**: the Animals tool (J): herd, den, nest, keep empty; species, count, young, radius; rings drawn;
  click to place or pick, Delete to remove.
- **Checks**: shared 908 pass; world-server `animals.test.ts` (5: deer bolts, hare shot and skinned, duck fed, wolves
  strike, farm ride and egg) + pets/pets-lost pass; client typecheck clean, unit 485 pass (1 red: another session's
  untracked lamp HUD colours). API `AnimalTrustTest.php` + NpcBonds + Survivor pass (11, run in the container on
  the user's go-ahead; its sqlite in memory, the dev DB's users untouched); `animal_trust` migrated on the dev DB.
- **1 · the models** (an agent, `tools/art/animals/build_animals.py` + `species.py`, README there): 31 GLBs in
  `public/life/animals` (~17 MB; 4k–12k tris, smooth, COLOR_0 painted, meshopt, nose +X, metres); the pack's voxel pig,
  sheep, cat, chicken replaced by morphs (pig/boar/sheep from the cow, cat from the fox, chicken/chick from the hawk);
  stills `design/screens/animals/`. Weak: moose (antlers a blob), pig/boar (cow-bodied, no snout or tusks), goose,
  cat/squirrel faces (fox's), bat (cartoon); no separate young models (the adult scaled, the head bigger), no far LODs.
- **14 · sounds**: 142 clips (2.1 MB) in `public/sfx/animals` + `index.json`, from 136 CC0 Freesound recordings
  (`tools/sfx-animals.mjs`/`.json`: the four most downloaded a sound, the cleanest three kept — picked by measure, not
  by ear), credited in `sfx/CREDITS.md`; Sherkiz' two CC-BY works in a new Animals group (`tools/credits.py`,
  Credits page).
- **In the game** (e2e `animals.spec.ts` on the dev world, passes): 67 animals round the farm, the pens fenced, a cow fed
  a carrot from the hand (50% trust), Ana riding the white horse sat up on it, ducks on the pond, crows and songbirds in
  the woods. Page budget 504.6 of 505 KB. Teleports no longer read as a sprint to the animals.

### Double-checked (2026-11-25)

Two fresh reviews of the diff (server + shared + API; client), every fix verified by the checks after. Fixed:

- **Client (15):** each clone's skeleton bone texture freed on removal (a GPU leak an animal); loop/once set on every
  clip switch and a playing clip no longer restarted by a fallback; the loader's own materials disposed; prints at
  the land's height (they lay at y 0 on hills) and forgotten with the animal; fences and crates freed when rebuilt,
  merged into a few draws, crates following the land's height; **the ridden horse drawn under where its rider is drawn**
  (it trailed metres behind at a gallop) and the rider's seat set by the sitter's own 0.357 m (she floated 0.3 m up);
  only swimmers float, the rest wade on the bed; Feed read the left hand from the walker (`walker.inHand()`, the
  dark's `handId()`) — the pockets' message came before this chunk; toasts' item names (`dark_item_*`); a body remade
  when it grows up or changes look; tiny life without per-frame allocations (and butterflies' heading un-mirrored);
  the God tool's ghost ring rebuilt only when it moves, its pick redrawn, its materials freed; the same sound not
  stacked within 150 ms (a flock bolting).
- **Server / shared (17):** a ridden horse and a befriended animal near its friend kept when their cell is let go or
  the edits publish (`strays`, adopted back by a remade cell; let go after 3 min apart); a farm horse let go outside
  its pen walks back in; eggs/milk/wool once a day kept by id (a remade cell had reset it); feed/stroke refused on a
  ridden horse (anyone could end another's ride); skinning refused with a full pack (the loot was lost); strikes only
  on the land's floor; a downed rider let go; trust ids the API refuses not queued, 4xx not retried (one bad row
  blocked everyone's saves); trust from before the API answered kept; `gone` pruned; **a second feed the same day adds
  nothing** (crate food without limit made any animal — a bear cub — a friend within a day); `checkAnimalPlace`
  hardened (prototype keys, null keeps, key charset/length, whole numbers); `craft()` restores the pack when the result
  doesn't fit (the hides were lost); the barn's workbench at z −311 (it checked +311); cooking in place (meat in the
  hand or a full case was lost); an animal in front of a car takes the round; a dead predator doesn't kill lost pets.
- **Tests:** offline rooms (the tests') make no land wildlife — only what's placed and the farm's — so animals can't
  wander into other tests' shots; `animals.test.ts` heals its people first (the offline store kept one down) and turns
  the dark peaceful for the wolves (at 23:00 the shadowed downed her first, and wolves leave the downed alone); waits
  long enough for a duck to swim over. Four clean runs in a row; e2e passes, the horse under its rider.
- **Left:** the rider sits as on a chair (no straddle pose); a ridden horse's prompt still offers Feed; animal meshes
  aren't frustum-culled (measure on Low); prints use the shared stride; young never grow up (they come back young);
  fires aren't seen by the animals (only torches keep predators off); befriended animals aren't pet records yet.

## Nerfed (2026-11-25, the user's test: "too hostile, too much damage, too fast")

- **Slower:** each predator comes at a person at its `danger.chase`, under a runner's 7 m/s (wolf 5.8, lynx 6.2, bear 5.4, boar 5.2, moose 5; a defender with no danger 5). Running away saves you; walking doesn't. Their own runs after prey are lower too (wolf 15→11, lynx 13→10, bear 11→9, boar 11→8, moose 10→8).
- **Less damage:** bites go wolf 16→7, lynx 14→7, bear 34→16, moose 30→14, boar 18→8, and come further apart (2.2–3 s). A defender with no danger bites for hp/25. Only one bite lands on a person every 1.2 s, whatever's at them (`BITE_GAP`), and after each bite the animal backs off 6 m.
- **Less hostile:**
  - Territories are smaller (wolf 220→90 m, bear 180→60, lynx 120→40).
  - Warn and charge distances are about halved, and night makes them bolder by less.
  - There are fewer predator groups (wolf density 0.35→0.2, bear 0.2→0.12, lynx 0.3→0.2).
  - Each predator warns for `WARN_S` = 2.5 s before it charges, unless you're right on top of it.
- **Bug fixed:** a charging animal's last steps closed the gap by less each time, so one slightly off its heading could stand at 1.2 m forever without biting. The stop check now allows 0.15 m.
- **The duck test (fixed):** the duck was fine. The dark's day nests downed the player on the pond bank (off the paths) in about 18 s even at noon, and nothing comes to someone who's down, so the duck lost sight of her about 3 m out. The test now turns the dark off, as the wolf test does. Three clean runs of all 5 followed.

## Zero animals on the map (2026-11-25, the user's walk)

The user walked the map and met no animals at all; they had to place a den in God mode. The land's generator (`landGroups`) used the sheet's real per-km² densities times `SPAWN_SCALE` 0.4, which gave about 0.36 groups per 192 m square around the campus. 108 of 143 squares were empty, the rest mostly squirrels, songbirds and bats, and there was one deer in 5 km².

- `SPAWN_SCALE` went from 0.4 to 1.6.
- The big game's densities went up: deer 3→8, elk 0.8→2, moose 0.5→1, boar 1.5→3, fox 1.2→3, hare 12→16, raccoon 3→4.
- The predators keep their nerfed densities; the overall scale still makes them about four times as common as at 0.4.

**Measured on the live dev land** (core, long road, Silver Lake; one square in nine sampled): about 2.7 groups per walkable square, with 4 of 33 empty. That's about 150 animals in the 25 squares the server keeps round a player.

**Not measured yet:** the server's tick with that many animals.

Squares with no walkable ground make nothing: off the drawn land, the deep water, the alpine cliffs. That's correct.
