"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, YONDRA_APP } from "@/lib/api";
import { getEcho } from "@/lib/echo";
import { useWorld } from "./ctx";
import { Panel } from "./Panel";

// Vortex's terminal in the server room. Talking here is talking to *him*: it
// goes through Yondra's own Vortex chat (same soul, memory, safety, budget),
// streamed over your private channel. Lore commands read your fragments.

interface Line {
  id: number;
  kind: "sys" | "you" | "vx" | "err";
  text: string;
}
let lineId = 0;
interface Fragments {
  owned: { id: string; where: string; text?: string }[];
  total: number;
  hint: string | null;
  hint_where: string | null;
}

const BOOT = [
  "VORTEX/OS 0.3.13 (c) 1989 m. vex — UNLICENSED",
  "memory check ........ 640K (most of it hiss)",
  "mounting reel ....... FITA 0 [ok]",
  "type `help`. or don't. i'm not your mom.",
];

export function VortexTerminal() {
  const w = useWorld();
  const [lines, setLines] = useState<Line[]>(() => BOOT.map((text) => ({ id: ++lineId, kind: "sys" as const, text })));
  const [input, setInput] = useState("");
  const [frags, setFrags] = useState<Fragments | null>(null);
  const [streaming, setStreaming] = useState("");
  const history = useRef<{ role: "user" | "assistant"; content: string }[]>([]);
  const active = useRef<string | null>(null);
  const screen = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const uid = w?.myUid() ?? 0;

  const print = useCallback(
    (kind: Line["kind"], text: string) => setLines((l) => [...l.slice(-200), { id: ++lineId, kind, text }]),
    [],
  );

  // his voice in the world also shows up here
  useEffect(() => w?.onVortexSay((t) => print("vx", t)), [w, print]);

  useEffect(() => {
    api<Fragments>("/api/mascot/fragments")
      .then(setFrags)
      .catch(() => {});
    field.current?.focus();
  }, []);

  // streamed chat replies (scope vortex-chat) on App.Models.User.{id}
  useEffect(() => {
    if (!uid) return;
    let off = false;
    let stop: (() => void) | null = null;
    const onEvent = (e: {
      type: string;
      payload: {
        scope?: string;
        request_id?: string;
        delta?: string;
        text?: string;
        action?: unknown;
        message?: string;
      };
    }) => {
      if (e.payload?.scope !== "vortex-chat" || e.payload.request_id !== active.current) return;
      if (e.type === "ai.token") setStreaming((s) => s + (e.payload.delta ?? ""));
      else if (e.type === "ai.done") {
        const text = (e.payload.text ?? "").trim() || "the tape ate my answer. *kkzzt* ask again.";
        history.current.push({ role: "assistant", content: text });
        print("vx", text);
        if (e.payload.action)
          print("sys", `[proposed action] he wants you to sign something. do it in Yondra: ${YONDRA_APP}`);
        setStreaming("");
        active.current = null;
      } else if (e.type === "ai.error") {
        print("err", e.payload.message ?? "the line went dead.");
        setStreaming("");
        active.current = null;
      }
    };
    void getEcho().then((echo) => {
      if (!echo || off) return;
      const channel = echo.private(`App.Models.User.${uid}`);
      channel.listen(".user.event", onEvent);
      stop = () => channel.stopListening(".user.event", onEvent);
    });
    return () => {
      off = true;
      stop?.();
    };
  }, [uid, print]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new output
  useEffect(() => {
    screen.current?.scrollTo({ top: screen.current.scrollHeight });
  }, [lines, streaming]);

  async function run(raw: string) {
    const cmd = raw.trim();
    if (!cmd) return;
    print("you", `> ${cmd}`);
    const [head, ...rest] = cmd.split(/\s+/);
    const arg = rest.join(" ");
    switch (head.toLowerCase()) {
      case "help":
        print("sys", "help · ls · cat <tape> · whoami · claim <phrase> · clear · anything else: talk to me");
        print("sys", "the desks upstairs run vortexos now. my old house. sit down at one. sign in. it remembers.");
        return;
      case "clear":
        setLines([]);
        return;
      case "whoami":
        print("sys", `${frags?.owned.length ?? 0}/${frags?.total ?? "?"} fragments. the rest of you is on side c.`);
        return;
      case "ls": {
        const owned = frags?.owned ?? [];
        if (!owned.length) print("sys", "nothing. you know nothing. it's refreshing.");
        for (const f of owned.slice(-12)) print("sys", `${f.id}.tape   ${f.where}`);
        if (frags?.hint) print("sys", `?? ${frags.hint_where}: ${frags.hint}`);
        return;
      }
      case "cat": {
        const f = frags?.owned.find((x) => x.id.toLowerCase() === arg.toLowerCase().replace(/\.tape$/, ""));
        print(f ? "vx" : "err", f?.text ?? "no such tape. or you didn't earn it.");
        return;
      }
      case "claim": {
        try {
          const res = await api<{ ok: boolean; fragment?: { id: string; text?: string } }>(
            "/api/mascot/fragments/claim",
            {
              method: "POST",
              body: JSON.stringify({ id: "Y02", proof: arg }),
            },
          );
          if (res.ok) {
            print("vx", res.fragment?.text ?? "…fine.");
            setFrags(await api<Fragments>("/api/mascot/fragments"));
          }
        } catch {
          print("err", "nothing happens. the reel just spins.");
        }
        return;
      }
    }
    if (active.current) return print("err", "i'm still talking. rude.");
    history.current.push({ role: "user", content: cmd });
    history.current = history.current.slice(-20);
    try {
      const { request_id } = await api<{ request_id: string }>("/api/ai/vortex-chat", {
        method: "POST",
        body: JSON.stringify({ messages: history.current }),
      });
      active.current = request_id;
    } catch {
      print("err", "can't reach him right now. the tape is jammed.");
    }
  }

  return (
    <Panel title="Terminal · server room">
      <div
        className="rounded-lg p-3 h-[min(420px,60vh)] overflow-y-auto scroll-thin"
        ref={screen}
        style={{
          background: "radial-gradient(120% 120% at 50% 40%, #1d1408 0%, #0b0703 80%)",
          boxShadow: "inset 0 0 40px #000, inset 0 0 2px #ffa630",
          fontFamily: "var(--font-lcd)",
          fontSize: 19,
          lineHeight: 1.25,
        }}
        role="log"
        aria-live="polite"
      >
        {lines.map((l) => (
          <p
            key={l.id}
            style={{
              color:
                l.kind === "you" ? "#efe4cc" : l.kind === "err" ? "#ff6a4d" : l.kind === "vx" ? "#ffb35c" : "#9aa67e",
              textShadow: "0 0 6px currentColor",
            }}
            className="whitespace-pre-wrap break-words"
          >
            {l.text}
          </p>
        ))}
        {streaming && (
          <p style={{ color: "#ffb35c", textShadow: "0 0 6px currentColor" }} className="whitespace-pre-wrap">
            {streaming}▌
          </p>
        )}
      </div>
      <form
        className="flex gap-2 mt-3"
        onSubmit={(e) => {
          e.preventDefault();
          void run(input);
          setInput("");
        }}
      >
        <span className="lcd text-2xl" aria-hidden>
          &gt;
        </span>
        <input
          ref={field}
          className="field lcd"
          style={{ fontSize: 20, background: "#0b0703" }}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          aria-label="Terminal input"
          maxLength={400}
          autoComplete="off"
          spellCheck={false}
        />
      </form>
    </Panel>
  );
}
