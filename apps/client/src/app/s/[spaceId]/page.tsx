"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

// Old links to a space (/s/<id>?to=…): there's one world now.
function ToWorld() {
  const router = useRouter();
  const to = useSearchParams().get("to");
  useEffect(() => router.replace(to ? `/?to=${encodeURIComponent(to)}` : "/"), [router, to]);
  return null;
}

export default function OldSpacePage() {
  return (
    <Suspense>
      <ToWorld />
    </Suspense>
  );
}
