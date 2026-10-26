"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Brand } from "@/components/Brand";
import { useTr } from "@/lib/i18n";

// The card the signed-out pages share: sign in, sign up, forgot, reset — framed, over the
// campus (public/login-bg.webp, darkened at the edges: docs/plan/45-the-ui.md).
export function AuthCard({
  title,
  onSubmit,
  children,
  error,
  note,
  links,
}: {
  title: string;
  onSubmit: (e: React.FormEvent) => void;
  children: ReactNode;
  error?: string;
  note?: string;
  links?: { href: string; label: string }[];
}) {
  const t = useTr();
  return (
    <main className="auth relative min-h-full flex items-center justify-center p-4">
      <form
        onSubmit={onSubmit}
        className="cabinet relative w-full max-w-[380px] px-6 pt-6 pb-5 rise"
        aria-labelledby="auth-title"
      >
        <Brand />
        <p className="mt-2.5 text-sm italic" style={{ color: "var(--cream-dim)" }}>
          {t("tagline")}
        </p>
        <div className="zigzag w-[150px] mt-4 mb-5" aria-hidden />
        <h1
          id="auth-title"
          className="mono text-[11.5px] uppercase tracking-[.06em] mb-3"
          style={{ color: "var(--amber)" }}
        >
          {title}
        </h1>
        {children}
        {note && (
          <output className="block text-sm mb-3" style={{ color: "var(--amber)" }}>
            {note}
          </output>
        )}
        {error && (
          <p role="alert" className="text-sm mb-3" style={{ color: "var(--alert)" }}>
            {error}
          </p>
        )}
        {links?.length ? (
          <div className="flex flex-wrap justify-between gap-x-4 gap-y-2 mt-4">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-[12.5px] underline underline-offset-[3px]"
                style={{ color: "var(--cream-dim)" }}
              >
                {l.label}
              </Link>
            ))}
          </div>
        ) : null}
      </form>
      <p className="mono absolute bottom-5 inset-x-0 text-center text-xs" style={{ color: "rgba(236,230,218,.55)" }}>
        Snow Campus
      </p>
    </main>
  );
}

// One labelled field of an AuthCard.
export function AuthField(props: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  required?: boolean;
  readOnly?: boolean;
}) {
  return (
    <label className="block mb-3">
      <span className="sr-only">{props.label}</span>
      <input
        className="field"
        type={props.type}
        autoComplete={props.autoComplete}
        required={props.required ?? true}
        readOnly={props.readOnly}
        placeholder={props.label}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </label>
  );
}
