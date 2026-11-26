import { lotOf, lotOfFloor } from "@yutopia/shared";
import { type BlueprintData, blueprintOf, blueprintWhy } from "@yutopia/shared/blueprints";
import { HOME_LOTS } from "@yutopia/shared/grounds";
import { useEffect, useState } from "react";
import { type SavedBlueprint, yutopia } from "@/lib/api";
import { addStrings, trMaybe } from "@/lib/i18n";
import { toast, useHud } from "@/world/store";
import { useWorld } from "../ctx";
import { Icon } from "../icons";

// (docs/plan/130-the-house-build.md, phase 12 — F12b) The Lot tab's Blueprints: the house on my lot saved (its storeys,
// walls, floors, roofs, the house layers and its things, from the lot's corner — shared blueprints.ts) to my own
// list in the API, and one of mine built again on my empty lot by the world server (`lot:blueprint`).

addStrings(
  {
    bpSave: ["Save this house", "Salvar esta casa"],
    bpName: ["Its name", "Nome"],
    bpMine: ["My blueprints", "Minhas plantas"],
    bpNone: ["None saved yet.", "Nenhuma salva ainda."],
    bpBuild: ["Build here", "Construir aqui"],
    bpDelete: ["Delete", "Apagar"],
    bpStoreys: ["{s} storeys · {n} things", "{s} andares · {n} itens"],
    bpNoLot: ["Claim a lot first: blueprints are built on your own.", "Pegue um terreno primeiro: plantas vão no seu."],
    bpSaved: ["Saved.", "Salva."],
    bpPreview: ["Preview", "Ver antes"],
    bpCancel: ["Cancel", "Cancelar"],
    bpGhostHint: [
      "The house's walls and floors shown on your lot, where it'll stand. Build here to build it.",
      "As paredes e pisos da casa mostrados no seu terreno, onde ela vai ficar. Construir aqui para construir.",
    ],
  },
  "blueprints",
);
const bw = (k: string) => trMaybe(k) ?? k;

export function BlueprintsPanel() {
  const w = useWorld();
  useHud((s) => s.mapVersion);
  const [list, setList] = useState<SavedBlueprint[] | null>(null);
  const [name, setName] = useState("My house");
  const [busy, setBusy] = useState(false);
  // (the quality pass: the blueprint shown on my lot first — its ground storey's walls, its storeys' floors)
  const [ghost, setGhost] = useState<number | null>(null);
  useEffect(() => () => w?.model?.setSegGhosts([]), [w]);
  useEffect(() => {
    yutopia
      .blueprints()
      .then(({ blueprints }) => setList(blueprints))
      .catch(() => setList([]));
  }, []);
  const st = w?.structure ?? null;
  const key = st && w ? (lotOfFloor(st, w.level) ?? lotOf(st, w.myUid())) : null;
  const lot = key ? HOME_LOTS.find((l) => l.key === key) : null;
  const save = async () => {
    if (!st || !lot || !w) return;
    const data = blueprintOf(st, lot, [...w.objs.values()]);
    if (typeof data === "string") return toast(data, "warn");
    setBusy(true);
    try {
      const { blueprint } = await yutopia.saveBlueprint(name.trim() || "My house", data);
      setList((l) => [blueprint, ...(l ?? [])]);
      toast(bw("bpSaved"));
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "warn");
    } finally {
      setBusy(false);
    }
  };
  const preview = (b: SavedBlueprint | null) => {
    setGhost(b?.id ?? null);
    if (!b || !lot || !st || !w) {
      w?.model?.setSegGhosts([]);
      w?.model?.setPolyGhosts([]);
      return;
    }
    const data = b.data as unknown as BlueprintData;
    const ok = !blueprintWhy(st, lot, data, [...w.objs.values()]);
    const at = (p: [number, number]): [number, number] => [p[0] + lot.x0, p[1] + lot.z0];
    const g = data.storeys.find((q) => q.storey === 0);
    w.model?.setSegGhosts(
      (g?.walls ?? []).map((q) => ({ a: at(q.a), b: at(q.b), h: q.height, ok, ...(q.thick ? { t: q.thick } : {}) })),
    );
    w.model?.setPolyGhosts(
      data.storeys
        .filter((q) => q.storey !== 0)
        .flatMap((q) => q.slabs.map((sl) => ({ pts: sl.outline.map(at), ok, closed: true }))),
    );
  };
  const forget = async (id: number) => {
    try {
      await yutopia.deleteBlueprint(id);
      setList((l) => (l ?? []).filter((q) => q.id !== id));
    } catch {}
  };
  if (!lot)
    return (
      <p className="text-[12.5px] font-semibold" style={{ color: "var(--glass-dim)" }}>
        {bw("bpNoLot")}
      </p>
    );
  return (
    <section className="flex flex-col gap-2" data-testid="blueprints">
      <div className="flex gap-1.5 items-center">
        <input
          className="gl-field flex-1 min-w-0"
          value={name}
          maxLength={40}
          aria-label={bw("bpName")}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
        <button type="button" className="gl-btn gl-sm gl-on" disabled={busy} data-testid="bp-save" onClick={save}>
          <Icon name="blueprint" size={14} /> {bw("bpSave")}
        </button>
      </div>
      <span className="gl-lab">{bw("bpMine")}</span>
      {ghost !== null && (
        <p className="text-[12px] font-semibold" style={{ color: "var(--glass-dim)" }}>
          {bw("bpGhostHint")}
        </p>
      )}
      {list?.length === 0 && (
        <p className="text-[12px]" style={{ color: "var(--glass-dim)" }}>
          {bw("bpNone")}
        </p>
      )}
      {(list ?? []).map((b) => (
        <div key={b.id} className="flex items-center gap-2 gl-tile !h-auto !justify-start px-2 py-1.5">
          <Icon name="blueprint" size={22} />
          <span className="min-w-0 flex-1">
            <b className="block text-[13px] truncate">{b.name}</b>
            <span className="text-[11px]" style={{ color: "var(--glass-dim)" }}>
              {bw("bpStoreys")
                .replace("{s}", String(b.data.storeys?.length ?? 0))
                .replace("{n}", String(b.data.things?.length ?? 0))}
            </span>
          </span>
          {ghost === b.id ? (
            <>
              <button
                type="button"
                className="gl-btn gl-sm gl-on"
                data-testid={`bp-build-${b.id}`}
                onClick={() => {
                  w?.send("lot:blueprint", { key: lot.key, data: b.data });
                  preview(null);
                }}
              >
                {bw("bpBuild")}
              </button>
              <button type="button" className="gl-btn gl-sm" onClick={() => preview(null)}>
                {bw("bpCancel")}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="gl-btn gl-sm"
              data-testid={`bp-preview-${b.id}`}
              onClick={() => preview(b)}
            >
              {bw("bpPreview")}
            </button>
          )}
          <button type="button" className="gl-btn gl-sm gl-bad" onClick={() => forget(b.id)}>
            {bw("bpDelete")}
          </button>
        </div>
      ))}
    </section>
  );
}
