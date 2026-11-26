// Build mode's three tabs (docs/plan/124-the-build-view.md, F3a — The Sims 3's): Buy (the catalog), Build (walls,
// floors, paint, roof, rooms, doors, windows, stairs) and Lot (layouts, setups, desks, the map). Each part works with
// one of the build controller's tools; what's shown is worked out from the tool (the e2e specs and older code set the
// tool alone), the tab deciding only among the furniture tool's three.
import type { BuildPartKey, HudState } from "@/world/store";

type B = HudState["build"];
export type Tab = B["tab"];
export type LotPart = B["lotPart"];

export interface TabView {
  tab: Tab;
  part: BuildPartKey;
  lot: LotPart;
}

const WALL_PART: Record<B["wallMode"], BuildPartKey> = {
  build: "walls",
  select: "walls",
  floors: "floors",
  paint: "paint",
  roof: "roof",
  found: "found",
  flights: "flights",
};
const FURNITURE_PARTS: BuildPartKey[] = ["doors", "windows", "stairs", "columns", "porches"];

/** What the screen shows for this state. */
export function viewOf(b: B): TabView {
  if (b.tool === "walls") return { tab: "build", part: WALL_PART[b.wallMode], lot: b.lotPart };
  if (b.tool === "rooms") return { tab: "build", part: "rooms", lot: b.lotPart };
  if (b.tool === "desks") return { tab: "lot", part: b.part, lot: "desks" };
  if (b.tool === "map") return { tab: "lot", part: b.part, lot: "map" };
  if (b.tab === "build" && FURNITURE_PARTS.includes(b.part)) return { tab: "build", part: b.part, lot: b.lotPart };
  if (b.tab === "lot" && (b.lotPart === "layouts" || b.lotPart === "setups"))
    return { tab: "lot", part: b.part, lot: b.lotPart };
  return { tab: "buy", part: b.part, lot: b.lotPart };
}

const leave = { deskDraft: null, pickSpawn: false, freeSel: null } as const;

/** Build's part: the tool and mode it works with (each keeps a brush that fits it, as the Walls panel did). */
export function partPatch(b: B, part: BuildPartKey): Partial<B> {
  const base: Partial<B> = { ...leave, tab: "build", part };
  if (part === "rooms") return { ...base, tool: "rooms" };
  if (FURNITURE_PARTS.includes(part)) return { ...base, tool: "furniture", mode: "hand", props: null };
  const wallMode: B["wallMode"] = part === "walls" ? "build" : (part as "floors" | "paint" | "roof" | "found" | "flights");
  // (plan 130: a fence's brush is a wall's too)
  const floor = !b.brush.startsWith("w:") && !b.brush.startsWith("s:");
  const patch: Partial<B> = { ...base, tool: "walls", wallMode };
  if (wallMode === "floors" && !floor) patch.brush = ".";
  if (wallMode === "build" && floor) patch.brush = "w:p";
  if (wallMode === "build" && b.paintMode === "fill") patch.paintMode = "line";
  if (wallMode === "floors" && (b.paintMode === "arc" || b.paintMode === "adjust")) patch.paintMode = "line";
  return patch;
}

/** Lot's part. */
export function lotPatch(lot: LotPart): Partial<B> {
  const base: Partial<B> = { ...leave, tab: "lot", lotPart: lot };
  if (lot === "desks") return { ...base, tool: "desks" };
  if (lot === "map") return { ...base, tool: "map" };
  return { ...base, tool: "furniture", mode: "hand", props: null };
}

/** A tab: where it was left. */
export function tabPatch(b: B, tab: Tab): Partial<B> {
  if (tab === "build") return partPatch(b, b.part);
  if (tab === "lot") return lotPatch(b.lotPart);
  return { ...leave, tab: "buy", tool: "furniture", mode: b.mode === "place" ? "place" : "hand" };
}
