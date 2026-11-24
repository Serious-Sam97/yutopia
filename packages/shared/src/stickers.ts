// (plan 125 F6a) The stickers on the case's lid: one for each place you've reached — kept with your pages
// (`sticker-<key>` in the survivor's pages, saved by the API), awarded by the world-server the first time you stand
// there (on the land, level 0). Where each is: its middle and how near counts (m).
export interface StickerPlace {
  key: string;
  en: string;
  pt: string;
  x: number;
  z: number;
  r: number;
}
export const STICKERS: StickerPlace[] = [
  { key: "main-street", en: "Main Street", pt: "Main Street", x: 420, z: -405, r: 55 },
  { key: "the-pond", en: "The Pond", pt: "O Lago", x: -240, z: -60, r: 70 },
  { key: "the-farm", en: "The Farm", pt: "A Fazenda", x: 447, z: -282, r: 55 },
  { key: "skate-hall", en: "Skate Hall", pt: "Pista de Skate", x: 478, z: -522, r: 32 },
  { key: "the-church", en: "The Church", pt: "A Igreja", x: 420, z: -545, r: 26 },
  { key: "long-pine-road", en: "Long Pine Road", pt: "Long Pine Road", x: 4175, z: -465, r: 70 },
  { key: "hawk-pass", en: "Hawk Pass", pt: "Hawk Pass", x: 7880, z: -1800, r: 140 },
  { key: "silver-lake", en: "Silver Lake", pt: "Silver Lake", x: 9520, z: -2330, r: 700 },
];
export const STICKER_PAGE = "sticker-";
/** The place you're standing in that has a sticker, or null. */
export function stickerAt(x: number, z: number): StickerPlace | null {
  for (const s of STICKERS) if (Math.hypot(x - s.x, z - s.z) <= s.r) return s;
  return null;
}
