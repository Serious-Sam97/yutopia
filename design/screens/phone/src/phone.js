// Vortex Mobile mock helpers: icons, portraits from the real cast, emotes, status bar.
const IC = {
  phone: '<path d="M6.5 3.5h3l1.6 4.4-2.2 1.4a11.5 11.5 0 0 0 5.8 5.8l1.4-2.2 4.4 1.6v3a2 2 0 0 1-2.1 2A16.5 16.5 0 0 1 4.5 5.6a2 2 0 0 1 2-2.1z"/>',
  msg: '<path d="M4 5.5h16a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H10l-5 4v-4H4A1.5 1.5 0 0 1 2.5 16V7A1.5 1.5 0 0 1 4 5.5z"/><path d="M7 10.5h10M7 13.5h6"/>',
  cam: '<path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h3l1.6-2.5h5.8L16.5 7h3A1.5 1.5 0 0 1 21 8.5v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/><circle cx="12" cy="13.3" r="3.8"/><circle cx="17.6" cy="9.8" r=".6" fill="currentColor"/>',
  gal: '<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M3 16l5-5 4 4 3-3 6 6"/><circle cx="15.5" cy="9" r="1.6"/>',
  con: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c.8-3.8 3.7-6 7.5-6s6.7 2.2 7.5 6"/>',
  set: '<path d="M4 7h9M17 7h3M4 17h4M12 17h8"/><circle cx="15" cy="7" r="2.2"/><circle cx="10" cy="17" r="2.2"/><path d="M4 12h12M20 12h0"/>',
  store: '<path d="M5 8.5h14l-1.2 11a1.5 1.5 0 0 1-1.5 1.3H7.7a1.5 1.5 0 0 1-1.5-1.3z"/><path d="M9 8.5V7a3 3 0 0 1 6 0v1.5"/><path d="M9.5 13.5l2.5 2.5 3-4"/>',
  maps: '<path d="M12 21s6.5-5.8 6.5-11a6.5 6.5 0 0 0-13 0c0 5.2 6.5 11 6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  send: '<path d="M4 12l16-8-6 16-3-7z"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
  micoff: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M4 4l16 16"/>',
  spk: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  video: '<rect x="3" y="6.5" width="12.5" height="11" rx="2"/><path d="M15.5 10.5l5-3v9l-5-3"/>',
  addp: '<circle cx="10" cy="8.5" r="3.5"/><path d="M3.5 19.5c.7-3.4 3.3-5.5 6.5-5.5s5.8 2.1 6.5 5.5M18.5 8v6M15.5 11h6"/>',
  pad: '<circle cx="6" cy="6" r="1.4"/><circle cx="12" cy="6" r="1.4"/><circle cx="18" cy="6" r="1.4"/><circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/><circle cx="6" cy="18" r="1.4"/><circle cx="12" cy="18" r="1.4"/><circle cx="18" cy="18" r="1.4"/>',
  end: '<path d="M3 13.5c5-4.5 13-4.5 18 0l-2 3-3.6-1.2V12.6a9 9 0 0 0-6.8 0v2.7L5 16.5z" fill="currentColor"/>',
  flip: '<path d="M4 9a8 8 0 0 1 14-3l2 2M20 15a8 8 0 0 1-14 3l-2-2"/><path d="M20 4v4h-4M4 20v-4h4"/>',
  bolt: '<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/>',
  timer: '<circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.5 2M9.5 3h5"/>',
  chat: '<path d="M5 5h14v10H10l-5 4z"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
  moon: '<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>',
  chev: '<path d="M9 5l7 7-7 7"/>',
  play: '<path d="M8 5.5v13l10-6.5z" fill="currentColor"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  pin: '<path d="M12 21s6.5-5.8 6.5-11a6.5 6.5 0 0 0-13 0c0 5.2 6.5 11 6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
  photo: '<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M3 16l5-5 4 4 3-3 6 6"/>',
  smile: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14a4.5 4.5 0 0 0 7 0M9 9.5h0M15 9.5h0"/>',
  wifi: '<path d="M3 9a13 13 0 0 1 18 0M6 12.5a8.5 8.5 0 0 1 12 0M9 16a4 4 0 0 1 6 0"/><circle cx="12" cy="19" r=".8" fill="currentColor"/>',
  vib: '<rect x="8" y="4" width="8" height="16" rx="2"/><path d="M4 9v6M20 9v6"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.3 0 1.8-.9 1.4-1.9-.5-1.2.3-2.4 1.6-2.4h1.6a3.9 3.9 0 0 0 3.9-3.9c0-4.8-3.8-8.8-8.5-8.8z"/><circle cx="8" cy="11" r="1"/><circle cx="11" cy="7.5" r="1"/><circle cx="15.5" cy="8.5" r="1"/>',
  music: '<path d="M9 18V6l10-2v12"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="16" r="2"/>',
  text: '<path d="M5 6h14M12 6v13M8 19h8"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  dl: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
  share: '<path d="M12 15V4M8 8l4-4 4 4M5 13v6h14v-6"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/>',
  wall: '<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M5 15l4-4 3 3 2-2 5 5"/>',
};
function ic(n, cls = "ic") { return `<svg class="${cls}" viewBox="0 0 24 24">${IC[n] ?? ""}</svg>`; }

