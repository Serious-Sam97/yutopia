"use client";

import { type HomeLotDef, lotGround, lotRole, STOREY_RISES, type StoreyRise } from "@yutopia/shared";
import { useState } from "react";
import { useLang } from "@/lib/i18n";
import { hud, useHud } from "@/world/store";
import { useWorld } from "./ctx";

// A home lot's card (docs/plan/130-the-house-build.md, phase 1 — F1a, F2a): by a free lot's sign, what it is and
// "Claim this lot"; on mine (build mode's Lot tab opens it too), its roommates — someone here added, one taken off —,
// going there, and giving it back. An admin's: give it to someone here, or free it. A side card, as an NPC's is.

// (its own words: loaded with it, not with the page)
const WORDS: Record<string, [string, string]> = {
  free: ["{name} · free", "{name} · livre"],
  claim: ["Claim this lot", "Pegar este terreno"],
  notNow: ["Not now", "Agora não"],
  pitch: [
    "Yours to build on — you can let roommates build here too, and give it back any time.",
    "Seu para construir — você pode deixar colegas construírem aqui também, e devolver quando quiser.",
  ],
  yours: ["{name} · yours", "{name} · seu"],
  whose: ["{name}'s lot", "Terreno de {name}"],
  mates: ["Roommates", "Colegas"],
  matesNone: ["Nobody else builds here yet.", "Ninguém mais constrói aqui ainda."],
  addMate: ["Add someone here", "Adicionar alguém daqui"],
  giveBack: ["Give it back", "Devolver"],
  giveBackAsk: [
    "Give {name} back? Everything built on it goes with it.",
    "Devolver o {name}? Tudo construído nele vai junto.",
  ],
  yes: ["Yes, give it back", "Sim, devolver"],
  goTo: ["Go to my lot", "Ir ao meu terreno"],
  buildHint: ["Stand on it and press B to build.", "Fique nele e aperte B para construir."],
  assign: ["Give it to…", "Dar para…"],
  freeIt: ["Free it", "Liberar"],
  admin: ["Admin", "Admin"],
  size: ["{w} × {h} m", "{w} × {h} m"],
  storeys: ["Storeys", "Andares"],
  up: ["A storey on top", "Um andar em cima"],
  down: ["Dig a basement", "Cavar um porão"],
  rise_short: ["Short", "Baixo"],
  rise_normal: ["Normal", "Normal"],
  rise_tall: ["Tall", "Alto"],
  close: ["Close", "Fechar"],
};

