// What a survivor carries (docs/plan/30-the-dark.md, D3): two weapons and six
// pockets of stacks; the pages apart (phase 7). The server owns it and sends
// it only to its owner; it's saved through the API (`survivors`). Pure
// functions on plain data: the same on the server, the client and in tests.

export const WEAPONS = {
  revolver: { mag: 6, ammo: "r38" },
  shotgun: { mag: 2, ammo: "shell" },
} as const;
export type WeaponId = keyof typeof WEAPONS;

/** How many go in one pocket. */
export const STACKS = { r38: 24, shell: 12, flare: 3, battery: 2, aid: 2, fuse: 4 } as const;
export type StackId = keyof typeof STACKS;
export type ItemId = WeaponId | StackId;

export const POCKETS = 6;
export const PAGES_MAX = 200;
/** drop / use slots: the pockets 0–5, then the weapons 6–7 */
export const WEAPON_SLOT = POCKETS;

export interface Weapon {
  id: WeaponId;
  loaded: number;
}
export interface Stack {
  id: StackId;
  n: number;
}
export interface Inventory {
  weapons: (Weapon | null)[]; // 2
  pockets: (Stack | null)[]; // POCKETS
  pages: string[];
}

export const isWeapon = (id: unknown): id is WeaponId => typeof id === "string" && Object.hasOwn(WEAPONS, id);
export const isStack = (id: unknown): id is StackId => typeof id === "string" && Object.hasOwn(STACKS, id);

export const emptyInventory = (): Inventory => ({
  weapons: [null, null],
  pockets: Array.from({ length: POCKETS }, () => null),
  pages: [],
});

/** How many of a stack are carried, all pockets together. */
export function count(inv: Inventory, id: StackId): number {
  let n = 0;
  for (const s of inv.pockets) if (s?.id === id) n += s.n;
  return n;
}

export const hasWeapon = (inv: Inventory, id: WeaponId) => inv.weapons.some((w) => w?.id === id);

/** Put `n` of a stack in the pockets: topping up the ones there, then empty
 *  pockets. Returns how many went in (the rest stays where it was). */
export function addStack(inv: Inventory, id: StackId, n: number): number {
  let left = Math.max(0, Math.floor(n));
  const cap = STACKS[id];
  for (const s of inv.pockets) {
    if (!left) break;
    if (s?.id !== id || s.n >= cap) continue;
    const k = Math.min(left, cap - s.n);
    s.n += k;
    left -= k;
  }
  for (let i = 0; i < inv.pockets.length && left; i++) {
    if (inv.pockets[i]) continue;
    const k = Math.min(left, cap);
    inv.pockets[i] = { id, n: k };
    left -= k;
  }
  return Math.max(0, Math.floor(n)) - left;
}

/** Take up to `n` of a stack out of the pockets (the fullest last). Returns how many. */
export function takeStack(inv: Inventory, id: StackId, n: number): number {
  let left = Math.max(0, Math.floor(n));
  const order = inv.pockets
    .map((s, i) => ({ s, i }))
    .filter((e) => e.s?.id === id)
    .sort((a, b) => (a.s as Stack).n - (b.s as Stack).n);
  for (const { s, i } of order) {
    if (!left || !s) break;
    const k = Math.min(left, s.n);
    s.n -= k;
    left -= k;
    if (!s.n) inv.pockets[i] = null;
  }
  return Math.max(0, Math.floor(n)) - left;
}

/** Pick up a weapon (with what's in it): into a free weapon slot; one of a kind
 *  already carried, its rounds go to the pockets instead (what doesn't fit is
 *  left in it). Returns what's left over: null (all taken) or the weapon. */
