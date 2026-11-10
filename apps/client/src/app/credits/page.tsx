"use client";

import Link from "next/link";
import { Brand } from "@/components/Brand";
import { Credits } from "@/components/Credits";
import { LangSwitch } from "@/components/LangSwitch";
import { useLang } from "@/lib/i18n";

// Plan 75 — the credits, public: anyone may read them, signed in or not (the authors too). The same
// list as Settings → Credits (public/credits.json).
export default function CreditsPage() {
  const pt = useLang() === "pt";
  return (
    <main className="min-h-full p-4 sm:p-8" style={{ background: "var(--bg)" }}>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between gap-4 mb-5">
          <Link href="/" aria-label="Yutopia">
            <Brand />
          </Link>
          <LangSwitch />
        </div>
        <h1 className="title text-[28px] mb-4">{pt ? "Créditos" : "Credits"}</h1>
        <Credits />
      </div>
    </main>
  );
}
