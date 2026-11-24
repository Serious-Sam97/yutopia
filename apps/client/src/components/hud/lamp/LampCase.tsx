"use client";

import {
  CASE_H,
  CASE_W,
  fitsAt,
  fits as fitsSlot,
  HAND_SLOT,
  type ItemId,
  QUICK_SLOT,
  sizeOf,
} from "@yutopia/shared/inventory";
import { STICKERS } from "@yutopia/shared/stickers";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { asset } from "@/lib/asset";
import { trMaybe, useTr } from "@/lib/i18n";
import { hud, useHud } from "@/world/store";
import { useWorld } from "../ctx";

// Ana's Case (docs/plan/125-the-new-ui.md phase 5, F5a, F14a–F17a — design/ui-life/r2/e-pack7.png): the pack as RE4's
// attaché case — worn leather, brass, foam pockets cut for each thing; every thing its size in a 10 × 7 grid, dragged
// to move, R to turn; what's on the ground beside you hovers to be laid in where it fits; the hands (1 the left, 2–5)
// are shortcuts into it; the picked thing on velvet, its numbers, a note about it in your own hand. The rules are the
// shared inventory's (caseCells, fitsAt, placeSlot, addItemAt): the server says what fits; this only shows and asks.

const C = 56; // a cell, px
const GX = 108;
const GY = 330;
const W = 1440;
const H = 900;
type Thing = { id: string; n: number; loaded?: number };
type Drag = {
  slot: number | null; // a thing in the case, or null: one from the ground
  ground?: string; // the drop's id
  store?: { kind: "boot" | "glove"; id: string; i: number }; // (F14a) from a car's boot or glove box
  stash?: number; // (F17a) the stash at home's `i`th
  id: string;
  r: 0 | 1;
  x: number; // the cell under the pointer (its top-left)
  y: number;
  dx: number; // where in the thing it was taken (cells)
  dy: number;
  moved: boolean;
};

// a note about each kind of thing, in your own hand (F6a) — signed with your initial
const NOTES: Record<string, [string, string]> = {
  revolver: ["Six shots. Count them — every time.", "Seis tiros. Conte — toda vez."],
  shotgun: ["Kicks like a mule — two shots, then run.", "Coice de mula — dois tiros, depois corre."],
  ak47: ["Loud. Hungry. Keep a spare magazine.", "Barulhenta. Faminta. Sempre um pente extra."],
  sniper: ["Breathe out. Then squeeze.", "Solta o ar. Depois aperta."],
  daybreak: ["It burns the dark away. Three cells.", "Queima o escuro. Três células."],
  torch: ["Don't let the battery die out here.", "Não deixa a bateria morrer aqui fora."],
  flare: ["Red light, long minutes. Throw it far.", "Luz vermelha, minutos longos. Joga longe."],
  aid: ["For the bad nights.", "Para as noites ruins."],
  battery: ["Spare light. Never leave without one.", "Luz reserva. Nunca saia sem."],
  r38: ["For the revolver.", "Para o revólver."],
  shell: ["Two at a time.", "Dois de cada vez."],
  r762: ["The AK's.", "Da AK."],
  r308: ["Five, for the long ones.", "Cinco, para os de longe."],
  cell: ["The Daybreak eats these.", "A Daybreak come estas."],
  umbrella: ["Open it in the sleet.", "Abre na chuva de neve."],
  chains: ["One a wheel, kneeling in the snow.", "Uma por roda, de joelhos na neve."],
  wrench: ["Fixes most engines. Most.", "Conserta quase todo motor. Quase."],
  towrope: ["One car pulls another.", "Um carro puxa o outro."],
  vxtape: ["Won fair and square.", "Ganha de forma justa."],
  fuse: ["Keep them dry.", "Mantém secos."],
};
const STATS: Record<string, [number, number, number, number]> = {
  revolver: [7, 3, 7, 5],
  shotgun: [9, 2, 4, 3],
  ak47: [5, 9, 5, 7],
  sniper: [10, 1, 10, 10],
  daybreak: [10, 2, 6, 6],
};

// (F6a) the case's colour and the charms on its handle — earned by playing: each comes with a place's sticker (`by`,
// shared stickers.ts; none: yours from the start). Which you've chosen is kept on this device.
const COLOURS = [
  { k: "brown", f: "none", sw: "#7a5236", by: "" },
  { k: "green", f: "hue-rotate(75deg) saturate(.7) brightness(.85)", sw: "#3d5a40", by: "the-pond" },
  { k: "red", f: "hue-rotate(-25deg) saturate(1.3) brightness(.8)", sw: "#7a2e24", by: "skate-hall" },
  { k: "black", f: "saturate(.15) brightness(.55)", sw: "#2a2826", by: "silver-lake" },
];
const CHARMS = ["bob", "pine", "flake", "star", "heart", "key"] as const;
type Charm = (typeof CHARMS)[number];
const CHARM_BY: Record<Charm, string> = {
  bob: "",
  pine: "long-pine-road",
  flake: "hawk-pass",
  star: "the-church",
  heart: "main-street",
  key: "the-farm",
};
/** "Reach <the place>" — what earns a locked colour or charm */
const reach = (by: string, pt: boolean) => {
  const st = STICKERS.find((x) => x.key === by);
  return st ? (pt ? `Chegue a ${st.pt}` : `Reach ${st.en}`) : "";
};
function useCaseLook(): [{ colour: string; charms: Charm[] }, (l: { colour: string; charms: Charm[] }) => void] {
  const [look, setLook] = useState<{ colour: string; charms: Charm[] }>({ colour: "brown", charms: ["bob"] });
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem("yutopia:case") ?? "null");
      if (v && typeof v.colour === "string" && Array.isArray(v.charms))
        setLook({
          colour: v.colour,
          charms: v.charms.filter((c: string) => (CHARMS as readonly string[]).includes(c)).slice(0, 3),
        });
    } catch {}
  }, []);
  const set = (l: { colour: string; charms: Charm[] }) => {
    setLook(l);
    try {
      localStorage.setItem("yutopia:case", JSON.stringify(l));
    } catch {}
  };
  return [look, set];
}

