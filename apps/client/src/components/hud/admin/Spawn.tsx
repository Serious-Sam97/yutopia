"use client";

import { useState } from "react";
import { hud, useHud } from "@/world/store";
import { useWorld } from "../ctx";
import { Icon } from "../icons";
import { BUYABLE, CAR_COLOURS, PLATE_MAX } from "./cars";
import { Card, Note, Seg, useWords } from "./ui";

// Spawn (docs/plan/48-the-admin.md): something into the world near me — a vehicle in front of
// me (anyone's to drive, gone when I clear what I spawned or at the day's end), a thing in my
// hand, things in my pockets or on the ground for anyone, a shade or three. Nothing here is a
// member's: the world server refuses it to anyone but an admin.
const W = {
  vehicle: ["A vehicle", "Um veículo"],
  vehicleS: [
    "Lands in front of you, facing your way. Outdoors, on the ground floor.",
    "Aparece na sua frente, virado para onde você olha. Lá fora, no térreo.",
  ],
  colour: ["Colour", "Cor"],
  plate: ["Plate", "Placa"],
  spawn: ["Spawn the {what}", "Criar o {what}"],
  hand: ["In my hand", "Na minha mão"],
  pockets: ["In my pockets", "Nos meus bolsos"],
  giveMe: ["Give me", "Me dar"],
  drop: ["Drop here", "Largar aqui"],
  arm: ["Arm me", "Me armar"],
  armS: [
    "Both guns loaded, rounds, shells, flares, first aid, a battery.",
    "As duas armas carregadas, balas, cartuchos, sinalizadores, curativo, bateria.",
  ],
  dark: ["Out of the dark", "Do escuro"],
  one: ["1 shade near me", "1 sombra perto de mim"],
  three: ["3 shades", "3 sombras"],
  darkS: [
    "They stay at any hour; dawn doesn't send them off.",
    "Ficam a qualquer hora; o amanhecer não as manda embora.",
  ],
  else: ["Something else", "Outra coisa"],
  build: ["Furniture: build mode", "Móveis: modo construção"],
  clear: ["Clear what I spawned", "Limpar o que eu criei"],
  clearS: [
    "Every vehicle you spawned goes once nobody's near it. Dropped things go by themselves.",
    "Todo veículo que você criou some quando ninguém estiver perto. O que foi largado some sozinho.",
  ],
  sedan: ["Sedan", "Sedã"],
  offroad: ["4x4", "4x4"],
  pickup: ["Pickup", "Picape"],
  snowmobile: ["Snowmobile", "Moto de neve"],
  snowcat: ["Snowcat", "Snowcat"],
  tractor: ["Tractor", "Trator"],
  ploughtruck: ["Plough truck", "Limpa-neve"],
  toboggan: ["Toboggan", "Trenó"],
  mug: ["Coffee", "Café"],
  cup: ["Water", "Água"],
  soda: ["Soda", "Refri"],
  ball: ["Ball", "Bola"],
  frisbee: ["Frisbee", "Frisbee"],
  rope: ["Rope", "Corda"],
  feather: ["Feather", "Pena"],
  laser: ["Laser pointer", "Laser"],
  revolver: ["Revolver", "Revólver"],
  shotgun: ["Shotgun", "Espingarda"],
  r38: ["Rounds", "Balas"],
  shell: ["Shells", "Cartuchos"],
  flare: ["Flares", "Sinalizadores"],
  battery: ["Batteries", "Baterias"],
  aid: ["First aid", "Curativos"],
  fuse: ["Fuses", "Fusíveis"],
} as const;
type Word = keyof typeof W;

const HELD = ["mug", "cup", "soda", "ball", "frisbee", "rope", "feather", "laser"] as const;
const POCKET = ["revolver", "shotgun", "r38", "shell", "flare", "battery", "aid", "fuse"] as const;
const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

