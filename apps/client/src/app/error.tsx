"use client";

import { useEffect } from "react";
import { isChunkError, reportError } from "@/lib/crash";

// A page that broke while drawing (docs/plan/72-the-3d-core.md, phase 1): said plainly, with a
// way back — try again in place, or reload (a new version out: its chunks are the old page's no
// more, and only a reload brings the new ones).
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => reportError("page", error), [error]);
  const stale = isChunkError(error);
  return (
    <main className="grid h-full w-full place-items-center bg-[var(--bg)] p-6 text-[var(--cream)]">
      <div className="max-w-md text-center">
        <h1 className="mb-2 font-[family-name:var(--font-cormorant)] text-3xl">
          {stale ? "A new version is out" : "Something broke"}
        </h1>
        <p className="mb-5 text-sm opacity-80">
          {stale
            ? "Yutopia was updated while this page was open. Reload to get the new version."
            : "This page hit a bug. It's been reported — try again, or reload."}
        </p>
        <div className="flex justify-center gap-3">
          {!stale && (
            <button type="button" className="rounded border border-current px-4 py-1.5" onClick={reset}>
              Try again
            </button>
          )}
          <button
            type="button"
            className="rounded bg-[var(--cream)] px-4 py-1.5 text-[var(--ink)]"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      </div>
    </main>
  );
}
