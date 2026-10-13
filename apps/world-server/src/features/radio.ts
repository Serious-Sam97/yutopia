import { STATION_COUNT } from "@yutopia/shared";
import { isRadio, radioOf } from "@yutopia/shared/media";
import { config } from "../config.ts";
import { fromSchema, type SpaceRoom, toSchema } from "../SpaceRoom.ts";
import { yondra } from "../yondra.ts";
import { registerFeature } from "./index.ts";

// Radios and record players, each its own (props.radio, saved with the
// object): a lo-fi station that clients synthesize from (station, startedAt) —
// everyone near hears the same bar — or YouTube (features/media.ts). Picking a
// station switches it back to lo-fi (its YouTube queue goes); stopping stops
// whichever it plays.
registerFeature((room: SpaceRoom) => {
  room.on("radio:set", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    const o = room.state.objects.get(String(m.id ?? ""));
    if (!p || !o || !isRadio(o.kind)) return;
    const def = fromSchema(o);
    const r = radioOf(def);
    if (r.lock && !p.builder)
      return room.send(client, "toast", { text: "Only builders change this one (it's locked).", tone: "warn" });
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
    if (!config.offline)
      void yondra.putObject(room.spaceId, next).catch((e) => console.warn("[radio] save", e.message));
  });
  return {};
});
