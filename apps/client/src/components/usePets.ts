"use client";

import { useEffect, useState } from "react";
import { loadPets, pets } from "@/world/art/pets-load";

// The pets' drawings for HUD pictures (portraits, the panel's preview): null until loaded.
export function usePets() {
  const [m, setM] = useState(pets);
  useEffect(() => {
    if (!m) void loadPets().then(setM);
  }, [m]);
  return m;
}
