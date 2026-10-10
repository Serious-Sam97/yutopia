// WCAG AA contrast for the HUD's text/background pairs (globals.css tokens).
// Normal text needs 4.5:1; large/bold display text (VFD titles) 3:1.
const pairs = [
  ["cream on cabinet", "#efe4cc", "#2a1c13", 4.5],
  ["cream-dim on cabinet", "#d9cba9", "#2a1c13", 4.5],
  ["muted on cabinet", "#a39d8c", "#2a1c13", 4.5],
  ["vfd on vfd-window", "#ffb35c", "#120d09", 4.5],
  ["ink on deck button", "#2a2420", "#cdbf9f", 4.5],
  ["ink on pressed button", "#2a2420", "#e8952d", 4.5],
  ["cream on danger button", "#efe4cc", "#9e4a2e", 4.5],
  ["ink on paper bubble", "#2a2420", "#f7f0de", 4.5],
  ["ink on amber chat bubble", "#2a2420", "#ffa630", 4.5],
  ["vortex amber on dark", "#ffb35c", "#1a0f0c", 4.5],
  ["error on cabinet", "#ff8a66", "#2a1c13", 4.5],
  ["name tag", "#efe4cc", "#1e1712", 4.5],
  ["terminal green", "#9aa67e", "#0b0703", 4.5],
  ["field text", "#efe4cc", "#140e0a", 4.5],
  ["olive status on cabinet (icon)", "#8aa04a", "#2a1c13", 3],
];
const lum = (hex) => {
  const c = [1, 3, 5]
    .map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
let failed = false;
for (const [name, fg, bg, min] of pairs) {
  const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
  const ratio = (a + 0.05) / (b + 0.05);
  const ok = ratio >= min;
  failed ||= !ok;
  console.log(`[contrast] ${ok ? "ok  " : "FAIL"} ${ratio.toFixed(2).padStart(5)}:1 (min ${min}) ${name}`);
}
if (failed) process.exit(1);
