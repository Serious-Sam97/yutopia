# Fita 9 — Game room (consoles, emulators, the TV everyone sees)

> **Status: delivered (2026-10-13)** — see PROGRESS.md → Fita 9 for what shipped,
> the numbers and the deviations.

> **Ask (2026-10-13):** a game room with working emulators on the TV; everyone can
> see what's happening on the TV. Consoles with a real design; you plug the console
> into the TV.

## Decisions (user, 2026-10-13)

| Topic | Decision |
|---|---|
| Games | **Built-in homebrew/free games** (redistributable, licences recorded) **+ members upload their own cartridges** (ROMs they own), kept private to the team's space. Only the person who turns the console on downloads the ROM; everyone else only sees the video. |
| Consoles v1 | **Woodgrain 2600-style**, **8-bit** (NES / Famicom-style), **16-bit** (SNES / Mega Drive-style), **handheld on the TV** (Game Boy-style, through a TV adapter). N64 / PS1 later, if ever. |
| How everyone sees it | **Whoever turns it on streams it.** The emulator runs in their browser; the TV's picture goes out as video to the whole space, its sound only to people near the TV. Player 2–4 feel ~0.2–0.3 s of lag. |
| Design | **True to the originals, no logos or brand names**: silhouettes, colours, woodgrain, cartridges, sliders and buttons as they were, with generic names ("8-bit console"). |

## The experience

1. A builder sets up the **game room**: the room preset puts a CRT TV on its stand, a couple of consoles, a cartridge shelf, a sofa and bean bags, a rug and posters. Or place each thing yourself from the catalog (new tab: **Games**).
2. **Plug it in:** click a console → *Connect to TV*. Your character crouches, a cable runs across the floor from the console to the TV (max ~4 tiles). Up to two consoles per TV (AV1 / AV2); the TV's *Input* button switches.
3. **Cartridge:** click the cartridge shelf (or the console → *Insert cartridge*) and pick a game: the built-in ones or the team's own uploads. The cartridge visibly goes into the console (top-loader drops in; front-loader slides in and down).
4. **Power:** *Turn on*. The TV warms up (CRT fade-in, a hum), the power LED lights. You hold controller 1 (a corded pad from the console to your hands) and play: keyboard or gamepad. Your camera leans in over the TV (like the slot-car track), with a small console under it: players, save, eject, power.
5. **Everyone sees it:** anyone in the space sees the game running on the TV from wherever they stand (smaller and lower quality when far). The sound comes from the TV and only reaches people in earshot, like voices.
6. **Join:** walk up and take controller 2 (3, 4 where the console has them). Players are shown sitting with pads in hand, leaning when they play.
7. **Watch:** click the TV → *Watch*: the camera leans in, the picture big, no controls.
8. **Leaving:** power off saves (battery saves + a save state). If the person streaming leaves, the TV shows the paused frame and "NO SIGNAL"; anyone at the controls can *Continue*: they become the one streaming, from the last save state.

## What gets built

### Items (`shared/catalog.ts`, art in `art/items/games.ts`, image-first)

| Item | Notes |
|---|---|
| **CRT TV on a stand** | 80s woodgrain cabinet TV with knobs, a VCR shelf below; the screen is a live display (video texture, CRT look). Wall-mounted / big projector later. |
| **Woodgrain console (2600-style)** | Black ribbed top, woodgrain front, chrome switches; joystick controllers with a red button; cartridge stands up out of the top. |
| **8-bit console** | Two looks: grey front-loader with the flap (NES-style) and red-and-cream top-loader (Famicom-style, wired pads). |
| **16-bit console** | Two looks: grey with lilac buttons (SNES-style) and black with red/gold accents (Mega Drive-style). |
| **Handheld + TV adapter** | A 16-bit-style adapter cartridge with the handheld's cartridge on top (Super Game Boy idea); the handheld itself on the shelf as decor. |
| **Cartridge shelf** | The library: spines in each game's colour; opens the game picker. |
| **Controllers** | Drawn live: on the floor by the console, or in a player's hands with the cord back to the console. |
| **Game room preset** | A room template / dressing for builders. |

Consoles are surface items (stand on the TV stand, a table, a rug, the floor) with `props`: `tv` (connected TV id), `cart` (game id), `on`. TV props: `inputs` (console ids), `input` (selected).

### State and rules (world-server `features/games.ts`, schema `consoles` map)

Per console: `on`, `tv`, `cart`, `host` (who streams), `players` (sid per port), `paused`, `stateAt`. The server checks: cable length, one console per TV input, only people near take a port, the host is the one who powered it on (or continued), ports free when people walk away or leave, power-off when the console or TV is removed or unplugged in build mode.

### Emulation (host browser, lazy chunk `yutopia-games`)

