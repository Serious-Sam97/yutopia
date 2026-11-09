// Plan 73, phase 0b — stills (and frame runs for a loop) of /dev/life's people, on the machine's GPU.
//   node --experimental-strip-types e2e/life-bench.mts [out dir]
//   SHOTS=front-idle,…   (see SHOTS below)   FRAMES=walk,turn   (frame runs: numbered PNGs)
import { mkdirSync } from "node:fs";
import { chromium, type Page } from "@playwright/test";

const out = process.argv[2] ?? "../../design/screens/life/0b";
mkdirSync(out, { recursive: true });
const base = process.env.YUTOPIA_E2E_URL ?? "http://localhost:3100";
const want = process.env.SHOTS?.split(",");
const frames = process.env.FRAMES?.split(",") ?? [];

const SHOTS: [string, string][] = [
  ["front-idle", "t=2.4"],
  ["threeq-idle", "t=2.4&spin=35"],
  ["side-idle", "t=2.4&spin=90"],
  ["back-idle", "t=2.4&spin=180"],
  ["front-walk", "act=walk&t=3.15"],
  ["side-walk", "act=walk&t=3.15&spin=90"],
  ["night-idle", "t=2.4&spin=20&hour=22"],
  ["face-man", "face=man&t=2.4&spin=12"],
  ["face-woman", "face=woman&t=2.4&spin=-12"],
  ["face-man-side", "face=man&t=2.4&spin=70"],
  ["face-woman-side", "face=woman&t=2.4&spin=-70"],
  // the painted style beside the photo one (build_person.py --paint): photo man, painted man, photo
  // woman, painted woman
  ["style-front", "style=both&t=2.4&spin=12"],
  ["style-threeq", "style=both&t=2.4&spin=40"],
  ["style-walk", "style=both&act=walk&t=3.15&spin=60"],
  ["style-night", "style=both&t=2.4&spin=20&hour=22"],
  ["face-man-painted", "face=man&style=painted&t=2.4&spin=12"],
  ["face-woman-painted", "face=woman&style=painted&t=2.4&spin=-12"],
  // the faces pass: painted, front, ¾ and profile
  ["pf-man-front", "face=man&style=painted&t=2.4&spin=0"],
  ["pf-man-side", "face=man&style=painted&t=2.4&spin=75"],
  ["pf-woman-front", "face=woman&style=painted&t=2.4&spin=0"],
  ["pf-woman-side", "face=woman&style=painted&t=2.4&spin=-75"],
  // the people polish: the face held — open and glancing, a blink, a smile
  ["pp-man", "face=man&style=painted&t=2.4&spin=12&blink=0&eyes=0,0"],
  ["pp-man-look", "face=man&style=painted&t=2.4&spin=12&blink=0&eyes=0.8,0.1"],
  ["pp-man-blink", "face=man&style=painted&t=2.4&spin=12&blink=1"],
  ["pp-man-smile", "face=man&style=painted&t=2.4&spin=12&blink=0&smile=0.8"],
  ["pp-woman", "face=woman&style=painted&t=2.4&spin=-12&blink=0&eyes=0,0"],
  ["pp-woman-look", "face=woman&style=painted&t=2.4&spin=-12&blink=0&eyes=-0.8,0.1"],
  ["pp-woman-blink", "face=woman&style=painted&t=2.4&spin=-12&blink=1"],
  ["pp-woman-smile", "face=woman&style=painted&t=2.4&spin=-12&blink=0&smile=0.8"],
  // (4.4: the teeth and the tongue, talking)
  ["pp-man-talk", "face=man&style=painted&t=2.4&spin=12&blink=0&talk=0.9"],
  ["pp-woman-talk", "face=woman&style=painted&t=2.4&spin=-12&blink=0&talk=0.9"],
  ["pp-both", "style=painted&today=0&t=2.4&spin=25"],
  // phase 0c: a corner of a room, the life kit and today's, by day and by night
  ["room-life", "room:t=3"],
  ["room-today", "room:kit=today&t=3"],
  ["room-life-night", "room:hour=22&t=3"],
  ["room-today-night", "room:kit=today&hour=22&t=3"],
  ["room-life-close", "room:view=close&t=3"],
  ["room-life-desk", "room:view=desk&t=3"],
  // the man alone, front and ¾ (his shoulders)
  ["man-front", "who=man&style=painted&today=0&t=2.4&spin=0"],
  ["man-threeq", "who=man&style=painted&today=0&t=2.4&spin=35"],
  // phase 0d: the front of the building, the lawn, the lot — noon, 17h, night
  ["out-noon", "out:t=3"],
  ["out-dusk", "out:hour=dusk&t=3"],
  ["out-night", "out:hour=night&t=3"],
  ["out-close", "out:view=close&t=3"],
  ["out-close-night", "out:view=close&hour=night&t=3"],
  // phase 4: the three bodies (slim, regular, broad) of each, front and ¾
  ["bodies-front", "style=painted&today=0&bodies=1&t=2.4&spin=0"],
  ["bodies-threeq", "style=painted&today=0&bodies=1&t=2.4&spin=35"],
  // phase 4.2: avatars as the game makes them, in their own bodies and colours
  ["crowd-front", "today=0&crowd=8&t=2.4&spin=10"],
  ["crowd-front-b", "today=0&crowd=8&seed=3&t=2.4&spin=-10"],
  // phase 3: the material library's board — all, each family nearer, the tintables in picked colours,
  // a few close, night, Low's half-size set
  ["mat-all", "mat:"],
  ["mat-all-night", "mat:hour=22"],
  ["mat-wood", "mat:family=wood"],
  ["mat-floor", "mat:family=floor"],
  ["mat-fabric", "mat:family=fabric"],
  ["mat-fabric-tint", "mat:family=fabric&tint=1"],
  ["mat-metal-tint", "mat:family=metal&tint=1"],
  ["mat-wall-tint", "mat:family=wall&tint=1"],
  ["mat-tile-tint", "mat:family=tile&tint=1"],
  ["mat-leather-tint", "mat:family=leather&tint=1"],
  ["mat-ground", "mat:family=ground"],
  ["mat-plant", "mat:family=plant"],
  ["mat-brick", "mat:id=brick"],
  ["mat-velvet", "mat:id=velvet"],
  ["mat-floor-oak", "mat:id=floor-oak"],
  ["mat-all-half", "mat:half=1"],
  // phase 5.0: the made garments and hair, the sample — four outfits each, front, ¾, back, walking;
  // the patterns; close on the hair
  [
    "w5-man-front",
    "who=man&wear=top-tee,bottom-jeans,shoes-sneakers,hair-slick|top-shirt,bottom-shorts,shoes-sneakers,hair-slick,beard-full|top-sweater,bottom-leggings,shoes-boots,hair-long|outer-parka,bottom-jeans,shoes-boots,hat-beanie&t=2.4&spin=8",
  ],
  [
    "w5-man-threeq",
    "who=man&wear=top-tee,bottom-jeans,shoes-sneakers,hair-slick|top-shirt,bottom-shorts,shoes-sneakers,hair-slick,beard-full|top-sweater,bottom-leggings,shoes-boots,hair-long|outer-parka,bottom-jeans,shoes-boots,hat-beanie&t=2.4&spin=40",
  ],
  [
    "w5-man-back",
    "who=man&wear=top-tee,bottom-jeans,shoes-sneakers,hair-slick|top-shirt,bottom-shorts,shoes-sneakers,hair-slick,beard-full|top-sweater,bottom-leggings,shoes-boots,hair-long|outer-parka,bottom-jeans,shoes-boots,hat-beanie&t=2.4&spin=180",
  ],
  [
    "w5-man-walk",
    "who=man&wear=top-tee,bottom-jeans,shoes-sneakers,hair-slick|top-shirt,bottom-shorts,shoes-sneakers,hair-slick,beard-full|top-sweater,bottom-leggings,shoes-boots,hair-long|outer-parka,bottom-jeans,shoes-boots,hat-beanie&act=walk&t=3.15&spin=60",
  ],
  [
    "w5-woman-front",
    "who=woman&wear=top-tank,bottom-skirt,shoes-sneakers,hair-long|top-dress,shoes-boots,hair-bun|top-tee,bottom-longskirt,shoes-sneakers,hair-braids|top-sweater,bottom-jeans,shoes-boots,hair-slick&t=2.4&spin=-8",
  ],
  [
    "w5-woman-threeq",
    "who=woman&wear=top-tank,bottom-skirt,shoes-sneakers,hair-long|top-dress,shoes-boots,hair-bun|top-tee,bottom-longskirt,shoes-sneakers,hair-braids|top-sweater,bottom-jeans,shoes-boots,hair-slick&t=2.4&spin=-40",
  ],
  [
    "w5-woman-back",
    "who=woman&wear=top-tank,bottom-skirt,shoes-sneakers,hair-long|top-dress,shoes-boots,hair-bun|top-tee,bottom-longskirt,shoes-sneakers,hair-braids|top-sweater,bottom-jeans,shoes-boots,hair-slick&t=2.4&spin=180",
  ],
  [
    "w5-woman-walk",
    "who=woman&wear=top-tank,bottom-skirt,shoes-sneakers,hair-long|top-dress,shoes-boots,hair-bun|top-tee,bottom-longskirt,shoes-sneakers,hair-braids|top-sweater,bottom-jeans,shoes-boots,hair-slick&act=walk&t=3.15&spin=-60",
  ],
  [
    "w5-plaid",
    "wear=top-shirt,bottom-jeans,shoes-sneakers,hair-slick|top-tee,bottom-jeans,shoes-sneakers,hair-long&pattern=plaid&t=2.4&spin=15",
  ],
  [
    "w5-stripes",
    "wear=top-sweater,bottom-jeans,shoes-boots,hair-slick|top-tee,bottom-skirt,shoes-sneakers,hair-bun&pattern=stripes&t=2.4&spin=15",
  ],
  // (the CC0 pack's hairs, each on both: heads and shoulders in a row)
  [
    "w5-hairs-man",
    "who=man&near=1&wear=top-tee,bottom-jeans,shoes-sneakers,hair-spiky|top-tee,bottom-jeans,shoes-sneakers,hair-pixie|top-tee,bottom-jeans,shoes-sneakers,hair-slick|top-tee,bottom-jeans,shoes-sneakers,hair-bob&t=2.4&spin=20",
  ],
  [
    "w5-hairs-man-b",
    "who=man&near=1&wear=top-tee,bottom-jeans,shoes-sneakers,hair-wavy|top-tee,bottom-jeans,shoes-sneakers,hair-braids|top-tee,bottom-jeans,shoes-sneakers,hair-wavy|top-tee,bottom-jeans,shoes-sneakers,hair-long&t=2.4&spin=20",
  ],
  [
    "w5-hairs-woman",
    "who=woman&near=1&wear=top-tee,bottom-jeans,shoes-sneakers,hair-spiky|top-tee,bottom-jeans,shoes-sneakers,hair-pixie|top-tee,bottom-jeans,shoes-sneakers,hair-slick|top-tee,bottom-jeans,shoes-sneakers,hair-bob&t=2.4&spin=-20",
  ],
  [
    "w5-hairs-woman-b",
    "who=woman&near=1&wear=top-tee,bottom-jeans,shoes-sneakers,hair-wavy|top-tee,bottom-jeans,shoes-sneakers,hair-braids|top-tee,bottom-jeans,shoes-sneakers,hair-wavy|top-tee,bottom-jeans,shoes-sneakers,hair-bun&t=2.4&spin=-20",
  ],
  // (5.1: the cloth close — the library's weave on the made garments; the necklines)
  [
    "w51-cloth-man",
    "who=man&near=1&wear=top-sweater,bottom-jeans,shoes-boots,hair-slick|top-shirt,bottom-jeans,shoes-sneakers,hair-spiky&t=2.4&spin=20",
  ],
  [
    "w51-cloth-woman",
    "who=woman&near=1&wear=top-tank,bottom-skirt,shoes-sneakers,hair-bob|top-dress,shoes-boots,hair-long&t=2.4&spin=-20",
  ],
  // (5.2 batch 1: every top, five at a time, front and back)
  [
    "w52-tops-man-1",
    "who=man&wear=top-tee,bottom-jeans,shoes-sneakers,hair-slick|top-longtee,bottom-jeans,shoes-sneakers,hair-slick|top-henley,bottom-jeans,shoes-sneakers,hair-slick|top-crop,bottom-jeans,shoes-sneakers,hair-slick|top-polo,bottom-jeans,shoes-sneakers,hair-slick&t=2.4&spin=15",
  ],
  [
    "w52-tops-man-1-back",
    "who=man&wear=top-tee,bottom-jeans,shoes-sneakers,hair-slick|top-longtee,bottom-jeans,shoes-sneakers,hair-slick|top-henley,bottom-jeans,shoes-sneakers,hair-slick|top-crop,bottom-jeans,shoes-sneakers,hair-slick|top-polo,bottom-jeans,shoes-sneakers,hair-slick&t=2.4&spin=165",
  ],
  [
    "w52-tops-man-2",
    "who=man&wear=top-tank,bottom-jeans,shoes-sneakers,hair-slick|top-shirt,bottom-jeans,shoes-sneakers,hair-slick|top-flannel,bottom-jeans,shoes-sneakers,hair-slick|top-shirttie,bottom-jeans,shoes-sneakers,hair-slick|top-sweater,bottom-jeans,shoes-sneakers,hair-slick&t=2.4&spin=15",
  ],
  [
    "w52-tops-man-2-back",
    "who=man&wear=top-tank,bottom-jeans,shoes-sneakers,hair-slick|top-shirt,bottom-jeans,shoes-sneakers,hair-slick|top-flannel,bottom-jeans,shoes-sneakers,hair-slick|top-shirttie,bottom-jeans,shoes-sneakers,hair-slick|top-sweater,bottom-jeans,shoes-sneakers,hair-slick&t=2.4&spin=165",
  ],
  [
    "w52-tops-man-3",
    "who=man&wear=top-turtleneck,bottom-jeans,shoes-sneakers,hair-slick|top-sweatshirt,bottom-jeans,shoes-sneakers,hair-slick|top-hoodie,bottom-jeans,shoes-sneakers,hair-slick|top-fleece,bottom-jeans,shoes-sneakers,hair-slick|top-cardigan,bottom-jeans,shoes-sneakers,hair-slick&t=2.4&spin=15",
  ],
  [
    "w52-tops-man-3-back",
    "who=man&wear=top-turtleneck,bottom-jeans,shoes-sneakers,hair-slick|top-sweatshirt,bottom-jeans,shoes-sneakers,hair-slick|top-hoodie,bottom-jeans,shoes-sneakers,hair-slick|top-fleece,bottom-jeans,shoes-sneakers,hair-slick|top-cardigan,bottom-jeans,shoes-sneakers,hair-slick&t=2.4&spin=165",
  ],
  [
    "w52-tops-man-4",
    "who=man&wear=top-blazer,bottom-jeans,shoes-sneakers,hair-slick|top-jacket,bottom-jeans,shoes-sneakers,hair-slick|top-puffer,bottom-jeans,shoes-sneakers,hair-slick|top-dress,bottom-jeans,shoes-sneakers,hair-slick&t=2.4&spin=15",
  ],
  [
    "w52-tops-man-4-back",
    "who=man&wear=top-blazer,bottom-jeans,shoes-sneakers,hair-slick|top-jacket,bottom-jeans,shoes-sneakers,hair-slick|top-puffer,bottom-jeans,shoes-sneakers,hair-slick|top-dress,bottom-jeans,shoes-sneakers,hair-slick&t=2.4&spin=165",
  ],
  [
    "w52-tops-woman-1",
    "who=woman&wear=top-tee,bottom-jeans,shoes-sneakers,hair-bob|top-longtee,bottom-jeans,shoes-sneakers,hair-bob|top-henley,bottom-jeans,shoes-sneakers,hair-bob|top-crop,bottom-jeans,shoes-sneakers,hair-bob|top-polo,bottom-jeans,shoes-sneakers,hair-bob&t=2.4&spin=15",
  ],
  [
    "w52-tops-woman-1-back",
    "who=woman&wear=top-tee,bottom-jeans,shoes-sneakers,hair-bob|top-longtee,bottom-jeans,shoes-sneakers,hair-bob|top-henley,bottom-jeans,shoes-sneakers,hair-bob|top-crop,bottom-jeans,shoes-sneakers,hair-bob|top-polo,bottom-jeans,shoes-sneakers,hair-bob&t=2.4&spin=165",
  ],
  [
    "w52-tops-woman-2",
    "who=woman&wear=top-tank,bottom-jeans,shoes-sneakers,hair-bob|top-shirt,bottom-jeans,shoes-sneakers,hair-bob|top-flannel,bottom-jeans,shoes-sneakers,hair-bob|top-shirttie,bottom-jeans,shoes-sneakers,hair-bob|top-sweater,bottom-jeans,shoes-sneakers,hair-bob&t=2.4&spin=15",
  ],
  [
    "w52-tops-woman-2-back",
    "who=woman&wear=top-tank,bottom-jeans,shoes-sneakers,hair-bob|top-shirt,bottom-jeans,shoes-sneakers,hair-bob|top-flannel,bottom-jeans,shoes-sneakers,hair-bob|top-shirttie,bottom-jeans,shoes-sneakers,hair-bob|top-sweater,bottom-jeans,shoes-sneakers,hair-bob&t=2.4&spin=165",
  ],
  [
    "w52-tops-woman-3",
    "who=woman&wear=top-turtleneck,bottom-jeans,shoes-sneakers,hair-bob|top-sweatshirt,bottom-jeans,shoes-sneakers,hair-bob|top-hoodie,bottom-jeans,shoes-sneakers,hair-bob|top-fleece,bottom-jeans,shoes-sneakers,hair-bob|top-cardigan,bottom-jeans,shoes-sneakers,hair-bob&t=2.4&spin=15",
  ],
  [
    "w52-tops-woman-3-back",
    "who=woman&wear=top-turtleneck,bottom-jeans,shoes-sneakers,hair-bob|top-sweatshirt,bottom-jeans,shoes-sneakers,hair-bob|top-hoodie,bottom-jeans,shoes-sneakers,hair-bob|top-fleece,bottom-jeans,shoes-sneakers,hair-bob|top-cardigan,bottom-jeans,shoes-sneakers,hair-bob&t=2.4&spin=165",
  ],
  [
    "w52-tops-woman-4",
    "who=woman&wear=top-blazer,bottom-jeans,shoes-sneakers,hair-bob|top-jacket,bottom-jeans,shoes-sneakers,hair-bob|top-puffer,bottom-jeans,shoes-sneakers,hair-bob|top-dress,bottom-jeans,shoes-sneakers,hair-bob&t=2.4&spin=15",
  ],
  [
    "w52-tops-woman-4-back",
    "who=woman&wear=top-blazer,bottom-jeans,shoes-sneakers,hair-bob|top-jacket,bottom-jeans,shoes-sneakers,hair-bob|top-puffer,bottom-jeans,shoes-sneakers,hair-bob|top-dress,bottom-jeans,shoes-sneakers,hair-bob&t=2.4&spin=165",
  ],
  // (5.2 batch 2: every bottom)
  [
    "w52-bottoms-man-1",
    "who=man&wear=top-tee,bottom-jeans,shoes-sneakers,hair-slick|top-tee,bottom-trousers,shoes-sneakers,hair-slick|top-tee,bottom-chinos,shoes-sneakers,hair-slick|top-tee,bottom-suit,shoes-sneakers,hair-slick|top-tee,bottom-cargo,shoes-sneakers,hair-slick&t=2.4&spin=15",
  ],
  [
    "w52-bottoms-man-1-back",
    "who=man&wear=top-tee,bottom-jeans,shoes-sneakers,hair-slick|top-tee,bottom-trousers,shoes-sneakers,hair-slick|top-tee,bottom-chinos,shoes-sneakers,hair-slick|top-tee,bottom-suit,shoes-sneakers,hair-slick|top-tee,bottom-cargo,shoes-sneakers,hair-slick&t=2.4&spin=165",
  ],
  [
    "w52-bottoms-man-2",
    "who=man&wear=top-tee,bottom-joggers,shoes-sneakers,hair-slick|top-tee,bottom-wide,shoes-sneakers,hair-slick|top-tee,bottom-snowpants,shoes-sneakers,hair-slick|top-longtee,bottom-overalls,shoes-boots,hair-slick|top-tee,bottom-shorts,shoes-sneakers,hair-slick&t=2.4&spin=15",
  ],
  [
    "w52-bottoms-man-2-back",
    "who=man&wear=top-tee,bottom-joggers,shoes-sneakers,hair-slick|top-tee,bottom-wide,shoes-sneakers,hair-slick|top-tee,bottom-snowpants,shoes-sneakers,hair-slick|top-longtee,bottom-overalls,shoes-boots,hair-slick|top-tee,bottom-shorts,shoes-sneakers,hair-slick&t=2.4&spin=165",
  ],
  [
    "w52-bottoms-man-3",
    "who=man&wear=top-tee,bottom-leggings,shoes-sneakers,hair-slick|top-tee,bottom-skirt,shoes-sneakers,hair-slick|top-tee,bottom-pleated,shoes-sneakers,hair-slick|top-tee,bottom-longskirt,shoes-sneakers,hair-slick&t=2.4&spin=15",
  ],
  [
    "w52-bottoms-man-3-back",
    "who=man&wear=top-tee,bottom-leggings,shoes-sneakers,hair-slick|top-tee,bottom-skirt,shoes-sneakers,hair-slick|top-tee,bottom-pleated,shoes-sneakers,hair-slick|top-tee,bottom-longskirt,shoes-sneakers,hair-slick&t=2.4&spin=165",
  ],
  [
    "w52-bottoms-woman-1",
    "who=woman&wear=top-tee,bottom-jeans,shoes-sneakers,hair-bob|top-tee,bottom-trousers,shoes-sneakers,hair-bob|top-tee,bottom-chinos,shoes-sneakers,hair-bob|top-tee,bottom-suit,shoes-sneakers,hair-bob|top-tee,bottom-cargo,shoes-sneakers,hair-bob&t=2.4&spin=15",
  ],
  [
    "w52-bottoms-woman-1-back",
    "who=woman&wear=top-tee,bottom-jeans,shoes-sneakers,hair-bob|top-tee,bottom-trousers,shoes-sneakers,hair-bob|top-tee,bottom-chinos,shoes-sneakers,hair-bob|top-tee,bottom-suit,shoes-sneakers,hair-bob|top-tee,bottom-cargo,shoes-sneakers,hair-bob&t=2.4&spin=165",
  ],
  [
    "w52-bottoms-woman-2",
    "who=woman&wear=top-tee,bottom-joggers,shoes-sneakers,hair-bob|top-tee,bottom-wide,shoes-sneakers,hair-bob|top-tee,bottom-snowpants,shoes-sneakers,hair-bob|top-longtee,bottom-overalls,shoes-boots,hair-bob|top-tee,bottom-shorts,shoes-sneakers,hair-bob&t=2.4&spin=15",
  ],
  [
    "w52-bottoms-woman-2-back",
    "who=woman&wear=top-tee,bottom-joggers,shoes-sneakers,hair-bob|top-tee,bottom-wide,shoes-sneakers,hair-bob|top-tee,bottom-snowpants,shoes-sneakers,hair-bob|top-longtee,bottom-overalls,shoes-boots,hair-bob|top-tee,bottom-shorts,shoes-sneakers,hair-bob&t=2.4&spin=165",
  ],
  [
    "w52-bottoms-woman-3",
    "who=woman&wear=top-tee,bottom-leggings,shoes-sneakers,hair-bob|top-tee,bottom-skirt,shoes-sneakers,hair-bob|top-tee,bottom-pleated,shoes-sneakers,hair-bob|top-tee,bottom-longskirt,shoes-sneakers,hair-bob&t=2.4&spin=15",
  ],
  [
    "w52-bottoms-woman-3-back",
    "who=woman&wear=top-tee,bottom-leggings,shoes-sneakers,hair-bob|top-tee,bottom-skirt,shoes-sneakers,hair-bob|top-tee,bottom-pleated,shoes-sneakers,hair-bob|top-tee,bottom-longskirt,shoes-sneakers,hair-bob&t=2.4&spin=165",
  ],
  ["w52-hip-woman-tee", "who=woman&face=woman&bust=1&at=0.95&wear=top-tee,shoes-sneakers,hair-bob&t=2.4&spin=-30"],
  [
    "w52-hip-woman-jeans",
    "who=woman&face=woman&bust=1&at=0.95&wear=bottom-jeans,shoes-sneakers,hair-bob&t=2.4&spin=-30",
  ],
  [
    "w52-hip-woman",
    "who=woman&face=woman&bust=1&at=0.95&wear=top-tee,bottom-jeans,shoes-sneakers,hair-bob&t=2.4&spin=-30",
  ],
  // (5.2 batch 3: the outer layers, the shoes, what's on the head)
  [
    "w52-outer-man-1",
    "who=man&wear=top-sweater,outer-parka,bottom-jeans,shoes-boots,hair-slick|top-sweater,outer-coat,bottom-jeans,shoes-boots,hair-slick|top-sweater,outer-raincoat,bottom-jeans,shoes-boots,hair-slick|top-sweater,outer-puffer,bottom-jeans,shoes-boots,hair-slick&t=2.4&spin=15",
  ],
  [
    "w52-outer-man-1-back",
    "who=man&wear=top-sweater,outer-parka,bottom-jeans,shoes-boots,hair-slick|top-sweater,outer-coat,bottom-jeans,shoes-boots,hair-slick|top-sweater,outer-raincoat,bottom-jeans,shoes-boots,hair-slick|top-sweater,outer-puffer,bottom-jeans,shoes-boots,hair-slick&t=2.4&spin=165",
  ],
  [
    "w52-outer-man-2",
    "who=man&wear=top-sweater,outer-denim,bottom-jeans,shoes-boots,hair-slick|top-sweater,outer-sportcoat,bottom-jeans,shoes-boots,hair-slick|top-sweater,outer-vest,bottom-jeans,shoes-boots,hair-slick&t=2.4&spin=15",
  ],
  [
    "w52-outer-man-2-back",
    "who=man&wear=top-sweater,outer-denim,bottom-jeans,shoes-boots,hair-slick|top-sweater,outer-sportcoat,bottom-jeans,shoes-boots,hair-slick|top-sweater,outer-vest,bottom-jeans,shoes-boots,hair-slick&t=2.4&spin=165",
  ],
  [
    "w52-shoes-man-1",
    "who=man&feet=1&wear=top-tee,bottom-shorts,shoes-sneakers,hair-slick|top-tee,bottom-shorts,shoes-hightops,hair-slick|top-tee,bottom-shorts,shoes-runners,hair-slick|top-tee,bottom-shorts,shoes-slipons,hair-slick|top-tee,bottom-shorts,shoes-loafers,hair-slick|top-tee,bottom-shorts,shoes-flats,hair-slick&t=2.4&spin=25",
  ],
  [
    "w52-shoes-man-2",
    "who=man&feet=1&wear=top-tee,bottom-shorts,shoes-sandals,hair-slick|top-tee,bottom-shorts,shoes-laceboots,hair-slick|top-tee,bottom-shorts,shoes-boots,hair-slick|top-tee,bottom-shorts,shoes-chelsea,hair-slick|top-tee,bottom-shorts,shoes-snowboots,hair-slick&t=2.4&spin=25",
  ],
  [
    "w52-hats-man-1",
    "who=man&near=1&wear=top-tee,bottom-jeans,shoes-sneakers,hair-slick,hat-beanie|top-tee,bottom-jeans,shoes-sneakers,hair-slick,hat-pompom|top-tee,bottom-jeans,shoes-sneakers,hair-slick,hat-trapper|top-tee,bottom-jeans,shoes-sneakers,hair-slick,hat-cap|top-tee,bottom-jeans,shoes-sneakers,hair-slick,hat-visor&t=2.4&spin=25",
  ],
  [
    "w52-hats-man-2",
    "who=man&near=1&wear=top-tee,bottom-jeans,shoes-sneakers,hair-slick,hat-bucket|top-tee,bottom-jeans,shoes-sneakers,hair-slick,hat-flatcap|top-tee,bottom-jeans,shoes-sneakers,hair-slick,hat-beret|top-tee,bottom-jeans,shoes-sneakers,hair-slick,hat-bandana|top-tee,bottom-jeans,shoes-sneakers,hair-slick,hat-headband&t=2.4&spin=25",
  ],
  [
    "w52-hats-man-3",
    "who=man&near=1&wear=top-tee,bottom-jeans,shoes-sneakers,hair-slick,hat-earmuffs|top-tee,bottom-jeans,shoes-sneakers,hair-slick,hat-headphones|top-tee,bottom-jeans,shoes-sneakers,hair-slick,hat-hairclip&t=2.4&spin=25",
  ],
  [
    "w52-outer-woman-1",
    "who=woman&wear=top-sweater,outer-parka,bottom-jeans,shoes-boots,hair-bob|top-sweater,outer-coat,bottom-jeans,shoes-boots,hair-bob|top-sweater,outer-raincoat,bottom-jeans,shoes-boots,hair-bob|top-sweater,outer-puffer,bottom-jeans,shoes-boots,hair-bob&t=2.4&spin=15",
  ],
  [
    "w52-outer-woman-1-back",
    "who=woman&wear=top-sweater,outer-parka,bottom-jeans,shoes-boots,hair-bob|top-sweater,outer-coat,bottom-jeans,shoes-boots,hair-bob|top-sweater,outer-raincoat,bottom-jeans,shoes-boots,hair-bob|top-sweater,outer-puffer,bottom-jeans,shoes-boots,hair-bob&t=2.4&spin=165",
  ],
  [
    "w52-outer-woman-2",
    "who=woman&wear=top-sweater,outer-denim,bottom-jeans,shoes-boots,hair-bob|top-sweater,outer-sportcoat,bottom-jeans,shoes-boots,hair-bob|top-sweater,outer-vest,bottom-jeans,shoes-boots,hair-bob&t=2.4&spin=15",
  ],
  [
    "w52-outer-woman-2-back",
    "who=woman&wear=top-sweater,outer-denim,bottom-jeans,shoes-boots,hair-bob|top-sweater,outer-sportcoat,bottom-jeans,shoes-boots,hair-bob|top-sweater,outer-vest,bottom-jeans,shoes-boots,hair-bob&t=2.4&spin=165",
  ],
  [
    "w52-shoes-woman-1",
    "who=woman&feet=1&wear=top-tee,bottom-shorts,shoes-sneakers,hair-bob|top-tee,bottom-shorts,shoes-hightops,hair-bob|top-tee,bottom-shorts,shoes-runners,hair-bob|top-tee,bottom-shorts,shoes-slipons,hair-bob|top-tee,bottom-shorts,shoes-loafers,hair-bob|top-tee,bottom-shorts,shoes-flats,hair-bob&t=2.4&spin=25",
  ],
  [
    "w52-shoes-woman-2",
    "who=woman&feet=1&wear=top-tee,bottom-shorts,shoes-sandals,hair-bob|top-tee,bottom-shorts,shoes-laceboots,hair-bob|top-tee,bottom-shorts,shoes-boots,hair-bob|top-tee,bottom-shorts,shoes-chelsea,hair-bob|top-tee,bottom-shorts,shoes-snowboots,hair-bob&t=2.4&spin=25",
  ],
  [
    "w52-hats-woman-1",
    "who=woman&near=1&wear=top-tee,bottom-jeans,shoes-sneakers,hair-bob,hat-beanie|top-tee,bottom-jeans,shoes-sneakers,hair-bob,hat-pompom|top-tee,bottom-jeans,shoes-sneakers,hair-bob,hat-trapper|top-tee,bottom-jeans,shoes-sneakers,hair-bob,hat-cap|top-tee,bottom-jeans,shoes-sneakers,hair-bob,hat-visor&t=2.4&spin=25",
  ],
  [
    "w52-hats-woman-2",
    "who=woman&near=1&wear=top-tee,bottom-jeans,shoes-sneakers,hair-bob,hat-bucket|top-tee,bottom-jeans,shoes-sneakers,hair-bob,hat-flatcap|top-tee,bottom-jeans,shoes-sneakers,hair-bob,hat-beret|top-tee,bottom-jeans,shoes-sneakers,hair-bob,hat-bandana|top-tee,bottom-jeans,shoes-sneakers,hair-bob,hat-headband&t=2.4&spin=25",
  ],
  [
    "w52-hats-woman-3",
    "who=woman&near=1&wear=top-tee,bottom-jeans,shoes-sneakers,hair-bob,hat-earmuffs|top-tee,bottom-jeans,shoes-sneakers,hair-bob,hat-headphones|top-tee,bottom-jeans,shoes-sneakers,hair-bob,hat-hairclip&t=2.4&spin=25",
  ],
  // (5.3: every hair, five at a time, front and back; the beards)
  [
    "w53-hair-man-1",
    "who=man&near=1&wear=top-tee,bottom-jeans,shoes-sneakers,hair-short|top-tee,bottom-jeans,shoes-sneakers,hair-long|top-tee,bottom-jeans,shoes-sneakers,hair-curly|top-tee,bottom-jeans,shoes-sneakers,hair-bun|top-tee,bottom-jeans,shoes-sneakers,hair-afro&t=2.4&spin=25",
  ],
  [
    "w53-hair-man-1-back",
    "who=man&near=1&wear=top-tee,bottom-jeans,shoes-sneakers,hair-short|top-tee,bottom-jeans,shoes-sneakers,hair-long|top-tee,bottom-jeans,shoes-sneakers,hair-curly|top-tee,bottom-jeans,shoes-sneakers,hair-bun|top-tee,bottom-jeans,shoes-sneakers,hair-afro&t=2.4&spin=160",
  ],
  [
    "w53-hair-man-2",
    "who=man&near=1&wear=top-tee,bottom-jeans,shoes-sneakers,hair-bob|top-tee,bottom-jeans,shoes-sneakers,hair-mohawk|top-tee,bottom-jeans,shoes-sneakers,hair-bald|top-tee,bottom-jeans,shoes-sneakers,hair-ponytail|top-tee,bottom-jeans,shoes-sneakers,hair-buzz&t=2.4&spin=25",
  ],
  [
    "w53-hair-man-2-back",
    "who=man&near=1&wear=top-tee,bottom-jeans,shoes-sneakers,hair-bob|top-tee,bottom-jeans,shoes-sneakers,hair-mohawk|top-tee,bottom-jeans,shoes-sneakers,hair-bald|top-tee,bottom-jeans,shoes-sneakers,hair-ponytail|top-tee,bottom-jeans,shoes-sneakers,hair-buzz&t=2.4&spin=160",
  ],
  [
    "w53-hair-man-3",
    "who=man&near=1&wear=top-tee,bottom-jeans,shoes-sneakers,hair-crew|top-tee,bottom-jeans,shoes-sneakers,hair-slick|top-tee,bottom-jeans,shoes-sneakers,hair-spiky|top-tee,bottom-jeans,shoes-sneakers,hair-braids|top-tee,bottom-jeans,shoes-sneakers,hair-pixie&t=2.4&spin=25",
  ],
  [
    "w53-hair-man-3-back",
    "who=man&near=1&wear=top-tee,bottom-jeans,shoes-sneakers,hair-crew|top-tee,bottom-jeans,shoes-sneakers,hair-slick|top-tee,bottom-jeans,shoes-sneakers,hair-spiky|top-tee,bottom-jeans,shoes-sneakers,hair-braids|top-tee,bottom-jeans,shoes-sneakers,hair-pixie&t=2.4&spin=160",
  ],
  [
    "w53-hair-man-4",
    "who=man&near=1&wear=top-tee,bottom-jeans,shoes-sneakers,hair-wavy|top-tee,bottom-jeans,shoes-sneakers,hair-curtain|top-tee,bottom-jeans,shoes-sneakers,hair-locs|top-tee,bottom-jeans,shoes-sneakers,hair-topknot|top-tee,bottom-jeans,shoes-sneakers,hair-undercut&t=2.4&spin=25",
  ],
  [
    "w53-hair-man-4-back",
    "who=man&near=1&wear=top-tee,bottom-jeans,shoes-sneakers,hair-wavy|top-tee,bottom-jeans,shoes-sneakers,hair-curtain|top-tee,bottom-jeans,shoes-sneakers,hair-locs|top-tee,bottom-jeans,shoes-sneakers,hair-topknot|top-tee,bottom-jeans,shoes-sneakers,hair-undercut&t=2.4&spin=160",
  ],
  [
    "w53-hair-man-5",
    "who=man&near=1&wear=top-tee,bottom-jeans,shoes-sneakers,hair-fade|top-tee,bottom-jeans,shoes-sneakers,hair-pigtails|top-tee,bottom-jeans,shoes-sneakers,hair-highpony|top-tee,bottom-jeans,shoes-sneakers,hair-cornrows|top-tee,bottom-jeans,shoes-sneakers,hair-swept&t=2.4&spin=25",
  ],
  [
    "w53-hair-man-5-back",
    "who=man&near=1&wear=top-tee,bottom-jeans,shoes-sneakers,hair-fade|top-tee,bottom-jeans,shoes-sneakers,hair-pigtails|top-tee,bottom-jeans,shoes-sneakers,hair-highpony|top-tee,bottom-jeans,shoes-sneakers,hair-cornrows|top-tee,bottom-jeans,shoes-sneakers,hair-swept&t=2.4&spin=160",
  ],
  [
    "w53-hair-woman-1",
    "who=woman&near=1&wear=top-tee,bottom-jeans,shoes-sneakers,hair-short|top-tee,bottom-jeans,shoes-sneakers,hair-long|top-tee,bottom-jeans,shoes-sneakers,hair-curly|top-tee,bottom-jeans,shoes-sneakers,hair-bun|top-tee,bottom-jeans,shoes-sneakers,hair-afro&t=2.4&spin=25",
  ],
  [
    "w53-hair-woman-1-back",
    "who=woman&near=1&wear=top-tee,bottom-jeans,shoes-sneakers,hair-short|top-tee,bottom-jeans,shoes-sneakers,hair-long|top-tee,bottom-jeans,shoes-sneakers,hair-curly|top-tee,bottom-jeans,shoes-sneakers,hair-bun|top-tee,bottom-jeans,shoes-sneakers,hair-afro&t=2.4&spin=160",
  ],
  [
    "w53-hair-woman-2",
    "who=woman&near=1&wear=top-tee,bottom-jeans,shoes-sneakers,hair-bob|top-tee,bottom-jeans,shoes-sneakers,hair-mohawk|top-tee,bottom-jeans,shoes-sneakers,hair-bald|top-tee,bottom-jeans,shoes-sneakers,hair-ponytail|top-tee,bottom-jeans,shoes-sneakers,hair-buzz&t=2.4&spin=25",
  ],
  [
    "w53-hair-woman-2-back",
    "who=woman&near=1&wear=top-tee,bottom-jeans,shoes-sneakers,hair-bob|top-tee,bottom-jeans,shoes-sneakers,hair-mohawk|top-tee,bottom-jeans,shoes-sneakers,hair-bald|top-tee,bottom-jeans,shoes-sneakers,hair-ponytail|top-tee,bottom-jeans,shoes-sneakers,hair-buzz&t=2.4&spin=160",
  ],
  [
    "w53-hair-woman-3",
    "who=woman&near=1&wear=top-tee,bottom-jeans,shoes-sneakers,hair-crew|top-tee,bottom-jeans,shoes-sneakers,hair-slick|top-tee,bottom-jeans,shoes-sneakers,hair-spiky|top-tee,bottom-jeans,shoes-sneakers,hair-braids|top-tee,bottom-jeans,shoes-sneakers,hair-pixie&t=2.4&spin=25",
  ],
  [
    "w53-hair-woman-3-back",
    "who=woman&near=1&wear=top-tee,bottom-jeans,shoes-sneakers,hair-crew|top-tee,bottom-jeans,shoes-sneakers,hair-slick|top-tee,bottom-jeans,shoes-sneakers,hair-spiky|top-tee,bottom-jeans,shoes-sneakers,hair-braids|top-tee,bottom-jeans,shoes-sneakers,hair-pixie&t=2.4&spin=160",
  ],
  [
    "w53-hair-woman-4",
    "who=woman&near=1&wear=top-tee,bottom-jeans,shoes-sneakers,hair-wavy|top-tee,bottom-jeans,shoes-sneakers,hair-curtain|top-tee,bottom-jeans,shoes-sneakers,hair-locs|top-tee,bottom-jeans,shoes-sneakers,hair-topknot|top-tee,bottom-jeans,shoes-sneakers,hair-undercut&t=2.4&spin=25",
  ],
  [
    "w53-hair-woman-4-back",
    "who=woman&near=1&wear=top-tee,bottom-jeans,shoes-sneakers,hair-wavy|top-tee,bottom-jeans,shoes-sneakers,hair-curtain|top-tee,bottom-jeans,shoes-sneakers,hair-locs|top-tee,bottom-jeans,shoes-sneakers,hair-topknot|top-tee,bottom-jeans,shoes-sneakers,hair-undercut&t=2.4&spin=160",
  ],
  [
    "w53-hair-woman-5",
    "who=woman&near=1&wear=top-tee,bottom-jeans,shoes-sneakers,hair-fade|top-tee,bottom-jeans,shoes-sneakers,hair-pigtails|top-tee,bottom-jeans,shoes-sneakers,hair-highpony|top-tee,bottom-jeans,shoes-sneakers,hair-cornrows|top-tee,bottom-jeans,shoes-sneakers,hair-swept&t=2.4&spin=25",
  ],
  [
    "w53-hair-woman-5-back",
    "who=woman&near=1&wear=top-tee,bottom-jeans,shoes-sneakers,hair-fade|top-tee,bottom-jeans,shoes-sneakers,hair-pigtails|top-tee,bottom-jeans,shoes-sneakers,hair-highpony|top-tee,bottom-jeans,shoes-sneakers,hair-cornrows|top-tee,bottom-jeans,shoes-sneakers,hair-swept&t=2.4&spin=160",
  ],
  [
    "w53-beard-1",
    "who=man&near=1&wear=top-tee,bottom-jeans,shoes-sneakers,hair-short,beard-full|top-tee,bottom-jeans,shoes-sneakers,hair-short,beard-boxed|top-tee,bottom-jeans,shoes-sneakers,hair-short,beard-stubble|top-tee,bottom-jeans,shoes-sneakers,hair-short,beard-mustache&t=2.4&spin=20",
  ],
  [
    "w53-beard-2",
    "who=man&near=1&wear=top-tee,bottom-jeans,shoes-sneakers,hair-short,beard-goatee|top-tee,bottom-jeans,shoes-sneakers,hair-short,beard-chinstrap|top-tee,bottom-jeans,shoes-sneakers,hair-short,beard-muttonchops&t=2.4&spin=20",
  ],
  ["w53-beard-full", "who=man&face=man&wear=top-tee,bottom-jeans,shoes-sneakers,hair-short,beard-full&t=2.4&spin=30"],
  ["w53-beard-boxed", "who=man&face=man&wear=top-tee,bottom-jeans,shoes-sneakers,hair-short,beard-boxed&t=2.4&spin=30"],
  [
    "w53-beard-stubble",
    "who=man&face=man&wear=top-tee,bottom-jeans,shoes-sneakers,hair-short,beard-stubble&t=2.4&spin=30",
  ],
  [
    "w53-beard-mustache",
    "who=man&face=man&wear=top-tee,bottom-jeans,shoes-sneakers,hair-short,beard-mustache&t=2.4&spin=30",
  ],
  [
    "w53-beard-goatee",
    "who=man&face=man&wear=top-tee,bottom-jeans,shoes-sneakers,hair-short,beard-goatee&t=2.4&spin=30",
  ],
  [
    "w53-beard-chinstrap",
    "who=man&face=man&wear=top-tee,bottom-jeans,shoes-sneakers,hair-short,beard-chinstrap&t=2.4&spin=30",
  ],
  [
    "w53-beard-muttonchops",
    "who=man&face=man&wear=top-tee,bottom-jeans,shoes-sneakers,hair-short,beard-muttonchops&t=2.4&spin=30",
  ],
  // (the beard and the long hair, close)
  ["w5-beard", "who=man&face=man&wear=top-shirt,bottom-jeans,shoes-sneakers,hair-slick,beard-full&t=2.4&spin=15"],
  [
    "w5-beard-threeq",
    "who=man&face=man&wear=top-shirt,bottom-jeans,shoes-sneakers,hair-slick,beard-full&t=2.4&spin=45",
  ],
  ["w5-beard-front", "who=man&face=man&wear=top-shirt,bottom-jeans,shoes-sneakers,hair-slick,beard-full&t=2.4&spin=0"],
  ["w5-beard-side", "who=man&face=man&wear=top-shirt,bottom-jeans,shoes-sneakers,hair-slick,beard-full&t=2.4&spin=70"],
  ["w5-long-man", "who=man&face=man&bust=1&wear=top-sweater,bottom-jeans,shoes-boots,hair-long&t=2.4&spin=20"],
  ["w5-long-woman", "who=woman&face=woman&bust=1&wear=top-tank,bottom-skirt,shoes-sneakers,hair-long&t=2.4&spin=-20"],
  ["w5-long-back", "who=woman&face=woman&bust=1&wear=top-tank,bottom-skirt,shoes-sneakers,hair-long&t=2.4&spin=160"],
  // (the glasses and the extras, props.py)
  [
    "w57-eyewear-man-1",
    "who=man&near=1&wear=top-tee,bottom-jeans,shoes-sneakers,hair-slick,eyewear-glasses|top-tee,bottom-jeans,shoes-sneakers,hair-slick,eyewear-round|top-tee,bottom-jeans,shoes-sneakers,hair-slick,eyewear-sunglasses|top-tee,bottom-jeans,shoes-sneakers,hair-slick,eyewear-aviators&t=2.4&spin=20",
  ],
  [
    "w57-eyewear-man-2",
    "who=man&near=1&wear=top-tee,bottom-jeans,shoes-sneakers,hair-slick,eyewear-cateye|top-tee,bottom-jeans,shoes-sneakers,hair-slick,eyewear-halfrim|top-tee,bottom-jeans,shoes-sneakers,hair-slick,eyewear-goggles&t=2.4&spin=20",
  ],
  [
    "w57-eyewear-side",
    "who=man&near=1&wear=top-tee,bottom-jeans,shoes-sneakers,hair-slick,eyewear-glasses|top-tee,bottom-jeans,shoes-sneakers,hair-slick,eyewear-round|top-tee,bottom-jeans,shoes-sneakers,hair-slick,eyewear-sunglasses|top-tee,bottom-jeans,shoes-sneakers,hair-slick,eyewear-aviators&t=2.4&spin=80",
  ],
  [
    "w57-eyewear-woman",
    "who=woman&near=1&wear=top-tee,bottom-jeans,shoes-sneakers,hair-bun,eyewear-aviators|top-tee,bottom-jeans,shoes-sneakers,hair-bun,eyewear-cateye|top-tee,bottom-jeans,shoes-sneakers,hair-bun,eyewear-halfrim|top-tee,bottom-jeans,shoes-sneakers,hair-bun,eyewear-goggles&t=2.4&spin=-20",
  ],
  [
    "w57-face-glasses",
    "who=man&face=man&wear=top-tee,bottom-jeans,shoes-sneakers,hair-slick,eyewear-glasses&t=2.4&spin=25",
  ],
  [
    "w57-face-round",
    "who=man&face=man&wear=top-tee,bottom-jeans,shoes-sneakers,hair-slick,eyewear-round&t=2.4&spin=25",
  ],
  [
    "w57-face-sunglasses",
    "who=man&face=man&wear=top-tee,bottom-jeans,shoes-sneakers,hair-slick,eyewear-sunglasses&t=2.4&spin=25",
  ],
  [
    "w57-face-aviators",
    "who=man&face=man&wear=top-tee,bottom-jeans,shoes-sneakers,hair-slick,eyewear-aviators&t=2.4&spin=25",
  ],
  [
    "w57-face-cateye",
    "who=man&face=man&wear=top-tee,bottom-jeans,shoes-sneakers,hair-slick,eyewear-cateye&t=2.4&spin=25",
  ],
  [
    "w57-face-halfrim",
    "who=man&face=man&wear=top-tee,bottom-jeans,shoes-sneakers,hair-slick,eyewear-halfrim&t=2.4&spin=25",
  ],
  [
    "w57-face-goggles",
    "who=man&face=man&wear=top-tee,bottom-jeans,shoes-sneakers,hair-slick,eyewear-goggles&t=2.4&spin=25",
  ],
  [
    "w57-face-glasses-side",
    "who=man&face=man&wear=top-tee,bottom-jeans,shoes-sneakers,hair-slick,eyewear-glasses&t=2.4&spin=75",
  ],
  [
    "w57-face-goggles-back",
    "who=man&face=man&wear=top-tee,bottom-jeans,shoes-sneakers,hair-slick,eyewear-goggles&t=2.4&spin=150",
  ],
  [
    "w57-face-earrings",
    "who=woman&face=woman&wear=top-tee,bottom-jeans,shoes-sneakers,hair-bun,extra-earrings&t=2.4&spin=-40",
  ],
  [
    "w57-face-fannypack",
    "who=man&face=man&bust=1&at=1.0&wear=top-tee,bottom-jeans,shoes-sneakers,hair-slick,extra-fannypack&t=2.4&spin=40",
  ],
  [
    "w57-face-backpack",
    "who=man&face=man&bust=1&at=1.3&wear=top-tee,bottom-jeans,shoes-sneakers,hair-slick,extra-backpack&t=2.4&spin=130",
  ],
  [
    "w57-extras-man-1",
    "who=man&wear=top-tee,bottom-jeans,shoes-sneakers,hair-slick,extra-walkman|top-tee,bottom-jeans,shoes-sneakers,hair-slick,extra-scarf|top-tee,bottom-jeans,shoes-sneakers,hair-slick,extra-earrings|top-tee,bottom-jeans,shoes-sneakers,hair-slick,extra-necklace|top-tee,bottom-jeans,shoes-sneakers,hair-slick,extra-backpack&t=2.4&spin=20",
  ],
  [
    "w57-extras-man-2",
    "who=man&wear=top-tee,bottom-jeans,shoes-sneakers,hair-slick,extra-watch|top-tee,bottom-jeans,shoes-sneakers,hair-slick,extra-crossbody|top-tee,bottom-jeans,shoes-sneakers,hair-slick,extra-mittens|top-tee,bottom-jeans,shoes-sneakers,hair-slick,extra-bracelets|top-tee,bottom-jeans,shoes-sneakers,hair-slick,extra-tie&t=2.4&spin=20",
  ],
  [
    "w57-extras-man-3",
    "who=man&wear=top-tee,bottom-jeans,shoes-sneakers,hair-slick,extra-lanyard|top-tee,bottom-jeans,shoes-sneakers,hair-slick,extra-tote|top-tee,bottom-jeans,shoes-sneakers,hair-slick,extra-fannypack|top-tee,bottom-jeans,shoes-sneakers,hair-slick,extra-satchel&t=2.4&spin=20",
  ],
  [
    "w57-extras-man-1-back",
    "who=man&wear=top-tee,bottom-jeans,shoes-sneakers,hair-slick,extra-walkman|top-tee,bottom-jeans,shoes-sneakers,hair-slick,extra-scarf|top-tee,bottom-jeans,shoes-sneakers,hair-slick,extra-earrings|top-tee,bottom-jeans,shoes-sneakers,hair-slick,extra-necklace|top-tee,bottom-jeans,shoes-sneakers,hair-slick,extra-backpack&t=2.4&spin=160",
  ],
  [
    "w57-extras-man-3-back",
    "who=man&wear=top-tee,bottom-jeans,shoes-sneakers,hair-slick,extra-lanyard|top-tee,bottom-jeans,shoes-sneakers,hair-slick,extra-tote|top-tee,bottom-jeans,shoes-sneakers,hair-slick,extra-fannypack|top-tee,bottom-jeans,shoes-sneakers,hair-slick,extra-satchel&t=2.4&spin=160",
  ],
  [
    "w57-extras-woman-1",
    "who=woman&wear=top-tee,bottom-jeans,shoes-sneakers,hair-bun,extra-walkman|top-tee,bottom-jeans,shoes-sneakers,hair-bun,extra-scarf|top-tee,bottom-jeans,shoes-sneakers,hair-bun,extra-earrings|top-tee,bottom-jeans,shoes-sneakers,hair-bun,extra-necklace|top-tee,bottom-jeans,shoes-sneakers,hair-bun,extra-backpack|top-tee,bottom-jeans,shoes-sneakers,hair-bun,extra-watch|top-tee,bottom-jeans,shoes-sneakers,hair-bun,extra-crossbody&t=2.4&spin=-20",
  ],
  [
    "w57-extras-woman-2",
    "who=woman&wear=top-tee,bottom-jeans,shoes-sneakers,hair-bun,extra-mittens|top-tee,bottom-jeans,shoes-sneakers,hair-bun,extra-bracelets|top-tee,bottom-jeans,shoes-sneakers,hair-bun,extra-tie|top-tee,bottom-jeans,shoes-sneakers,hair-bun,extra-lanyard|top-tee,bottom-jeans,shoes-sneakers,hair-bun,extra-tote|top-tee,bottom-jeans,shoes-sneakers,hair-bun,extra-fannypack|top-tee,bottom-jeans,shoes-sneakers,hair-bun,extra-satchel&t=2.4&spin=-20",
  ],
  [
    "w57-extras-walk",
    "who=man&wear=top-tee,bottom-jeans,shoes-sneakers,hair-slick,extra-walkman|top-tee,bottom-jeans,shoes-sneakers,hair-slick,extra-scarf|top-tee,bottom-jeans,shoes-sneakers,hair-slick,extra-earrings|top-tee,bottom-jeans,shoes-sneakers,hair-slick,extra-necklace|top-tee,bottom-jeans,shoes-sneakers,hair-slick,extra-backpack&act=walk&t=3.15&spin=60",
  ],
  [
    "w5-night",
    "wear=top-tee,bottom-jeans,shoes-sneakers,hair-slick|top-dress,shoes-boots,hair-bun&t=2.4&spin=20&hour=22",
  ],
];

