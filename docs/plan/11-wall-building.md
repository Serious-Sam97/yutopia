# Fita 11 — Wall building, Sims-style (plan — delivered 2026-10-15, see PROGRESS)

Ask (2026-10-15): "lets plan a improvement for wall construction, lets be
inspired on the sims, also when youre selecting a wall that is already there to
replace one side of the material, it has no indication of what youre selecting,
so lets plan a new UI and indicators".

## Where we are
- Walls live on tile edges (map v2), each solid wall has two faces with their
  own material (`hWalls` / `hBacks`, PROGRESS "Two-faced walls").
- One **Walls & floors** panel does everything with one brush: a material, half
  wall, window, door, glass door or a floor, and a mode — Line (drag along an
  edge line), Box (walls round a rectangle), Fill (a room's walls / a floor
  flood), Erase.
- The only feedback is the **edge ghost**: one edge's footprint plus a tinted
  face, olive or rust. It doesn't say *which face* a material goes on, what's
  there now, or what it will look like. In iso the far faces can't be seen at
  all. A drag shows nothing until the server answers.
- The same brush both **builds** walls and **paints** existing ones, so it's
  not obvious which will happen.

## What The Sims does that we want
| Sims | Here |
| --- | --- |
| A separate **Wall tool** and **Wall paint tool** | split Build and Paint (W2) |
| Hover shows the exact wall panel (one face, one tile) with the paint already on it, before you click | a face highlight + live preview (W1) |
| Drag a wall: the whole straight run previews with its length; it snaps to corners | a run preview with a length tag, red where it's blocked and why (W3) |
| Ctrl-drag deletes walls along the line | ⌘/Ctrl-drag in Build removes (W3) |
| Shift-click paint fills every face of the room on that side | Shift-click = the room's faces on that side (W2) |
| Eyedropper on a wall picks its paint | E over a face samples it (W2) |
| Walls up / cutaway / down | a three-way toggle in build mode, both views (W5) |
| Room tool (drag a rectangle) | Box mode, kept, gains the run preview (W3) |

Not taken: diagonal walls (our walls live on tile edges), wall heights per wall,
pushing a wall line along (maybe later; see the end).

## W1 — Indicators: what you're pointing at (first, it's the pain today)
- **Face highlight:** the one face panel under the pointer (one tile of one
  face) gets an amber outline and a soft glow on it, drawn on the face itself
  (iso: the projected face quad; 3D: a decal just off the face).
- **Live preview:** with a material brush, the highlighted panel shows that
  material at ~85% while hovering ("try it on"), across the whole drag while
  dragging. Release paints, Esc cancels.
- **Which side:** a chip by the pointer — `This side · Ana's office · Plaster → Brick`
  (the room the face looks into from `areaAt`, the current material, the new
  one). On the floor in front of the face, an arrow strip points into that room.
- **Far faces in iso:** iso can't see a wall's back face, so when the pointer
  is on the floor next to one the panel is drawn as a **ghost** (dashed outline
  plus preview, laid over the wall's top edge and a strip on the floor), the chip
  says `Far side (behind the wall)`, and the 3D view is one key away (T).
- **Flip:** Tab (walls tool) swaps the target to the same panel's other face, in
  both views. The side of the floor point stays the default.
- **Blocked:** a red panel plus the reason in the chip ("a door is there", "Whiteboard
  hangs on that wall"), the same rules as `edgeBlocker`, before you click.
- Code: a shared `faceAtPointer` (ray → face, else the floor side) used by
  hover, paint and the chip; engine `setFaceGhost(panels[], {mat, ok, ghost})`;
  `tp/build3d.ts` draws the same list in 3D.

## W2 — Paint walls, a tool of its own
- The Walls panel splits into **Build** (wall, half wall, glass wall, window,
  door, glass door; Line / Box / Erase) and **Paint** (the five materials;
  pick one, then paint faces). Floors move to their own **Floors** section with
  Line / Box / Fill.
- **Paint:** click = one panel (one face of one edge); drag = the panels along
  the line on that side; **Shift-click = every face of that room on that side**
  (the faces looking into the room the panel looks into: `setRoomWalls` grows a
  "from this face" form); **E** = sample a face's material into the brush.
- Painting never builds or removes a wall; Build never repaints an existing one
  (it says "already a wall" and skips it), so the tool always tells you what happens.
- Undo/redo: one step per stroke (already per drag).

## W3 — Building walls like The Sims
- **Run preview:** press, drag, release. While dragging, the whole straight run
  from the press point is shown as ghost walls in the chosen material, with a
  length tag (`5 tiles`) at the pointer. Segments that can't be built are red with
  the reason; they're skipped on release (today's server rules).
- **Snap:** the run starts and ends on tile corners; the press snaps to the
  nearest corner (a post where one exists), not the nearest edge. It stays on the
  line it started on (the fix of 2026-10-15) and fills every edge to the pointer.
- **Remove:** ⌘/Ctrl-drag in Build removes walls along the run (ghosts in red
  with a cross), the same as Erase without switching mode.
- **Box** keeps drawing a rectangle of walls, with the same preview and length
  tags (`4 × 3`).
- Windows and doors: hover shows the opening in the wall it would go in (frame
  ghost), red with a reason when it can't (outer walls only for windows, a
  wall on both sides for doors).

## W4 — A wall you click: the wall inspector
- With no brush (Hand in the Walls tool), clicking a wall panel **selects** it:
  outlined, with a small card — its structure (wall / half / glass / window), both
  faces with their materials and the rooms they face, and actions: **Same on both
  sides**, **Swap sides**, **Make window / Remove window**, **Remove wall** (blocked
  with the reason if something hangs on it).
- Shift-click adds panels; a dragged box selects a run; the card then edits them all.

## W5 — Seeing the walls
- Build mode gets **Walls up / Cutaway / Down** (Sims' three; keys `[` and `]`):
  up = no fading, cutaway = today's wall-down round what you point at, down =
  every wall at its skirting. Iso and 3D (3D: the fade groups).
- Down is also how iso gets at far faces: with walls down, a wall's far-side
  panel shows as a ghost strip on the floor you can paint.

## Order, and what's checked
1. W1 (indicators) — the pain today; it doesn't need W2's split.
2. W2 (paint tool) — the split makes "what will this do" obvious.
3. W3 (building like Sims).
4. W4 (inspector) and W5 (views), in either order.

Each phase: shared rules unit-tested (face under a pointer / ray, room faces,
run segments and their blockers), e2e in the Lab (hover → chip text and preview,
paint one face / Shift a room / sample; a run with a blocked tile; ⌘-drag remove;
the inspector's swap), shots in both views, Chromium here and Firefox by the user.

## Decided (user, 2026-10-15)
- Build and Paint are **two tools**.
- Far faces in iso: **ghost panel + Tab to flip + Walls up / cutaway / down**.
- Shift-click paint: **the joined faces** (round that side's loop of walls).
- Scope: **all of W1–W5**, in the order above. Pushing walls stays out.

## The questions as asked
1. **Split Build and Paint** into two tools (Sims), or keep one brush that paints
   when it's over an existing wall? *Proposed: split.*
2. **Far faces in iso:** ghost panel + Tab to flip (W1), plus Walls down (W5)?
   Or only send people to 3D for those? *Proposed: both W1 and W5.*
3. **Shift-click paint:** the room (its area) on that side, or every face joined
   to that one round a closed loop of walls (rooms that aren't areas too)?
   *Proposed: the joined faces, so it works in unnamed spaces.*
4. **Later, maybe:** push a wall line along (Sims 4's wall push, taking what hangs
   on it and the rooms with it). Big; not in this plan unless wanted.