export function Spawn() {
  const w = useWorld();
  const t = useWords(W);
  const held = useHud((s) => s.held);
  const [model, setModel] = useState<string>("snowmobile");
  const [colour, setColour] = useState(0);
  const [plate, setPlate] = useState("");
  const [item, setItem] = useState<(typeof POCKET)[number]>("flare");
  const [n, setN] = useState<number>(3);
  const send = w?.send.bind(w);
  return (
    <>
      <Card label={t("vehicle")}>
        <Note>{t("vehicleS")}</Note>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
          {BUYABLE.map((k) => (
            <button
              key={k}
              type="button"
              className={k === model ? "deck-btn lit" : "deck-btn"}
              style={{ height: 52, flexDirection: "column", gap: 3 }}
              onClick={() => setModel(k)}
            >
              <Icon name="bay" size={17} />
              {t(k as Word)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2.5 flex-wrap mt-3">
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            {t("colour")}
          </span>
          {CAR_COLOURS.map((c, i) => (
            <button
              key={c}
              type="button"
              aria-label={hex(c)}
              aria-pressed={i === colour}
              className="rounded-full"
              onClick={() => setColour(i)}
              style={{
                width: 22,
                height: 22,
                background: hex(c),
                boxShadow: `0 0 0 2px var(--panel)${i === colour ? ", 0 0 0 4px var(--amber)" : ""}`,
              }}
            />
          ))}
          <span className="text-xs ml-2" style={{ color: "var(--muted)" }}>
            {t("plate")}
          </span>
          <input
            className="field mono"
            style={{ width: 120, height: 36 }}
            maxLength={PLATE_MAX}
            value={plate}
            onChange={(e) => setPlate(e.target.value.toUpperCase())}
          />
          <span className="flex-1" />
          <button
            type="button"
            className="deck-btn lit"
            onClick={() => send?.("mod:spawn-car", { model, colour, plate: plate || undefined })}
          >
            <Icon name="plus" size={15} />
            {t("spawn", { what: t(model as Word).toLowerCase() })}
          </button>
        </div>
      </Card>
      <div className="grid sm:grid-cols-2 gap-3">
        <Card label={t("hand")}>
          <div className="flex gap-1.5 flex-wrap">
            {HELD.map((k) => (
              <button
                key={k}
                type="button"
                className="chip"
                aria-pressed={held?.kind === k}
                onClick={() => send?.("mod:give", { item: k })}
              >
                {t(k)}
              </button>
            ))}
          </div>
        </Card>
        <Card label={t("pockets")}>
          <div className="flex gap-2">
            <select
              className="field flex-1"
              style={{ height: 40 }}
              value={item}
              onChange={(e) => setItem(e.target.value as (typeof POCKET)[number])}
            >
              {POCKET.map((k) => (
                <option key={k} value={k}>
                  {t(k)}
                </option>
              ))}
            </select>
            <Seg value={n} onPick={setN} options={[1, 3, 10].map((v) => ({ v, label: String(v) }))} />
          </div>
          <div className="flex gap-2 flex-wrap mt-2.5">
            <button type="button" className="deck-btn" onClick={() => send?.("mod:give", { item, n })}>
              {t("giveMe")}
            </button>
            <button type="button" className="deck-btn" onClick={() => send?.("mod:give", { item, n, drop: true })}>
              {t("drop")}
            </button>
            <button
              type="button"
              className="deck-btn"
              title={t("armS")}
              onClick={() => send?.("mod:refill", { kit: true })}
            >
              {t("arm")}
            </button>
          </div>
        </Card>
        <Card label={t("dark")}>
          <div className="flex gap-2 flex-wrap">
            <button type="button" className="deck-btn" onClick={() => send?.("mod:dark", { mode: "normal", spawn: 1 })}>
              {t("one")}
            </button>
            <button type="button" className="deck-btn" onClick={() => send?.("mod:dark", { mode: "normal", spawn: 3 })}>
              {t("three")}
            </button>
          </div>
          <div className="mt-2">
            <Note>{t("darkS")}</Note>
          </div>
        </Card>
        <Card label={t("else")}>
          <button
            type="button"
            className="deck-btn"
            onClick={() => hud.set((s) => ({ panel: { kind: null }, build: { ...s.build, on: true, mode: "hand" } }))}
          >
            {t("build")}
            <Icon name="follow" size={14} />
          </button>
        </Card>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <span className="flex-1 min-w-[200px]">
          <Note>{t("clearS")}</Note>
        </span>
        <button type="button" className="deck-btn danger" aria-pressed="false" onClick={() => send?.("mod:clear", {})}>
          <Icon name="bin" size={15} />
          {t("clear")}
        </button>
      </div>
    </>
  );
}