- **Engine:** libretro cores compiled to WebAssembly, driven through a small wrapper (candidate: Nostalgist.js, MIT; alternative EmulatorJS, GPL-3), **self-hosted and pinned** (no CDN, supply-chain policy). Candidate cores to confirm in G0: Stella (2600, GPL-2), FCEUmm (8-bit, GPL-2), Snes9x and Genesis Plus GX (16-bit — **non-commercial licences**: fine for team & friends, to be swapped if Yutopia is ever sold), Gambatte (handheld, GPL-2), mGBA (GBA later, MPL-2).
- **Input:** keyboard + Gamepad API, a mapping per console (shown on the console's panel); touch pads for phones as players 2–4.
- **Saves:** battery saves (SRAM) and save states per space + game, stored in Yondra; autosave every few minutes and on power-off / leave.

### The TV everyone sees (streaming)

- The host captures the emulator canvas (`captureStream`, ~30 fps, native resolution ×2) and its audio, and publishes them through LiveKit as a **separate "TV" participant** (`tv:<space>:<console>`, a token minted by Yondra on the world-server's word), so it never mixes with their own camera or screen share.
- **Who receives what:** today tracks only reach people in earshot (publisher permissions). The TV gets its own rule: **video → everyone in the space** (simulcast: the far-away get the small layer), **audio → people in earshot of the TV** (the same hearing pass, centred on the TV).
- **Drawing:** the engine already puts video on the big screen (`setScreenVideo`); the TV gets the same, plus a CRT look on High (scanlines, curvature, glow), a warm-up/"NO SIGNAL" state, and at night its light spills on the floor (colour sampled from the picture a few times a second).
- **Players 2–4:** their button states go to the host over LiveKit data (lossy, ~60 Hz on change), tagged with frame numbers; the host feeds them to the core's ports.

### Library and uploads (Yondra)

- Table `yutopia_games`: space (null = built-in), system, title, colour/label, file (private disk), size, sha1, uploaded_by, licence (built-ins).
- **Built-in homebrew**: a curated set per console, licence and author recorded in `docs/games-licenses.md`.
- **Uploads**: members of the space, by system; size caps (2600 ≤ 64 KB, 8-bit ≤ 1 MB, 16-bit ≤ 8 MB, handheld ≤ 8 MB), header/extension checks, a per-space quota; a note that you upload only cartridges you own. Downloads only for a member who is about to host that game.
- **UI**: the cartridge shelf's picker (built-in / ours, by console, search), "Bring your cartridge" upload.

### Bundle

The world page is over budget already (527.8 KB > 520 at HEAD; a separate task): **nothing here goes into it.** The TV display code is tiny (engine), the console panel and emulator wrapper are a lazy chunk with its own budget, the cores are static files fetched on first play and cached.

## Phases and exit tests

| # | What | Exit test |
|---|---|---|
| **G0 — Spike** | One core running in the browser; its canvas published to LiveKit as a TV participant; another browser sees it on the existing big screen. Measure host frame time with the world running, bandwidth, P2 input round trip. Confirm wrapper + cores: licences, sizes, supply-chain policy. | Numbers in PROGRESS (host CPU, latency, kbps); a go / no-go per console. |
| **G1 — Mockups** | TV + stand, the four console lines (both looks where there are two), controllers, cartridges, shelf, the game room by day and night. | User approves the images. |
| **G2 — Items + plugging in** | Catalog + art, the cable (connect / unplug, length rule, moving in build mode), cartridge in / out drawn on the console, the game room preset. | e2e: place TV + console, connect, cable drawn; drag the console too far → unplugged. |
| **G3 — Play + everyone sees** | Power, built-in game, host emulator, TV video for the whole space, sound only near, lean-in + panel, Watch. | e2e: Ana plays; Bia across the space sees the TV's picture change; Bia hears it only when near. |
| **G4 — Multiplayer** | Controllers 2–4, inputs relayed, players seated with pads, host handoff from the last save state. | e2e: two-player game, Bia's input moves player 2; Ana leaves → Bia continues. |
| **G5 — Library + saves** | Yondra table + storage, uploads, picker, SRAM + save states persisted. | Upload a ROM, play, power off, come back in a new session and continue. |
| **G6 — Polish** | CRT look, TV light at night, insert / power foley, LEDs, phone (watch + touch pads), budgets, docs. | Visual review shots day + night; budgets green. |

## Risks and open questions

- **Player 2 lag** (~0.2–0.3 s) is fine for most party / sports / puzzle games, rough for fighting games. If it matters: netplay (every player runs the core, rollback) as a later step — not in v1.
- **Host CPU:** emulation + encoding + the world on one laptop. G0 measures it; mitigations: cap the world to 30 fps while hosting, run the core in a worker with OffscreenCanvas if it supports it. Phones don't host.
- **Licences:** non-commercial cores (Snes9x, Genesis Plus GX) are fine for team & friends, not for a paid product — swap cores then. Uploads are the uploader's responsibility; we never ship commercial ROMs.
- **Trademarks:** no logos, no brand names; designs are evocative, not copies of marks.
- **Bandwidth:** many TVs on at once × everyone in the space; simulcast + the small layer far away; a cap on how many TVs stream at once per space (e.g. 3).
- **LiveKit permissions:** the TV participant needs its own subscriber list per track (video vs audio) — confirm in G0 that per-track permissions do what we need.
