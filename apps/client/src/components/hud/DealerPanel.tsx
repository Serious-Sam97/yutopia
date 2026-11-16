"use client";

import {
  BUYABLE,
  bodyVariants,
  type CarKind,
  type CarLook,
  carKindOf,
  cleanPlate,
  extrasOf,
  lookFor,
  lookTo,
  nearestColour,
  PALETTE,
  PLATE_MAX,
  plateOf,
  startLook,
  twoToneOf,
  wheelsOf,
} from "@yutopia/shared/car";
import { useEffect, useRef, useState } from "react";
import { addStrings, trMaybe, useTr } from "@/lib/i18n";
import { hud, useHud } from "@/world/store";
import type { Stand } from "@/world/tp/car/stand";
import { ItemThumb } from "./build/thumbs";
import { useWorld } from "./ctx";
import { Panel } from "./Panel";

// MOTORS, the car dealer on Main Street (docs/plan/43-the-spot.md, phase 2): every drivable vehicle, a plate
// of your own — and (docs/plan/92-the-cars.md F13b) its look: the variant of its body, its colour and second
// colour, its extras, its wheels, the car turning on a stand as it'll be in the world. "Take it" and it's
// there beside you, in the collection bay (the server's `car:buy`). One each: a new one retires the old.
// The same panel repaints the one you have, parked at home (`objectId` "repaint:<its id>", the server's
// `car:look`), free for now. Loaded with the cars (car/cars.ts registers it: the world page is full).

addStrings(
  {
    motorsPick: ["Pick one. It's yours, free: one each.", "Escolha um. É seu, de graça: um por pessoa."],
    motorsColour: ["Colour", "Cor"],
    motorsColour2: ["Second colour", "Segunda cor"],
    motorsNone: ["None", "Nenhuma"],
    motorsVariant: ["Version", "Versão"],
    motorsExtras: ["Extras", "Acessórios"],
    motorsWheels: ["Wheels", "Rodas"],
    motorsPlate: ["Plate", "Placa"],
    motorsPlateHint: ["8 at most · A–Z 0–9 · -", "8 no máximo · A–Z 0–9 · -"],
    motorsTake: ["Take it", "Levar"],
    motorsTakeHint: [
      "It's waiting beside you, in the collection bay. Drive it home.",
      "Ele espera ao seu lado, na vaga de retirada. Leve-o para casa.",
    ],
    motorsSwap: ["Your old one goes when this one comes.", "O antigo vai embora quando este chegar."],
    motorsRepaint: ["Repaint", "Repintar"],
    motorsRepaintTitle: ["MOTORS · your car", "MOTORS · seu carro"],
    motorsRepaintHint: [
      "Free for now. Everyone sees it the moment it's done.",
      "De graça, por enquanto. Todos veem assim que ficar pronto.",
    ],
    motorsLoading: ["Bringing it round…", "Trazendo o carro…"],
    model_sedan: ["Sedan", "Sedã"],
    model_estate: ["Estate", "Perua"],
    model_hatch: ["Hatch", "Hatch"],
    model_van: ["Van", "Van"],
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
    modelNote_estate: ["5 seats · rear-wheel drive · a long boot", "5 lugares · tração traseira · porta-malas longo"],
    modelNote_hatch: ["4 seats · front-wheel drive · small, quick", "4 lugares · tração dianteira · pequeno, ágil"],
    modelNote_van: ["Up to 8 seats · front-wheel drive · tall", "Até 8 lugares · tração dianteira · alta"],
    modelNote_offroad: ["4 seats · high, short · deep snow", "4 lugares · alto, curto · neve funda"],
    modelNote_pickup: ["3 seats · a bed for the sledges", "3 lugares · caçamba para os trenós"],
    modelNote_snowmobile: ["2 seats · off the roads, the pond", "2 lugares · fora das estradas, o lago"],
    modelNote_snowcat: ["4 seats · tracks · goes anywhere", "4 lugares · esteiras · vai a qualquer lugar"],
    modelNote_tractor: ["1 seat · slow, unstoppable", "1 lugar · lento, imparável"],
    modelNote_ploughtruck: ["2 seats · clears the road · a long one", "2 lugares · limpa a estrada · comprido"],
    modelNote_toboggan: ["2 seats · downhill only", "2 lugares · só ladeira abaixo"],
    // the variants (docs/plan/92's table): by their last word
    variant_base: ["Base", "Básico"],
    variant_gl: ["GL", "GL"],
    variant_sport: ["Sport", "Sport"],
    variant_utility: ["Utility", "Utilitária"],
    variant_hot: ["Hot", "Esportivo"],
    variant_short: ["Short", "Curto"],
    variant_long: ["Long", "Longo"],
    variant_expedition: ["Expedition", "Expedição"],
    variant_single: ["Single cab", "Cabine simples"],
    variant_crew: ["Crew cab", "Cabine dupla"],
    variant_flatbed: ["Flatbed", "Carroceria"],
    variant_panel: ["Panel van", "Furgão"],
    variant_minibus: ["Minibus", "Micro-ônibus"],
    variant_camper: ["Camper", "Camper"],
    extra_roofrack: ["Roof rack", "Bagageiro"],
    extra_skibox: ["Ski box", "Caixa de esqui"],
    extra_bullbar: ["Bull bar", "Quebra-mato"],
    extra_spots: ["Spot lamps", "Faróis auxiliares"],
    extra_flaps: ["Mud flaps", "Para-barros"],
    extra_chains: ["Snow chains", "Correntes de neve"],
    wheel_steel: ["Steel", "Aço"],
    wheel_cover: ["Hubcaps", "Calotas"],
    wheel_lattice: ["Lattice", "Raiadas"],
    wheel_turbine: ["Turbine", "Turbina"],
    wheel_sport: ["Sport", "Esportivas"],
    wheel_winter: ["Winter", "Inverno"],
    wheel_offroad: ["Off-road", "Off-road"],
  },
  "yutopia-car",
);

