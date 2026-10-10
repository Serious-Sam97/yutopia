import type { Mat } from "./kit";

// Environment palette (docs/art-style.md): walnut / cream / amber VFD / rust /
// olive + four neutrals. Emissive colours are only amber, red and phosphor.
export const K = {
  walnut: "#5b3a26",
  walnutDark: "#3e2718",
  walnutLight: "#7a5236",
  teak: "#8a5a36",
  teakTop: "#a8733f",
  cream: "#efe4cc",
  creamDark: "#d9cba9",
  paper: "#f7f0de",
  putty: "#d6c9a6", // 80s computer beige
  puttyDark: "#b3a582",
  amber: "#ffa630",
  amberSoft: "#e8a33d",
  vfd: "#ffb35c",
  rust: "#b5562f",
  rustDark: "#8a3b2e",
  olive: "#6e7b3a",
  oliveDark: "#4f5a28",
  sage: "#8f9a6a",
  slate: "#3d4a5c",
  graphite: "#2b2a26",
  aluminium: "#b9b2a3",
  alumDark: "#8d877a",
  brass: "#c39a4a",
  glass: "#1a1613",
  screen: "#1d241c",
  phosphor: "#a8b98a",
  phosphorHi: "#d4e4a6",
  red: "#c4402b",
  leaf: "#5f7a3a",
  leafDark: "#435a28",
  leafLight: "#86a352",
  terracotta: "#b8643c",
  soil: "#3a2a1c",
} as const;

export const M = {
  walnut: { c: K.walnut, top: "#74492f" } as Mat,
  walnutDark: { c: K.walnutDark, top: "#563624" } as Mat,
  teak: { c: K.teak, top: K.teakTop, left: "#6a4128", right: "#55331f", gloss: 0.6 } as Mat,
  putty: { c: K.putty, top: "#e4d9bb" } as Mat,
  puttyDark: { c: K.puttyDark } as Mat,
  graphite: { c: K.graphite, top: "#45423b" } as Mat,
  aluminium: { c: K.aluminium, top: "#d3cdbf", gloss: 0.8 } as Mat,
  brass: { c: K.brass, top: "#e0bd6a", gloss: 1 } as Mat,
  rust: { c: K.rust, top: "#c96a3f" } as Mat,
  rustDark: { c: K.rustDark, top: "#a04a36" } as Mat,
  cream: { c: K.cream, top: "#f6eedb" } as Mat,
  olive: { c: K.olive, top: "#7f8d47" } as Mat,
};
