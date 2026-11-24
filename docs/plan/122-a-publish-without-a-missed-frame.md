# Plan 122 — a publish without a missed frame

Asked 2026-11-23, after the older God mode specs were fixed (b38fecf2):

> Redraw's 25 ms limit: set it to today's world, or a bigger perf job?
>
> Bigger perf job

`e2e/godmode-redraw.spec.ts` "a hill published" wants every frame under 25 ms while a hill published in the woods
is drawn where Ana stands (`YUTOPIA_GPU=1`) — no vsync missed at all. With today's world it was 50–117 ms.

Status: **built 2026-11-23, not committed.** Both tests of the spec pass, 5 runs of 5 at the end: the hill's worst
frame 17 ms, the road's 33–34 ms (its limit is 50). The God mode specs pass (11 + the redraw's 2).

## Where a publish's frame went

Measured with Chrome traces of the spec (`YUTOPIA_TRACE`) and probes in the frame (taken out again):

| cost | where | was |
| --- | --- | --- |
| a sprite's program linked mid-play | `view.puff`'s dust: a plain `toneMapped: false` sprite, never warmed | ~40 ms, once |
| the Grounds' fixed solids made again whole | shapes/grounds.ts `groundSolidsIn`, the first ask after the edit (Flowmotion's) | ~27 ms |
| the land's chunk under Ana made again | `makeChunk`, the first ask (`ontoLand`, then the feet's `footing`) | ~6 ms |
| the edit laid | `applyEdits` on the main thread | ~10 ms |
| the post-frame jobs all after the one frame | stream invalidation + solids + chunk | ~14 ms in one slot |
| several remade blocks swapped in a frame | grounds-stream `pool.made` | GPU uploads |

The frames here are GPU-bound (~13–14 ms of a 16.7 ms slot, the CPU waiting on the GPU in its draws): what's left
after a frame is ~3 ms. A job longer than that, or two in one slot, is a vsync missed.

## What was done

1. **Sprites warmed** (tp/parts/warmup.ts): with a map and without, tone-mapped and not.
2. **The fixed solids kept by piece** (shapes/grounds.ts): a building, a way's pavements, the company's fence, each
   park, the world's edge — kept from one edit to the next while their look is the same and no chunk under them was
   dropped (the rule the drawn land and Jolt's compounds follow). ~27 → ~6 ms. Test: shapes/grounds-kept.test.ts
   (the kept list is the list made whole, after a hill under the bakery, a road, a lamp gone).
3. **The solids made in steps** (`solidsInSteps`): a generator, a piece a step; asked meanwhile, the rest is made
   there and then; an edit laid midway begins it again, the chunks it was checking carried over.
4. **Flowmotion's parts forgotten after** (tp/physics3d.ts `remakeSoon`): the solids are made a slice after each
   frame first, then the moved chunks' parts are asked afresh — the old ones run a few frames meanwhile.
5. **Dropped chunks handed out as they were** (grounds.ts `remakeDroppedAfter`, the client's only): a chunk an edit
   drops is served stale when asked and made again after the frames, four rows of heights a step; its tiles'
   surfaces asked afresh after. `landReady` says yes for one being remade. Test: grounds-cache.test.ts.
6. **`applyEdits` lighter**: a grid's string the same as last time isn't decoded again; the "before" signatures are
   the last "after".
7. **The land stream's invalidation after the frame** (tp/grounds-stream.ts): edits laid meanwhile gathered into one.
8. **One job a frame** (after-frame.ts): `afterFrame` queues jobs, each in a task of its own after a frame;
   `afterFrameSteps` runs a step function 1.5 ms a slice till it's done.
9. **One remade block swapped in a frame** (grounds-stream): its old one is shown meanwhile.
10. **The water handed over by mesh** (tp/grounds3d.ts `waterStep`): each mesh's own box, and kept whatever the lists
    did when no changed chunk touches it (it's of the land by it and the dock alone).
11. **A remake begun while one's still being made** carries that one's chunks and ways (it's taken from the one
    shown, older than both) — it lost them before.

Measured after: the arrival frame's own work ~20 → ~14 ms; every post-frame job ≤ ~2 ms; a held land brush's worst
frame 17 ms (was 33).

## The road (the rest made again)

A road added made the rest (the ways, the water, the lot, the fence, the parks, the lamps…) again behind what's shown,
a step a frame or so. Its steps were far over a frame: 133 ms worst.

| step | was | now |
| --- | --- | --- |
| a way's geometry (its snow banks) | 15–55 ms | made whole by the land's workers for the rest's circle (`RestOwn`, way-piece.ts); `groundAt` measures the ways only by a bridged sample (grounds.ts `bridgedNear`); a ridge's land and snow height asked once a vertex (snow3d.ts) |
| the water | ~110 ms | handed over whatever the lists did when no changed chunk is by it — by the chunks its triangles are in (`cellsOf`), not one box round most of the map; made, a part a step (`waterMade`, a generator) |
| the company fence, the lot, the skate parks | 23 / 10 / 29 ms | handed over the same way (`keptStep`): their meshes, all they're made of, their night lights |
| the lamps | 20–40 ms | a few dozen a step, then their heads, pools and cards (`lampsMade`) |
| the swap's frame | ~45 ms | bounds worked out as each step's meshes are added (the still matrices' boxes were ~13 ms there); the water's cells worked out in a step of their own |

`stepped` (grounds3d.ts) runs a generator a part a step, put back on the queue after each. Tests: way-piece.test.ts
(a way made whole by a worker is the main thread's, moved to its corner), grounds-bridges.test.ts (`groundAt` on decks
and off them). Checked: the rest's meshes counted before a road and after it's rolled back — 1155 and the same
vertices.

Found on the way: the stream's invalidation put off a frame let the spec see "done" before a rollback's road was
taken away — the blocks are marked stale at once now, only the rest's remake waits.

## Left

- The hill's and the road's misses left are single vsyncs (33 ms) with another app on the GPU; the frames here are
  GPU-bound (~14 ms of 16.7).
- The water's first part is still ~11–13 ms, a kit building ~11 ms, the town ~10 ms: the next to split if a slower
  machine needs it.
