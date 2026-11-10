"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/i18n";

// Plan 75 — the credits: the works by others in Yutopia, read from public/credits.json (tools/credits.py
// writes it from what's built). Shown in Settings → Credits and on /credits (signed out too). The hair
// and beards are CC BY 4.0: each with its title, its author (a link), its source, the licence (a link)
// and what we changed — the licence's terms. The rest — MakeHuman's, the sounds (CC0), the code's
// licences — by courtesy and by their notices. No word here suggests the authors back Yutopia.
// (its own words: it loads with the panel or its page, not the world's)
const W = {
  intro: [
    "Yutopia is made with the work of others, shared freely. Thank you to each of them.",
    "O Yutopia é feito com o trabalho de outras pessoas, compartilhado livremente. Obrigado a cada uma delas.",
  ],
  hair: ["Hair & beards", "Cabelos e barbas"],
  hairSub: [
    "Shared under Creative Commons Attribution 4.0. Changed by us: what each line says.",
    "Compartilhados sob Creative Commons Atribuição 4.0. Alterados por nós: o que cada linha diz.",
  ],
  people: ["People", "Pessoas"],
  sounds: ["Sounds", "Sons"],
  soundsSub: [
    "Dedicated to the public domain (CC0) — credited with thanks.",
    "Dedicados ao domínio público (CC0) — creditados com gratidão.",
  ],
  code: ["Code", "Código"],
  codeSub: [
    "The libraries the game runs on, and their licences.",
    "As bibliotecas em que o jogo roda, e suas licenças.",
  ],
  by: ["by", "por"],
  inGame: ["In the game as", "No jogo como"],
  licence: ["Licence text", "Texto da licença"],
  loading: ["Loading the credits…", "Carregando os créditos…"],
  failed: ["The credits couldn't be loaded.", "Não foi possível carregar os créditos."],
} as const;
type Word = keyof typeof W;

export type CreditsData = {
  hair: {
    key: string;
    title: string;
    author: string;
    author_url: string;
    source: string;
    license: string;
    license_url: string;
    change: string;
    files: string[];
  }[];
  people: {
    title: string;
    author: string;
    author_url: string;
    source: string;
    license: string;
    license_url: string;
    change: string;
  }[];
  sounds: { title: string; author: string; source: string; license: string; license_url: string }[];
  code: { title: string; version: string | null; license: string; source: string; text: string | null }[];
};

const lab = "mono text-[11.5px] uppercase tracking-[.06em]";
const dim = { color: "var(--cream-dim)" } as const;

function A({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-[3px]">
      {children}
    </a>
  );
}

/** "hair-curly" → "curly"; "beard-full" → "full beard" (the wardrobe's names, plainly). */
function asWorn(file: string, pt: boolean): string {
  const [kind, name] = [file.slice(0, file.indexOf("-")), file.slice(file.indexOf("-") + 1)];
  if (kind === "beard") return pt ? `barba ${name}` : `${name} beard`;
  return pt ? `cabelo ${name}` : `${name} hair`;
}

export function Credits() {
  const pt = useLang() === "pt";
  const t = (k: Word) => W[k][pt ? 1 : 0];
  const [data, setData] = useState<CreditsData | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    fetch("/credits.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: CreditsData) => live && setData(d))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);
  if (failed) return <p style={dim}>{t("failed")}</p>;
  if (!data) return <p style={dim}>{t("loading")}</p>;
  return (
    <div className="space-y-3" data-credits>
      <p className="text-[13.5px]" style={dim}>
        {t("intro")}
      </p>

      <section className="card" aria-labelledby="cr-hair">
        <h4 id="cr-hair" className={`${lab} mb-1`} style={{ color: "var(--amber)" }}>
          {t("hair")}
        </h4>
        <p className="text-[12.5px] mb-2" style={dim}>
          {t("hairSub")}
        </p>
        <ul className="space-y-3">
          {data.hair.map((w) => (
            <li key={w.key} className="text-[13.5px] leading-snug" data-work={w.key}>
              <A href={w.source}>
                <em>{w.title}</em>
              </A>{" "}
              {t("by")} <A href={w.author_url}>{w.author}</A> · <A href={w.license_url}>{w.license}</A>
              <span className="block text-[12.5px] mt-0.5" style={dim}>
                {w.change}
              </span>
              <span className="block text-[12px] mt-0.5" style={dim}>
                {t("inGame")}: {w.files.map((f) => asWorn(f, pt)).join(", ")}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card" aria-labelledby="cr-people">
        <h4 id="cr-people" className={`${lab} mb-2`} style={{ color: "var(--amber)" }}>
          {t("people")}
        </h4>
        {data.people.map((p) => (
          <p key={p.title} className="text-[13.5px] leading-snug">
            <A href={p.source}>{p.title}</A> {t("by")} {p.author} · <A href={p.license_url}>{p.license}</A>
            <span className="block text-[12.5px] mt-0.5" style={dim}>
              {p.change}
            </span>
          </p>
        ))}
      </section>

      <section className="card" aria-labelledby="cr-sounds">
        <h4 id="cr-sounds" className={`${lab} mb-1`} style={{ color: "var(--amber)" }}>
          {t("sounds")}
        </h4>
        <p className="text-[12.5px] mb-2" style={dim}>
          {t("soundsSub")}
        </p>
        <ul className="text-[12.5px] leading-snug columns-1 sm:columns-2 gap-6">
          {data.sounds.map((s) => (
            <li key={`${s.title}-${s.author}`} className="break-inside-avoid mb-1">
              <A href={s.source}>
                <em>{s.title}</em>
              </A>{" "}
              {t("by")} {s.author}
            </li>
          ))}
        </ul>
      </section>

      <section className="card" aria-labelledby="cr-code">
        <h4 id="cr-code" className={`${lab} mb-1`} style={{ color: "var(--amber)" }}>
          {t("code")}
        </h4>
        <p className="text-[12.5px] mb-2" style={dim}>
          {t("codeSub")}
        </p>
        <ul className="space-y-1.5 text-[13px]">
          {data.code.map((c) => (
            <li key={c.title}>
              <A href={c.source}>{c.title}</A>
              {c.version ? ` ${c.version}` : ""} · {c.license}
              {c.text && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-[12px]" style={dim}>
                    {t("licence")}
                  </summary>
                  <pre
                    className="mono text-[11px] whitespace-pre-wrap mt-1 max-h-48 overflow-y-auto scroll-thin"
                    style={dim}
                  >
                    {c.text}
                  </pre>
                </details>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
