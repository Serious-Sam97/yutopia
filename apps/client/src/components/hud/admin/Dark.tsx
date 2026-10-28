"use client";

import { useWorld } from "../ctx";
import { Card, Note, useWords } from "./ui";

// The dark (docs/plan/48-the-admin.md; docs/plan/30-the-dark.md): what's out there after dark —
// normal or peaceful — and some called up near me, for trying the fight. What was the floating
// ☾'s; refilling and arming me are on Powers and Spawn now.
const W = {
  out: ["Out there", "Lá fora"],
  normal: ["Normal", "Normal"],
  peaceful: ["Peaceful", "Pacífico"],
  peacefulS: [
    "Peaceful sends every shade off and calls none until it's normal again.",
    "Pacífico manda toda sombra embora e não chama nenhuma até voltar ao normal.",
  ],
  call: ["Call them", "Chamar"],
  one: ["1 near me", "1 perto de mim"],
  three: ["3 near me", "3 perto de mim"],
  callS: [
    "They stay at any hour; dawn doesn't send them off.",
    "Ficam a qualquer hora; o amanhecer não as manda embora.",
  ],
  hour: ["The hour", "A hora"],
  night: ["Night (23:00)", "Noite (23:00)"],
  day: ["Day (12:00)", "Dia (12:00)"],
  real: ["Real hour", "Hora real"],
  hourS: ["The same clock as The world: everyone's.", "O mesmo relógio de O mundo: o de todos."],
  me: ["Me", "Eu"],
  down: ["Down me", "Me derrubar"],
  moved: ["Refill me and arm me are on Powers and Spawn.", "Me encher e me armar estão em Poderes e Criar."],
} as const;

export function Dark() {
  const w = useWorld();
  const t = useWords(W);
  const send = w?.send.bind(w);
  return (
    <>
      <Card label={t("out")}>
        <div className="flex gap-2 flex-wrap">
          <button type="button" className="deck-btn" onClick={() => send?.("mod:dark", { mode: "normal" })}>
            {t("normal")}
          </button>
          <button type="button" className="deck-btn" onClick={() => send?.("mod:dark", { mode: "peaceful" })}>
            {t("peaceful")}
          </button>
        </div>
        <div className="mt-2">
          <Note>{t("peacefulS")}</Note>
        </div>
      </Card>
      <Card label={t("call")}>
        <div className="flex gap-2 flex-wrap">
          <button type="button" className="deck-btn" onClick={() => send?.("mod:dark", { mode: "normal", spawn: 1 })}>
            {t("one")}
          </button>
          <button type="button" className="deck-btn" onClick={() => send?.("mod:dark", { mode: "normal", spawn: 3 })}>
            {t("three")}
          </button>
        </div>
        <div className="mt-2">
          <Note>{t("callS")}</Note>
        </div>
      </Card>
      <Card label={t("hour")}>
        <div className="flex gap-2 flex-wrap">
          <button type="button" className="deck-btn" onClick={() => send?.("mod:hour", { h: 23 })}>
            {t("night")}
          </button>
          <button type="button" className="deck-btn" onClick={() => send?.("mod:hour", { h: 12 })}>
            {t("day")}
          </button>
          <button type="button" className="deck-btn" onClick={() => send?.("mod:hour", { h: null })}>
            {t("real")}
          </button>
        </div>
        <div className="mt-2">
          <Note>{t("hourS")}</Note>
        </div>
      </Card>
      <Card label={t("me")}>
        <button type="button" className="deck-btn danger" aria-pressed="false" onClick={() => send?.("mod:down", {})}>
          {t("down")}
        </button>
        <div className="mt-2">
          <Note>{t("moved")}</Note>
        </div>
      </Card>
    </>
  );
}
