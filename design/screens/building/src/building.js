// The current HUD (as hud.js in phone/src) plus the floor: a VFD chip beside
// where you are, the minimap's floor strip, the floor in its footer.
//   <div id="hud" data-room="Lobby" data-floor="G" data-clock="11:00" data-here="7"></div>
document.addEventListener("DOMContentLoaded", () => {
  const h = document.getElementById("hud");
  if (!h) return;
  const room = h.dataset.room ?? "Lobby", floor = h.dataset.floor ?? "G", clock = h.dataset.clock ?? "11:00";
  const here = h.dataset.here ?? "6", map = h.dataset.map ?? "lobby";
  const I = (n) => ic(n);
  const levels = ["4", "3", "2", "1", "G"].map((l) => `<i class="${l === floor ? "on" : ""}">${l}</i>`).join("");
  const maps = {
    // G: the lot (dark), the path, the lobby (tile), the core, the offices
    lobby: `<i style="left:6px;top:6px;width:64px;height:128px;background:#3d3f42"></i>
      <i style="left:70px;top:58px;width:14px;height:18px;background:#d9d6cf"></i>
      <i style="left:84px;top:22px;width:44px;height:84px;background:#d9ccb0"></i>
      <i style="left:96px;top:106px;width:18px;height:22px;background:#9aa1a6"></i>
      <i style="left:128px;top:6px;width:44px;height:58px;background:#5a6a34"></i><i style="left:128px;top:80px;width:44px;height:48px;background:#5a6a34"></i>
      <i style="left:128px;top:64px;width:44px;height:16px;background:#e7e1d3"></i>`,
    lot: null,
  };
  maps.lot = maps.lobby;
  h.outerHTML = `
  <div class="tl shell"><span class="tape"></span><span class="brand">YUTOPIA</span>
    <span class="room vfd"><b>YUTOPIA DEMO</b><span>▸ ${room} · ${here} here</span></span>
    <span class="floor vfd"><small>FLOOR</small><b>${floor}</b></span><span class="clk vfd">${clock}</span></div>
  <div class="tr shell"><span class="faces"><span class="pf" data-p="1" style="width:30px;height:30px"></span><span class="pf" data-p="2" style="width:30px;height:30px"></span><span class="pf" data-p="5" style="width:30px;height:30px"></span></span>
    <span class="cnt">7 online</span><span class="ghost">YONDRA</span><span class="ghost">LEAVE</span></div>
  <div class="dock shell">
    <span class="dk">${I("mic")}</span><span class="dk">${I("video")}</span><span class="dk">${I("share")}</span><span class="dsep"></span>
    <span class="dk">${I("smile")}</span>
    <span class="dk"><svg class="ic" viewBox="0 0 24 24"><rect x="7" y="2.5" width="10" height="19" rx="2.4"/><path d="M10.5 18.5h3"/></svg><span class="kk">P</span></span>
    <span class="dk">${I("con")}</span><span class="dsep"></span>
    <span class="status"><i></i>AVAILABLE ▾</span><span class="dsep"></span>
    <span class="dk">${I("edit")}</span><span class="dk">${I("set")}</span></div>
  <div class="mini shell"><div class="map">${maps[map] ?? maps.lobby}
    <span style="position:absolute;left:${h.dataset.dotx ?? 76}px;top:${h.dataset.doty ?? 64}px;width:9px;height:9px;border-radius:50%;background:#ffb35c;box-shadow:0 0 0 2px #2a1a12,0 0 8px #ffb35c"></span>
    <div class="lv">${levels}</div>
  </div><div class="ft">▸ ${room.toUpperCase()} · ${floor === "G" ? "GROUND" : `FLOOR ${floor}`}</div></div>`;
  // the HUD's faces come after phone.js has run: draw them again
  for (const el of document.querySelectorAll(".pf[data-p]")) {
    const size = el.offsetWidth || 30, k = size / 30;
    el.style.background = `url(p${el.dataset.p}.svg) ${-17 * k}px ${-1.5 * k}px / ${64 * k}px ${100 * k}px no-repeat, radial-gradient(circle at 50% 30%,#4a2a72,#24123c)`;
  }
});
