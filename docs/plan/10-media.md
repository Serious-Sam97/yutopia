# Fita 10 — Media: more TVs, YouTube & Jellyfin on them, YouTube on the radio

> **Status: delivered (2026-10-13)** — see PROGRESS.md → Fita 10 for what shipped,
> the numbers and the deviations. Since then: every radio and record player plays
> its own (station / YouTube queue), like every TV — no shared radio.

> **Ask (2026-10-13):** more TVs, some hanging on the wall; put media on a TV
> (YouTube, Jellyfin) and leave it playing — anyone who walks by can see and
> hear it. On the radio, an option to leave Spotify playing a song.

## Decisions (user, 2026-10-13)

| Topic | Decision |
|---|---|
| New TVs | **CRT on a wall bracket**, **projector + pull-down screen**, **big wooden console TV**, **portable tabletop CRT**, **big HD TV** (a flat panel: the one modern piece). |
| Jellyfin | The team's server at **`jellyfin.serious-sam.dev`** (public HTTPS). Yondra keeps the credentials; browsers never see the key. |
| Radio | A **YouTube** source for music (everyone near hears it, no account). The procedural lo-fi stations stay. **Spotify dropped (2026-10-13):** too much work for what it gives (Premium per listener, 25-user cap, no mobile). |
| Who controls it | **Anyone in the space**, like the radio today. A builder can **lock** a TV or the radio (only builders change it then). |

## The experience

