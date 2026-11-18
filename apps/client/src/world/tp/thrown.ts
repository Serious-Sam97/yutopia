// (plan 99 F1a) People thrown out of a moving car: by their session id, the velocity they left it at (the scene's x,
// up, the floor's y — m/s) and when (performance.now). Filled by the cars (the server's `car:thrown`), read once by
// their person's model, which goes limp on the ragdoll at that speed and gets up where it lies.
export const thrown = new Map<string, { v: [number, number, number]; at: number }>();
