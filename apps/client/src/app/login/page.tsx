"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AuthCard, AuthField } from "@/components/AuthCard";
import { type Signup, setToken, yutopia } from "@/lib/api";
import { useTr } from "@/lib/i18n";

function LoginForm() {
  const t = useTr();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [signup, setSignup] = useState<Signup>("closed");

  useEffect(() => {
    yutopia
      .config()
      .then((c) => setSignup(c.signup))
      .catch(() => {});
  }, []);

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
    <AuthCard
      title={t("signIn")}
      onSubmit={submit}
      error={error}
      links={[
        { href: "/forgot", label: t("forgotLink") },
        ...(signup === "open" ? [{ href: "/register", label: t("noAccount") }] : []),
      ]}
    >
      <AuthField label={t("email")} type="email" autoComplete="email" value={email} onChange={setEmail} />
      <AuthField
        label={t("password")}
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={setPassword}
      />
      <button type="submit" className="deck-btn w-full" disabled={busy}>
        {busy ? t("signingIn") : t("enter")}
      </button>
      {signup === "invite" && (
        <p className="text-center text-xs mt-4" style={{ color: "var(--muted)" }}>
          {t("inviteOnly")}
        </p>
      )}
    </AuthCard>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
