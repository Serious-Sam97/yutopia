// The frame's stages, live, in a corner (docs/plan/38-the-lag.md): loaded while Settings →
// Graphics → Show frame stats is on (WorldView, prefs.perfStats), never shown otherwise.
import type { WorldController } from "./controller";
import { report } from "./perf-report";

export function mountPerfOverlay(c: WorldController): () => void {
  const box = document.createElement("pre");
  box.setAttribute("data-perf-overlay", "");
  Object.assign(box.style, {
    position: "fixed",
    left: "8px",
    bottom: "8px",
    zIndex: "2147483000",
    margin: "0",
    padding: "6px 8px",
    font: "11px/1.35 ui-monospace, Menlo, monospace",
    color: "#e8f0e8",
    background: "rgba(10,12,14,0.78)",
    borderRadius: "6px",
    pointerEvents: "none",
    whiteSpace: "pre",
  });
  document.body.appendChild(box);
  const show = () => {
    const r = report(c.framePerf);
    const rows = Object.entries(r.stages)
      .sort((a, b) => b[1].avg - a[1].avg)
      .map(
        ([k, v]) =>
          `${k.padEnd(11)} ${v.med.toFixed(2).padStart(6)} ${v.p95.toFixed(2).padStart(6)} ${v.worst.toFixed(1).padStart(6)}`,
      );
    const fps = r.gap.avg ? 1000 / r.gap.avg : 0;
    box.textContent = [
      `${fps.toFixed(0)} fps  gap p95 ${r.gap.p95} worst ${r.gap.worst}`,
      `frame ${r.frame.med} / ${r.frame.p95} / ${r.frame.worst} ms`,
      `long tasks ${r.longTasks.n} (worst ${r.longTasks.worst} ms)`,
      `${"stage".padEnd(11)}    med    p95  worst`,
      ...rows,
    ].join("\n");
  };
  const timer = setInterval(show, 500);
  return () => {
    clearInterval(timer);
    box.remove();
  };
}
