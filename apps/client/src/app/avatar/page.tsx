"use client";

import { type AvatarLayers, DEFAULT_AVATAR } from "@yutopia/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AvatarEditor } from "@/components/AvatarEditor";
import { Brand } from "@/components/Brand";
import { getToken, yutopia } from "@/lib/api";
import { useTr } from "@/lib/i18n";

export default function AvatarPage() {
  const t = useTr();
  const router = useRouter();
  const [a, setA] = useState<AvatarLayers>(DEFAULT_AVATAR);

  useEffect(() => {
    if (!getToken()) router.replace("/login?next=/avatar");
    else
      yutopia
        .spaces()
        .then((r) => setA(r.avatar))
        .catch(() => {});
  }, [router]);

  async function save(next: AvatarLayers) {
    await yutopia.saveAvatar(next);
    setTimeout(() => router.back(), 500);
  }

  return (
    <main className="h-full overflow-y-auto scroll-thin">
      <div className="mx-auto max-w-4xl p-4 sm:p-8">
        <header className="flex items-center justify-between mb-6">
          <Brand small />
          <Link href="/" className="ghost-btn">
            ← {t("back")}
          </Link>
        </header>
        <AvatarEditor initial={a} onSave={save} />
      </div>
    </main>
  );
}
