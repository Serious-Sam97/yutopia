// The sedan's vacuum-fluorescent displays (docs/plan/28-the-car.md, the
// interior): the cluster behind the wheel and the radio's window, drawn on
// canvases. Amber on smoked glass; the unlit segments still show faintly
// through the glass, as on a real VFD.

export interface Cluster {
  kmh: number;
  rpm: number; // 0..7000
  gear: string; // "P" "R" "N" "D" or "1".."5"
  fuel: number; // 0..1
  temp: number; // 0..1 (cold → hot)
  clock: string; // "23:14"
  outside: number; // °C
  odo: number;
  beams: "off" | "low" | "high";
  ind: -1 | 0 | 1; // the indicator lit this instant
  hand: boolean; // the handbrake on
  helps: boolean; // a help acting (traction / stability)
}

const ON = "#ffb24a";
const GHOST = "rgba(255,178,74,0.07)";
const GLASS = "#0a0b0a";

// a seven-segment digit: segments a..g as slanted hexagons
const SEGS: Record<string, string> = {
  "0": "abcdef",
  "1": "bc",
  "2": "abged",
  "3": "abgcd",
  "4": "fgbc",
  "5": "afgcd",
  "6": "afgedc",
  "7": "abc",
  "8": "abcdefg",
  "9": "abcdfg",
  "-": "g",
  " ": "",
  P: "abefg",
  R: "efg",
  N: "ceg",
  D: "bcdeg",
  C: "adef",
  E: "adefg",
  F: "aefg",
};

function seg(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, t: number) {
  // a bar from (x0,y0) to (x1,y1), pointed at both ends
  const dx = x1 - x0;
  const dy = y1 - y0;
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l;
  const uy = dy / l;
  const nx = -uy * (t / 2);
  const ny = ux * (t / 2);
  const k = t / 2;
  g.beginPath();
  g.moveTo(x0 + ux * 0.6, y0 + uy * 0.6);
  g.lineTo(x0 + ux * k + nx, y0 + uy * k + ny);
  g.lineTo(x1 - ux * k + nx, y1 - uy * k + ny);
  g.lineTo(x1 - ux * 0.6, y1 - uy * 0.6);
  g.lineTo(x1 - ux * k - nx, y1 - uy * k - ny);
  g.lineTo(x0 + ux * k - nx, y0 + uy * k - ny);
  g.closePath();
  g.fill();
}

function digit(g: CanvasRenderingContext2D, ch: string, x: number, y: number, w: number, h: number, lit = true) {
  const t = Math.max(3, w * 0.17);
  const sl = w * 0.14; // the italic slant
  const X = (fx: number, fy: number) => x + fx * w + (1 - fy) * sl;
  const Y = (fy: number) => y + fy * h;
  const on = SEGS[ch] ?? "";
  const pts: Record<string, [number, number, number, number]> = {
    a: [X(0.08, 0), Y(0), X(0.92, 0), Y(0)],
    b: [X(1, 0.04), Y(0.04), X(1, 0.48), Y(0.48)],
    c: [X(1, 0.52), Y(0.52), X(1, 0.96), Y(0.96)],
    d: [X(0.08, 1), Y(1), X(0.92, 1), Y(1)],
    e: [X(0, 0.52), Y(0.52), X(0, 0.96), Y(0.96)],
    f: [X(0, 0.04), Y(0.04), X(0, 0.48), Y(0.48)],
    g: [X(0.08, 0.5), Y(0.5), X(0.92, 0.5), Y(0.5)],
  };
  for (const s of "abcdefg") {
    const lighted = lit && on.includes(s);
    g.fillStyle = lighted ? ON : GHOST;
    g.shadowBlur = lighted ? 10 : 0;
    const [a, b, c, d] = pts[s];
    seg(g, a, b, c, d, t);
  }
  g.shadowBlur = 0;
}

function digits(g: CanvasRenderingContext2D, s: string, x: number, y: number, w: number, h: number, gap: number) {
  for (let i = 0; i < s.length; i++) digit(g, s[i], x + i * (w + gap), y, w, h);
}

function label(g: CanvasRenderingContext2D, s: string, x: number, y: number, px: number, lit = true, align = "left") {
  g.font = `600 ${px}px "DIN Alternate", "Eurostile", "Helvetica Neue", Arial, sans-serif`;
  g.textAlign = align as CanvasTextAlign;
  g.fillStyle = lit ? ON : GHOST;
  g.shadowBlur = lit ? 8 : 0;
  g.fillText(s, x, y);
  g.shadowBlur = 0;
}

