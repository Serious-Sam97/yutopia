import type { GroundsEdits } from "@yutopia/shared/grounds-edits";
import { api } from "@/lib/api";

// The Grounds (shared grounds.ts, docs/plan/27-the-grounds.md): the land round
// the ground floor, generated here as on the server. Fetched once when the
// world starts (not in the page: it's a few KB of code that makes the land).
// God mode's edits as published (docs/plan/53-the-god-mode.md) are laid on it
// before anyone has it: the room says which revision is live (`groundsRev`),
// the API hands the edits over. In god mode an admin's draft is laid here instead (`layDraft`),
// for them alone: what's published since is handed to god mode (`onPublished`) to be merged in.
type Grounds = typeof import("@yutopia/shared/grounds");
let mod: Grounds | null = null;
let loading: Promise<Grounds> | null = null;
// the revision the room has live, and the one laid here
let want = 0;
let laid = 0;
let laying: Promise<void> | null = null;
const laidListeners = new Set<(rev: number) => void>();
// what's published (the last fetched), and the draft laid over the generated instead (god mode's)
let published: GroundsEdits = { rev: 0 };
let draft: GroundsEdits | null = null;
let laidCount = 0;
const publishedListeners = new Set<(e: GroundsEdits) => void>();

export function loadGrounds(): Promise<Grounds> {
  loading ??= import("@yutopia/shared/grounds").then(async (m) => {
    await layWanted(m);
    mod = m;
    return m;
  });
  return loading;
}

// The module if it's here (null while it loads: the ground floor ends at its tiles).
export function grounds(): Grounds | null {
  return mod;
}

/** The room has this revision of god mode's edits live: lay it (now, or once the Grounds load). */
export function wantEdits(rev: number): void {
  want = rev;
  if (mod) void layWanted(mod);
}
/** Lay these edits as they are (offline: the world server sends them itself). */
export function layEdits(edits: GroundsEdits): void {
  want = edits.rev;
  void (async () => {
    const m = await loadGrounds();
    gotPublished(m, edits);
  })();
}
/** The revision published and laid here (0: none). */
export function editsLaid(): number {
  return laid;
}
/** How many times edits were laid here (a draft's each change too): what's drawn of them is of
 *  this one. */
export function layings(): number {
  return laidCount;
}
/** What's published, as last fetched. */
export function publishedEdits(): GroundsEdits {
  return published;
}
/** God mode: lay this draft over the generated Grounds instead of what's published, for me alone
 *  (null: what's published again). */
export function layDraft(d: GroundsEdits | null): void {
  draft = d;
  void loadGrounds().then((m) => {
    m.applyEdits(draft ?? published);
    done(published.rev);
  });
}
/** Told what's published each time a revision's fetched while a draft is laid (god mode merges it
 *  in, and lays the draft again). */
export function onPublished(f: (e: GroundsEdits) => void): () => void {
  publishedListeners.add(f);
  return () => publishedListeners.delete(f);
}
/** Told each time a revision's laid (what's drawn from the Grounds makes itself again). */
export function onEditsLaid(f: (rev: number) => void): () => void {
  laidListeners.add(f);
  return () => laidListeners.delete(f);
}

function done(rev: number) {
  laid = rev;
  laidCount++;
  for (const f of laidListeners) f(rev);
}
function gotPublished(m: Grounds, edits: GroundsEdits) {
  published = edits;
  if (draft) {
    // (a draft's laid: god mode merges this into it and lays it again)
    laid = edits.rev;
    for (const f of publishedListeners) f(edits);
    return;
  }
  m.applyEdits(edits);
  done(edits.rev);
}
function layWanted(m: Grounds): Promise<void> {
  laying ??= (async () => {
    try {
      // (again while the room's moved on since the last fetch)
      while (laid !== want) {
        const asked = want;
        const edits: GroundsEdits = asked ? (await api<{ edits: GroundsEdits }>("/api/world/edits")).edits : { rev: 0 };
        gotPublished(m, edits);
        if (want === asked) want = edits.rev;
      }
    } catch (e) {
      console.warn("[grounds] god mode's edits not laid:", e);
    } finally {
      laying = null;
    }
  })();
  return laying;
}
