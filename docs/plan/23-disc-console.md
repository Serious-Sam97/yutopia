# Fita 15 — The disc console (PS1) + controllers (plan — 2026-10-17)

**Status:** P0 (spike) done 2026-10-17. See PROGRESS → Fita 15. What changed from this plan because of it:
analog **route A** chosen (virtual gamepads; the device type goes in a remap file);
discs are written into the core's file system by us, not by Nostalgist (it made
4 copies: 3.3 GB for a 771 MB disc, now ~1×); the test disc exists
(`colors.cue` + `colors.bin`, and big ones on demand). Open: a real game + BIOS
in Firefox and Chrome (the user).
P1 (the look) approved 2026-10-17. P2 (discs + BIOS in Yondra, the browser's
copy, the rack's forms) done 2026-10-17. P3 (the consoles play: the BIOS gate,
boot, pads, saves) done 2026-10-17. P4 (controllers: 16 buttons + sticks,
virtual pads for every core, the DualShock's analog switch, bindings + the
Controllers panel) done 2026-10-17. P5 (polish: the slim console's own screen,
foley, the disc corner in the ready-made room) done 2026-10-17. Open: a real
game + BIOS + pad in Firefox and Chrome (the user); rumble for pad 2; multi-disc.

> **Ask (2026-10-17):** "Add a PS1 emulator and videogame. We already have some
> videogames, I want the same pattern. Today we have an option to import ROMs:
> make the import of BIOS and ROM the same, manually inside the game. And we have
> to think about controller support."

It follows the game room ([09-game-room.md](09-game-room.md)), the same way the
other consoles work: whoever turns it on hosts it, the TV goes out to everyone,
pad 2 is relayed, and saves are kept per space and game.

## Decisions (user, 2026-10-17)

