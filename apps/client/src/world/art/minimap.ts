// The minimap's colours (components/hud/Overlays.tsx Minimap): its floors by their material, its walls
// and rails, the ink round a mezzanine — art, kept out of the HUD's components (their colours are
// globals.css's tokens).
export const MINIMAP = {
  floors: {
    "~": "#3c3129",
    ":": "#7a3b2e",
    ",": "#6b6a3a",
    x: "#4a4740",
    _: "#b9ad92",
    ".": "#a07a52",
    a: "#5a5852",
    c: "#8a867c",
  } as Record<string, string>,
  floor: "#a07a52",
  wall: "#2a1c13",
  rail: "#6b5440",
  ink: "#1a120c",
  label: "#efe4cc",
  mine: "#ffb35c",
};
