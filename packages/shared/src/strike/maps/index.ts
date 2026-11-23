// The Strike Park's maps (docs/plan/114-the-strike-park.md, S-M6): all our own (F1), each measured by
// check.ts before it's played.
import type { StrikeMap } from "../map.ts";
import { BOATHOUSE } from "./boathouse.ts";
import { FREIGHT } from "./freight.ts";
import { LODGE } from "./lodge.ts";
import { RANGE } from "./range.ts";
import { SAWMILL } from "./sawmill.ts";
import { TOWER } from "./tower.ts";

export const STRIKE_MAPS: StrikeMap[] = [SAWMILL, TOWER, FREIGHT, LODGE, BOATHOUSE, RANGE];
export const strikeMap = (key: string): StrikeMap => STRIKE_MAPS.find((m) => m.key === key) ?? SAWMILL;
export { BOATHOUSE, FREIGHT, LODGE, RANGE, SAWMILL, TOWER };
