# 87 — The left hand

Ask (2026-11-14, the user, after plan 86): a use for the left hand. The quick slots move to keys 2–5; key 1 is the
left hand, and any item can go there. The torch ("lanterna") works only that way — by 1 from the left hand, no
longer by L. The new pack (plan 86, look B) adapted to it.

Status: **investigated and proposed 2026-11-14; forks decided by the user 2026-11-14**: **F1a** the left hand's
item out only while in use; **F2a** anything but a gun; **F3b** a flare there lit by 1 and held up as a light, G or
1 again throws it; **F4a** everyone has a torch, it can be dropped, the lobby's locker gives one to whoever has none. **Phase 0 (the
mock) signed off 2026-11-14**, committed cba1f89b; **phase 1 (the rules) built 2026-11-14**, committed 3b48ff95; **phase 2 (the keys) built 2026-11-14**, committed 5f2c97bc; **phase 3 (the left hand in use) built 2026-11-14**.

## What there is now

- **The light is the phone's flashlight**, not an item: L (`ctl/input.ts`, the binding `torch: ["KeyL"]`; the pad's ↑)
  and the phone app's flashlight button (`phone/screens/home.tsx`) send `phone:torch`; the server sets
  `Player.torch` (`features/phone.ts`) and everyone sees the beam. The battery (FOCO) is a vital, not the light's;
  the right button focuses the light only while it's on (plan 79 F8a). Plan 56 promised the lantern "an item in the
  pockets in plan 57"; it was never written. Plan 79 F8 listed this very thing as its later option *b* ("the lantern a
  real item: in a hand slot to focus, L goes").
- **It's already the left hand's**: the torch is a prop held in the left hand (`chars/props.ts` `torch`;
  `tp/person3d.ts` `m.hold("L", … kind: "torch")`), with no gun and with every gun — Harries under the revolver
  (plan 80), in the same fist under the fore-end of the double-barrel, the AK, the sniper and the Daybreak (plans
  81–84). First person too (`tp/hands1p.ts`).
- **The quick slots are keys 1–4** (`dark/arms.ts` `QUICK_KEYS`; the pad: LB + A B X Y), once the dark's chunk is
  loaded; before it, 1–8 are the eight emotes (`ctl/input.ts`) — after it, 5–8 (fire, question, coffee, tape).
- **The inventory** (`shared/inventory.ts`): 8 pockets then 4 quick slots (0–7, 8–11); a weapon equipped only in a
  quick slot (`weaponIn`, `worn.ts`); the API saves `quick` and `pockets` (`DarkController`, `Survivor`).
- **The pack** (plan 86): four loops on the belt, 1–4; hover + 1–4; the menu's "Equip to 1–4"; the HUD's quick bar
  1–4 captioned with the held gun's rounds.

## Proposal

**A fifth slot, the left hand, on key 1** — before the four at hand (now 2–5):
- **The torch becomes an item** (id `torch`, "Torch" / "Lanterna"): one of a kind, a picture rendered like the others
  (`tools/art/items/render_items.py`). It lights **only from the left hand, by 1** (the pad's ↑, which was the
  torch's already): 1 takes it out and switches it on — the holds of plans 80–84 as they are — 1 again switches it
  off and puts it away. In the pack it's carried, dark. **L goes, and so does the phone's flashlight button** (the
  user's "only this way, by 1"). The battery stays the torch's vital; the right button focuses it as now.
- **Anything else in the left hand** (F2a: anything but a gun): 1 uses it — a first aid, a battery (as H and B do);
  **a flare (F3b): 1 lights it and she holds it up** — a light in her left hand, burning its 12 s (`FLARE.secs`),
  held where the guns' holds hold the torch (Harries under the revolver, in the fist under the long guns' fore-ends),
  lighting round her and keeping the shadowed off as a thrown one does where it lands; G, or 1 again, throws it,
  still burning; burnt out in her hand, it's let fall. Rounds or a fuse there: 1 does nothing (the slot shakes
  "no").
- **The keys**: 1 the left hand, 2–5 the quick slots (the guns drawn by 2–5), the emotes on 6–9 (the four that were
  on 5–8); the pad: ↑ the left hand, LB + A B X Y the quick slots 2–5. Key 1 loads the dark's chunk if it isn't yet
  (as I does), so the torch works indoors from the start.
