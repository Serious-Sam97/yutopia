"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthCard, AuthField } from "@/components/AuthCard";
import { ApiError, yutopia } from "@/lib/api";
import { useTr } from "@/lib/i18n";

// The page the reset email links to (/reset?token=…&email=…).
function ResetForm() {
  const t = useTr();
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== again) return setError(t("passwordsDiffer"));
    setBusy(true);
    setError("");
    try {
      await yutopia.reset({
        token: params.get("token") ?? "",
        email: params.get("email") ?? "",
        password,
        password_confirmation: again,
      });
      setDone(true);
      setTimeout(() => router.replace("/login"), 1500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("failed"));
      setBusy(false);
    }
  }

  return (
    <AuthCard title={t("newPassword")} onSubmit={submit} error={error} note={done ? t("passwordChanged") : undefined}>
      <AuthField
        label={t("password")}
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={setPassword}
      />
      <AuthField
        label={t("passwordAgain")}
        type="password"
        autoComplete="new-password"
        value={again}
        onChange={setAgain}
      />
      <button type="submit" className="deck-btn w-full" disabled={busy || done}>
        {t("savePassword")}
      </button>
    </AuthCard>
  );
}

export default function ResetPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
