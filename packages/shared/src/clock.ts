// The world's hour (docs/plan/30-the-dark.md, D1): the real clock in São Paulo,
// the same for everyone. The server reads it and puts it in the room's state
// each second (an admin can set another); both views, Vortex and the pets go
// by that, never by the clock of the machine they run on.

export const SP_OFFSET_H = -3; // UTC−3: Brazil has kept no daylight saving since 2019

/** The hour in São Paulo at `ms` (epoch ms), 0 ≤ h < 24, minutes and seconds
 *  as its fraction. (Plain arithmetic: it's read every second; the server
 *  checks it against Intl once at boot.) */
export function spHour(ms: number): number {
  const h = (ms / 3_600_000 + SP_OFFSET_H) % 24;
  return h < 0 ? h + 24 : h;
}
