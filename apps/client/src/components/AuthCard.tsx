"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Brand } from "@/components/Brand";
import { useTr } from "@/lib/i18n";

// The cabinet the signed-out pages share: sign in, sign up, forgot, reset.
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
    <main className="min-h-full flex items-center justify-center p-4">
      <form onSubmit={onSubmit} className="cabinet w-full max-w-sm p-5 rise" aria-labelledby="auth-title">
        <Brand />
        <p className="mt-1 mb-5 text-sm" style={{ color: "var(--muted)" }}>
          {t("tagline")}
        </p>
        <h1
          id="auth-title"
          className="mono text-xs uppercase tracking-widest mb-3"
          style={{ color: "var(--cream-dim)" }}
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
          <p role="alert" className="text-sm mb-3" style={{ color: "#ff8a66" }}>
            {error}
          </p>
        )}
        {links?.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="block text-center text-xs mt-3 underline"
            style={{ color: "var(--muted)" }}
          >
            {l.label}
          </Link>
        ))}
      </form>
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
