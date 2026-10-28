"use client";

import { useState } from "react";
import { useLang } from "@/lib/i18n";
import { useHud } from "@/world/store";
import { useWorld } from "../ctx";
import { Icon } from "../icons";
import { ago, Card, Note, Row, Seg, Tag, useLive, useWords } from "./ui";

// The world (docs/plan/48-the-admin.md): what the whole town feels, live — the hour, the
// weather, every lock with its unlock from anywhere, the cars and the shuttle, the Kart Park's
// layout, a notice to everyone in. Admins only; the world server says who set what and when.
const W = {
  hour: ["The hour", "A hora"],
  inWorld: ["in the world", "no mundo"],
  setBy: ["set by {who} · {when}", "definida por {who} · {when}"],
  realHour: ["Back to the real hour", "Voltar à hora real"],
  real: ["the real hour", "a hora real"],
  weather: ["The weather", "O tempo"],
  clear: ["Clear", "Limpo"],
  storm: ["Storm", "Tempestade"],
  scheduled: ["As scheduled", "Como previsto"],
  calledBy: ["{what} called by {who} · {m} min left", "{what} pedido por {who} · faltam {m} min"],
  locks: ["Locked now · {n}", "Trancado agora · {n}"],
  noLocks: ["Nothing's locked.", "Nada trancado."],
  room: ["Room · by {who}", "Sala · por {who}"],
  door: ["Door", "Porta"],
  ground: ["ground floor", "térreo"],
  floorN: ["floor {n}", "andar {n}"],
  goTo: ["Go to", "Ir até"],
  unlock: ["Unlock", "Destrancar"],
  vehicles: ["Vehicles", "Veículos"],
  carsHome: ["Park every car home", "Todos os carros para casa"],
  shuttle: ["Shuttle to HQ", "Ônibus para a sede"],
  vehiclesS: ["Anyone driving is set down where they are.", "Quem estiver dirigindo desce onde está."],
  karts: ["The Kart Park", "O Kart Park"],
  reversed: ["Reversed", "Ao contrário"],
  kartsS: [
    "The same as the board in the paddock: only between races.",
    "O mesmo que o quadro no paddock: só entre corridas.",
  ],
  notice: ["A notice to everyone in", "Um aviso para todos aqui"],
  noticeS: ["{n} in · {len} / 140", "{n} aqui · {len} / 140"],
  note: ["Note", "Nota"],
  warn: ["Warning", "Alerta"],
  send: ["Send", "Enviar"],
} as const;

const LAYOUTS = [
  { key: "eight", name: "The Figure Eight" },
  { key: "oval", name: "The Oval" },
  { key: "switchback", name: "The Switchback" },
  { key: "longway", name: "The Long Way" },
]; // (shared kart/park.ts KART_LAYOUTS: the keys and names, not the circuits)

interface Snap {
  hour: number;
  hourBy: string;
  hourAt: number;
  stormBy: string;
  stormTo: number;
  stormUntil: number;
  rooms: { key: string; by: string }[];
  doors: { id: string; x: number; y: number; level: number; kind: string }[];
  layout: string;
  reverse: boolean;
}

const fmt = (h: number) =>
  `${String(Math.floor(h) % 24).padStart(2, "0")}:${String(Math.floor((h % 1) * 60)).padStart(2, "0")}`;

