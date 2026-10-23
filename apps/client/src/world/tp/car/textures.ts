import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";

// The sedan's painted surfaces (docs/plan/28-the-car.md): walnut, the seats'
// pleated cloth, the winter tyres' tread, the hubcaps, the lamps' lenses, the
// plate, the heater's panel and the pine-tree air freshener. All drawn here,
// deterministic, no image files.

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d") as CanvasRenderingContext2D];
}
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}
function tex(c: HTMLCanvasElement, srgb = true, repeat = false): CanvasTexture {
  const t = new CanvasTexture(c);
  if (srgb) t.colorSpace = SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Walnut veneer: a warm ground, wavy darker grain, a figure of lighter streaks. */
export function walnut(): CanvasTexture {
  const [c, g] = canvas(512, 256);
  const r = rng(7);
  g.fillStyle = "#5e3a22";
  g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 70; i++) {
    const y0 = r() * 256;
    const amp = 2 + r() * 9;
    const f = 0.006 + r() * 0.02;
    const ph = r() * 6;
    const dark = r() < 0.6;
    g.strokeStyle = dark ? `rgba(38,20,10,${0.18 + r() * 0.35})` : `rgba(150,96,52,${0.1 + r() * 0.2})`;
    g.lineWidth = 0.6 + r() * 2.4;
    g.beginPath();
    for (let x = 0; x <= 512; x += 6) {
      const y = y0 + Math.sin(x * f + ph) * amp + Math.sin(x * f * 3.1 + ph * 2) * amp * 0.25;
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }
  // burl knots
  for (let i = 0; i < 6; i++) {
    const x = r() * 512;
    const y = r() * 256;
    for (let k = 6; k > 0; k--) {
      g.strokeStyle = `rgba(40,22,12,${0.08 * k})`;
      g.lineWidth = 1;
      g.beginPath();
      g.ellipse(x, y, k * 4 + r() * 2, k * 2, r(), 0, Math.PI * 2);
      g.stroke();
    }
  }
  return tex(c, true, true);
}

/** The seats' cloth: cream, pleated in vertical flutes, a fine weave. */
export function cloth(): CanvasTexture {
  const [c, g] = canvas(256, 256);
  const r = rng(11);
  g.fillStyle = "#cbbd9e";
  g.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 32) {
    const grd = g.createLinearGradient(x, 0, x + 32, 0);
    grd.addColorStop(0, "rgba(70,52,30,0.2)");
    grd.addColorStop(0.15, "rgba(255,250,235,0.06)");
    grd.addColorStop(0.5, "rgba(255,250,235,0.1)");
    grd.addColorStop(0.85, "rgba(80,60,36,0.05)");
    grd.addColorStop(1, "rgba(70,52,30,0.24)");
    g.fillStyle = grd;
    g.fillRect(x, 0, 32, 256);
  }
  const d = g.getImageData(0, 0, 256, 256);
  for (let i = 0; i < d.data.length; i += 4) {
    const n = (r() - 0.5) * 18;
    d.data[i] += n;
    d.data[i + 1] += n;
    d.data[i + 2] += n;
  }
  g.putImageData(d, 0, 0);
  return tex(c, true, true);
}

/** Carpet, dark rust-brown, a dense pile. */
export function carpet(): CanvasTexture {
  const [c, g] = canvas(128, 128);
  const r = rng(13);
  g.fillStyle = "#4a3123";
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 3000; i++) {
    g.fillStyle = r() < 0.5 ? "rgba(20,10,6,0.35)" : "rgba(120,80,56,0.25)";
    g.fillRect(r() * 128, r() * 128, 1, 1);
  }
  return tex(c, true, true);
}

