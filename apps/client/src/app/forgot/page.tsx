"use client";

import { useState } from "react";
import { AuthCard, AuthField } from "@/components/AuthCard";
import { yutopia } from "@/lib/api";
import { useTr } from "@/lib/i18n";

// A reset link by email (the same answer whether or not the address has an account).
export default function ForgotPage() {
  const t = useTr();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await yutopia.forgot(email);
      setSent(true);
    } catch {
      setError(t("failed"));
    }
    setBusy(false);
  }

  return (
    <AuthCard
      title={t("forgotTitle")}
      onSubmit={submit}
      error={error}
      note={sent ? t("resetSent") : undefined}
      links={[{ href: "/login", label: t("backToSignIn") }]}
    >
      <AuthField label={t("email")} type="email" autoComplete="email" value={email} onChange={setEmail} />
      <button type="submit" className="deck-btn w-full" disabled={busy || sent}>
        {t("sendLink")}
      </button>
    </AuthCard>
  );
}
