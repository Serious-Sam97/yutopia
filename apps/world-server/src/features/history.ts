import { applyStep, diffStep, HISTORY_LIMIT, type Snapshot, STEP_LABELS, type Step, snapshot } from "@yutopia/shared";
import { keepPlaying } from "@yutopia/shared/media";
import { applyOps, diffStructures, type Structure, viewOf } from "@yutopia/shared/structure";
import { api } from "../api.ts";
import { config } from "../config.ts";
import { fromSchema, toSchema, type WorldClient, type WorldRoom } from "../WorldRoom.ts";
import { registerFeature } from "./index.ts";

// Build undo/redo, per person. Every builder message opens (or extends) a step;
// once that person's edits pause, the step is what changed (shared history.ts): the things, and the
// building as the structure's operations both ways (docs/plan/72 phase 11), so a whole drag is one
// undo. Undo only reverts what nobody else has changed since.
const QUIET_MS = 600;
// what edits the building (the structure): its change recorded with the step — a step of things
// alone never takes someone else's walls drawn meanwhile
const BUILDING_EDITS = new Set([
  "struct:walls",
  "struct:slabs",
  "struct:roofs",
  "struct:paint",
  "map:room:update",
  "map:room:remove",
  "map:new",
  "map:spawn",
  "level:add",
  "level:remove",
  "build:furnish",
  "build:refurnish",
  "dress:take",
  "dress:hide",
]);

registerFeature((room: WorldRoom) => {
  const stacks = new Map<number, { undo: Step[]; redo: Step[] }>();
  const open = new Map<
    number,
    { before: Snapshot; struct: Structure; building: boolean; label: string; timer: ReturnType<typeof setTimeout> }
  >();
  const objects = () => [...room.state.objects.values()].map(fromSchema);
  const player = (c: WorldClient) => room.state.players.get(c.sessionId);
  const stackOf = (uid: number) => {
    const s = stacks.get(uid) ?? { undo: [], redo: [] };
    stacks.set(uid, s);
    return s;
  };

  const report = (uid: number) => {
    const s = stackOf(uid);
    const msg = {
      undo: s.undo.length,
      redo: s.redo.length,
      undoLabel: s.undo.at(-1)?.label ?? null,
      redoLabel: s.redo.at(-1)?.label ?? null,
    };
    for (const c of room.clients) if (player(c)?.uid === uid) room.send(c, "build:history", msg);
  };

  const close = (uid: number) => {
    const o = open.get(uid);
    if (!o) return;
    clearTimeout(o.timer);
    open.delete(uid);
    let step = diffStep(o.before, snapshot(objects()), o.label);
    // (the building's change: the structure's operations both ways)
    if (o.building && room.structure !== o.struct) {
      const fwd = diffStructures(o.struct, room.structure);
      if (fwd.length) {
        step ??= { label: o.label, objects: [] };
        step.struct = { fwd, back: diffStructures(room.structure, o.struct) };
      }
    }
    if (!step) return;
    const s = stackOf(uid);
    s.undo.push(step);
    if (s.undo.length > HISTORY_LIMIT) s.undo.shift();
    s.redo = [];
    report(uid);
    // things are saved as they happen; the building's edits report when the structure lands
    if (!step.struct) room.toBuilders("build:saved", { ok: true, at: Date.now() });
  };

  room.messageTaps.push((client, type) => {
    const label = STEP_LABELS[type];
    const p = player(client);
    if (!label || !p?.builder) return;
    const cur = open.get(p.uid);
    if (cur) {
      if (BUILDING_EDITS.has(type)) cur.building = true;
      clearTimeout(cur.timer);
      cur.timer = setTimeout(() => close(p.uid), QUIET_MS);
      return;
    }
    open.set(p.uid, {
      before: snapshot(objects()),
      struct: room.structure,
      building: BUILDING_EDITS.has(type),
      label,
      timer: setTimeout(() => close(p.uid), QUIET_MS),
    });
  });

  const persistFailed = (e: Error) => {
    console.warn("[history] save failed", e.message);
    room.toBuilders("build:saved", { ok: false, at: Date.now() });
  };

  const travel = (client: WorldClient, dir: "back" | "forward") => {
    const p = player(client);
    if (!p?.builder) return;
    close(p.uid);
    const s = stackOf(p.uid);
    const step = (dir === "back" ? s.undo : s.redo).pop();
    if (!step) return report(p.uid);
    const res = applyStep(objects(), step, dir);
    // never a way into someone else's locked room (its walls, doors, windows)
    const now = new Map(objects().map((o) => [o.id, o]));
    const touched = [...res.put, ...[...res.put.map((o) => o.id), ...res.remove].flatMap((id) => now.get(id) ?? [])];
    // (the building's: its operations — and if what they undo was changed by someone since, not at all)
    const ops = step.struct ? (dir === "back" ? step.struct.back : step.struct.fwd) : null;
    let next: Structure | null = null;
    if (ops) {
      try {
        next = applyOps(room.structure, ops);
      } catch {
        s[dir === "back" ? "undo" : "redo"].push(step);
        report(p.uid);
        return room.send(client, "toast", { text: "Changed since by someone else: not undone.", tone: "warn" });
      }
    }
    const locked = room.lockBreak(p, next ? viewOf(next) : null, touched);
    if (locked) {
      s[dir === "back" ? "undo" : "redo"].push(step);
      report(p.uid);
      return room.send(client, "toast", { text: `${locked}.`, tone: "warn" });
    }
    if (ops) room.applyStruct(ops);
    for (const o of res.put) {
      const live = room.state.objects.get(o.id);
      o.props = keepPlaying(o.props, live ? fromSchema(live).props : null);
      room.state.objects.set(o.id, toSchema(o));
      if (!config.offline) api.putObject(o).catch(persistFailed);
    }
    for (const id of res.remove) {
      room.state.objects.delete(id);
      if (!config.offline) api.deleteObject(id).catch(persistFailed);
    }
    room.rebuildGrid();
    room.rescue();
    (dir === "back" ? s.redo : s.undo).push(step);
    report(p.uid);
    if (!ops) room.toBuilders("build:saved", { ok: true, at: Date.now() });
    const kept = res.skipped ? ` (kept ${res.skipped} change${res.skipped > 1 ? "s" : ""} made since)` : "";
    room.send(client, "toast", { text: `${dir === "back" ? "Undid" : "Redid"}: ${step.label}${kept}.` });
  };

  room.on("build:undo", (client) => travel(client, "back"));
  room.on("build:redo", (client) => travel(client, "forward"));

  return {
    join: (_client, p) => {
      if (p.builder) report(p.uid);
    },
    dispose: () => {
      for (const o of open.values()) clearTimeout(o.timer);
    },
  };
});
