"use client";

import { type AvatarLayers, DEFAULT_AVATAR } from "@yutopia/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AvatarCanvas } from "@/components/AvatarCanvas";
import { Brand } from "@/components/Brand";
import { Face } from "@/components/hud/Face";
import { LangSwitch } from "@/components/LangSwitch";
import { StudioThumb } from "@/components/StudioThumb";
import { getToken, type SpaceSummary, setToken, YONDRA_APP, yutopia } from "@/lib/api";
import { useTr } from "@/lib/i18n";

// The lobby: who you are, and every studio you can walk into — each one as a
// little picture of its building (theme, hour, a lit window per person inside)
// with the faces of whoever's there. Busy studios first.
export default function Lobby() {
  const t = useTr();
  const router = useRouter();
  const [spaces, setSpaces] = useState<SpaceSummary[] | null>(null);
  const [avatar, setAvatar] = useState<AvatarLayers>(DEFAULT_AVATAR);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    yutopia
      .spaces()
      .then((r) => {
        setSpaces([...r.spaces].sort((a, b) => b.online - a.online || a.name.localeCompare(b.name)));
        setAvatar(r.avatar);
        setName(r.user.name);
      })
      .catch(() => setError("failed"));
  }, [router]);

  useEffect(() => {
    setNow(new Date());
    const i = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(i);
  }, []);

  async function signOut() {
    await yutopia.logout();
    setToken(null);
    router.replace("/login");
  }

  const hour = now ? now.getHours() + now.getMinutes() / 60 : 12;
  const hello = t(hour < 12 ? "hello_morning" : hour < 18 ? "hello_afternoon" : "hello_evening");
  const first = name.split(" ")[0];
  const inside = spaces?.reduce((n, s) => n + s.online, 0) ?? 0;
  const clock = now ? now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--";

  return (
    <main
      className="h-full overflow-y-auto scroll-thin"
      style={{ background: "radial-gradient(ellipse at 30% -10%, #3a2618 0%, transparent 60%), var(--bg, #14100c)" }}
    >
      <div className="mx-auto max-w-6xl p-4 sm:p-8">
        <header className="flex items-center justify-between gap-3 mb-8">
          <Brand />
          <div className="flex items-center gap-2">
            <div className="vfd-window hidden sm:flex items-center px-3 h-10" aria-hidden>
              <span className="lcd text-2xl leading-none">{clock}</span>
            </div>
            <LangSwitch />
            <button type="button" className="ghost-btn" onClick={signOut}>
              {t("signOut")}
            </button>
          </div>
        </header>

        <div className="mb-6 rise">
          <h1 className="lcd text-4xl sm:text-5xl leading-none">
            {hello}
            {first ? `, ${first}` : ""}
          </h1>
          <p className="mt-2 text-sm" style={{ color: "var(--cream-dim)" }}>
            {t("lobbyTagline")}
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-[260px_1fr] items-start">
          <section className="cabinet p-4 flex flex-col items-center rise md:sticky md:top-6" aria-label={t("myLook")}>
            <div className="vfd-window w-full flex justify-center py-2">
              <AvatarCanvas avatar={avatar} size={190} />
            </div>
            <p className="lcd text-2xl mt-3 truncate max-w-full">{name || "…"}</p>
            {spaces && (
              <p className="mono text-[11px] mt-1" style={{ color: "var(--cream-dim)" }}>
                {t("studiosCount").replace("{n}", String(spaces.length)).replace("{m}", String(inside))}
              </p>
            )}
            <Link href="/avatar" className="deck-btn mt-3 w-full">
              {t("editLook")}
            </Link>
          </section>

          {/* on phones the studios come first: picking one is why you're here */}
          <section className="rise order-first md:order-none" aria-labelledby="spaces-title">
            <h2
              id="spaces-title"
              className="mono uppercase tracking-widest text-xs mb-3"
              style={{ color: "var(--cream-dim)" }}
            >
              {t("pickSpace")}
            </h2>
            {error && (
              <p role="alert" className="cabinet p-4">
                {t("failed")}
              </p>
            )}
            {spaces?.length === 0 && (
              <div className="cabinet p-5">
                <p>{t("noSpaces")}</p>
                <a className="deck-btn mt-4" href={YONDRA_APP}>
                  Yondra
                </a>
              </div>
            )}
            <ul className="grid gap-4 sm:grid-cols-2">
              {!spaces &&
                !error &&
                [0, 1].map((i) => (
                  <li key={i} className="cabinet p-2" aria-hidden>
                    <div className="vfd-window aspect-[32/15] animate-pulse" />
                    <div className="h-16" />
                  </li>
                ))}
              {spaces?.map((s) => {
                const people = s.people ?? [];
                const lead = people[0];
                return (
                  <li key={s.id}>
                    <Link
                      href={`/s/${s.id}`}
                      className="cabinet block p-2 group transition hover:-translate-y-0.5 focus-visible:-translate-y-0.5"
                      aria-label={`${t("join")} ${s.name}`}
                    >
                      <div className="vfd-window relative overflow-hidden aspect-[32/15] p-0">
                        <div className="absolute inset-0 transition-transform duration-500 group-hover:scale-105">
                          <StudioThumb
                            id={s.id}
                            theme={s.theme ?? "clouds"}
                            color={s.color ?? "#b5562f"}
                            online={s.online}
                            hour={hour}
                          />
                        </div>
                        <span
                          className="absolute top-2 right-2 mono text-[11px] px-2 py-0.5 rounded-full"
                          style={{
                            background: "#1e1712d9",
                            color: s.online ? "var(--vfd)" : "var(--cream-dim)",
                            border: "1px solid #5a4030",
                          }}
                        >
                          {s.online ? `● ${s.online} ${t("online")}` : `○ ${t("nobody")}`}
                        </span>
                      </div>
                      <div className="px-2 pt-3 pb-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <h3 className="lcd text-2xl leading-none truncate">{s.name.toUpperCase()}</h3>
                          <span
                            className="h-2 w-8 rounded-full shrink-0"
                            style={{ background: s.color ?? "var(--rust)" }}
                            aria-hidden
                          />
                        </div>
                        {s.projectName && s.projectName !== s.name && (
                          <p className="mono text-[11px] mt-1 truncate" style={{ color: "var(--cream-dim)" }}>
                            {s.projectName}
                          </p>
                        )}
                        <div className="flex items-center justify-between gap-3 mt-3">
                          <div className="flex items-center gap-2 min-w-0">
                            {people.length > 0 && (
                              <span className="flex shrink-0">
                                {people.map((p, i) => (
                                  <span key={p.userId} style={{ marginLeft: i ? -8 : 0 }}>
                                    <Face avatar={JSON.stringify(p.avatar)} name={p.name} size={28} />
                                  </span>
                                ))}
                              </span>
                            )}
                            <span className="text-xs truncate" style={{ color: "var(--cream-dim)" }}>
                              {lead
                                ? `${lead.name.split(" ")[0]}${lead.area ? ` · ${lead.area}` : ""}${s.online > 1 ? ` ${t("andMore").replace("{n}", String(s.online - 1))}` : ""}`
                                : t("quietNow")}
                            </span>
                          </div>
                          <span className="deck-btn shrink-0" style={{ height: 34 }}>
                            {t("join")} →
                          </span>
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </main>
  );
}
