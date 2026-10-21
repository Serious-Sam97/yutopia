// The dark's sounds made off the main thread (docs/plan/30-the-dark.md D9): a few
// of them take longer than a frame to render (the whispers, the reverb tails),
// and the first time outside the Grounds' walk stuttered. Each name asked for
// comes back as its channels (transferred, not copied).
import { SOUNDS, SR } from "./synth";

self.onmessage = (e: MessageEvent<string>) => {
  const name = e.data;
  const make = SOUNDS[name];
  if (!make) return;
  const s = make();
  const ch = Array.isArray(s) ? s : [s];
  (self as unknown as Worker).postMessage(
    { name, ch, sr: SR },
    ch.map((c) => c.buffer as ArrayBuffer),
  );
};
