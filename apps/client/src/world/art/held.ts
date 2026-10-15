import type { Box } from "./avatar-rig";

// What people carry, drawn in board units around its grip (0, 0): the hand
// holds it there and the rig moves it. A mug: its colour is the person's own
// (seeded), its coffee goes down sip by sip (level 0 empty … 4 full).

export const MUG_COLORS = ["#b5562f", "#efe4cc", "#6e7b3a", "#3d4a5c", "#e8a33d"];
export const HELD_BOX: Box = [-9, -14, 16, 18];
const INK = "#2a1430";

export function mugSvg(color: string, level: number): string {
  const lip = "#f7f0de";
  const stain = "#8a5a36";
  // the opening, seen from a little above: coffee nearer the rim the fuller it is
  const k = [0, 0.42, 0.62, 0.8, 0.94][Math.max(0, Math.min(4, level))];
  const coffee =
    level > 0
      ? `<ellipse cx="-1.5" cy="${-9.9 + (1 - k) * 0.9}" rx="${3.3 * k + 0.2}" ry="${1.2 * k + 0.1}" fill="#3b2416"/><ellipse cx="-2.4" cy="${-10.1 + (1 - k) * 0.9}" rx="${1.1 * k}" ry=".35" fill="#a8733f" opacity=".7"/>`
      : `<ellipse cx="-1.5" cy="-9.4" rx="2.6" ry=".7" fill="${stain}" opacity=".45"/>`;
  return (
    // handle on the grip side
    `<path d="M2.6 -7.6 Q6.6 -7.6 6.6 -4.4 Q6.6 -1.4 2.6 -1.6" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>` +
    `<path d="M2.6 -7.6 Q6.6 -7.6 6.6 -4.4 Q6.6 -1.4 2.6 -1.6" fill="none" stroke="${color}" stroke-width="1.3" stroke-linecap="round"/>` +
    // the body, a hard shade on its far side
    `<path d="M-5.6 -10 L-5.2 0.4 Q-1.5 2.2 2.2 0.4 L2.6 -10Z" fill="${color}" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>` +
    `<path d="M-0.6 -9.6 L2.6 -10 L2.2 0.4 Q0.8 1.1 -0.4 1.2Z" fill="#2a1a5e" opacity=".22"/>` +
    // the rim and what's inside
    `<ellipse cx="-1.5" cy="-10" rx="4.1" ry="1.6" fill="${lip}" stroke="${INK}" stroke-width=".9"/>${coffee}`
  );
}

// A paper cup of water from the cooler: the water's blue goes down.
export function cupSvg(level: number): string {
  const k = [0, 0.35, 0.6, 0.8, 0.95][Math.max(0, Math.min(4, level))];
  const water =
    level > 0
      ? `<ellipse cx="-1.4" cy="${-10.4 + (1 - k) * 0.8}" rx="${3.2 * k + 0.3}" ry="${1.1 * k + 0.1}" fill="#8fc0ea"/>`
      : "";
  return (
    `<path d="M-5.2 -10.6 L-3.6 0.6 Q-1.4 1.6 0.8 0.6 L2.4 -10.6Z" fill="#fffaf0" stroke="${INK}" stroke-width=".9" stroke-linejoin="round"/>` +
    `<path d="M-4.6 -6.6 L1.8 -6.6" stroke="#9cc4e6" stroke-width=".8"/>` +
    `<ellipse cx="-1.4" cy="-10.6" rx="3.8" ry="1.4" fill="#f4ecd8" stroke="${INK}" stroke-width=".9"/>${water}`
  );
}

// A can of soda in the person's colour, a ring-pull on top.
export function sodaSvg(color: string, level: number): string {
  return (
    `<path d="M-4.6 -11.4 L-4.6 0.4 Q-1.4 1.6 1.8 0.4 L1.8 -11.4Z" fill="${color}" stroke="${INK}" stroke-width=".9"/>` +
    `<path d="M-4.6 -5.6 L1.8 -5.6 L1.8 -3.4 L-4.6 -3.4Z" fill="#f7f0de" opacity=".85"/>` +
    `<path d="M-0.2 -11 L-0.2 0.6" stroke="#ffffff" stroke-width="1" opacity=".35"/>` +
    `<ellipse cx="-1.4" cy="-11.4" rx="3.2" ry="1.2" fill="#c8c2b4" stroke="${INK}" stroke-width=".8"/>` +
    (level < 4
      ? `<ellipse cx="-0.6" cy="-11.6" rx="1" ry=".5" fill="#2a2420"/>`
      : `<path d="M-2.6 -11.6 h2.4" stroke="#8d877a" stroke-width=".8"/>`)
  );
}

// A pet's toys in the hand (shared/held.ts): a ball, a frisbee, a rope, a
// feather on a stick, a laser pointer.
export function toySvg(kind: string): string {
  switch (kind) {
    case "ball":
      return (
        `<circle cx="-1.5" cy="-5.5" r="5.2" fill="#c4402b" stroke="${INK}" stroke-width=".9"/>` +
        `<path d="M-6.3 -7.2 Q-1.5 -4 3.3 -7.2" fill="none" stroke="#f7f0de" stroke-width="1.4"/>` +
        `<circle cx="-3.4" cy="-7.6" r="1.3" fill="#ffffff" opacity=".55"/>`
      );
    case "frisbee":
      return (
        `<ellipse cx="-1.5" cy="-6" rx="8" ry="3.2" fill="#e8a33d" stroke="${INK}" stroke-width=".9"/>` +
        `<ellipse cx="-1.5" cy="-6.6" rx="5.2" ry="1.7" fill="#f2b85a" stroke="#b5773f" stroke-width=".5"/>`
      );
    case "rope":
      return (
        `<path d="M-7 -3 Q-4 -9 -1 -4 T5 -5" fill="none" stroke="${INK}" stroke-width="3.6" stroke-linecap="round"/>` +
        `<path d="M-7 -3 Q-4 -9 -1 -4 T5 -5" fill="none" stroke="#d9b26a" stroke-width="2.2" stroke-linecap="round"/>` +
        `<circle cx="-7" cy="-3" r="2" fill="#b5562f" stroke="${INK}" stroke-width=".7"/><circle cx="5" cy="-5" r="2" fill="#b5562f" stroke="${INK}" stroke-width=".7"/>`
      );
    case "feather":
      return (
        `<path d="M-1.5 0 L-1.5 -7" stroke="${INK}" stroke-width="1.2"/>` +
        `<path d="M-1.5 -7 Q-6 -11 -2.5 -16 Q2 -11 -1.5 -7z" fill="#7a5c8a" stroke="${INK}" stroke-width=".8"/>` +
        `<path d="M-1.5 -7.5 L-2.2 -14.5" stroke="#4a3a5a" stroke-width=".6"/>`
      );
    case "laser":
      return (
        `<rect x="-3.2" y="-9" width="3.4" height="9.5" rx="1.4" fill="#3d4a5c" stroke="${INK}" stroke-width=".8"/>` +
        `<rect x="-3.2" y="-9" width="3.4" height="2" rx="1" fill="#8d877a"/>` +
        `<circle cx="-1.5" cy="-9.4" r="1" fill="#ff2d2d"/>`
      );
    default:
      return "";
  }
}

export function heldSvg(kind: string, color: string, level: number): string {
  switch (kind) {
    case "cup":
      return cupSvg(level);
    case "soda":
      return sodaSvg(color, level);
    case "ball":
    case "frisbee":
    case "rope":
    case "feather":
    case "laser":
      return toySvg(kind);
    default:
      return mugSvg(color, level);
  }
}
