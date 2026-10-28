"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { hud, type Person, toast, useHud } from "@/world/store";
import { useWorld } from "../ctx";
import { Icon } from "../icons";
import { useMine, useWords } from "./ui";

// The admins' HUD (docs/plan/48-the-admin.md): while a power's on, a strip under the place's
// name says which (a click switches it off); the backquote key opens the quick box — a line
// to do what the panel does without opening it (fly, tp Bia, spawn snowmobile, hour 23…).
// Loaded for an admin only; everything it sends the world server refuses to anyone else.
const W = {
  powers: ["Powers", "Poderes"],
  fly: ["Flying", "Voando"],
  landed: ["Fly · landed", "Voo · pousado"],
  clip: ["Through walls", "Atravessando"],
  fast: ["Fast", "Rápido"],
  hidden: ["Invisible", "Invisível"],
  unhurt: ["Unhurt", "Ileso"],
  off: ["Switch off", "Desligar"],
  box: ["Do something…", "Fazer algo…"],
  nobody: ["Nobody here by that name.", "Ninguém aqui com esse nome."],
  unknown: ["Not a thing I know: try fly, tp, spawn, hour…", "Não conheço: tente fly, tp, spawn, hour…"],
} as const;

const STRIP = [
  { k: "fly", bit: 1 },
  { k: "clip", bit: 2 },
  { k: "fast", bit: 4 },
  { k: "hidden", bit: 8 },
  { k: "unhurt", bit: 16 },
] as const;

const MODELS = ["sedan", "offroad", "pickup", "snowmobile", "snowcat", "tractor", "ploughtruck", "toboggan"];
const ITEMS = [
  "mug",
  "cup",
  "soda",
  "ball",
  "frisbee",
  "rope",
  "feather",
  "laser",
  "revolver",
  "shotgun",
  "r38",
  "shell",
  "flare",
  "battery",
  "aid",
  "fuse",
];
// what the box knows: the word, what it takes, what it does
const COMMANDS: { c: string; arg?: string; does: string }[] = [
  { c: "fly", does: "fly on or off" },
  { c: "clip", does: "through walls on or off" },
  { c: "fast", does: "fast on or off" },
  { c: "hide", does: "invisible on or off" },
  { c: "unhurt", does: "unhurt on or off" },
  { c: "heal", arg: "[who]", does: "health, breath, battery full" },
  { c: "tp", arg: "<who>", does: "go to them" },
  { c: "bring", arg: "<who>", does: "bring them beside you" },
  { c: "home", arg: "<who>", does: "send them to the arrival point" },
  { c: "freeze", arg: "<who> [min]", does: "hold them still (1, 5, 10 min)" },
  { c: "unfreeze", arg: "<who>", does: "let them move" },
  { c: "mute", arg: "<who>", does: "mute them" },
  { c: "unmute", arg: "<who>", does: "let them talk" },
  { c: "spawn", arg: "<vehicle>", does: "a vehicle in front of you" },
  { c: "give", arg: "<item> [n] [who]", does: "into a hand or pockets" },
  { c: "clear", does: "everything you spawned, gone" },
  { c: "hour", arg: "<0–24 | real>", does: "set the world's hour" },
  { c: "storm", arg: "[on | off | auto]", does: "the weather" },
  { c: "notice", arg: "<text>", does: "a toast to everyone in" },
  { c: "cars", does: "every car back home" },
  { c: "shuttle", does: "the shuttle to HQ" },
  { c: "panel", does: "open Run the place" },
];
const POWER_OF: Record<string, string> = { fly: "fly", clip: "clip", fast: "fast", hide: "hidden", unhurt: "unhurt" };

export function AdminHud() {
  const w = useWorld();
  const { powers, flying } = useMine(w);
  const [open, setOpen] = useState(false);
  // the backquote: the box (not while typing somewhere else)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (
        e.code !== "Backquote" ||
        e.repeat ||
        el?.isContentEditable ||
        el?.tagName === "INPUT" ||
        el?.tagName === "TEXTAREA"
      )
        return;
      e.preventDefault();
      setOpen((o) => !o);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <>
      {powers !== 0 && <Strip powers={powers} flying={flying} />}
      {open && <QuickBox powers={powers} onClose={() => setOpen(false)} />}
    </>
  );
}