export function LampCase() {
  const t = useTr();
  const [look, setLook] = useCaseLook();
  const w = useWorld();
  const inv = useHud((s) => s.lamp.inv);
  // (what's earned: a sticker's place reached; the chosen but not earned — another device's — falls back)
  const earned = (by: string) => !by || (inv?.stickers ?? []).includes(by);
  const colour = COLOURS.find((c) => c.k === look.colour && earned(c.by)) ?? COLOURS[0];
  const leatherF = colour.f;
  const charms = look.charms.filter((c) => earned(CHARM_BY[c]));
  const me = useHud((s) => s.me);
  const pt = t("hallway") === "Corredor";
  const [sel, setSel] = useState<number | null>(null);
  const [drag, setDragState] = useState<Drag | null>(null);
  // (held at once, not after the next render: a quick press and release would find nothing held)
  const dragRef = useRef<Drag | null>(null);
  const setDrag = (d: Drag | null) => {
    dragRef.current = d;
    setDragState(d);
  };
  const stage = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const close = useCallback(() => hud.set({ panel: { kind: null } }), []);
  // the pointer's let go while it's open (and taken again after, if it was)
  useEffect(() => {
    const looking = !!w?.tp?.mouseLook.looking;
    if (looking) w?.tp?.mouseLook.setLook(false);
    return () => {
      if (looking) w?.tp?.mouseLook.resumeLook();
    };
  }, [w]);
  // the stage (the mock's 1440 × 900) scaled to the window
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / W, window.innerHeight / H));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  // everything carried, by slot: the pockets, the hands (2–5), the left hand
  const things = useMemo(() => {
    const out: { slot: number; it: Thing }[] = [];
    if (!inv) return out;
    for (const [i, it] of inv.pockets.entries()) if (it) out.push({ slot: i, it });
    for (const [i, it] of inv.quick.entries()) if (it) out.push({ slot: QUICK_SLOT + i, it });
    if (inv.hand) out.push({ slot: HAND_SLOT, it: inv.hand });
    return out;
  }, [inv]);
  // the shared rules want an Inventory: the published one is enough for the checks
  const shape = useMemo(
    () =>
      inv
        ? {
            pockets: inv.pockets as never,
            quick: inv.quick as never,
            hand: inv.hand as never,
            pages: [],
            place: inv.place,
          }
        : null,
    [inv],
  );
  // what's on the ground in reach (F14a): to be laid in
  const ground = useGround();
  const store = useStore();
  const send = (type: string, msg: unknown) => w?.room?.send(type as never, msg as never);
  // (a car's boot or glove box open: what's let go goes into it — plan 93 S4, as the old pack's)
  const dropSlot = (slot: number) => {
    if (store) send("car:put", { kind: store.kind, id: store.id, from: slot });
    else send("dark:drop", { slot });
  };
  const cellAt = (cx: number, cy: number) => {
    const r = stage.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return { x: Math.floor(((cx - r.left) / scale - GX) / C), y: Math.floor(((cy - r.top) / scale - GY) / C) };
  };
  const fits = (d: Drag) => !!shape && fitsAt(shape, d.id as ItemId, [d.x - d.dx, d.y - d.dy, d.r], d.slot ?? -1);
  // keys: R turns what's held, Esc / I closes, 1–5 puts the picked one at a hand
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.code === "Escape" || e.code === "KeyI") {
        e.preventDefault();
        e.stopPropagation();
        if (dragRef.current) setDrag(null);
        else close();
      } else if (e.code === "KeyR" && dragRef.current) {
        e.preventDefault();
        const d = dragRef.current;
        setDrag({ ...d, r: d.r ? 0 : 1, dx: d.dy, dy: d.dx });
      } else if (/^Digit[1-5]$/.test(e.code) && sel !== null) {
        e.preventDefault();
        const n = Number(e.code.slice(5));
        const to = n === 1 ? HAND_SLOT : QUICK_SLOT + n - 2;
        send("dark:move", { from: sel, to });
        // (the picked one follows the thing to its new slot — a swap puts another where it was)
        const id = things.find((x) => x.slot === sel)?.it.id;
        if (id && fitsSlot(to, id as ItemId)) setSel(to);
      } else if (e.code === "KeyQ" && sel !== null) {
        dropSlot(sel);
        setSel(null);
      }
    };
    window.addEventListener("keydown", on, true);
    return () => window.removeEventListener("keydown", on, true);
  });
  const picked = sel !== null ? things.find((x) => x.slot === sel)?.it : null;
  const initial = (me?.name ?? "A").trim().charAt(0).toUpperCase();
  const hands = [HAND_SLOT, QUICK_SLOT, QUICK_SLOT + 1, QUICK_SLOT + 2, QUICK_SLOT + 3];
  const usedCells = things.reduce((n, { it }) => {
    const [a, b] = sizeOf(it.id as ItemId, 0);
    return n + a * b;
  }, 0);
  return (
    <div
      className="lamp pointer-events-auto absolute inset-0"
      data-lamp-case=""
      style={{ zIndex: 60, background: "rgba(6,5,4,.82)", backdropFilter: "blur(8px)" }}
      onPointerMove={(e) => {
        const d = dragRef.current;
        if (!d) return;
        const c = cellAt(e.clientX, e.clientY);
        if (c.x !== d.x || c.y !== d.y) setDrag({ ...d, x: c.x, y: c.y, moved: true });
      }}
      onPointerUp={() => {
        const d = dragRef.current;
        if (!d) return;
        setDrag(null);
        if (!d.moved && d.slot !== null) return setSel(d.slot === sel ? null : d.slot);
        if (!fits(d)) return;
        const at = [d.x - d.dx, d.y - d.dy, d.r];
        if (d.slot !== null) send("dark:place", { slot: d.slot, x: at[0], y: at[1], r: at[2] });
        else if (d.ground) send("dark:pick", { id: d.ground, at });
        else if (d.store) send("car:take", { ...d.store, at });
        else if (d.stash !== undefined) send("dark:unstash", { i: d.stash, id: d.id, at });
      }}
    >
      <div
        ref={stage}
        className="absolute"
        style={{ left: "50%", top: "50%", width: W, height: H, transform: `translate(-50%,-50%) scale(${scale})` }}
      >
        <div className="absolute" style={{ left: 70, top: 38, display: "flex", alignItems: "flex-end", gap: 40 }}>
          <div
            className="l-glow"
            style={{ font: "italic 900 46px/1 var(--f-sans)", letterSpacing: "-.02em", textTransform: "uppercase" }}
          >
            {pt ? `Maleta de ${me?.name?.split(" ")[0] ?? ""}` : `${me?.name?.split(" ")[0] ?? ""}'s Case`}
          </div>
          <div className="l-cap" style={{ marginBottom: 8, color: "var(--l-soft)" }}>
            {pt ? "espaço" : "room"}{" "}
            <b style={{ color: "var(--l-gold)", fontWeight: 500 }}>
              {usedCells} / {CASE_W * CASE_H}
            </b>
            {inv?.stash.length ? (
              <>
                {" "}
                · {pt ? "em casa" : "at home"}{" "}
                <b style={{ color: "var(--l-gold)", fontWeight: 500 }}>{inv.stash.length}</b>
              </>
            ) : null}
          </div>
        </div>
        <div style={{ filter: leatherF }}>
          <CaseLid name={me?.name ?? ""} pt={pt} stickers={[]} leatherOnly />
          <CaseBody leatherOnly />
        </div>
        <CaseLid name={me?.name ?? ""} pt={pt} stickers={inv?.stickers ?? []} />
        <CaseBody />
        {/* the things, where they lie */}
        {things.map(({ slot, it }) => {
          const p = inv?.place[slot];
          if (!p) return null;
          const [cw, ch] = sizeOf(it.id as ItemId, p[2]);
          const moving = drag?.slot === slot && drag.moved;
          const hand = hands.indexOf(slot);
          return (
            <div
              key={slot}
              className="absolute"
              data-case-slot={slot}
              onPointerDown={(e) => {
                e.preventDefault();
                const c = cellAt(e.clientX, e.clientY);
                setDrag({ slot, id: it.id, r: p[2], x: c.x, y: c.y, dx: c.x - p[0], dy: c.y - p[1], moved: false });
              }}
              style={{
                left: GX + p[0] * C + 3,
                top: GY + p[1] * C + 3,
                width: cw * C - 6,
                height: ch * C - 6,
                borderRadius: 7,
                background:
                  "radial-gradient(ellipse at 50% 60%,rgba(0,0,0,.25),rgba(0,0,0,.55)),url(/lamp/case/foam.jpg)",
                boxShadow: `inset 0 7px 12px rgba(0,0,0,.9),inset 0 -1px 0 rgba(255,240,210,.12)${sel === slot ? ",0 0 0 2px #f3d27a,0 0 22px rgba(243,215,140,.5)" : ""}`,
                display: "grid",
                placeItems: "center",
                cursor: "grab",
                opacity: moving ? 0.35 : 1,
              }}
            >
              <Pic id={it.id} w={cw * C - 16} h={ch * C - 14} turned={p[2] === 1} />
              {hand >= 0 && <Brass n={hand + 1} />}
              <Count it={it} />
            </div>
          );
        })}
        {/* what's held: where it'd go, green if it fits */}
        {drag?.moved && <Ghost d={drag} ok={fits(drag)} />}
        <div style={{ filter: leatherF }}>
          <Handle />
        </div>
        <Charms charms={charms} />
        {!picked && (
          <div className="absolute" style={{ left: 820, top: 720 }}>
            <div className="l-cap" style={{ color: "var(--l-soft)" }}>
              {pt ? "maleta" : "case"}
            </div>
            <div style={{ display: "flex", gap: 9, marginTop: 8 }}>
              {COLOURS.map((c) => {
                const ok = earned(c.by);
                return (
                  <button
                    type="button"
                    key={c.k}
                    aria-label={ok ? c.k : reach(c.by, pt)}
                    title={ok ? undefined : reach(c.by, pt)}
                    disabled={!ok}
                    onClick={() => setLook({ ...look, colour: c.k })}
                    style={{
                      all: "unset",
                      cursor: ok ? "pointer" : "help",
                      position: "relative",
                      width: 30,
                      height: 30,
                      borderRadius: "50%",
                      opacity: ok ? 1 : 0.35,
                      background: `radial-gradient(circle at 35% 30%,rgba(255,230,190,.3),transparent 60%),${c.sw}`,
                      boxShadow:
                        colour.k === c.k ? "0 0 0 2px #0b0a08,0 0 0 4px #f3d27a" : "0 0 0 1px rgba(255,255,255,.2)",
                    }}
                  >
                    {!ok && <Lock />}
                  </button>
                );
              })}
            </div>
            <div className="l-cap" style={{ color: "var(--l-soft)", marginTop: 14 }}>
              {pt ? "chaveiros" : "charms"}{" "}
              <b style={{ color: "var(--l-gold)", fontWeight: 500 }}>{charms.length} / 3</b>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              {CHARMS.map((c) => {
                const on = charms.includes(c);
                const ok = earned(CHARM_BY[c]);
                return (
                  <button
                    type="button"
                    key={c}
                    aria-label={ok ? c : reach(CHARM_BY[c], pt)}
                    title={ok ? undefined : reach(CHARM_BY[c], pt)}
                    disabled={!ok}
                    onClick={() =>
                      setLook({
                        ...look,
                        charms: on ? charms.filter((x) => x !== c) : [...charms, c].slice(-3),
                      })
                    }
                    style={{
                      all: "unset",
                      cursor: ok ? "pointer" : "help",
                      position: "relative",
                      opacity: ok ? 1 : 0.35,
                      width: 38,
                      height: 38,
                      display: "grid",
                      placeItems: "center",
                      background: on ? "rgba(243,215,140,.18)" : "rgba(0,0,0,.5)",
                      boxShadow: on ? "inset 0 0 0 1.5px #f3d27a" : "inset 0 0 0 1px rgba(255,255,255,.14)",
                    }}
                  >
                    <svg width="30" height="34" viewBox="-17 -20 34 40" aria-hidden="true">
                      <CharmArt k={c} />
                    </svg>
                    {!ok && <Lock />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {/* the right: the hands, the picked thing, its note — or what's on the ground */}
        <div className="absolute" style={{ left: 820, top: 106, width: 550 }}>
          <div className="l-cap" style={{ color: "var(--l-gold)", letterSpacing: ".18em" }}>
            {pt ? "MÃOS · ATALHOS NA MALETA" : "HANDS · SHORTCUTS INTO THE CASE"}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            {hands.map((slot, i) => {
              const it = things.find((x) => x.slot === slot)?.it;
              const on = sel === slot;
              return (
                <button
                  type="button"
                  key={slot}
                  onClick={() => setSel(it ? slot : null)}
                  style={{
                    all: "unset",
                    cursor: it ? "pointer" : "default",
                    position: "relative",
                    width: 102,
                    height: 68,
                    borderRadius: 7,
                    padding: 3,
                    background: `url(/lamp/case/brushed.png),${on ? "linear-gradient(160deg,#fbe7a8,#d6aa55 28%,#8c6426 58%,#c99b49 78%,#5e421a)" : "linear-gradient(160deg,#6b665e,#2e2b27 55%,#4a4640)"}`,
                    boxShadow: on ? "0 0 20px rgba(243,215,140,.45)" : "0 3px 6px rgba(0,0,0,.6)",
                  }}
                >
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      borderRadius: 5,
                      background: "url(/lamp/case/foam.jpg)",
                      boxShadow: "inset 0 4px 8px rgba(0,0,0,.85)",
                      display: "grid",
                      placeItems: "center",
                    }}
                  >
                    {it ? (
                      <Pic id={it.id} w={82} h={40} />
                    ) : (
                      <span className="l-cap" style={{ opacity: 0.4 }}>
                        {pt ? "livre" : "free"}
                      </span>
                    )}
                    <span
                      style={{
                        position: "absolute",
                        left: 9,
                        top: 7,
                        font: "400 17px/1 var(--f-num)",
                        color: on ? "#f3d27a" : "rgba(239,233,220,.6)",
                      }}
                    >
                      {i + 1}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
          {picked && sel !== null ? (
            <Picked
              it={picked}
              slot={sel}
              pt={pt}
              initial={initial}
              send={send}
              into={store?.label ?? null}
              drop={dropSlot}
              onMoved={setSel}
              onDone={() => setSel(null)}
            />
          ) : store ? (
            <Ground
              items={store.items.map((it, i) => ({ id: `${i}`, item: it.id, n: it.n }))}
              pt={pt}
              title={store.label}
              onTake={(g, e) => {
                const c = cellAt(e.clientX, e.clientY);
                setDrag({
                  slot: null,
                  store: { kind: store.kind, id: store.id, i: Number(g.id) },
                  id: g.item,
                  r: 0,
                  x: c.x,
                  y: c.y,
                  dx: 0,
                  dy: 0,
                  moved: true,
                });
              }}
            />
          ) : ground.length ? (
            <Ground
              items={ground}
              pt={pt}
              onTake={(g, e) => {
                const c = cellAt(e.clientX, e.clientY);
                setDrag({ slot: null, ground: g.id, id: g.item, r: 0, x: c.x, y: c.y, dx: 0, dy: 0, moved: true });
              }}
            />
          ) : inv?.stash.length ? (
            <Ground
              items={inv.stash.map((it, i) => ({ id: `${i}`, item: it.id, n: it.n }))}
              pt={pt}
              title={pt ? "Em casa (seu quarto, ou o armário do saguão)" : "At home (your room, or the lobby's locker)"}
              onTake={(g, e) => {
                const c = cellAt(e.clientX, e.clientY);
                setDrag({
                  slot: null,
                  stash: Number(g.id),
                  id: g.item,
                  r: 0,
                  x: c.x,
                  y: c.y,
                  dx: 0,
                  dy: 0,
                  moved: true,
                });
              }}
            />
          ) : (
            <div className="l-cap" style={{ marginTop: 40, color: "var(--l-dim)", lineHeight: 1.8 }}>
              {pt ? "clique em algo na maleta" : "click something in the case"}
            </div>
          )}
        </div>
        <div className="absolute l-keys l-sh" style={{ right: 44, bottom: 22 }}>
          {(
            [
              [pt ? "Arrastar" : "Drag", pt ? "Mover" : "Move"],
              ["R", pt ? "Girar" : "Turn"],
              ["1–5", pt ? "Às mãos" : "To a hand"],
              ["Q", pt ? "Largar" : "Drop"],
              ["Esc", pt ? "Fechar" : "Close"],
            ] as const
          ).map(([k, l]) => (
            <span key={k}>
              <span className="l-key">{k}</span>
              {l}
            </span>
          ))}
          <button
            type="button"
            onClick={() => send("dark:organize", {})}
            className="l-key"
            style={{ cursor: "pointer", border: 0, padding: "0 10px", height: 26 }}
          >
            {pt ? "Arrumar" : "Organize"}
          </button>
        </div>
      </div>
    </div>
  );
}

// what's on the ground in reach, my floor
function useGround(): { id: string; item: string; n: number }[] {
  const w = useWorld();
  const [list, setList] = useState<{ id: string; item: string; n: number }[]>([]);
  useEffect(() => {
    const tick = () => {
      const room = w?.room;
      const me = w?.meAt();
      if (!room || !me) return;
      const out: { id: string; item: string; n: number }[] = [];
      room.state.drops?.forEach((d: { id: string; item: string; n: number; x: number; y: number; level?: number }) => {
        if ((d.level ?? 0) === w.level && Math.hypot(d.x - me.x, d.y - me.y) < 2.4)
          out.push({ id: d.id, item: d.item, n: d.n });
      });
      setList((was) => (JSON.stringify(was) === JSON.stringify(out) ? was : out));
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [w]);
  return list;
}

// (F14a) a car's boot or glove box open by me: what's in it, a second box beside the case
function useStore(): { kind: "boot" | "glove"; id: string; label: string; items: { id: string; n: number }[] } | null {
  const w = useWorld();
  const [st, setSt] = useState<ReturnType<typeof useStore>>(null);
  useEffect(() => {
    const tick = () => {
      const s = w?.cars?.store() ?? null;
      const v = s
        ? { kind: s.kind, id: s.id, label: s.label, items: s.items.map((it) => ({ id: it.id, n: it.n })) }
        : null;
      setSt((was) => (JSON.stringify(was) === JSON.stringify(v) ? was : v));
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [w]);
  return st;
}

function Pic({ id, w, h, turned }: { id: string; w: number; h: number; turned?: boolean }) {
  return (
    // biome-ignore lint/performance/noImgElement: the item's own picture
    <img
      src={asset(`/life/items/${id}.webp`)}
      alt=""
      draggable={false}
      style={{
        width: turned ? h : w,
        height: turned ? w : h,
        maxWidth: "none",
        objectFit: "contain",
        transform: turned ? "rotate(90deg)" : undefined,
        filter: "drop-shadow(0 3px 2px rgba(0,0,0,.9)) drop-shadow(0 8px 8px rgba(0,0,0,.55))",
        pointerEvents: "none",
      }}
    />
  );
}
const Count = ({ it }: { it: Thing }) =>
  it.loaded !== undefined || it.n > 1 ? (
    <span
      style={{
        position: "absolute",
        right: 6,
        bottom: 3,
        font: "400 20px/1 var(--f-num)",
        color: "#f6efe0",
        textShadow: "0 1px 2px #000,0 0 6px rgba(0,0,0,.8)",
      }}
    >
      {it.loaded !== undefined ? it.loaded : `×${it.n}`}
    </span>
  ) : null;
const Brass = ({ n }: { n: number }) => (
  <span
    style={{
      position: "absolute",
      left: 5,
      top: 5,
      width: 20,
      height: 20,
      borderRadius: 3,
      background:
        "url(/lamp/case/brushed.png),linear-gradient(160deg,#fbe7a8,#d6aa55 28%,#8c6426 58%,#c99b49 78%,#5e421a)",
      color: "#2a1c08",
      font: "900 12px/20px var(--f-sans)",
      textAlign: "center",
      boxShadow: "0 1px 2px rgba(0,0,0,.7),inset 0 1px 0 rgba(255,255,255,.6)",
    }}
  >
    {n}
  </span>
);
function Ghost({ d, ok }: { d: Drag; ok: boolean }) {
  const [cw, ch] = sizeOf(d.id as ItemId, d.r);
  const x = d.x - d.dx;
  const y = d.y - d.dy;
  return (
    <div
      className="absolute"
      style={{
        left: GX + x * C + 3,
        top: GY + y * C + 3,
        width: cw * C - 6,
        height: ch * C - 6,
        borderRadius: 7,
        background: ok ? "rgba(120,220,110,.14)" : "rgba(227,89,63,.16)",
        boxShadow: `inset 0 0 0 2px ${ok ? "#7ddc6e" : "#e3593f"},0 0 20px ${ok ? "rgba(120,220,110,.5)" : "rgba(227,89,63,.4)"}`,
        display: "grid",
        placeItems: "center",
        pointerEvents: "none",
        transform: "translate(6px,-8px) rotate(-3deg)",
      }}
    >
      <Pic id={d.id} w={cw * C - 14} h={ch * C - 14} turned={d.r === 1} />
    </div>
  );
}

// the lid open behind: leather, a felt lining, your note; the stickers you've earned (F6a: a place reached, the first
// time — shared stickers.ts), your latest photo from the phone as a polaroid
function CaseLid({
  name,
  pt,
  stickers,
  leatherOnly,
}: {
  name: string;
  pt: boolean;
  stickers: string[];
  leatherOnly?: boolean;
}) {
  const photo = useLatestPhoto();
  const LX = GX - 34;
  const LY = 100;
  const LW = CASE_W * C + 68;
  const LH = 196;
  if (leatherOnly) return <Leather x={LX} y={LY} w={LW} h={LH} />;
  return (
    <>
      <div
        className="absolute"
        style={{
          left: LX + 22,
          top: LY + 22,
          width: LW - 44,
          height: LH - 40,
          borderRadius: 6,
          background:
            "radial-gradient(ellipse at 40% 20%,rgba(255,230,190,.07),transparent 60%),url(/lamp/case/felt.jpg)",
          boxShadow: "inset 0 4px 14px rgba(0,0,0,.85),inset 0 0 0 1px rgba(0,0,0,.6)",
        }}
      />
      {photo && (
        <div
          className="absolute"
          style={{
            left: LX + 36,
            top: LY + 28,
            width: 124,
            height: 142,
            padding: "8px 8px 28px",
            transform: "rotate(-6deg)",
            background: "url(/lamp/case/card.png),#f1ece2",
            boxShadow: "0 8px 8px rgba(0,0,0,.6)",
          }}
        >
          <div
            style={{
              width: "100%",
              height: "100%",
              background: `url(${photo}) center / cover`,
              filter: "sepia(.3) saturate(.8) contrast(.92)",
              boxShadow: "inset 0 0 14px rgba(40,20,0,.45)",
            }}
          />
        </div>
      )}
      {stickers.length === 0 && !photo && (
        <div
          className="absolute"
          style={{
            left: LX + 44,
            top: LY + 40,
            width: 300,
            font: "500 12px/1.7 var(--f-mono)",
            letterSpacing: ".16em",
            textTransform: "uppercase",
            color: "rgba(239,233,220,.45)",
          }}
        >
          {pt ? "Adesivos chegam dos lugares que você alcança" : "Stickers come from the places you reach"}
        </div>
      )}
      {STICKERS.filter((st) => stickers.includes(st.key)).map((st, i) => {
        const at = SPOTS[i % SPOTS.length];
        return (
          <div
            key={st.key}
            className="absolute"
            style={{ left: LX + at[0], top: LY + at[1], transform: `rotate(${at[2]}deg)` }}
          >
            <Sticker k={st.key} name={pt ? st.pt : st.en} />
          </div>
        );
      })}
      <div
        className="absolute"
        style={{
          left: LX + 466,
          top: LY + 26,
          width: 138,
          height: 138,
          transform: "rotate(2.5deg)",
          background:
            "linear-gradient(90deg,transparent 30px,rgba(200,70,60,.45) 30px 31.5px,transparent 31.5px),repeating-linear-gradient(180deg,transparent 0 23px,rgba(80,110,170,.28) 23px 24px),url(/lamp/case/card.png)",
          boxShadow: "0 7px 8px rgba(0,0,0,.55)",
          padding: "4px 4px 0 36px",
          font: "700 19px/24px var(--f-hand)",
          color: "#2b2118",
        }}
      >
        {pt ? `de ${name}. se achar → o diner, main st.` : `property of ${name}. if found → the diner, main st.`}{" "}
        <span style={{ color: "#a8392a" }}>♥</span>
      </div>
    </>
  );
}
// the charms on the handle: chains of gold links, each one shaded like enamel
function CharmArt({ k }: { k: Charm }) {
  if (k === "pine")
    return (
      <g>
        <path d="M0 -16 L12 4 H5 L13 16 H-13 L-5 4 H-12Z" fill="#c99b49" />
        <path d="M0 -12 L9 3 H3 L10 13 H-10 L-3 3 H-9Z" fill="#3f7a4a" />
      </g>
    );
  if (k === "bob")
    return (
      <g transform="scale(.5) translate(-17,-31)">
        <path d="M17 0 L34 24 L17 62 L0 24Z" fill="#56e04a" />
        <path d="M17 0 L34 24 L17 30Z" fill="#b6ffa6" />
        <path d="M0 24 L17 30 L17 62Z" fill="#26a022" />
      </g>
    );
  if (k === "flake")
    return (
      <g stroke="#b9d8ee" strokeWidth="3" strokeLinecap="round">
        <path d="M0 -14V14M-12 -7L12 7M-12 7L12 -7" />
      </g>
    );
  if (k === "star")
    return (
      <path
        d="M0 -14 L4 -4 L14 -4 L6 3 L9 13 L0 7 L-9 13 L-6 3 L-14 -4 L-4 -4Z"
        fill="#f3d27a"
        stroke="#8c6426"
        strokeWidth="1"
      />
    );
  if (k === "heart")
    return (
      <path
        d="M0 12 C-14 2 -12 -10 -4 -10 C-1 -10 0 -7 0 -6 C0 -7 1 -10 4 -10 C12 -10 14 2 0 12Z"
        fill="#c0392b"
        stroke="#c99b49"
        strokeWidth="1.2"
      />
    );
  return (
    <g fill="#c99b49" stroke="#5a3f15" strokeWidth=".8">
      <circle cx="0" cy="-8" r="6" />
      <path d="M-2 -2 h4 v16 h-3 v-3 h-3 v-2 h3 v-2 h-3 v-2 h3z" />
    </g>
  );
}
// a small brass padlock on what's not earned yet
function Lock() {
  return (
    <svg
      width="12"
      height="14"
      viewBox="0 0 12 14"
      aria-hidden="true"
      style={{ position: "absolute", right: -3, bottom: -3, filter: "drop-shadow(0 1px 1px rgba(0,0,0,.8))" }}
    >
      <path d="M3 6V4a3 3 0 0 1 6 0v2" fill="none" stroke="#c99b49" strokeWidth="1.6" />
      <rect x="1" y="6" width="10" height="7.5" rx="1.2" fill="#c99b49" />
      <circle cx="6" cy="9.4" r="1.1" fill="#3a2a14" />
    </svg>
  );
}

function Charms({ charms }: { charms: Charm[] }) {
  const HY = GY + CASE_H * C + 26;
  const HX = GX + (CASE_W * C) / 2;
  return (
    <svg
      className="absolute"
      style={{ left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}
      width={W}
      height={H}
      aria-hidden="true"
    >
      {charms.map((k, i) => {
        const x = HX - 34 + i * 34;
        const y0 = HY + 40;
        const len = 46 + (i % 2) * 16;
        return (
          <g key={k} style={{ filter: "drop-shadow(0 4px 4px rgba(0,0,0,.7))" }}>
            <circle cx={x} cy={y0} r="6" fill="none" stroke="#c99b49" strokeWidth="2.4" />
            {Array.from({ length: Math.floor((len - 24) / 6) }, (_, j) => y0 + 8 + j * 6).map((cy, j) => (
              <ellipse
                key={cy}
                cx={x}
                cy={cy}
                rx={j % 2 ? 1.6 : 3}
                ry="4"
                fill="none"
                stroke="#c99b49"
                strokeWidth="1.5"
              />
            ))}
            <g transform={`translate(${x},${y0 + len})`}>
              <CharmArt k={k} />
            </g>
          </g>
        );
      })}
    </svg>
  );
}

// where the stickers go on the lid, as they come (x, y, turn)
const SPOTS: [number, number, number][] = [
  [196, 34, 8],
  [312, 30, 3],
  [290, 108, -7],
  [176, 112, -4],
  [388, 96, 6],
  [236, 74, -10],
  [344, 132, 2],
  [168, 52, 12],
];
const SHADOW = "drop-shadow(0 3px 4px rgba(0,0,0,.55))";
const GLOSS =
  "linear-gradient(128deg,rgba(255,255,255,.42) 0%,rgba(255,255,255,.08) 28%,transparent 42%,transparent 70%,rgba(255,255,255,.1) 85%,transparent)";
// each place's sticker, its own kind of thing
function Sticker({ k, name }: { k: string; name: string }) {
  const label = name.toUpperCase();
  if (k === "silver-lake" || k === "the-pond")
    return (
      <div style={{ width: 96, height: 96, borderRadius: "50%", background: "#f4efe4", padding: 5, filter: SHADOW }}>
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            borderRadius: "50%",
            overflow: "hidden",
            background: `linear-gradient(180deg,#f2c78a 0 38%,${k === "the-pond" ? "#5a8fb0" : "#3c7fa5"} 38%)`,
          }}
        >
          <svg viewBox="0 0 86 86" width="86" height="86" style={{ position: "absolute", inset: 0 }} aria-hidden="true">
            <path d="M0 40 L20 20 L32 34 L46 16 L66 38 L86 26 V46 H0Z" fill="#2c4f63" />
            {[6, 18, 64, 76].map((x, i) => (
              <path key={x} d={`M${x} ${48 - (i % 2) * 3} l6 -15 l6 15z`} fill="#1f3b2c" />
            ))}
          </svg>
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 10,
              textAlign: "center",
              font: "400 15px/1 var(--f-num)",
              letterSpacing: ".1em",
              color: "#f4efe4",
            }}
          >
            {label}
          </div>
          <div style={{ position: "absolute", inset: 0, background: GLOSS }} />
        </div>
      </div>
    );
  if (k === "long-pine-road" || k === "main-street")
    return (
      <div
        style={{
          position: "relative",
          width: 140,
          height: 62,
          background: "#f4efe4",
          borderRadius: 8,
          padding: 4,
          filter: SHADOW,
        }}
      >
        <div
          style={{
            position: "relative",
            height: "100%",
            borderRadius: 5,
            background: "linear-gradient(180deg,#1f7a4c,#15603a)",
            boxShadow: "inset 0 0 0 2px #e9f2ea",
            color: "#f2f6f0",
            textAlign: "center",
            paddingTop: 8,
            overflow: "hidden",
          }}
        >
          <div style={{ font: "800 12.5px/1 var(--f-sans)", letterSpacing: ".06em" }}>{label}</div>
          <div style={{ font: "800 20px/1.15 var(--f-sans)" }}>
            {k === "long-pine-road" ? "13.7 km →" : "← YUTOPIA"}
          </div>
          <div style={{ position: "absolute", inset: 0, background: GLOSS }} />
        </div>
      </div>
    );
  if (k === "hawk-pass")
    return (
      <svg width="170" height="52" style={{ filter: SHADOW }} aria-hidden="true">
        <path d="M8 2 L168 26 L8 50Z" fill="#a8392a" />
        <path d="M12 7 L156 26 L12 45" fill="none" stroke="#f3e2c6" strokeWidth="1.2" strokeDasharray="3 3" />
        <rect x="0" y="0" width="12" height="52" rx="2" fill="#efe3c8" />
        <text x="58" y="32" fontFamily="var(--font-bebas)" fontSize="17" letterSpacing="2" fill="#f3e2c6">
          {label}
        </text>
      </svg>
    );
  // the rest: a vinyl tag in the place's colour
  const col = k === "the-farm" ? "#b0574a" : k === "skate-hall" ? "#141414" : "#e8dcc0";
  const ink = k === "the-church" ? "#2b2118" : "#f4efe4";
  return (
    <div
      style={{
        position: "relative",
        padding: "8px 14px",
        background: col,
        color: ink,
        border: "4px solid #f4efe4",
        borderRadius: 10,
        font: "400 19px/1 var(--f-num)",
        letterSpacing: ".08em",
        filter: SHADOW,
        overflow: "hidden",
      }}
    >
      {label}
      <div style={{ position: "absolute", inset: 0, background: GLOSS }} />
    </div>
  );
}
// your newest photo from the phone (its own API), for the lid's polaroid
function useLatestPhoto(): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void import("@/world/phone/data")
      .then((m) => m.phoneApi.photos())
      .then((list) => {
        const mine = list.filter((p) => p.kind === "photo");
        if (alive && mine.length) setUrl(mine[0].url);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return url;
}

function Leather({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <div
      className="absolute"
      style={{
        left: x,
        top: y,
        width: w,
        height: h,
        borderRadius: 18,
        background:
          "radial-gradient(ellipse 70% 60% at 35% 30%,rgba(255,210,160,.16),transparent 70%),radial-gradient(ellipse at 50% 50%,transparent 62%,rgba(255,214,170,.12) 92%),url(/lamp/case/leather.jpg)",
        boxShadow:
          "inset 0 2px 0 rgba(255,222,180,.22),inset 0 0 0 1px rgba(0,0,0,.5),inset 0 -5px 10px rgba(0,0,0,.55),0 2px 0 #120b06",
      }}
    >
      <svg width={w} height={h} style={{ position: "absolute", inset: 0, overflow: "visible" }} aria-hidden="true">
        <rect
          x="11"
          y="12"
          width={w - 22}
          height={h - 22}
          rx="10"
          fill="none"
          stroke="rgba(0,0,0,.65)"
          strokeWidth="2.6"
          strokeDasharray="7 5"
        />
        <rect
          x="11"
          y="11"
          width={w - 22}
          height={h - 22}
          rx="10"
          fill="none"
          stroke="#d6b483"
          strokeWidth="2"
          strokeDasharray="7 5"
          opacity=".85"
        />
      </svg>
    </div>
  );
}
function CaseBody({ leatherOnly }: { leatherOnly?: boolean }) {
  const BX = GX - 34;
  const BY = GY - 30;
  const BW = CASE_W * C + 68;
  const BH = CASE_H * C + 62;
  if (leatherOnly) return <Leather x={BX} y={BY} w={BW} h={BH} />;
  return (
    <>
      <div
        className="absolute"
        style={{
          left: GX - 6,
          top: GY - 6,
          width: CASE_W * C + 12,
          height: CASE_H * C + 12,
          borderRadius: 6,
          background: "url(/lamp/case/foam.jpg)",
          boxShadow: "inset 0 6px 16px rgba(0,0,0,.9),inset 0 0 0 1px rgba(0,0,0,.7)",
        }}
      />
      <div
        className="absolute"
        style={{
          left: GX,
          top: GY,
          width: CASE_W * C,
          height: CASE_H * C,
          backgroundImage:
            "linear-gradient(rgba(0,0,0,.55) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,.55) 1px,transparent 1px)",
          backgroundSize: `${C}px ${C}px`,
        }}
      />
      {[GX + 80, GX + CASE_W * C - 150].map((x) => (
        <div
          key={x}
          className="absolute"
          style={{
            left: x,
            top: BY - 14,
            width: 70,
            height: 26,
            borderRadius: 5,
            background:
              "url(/lamp/case/brushed.png),linear-gradient(160deg,#fbe7a8,#d6aa55 28%,#8c6426 58%,#c99b49 78%,#5e421a)",
            boxShadow: "0 3px 3px rgba(0,0,0,.75),inset 0 1px 0 rgba(255,255,255,.65)",
          }}
        />
      ))}
    </>
  );
}
function Handle() {
  const HY = GY + CASE_H * C + 26;
  const HX = GX + (CASE_W * C) / 2;
  return (
    <svg
      className="absolute"
      style={{ left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}
      width={W}
      height={H}
      aria-hidden="true"
    >
      <path
        d={`M${HX - 74} ${HY + 8} C ${HX - 74} ${HY + 52}, ${HX + 74} ${HY + 52}, ${HX + 74} ${HY + 8}`}
        fill="none"
        stroke="#3a2618"
        strokeWidth="18"
        strokeLinecap="round"
      />
      <path
        d={`M${HX - 74} ${HY + 8} C ${HX - 74} ${HY + 52}, ${HX + 74} ${HY + 52}, ${HX + 74} ${HY + 8}`}
        fill="none"
        stroke="#d6b483"
        strokeWidth="1.4"
        strokeDasharray="4 4"
        opacity=".7"
      />
    </svg>
  );
}

// the picked thing: on velvet, its numbers, what you can do with it, your note about it
function Picked({
  it,
  slot,
  pt,
  initial,
  send,
  into,
  drop,
  onMoved,
  onDone,
}: {
  it: Thing;
  slot: number;
  pt: boolean;
  initial: string;
  send: (type: string, msg: unknown) => void;
  /** a car's boot or glove box open (its name): Drop puts it there */
  into: string | null;
  drop: (slot: number) => void;
  onMoved: (slot: number) => void;
  onDone: () => void;
}) {
  const stats = STATS[it.id];
  const note = NOTES[it.id];
  const name = trMaybe(`dark_item_${it.id}`) ?? it.id;
  const usable = it.id === "aid" || it.id === "battery";
  return (
    <>
      <div
        style={{
          marginTop: 22,
          height: 190,
          borderRadius: 12,
          background:
            "radial-gradient(ellipse 60% 70% at 50% 42%,rgba(255,226,170,.22),transparent 72%),url(/lamp/case/felt.jpg)",
          boxShadow: "inset 0 6px 16px rgba(0,0,0,.75),0 14px 30px rgba(0,0,0,.5)",
          display: "grid",
          placeItems: "center",
        }}
      >
        <Pic id={it.id} w={480} h={150} />
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginTop: 18 }}>
        <div className="l-glow" style={{ font: "400 50px/1 var(--f-name)", textTransform: "uppercase" }}>
          {name}
        </div>
        {it.loaded !== undefined ? (
          <span style={{ font: "400 28px/1 var(--f-num)", color: "#f3d27a" }}>{it.loaded}</span>
        ) : it.n > 1 ? (
          <span style={{ font: "400 28px/1 var(--f-num)", color: "#f3d27a" }}>×{it.n}</span>
        ) : null}
      </div>
      {stats && (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 9 }}>
          {(pt ? ["Dano", "Cadência", "Precisão", "Alcance"] : ["Damage", "Fire rate", "Accuracy", "Range"]).map(
            (k, j) => (
              <div
                key={k}
                style={{
                  display: "grid",
                  gridTemplateColumns: "92px 1fr",
                  gap: 12,
                  alignItems: "center",
                  font: "700 12px/1 var(--f-sans)",
                  letterSpacing: ".1em",
                  textTransform: "uppercase",
                }}
              >
                {k}
                <div style={{ display: "flex", gap: 3 }}>
                  {Array.from({ length: 10 }, (_, i) => (
                    <span
                      // biome-ignore lint/suspicious/noArrayIndexKey: steps
                      key={i}
                      style={{
                        flex: 1,
                        height: 10,
                        borderRadius: 1.5,
                        background:
                          i < stats[j]
                            ? stats[j] === Math.max(...stats)
                              ? "#f3d27a"
                              : "#fff"
                            : "rgba(255,255,255,.1)",
                      }}
                    />
                  ))}
                </div>
              </div>
            ),
          )}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        {usable && (
          <button
            type="button"
            className="l-row on"
            style={{ height: 34, cursor: "pointer" }}
            onClick={() => send("dark:use", { slot })}
          >
            {pt ? "Usar" : "Use"}
          </button>
        )}
        <button
          type="button"
          className="l-row"
          style={{ height: 34, cursor: "pointer" }}
          onClick={() => {
            send("dark:move", { from: slot, to: HAND_SLOT });
            if (fitsSlot(HAND_SLOT, it.id as ItemId)) onMoved(HAND_SLOT);
          }}
        >
          {pt ? "Mão esquerda (1)" : "Left hand (1)"}
        </button>
        <button
          type="button"
          className="l-row"
          style={{ height: 34, cursor: "pointer" }}
          title={pt ? "No seu quarto, ou no armário do saguão" : "In your own room, or by the lobby's locker"}
          onClick={() => {
            send("dark:stash", { slot });
            onDone();
          }}
        >
          {pt ? "Deixar em casa" : "Leave at home"}
        </button>
        <button
          type="button"
          className="l-row"
          style={{ height: 34, cursor: "pointer", color: "#ff9a8a" }}
          onClick={() => {
            drop(slot);
            onDone();
          }}
        >
          {/* (the store's name is "In the boot" / "No porta-malas": put it there) */}
          {into
            ? `${pt ? "Guardar" : "Put it"} ${into.charAt(0).toLowerCase()}${into.slice(1)} (Q)`
            : pt
              ? "Largar (Q)"
              : "Drop (Q)"}
        </button>
      </div>
      {note && (
        <div
          style={{
            marginTop: 18,
            width: 300,
            marginLeft: "auto",
            padding: "12px 16px 14px",
            transform: "rotate(-2deg)",
            background: "url(/lamp/case/card.png)",
            boxShadow: "0 8px 16px rgba(0,0,0,.6)",
            font: "700 24px/1.05 var(--f-hand)",
            color: "#2b2118",
          }}
        >
          {pt ? note[1] : note[0]}
          <div style={{ textAlign: "right", fontSize: 19, color: "#7a5a3a", marginTop: 4 }}>— {initial}.</div>
        </div>
      )}
    </>
  );
}

// what's on the ground beside you: take one up, lay it in the case (F14a)
function Ground({
  items,
  pt,
  title,
  onTake,
}: {
  items: { id: string; item: string; n: number }[];
  pt: boolean;
  title?: string;
  onTake: (g: { id: string; item: string; n: number }, e: React.PointerEvent) => void;
}) {
  return (
    <div style={{ marginTop: 22 }}>
      <div className="l-cap" style={{ color: "var(--l-gold)", letterSpacing: ".18em" }}>
        {title
          ? `${title.toUpperCase()} · ${pt ? "PEGUE E COLOQUE NA MALETA" : "TAKE IT, LAY IT IN THE CASE"}`
          : pt
            ? "NO CHÃO · PEGUE E COLOQUE NA MALETA"
            : "ON THE GROUND · TAKE IT, LAY IT IN THE CASE"}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
        {items.map((g) => {
          const [cw, ch] = sizeOf(g.item as ItemId, 0);
          return (
            <div
              key={g.id}
              onPointerDown={(e) => {
                e.preventDefault();
                onTake(g, e);
              }}
              style={{
                position: "relative",
                width: Math.min(5, cw) * 44,
                height: Math.min(3, ch) * 44,
                minWidth: 80,
                minHeight: 60,
                borderRadius: 7,
                background: "url(/lamp/case/foam.jpg)",
                boxShadow: "inset 0 4px 8px rgba(0,0,0,.85),0 0 0 1px rgba(125,220,110,.5)",
                display: "grid",
                placeItems: "center",
                cursor: "grab",
              }}
            >
              <Pic id={g.item} w={Math.min(5, cw) * 44 - 12} h={Math.min(3, ch) * 44 - 12} />
              {g.n > 1 && (
                <span style={{ position: "absolute", right: 6, bottom: 3, font: "400 18px/1 var(--f-num)" }}>
                  ×{g.n}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ font: "500 13px/1.5 var(--f-sans)", color: "var(--l-dim)", marginTop: 10 }}>
        {pt
          ? "Arraste para a maleta: verde onde cabe, R gira."
          : "Drag it into the case: green where it fits, R turns it."}
      </div>
    </div>
  );
}
