import { STATION_COUNT } from "@yutopia/shared";
import { isRadio, radioOf } from "@yutopia/shared/media";
import { api } from "../api.ts";
import { config } from "../config.ts";
import { fromSchema, toSchema, type WorldRoom } from "../WorldRoom.ts";
import { registerFeature } from "./index.ts";

// Radios and record players, each its own (props.radio, saved with the
// object, with its own volume knob): a lo-fi station that clients synthesize from (station, startedAt) —
// everyone near hears the same bar — or YouTube (features/media.ts). Picking a
// station switches it back to lo-fi (its YouTube queue goes); stopping stops
// whichever it plays.
registerFeature((room: WorldRoom) => {
  room.on("radio:set", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    const o = room.state.objects.get(String(m.id ?? ""));
    if (!p || !o || !isRadio(o.kind)) return;
    const def = fromSchema(o);
    const r = radioOf(def);
    if (r.lock && !p.admin)
      return room.send(client, "toast", { text: "Only an admin changes this one (it's locked).", tone: "warn" });
    if (m.playing) {
      const station = Number.isInteger(m.station)
        ? (((m.station as number) % STATION_COUNT) + STATION_COUNT) % STATION_COUNT
        : r.station;
      const restart = !r.playing || station !== r.station || r.source !== "lofi";
      Object.assign(r, {
        source: "lofi",
        station,
        playing: true,
        media: null,
        startedAt: restart ? Date.now() : r.startedAt,
      });
    } else Object.assign(r, { playing: false, media: null });
    r.by = p.name;
    const next = { ...def, props: { ...(def.props ?? {}), radio: r } };
    room.state.objects.set(next.id, toSchema(next));
    if (!config.offline) void api.putObject(next).catch((e) => console.warn("[radio] save", e.message));
  });
  // its own volume knob (everyone near hears it at that)
  room.on("radio:volume", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    const o = room.state.objects.get(String(m.id ?? ""));
    const v = Number(m.volume);
    if (!p || !o || !isRadio(o.kind) || !Number.isFinite(v)) return;
    const def = fromSchema(o);
    const r = radioOf(def);
    if (r.lock && !p.admin)
      return room.send(client, "toast", { text: "Only an admin changes this one (it's locked).", tone: "warn" });
    const volume = Math.round(Math.max(0, Math.min(1, v)) * 100) / 100;
    if (volume === r.volume) return;
    const next = { ...def, props: { ...(def.props ?? {}), radio: { ...r, volume } } };
    room.state.objects.set(next.id, toSchema(next));
    if (!config.offline) void api.putObject(next).catch((e) => console.warn("[radio] save", e.message));
  });
  return {};
});
