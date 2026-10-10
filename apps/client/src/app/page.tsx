"use client";

import { type AvatarLayers, DEFAULT_AVATAR } from "@yutopia/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AvatarCanvas } from "@/components/AvatarCanvas";
import { Brand } from "@/components/Brand";
import { LangSwitch } from "@/components/LangSwitch";
import { getToken, type SpaceSummary, setToken, YONDRA_APP, yutopia } from "@/lib/api";
import { useTr } from "@/lib/i18n";

export default function Lobby() {
  const t = useTr();
  const router = useRouter();
  const [spaces, setSpaces] = useState<SpaceSummary[] | null>(null);
  const [avatar, setAvatar] = useState<AvatarLayers>(DEFAULT_AVATAR);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    yutopia
      .spaces()
      .then((r) => {
        setSpaces(r.spaces);
        setAvatar(r.avatar);
        setName(r.user.name);
      })
      .catch(() => setError("failed"));
  }, [router]);

  async function signOut() {
    await yutopia.logout();
    setToken(null);
    router.replace("/login");
  }

  return (
    <main className="h-full overflow-y-auto scroll-thin">
      <div className="mx-auto max-w-5xl p-4 sm:p-8">
        <header className="flex items-center justify-between gap-4 mb-8">
          <Brand />
          <div className="flex items-center gap-2">
            <LangSwitch />
            <button type="button" className="ghost-btn" onClick={signOut}>
              {t("signOut")}
            </button>
          </div>
        </header>

        <div className="grid gap-6 md:grid-cols-[260px_1fr]">
          <section className="cabinet p-4 flex flex-col items-center rise" aria-label={t("editAvatar")}>
            <div className="vfd-window w-full flex justify-center py-2">
              <AvatarCanvas avatar={avatar} size={190} />
            </div>
            <p className="lcd text-2xl mt-3 truncate max-w-full">{name || "…"}</p>
            <Link href="/avatar" className="deck-btn mt-3 w-full">
              {t("editAvatar")}
            </Link>
          </section>

          <section className="rise" aria-labelledby="spaces-title">
            <h1
              id="spaces-title"
              className="mono uppercase tracking-widest text-xs mb-3"
              style={{ color: "var(--cream-dim)" }}
            >
              {t("pickSpace")}
            </h1>
            {error && <p role="alert">{t("failed")}</p>}
            {!spaces && !error && <p className="lcd text-xl">{t("loading")}</p>}
            {spaces?.length === 0 && (
              <div className="cabinet p-5">
                <p>{t("noSpaces")}</p>
                <a className="deck-btn mt-4" href={YONDRA_APP}>
                  Yondra
                </a>
              </div>
            )}
            <ul className="grid gap-3 sm:grid-cols-2">
              {spaces?.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/s/${s.id}`}
                    className="cabinet block p-3 group hover:brightness-110 transition"
                    aria-label={`${t("join")} ${s.name}`}
                  >
                    <div className="vfd-window px-3 py-2 flex items-center justify-between gap-3">
                      <span className="lcd text-2xl truncate">{s.name.toUpperCase()}</span>
                      <span
                        className="mono text-xs shrink-0"
                        style={{ color: s.online ? "var(--vfd)" : "var(--muted)" }}
                      >
                        {s.online ? `● ${s.online} ${t("online")}` : `○ ${t("nobody")}`}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-3 px-1">
                      <span
                        className="inline-block h-2 w-16 rounded-full"
                        style={{ background: s.color ?? "var(--rust)" }}
                      />
                      <span className="deck-btn" style={{ height: 34 }}>
                        {t("join")} →
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </main>
  );
}
