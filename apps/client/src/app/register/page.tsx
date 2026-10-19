"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AuthCard, AuthField } from "@/components/AuthCard";
import { ApiError, type Signup, setToken, yutopia } from "@/lib/api";
import { useTr } from "@/lib/i18n";

// A new account: open sign-up, or with an invite link (/register?invite=…).
function RegisterForm() {
  const t = useTr();
  const router = useRouter();
  const invite = useSearchParams().get("invite") ?? "";
  const [signup, setSignup] = useState<Signup | null>(null);
  const [invited, setInvited] = useState<{ email: string | null; by: string | null } | null | false>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    yutopia
      .config()
      .then((c) => setSignup(c.signup))
      .catch(() => setSignup("closed"));
    if (invite)
      yutopia
        .invite(invite)
        .then((i) => {
          setInvited(i);
          if (i.email) setEmail(i.email);
        })
        .catch(() => setInvited(false));
  }, [invite]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== again) return setError(t("passwordsDiffer"));
    setBusy(true);
    setError("");
    try {
      const { token } = await yutopia.register({
        name,
        email,
        password,
        password_confirmation: again,
        ...(invite ? { invite } : {}),
      });
      setToken(token);
      router.replace("/avatar");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("failed"));
      setBusy(false);
    }
  }

  const lockedEmail = invited ? invited.email : null; // an invite tied to an address
  const blocked = signup === "closed" || (signup === "invite" && (!invite || invited === false));
  return (
    <AuthCard
      title={t("signUp")}
      onSubmit={submit}
      error={error || (blocked && signup ? t(signup === "closed" ? "signupClosed" : "inviteBad") : "")}
      note={invited ? (invited.by ? t("invitedBy").replace("{name}", invited.by) : undefined) : undefined}
      links={[{ href: "/login", label: t("haveAccount") }]}
    >
      {!blocked && signup && (
        <>
          <AuthField label={t("yourName")} type="text" autoComplete="name" value={name} onChange={setName} />
          <AuthField
            label={t("email")}
            type="email"
            autoComplete="email"
            value={email}
            onChange={setEmail}
            readOnly={!!lockedEmail}
          />
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
          <button type="submit" className="deck-btn w-full" disabled={busy}>
            {busy ? t("signingIn") : t("createAccount")}
          </button>
        </>
      )}
    </AuthCard>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