/** A winter tyre's tread round the circumference (u) and across (v): chevrons and sipes. */
export function tread(): CanvasTexture {
  const [c, g] = canvas(1024, 128);
  g.fillStyle = "#1a1b1d";
  g.fillRect(0, 0, 1024, 128);
  // the sidewalls (v near 0 and 1) smooth; the tread blocks in the middle band
  for (let i = 0; i < 48; i++) {
    const x = (i / 48) * 1024;
    g.fillStyle = "#0b0b0c";
    for (const side of [-1, 1]) {
      g.beginPath();
      g.moveTo(x, 64);
      g.lineTo(x + 10, 64);
      g.lineTo(x + 26, 64 + side * 40);
      g.lineTo(x + 16, 64 + side * 40);
      g.closePath();
      g.fill();
    }
    // sipes: thin cuts across each block
    g.strokeStyle = "#0e0e0f";
    g.lineWidth = 1;
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      g.moveTo(x + 4 + k * 6, 30);
      g.lineTo(x + 8 + k * 6, 44);
      g.moveTo(x + 4 + k * 6, 84);
      g.lineTo(x + 8 + k * 6, 98);
      g.stroke();
    }
  }
  g.fillStyle = "#0d0d0e";
  g.fillRect(0, 62, 1024, 4); // the centre groove
  return tex(c, true, true);
}

/** A flat steel hubcap: brushed, slotted round the rim, a domed centre. */
export function hubcap(): CanvasTexture {
  const [c, g] = canvas(256, 256);
  const grd = g.createRadialGradient(128, 128, 10, 128, 128, 128);
  grd.addColorStop(0, "#e9ecee");
  grd.addColorStop(0.55, "#b9bec3");
  grd.addColorStop(0.75, "#d4d8db");
  grd.addColorStop(0.92, "#8c9196");
  grd.addColorStop(1, "#5b5f63");
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  // the slots: dark, a brake disc behind
  for (let i = 0; i < 12; i++) {
    g.save();
    g.translate(128, 128);
    g.rotate((i / 12) * Math.PI * 2);
    g.fillStyle = "#1c1d1f";
    g.beginPath();
    g.roundRect(-9, 66, 18, 34, 7);
    g.fill();
    g.restore();
  }
  // brushed rings
  for (let rr = 20; rr < 120; rr += 3) {
    g.strokeStyle = `rgba(255,255,255,${rr % 9 === 0 ? 0.12 : 0.04})`;
    g.beginPath();
    g.arc(128, 128, rr, 0, Math.PI * 2);
    g.stroke();
  }
  // the centre: five nuts round a domed cap
  g.fillStyle = "#cfd3d6";
  g.beginPath();
  g.arc(128, 128, 30, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = "#7a7f84";
  g.lineWidth = 2;
  g.stroke();
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    g.fillStyle = "#8d9297";
    g.beginPath();
    g.arc(128 + Math.cos(a) * 44, 128 + Math.sin(a) * 44, 6, 0, Math.PI * 2);
    g.fill();
  }
  return tex(c);
}

/** A lamp's lens: horizontal ribs (the tail lamps) or a fluted grid (the headlamps). */
export function lens(kind: "ribs" | "grid"): CanvasTexture {
  const [c, g] = canvas(128, 64);
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, 128, 64);
  if (kind === "ribs") {
    for (let y = 0; y < 64; y += 8) {
      const grd = g.createLinearGradient(0, y, 0, y + 8);
      grd.addColorStop(0, "rgba(0,0,0,0.0)");
      grd.addColorStop(0.7, "rgba(0,0,0,0.25)");
      grd.addColorStop(1, "rgba(0,0,0,0.45)");
      g.fillStyle = grd;
      g.fillRect(0, y, 128, 8);
    }
  } else {
    for (let x = 0; x < 128; x += 10) {
      g.fillStyle = "rgba(0,0,0,0.13)";
      g.fillRect(x, 0, 2, 64);
    }
    for (let y = 0; y < 64; y += 12) {
      g.fillStyle = "rgba(0,0,0,0.1)";
      g.fillRect(0, y, 128, 2);
    }
    const grd = g.createRadialGradient(64, 32, 2, 64, 32, 40);
    grd.addColorStop(0, "rgba(255,255,255,0.0)");
    grd.addColorStop(1, "rgba(0,0,0,0.22)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 64);
  }
  return tex(c);
}

