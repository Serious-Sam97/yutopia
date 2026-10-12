// A studio's picture for the lobby: its building in its theme (clouds, city,
// snow) at the local hour, the project's colour on the facade, and a lit
// window for everyone inside. Plain SVG, no world engine.
const W = 320;
const H = 150;

function rnd(seed: number) {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

export function StudioThumb({
  id,
  theme,
  color,
  online,
  hour,
}: {
  id: number;
  theme: string;
  color: string;
  online: number;
  hour: number;
}) {
  const night = hour < 6.5 || hour >= 19.5;
  const dusk = !night && (hour >= 17.5 || hour < 8);
  const r = rnd(id + 7);
  const g = `st${id}`;
  const sky =
    theme === "snow"
      ? night
        ? ["#1f2a44", "#45507a"]
        : ["#c9d6e3", "#eef2f4"]
      : theme === "city"
        ? night
          ? ["#140f2a", "#3a2350"]
          : dusk
            ? ["#f08a4b", "#ffd28a"]
            : ["#6fa8d6", "#cfe6f2"]
        : night
          ? ["#101a3a", "#2c3f72"]
          : dusk
            ? ["#e98b5d", "#ffd9a0"]
            : ["#4f9be0", "#bfe2f7"];
  const lit = night || dusk ? "#ffd27a" : "#ffe7a8"; // lights on inside, even by day

  // backdrop
  let back = "";
  if (theme === "city") {
    for (let x = -10; x < W; ) {
      const w = 18 + r() * 26;
      const h = 30 + r() * 55;
      back += `<rect x="${x}" y="${108 - h}" width="${w}" height="${h + 10}" fill="${night ? "#241a3a" : "#7d8ca3"}" opacity=".9"/>`;
      for (let wy = 112 - h; wy < 100; wy += 8)
        for (let wx = x + 3; wx < x + w - 4; wx += 6)
          if (r() < (night ? 0.45 : 0.15))
            back += `<rect x="${wx}" y="${wy}" width="2.5" height="3.5" fill="${night ? "#ffcf6e" : "#e9f1f6"}"/>`;
      x += w + 2;
    }
  } else if (theme === "snow") {
    for (let i = 0; i < 16; i++) {
      const x = r() * W;
      const h = 22 + r() * 26;
      back += `<path d="M${x} ${104 - h} L${x - h * 0.35} 106 L${x + h * 0.35} 106Z" fill="${night ? "#2c3a52" : "#6d7f8c"}" opacity=".85"/>`;
    }
    back += `<rect x="0" y="100" width="${W}" height="${H}" fill="${night ? "#c7d0e0" : "#f4f7f8"}"/>`;
  } else {
    for (let i = 0; i < 4; i++) {
      const x = r() * W;
      const y = 18 + r() * 40;
      const s = 0.7 + r() * 0.7;
      back += `<g transform="translate(${x} ${y}) scale(${s})" fill="${night ? "#3a4c80" : "#ffffff"}" opacity="${night ? 0.6 : 0.9}"><circle cx="0" cy="8" r="10"/><circle cx="14" cy="4" r="13"/><circle cx="30" cy="9" r="9"/><rect x="0" y="8" width="30" height="10" rx="5"/></g>`;
    }
  }
  let stars = "";
  if (night)
    for (let i = 0; i < 26; i++)
      stars += `<circle cx="${r() * W}" cy="${r() * 70}" r="${r() < 0.2 ? 1.1 : 0.6}" fill="#fff" opacity="${0.4 + r() * 0.5}"/>`;

  // the building: an isometric block, cream walls, a walnut cornice
  const cx = W / 2;
  const base = 128;
  const hw = 74; // half width across
  const hh = 26; // half depth (iso)
  const tall = 46;
  const L = `M${cx - hw} ${base - hh} L${cx} ${base} L${cx} ${base - tall} L${cx - hw} ${base - hh - tall}Z`;
  const R = `M${cx} ${base} L${cx + hw} ${base - hh} L${cx + hw} ${base - hh - tall} L${cx} ${base - tall}Z`;
  const T = `M${cx - hw} ${base - hh - tall} L${cx} ${base - tall} L${cx + hw} ${base - hh - tall} L${cx} ${base - 2 * hh - tall}Z`;
  let windows = "";
  const slots: [number, number, number][] = [];
  for (let i = 0; i < 6; i++) slots.push([cx - hw + 10 + i * 11, base - hh - 30 + i * (hh / hw) * 11, -1]);
  for (let i = 0; i < 6; i++) slots.push([cx + 6 + i * 11, base - 30 - i * (hh / hw) * 11, 1]);
  const on = new Set<number>();
  for (let i = 0; i < Math.min(online, slots.length); i++) on.add(Math.floor((i * 7 + id) % slots.length));
  slots.forEach(([x, y, side], i) => {
    const glow = on.has(i);
    const skew = side * (hh / hw) * 7;
    windows += `<path d="M${x} ${y} l7 ${-skew} v12 l-7 ${skew}Z" fill="${glow ? lit : night ? "#2a2236" : "#8fb0c4"}" stroke="#3b2618" stroke-width=".8"/>`;
    if (glow && (night || dusk))
      windows += `<path d="M${x} ${y} l7 ${-skew} v12 l-7 ${skew}Z" fill="${lit}" opacity=".35" filter="url(#${g}b)"/>`;
  });
  const stripe = `M${cx - hw} ${base - hh - 8} L${cx} ${base - 8} L${cx + hw} ${base - hh - 8} L${cx + hw} ${base - hh - 4} L${cx} ${base - 4} L${cx - hw} ${base - hh - 4}Z`;
  // rooftop kit (AC units, an antenna) and the entrance: a door under an awning in the project colour
  const box = (px: number, py: number, a: number, h: number, c: string) => {
    const b = a * (hh / hw);
    return `<path d="M${px - a} ${py - b} L${px} ${py} L${px} ${py - h} L${px - a} ${py - b - h}Z" fill="${c}" stroke="#3b2618" stroke-width=".8"/><path d="M${px} ${py} L${px + a} ${py - b} L${px + a} ${py - b - h} L${px} ${py - h}Z" fill="${c}" stroke="#3b2618" stroke-width=".8"/><path d="M${px} ${py} L${px + a} ${py - b} L${px + a} ${py - b - h} L${px} ${py - h}Z" fill="#000" opacity=".18"/><path d="M${px - a} ${py - b - h} L${px} ${py - h} L${px + a} ${py - b - h} L${px} ${py - 2 * b - h}Z" fill="#e8e1d2" stroke="#3b2618" stroke-width=".8"/>`;
  };
  const roofY = base - hh - tall;
  const roof = `${box(cx - 30, roofY + 4, 10, 7, "#b9b3a6")}${box(cx + 20, roofY - 6, 8, 6, "#a8a296")}<path d="M${cx + 44} ${roofY - 8} V${roofY - 30}" stroke="#3b2618" stroke-width="1.4"/><path d="M${cx + 38} ${roofY - 30} L${cx + 50} ${roofY - 34} M${cx + 40} ${roofY - 24} L${cx + 48} ${roofY - 27}" stroke="#3b2618" stroke-width="1.2"/><circle cx="${cx + 44}" cy="${roofY - 32}" r="1.6" fill="${night ? "#ff5f5f" : "#e05a3a"}"/>`;
  const at = (t: number): [number, number] => [cx + hw * t, base - hh * t];
  const [d0x, d0y] = at(0.12);
  const [d1x, d1y] = at(0.27);
  const door = `<path d="M${d0x} ${d0y} L${d1x} ${d1y} L${d1x} ${d1y - 17} L${d0x} ${d0y - 17}Z" fill="${night ? lit : "#4a3020"}" stroke="#3b2618" stroke-width="1"/><path d="M${d0x - 2} ${d0y - 18} L${d1x + 2} ${d1y - 19} L${d1x + 6} ${d1y - 13} L${d0x + 2} ${d0y - 12}Z" fill="${color}" stroke="#3b2618" stroke-width=".9"/>`;
  const ground = theme === "snow" ? (night ? "#b8c3d6" : "#ffffff") : theme === "city" ? "#4a4a52" : "#7a9a5a";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">
<defs><linearGradient id="${g}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient>
<filter id="${g}b" x="-1" y="-1" width="3" height="3"><feGaussianBlur stdDeviation="3"/></filter></defs>
<rect width="${W}" height="${H}" fill="url(#${g}s)"/>${stars}${back}
<path d="M0 ${base - 8} L${cx - hw - 30} ${base - hh - 20} L${cx + hw + 30} ${base - hh - 20} L${W} ${base - 8} V${H} H0Z" fill="${ground}" opacity=".9"/>
<ellipse cx="${cx}" cy="${base + 4}" rx="${hw + 14}" ry="${hh * 0.6}" fill="#000" opacity=".22"/>
<path d="${L}" fill="#efe4cc" stroke="#3b2618" stroke-width="1.2" stroke-linejoin="round"/>
<path d="${L}" fill="#000" opacity="${night ? 0.35 : 0.06}"/>
<path d="${R}" fill="#d9c9a6" stroke="#3b2618" stroke-width="1.2" stroke-linejoin="round"/>
<path d="${R}" fill="#000" opacity="${night ? 0.45 : 0.16}"/>
<path d="${T}" fill="#5b3a26" stroke="#3b2618" stroke-width="1.2" stroke-linejoin="round"/>
<path d="${stripe}" fill="${color}" opacity=".95"/>
${windows}${door}${roof}
</svg>`;
  return (
    // biome-ignore lint/performance/noImgElement: inline SVG data URL
    <img
      alt=""
      src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
      className="block w-full h-full object-cover"
      draggable={false}
    />
  );
}
