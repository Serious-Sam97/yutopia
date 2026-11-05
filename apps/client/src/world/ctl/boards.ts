import type { WbItem } from "@yutopia/shared";
import type { WorldController } from "../controller";

/** What Whiteboards reads of the WorldController (plan 72 phase 4: its dependencies, said). */
export type WhiteboardsHost = Pick<WorldController, "model">;

export class Whiteboards {
  constructor(private readonly c: WhiteboardsHost) {}

  // ── whiteboards ──────────────────────────────────────────────────────────
  wbScenes = new Map<string, WbItem[]>();

  wbListeners = new Set<(objectId: string, items: WbItem[]) => void>();

  onWhiteboard(fn: (objectId: string, items: WbItem[]) => void) {
    this.wbListeners.add(fn);
    return () => {
      this.wbListeners.delete(fn);
    };
  }

  whiteboardItems(objectId: string): WbItem[] {
    return this.wbScenes.get(objectId) ?? this.persistedScene(objectId);
  }

  persistedScene(objectId: string): WbItem[] {
    const scene = this.c.model?.getObject(objectId)?.props?.scene;
    return Array.isArray(scene) ? [...(scene as WbItem[])] : [];
  }

  emitWb(objectId: string) {
    const items = this.whiteboardItems(objectId);
    this.c.model?.setWhiteboard(objectId, items);
    for (const f of this.wbListeners) f(objectId, items);
  }
}
