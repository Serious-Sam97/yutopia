"use client";

import type { GpsFriend } from "@yutopia/shared/phone";
import { gpsPlaces, type Place, type Route, routeOver, type Step } from "@yutopia/shared/route";
import { useEffect, useMemo, useRef, useState } from "react";
import { type Key, useTr } from "@/lib/i18n";
import type { WorldController } from "@/world/controller";
import { layings, loadGrounds, onEditsLaid } from "@/world/grounds-load";
import type { PlanData } from "@/world/grounds-plan-data";
import { phone, usePhone } from "@/world/phone/store";
import { useHud } from "@/world/store";
import { useWorld } from "../../ctx";
import s from "../phone.module.css";
import { cx, Ic, PFace } from "../ui";

// The GPS (docs/plan/37-the-gps.md): the Grounds' site plan under a moving
// map — me as an arrow, the route, the friends sharing where they are — a
// search over the places, a card to go to one, and the next turn while I go.
// Away from the phone, a small map in the corner and the next turn on top.

type T = ReturnType<typeof useTr>;

// ── the site plan, drawn once each time god mode's edits are laid (world/grounds-plan.ts) ──
// (and a quarter-size copy: a map zoomed out, the small one in the corner,
// draws from it — scaling the whole plan down every frame is slow)
const PX = 2; // the plan's pixels per tile
const MARGIN = 90;
// the plan's corner (shared grounds.ts GROUNDS.x0 / z0: not imported, the
// Grounds come from the world's own copy — grounds-load.ts)
let X0 = 0;
let Z0 = 0;
interface Plan {
  full: HTMLCanvasElement;
  small: HTMLCanvasElement;
}
let plan: { rev: number; p: Promise<Plan> } | null = null;
// the plan's land and trees worked out in a worker: on the main thread they froze the world
// for ~4 s the first time the map opened (docs/plan/38-the-lag.md). No worker: worked out here.
function planInWorker(edits: unknown): Promise<PlanData | null> {
  return new Promise((done) => {
    let w: Worker;
    try {
      w = new Worker(new URL("../../../../world/grounds-plan.worker.ts", import.meta.url), { type: "module" });
    } catch {
      return done(null);
    }
    w.onmessage = (e: MessageEvent<PlanData>) => {
      w.terminate();
      done(e.data);
    };
    w.onerror = () => {
      w.terminate();
      done(null);
    };
    w.postMessage(edits);
  });
}
function sitePlan(): Promise<Plan> {
  if (plan && plan.rev === layings()) return plan.p;
  const rev = layings();
  const p = loadGrounds()
    .then((g) => Promise.all([import("@/world/grounds-plan"), g, planInWorker(g.editsNow())]))
    .then(([{ drawSitePlan }, g, data]) => {
      X0 = g.GROUNDS.x0;
      Z0 = g.GROUNDS.z0;
      const full = document.createElement("canvas");
      drawSitePlan(full, { px: PX, margin: MARGIN }, data ?? undefined);
      const small = document.createElement("canvas");
      small.width = Math.ceil(full.width / 4);
      small.height = Math.ceil(full.height / 4);
      small.getContext("2d")?.drawImage(full, 0, 0, small.width, small.height);
      return { full, small };
    });
  plan = { rev, p };
  return p;
}
function usePlan(): Plan | null {
  const [c, setC] = useState<Plan | null>(null);
  useEffect(() => {
    let live = true;
    // (again once a new revision's laid: the old one shown till it's drawn)
    const draw = () => {
      const p = sitePlan();
      // (a revision since: that one's drawn instead)
      void p.then((x) => live && plan?.p === p && setC(x));
    };
    draw();
    const off = onEditsLaid(draw);
    return () => {
      live = false;
      off();
    };
  }, []);
  return c;
}