function Strip({ powers, flying }: { powers: number; flying: boolean }) {
  const w = useWorld();
  const t = useWords(W);
  return (
    <div
      className="pointer-events-auto absolute left-3 top-[88px] cabinet flex items-center gap-2 py-1.5 pl-3 pr-2 flex-wrap max-w-[calc(100vw-24px)]"
      data-admin-strip
    >
      <span className="mono text-[11.5px] uppercase tracking-[.06em] mr-1" style={{ color: "var(--amber)" }}>
        {t("powers")}
      </span>
      {STRIP.filter((p) => powers & p.bit).map((p) => (
        <button
          key={p.k}
          type="button"
          className="ghost-btn flex items-center gap-1.5"
          style={{ color: "var(--amber)" }}
          title={t("off")}
          onClick={() => w?.send("mod:power", { power: p.k, on: false })}
        >
          {p.k === "fly" && !flying ? t("landed") : t(p.k)}
          <Icon name="close" size={12} />
        </button>
      ))}
    </div>
  );
}

/** Someone in by a name or the start of one (their first name will do). */
function whoIs(people: Person[], q: string): Person | null {
  const n = q.trim().toLowerCase();
  if (!n) return null;
  return (
    people.find((p) => p.name.toLowerCase() === n) ??
    people.find((p) => p.name.toLowerCase().split(" ")[0] === n) ??
    people.find((p) => p.name.toLowerCase().startsWith(n)) ??
    null
  );
}

