# Plan 109 — the bridges: their ends fixed, and bridges in God mode

Asked 2026-11-19:

> Fix Bridge and add Bridges item to god mode. The bridge closer to city has a hole on the begining and end that makes
> every jolt based model fall. And also make it customizible, selectable for God Mode and an option on God mode as well

Status: **planned 2026-11-19; forks decided 2026-11-19 one by one: F1a a stretch of a way, F2a the full set, F3a the
deck follows its road, F4b the town's removable too, F5a new roads keep their automatic bridges (editable), F6a built
straight, tested at the end. Built 2026-11-19, phases 0–6, not committed: waiting on the user's test.**

## Where we are, from the code

- A bridge isn't a thing of its own: it's a way's **bridged samples** (`grounds.ts` `layLevels`: a sample within the
  river's half + 6 m, or the ravine's half + 1.5 m; the long road's from `longroad.ts` `longBridged`). `bridgeRuns(w)`
  groups them into bridges. There are four: the county road's steel truss over the river (x≈246–279, the one by town),
  the trail's timber footbridge over the ravine, the long road's timber bridge over the creek and its high bridge over
  the gorge.
- Three things read the runs. **The walking** (`deckAt`, `layDecks`: a sample past each end). **Jolt's solids**
  (`shapes/grounds.ts` `bridges`: a 0.3 m slab per sample, the truss or railing sides). **The drawing**
  (`tp/grounds3d.ts`: the truss, the stringers and railing, or the parapets and piers; the underside). The land under
  a bridged sample isn't flattened to the way (`terrainAt`).
- God mode (plans 53, 55, 102) edits everything as `GroundsEdits` sections (`add` / `change` by key / `remove` by
  key), in a draft (`grounds-draft.ts` SECTIONS), checked by `checkEdits`, published and rolled back. Select picks
  things, buildings, ways and vehicles. Nothing picks a bridge.

## Phase 0 — the holes at the ends (done 2026-11-19)

Measured along every bridge, every 5 cm, kerb to kerb, the top of what's there (the deck's slabs, else the land)
against the road:

- **The river bridge: a slot across the whole road at each end, ~0.55 m long and 3.6–4.3 m deep.** The slabs started
  and stopped at the first and last bridged samples, but the land isn't flattened within half a sample of a bridged
  one, so the bank showed through there, under a road still drawn over it. Every wheel and every foot fell in.
- The long road's two: the same at their ends, 0.6 m deep.
- The ravine's footbridge: the rim's own ground stood 0.85–1.0 m up through its first slab (the bridged stretch runs
  1.5 m past the cut, where the land isn't levelled).

Fixed: the land is flattened at a bridge's first and last samples (its abutments), and cut wherever it stood over a
deck. The slabs run a sample on at each end, onto the road (as the walked decks always did), each 0.2 m longer than its
sample so a bend leaves no wedge open. Afterwards every bridge is within 4 cm of its road end to end. A test
(`shapes/grounds.test.ts` "every bridge…") walks them all. The fingerprints changed where they should: the five chunks
at the river bridge's and the footbridge's ends (`grounds-town.fixture.json`), and `TODAY`.

## The idea

**A bridge is a stretch of a way** (F1a), with a key, a style and its options. The town's four and every automatic one
(F5a: a road drawn over the river or the ravine still gets its own) are picked in Select like anything else, changed or
taken away (F4b: the road then runs on the land, into the water or down the ravine). The **Bridges** tool adds one
anywhere on a road, street or trail: a click on the way where it starts, another where it ends.

- **Style** (F2a): steel (a through truss), timber (stringers, a railing), concrete (parapets, piers), stone (arches
  on piers, parapets). Each with its colour.
- **Rails**: truss, railing, parapet or none. Each style's own by default.
- **Piers**: on or off (concrete and stone on by default).
- **Its stretch**: dragged along its way by either end.
- **The deck follows its road** (F3a): the way's own height, as today, never raised over another way. Under it the
  land is its own (cut where it would come through the deck), and its ends are flattened to the road.

## Data

```ts
// grounds-edits.ts
type BridgeStyle = "steel" | "timber" | "concrete" | "stone";
type BridgeRails = "truss" | "railing" | "parapet" | "none";
interface BridgeDef {
  key: string;      // a new one's "god-bridge-n"; a generated one's "<way key>~<n>", its way's n-th
  way: string;      // its way's key
  s0: number; s1: number; // where it starts and ends along its way (m from its first point)
  style: BridgeStyle;
  colour?: number;  // its style's by default
  rails?: BridgeRails;
  piers?: boolean;
}
GroundsEdits.bridges?: Section<BridgeDef>
```

`grounds.ts` lays `BRIDGES` (each: key, way, samples a–b, style, colour, rails, piers, generated or not) after the ways'
levels. It does the generator's first (with the defaults they have today: the trail's and the long road's short one
timber, the high one concrete, the river's steel), then the draft's removes, changes and adds, and sets `w.bridged`
from them. `bridgeRuns(w)` reads `BRIDGES`, so the walking, the solids and the drawing all follow.

## Phases

1. **Shared**: `BridgeDef`, the section (`grounds-draft.ts` SECTIONS, the merge), `BRIDGES` laid in `applyEdits`, the
   dirty chunks (`sigs`), `checkEdits` (its way there and not a closed loop's seam, 4–400 m, a style, rails, colour,
   at most 60 new), `grounds-bridges.ts` (keys, s ↔ samples, `bridgeAt(x, z)`, add/change/remove steps). Tests:
   the town's river bridge taken away (the road on the land, no deck solids), one added over a dip (a deck, its ends
   level), a style changed (kept on publish), a stretch dragged.