- **The rules**: a `hand` slot of its own beside the quick slots (slot 12, `HAND_SLOT`; `slotAt`, `moveSlot`,
  `addItemTo`, `removeSlot`, `cleanInventory` know it); the API saves it; the server puts `Player.torch` out when the
  torch leaves the left hand (`worn.ts`); old saves and new people get a torch in the left hand (F5).
- **The pack and the HUD (plan 86 adapted)**: the belt's first loop is the left hand — set apart on the belt's left
  end, a hand's mark and "1 · left hand", then 2–5; hover + 1–5; the menu's chips 1–5 (1 marked as the hand); the
  torch's tag (the battery's %, "In the left hand · 1", Light / Put out); the HUD's quick bar: the left hand first,
  a gap, then 2–5; the battery gauge while the torch is out; a phone's belt of five.

Not now: two things in the left hand at once (the torch and a flare), a left-handed gun, a lantern that's set down
and lights a place.

## Forks

| # | Question | Options | Recommended |
|---|---|---|---|
| F1 | The left hand's item, seen | **a)** out only while in use — the torch in her hand while it's lit, put away when it's off; anything else stays stowed (the slot's a quick reach) · **b)** always in her left hand, seen by everyone (the torch unlit, a kit, a flare), stowed while a long gun's drawn | **a** |
| F2 | What can go in the left hand | **a)** anything but a gun (a gun takes both hands) · **b)** anything, a gun too (drawn into the right hand on 1, like a quick slot) · **c)** only the torch and the things to use (first aid, battery, flare) | **a** |
| F3 | A flare in the left hand | **a)** 1 throws it, as G does · **b)** 1 lights it and she holds it up — a light in the left hand like the torch (the guns' holds take it where they take the torch), G or 1 again throws it | **a** — **chosen: b** |
| F4 | The torch for everyone | **a)** everyone has one (old saves and new people: in the left hand); it can be dropped and picked up; the lobby's locker gives one to whoever carries none · **b)** it never leaves her — the left hand or the pack, no drop | **a** |

Taken as recommended, not asked: L and the phone's flashlight button go (the user's "only by 1"); the emotes to 6–9;
the pad's ↑ the left hand, LB + A B X Y the quick slots 2–5; a mock of the adapted belt and HUD signed off first.

## Phases

0. **Mock** (`design/inventory/mock/inventory.html`, look B): the belt with the left hand (the torch there, lit; then
   2–5), the torch's tag, the menu's 1–5, the HUD's bar with the hand, a phone; the torch's picture rendered.
   **Signed off first.**
   Done in phase 0 (2026-11-14), to be signed off:
   - **The torch's picture** (`render_items.py` `torch`, as the game's prop: the tail cap, the grip's six grooves,
     the body flaring into the head, the chrome bezel, a warm lens) → `design/inventory/items/torch.png`.
   - **The mock** (`design/inventory/mock/inventory.html`, look B with `&h=1`; `&f=1` a flare held):
     - **The pack** (`87-pack.png`): the belt's first loop the left hand — darker leather, a hand's mark and "1 · left
       hand", the torch there lit (a warm glow, LIT) — then the belt's brass buckle, then the four at hand 2–5; the
       torch picked: its tag ("Left hand · 1 · lit", the battery, the spare batteries · B, focus on the right button,
       held with every gun; Put out · 1, Drop); the menu on the flares in the pack: Equip to ✋1 2 3 4 5.
     - **The HUD** (`87-hud.png`): the hand's slot first, apart by a hairline, lit; the caption "Left hand · torch
       71%" and the held gun's rounds; **a flare held** (`87-hud-flare.png`): the slot burning orange with its time
       left (0:42), "G or 1 · throw it".
     - **A phone** (`87-phone.png`): the belt of five (the hand, the buckle, 2–5), the torch's tag a sheet (Put out,
       Drop by a hold).
