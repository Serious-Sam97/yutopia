# 85 — Weapons in the pockets, out of sight

Ask (2026-11-14, the user, after plans 80–84): today a weapon can only be in the quick slots (keys 1–4), never in
the inventory's pockets. Let a weapon go in the pockets too — and with a detail: the weapons that show on her back
(and the revolver on her hip) and the ammunition on her body (the pouches, the carrier) show only while the weapon
is in a quick slot; one only in the pockets doesn't show at all. So a survivor can carry a weapon she hasn't
equipped and look clean.

Status: **planned 2026-11-14; forks decided by the user 2026-11-14, all as recommended**: **F1a** picked up into a
free quick slot, else a free pocket; **F3a** the weapon in her hand moved to a pocket is put away at once; **F4a** the
pockets named "Mochila" / "Pack" (the label only); **F5a** equipped by a drag or an Equip button; **F2a** (one of a
kind across quick slots and pockets) as recommended, not asked. **Phase 1 (the rules) built 2026-11-14**,
committed c81d8ec3. **Phase 2 (the server, the save) built 2026-11-14**, committed 2c684b06. **Phase 3 (the panel) built 2026-11-14**,
committed 7b56cda7. **Phase 4 (the checks) built 2026-11-14**, committed — **plan 85 done**.

## What there is now

- **The rules** (`packages/shared/src/inventory.ts`): `Inventory` is `quick` (4 — a weapon or a stack) and `pockets`
  (6 — stacks only: `(Stack | null)[]`). One weapon of a kind (`hasWeapon` — over the quick slots). `moveSlot`
  refuses a weapon anywhere but a quick slot; `addItemTo` takes a weapon only into an empty quick slot;
  `addWeapon` (a pick-up, a search, `mod:give`) puts it in a free quick slot — none free, or one of its kind
  already carried, its rounds go to the pockets and the weapon stays on the snow; `cleanInventory` drops anything
  but stacks from the pockets. `weaponIn` / `hasWeapon` look in the quick slots only.
- **The server** (`apps/world-server/src/features/survival.ts`, `arms.ts`): `dark:move` → `moveSlot`; `dark:take`
  (from the snow into a slot) lets a weapon only into an empty quick slot; the kit and the lockers ask
  `hasWeapon` (a revolver if she has none, the AK's odds); every 0.5 s `arms.ts` takes the weapon out of her
  hand if it isn't in a quick slot any more, and sets what she wears for everyone to see from `weaponIn`:
  `Player.holster` (the revolver), `sling` (double-barrel), `slingAk`, `slingSn`, `slingDb`.
- **The save** (`apps/api` `DarkController::saveSurvivor`): the pockets validated as stacks only (`stack()`), the
  quick slots one weapon of a kind.
- **What shows on her** (`apps/client/src/world/tp/person3d.ts`), all from those flags (or the gun in her hand):
  the revolver's holster on her right hip with the speedloader's pouch (`holster`); the double-barrel on her back
  (`sling`) and the shell carrier at her right hip; the AK on her back (`slingAk`) and its magazine pouch at her
  left hip; the sniper on her back (`slingSn`, its cartridge sleeve on the stock); the Daybreak upright down her
  back (`slingDb`) and the cell pouch at her belt's left front. The ammunition itself (in the pockets) never shows.
- **The inventory panel** (`apps/client/src/world/dark/inventory.ts`): the quick slots draw a weapon (its
  loaded/mag, the spare rounds, "in hand"); the pockets draw stacks only; the details offer Hold / Put away /
  Reload / Drop for a weapon (by its key); the text says "a weapon only into a quick slot". Labels
  (`dark/strings.ts`): "Pockets" / "Bolsos", "4 quick slots · 6 pockets".

**So the detail comes almost free**: everything worn is set from the quick slots already — once a weapon can sit in
a pocket, it shows nowhere. The work is letting it in, everywhere the rule lives, and keeping "carried" and
"equipped" apart.

## Forks

| # | Question | Options | Recommended |
|---|---|---|---|
| F1 | A weapon picked up (the snow, a search, a locker, given) | **a)** into a free quick slot as now — none free, into a free pocket — none free either, its rounds to the pockets and it stays on the snow · **b)** always into a pocket first (she equips it herself) | **a** |
| F2 | One of a kind | **a)** still one of each kind, quick slots and pockets together (a second one's rounds go to the pockets) · **b)** a spare of the same kind allowed in the pockets | **a** |
| F3 | The weapon in her hand moved to a pocket | **a)** put away at once — her hands drop, it's gone from her (it isn't worn) · **b)** refused while it's in her hand (put it away first) | **a** |
| F4 | The pockets' name, now that a rifle fits in one | **a)** "Mochila" / "Pack" — the label only, nothing more on her · **b)** keep "Bolsos" / "Pockets" | **a** |
| F5 | Equipping one from the pockets | **a)** drag it to a quick slot, and an **Equip** button in its details (into the first empty quick slot; none empty, it says so) · **b)** drag only | **a** |

