import { STATION_COUNT } from "@yutopia/shared";
import type { SpaceRoom } from "../SpaceRoom.ts";
import { registerFeature } from "./index.ts";

// The lounge radio: one shared state per space. Clients synthesize the music
// from (station, startedAt), so everyone hears the same bar at the same time.
// Picking a station switches it back from YouTube (features/media.ts) to lo-fi
// (its YouTube queue goes); stopping stops whichever it plays.
registerFeature((room: SpaceRoom) => {
  room.on("radio:set", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    if (!p) return;
    const r = room.state.radio;
    if (m.playing) {
      const station = Number.isInteger(m.station)
        ? (((m.station as number) % STATION_COUNT) + STATION_COUNT) % STATION_COUNT
        : r.station;
      if (!r.playing || station !== r.station || r.source !== "lofi") r.startedAt = Date.now();
      r.station = station;
      r.source = "lofi";
      r.media = ""; // YouTube's queue goes: lo-fi took over
      r.playing = true;
    } else {
      r.playing = false;
      r.media = "";
    }
    r.by = p.name;
  });
  return {};
});
