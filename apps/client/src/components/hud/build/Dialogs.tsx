"use client";

import { entry } from "@yutopia/shared";
import { useEffect, useState, useSyncExternalStore } from "react";
import { addStrings, trMaybe, useTr } from "@/lib/i18n";
import { hud } from "@/world/store";
import { useWorld } from "../ctx";
import type { Member } from "./BuildMode";

addStrings(
  {
    deskDlgTitle: ["Desk", "Mesa"],
    deskDlgWhose: ["Whose desk is this?", "De quem é esta mesa?"],
    deskDlgAnyone: ["Anyone (first come)", "Qualquer um (quem chegar primeiro)"],
    deskDlgSave: ["Save", "Salvar"],
    dlgCancel: ["Cancel", "Cancelar"],
    dlgOk: ["Yes, do it", "Sim, fazer"],
  },
  "yutopia-build",
);
const w8 = (k: string) => trMaybe(k) ?? k;

// After a seat is clicked with the Desks tool.
export function DeskDialog({ seatId, members }: { seatId: string; members: Member[] }) {
  const w = useWorld();
  useTr();
  const seat = w?.model?.getObject(seatId);
  const [owner, setOwner] = useState<number | null>((seat?.props?.ownerId as number) ?? null);
  const close = () => hud.set((s) => ({ build: { ...s.build, deskDraft: null } }));
  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-[color:var(--scrim)] p-3">
      <form
        className="gl-panel p-4 w-full max-w-xs space-y-3 gl-pop"
        aria-label={w8("deskDlgTitle")}
        onSubmit={(e) => {
          e.preventDefault();
          w?.send("desk:assign", {
            id: seatId,
            ownerId: owner,
            ownerName: members.find((m) => m.id === owner)?.name ?? null,
          });
          close();
        }}
      >
        <h2 className="gl-title">
          {w8("deskDlgTitle")} · {seat ? entry(seat.kind).label : ""}
        </h2>
        <label className="block">
          <span className="gl-lab">{w8("deskDlgWhose")}</span>
          <select
            className="gl-field w-full mt-1.5"
            value={owner ?? ""}
            onChange={(e) => setOwner(Number(e.target.value) || null)}
          >
            <option value="">{w8("deskDlgAnyone")}</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <button type="submit" className="gl-btn gl-go flex-1">
            {w8("deskDlgSave")}
          </button>
          <button type="button" className="gl-btn" onClick={close}>
            {w8("dlgCancel")}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── build mode's own confirm (plan 124 F10a: not the browser's window.confirm) ──────────────────────
type Ask = { text: string; danger: boolean; done: (ok: boolean) => void };
let asking: Ask | null = null;
const subs = new Set<() => void>();
const changed = () => {
  for (const s of subs) s();
};
/** Ask before something that can't be taken back: resolves true on "Yes". */
export function ask(text: string, danger = false): Promise<boolean> {
  asking?.done(false);
  return new Promise((done) => {
    asking = {
      text,
      danger,
      done: (ok) => {
        asking = null;
        changed();
        done(ok);
      },
    };
    changed();
  });
}

/** Mounted once by build mode: the question, over everything. */
export function ConfirmDialog() {
  useTr();
  const a = useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => asking,
    () => null,
  );
  // (build mode closed with a question open: it's answered no — never asked again on the next opening; review)
  useEffect(() => () => asking?.done(false), []);
  useEffect(() => {
    if (!a) return;
    const key = (e: KeyboardEvent) => {
      // (nothing under the question hears the keys: Delete, R, the camera's — Tab still moves between its buttons)
      if (e.key !== "Tab") e.stopImmediatePropagation();
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        e.preventDefault();
        a.done(false);
      } else if (e.key === "Enter") {
        e.stopImmediatePropagation();
        e.preventDefault();
        a.done(true);
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [a]);
  if (!a) return null;
  return (
    <div
      className="gl pointer-events-auto fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "var(--scrim)" }}
      role="presentation"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) a.done(false);
      }}
    >
      <div role="alertdialog" aria-modal="true" className="gl-panel gl-pop p-5 w-full max-w-sm flex flex-col gap-4">
        <p className="text-[15px] font-bold leading-snug" style={{ color: "var(--glass-ink)" }}>
          {a.text}
        </p>
        <div className="flex gap-2 justify-end">
          <button type="button" className="gl-btn" onClick={() => a.done(false)}>
            {w8("dlgCancel")}
          </button>
          <button
            type="button"
            className={`gl-btn ${a.danger ? "gl-bad" : "gl-go"}`}
            aria-pressed={a.danger || undefined}
            // biome-ignore lint/a11y/noAutofocus: the dialog's answer
            autoFocus
            onClick={() => a.done(true)}
          >
            {w8("dlgOk")}
          </button>
        </div>
      </div>
    </div>
  );
}
