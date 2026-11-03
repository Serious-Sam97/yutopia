import { levelMap } from "@yutopia/shared";
import { holesToWire, ICE_HOLE, type IceHole, iceAt, setIceHoles } from "@yutopia/shared/grounds";
import { waterTempAt } from "@yutopia/shared/weather";
import type { WorldRoom } from "../WorldRoom.ts";
import { registerFeature } from "./index.ts";

// The water's ice broken through (docs/plan/66-the-water.md, S4): someone on thin ice (near its edge
// while it's young, or all of it then) stood there or landed hard says so (`ice:break`, the Grounds'
// coords); checked — thin ice there, near them — it's a hole for everyone (the room's
// `weather.holes`), the ice under them gone and the water under that. A few at most (the oldest goes);
// each freezes over in ten minutes, and all of them go with the ice. And the water's warmth for
// everyone (S3: its cold in it), as the weather has it.
registerFeature((room: WorldRoom) => {
  let holes: IceHole[] = [];
  const say = () => {
    setIceHoles(holes);
    room.state.weather.holes = holesToWire(holes);
  };
  room.on("ice:break", (client, m) => {
    const p = room.state.players.get(client.sessionId);
    const x = Number(m?.x);
    const z = Number(m?.z);
    if (!p || p.level !== 0 || !Number.isFinite(x) || !Number.isFinite(z)) return;
    const g = levelMap(room.map, 0);
    // (where they are, as the Grounds have it: within a step of where they say)
    if (Math.hypot(p.x + (g?.ox ?? 0) - x, p.y + (g?.oy ?? 0) - z) > 3) return;
    if (!iceAt(x, z)?.thin) return;
    if (holes.some((h) => Math.hypot(h.x - x, h.z - z) < h.r)) return;
    holes = [...holes, { x, z, r: ICE_HOLE.r, at: Date.now() }].slice(-ICE_HOLE.most);
    say();
  });
  let warmAt = 0;
  return {
    tick(_dt, now) {
      // (the water's warmth, a minute at a time: it moves over a day)
      if (now - warmAt > 60_000) {
        warmAt = now;
        room.state.weather.water = Math.round(waterTempAt(now) * 10) / 10;
      }
      const keep = room.state.weather.ice > 0.01 ? holes.filter((h) => now - h.at < ICE_HOLE.heal) : [];
      if (keep.length !== holes.length) {
        holes = keep;
        say();
      } else setIceHoles(holes);
    },
  };
});
