import type { TableScene3 } from "../tp/tables3d";
import { type PballHost, PoolBallsOut } from "./pballs";
import { PongTables } from "./pong";
import { PoolTables } from "./pool";

// The game tables (Fita 13): their own lazy chunk, loaded once a space has a
// pool or ping-pong table. Pool lives in pool.ts, ping-pong in pong.ts.

// Marks this chunk for `pnpm budget`.
export const TABLES_CHUNK = "yutopia-tables";

export type { PballHost as TableHost } from "./pballs";

export class GameTables {
  readonly chunk = TABLES_CHUNK; // (kept: `pnpm budget` finds the chunk by it)
  readonly pool: PoolTables;
  readonly pong: PongTables;
  readonly balls: PoolBallsOut; // pool balls out of a game: thrown, fired from the cue
  constructor(host: PballHost) {
    this.pool = new PoolTables(host);
    this.pong = new PongTables(host);
    this.balls = new PoolBallsOut(host);
  }
  refresh() {
    this.pool.refresh();
    this.pong.refresh();
  }
  frame(dt: number, me: { x: number; y: number }) {
    this.pool.frame(dt, me);
    this.pong.frame(dt, me);
    this.balls.frame(dt, me);
  }
  scene3d(): TableScene3 {
    const s: TableScene3 = { balls: [], cues: [], lines: [], rings: [], lamps: [], rackets: [], pongBalls: [] };
    this.pool.scene3d(s);
    this.pong.scene3d(s);
    this.balls.scene3d(s);
    return s;
  }
  gameCam() {
    return this.pool.gameCam() ?? this.pong.gameCam();
  }
  vortexes() {
    return [...this.pool.vortexes(), ...this.pong.vortexes()];
  }
  busy(): string {
    return this.pool.atTable() ? "pool" : this.pong.atTable() ? "pong" : "";
  }
  dispose() {
    this.pool.dispose();
    this.pong.dispose();
    this.balls.dispose();
  }
}
