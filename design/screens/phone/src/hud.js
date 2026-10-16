// Redraws the current HUD around a mock: top-left where/clock, top-right presence, dock (Chat → Phone), minimap.
document.addEventListener("DOMContentLoaded", () => {
  const h = document.getElementById("hud");
  if (!h) return;
  const room = h.dataset.room ?? "Open office", clock = h.dataset.clock ?? "16:42", badge = h.dataset.badge;
  const phoneLit = h.dataset.lit != null;
  const I = (n) => ic(n);
  h.outerHTML = `
  <div class="tl shell"><span class="tape"></span><span class="brand">YUTOPIA</span>
    <span class="room vfd"><b>YUTOPIA DEMO</b><span>▸ ${room} · 6 here</span></span><span class="clk vfd">${clock}</span></div>
  <div class="tr shell"><span class="faces"><span class="pf" data-p="1" style="width:30px;height:30px"></span><span class="pf" data-p="2" style="width:30px;height:30px"></span><span class="pf" data-p="5" style="width:30px;height:30px"></span></span>
    <span class="cnt">7 online</span><span class="ghost">YONDRA</span><span class="ghost">LEAVE</span></div>
  <div class="dock shell">
    <span class="dk">${I("mic")}</span><span class="dk">${I("video")}</span><span class="dk">${I("share")}</span><span class="dsep"></span>
    <span class="dk">${I("smile")}</span>
    <span class="dk${phoneLit ? " lit" : ""}" id="dock-phone"><svg class="ic" viewBox="0 0 24 24"><rect x="7" y="2.5" width="10" height="19" rx="2.4"/><path d="M10.5 18.5h3"/></svg>${badge ? `<span class="bd">${badge}</span>` : ""}<span class="kk">P</span></span>
    <span class="dk">${I("con")}</span><span class="dsep"></span>
    <span class="status"><i></i>AVAILABLE ▾</span><span class="dsep"></span>
    <span class="dk">${I("edit")}</span><span class="dk">${I("set")}</span></div>
  <div class="mini shell"><div class="map">
    <i style="left:6px;top:6px;width:96px;height:60px;background:#7a5338"></i><i style="left:106px;top:6px;width:76px;height:60px;background:#5a6a34"></i>
    <i style="left:6px;top:70px;width:60px;height:62px;background:#d9ccb0"></i><i style="left:70px;top:70px;width:52px;height:62px;background:#6b7a3a"></i><i style="left:126px;top:70px;width:56px;height:62px;background:#8a5a3c"></i>
    <span style="position:absolute;left:44px;top:30px;width:9px;height:9px;border-radius:50%;background:#ffb35c;box-shadow:0 0 0 2px #2a1a12,0 0 8px #ffb35c"></span>
    <span style="position:absolute;left:66px;top:42px;width:7px;height:7px;border-radius:50%;background:#efe4cc"></span>
    <span style="position:absolute;left:140px;top:22px;width:7px;height:7px;border-radius:50%;background:#efe4cc"></span>
    <span style="position:absolute;left:28px;top:96px;width:7px;height:7px;border-radius:50%;background:#ff2d95"></span>
  </div><div class="ft">▸ ${room.toUpperCase()}</div></div>`;
});
