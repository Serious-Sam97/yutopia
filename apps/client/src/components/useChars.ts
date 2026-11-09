"use client";

import { useEffect, useState } from "react";
import { type chars, loadChars } from "@/world/art/chars-load";

// The 3D people for HUD pictures (portraits, turntables): null until loaded.
// (the life look: once its people's files are in too — a picture tried before would be kept as
// "can't draw": docs/plan/73 4.5)
let readyC: ReturnType<typeof chars> = null;
export function useChars() {
  const [m, setM] = useState(() => readyC);
  useEffect(() => {
    if (!m)
      void loadChars()
        .then(async (C) => {
          await C.pictures().ready();
          return C;
        })
        .then((C) => {
          readyC = C;
          setM(C);
        });
  }, [m]);
  return m;
}
