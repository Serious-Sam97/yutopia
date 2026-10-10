"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Brand } from "@/components/Brand";
import { setToken, YONDRA_APP, yutopia } from "@/lib/api";
import { useTr } from "@/lib/i18n";

function LoginForm() {
  const t = useTr();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { token } = await yutopia.login(email, password);
      setToken(token);
      const next = params.get("next");
      router.replace(next?.startsWith("/") ? next : "/");
    } catch {
      setError(t("badLogin"));
      setBusy(false);
    }
  }

  return (
    <main className="min-h-full flex items-center justify-center p-4">
      <form onSubmit={submit} className="cabinet w-full max-w-sm p-5 rise" aria-labelledby="login-title">
        <Brand />
        <p className="mt-1 mb-5 text-sm" style={{ color: "var(--muted)" }}>
          {t("tagline")}
        </p>
        <h1
          id="login-title"
          className="mono text-xs uppercase tracking-widest mb-3"
          style={{ color: "var(--cream-dim)" }}
        >
          {t("signIn")}
        </h1>
        <label className="block mb-3">
          <span className="sr-only">{t("email")}</span>
          <input
            className="field"
            type="email"
            autoComplete="email"
            required
            placeholder={t("email")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="block mb-4">
          <span className="sr-only">{t("password")}</span>
          <input
            className="field"
            type="password"
            autoComplete="current-password"
            required
            placeholder={t("password")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="text-sm mb-3" style={{ color: "#ff8a66" }}>
            {error}
          </p>
        )}
        <button type="submit" className="deck-btn w-full" disabled={busy}>
          {busy ? t("signingIn") : t("enter")}
        </button>
        <a
          href={`${YONDRA_APP}/register`}
          className="block text-center text-xs mt-4 underline"
          style={{ color: "var(--muted)" }}
        >
          {t("noAccount")}
        </a>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