function QuickBox({ powers, onClose }: { powers: number; onClose: () => void }) {
  const w = useWorld();
  const t = useWords(W);
  const people = useHud((s) => s.people);
  const [text, setText] = useState("");
  const [pick, setPick] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const [head, ...rest] = text.trimStart().split(/\s+/);
  const word = (head ?? "").toLowerCase();
  const typed = rest.join(" ");
  // what Enter could do: the commands it starts, or (a command typed) its names, vehicles, items
  // biome-ignore lint/correctness/useExhaustiveDependencies: `rest` is `typed` split (a fresh array each render)
  const hints = useMemo(() => {
    if (!rest.length)
      return COMMANDS.filter((c) => c.c.startsWith(word)).map((c) => ({
        text: c.arg ? `${c.c} ` : c.c,
        label: `${c.c}${c.arg ? ` ${c.arg}` : ""}`,
        does: c.does,
      }));
    const last = (rest[rest.length - 1] ?? "").toLowerCase();
    const pool =
      word === "spawn"
        ? MODELS
        : word === "give" && rest.length === 1
          ? ITEMS
          : ["tp", "bring", "home", "freeze", "unfreeze", "mute", "unmute", "heal", "give"].includes(word)
            ? people.map((p) => p.name.split(" ")[0])
            : [];
    return pool
      .filter((x) => x.toLowerCase().startsWith(last) && x.toLowerCase() !== last)
      .slice(0, 6)
      .map((x) => ({ text: `${[head, ...rest.slice(0, -1), x].join(" ")} `, label: x, does: "" }));
  }, [word, head, typed, people]);

  function run(line: string) {
    const [c0, ...a] = line.trim().split(/\s+/);
    const c = (c0 ?? "").toLowerCase();
    const rest = a.join(" ");
    const send = w?.send.bind(w);
    if (!send) return;
    const someone = (q: string) => {
      const p = whoIs(people, q);
      if (!p) toast(t("nobody"), "warn");
      return p;
    };
    if (POWER_OF[c]) {
      const k = POWER_OF[c];
      const bit = { fly: 1, clip: 2, fast: 4, hidden: 8, unhurt: 16 }[k] ?? 0;
      const on = a[0] === "on" ? true : a[0] === "off" ? false : !(powers & bit);
      send("mod:power", { power: k, on });
    } else if (c === "heal") {
      if (!rest) send("mod:heal", {});
      else {
        const p = someone(rest);
        if (p) send("mod:heal", { userId: p.uid });
      }
    } else if (["tp", "bring", "home", "unfreeze", "mute", "unmute"].includes(c)) {
      const p = someone(rest);
      if (!p) return;
      if (c === "tp") send("teleport", { to: { userId: p.uid } });
      else if (c === "bring") send("mod:bring", { userId: p.uid });
      else if (c === "home") send("mod:home", { userId: p.uid });
      else if (c === "unfreeze") send("mod:freeze", { userId: p.uid, minutes: 0 });
      else send("mod:mute", { userId: p.uid, muted: c === "mute" });
    } else if (c === "freeze") {
      const m = Number(a[a.length - 1]);
      const p = someone(Number.isFinite(m) ? a.slice(0, -1).join(" ") : rest);
      if (p) send("mod:freeze", { userId: p.uid, minutes: [1, 5, 10].includes(m) ? m : 5 });
    } else if (c === "spawn") {
      const model = MODELS.find((m) => m.startsWith((a[0] ?? "").toLowerCase())) ?? "sedan";
      send("mod:spawn-car", { model, colour: Math.floor(Math.random() * 9) });
    } else if (c === "give") {
      const item = ITEMS.find((i) => i === (a[0] ?? "").toLowerCase());
      if (!item) return void toast(t("unknown"), "warn");
      const n = Number(a[1]);
      const who = Number.isFinite(n) ? a.slice(2).join(" ") : a.slice(1).join(" ");
      const p = who ? someone(who) : null;
      if (who && !p) return;
      send("mod:give", { item, n: Number.isFinite(n) ? n : 1, ...(p ? { userId: p.uid } : {}) });
    } else if (c === "clear") send("mod:clear", {});
    else if (c === "hour") {
      const h = Number(a[0]?.replace(":", "."));
      send("mod:hour", { h: a[0] === "real" || !Number.isFinite(h) ? null : h });
    } else if (c === "storm") send("mod:storm", { storm: a[0] === "off" ? 0 : a[0] === "auto" ? null : 1 });
    else if (c === "notice" && rest) send("mod:notice", { text: rest });
    else if (c === "cars") send("mod:cars", {});
    else if (c === "shuttle") send("mod:shuttle", {});
    else if (c === "panel") hud.set({ panel: { kind: "admin" } });
    else return void toast(t("unknown"), "warn");
    onClose();
  }

  return (
    <div
      className="pointer-events-auto absolute left-1/2 -translate-x-1/2 bottom-28 w-[min(560px,calc(100vw-24px))] cabinet p-2.5"
      data-admin-box
    >
      <div className="flex items-center gap-2">
        <span className="mono text-lg pl-1.5" style={{ color: "var(--amber)" }}>
          `
        </span>
        <input
          ref={input}
          className="field mono"
          placeholder={t("box")}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setPick(0);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Escape" || e.code === "Backquote") {
              e.preventDefault();
              onClose();
            } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setPick((p) => Math.max(0, Math.min(hints.length - 1, p + (e.key === "ArrowDown" ? 1 : -1))));
            } else if (e.key === "Tab" && hints[pick]) {
              e.preventDefault();
              setText(hints[pick].text);
            } else if (e.key === "Enter") {
              e.preventDefault();
              const h = hints[pick];
              // (a word half typed with a hint for it: the hint, if it needs nothing more)
              if (h && !rest.length && !h.text.endsWith(" ")) run(h.text);
              else if (h?.text.endsWith(" ") && !text.endsWith(" ") && rest.length) setText(h.text);
              else run(text);
            }
          }}
          onKeyUp={(e) => e.stopPropagation()}
        />
      </div>
      {hints.length > 0 && (
        <ul className="mt-1.5">
          {hints.slice(0, 7).map((h, i) => (
            <li key={h.label}>
              <button
                type="button"
                className="w-full flex items-center gap-3 px-2.5 py-1.5 rounded text-left"
                style={i === pick ? { background: "color-mix(in srgb, var(--amber) 9%, transparent)" } : undefined}
                onMouseEnter={() => setPick(i)}
                onClick={() => (h.text.endsWith(" ") ? setText(h.text) : run(h.text))}
              >
                <span
                  className="mono text-sm w-52 shrink-0"
                  style={{ color: i === pick ? "var(--amber)" : "var(--cream)" }}
                >
                  {h.label}
                </span>
                <span className="text-[12.5px] flex-1" style={{ color: "var(--cream-dim)" }}>
                  {h.does}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
