# The day — docs/plan/31-the-day.md

How the day changed: the shadowed wait in nests, and there's a farm across
the river.

| | What |
|---|---|
| `01-day-map` | **The plan**, over the real Grounds (`day-map.html` draws it from `map.js`, the shared land's data). The day's places are hatched: the deep woods, the farm (new), the ravine, the pond, the water tower, the shed, the river's ice by the bridge, the town's edges. Never within 60 tiles of the HQ. It also shows a sample day of nests |
| `farm-day`, `farm-barn`, `farm-corn` | **The farm in the engine** (`/dev/grounds?shot=farm-…`): <br>• the red barn, its doors slid open (you walk in); <br>• the silo; <br>• the farmhouse with its porch; <br>• the lane down from the square; <br>• the fenced cornfield of dry stalks, a scarecrow in it; <br>• the tractor under snow; <br>• hay bales |
| `02-nest-asleep-farm`, `02b-nest-close-farm` | **A nest at the farm by day** (from `e2e/day.spec.ts`), asleep: <br>• squatting, folded over their knees, the shroud drawn in close; <br>• its cache (a red flare bag) in the snow among them; <br>• seen from 9 tiles, crouched, they sleep on |
| `03-nest-waking-farm` | **Walked into, it wakes**, all of it |
| `*-woods` | **The same in the deep woods** (the trees crowd the camera) |
| `farm-3p-…`, `farm-iso-…` | **The farm from `e2e/farm.spec.ts`**, in both views: <br>• at the barn's doors; <br>• inside it, with the roof's underside and trusses from first person (`farm-3p-barn-roof`); <br>• in the cornfield; <br>• inside the furnished farmhouse |
| `drops-row` | **What lies on the snow** (`e2e/drops.spec.ts`, `tp/items3d.ts`): one of each of the pockets' things, as models |
