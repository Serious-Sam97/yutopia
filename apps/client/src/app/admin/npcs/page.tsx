"use client";

import { avatarFromSeed, parseAvatar } from "@yutopia/shared";
import { defaultBehaviour, type NpcDef, parseNpc } from "@yutopia/shared/npc";
import { type NpcPlaceDef, placesOf } from "@yutopia/shared/npc/places";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Brand } from "@/components/Brand";
import { cast } from "@/lib/admin";
import { ApiError, api, getToken, yutopia } from "@/lib/api";
import { useLang } from "@/lib/i18n";
import { NpcEditor } from "./editor";
import { CastFace } from "./face";
import { GONE, GONE_POST, NAMES, TYPE_WORDS, W, type Word } from "./words";

// The world's cast (docs/plan/120-god-mode-npcs.md): every NPC — the town's, moved out of the code, and the ones made
// here — listed with their pictures, searched, made (from scratch, at random, a copy), changed (saved as you go: the
// town's take it on live) and deleted. Admins only (the API refuses anyone else); it never joins the world. Opened
// from God mode.

type Filter = "all" | "town" | "made";
type Status = "" | "saving" | "saved" | "failed" | "invalid";
const SAVE_AFTER = 700; // ms after the last change
const RETRY = 3000;
/** An NPC as the API sent it, in the shared shape (a look stored empty — `[]` from PHP — a whole look again). */
const norm = (d: NpcDef): NpcDef => parseNpc(d, { town: !!d.town, type: d.behaviour?.type }) ?? d;
/** Neither a name nor a role: the API won't keep them (nor the world name them). */
const nameless = (d: NpcDef) => !d.name.trim() && !d.role.en.trim() && !d.role.pt.trim();