2. **Solids by style**: the rails (truss 5.2 m, railing 1.13 m, parapet 0.9 m × 0.4 m, none), the piers every ~20 m
   down to the land, the ends flush (phase 0's test over every bridge, the draft's too).
3. **Drawing by style**: steel (the truss as today), timber (as today), concrete (the high bridge's parapets and piers),
   stone (new: arches between its piers, a parapet), each in its colour, the rails as chosen, piers on or off.
4. **God mode**: Select picks a bridge (over its way: a click on its deck), Delete takes it away. Its panel: style,
   colour, rails and piers. The Bridges tool: add (start, end on a way, a ghost along the stretch), edit (drag
   either end), remove. Each a step of the draft. Words in English and Portuguese.
5. **Server**: the section checked by `checkEdits` (shared), admin-only as every God mode message (plan 48).
6. **Checks**: the shared suite, the God mode specs near it, and a drive in the game over the river bridge's ends and a
   new bridge's.

## Guardrails

- With no edits the world is today's (after phase 0): `TODAY` and the town fixture hold through phases 1–3.
- God mode stays admin-only on the server.
- Page and God chunk budgets raised as needed, measured and noted (budgets: raise freely).

## Built (2026-11-19)

- **Shared**: `grounds-edits.ts` `BridgeDef` and the `bridges` section; `grounds.ts` `BRIDGES` laid in `layLevels`
  (the generator's keyed `<way>~<n>`, the draft's over them; a generated bridge nobody touched keeps its own samples,
  so the world with no edits is exactly phase 0's), `bridgeRuns`/`bridgeAt`/`bridgePiers`/`pierSize`, the dirty chunks
  (`sigs`), `checkEdits`' rules; `grounds-bridges.ts` the draft's steps (add, change, remove, `fitSpan`, along a way);
  `grounds-draft.ts` counts and merges the section.
- **Solids** (`shapes/grounds.ts`): sides by rails (truss 5.2, railing 1.13, parapet 0.95 × 0.5, none) and the piers
  (`bridge_pier`, concrete underfoot). The river bridge's two piers on the ice are solid now: they were drawn with
  nothing there, and cars drove through them (the one change to the no-edits world past phase 0: chunk 8,−13).
- **Drawing** (`tp/grounds3d.ts` `drawBridge`): steel, timber, concrete and stone (arches between its piers), in their
  colour, their sides as chosen, piers on or off. Remade when the draft's bridges change (`grounds-stream.ts`
  `staticsOf`).
- **God mode**: the Bridges tool (last in the bar, key **B**: 1–9 stay as they were, and the number keys now compare
  as numbers), with Add (two clicks on a way), Edit (drag either end) and Remove. Select picks a bridge on its deck
  (before its way), and Delete takes it away. The panel has style, colour, sides and piers. The publish summary
  counts bridges.
- **Taking a bridge away** fills the land to its road, as every way's (a causeway across the river): the road stays
  under the wheels.
- **Checks**: the shared suite (775), `grounds-bridges.test.ts`, the bridge-ends test over every bridge, and
  `e2e/godmode-bridges.spec.ts`. That spec asks the game's own Jolt about the river bridge (worst drop 1.3 cm end to
  end), then adds, restyles, opens and takes away bridges in God mode (stills: `YUTOPIA_SHOTS`); godmode-roads and
  godmode-select still pass.
