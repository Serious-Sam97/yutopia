// The items as small drawings (design/screens/dark/hud/icons.js, the mock's): SVG markup.
import type { ItemId } from "@yutopia/shared/inventory";

export const ICON: Record<ItemId, string> = {
  revolver:
    '<svg viewBox="0 0 64 40"><path d="M6 12h34l3-4h6v4h9v7H44l-2 3h-8l-3 4-4 11h-9l4-13-2-3H6z" fill="#4a5058"/><circle cx="36" cy="17" r="5" fill="#3a3f46" stroke="#6b737d" stroke-width="1.2"/><path d="M6 12h30v3H6z" fill="#7a828c"/><path d="M27 23c3 0 4 2 3 5" stroke="#6b737d" stroke-width="1.5" fill="none"/><path d="M20 37l4-12h5" fill="#5b3a26"/></svg>',
  shotgun:
    '<svg viewBox="0 0 96 40"><path d="M2 14h58v6H2z" fill="#4a5058"/><path d="M2 20h50v3H2z" fill="#3a3f46"/><path d="M30 20h14v5H30z" fill="#6b4a32"/><path d="M58 13h8l4 3h6l16 4-2 9-18-5h-8l-6-2z" fill="#6b4a32"/><path d="M60 22c2 4 0 6-2 6" stroke="#4a5058" stroke-width="2" fill="none"/></svg>',
  r38: '<svg viewBox="0 0 48 48"><g transform="rotate(-8 24 24)"><rect x="9" y="14" width="8" height="18" rx="1" fill="#c9a24a"/><path d="M9 14q4 -9 8 0z" fill="#a7a9ad"/><rect x="8.5" y="31" width="9" height="3" fill="#9e7d34"/><rect x="20" y="14" width="8" height="18" rx="1" fill="#c9a24a"/><path d="M20 14q4 -9 8 0z" fill="#a7a9ad"/><rect x="19.5" y="31" width="9" height="3" fill="#9e7d34"/><rect x="31" y="14" width="8" height="18" rx="1" fill="#c9a24a"/><path d="M31 14q4 -9 8 0z" fill="#a7a9ad"/><rect x="30.5" y="31" width="9" height="3" fill="#9e7d34"/></g></svg>',
  shell:
    '<svg viewBox="0 0 48 48"><rect x="11" y="9" width="11" height="24" rx="1.5" fill="#b3302b"/><rect x="11" y="31" width="11" height="8" fill="#c9a24a"/><rect x="10" y="38" width="13" height="2.5" fill="#9e7d34"/><rect x="26" y="9" width="11" height="24" rx="1.5" fill="#b3302b"/><rect x="26" y="31" width="11" height="8" fill="#c9a24a"/><rect x="25" y="38" width="13" height="2.5" fill="#9e7d34"/></svg>',
  flare:
    '<svg viewBox="0 0 48 48"><g transform="rotate(35 24 24)"><rect x="19" y="6" width="10" height="34" rx="2" fill="#c8322a"/><rect x="19" y="6" width="10" height="7" rx="2" fill="#2a2d31"/><rect x="19" y="24" width="10" height="3" fill="#f2d24b"/></g></svg>',
  battery:
    '<svg viewBox="0 0 48 48"><rect x="14" y="10" width="20" height="30" rx="3" fill="#2b2f35" stroke="#8a929c" stroke-width="1.5"/><rect x="20" y="6" width="8" height="4" rx="1" fill="#8a929c"/><rect x="16" y="28" width="16" height="10" rx="1.5" fill="#7cc46b"/><path d="M24 15v8M20 19h8" stroke="#d9dde2" stroke-width="2"/></svg>',
  aid: '<svg viewBox="0 0 48 48"><rect x="7" y="13" width="34" height="26" rx="4" fill="#eceae4"/><path d="M18 13v-4h12v4" stroke="#bdb9b0" stroke-width="2.5" fill="none"/><path d="M24 19v14M17 26h14" stroke="#c7302b" stroke-width="5"/></svg>',
  fuse: '<svg viewBox="0 0 48 48"><g transform="rotate(-35 24 24)"><rect x="10" y="18" width="28" height="12" rx="2" fill="rgba(200,225,240,.35)" stroke="#cfe3ee" stroke-width="1.2"/><path d="M13 24c5-5 8 5 11 0s7-5 11 0" stroke="#e8c26a" stroke-width="1.4" fill="none"/><rect x="5" y="17" width="7" height="14" rx="1" fill="#a7a9ad"/><rect x="36" y="17" width="7" height="14" rx="1" fill="#a7a9ad"/></g></svg>',
};

/** The day's nests' caches (docs/plan/31-the-day.md): what one of them carried. */
export const CACHE_ICON: Record<string, string> = {
  briefcase:
    '<svg viewBox="0 0 48 48"><rect x="6" y="15" width="36" height="24" rx="3" fill="#3b2a20"/><path d="M18 15v-4h12v4" stroke="#2a1d16" stroke-width="2.5" fill="none"/><rect x="6" y="24" width="36" height="2" fill="#2a1d16"/><rect x="21" y="22" width="6" height="5" rx="1" fill="#c9a24a"/></svg>',
  lunchbox:
    '<svg viewBox="0 0 48 48"><rect x="8" y="16" width="32" height="22" rx="4" fill="#2f5d8a"/><path d="M8 22h32" stroke="#244a6e" stroke-width="2"/><path d="M17 16q7 -8 14 0" stroke="#8a929c" stroke-width="2.5" fill="none"/></svg>',
  toolbox:
    '<svg viewBox="0 0 48 48"><rect x="5" y="20" width="38" height="18" rx="2" fill="#b3302b"/><rect x="5" y="20" width="38" height="5" fill="#8f2520"/><path d="M17 20v-5h14v5" stroke="#5c6166" stroke-width="2.5" fill="none"/><rect x="21" y="27" width="6" height="3" fill="#c9c2b5"/></svg>',
  hunting:
    '<svg viewBox="0 0 48 48"><path d="M10 18h28l3 20H7z" fill="#4b5a34"/><path d="M10 18q14 -9 28 0" stroke="#3a4628" stroke-width="2.5" fill="none"/><rect x="16" y="26" width="16" height="7" rx="1" fill="#3a4628"/></svg>',
  flares:
    '<svg viewBox="0 0 48 48"><rect x="9" y="17" width="30" height="21" rx="3" fill="#c8322a"/><rect x="9" y="17" width="30" height="5" fill="#9e2620"/><rect x="15" y="10" width="5" height="10" fill="#e8b84a"/><rect x="24" y="12" width="5" height="8" fill="#e8b84a"/></svg>',
  torch:
    '<svg viewBox="0 0 48 48"><path d="M30 8l10 10" stroke="#ffe9a8" stroke-width="7" opacity=".35"/><rect x="10" y="22" width="22" height="8" rx="2" transform="rotate(-45 21 26)" fill="#2a2a2a"/><circle cx="31" cy="17" r="4" fill="#fff2c4"/></svg>',
};