export function addWeapon(inv: Inventory, w: Weapon): Weapon | null {
  const loaded = Math.max(0, Math.min(WEAPONS[w.id].mag, Math.floor(w.loaded)));
  if (!hasWeapon(inv, w.id)) {
    const i = inv.weapons.indexOf(null);
    if (i >= 0) {
      inv.weapons[i] = { id: w.id, loaded };
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

/** A drag in the pockets (docs/plan/30-the-dark.md, the inventory): pocket to
 *  pocket (the same stack: topped up to its cap, the rest stays; else they
 *  swap), weapon slot to weapon slot (they swap). Pockets and weapon slots
 *  don't mix. True if anything moved. */
export function moveSlot(inv: Inventory, from: number, to: number): boolean {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from === to) return false;
  const pocket = (i: number) => i >= 0 && i < POCKETS;
  const weapon = (i: number) => i >= WEAPON_SLOT && i < WEAPON_SLOT + inv.weapons.length;
  if (weapon(from) && weapon(to)) {
    const a = inv.weapons[from - WEAPON_SLOT];
    if (!a) return false;
    inv.weapons[from - WEAPON_SLOT] = inv.weapons[to - WEAPON_SLOT];
    inv.weapons[to - WEAPON_SLOT] = a;
    return true;
  }
  if (!pocket(from) || !pocket(to)) return false;
  const a = inv.pockets[from];
  const b = inv.pockets[to];
  if (!a) return false;
  if (b && b.id === a.id) {
    const k = Math.min(a.n, STACKS[a.id] - b.n);
    if (k <= 0) return false;
    b.n += k;
    a.n -= k;
    if (!a.n) inv.pockets[from] = null;
    return true;
  }
  inv.pockets[from] = b;
  inv.pockets[to] = a;
  return true;
}

/** Take something into a chosen slot first (a pocket for a stack, a weapon slot
 *  for a weapon: empty, or the same stack with room), the rest as `addItem`
 *  puts it. How much went in. */
export function addItemTo(inv: Inventory, slot: number, it: { id: ItemId; n: number; loaded?: number }): number {
  if (isWeapon(it.id)) {
    const i = slot - WEAPON_SLOT;
    if (i >= 0 && i < inv.weapons.length && !inv.weapons[i] && !hasWeapon(inv, it.id)) {
      inv.weapons[i] = { id: it.id, loaded: Math.max(0, Math.min(WEAPONS[it.id].mag, Math.floor(it.loaded ?? 0))) };
      return 1;
    }
    return addItem(inv, it);
  }
  let n = Math.max(0, Math.floor(it.n));
  let took = 0;
  const s = slot >= 0 && slot < POCKETS ? inv.pockets[slot] : undefined;
  if (s === null) {
    const k = Math.min(n, STACKS[it.id]);
    inv.pockets[slot] = { id: it.id, n: k };
    took = k;
  } else if (s && s.id === it.id) {
    const k = Math.min(n, STACKS[it.id] - s.n);
    s.n += k;
    took = k;
  }
  n -= took;
  return took + (n ? addStack(inv, it.id, n) : 0);
}

/** Take a slot out (to drop it): pockets 0–5, weapons 6–7. */
export function removeSlot(inv: Inventory, slot: number): Stack | Weapon | null {
  if (slot >= 0 && slot < POCKETS) {
    const s = inv.pockets[slot];
    inv.pockets[slot] = null;
    return s;
  }
  const w = inv.weapons[slot - WEAPON_SLOT];
  if (w === undefined) return null;
  inv.weapons[slot - WEAPON_SLOT] = null;
  return w;
}

/** The pockets used up by a use: one of a stack in `slot` (aid, battery), or null. */
export function consume(inv: Inventory, slot: number, usable: readonly StackId[]): StackId | null {
  const s = inv.pockets[slot];
  if (!s || !usable.includes(s.id)) return null;
  s.n--;
  if (!s.n) inv.pockets[slot] = null;
  return s.id;
}

/** Whatever came from the API or a client, as a sound inventory: unknown ids
 *  gone, counts within their caps, one weapon of a kind. */
export function cleanInventory(x: unknown): Inventory {
  const o = (x ?? {}) as Record<string, unknown>;
  const inv = emptyInventory();
  const ws = Array.isArray(o.weapons) ? o.weapons : [];
  for (let i = 0; i < 2; i++) {
    const w = ws[i] as Record<string, unknown> | null | undefined;
    if (!w || !isWeapon(w.id) || inv.weapons.some((v) => v?.id === w.id)) continue;
    inv.weapons[i] = { id: w.id, loaded: Math.max(0, Math.min(WEAPONS[w.id].mag, Math.floor(Number(w.loaded) || 0))) };
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
