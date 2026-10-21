// What a survivor carries (docs/plan/30-the-dark.md, D3): four quick slots
// (keys 1–4: a weapon or a stack, anything) and six pockets of stacks; the pages
// apart (phase 7). The server owns it and sends it only to its owner; it's saved
// through the API (`survivors`). Pure functions on plain data: the same on the
// server, the client and in tests.

export const WEAPONS = {
  revolver: { mag: 6, ammo: "r38" },
  shotgun: { mag: 2, ammo: "shell" },
} as const;
export type WeaponId = keyof typeof WEAPONS;

/** How many go in one pocket (or quick slot). */
export const STACKS = { r38: 24, shell: 12, flare: 3, battery: 2, aid: 2, fuse: 4 } as const;
export type StackId = keyof typeof STACKS;
export type ItemId = WeaponId | StackId;

export const POCKETS = 6;
export const QUICK = 4;
export const PAGES_MAX = 200;
/** drop / use / move slots: the pockets 0–5, then the quick slots 6–9 (keys 1–4) */
export const QUICK_SLOT = POCKETS;
/** what a use takes one of (the rest: ammo by a reload, flares thrown, fuses for later) */
export const USABLE = ["aid", "battery"] as const satisfies readonly StackId[];

export interface Weapon {
  id: WeaponId;
  loaded: number;
}
export interface Stack {
  id: StackId;
  n: number;
}
export type Item = Weapon | Stack;
export interface Inventory {
  quick: (Item | null)[]; // QUICK: weapons go only here
  pockets: (Stack | null)[]; // POCKETS
  pages: string[];
}

export const isWeapon = (id: unknown): id is WeaponId => typeof id === "string" && Object.hasOwn(WEAPONS, id);
export const isStack = (id: unknown): id is StackId => typeof id === "string" && Object.hasOwn(STACKS, id);
export const isUsable = (id: unknown): id is (typeof USABLE)[number] => (USABLE as readonly unknown[]).includes(id);
const stackOf = (it: Item | null | undefined): Stack | null => (it && isStack(it.id) ? (it as Stack) : null);
const weaponOf = (it: Item | null | undefined): Weapon | null => (it && isWeapon(it.id) ? (it as Weapon) : null);
const quickSlot = (i: number) => i >= QUICK_SLOT && i < QUICK_SLOT + QUICK;

export const emptyInventory = (): Inventory => ({
  quick: Array.from({ length: QUICK }, () => null),
  pockets: Array.from({ length: POCKETS }, () => null),
  pages: [],
});

/** What's in a slot (pockets 0–5, quick 6–9): null empty, undefined no such slot. */
export function slotAt(inv: Inventory, slot: number): Item | null | undefined {
  if (!Number.isInteger(slot)) return undefined;
  if (slot >= 0 && slot < POCKETS) return inv.pockets[slot];
  if (quickSlot(slot)) return inv.quick[slot - QUICK_SLOT];
  return undefined;
}
function put(inv: Inventory, slot: number, it: Item | null): void {
  if (slot < POCKETS) inv.pockets[slot] = it as Stack | null;
  else inv.quick[slot - QUICK_SLOT] = it;
}
/** Every slot, pockets first then the quick slots, with what's in it. */
const slots = (inv: Inventory) => [
  ...inv.pockets.map((it, i) => ({ it: it as Item | null, i })),
  ...inv.quick.map((it, i) => ({ it, i: QUICK_SLOT + i })),
];

/** The first slot with a stack of `id` (pockets first), or -1. */
export const findStack = (inv: Inventory, id: StackId): number => slots(inv).find((e) => e.it?.id === id)?.i ?? -1;

/** How many of a stack are carried, pockets and quick slots together. */
export function count(inv: Inventory, id: StackId): number {
  let n = 0;
  for (const { it } of slots(inv)) if (it?.id === id) n += (it as Stack).n;
  return n;
}

export const hasWeapon = (inv: Inventory, id: WeaponId) => inv.quick.some((w) => w?.id === id);
/** The weapon of that kind carried, or null. */
export const weaponIn = (inv: Inventory, id: string): Weapon | null => weaponOf(inv.quick.find((w) => w?.id === id));

/** Put `n` of a stack away: topping up the ones there, then empty pockets, then
 *  empty quick slots. Returns how many went in (the rest stays where it was). */
export function addStack(inv: Inventory, id: StackId, n: number): number {
  let left = Math.max(0, Math.floor(n));
  const cap = STACKS[id];
  for (const { it } of slots(inv)) {
    if (!left) break;
    const s = stackOf(it);
    if (s?.id !== id || s.n >= cap) continue;
    const k = Math.min(left, cap - s.n);
    s.n += k;
    left -= k;
  }
  for (const { it, i } of slots(inv)) {
    if (!left) break;
    if (it) continue;
    const k = Math.min(left, cap);
    put(inv, i, { id, n: k });
    left -= k;
  }
  return Math.max(0, Math.floor(n)) - left;
}

/** Take up to `n` of a stack out (the fullest last, pockets or quick). Returns how many. */
export function takeStack(inv: Inventory, id: StackId, n: number): number {
  let left = Math.max(0, Math.floor(n));
  const order = slots(inv)
    .filter((e) => e.it?.id === id)
    .sort((a, b) => (a.it as Stack).n - (b.it as Stack).n);
  for (const { it, i } of order) {
    const s = it as Stack;
    if (!left) break;
    const k = Math.min(left, s.n);
    s.n -= k;
    left -= k;
    if (!s.n) put(inv, i, null);
  }
  return Math.max(0, Math.floor(n)) - left;
}

