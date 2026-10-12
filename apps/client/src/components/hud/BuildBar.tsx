"use client";

import { CATALOG, entry, MAP_MAX, MAP_MIN, MAP_SIZES, TEMPLATES } from "@yutopia/shared";
import { useEffect, useState } from "react";
import { yutopia } from "@/lib/api";
import { useTr } from "@/lib/i18n";
import { type BuildTool, hud, useHud } from "@/world/store";
import { useWorld } from "./ctx";

const GROUPS: { name: string; kinds: (keyof typeof CATALOG)[] }[] = [
  {
    name: "Work",
    kinds: ["desk", "chair", "meeting_table", "whiteboard", "board_wall", "screen_wall", "notice_board"],
  },
  { name: "Comfy", kinds: ["sofa", "armchair", "bench", "coffee_table", "rug", "lamp", "plant", "column"] },
  {
    name: "Studio",
    kinds: [
      "tape_shelf",
      "radio",
      "arcade",
      "coffee_machine",
      "mic_stand",
      "mixing_desk",
      "speaker_cab",
      "acoustic_panel",
      "poster",
      "reception",
      "standup_mat",
    ],
  },
];

// Walls paint tile edges ("w:" + an edge char); floors paint tiles.
const BRUSHES: { ch: string; label: string; swatch: string; group: "walls" | "floors" }[] = [
  { ch: "w:p", label: "Plaster", swatch: "linear-gradient(#efe4cc 55%, #5b3a26 55%)", group: "walls" },
  {
    ch: "w:w",
    label: "Walnut",
    swatch: "repeating-linear-gradient(90deg,#5b3a26 0 9px,#3e2718 9px 10px)",
    group: "walls",
  },
  {
    ch: "w:f",
    label: "Foam",
    swatch: "repeating-conic-gradient(#9e4a36 0 25%,#7d3a2c 0 50%) 0 0/10px 10px",
    group: "walls",
  },
  { ch: "w:b", label: "Brick", swatch: "repeating-linear-gradient(#9a4a30 0 6px,#d9cba9 6px 7px)", group: "walls" },
  { ch: "w:k", label: "Cork", swatch: "#c49a6c", group: "walls" },
  { ch: "w:g", label: "Glass", swatch: "linear-gradient(90deg,#5b3a26 8%,#3a4a4a 8% 92%,#5b3a26 92%)", group: "walls" },
  {
    ch: "w:h",
    label: "Half wall",
    swatch: "linear-gradient(transparent 50%, #efe4cc 50% 75%, #5b3a26 75%)",
    group: "walls",
  },
  {
    ch: "w:window",
    label: "Window",
    swatch: "linear-gradient(#efe4cc 25%, #9fb6c8 25% 70%, #efe4cc 70% 80%, #5b3a26 80%)",
    group: "walls",
  },
  {
    ch: "door",
    label: "Door",
    swatch: "linear-gradient(90deg,#3e2718 12%,#5b3a26 12% 88%,#3e2718 88%)",
    group: "walls",
  },
  {
    ch: "door:glass",
    label: "Glass door",
    swatch: "linear-gradient(90deg,#3e2718 12%,#3a4a4a 12% 88%,#3e2718 88%)",
    group: "walls",
  },
  {
    ch: "w:.",
    label: "No wall",
    swatch: "repeating-linear-gradient(45deg,#17110d 0 4px,#2a1c13 4px 8px)",
    group: "walls",
  },
  { ch: ".", label: "Wood", swatch: "#8f6038", group: "floors" },
  { ch: ",", label: "Carpet", swatch: "#6b6a3a", group: "floors" },
  {
    ch: "_",
    label: "Tile",
    swatch: "repeating-conic-gradient(#e6dcc4 0 25%,#cfc3a5 0 50%) 0 0/12px 12px",
    group: "floors",
  },
  { ch: ":", label: "Felt", swatch: "#7a3b2e", group: "floors" },
  { ch: "~", label: "Stage", swatch: "#2f2620", group: "floors" },
  {
    ch: "x",
    label: "Grate",
    swatch: "repeating-linear-gradient(90deg,#4a4740 0 3px,#2a2824 3px 4px)",
    group: "floors",
  },
  {
    ch: " ",
    label: "No floor",
    swatch: "repeating-linear-gradient(45deg,#17110d 0 4px,#2a1c13 4px 8px)",
    group: "floors",
  },
];
export const WALL_MATERIALS = BRUSHES.filter((b) => b.group === "walls" && /^w:[pwfbkg]$/.test(b.ch));

