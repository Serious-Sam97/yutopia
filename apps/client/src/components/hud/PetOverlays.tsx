"use client";

import { type BattleEvent, learned, MOVES, SPECIES_DEFS } from "@yutopia/shared/pets";
import { useEffect, useState } from "react";
import { type Key, useTr } from "@/lib/i18n";
import { type PetInfo, useHud } from "@/world/store";
import { useWorld } from "./ctx";
import { PetFace } from "./PetFace";

const fill = (s: string, v: Record<string, string | number>) =>
  Object.entries(v).reduce((t, [k, x]) => t.replace(`{${k}}`, String(x)), s);

export function PetOverlays() {
  return (
    <>
      <ChallengePrompt />
      <BattleBar />
    </>
  );
}

// A battle proposed to me: whose pet against mine, accept or pass.
function ChallengePrompt() {
  const t = useTr();
  const w = useWorld();
  const c = useHud((s) => s.challenge);
  const pets = useHud((s) => s.pets);
  if (!c) return null;
  const theirs = pets.find((p) => p.id === c.pet);
  const mine = pets.find((p) => p.id === c.mine);
  return (
    <div className="pointer-events-auto absolute left-1/2 -translate-x-1/2 top-[78px] cabinet px-3 py-2 flex items-center gap-3 rise">
      {theirs && <PetFace species={theirs.species} look={theirs.look} outfit={theirs.outfit} face="angry" size={34} />}
      <span className="text-sm">{fill(t("petChallenge"), { name: c.fromName, pet: mine?.name ?? "" })}</span>
      <button
        type="button"
        className="deck-btn primary"
        style={{ height: 30, fontSize: 12 }}
        onClick={() => w?.answerChallenge(true)}
      >
        {t("petAccept")}
      </button>
      <button
        type="button"
        className="ghost-btn"
        style={{ height: 30, fontSize: 12 }}
        onClick={() => w?.answerChallenge(false)}
      >
        {t("petDecline")}
      </button>
    </div>
  );
}

// The battle one of my pets is in (or one going on near me): both sides'
// HP, my move each round, what the round did, who won.
function BattleBar() {
  const t = useTr();
  const w = useWorld();
  const b = useHud((s) => s.battle);
  const pets = useHud((s) => s.pets);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!b || b.phase !== "pick") return;
    const i = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(i);
  }, [b]);
  if (!b) return null;
  const A = pets.find((p) => p.id === b.a);
  const B = pets.find((p) => p.id === b.b);
  if (!A || !B) return null;
  const me = b.mine === "a" ? A : b.mine === "b" ? B : null;
  const myMove = b.mine === "a" ? b.moveA : b.mine === "b" ? b.moveB : "";
  const special = !!me && learned(me.tricks, SPECIES_DEFS[me.species].signature);
  const left = Math.max(0, Math.ceil((b.until - Date.now()) / 1000));
  const nameOf = (who: "a" | "b") => (who === "a" ? A : B).name;
  const line = (ev: BattleEvent, i: number) => {
    const who = nameOf(ev.who);
    let s: string;
    if (ev.poison && ev.move === "rest") s = fill(t("bt_poison"), { who, n: ev.dmg ?? 0 });
    else if (ev.miss) s = fill(t("bt_miss"), { who });
    else if (ev.move === "defend") s = fill(t("bt_defend"), { who });
    else if (ev.move === "rest") s = fill(t("bt_rest"), { who, n: ev.heal ?? 0 });
    else if (ev.heal !== undefined) s = fill(t("bt_heal"), { who, n: ev.heal });
    else s = fill(t(ev.move === "special" ? "bt_special" : "bt_attack"), { who, n: ev.dmg ?? 0 });
    if (ev.poison && ev.move !== "rest") s += t("bt_venom");
    if (ev.crit) s += t("bt_crit");
    if (ev.ko) s += t("bt_ko");
    return (
      <li key={`${i}-${ev.who}-${ev.move}`} className="text-[12px]">
        {s}
      </li>
    );
  };
  return (
    <div className="pointer-events-auto absolute left-1/2 -translate-x-1/2 bottom-[184px] cabinet p-3 rise w-[min(520px,calc(100vw-24px))]">
      <div className="flex items-center justify-between mb-2">
        <span className="mono text-[11px] uppercase tracking-wide" style={{ color: "var(--vfd)" }}>
          {t("petBattle")} · {fill(t("petRound"), { n: b.round })}
        </span>
        {b.phase === "pick" && (
          <span className="mono text-[11px]" style={{ color: "var(--muted)" }}>
            {left}s
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Side pet={A} hp={b.hpA} max={b.maxA} picked={!!b.moveA} />
        <Side pet={B} hp={b.hpB} max={b.maxB} picked={!!b.moveB} right />
      </div>
      {b.phase === "done" ? (
        <div className="mt-2 text-sm text-center">
          {b.winner === "draw" ? t("petDraw") : fill(t("petWon"), { name: nameOf(b.winner as "a" | "b") })}
        </div>
      ) : b.phase === "anim" ? (
        <ul className="mt-2 flex flex-col gap-0.5">{b.log.map(line)}</ul>
      ) : me ? (
        <div className="mt-2 flex flex-col gap-1.5">
          <div className="text-xs" style={{ color: "var(--muted)" }}>
            {myMove ? t("petPicked") : t("petYourMove")}
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {MOVES.map((m) => (
              <button
                key={m}
                type="button"
                className="deck-btn text-xs"
                style={{ height: 34 }}
                disabled={!!myMove || (m === "special" && !special)}
                title={m === "special" && !special ? t("petSpecialLocked") : undefined}
                onClick={() => w?.battleMove(m)}
              >
                {t(`move_${m}` as Key)}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-2 text-xs text-center" style={{ color: "var(--muted)" }}>
          {t("petWaiting")}
        </div>
      )}
    </div>
  );
}

function Side({
  pet,
  hp,
  max,
  picked,
  right,
}: {
  pet: PetInfo;
  hp: number;
  max: number;
  picked: boolean;
  right?: boolean;
}) {
  const k = max ? Math.max(0, hp / max) : 0;
  return (
    <div className={`flex items-center gap-2 ${right ? "flex-row-reverse text-right" : ""}`}>
      <PetFace species={pet.species} look={pet.look} outfit={pet.outfit} face={k < 0.3 ? "sad" : "angry"} size={36} />
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">
          {pet.name}
          {picked && " ✓"}
        </div>
        <div
          className="relative h-[10px] rounded overflow-hidden"
          style={{ background: "rgba(0,0,0,.35)", border: "1px solid var(--edge)" }}
        >
          <div
            className="absolute inset-y-0"
            style={{
              [right ? "right" : "left"]: 0,
              width: `${k * 100}%`,
              background: k < 0.3 ? "var(--rust)" : "var(--olive)",
            }}
          />
        </div>
        <div className="mono text-[10px]" style={{ color: "var(--muted)" }}>
          {hp} / {max}
        </div>
      </div>
    </div>
  );
}