/** The plate: made-up text, embossed black on cream. */
export function plate(text: string): CanvasTexture {
  const [c, g] = canvas(256, 64);
  g.fillStyle = "#e8e2cf";
  g.fillRect(0, 0, 256, 64);
  g.strokeStyle = "#2b2b2b";
  g.lineWidth = 3;
  g.strokeRect(4, 4, 248, 56);
  g.fillStyle = "#1d1d1d";
  g.font = '700 40px "DIN Condensed", "Arial Narrow", Arial, sans-serif';
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 128, 35);
  return tex(c);
}

/** The heater's panel: three sliders in lit slots, a fan knob's scale, little icons. */
export function heater(): CanvasTexture {
  const [c, g] = canvas(512, 160);
  g.fillStyle = "#151515";
  g.fillRect(0, 0, 512, 160);
  g.shadowColor = "#ffb24a";
  const slot = (x: number, at: number, name: string) => {
    g.fillStyle = "rgba(255,178,74,0.85)";
    g.shadowBlur = 6;
    g.fillRect(x, 40, 110, 6);
    g.shadowBlur = 0;
    g.fillStyle = "#3a3a3a";
    g.fillRect(x + at * 100 - 6, 28, 14, 30);
    g.fillStyle = "#6b6b6b";
    g.fillRect(x + at * 100 - 4, 30, 10, 4);
    g.font = "600 15px Helvetica, Arial, sans-serif";
    g.fillStyle = "#c9b48c";
    g.textAlign = "center";
    g.fillText(name, x + 55, 84);
  };
  slot(24, 0.85, "TEMP");
  slot(196, 0.3, "AIR");
  slot(368, 0.6, "FAN");
  // a blue-to-red bar under TEMP
  const grd = g.createLinearGradient(24, 0, 134, 0);
  grd.addColorStop(0, "#5b7fa8");
  grd.addColorStop(1, "#b5462f");
  g.fillStyle = grd;
  g.fillRect(24, 100, 110, 5);
  // the buttons below: rear demist, recirculate, A/C
  const btn = (x: number, s: string, lit: boolean) => {
    g.fillStyle = "#262626";
    g.fillRect(x, 118, 92, 30);
    g.fillStyle = lit ? "#ffb24a" : "#5a4a32";
    g.shadowBlur = lit ? 6 : 0;
    g.fillRect(x + 8, 124, 8, 4);
    g.shadowBlur = 0;
    g.fillStyle = "#c9b48c";
    g.font = "600 13px Helvetica, Arial, sans-serif";
    g.textAlign = "center";
    g.fillText(s, x + 52, 139);
  };
  btn(40, "REAR ▦", true);
  btn(210, "RECIRC", false);
  btn(380, "DEFROST", true);
  return tex(c);
}

/** The pine-tree air freshener: green, with its string hole and a word on it. */
export function freshener(): CanvasTexture {
  const [c, g] = canvas(128, 192);
  g.clearRect(0, 0, 128, 192);
  g.fillStyle = "#2f6b3a";
  g.beginPath();
  g.moveTo(64, 8);
  const tiers = [
    [40, 48],
    [30, 46],
    [52, 92],
    [38, 90],
    [60, 140],
    [44, 138],
  ];
  // the right side down, the trunk, the left side up
  g.lineTo(64 + tiers[0][0], tiers[0][1]);
  g.lineTo(64 + tiers[1][0] - 10, tiers[1][1]);
  g.lineTo(64 + tiers[2][0], tiers[2][1]);
  g.lineTo(64 + tiers[3][0] - 10, tiers[3][1]);
  g.lineTo(64 + tiers[4][0], tiers[4][1]);
  g.lineTo(72, 140);
  g.lineTo(72, 176);
  g.lineTo(56, 176);
  g.lineTo(56, 140);
  g.lineTo(64 - tiers[4][0], tiers[4][1]);
  g.lineTo(64 - tiers[3][0] + 10, tiers[3][1]);
  g.lineTo(64 - tiers[2][0], tiers[2][1]);
  g.lineTo(64 - tiers[1][0] + 10, tiers[1][1]);
  g.lineTo(64 - tiers[0][0], tiers[0][1]);
  g.closePath();
  g.fill();
  g.strokeStyle = "#1d4626";
  g.lineWidth = 3;
  g.stroke();
  g.fillStyle = "#e9e1c8";
  g.font = '700 italic 18px Georgia, "Times New Roman", serif';
  g.textAlign = "center";
  g.fillText("Pine", 64, 112);
  g.fillStyle = "#183a20";
  g.beginPath();
  g.arc(64, 22, 4, 0, Math.PI * 2);
  g.fill();
  return tex(c);
}