// ── words ──────────────────────────────────────────────────────────────────
export function distLabel(t: T, m: number): string {
  if (m >= 1000) return t("gpsKm").replace("{n}", (m / 1000).toFixed(1));
  return t("gpsM").replace("{n}", String(m < 50 ? Math.max(1, Math.round(m)) : Math.round(m / 10) * 10));
}
export function timeLabel(t: T, secs: number): string {
  return secs < 60 ? t("gpsLessMin") : t("gpsMin").replace("{n}", String(Math.round(secs / 60)));
}
export function stepText(t: T, st: Step, to: string): string {
  if (st.kind === "start")
    return (st.way ? t("gpsStart") : t("gpsStartOff"))
      .replace("{dir}", t(`gpsDir_${st.dir}` as Key))
      .replace("{way}", st.way);
  if (st.kind === "arrive") return t(`gpsArrive_${st.dir}` as Key).replace("{name}", to);
  return t(`gpsTurn_${st.dir}` as Key).replace("{way}", st.way);
}
function turnIcon(st: Step | undefined): string {
  if (!st) return "↑";
  if (st.kind === "arrive") return "◉";
  const d = st.dir;
  return d.includes("left")
    ? d.startsWith("sharp")
      ? "↰"
      : "↖"
    : d.includes("right")
      ? d.startsWith("sharp")
        ? "↱"
        : "↗"
      : d === "u"
        ? "↶"
        : "↑";
}

// ── the map ────────────────────────────────────────────────────────────────
interface View {
  cx: number;
  cz: number;
  zoom: number; // screen px a metre
  rot: number; // the map turned by this (−my heading: facing up; 0: north up)
}
function toScreen(v: View, w: number, h: number, x: number, z: number): [number, number] {
  const dx = x - v.cx;
  const dz = z - v.cz;
  const c = Math.cos(v.rot);
  const sn = Math.sin(v.rot);
  return [w / 2 + (dx * c - dz * sn) * v.zoom, h / 2 + (dx * sn + dz * c) * v.zoom];
}

