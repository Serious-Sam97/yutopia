"use client";

import { useEffect, useState } from "react";
import { loadPeople, people } from "@/world/art/people-load";

// The people chunk for HUD pictures (faces, the turntable): null until it's here.
export function usePeople() {
  const [m, setM] = useState(people);
  useEffect(() => {
    if (!m) void loadPeople().then(setM);
  }, [m]);
  return m;
}
