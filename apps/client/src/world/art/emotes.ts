import type { Emote } from "@yutopia/shared";

// Emotes drawn by the same hand as the people and items: a cream speech-bubble
// token (warm ink outline, light from the upper-left) holding a small
// illustration in the studio palette. One drawing for the world (a texture over
// someone's head) and the HUD (the emote menu).
const INK = "#2a1a12";
const ink = (w: number) => `stroke="${INK}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
const O = ink(2);
const THIN = `stroke="${INK}" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"`;
const SKIN = ["#f0c193", "#d99a68"]; // light, shade

// a hand, palm facing out, fingers up; drawn around (0, 0), ~26 px tall
function hand(fill = SKIN[0], shade = SKIN[1]) {
  const finger = (x: number, top: number, w = 5.2) =>
    `<rect x="${x}" y="${top}" width="${w}" height="${16 - top}" rx="${w / 2}" fill="${fill}" ${THIN}/>`;
  return `
    <path d="M-9 4 L-15 -3 Q-17.5 -6 -14.5 -7.6 Q-12 -8.6 -9.6 -5.6 L-6 -1" fill="${fill}" ${THIN}/>
    ${finger(-8.6, -13)}${finger(-3.2, -16)}${finger(2.2, -15)}${finger(7.4, -11, 4.8)}
    <path d="M-9 -2 H12 V6 Q12 13 4.5 14.5 H-2 Q-9.5 13.5 -9.6 6 Z" fill="${fill}" ${THIN}/>
    <path d="M6 1 Q11 2 11.4 6.5 Q11 12 5 13.6" fill="none" stroke="${shade}" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M-5.6 -11 v3 M-0.4 -14 v3 M4.8 -13 v3" stroke="#fff6e3" stroke-width="1.2" stroke-linecap="round" opacity=".7"/>`;
}

const ART: Record<Emote, string> = {
  wave: `
    <g transform="translate(32 27) rotate(-14)">${hand()}</g>
    <path d="M13 15 q-3 5 0 10 M9 13 q-4 7 0 14" fill="none" stroke="#e8952d" stroke-width="2" stroke-linecap="round"/>
    <path d="M51 15 q3 5 0 10" fill="none" stroke="#e8952d" stroke-width="2" stroke-linecap="round"/>`,
  heart: `
    <path d="M32 44 C18 35 12 28 12 20.5 C12 14 17 10 22.5 10 C27 10 30 12.5 32 16 C34 12.5 37 10 41.5 10 C47 10 52 14 52 20.5 C52 28 46 35 32 44 Z"
      fill="url(#g-heart)" ${O}/>
    <path d="M18 18.5 Q19 14 23.5 13.6" fill="none" stroke="#ffe2cf" stroke-width="2.6" stroke-linecap="round" opacity=".85"/>
    <circle cx="17.5" cy="23" r="1.4" fill="#ffe2cf" opacity=".8"/>`,
  laugh: `
    <circle cx="32" cy="26" r="17" fill="url(#g-amber)" ${O}/>
    <path d="M22.5 22 q3.5 -4 7 0 M34.5 22 q3.5 -4 7 0" fill="none" ${O}/>
    <path d="M22 28.5 H42 Q41 39.5 32 39.5 Q23 39.5 22 28.5 Z" fill="#5b1f14" ${O}/>
    <path d="M26.5 35.5 Q32 32.5 37.5 35.5 Q35 39 32 39 Q29 39 26.5 35.5 Z" fill="#c4402b"/>
    <path d="M23.5 29.6 H40.5" stroke="#fff6e3" stroke-width="2" stroke-linecap="round"/>
    <path d="M17 24 q-3.5 4.5 -1 7.5 q2.6 1 3.6 -2 q.4 -3 -2.6 -5.5 Z" fill="#9fc0d8" ${THIN}/>
    <path d="M47 24 q3.5 4.5 1 7.5 q-2.6 1 -3.6 -2 q-.4 -3 2.6 -5.5 Z" fill="#9fc0d8" ${THIN}/>
    <path d="M22.5 15.5 Q26 11.6 31 11.4" fill="none" stroke="#fff1cf" stroke-width="2.4" stroke-linecap="round" opacity=".8"/>`,
  clap: `
    <g transform="translate(22 31) rotate(-12) scale(.86)">${hand()}</g>
    <g transform="translate(42 31) rotate(12) scale(-.86 .86)">${hand("#e7b484", "#cc8c5a")}</g>
    <path d="M32 9 v6 M27 11 l1.6 3.6 M37 11 l-1.6 3.6" stroke="#e8952d" stroke-width="2.2" stroke-linecap="round"/>`,
  fire: `
    <path d="M32 45 C20 45 14.5 37 15.5 28.5 C16.5 21 22 17.5 22.5 11 C27 14 28.5 18.5 28 22 C31 18 33 12 31.5 6 C40 10.5 49 19 48.5 30 C48 39 41.5 45 32 45 Z"
      fill="url(#g-fire)" ${O}/>
    <path d="M32 44 C25.5 44 22.5 39.5 23.2 34.5 C23.8 30.5 27 28.5 27.6 25 C30.5 27 31 29.5 30.8 31.5 C33 29.5 34.5 26.5 34 23.5 C38.5 26.5 42 31 41.5 36.5 C41 41 37.5 44 32 44 Z"
      fill="#ffd36e"/>
    <path d="M32 43.5 C28.6 43.5 27.4 41 27.8 38.5 C28.3 36 30.4 35 31 33 C33.5 34.8 35.6 37 35.4 39.6 C35.2 42 34 43.5 32 43.5 Z" fill="#fff4cf"/>`,
  question: `
    <path d="M23 19.5 C23 13 27.5 9.5 33 9.5 C39 9.5 43 13.2 43 18.4 C43 23 40 25 37 27 C35 28.4 34.6 29.8 34.6 32 V33.5 H28.8 V31.4 C28.8 27.4 30.6 25.4 33.4 23.5 C35.6 22 37 20.9 37 18.7 C37 16.3 35.3 14.8 32.8 14.8 C30.4 14.8 28.8 16.4 28.6 19.5 Z"
      fill="url(#g-rust)" ${O}/>
    <circle cx="31.7" cy="40" r="3.6" fill="url(#g-rust)" ${O}/>
    <path d="M26 16 Q27.5 12.5 31.5 12" fill="none" stroke="#ffd9c4" stroke-width="2" stroke-linecap="round" opacity=".85"/>`,
  coffee: `
    <path d="M27 14 q-2.4 -2.6 0 -5.2 M34 14 q-2.4 -2.6 0 -5.2" fill="none" stroke="#b9b2a3" stroke-width="2" stroke-linecap="round" opacity=".9"/>
    <path d="M42 22 h3 a6.5 6.5 0 0 1 0 13 h-3.6" fill="none" ${ink(3.6)}/>
    <path d="M42 22 h3 a6.5 6.5 0 0 1 0 13 h-3.6" fill="none" stroke="#efe4cc" stroke-width="1.4"/>
    <path d="M18 18 H43 V36 Q43 44 35 44 H26 Q18 44 18 36 Z" fill="url(#g-mug)" ${O}/>
    <rect x="18" y="27" width="25" height="5" fill="#b5562f"/>
    <rect x="18" y="32" width="25" height="2.4" fill="#e8a33d"/>
    <ellipse cx="30.5" cy="18" rx="12.5" ry="3.2" fill="#5b3a26" ${THIN}/>
    <path d="M21.5 22 V35" stroke="#fffaf0" stroke-width="2" stroke-linecap="round" opacity=".8"/>`,
  tape: `
    <rect x="10" y="12" width="44" height="29" rx="3.5" fill="url(#g-walnut)" ${O}/>
    <rect x="14.5" y="15.5" width="35" height="16" rx="2" fill="#efe4cc" ${THIN}/>
    <rect x="14.5" y="15.5" width="35" height="3.2" fill="#b5562f"/>
    <rect x="14.5" y="18.7" width="35" height="2" fill="#e8a33d"/>
    <rect x="14.5" y="20.7" width="35" height="1.6" fill="#6e7b3a"/>
    <rect x="21" y="23.2" width="22" height="6.6" rx="3.3" fill="#2b2a26"/>
    <circle cx="25.5" cy="26.5" r="2.4" fill="#d9cba9"/><circle cx="38.5" cy="26.5" r="2.4" fill="#d9cba9"/>
    <path d="M18 41 L21 34.5 H43 L46 41" fill="#3e2718" ${THIN}/>
    <circle cx="25" cy="38" r="1.1" fill="#d9cba9"/><circle cx="39" cy="38" r="1.1" fill="#d9cba9"/>
    <circle cx="13" cy="15" r="1" fill="#d9cba9"/><circle cx="51" cy="15" r="1" fill="#d9cba9"/>`,
};

