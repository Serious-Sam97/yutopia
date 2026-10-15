# Fita 12 — Pets (plan — delivered 2026-10-15, see PROGRESS)

Ask (2026-10-15, PT): "Todos os pets inclusive ornitorrinco. 1 brincar com
acessórios · 2 batalhar com outros pets · 3 ensinar truques · 4 experiência para
o pet ficar mais forte com status · 5 alimentar e dar água, senão ele morre, ele
pode dormir etc. · 6 customizar o pet, adicionar roupa · 7 dar comandos ao pet ·
8 emitir sons · 9 itens para pet como cama etc."

## Shape of it
- A **pet belongs to a person**, not to a space (`yutopia_pets` in Yondra, up to
  3 per person). It walks in with its owner and leaves with them; while the
  owner is away it lives on in the record (needs keep dropping, slowly).
- **Six species**, all the same engine with a species profile: dog, cat, rabbit,
  platypus, capybara, parrot. Each has its own stats growth, sound, signature
  trick and battle special (the platypus has venom — the real one does).
- Everything is **server-owned** (`apps/world-server/src/features/pets.ts`, one
  `Pet` schema per pet in `state.pets`): the AI (follow / stay / roam / sleep /
  eat / drink / play / lesson / battle), needs, XP, tricks, battles. Clients
  only ask and draw. Rules live in `packages/shared/src/pets.ts` (unit-tested)
  so the panel shows exactly what the server will do.
- **Art is code** like everything else: `apps/client/src/world/art/pets.ts`
  draws every species in 5 views × poses (stand, walk ×2, sit, sleep, jump)
  with its look (colour + marking) and outfit (hat, collar, coat) — a lazy
  chunk (`yutopia-pets`, own budget line). Iso draws the textures; the 3D view
  draws the same SVG on its billboard, like Vortex.

## The nine asks, mapped
| # | Ask | What ships |
| --- | --- | --- |
| 1 | play with accessories | Toys: ball (fetch), frisbee (long fetch), rope (tug), feather (wiggle), laser (dart). Pet menu → Play…; each is a scripted run with the toy drawn; fun + XP, energy − |
| 2 | battle other pets | Challenge another person's pet (they accept in a prompt). Turn-based: both owners pick attack / special / defend / rest, resolved on the server each round (speed order, power vs defence, specials by species). HP from heart. Winner XP 60, loser 25; nobody dies |
| 3 | teach tricks | 8 shared tricks + 1 signature per species. Lessons (6 s each) add progress by wit; learned at 100. "Do a trick" once learned, anywhere |
| 4 | XP and stats | XP from everything; level = f(xp); power / speed / wit / heart = species base + growth × level |
| 5 | food, water, death, sleep | Needs food / water / energy / fun / health, 0..100, real-time decay (¼ speed while the owner is away). Food or water at 0 drains health; health 0 → the pet dies (a memorial in the panel, "say goodbye"). Snack / give water by hand (cooldown), or bowls it eats and drinks from alone. It sleeps when tired (in its bed if there is one) |
| 6 | customise, clothes | Name, colour, marking; hat / collar / coat with colours. Pet panel → Outfit, with a live preview |
| 7 | commands | Come, stay, follow me, roam free, go to sleep, speak, do <trick>. Obeys when it's happy enough, else it may ignore you (toast) |
| 8 | sounds | Synthesised per species (bark, meow, thump, growl, squeak, squawk) in moods (call / happy / sad / angry); a bubble with the onomatopoeia (EN/PT). On speak, greeting, hunger, play, tricks, battles |
| 9 | pet items | Pet bed (it sleeps there), food bowl and water bowl (fill them; portions), scratching post, pet house — in build mode → Pets |

## Rules (shared/pets.ts)
- Needs per hour online: food −4, water −6, fun −5, energy −8 awake / +25 asleep;
  health −4 per need at 0, +3 while food and water are above 30. Offline ×0.25.
- Snack +25 food (10 min cooldown), give water +40 (5 min), a bowl portion +35.
  Petting +10 fun. Play +30 fun (favourite toy ×2), −12 energy. Trick +10 fun.
- XP: play 12, trick done 8, trick learned 40, feed 4, water 3, command 2, pet 3,
  battle win 60 / loss 25. `levelFor(xp)` (cap 30).
- A pet needs food ≥ 20 and energy ≥ 20 for lessons, play and battles.

## Order
1. shared rules + tests → 2. server feature + schema + protocol + tests →
3. Yondra: migration, model, internal routes, Pest → 4. client: art, textures,
iso + 3D drawing, controller sync, menus, panel, dock, sounds, catalog items,
i18n → 5. docs, checks (lint, types, tests, budget), browser verification.

## Delivered (2026-10-15)
Everything above, as planned, with these calls made on the way:
- Pets are drawn from one parametrised drawer (body, head, ears, muzzle, tail, legs per species) rather than six hand-made sets — every new option stays code.
- The page budget had no room: the drawings, the act animations, the sounds and all the pets' interface strings live in the lazy `yutopia-pets` chunk (`addStrings` in `lib/i18n.ts`); the budget line is 540 KB now (it was already over before pets).
- Anyone near may pet a pet; only its owner feeds, waters, plays, teaches and commands it.
- A re-joined owner (another tab, a reconnect) takes their pets over from the old session instead of losing them.

