// Chess at the chess table (docs/plan/68-more-furniture.md, phase 24): the rules, small and whole —
// every legal move (castling, en passant, promotion), check, mate and stalemate, the fifty moves and
// too little left to mate — over a position kept as FEN (the table's `props.fen`, so the room keeps
// the game and the client draws its pieces from it).

export type Side = "w" | "b";
export interface Position {
  /** a8 first, h1 last: a piece's letter (white upper case) or "" */
  board: string[];
  turn: Side;
  /** "KQkq" or less, "-" for none */
  castle: string;
  /** the square a pawn can be taken en passant on (0..63), or −1 */
  ep: number;
  half: number;
  full: number;
}
export interface Move {
  from: number;
  to: number;
  /** a pawn's promotion: q, r, b, n */
  promo?: string;
}

export const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const FILES = "abcdefgh";
export const sq = (name: string): number => (8 - Number(name[1])) * 8 + FILES.indexOf(name[0]);
export const sqName = (i: number): string => `${FILES[i % 8]}${8 - Math.floor(i / 8)}`;
const sideOf = (p: string): Side | null => (!p ? null : p === p.toUpperCase() ? "w" : "b");

export function parseFen(fen: string): Position {
  const [rows, turn, castle, ep, half, full] = fen.trim().split(/\s+/);
  const board: string[] = [];
  for (const ch of rows.replace(/\//g, "")) {
    if (/\d/.test(ch)) for (let i = 0; i < Number(ch); i++) board.push("");
    else board.push(ch);
  }
  if (board.length !== 64) throw new Error(`a bad position: ${fen}`);
  return {
    board,
    turn: turn === "b" ? "b" : "w",
    castle: castle || "-",
    ep: ep && ep !== "-" ? sq(ep) : -1,
    half: Number(half) || 0,
    full: Number(full) || 1,
  };
}

export function toFen(p: Position): string {
  const rows: string[] = [];
  for (let r = 0; r < 8; r++) {
    let row = "";
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const c = p.board[r * 8 + f];
      if (!c) empty++;
      else {
        if (empty) row += empty;
        empty = 0;
        row += c;
      }
    }
    if (empty) row += empty;
    rows.push(row);
  }
  return `${rows.join("/")} ${p.turn} ${p.castle || "-"} ${p.ep >= 0 ? sqName(p.ep) : "-"} ${p.half} ${p.full}`;
}

const KNIGHT = [
  [1, 2],
  [2, 1],
  [2, -1],
  [1, -2],
  [-1, -2],
  [-2, -1],
  [-2, 1],
  [-1, 2],
];
const KING = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];
const ROOK = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const BISHOP = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
const at = (f: number, r: number) => (f < 0 || f > 7 || r < 0 || r > 7 ? -1 : r * 8 + f);

/** Is square `s` attacked by `by`? */
export function attacked(p: Position, s: number, by: Side): boolean {
  const f = s % 8;
  const r = Math.floor(s / 8);
  const own = (c: string, t: string) => c === (by === "w" ? t.toUpperCase() : t);
  // pawns (a white pawn attacks up the board: from r+1)
  const pr = by === "w" ? r + 1 : r - 1;
  for (const df of [-1, 1]) {
    const i = at(f + df, pr);
    if (i >= 0 && own(p.board[i], "p")) return true;
  }
  for (const [df, dr] of KNIGHT) {
    const i = at(f + df, r + dr);
    if (i >= 0 && own(p.board[i], "n")) return true;
  }
  for (const [df, dr] of KING) {
    const i = at(f + df, r + dr);
    if (i >= 0 && own(p.board[i], "k")) return true;
  }
  for (const [dirs, kinds] of [
    [ROOK, "rq"],
    [BISHOP, "bq"],
  ] as const)
    for (const [df, dr] of dirs) {
      for (let k = 1; ; k++) {
        const i = at(f + df * k, r + dr * k);
        if (i < 0) break;
        const c = p.board[i];
        if (!c) continue;
        if (sideOf(c) === by && kinds.includes(c.toLowerCase())) return true;
        break;
      }
    }
  return false;
}

export const kingOf = (p: Position, side: Side): number => p.board.indexOf(side === "w" ? "K" : "k");
export const inCheck = (p: Position, side: Side = p.turn): boolean =>
  attacked(p, kingOf(p, side), side === "w" ? "b" : "w");

