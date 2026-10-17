"use client";

import { useEffect, useState } from "react";
import { chars, loadChars } from "@/world/art/chars-load";

// The 3D people for HUD pictures (portraits, turntables): null until loaded.
export function useChars() {
  const [m, setM] = useState(chars);
  useEffect(() => {
    if (!m) void loadChars().then(setM);
  }, [m]);
  return m;
}