const TOOLS: { key: BuildTool; label: string }[] = [
  { key: "furniture", label: "🪑 Furniture" },
  { key: "walls", label: "🧱 Walls" },
  { key: "rooms", label: "🚪 Rooms" },
  { key: "desks", label: "🏷 Desks" },
  { key: "map", label: "🗺 Map" },
];

const HELP: Record<BuildTool, string> = {
  furniture: "Pick an item, click to place · R rotates · click an item to pick it up · Del removes · Esc exits",
  walls:
    "Walls go on the lines between tiles: pick a wall and drag along them. Floors: pick one and drag over tiles. Windows go in outer walls. Door: click a gap in a wall line (click a door to remove it).",
  rooms: "Drag a rectangle on the floor to make a room. Give it a name and an owner — owners can lock its doors.",
  desks: "Click a seat to give it to someone. They always land there, and their name shows on it.",
  map: "Choose the studio's size, or start from a blank floor.",
};

type Member = { id: number; name: string };

// Build mode (project owners): furniture, walls & floors, rooms with owners,
// desks for people, and the map's size. Everything persists to Yondra.
export function BuildBar() {
  const t = useTr();
  const w = useWorld();
  const b = useHud((s) => s.build);
  const canBuild = useHud((s) => s.canBuild);
  const spaceId = useHud((s) => s.spaceId);
  const mapVersion = useHud((s) => s.mapVersion);
  const [members, setMembers] = useState<Member[]>([]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: redraw the ghost when the tool changes
  useEffect(() => {
    w?.refreshGhost();
  }, [b.on, b.tool, b.kind, b.rot, b.holding, b.brush, w]);

  useEffect(() => {
    if (b.on && canBuild && spaceId)
      yutopia
        .members(spaceId)
        .then((r) => setMembers(r.members))
        .catch(() => {});
  }, [b.on, canBuild, spaceId]);

  if (!b.on || !canBuild) return null;
  const set = (patch: Partial<typeof b>) => hud.set({ build: { ...b, ...patch } });
  const held = b.holding ? w?.engine?.getObject(b.holding) : null;
  const rooms = (w?.map.areas ?? []).filter((a) => a.key.startsWith("room-"));
  void mapVersion;

  return (
    <>
      <section
        aria-label={t("buildMode")}
        className="pointer-events-auto cabinet absolute left-3 top-24 bottom-24 w-[min(300px,calc(100vw-24px))] flex flex-col rise"
      >
        <div className="px-3 pt-3 flex items-center justify-between">
          <div className="vfd-window px-2 py-1">
            <h2 className="lcd text-lg">🛠 {t("buildMode").toUpperCase()}</h2>
          </div>
          <button
            type="button"
            className="ghost-btn"
            onClick={() => set({ on: false, holding: null })}
            aria-label={t("close")}
          >
            ✕
          </button>
        </div>
        <div className="flex flex-wrap gap-1 px-3 pt-2" role="tablist">
          {TOOLS.map((tool) => (
            <button
              key={tool.key}
              type="button"
              role="tab"
              aria-selected={b.tool === tool.key}
              className="ghost-btn"
              style={b.tool === tool.key ? { background: "var(--amber)", color: "var(--ink)" } : {}}
              onClick={() => {
                w?.clearRoomGhost();
                set({ tool: tool.key, holding: null, roomDraft: null, deskDraft: null, pickSpawn: false });
              }}
            >
              {tool.label}
            </button>
          ))}
        </div>
        <p className="px-3 pt-2 text-xs" style={{ color: "var(--cream-dim)" }}>
          {HELP[b.tool]}
        </p>

        <div className="flex-1 overflow-y-auto scroll-thin px-3 py-2 space-y-3">
          {b.tool === "furniture" && (
            <>
              {held && (
                <div className="rounded-lg p-2 flex items-center justify-between" style={{ background: "#120d09" }}>
                  <span className="mono text-xs" style={{ color: "var(--vfd)" }}>
                    ✋ {entry(held.kind).label}
                  </span>
                  <button
                    type="button"
                    className="deck-btn danger"
                    aria-pressed={false}
                    style={{ height: 30 }}
                    onClick={() => w?.buildKey("delete")}
                  >
                    Remove
                  </button>
                </div>
              )}
              <button type="button" className="deck-btn w-full" style={{ height: 34 }} onClick={() => w?.buildKey("r")}>
                ⟳ R · {b.rot * 90}°
              </button>
              {GROUPS.map((g) => (
                <div key={g.name}>
                  <h3 className="mono text-[11px] uppercase tracking-widest mb-1" style={{ color: "var(--vfd)" }}>
                    {g.name}
                  </h3>
                  <div className="grid grid-cols-2 gap-1.5">
                    {g.kinds.map((k) => (
                      <button
                        key={k}
                        type="button"
                        className="deck-btn"
                        aria-pressed={!b.holding && b.kind === k}
                        style={{ height: 34, fontSize: 10, padding: "0 6px" }}
                        onClick={() => set({ kind: k, holding: null })}
                      >
                        {CATALOG[k].label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <div>
                <h3 className="mono text-[11px] uppercase tracking-widest mb-1" style={{ color: "var(--vfd)" }}>
                  Tracking Room templates
                </h3>
                <div className="space-y-1.5">
                  {TEMPLATES.map((tp) => (
                    <button
                      key={tp.key}
                      type="button"
                      className="ghost-btn w-full text-left"
                      onClick={() => {
                        if (window.confirm(`Switch the Tracking Room to "${tp.name}"? Desks get reassigned.`))
                          w?.send("build:template", { template: tp.key });
                      }}
                    >
                      ▸ {tp.name}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {b.tool === "walls" &&
            (["walls", "floors"] as const).map((group) => (
              <fieldset key={group} className="grid grid-cols-3 gap-1.5">
                <legend className="mono text-[10px] uppercase mb-1 col-span-3" style={{ color: "var(--muted)" }}>
                  {group === "walls" ? "Walls · drag along the lines between tiles" : "Floors · drag over tiles"}
                </legend>
                {BRUSHES.filter((br) => br.group === group).map((br) => (
                  <button
                    key={br.ch}
                    type="button"
                    aria-pressed={b.brush === br.ch}
                    className="rounded-lg p-1.5 flex flex-col items-center gap-1"
                    style={{
                      background: b.brush === br.ch ? "rgba(255,166,48,0.18)" : "#120d09",
                      border: `1px solid ${b.brush === br.ch ? "var(--amber)" : "var(--edge)"}`,
                    }}
                    onClick={() => set({ brush: br.ch })}
                  >
                    <span
                      className="block w-full h-7 rounded"
                      style={{ background: br.swatch, border: "1px solid #0006" }}
                    />
                    <span className="mono text-[10px] uppercase">{br.label}</span>
                  </button>
                ))}
              </fieldset>
            ))}

          {b.tool === "rooms" && (
            <div className="space-y-2">
              {rooms.length === 0 && (
                <p className="text-sm" style={{ color: "var(--muted)" }}>
                  No rooms yet. Drag on the floor to draw one.
                </p>
              )}
              {rooms.map((r) => (
                <RoomRow key={r.key} room={r} members={members} />
              ))}
            </div>
          )}

          {b.tool === "desks" && <DeskList members={members} />}

          {b.tool === "map" && <MapTools />}
        </div>
      </section>
      {b.roomDraft && <RoomDialog draft={b.roomDraft} members={members} />}
      {b.deskDraft && <DeskDialog seatId={b.deskDraft} members={members} />}
    </>
  );
}

function RoomRow({
  room,
  members,
}: {
  room: {
    key: string;
    name: string;
    kind: string;
    ownerId?: number | null;
    ownerName?: string | null;
    dressing?: string | null;
  };
  members: Member[];
}) {
  const w = useWorld();
  return (
    <div className="rounded-lg p-2 space-y-1.5" style={{ background: "#120d09" }}>
      <div className="flex items-center justify-between gap-2">
        <span className="lcd text-lg truncate">{room.name}</span>
        <span className="mono text-[10px] uppercase" style={{ color: "var(--muted)" }}>
          {room.kind}
        </span>
      </div>
      <select
        className="field"
        style={{ padding: "4px 6px", fontSize: 13 }}
        value={room.ownerId ?? ""}
        aria-label={`Owner of ${room.name}`}
        onChange={(e) => {
          const id = Number(e.target.value) || null;
          w?.send("map:room:update", {
            key: room.key,
            ownerId: id,
            ownerName: members.find((m) => m.id === id)?.name ?? null,
          });
        }}
      >
        <option value="">No owner</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-2 text-xs">
        <span className="mono uppercase" style={{ color: "var(--cream-dim)" }}>
          Dressing
        </span>
        <select
          className="field"
          aria-label={`Dressing of ${room.name}`}
          value={room.dressing ?? ""}
          onChange={(e) => w?.send("map:room:update", { key: room.key, dressing: e.target.value || null })}
        >
          <option value="">Bare</option>
          <option value="tidy">Tidy</option>
          <option value="lived">Lived in</option>
          <option value="busy">Busy</option>
        </select>
      </label>
      <label className="flex items-center gap-2 text-xs">
        <span className="mono uppercase" style={{ color: "var(--cream-dim)" }}>
          Walls
        </span>
        <select
          className="field"
          aria-label={`Walls of ${room.name}`}
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) w?.send("map:room:walls", { key: room.key, wall: e.target.value });
            e.target.value = "";
          }}
        >
          <option value="">Repaint…</option>
          {WALL_MATERIALS.map((b) => (
            <option key={b.ch} value={b.ch.slice(2)}>
              {b.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="ghost-btn w-full"
        onClick={() => {
          if (window.confirm(`Remove the room "${room.name}"? Its walls stay; paint them away with the Walls tool.`))
            w?.send("map:room:remove", { key: room.key });
        }}
      >
        Remove room
      </button>
    </div>
  );
}

function RoomDialog({ draft, members }: { draft: { x: number; y: number; w: number; h: number }; members: Member[] }) {
  const w = useWorld();
  const [name, setName] = useState("");
  const [kind, setKind] = useState("private");
  const [owner, setOwner] = useState<number | null>(null);
  const [walls, setWalls] = useState(true);
  const [floor, setFloor] = useState(",");
  const [wall, setWall] = useState("");
  const close = () => {
    w?.clearRoomGhost();
    hud.set((s) => ({ build: { ...s.build, roomDraft: null } }));
  };
  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-[#0d0906aa] p-3">
      <form
        className="cabinet p-4 w-full max-w-sm space-y-3 rise"
        aria-label="New room"
        onSubmit={(e) => {
          e.preventDefault();
          w?.send("map:room", {
            name: name.trim() || "Room",
            kind,
            ...draft,
            ownerId: owner,
            ownerName: members.find((m) => m.id === owner)?.name ?? null,
            walls,
            floor,
            ...(wall ? { wall } : {}),
          });
          close();
        }}
      >
        <div className="vfd-window px-3 py-1">
          <h2 className="lcd text-xl">
            NEW ROOM · {draft.w}×{draft.h}
          </h2>
        </div>
        <label className="block">
          <span className="mono text-xs uppercase" style={{ color: "var(--cream-dim)" }}>
            Name
          </span>
          <input
            className="field mt-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ana's office"
            maxLength={40}
            required
          />
        </label>
        <label className="block">
          <span className="mono text-xs uppercase" style={{ color: "var(--cream-dim)" }}>
            Owner (can lock its doors)
          </span>
          <select className="field mt-1" value={owner ?? ""} onChange={(e) => setOwner(Number(e.target.value) || null)}>
            <option value="">No owner</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend className="mono text-xs uppercase mb-1" style={{ color: "var(--cream-dim)" }}>
            Sound
          </legend>
          <div className="flex gap-1.5">
            {[
              ["private", "Private"],
              ["open", "Open"],
              ["booth", "Booth (knock)"],
            ].map(([k, l]) => (
              <button
                key={k}
                type="button"
                className="deck-btn flex-1"
                aria-pressed={kind === k}
                style={{ height: 32, fontSize: 10 }}
                onClick={() => setKind(k)}
              >
                {l}
              </button>
            ))}
          </div>
        </fieldset>
        <label className="flex items-center justify-between gap-2">
          <span>Build walls and a door</span>
          <input
            type="checkbox"
            checked={walls}
            onChange={(e) => setWalls(e.target.checked)}
            className="h-5 w-5 accent-[#ffa630]"
          />
        </label>
        {walls && (
          <label className="block">
            <span className="mono text-xs uppercase" style={{ color: "var(--cream-dim)" }}>
              Walls
            </span>
            <select className="field mt-1" value={wall} onChange={(e) => setWall(e.target.value)}>
              <option value="">{kind === "booth" ? "Foam (booth)" : "Plaster"}</option>
              {WALL_MATERIALS.map((b) => (
                <option key={b.ch} value={b.ch.slice(2)}>
                  {b.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block">
          <span className="mono text-xs uppercase" style={{ color: "var(--cream-dim)" }}>
            Floor
          </span>
          <select className="field mt-1" value={floor} onChange={(e) => setFloor(e.target.value)}>
            {BRUSHES.filter((b) => b.group === "floors" && b.ch !== " ").map((b) => (
              <option key={b.ch} value={b.ch}>
                {b.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <button type="submit" className="deck-btn flex-1">
            Create room
          </button>
          <button type="button" className="ghost-btn" onClick={close}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function DeskList({ members }: { members: Member[] }) {
  const w = useWorld();
  useHud((s) => s.mapVersion);
  const objects = useHud(() => w?.engine?.allObjects() ?? []);
  const owned = objects.filter((o) => o.props?.ownerId);
  if (!owned.length)
    return (
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        No assigned desks yet. Click a seat in the world.
      </p>
    );
  return (
    <ul className="space-y-1">
      {owned.map((o) => (
        <li
          key={o.id}
          className="flex items-center justify-between rounded px-2 py-1 text-sm"
          style={{ background: "#120d09" }}
        >
          <span>
            🏷 {String(o.props?.ownerName ?? members.find((m) => m.id === o.props?.ownerId)?.name ?? "someone")}
          </span>
          <button
            type="button"
            className="ghost-btn"
            onClick={() => w?.send("desk:assign", { id: o.id, ownerId: null, ownerName: null })}
          >
            Free
          </button>
        </li>
      ))}
    </ul>
  );
}

function DeskDialog({ seatId, members }: { seatId: string; members: Member[] }) {
  const w = useWorld();
  const seat = w?.engine?.getObject(seatId);
  const [owner, setOwner] = useState<number | null>((seat?.props?.ownerId as number) ?? null);
  const close = () => hud.set((s) => ({ build: { ...s.build, deskDraft: null } }));
  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center bg-[#0d0906aa] p-3">
      <form
        className="cabinet p-4 w-full max-w-xs space-y-3 rise"
        aria-label="Assign desk"
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
        <div className="vfd-window px-3 py-1">
          <h2 className="lcd text-xl">DESK · {seat ? entry(seat.kind).label.toUpperCase() : ""}</h2>
        </div>
        <label className="block">
          <span className="mono text-xs uppercase" style={{ color: "var(--cream-dim)" }}>
            Whose desk is this?
          </span>
          <select className="field mt-1" value={owner ?? ""} onChange={(e) => setOwner(Number(e.target.value) || null)}>
            <option value="">Anyone (first come)</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <button type="submit" className="deck-btn flex-1">
            Save
          </button>
          <button type="button" className="ghost-btn" onClick={close}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

const THEME_CHOICES = [
  {
    key: "clouds",
    label: "Clouds",
    swatch:
      "radial-gradient(circle at 30% 60%,#fff 0 18%,transparent 19%),radial-gradient(circle at 70% 45%,#fff 0 14%,transparent 15%),linear-gradient(#3d8fd6,#b4e0f8)",
  },
  {
    key: "city",
    label: "City",
    swatch:
      "linear-gradient(transparent 55%,#5f5666 55%),linear-gradient(90deg,transparent 10%,#8d8496 10% 22%,transparent 22% 40%,#8d8496 40% 52%,transparent 52%),linear-gradient(#6a7ca8,#ffb35c)",
  },
  {
    key: "snow",
    label: "Snow",
    swatch:
      "linear-gradient(transparent 58%,#f3f5f7 58%),linear-gradient(transparent 46%,#5f6a78 46% 58%,transparent 58%),linear-gradient(#aeb8c4,#e3e7ea)",
  },
] as const;

function MapTools() {
  const w = useWorld();
  useHud((s) => s.mapVersion);
  const cur = { width: w?.map.width ?? 48, height: w?.map.height ?? 36 };
  const [size, setSize] = useState(cur);
  const b = useHud((s) => s.build);
  const theme = w?.map.theme ?? "clouds";
  return (
    <div className="space-y-3">
      <fieldset>
        <legend className="mono text-[10px] uppercase mb-1" style={{ color: "var(--muted)" }}>
          Around the studio
        </legend>
        <div className="grid grid-cols-3 gap-1.5">
          {THEME_CHOICES.map((t) => (
            <button
              key={t.key}
              type="button"
              className="rounded-lg p-1.5 flex flex-col items-center gap-1"
              aria-pressed={theme === t.key}
              style={{
                background: theme === t.key ? "rgba(255,166,48,0.18)" : "#120d09",
                border: `1px solid ${theme === t.key ? "var(--amber)" : "var(--edge)"}`,
              }}
              onClick={() => w?.send("map:theme", { theme: t.key })}
            >
              <span className="block w-full h-9 rounded" style={{ background: t.swatch, border: "1px solid #0006" }} />
              <span className="mono text-[10px] uppercase">{t.label}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <p className="lcd text-2xl">
        NOW {cur.width}×{cur.height}
      </p>
      <div className="grid grid-cols-3 gap-1.5">
        {MAP_SIZES.map((s) => (
          <button
            key={s.key}
            type="button"
            className="deck-btn"
            aria-pressed={size.width === s.width && size.height === s.height}
            style={{ height: 40, fontSize: 10, flexDirection: "column", gap: 0 }}
            onClick={() => setSize({ width: s.width, height: s.height })}
          >
            <span>{s.key}</span>
            <span>
              {s.width}×{s.height}
            </span>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        {(["width", "height"] as const).map((k) => (
          <label key={k} className="flex-1">
            <span className="mono text-[10px] uppercase" style={{ color: "var(--cream-dim)" }}>
              {k}
            </span>
            <input
              type="number"
              className="field"
              min={MAP_MIN}
              max={MAP_MAX}
              value={size[k]}
              onChange={(e) =>
                setSize((s) => ({ ...s, [k]: Math.max(MAP_MIN, Math.min(MAP_MAX, Number(e.target.value) || MAP_MIN)) }))
              }
            />
          </label>
        ))}
      </div>
      <button
        type="button"
        className="deck-btn w-full"
        onClick={() => {
          const shrink = size.width < cur.width || size.height < cur.height;
          if (
            !shrink ||
            window.confirm("Shrinking cuts off the right/bottom edge — furniture there is removed. Continue?")
          )
            w?.send("map:resize", size);
        }}
      >
        Resize to {size.width}×{size.height}
      </button>
      <button
        type="button"
        className="deck-btn danger w-full"
        aria-pressed={false}
        onClick={() => {
          if (
            window.confirm(
              `Start a blank ${size.width}×${size.height} studio? All walls, rooms and furniture are removed for everyone.`,
            )
          )
            w?.send("map:new", size);
        }}
      >
        Start blank
      </button>
      <button
        type="button"
        className="ghost-btn w-full"
        aria-pressed={b.pickSpawn}
        onClick={() => hud.set({ build: { ...b, pickSpawn: !b.pickSpawn } })}
      >
        {b.pickSpawn ? "Click a floor tile…" : "📍 Set the arrival point"}
      </button>
    </div>
  );
}
