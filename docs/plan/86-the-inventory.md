# 86 — The inventory, rethought

Ask (2026-11-14, the user, after plan 85): improve the inventory — its mechanics, its usability, and its look ("it's
too ugly today"). Investigate first, then propose.

Status: **investigated and proposed 2026-11-14; forks decided by the user 2026-11-14**: **F1a** three directions
mocked first, then chosen; **F2a** the items' pictures rendered from their own 3D models; **F3b** the rounds stay in
the pack, the pack bigger; **F4a** 8 pockets. The rest of the proposal (the menu, hover + 1–4, split, organize, take
all, quick use, no strip) as recommended, not asked. **Phase 0 (the mocks) rendered 2026-11-14 — the user chose
B · the open pack** (a canvas pack drawn open, stitched pouches, the four at hand as loops on a wooden belt, the
picked one on a paper tag); committed a42710b7. **Phase 1 (the pictures) built 2026-11-14**, committed 186148c9. **Phase 2 (the rules: 8 pockets, split, organize, take all, drop some) built 2026-11-14**, committed 3ea7bc60. **Phase 3 (the panel in look B) built 2026-11-14**, committed 2ee8b279. **Phase 4 (the HUD) built 2026-11-14**. Stills of today:
`design/inventory/now-panel.png`, `now-strip.png`, `now-strip-over-dock.png`.

## What there is now

Three pieces show what she carries (`apps/client/src/world/dark/`):
- **The quick bar** (`index.ts` `quickHud`, `.dk-q`): the four quick slots bottom right, always there — reskinned
  by plan 45 (the HUD's look: ink in a walnut frame, the one in hand ringed in the lamp).
- **The strip** (`index.ts` `render`, `.dk-slot`): all ten slots in a row — up while Tab is held, and for 3 s after
  any change (a pick-up, a give, a drag). Plan 30's grey glass squares, never reskinned.
- **The panel** (`inventory.ts`, I): plan 30's dark card — You (the vitals), Quick · 1–4 and the pack (plan 85),
  Picked (the details and buttons), On the ground; drag to move, right click drops, E uses/equips, the pad's d-pad.

The rules (`packages/shared/src/inventory.ts`): 4 quick slots + 6 pockets (the pack); stacks with small caps
(.38 24, shells 12, 7.62 60, .308 15, cells 3, flares 3, batteries 2, first aid 2, fuses 4); a weapon one of a kind;
the pages kept (plan 30's notes) — but nothing finds or shows them.

### What's wrong

Mechanics
1. **Ten slots hold everything.** Five kinds of rounds and four of things to use — and since plan 85 the weapons
   in the pack — share them: armed with all five guns, the rounds alone fill the pack; a cell stack is 3.
2. **No hand tools for stacks**: no split, no "take all" from the ground, no organize. A second gun of a kind
   silently becomes its rounds (a toast says so, the panel doesn't).
3. **Dropping is too easy**: a right click drops at once — a gun too, all of a stack.
4. **To use a first aid, a battery or a flare** it has to sit in a quick slot (keys 1–4, shared with the guns) or
   the panel be open.
5. **The pages** are saved with her but there's no way to see them.

Usability
6. **Three views of one thing**, and the strip pops up after every change — over the dock in the last still, and
   showing the pack, which plan 85 means to be out of sight.
7. **Putting something in a quick slot** is a drag, or Equip into the first empty one; no "hover it, press 3".
8. **The panel's reading order**: the details are a column away from the item; a long footer of key hints; dashed
   empty slots read as broken; small targets; on a phone a drag is the only way to move.

Look
9. **Not the HUD's look**: plan 30's generic dark card (system sans, white, amber) beside plan 45's ink panels in
   walnut frames, Cormorant caps, Special Elite labels and the one warm lamp — the quick bar has it, the panel and
   the strip don't.
10. **Clip-art items**: plan 30's flat SVG drawings next to the life-look world (plans 73–84: real guns, real
    rounds, the Daybreak's cell).
11. **Space**: half the panel is empty; the You column repeats the vitals the HUD already shows.

## References

- **Resident Evil 4 (2023)**: the attaché case — a grid, items their own size, rotate, *Organize*; quick slots on
  the d-pad / 1–8; separate tabs for key items and files; a picked item large and turnable. Upgraded cases.
- **Alan Wake 2**: a small grid of stacked items, the weapons apart (their own slots); a heal on the d-pad; the
  Shoebox stash in the break rooms for the rest; dark ink UI, items as photographed things.
- **The Last of Us Part II**: holsters (the guns at hand) vs the backpack (the rest, slower to swap); ammo counted
  per gun, capped per kind, not taking backpack room.

Ours already has TLOU's split (quick slots = holsters, the pack = the backpack — plan 85) and AW2's ink; the rounds
are what crowd it.

## Proposal

**One inventory, three parts**, all in the HUD's look:
- **The quick bar** (HUD, framed): the four equipped — the held gun's rounds and spare beside it (today the separate
  cylinder widget).
- **The pack** (I): an ink panel in a walnut frame; the items as pictures of the things themselves; the picked one
  large with a typed card under it; the ground in reach below.
- **No strip**: a pick-up shows as a typed slip ("+6 shells · pack"), the way the HUD's notices are.

Mechanics (F3b, F4a; the rest recommended, not asked):
- **A bigger pack**: 8 pockets (was 6) — the rounds stay in it (F3b: a belt of pouches, each kind its own and not
  taking pack room, was the other way), so 12 slots in all with the quick bar.
- **A right click opens a small menu** — Use · Equip to 1–4 · Split · Drop · Drop all — instead of dropping; a
  drag off the panel drops.
- **Hover an item and press 1–4**: it goes to that quick slot (swapped). Shift-click moves between the pack and
  the quick bar; a double click uses or equips.
- **Split** (Shift-drag, or the menu), **Organize** (a button: weapons first, then by kind), **Take all** from the
  ground.
- **Quick use** without a quick slot: H a first aid, B a battery (G throws a flare already — `dark/arms.ts`; F is the
  torch; the pad: hold ↓ for the aid — today's).

Not now: a stash (AW2's Shoebox — the lockers are close to it: its own plan), the notes/pages reader (nothing finds
pages yet), crafting, weight, item shapes (RE's Tetris).

## Forks

| # | Question | Options | Recommended |
|---|---|---|---|
| F1 | The look | **a)** mock three directions first and choose — *the ledger* (the HUD's ink grid, items as pictures, a typed card), *the open pack* (a canvas pack drawn open, the items laid in it), *the case file* (AW2-like: items as photographs with typed captions) · **b)** straight to the ledger | **a** |
| F2 | The items' pictures | **a)** rendered from their own 3D models (the life-look guns, rounds, cell…), lamp-lit · **b)** ink drawings · **c)** today's drawings, reskinned | **a** |
| F3 | The rounds | **a)** on her belt, a pouch per kind, not in the pack · **b)** in the pack as now, the pack bigger · **c)** as now | **a** |
| F4 | The pack's size | **a)** 8 · **b)** 12 · **c)** 6, growing with bigger packs found · **d)** 6 | **a** |

## Phases

0. **Mocks** (`design/inventory/mock/*.html` → stills): per F1 — the pack open with an item picked, its menu, the
   ground in reach, the quick bar and a pick-up slip, a phone. **Signed off first.**
   Done in phase 0 (2026-11-14), to be chosen:
   - **The items' pictures** (F2a, a first pass — phase 1 tunes them): `tools/art/items/render_items.py` (Blender:
     the guns from the game's GLBs; the .38 from the speedloader, the 7.62 from the AK's magazine, the cells from
     the Daybreak's; shells, .308 rounds, a flare, a battery, a first aid tin and a fuse modeled small), lamp-lit,
     transparent → `design/inventory/items/*.png`.
   - **The mocks** (`design/inventory/mock/inventory.html` `?d=ledger|pack|quiet`, `?s=hud|phone`), the same pack in
     each — the revolver in hand, the double-barrel, a first aid at hand; .38s, shells, the AK (picked: "in the
     pack", Equip), 7.62s, flares, a battery, fuses, one pocket free; the menu open on the shells (Equip to 1–4,
     Split, Drop 1, Drop all 6); two things on the snow and Take all:
     - **A · the ledger** (`0-a-ledger.png`): the HUD's own — an ink panel in a walnut frame, Cormorant caps, the
       grid of wells (at hand, a zigzag rule, the pack), the picked one large with its specs on a typed paper card,
       the lamp's Equip; the ground along the foot; the vitals a typed line in the header.
     - **B · the open pack** (`0-b-pack.png`): a canvas pack drawn open — stitched pouches, its name on a leather
       flap; the four at hand as loops on a wooden belt above; the picked one on a paper tag on a string.
     - **C · the quiet catalogue** (`0-c-quiet.png`): AW2's — no box, the world dimmed and blurred, the things laid out
       on it, the picked one large in the lamp's glow, its name big, a few typed lines; a Things · Notes tab.
     - **The HUD** (`0-hud.png`, any of them): the four at hand framed, the held gun's rounds in its caption
       (".38 · 4 + 18"), a pick-up as a typed slip above it ("+4 shells · in the pack").
     - **A phone** (`0-a-phone.png`, the ledger's): the grid four across, the picked one a sheet at the foot, the
       ground a line.
     - All three on one sheet: `0-sheet-looks.png`.
     - **B chosen**, then finished for it: the tag's string from a ring on the pack's corner to its hole; **B on a
       phone** (`0-b-phone.png`): the belt's four loops, the pack four across, the tag a sheet at the foot (Equip,
       Drop by a hold), the snow's things and Take all in a line.
1. **The pictures** (F2): each item rendered from its model to an image at build time (a script beside
   `tools/art/guns` — not in the browser: the readback hitch), dark-transparent, the size the panel needs; the
   things with no model yet (first aid, battery, fuse, flare, the rounds' boxes) modeled small.
   Done in phase 1:
   - `render_items.py --game`: the fourteen items rendered (the guns from the game's GLBs, the .38 from the
     speedloader, the 7.62 from the AK's magazine, the cells from the Daybreak's; shells, .308s, a flare, a battery,
     a first aid tin and a fuse modeled small), lamp-lit — a warm key, a cool rim, a dim warm room for the metal to
     show — to `apps/client/public/life/items/<id>.webp` with their alpha: a gun 600 × 250, the rest 256 × 256
     (twice the panel's and the tag's largest); **72 KB in all**, fetched by URL (not on the page's budget).
   - `dark/icons.ts`: `preloadArt()` (the dark's start) loads them once; `itemArt(id)` is the picture once it's in,
     else today's drawing (the fallback if one won't load); `artVersion()` keys the quick bar's and the panel's
     rebuilds so a picture in late shows. Every use swapped — the panel's slots, its picked one, the drag's ghost,
     the ground, the strip, the quick bar, the loot toast — the CSS's `svg` rules given an `img.art` twin.
   - Checked: `inventory.spec` and `inventory-pack.spec` green, the pictures in the panel, the ground, the quick bar
     and the strip; their drag helper waits for a slot's box (the panel rebuilt as a picture came in measured as
     none).
2. **The rules** (F4a and the hand tools): 8 pockets (`POCKETS` — the shared rules, the API's `Survivor::POCKETS`, a
   save of 6 read as 8), split, organize, take all, the menu's drop-some; the server, the API's save; tests.
   Done in phase 2:
   - **8 pockets**: shared `POCKETS = 8` (the quick slots' numbers follow: pockets 0–7, quick 8–11 — `QUICK_SLOT`),
     the API's `Survivor::POCKETS = 8` (a save of 6 read back padded to 8; nine refused); the panel's pack four a row
     (the pad's ↑/↓ by four); every hard-coded 6–9 moved to the shared constants — the server tests, the inventory
     and the five guns' two-player specs (their "empty her" loops over `POCKETS + QUICK`); the old shared tests that
     counted six.
   - **The hand tools** (shared `inventory.ts`): `takeSlot(inv, slot, n?)` — `n` of a stack out (all if as many or
     more), a weapon whole; `splitSlot(inv, from, to, n?)` — half (or `n`) into an empty slot or onto the same stack
     up to its cap, never a weapon; `organize(inv)` — the pack only: like stacks topped up into one another, then the
     weapons (the guns' order), their rounds (the same order), first aid, batteries, flares, fuses, empties last.
   - **The server** (`features/survival.ts`, `protocol.ts`): `dark:drop` takes an optional `n` (Drop 1);
     `dark:split`, `dark:organize`; `dark:takeAll` — every drop in reach on her floor, the nearest first, as many
     picks, one notice (like things told as one: "+5 shells").
   - Checked: shared 486 green (four new); `survival.test.ts` — the new test (split, Drop 1, the rest dropped, Take
     all, Organize) green, the supply locker's "what fits" moved for the eight (the flares now fit in the pack, not a
     quick slot), the rest green but the admin's give, red before this; the API's `SurvivorTest` 7 green (the dev DB
     untouched); `inventory.spec` and `inventory-pack.spec` green (their "empty her" loops given the slot count as an
     argument — the page can't see the spec's constant); the five guns' two-player specs and `guns-two` green (6, 6.4
     min). Red and not ours: `pets-attack.test.ts`'s two bites (no
     inventory on their path).
3. **The panel** rebuilt in the chosen look: one component; mouse, keyboard (hover + 1–4, Shift, double click, the
   menu), the pad (the grid, A, X held to drop, Y the menu), the phone (tap, tap a slot to move).
   Done in phase 3:
   - **Look B in the game** (`dark/inventory.ts`, one component): the mock's stage (1200 × 700, its coordinates)
     scaled to the window — the four at hand as loops on a walnut belt (the one in hand lit, "In hand", its spare
     rounds), the canvas bag with its flap and eight stitched pouches (Organize · O on it), the paper tag on its string
     from the bag's ring (where it is, the picture, the name, what it is, its numbers typed, a note, the lamp's button
     and Drop), the ground along the foot as stones ("On the snow" / "On the floor", Take all · T), the vitals a typed
     line. The HUD's own tokens (globals.css: the lamp, the paper, the walnut, Cormorant, Special Elite). Nothing
     picked, the tag lists the keys. The You column, the footer of hints and the dashed wells gone; the dark's HUD
     column hidden while it's open (the belt is the quick bar).
   - **The mouse and keys**: click picks; a drag moves (Shift: splits; off the pack: drops); right click opens the
     menu (Use/Hold/Put away, Reload, Equip to · Move to with the four chips, To the pack, Split, Drop 1, Drop all n —
     the ground's: Take, Take to 1–4, Take all) — a right click no longer drops; hover something in the pack or on
     the ground and press 1–4: there (on the belt 1–4 stay the keys' own); Shift + click the pack ⇄ at hand; a double
     click uses or equips; E, R, T, O, Delete, the arrows; Esc closes the menu first.
   - **The pad**: the d-pad picks (the belt, the pack two rows of four, the ground), A uses, Y the menu (↑/↓, A, B),
     X held half a second drops, B closes.
   - **A phone** (under 640 px, 0-b-phone): a column — the belt, the pack four across, the tag a sheet, the ground a
     line; tap picks, tap an empty pouch to move the picked there, a touch held opens the menu, the tag's Drop only by
     a hold.
   - Checked: `inventory-tools.spec.ts` (new: the menu's Drop 1 and Drop all, T, Split from the menu and a Shift-drag,
     O, hover + 4, Shift + click, a double click, the menu's To the pack and chip 4, a drag off the pack, Esc; the pad;
     a phone by touch), `inventory.spec` and `inventory-pack.spec` (moved to the menu's Drop and the new markup) —
     green. Stills: `design/inventory/3-pack.png`, `3-menu.png`, `3-keys.png`, `3-in-hand.png`, `3-inside.png`,
     `3-phone.png`, `3-phone-menu.png`.
4. **The HUD**: the quick bar with the held gun's rounds; the pick-up slip; the strip and its over-the-dock overlap
   gone; quick use (H, B).
   Done in phase 4:
   - **The quick bar** (`dark/index.ts` `quickHud`, design/inventory/0-hud): framed as before, now captioned — "At
     hand", and on the right the held gun's rounds, in it + spare (".38 · 6 + 24", "shells · 2 + 12"); hurt (under 60)
     with a first aid carried, the caption says so: "H first aid ×1". The slots a little larger (54, a gun 96). The
     guns' own widgets under it stay (the cylinder, the shells, the magazine — plans 80–84).
   - **The slips**: what she gains, typed on a paper slip above the quick bar for 3.2 s ("+4 shells · in the pack",
     "+ revolver · at hand · 1", "+3 flares"), three at most — worked out by kind from the pockets' word, so a move,
     a split or Organize shows none. The search's "Found …" toast gone (the slips say it); the toast stays for
     nothing / searched / tomorrow / the pack full.
   - **The strip gone** — and with it the 3 s pop-up after any change, Tab's peek at it, and its overlap with the dock.
   - **Quick use**: H a first aid, B a battery, from the quick slots or the pack — on foot only (in a car H is the
     horn, B looks back), not building, not with a menu or the pack open; none carried, or health / the torch full:
     said, nothing wasted. The battery's gauge shows "B ×n" when one's carried; the pack's keys tag lists H and B.
   - Checked: `inventory-tools.spec`'s HUD test (the caption's H and rounds, the kit's slips three at most, a slip for
     four shells taken back and none for a move, H used then none left, B with the torch full), `dark.spec` (a search:
     the slip or the word; the quick bar captioned, no strip), `inventory.spec`, `inventory-pack.spec` and the tools'
     other three — green. Stills: `design/inventory/4-hud-slip.png`, `4-hud-shells.png`.
5. **Checks**: `inventory.spec` and `inventory-pack.spec` grown (the menu, hover + 1–4, split, take all, 8 pockets);
   the guns' specs that empty or fill her (slots 0–11 now); a phone, the pad; stills.

## Risks

- **8 pockets move the quick slots' numbers**: drop/use/move slots are the pockets 0–5 then the quick slots 6–9
  today (`QUICK_SLOT = POCKETS`) — with 8 pockets the quick slots become 8–11; every hard-coded 6–9 (the client, the
  specs, the server tests) found and moved. The API and the world-server ship together (a save of 6 pockets read as
  8).
- **Rounds still crowd it**: armed with all five guns, their rounds take up to 5 of the 8 pockets (F3b chosen) —
  watched in the mocks.
- **Pictures**: their weight on the page (images, lazily); a missing one falls back to today's drawing.
- **The page's budget** (raised freely, measured — [[budgets-raise-freely]]).
