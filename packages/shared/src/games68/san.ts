import {
  legal,
  legalMoves,
  type Move,
  outcome,
  type Position,
  parseFen,
  play,
  START,
  sq,
  sqName,
  toFen,
} from "./chess.ts";

// A chess game's moves as people write them (docs/plan/70-the-chess.md, the HUD strip): the table
// keeps its moves as a log of from-to squares ("e2e4 e7e5 g1f3 … e7e8q", `props.log`), played from the
// start; here they're named the usual way — Nf3, exd5, O-O, e8=Q, a check's +, a mate's #.

/** A move as the log has it: its squares, a promotion's letter. */
export const uciOf = (m: Move): string => `${sqName(m.from)}${sqName(m.to)}${m.promo ?? ""}`;

/** A move named the usual way, in the position it's played from. */
export function sanOf(p: Position, m: Move): string {
  const piece = p.board[m.from];
  const kind = piece.toLowerCase();
  const after = play(p, m);
  const end = outcome(after);
  const mark = end === "mate" ? "#" : end === "check" || inCheckAfter(after) ? "+" : "";
  if (kind === "k" && Math.abs(m.to - m.from) === 2) return `${m.to > m.from ? "O-O" : "O-O-O"}${mark}`;
  const taken = !!p.board[m.to] || (kind === "p" && m.to === p.ep);
  const to = sqName(m.to);
  if (kind === "p") {
    const from = taken ? `${sqName(m.from)[0]}x` : "";
    return `${from}${to}${m.promo ? `=${m.promo.toUpperCase()}` : ""}${mark}`;
  }
  // (another of the same kind could go there too: say which by its file, its rank, or both)
  const rivals = legalMoves(p).filter((o) => o.to === m.to && o.from !== m.from && p.board[o.from] === piece);
  let which = "";
  if (rivals.length) {
    const f = sqName(m.from)[0];
    const r = sqName(m.from)[1];
    if (!rivals.some((o) => sqName(o.from)[0] === f)) which = f;
    else if (!rivals.some((o) => sqName(o.from)[1] === r)) which = r;
    else which = sqName(m.from);
  }
  return `${kind.toUpperCase()}${which}${taken ? "x" : ""}${to}${mark}`;
}

// (in check, mated or not: `outcome` says "mate" or "check", and "fifty"/"material" over a check)
function inCheckAfter(p: Position): boolean {
  const o = outcome(p);
  return o === "check" || o === "mate";
}

/** A log played from the start: each move named, the position after each; a move that won't play
 *  ends it there. */
export function replay(log: string | undefined, from = START): { san: string[]; fens: string[] } {
  const san: string[] = [];
  const fens: string[] = [];
  let p = parseFen(from);
  for (const u of (log ?? "").split(/\s+/).filter(Boolean)) {
    const m = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(u);
    const mv = m ? legal(p, sq(m[1]), sq(m[2]), m[3] ?? "q") : null;
    if (!mv) break;
    san.push(sanOf(p, mv));
    p = play(p, mv);
    fens.push(toFen(p));
  }
  return { san, fens };
}