/** Pick up a weapon (with what's in it): into a free quick slot; one of a kind
 *  already carried (or no slot free), its rounds go to the pockets instead (what
 *  doesn't fit is left in it). Returns what's left over: null (all taken) or the weapon. */
export function addWeapon(inv: Inventory, w: Weapon): Weapon | null {
  const loaded = Math.max(0, Math.min(WEAPONS[w.id].mag, Math.floor(w.loaded)));
  if (!hasWeapon(inv, w.id)) {
    const i = inv.quick.indexOf(null);
    if (i >= 0) {
      inv.quick[i] = { id: w.id, loaded };
      return null;
    }
  }
  const took = loaded ? addStack(inv, WEAPONS[w.id].ammo, loaded) : 0;
  return { id: w.id, loaded: loaded - took };
}

/** Take something found (a search, a drop): how much of it went in. A weapon
 *  is `n` 1 with `loaded` rounds in it. */
export function addItem(inv: Inventory, it: { id: ItemId; n: number; loaded?: number }): number {
  if (isWeapon(it.id)) return addWeapon(inv, { id: it.id, loaded: it.loaded ?? 0 }) === null ? 1 : 0;
  return addStack(inv, it.id, it.n);
}

/** A drag (docs/plan/30-the-dark.md, the inventory): onto the same stack, topped
 *  up to its cap (the rest stays); else the two swap — so long as a weapon only
 *  ever lands in a quick slot. True if anything moved. */
export function moveSlot(inv: Inventory, from: number, to: number): boolean {
  if (from === to) return false;
  const a = slotAt(inv, from);
  const b = slotAt(inv, to);
  if (!a || b === undefined) return false;
  const sa = stackOf(a);
  const sb = stackOf(b);
  if (sa && sb && sa.id === sb.id) {
    const k = Math.min(sa.n, STACKS[sa.id] - sb.n);
    if (k <= 0) return false;
    sb.n += k;
    sa.n -= k;
    if (!sa.n) put(inv, from, null);
    return true;
  }
  if ((weaponOf(a) && !quickSlot(to)) || (weaponOf(b) && !quickSlot(from))) return false;
  put(inv, from, b);
  put(inv, to, a);
  return true;
}

/** Take something into a chosen slot first (empty, or the same stack with room;
 *  a weapon only into a quick slot), the rest as `addItem` puts it. How much went in. */
export function addItemTo(inv: Inventory, slot: number, it: { id: ItemId; n: number; loaded?: number }): number {
  const at = slotAt(inv, slot);
  if (isWeapon(it.id)) {
    if (quickSlot(slot) && at === null && !hasWeapon(inv, it.id)) {
      put(inv, slot, { id: it.id, loaded: Math.max(0, Math.min(WEAPONS[it.id].mag, Math.floor(it.loaded ?? 0))) });
      return 1;
    }
    return addItem(inv, it);
  }
  let n = Math.max(0, Math.floor(it.n));
  let took = 0;
  const s = stackOf(at);
  if (at === null) {
    const k = Math.min(n, STACKS[it.id]);
    put(inv, slot, { id: it.id, n: k });
    took = k;
  } else if (s && s.id === it.id) {
    const k = Math.min(n, STACKS[it.id] - s.n);
    s.n += k;
    took = k;
  }
  n -= took;
  return took + (n ? addStack(inv, it.id, n) : 0);
}

/** Take a slot out (to drop it): pockets 0–5, quick 6–9. */
export function removeSlot(inv: Inventory, slot: number): Item | null {
  const it = slotAt(inv, slot);
  if (!it) return null;
  put(inv, slot, null);
  return it;
}

/** Used up by a use: one of a stack in `slot` (aid, battery), or null. */
export function consume(inv: Inventory, slot: number, usable: readonly StackId[] = USABLE): StackId | null {
  const s = stackOf(slotAt(inv, slot));
  if (!s || !usable.includes(s.id)) return null;
  s.n--;
  if (!s.n) put(inv, slot, null);
  return s.id;
}

/** Whatever came from the API or a client, as a sound inventory: unknown ids
 *  gone, counts within their caps, one weapon of a kind (an old save's two
 *  `weapons` are its first two quick slots). */
export function cleanInventory(x: unknown): Inventory {
  const o = (x ?? {}) as Record<string, unknown>;
  const inv = emptyInventory();
  const qs = Array.isArray(o.quick) ? o.quick : Array.isArray(o.weapons) ? o.weapons : [];
  for (let i = 0; i < QUICK; i++) {
    const it = qs[i] as Record<string, unknown> | null | undefined;
    if (!it) continue;
    if (isWeapon(it.id)) {
      if (hasWeapon(inv, it.id)) continue;
      inv.quick[i] = {
        id: it.id,
        loaded: Math.max(0, Math.min(WEAPONS[it.id].mag, Math.floor(Number(it.loaded) || 0))),
      };
    } else if (isStack(it.id)) {
      const n = Math.max(0, Math.min(STACKS[it.id], Math.floor(Number(it.n) || 0)));
      if (n) inv.quick[i] = { id: it.id, n };
    }
  }
  const ps = Array.isArray(o.pockets) ? o.pockets : [];
  for (let i = 0; i < POCKETS; i++) {
    const s = ps[i] as Record<string, unknown> | null | undefined;
    if (!s || !isStack(s.id)) continue;
    const n = Math.max(0, Math.min(STACKS[s.id], Math.floor(Number(s.n) || 0)));
    if (n) inv.pockets[i] = { id: s.id, n };
  }
  const pages = Array.isArray(o.pages) ? o.pages : [];
  inv.pages = [
    ...new Set(pages.filter((p): p is string => typeof p === "string" && /^[a-z0-9-]{1,32}$/.test(p))),
  ].slice(0, PAGES_MAX);
  return inv;
}
