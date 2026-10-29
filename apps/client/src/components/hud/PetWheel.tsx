"use client";

import { useEffect, useRef, useState } from "react";
import { type Key as TrKey, useTr } from "@/lib/i18n";
import { hud, useHud } from "@/world/store";
import { usePets } from "../usePets";
import { useWorld } from "./ctx";

// The pets' command wheel (docs/plan/52-the-pet-two.md D7): held open by T (input/walker.ts opens
// it as the pets panel's "wheel"), round the middle of the screen. The pointer picks a word by its
// angle; letting go of T (or a click, or a tap on a phone) says it. "Get him" goes for the person
// nearest the pointer on the screen — else the nearest one to me. Esc, or letting go in the middle,
// says nothing. For the pet picked in the panel, or my nearest.
const WORDS = ["come", "follow", "stay", "home", "gohome", "explore", "sleep", "attack", "leave"] as const;
type Word = (typeof WORDS)[number];
const R = 172; // the ring's radius (px): room for its longest words
const DEAD = 34; // the middle: nothing picked
const WHEEL_KEY = "KeyT"; // (input/bindings.ts DEFAULT_KEYS.pets: P is the phone's)

export function PetWheel() {
  const t = useTr();
  const w = useWorld();
  // (its words come with the pets' chunk)
  const loaded = !!usePets();
  const pets = useHud((s) => s.pets);
  const focus = useHud((s) => s.petFocus);
  const mine = pets.filter((p) => p.mine && p.alive);
  // the one it's for: picked in the panel, else the nearest
  const room = w?.room;
  const self = room?.state.players.get(room.sessionId);
  const far = (id: string) => {
    const q = room?.state.pets.get(id);
    return q && self ? Math.hypot(q.x - self.x, q.y - self.y) + (q.floor === self.level ? 0 : 1000) : 0;
  };
  const near = [...mine].sort((a, b) => far(a.id) - far(b.id));
  const pet = mine.find((p) => p.id === focus) ?? near[0] ?? null;
  const [hot, setHot] = useState<Word | null>(null);
  const hotRef = useRef<Word | null>(null);
  const pointer = useRef({ x: 0, y: 0 });
  hotRef.current = hot;

  const close = () => hud.set({ panel: { kind: null } });
  const say = (word: Word | null) => {
    close();
    if (!word || !pet || !w) return;
    if (word !== "attack") return w.send("pet:cmd", { id: pet.id, cmd: word });
    const target = targetOf();
    if (target) w.send("pet:cmd", { id: pet.id, cmd: "attack", target });
  };
  // Get him: the person nearest the pointer on the screen (within reach of a look), else nearest me
  const targetOf = (): string | null => {
    const room = w?.room;
    const model = w?.model;
    if (!room || !w || !model) return null;
    const rect = w.hostRect();
    let best: string | null = null;
    let bd = 160;
    let nearest: string | null = null;
    let nd = Number.POSITIVE_INFINITY;
    const self = room.state.players.get(room.sessionId);
    room.state.players.forEach((q: { x: number; y: number; level: number; bot?: boolean }, sid: string) => {
      if (sid === room.sessionId || !self || q.level !== self.level) return;
      const s = model.worldToClient(q.x, q.y, 0);
      const d = Math.hypot(rect.left + s.x - pointer.current.x, rect.top + s.y - pointer.current.y);
      if (d < bd) {
        bd = d;
        best = sid;
      }
      const dw = Math.hypot(q.x - self.x, q.y - self.y);
      if (dw < nd) {
        nd = dw;
        nearest = sid;
      }
    });
    return best ?? nearest;
  };

  useEffect(() => {
    const cx = () => window.innerWidth / 2;
    const cy = () => window.innerHeight / 2;
    const pick = (x: number, y: number): Word | null => {
      const dx = x - cx();
      const dy = y - cy();
      if (Math.hypot(dx, dy) < DEAD) return null;
      // (clockwise from the top)
      const a = (Math.atan2(dx, -dy) + Math.PI * 2) % (Math.PI * 2);
      return WORDS[Math.round(a / ((Math.PI * 2) / WORDS.length)) % WORDS.length];
    };
    const onMove = (e: PointerEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY };
      setHot(pick(e.clientX, e.clientY));
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === WHEEL_KEY) say(hotRef.current);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") close();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("keydown", onKey);
    };
  });

  if (!loaded) return null;
  if (!pet) {
    return (
      <div className="fixed inset-0 z-40 grid place-items-center pointer-events-none">
        <div className="toast">{t("petWheelNone")}</div>
      </div>
    );
  }
  const biting = pet.act === "attack";
  return (
    <div className="fixed inset-0 z-40" data-pet-wheel>
      <div
        className="absolute rounded-full"
        style={{
          left: "50%",
          top: "50%",
          width: R * 2 + 120,
          height: R * 2 + 120,
          transform: "translate(-50%, -50%)",
          background: "radial-gradient(rgba(20,14,10,.55), rgba(20,14,10,.15) 70%, transparent)",
        }}
      />
      <div
        className="cabinet absolute rounded-full grid place-items-center text-center"
        style={{ left: "50%", top: "50%", width: 92, height: 92, transform: "translate(-50%, -50%)" }}
      >
        <div>
          <div className="text-sm" style={{ color: "var(--cream)" }}>
            {pet.name}
          </div>
          <div className="mono text-[9px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>
            {t("petWheelHint")}
          </div>
        </div>
      </div>
      {WORDS.map((word, i) => {
        const a = (i / WORDS.length) * Math.PI * 2;
        const x = Math.sin(a) * R;
        const y = -Math.cos(a) * R;
        const on = hot === word;
        const danger = word === "attack" || (word === "leave" && biting);
        return (
          <button
            key={word}
            type="button"
            data-wheel={word}
            className={`deck-btn ${danger ? "danger" : ""} ${on ? "primary" : ""}`}
            style={{
              position: "absolute",
              left: `calc(50% + ${x}px)`,
              top: `calc(50% + ${y}px)`,
              transform: `translate(-50%, -50%) scale(${on ? 1.12 : 1})`,
              minWidth: 96,
              opacity: word === "leave" && !biting ? 0.55 : 1,
            }}
            onPointerEnter={() => setHot(word)}
            onClick={(e) => {
              pointer.current = { x: e.clientX, y: e.clientY };
              say(word);
            }}
          >
            {t(`wheel_${word}` as TrKey)}
          </button>
        );
      })}
    </div>
  );
}