## Phases

1. **The rules** (`shared/inventory.ts`): `pockets: (Item | null)[]`; `carries(inv, id)` (anywhere — one of a kind,
   the kit, the lockers) apart from `weaponIn(inv, id)` (a quick slot — equipped: in her hand, worn); `moveSlot`
   and `addItemTo` let a weapon into a pocket; `addWeapon` per F1–F2; `cleanInventory` keeps a weapon in a pocket
   (one of a kind across both); `addStack` / `takeStack` / `count` skip a weapon in a pocket. Unit tests
   (`inventory.test.ts`): into a pocket and back, swaps both ways, one of a kind across both, a pick-up per F1, a
   save with a weapon in a pocket cleaned right.
   Done in phase 1:
   - `Inventory.pockets` is `(Item | null)[]`; `hasWeapon` is gone — **`carries(inv, id)`** (anywhere: one of a
     kind, the kit, the lockers) and **`weaponIn(inv, id)`** (a quick slot: equipped — her hand, what she wears);
     `freeQuick(inv)` (the first empty quick slot, for F5's Equip).
   - `addWeapon` (F1a): a free quick slot, else a free pocket, else its rounds; `moveSlot` swaps a weapon into and
     out of a pocket; `addItemTo` takes a weapon into an empty chosen pocket; `cleanInventory` keeps a weapon in a
     pocket, one of a kind across both. Stacks never land on, nor are counted from, a weapon in a pocket.
   - Tests (`inventory.test.ts`): into a pocket and back (not equipped, still carried), swaps with stacks and
     weapons both ways, a chosen pocket, a pick-up with the quick slots full, one of a kind across both, a save with
     weapons in the pockets cleaned; all 660 of shared's green.
   - The callers kept compiling: the server's kit and lockers by `carries`, `dark:take` into a pocket; the panel
     and the strip draw a weapon in a pocket (its rounds, the spare) — phase 3 does its details; "+1" only for a
     weapon not carried before (moved between the quick slots and the pack, it isn't new). The server's inventory
     test no longer says a weapon never goes in a pocket (phase 2's own test). `survival.test.ts`'s "an admin gives
     someone a gun" is red on HEAD too (the second person never seen in the first's room) — not this plan's.
2. **The server and the save**: `dark:take` into a pocket; the kit and the lockers by `carries`; `dark:move` of the
   weapon in her hand to a pocket per F3 — at once, not on the 0.5 s sweep — and what she wears set again then
   (the sweep stays the backstop); the API's `pockets()` takes a weapon (one of a kind across quick and pockets,
   loaded no more than it holds). Tests: world-server (`survival.test.ts`: a weapon to a pocket — not in her
   hand, not worn — and back — worn again; the kit not giving a second revolver; a save and a rejoin with it in a
   pocket) and the API's (`SurvivorTest`; [[api-tests-dev-db]]: its database checked first).
   Done in phase 2:
   - **What she holds and wears, at once** (`apps/world-server/src/worn.ts` `wear(p, inv)`): the gun out of her hand
     once it isn't in a quick slot, the revolver's holster, the four long guns' slings — from the quick slots
     alone; called by survival's `changed` on every change of what she carries (a drag, a drop, a take, a use, a
     search, a give), arms' half-second sweep kept as the backstop. So the weapon in her hand dragged to a pocket
     is put away with the move (F3a: the client puts it away over her shoulder and it's gone — its sling's gone
     too), off her hip or her back; dragged back, worn again.
   - **The admin's kit** (`mod:refill kit`) takes its guns' kinds out of the pack as it lays them in the quick
     slots (one of a kind).
   - **The save**: the API's `DarkController` takes a gun in a pocket — one of a kind across the quick slots and
     the pockets, loaded no more than it holds (`item()`, shared by both).
   - Tests: `survival.test.ts` — the revolver in her hand dragged to a pocket, put away and off her hip within
     150 ms of the move; the double-barrel swapped with a pocket's battery, off her back; an empty quick slot's
     key draws nothing; back to a quick slot, on her hip, drawn; the kit again, one double-barrel. The API's
     `SurvivorTest` (in memory — the dev database's 4 users before and after): a gun in a pocket kept; a second
     revolver in a pocket, or one loaded past it, refused. `down.test.ts` green; in `arms.test.ts` the Daybreak's
     test is flaky with or without this (the ball sometimes doesn't put the shadow down: 288 ms after the burst
     when it does, 293 before), and `survival.test.ts`'s loot spot is flaky too; its admin-gives-a-gun red on HEAD.
3. **The panel**: a weapon drawn in a pocket (its icon, loaded/mag, the spare rounds); its details — loaded,
   spare, damage, range, "in the pack: equip it to hold it" — with Equip (F5) and Drop; the drag's text; the
   labels (F4); English and Portuguese.
   Done in phase 3:
   - The six pockets are **the pack** (F4a): the panel's title "PACK" / "MOCHILA", "4 quick slots · 6 in the
     pack" / "4 de acesso rápido · 6 na mochila", the section "Pack" / "Mochila", "Your pack is full" / "Sua mochila
     está cheia", the strip's word; a weapon in the pack drawn as in a quick slot (its loaded/mag, its spare rounds),
     without a key.
   - **Its details**: loaded, spare, damage, range, and in amber "In the pack · equip it to hold it" / "Na mochila ·
     equipe para segurar"; **Equip** / **Equipar** (F5a — E, the pad's A, or the button: into the first empty
     quick slot); none empty, the button's off and the note says "The quick slots are full · drag it onto one to
     swap" / "Atalhos cheios · arraste sobre um para trocar"; Drop. Its spare's label "Spare .38 rounds" /
     "… de reserva" (counted from the quick slots too).
4. **Checks**: `e2e/inventory.spec.ts` — a weapon dragged to a pocket: out of her hand, gone from her back and
   its pouch gone, on her screen and another's; dragged back: on her back again; equipped by the button; a save
   and a rejoin with it in a pocket. All the guns' specs and the inventory's green.

   Done in phase 4:
   - **`e2e/inventory-pack.spec.ts`** (Bia beside Ana): a revolver and a double-barrel given her — worn: her
     holster, the double-barrel slung and its shell carrier, on both screens; the revolver drawn; her inventory
     open ("PACK"): the revolver in her hand dragged to the pack — put away, off her hip, on both screens; the
     double-barrel dragged to the pack — off her back, its carrier gone; the revolver picked in the pack — "in the
     pack", Equip; E — into the first empty quick slot (the pockets' rounds swapped up into the ones the guns left),
     on her hip again; gone and back — the double-barrel still in her pack, still worn nowhere.
   - **The two-of-us specs** (`revolver-`, `shotgun-`, `ak-`, `sniper-`, `daybreak-`, `guns-two`) empty Bia's pack
     too before arming her: a weapon left in it is still hers — one of a kind, a given one wouldn't go in (after
     `inventory-pack`, `shotgun-two` failed so).
   - Green: `inventory`, `inventory-pack`, `arms-empty`, `guns-two`, the five guns' two-of-us specs, `daybreak`
     (`drops` is a review shot: skipped without `YUTOPIA_SHOTS`).

## Risks

- **Every place that asked "has she got one"** now means one of two things: a pass over every `hasWeapon` /
  `weaponIn` to choose (the quick slots: the hand, what's worn; anywhere: one of a kind, the kit, the lockers).
- **Old saves**: none have a weapon in a pocket, so nothing to migrate; a save made after this read by an older
  world-server would drop the weapon — the API and the world-server ship together.
- **The ammunition's slots**: a weapon in a pocket takes a pocket a stack would have — six pockets fill faster.