| Topic | Decision |
|---|---|
| Discs | **Uploaded to the space, like cartridges**: the team's shelf in Yondra, so any host in any room of the space can play it. Discs are 300–700 MB, so they need chunked uploads, their own quota and a browser cache. |
| BIOS | **Required.** Imported inside the game the same way as a disc (the panel's *Bring your…* form), uploaded to the space and checked against the known dumps. No BIOS means the console doesn't power on. We never ship one. |
| Controllers | **Full PS1 pad** (✕○□△, L1/R1/L2/R2, L3/R3, both sticks, the analog toggle) **+ pick and remap pads** for every console (choose your gamepad, remap keys/buttons, glyphs, deadzones). Two pads on one computer and the gamepad for the world are **not** in this Fita. |
| Looks | **Grey original** (round lid, round buttons), **small white round** (the later slim one, optional flip-up LCD), **disc rack + jewel cases + memory cards**. No logos or brand names: "32-bit disc console". |

## The experience

1. **Set up:** catalog tab *Game room* has the grey disc console, the small white one and the disc rack. Plug it into a TV like any console (cable ≤ 4 tiles, AV1/AV2).
2. **BIOS, once per space:** the first person to click the console sees *This console needs its BIOS*. Under it is a *Bring the BIOS* form with one file (`.bin`, 512 KB), the same form as *Bring your cartridge*. It shows the model it recognised ("SCPH-5501 · NTSC-U"). After that everyone in the space can play. More regions can be added; the core picks one automatically.
3. **Disc:** click the disc rack (or the console → *Insert disc*). The picker lists the space's discs as jewel cases (title, label colour, optional cover). *Bring your disc* takes a `.chd` / `.pbp` (one file, recommended) or a `.cue` + its `.bin` tracks. Upload has a progress bar, can be paused or resumed, and survives a reload.
4. **Insert:** the lid opens and the disc drops in (on the slim one, the lid flips up). The lid closes.
5. **Power:** the host downloads the disc once, with progress ("Reading the disc… 312 / 540 MB"), then it's cached on that computer. The real BIOS boot animation plays on the TV, and everyone in the space sees it.
6. **Play:** keyboard or gamepad, with the full DualShock layout. The *Analog* button on the panel lights the pad's red LED. Pad 2 is relayed like today, but with sticks.
7. **Saves:** the **memory card** (128 KB, per game per space; drawn in the console's slot) and save states (compressed) are kept in Yondra. Autosave, power-off, *Turn on where it was left* and host handoff all work like today. Handoff takes longer the first time, since the new host has to download the disc (with progress).
8. **Controllers (every console):** *Settings → Controllers* or the gear on the game panel opens a list of connected pads; press a button on yours to choose it. A drawing of the console's pad: click a button and press a key, pad button or stick to bind it. Deadzone slider, "stick moves the d-pad" for old consoles, glyphs that match your pad (✕○□△ / A B X Y), *Reset to default*.

## What gets built

### Yondra — discs, BIOS, big uploads

- **Discs** go in `yutopia_games` (system `ps1`) like cartridges, plus a `files` JSON (a CUE/BIN set is several files, stored under `yutopia/games/{space}/{sha1}/` with their original names, because the `.cue` refers to them by name). Allowed: `.chd`, `.pbp`, `.cue` + `.bin`, `.iso`; at most 900 MB per disc. The `.cue` is parsed on finish so every `FILE` it names must have been uploaded.
- **Quota:** a separate **disc quota of 10 GB per space** (env `YUTOPIA_DISC_QUOTA`; cartridges keep their 128 MB). Server disk use goes in `DEPLOY.md`.
- **Chunked, resumable uploads** (PHP takes 100 MB, nginx needs checking): `POST …/games/uploads` (name, size, system) → id; `PUT …/uploads/{id}/{n}` 8 MB chunks; `GET …/uploads/{id}` lists the chunks received (to resume); `POST …/uploads/{id}/finish` assembles, checks size and extension, sha1 (duplicates refused), quota. Leftover uploads are cleared after 24 h (scheduler).
- **Download** with `Range` (the host can resume too) and `Cache-Control: private, immutable` by sha1.
- **BIOS:** table `yutopia_bios` (space, sha1, model, region, uploaded_by). Only **known dumps** are accepted: a sha1 table of the retail models (SCPH-1000/1001/1002/3000/3500/5500/5501/5502/5552/7001/7002/7003/7502/101…), 512 KB. The name it's stored under is the one the core looks for (`scph5501.bin` …). Removable by the uploader or the owner, like cartridges. A note in the form says to bring only a BIOS dumped from a console you own (the same note as ROMs).
- **Saves:** `yutopia_game_saves` already holds state + SRAM. For `ps1` the state limit goes up (states are ~4–5 MB raw; sent gzip'd with `CompressionStream`), and SRAM is the 128 KB memory card.
- Tests (Pest, `YutopiaTest`): chunked upload with resume, finish checks, CUE/BIN set, quota, a BIOS with a known and an unknown hash, Range download, a member of another space refused.

### Client — the browser cache

- `world/games/discs.ts`: the disc's files in **OPFS** (Cache Storage as the fallback), keyed by sha1; `navigator.storage.persist()` is asked on first use; LRU eviction above 4 GB (a setting). A disc already cached on this computer starts at once. Upload reads the file in slices (never whole in memory).
- BIOS files are cached the same way (tiny).

### Emulation

- **Core: PCSX ReARMed** (`pcsx_rearmed`, GPL-2.0) from the build we already pin (`retroarch-emscripten-build` v1.22.2, 1.1 MB zip, confirmed to exist). It's added to `tools/emu-cores.json` with its sha256, fetched by `tools/emu-assets.mjs`, and its source is in `SOURCES.md`. Beetle PSX / SwanStation aren't in that build (and are too heavy for wasm).
- `SYSTEMS.ps1` in `shared/games.ts` (ext, max bytes, 2 ports, core) and `CONSOLES` (`console_ps1`, `console_ps1_slim` → `ps1`). The same table is in `YutopiaGamesController::SYSTEMS`.
- `startEmu` gets `bios` (Nostalgist's `bios` option puts it in the system folder) and `rom` as a file **list** for CUE/BIN (Nostalgist takes arrays). Core options: BIOS = real only (HLE off in production), boot logo on, the pad types from the analog toggle, frameskip off, native resolution scaled into the 640 × 480 frame, audio latency ~160 ms (to tune in P0).
- **Test disc:** `tools/test-rom-ps1.mjs` writes a tiny hand-assembled PS-EXE (colour bars; the screen goes red while pad 1 holds ✕, green for pad 2, and the left stick moves a square). It goes in `/emu/test` like the other test cards. Automated tests need a BIOS we don't have, so **e2e only** may boot with HLE behind a dev flag (`NEXT_PUBLIC_EMU_HLE=1`, never in production builds). P0 checks the test EXE runs under HLE.
- **Built-ins:** if P0 finds PS1 homebrew with a clear open licence (PSn00bSDK demos, PSXDEV entries), they go in `library.ts` with author/licence/source like the rest. They still need the space's BIOS.
- **Multi-disc games** (disc swap through `.m3u`): **not in v1**. Single disc only; the picker says "disc 1 of N" isn't supported yet.

### Controllers (every console)

- **Buttons:** `PAD_BUTTONS` grows from 12 to **16** (`l2`, `r2`, `l3`, `r3`). PS1 on the RetroPad: ✕ = B (bottom), ○ = A (right), □ = Y (left), △ = X (top), so the positions match a standard gamepad. Older consoles ignore the new bits.
- **Sticks:** `PadState = { bits: 16-bit, axes: [lx, ly, rx, ry] int8 }`. `game:pad` carries both; the world-server checks ranges and rate (≤ 60 Hz, only on change, a small dead band so a resting stick sends nothing).
- **Into the core, with analog:** synthetic keys (what we do today) can't carry analog values. **Route A (to confirm in P0):** RetroArch's web joypad driver reads a *virtual* `navigator.getGamepads()` built from our merged state (port 1 = you, port 2 = the network). We keep the real one for ourselves. One path for both players and every core, with real analog. **Route B:** EmulatorJS-built cores take analog through `_simulate_input` (indices 16–23); we'd switch the PS1 core to EmulatorJS's `pcsx_rearmed` build (already on npm). Keyboard players get full-deflection sticks on keys (IJKL = right stick, a modifier for half tilt).
- **Analog toggle:** the panel's *Analog* button switches the port between digital pad and DualShock (core option per port, the red LED on the drawn pad). Most games want digital; a few need analog.
- **Rumble (stretch):** if the core's rumble reaches the web build, play it on the holder's pad (`vibrationActuator.playEffect("dual-rumble")`, relayed back to pad 2's player). P0 says whether it's possible.
- **Pick + remap** (`world/games/pads.ts` + `components/hud/ControllersPanel.tsx`, lazy, in `yutopia-games`):
  - **Device:** the connected pads by name; *press any button* on yours to choose it (browsers only expose pads after a press). Remembered by gamepad id. `gamepadBits` stops taking "the first standard pad".
  - **Bindings per console:** the console's pad drawn with every button clickable → *press a key / button / move a stick*. Defaults are today's `KEYMAP` / `gamepadBits` tables; clashes are flagged; *Reset*. Pads with a non-standard mapping (common in Firefox) bind raw button and axis numbers, so the remap screen fixes them.
  - **Glyphs:** from the vendor id in `gamepad.id` (054c → ✕○□△, 045e → A B X Y, 057e → Nintendo layout). `KEY_HINTS` reads the bindings instead of a fixed table.
  - **Deadzone** and **stick → d-pad** (on by default for 2600–16-bit).
  - Saved with the person's other Yutopia preferences (where `maxFps` lives), so they follow you to another computer. Gamepad ids are per machine, so they're stored as a list.
- **Touch pad (phones, pad 2):** the PS1 layout (shapes, L1/L2 · R1/R2 on top, start/select); a left virtual stick when analog is on.

### Items and art (image-first, `/dev/items`, both views)

| Item | Notes |
|---|---|
| **Grey disc console** | Light grey box, the round lid with its ridges, round *power* / *reset* / *open* buttons, a green power LED, two pad ports and two memory card slots in front. The lid opens to insert/eject. |
| **Small white console** | The later slim, rounded one; variant with the **flip-up LCD** (when open and on, the game shows on the little screen too, through the same copied canvas as the TVs). |
| **Pad** | Grey DualShock-style: grips, two sticks, shape buttons in their colours (no logo); a red LED when analog is on. Drawn on the floor or in hands with the cord, in iso (`games/room.ts`) and 3D (`tp/games3d.ts`). |
| **Memory card** | Small grey card in slot 1 while the console holds a save. |
| **Disc rack** | A CD tower of jewel cases, spines in each disc's colour (or its cover). It opens the picker filtered to discs. |
| **Jewel case / disc** | In the picker and in the console while it plays. An optional cover image goes with the upload (≤ 300 KB, JPEG/PNG, resized client-side). |

The game-room ready-made gets an optional disc corner (rack + grey console). Following the 3D-people rules, everything is modelled smooth (lathes and bevelled shapes, not raw boxes) and checked in iso, third person and first person.

### Bundle

The world page is at **539 / 540 KB**, so **nothing new goes into it.** The new items' art and catalog entries must be lazy, or paid for by a trim elsewhere; P2 measures this first. The panel, remap screen, uploads and disc cache live in `yutopia-games` (with its budget). The core (~3–4 MB unpacked) is a static file fetched on first play.

## Phases and exit tests

| # | What | Exit test |
|---|---|---|
| **P0 — Spike** | PCSX ReARMed pinned and booting the test EXE (HLE) and a real disc with a real BIOS (a local one, never committed). Measure **host frame time** with the world running (median / p95), **memory** with a 700 MB BIN and a 400 MB CHD in the emulator's FS, boot time, state size raw / gzip, TV stream kbps. Analog **route A vs B**. Rumble yes/no. Chunked upload of 700 MB into local Yondra (nginx, PHP, disk) and download speed. Chrome **and** Firefox (the user's browser). | Numbers in PROGRESS; go / no-go on the core, the input route and the 900 MB limit. |
| **P1 — The look** | Grey console (lid open / closed), slim white (LCD open / closed), pad (analog LED), memory card, disc rack, jewel cases. Day and night, iso and 3D. | The user approves the images. |
| **P2 — Discs + BIOS in Yondra** | Chunked resumable uploads, CUE/BIN sets, disc quota, Range downloads, the BIOS table with known hashes, the browser disc cache, *Bring your disc* / *Bring the BIOS* in the panel. | Pest green; e2e: upload a disc in chunks, kill the tab halfway, resume, finish; a wrong BIOS refused, a right one shows its model. |
| **P3 — Items + play** | Catalog + art + cable, lid and disc in/out, BIOS gate, power → boot → TV for everyone, memory card + compressed states, handoff (with the download). | e2e: Ana plugs in, inserts the test disc, turns on → Bia across the space sees it; pad 1 turns it red; power off → memory card + state saved → new session continues; without a BIOS the console refuses (the gate tested with the HLE flag off). |
| **P4 — Controllers** | 16 buttons + sticks, relay v2, analog toggle, the device picker + remap screen + glyphs + deadzone for **every** console, the PS1 touch pad. | Tests: shared (pad state packing, ranges), world-server (relay v2 validation, rate). e2e with a fake gamepad (`navigator.getGamepads` stub): rebind ✕ to another button → the test disc reacts to the new one; Bia's left stick moves the square on Ana's screen. Old consoles still pass `games.spec.ts`. |
| **P5 — Polish** | Lid / disc spin / power foley, the LCD screen on the slim one, the disc corner in the ready-made, rumble if P0 said yes, budgets, docs (`games-licenses.md`, DEPLOY disk), full e2e, Firefox check by the user. | Visual review shots (day / night, iso / 3D, the panel, the remap screen, phone); budgets green; full suite green. |

## Risks and open questions

- **Host CPU:** wasm builds have no dynarec, so PCSX ReARMed runs its interpreter. A PS1 is much heavier than a 16-bit console, plus the world plus the TV encode on one laptop. P0 decides. Mitigations: cap the world's fps while hosting (the `maxFps` pref exists), the 3D view's redraw gating, frameskip as a last resort.
- **Memory:** a 700 MB BIN read whole into the emulator's in-memory FS doubles up with the blob. CHD/PBP are smaller and the panel recommends them. If P0 shows tabs dying, the limit drops (and the form says to convert to CHD with `chdman`).
- **Upload/download size:** a host must pull hundreds of MB once per computer. The cache makes it once. Handoff to someone without the disc cached can take minutes, so the TV shows "Loading disc…" to everyone.
- **Server disk:** 10 GB per space adds up. The quota is an env var, and DEPLOY.md gets a disk note.
- **Legal:** BIOS and discs are uploaded by members, private to the space, with the "only what you own" note, the same stance as cartridges. We ship neither and never publish them outside the space. PCSX ReARMed is GPL-2 (sources linked like the others).
- **Firefox:** gamepad mapping differs (many pads non-standard), so the remap screen is the answer. Audio latency and wasm speed must be measured there too (the user plays in Firefox; it isn't automatable here).
- **Analog route A** (a virtual `getGamepads`) depends on RetroArch's web joypad driver being in the build. If it isn't, route B uses EmulatorJS's PS1 core (also GPL-2, also self-hosted and pinned).
- **Multi-disc** games are out of v1; `.m3u` disc swap is a follow-up.
