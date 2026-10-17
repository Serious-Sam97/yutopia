// A disc's region, from its licence sector (sector 4: "Sony Computer
// Entertainment Inc." / "… Amer  ica" / "… Euro pe", the text a console's BIOS
// checks before it boots a disc — PCSX ReARMed's CheckCdrom reads the same).
// Booting through a real BIOS (its start-up logo) only works when the BIOS is
// of the disc's region: a Japanese BIOS shows its own menu for a US disc, as
// the console would (so `relicense`). Unknown (a compressed .chd / .pbp): null.

export type Region = "NTSC-U" | "NTSC-J" | "PAL";

// where sector 4's text starts, by how the image stores sectors
const AT = [
  4 * 2352 + 24 + 60, // raw Mode 2 (what discs are dumped as): sync, header, subheader, data
  4 * 2352 + 16 + 60, // raw Mode 1
  4 * 2048 + 60, // just the data (.iso)
];

type DiscFile = { name: string; blob: Blob };

// The data track and where its licence text is, with the region it names.
async function licence(files: DiscFile[]): Promise<{ data: DiscFile; at: number; region: Region } | null> {
  const ext = (n: string) => n.toLowerCase().split(".").pop() ?? "";
  // the data track: the .cue's first FILE (else the first .bin / .iso / .img)
  let data = files.find((f) => ["bin", "iso", "img"].includes(ext(f.name)));
  const cue = files.find((f) => ext(f.name) === "cue");
  if (cue) {
    const m = /FILE\s+(?:"([^"]+)"|(\S+))/i.exec(await cue.blob.text());
    const first = m ? (m[1] ?? m[2]) : null;
    data = files.find((f) => f.name === first) ?? data;
  }
  if (!data) return null;
  for (const at of AT) {
    const text = await data.blob.slice(at, at + 12).text();
    if (text.startsWith("Inc.")) return { data, at, region: "NTSC-J" };
    if (text.startsWith("Amer  ica") || text.startsWith("of America")) return { data, at, region: "NTSC-U" };
    if (text.startsWith("Euro pe")) return { data, at, region: "PAL" };
  }
  return null;
}

export async function discRegion(files: DiscFile[]): Promise<Region | null> {
  return (await licence(files))?.region ?? null;
}

// Does the disc carry the PlayStation logo (sectors 5–11, which the BIOS reads
// and draws after Sony's screen)? Every pressed disc does; a homemade one (our
// test card) may not, and the BIOS hangs on Sony's screen without it — such a
// disc starts without the BIOS's start-up.
export async function hasBootLogo(files: DiscFile[]): Promise<boolean> {
  const lic = await licence(files);
  if (!lic) return false;
  const sector = lic.at === AT[2] ? 2048 : 2352;
  const data = new Uint8Array(
    await lic.data.blob.slice(lic.at - 60 + sector, lic.at - 60 + sector + 2048).arrayBuffer(),
  );
  return data.some((b) => b !== 0);
}

// The disc as a console of another region takes it (what a modded console
// does): the licence text says `to`'s region; nothing else changes (the copy is
// a Blob made of the original's slices, so nothing big is copied). Only between
// the two NTSC regions: a PAL disc is a 50 Hz one, which the core goes by.
const LICENCE: Partial<Record<Region, string>> = {
  "NTSC-J": "          Licensed  by          Sony Computer Entertainment Inc.",
  "NTSC-U": "          Licensed  by          Sony Computer Entertainment Amer  ica ",
};
export const ntsc = (r: string | null) => r === "NTSC-U" || r === "NTSC-J";
export async function relicense<F extends DiscFile>(files: F[], to: Region): Promise<F[]> {
  const lic = await licence(files);
  const text = LICENCE[to];
  if (!lic || !text || lic.region === to || !ntsc(lic.region)) return files;
  const start = lic.at - 60; // (the sector's data)
  const sector = new Uint8Array(2048);
  for (let i = 0; i < text.length; i++) sector[i] = text.charCodeAt(i);
  const b = lic.data.blob;
  const blob = new File([b.slice(0, start), sector, b.slice(start + 2048)], lic.data.name, { type: b.type });
  return files.map((f) => (f === lic.data ? { ...f, blob } : f));
}

// What a region's called, and the BIOS that start its discs with the logo
export const REGION_NAMES: Record<Region, string> = { "NTSC-U": "USA", "NTSC-J": "Japan", PAL: "Europe" };
export const REGION_BIOS: Record<Region, string> = {
  "NTSC-U": "SCPH-1001, 5501, 7001 or 101",
  "NTSC-J": "SCPH-5500",
  PAL: "SCPH-5502",
};

// A BIOS of this region (its model's region, as Yondra lists it)?
export const biosFits = (bios: string, disc: Region | null) => !!disc && bios === disc;
