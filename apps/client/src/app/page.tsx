"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { WorldView } from "@/components/hud/WorldView";

// The one world everybody walks in (?to=user:<id> takes you to someone).
function World() {
  return <WorldView to={useSearchParams().get("to")} />;
}

export default function WorldPage() {
  return (
    <Suspense>
      <World />
    </Suspense>
  );
}
