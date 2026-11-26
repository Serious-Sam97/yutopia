// The items as small drawings (design/screens/dark/hud/icons.js, the mock's): SVG markup.
import type { ItemId } from "@yutopia/shared/inventory";
import { asset } from "@/lib/asset";

/** (plan 103) a skateboard, slanted: its deck from above (the grip, the painted plies' edge, a kick at each end or
 *  one), its four wheels showing past the edge; `w` the deck's half-width, the colours its paint's and wheels' */
const board = (w: number, paint: string, wheel: string, nose = true) =>
  `<svg viewBox="0 0 48 48"><g transform="rotate(-40 24 24)"><rect x="${21.6 - w}" y="13" width="3.4" height="5" rx="1.4" fill="${wheel}"/><rect x="${23 + w}" y="13" width="3.4" height="5" rx="1.4" fill="${wheel}"/><rect x="${21.6 - w}" y="31" width="3.4" height="5" rx="1.4" fill="${wheel}"/><rect x="${23 + w}" y="31" width="3.4" height="5" rx="1.4" fill="${wheel}"/><rect x="${24 - w}" y="${nose ? 3 : 6}" width="${2 * w}" height="${nose ? 42 : 39}" rx="${w}" fill="${paint}"/><rect x="${25 - w}" y="${nose ? 6 : 7}" width="${2 * w - 2}" height="${nose ? 36 : 35}" rx="${w - 1}" fill="#26282c"/><path d="M${25 - w} 15h${2 * w - 2}M${25 - w} 34h${2 * w - 2}" stroke="#3a3d42" stroke-width="1"/><circle cx="23" cy="14" r=".6" fill="#8a929c"/><circle cx="25" cy="14" r=".6" fill="#8a929c"/><circle cx="23" cy="35" r=".6" fill="#8a929c"/><circle cx="25" cy="35" r=".6" fill="#8a929c"/></g></svg>`;

