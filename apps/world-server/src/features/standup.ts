import type { WorldRoom } from "../WorldRoom.ts";
import { registerFeature } from "./index.ts";

// Daily standup in the Standup Corner: everyone standing in the ring gets a turn
// (shuffled), each with a timer; the turn moves on by itself when time is up.
registerFeature((room: WorldRoom) => {
  const st = () => room.state.standup;
  const areaKey = room.map.areas.find((a) => a.kind === "standup")?.key ?? "standup";
  const inRing = () => [...room.state.players.values()].filter((p) => p.area === areaKey && !p.bot);

  const finish = () => {
    st().active = false;
    st().order.clear();
    for (const c of room.clients) {
      const p = room.state.players.get(c.sessionId);
      if (p?.area === areaKey) room.send(c, "toast", { text: "Standup done. Back to work. 📼" });
    }
  };
  const next = () => {
    if (st().turn + 1 >= st().order.length) return finish();
    st().turn += 1;
    st().turnStartedAt = Date.now();
  };

  room.on("standup:start", (client) => {
    const p = room.state.players.get(client.sessionId);
    if (!p || p.area !== areaKey || st().active) return;
    const people = inRing().map((q) => q.uid);
    for (let i = people.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [people[i], people[j]] = [people[j], people[i]];
    }
    if (!people.length) return;
    st().order.clear();
    for (const uid of people) st().order.push(uid);
    st().turn = 0;
    st().turnSeconds = people.length > 6 ? 60 : 90;
    st().turnStartedAt = Date.now();
    st().by = p.name;
    st().active = true;
  });
  room.on("standup:next", (client) => {
    const p = room.state.players.get(client.sessionId);
    if (st().active && p?.area === areaKey) next();
  });
  room.on("standup:stop", (client) => {
    const p = room.state.players.get(client.sessionId);
    if (st().active && p?.area === areaKey) finish();
  });

  return {
    tick(_dt, now) {
      if (!st().active) return;
      if (now - st().turnStartedAt > st().turnSeconds * 1000) next();
      if (inRing().length === 0) finish();
    },
    // late joiners get a turn at the end
    areaChange(_client, p, _from, to) {
      if (to === areaKey && st().active && !st().order.includes(p.uid)) st().order.push(p.uid);
    },
  };
});
