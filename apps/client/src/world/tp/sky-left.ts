// What's left of the sky's light (the sun or moon, and its fill) out under it: 1, and in the
// pitch dark next to none (docs/plan/44-the-night.md; sky.ts sets it by the hour). A shared
// uniform for what's outside and lit by the scene's own sun and sky — the campus
// (light3d.ts patchOutdoors), the cars (car/sedan.ts wearable) — so the lamps', the
// headlights' and the torches' light on them stay. Its own module: the cars' chunk takes it
// without the light map.
export const skyLeft = { value: 1 };
