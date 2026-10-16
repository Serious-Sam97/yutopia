import { CASES, isCase } from "@yutopia/shared/phone";
import type { Box } from "./avatar-rig";

const INK = "#2a1430";

// a case's colours (shared/phone.ts CASES): [body, highlight, shadow]
export const phoneColors = (id: string | undefined) => CASES[isCase(id) ? id : "walnut"];

// The phone (shared/phone.ts): the same object as the one on screen, small, in
// the hand, its case in the person's colour. Three faces, picked by the view
// (art/avatar-motion.ts phoneGrip): its back (the case, the camera bump, the
// orb), its screen (lit: Vortex Mobile's glass), and its edge.
export const PHONE_BOX: Box = [-6, -16, 12, 19];
export function phoneSvg(c: readonly [string, string, string], face: "screen" | "back" | "edge"): string {
  const [base, hi, lo] = c;
  const g = `<defs><linearGradient id="pc" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${hi}"/><stop offset=".45" stop-color="${base}"/><stop offset="1" stop-color="${lo}"/></linearGradient>`;
  if (face === "edge")
    return (
      `${g}</defs>` +
      `<rect x="-1.6" y="-14.2" width="3.4" height="14.6" rx="1.4" fill="url(#pc)" stroke="${INK}" stroke-width=".7"/>` +
      `<rect x="1.1" y="-13.4" width=".7" height="13" rx=".35" fill="#ff7ac8" opacity=".85"/>` +
      `<rect x="-2" y="-10.6" width=".6" height="2.4" rx=".3" fill="${lo}"/>`
    );
  if (face === "back")
    return (
      `${g}</defs>` +
      `<rect x="-4.2" y="-14.4" width="8.4" height="15" rx="1.9" fill="url(#pc)" stroke="${INK}" stroke-width=".75"/>` +
      // the camera bump: two lenses and the flash
      `<rect x="-3.4" y="-13.6" width="3.6" height="4.4" rx="1.1" fill="${lo}" stroke="${INK}" stroke-width=".4" opacity=".95"/>` +
      `<circle cx="-2.3" cy="-12.4" r=".85" fill="#141826" stroke="#000" stroke-width=".3"/><circle cx="-2.3" cy="-10.4" r=".85" fill="#141826" stroke="#000" stroke-width=".3"/>` +
      `<circle cx="-.7" cy="-11.4" r=".45" fill="#ffe9a8"/>` +
      // the orb, embossed
      `<circle cx="0" cy="-5.6" r="1.4" fill="none" stroke="#ffffff" stroke-width=".35" opacity=".35"/><circle cx="0" cy="-5.6" r=".5" fill="#ffffff" opacity=".3"/>` +
      `<path d="M-3.6 -13.6 L-3.6 -1" stroke="#ffffff" stroke-width=".5" opacity=".18"/>`
    );
  // the screen: Vortex Mobile, lit
  return (
    `${g}<linearGradient id="ps" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a0a5e"/><stop offset=".55" stop-color="#7a1f8a"/><stop offset="1" stop-color="#ff2d95"/></linearGradient></defs>` +
    `<rect x="-4.2" y="-14.4" width="8.4" height="15" rx="1.9" fill="url(#pc)" stroke="${INK}" stroke-width=".75"/>` +
    `<rect x="-3.5" y="-13.7" width="7" height="13.6" rx="1.4" fill="url(#ps)"/>` +
    `<circle cx="0" cy="-9.2" r="1.6" fill="#ffb3e0" opacity=".9"/><circle cx="0" cy="-9.2" r="2.6" fill="none" stroke="#00e5d0" stroke-width=".35" opacity=".8"/>` +
    `<g fill="#ffffff" opacity=".7"><rect x="-2.6" y="-5.6" width="1.3" height="1.3" rx=".35"/><rect x="-.65" y="-5.6" width="1.3" height="1.3" rx=".35"/><rect x="1.3" y="-5.6" width="1.3" height="1.3" rx=".35"/><rect x="-2.6" y="-3.6" width="1.3" height="1.3" rx=".35"/><rect x="-.65" y="-3.6" width="1.3" height="1.3" rx=".35"/><rect x="1.3" y="-3.6" width="1.3" height="1.3" rx=".35"/></g>` +
    `<path d="M-3.2 -13.4 L-1 -13.4 L-3.2 -8" fill="#ffffff" opacity=".18"/>`
  );
}