1. **The rules**: the `hand` slot and the `torch` item in the shared rules (one of a kind; only the hand lights it;
   F2's refusals); the API's save and its tests; old saves and new people given a torch (F4); the lobby's locker;
   the server — `phone:torch` only with the torch in the left hand, put out when it leaves (`worn.ts`); **the held
   flare (F3b)**: a `Player` field for a flare lit in her hand (when it was lit), seen by all, a light the shadowed
   keep off as from a thrown one's (`features/dark.ts`), thrown on as a burning one (its time left), burnt out let
   fall; tests.
   Done in phase 1 (2026-11-14):
   - **Shared** (`inventory.ts`): `hand` on the inventory, `HAND_SLOT` 12 after the quick slots (`slotAt`, `put`,
     the slots every count, find, top-up and take goes through); `fits(slot, id)` — the left hand anything but a
     weapon, a quick slot anything but the torch — kept by `moveSlot` (a swap both ways), `addItemTo`, `splitSlot`;
     the `torch` a stack of one, `ONE_OF` (a second isn't taken); `addStack` never puts anything new in the left hand
     but the torch, which goes there first, else the pack; `giveTorch`; `cleanInventory` reads the hand (no weapon
     there; a torch in a quick slot to the hand or pack; one torch); Organize puts the torch after the weapons.
   - **The API**: `inventory.hand` saved (a stack or nothing — a gun refused; the torch one of a kind across the
     hand, quick slots and pockets); `Survivor::STACKS` the torch.
   - **The server**: the save carries the hand; someone new, or a save from before (no `hand` in it), gets a torch
     in the left hand (`giveTorch`) — one let go since stays let go (the hand saved as nothing); `phone:torch` lights
     only from the left hand (once the pockets are known); `wear()` puts the light out when the torch leaves it;
     **`dark:hand`** — the left hand's use: the torch on/off (`on`, else switched), a first aid or a battery used,
     **a flare lit and held** (F3b): a burning `Flare` with `held` = her session — `features/dark.ts` keeps it at her
     hand each tick (so the shadowed keep off it as off any flare, and it goes out in her hand at its time); down,
     let fall burning where she is; gone, gone; **`arms:flare` throws the held one first**, its time going on where
     it lands. The lobby's locker and the supply lockers give a torch to one who carries none; the admin's kit too;
     a bot gets one when it joins (never saved — the world's tests join as bots and switch the light).
   - **The client, only as much as the rules need**: the torch's name and words (both languages), its drawing and
     its picture (`public/life/items/torch.webp`, 3.5 KB), a dropped torch drawn as the caches' torch.
   - Checked: shared 489 green (three new tests: the hand's slot and what fits, picked up, a save cleaned); the API's
     `SurvivorTest` 8 green (the hand kept, a gun or a second torch refused; the dev DB untouched); the server's two
     new tests (a torch for someone new, lit only from the hand, dropped and kept dropped across a rejoin, the lobby's
     locker; a flare lit and held, following her, thrown on with its time); the server's files that touch the light,
     flares or the pockets, one at a time — `survival`, `arms`, `dark`, `down`, `nests`, `world` — green but three
     red before this plan: the admin's give (survival), a spot's loot (flaky), back after a reload (world).
2. **The keys**: 1 the left hand, 2–5 the quick slots (`arms.ts`), the emotes 6–9 (`ctl/input.ts`), L and the
   binding's `torch` gone (the controls' settings list too), the pad's ↑ and LB + A B X Y; 1 loads the dark's chunk.
   Done in phase 2 (2026-11-14):
   - **The keys**: 1 the left hand, 2–5 the quick slots (`dark/arms.ts` `QUICK_KEYS`), the emotes 6–9 (fire,
     question, coffee, tape — `ctl/input.ts`; the rest on the wheel). Before the dark's chunk listens, 1–5 load it
     and go through (`walker.slotKey`, as I does) — the torch works indoors from the start.
   - **The left hand's key** (`dark/index.ts` `handKey`, the walker's `hand()` for the pad): the torch on or off
     (`dark:hand`); a flare lit and held, or the held one thrown where I look; a first aid or a battery used (not
     when full — said, as H and B); on foot only, not building, no menu, the pack shut (its own keys then: 1 is the
     hand's there too, `InvActions.hand`). G throws the held flare too, with none left in the pack.
   - **L gone**: the default keys' `torch` binding empty (a device that saved L as its default moves on — `retired`);
     the "torch" action is the pad's ↑, now the left hand's (the walker's, not the controller's toggle); **the phone's
     flashlight button gone** (moved here from phase 3) — the controller keeps `toggleTorch()` as the tests' and dev
     pages' handle only (no key, no button; the server lights it only from the left hand).
   - **The labels**: the HUD's quick bar and the pack's belt read 2–5; the menu's chips 2–5; the tag's keys and
     notes, "At hand · 2–5", the slips' "at hand · n".
   - **The specs**: every key press for a quick slot one up (41: the guns' two-player specs, `arms*`, `dark-hud`,
     `daybreak`, `guns-perf`, the inventory's, the probes `controls-shots`, `guns-hold`, `guns-today`);
     `inventory-tools`' HUD test: 1 lights the torch from the left hand and puts it out, L does nothing.
   - Checked: the client's units 334 green; the browser specs that press the keys — `inventory-tools` (4 and the
     phone), `inventory`, `inventory-pack`, `revolver-two`, `arms`, `dark`, `dark-hud`, `arms-empty`, `arms-feel`,
     `daybreak`, `daybreak-two`, `guns-two`, `shotgun-two`, `sniper-two`, `ak-two` (its rack's fleeting check missed
     once under the load, green alone) — green; `arms-fx` runs only for stills, `guns-perf` (a performance probe)
     not run. `dark-hud` had been red since plan 79 phase 9 (it waited for 19 made sounds; the guns' went to
     recordings, 17 are made): its count fixed.
3. **The left hand in use**: 1 with the torch — out and lit, off and away (the holds as they are, first person
   too); with a first aid, a battery; **a flare lit and held up** (F3b — its own prop in the left hand, held where
   the torch is with each gun, its light and sparks, thrown by G or 1 from the hand, burnt out let fall); the rest a
   "no"; the phone's flashlight button gone.
   Done in phase 3 (2026-11-14):
   - **The torch** by 1: out and lit in her left hand, put out and away — the holds of plans 80–84 as they were
     (nothing to change: they key on the light being on).
   - **A flare held up** (F3b): the avatar's `flare` (controller `holdsFlare` — a burning flare whose `held` is her
     session; the state's key, the Player's own `sid` isn't sent to clients); the person's left hand holds a flare
     prop (`chars/props.ts` `flare`: a red tube, two yellow bands, charred at the top, its end burning — the
     torch's size, grip and shape) **in the torch's place**, so every gun's hold takes it where it takes the torch
     (Harries under the revolver, in the fist under a long gun's fore-end), no beam; first person as the torch. Its
     end (`Person3D.flareTip`, the view's `flareTipOf`) is where the view's flare list has it: its hot head and
     sparks there, the lying stick not drawn (`tp/arms3d.ts`), its red light from there (`parts/sun.ts`) — so it
     moves with her hand. G or 1 throws it (lying lit where it lands, its time going on).
   - **The "no"**: 1 with nothing usable in the left hand (nothing, rounds, a fuse) says so (a toast); the slot's
     own shake waits for the HUD's left-hand slot (phase 4).
   - **An admin's refill** (`mod:refill`): the torch put in the left hand (shared `torchToHand`: given if none,
     what the hand held swapped out) — ready to light by 1; the specs that switch the light all refill.
   - Checked: `left-hand.spec.ts` (new, two of us at night: the torch by 1 and out again; flares to her left hand,
     one lit and held up — in her drawn hand, its end by her and well over her feet, its light drawn there, her hand
     one fewer — on both screens; with the revolver out, still held; G: thrown, lying lit, her hand still two).
     Stills: `design/inventory/87-3-torch-anas.png`, `87-3-flare-anas.png`, `87-3-flare-revolver-anas.png`,
     `87-3-flare-revolver-hers.png`, `87-3-thrown-anas.png`.
     With it, `arms`, `beam` (3), `dark-hud`, `inventory-tools` (4 and the phone) — 10 green together (a first run
     red because a probe had left flares in Ana's left hand: why the admin's refill now puts the torch there); shared
     inventory 16; `survival.test` green but the admin's give (red before this plan).
4. **The pack and the HUD**: the belt's left-hand loop, hover + 1–5, the menu's 1–5, the torch's tag, the pad's belt
   row of five, a phone; the quick bar with the hand.
5. **Checks**: the guns' specs (their keys 2–5 now: `Digit${slot + 2}`), the inventory specs (slot 12), the dark
   and night specs that switch the light (`phone:torch` → the left hand), the server's and API's tests; stills.

## Risks

- **Every spec that draws a gun by its key** (`Digit${slot + 1}` in the five guns' specs, `guns-two`,
  `inventory-pack`) moves to 2–5; every test that sends `phone:torch` needs the torch in the left hand (given by
  default, F4a).
- **The torch indoors before the dark's chunk loads**: L works anywhere today; 1 must load the chunk first (a beat's
  wait the first time).
- **The emotes' keys move** for anyone used to 5–8.
- **A torch dropped in the dark** leaves her blind till she finds it or a locker (F4a) — the point of making it an
  item, but worth watching.
- **The held flare (F3b)** is new to every hold: the torch's places fit it (a stick in the same fist), but its
  light moves with her — the light map, the shadowed's fear of it and others' screens all follow a moving flare, not
  a lying one.
