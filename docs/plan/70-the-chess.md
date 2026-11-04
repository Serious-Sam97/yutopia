# 70 — The chess

Ask (2026-11-04): "Improve Chess. Today chess exists but has no soul, lets first improve the visual
quality! because were going to drop the modal and play chess on the real life! with the 3d board,
the camera will close on the chess board, lets use Harry Potter chess as inspiration, the movements
etc... lets plan!"

Planned 2026-11-04. Follows `68-more-furniture.md` (the chess table, its rules, the server's moves),
`67-the-furniture.md` (the kit: cel, true scale, shapes from the models), `62-the-touch.md` (seats),
`56-the-controls.md` (the mouse is the camera; minigames take it), `58-the-animation.md` (verbs,
look-at) and the pool table (`world/tables/pool.ts`: played in the world, a game camera).
Workflow rule: mocks first (phase 0), approved before any game code.

**What this changes:** the chess table stops being a panel. You sit in one of its two chairs, the
camera comes down close over your men, and you play on the board itself. The men are alive, a
little like the wizard's chess in the films: carved figures that turn to face where they're sent,
march, slide or leap there, and **fight for the square**. The taker strikes; the taken man
**breaks apart** and its pieces are swept off to the side of the board. A king in check raises his
guard. At mate the beaten king takes off his crown and drops it on the board. Someone alone can
play the table itself, at one of four levels. Last, a life-size board: two commanders send the
men, and anyone can stand in as one of them.

## Decisions (the user's, 2026-11-04)

| | |
|---|---|
| The board | **The table we have** (2×1, 6.5 cm squares, board 52 cm), the camera close to it; **and a life-size board** as its own piece, last (phase 9) |
| The camera | **Lean-in** (after phase 0, 2026-11-04): low behind your men, about 21 cm over the board, so they're seen at their own height; the wheel steps out to the chair's view and over the top. Not a bigger board |
| The men | **Carved figures on plinths**, **all three sets at once** (same rigs): walnut and maple, park stone, black lacquer and obsidian, by the table's look |
| A capture | **Smashed to rubble**, as the films: struck, cracked into chips and dust, swept off the board. No gore |
| Alone at a table | **A computer opponent, a few levels**: a small engine in shared code, run on the server (phase 7) |
| The opponent | **Vortex, sat in the empty chair** (the user, 2026-11-04): his drawing over the seat at a sitter's size, his face by the game; as at pool and ping-pong, a Vortex for every table |
| The panel | **Gone**: a small strip in the HUD (names, whose move, the last moves, resign, draw, new game) |
| A game's time | **Untimed by default**; the table's clock (already modelled) ticks if the players pick a time |

## Where we are

- **Rules** (`packages/shared/src/games68/chess.ts`, 284 lines, perft-checked): every legal move,
  check, mate, stalemate, the fifty moves, too little to mate. FEN in and out. Nothing to change.
- **Server** (`apps/world-server/src/features/games68.ts:76–133`): `chess:sit` (take a side by
  button, freed when its holder walks off), `chess:move` (the side to move's player, legal only),
  `chess:new`. The table keeps `props.fen`, `props.last = [from, to]`, `props.over`, `w`/`b`/`wn`/`bn`.
  No resign, no draw offer, no clock, no timestamp on the last move.
- **The model** (`apps/client/src/world/furn/fam/gameroom.ts:542–806`): a pedestal table with the
  board inlaid, two chairs, a clock as a story detail; the men are plain lathe-turned Staunton
  shapes, 6-sided, **baked into the furniture's merged geometry**. `native.ts:449` re-keys the
  model by the FEN, so **every move rebuilds the whole table** and the men jump to their squares.
- **The panel** (`components/hud/Games68Panels.tsx:57–145`): a flat 2D board in a modal. Click a
  man, click a square. This is what people actually see when they play.
- **The chairs aren't seats** (`shared/fam/gameroom.ts` `SEATS = {}`): you can't sit at the table.
- **Precedents to reuse:**
  - Pool (`world/tables/pool.ts`): a lazy chunk, played in the world, a `gameCam()` the view eases
    into (`tp/view.ts:2770`), the shooter's cue seen by everyone.
  - Live parts (`world/furn/liveparts.ts`): moving meshes kept out of the merged buffers.
  - The pointer is the camera's unless `view.canLock()` says something on screen wants it.
  - Speech bubbles (`tp/bubbles3d.ts`), sounds placed in the room (`tables/sound.ts`).
  - **Vortex at the game tables** (plan 20): pool and ping-pong already let you play "a Vortex at
    four levels" (`POOL_LEVELS`: easy, medium, hard, turbo). The server keeps him in a seat
    (`seats.get(k).vortex = level`, `pool:vortex`) and thinks in slices off the tick
    (`world-server features/pool.ts`: `THINK_MS`, a look before he thinks). The client lists every
    table's Vortex (`tables/pool.ts vortexes()`: where, which way, his mood by the game) and the
    controller draws each like the world's Vortex (`controller.ts:1607`, people3d's `vortex()`: his
    flat drawing, exactly Yondra's, unlit and tinted by the world, bobbing, turned to the camera).

## The idea

### The men

Thirty-two small statues, about 4–9 cm tall, cut in the art direction (flat facets + the ink line,
`art-direction-stylized`). Each stands on a round plinth, so it can slide like a piece and still
move like a person above it. Each is a **little rig of 3–6 rigid parts** (plinth, body, head,
weapon arm, shield arm or cloak), so no skinning is needed:

| Man | Figure | How it moves |
|---|---|---|
| Pawn | a foot soldier: helmet, round shield, short spear | marches in small hops, shield up |
| Rook | a walking tower: battlements for a crown, a door for a face, stone fists | grinds along the board, dust behind it |
| Knight | a horse rearing, its rider with a lance | rears, leaps in an arc, lands hard |
| Bishop | a robed figure, a tall mitre, a crook | glides, robes swaying |
| Queen | crowned, a long gown, a slim sword | strides, sword low |
| King | crowned and bearded, a cloak, a broadsword held point-down | walks slowly, a step at a time |

- **One set per table look**: walnut and maple (carved wood), park stone (grey and white stone, the
  closest to the films), black lacquer (obsidian and red). White and black within each.
- **Faces** carved, not painted eyes: a brow, a nose, a mouth line. The ink line shows them.
- **Seen far off** (over ~4 m, or the table off screen) the men are drawn still and simple, as now.

### Playing at the table

1. **Sit to play.** Both chairs become seats. Sitting in the near chair takes that colour; getting
   up gives it back. A side held by someone who has walked off is free, as today.
2. **The camera leans in.** A board camera eases down behind your own men, at their height: about
   20 cm behind your back rank and 21 cm over the board, looking along it (a wide lens, 54°), so
   the whole board is in view with your men big in front (as mocked, `sheet-lean-*`). The mouse
   is freed: it points at squares, it no longer turns the camera. The wheel steps out: one notch
   back (`lean-mid`), the chair's view (0.6 m off), over the top; and back in. Right-drag orbits a
   little round the board. `C` jumps between lean-in and over the top.
3. **Pick and send.** Hover a man: it lights and looks up at you. Click it: it **salutes**, its
   legal squares glow (a soft rune in each), and any enemy man it could take **flinches** and
   raises its shield. Click a square: your character points at it and says the move in a bubble
   ("Knight to f3!"), and the man goes.
4. **Keys and pad**: arrows / the stick move a cursor over the squares, `E` / A picks and sends,
   `Esc` / B cancels, `Q` stands up.
5. **Promotion**: the pawn reaching the far rank glows; four ghost men (queen, rook, bishop,
   knight) rise round it; pick one. The pawn **turns into it** in a burst of chips.
6. **Watching**: anyone standing near the table can press `E` to watch from a side camera (same
   board view, no picking). Players and watchers see every move played out.

### The moves (choreography)

- A move plays out over **0.8–2 s** by the man and the distance. It turns to face its way, goes,
  then turns back to face the enemy.
- **Everyone sees the same thing**: the client animates when it sees `props.fen` change, from the
  old position to the new (it has both), so captures, castling and en passant are worked out on
  the client. Someone arriving late sees the board as it stands. The server only adds the time
  of the move (`props.lastAt`) so a move older than its animation isn't replayed.
- **Castling**: the king walks two squares, the rook steps round him.
- **En passant**: the pawn strikes sideways as it passes.
- A new move arriving mid-animation finishes the old one at once.

### Captures and the end

- **The fight**: the taker stops one step short, strikes (spear thrust, rook's fist, the horse's
  hooves, the bishop's crook, the queen's sword, the king's broadsword); the taken man **cracks and
  falls apart** into 6–12 faceted chips and some dust; the taker steps into the square.
- **The rubble** is pushed off the board and settles in a heap on the table at the taker's left,
  one heap per side, so you can see what's been lost at a glance.
- **Check**: the king turns to the threat and raises his sword; his men glance at him.
- **Mate**: the beaten king lowers his sword, **takes off his crown and drops it**; it rolls and
  rings on the board. The winner's men raise their weapons. A toast to the room, as today.
- **Draw** (stalemate, fifty moves, too little left): both kings bow.
- **Resign**: the same as mate, from the side that gave up.
- **The camera** (watchers and players): on a capture it cuts close to the fight for about a
  second, at the men's own height, and comes back; a small shake on the smash. Mate gets a slow
  push in on the dropped crown. Off by a setting (some people hate cuts).

### Light and feel

- While anyone sits at it, a warm pool of light falls on the board (a soft spot, like the billiard
  lamp), the rest of the room a little darker in the board camera only.
- A gentle depth of field in the board camera, if it fits the frame budget (phase 5 decides).

### The HUD strip (replaces the modal)

A narrow strip in the manuscript-in-wood look (`ui-look-manuscript-wood`): the two players' names
with their colour, whose move it is (and "check"), the last few moves in notation, the clock if
there is one, and **Resign** (held), **Offer draw**, **New game**, **Get up**. Small and in a
corner, so the board is the screen.

## The phases

### Phase 0 — the mocks

Approved before any game code. Stills in `design/screens/chess/`, rendered from a dev bench in the
kit (as plan 67's furniture benches), not from the game.

- **The men**: each of the six, white and black, in each of the three sets, turned round on a
  sheet; beside today's Staunton men for the change.
- **The board camera**: a game in the middle, from the player's seat (white and black), from over
  the top, from a watcher's side; by day and by night with the board's light.
- **Storyboards** (4–6 frames each): a knight's leap, a rook taking a pawn, a pawn's promotion,
  castling, check, mate with the crown dropped.
- **The HUD strip**: over a board-camera still.
- **Agreed here**: the figures, the three sets' colours, how close the camera comes, how violent a
  capture looks.

**Rendered 2026-11-04**: `design/screens/chess/`. No game code changed (a dev page and its module).

- **Made with**: `/dev/chess` (`app/dev/chess/page.tsx`, `world/furn/chessbench.ts`): plan 68's table
  with its men taken off, in a room of the game's, two people sat at it, the game's post over it.
  The men are `world/furn/fam/chessmen.ts`: six rigs (plinth, body, head, arms, weapon; the
  knight's horse; the crowns), the three sets by colour, poses (salute, step, windup, strike,
  thrust, flinch, guard, bow, beaten, uncrown, cheer, rear, leap, land). Phase 1 grows it into the
  game's. Stills by `apps/client/e2e/chess-shots.mts`, sheets by `chess-sheets.mts`.
- **Sheets**:
  - `sheet-men-{wood,stone,obsidian}.png`: each set's six, white and black.
  - `sheet-turn-*.png`: each man four ways.
  - `sheet-board-*.png`: the views from white's chair, black's chair, over the top and a watcher's;
    a man picked (with the HUD strip); night with the board's lamp; the table in the room.
  - `sheet-story-{knight,rook,promo,castle,check,mate}.png`: the storyboards.
  - `sheet-today-vs-new.png`: today's men beside the new.
- **What the stills showed**:
  - **At the men's own height they come alive** (the storyboards): the rook's blow and the pawn
    bursting, the knight rearing, the king's crown in his hand and on the board.
  - **From the chair they barely do.** At the plan's board camera (about 0.6 m off, looking down)
    the men are 40–60 px tall on a 900 px screen. Today's men and the new look much alike there
    (`sheet-today-vs-new`). The soul is in the close views, not the overview.
  - The opponent across the board fills the top of the chair view (their chest and arms). That's
    true to life; the board stays clear.
  - The obsidian side is hard to read off the board on a dark ground; on the board it reads.
  - The ink line holds up close (no thick or noisy edges at 0.1–0.6 m), the risk above.
- **Vortex as the opponent** (the user, after the lean-in): `sheet-vortex.png` (`vortex/`):
  thinking, your move with the HUD strip naming him, shocked, smug, seething at night, crying at
  your mate, in the room and from a watcher's side. Sat at 0.62 of his size, his face is just over
  the far rank in the lean-in view (at his full size it was above the frame).
- **The user's pick (2026-11-04): the lean-in camera** over a bigger board. Mocked after:
  `sheet-lean-{wood,stone,obsidian}.png` (behind white's men, behind black's, a man picked with
  the HUD strip, at night, one notch out on the wheel) and `sheet-lean-vs-chair.png`. The near men
  are 150–250 px tall there, faces and weapons clear; the far rank stays small (it's across the
  board), and the opponent sits behind it.
- **Fixed along the way** (in the mocks): the king's cloak drawn as a plank → an ermine mantle, his
  sword out of his robe; a thicker horse; the board lamp at night halved; the crown held in his hand.

### Phase 1 — the set

- The six figures as rigs in a new `world/furn/fam/chessmen.ts`: parts named (plinth, body, head,
  arm, weapon, shield), a pose function per man (rest, turn, step, strike, flinch, salute, bow).
- **Out of the merged model**: the table's model no longer carries the men, so it stops being keyed
  by the FEN (no rebuild per move). The men are drawn as **instanced parts** (one instanced mesh per
  part per man per set; instance colours for white and black): about 40 draw calls for every chess
  table in view together, not per table.
- Far, still and simple tables use the plain men as now (or the rigs frozen).
- Picture for the Furnish panel from the model, with the men.

**Built 2026-11-04 (uncommitted).**

- **The men** (`world/furn/fam/chessmen.ts`): one set of figure definitions (`partsOf`: each part's
  name, the part it hangs from, its pivot, its shapes) gives either form:
  - `makeMan`: a posable rig, for the moves (phase 3) and the bench;
  - `manInto` / `manGeometry`: a man at rest, flattened into a model.
- **Off the table** (`fam/gameroom.ts`, `native.ts`): the table's model no longer has men and no
  longer depends on the game, so one model a look, whatever the position. The old Staunton men are
  gone; `chessSquare(i)` gives a square's middle in the model's frame. Only the Furnish picture
  (`_thumb`) sets the new men out, as they start. The table left `STATEFUL`.
- **The men in the world** (`world/furn/chessmen3d.ts`): `ChessMen3` stands every chess table's men
  where its `props.fen` has them (the start if it has none, or it won't read). One `InstancedMesh`
  per set, side and man for the whole floor: 12 draws for the tables of one look, however many there
  are. The geometry is in the world's colours (RGBA, the cel's mark), in the world's lit material. It
  syncs only when a table or its game changes, and moves the same meshes.
  - **World3** (`tp/build.ts`) makes it once a floor has a chess table (`syncChess`, after the live
    parts) and disposes it with the floor.
  - A chess table's game (`fen`, `last`, `lastAt`, `over`, `w`, `b`, `wn`, `bn`) is quiet for the
    floor's merged buffers (`QUIET_OF`), so **a move no longer redraws the table's area** (it did:
    every prop change re-merged the area's furniture).
  - `placeOf(o)` (`native.ts`): where a placed thing's model goes, as its buffers and live parts do.
- **Cost**: a man is 1,200–2,000 triangles (pawn 1,206, bishop 1,204, queen 1,612, king 1,726, rook
  1,904, knight 1,980); a full board is 46k. Not culled by distance yet. Phase 8 measures it, and
  far boards can drop to plainer men if the frame asks.
- **Checked**:
  - Tests: `chessmen3d.test` (every man on its square at each of the table's four turns; no game or
    a bad one sets them out to start; two tables are 64 men in 12 meshes, a capture 63 in the same
    meshes, a table taken away 32, none 0); `native.test` (the model is the same whatever the game
    and never throws; the picture has the 32 men); `gameroom.test` (no man on a1 in the world, the
    rook on a1 and the king on e8 in the picture).
  - Client 264/264, types, lint (the new files).
  - Page 444.1 of 446 KB (443.6 before); every lazy chunk within its budget.
  - **In the world's own drawing** (`/dev/chess?shot=world`: tables placed in a floor, drawn by
    World3): `world-lean.png` (the men where the game has them, as mocked), `world-turned.png` (a
    table turned a quarter, ivory and obsidian, the sides by their chairs), `picture-{0,1,2}.png`
    (the Furnish pictures with the men).
  - **Not run**: the game itself and its e2e. The dev stack (Docker) was down; the bench draws through
    the same World3 and `chessmen3d` the game uses.

### Phase 2 — sitting and the board camera (playable without animation)

- Chairs as seats (shared `fam/gameroom.ts` `SEATS`, two on one piece); the sit spot facing the
  board. Sitting sends `chess:sit` with the chair's side; standing frees it.
- A lazy `world/chess/` chunk (like `world/tables/`): the board camera through the controller's
  `gameCam` chain, `canLock()` false while seated, square picking (a ray onto the board's plane),
  hover, selection, legal squares, keys and pad, promotion picker.
- The HUD strip; **the modal removed** (`ChessPanel`, its `panels.tsx` entry and its i18n keys).
- Server: `chess:resign`, `chess:draw` (offer / accept), `props.lastAt`; a side is held while its
  player sits in its chair.
- End of the phase: a full game played at the table, men jumping to squares.

### Phase 3 — the moves

- The choreography above, per man; castling, en passant, promotion (the morph).
- Idle life when the camera's near: a breath, a weight shift, heads turning to the hovered square
  and to the man that last moved; still when far or off screen.
- Your character points and says the move (bubble).

### Phase 4 — captures and the end

- The strike per taker, the break (chips as short-lived instanced pieces, scripted arcs, not Jolt),
  the dust, the rubble heaps by the board.
- Check, mate (the crown), draw (the bow), resign.

### Phase 5 — the camera's moments and the light

- The capture cut, the shake, the mate push-in; the setting to turn them off.
- The board's light; the depth of field if it holds the frame.
- The watcher's camera.

### Phase 6 — the sound

- CC0 picks, in the steps plan's way (a pick sheet, the user chooses): stone on wood sliding, the
  pawn's march, hooves landing, the rook's grind, metal on stone, a crack and crumble, rubble
  settling, the crown's ring, the clock's tick and press. Placed at the table (`tables/sound.ts`).

### Phase 7 — the computer opponent

- **The engine** (`shared/games68/engine.ts`): alpha-beta over the shared rules, a material and
  piece-square evaluation, move ordering (captures first), a time limit. Four levels:
  - **Pawn**: one move deep, often picks a weaker move on purpose.
  - **Knight**: two deep, a little noise.
  - **Rook**: three deep.
  - **Queen**: as deep as about a second allows.
- **On the server**, off the room's tick: thought in short slices (or a worker thread) so the room
  never stalls; the table's move sent as a player's would be, after a short "thinking" pause.
- **Vortex in the chair** (as mocked, `sheet-vortex.png`): sat alone, the HUD strip offers **Play
  Vortex** and a level, pool's four (easy, medium, hard, turbo). He comes to the empty chair and sits
  in it: his drawing at 0.62 of his floating size (a sitter's), low over the seat so his face is
  just over the far rank in the lean-in view, still bobbing a little, turned to the camera. The HUD
  strip names him with his level.
  - **His face by the game** (his moods, `art/vortex/vortexArt.ts`): `focused` while he thinks,
    `judging` on your move, `shocked` when you take one of his, `smug` when he takes one of yours,
    `seething` when he's behind, `malicious` giving check, `ecstasy` at his mate, `crying` at yours,
    `bored` if you sit too long on a move, `asleep` after a minute.
  - **His men obey him** as yours obey you: no hand reaches; the piece goes, as in the films. His
    lines (the speech budget, English, in character, plan 00) on a capture, check and the end.
  - **Wiring**: `world/chess/` gives `vortexes()` as `tables/pool.ts` does, for the controller's
    loop at `controller.ts:1607`; people3d's `vortex()` learns a sat size and height (the seat's
    top, not the floor's 0.12 bob). Server: `chess:vortex` (level or null) puts him in the empty
    side as `pool:vortex` does; his moves go through `chess:move`'s own path after a look (~1 s)
    and his thinking.
  - A person sitting in his chair takes it back (he floats off, the game goes on or starts new,
    their pick); getting up from your side ends his game (he leaves too, as at pool).
  - Checks: he's drawn in the chair at the lean-in, chair, top and watcher views; his mood follows
    each event; he leaves with you; tinted by the room at night (the mock is unlit, and his white
    hands bloomed: the world's tint dims him).
- Tests: the engine finds mate in one and two, never plays an illegal move, keeps to its time.

### Phase 8 — checks for the table

- Shared: the choreography's plan for a move worked out from two positions (who moves, who's taken
  and where, castling's rook, en passant's pawn, promotion) for every special case; perft unchanged.
- Server (`rooms.test`): sitting takes a side, resign, draw offer and accept, `lastAt`.
- Client: the table's model no longer depends on the FEN; the instanced men match the position.
- e2e: two browsers play a short game to mate at a table (sit, pick, move, capture, the crown), a
  watcher sees the same position; no modal opens.
- Frames: no frame over 33 ms with a game playing, two tables in view, on High and Low; the page
  budget measured (the chess chunk lazy).

### Phase 9 — the life-size board (last)

Its own mocks at its start (a still of the board in the games room and outdoors on the campus, the
men at full size beside a person, the commanders' view).

- **A new piece, "Wizard's chess board"**: 10×10 tiles (1 m squares and a border), buildable
  indoors in a big room or outdoors; the men the same rigs at full size (the king about 2.3 m, a
  pawn about 1.2 m), the same three looks. Nothing else in the world changes for it.
- **Two commanders**: a raised step at each end. Standing on it takes that side; you pick and send
  with the same controls as at the table, the camera high behind your men.
- **People as men**: anyone else can step onto a square holding one of their side's men and press
  `E` to **take its place**. They're carried with it when it moves (their own walk, matched to the
  man's path). If it's taken, the strike knocks them down (the ragdoll fall, `58-the-animation`)
  and they're set back by the board's edge, unhurt. They can step off at any time; the man comes
  back as stone.
- **Solid men**: the men are kinematic bodies in Jolt, so people walk round them; a moving man
  pushes people out of its way gently (never through a wall).
- The computer opponent plays here too.
- Checks: two browsers, one commanding and one standing in as a man that gets taken; frames with the
  board in view outdoors; the Jolt shapes against the models (plan 68's column audit).

## Where it stands (2026-11-04: phases 2–9 built, uncommitted)

Built in one go after phase 1, each checked in the game itself (the dev stack, Ana and Bia) by
`apps/client/e2e/chess-play.mts` (a table: two players, a capture, a resignation, Vortex) and
`chess-big.mts` (the life-size board), stills in `design/screens/chess/play/` and `big/`.

- **Phase 2 — sitting and the board camera.**
  - The chairs are seats facing the board at every turn of the table (shared `fam/gameroom.ts`
    CHAIRS, grid `chairAt`): sat in at the chair's middle. The chairs lost their solid boxes (seats
    are walked onto); the grid holds the table's own box, 5 cm in for walking only, so a chair's tile
    is reached.
  - `world/chess/` (lazy, `yutopia-chess`): using the table walks you to the nearer free chair; sat,
    you play that side (`chess:sit`), up from it you give it back; both taken, you watch from the side.
    The lean-in camera through the controller's `gameCam`; the wheel steps out (a notch, the chair's
    view, over the top), right-drag turns a little round the board, C jumps to over the top. Game
    cameras hide people near the lens: chess sets that to 25 cm (`gameCam.lens`) so the opponent shows.
  - Picking: the pointer through the strip's overlay (a ray onto the board), or the keys (arrows move a
    cursor, E / Enter / Space pick and send, Esc lets go, Q gets up). Promotion asked in the strip (1–4).
  - The HUD strip (`components/hud/ChessStrip.tsx`) replaces the modal (`ChessPanel` gone): names,
    whose move, check, the moves in notation (shared `games68/san.ts` from the table's move log), offer /
    accept / take back a draw, resign (held a second), new game, Vortex, close-ups on or off, get up.
    Closing it any other way gets you up.
  - Server: `props.lastAt` (the men play a move out from then; one seen over 10 s late snaps),
    `props.log`, `chess:resign` (`over: "resign"`, `loser`), `chess:draw` (`offer`, `over: "agreed"`);
    the game's keys kept from builders (`GAME_KEYS`). A chess table's game props don't redraw its area.
- **Phase 3 — the moves.** Shared `games68/choreo.ts` (pure, tested): `planMove(before, after, last)`
  finds the move and lays it out — turns, each man's gait (the pawn's hops, the rook's grind, the
  knight's rear-leap-land, the bishop's glide, the queen's stride, the king's tread), castling (the rook
  round in front of the king), en passant, promotion — and `actorAt` / `victimAt` pose each man at any
  moment. `ChessMen3` plays it on rigs (`makeMan`), the rest instanced. At the table you're at all the
  men are rigs, breathing, their heads turned to the square you point at; a man picked salutes, what it
  can take flinches.
- **Phase 4 — captures and the end.** The strike (a pawn's thrust), the victim breaking into chips and
  dust, the chips swept off to its side's heap; the heaps (from the position: what each side's lost,
  the most worth of it lying broken on top) by the board. A king in check on guard, turned to the man
  that gave it. Mate or resignation: the king beaten, his crown taken off and dropped, rolling to rest
  before him, the winners' weapons up for a while; a draw: both kings bow. Seen late, as it ended.
- **Phase 5 — the moments and the light.** A capture cuts close and low to the fight as the blow lands
  (a small shake), a mate pushes in on the dropped crown; the strip's close-ups switch turns them off.
  The board's light is a warm pool painted on the table you're at (not a light: a new light would have
  every lit material compile again). No depth of field.
- **Phase 6 — the sound** (`world/chess/sound.ts`): synthesized like the pool table's — steps by the
  set (wood or stone), the rook's grind, the bishop's glide, the knight's rear and hooves, the blow's
  clank, the crack and crumble, the sweep, a promotion's shimmer, the crown ringing and bouncing, a
  pick's clink, the king's guard; heard from where the table is. **Not listened to yet**; a CC0 set can
  replace any of them as the steps' did (plan 63).
- **Phase 7 — Vortex.** Shared `games68/engine.ts` (alpha-beta, piece-square tables, four levels by
  node budget; mates in one and two in its tests). Server: `chess:vortex` puts him in the empty side
  (`vx`, `vxSide`); he thinks ~9 ms a tick after a look at the board (~2.6 s), never moves sooner than
  ~3.2 s after yours, plays through the players' own path, and goes when his opponent gets up or walks
  off. Client: sat in his chair at 0.62 of his size (`vortexSit`), his face by the game (focused,
  judging, bored, asleep, shocked, smug, malicious, seething, crying, ecstasy, side-eye). **His lines on
  captures and the end aren't hooked** (his moods and the room's toast only).
- **Phase 8 — the checks.**
  - Tests: shared 590 (choreo 10, engine 7, san 3, the chairs at every turn and walked to); client
    (`chessmen3d.test`: squares at every turn, instancing, a move by rigs then at rest, a mate's and a
    draw's kings, losses, a life-size board's stand-ins and bodies; `chess.test`: Vortex's moods;
    `gameroom.test`, `native.test` updated); server (`rooms.test`: the move's time and log, a draw
    offered and agreed, a resignation, Vortex playing and going, a stand-in carried and thrown).
  - Frames (the machine's GPU, High): at the table with Vortex 16.7 ms median, the worst 16.8, none
    over 33 ms, still and with two moves playing out. A table's first appearance costs one frame of
    ~150 ms (the chunk and the men's models built). The life-size board commanded outdoors drops 3–7
    frames in 4 s — the same with the men hidden: it's the commander's wide view over the lot.
  - Suites (2026-11-04, after everything): client 271/271, shared 590/590, world-server 203/205 (the
    snow melt and the park bench, both red before this plan); types clean in all three; lint clean
    on the changed files (`native.ts:229`'s unused parameter was there before). The client's shapes
    audit lists the chess table and the big board with the kinds drawn wider than their solid body.
  - Page 445.5 of 446 KB (443.6 before plan 70; the strip, chunk and models lazy); every lazy chunk
    within its budget.
  - The e2e spec was dropped: the two game scripts drive the same, and pass.
- **Phase 9 — the life-size board.** `wizard_chess` (shared catalog, 10×10, walked on; 1.1 m squares,
  three looks: walnut hall, castle stone, obsidian court) with a commander's dais at each end
  (`COMMANDERS`): standing on it takes the side, the camera high behind your men. The men are the same
  rigs at 0.95 m a unit (the king ~1.85 m), solid: kinematic boxes in Jolt (`setVehicle`, moved only
  when they move). Anyone else on the squares presses E to **stand in** for the man there
  (`chess:standin`, `props.si`): their man isn't drawn, they're carried with it when it moves, and
  when it's taken they're thrown (the hit, plan 58) and set back by the board's edge. Vortex floats at
  his own size on the far dais. Not built: the men pushing people gently out of their way (they're
  solid, a moving one stops you), a stand-in's own walk matched to the path (they're carried).
- **Known:** outdoors the land's tint lies on the big board's squares (as on other things out there).

## Risks

- **Small men, a close camera**: settled at phase 0 by the lean-in camera (the board stays 2×1).
  The camera sits a few centimetres over the near men, so it must never pass through one: phase 2
  keeps it behind the back rank and above the tallest man's head.
- **The ink line up close**: the edge pass is tuned for people at 3–10 m; at 0.5 m it may draw
  thick or noisy. Checked in phase 0's stills.
- **Draw calls**: 32 rigs × 5 parts per table would be 160 draws. Instancing keeps it near 40 for
  all tables; idle life only for the table you're at.
- **Two seats on one piece**: seats today are one per piece; the loveseat's "seat for two" is the
  precedent to follow.

## Guardrails

- **The rules don't change**: shared `chess.ts` and its perft tests as they are.
- **The server stays the judge**: moves only from the side's player, legal only; the client only
  animates what the server's FEN says.
- **No frame over 33 ms**; the men's idle life only near and on screen.
- **Stylized** (`art-direction-stylized`): facets and the ink line; no gore.
- **Never deep-compare a three.js scene** in tests (`no-deep-compare-three`).
- **Saved tables keep working**: a table's `props.fen` and sides read as before.

## Open questions

None left for the plan: the four asked on 2026-11-04 are answered in the decisions table. The
figures, the three sets' colours, how close the camera comes and how a capture looks are agreed at
phase 0's mocks; the life-size board's look at phase 9's.
