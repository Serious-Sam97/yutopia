"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { setToken, yutopia } from "@/lib/api";
import { useTr } from "@/lib/i18n";

// Yondra → Yutopia without a second login: exchange the one-time code.
function Handoff() {
  const t = useTr();
  const router = useRouter();
  const params = useSearchParams();
  const [failed, setFailed] = useState(false);
  const once = useRef(false);

  useEffect(() => {
    if (once.current) return;
    once.current = true;
    const code = params.get("code") ?? "";
    const to = params.get("to");
    yutopia
      .exchange(code)
      .then(({ token }) => {
        setToken(token);
        router.replace(to?.startsWith("/") ? to : "/");
      })
      .catch(() => setFailed(true));
  }, [params, router]);

  return (
    <main className="min-h-full flex items-center justify-center p-4">
      <div className="cabinet p-6 text-center rise">
        <p className="lcd text-2xl">{failed ? t("handoffFail") : t("handoff")}</p>
        {failed && (
          <a className="deck-btn mt-4" href="/login">
            {t("enter")}
          </a>
        )}
      </div>
    </main>
  );
}

export default function HandoffPage() {
  return (
    <Suspense>
      <Handoff />
    </Suspense>
  );
}
