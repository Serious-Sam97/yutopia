"use client";

import { CAR_COLOURS } from "@yutopia/shared";
import { BUYABLE, cleanPlate, PLATE_MAX, plateOf } from "@yutopia/shared/car";
import { useState } from "react";
import { addStrings, trMaybe, useTr } from "@/lib/i18n";
import { hud, useHud } from "@/world/store";
import { ItemThumb } from "./build/thumbs";
import { useWorld } from "./ctx";
import { Panel } from "./Panel";

// MOTORS, the car dealer on Main Street (docs/plan/43-the-spot.md, phase 2): every drivable
// vehicle, nine colours, a plate of your own. "Take it" and it's there beside you, in the
// collection bay (the server's `car:buy`). One each: a new one retires the old. Loaded with the
// cars (car/cars.ts registers it: the world page is full).

addStrings(
  {
    motorsPick: ["Pick one. It's yours, free: one each.", "Escolha um. É seu, de graça: um por pessoa."],
    motorsColour: ["Colour", "Cor"],
    motorsPlate: ["Plate", "Placa"],
    motorsPlateHint: ["8 at most · A–Z 0–9 · -", "8 no máximo · A–Z 0–9 · -"],
    motorsTake: ["Take it", "Levar"],
    motorsTakeHint: [
      "It's waiting beside you, in the collection bay. Drive it home.",
      "Ele espera ao seu lado, na vaga de retirada. Leve-o para casa.",
    ],
    motorsSwap: ["Your old one goes when this one comes.", "O antigo vai embora quando este chegar."],
    model_sedan: ["Sedan", "Sedã"],
    model_offroad: ["4x4", "4x4"],
    model_pickup: ["Pickup", "Picape"],
    model_snowmobile: ["Snowmobile", "Moto de neve"],
    model_snowcat: ["Snowcat", "Snowcat"],
    model_tractor: ["Tractor", "Trator"],
    model_ploughtruck: ["Plough truck", "Limpa-neve"],
    model_toboggan: ["Toboggan", "Trenó"],
    modelNote_sedan: [
      "4 seats · rear-wheel drive · the lot's own",
      "4 lugares · tração traseira · o do estacionamento",
    ],
    modelNote_offroad: ["4 seats · high, short · deep snow", "4 lugares · alto, curto · neve funda"],
    modelNote_pickup: ["3 seats · a bed for the sledges", "3 lugares · caçamba para os trenós"],
    modelNote_snowmobile: ["2 seats · off the roads, the pond", "2 lugares · fora das estradas, o lago"],
    modelNote_snowcat: ["4 seats · tracks · goes anywhere", "4 lugares · esteiras · vai a qualquer lugar"],
    modelNote_tractor: ["1 seat · slow, unstoppable", "1 lugar · lento, imparável"],
    modelNote_ploughtruck: ["2 seats · clears the road · a long one", "2 lugares · limpa a estrada · comprido"],
    modelNote_toboggan: ["2 seats · downhill only", "2 lugares · só ladeira abaixo"],
  },
  "yutopia-car",
);

const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

export function DealerPanel({ objectId }: { objectId: string }) {
  const t = useTr();
  const tm = (k: string) => trMaybe(k) ?? k;
  const w = useWorld();
  const me = useHud((s) => s.me);
  // (the one I have now, if any: its looks to start from)
  const mine = objectId ? w?.engine?.getObject(objectId) : null;
  const [model, setModel] = useState<string>(String(mine?.props?.model ?? "sedan"));
  const [colour, setColour] = useState<number>(Number(mine?.props?.variant ?? 1) || 0);
  const [plate, setPlate] = useState<string>(String(mine?.props?.plate ?? plateOf("", me?.name ?? "")));
  const close = () => hud.set({ panel: { kind: null } });
  return (
    <Panel title="MOTORS" size="max-w-4xl max-h-[90vh]" onClose={close}>
      <p className="mono text-xs mb-3" style={{ color: "var(--cream-dim)" }}>
        {tm("motorsPick")}
      </p>
      <div className="flex flex-col sm:flex-row gap-4">
        <ul className="flex flex-col gap-1 sm:w-[330px] shrink-0" data-motors-list>
          {BUYABLE.map((k) => (
            <li key={k}>
              <button
                type="button"
                className="w-full flex items-center gap-3 text-left rounded-lg px-2 py-1.5"
                style={
                  k === model
                    ? {
                        background: "color-mix(in srgb, var(--warn) 14%, transparent)",
                        boxShadow: "inset 0 0 0 1px var(--warn)",
                      }
                    : { boxShadow: "inset 0 0 0 1px transparent" }
                }
                aria-pressed={k === model}
                data-motors-model={k}
                onClick={() => setModel(k)}
              >
                <span
                  className="grid place-items-center shrink-0 rounded-md"
                  style={{
                    width: 84,
                    height: 48,
                    background: "radial-gradient(var(--tile-hi),var(--panel))",
                    border: "1px solid var(--edge)",
                  }}
                >
                  <ItemThumb kind="car" props={{ model: k, variant: colour }} />
                </span>
                <span className="min-w-0">
                  <span className="text-sm block">{tm(`model_${k}`)}</span>
                  <span className="mono text-[11px]" style={{ color: "var(--muted)" }}>
                    {tm(`modelNote_${k}`)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-4 flex-1 min-w-0">
          <div
            className="vfd-window grid place-items-center rounded-xl"
            style={{ height: 220, background: "radial-gradient(var(--tile-hi),var(--well))" }}
          >
            <ItemThumb kind="car" props={{ model, variant: colour }} className="w-[70%]" />
          </div>
          <div>
            <p className="mono text-[11px]" style={{ color: "var(--muted)", letterSpacing: ".08em" }}>
              {tm("motorsColour").toUpperCase()}
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              {CAR_COLOURS.map((c, i) => (
                <button
                  type="button"
                  key={c}
                  aria-label={hex(c)}
                  aria-pressed={i === colour}
                  data-motors-colour={i}
                  onClick={() => setColour(i)}
                  className="rounded-full"
                  style={{
                    width: 30,
                    height: 30,
                    background: hex(c),
                    boxShadow: `0 0 0 2px var(--well)${i === colour ? ", 0 0 0 4px var(--warn)" : ""}`,
                  }}
                />
              ))}
            </div>
          </div>
          <div>
            <p className="mono text-[11px]" style={{ color: "var(--muted)", letterSpacing: ".08em" }}>
              {tm("motorsPlate").toUpperCase()}
            </p>
            <div className="flex items-center gap-3 mt-2">
              <input
                className="vfd-window lcd text-2xl px-3 py-1 w-[190px] bg-transparent outline-none"
                value={plate}
                maxLength={PLATE_MAX + 2}
                data-motors-plate
                onChange={(e) => setPlate(cleanPlate(e.target.value))}
                onKeyDown={(e) => e.stopPropagation()}
              />
              <span className="mono text-[11px]" style={{ color: "var(--muted)" }}>
                {tm("motorsPlateHint")}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-auto">
            <button
              type="button"
              className="deck-btn primary whitespace-nowrap shrink-0"
              style={{ height: 42, padding: "0 26px" }}
              data-motors-take
              onClick={() => w?.send("car:buy", { model, colour, plate: plateOf(plate, me?.name ?? "") })}
            >
              {tm("motorsTake")}
            </button>
            <span className="text-xs" style={{ color: "var(--cream-dim)" }}>
              {tm("motorsTakeHint")} {mine ? tm("motorsSwap") : ""}
            </span>
          </div>
        </div>
      </div>
      <span className="sr-only">{t("close")}</span>
    </Panel>
  );
}