/** The moves that would be legal if checks didn't matter. */
function pseudo(p: Position): Move[] {
  const out: Move[] = [];
  const me = p.turn;
  const them: Side = me === "w" ? "b" : "w";
  for (let s = 0; s < 64; s++) {
    const c = p.board[s];
    if (sideOf(c) !== me) continue;
    const f = s % 8;
    const r = Math.floor(s / 8);
    const t = c.toLowerCase();
    const add = (to: number) => {
      if (to < 0) return false;
      const d = p.board[to];
      if (sideOf(d) === me) return false;
      out.push({ from: s, to });
      return !d;
    };
    if (t === "p") {
      const dir = me === "w" ? -1 : 1;
      const one = at(f, r + dir);
      const last = me === "w" ? 0 : 7;
      const push = (to: number) => {
        if (Math.floor(to / 8) === last) for (const promo of ["q", "r", "b", "n"]) out.push({ from: s, to, promo });
        else out.push({ from: s, to });
      };
      if (one >= 0 && !p.board[one]) {
        push(one);
        const start = me === "w" ? 6 : 1;
        const two = at(f, r + 2 * dir);
        if (r === start && !p.board[two]) out.push({ from: s, to: two });
      }
      for (const df of [-1, 1]) {
        const to = at(f + df, r + dir);
        if (to < 0) continue;
        if (sideOf(p.board[to]) === them) push(to);
        else if (to === p.ep) out.push({ from: s, to });
      }
    } else if (t === "n") for (const [df, dr] of KNIGHT) add(at(f + df, r + dr));
    else if (t === "k") {
      for (const [df, dr] of KING) add(at(f + df, r + dr));
      // castling: rights, the way empty, not out of, through or into check
      const home = me === "w" ? 60 : 4;
      if (s === home && !attacked(p, home, them)) {
        const [kSide, qSide] = me === "w" ? ["K", "Q"] : ["k", "q"];
        if (
          p.castle.includes(kSide) &&
          !p.board[home + 1] &&
          !p.board[home + 2] &&
          !attacked(p, home + 1, them) &&
          !attacked(p, home + 2, them)
        )
          out.push({ from: s, to: home + 2 });
        if (
          p.castle.includes(qSide) &&
          !p.board[home - 1] &&
          !p.board[home - 2] &&
          !p.board[home - 3] &&
          !attacked(p, home - 1, them) &&
          !attacked(p, home - 2, them)
        )
          out.push({ from: s, to: home - 2 });
      }
    } else {
      const dirs = t === "r" ? ROOK : t === "b" ? BISHOP : [...ROOK, ...BISHOP];
      for (const [df, dr] of dirs)
        for (let k = 1; ; k++) {
          const to = at(f + df * k, r + dr * k);
          if (to < 0 || !add(to)) break;
        }
    }
  }
  return out;
}

/** The position after `m` (assumed pseudo-legal): the piece moved, castling's rook, en passant's
 *  pawn taken, promotion, the rights and counters kept. */
export function play(p: Position, m: Move): Position {
  const b = [...p.board];
  const piece = b[m.from];
  const t = piece.toLowerCase();
  const taken = b[m.to];
  b[m.to] = piece;
  b[m.from] = "";
  if (t === "p" && m.to === p.ep) b[m.to + (p.turn === "w" ? 8 : -8)] = "";
  if (t === "p" && (m.to < 8 || m.to >= 56)) {
    const promo = m.promo ?? "q";
    b[m.to] = p.turn === "w" ? promo.toUpperCase() : promo;
  }
  if (t === "k" && Math.abs(m.to - m.from) === 2) {
    const rookFrom = m.to > m.from ? m.from + 3 : m.from - 4;
    const rookTo = m.to > m.from ? m.from + 1 : m.from - 1;
    b[rookTo] = b[rookFrom];
    b[rookFrom] = "";
  }
  let castle = p.castle === "-" ? "" : p.castle;
  const strip = (chars: string) => {
    for (const c of chars) castle = castle.replace(c, "");
  };
  if (piece === "K") strip("KQ");
  if (piece === "k") strip("kq");
  for (const [s, c] of [
    [63, "K"],
    [56, "Q"],
    [7, "k"],
    [0, "q"],
  ] as const)
    if (m.from === s || m.to === s) strip(c);
  return {
    board: b,
    turn: p.turn === "w" ? "b" : "w",
    castle: castle || "-",
    ep: t === "p" && Math.abs(m.to - m.from) === 16 ? (m.from + m.to) / 2 : -1,
    half: t === "p" || taken ? 0 : p.half + 1,
    full: p.turn === "b" ? p.full + 1 : p.full,
  };
}

/** Every legal move for the side to move. */
export function legalMoves(p: Position): Move[] {
  return pseudo(p).filter((m) => !inCheck(play(p, m), p.turn));
}

export type Outcome = "play" | "check" | "mate" | "stalemate" | "fifty" | "material";
/** Where the game stands for the side to move. */
export function outcome(p: Position): Outcome {
  const moves = legalMoves(p);
  const check = inCheck(p);
  if (!moves.length) return check ? "mate" : "stalemate";
  if (p.half >= 100) return "fifty";
  const left = p.board.filter((c) => c && c.toLowerCase() !== "k");
  if (!left.length || (left.length === 1 && "bn".includes(left[0].toLowerCase()))) return "material";
  return check ? "check" : "play";
}

/** A move asked for (from, to, promotion) if it's legal here, else null. */
export function legal(p: Position, from: number, to: number, promo = "q"): Move | null {
  const ms = legalMoves(p).filter((m) => m.from === from && m.to === to);
  if (!ms.length) return null;
  return ms.find((m) => !m.promo || m.promo === promo) ?? ms[0];
}
