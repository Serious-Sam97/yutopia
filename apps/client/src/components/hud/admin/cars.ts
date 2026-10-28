// The vehicles an admin can spawn and their colours (shared car/own.ts BUYABLE, PLATE_MAX; shared
// lot.ts CAR_COLOURS), copied: importing them from shared splits the Grounds' chunks anew
// (+7 KB to yutopia-grounds) — kept in step by cars.test.ts.
export const BUYABLE = ["sedan", "offroad", "pickup", "snowmobile", "snowcat", "tractor", "ploughtruck", "toboggan"];
export const PLATE_MAX = 8;
export const CAR_COLOURS = [0xcbbd98, 0x6b2430, 0x4a5a73, 0xe8e6df, 0x1f2124, 0x6a4a35, 0x8b8f93, 0x2f4a3b, 0xb8702a];
