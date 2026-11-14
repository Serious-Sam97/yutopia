// What a survivor carries (docs/plan/30-the-dark.md, D3): four quick slots
// (a weapon or a stack, anything), eight pockets — the pack (plan 85: a stack, or a
// weapon carried but not equipped: in a pocket it's in no hand and worn nowhere on
// her) — and the left hand (plan 87: key 1, anything but a weapon; the torch lights
// only from there); the pages apart (phase 7). The server owns it and sends it only
// to its owner; it's saved through the API (`survivors`). Pure functions on plain
// data: the same on the server, the client and in tests.

export const WEAPONS = {
  revolver: { mag: 6, ammo: "r38" },
  shotgun: { mag: 2, ammo: "shell" },
  ak47: { mag: 30, ammo: "r762" },
  sniper: { mag: 5, ammo: "r308" },
  daybreak: { mag: 3, ammo: "cell" },
} as const;
export type WeaponId = keyof typeof WEAPONS;

/** How many go in one pocket (or quick slot). */
export const STACKS = {
  r38: 24,
  shell: 12,
  r762: 60,
  r308: 15,
  cell: 3,
  flare: 3,
  battery: 2,
  aid: 2,
  fuse: 4,
  // (plan 87) the torch: an item, one of a kind — it lights only from the left hand
  torch: 1,
} as const;
export type StackId = keyof typeof STACKS;
export type ItemId = WeaponId | StackId;

// (plan 86 F4a: the pack's 8 pockets — was 6; the quick slots' numbers follow them: 8–11)
export const POCKETS = 8;
export const QUICK = 4;
export const PAGES_MAX = 200;
/** drop / use / move slots: the pockets 0–7, then the quick slots 8–11, then the left hand 12 (plan 87) */
export const QUICK_SLOT = POCKETS;
/** (plan 87) the left hand's slot: key 1 — anything but a weapon (a weapon takes both hands) */
export const HAND_SLOT = POCKETS + QUICK;
/** (plan 87) carried one at a time: a second isn't taken */
export const ONE_OF = ["torch"] as const satisfies readonly StackId[];
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
  quick: (Item | null)[]; // QUICK: equipped — a weapon here is drawn by its key and worn (on her back, her hip)
  pockets: (Item | null)[]; // POCKETS: the pack — a weapon here is only carried (plan 85)
  hand: Item | null; // (plan 87) the left hand, key 1: the torch lit from here, anything else used by 1
  pages: string[];
}

export const isWeapon = (id: unknown): id is WeaponId => typeof id === "string" && Object.hasOwn(WEAPONS, id);
export const isStack = (id: unknown): id is StackId => typeof id === "string" && Object.hasOwn(STACKS, id);
export const isUsable = (id: unknown): id is (typeof USABLE)[number] => (USABLE as readonly unknown[]).includes(id);
const stackOf = (it: Item | null | undefined): Stack | null => (it && isStack(it.id) ? (it as Stack) : null);
const weaponOf = (it: Item | null | undefined): Weapon | null => (it && isWeapon(it.id) ? (it as Weapon) : null);
const quickSlot = (i: number) => i >= QUICK_SLOT && i < QUICK_SLOT + QUICK;
const oneOf = (id: unknown) => (ONE_OF as readonly unknown[]).includes(id);

export const emptyInventory = (): Inventory => ({
  quick: Array.from({ length: QUICK }, () => null),
  pockets: Array.from({ length: POCKETS }, () => null),
  hand: null,
  pages: [],
});

/** What's in a slot (pockets 0–7, quick 8–11, the left hand 12): null empty, undefined no such slot. */
export function slotAt(inv: Inventory, slot: number): Item | null | undefined {
  if (!Number.isInteger(slot)) return undefined;
  if (slot >= 0 && slot < POCKETS) return inv.pockets[slot];
  if (quickSlot(slot)) return inv.quick[slot - QUICK_SLOT];
  if (slot === HAND_SLOT) return inv.hand ?? null;
  return undefined;
}
function put(inv: Inventory, slot: number, it: Item | null): void {
  if (slot === HAND_SLOT) inv.hand = it;
  else if (slot < POCKETS) inv.pockets[slot] = it;
  else inv.quick[slot - QUICK_SLOT] = it;
}
/** (plan 87) What a slot takes: the left hand anything but a weapon; a quick slot anything but the torch (it lights
 *  only from the left hand); a pocket anything. */