/** The snow on the windscreen's outside, with the wipers' cleared fans (docs/plan/28: the
 *  windscreen). Painted in the glass's own metres: `z` across (−hw..hw), `s` up the glass
 *  (0..len). `wipers`: each pivot (z), arm length and the arc it has swept (radians from
 *  lying flat along the base, towards +z then up). */
export function windscreenSnow(
  hw: number,
  len: number,
  amount: number,
  wipers: { z: number; arm: number; blade: number; a0: number; a1: number }[],
  seed = 3,
  W = 1024,
): CanvasTexture {
  const H = Math.round((W * len) / (2 * hw));
  const [c, g] = canvas(W, H);
  const r = rng(seed);
  const X = (z: number) => ((z + hw) / (2 * hw)) * W;
  const Y = (s: number) => H - (s / len) * H; // s = 0 at the bottom
  const px = W / (2 * hw);
  g.clearRect(0, 0, W, H);
  // settled flakes everywhere, thicker low down and at the edges
  for (let i = 0; i < 7000 * amount * (W / 1024) ** 2; i++) {
    const x = r() * W;
    const y = r() ** 0.7 * H;
    const s = 0.5 + r() ** 2 * 1.9;
    g.fillStyle = `rgba(232,240,250,${0.3 + r() * 0.5})`;
    g.beginPath();
    g.arc(x, H - y * 0.999, s, 0, Math.PI * 2);
    g.fill();
  }
  // a drift banked on the base
  const base = g.createLinearGradient(0, H, 0, H - 0.09 * px);
  base.addColorStop(0, `rgba(240,244,248,${0.95 * amount})`);
  base.addColorStop(1, "rgba(240,244,248,0)");
  g.fillStyle = base;
  g.fillRect(0, H - 0.09 * px, W, 0.09 * px);
  // the wipers' fans: cleared, with a ridge of snow pushed to their ends
  g.save();
  g.globalCompositeOperation = "destination-out";
  for (const w of wipers) {
    const cx = X(w.z);
    const cy = Y(0);
    const r0 = (w.arm - w.blade) * px;
    const r1 = w.arm * px;
    g.fillStyle = "rgba(0,0,0,0.97)";
    g.beginPath();
    // canvas angles: 0 = +x (the +z direction), up = negative y
    g.arc(cx, cy, r1, -w.a1, -w.a0, false);
    g.arc(cx, cy, r0, -w.a0, -w.a1, true);
    g.closePath();
    g.fill();
  }
  g.restore();
  // streaks left in the fans, then the ridges at each end of the sweep
  for (const w of wipers) {
    const cx = X(w.z);
    const cy = Y(0);
    for (let i = 0; i < 26; i++) {
      const rr = (w.arm - w.blade + r() * w.blade) * px;
      const a = w.a0 + r() * (w.a1 - w.a0);
      g.strokeStyle = `rgba(230,236,242,${0.08 + r() * 0.12})`;
      g.lineWidth = 0.8;
      g.beginPath();
      g.arc(cx, cy, rr, -a - 0.05 - r() * 0.2, -a, false);
      g.stroke();
    }
    for (const a of [w.a0, w.a1]) {
      for (let k = 0; k < 60; k++) {
        const rr = (w.arm - w.blade + r() * w.blade) * px;
        const aa = a + (a === w.a0 ? -1 : 1) * r() * 0.05;
        g.fillStyle = `rgba(246,249,252,${0.6 + r() * 0.4})`;
        g.beginPath();
        g.arc(cx + Math.cos(aa) * rr, cy - Math.sin(aa) * rr, 1.6 + r() * 3.2, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  // meltwater beads in the cleared glass
  for (let i = 0; i < 420; i++) {
    const x = r() * W;
    const y = r() * H;
    g.fillStyle = `rgba(210,222,235,${0.12 + r() * 0.18})`;
    g.beginPath();
    g.arc(x, y, 0.8 + r() * 1.6, 0, Math.PI * 2);
    g.fill();
  }
  return tex(c);
}

/** Checker plate (the steps, the footplates, the running boards): raised diamonds on steel. */
export function diamond(): CanvasTexture {
  const [c, g] = canvas(128, 128);
  g.fillStyle = "#8d9399";
  g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 16)
    for (let x = 0; x < 128; x += 16) {
      const flip = ((x + y) / 16) % 2 === 0;
      g.save();
      g.translate(x + 8, y + 8);
      g.rotate(flip ? Math.PI / 4 : -Math.PI / 4);
      g.fillStyle = "#c3c8cd";
      g.fillRect(-7, -1.6, 14, 3.2);
      g.fillStyle = "#5e6368";
      g.fillRect(-7, 1.6, 14, 1.2);
      g.restore();
    }
  const t = tex(c, true, true);
  t.repeat.set(3, 3);
  return t;
}

/** A dash's gauges: four dials, white on black, their needles low (the dash lit at night). */
export function gauges(): CanvasTexture {
  const [c, g] = canvas(512, 128);
  g.fillStyle = "#121314";
  g.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 4; i++) {
    const cx = 64 + i * 128;
    const r = i === 1 || i === 2 ? 54 : 44;
    g.fillStyle = "#050505";
    g.beginPath();
    g.arc(cx, 64, r, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#9aa0a5";
    g.lineWidth = 3;
    g.stroke();
    for (let k = 0; k <= 10; k++) {
      const a = Math.PI * 0.75 + (k / 10) * Math.PI * 1.5;
      g.strokeStyle = k > 8 && i === 1 ? "#e04a2a" : "#f2efe6";
      g.lineWidth = k % 2 ? 1.5 : 3;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * r * 0.72, 64 + Math.sin(a) * r * 0.72);
      g.lineTo(cx + Math.cos(a) * r * 0.9, 64 + Math.sin(a) * r * 0.9);
      g.stroke();
    }
    const a = Math.PI * 0.75 + (0.15 + 0.2 * i) * Math.PI * 1.5;
    g.strokeStyle = "#ff8a3a";
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(cx, 64);
    g.lineTo(cx + Math.cos(a) * r * 0.8, 64 + Math.sin(a) * r * 0.8);
    g.stroke();
  }
  return tex(c);
}

/** Varnished ash (the toboggan's boards): pale, a straight grain along u, a few knots. */
export function ash(): CanvasTexture {
  const [c, g] = canvas(512, 128);
  const r = rng(77);
  g.fillStyle = "#c99a5e";
  g.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 70; i++) {
    const y = r() * 128;
    g.strokeStyle = `rgba(${90 + r() * 40},${55 + r() * 20},${25},${0.12 + r() * 0.2})`;
    g.lineWidth = 0.6 + r() * 1.8;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= 512; x += 32) g.lineTo(x, y + Math.sin(x * 0.01 + i) * 2.5 + (r() - 0.5));
    g.stroke();
  }
  for (let k = 0; k < 3; k++) {
    const x = 60 + r() * 400;
    const y = 20 + r() * 88;
    const grd = g.createRadialGradient(x, y, 1, x, y, 9);
    grd.addColorStop(0, "rgba(70,40,18,0.85)");
    grd.addColorStop(1, "rgba(70,40,18,0)");
    g.fillStyle = grd;
    g.fillRect(x - 12, y - 12, 24, 24);
  }
  return tex(c, true, true);
}