export function LotCard({ objectId }: { objectId: string }) {
  const pt = useLang() === "pt";
  const w = useWorld();
  useHud((s) => s.mapVersion);
  const isAdmin = useHud((s) => s.isAdmin);
  const [asking, setAsking] = useState(false);
  const [picking, setPicking] = useState<"mate" | "assign" | null>(null);
  const [rise, setRise] = useState<StoreyRise>("normal");
  const tt = (k: string, v: Record<string, string | number> = {}) =>
    (WORDS[k]?.[pt ? 1 : 0] ?? k).replace(/\{(\w+)\}/g, (_, n) => String(v[n] ?? ""));
  const close = () => hud.set({ panel: { kind: null } });
  const st = w?.structure ?? null;
  const lot: HomeLotDef | undefined = w?.G?.HOME_LOTS.find((l) => l.key === objectId);
  if (!w || !st || !lot) return null;
  const uid = w.myUid();
  const g = lotGround(st, lot.key);
  const role = lotRole(st, lot.key, uid);
  const send = (type: string, m: Record<string, unknown>) => (w.send as (t: string, m: unknown) => void)(type, m);
  const people = w.room
    ? [...w.room.state.players.values()].filter((p) => !p.bot && p.uid !== uid && p.uid !== g?.claim?.owner)
    : [];
  const title = !g?.claim
    ? tt("free", { name: lot.name })
    : role === "owner"
      ? tt("yours", { name: lot.name })
      : tt("whose", { name: g.claim.ownerName.split(" ")[0] });
  const btn = "ghost-btn";
  return (
    <aside
      className="pointer-events-auto cabinet absolute right-3 top-24 w-[min(340px,calc(100vw-24px))] p-4 rise flex flex-col gap-3"
      aria-label={title}
      data-lot-card={lot.key}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="lcd text-2xl leading-none truncate">{title}</h2>
          <p className="mono text-xs mt-1" style={{ color: "var(--cream-dim)" }}>
            {lot.area ?? ""} · {tt("size", { w: Math.round(lot.x1 - lot.x0), h: Math.round(lot.z1 - lot.z0) })}
          </p>
        </div>
        <button type="button" className="mono text-xs opacity-70" onClick={close} aria-label={tt("close")}>
          ✕
        </button>
      </div>
      {!g?.claim && (
        <>
          <p className="text-sm leading-snug">{tt("pitch")}</p>
          <div className="flex gap-2">
            <button
              type="button"
              className="ghost-btn flex-1 py-2"
              style={{ color: "var(--good)", borderColor: "var(--good)", fontWeight: 700 }}
              data-testid="lot-claim"
              onClick={() => {
                send("lot:claim", { key: lot.key });
                close();
              }}
            >
              {tt("claim")}
            </button>
            <button type="button" className={btn} onClick={close}>
              {tt("notNow")}
            </button>
          </div>
        </>
      )}
      {g?.claim && (role || isAdmin) && (
        <>
          <section className="flex flex-col gap-1.5">
            <h3 className="mono text-xs uppercase opacity-70">{tt("mates")}</h3>
            {(g.claim.mates ?? []).length === 0 && <p className="text-sm opacity-80">{tt("matesNone")}</p>}
            {(g.claim.mates ?? []).map((m) => (
              <div key={m.uid} className="flex items-center justify-between text-sm">
                <span>{m.name}</span>
                {(role === "owner" || isAdmin) && (
                  <button
                    type="button"
                    className="mono text-xs opacity-70"
                    onClick={() => send("lot:mate", { key: lot.key, uid: m.uid, add: false })}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            {(role === "owner" || isAdmin) && (
              <button type="button" className={btn} onClick={() => setPicking(picking === "mate" ? null : "mate")}>
                + {tt("addMate")}
              </button>
            )}
            {picking && (
              <div className="flex flex-wrap gap-1.5" data-testid="lot-people">
                {people.map((p) => (
                  <button
                    key={p.uid}
                    type="button"
                    className={btn}
                    onClick={() => {
                      if (picking === "mate") send("lot:mate", { key: lot.key, uid: p.uid, add: true });
                      else send("lot:assign", { key: lot.key, uid: p.uid });
                      setPicking(null);
                    }}
                  >
                    {p.name.split(" ")[0]}
                  </button>
                ))}
              </div>
            )}
          </section>
          <section className="flex flex-col gap-1.5">
            <h3 className="mono text-xs uppercase opacity-70">{tt("storeys")}</h3>
            <div className="flex gap-1">
              {(Object.keys(STOREY_RISES) as StoreyRise[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  className={btn}
                  aria-pressed={rise === r}
                  style={rise === r ? { outline: "2px solid var(--amber)" } : undefined}
                  onClick={() => setRise(r)}
                >
                  {tt(`rise_${r}`)} · {STOREY_RISES[r].toFixed(1)}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                className={btn}
                data-testid="lot-up"
                onClick={() => send("lot:storey", { key: lot.key, dir: "up", rise })}
              >
                ▲ {tt("up")}
              </button>
              <button
                type="button"
                className={btn}
                data-testid="lot-down"
                onClick={() => send("lot:storey", { key: lot.key, dir: "down", rise })}
              >
                ▼ {tt("down")}
              </button>
            </div>
          </section>
          <div className="flex flex-wrap gap-2">
            {role && (
              <button
                type="button"
                className={btn}
                onClick={() => {
                  send("lot:go", { key: lot.key });
                  close();
                }}
              >
                {tt("goTo")}
              </button>
            )}
            {role === "owner" && !asking && (
              <button type="button" className={btn} style={{ color: "var(--bad)" }} onClick={() => setAsking(true)}>
                {tt("giveBack")}
              </button>
            )}
          </div>
          {asking && (
            <div className="flex flex-col gap-2">
              <p className="text-sm">{tt("giveBackAsk", { name: lot.name })}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={btn}
                  style={{ color: "var(--bad)" }}
                  data-testid="lot-release"
                  onClick={() => {
                    send("lot:release", { key: lot.key });
                    setAsking(false);
                    close();
                  }}
                >
                  {tt("yes")}
                </button>
                <button type="button" className={btn} onClick={() => setAsking(false)}>
                  {tt("notNow")}
                </button>
              </div>
            </div>
          )}
          <p className="text-xs opacity-70">{tt("buildHint")}</p>
        </>
      )}
      {isAdmin && (
        <section className="flex flex-wrap gap-2 pt-2" style={{ borderTop: "1px solid var(--hair, #fff3)" }}>
          <span className="mono text-xs uppercase opacity-70 w-full">{tt("admin")}</span>
          <button type="button" className={btn} onClick={() => setPicking(picking === "assign" ? null : "assign")}>
            {tt("assign")}
          </button>
          {g && (
            <button type="button" className={btn} onClick={() => send("lot:free", { key: lot.key })}>
              {tt("freeIt")}
            </button>
          )}
        </section>
      )}
    </aside>
  );
}