const browser = await chromium.launch({ args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on("pageerror", (e) => console.log("  page:", e.message));
page.on("console", (m) => m.text().startsWith("life ") && console.log("  ", m.text()));

async function shot(p: Page, query: string, file: string) {
  // ("room:…" is /dev/life/room's, phase 0c)
  const [path, qs] = query.startsWith("room:")
    ? ["/dev/life/room", query.slice(5)]
    : query.startsWith("out:")
      ? ["/dev/life/outside", query.slice(4)]
      : query.startsWith("mat:")
        ? ["/dev/life/materials", query.slice(4)]
        : ["/dev/life", query];
  await p.goto(`${base}${path}?${qs}`);
  await p.waitForFunction(() => (window as unknown as { __life?: { ready: boolean } }).__life?.ready, null, {
    timeout: 120_000,
  });
  await p.screenshot({ path: file });
  console.log(file);
}

for (const [name, q] of SHOTS) {
  if (want && !want.includes(name)) continue;
  await shot(page, q, `${out}/${name}.png`);
}
// frame runs, for a loop: the walk over one stride, a turn on the spot
const N = 36;
for (const run of frames) {
  mkdirSync(`${out}/${run}`, { recursive: true });
  for (let i = 0; i < N; i++) {
    const q =
      run === "walk"
        ? `act=walk&spin=60&t=${(3 + (i / N) * 1.5).toFixed(3)}`
        : `t=2.4&spin=${((i / N) * 360).toFixed(1)}`;
    await shot(page, q, `${out}/${run}/${String(i).padStart(3, "0")}.png`);
  }
}
await browser.close();