1. A builder places a TV from the catalog (new tab **Screens**): wall pieces snap to a wall like the board wall, the tabletop CRT sits on desks and tables like a monitor.
2. **Put something on:** click a TV and the remote panel opens. **YouTube:** paste a link (video or playlist), or search. **Jellyfin:** browse Movies / Shows → season → episode, or search, with posters. *Play now* or *Add to queue*; *Repeat* is on by default, so it keeps playing.
3. **Leave it:** it keeps going after you walk away or log off. Playback is time-based on the server, so whoever arrives later finds it at the right second, even if the space was empty in between.
4. **Walking by:** every TV in the space shows what's on from wherever you stand: the video's thumbnail (YouTube) or the episode's / movie's image (Jellyfin), with the glass glowing and a thin progress bar, plus the light spilling on the floor at night. Once you're in earshot you hear it, louder as you get closer, and only inside the room if it's a private room or booth. Jellyfin plays live on the glass. YouTube gets a small **"On TV" card** docked on screen (YouTube doesn't let its picture be drawn into the world; see Risks).
5. **Watch:** click the TV → *Watch*. The camera leans in (like the game TV) and the picture is big, with subtitles for Jellyfin.
6. **The radio:** its panel gets two sources. **Lo-fi** (today's stations) and **YouTube** (a song, a `music.youtube.com` link or a playlist; it keeps rolling on repeat). Everyone near hears it in sync, with volume by distance; a small "On Radio" card appears while you're near, because YouTube allows no audio-only playback. **Now playing** shows on the radio's display and in the top bar.
7. **Game room TV:** the CRT TV keeps its AV1 / AV2 inputs for consoles and gains a **TV** input for media.

## What gets built

### Items (`shared/catalog.ts`, art in `art/items/screens.ts`, image-first)

| Item | Size / placement | Notes |
|---|---|---|
| **CRT on a wall bracket** | 1×1, `wall` | Angled down on a black arm, cable down the wall: an 80s bar or waiting room. |
| **Projector + pull-down screen** | screen 3×1 `wall`; projector 1×1 tabletop or on a stand | The screen is the display. A projector within 6 tiles pairs automatically, its lamp lit and its beam visible in the dark. |
| **Wooden console TV** | 2×1 floor, solid | Big glass, speaker grilles on the sides, walnut cabinet, two variants (walnut / teak). |
| **Portable tabletop CRT** | top item, 2×2 cells | Silver or cream with a telescopic antenna. Lives on desks, tables and the tape shelf. |
| **Big HD TV** | 3×1 `wall`; variant on a low media console (floor) | Slim black panel, thin bezel: the one modern piece, still drawn with the `Sketch` kit. |

- **Display capability in the catalog:** a `display` entry per kind (the glass quad on the wall plane or the standing face, aspect 4:3 or 16:9, the CRT look on/off). The engine draws media on any display: the new TVs, the existing `crt_tv` (its **TV** input) and the `screen_wall` big screen (a *Media* source next to board / stage share).
- Screen states: off (dark glass with a reflection), on (picture + glow), loading (static/snow), "NO SIGNAL", paused (frozen frame with a ‖ badge).

### State and rules (world-server `features/media.ts`, shared `media.ts`)

- **Per display** (schema map `media`, keyed by object id): `src` (`yt` | `jf` | none), `ref` (video id / Jellyfin item id), `title`, `art`, `dur` (s), `at` (server ms at which position 0 played), `paused` + `pos`, `loop`, `queue` (src / ref / title / dur), `by`, `lock`.
- **Radio** grows from `{ playing, station, startedAt, by }` to `source` (`lofi` | `yt`), `ref` (video id), `title` / `art`, `at`, `queue` (videos with durations), `loop`, `lock`. It reuses the media queue code: the radio is a display without a picture.
- **Position = (serverNow − at)**, wrapping through the queue by durations. The server advances the queue on its own clock: nobody has to be watching.
- **Server clock:** the radio uses the client's own `Date.now()` today, which is not good enough for video. Add a ping-based offset (`time:sync`, a few samples on join and every minute) used by media, the radio and the slot cars.
- **Rules:** `media:*` / `radio:*` from anyone in the space; a locked one only from builders. URL and id validation lives in shared code, and the world-server rate-limits changes. Removing a display in build mode clears its state.
- **Persistence:** the world-server writes media + radio state to Yondra (internal HMAC, debounced ~2 s) and loads it when the room starts, so "leave it playing" survives restarts and empty spaces.

### Sync (client, lazy chunk `yutopia-media`)

- Each listener plays their own copy, aligned to the shared clock. **No host:** nothing stops when the person who put it on leaves (unlike the consoles, which stream from one browser).
- Drift: Jellyfin `<video>` nudges `playbackRate` (0.97–1.03) under 1 s of drift and seeks above it. YouTube seeks above 1.5 s (its rates are coarse). A YouTube ad shows as a long drift and gets re-sought once it ends.
- **Cost guard:** at most one YouTube player and one full Jellyfin stream per client at a time (the loudest / the one being watched). Everything else stays a picture on the glass.
- **Volume:** `hearingGain` from the display's position (the same pass as voices and the radio), into the music bus, ducked a little while someone near you is speaking.

### YouTube

- **IFrame Player API** (a runtime script from `youtube.com`, allowed in the CSP; there is nothing to pin). Players sit in the "On TV" card (≥ 356×200, collapsible to a chip that mutes that TV for you) or in Watch.
- **In the world:** the thumbnail on the glass, served through the world-server if `i.ytimg.com` lacks CORS for WebGL (checked in M0).
- **Links:** `youtube.com/watch`, `youtu.be`, `music.youtube.com`, `/shorts`, `list=` playlists.
- **Metadata:** with a **YouTube Data API key** (Yondra env, optional): search, titles, durations, playlist items, and the `embeddable` check before something reaches the queue. Without the key: paste links only, titles via oEmbed, the duration reported by the first player that loads it (bounded by the server).
- Non-embeddable, private, age-restricted or region-blocked videos show an error on the remote and are skipped in the queue.

### Jellyfin

- **Yondra:** the space owner sets the server URL + API key in the space settings (stored encrypted, with a *Test connection* button). Endpoints for libraries, browse, search, item details and posters (proxied and cached). One server per space; `jellyfin.serious-sam.dev` is the first.
- **Measured in M0** (see PROGRESS): v12.0.0, 17,460 videos, trickplay off everywhere; only ~30% plays as-is in a browser (the rest is MKV / HEVC / AC3 / AVI…), a cold HEVC transcode takes ~8 s to its first segment and then runs ~13× real time.
- **A Jellyfin user for Yutopia** (e.g. `yutopia`, not admin): the libraries it can see are what the space can browse. PlaybackInfo and browsing run as that user.
- **One session per TV, shared through the world-server:** when something starts on a TV, the world-server asks PlaybackInfo (browser device profile, bitrate cap) and opens the HLS stream; it serves `/media/jf/<tv>/<token>/…` to clients, rewriting the playlists to itself and caching segments (LRU, a few minutes per TV). Jellyfin transcodes **once per TV**, however many watch; its upload carries one stream per TV. Tokens are short-lived, HMAC-signed, bound to space + TV + user; CORS for the client's origin so Pixi can draw it.
- **Playback: HLS for everything** via **hls.js** (pinned npm package, lazy chunk only; Safari plays HLS natively). Jellyfin copies what it can (H.264 sources start in ~1 s) and transcodes the rest. Seeking or a new item restarts the TV's session from that point (a cold transcode: show static + "tuning…" for those ~8 s).
- **Near / Watch** play the shared stream on the glass / big. **Far away:** the episode's or movie's own image (Primary / Thumb, always there) on the glass with the progress bar — trickplay would give a moving picture, but it's off and generating it for 17k videos is a long job (optional, per library, later).
- Subtitles (WebVTT from Jellyfin) in Watch; series → *Play next episode* goes into the queue.

### Bundle

The world page is at its limit (≤ 520 KB): **nothing new goes into it** except the tiny display hooks in the engine. The remote panel, sync, players and hls.js all live in the lazy `yutopia-media` chunk (its own budget); the YouTube script loads on first use.

## Phases and exit tests

| # | What | Exit test |
|---|---|---|
| **M0 — Spike** ✅ | **YouTube:** two browsers in sync; autoplay with sound after the first click in the world; does the thumbnail work as a WebGL texture? **Jellyfin** on `jellyfin.serious-sam.dev`: version, trickplay on?, direct play vs HLS for a sample of the library, a world-server proxy with Range + CORS drawn on a TV in Pixi; bandwidth and frame cost. CSP for the YouTube script. Clock offset accuracy. | Numbers in PROGRESS (sync error per source, kbps, frame time); a go / no-go per source. |
| **M1 — Mockups** ✅ | The five TVs (day / night, off / on / paused, both looks where there are two), the projector beam, the remote panel (YouTube / Jellyfin tabs, queue), the "On TV" card, the radio panel with its two sources, the top bar's now playing. | You approve the images. |
| **M2 — Items + displays** ✅ | Catalog + art, wall snapping, tabletop cells, projector pairing, the `display` capability, screen states, `crt_tv` TV input, `screen_wall` media source, the **Screens** catalog tab. | e2e: place each TV (wall ones only on walls); regression shots unchanged for the Studio. |
| **M3 — Synced media + YouTube** ✅ | shared `media.ts`, `features/media.ts`, clock sync, persistence (Yondra table `yutopia_media`), remote panel, queue / repeat / lock, "On TV" card, Watch, thumbnail + glow + progress on the glass, hearing. | e2e (a stub IFrame API, plus one opt-in live spec): Ana puts a video on the wall TV and logs off; Bia arrives later and finds it at the right second (±1 s); louder near, silent across the space; a booth's TV is unheard outside; a locked TV refuses Bia; restart the world-server and it's still playing. |
| **M4 — Jellyfin** ✅ | Space settings + encrypted creds, browse / search / posters, the shared per-TV session (world-server HLS relay + segment cache + tokens), hls.js, on-glass video near, the item's image far, Watch + subtitles, next episode, TV cap. | e2e against a tiny fake Jellyfin (a test HLS stream + images): Ana picks an episode, Bia sees it on the glass and hears it near; the fake Jellyfin sees **one** session for both; the key never reaches a browser (asserted on the network log). Manual check on `jellyfin.serious-sam.dev`. |
| **M5 — YouTube on the radio** ✅ | Radio state v2, YouTube source (link / search / playlist, queue, repeat), the "On Radio" card, now playing (radio display, top bar, Vortex still dances), switching back to lo-fi. | e2e with the stub: Ana puts a playlist on the radio and leaves; Bia near hears it at the right second, out of earshot it pauses; the playlist keeps rolling; back to lo-fi works. |
| **M6 — Polish** ✅ | Ducking under voices, CRT vs HD glass, picture light at night, Low quality / reduced motion, phone (card full width, Watch), foley (CRT thunk, projector fan), budgets, docs, PROGRESS. | Visual review day + night; budgets green; full e2e green. |

## Needed from you (before M0 / M4)

- **Jellyfin:** ✅ key in `yutopia/.env`. Before M4: a Jellyfin user for Yutopia (e.g. `yutopia`) with access to the libraries the space should see.
- **YouTube (optional):** a Data API v3 key for search + durations; without it, it's paste-a-link only.

## Risks and open questions

- **YouTube's rules:** players must be visible (≥ 200×200), with no audio-only playback and no capturing or altering the picture. That's why the world shows the thumbnail and the real picture lives in the card / Watch, and why the YouTube radio comes with its card. The iframe can't be drawn into WebGL (cross-origin). Placing the iframe *over* the glass with a CSS transform is a possible later step, but people walking in front of the TV would be hidden behind it.
- **Ads** on YouTube embeds desync people for a while; we re-seek after.
- **Jellyfin load:** one transcode per playing TV (shared by everyone watching it), capped per space; the world-server's own upload carries the viewers.
- **The key's safety:** only Yondra and the world-server ever hold it, and streams use signed short-lived tokens. Jellyfin content stays inside the space (team & friends).
- **Sync** target ±1 s. Good enough for walking by and for watching together, not lip-perfect across people.
- **Supply chain:** hls.js is the only new npm dependency (pinned, min release age). The YouTube IFrame API is a runtime script from youtube.com (YouTube requires that), allow-listed in the CSP.
- **Later, if wanted:** Spotify on the radio (each listener's own Premium via the Web Playback SDK — the only model Spotify allows). Dropped from this Fita.
- **Decided (user, 2026-10-13):** each radio / record player its own source, like each TV.
