"use client";

import { useEffect, useState } from "react";
import { loadPeople, people } from "@/world/art/people-load";

// The people chunk (the vector drawings) for HUD pictures where the 3D people
// can't draw: null until it's here (and not asked for while `want` is false).
export function usePeople(want = true) {
  const [m, setM] = useState(people);
  useEffect(() => {
    if (!m && want) void loadPeople().then(setM);
  }, [m, want]);
  return m;
}
