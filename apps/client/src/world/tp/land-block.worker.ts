// The streamed land's blocks worked out off the main thread (land-block.ts; grounds-stream.ts asks).
// This worker's Grounds are its own: god mode's edits and the Kart Park's layout come with an ask
// when they've changed since its last.
import { applyEdits, kartLayoutNow, setChunkCap, setParkLayout } from "@yutopia/shared/grounds";
import { type GroundsEdits, NO_EDITS } from "@yutopia/shared/grounds-edits";
import { type BlockAsk, blockBuffers, blockData } from "./land-block";
import { type PieceAsk, pieceBuffers, pieceData } from "./way-piece";

/** (a warm-up: the edits laid, nothing made) */
export interface LandWarm {
  warm: true;
  v: number;
  edits?: GroundsEdits | null;
  park?: { key: string; reverse: boolean };
}
export interface LandBlockAsk extends BlockAsk {
  /** the main thread's edits version */
  v: number;
  /** the edits, when they changed (null: none laid) */
  edits?: GroundsEdits | null;
  park?: { key: string; reverse: boolean };
}

/** A district's road piece (way-piece.ts: plan 91 phase 3), as an ask is. */
export interface LandPieceAsk extends PieceAsk {
  v: number;
  edits?: GroundsEdits | null;
  park?: { key: string; reverse: boolean };
}

// (its own chunks: those of the near blocks, ~16 MB)
setChunkCap(600);
self.onmessage = (e: MessageEvent<LandBlockAsk | LandPieceAsk | LandWarm>) => {
  const a = e.data;
  if (a.edits !== undefined) applyEdits(a.edits ?? NO_EDITS);
  if (a.park) {
    const now = kartLayoutNow();
    if (now.key !== a.park.key || now.reverse !== a.park.reverse) setParkLayout(a.park.key, a.park.reverse);
  }
  if ("warm" in a) return;
  if ("way" in a) {
    const p = pieceData(a, a.v);
    (self as unknown as Worker).postMessage(p, pieceBuffers(p));
    return;
  }
  const d = blockData(a, a.v);
  (self as unknown as Worker).postMessage(d, blockBuffers(d));
};
