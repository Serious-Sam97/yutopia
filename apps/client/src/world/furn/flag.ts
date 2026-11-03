// Plan 67's switch (docs/plan/67-the-furniture.md): `?furn=new` draws (and sits on) the redrawn
// furniture whose family isn't signed off yet as well; `?furn=old` none of it, every kind as the iso
// art drew it. Unset: what's signed off is redrawn, the rest as before.
export let FURN: "new" | "old" | null = (() => {
  if (typeof location === "undefined") return null;
  const v = new URLSearchParams(location.search).get("furn");
  return v === "new" || v === "old" ? v : null;
})();

/** (the bench, /dev/furniture: today's column drawn as today's, whatever's signed off) */
export function useFurn(v: "new" | "old" | null): void {
  FURN = v;
}