function statusBar(time = "16:42", light = false) {
  return `<div class="sb"${light ? ' style="color:#1a0033"' : ""}><span>${time}</span><span class="r"><span class="bars"><i style="height:4px"></i><i style="height:6px"></i><i style="height:8px"></i><i style="height:10px"></i></span><span>VTX</span><span class="bat"><i style="width:100%"></i></span></span></div>`;
}

document.addEventListener("DOMContentLoaded", () => {
  for (const ph of document.querySelectorAll(".phone")) {
    const s = ph.querySelector(".screen");
    if (!s) continue;
    if (!ph.querySelector(".vol")) ph.insertAdjacentHTML("afterbegin", '<span class="vol"></span>');
    s.insertAdjacentHTML("afterbegin", '<span class="punch"></span>' + (s.dataset.nosb != null ? "" : statusBar(s.dataset.time, s.dataset.light != null)));
    if (s.dataset.noind == null) s.insertAdjacentHTML("beforeend", '<span class="home-ind"></span>');
  }
  for (const el of document.querySelectorAll("[data-ic]")) el.innerHTML = ic(el.dataset.ic, el.dataset.cls || "ic");
  for (const el of document.querySelectorAll(".pf[data-p]")) {
    const size = el.offsetWidth || 40;
    const k = size / 30; // show a 30-wide window of the 64×100 board around the head
    const ox = Number(el.dataset.ox ?? 17), oy = Number(el.dataset.oy ?? 1.5);
    const bg = el.dataset.bg ?? "radial-gradient(circle at 50% 30%,#4a2a72,#24123c)";
    el.style.background = `url(p${el.dataset.p}.svg) ${-ox * k}px ${-oy * k}px / ${64 * k}px ${100 * k}px no-repeat, ${bg}`;
  }
  for (const el of document.querySelectorAll("img[data-e]")) el.src = window.EMOTE?.[el.dataset.e] ?? "";
  for (const el of document.querySelectorAll("[data-vx]")) el.innerHTML = `<img src="vx-${el.dataset.vx}.svg" style="width:100%;height:100%;display:block">`;
  // dashed leader lines: data-from="x,y" data-to="x,y"
  for (const el of document.querySelectorAll(".lead[data-from]")) {
    const [x1, y1] = el.dataset.from.split(",").map(Number), [x2, y2] = el.dataset.to.split(",").map(Number);
    const len = Math.hypot(x2 - x1, y2 - y1), a = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
    Object.assign(el.style, { left: x1 + "px", top: y1 + "px", width: len + "px", transform: `rotate(${a}deg)` });
  }
  document.body.dataset.ready = "1";
});
