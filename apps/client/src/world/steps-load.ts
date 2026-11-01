// Loading the steps' player (steps.ts): once, with the first step.
type Steps = typeof import("./steps");
let mod: Steps | null = null;
let loading: Promise<Steps> | null = null;

export function loadSteps(): Promise<Steps> {
  loading ??= import("./steps").then((m) => {
    mod = m;
    return m;
  });
  return loading;
}

// The chunk if it's here (null while it loads: that step is the synth's).
export function steps(): Steps | null {
  return mod;
}