function paint(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  v: View,
  img: Plan | null,
  me: { x: number; z: number; h: number },
  r: Route | null,
  at: number,
  pin: [number, number] | null,
) {
  ctx.fillStyle = "#e8ebee";
  ctx.fillRect(0, 0, w, h);
  if (img) {
    // (zoomed out: the quarter-size copy)
    const k = v.zoom < 1.5 ? 4 : 1;
    const px = PX / k;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(v.rot);
    ctx.scale(v.zoom / px, v.zoom / px);
    ctx.translate(-(MARGIN / k + (v.cx - X0) * px), -(MARGIN / k + (v.cz - Z0) * px));
    ctx.drawImage(k === 4 ? img.small : img.full, 0, 0);
    ctx.restore();
  }
  if (r) {
    // the route: what's behind me faint, what's ahead bright
    const line = (from: number, to: number, color: string, width: number) => {
      ctx.beginPath();
      let first = true;
      for (let i = 0; i < r.pts.length; i++) {
        if (r.along[i] < from - 4 || r.along[i] > to + 4) continue;
        const [sx, sy] = toScreen(v, w, h, r.pts[i][0], r.pts[i][1]);
        if (first) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
        first = false;
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke();
    };
    line(0, at, "rgba(0,150,140,0.35)", 5);
    line(at, r.dist, "#0b1a24", 8);
    line(at, r.dist, "#00e5d0", 5);
  }
  if (pin) {
    const [px, py] = toScreen(v, w, h, pin[0], pin[1]);
    ctx.fillStyle = "#ff2d95";
    ctx.beginPath();
    ctx.arc(px, py - 12, 7, Math.PI, 0);
    ctx.lineTo(px, py);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(px, py - 12, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  // me: an arrow where I face
  const [mx, my] = toScreen(v, w, h, me.x, me.z);
  ctx.save();
  ctx.translate(mx, my);
  ctx.rotate(me.h + v.rot);
  ctx.fillStyle = "rgba(0,229,208,0.25)";
  ctx.beginPath();
  ctx.arc(0, 0, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ff2d95";
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -11);
  ctx.lineTo(8, 9);
  ctx.lineTo(0, 4);
  ctx.lineTo(-8, 9);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

interface MapProps {
  w: WorldController;
  follow: boolean;
  setFollow?: (f: boolean) => void;
  center?: [number, number] | null; // look here (a place picked), not at me
  small?: boolean;
  friends?: GpsFriend[];
  onFriend?: (f: GpsFriend) => void;
  /** my car, a car whose keys I hold: a pin each (docs/plan/43-the-spot.md) */
  cars?: GpsCar[];
  onCar?: (c: GpsCar) => void;
}
/** A car on the map: mine, or one whose keys I hold — or my pet (docs/plan/51-the-pet.md): where it
 *  waits (a paw), or lost, a circle `ring` m round where it was last seen. */
interface GpsCar {
  key: string;
  name: string;
  x: number;
  z: number;
  where: string;
  pet?: boolean;
  ring?: number;
}
// a lost pet's search circle (m): it wanders off in legs of up to 40
const LOST_RING = 40;
function MapCanvas({ w, follow, setFollow, center, small, friends, onFriend, cars, onCar }: MapProps) {
  const img = usePlan();
  const cv = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const view = useRef<View>({ cx: 0, cz: 0, zoom: small ? 1.6 : 2.2, rot: 0 });
  const [pos, setPos] = useState<Record<number, [number, number]>>({});
  const [carPos, setCarPos] = useState<Record<string, [number, number, number]>>({});
  const drag = useRef<{ x: number; y: number } | null>(null);
  // (a place picked: the map goes there, once)
  useEffect(() => {
    if (center) {
      view.current.cx = center[0];
      view.current.cz = center[1];
    }
  }, [center?.[0], center?.[1]]);
  useEffect(() => {
    let raf = 0;
    let lastFriends = 0;
    let last = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      // (the small one in the corner: ten times a second is plenty)
      const now = performance.now();
      if (now - last < (small ? 100 : 30)) return;
      last = now;
      const c = cv.current;
      const box = wrap.current;
      if (!c || !box) return;
      const W = box.clientWidth;
      const H = box.clientHeight;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
        c.width = Math.round(W * dpr);
        c.height = Math.round(H * dpr);
      }
      const ctx = c.getContext("2d");
      if (!ctx) return;
      const gps = phone.get().gps;
      const me = w.gpsWhere();
      const v = view.current;
      v.rot = gps.northUp ? 0 : -me.h;
      if (follow && !center) {
        v.cx = me.x;
        v.cz = me.z;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paint(ctx, W, H, v, img, me, gps.route, gps.at, gps.target?.p ?? null);
      // the friends' faces (DOM, over the map), a few times a second
      if ((friends || cars) && now - lastFriends > 120) {
        lastFriends = now;
        const next: Record<number, [number, number]> = {};
        for (const f of friends ?? []) next[f.uid] = toScreen(v, W, H, f.x, f.z);
        setPos(next);
        const nc: Record<string, [number, number, number]> = {};
        for (const c of cars ?? []) nc[c.key] = [...toScreen(v, W, H, c.x, c.z), (c.ring ?? 0) * v.zoom];
        setCarPos(nc);
      }
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [w, img, follow, center, friends, cars, small]);
  return (
    <div
      ref={wrap}
      className={cx(s.gpsMap, small && s.gpsMini)}
      data-gps-map
      onPointerDown={(e) => {
        if (small) return;
        drag.current = { x: e.clientX, y: e.clientY };
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const v = view.current;
        const dx = (e.clientX - d.x) / v.zoom;
        const dy = (e.clientY - d.y) / v.zoom;
        if (Math.abs(dx) + Math.abs(dy) > 0.5) setFollow?.(false);
        // back through the map's turn
        const c = Math.cos(-v.rot);
        const sn = Math.sin(-v.rot);
        v.cx -= dx * c - dy * sn;
        v.cz -= dx * sn + dy * c;
        drag.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onWheel={(e) => {
        if (small) return;
        const v = view.current;
        v.zoom = Math.max(0.4, Math.min(8, v.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
      }}
    >
      <canvas ref={cv} />
      {friends?.map((f) => {
        const p = pos[f.uid];
        if (!p) return null;
        return (
          <button
            key={f.uid}
            type="button"
            className={s.gpsFriend}
            style={{ left: p[0], top: p[1] }}
            data-gps-friend={f.uid}
            title={`${f.name} · ${f.where}`}
            onClick={() => onFriend?.(f)}
          >
            <PFace avatar={f.avatar} name={f.name} size={small ? 18 : 26} />
          </button>
        );
      })}
      {cars?.map((c) => {
        const p = carPos[c.key];
        if (!p) return null;
        // a lost pet: where to search, not a spot
        if (c.ring)
          return (
            <button
              key={c.key}
              type="button"
              data-gps-car={c.key}
              title={`${c.name} · ${c.where}`}
              onClick={() => onCar?.(c)}
              style={{
                position: "absolute",
                left: p[0] - p[2],
                top: p[1] - p[2],
                width: p[2] * 2,
                height: p[2] * 2,
                borderRadius: "50%",
                background: "rgba(196,64,43,.2)",
                border: "2px dashed #c4402b",
              }}
            />
          );
        if (c.pet)
          return (
            <button
              key={c.key}
              type="button"
              className={s.gpsFriend}
              style={{ left: p[0], top: p[1] }}
              data-gps-car={c.key}
              title={`${c.name} · ${c.where}`}
              onClick={() => onCar?.(c)}
            >
              <svg viewBox="0 0 24 24" width={small ? 16 : 22} height={small ? 16 : 22} aria-hidden="true">
                <circle cx="12" cy="12" r="11" fill="#6e7b3a" stroke="#fff" strokeWidth="2" />
                <ellipse cx="12" cy="15" rx="4" ry="3.4" fill="#fff" />
                <circle cx="7.4" cy="10.4" r="1.7" fill="#fff" />
                <circle cx="10.4" cy="7.6" r="1.7" fill="#fff" />
                <circle cx="13.6" cy="7.6" r="1.7" fill="#fff" />
                <circle cx="16.6" cy="10.4" r="1.7" fill="#fff" />
              </svg>
            </button>
          );
        return (
          <button
            key={c.key}
            type="button"
            className={s.gpsFriend}
            style={{ left: p[0], top: p[1] }}
            data-gps-car={c.key}
            title={`${c.name} · ${c.where}`}
            onClick={() => onCar?.(c)}
          >
            <svg viewBox="0 0 30 38" width={small ? 18 : 26} height={small ? 23 : 33} aria-hidden="true">
              <path
                d="M15 37C6 25 2 20 2 13a13 13 0 0 1 26 0c0 7-4 12-13 24z"
                fill="#b5562f"
                stroke="#fff"
                strokeWidth="2"
              />
              <path d="M8 16l2-5h10l2 5v4H8z" fill="#fff" />
            </svg>
          </button>
        );
      })}
    </div>
  );
}

// ── the app ────────────────────────────────────────────────────────────────
export function Gps() {
  const t = useTr();
  const w = useWorld();
  const ph = w?.phone;
  const gps = usePhone((p) => p.gps);
  const share = usePhone((p) => p.settings.shareLocation);
  const area = useHud((h) => h.me?.areaName ?? "");
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [follow, setFollow] = useState(true);
  const [picked, setPicked] = useState<{ place?: Place; friend?: GpsFriend } | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  useEffect(() => {
    let live = true;
    void loadGrounds().then((g) => {
      routeOver(g);
      if (live) setPlaces(gpsPlaces());
    });
    return () => {
      live = false;
    };
  }, []);
  const myCar = useHud((h) => h.myCar);
  const held = useHud((h) => h.keys);
  // my pets not with me: where each waits, or where a lost one was last seen (the server's note)
  const [petsOut, setPetsOut] = useState<GpsCar[]>([]);
  useEffect(() => {
    const read = () => {
      const room = w?.room;
      if (!room) return;
      const out: GpsCar[] = [];
      room.state.pets.forEach((p: { id: string; sid: string; name: string; seen: string; alive: boolean }) => {
        if (p.sid !== room.sessionId || !p.alive || !p.seen) return;
        try {
          const s = JSON.parse(p.seen) as { x: number; z: number; where: string; lost?: boolean };
          out.push({
            key: `pet:${p.id}`,
            name: s.lost ? t("gpsPetLost").replace("{name}", p.name) : p.name,
            x: s.x,
            z: s.z,
            where: s.where,
            pet: true,
            ring: s.lost ? LOST_RING : undefined,
          });
        } catch {}
      });
      setPetsOut((was) => (JSON.stringify(was) === JSON.stringify(out) ? was : out));
    };
    read();
    const id = setInterval(read, 2000);
    return () => clearInterval(id);
  }, [w, t]);
  // (the same list while they stay put: the map's loop restarts on a new one)
  const cars = useMemo<GpsCar[]>(
    () => [
      ...(myCar ? [{ key: "car:mine", name: t("gpsMyCar"), x: myCar.x, z: myCar.z, where: myCar.where }] : []),
      ...(held
        ? [
            {
              key: "car:keys",
              name: t("gpsKeysCar").replace("{who}", held.from.split(" ")[0]),
              x: held.x,
              z: held.z,
              where: held.where,
            },
          ]
        : []),
      ...petsOut,
    ],
    [myCar, held, petsOut, t],
  );
  if (!ph || !w) return null;
  const me = w.gpsWhere();
  const carPlace = (c: GpsCar): Place => ({ key: c.key, name: c.name, kind: "landmark", p: [c.x, c.z], c: [c.x, c.z] });
  const dist = (p: [number, number]) => Math.hypot(p[0] - me.x, p[1] - me.z);
  const ql = q.trim().toLowerCase();
  const match = (n: string) => !ql || n.toLowerCase().includes(ql);
  const groups: {
    title: string;
    rows: { key: string; name: string; d: number; pick: () => void; avatar?: string }[];
  }[] = [
    {
      title: t("gpsMine"),
      rows: cars
        .filter((c) => match(c.name) || match(c.where))
        .map((c) => ({
          key: c.key,
          name: `${c.name} · ${c.where}`,
          d: dist([c.x, c.z]),
          pick: () => setPicked({ place: carPlace(c) }),
        })),
    },
    {
      title: t("gpsFriends"),
      rows: gps.friends
        .filter((f) => match(f.name))
        .map((f) => ({
          key: `f:${f.uid}`,
          name: f.name,
          avatar: f.avatar,
          d: dist([f.x, f.z]),
          pick: () => setPicked({ friend: f }),
        })),
    },
    ...(["building", "landmark", "way"] as const).map((kind) => ({
      title: t(kind === "building" ? "gpsPlaces" : kind === "way" ? "gpsWays" : "gpsSpots"),
      rows: places
        .filter((p) => p.kind === kind && match(p.name))
        .map((p) => ({ key: p.key, name: p.name, d: dist(p.p), pick: () => setPicked({ place: p }) }))
        .sort((a, b) => a.d - b.d),
    })),
  ].filter((g) => g.rows.length);
  const r = gps.route;
  const next = r?.steps[gps.next];
  const pickedP: [number, number] | null =
    picked?.place?.c ?? (picked?.friend ? [picked.friend.x, picked.friend.z] : null);
  const floor = me.level === 0 ? area : `${area} · ${t("gpsFloor").replace("{n}", String(me.level))}`;

  return (
    <div className={s.gps} data-gps>
      <MapCanvas
        w={w}
        follow={follow && !picked}
        setFollow={setFollow}
        center={picked ? pickedP : null}
        friends={gps.friends}
        onFriend={(f) => setPicked({ friend: f })}
        cars={cars}
        onCar={(c) => setPicked({ place: carPlace(c) })}
      />

      {/* on my way: the next turn */}
      {gps.target && (
        <div className={s.gpsNext} data-gps-next>
          <span className={s.gpsTurn}>{turnIcon(next)}</span>
          <div>
            <b>
              {gps.rerouting
                ? t("gpsReroute")
                : gps.noRoute
                  ? t("gpsNoRoute")
                  : next
                    ? stepText(t, next, gps.target.name)
                    : gps.target.name}
            </b>
            {next && r && !gps.rerouting && <span>{distLabel(t, Math.max(0, next.at - gps.at))}</span>}
          </div>
        </div>
      )}
      {gps.arrived > 0 && !gps.target && (
        <div className={s.gpsNext} data-gps-arrived>
          <span className={s.gpsTurn}>◉</span>
          <b>{t("gpsArrived")}</b>
        </div>
      )}

      {/* the search */}
      {!gps.target && (
        <div className={cx(s.gpsSearch, searching && s.on)}>
          <span>
            <Ic n="search" size={15} />
          </span>
          <input
            value={q}
            placeholder={t("gpsSearch")}
            data-nav
            data-gps-search
            onFocus={() => setSearching(true)}
            onChange={(e) => {
              setQ(e.target.value);
              setSearching(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setSearching(false);
                (e.target as HTMLInputElement).blur();
              }
              e.stopPropagation();
            }}
          />
          {searching && (
            <button
              type="button"
              className={s.round}
              aria-label={t("phBack")}
              data-nav
              onClick={() => {
                setSearching(false);
                setQ("");
              }}
            >
              ×
            </button>
          )}
        </div>
      )}
      {searching && !gps.target && (
        <div className={s.gpsList} data-gps-list>
          {!groups.length && <p className={s.empty}>{t("gpsNone")}</p>}
          {groups.map((g) => (
            <div key={g.title}>
              <h3>{g.title}</h3>
              {g.rows.map((row) => (
                <button
                  key={row.key}
                  type="button"
                  className={s.gpsRow}
                  data-nav
                  data-gps-place={row.key}
                  onClick={() => {
                    row.pick();
                    setSearching(false);
                  }}
                >
                  {row.avatar ? <PFace avatar={row.avatar} name={row.name} size={24} /> : <Ic n="maps" size={16} />}
                  <span className={s.gpsName}>{row.name}</span>
                  <i>{distLabel(t, row.d)}</i>
                </button>
              ))}
            </div>
          ))}
          {!gps.friends.length && !ql && <p className={s.gpsHint}>{t("gpsNoFriends")}</p>}
        </div>
      )}

      {/* the map's own buttons */}
      {!searching && (
        <div className={s.gpsTools}>
          <button
            type="button"
            className={cx(s.round, follow && !picked && s.on)}
            aria-label={t("gpsRecenter")}
            data-gps-recenter
            data-nav
            onClick={() => {
              setPicked(null);
              setFollow(true);
            }}
          >
            ◎
          </button>
          <button
            type="button"
            className={s.round}
            aria-label={gps.northUp ? t("gpsNorthUp") : t("gpsHeadingUp")}
            data-gps-north
            data-nav
            onClick={() => ph.gps.toggleNorth()}
          >
            {gps.northUp ? "N" : "➤"}
          </button>
        </div>
      )}
      {!searching && !gps.target && !picked && (
        <div className={s.gpsWhere} data-gps-where>
          {share && <i title={t("gpsSharing")} className={s.gpsShareDot} />}
          {floor}
        </div>
      )}

      {/* a place picked: go */}
      {picked && !gps.target && !searching && (
        <div className={cx(s.gpsCard, s.glass)} data-gps-card>
          <div className={s.gpsCardHead}>
            {picked.friend ? <PFace avatar={picked.friend.avatar} name={picked.friend.name} size={30} /> : null}
            <div>
              <b>{picked.place?.name ?? picked.friend?.name}</b>
              <span>
                {distLabel(t, dist(picked.place?.p ?? [picked.friend?.x ?? 0, picked.friend?.z ?? 0]))}
                {picked.friend ? ` · ${picked.friend.where}` : ""}
                {picked.place?.key.startsWith("car:")
                  ? ` · ${cars.find((c) => c.key === picked.place?.key)?.where ?? ""}`
                  : ""}
              </span>
            </div>
            <button type="button" className={s.round} aria-label={t("phBack")} data-nav onClick={() => setPicked(null)}>
              ×
            </button>
          </div>
          <div className={s.seg}>
            {(["foot", "car"] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={cx(gps.mode === m && s.on)}
                data-nav
                data-gps-mode={m}
                onClick={() => ph.gps.setMode(m)}
              >
                {t(m === "foot" ? "gpsFoot" : "gpsCar")}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={s.gpsGo}
            data-nav
            data-gps-go
            onClick={() => {
              if (picked.place) ph.gps.goPlace(picked.place);
              else if (picked.friend) ph.gps.goFriend(picked.friend);
              setPicked(null);
              setFollow(true);
            }}
          >
            {t("gpsGo")}
          </button>
        </div>
      )}

      {/* on my way: how long, how far, the end */}
      {gps.target && (
        <div className={cx(s.gpsBar, s.glass)} data-gps-bar>
          <div>
            <b>{r ? timeLabel(t, Math.max(0, r.secs * (1 - gps.at / Math.max(1, r.dist)))) : "–"}</b>
            <span>
              {r ? distLabel(t, Math.max(0, r.dist - gps.at)) : ""} · {gps.target.name}
            </span>
          </div>
          <button type="button" className={s.gpsEnd} data-nav data-gps-end onClick={() => ph.gps.end()}>
            {t("gpsEnd")}
          </button>
        </div>
      )}
    </div>
  );
}

// ── away from the phone: the next turn on top, a small map in the corner ───
export function GpsHud() {
  const t = useTr();
  const w = useWorld();
  const gps = usePhone((p) => p.gps);
  const open = usePhone((p) => p.open);
  const onGps = usePhone((p) => p.stack[p.stack.length - 1]?.app === "maps");
  const driving = useHud((h) => !!h.myCarAt);
  if (!w || (!gps.target && !gps.arrived) || (open && onGps)) return null;
  const r = gps.route;
  const next = r?.steps[gps.next];
  return (
    <>
      <div className={cx(s.gpsBanner, driving && s.big)} data-gps-banner>
        <span className={s.gpsTurn}>{gps.target ? turnIcon(next) : "◉"}</span>
        <div>
          <b>
            {!gps.target
              ? t("gpsArrived")
              : gps.rerouting
                ? t("gpsReroute")
                : next
                  ? stepText(t, next, gps.target.name)
                  : gps.target.name}
          </b>
          {gps.target && next && r && !gps.rerouting && (
            <span>
              {distLabel(t, Math.max(0, next.at - gps.at))} ·{" "}
              {timeLabel(t, Math.max(0, r.secs * (1 - gps.at / Math.max(1, r.dist))))}
            </span>
          )}
        </div>
      </div>
      {gps.target && (
        <div className={s.gpsCorner} data-gps-corner>
          <MapCanvas w={w} follow small friends={gps.target.friend ? gps.friends : undefined} />
        </div>
      )}
    </>
  );
}