export function fits(slot: number, id: ItemId): boolean {
  if (slot === HAND_SLOT) return !isWeapon(id);
  if (quickSlot(slot)) return id !== "torch";
  return slot >= 0 && slot < POCKETS;
}
/** Every slot, pockets first, then the quick slots, then the left hand, with what's in it. */
const slots = (inv: Inventory) => [
  ...inv.pockets.map((it, i) => ({ it, i })),
  ...inv.quick.map((it, i) => ({ it, i: QUICK_SLOT + i })),
  { it: inv.hand ?? null, i: HAND_SLOT },
];

/** The first slot with a stack of `id` (pockets first), or -1. */
export const findStack = (inv: Inventory, id: StackId): number => slots(inv).find((e) => e.it?.id === id)?.i ?? -1;

/** How many of a stack are carried, pockets, quick slots and the left hand together. */
export function count(inv: Inventory, id: StackId): number {
  let n = 0;
  for (const { it } of slots(inv)) if (it?.id === id) n += (it as Stack).n;
  return n;
}

/** (plan 85) A weapon of that kind carried anywhere — equipped or in the pack: one of a kind, the kit, the lockers. */
export const carries = (inv: Inventory, id: WeaponId) => slots(inv).some((e) => e.it?.id === id);
/** The weapon of that kind equipped — in a quick slot: the one she can hold, the one she wears — or null (one only
 *  in the pack isn't). */
export const weaponIn = (inv: Inventory, id: string): Weapon | null => weaponOf(inv.quick.find((w) => w?.id === id));
/** (plan 85) The first empty quick slot (a slot number, 6–9), or -1. */
export const freeQuick = (inv: Inventory): number => {
  const i = inv.quick.indexOf(null);
  return i < 0 ? -1 : QUICK_SLOT + i;
};

/** Put `n` of a stack away: topping up the ones there (the left hand's too), then empty pockets, then empty quick
 *  slots — never the left hand, but the torch: the left hand first, then the pack, one only (plan 87). Returns how
 *  many went in (the rest stays where it was). */
export function addStack(inv: Inventory, id: StackId, n: number): number {
  if (oneOf(id)) {
    if (n < 1 || count(inv, id) > 0) return 0;
    const at = inv.hand ? inv.pockets.indexOf(null) : HAND_SLOT;
    if (at < 0) return 0;
    put(inv, at, { id, n: 1 });
    return 1;
  }
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
    if (it || i === HAND_SLOT) continue;
    const k = Math.min(left, cap);
    put(inv, i, { id, n: k });
    left -= k;
  }
  return Math.max(0, Math.floor(n)) - left;
}

/** Take up to `n` of a stack out (the fullest last, pockets, quick or the left hand). Returns how many. */
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

/** Pick up a weapon (with what's in it): into a free quick slot — none free, into a
 *  free pocket (plan 85 F1a: carried, not equipped); one of a kind already carried
 *  (or no slot free at all), its rounds go to the pockets instead (what doesn't fit
 *  is left in it). Returns what's left over: null (all taken) or the weapon. */