const DEFS = `
  <linearGradient id="g-bubble" x1="0" y1="0" x2=".6" y2="1"><stop offset="0" stop-color="#fbf4e3"/><stop offset="1" stop-color="#e3d6b8"/></linearGradient>
  <linearGradient id="g-heart" x1="0" y1="0" x2=".7" y2="1"><stop offset="0" stop-color="#e0623c"/><stop offset="1" stop-color="#9e3524"/></linearGradient>
  <linearGradient id="g-amber" x1="0" y1="0" x2=".6" y2="1"><stop offset="0" stop-color="#ffd27a"/><stop offset="1" stop-color="#e8952d"/></linearGradient>
  <linearGradient id="g-fire" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="#e8952d"/><stop offset=".7" stop-color="#c4402b"/><stop offset="1" stop-color="#9e3524"/></linearGradient>
  <linearGradient id="g-rust" x1="0" y1="0" x2=".6" y2="1"><stop offset="0" stop-color="#d06a3c"/><stop offset="1" stop-color="#93402a"/></linearGradient>
  <linearGradient id="g-mug" x1="0" y1="0" x2="1" y2=".4"><stop offset="0" stop-color="#fbf4e3"/><stop offset="1" stop-color="#cdbf9f"/></linearGradient>
  <linearGradient id="g-walnut" x1="0" y1="0" x2=".5" y2="1"><stop offset="0" stop-color="#7a5236"/><stop offset="1" stop-color="#4a2f20"/></linearGradient>`;

// The token: a rounded bubble with a little tail, a soft ground shadow.
const BUBBLE = `
  <path d="M10 3 H54 Q61 3 61 10 V43 Q61 50 54 50 H38.5 L32 57.5 L25.5 50 H10 Q3 50 3 43 V10 Q3 3 10 3 Z"
    fill="url(#g-bubble)" ${ink(2.2)}/>
  <path d="M8 9 Q8.6 6 12 6 H30" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".8"/>`;

// px: the drawn size (the texture is made at that many pixels per side)
export function emoteSvg(e: Emote, px = 64): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${px}" height="${px}"><defs>${DEFS}</defs>${BUBBLE}<g transform="translate(0 0.5)">${ART[e]}</g></svg>`;
}

export function emoteUrl(e: Emote): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(emoteSvg(e))}`;
}