export function World() {
  const w = useWorld();
  const t = useWords(W);
  const pt = useLang() === "pt";
  const people = useHud((s) => s.people);
  const [hourDraft, setHourDraft] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [tone, setTone] = useState<"info" | "warn">("info");
  const s = useLive<Snap>(w, (w) => {
    const st = w.room?.state;
    const rooms: Snap["rooms"] = [];
    st?.locks.forEach((by: string, key: string) => {
      rooms.push({ key, by });
    });
    const doors: Snap["doors"] = [];
    st?.objects.forEach((o: { id: string; kind: string; x: number; y: number; props: string }) => {
      if (!o.props.includes('"state":"locked"')) return;
      const props = JSON.parse(o.props) as { level?: number };
      doors.push({ id: o.id, x: o.x, y: o.y, level: props.level ?? 0, kind: o.kind });
    });
    const park = st?.karts.get("park");
    return {
      hour: st?.hour ?? 12,
      hourBy: st?.hourBy ?? "",
      hourAt: st?.hourAt ?? 0,
      stormBy: st?.stormBy ?? "",
      stormTo: st?.stormTo ?? -1,
      stormUntil: st?.stormUntil ?? 0,
      rooms,
      doors,
      layout: park?.layout ?? "eight",
      reverse: !!park?.reverse,
    };
  });
  if (!s || !w) return null;
  // a room's name, on whichever floor it's on
  const b = w.building;
  const areas = [...(b?.areas ?? []), ...(b?.levels ?? []).flatMap((l) => l.areas ?? [])];
  const areaName = (key: string) => areas.find((a) => a.key === key)?.name ?? key;
  // a door's room: the one it stands in or opens onto, on its floor
  const floorAreas = (level: number) =>
    level === (b?.floor ?? 0) ? (b?.areas ?? []) : (b?.levels?.find((l) => l.index === level)?.areas ?? []);
  const doorRoom = (d: Snap["doors"][number]) =>
    floorAreas(d.level)
      .filter((a) => a.name && d.x >= a.x - 1 && d.x <= a.x + a.w && d.y >= a.y - 1 && d.y <= a.y + a.h)
      .sort((p, q) => p.w * p.h - q.w * q.h)[0]?.name;
  const weather = s.stormTo < 0 ? "scheduled" : s.stormTo >= 0.5 ? "storm" : "clear";
  const locked = s.rooms.length + s.doors.length;
  const hour = hourDraft ?? s.hour;
  return (
    <>
      <Card
        label={t("hour")}
        right={s.hourBy ? <Tag tone="lamp">{t("setBy", { who: s.hourBy, when: ago(s.hourAt, pt) })}</Tag> : null}
      >
        <div className="flex items-center gap-5 flex-wrap">
          <div className="text-center w-24">
            <div className="title text-[32px]" style={{ letterSpacing: ".04em" }}>
              {fmt(hour)}
            </div>
            <Note>{s.hourBy ? t("inWorld") : t("real")}</Note>
          </div>
          <input
            type="range"
            className="slider flex-1 min-w-[160px]"
            min={0}
            max={23.75}
            step={0.25}
            value={hour}
            style={{ "--v": `${(hour / 24) * 100}%` } as React.CSSProperties}
            aria-label={t("hour")}
            onChange={(e) => setHourDraft(Number(e.target.value))}
            onPointerUp={() => {
              if (hourDraft !== null) w.send("mod:hour", { h: hourDraft });
              setHourDraft(null);
            }}
            onKeyUp={() => {
              if (hourDraft !== null) w.send("mod:hour", { h: hourDraft });
              setHourDraft(null);
            }}
          />
          <button
            type="button"
            className="deck-btn"
            disabled={!s.hourBy}
            onClick={() => w.send("mod:hour", { h: null })}
          >
            <Icon name="clock" size={15} />
            {t("realHour")}
          </button>
        </div>
      </Card>
      <Card
        label={t("weather")}
        right={
          s.stormBy ? (
            <Note>
              {t("calledBy", {
                what: t(weather === "storm" ? "storm" : "clear"),
                who: s.stormBy,
                m: Math.max(0, Math.ceil((s.stormUntil - Date.now()) / 60_000)),
              })}
            </Note>
          ) : null
        }
      >
        <Seg
          value={weather}
          label={t("weather")}
          onPick={(v) => w.send("mod:storm", { storm: v === "scheduled" ? null : v === "storm" ? 1 : 0 })}
          options={[
            { v: "clear", label: t("clear") },
            { v: "storm", label: t("storm") },
            { v: "scheduled", label: t("scheduled") },
          ]}
        />
      </Card>
      <Card label={t("locks", { n: locked })}>
        {!locked && <Note>{t("noLocks")}</Note>}
        {s.rooms.map((r, i) => (
          <Row key={r.key} first={i === 0} title={areaName(r.key)} sub={t("room", { who: r.by })}>
            <button
              type="button"
              className="ghost-btn flex items-center gap-1.5"
              onClick={() => w.send("mod:lock", { area: r.key, locked: false })}
            >
              <Icon name="unlock" size={14} />
              {t("unlock")}
            </button>
          </Row>
        ))}
        {s.doors.map((d, i) => (
          <Row
            key={d.id}
            first={!s.rooms.length && i === 0}
            title={doorRoom(d) ?? t("door")}
            sub={`${t("door")} · ${d.level === 0 ? t("ground") : t("floorN", { n: d.level })}`}
          >
            <button
              type="button"
              className="ghost-btn flex items-center gap-1.5"
              onClick={() => w.send("teleport", { to: { x: d.x + 0.5, y: d.y + 1.5, level: d.level } })}
            >
              <Icon name="walk" size={14} />
              {t("goTo")}
            </button>
            <button
              type="button"
              className="ghost-btn flex items-center gap-1.5"
              onClick={() => w.send("mod:door", { id: d.id, locked: false })}
            >
              <Icon name="unlock" size={14} />
              {t("unlock")}
            </button>
          </Row>
        ))}
      </Card>
      <div className="grid sm:grid-cols-2 gap-3">
        <Card label={t("vehicles")}>
          <div className="flex gap-2 flex-wrap">
            <button type="button" className="deck-btn" onClick={() => w.send("mod:cars", {})}>
              <Icon name="bay" size={15} />
              {t("carsHome")}
            </button>
            <button type="button" className="deck-btn" onClick={() => w.send("mod:shuttle", {})}>
              <Icon name="home" size={15} />
              {t("shuttle")}
            </button>
          </div>
          <div className="mt-2">
            <Note>{t("vehiclesS")}</Note>
          </div>
        </Card>
        <Card label={t("karts")}>
          <div className="flex gap-2">
            <select
              className="field flex-1"
              style={{ height: 44 }}
              value={s.layout}
              onChange={(e) => w.send("kart:layout", { layout: e.target.value, reverse: s.reverse })}
            >
              {LAYOUTS.map((l) => (
                <option key={l.key} value={l.key}>
                  {l.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="deck-btn"
              aria-pressed={s.reverse}
              onClick={() => w.send("kart:layout", { layout: s.layout, reverse: !s.reverse })}
            >
              <Icon name="shuffle" size={15} />
              {t("reversed")}
            </button>
          </div>
          <div className="mt-2">
            <Note>{t("kartsS")}</Note>
          </div>
        </Card>
      </div>
      <Card label={t("notice")}>
        <div className="flex gap-2 flex-wrap">
          <input
            className="field flex-1 min-w-[200px]"
            maxLength={140}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && text.trim()) {
                w.send("mod:notice", { text, tone });
                setText("");
              }
            }}
          />
          <Seg
            value={tone}
            onPick={setTone}
            options={[
              { v: "info", label: t("note") },
              { v: "warn", label: t("warn") },
            ]}
          />
          <button
            type="button"
            className="deck-btn lit"
            disabled={!text.trim()}
            onClick={() => {
              w.send("mod:notice", { text, tone });
              setText("");
            }}
          >
            <Icon name="send" size={15} />
            {t("send")}
          </button>
        </div>
        <div className="mt-1.5">
          <Note>{t("noticeS", { n: people.length + 1, len: text.length })}</Note>
        </div>
      </Card>
    </>
  );
}
