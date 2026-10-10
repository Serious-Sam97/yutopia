"use client";

import { createContext, useContext } from "react";
import type { WorldController } from "@/world/controller";

export const WorldCtx = createContext<WorldController | null>(null);

export function useWorld(): WorldController | null {
  return useContext(WorldCtx);
}
