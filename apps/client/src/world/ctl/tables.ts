import { face8 } from "@yutopia/shared";
import type { WorldController } from "../controller";
import { hud } from "../store";
import type { GameTables } from "../tables";

/** What Tables reads of the WorldController (plan 72 phase 4: its dependencies, said). */
export type TablesHost = Pick<
  WorldController,
  | "grid"
  | "level"
  | "me"
  | "meAngle"
  | "model"
  | "onOpenPanel"
  | "path"
  | "room"
  | "send"
  | "stopped"
  | "tp"
  | "walkTo"
  | "walker"
  | "worldHttp"
>;

export class Tables {
  constructor(private readonly c: TablesHost) {}

  // ── the game tables (pool, ping-pong): their own chunk (world/tables), loaded once one is here ──
  // ── chess at the table (plan 70): its own chunk (world/chess), loaded once a floor has a board ──
  chess: import("../chess").ChessPlay | null = null;

  chessLoading: Promise<void> | null = null;

  chessChanged() {
    if (this.chess) return this.chess.refresh();
    if (
      this.chessLoading ||
      !this.c.model?.allObjects().some((o) => o.kind === "chess_table" || o.kind === "wizard_chess")
    )
      return;
    this.chessLoading = import("../chess").then((m) => {
      const model = this.c.model;
      const room = this.c.room;
      if (this.c.stopped || !model || !room) return;
      this.chess = new m.ChessPlay({
        model: {
          getObject: (id) => model.getObject(id),
          allObjects: () => model.allObjects(),
          rayAt: (cx, cy) => model.rayAt(cx, cy),
        },
        room,
        send: (type, msg) => this.c.send(type as never, msg as never),
        me: () => this.c.me,
        grid: () => this.c.grid,
        walkTo: (p) => {
          this.c.walkTo(p, undefined, true);
        },
        men: () => this.c.tp?.world?.chessMen ?? null,
        physics: () => this.c.tp?.body.physicsSpace() ?? null,
        stand: (x, y) => {
          if (this.c.grid.ok(Math.floor(x), Math.floor(y))) {
            this.c.me.x = x;
            this.c.me.y = y;
          }
        },
        openPanel: (kind, id) => this.c.onOpenPanel(kind, id),
        closePanel: (kind) => {
          if (hud.get().panel.kind === kind) hud.set({ panel: { kind: null } });
        },
      });
    });
  }

  tables: GameTables | null = null;

  tablesLoading: Promise<void> | null = null;

  tableVortexes = new Set<string>();

  tablesChanged() {
    if (this.tables) return this.tables.refresh();
    if (
      this.tablesLoading ||
      !this.c.model?.allObjects().some((o) => o.kind === "pool_table" || o.kind === "pingpong_table")
    )
      return;
    this.tablesLoading = import("../tables").then((m) => {
      const room = this.c.room;
      const model = this.c.model;
      if (this.c.stopped || !model || !room) return;
      this.tables = new m.GameTables({
        model,
        room,
        send: (type, msg) => this.c.send(type as never, msg as never),
        walkTo: (p) => {
          this.c.walkTo(p, undefined, true);
        },
        face: (x, y) => {
          if (this.c.path) return;
          this.c.me.yaw = face8(x - this.c.me.x, y - this.c.me.y, this.c.me.yaw);
          this.c.meAngle = Math.atan2(y - this.c.me.y, x - this.c.me.x);
        },
        stand: (x, y) => {
          if (this.c.path || !this.c.grid.ok(Math.floor(x), Math.floor(y))) return;
          this.c.me.x = x;
          this.c.me.y = y;
        },
        worldHttp: () => this.c.worldHttp,
        where: () => this.c.walker?.where() ?? { ...this.c.me, z: 0 },
        aiming: () => !!this.c.walker?.aiming,
        level: () => this.c.level,
      });
      this.tables.refresh();
    });
  }
}