export default function CastPage() {
  const pt = useLang() === "pt";
  const w = useCallback(
    (k: Word, n?: string | number, m?: string | number) =>
      (W[k][pt ? 1 : 0] as string).replace("{n}", String(n ?? "")).replace("{max}", String(m ?? "")),
    [pt],
  );
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [npcs, setNpcs] = useState<NpcDef[] | null>(null);
  const [max, setMax] = useState(500);
  const [seeded, setSeeded] = useState(true);
  const [failed, setFailed] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [del, setDel] = useState<NpcDef | null>(null);
  const [busy, setBusy] = useState(false);
  // the latest of each one changed, and their save timers (what's not saved yet: a warning on leaving)
  const latest = useRef(new Map<string, NpcDef>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  // (one save at a time each: two in flight could land the other way round, the older kept)
  const flying = useRef(new Set<string>());

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login?next=/admin/npcs");
      return;
    }
    yutopia
      .me()
      .then((m) => setAllowed(m.user.isAdmin))
      .catch(() => setAllowed(false));
  }, [router]);

  useEffect(() => {
    if (!allowed) return;
    cast
      .list()
      .then((r) => {
        setNpcs(r.npcs.map(norm));
        setMax(r.max);
        setSeeded(r.seeded);
        // (opened for one — God mode's "Open on the cast page": ?key=)
        const want = new URLSearchParams(window.location.search).get("key");
        setSel((s) => s ?? (want && r.npcs.some((d) => d.key === want) ? want : (r.npcs[0]?.key ?? null)));
      })
      .catch(() => setFailed(true));
  }, [allowed]);
  // (plan 121) where God mode placed them: the published edits' `npcs`
  const [places, setPlaces] = useState<Map<string, NpcPlaceDef>>(new Map());
  useEffect(() => {
    if (!allowed) return;
    api<{ edits: Parameters<typeof placesOf>[0] }>("/api/world/edits")
      .then((r) => setPlaces(new Map(placesOf(r.edits).map((p) => [p.key, p]))))
      .catch(() => {});
  }, [allowed]);

  // (leaving with changes not saved yet: asked first)
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (
        !timers.current.size &&
        !Object.values(status).some((s) => s === "saving" || s === "failed" || s === "invalid")
      )
        return;
      e.preventDefault();
      e.returnValue = w("unsaved");
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [status, w]);

  const mark = useCallback((key: string, s: Status) => setStatus((x) => ({ ...x, [key]: s })), []);
  const flush = useCallback(
    (key: string) => {
      timers.current.delete(key);
      const d = latest.current.get(key);
      if (!d || flying.current.has(key)) return; // (in flight: sent again when it's back, if changed since)
      flying.current.add(key);
      mark(key, "saving");
      cast
        .save(d)
        .then(() => {
          flying.current.delete(key);
          if (latest.current.get(key) !== d) {
            // (changed again meanwhile: that one now, unless its own timer's still to go)
            if (latest.current.has(key) && !timers.current.has(key)) flush(key);
            return;
          }
          latest.current.delete(key);
          mark(key, "saved");
        })
        .catch((e: unknown) => {
          flying.current.delete(key);
          // (deleted meanwhile: nothing to save; changed meanwhile: that one now; refused as it is — no name nor role
          // —: said, not tried again)
          if (!latest.current.has(key)) return;
          if (latest.current.get(key) !== d) {
            if (!timers.current.has(key)) flush(key);
            return;
          }
          if (e instanceof ApiError && e.status === 422) {
            mark(key, "invalid");
            return;
          }
          mark(key, "failed");
          if (!timers.current.has(key))
            timers.current.set(
              key,
              setTimeout(() => flush(key), RETRY),
            );
        });
    },
    [mark],
  );
  const edit = (d: NpcDef) => {
    setNpcs((l) => l?.map((x) => (x.key === d.key ? d : x)) ?? l);
    latest.current.set(d.key, d);
    const t = timers.current.get(d.key);
    if (t) clearTimeout(t);
    timers.current.delete(d.key);
    if (nameless(d)) {
      mark(d.key, "invalid");
      return;
    }
    mark(d.key, "saving");
    timers.current.set(
      d.key,
      setTimeout(() => flush(d.key), SAVE_AFTER),
    );
  };

  const make = async (d: Omit<NpcDef, "key" | "town">) => {
    setBusy(true);
    try {
      const r = await cast.make(d);
      const made = norm(r.npc);
      setNpcs((l) => [...(l ?? []), made]);
      setSel(made.key);
      setFilter("all");
      setQ("");
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  const fresh = (random: boolean): Omit<NpcDef, "key" | "town"> => {
    const look = random ? avatarFromSeed(Math.floor(Math.random() * 1e6)) : parseAvatar({});
    return {
      name: random ? NAMES[Math.floor(Math.random() * NAMES.length)] : w("newName"),
      role: { en: "", pt: "" },
      look,
      voice: look.gender === "feminine" ? "woman" : "man",
      lines: [],
      notes: "",
      behaviour: defaultBehaviour(),
    };
  };
  const copy = (d: NpcDef) => {
    const { key: _k, town: _t, made: _m, changed: _c, ...rest } = d;
    // (a town NPC's own way of life isn't a copy's: they stand, till they're given another)
    void make({
      ...rest,
      // (Vortex's copy: a person, in the default look — his mascot's is his alone)
      look: d.look ?? parseAvatar({}),
      name: w("copyName", d.name || d.role.en),
      behaviour: d.town ? { ...d.behaviour, type: "stand" } : d.behaviour,
    });
  };
  const remove = async (d: NpcDef) => {
    setBusy(true);
    try {
      // (deleted first: refused, their changes not yet saved are still to be saved)
      await cast.remove(d.key);
      const t = timers.current.get(d.key);
      if (t) clearTimeout(t);
      timers.current.delete(d.key);
      latest.current.delete(d.key);
      setStatus((x) => {
        const { [d.key]: _gone, ...rest } = x;
        return rest;
      });
      setNpcs((l) => {
        const next = l?.filter((x) => x.key !== d.key) ?? l;
        const at = l?.findIndex((x) => x.key === d.key) ?? -1;
        setSel(next?.[Math.min(Math.max(at, 0), (next?.length ?? 1) - 1)]?.key ?? null);
        return next;
      });
      setDel(null);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (npcs ?? []).filter(
      (d) =>
        (filter === "all" || (filter === "town") === d.town) &&
        (!s || [d.name, d.role.en, d.role.pt, d.notes, d.key].some((x) => x.toLowerCase().includes(s))),
    );
  }, [npcs, q, filter]);
  const picked = npcs?.find((d) => d.key === sel) ?? null;
  const role = (d: NpcDef) => (pt && d.role.pt ? d.role.pt : d.role.en);

  return (
    <main className="h-full overflow-y-auto scroll-thin">
      <div className="mx-auto max-w-[1400px] p-4 sm:p-8">
        <header className="flex items-center justify-between mb-6 gap-4">
          <Brand small />
          <a href="/" className="ghost-btn">
            ← {w("back")}
          </a>
        </header>
        <h1 className="title text-[28px]">{w("title")}</h1>
        <p className="text-sm mt-1 mb-6" style={{ color: "var(--cream-dim)" }}>
          {w("sub")}
        </p>
        {allowed === null && <Note>{w("loading")}</Note>}
        {allowed === false && <Note>{w("notAllowed")}</Note>}
        {failed && (
          <p role="alert" className="mono text-sm mb-4" style={{ color: "var(--alert)" }}>
            {w("failed")}
          </p>
        )}
        {allowed && !npcs && !failed && <Note>{w("loading")}</Note>}
        {allowed && npcs && (
          <div className="grid gap-6 lg:grid-cols-[340px_1fr] items-start">
            <aside className="cabinet p-3 lg:sticky lg:top-4" data-cast-list>
              <input
                className="field"
                type="search"
                placeholder={w("search")}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label={w("search")}
              />
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                {(["all", "town", "made"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    className="chip"
                    aria-pressed={filter === f}
                    onClick={() => setFilter(f)}
                  >
                    {w(f)}
                  </button>
                ))}
                <span className="mono text-xs ml-auto" style={{ color: "var(--muted)" }} data-cast-count={npcs.length}>
                  {w("count", npcs.length, max)}
                </span>
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  className="deck-btn lit flex-1"
                  disabled={busy || npcs.length >= max}
                  onClick={() => void make(fresh(false))}
                  data-cast-new
                >
                  + {w("new")}
                </button>
                <button
                  type="button"
                  className="deck-btn flex-1"
                  disabled={busy || npcs.length >= max}
                  onClick={() => void make(fresh(true))}
                  data-cast-random
                >
                  ⟳ {w("random")}
                </button>
              </div>
              {!seeded && (
                <p className="text-xs mt-3" style={{ color: "var(--muted)" }}>
                  {w("notSeeded")}
                </p>
              )}
              <ul className="mt-3 space-y-1 max-h-[calc(100vh-260px)] overflow-y-auto scroll-thin pr-1">
                {shown.map((d) => (
                  <li key={d.key}>
                    <button
                      type="button"
                      className="tile-card w-full flex items-center gap-3 px-2.5 py-2 text-left"
                      aria-pressed={d.key === sel}
                      onClick={() => setSel(d.key)}
                      data-cast-card={d.key}
                    >
                      <CastFace look={d.look} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px]" style={{ color: "var(--cream)" }}>
                          {d.name || role(d) || d.key}
                        </span>
                        <span className="block truncate text-xs" style={{ color: "var(--cream-dim)" }}>
                          {d.name && role(d) ? role(d) : (TYPE_WORDS[d.behaviour.type]?.[pt ? 1 : 0] ?? "")}
                        </span>
                      </span>
                      <span
                        className="mono text-[10px] uppercase tracking-[.08em] shrink-0"
                        style={{ color: d.town ? "var(--vfd)" : "var(--muted)" }}
                      >
                        {places.has(d.key)
                          ? w(places.get(d.key)?.level ? "placedIn" : "placedOut")
                          : d.town
                            ? w("townBadge")
                            : w("offMap")}
                      </span>
                    </button>
                  </li>
                ))}
                {shown.length === 0 && (
                  <li className="text-sm px-2 py-3" style={{ color: "var(--muted)" }}>
                    {w("none")}
                  </li>
                )}
              </ul>
            </aside>
            {picked ? (
              <NpcEditor
                key={picked.key}
                npc={picked}
                pt={pt}
                status={status[picked.key] ?? ""}
                onChange={edit}
                onCopy={() => copy(picked)}
                onDelete={() => setDel(picked)}
                where={
                  places.get(picked.key)
                    ? [
                        w("whereAt", w(places.get(picked.key)?.level ? "placedIn" : "placedOut"), "").replace(
                          "{a}",
                          String(Math.round((((places.get(picked.key)?.a ?? 0) * 180) / Math.PI + 360) % 360)),
                        ),
                        places.get(picked.key)?.home ? w("livesIn", places.get(picked.key)?.home) : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : picked.town
                      ? w("whereTown")
                      : w("whereNone")
                }
              />
            ) : (
              <Note>{w("pick")}</Note>
            )}
          </div>
        )}
      </div>
      {del && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,.55)" }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="cast-del"
        >
          <div className="cabinet p-5 max-w-md w-full" data-cast-confirm>
            <h2 id="cast-del" className="title text-[22px]">
              {w("delTitle", del.name || role(del))}
            </h2>
            <p className="text-sm mt-3" style={{ color: "var(--cream)" }}>
              {del.town ? (GONE[del.behaviour.type] ?? GONE_POST)[pt ? 1 : 0] : w("delMade")}
            </p>
            {del.town && (
              <p className="text-sm mt-2" style={{ color: "var(--alert)" }}>
                {w("delTown")}
              </p>
            )}
            <div className="flex gap-2 mt-5 justify-end">
              <button type="button" className="deck-btn" onClick={() => setDel(null)}>
                {w("cancel")}
              </button>
              <button
                type="button"
                className="deck-btn danger"
                disabled={busy}
                onClick={() => void remove(del)}
                data-cast-confirm-delete
              >
                {w("yesDelete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
      {children}
    </p>
  );
}
