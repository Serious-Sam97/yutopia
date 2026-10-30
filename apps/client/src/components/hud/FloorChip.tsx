"use client";

import { useTr } from "@/lib/i18n";
import { useHud } from "@/world/store";

// A floor's short name on a button and a display: G for the ground, else its number. (Its own
// file: the top bar shows it, and the lift's panel loads only in an elevator's car.)
export const floorLabel = (level: number) => (level === 0 ? "G" : String(level));

// The floor I'm on, in the top bar (when the building has more than one).
export function FloorChip() {
  const t = useTr();
  const floor = useHud((s) => s.floor);
  const many = useHud((s) => s.floors.length > 1);
  if (!many) return null;
  return (
    <span className="whitespace-nowrap" data-testid="floor-chip">
      {` · ${t("floor")} ${floorLabel(floor)}`}
    </span>
  );
}
