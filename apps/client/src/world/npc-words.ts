// The cast's words on the wire (docs/plan/120-god-mode-npcs.md): an NPC's role and lines come as EN, or EN and PT
// joined by \u001f (shared npc/cast.ts biOf). Copies of shared biIn and npcLabel, so the world page doesn't take in
// the cast's module (npc-words.test.ts: they agree).

/** One language out of an EN|PT string (PT empty: EN). */
export function biIn(s: string, pt: boolean): string {
  const i = s.indexOf("\u001f");
  if (i < 0) return s;
  const p = s.slice(i + 1);
  return pt && p ? p : s.slice(0, i);
}

/** How they're named over their head: "Name · Role", or whichever they have. */
export function npcLabel(name: string, role: string): string {
  return name && role ? `${name} · ${role}` : name || role;
}
