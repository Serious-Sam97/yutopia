import { BOOT_LOGO_MS, BOOT_POST_MS, type ComputerView, type Era, SHUTDOWN_MS } from "@yutopia/shared/computer";

// What a computer's glass shows while someone uses it (docs/plan/19-vortexos.md):
// a drawing of VortexOS from what its user's OS tells the world — the phase,
// the era, the app in front — not the OS's own pixels (a page can't be drawn
// into a canvas). Everything here is canvas 2D on a 320 × 240 picture; `t` is
// ms since the phase began, so every client draws the same moment.

export const OS_W = 320;
export const OS_H = 240;

type G = CanvasRenderingContext2D;

// ── each era's look ─────────────────────────────────────────────────────────
interface Chrome {
  classic: boolean; // the grey bevelled 9x controls
  face: string;
  title: [string, string]; // active title bar (gradient ends)
  titleText: string;
  bar: [string, string]; // taskbar
  barText: string;
  start: string; // the Start button's face ("" = the face colour)
  startText: string;
  frame: string; // a window's frame
  body: string; // a window's body
  round: number; // title-bar corners
}
const CLASSIC: Chrome = {
  classic: true,
  face: "#c0c0c0",
  title: ["#000080", "#1084d0"],
  titleText: "#ffffff",
  bar: ["#c0c0c0", "#c0c0c0"],
  barText: "#000000",
  start: "",
  startText: "#000000",
  frame: "#c0c0c0",
  body: "#ffffff",
  round: 0,
};
const CHROME: Record<Era, Chrome> = {
  dos: CLASSIC,
  win95: { ...CLASSIC, title: ["#000080", "#000080"] },
  nt4: { ...CLASSIC, title: ["#000080", "#000080"] },
  win98: CLASSIC,
  win2000: {
    ...CLASSIC,
    face: "#d4d0c8",
    frame: "#d4d0c8",
    bar: ["#d4d0c8", "#d4d0c8"],
    title: ["#0a246a", "#a6caf0"],
  },
  winxp: {
    classic: false,
    face: "#ece9d8",
    title: ["#0a5fe0", "#3d95ff"],
    titleText: "#ffffff",
    bar: ["#245edb", "#3f8cf3"],
    barText: "#ffffff",
    start: "#3c9a3c",
    startText: "#ffffff",
    frame: "#0b5ad8",
    body: "#ffffff",
    round: 6,
  },
  vista: {
    classic: false,
    face: "#f0f0f0",
    title: ["#6d97b4", "#a9c6dc"],
    titleText: "#0f1d2a",
    bar: ["#0c1418", "#26333b"],
    barText: "#ffffff",
    start: "#2b8a4b",
    startText: "#ffffff",
    frame: "#8eb2cc",
    body: "#ffffff",
    round: 6,
  },
  win7: {
    classic: false,
    face: "#f0f0f0",
    title: ["#9cc2e5", "#c9def0"],
    titleText: "#13283d",
    bar: ["#17324f", "#2c5578"],
    barText: "#ffffff",
    start: "#2f74b8",
    startText: "#ffffff",
    frame: "#a9c8e4",
    body: "#ffffff",
    round: 6,
  },
  vortex: {
    classic: false,
    face: "#1a0533",
    title: ["#ff2d95", "#7a3cff"],
    titleText: "#ffffff",
    bar: ["#12022a", "#24064a"],
    barText: "#00e5d0",
    start: "#ff2d95",
    startText: "#ffffff",
    frame: "#7a3cff",
    body: "#0d0220",
    round: 4,
  },
};

const ERA_NAME: Record<Era, string> = {
  dos: "MS-DOS mode",
  nt4: "NT Workstation",
  win95: "95",
  win98: "98",
  win2000: "2000 Professional",
  winxp: "XP · Luna",
  vista: "Vista · Aero",
  win7: "7",
  vortex: "Future",
};

