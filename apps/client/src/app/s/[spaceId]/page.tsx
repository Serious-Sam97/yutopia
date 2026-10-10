"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { WorldView } from "@/components/hud/WorldView";

function World() {
  const params = useParams<{ spaceId: string }>();
  const search = useSearchParams();
  return <WorldView spaceId={Number(params.spaceId)} to={search.get("to")} />;
}

export default function SpacePage() {
  return (
    <Suspense>
      <World />
    </Suspense>
  );
}