const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;
const variantWord = (v: string) => v.slice(v.lastIndexOf("-") + 1);

export function DealerPanel({ objectId }: { objectId: string }) {
  const t = useTr();
  const tm = (k: string) => trMaybe(k) ?? k;
  const w = useWorld();
  const me = useHud((s) => s.me);
  const repaint = objectId.startsWith("repaint:");
  const carId = repaint ? objectId.slice("repaint:".length) : objectId;
  // (the one I have now, if any: its looks to start from)
  const mine = carId ? w?.model?.getObject(carId) : null;
  const mineKind = carKindOf(mine?.props?.model);
  const mineLook = mine ? lookFor(mine.id, mineKind, mine.props ?? {}) : null;
  const [model, setModel] = useState<CarKind>(mine ? mineKind : "sedan");
  const [look, setLook] = useState<CarLook>(() => startLook(mine ? mineKind : "sedan", mineLook));
  const [plate, setPlate] = useState<string>(String(mine?.props?.plate ?? plateOf("", me?.name ?? "")));
  const close = () => hud.set({ panel: { kind: null } });

  // the stand: the car turning, as it'll be (its own small renderer: tp/car/stand.ts)
  const canvas = useRef<HTMLCanvasElement>(null);
  const stand = useRef<Stand | null>(null);
  const [standOk, setStandOk] = useState(false);
  useEffect(() => {
    let stop = false;
    let s: Stand | null = null;
    void import("@/world/tp/car/stand")
      .then(async (m) => {
        if (stop || !canvas.current) return;
        s = await m.makeStand(canvas.current);
        if (stop) return s.dispose();
        stand.current = s;
        setStandOk(true);
      })
      .catch((e) => console.warn("MOTORS' stand", e));
    return () => {
      stop = true;
      stand.current = null;
      s?.dispose();
    };
  }, []);
  useEffect(() => {
    if (standOk) stand.current?.show(look);
  }, [look, standOk]);

  const pickModel = (k: CarKind) => {
    setModel(k);
    // (another body: its base, the paint kept)
    setLook((l) => ({ ...startLook(k, mineKind === k ? mineLook : null), colour: l.colour }));
  };
  const set = (p: Partial<CarLook>) => setLook((l) => ({ ...l, ...p }));
  const variants = bodyVariants(model);
  const extras = extrasOf(look.variant) as string[];
  const wheels = wheelsOf(look.variant) as string[];
  const two = twoToneOf(look.variant);

  const go = () => {
    if (repaint) w?.send("car:look", { id: carId, look });
    else
      w?.send("car:buy", {
        model,
        colour: nearestColour(look.colour),
        plate: plateOf(plate, me?.name ?? ""),
        look,
      });
  };

  const label = (s: string) => (
    <p className="mono text-[11px]" style={{ color: "var(--muted)", letterSpacing: ".08em" }}>
      {tm(s).toUpperCase()}
    </p>
  );
  const chip = (on: boolean) =>
    on
      ? {
          background: "color-mix(in srgb, var(--warn) 14%, transparent)",
          boxShadow: "inset 0 0 0 1px var(--warn)",
        }
      : { boxShadow: "inset 0 0 0 1px var(--edge)" };
  const swatch = (c: number | null, on: boolean, onClick: () => void, data: Record<string, string>) => (
    <button
      type="button"
      key={c ?? "none"}
      aria-label={c === null ? tm("motorsNone") : hex(c)}
      aria-pressed={on}
      onClick={onClick}
      className="rounded-full grid place-items-center mono text-[10px]"
      style={{
        width: 28,
        height: 28,
        background: c === null ? "transparent" : hex(c),
        color: "var(--muted)",
        boxShadow: `0 0 0 2px var(--well)${on ? ", 0 0 0 4px var(--warn)" : ""}${c === null ? ", inset 0 0 0 1px var(--edge)" : ""}`,
      }}
      {...data}
    >
      {c === null ? "—" : ""}
    </button>
  );

  return (
    <Panel title={repaint ? tm("motorsRepaintTitle") : "MOTORS"} size="max-w-5xl max-h-[92vh]" onClose={close}>
      <p className="mono text-xs mb-3" style={{ color: "var(--cream-dim)" }}>
        {tm(repaint ? "motorsRepaintHint" : "motorsPick")}
      </p>
      <div className="flex flex-col sm:flex-row gap-4">
        {!repaint && (
          <ul className="flex flex-col gap-1 sm:w-[300px] shrink-0 overflow-auto max-h-[70vh]" data-motors-list>
            {BUYABLE.map((k) => (
              <li key={k}>
                <button
                  type="button"
                  className="w-full flex items-center gap-3 text-left rounded-lg px-2 py-1.5"
                  style={k === model ? chip(true) : { boxShadow: "inset 0 0 0 1px transparent" }}
                  aria-pressed={k === model}
                  data-motors-model={k}
                  onClick={() => pickModel(k)}
                >
                  <span
                    className="grid place-items-center shrink-0 rounded-md"
                    style={{
                      width: 76,
                      height: 44,
                      background: "radial-gradient(var(--tile-hi),var(--panel))",
                      border: "1px solid var(--edge)",
                    }}
                  >
                    <ItemThumb kind="car" props={{ model: k, variant: nearestColour(look.colour) }} />
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
        )}
        <div className="flex flex-col gap-3 flex-1 min-w-0">
          <div
            className="vfd-window relative rounded-xl overflow-hidden"
            style={{ height: 220, background: "radial-gradient(var(--tile-hi),var(--well))" }}
          >
            <canvas ref={canvas} className="absolute inset-0 w-full h-full" data-motors-stand />
            {!standOk && (
              <span className="absolute inset-0 grid place-items-center mono text-xs" style={{ color: "var(--muted)" }}>
                {tm("motorsLoading")}
              </span>
            )}
          </div>
          {variants.length > 1 && (
            <div>
              {label("motorsVariant")}
              <div className="flex flex-wrap gap-2 mt-1.5" role="tablist">
                {variants.map((v) => (
                  <button
                    type="button"
                    key={v}
                    role="tab"
                    aria-selected={v === look.variant}
                    data-motors-variant={v}
                    className="rounded-md px-3 py-1 text-sm"
                    style={chip(v === look.variant)}
                    onClick={() => setLook((l) => lookTo(l, v))}
                  >
                    {tm(`variant_${variantWord(v)}`)}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <div>
              {label("motorsColour")}
              <div className="flex flex-wrap gap-2 mt-2 max-w-[330px]">
                {PALETTE.map((c, i) =>
                  swatch(c, c === look.colour, () => set({ colour: c }), { "data-motors-colour": String(i) }),
                )}
              </div>
            </div>
            {two && (
              <div>
                {label("motorsColour2")}
                <div className="flex flex-wrap gap-2 mt-2 max-w-[330px]">
                  {swatch(
                    null,
                    look.colour2 === undefined,
                    () =>
                      setLook((l) => {
                        const n = { ...l };
                        delete n.colour2;
                        return n;
                      }),
                    { "data-motors-colour2": "none" },
                  )}
                  {PALETTE.map((c, i) =>
                    swatch(c, c === look.colour2, () => set({ colour2: c }), { "data-motors-colour2": String(i) }),
                  )}
                </div>
              </div>
            )}
          </div>
          {extras.length > 0 && (
            <div>
              {label("motorsExtras")}
              <div className="flex flex-wrap gap-2 mt-1.5">
                {extras.map((x) => {
                  const on = look.extras.includes(x);
                  return (
                    <button
                      type="button"
                      key={x}
                      aria-pressed={on}
                      data-motors-extra={x}
                      className="rounded-md px-2.5 py-1 text-xs"
                      style={chip(on)}
                      onClick={() =>
                        setLook((l) => ({ ...l, extras: on ? l.extras.filter((e) => e !== x) : [...l.extras, x] }))
                      }
                    >
                      {on ? "✓ " : ""}
                      {tm(`extra_${x}`)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {wheels.length > 1 && (
            <div>
              {label("motorsWheels")}
              <div className="flex flex-wrap gap-2 mt-1.5">
                {wheels.map((x) => (
                  <button
                    type="button"
                    key={x}
                    aria-pressed={x === look.wheels}
                    data-motors-wheels={x}
                    className="rounded-md px-2.5 py-1 text-xs"
                    style={chip(x === look.wheels)}
                    onClick={() => set({ wheels: x })}
                  >
                    {tm(`wheel_${x}`)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {!repaint && (
            <div>
              {label("motorsPlate")}
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
          )}
          <div className="flex items-center gap-3 mt-auto pt-1">
            <button
              type="button"
              className="deck-btn primary whitespace-nowrap shrink-0"
              style={{ height: 42, padding: "0 26px" }}
              data-motors-take
              onClick={go}
            >
              {tm(repaint ? "motorsRepaint" : "motorsTake")}
            </button>
            {!repaint && (
              <span className="text-xs" style={{ color: "var(--cream-dim)" }}>
                {tm("motorsTakeHint")} {mine ? tm("motorsSwap") : ""}
              </span>
            )}
          </div>
        </div>
      </div>
      <span className="sr-only">{t("close")}</span>
    </Panel>
  );
}
