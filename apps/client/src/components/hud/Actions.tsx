"use client";

import { useEffect, useState } from "react";
import { type Key, useTr } from "@/lib/i18n";
import { type ActTarget, useHud } from "@/world/store";
import { ItemThumb } from "./build/thumbs";
import { useWorld } from "./ctx";
import { Face } from "./Face";
import { Icon } from "./icons";
import { PetFace } from "./PetFace";

const R = 92; // the ring's radius (px)
const BOX = { w: 440, h: 270 }; // what the ring takes up around the click

// The action menu, Sims-style: click a thing or a person and what you can do
// opens in a ring around the click; the number keys pick, Esc closes. Picks
// go to the queue (top left), which walks you there and does them in order.
export function ActionMenu() {
  const t = useTr();
  const w = useWorld();
  const menu = useHud((s) => s.menu);
  const [vw, setVw] = useState({ w: 1280, h: 800 });
  useEffect(() => {
    const on = () => setVw({ w: window.innerWidth, h: window.innerHeight });
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  if (!menu) return null;
  // on a phone: a sheet from the bottom instead of a ring
  if (vw.w < 560) return <ActionSheet />;
  // the ring stays on screen
  const x = Math.max(170, Math.min(vw.w - 170, menu.x));
  const y = Math.max(130, Math.min(vw.h - 130, menu.y));
  const n = menu.items.length;
  return (
    <div className="pointer-events-auto absolute inset-0" data-action-menu>
      <button
        type="button"
        aria-label={t("actCancel")}
        className="absolute inset-0 cursor-default"
        onClick={() => w?.closeMenu()}
        onContextMenu={(e) => {
          e.preventDefault();
          w?.closeMenu();
        }}
      />
      <div
        role="menu"
        aria-label={`${t("actMenu")}: ${menu.title}`}
        className="absolute pointer-events-none"
        style={{ left: x - BOX.w / 2, top: y - BOX.h / 2, width: BOX.w, height: BOX.h }}
      >
        <div className="absolute" style={{ left: BOX.w / 2, top: BOX.h / 2 }}>
          {/* the middle: what it is */}
          <div
            className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-1 pointer-events-none pop-in"
            aria-hidden
          >
            <Thumb target={menu.target} size={46} />
            <span className="cabinet rounded-full px-2.5 py-0.5 text-[12px] whitespace-nowrap max-w-[220px] truncate">
              {menu.title}
            </span>
            {menu.subtitle && (
              <span
                className="mono text-[11px] px-2 rounded whitespace-nowrap max-w-[240px] truncate"
                style={{ color: "var(--vfd)", background: "rgba(20,14,10,.85)" }}
              >
                {menu.subtitle}
              </span>
            )}
          </div>
          {menu.items.map((it, i) => {
            // round the ring from the top, clockwise (a single one sits on top)
            const a = -Math.PI / 2 + (n === 1 ? 0 : (i / n) * Math.PI * 2);
            const r = n <= 2 ? R * 0.9 : R + (n > 5 ? 10 : 0);
            const ix = Math.cos(a) * r * 1.25;
            const iy = Math.sin(a) * r;
            // grow away from the middle (long labels on both sides never meet);
            // straight above or below: centred
            const c = Math.cos(a);
            const tx = Math.abs(c) < 0.3 ? "-50%" : c > 0 ? "-24px" : "calc(-100% + 24px)";
            return (
              <button
                key={it.act}
                type="button"
                role="menuitem"
                disabled={!it.ok}
                onClick={() => w?.pickAction(it.act)}
                className="pointer-events-auto absolute cabinet rounded-full pl-1.5 pr-3.5 h-9 flex items-center gap-2 text-[13px] whitespace-nowrap pop-in act-item disabled:opacity-45"
                style={{ left: ix, top: iy, translate: `${tx} -50%`, animationDelay: `${i * 25}ms` }}
              >
                <kbd className="keycap" style={{ height: 20, minWidth: 20, fontSize: 11, opacity: 1 }}>
                  {i + 1}
                </kbd>
                {t(`act_${it.act}` as Key)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ActionSheet() {
  const t = useTr();
  const w = useWorld();
  const menu = useHud((s) => s.menu);
  if (!menu) return null;
  return (
    <div className="pointer-events-auto absolute inset-0" data-action-menu>
      <button
        type="button"
        aria-label={t("actCancel")}
        className="absolute inset-0 cursor-default"
        style={{ background: "rgba(10,6,4,.35)" }}
        onClick={() => w?.closeMenu()}
      />
      <div
        role="menu"
        aria-label={`${t("actMenu")}: ${menu.title}`}
        className="absolute left-3 right-3 bottom-3 cabinet p-3 rise"
      >
        <div className="flex items-center gap-2.5 mb-2.5">
          <Thumb target={menu.target} size={40} />
          <div className="min-w-0">
            <div className="text-sm truncate">{menu.title}</div>
            {menu.subtitle && (
              <div className="mono text-[11px] truncate" style={{ color: "var(--vfd)" }}>
                {menu.subtitle}
              </div>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {menu.items.map((it) => (
            <button
              key={it.act}
              type="button"
              role="menuitem"
              disabled={!it.ok}
              onClick={() => w?.pickAction(it.act)}
              className="deck-btn justify-start text-[13px]"
              style={{ height: 40 }}
            >
              {t(`act_${it.act}` as Key)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// What's queued: the running one first (glowing), each cancelled with ×.
export function ActionQueueBar() {
  const t = useTr();
  const w = useWorld();
  const queue = useHud((s) => s.queue);
  if (!queue.length) return null;
  return (
    <ul
      className="pointer-events-auto absolute top-[74px] left-3 flex items-center gap-1.5 rise"
      aria-label={t("actQueue")}
    >
      {queue.map((q) => (
        <li
          key={q.key}
          className={`relative group cabinet rounded-full flex items-center gap-1.5 pl-1 pr-1 h-[42px] ${q.running ? "act-running" : ""}`}
          title={`${t(`act_${q.act}` as Key)} · ${q.title}`}
        >
          <Thumb target={q.target} size={32} />
          <span className="text-[12px] pr-0.5 hidden sm:inline max-w-[140px] truncate">{t(`act_${q.act}` as Key)}</span>
          <button
            type="button"
            className="w-6 h-6 rounded-full grid place-items-center text-[13px] opacity-70 hover:opacity-100"
            style={{ background: "var(--panel)", border: "1px solid var(--edge)" }}
            aria-label={`${t("actCancel")}: ${t(`act_${q.act}` as Key)}`}
            onClick={() => w?.actions.cancel(q.key)}
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}

// Focusing at my desk: say so, and a way out.
export function FocusChip() {
  const t = useTr();
  const w = useWorld();
  const focus = useHud((s) => s.focus);
  if (!focus) return null;
  return (
    <div className="pointer-events-auto absolute left-1/2 -translate-x-1/2 bottom-[272px] sm:bottom-[208px] cabinet rounded-full pl-3 pr-1.5 py-1 flex items-center gap-2.5 rise">
      <span className="text-sm">{t("focusing")}</span>
      <button
        type="button"
        className="deck-btn"
        style={{ height: 28, fontSize: 12 }}
        onClick={() => w?.send("focus", { on: false })}
      >
        {t("act_unfocus")}
      </button>
    </div>
  );
}

// Choosing where I arrive: what to do, and ways out.
export function ArrivalChip() {
  const t = useTr();
  const w = useWorld();
  const on = useHud((s) => s.pickArrival);
  const mine = useHud((s) => s.mySpawn);
  if (!on) return null;
  return (
    <div className="pointer-events-auto absolute left-1/2 -translate-x-1/2 bottom-[272px] sm:bottom-[208px] cabinet rounded-full pl-3 pr-1.5 py-1 flex items-center gap-2.5 rise">
      <Icon name="pin" size={15} />
      <span className="text-sm">{t("arrivalPick")}</span>
      {mine && (
        <button
          type="button"
          className="ghost-btn whitespace-nowrap"
          style={{ height: 28, fontSize: 12 }}
          onClick={() => w?.setArrival(null)}
        >
          {t("arrivalUsual")}
        </button>
      )}
      <button
        type="button"
        className="deck-btn"
        style={{ height: 28, fontSize: 12 }}
        onClick={() => w?.pickArrival(false)}
      >
        {t("actCancel")}
      </button>
    </div>
  );
}

// A thing's picture, or someone's face.
function Thumb({ target, size }: { target: ActTarget; size: number }) {
  const w = useWorld();
  const people = useHud((s) => s.people);
  const pets = useHud((s) => s.pets);
  const me = useHud((s) => s.me);
  const disc = {
    width: size,
    height: size,
    background: "radial-gradient(var(--tile-hi),var(--panel))",
    border: "1px solid var(--edge)",
  };
  if (target.type === "object") {
    const o = w?.engine?.getObject(target.id);
    return (
      <span className="rounded-full grid place-items-center shrink-0 p-1" style={disc}>
        {o && <ItemThumb kind={o.kind} props={o.props} />}
      </span>
    );
  }
  if (target.type === "pet") {
    const pet = pets.find((x) => x.id === target.id);
    return (
      <span className="rounded-full grid place-items-center shrink-0 overflow-hidden" style={disc}>
        {pet && <PetFace species={pet.species} look={pet.look} outfit={pet.outfit} size={size - 4} />}
      </span>
    );
  }
  const p = target.type === "self" ? me : people.find((x) => x.sid === target.sid);
  return (
    <span className="rounded-full grid place-items-center shrink-0 overflow-hidden" style={disc}>
      {p && <Face avatar={p.avatar} name={p.name} size={size - 4} />}
    </span>
  );
}
