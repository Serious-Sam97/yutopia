// Each map's own climate inside the arena's walls (docs/plan/115-the-strike-park-again.md, F3, F3b, F3d): step in and
// the sky, the hour, the weather and the ground are the map's — two hot, two wet, two snowy. Outside, the world's own.

export interface Climate {
  /** what it is (the Map Board's line) */
  name: string;
  /** the hour held inside (0–24) */
  hour: number;
  /** the weather's parts, as the view takes them (tp/sky.ts Ground; shared weather.ts) */
  storm: number;
  wind: number;
  cloud: number;
  rain: number;
  wet: number;
  puddles: number;
  /** snow lying (0–1) and falling (0–1) */
  snow: number;
  falling: number;
  temp: number;
  fog: number;
  /** the ground laid over the arena's pad: sand, mud (wet), none (the world's — snow's layer) */
  ground: "sand" | "mud" | "none";
}

export const CLIMATES: Record<string, Climate> = {
  freight: {
    name: "Hot · golden hour",
    hour: 18.1,
    storm: 0,
    wind: 0.15,
    cloud: 0.1,
    rain: 0,
    wet: 0,
    puddles: 0,
    snow: 0,
    falling: 0,
    temp: 33,
    fog: 0,
    ground: "sand",
  },
  range: {
    name: "Hot · desert noon",
    hour: 12.5,
    storm: 0,
    wind: 0.2,
    cloud: 0,
    rain: 0,
    wet: 0,
    puddles: 0,
    snow: 0,
    falling: 0,
    temp: 35,
    fog: 0,
    ground: "sand",
  },
  sawmill: {
    name: "Wet · autumn rain",
    hour: 16.8,
    storm: 0.35,
    wind: 0.45,
    cloud: 1,
    rain: 0.65,
    wet: 0.85,
    puddles: 0.6,
    snow: 0,
    falling: 0,
    temp: 9,
    fog: 0.12,
    ground: "mud",
  },
  tower: {
    name: "Wet · a rainy city",
    hour: 15,
    storm: 0.45,
    wind: 0.35,
    cloud: 1,
    rain: 0.8,
    wet: 1,
    puddles: 0.8,
    snow: 0,
    falling: 0,
    temp: 11,
    fog: 0.18,
    ground: "mud",
  },
  lodge: {
    name: "Snow · mountain night",
    hour: 21.4,
    storm: 0.3,
    wind: 0.4,
    cloud: 0.8,
    rain: 0,
    wet: 0,
    puddles: 0,
    snow: 1,
    falling: 0.55,
    temp: -8,
    fog: 0.08,
    ground: "none",
  },
  boathouse: {
    name: "Snow · frozen lake",
    hour: 9.2,
    storm: 0.1,
    wind: 0.2,
    cloud: 0.6,
    rain: 0,
    wet: 0,
    puddles: 0,
    snow: 0.95,
    falling: 0.15,
    temp: -12,
    fog: 0.25,
    ground: "none",
  },
};
export const climateOf = (key: string): Climate => CLIMATES[key] ?? CLIMATES.sawmill;