export function addWeapon(inv: Inventory, w: Weapon): Weapon | null {
  const loaded = Math.max(0, Math.min(WEAPONS[w.id].mag, Math.floor(w.loaded)));
  if (!carries(inv, w.id)) {
    const i = inv.quick.indexOf(null);
    if (i >= 0) {
      inv.quick[i] = { id: w.id, loaded };
      return null;
    }
    const p = inv.pockets.indexOf(null);
    if (p >= 0) {
      inv.pockets[p] = { id: w.id, loaded };
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
 *  up to its cap (the rest stays); else the two swap — a weapon into a pocket too
 *  (plan 85: out of her hand, worn nowhere). True if anything moved. */
export function moveSlot(inv: Inventory, from: number, to: number): boolean {
  if (from === to) return false;
  const a = slotAt(inv, from);
  const b = slotAt(inv, to);
  if (!a || b === undefined) return false;
  // (plan 87: each where it fits — no weapon into the left hand, no torch into a quick slot — a swap both ways)
  if (!fits(to, a.id) || (b && !fits(from, b.id))) return false;
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
  put(inv, from, b);
  put(inv, to, a);
  return true;
}

/** Take something into a chosen slot first (empty, or the same stack with room; a
 *  weapon into an empty one — a quick slot or a pocket, plan 85), the rest as
 *  `addItem` puts it. How much went in. */
export function addItemTo(inv: Inventory, slot: number, it: { id: ItemId; n: number; loaded?: number }): number {
  const at = slotAt(inv, slot);
  // (plan 87: not where it doesn't fit — as addItem puts it; one of a kind, as addStack takes it)
  if (at === undefined || !fits(slot, it.id) || oneOf(it.id)) {
    if (oneOf(it.id) && at === null && fits(slot, it.id) && count(inv, it.id as StackId) < 1) {
      put(inv, slot, { id: it.id as StackId, n: 1 });
      return 1;
    }
    return addItem(inv, it);
  }
  if (isWeapon(it.id)) {
    if (at === null && !carries(inv, it.id)) {
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

/** Take a slot out (to drop it): the pockets, then the quick slots. */
export function removeSlot(inv: Inventory, slot: number): Item | null {
  const it = slotAt(inv, slot);
  if (!it) return null;
  put(inv, slot, null);
  return it;
}

/** (plan 86) Take `n` out of a slot (to drop some): `n` of a stack — all of it if that's as many or more, or no `n`
 *  — or the weapon there. What came out, or null. */
export function takeSlot(inv: Inventory, slot: number, n?: number): Item | null {
  const it = slotAt(inv, slot);
  if (!it) return null;
  const s = stackOf(it);
  const k = n === undefined ? Number.POSITIVE_INFINITY : Math.floor(n);
  if (!s || k >= s.n) return removeSlot(inv, slot);
  if (!(k >= 1)) return null;
  s.n -= k;
  return { id: s.id, n: k };
}

/** (plan 86) A stack split: `n` of it (half, rounded down, if none given) into another slot — empty, or the same
 *  stack with room (topped up). How many moved. */
export function splitSlot(inv: Inventory, from: number, to: number, n?: number): number {
  if (from === to) return 0;
  const s = stackOf(slotAt(inv, from));
  const at = slotAt(inv, to);
  if (!s || at === undefined || !fits(to, s.id)) return 0;
  const want = Math.min(s.n, Math.floor(n ?? s.n / 2));
  if (!(want >= 1)) return 0;
  const there = stackOf(at);
  let k = 0;
  if (at === null) {
    k = Math.min(want, STACKS[s.id]);
    put(inv, to, { id: s.id, n: k });
  } else if (there && there.id === s.id) {
    k = Math.min(want, STACKS[s.id] - there.n);
    there.n += k;
  }
  if (k <= 0) return 0;
  s.n -= k;
  if (!s.n) put(inv, from, null);
  return k;
}

/** (plan 86) The pack put in order — the quick slots left as they are: like stacks topped up into one another,
 *  then the weapons first (the guns' order), then the rounds (their guns' order), then the things to use. True if
 *  anything moved. */
const ORDER: ItemId[] = [
  ...(Object.keys(WEAPONS) as WeaponId[]),
  "torch",
  ...(Object.values(WEAPONS).map((w) => w.ammo) as StackId[]),
  "aid",
  "battery",
  "flare",
  "fuse",
];
export function organize(inv: Inventory): boolean {
  const before = JSON.stringify(inv.pockets);
  // (like stacks topped up, the fuller first)
  const items = inv.pockets.filter((it): it is Item => !!it);
  const merged: Item[] = [];
  for (const it of items) {
    const s = stackOf(it);
    if (!s) {
      merged.push({ ...it });
      continue;
    }
    let left = s.n;
    for (const m of merged) {
      const ms = stackOf(m);
      if (!left || !ms || ms.id !== s.id || ms.n >= STACKS[s.id]) continue;
      const k = Math.min(left, STACKS[s.id] - ms.n);
      ms.n += k;
      left -= k;
    }
    if (left) merged.push({ id: s.id, n: left });
  }
  const rank = (it: Item) => {
    const i = ORDER.indexOf(it.id);
    return i < 0 ? ORDER.length : i;
  };
  merged.sort((a, b) => rank(a) - rank(b) || ("n" in b ? b.n : 0) - ("n" in a ? a.n : 0));
  inv.pockets = Array.from({ length: POCKETS }, (_, i) => merged[i] ?? null);
  return JSON.stringify(inv.pockets) !== before;
}

/** (plan 87 F4a) A torch for one who carries none — into the left hand if it's free, else the pack. True if given. */
export const giveTorch = (inv: Inventory): boolean => addStack(inv, "torch", 1) === 1;
/** (plan 87) The torch into the left hand — one given if none is carried; what the hand held swapped out to where the
 *  torch was. True if the torch is in the left hand after. (An admin's refill: ready to try the dark.) */
export function torchToHand(inv: Inventory): boolean {
  if (count(inv, "torch") < 1) giveTorch(inv);
  const at = findStack(inv, "torch");
  if (at < 0) return false;
  if (at !== HAND_SLOT) moveSlot(inv, at, HAND_SLOT);
  return inv.hand?.id === "torch";
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
 *  gone, counts within their caps, one weapon of a kind — the quick slots and the
 *  pockets together, the quick slots' first (an old save's two `weapons` are its
 *  first two quick slots). */
export function cleanInventory(x: unknown): Inventory {
  const o = (x ?? {}) as Record<string, unknown>;
  const inv = emptyInventory();
  // (plan 87) the left hand first: a stack (the torch), never a weapon
  const h = o.hand as Record<string, unknown> | null | undefined;
  if (h && isStack(h.id)) {
    const n = Math.max(0, Math.min(STACKS[h.id], Math.floor(Number(h.n) || 0)));
    if (n) inv.hand = { id: h.id, n };
  }
  const stray: StackId[] = [];
  const qs = Array.isArray(o.quick) ? o.quick : Array.isArray(o.weapons) ? o.weapons : [];
  for (let i = 0; i < QUICK; i++) {
    const it = qs[i] as Record<string, unknown> | null | undefined;
    if (!it) continue;
    if (isWeapon(it.id)) {
      if (carries(inv, it.id)) continue;
      inv.quick[i] = {
        id: it.id,
        loaded: Math.max(0, Math.min(WEAPONS[it.id].mag, Math.floor(Number(it.loaded) || 0))),
      };
    } else if (isStack(it.id)) {
      // (a torch in a quick slot: to the pack, after — it lights only from the left hand)
      if (it.id === "torch") stray.push(it.id);
      const n = Math.max(0, Math.min(STACKS[it.id], Math.floor(Number(it.n) || 0)));
      if (n && it.id !== "torch") inv.quick[i] = { id: it.id, n };
    }
  }
  const ps = Array.isArray(o.pockets) ? o.pockets : [];
  for (let i = 0; i < POCKETS; i++) {
    const s = ps[i] as Record<string, unknown> | null | undefined;
    if (!s) continue;
    // (plan 85: a weapon in the pack — one of a kind)
    if (isWeapon(s.id)) {
      if (carries(inv, s.id)) continue;
      inv.pockets[i] = {
        id: s.id,
        loaded: Math.max(0, Math.min(WEAPONS[s.id].mag, Math.floor(Number(s.loaded) || 0))),
      };
      continue;
    }
    if (!isStack(s.id)) continue;
    if (oneOf(s.id) && count(inv, s.id) > 0) continue;
    const n = Math.max(0, Math.min(STACKS[s.id], Math.floor(Number(s.n) || 0)));
    if (n) inv.pockets[i] = { id: s.id, n };
  }
  for (const id of stray) addStack(inv, id, 1);
  const pages = Array.isArray(o.pages) ? o.pages : [];
  inv.pages = [
    ...new Set(pages.filter((p): p is string => typeof p === "string" && /^[a-z0-9-]{1,32}$/.test(p))),
  ].slice(0, PAGES_MAX);
  return inv;
}