// ── small pieces ────────────────────────────────────────────────────────────
function vgrad(g: G, x: number, y: number, h: number, a: string, b: string) {
  const gr = g.createLinearGradient(x, y, x, y + h);
  gr.addColorStop(0, a);
  gr.addColorStop(1, b);
  return gr;
}
function hgrad(g: G, x: number, w: number, a: string, b: string) {
  const gr = g.createLinearGradient(x, 0, x + w, 0);
  gr.addColorStop(0, a);
  gr.addColorStop(1, b);
  return gr;
}
function rrect(g: G, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}
// a raised 9x bevel
function bevel(g: G, x: number, y: number, w: number, h: number, face: string, sunk = false) {
  g.fillStyle = face;
  g.fillRect(x, y, w, h);
  g.fillStyle = sunk ? "#808080" : "#ffffff";
  g.fillRect(x, y, w, 1);
  g.fillRect(x, y, 1, h);
  g.fillStyle = sunk ? "#ffffff" : "#404040";
  g.fillRect(x, y + h - 1, w, 1);
  g.fillRect(x + w - 1, y, 1, h);
}
function text(
  g: G,
  s: string,
  x: number,
  y: number,
  size: number,
  color: string,
  weight = "normal",
  align: CanvasTextAlign = "left",
) {
  g.font = `${weight} ${size}px Tahoma, Verdana, "Segoe UI", sans-serif`;
  g.fillStyle = color;
  g.textAlign = align;
  g.textBaseline = "alphabetic";
  g.fillText(s, x, y);
}
function mono(g: G, s: string, x: number, y: number, size: number, color: string) {
  g.font = `${size}px "Courier New", ui-monospace, monospace`;
  g.fillStyle = color;
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  g.fillText(s, x, y);
}
// a short wordmark: the VortexOS swirl and its name in the era's colours
function swirl(g: G, cx: number, cy: number, r: number, color: string, turn: number) {
  g.save();
  g.translate(cx, cy);
  g.rotate(turn);
  g.lineCap = "round";
  for (let i = 0; i < 3; i++) {
    g.strokeStyle = color;
    g.globalAlpha = 1 - i * 0.25;
    g.lineWidth = r * (0.32 - i * 0.07);
    g.beginPath();
    g.arc(0, 0, r * (1 - i * 0.28), i * 1.9, i * 1.9 + Math.PI * 1.35);
    g.stroke();
  }
  g.globalAlpha = 1;
  g.fillStyle = color;
  g.beginPath();
  g.arc(0, 0, r * 0.16, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

// ── the wallpaper ───────────────────────────────────────────────────────────
function wallpaper(g: G, era: Era, t: number) {
  const W = OS_W;
  const H = OS_H;
  switch (era) {
    case "winxp": {
      // a summer sky over a green hill
      g.fillStyle = vgrad(g, 0, 0, H * 0.7, "#2f7fe0", "#b9dcff");
      g.fillRect(0, 0, W, H);
      g.fillStyle = "rgba(255,255,255,0.75)";
      for (const [x, y, s] of [
        [60, 40, 1],
        [210, 28, 1.3],
        [270, 70, 0.8],
      ] as const) {
        g.beginPath();
        g.ellipse(x, y, 26 * s, 8 * s, 0, 0, Math.PI * 2);
        g.ellipse(x + 14 * s, y - 5 * s, 16 * s, 8 * s, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = vgrad(g, 0, H * 0.55, H * 0.45, "#62b83a", "#2f7d1d");
      g.beginPath();
      g.moveTo(0, H * 0.72);
      g.quadraticCurveTo(W * 0.35, H * 0.46, W, H * 0.62);
      g.lineTo(W, H);
      g.lineTo(0, H);
      g.fill();
      return;
    }
    case "vista":
    case "win7": {
      g.fillStyle = era === "vista" ? vgrad(g, 0, 0, H, "#0b2f3d", "#12584f") : vgrad(g, 0, 0, H, "#0f4c8f", "#2b8ae0");
      g.fillRect(0, 0, W, H);
      // soft light swooshes
      for (let i = 0; i < 4; i++) {
        g.strokeStyle = `rgba(255,255,255,${0.08 + i * 0.03})`;
        g.lineWidth = 10 - i * 2;
        g.beginPath();
        g.moveTo(-20, H * (0.75 - i * 0.08));
        g.bezierCurveTo(W * 0.3, H * (0.3 + i * 0.05), W * 0.6, H * (0.95 - i * 0.1), W + 20, H * (0.35 + i * 0.06));
        g.stroke();
      }
      return;
    }
    case "vortex": {
      g.fillStyle = vgrad(g, 0, 0, H, "#14012b", "#2a0a4a");
      g.fillRect(0, 0, W, H);
      // a sunset and its grid, scrolling toward you
      const sun = g.createLinearGradient(0, 40, 0, 120);
      sun.addColorStop(0, "#ffd36b");
      sun.addColorStop(1, "#ff2d95");
      g.fillStyle = sun;
      g.beginPath();
      g.arc(W / 2, 112, 42, Math.PI, 0);
      g.fill();
      const hz = 112;
      g.strokeStyle = "rgba(0,229,208,0.55)";
      g.lineWidth = 1;
      for (let i = -8; i <= 8; i++) {
        g.beginPath();
        g.moveTo(W / 2 + i * 6, hz);
        g.lineTo(W / 2 + i * 60, H);
        g.stroke();
      }
      const s = (t / 900) % 1;
      for (let i = 0; i < 7; i++) {
        const y = hz + ((i + s) / 7) ** 2 * (H - hz);
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(W, y);
        g.stroke();
      }
      return;
    }
    case "win2000":
      g.fillStyle = "#3a6ea5";
      g.fillRect(0, 0, W, H);
      return;
    default:
      g.fillStyle = "#008080";
      g.fillRect(0, 0, W, H);
  }
}

// ── a window, with what the app looks like inside ───────────────────────────
function appBody(g: G, app: string, x: number, y: number, w: number, h: number, c: Chrome, t: number) {
  const a = app.toLowerCase();
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  if (/doom|quake|diablo|counter|strike|tomb|persia|sword|half|xash/.test(a)) {
    // a game: a dark corridor, a hand with a gun, a status bar
    g.fillStyle = vgrad(g, x, y, h, "#3a2a1a", "#120c08");
    g.fillRect(x, y, w, h);
    g.fillStyle = "#5c4630";
    g.beginPath();
    g.moveTo(x, y + h * 0.75);
    g.lineTo(x + w * 0.38, y + h * 0.42);
    g.lineTo(x + w * 0.62, y + h * 0.42);
    g.lineTo(x + w, y + h * 0.75);
    g.lineTo(x + w, y + h);
    g.lineTo(x, y + h);
    g.fill();
    g.fillStyle = Math.sin(t / 90) > 0.6 ? "#ffcf5a" : "#b33";
    g.fillRect(x + w * 0.47, y + h * 0.48, w * 0.06, h * 0.12);
    g.fillStyle = "#777";
    g.fillRect(x + w * 0.46, y + h * 0.66, w * 0.08, h * 0.18);
    g.fillStyle = "#5a5a5a";
    g.fillRect(x, y + h - 9, w, 9);
    g.fillStyle = "#c33";
    g.fillRect(x + 4, y + h - 7, 16, 5);
  } else if (/terminal|command|shell|dos|bbs/.test(a)) {
    g.fillStyle = "#000";
    g.fillRect(x, y, w, h);
    const lines = ["$ ls /home", "Desktop  Documents", "$ uname -a", "VortexOS 4.13", "$ "];
    for (let i = 0; i < lines.length; i++) mono(g, lines[i], x + 4, y + 11 + i * 10, 9, "#3ad14a");
    if (Math.floor(t / 500) % 2) {
      g.fillStyle = "#3ad14a";
      g.fillRect(x + 16, y + 44, 6, 8);
    }
  } else if (/paint/.test(a)) {
    g.fillStyle = "#fff";
    g.fillRect(x, y, w, h);
    const pal = ["#000", "#808080", "#800000", "#ff0000", "#ffff00", "#00ff00", "#00ffff", "#0000ff", "#ff00ff"];
    pal.forEach((col, i) => {
      g.fillStyle = col;
      g.fillRect(x + 3 + i * 9, y + h - 10, 8, 7);
    });
    g.strokeStyle = "#e0242c";
    g.lineWidth = 3;
    g.beginPath();
    for (let i = 0; i <= 20; i++) {
      const px = x + 12 + i * ((w - 24) / 20);
      const py = y + h * 0.42 + Math.sin(i * 0.6 + t / 600) * 12;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.stroke();
    g.fillStyle = "#2a62d8";
    g.beginPath();
    g.arc(x + w * 0.72, y + h * 0.3, 10, 0, Math.PI * 2);
    g.fill();
  } else if (/mine/.test(a)) {
    g.fillStyle = c.face;
    g.fillRect(x, y, w, h);
    const n = 9;
    const s = Math.min((w - 8) / n, (h - 8) / n);
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const open = (i * 7 + j * 3) % 5 < 2;
        if (open) {
          g.fillStyle = "#bdbdbd";
          g.fillRect(x + 4 + i * s, y + 4 + j * s, s - 1, s - 1);
        } else bevel(g, x + 4 + i * s, y + 4 + j * s, s - 1, s - 1, "#c0c0c0");
      }
  } else if (/messenger|chat|lounge|mail/.test(a)) {
    g.fillStyle = "#fff";
    g.fillRect(x, y, w, h);
    const people = ["neo", "trinity", "m.vex", "the dj"];
    people.forEach((p, i) => {
      g.fillStyle = i === 2 ? "#e0a000" : "#2fa52f";
      g.beginPath();
      g.arc(x + 10, y + 12 + i * 14, 3.5, 0, Math.PI * 2);
      g.fill();
      text(g, p, x + 18, y + 15 + i * 14, 9, "#123");
    });
  } else {
    // a document: lines of text and a blinking caret
    g.fillStyle = c.body;
    g.fillRect(x, y, w, h);
    const ink = c.body === "#0d0220" ? "rgba(0,229,208,0.45)" : "rgba(30,30,40,0.45)";
    for (let i = 0; i < Math.floor((h - 8) / 9); i++) {
      g.fillStyle = ink;
      g.fillRect(x + 6, y + 7 + i * 9, (w - 12) * (0.5 + 0.45 * Math.abs(Math.sin(i * 2.3 + 1))), 3);
    }
    if (Math.floor(t / 500) % 2) {
      g.fillStyle = c.body === "#0d0220" ? "#00e5d0" : "#000";
      g.fillRect(x + 6 + (w - 12) * 0.62, y + 7 + 9 * 3, 1.5, 5);
    }
  }
  g.restore();
}

function windowAt(g: G, c: Chrome, title: string, app: string, x: number, y: number, w: number, h: number, t: number) {
  const th = 14;
  if (c.classic) {
    bevel(g, x, y, w, h, c.frame);
    g.fillStyle = hgrad(g, x + 3, w - 6, c.title[0], c.title[1]);
    g.fillRect(x + 3, y + 3, w - 6, th - 2);
    text(g, title, x + 7, y + 13, 9, c.titleText, "bold");
    for (let i = 0; i < 3; i++) bevel(g, x + w - 14 - i * 12, y + 4, 11, 9, c.face);
    appBody(g, app, x + 4, y + th + 3, w - 8, h - th - 7, c, t);
    return;
  }
  // XP and later: a coloured frame, rounded title bar, round buttons
  rrect(g, x, y, w, h, c.round);
  g.fillStyle = c.frame;
  g.fill();
  rrect(g, x, y, w, th + 3, c.round);
  g.fillStyle = vgrad(g, x, y, th + 3, c.title[1], c.title[0]);
  g.fill();
  text(g, title, x + 8, y + 12, 9, c.titleText, "bold");
  g.fillStyle = "#d9442c";
  rrect(g, x + w - 15, y + 3, 11, 10, 3);
  g.fill();
  g.fillStyle = "rgba(255,255,255,0.85)";
  rrect(g, x + w - 28, y + 3, 11, 10, 3);
  g.fill();
  appBody(g, app, x + 3, y + th + 3, w - 6, h - th - 6, c, t);
}

function taskbar(g: G, era: Era, c: Chrome, app: string, now: Date) {
  const W = OS_W;
  const H = OS_H;
  const bh = 18;
  const y = H - bh;
  if (c.classic) {
    bevel(g, 0, y, W, bh, c.face);
    bevel(g, 2, y + 2, 44, bh - 4, c.face);
    swirl(g, 10, y + bh / 2, 4.5, "#000080", 0.5);
    text(g, "Start", 17, y + 13, 9, "#000", "bold");
    if (app) {
      bevel(g, 50, y + 2, 92, bh - 4, "#d4d4d4", true);
      text(g, app.slice(0, 16), 56, y + 13, 9, "#000");
    }
    bevel(g, W - 46, y + 2, 44, bh - 4, c.face, true);
  } else {
    g.fillStyle = vgrad(g, 0, y, bh, c.bar[1], c.bar[0]);
    g.fillRect(0, y, W, bh);
    if (era === "vortex") {
      g.fillStyle = "#ff2d95";
      g.fillRect(0, y, W, 1);
    }
    if (era === "winxp") {
      rrect(g, 0, y, 52, bh, 8);
      g.fillStyle = vgrad(g, 0, y, bh, "#57b857", c.start);
      g.fill();
      text(g, "start", 10, y + 13, 10, c.startText, "bold italic");
    } else {
      g.fillStyle = c.start;
      g.beginPath();
      g.arc(12, y + bh / 2, 7, 0, Math.PI * 2);
      g.fill();
      swirl(g, 12, y + bh / 2, 4, "#ffffff", 0.5);
    }
    if (app) {
      rrect(g, 60, y + 2, 92, bh - 4, 3);
      g.fillStyle = "rgba(255,255,255,0.18)";
      g.fill();
      text(g, app.slice(0, 16), 66, y + 13, 9, c.barText);
    }
  }
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  text(g, `${hh}:${mm}`, W - 10, y + 13, 9, c.classic ? "#000" : c.barText, "normal", "right");
}

function icons(g: G, era: Era) {
  const label = era === "vortex" ? "#00e5d0" : "#ffffff";
  const cols = ["#f4d35e", "#3f8cf3", "#9aa", "#e9603a"];
  for (let i = 0; i < 4; i++) {
    const y = 8 + i * 30;
    g.fillStyle = cols[i];
    g.fillRect(12, y, 16, 13);
    g.strokeStyle = "rgba(0,0,0,0.5)";
    g.lineWidth = 1;
    g.strokeRect(12.5, y + 0.5, 15, 12);
    g.fillStyle = label;
    g.fillRect(9, y + 17, 22, 3);
  }
}

function cursor(g: G, x: number, y: number) {
  g.fillStyle = "#fff";
  g.strokeStyle = "#000";
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(x, y);
  g.lineTo(x, y + 11);
  g.lineTo(x + 3, y + 8);
  g.lineTo(x + 7, y + 8);
  g.closePath();
  g.fill();
  g.stroke();
}

// ── the phases ──────────────────────────────────────────────────────────────
const POST = [
  "VortexOS BIOS v4.13  (C) 1984-1989 M. Vex",
  "",
  "CPU: Vortex 80486DX @ 33 MHz",
  "Memory Test: 65536K OK",
  "",
  "Detecting IDE drives... C: VORTEX-HD 1.2GB",
  "Detecting floppy....... A: 1.44MB",
  "Tape unit.............. REEL 0 [ok]",
  "",
  "Starting VortexOS ...",
];

function boot(g: G, v: ComputerView, t: number) {
  g.fillStyle = "#000";
  g.fillRect(0, 0, OS_W, OS_H);
  if (t < BOOT_POST_MS) {
    const n = Math.min(POST.length, Math.floor(t / (BOOT_POST_MS / POST.length)) + 1);
    for (let i = 0; i < n; i++) mono(g, POST[i], 10, 20 + i * 13, 10, i === 0 ? "#ffffff" : "#c8c8c8");
    if (Math.floor(t / 300) % 2) {
      g.fillStyle = "#c8c8c8";
      g.fillRect(10, 20 + n * 13 - 9, 7, 10);
    }
    return;
  }
  // the logo, its bar filling; past it (no word from the OS yet): still starting
  const lt = t - BOOT_POST_MS;
  const c = CHROME[v.era];
  const mark = v.era === "vortex" ? "#ff2d95" : v.era === "dos" ? "#c8c8c8" : "#5cb9ff";
  swirl(g, OS_W / 2, 84, 22, mark, lt / 500);
  g.font = `bold 26px Tahoma, Verdana, "Segoe UI", sans-serif`;
  g.textAlign = "center";
  g.fillStyle = hgrad(g, OS_W / 2 - 70, 140, mark, "#ffffff");
  g.fillText("VortexOS", OS_W / 2, 140);
  text(g, ERA_NAME[v.era], OS_W / 2, 156, 10, "#9fb6d8", "normal", "center");
  const bw = 90;
  const bx = (OS_W - bw) / 2;
  rrect(g, bx, 176, bw, 8, 3);
  g.fillStyle = "#111";
  g.fill();
  g.strokeStyle = "#333";
  g.stroke();
  const k = lt < BOOT_LOGO_MS ? lt / BOOT_LOGO_MS : 1;
  const block = (Math.floor(lt / 90) % 14) * (bw / 14);
  g.fillStyle = c.classic ? "#1084d0" : mark;
  if (k < 1) g.fillRect(bx + 1, 177, (bw - 2) * k, 6);
  else for (let i = 0; i < 3; i++) g.fillRect(bx + 1 + ((block + i * 7) % (bw - 8)), 177, 5, 6);
  text(g, "a creation by Serious Sam", OS_W / 2, 206, 9, "#6a86b0", "normal", "center");
}

function login(g: G, v: ComputerView, t: number) {
  const W = OS_W;
  const H = OS_H;
  const era = v.era;
  if (era === "dos") {
    g.fillStyle = "#000";
    g.fillRect(0, 0, W, H);
    mono(g, "VortexOS network logon", 10, 24, 10, "#c8c8c8");
    mono(g, `login: ${Math.floor(t / 500) % 2 ? "_" : ""}`, 10, 44, 10, "#c8c8c8");
    return;
  }
  if (era === "winxp") {
    g.fillStyle = vgrad(g, 0, 0, H, "#5a7edc", "#3b62c7");
    g.fillRect(0, 0, W, H);
    g.fillStyle = "#00309c";
    g.fillRect(0, 0, W, 28);
    g.fillRect(0, H - 28, W, 28);
    g.fillStyle = "#f8a548";
    g.fillRect(0, 28, W, 1);
    g.fillRect(0, H - 29, W, 1);
    g.fillStyle = "rgba(255,255,255,0.35)";
    g.fillRect(W / 2, 50, 1, H - 100);
    swirl(g, 92, 100, 16, "#ffffff", 0.4);
    text(g, "VortexOS", 92, 136, 16, "#ffffff", "bold", "center");
    text(g, "To begin, click your user name", 92, 152, 8, "#dce6ff", "normal", "center");
    rrect(g, W / 2 + 18, 86, 26, 26, 4);
    g.fillStyle = "#f8a548";
    g.fill();
    text(g, v.name || "User", W / 2 + 52, 104, 11, "#ffffff", "bold");
    return;
  }
  if (era === "vista" || era === "win7" || era === "vortex") {
    wallpaper(g, era, t);
    g.fillStyle = "rgba(0,0,0,0.25)";
    g.fillRect(0, 0, W, H);
    rrect(g, W / 2 - 24, 64, 48, 48, 10);
    g.fillStyle = era === "vortex" ? "#ff2d95" : "rgba(255,255,255,0.85)";
    g.fill();
    swirl(g, W / 2, 88, 14, era === "vortex" ? "#ffffff" : "#2b6aa8", 0.4);
    text(g, v.name || "User", W / 2, 132, 12, "#ffffff", "bold", "center");
    rrect(g, W / 2 - 50, 142, 100, 14, 3);
    g.fillStyle = "rgba(255,255,255,0.92)";
    g.fill();
    text(g, "Password", W / 2 - 44, 152, 8, "#888");
    return;
  }
  // the 9x / NT / 2000 eras: the clouds and the grey dialog
  g.fillStyle = vgrad(g, 0, 0, H, "#5b8fc9", "#a9c8ea");
  g.fillRect(0, 0, W, H);
  g.fillStyle = "rgba(255,255,255,0.7)";
  for (const [x, y, s] of [
    [40, 50, 1.4],
    [250, 40, 1.1],
    [80, 190, 1.2],
    [270, 200, 1.5],
    [170, 120, 0.9],
  ] as const) {
    g.beginPath();
    g.ellipse(x, y, 34 * s, 11 * s, 0, 0, Math.PI * 2);
    g.ellipse(x + 18 * s, y - 7 * s, 20 * s, 10 * s, 0, 0, Math.PI * 2);
    g.fill();
  }
  const c = CHROME[era];
  const dx = 70;
  const dy = 78;
  bevel(g, dx, dy, 180, 82, c.face);
  g.fillStyle = hgrad(g, dx + 3, 174, c.title[0], c.title[1]);
  g.fillRect(dx + 3, dy + 3, 174, 12);
  text(g, "Enter Network Password", dx + 7, dy + 12, 8, "#fff", "bold");
  text(g, "User name:", dx + 8, dy + 34, 8, "#000");
  bevel(g, dx + 62, dy + 25, 108, 12, "#fff", true);
  text(g, v.name.slice(0, 18), dx + 65, dy + 34, 8, "#000");
  text(g, "Password:", dx + 8, dy + 52, 8, "#000");
  bevel(g, dx + 62, dy + 43, 108, 12, "#fff", true);
  const stars = Math.min(8, Math.floor(t / 260) % 12);
  text(g, "*".repeat(stars), dx + 65, dy + 53, 9, "#000");
  bevel(g, dx + 98, dy + 62, 34, 14, c.face);
  text(g, "OK", dx + 115, dy + 72, 8, "#000", "normal", "center");
  bevel(g, dx + 136, dy + 62, 36, 14, c.face);
}

function desktop(g: G, v: ComputerView, t: number, now: Date) {
  const c = CHROME[v.era];
  if (v.era === "dos") {
    g.fillStyle = "#000";
    g.fillRect(0, 0, OS_W, OS_H);
    mono(g, "C:\\VORTEX>", 10, 24, 10, "#c8c8c8");
    if (v.app) mono(g, `C:\\VORTEX>${v.app.toUpperCase().slice(0, 18)}`, 10, 38, 10, "#c8c8c8");
    if (Math.floor(t / 400) % 2) {
      g.fillStyle = "#c8c8c8";
      g.fillRect(10, v.app ? 42 : 28, 7, 2);
    }
    return;
  }
  wallpaper(g, v.era, t);
  icons(g, v.era);
  if (v.app) windowAt(g, c, v.app, v.app, 52, 22, 216, 170, t);
  taskbar(g, v.era, c, v.app, now);
  // the pointer drifting a little (someone's on it)
  const px = 170 + 30 * Math.sin(t / 1700) + 8 * Math.sin(t / 430);
  const py = 120 + 22 * Math.sin(t / 2300 + 1) + 5 * Math.cos(t / 510);
  cursor(g, px, py);
}

function saver(g: G, v: ComputerView, t: number) {
  const W = OS_W;
  const H = OS_H;
  g.fillStyle = "#000";
  g.fillRect(0, 0, W, H);
  if (v.era === "winxp" || v.era === "vortex") {
    // mystify: two bouncing quadrilaterals with trails
    for (let k = 0; k < 2; k++)
      for (let trail = 0; trail < 6; trail++) {
        const tt = t / 1000 - trail * 0.06;
        g.strokeStyle = k ? `rgba(255,80,200,${1 - trail / 6})` : `rgba(80,200,255,${1 - trail / 6})`;
        g.lineWidth = 1;
        g.beginPath();
        for (let i = 0; i < 4; i++) {
          const x = W / 2 + Math.sin(tt * (0.9 + i * 0.37 + k * 0.2) + i * 2) * (W / 2 - 10);
          const y = H / 2 + Math.cos(tt * (0.7 + i * 0.29 + k * 0.3) + i) * (H / 2 - 10);
          if (i === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.closePath();
        g.stroke();
      }
    return;
  }
  if (v.era === "vista" || v.era === "win7") {
    // bubbles drifting up
    for (let i = 0; i < 9; i++) {
      const y = (H + 30 - ((t / 30 + i * 47) % (H + 60))) | 0;
      const x = (i * 37 + 20 * Math.sin(t / 900 + i)) % W;
      const r = 10 + (i % 4) * 5;
      const gr = g.createRadialGradient(x - r / 3, y - r / 3, 1, x, y, r);
      gr.addColorStop(0, "rgba(255,255,255,0.7)");
      gr.addColorStop(1, `hsla(${(i * 40) % 360},80%,60%,0.25)`);
      g.fillStyle = gr;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    return;
  }
  // a starfield, flying in
  for (let i = 0; i < 70; i++) {
    const seed = (i * 9301 + 49297) % 233280;
    const a = (seed / 233280) * Math.PI * 2;
    const z = ((t / 1600 + i / 70) % 1) ** 2;
    const d = z * W * 0.75;
    const x = W / 2 + Math.cos(a) * d;
    const y = H / 2 + Math.sin(a) * d * 0.8;
    const s = 0.6 + z * 2.2;
    g.fillStyle = `rgba(255,255,255,${0.3 + z * 0.7})`;
    g.fillRect(x, y, s, s);
  }
}

function shutdown(g: G, v: ComputerView, t: number) {
  const W = OS_W;
  const H = OS_H;
  const classic = CHROME[v.era].classic;
  if (t < SHUTDOWN_MS * 0.5 || !classic) {
    g.fillStyle = v.era === "winxp" ? vgrad(g, 0, 0, H, "#5a7edc", "#3b62c7") : v.era === "vortex" ? "#14012b" : "#000";
    g.fillRect(0, 0, W, H);
    swirl(g, W / 2, 100, 16, v.era === "vortex" ? "#ff2d95" : "#ffffff", t / 300);
    text(
      g,
      t < SHUTDOWN_MS * 0.5 ? "Saving your settings..." : "Shutting down...",
      W / 2,
      142,
      11,
      "#ffffff",
      "normal",
      "center",
    );
    return;
  }
  // the 9x classic: safe to turn off
  g.fillStyle = "#000";
  g.fillRect(0, 0, W, H);
  g.font = `bold 15px Tahoma, Verdana, sans-serif`;
  g.textAlign = "center";
  g.fillStyle = "#ff8c1a";
  g.fillText("It's now safe to turn off", W / 2, 112);
  g.fillText("your computer.", W / 2, 132);
}

// Draws one computer's picture at time `now` (ms, server-ish clock).
export function paintOs(g: G, v: ComputerView, now: number) {
  const t = Math.max(0, now - v.since);
  g.save();
  g.globalAlpha = 1;
  switch (v.phase) {
    case "boot":
      boot(g, v, t);
      break;
    case "login":
      login(g, v, t);
      break;
    case "desktop":
      desktop(g, v, t, new Date(now));
      break;
    case "saver":
      saver(g, v, t);
      break;
    case "shutdown":
      shutdown(g, v, t);
      break;
  }
  g.restore();
  // the tube: scanlines and a soft vignette
  g.fillStyle = "rgba(0,0,0,0.13)";
  for (let y = 0; y < OS_H; y += 3) g.fillRect(0, y, OS_W, 1);
  const vg = g.createRadialGradient(OS_W / 2, OS_H / 2, OS_H * 0.35, OS_W / 2, OS_H / 2, OS_W * 0.62);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.42)");
  g.fillStyle = vg;
  g.fillRect(0, 0, OS_W, OS_H);
}

// A CRT warming up (k 0 → 1: a bright line opening into the picture) or
// collapsing (k 0 → 1: the picture to a line, the line to a dot).
export function paintTube(g: G, k: number, opening: boolean) {
  g.fillStyle = "#000";
  g.fillRect(0, 0, OS_W, OS_H);
  const cx = OS_W / 2;
  const cy = OS_H / 2;
  if (opening) {
    const h = Math.max(2, OS_H * k * k);
    g.fillStyle = `rgba(230,240,255,${0.9 - 0.5 * k})`;
    g.fillRect(0, cy - h / 2, OS_W, h);
    return;
  }
  if (k < 0.55) {
    const h = Math.max(2, OS_H * (1 - k / 0.55) ** 2);
    g.fillStyle = "rgba(230,240,255,0.9)";
    g.fillRect(0, cy - h / 2, OS_W, h);
  } else {
    const r = Math.max(0.5, 6 * (1 - (k - 0.55) / 0.45));
    g.fillStyle = "rgba(240,248,255,0.95)";
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
  }
}
