import { applyStep, diffStep, HISTORY_LIMIT, type Snapshot, STEP_LABELS, type Step, snapshot } from "@yutopia/shared";
import { config } from "../config.ts";
import { fromSchema, type SpaceClient, type SpaceRoom, toSchema } from "../SpaceRoom.ts";
import { yondra } from "../yondra.ts";
import { registerFeature } from "./index.ts";

// Build undo/redo, per person. Every builder message opens (or extends) a step;
// once that person's edits pause, the step is the difference between the studio
// before and after (shared history.ts), so a whole drag of paint is one undo.
// Undo only reverts what nobody else has changed since.
const QUIET_MS = 600;

registerFeature((room: SpaceRoom) => {
  const stacks = new Map<number, { undo: Step[]; redo: Step[] }>();
  const open = new Map<number, { before: Snapshot; label: string; timer: ReturnType<typeof setTimeout> }>();
  const objects = () => [...room.state.objects.values()].map(fromSchema);
  const player = (c: SpaceClient) => room.state.players.get(c.sessionId);
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
    const step = diffStep(o.before, snapshot(room.map, objects()), o.label);
    if (!step) return;
    const s = stackOf(uid);
    s.undo.push(step);
    if (s.undo.length > HISTORY_LIMIT) s.undo.shift();
    s.redo = [];
    report(uid);
    // object edits are saved as they happen; map edits report when the layout lands
    if (!step.cells.length && !step.full && !step.areas && !step.spawn && !step.theme)
      room.toBuilders("build:saved", { ok: true, at: Date.now() });
  };

  room.messageTaps.push((client, type) => {
    const label = STEP_LABELS[type];
    const p = player(client);
    if (!label || !p?.builder) return;
    const cur = open.get(p.uid);
    if (cur) {
      clearTimeout(cur.timer);
      cur.timer = setTimeout(() => close(p.uid), QUIET_MS);
      return;
    }
    open.set(p.uid, {
      before: snapshot(room.map, objects()),
      label,
      timer: setTimeout(() => close(p.uid), QUIET_MS),
    });
  });

  const persistFailed = (e: Error) => {
    console.warn("[history] save failed", e.message);
    room.toBuilders("build:saved", { ok: false, at: Date.now() });
  };

  const travel = (client: SpaceClient, dir: "back" | "forward") => {
    const p = player(client);
    if (!p?.builder) return;
    close(p.uid);
    const s = stackOf(p.uid);
    const step = (dir === "back" ? s.undo : s.redo).pop();
    if (!step) return report(p.uid);
    const res = applyStep(room.map, objects(), step, dir);
    if (res.map) room.commitMap(res.map);
    for (const o of res.put) {
      room.state.objects.set(o.id, toSchema(o));
      if (!config.offline) yondra.putObject(room.spaceId, o).catch(persistFailed);
    }
    for (const id of res.remove) {
      room.state.objects.delete(id);
      if (!config.offline) yondra.deleteObject(room.spaceId, id).catch(persistFailed);
    }
    room.rebuildGrid();
    room.rescue();
    (dir === "back" ? s.redo : s.undo).push(step);
    report(p.uid);
    if (!res.map) room.toBuilders("build:saved", { ok: true, at: Date.now() });
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
