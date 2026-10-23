# Loading — the world drawn before it's shown (plan — decided 2026-10-22; delivered 2026-10-22)

Entering the world lagged: the connection screen went away as soon as the room
was joined, and everything was still being built and its shaders compiled in
front of the player. Changing the view lagged too: every T press threw the 3D
view away and built it again.

## Decided (2026-10-22)

| Topic | Decision |
|---|---|
| Entry | A loading screen until the world is ready, with progress |
| Wait for | Everything: my floor, the land, the people, the shaders, **and every other floor and stairwell** |
| Iso ↔ 3D | The 3D view is still made fresh each time (nothing kept in memory), behind the loading screen every time |
| 3rd ↔ 1st | A short fade (~0.3 s), the hands/arms warmed ahead so the first switch doesn't hitch |

## How it is now

- `ConnectionOverlay` (`components/hud/Overlays.tsx`) is the only loading
  screen; it goes at `phase === "ready"` (joined, not drawn).
- After that, nothing waits:
  - the `tp/view` chunk loads and `ThirdPersonView` builds the renderer,
    `World3`, `Surroundings` and the floors below in one task;
  - shaders compile at first draw (only the grounds use `compileAsync`);
  - terrain streams at 6 ms a frame (`tp/grounds-stream.ts`) and people at
    4 ms (`CharFactory.pump`);
  - `warmUp` builds one other floor every 600 ms; `cutWarm` marks the end;
  - iso: item art shows boxes until its SVGs are drawn and prewarmed.
- `closeTp()` calls `tp.destroy()` (renderer and all); `openTp()` makes a new
  one — every shader and texture again.
- `setMode` (3rd ↔ 1st) only moves the camera; the first 1st-person switch
  builds `hands1p` / `arms3d`.

## Steps

1. **A "ready" signal with progress.**
   - `ThirdPersonView.readiness(): { done, of }` counting: the view built;
     the scene's shaders compiled ahead (`renderer.compileAsync(scene,
     camera)` after mount, for my floor, campus, sky, people, effects); the
     sun's shadow map made; the terrain around me streamed (the stream's
     queue near me empty); `charF.pending === 0`; every other floor built and
     drawn once (`warmUp` to `cutWarm`); the hands/arms built and drawn once.
   - While loading, `warmUp` runs without its 600 ms gap (the screen is
     covered, so a long frame doesn't show).
   - Iso: the grounds art drawn and the floor's item art prewarmed.
   - Ready = all counted **and** a few steady frames in a row.
   - A cap (~12 s): past it the screen goes anyway, so it can never stick.
2. **The loading screen.** `ConnectionOverlay` goes on past "ready" until
   the world is: connecting → building the world, a progress bar, then a
   fade out. Input is held until it's gone. In the HUD store: `loading:
   { on, progress, why: "enter" | "view" }`.
3. **Iso ↔ 3D behind the loading screen.**
   - `closeTp()` still destroys the 3D view (nothing kept in memory).
   - Each switch puts up the loading screen (`why: "view"`) before the
     work starts: to 3D until the new view is ready (step 1); to iso until
     the iso canvas has drawn a few steady frames.
   - In a car (which forces 3D), getting in and out the same way.
4. **3rd ↔ 1st fade.** A full-screen dark layer fades in, the camera mode is
   set at its darkest, then it fades out (~0.3 s in all). The phone's
   Photo/Selfie and build mode's chase switch the same way.
5. **Checks.**
   - Enter with the saved view iso, 3rd and 1st: the screen stays until the
     world is ready; no long frames after it goes.
   - T back and forth: the loading screen each time, no long frames once it goes.
   - Y: the fade, no hitch on the first 1st-person.
   - Frame times measured before and after (entry and each switch).
   - A broken or slow build: the cap lets the player in.

## Delivered (2026-10-22)

- **The signal.** `ThirdPersonView.readiness()` (tp/view.ts): a few frames
  drawn, the sun's shadow map, every floor and the cut (`warmUp`), the land's
  blocks and the Grounds' statics (`GroundsStream.left`), their shaders
  (`preparing`), the people (`charF.pending`); last, `compileAll` —
  `compileAsync` over the whole scene and my hands', into High's buffer as
  `warmDraw`. The controller adds the Grounds, their life and the cars'
  chunk; in iso, the drawings (`engine.artLeft()`), the land's art and the
  other floors' (`prewarmFloors`, at once behind the screen).
- **Warming.** `tp.warming` while the screen's up: `warmUp` without its
  600 ms gap, the land at 40 ms a frame (chunks generated without the
  one-a-frame break), the statics too, the people at 30 ms.
- **The screen.** `hud.loading` (`on`, `progress`, `why`); the connection
  screen goes on as "Building the world…" / "Changing the view…" with a
  24-cell VFD bar, solid, then fades (300 ms). Down when built and 10 frames
  in a row came under 50 ms, or at 15 s (a console warning lists what was
  left). Keys are held while it's up.
- **Iso ↔ 3D.** `syncView` puts the screen up, waits two frames (painted),
  then builds or drops the 3D view behind it.
- **3rd ↔ 1st.** `setMode` dips a dark veil (150 ms) when crossing into or
  out of first person and changes the camera at its bottom; my hands are made
  ahead while warming and put by (`handsSpare`) out of first person.
- **e2e.** `helpers.enter` waits for the screen too (`loaded`); a spec that
  presses T twice, or acts right after the 3D view appears, waits for it
  (first-person, third-person, phone, pets-explore). `e2e/loading.spec.ts`
  (`YUTOPIA_GPU=1` for the real GPU).
- **Known:**
  - The screen sits at `z-[30000]`: the 3D view's name tags stack by depth
    into the thousands.
  - The first switch to iso waits for the other floors' iso drawings
    (prewarmFloors), ~3 s; later ones ~0.3 s.
  - The page grew 0.9 KB gzip (555.0 → 555.9), nearly all of it the
    controller's loading code.
  - Failing before this change too (2026-10-22): car.spec "a lot car",
    floors.spec "the lot" and "the stairs by a click", hud.spec, phone.spec
    "the grid by keyboard" and "the camera".

Measured (Ana, High, saved view 3rd person, real GPU), the worst frame and
frames over 50 ms:

| | Before | After |
|---|---|---|
| Entering (first 10 s after connecting) | 1250 ms, 11 long | under the screen (~5 s); after it 33 ms, 0 |
| iso → 3D (8 s) | 983 ms, 8 long | under the screen (~2.5 s); after it 33 ms, 0 |
| 3D → iso | 17 ms | 17 ms (the first time waits for the other floors' drawings) |
| 3rd ↔ 1st | 33 ms | 33–50 ms, behind the dip |