export const ICON: Record<ItemId, string> = {
  revolver:
    '<svg viewBox="0 0 64 40"><path d="M6 12h34l3-4h6v4h9v7H44l-2 3h-8l-3 4-4 11h-9l4-13-2-3H6z" fill="#4a5058"/><circle cx="36" cy="17" r="5" fill="#3a3f46" stroke="#6b737d" stroke-width="1.2"/><path d="M6 12h30v3H6z" fill="#7a828c"/><path d="M27 23c3 0 4 2 3 5" stroke="#6b737d" stroke-width="1.5" fill="none"/><path d="M20 37l4-12h5" fill="#5b3a26"/></svg>',
  shotgun:
    '<svg viewBox="0 0 96 40"><path d="M2 14h58v6H2z" fill="#4a5058"/><path d="M2 20h50v3H2z" fill="#3a3f46"/><path d="M30 20h14v5H30z" fill="#6b4a32"/><path d="M58 13h8l4 3h6l16 4-2 9-18-5h-8l-6-2z" fill="#6b4a32"/><path d="M60 22c2 4 0 6-2 6" stroke="#4a5058" stroke-width="2" fill="none"/></svg>',
  ak47: '<svg viewBox="0 0 96 40"><path d="M30 12h32l2-2h4v2h24v4H68l-2 3H30z" fill="#3a3f46"/><path d="M56 16h12v4H56z" fill="#8a4a24"/><path d="M4 14l26-2v8l-4 3H8l-4 6z" fill="#8a4a24"/><path d="M40 19h7l2 13-4 3-6-2 1-6z" fill="#4a5058"/><path d="M33 19h5l-2 12h-5z" fill="#8a4a24"/><path d="M44 12h12v-2H44z" fill="#4a5058"/></svg>',
  sniper:
    '<svg viewBox="0 0 96 40"><path d="M2 15l24-3 6 2h40v4H34l-4 6H22l-4 8H8l2-9-8 2z" fill="#2c2f33"/><path d="M34 14h58v3H34z" fill="#3a3f46"/><rect x="38" y="6" width="26" height="6" rx="3" fill="#1d2024"/><path d="M36 7h4v4h-4zM62 6h5v6h-5z" fill="#1d2024"/><path d="M44 12h3v3h-3zM55 12h3v3h-3z" fill="#4a5058"/><path d="M40 18h6v5h-6z" fill="#3a3f46"/><path d="M30 14l4 0 1 -4h3" stroke="#8a929c" stroke-width="1.5" fill="none"/></svg>',
  daybreak:
    '<svg viewBox="0 0 96 40"><path d="M6 14l18-2h8v14H24l-6 4H8z" fill="#1d2a4a"/><rect x="30" y="10" width="40" height="18" rx="5" fill="#22325a"/><path d="M34 10v18M44 10v18M54 10v18M64 10v18" stroke="#c99a3e" stroke-width="1.6"/><path d="M70 8l12-2v26l-12-2z" fill="#c99a3e"/><circle cx="86" cy="19" r="7" fill="#fff4dc"/><circle cx="86" cy="19" r="11" fill="rgba(255,220,150,.35)"/><rect x="38" y="28" width="16" height="7" rx="2" fill="#c99a3e"/><path d="M28 26l-2 8h-5l2-8z" fill="#3a2a1c"/></svg>',
  cell: '<svg viewBox="0 0 48 48"><rect x="10" y="14" width="28" height="20" rx="4" fill="#c99a3e"/><rect x="14" y="17" width="20" height="14" rx="3" fill="#fff1d2"/><path d="M16 24c3-5 5 5 8 0s5-5 8 0" stroke="#e08a2a" stroke-width="1.6" fill="none"/><rect x="6" y="20" width="4" height="8" rx="1" fill="#8a6a2a"/><rect x="38" y="20" width="4" height="8" rx="1" fill="#8a6a2a"/></svg>',
  r308: '<svg viewBox="0 0 48 48"><g transform="rotate(-8 24 24)"><path d="M12 14l2-8 2 8v20h-4z" fill="#c9a24a"/><path d="M12 14l2-8 2 8z" fill="#b8763e"/><path d="M22 14l2-8 2 8v20h-4z" fill="#c9a24a"/><path d="M22 14l2-8 2 8z" fill="#b8763e"/><path d="M32 14l2-8 2 8v20h-4z" fill="#c9a24a"/><path d="M32 14l2-8 2 8z" fill="#b8763e"/><rect x="11" y="34" width="26" height="3" fill="#9e7d34"/></g></svg>',
  r762: '<svg viewBox="0 0 48 48"><g transform="rotate(-8 24 24)"><path d="M11 12l3-6 3 6v20h-6z" fill="#c9a24a"/><path d="M11 12l3-6 3 6z" fill="#b8763e"/><path d="M21 12l3-6 3 6v20h-6z" fill="#c9a24a"/><path d="M21 12l3-6 3 6z" fill="#b8763e"/><path d="M31 12l3-6 3 6v20h-6z" fill="#c9a24a"/><path d="M31 12l3-6 3 6z" fill="#b8763e"/><rect x="10" y="32" width="28" height="3" fill="#9e7d34"/></g></svg>',
  r38: '<svg viewBox="0 0 48 48"><g transform="rotate(-8 24 24)"><rect x="9" y="14" width="8" height="18" rx="1" fill="#c9a24a"/><path d="M9 14q4 -9 8 0z" fill="#a7a9ad"/><rect x="8.5" y="31" width="9" height="3" fill="#9e7d34"/><rect x="20" y="14" width="8" height="18" rx="1" fill="#c9a24a"/><path d="M20 14q4 -9 8 0z" fill="#a7a9ad"/><rect x="19.5" y="31" width="9" height="3" fill="#9e7d34"/><rect x="31" y="14" width="8" height="18" rx="1" fill="#c9a24a"/><path d="M31 14q4 -9 8 0z" fill="#a7a9ad"/><rect x="30.5" y="31" width="9" height="3" fill="#9e7d34"/></g></svg>',
  shell:
    '<svg viewBox="0 0 48 48"><rect x="11" y="9" width="11" height="24" rx="1.5" fill="#b3302b"/><rect x="11" y="31" width="11" height="8" fill="#c9a24a"/><rect x="10" y="38" width="13" height="2.5" fill="#9e7d34"/><rect x="26" y="9" width="11" height="24" rx="1.5" fill="#b3302b"/><rect x="26" y="31" width="11" height="8" fill="#c9a24a"/><rect x="25" y="38" width="13" height="2.5" fill="#9e7d34"/></svg>',
  flare:
    '<svg viewBox="0 0 48 48"><g transform="rotate(35 24 24)"><rect x="19" y="6" width="10" height="34" rx="2" fill="#c8322a"/><rect x="19" y="6" width="10" height="7" rx="2" fill="#2a2d31"/><rect x="19" y="24" width="10" height="3" fill="#f2d24b"/></g></svg>',
  // (plan 88) Vortex's tape: a black cassette, his pink label, its tape out
  vxtape:
    '<svg viewBox="0 0 48 48"><rect x="6" y="11" width="36" height="24" rx="3" fill="#1d1d22"/><rect x="9" y="14" width="30" height="12" rx="1.5" fill="#ff2d95"/><circle cx="17" cy="20" r="3" fill="#ddd"/><circle cx="31" cy="20" r="3" fill="#ddd"/><path d="M22 35c0 4-4 4-4 8M26 35c0 3 3 5 2 9" stroke="#4a2c18" stroke-width="1.6" fill="none"/></svg>',
  // (plan 123) an umbrella, furled and slanted, its crook
  umbrella:
    '<svg viewBox="0 0 48 48"><g transform="rotate(-35 24 24)"><path d="M24 4l5 26h-10z" fill="#2f5d8a"/><path d="M24 4l2.5 26h-5z" fill="#3f73a6"/><rect x="23" y="30" width="2" height="9" fill="#2a2724"/><path d="M24 39v3a3 3 0 0 0 6 0" stroke="#5a3a22" stroke-width="2.4" fill="none"/></g></svg>',
  // (plan 87) the torch: its body slanted, the head and a lit lens
  torch:
    '<svg viewBox="0 0 48 48"><g transform="rotate(-40 24 24)"><rect x="20" y="16" width="8" height="26" rx="2" fill="#2b2e33"/><path d="M19 16l-3-8h16l-3 8z" fill="#3a3f46"/><rect x="15" y="5" width="18" height="4" rx="1.5" fill="#c9cdd2"/><rect x="17" y="6" width="14" height="2" fill="#fff1c9"/><path d="M20 22h8M20 26h8M20 30h8" stroke="#1b1d21" stroke-width="1.2"/></g></svg>',
  battery:
    '<svg viewBox="0 0 48 48"><rect x="14" y="10" width="20" height="30" rx="3" fill="#2b2f35" stroke="#8a929c" stroke-width="1.5"/><rect x="20" y="6" width="8" height="4" rx="1" fill="#8a929c"/><rect x="16" y="28" width="16" height="10" rx="1.5" fill="#7cc46b"/><path d="M24 15v8M20 19h8" stroke="#d9dde2" stroke-width="2"/></svg>',
  aid: '<svg viewBox="0 0 48 48"><rect x="7" y="13" width="34" height="26" rx="4" fill="#eceae4"/><path d="M18 13v-4h12v4" stroke="#bdb9b0" stroke-width="2.5" fill="none"/><path d="M24 19v14M17 26h14" stroke="#c7302b" stroke-width="5"/></svg>',
  // (plan 93 S6) a snow chain: two side chains, its ladder between, the tensioner's yellow hook
  chains:
    '<svg viewBox="0 0 48 48"><g transform="rotate(-30 24 24)" fill="none" stroke="#9aa0a8" stroke-width="2"><path d="M14 6v36M34 6v36" stroke-dasharray="4 2"/><path d="M14 11h20M14 20h20M14 29h20M14 38h20" stroke-dasharray="3 2"/></g><rect x="30" y="38" width="6" height="7" rx="1.5" fill="#e8b417"/></svg>',
  // (plan 93 S7) a wrench, its open jaw; a tow rope coiled, its hooks
  wrench:
    '<svg viewBox="0 0 48 48"><g transform="rotate(-40 24 24)"><rect x="21" y="12" width="6" height="30" rx="2" fill="#8a929c"/><path d="M16 4h16v6l-4 4h-8l-4-4z" fill="#a7a9ad"/><path d="M21 4h6v6h-6z" fill="#2b2e33"/></g></svg>',
  towrope:
    '<svg viewBox="0 0 48 48"><g fill="none" stroke="#e08a2a" stroke-width="3"><ellipse cx="24" cy="24" rx="15" ry="11"/><ellipse cx="24" cy="24" rx="10" ry="7"/></g><path d="M36 30l6 8M12 30l-6 8" stroke="#e08a2a" stroke-width="3"/><path d="M40 36a3 3 0 1 0 5 3M8 36a3 3 0 1 1-5 3" stroke="#8a929c" stroke-width="2.4" fill="none"/></svg>',
  fuse: '<svg viewBox="0 0 48 48"><g transform="rotate(-35 24 24)"><rect x="10" y="18" width="28" height="12" rx="2" fill="rgba(200,225,240,.35)" stroke="#cfe3ee" stroke-width="1.2"/><path d="M13 24c5-5 8 5 11 0s7-5 11 0" stroke="#e8c26a" stroke-width="1.4" fill="none"/><rect x="5" y="17" width="7" height="14" rx="1" fill="#a7a9ad"/><rect x="36" y="17" width="7" height="14" rx="1" fill="#a7a9ad"/></g></svg>',
  // (plan 103) the skateboards: the vert decks wide, the street ones narrow, the cruisers a kicktail only
  board_vert_classic: board(6.5, "#e4007c", "#f2efe4"),
  board_vert_fish: board(6.5, "#00a6a6", "#f4f1e6"),
  board_vert_square: board(6.5, "#2b3bff", "#ffffff"),
  board_street_pop: board(5, "#c8a27a", "#f3f0e8"),
  board_street_slick: board(5, "#1a1a1a", "#f3f0e8"),
  board_street_tech: board(4.6, "#3c6e47", "#f3f0e8"),
  board_cruiser_classic: board(5.6, "#ff7f50", "#ff8a3d", false),
  board_cruiser_wood: board(5.6, "#b98b5e", "#f0e68c", false),
  board_cruiser_mini: board(5.4, "#ff4f79", "#ffffff", false),
  // (plan 126) food for the animals, what they leave, the farm's, warm clothes
  bread:
    '<svg viewBox="0 0 48 48"><path d="M6 30c0-10 8-16 18-16s18 6 18 16v4H6z" fill="#c98a43"/><path d="M14 22l4 6M22 18l3 8M31 19l2 7" stroke="#8a5420" stroke-width="2" stroke-linecap="round"/><rect x="6" y="32" width="36" height="4" rx="2" fill="#a96c30"/></svg>',
  seed:
    '<svg viewBox="0 0 48 48"><path d="M14 12h20l4 30H10z" fill="#c8b48a"/><path d="M14 12l4-4h12l4 4" fill="#a8946a"/><circle cx="20" cy="26" r="1.6" fill="#6b4a22"/><circle cx="27" cy="30" r="1.6" fill="#6b4a22"/><circle cx="24" cy="22" r="1.6" fill="#6b4a22"/><circle cx="29" cy="24" r="1.4" fill="#6b4a22"/></svg>',
  nut:
    '<svg viewBox="0 0 48 48"><path d="M24 12c9 0 14 7 14 15s-6 13-14 13-14-5-14-13 5-15 14-15z" fill="#a8703a"/><path d="M12 22c4-8 20-8 24 0" fill="#6b4422"/><path d="M24 12v-5" stroke="#5a3a1c" stroke-width="2.5"/></svg>',
  apple:
    '<svg viewBox="0 0 48 48"><path d="M24 16c-6-5-16-2-16 9s8 16 12 16c2 0 3-1 4-1s2 1 4 1c4 0 12-5 12-16s-10-14-16-9z" fill="#c8302b"/><path d="M24 16c0-4 1-8 4-10" stroke="#5a3a1c" stroke-width="2.4" fill="none"/><path d="M27 10c4-3 8-1 9 1-3 2-7 2-9-1z" fill="#5a9a3a"/></svg>',
  carrot:
    '<svg viewBox="0 0 48 48"><g transform="rotate(-40 24 24)"><path d="M20 14h8l-3 30h-2z" fill="#e8822a"/><path d="M21 20h3M22 27h3M23 34h2" stroke="#b85a14" stroke-width="1.2"/><path d="M24 14l-5-9M24 14l0-10M24 14l5-9" stroke="#4a9a3a" stroke-width="2.6" stroke-linecap="round"/></g></svg>',
  meat:
    '<svg viewBox="0 0 48 48"><path d="M10 26c0-9 9-15 18-13s12 9 10 16-11 11-18 9-10-6-10-12z" fill="#b8333a"/><path d="M16 24c4-5 12-6 16-2" stroke="#f2d6d0" stroke-width="2.4" fill="none"/><rect x="34" y="30" width="10" height="4" rx="2" transform="rotate(30 39 32)" fill="#efe9dc"/></svg>',
  meat_cooked:
    '<svg viewBox="0 0 48 48"><path d="M10 26c0-9 9-15 18-13s12 9 10 16-11 11-18 9-10-6-10-12z" fill="#7a4022"/><path d="M15 22l14 10M18 18l14 10" stroke="#4a2410" stroke-width="2"/><rect x="34" y="30" width="10" height="4" rx="2" transform="rotate(30 39 32)" fill="#efe9dc"/></svg>',
  fish_raw:
    '<svg viewBox="0 0 48 48"><path d="M6 24c8-10 22-12 32 0-10 12-24 10-32 0z" fill="#8aa6b8"/><path d="M38 24l8-7v14z" fill="#6e8a9c"/><circle cx="13" cy="22" r="1.8" fill="#1d2024"/><path d="M20 20q4 4 0 8M26 19q4 5 0 10" stroke="#5e7a8c" stroke-width="1.2" fill="none"/></svg>',
  hide_fur:
    '<svg viewBox="0 0 48 48"><path d="M10 12l6 3 8-4 8 4 6-3-2 10 4 8-6 2-2 8-8-3-8 3-2-8-6-2 4-8z" fill="#8a8478"/><path d="M18 20q6 4 12 0M17 28q7 4 14 0" stroke="#5e594f" stroke-width="1.4" fill="none"/></svg>',
  hide_pelt:
    '<svg viewBox="0 0 48 48"><path d="M10 12l6 3 8-4 8 4 6-3-2 10 4 8-6 2-2 8-8-3-8 3-2-8-6-2 4-8z" fill="#c26a2e"/><path d="M18 20q6 4 12 0M17 28q7 4 14 0" stroke="#8a4418" stroke-width="1.4" fill="none"/></svg>',
  hide_leather:
    '<svg viewBox="0 0 48 48"><path d="M10 12l6 3 8-4 8 4 6-3-2 10 4 8-6 2-2 8-8-3-8 3-2-8-6-2 4-8z" fill="#9a6a42"/><path d="M18 20q6 4 12 0M17 28q7 4 14 0" stroke="#6a4426" stroke-width="1.4" fill="none"/></svg>',
  hide_wool:
    '<svg viewBox="0 0 48 48"><g fill="#f1ece0" stroke="#cfc6b2" stroke-width="1.2"><circle cx="16" cy="22" r="8"/><circle cx="28" cy="18" r="9"/><circle cx="33" cy="29" r="8"/><circle cx="20" cy="31" r="8"/></g></svg>',
  hide_feathers:
    '<svg viewBox="0 0 48 48"><g transform="rotate(-35 24 24)"><path d="M24 4c8 8 8 26 0 36-8-10-8-28 0-36z" fill="#d9d4c8"/><path d="M24 6v38" stroke="#7a7466" stroke-width="1.4"/><path d="M24 14l-5-3M24 20l-6-3M24 26l-6-3M24 14l5-3M24 20l6-3M24 26l6-3" stroke="#a49e90" stroke-width="1"/></g></svg>',
  egg:
    '<svg viewBox="0 0 48 48"><path d="M24 8c8 0 13 13 13 21s-6 12-13 12-13-4-13-12S16 8 24 8z" fill="#efe3cf"/><path d="M18 18q2-5 6-6" stroke="#fff" stroke-width="2" fill="none"/></svg>',
  milk:
    '<svg viewBox="0 0 48 48"><path d="M19 6h10v6l5 6v24H14V18l5-6z" fill="#f4f4ef" stroke="#cfd4d8" stroke-width="1.4"/><rect x="18" y="4" width="12" height="4" rx="1" fill="#2f6db3"/><rect x="14" y="24" width="20" height="10" fill="#2f6db3"/></svg>',
  fur_coat:
    '<svg viewBox="0 0 48 48"><path d="M16 6l-8 6-4 26h8l2-18v24h20V20l2 18h8l-4-26-8-6-8 6z" fill="#7a5a3e"/><path d="M16 6l8 8 8-8" fill="none" stroke="#e8dcc6" stroke-width="4"/><path d="M24 14v30" stroke="#5a3e26" stroke-width="1.4"/></svg>',
  fur_hat:
    '<svg viewBox="0 0 48 48"><path d="M10 30c0-12 6-18 14-18s14 6 14 18z" fill="#6b5038"/><rect x="7" y="28" width="34" height="9" rx="4" fill="#d8cbb2"/><path d="M8 36l-2 8M40 36l2 8" stroke="#d8cbb2" stroke-width="5" stroke-linecap="round"/></svg>',
  fur_gloves:
    '<svg viewBox="0 0 48 48"><path d="M8 34V18q0-5 5-5t5 5v6l3-3 3 3-5 6v4z" fill="#6b5038"/><path d="M26 34V18q0-5 5-5t5 5v6l3-3 3 3-5 6v4z" fill="#6b5038"/><rect x="7" y="32" width="13" height="7" rx="3" fill="#d8cbb2"/><rect x="25" y="32" width="13" height="7" rx="3" fill="#d8cbb2"/></svg>',
  fur_boots:
    '<svg viewBox="0 0 48 48"><path d="M8 10h10v22l8 4v6H8z" fill="#6b5038"/><path d="M26 10h10v22l8 4v6H26z" fill="#6b5038"/><rect x="7" y="8" width="12" height="6" rx="3" fill="#d8cbb2"/><rect x="25" y="8" width="12" height="6" rx="3" fill="#d8cbb2"/></svg>',
};

// (plan 86 phase 1) …and as pictures of the things themselves: each rendered from its own model
// (tools/art/items/render_items.py → public/life/items/<id>.webp), loaded once (preloadArt, the dark's start); till
// it's in — or if it won't load — its drawing above. `artVersion` counts the ones in: a view built before keys its
// rebuild on it.
const ASKED = new Set<ItemId>();
const LOADED = new Set<ItemId>();
let loadedN = 0;
export const artSrc = (id: ItemId) => asset(`/life/items/${id}.webp`);
export const artVersion = () => loadedN;
export function preloadArt(): void {
  for (const id of Object.keys(ICON) as ItemId[]) {
    if (ASKED.has(id)) continue;
    ASKED.add(id);
    const im = new Image();
    im.decoding = "async";
    im.onload = () => {
      LOADED.add(id);
      loadedN++;
    };
    im.src = artSrc(id);
  }
}
/** The item as markup: its picture once it's in, else its drawing */
export const itemArt = (id: ItemId): string =>
  LOADED.has(id) ? `<img class="art" src="${artSrc(id)}" alt="" draggable="false">` : ICON[id];