/** The cluster behind the wheel, on a 1024 × 256 canvas. */
export function drawCluster(c: HTMLCanvasElement, s: Cluster) {
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  const W = c.width;
  const H = c.height;
  g.save();
  g.scale(W / 1024, H / 256);
  // the smoked glass, a little lighter at the middle
  const bg = g.createLinearGradient(0, 0, 0, 256);
  bg.addColorStop(0, "#060706");
  bg.addColorStop(0.5, GLASS);
  bg.addColorStop(1, "#050605");
  g.fillStyle = bg;
  g.fillRect(0, 0, 1024, 256);
  g.shadowColor = ON;

  // the rev counter: a rising bar of segments across the top, x1000 marks under it
  const bars = 40;
  const lit = Math.round((Math.min(7000, s.rpm) / 7000) * bars);
  for (let i = 0; i < bars; i++) {
    const x = 120 + i * 19.5;
    const h = 14 + (i / bars) * 34;
    const red = i >= 35;
    const on = i < lit;
    g.fillStyle = on ? (red ? "#ff6a3a" : ON) : GHOST;
    g.shadowColor = red ? "#ff6a3a" : ON;
    g.shadowBlur = on ? 9 : 0;
    g.fillRect(x, 74 - h, 13, h);
  }
  g.shadowColor = ON;
  g.shadowBlur = 0;
  for (let k = 0; k <= 7; k++) label(g, String(k), 120 + (k * bars * 19.5) / 7, 96, 17, true, "center");
  label(g, "x1000 r/min", 120, 22, 14, true);

  // the speed, big, in the middle
  const kmh = String(Math.round(Math.abs(s.kmh))).padStart(3, " ");
  digits(g, kmh, 360, 118, 70, 108, 22);
  label(g, "km/h", 640, 222, 22);

  // the gear, boxed, right of the speed
  g.strokeStyle = ON;
  g.lineWidth = 2;
  g.globalAlpha = 0.55;
  g.strokeRect(712, 124, 78, 100);
  g.globalAlpha = 1;
  digit(g, s.gear, 728, 136, 46, 76);

  // fuel and temperature: two columns of bars at the left, with their icons
  const column = (x: number, v: number, name: string, low: string, high: string) => {
    const n = 8;
    for (let i = 0; i < n; i++) {
      const on = i < Math.round(v * n);
      g.fillStyle = on ? ON : GHOST;
      g.shadowBlur = on ? 7 : 0;
      g.fillRect(x, 226 - i * 15, 34, 10);
    }
    g.shadowBlur = 0;
    label(g, high, x + 42, 122, 13);
    label(g, low, x + 42, 234, 13);
    label(g, name, x + 17, 112, 13, true, "center");
  };
  column(28, s.fuel, "FUEL", "E", "F");
  column(150, s.temp, "TEMP", "C", "H");

  // the clock, the outside temperature (an ice warning below −3 °C), the odometer
  digits(g, s.clock.replace(":", ""), 838, 128, 26, 42, 9);
  g.fillStyle = ON;
  g.shadowBlur = 8;
  g.fillRect(899, 138, 5, 5);
  g.fillRect(897, 156, 5, 5);
  g.shadowBlur = 0;
  const t = `${s.outside < 0 ? "-" : " "}${String(Math.abs(Math.round(s.outside))).padStart(2, " ")}`;
  digits(g, t, 838, 190, 18, 30, 6);
  label(g, "°C", 918, 216, 18);
  label(g, "ICE", 966, 216, 18, s.outside <= -3);
  label(g, String(Math.floor(s.odo)).padStart(6, "0"), 838, 248, 16);
  label(g, "km", 918, 248, 13);

  // tell-tales along the top right
  const tt = (x: number, on: boolean, f: () => void) => {
    g.save();
    g.translate(x, 30);
    g.strokeStyle = g.fillStyle = on ? ON : GHOST;
    g.shadowBlur = on ? 8 : 0;
    g.lineWidth = 3;
    f();
    g.restore();
  };
  // indicators
  tt(926, s.ind === -1, () => {
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(14, -11);
    g.lineTo(14, 11);
    g.closePath();
    g.fill();
  });
  tt(992, s.ind === 1, () => {
    g.beginPath();
    g.moveTo(14, 0);
    g.lineTo(0, -11);
    g.lineTo(0, 11);
    g.closePath();
    g.fill();
  });
  // the beam: low (lines down) or high (straight)
  tt(946, s.beams !== "off", () => {
    g.beginPath();
    g.arc(10, 0, 9, Math.PI / 2, -Math.PI / 2, true);
    g.closePath();
    g.stroke();
    for (let i = -1; i <= 1; i++) {
      g.beginPath();
      g.moveTo(24, i * 6);
      g.lineTo(36, i * 6 + (s.beams === "high" ? 0 : 4));
      g.stroke();
    }
  });
  // the handbrake: (!) in a circle
  tt(840, s.hand, () => {
    g.beginPath();
    g.arc(10, 0, 11, 0, Math.PI * 2);
    g.stroke();
    g.font = "700 16px Arial";
    g.textAlign = "center";
    g.fillText("!", 10, 6);
  });
  // a help acting: the car with wavy lines
  tt(878, s.helps, () => {
    g.strokeRect(2, -8, 18, 10);
    g.beginPath();
    g.moveTo(0, 8);
    g.quadraticCurveTo(6, 4, 11, 8);
    g.quadraticCurveTo(16, 12, 22, 8);
    g.stroke();
  });
  g.restore();
}

/** The radio-cassette's window, on a 512 × 128 canvas. */
export function drawRadio(c: HTMLCanvasElement, band: "FM" | "AM" | "TAPE", freq: number, preset: number) {
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  g.save();
  g.scale(c.width / 512, c.height / 128);
  g.fillStyle = GLASS;
  g.fillRect(0, 0, 512, 128);
  g.shadowColor = ON;
  label(g, "FM", 26, 52, 22, band === "FM");
  label(g, "AM", 26, 84, 22, band === "AM");
  label(g, "STEREO", 26, 112, 14, band === "FM");
  const f =
    band === "AM" ? String(Math.round(freq)).padStart(4, " ") : freq.toFixed(1).replace(".", "").padStart(4, " ");
  digits(g, f, 130, 24, 46, 78, 16);
  if (band === "FM") {
    g.fillStyle = ON;
    g.shadowBlur = 8;
    g.fillRect(130 + 3 * 62 - 12, 96, 7, 7);
    g.shadowBlur = 0;
  }
  label(g, band === "AM" ? "kHz" : "MHz", 388, 102, 18);
  label(g, "P", 444, 50, 18);
  digit(g, String(preset % 10), 462, 28, 26, 42);
  // the tape's arrows (off unless a tape plays)
  label(g, "◀ ▶", 450, 112, 14, band === "TAPE");
  g.restore();
}
