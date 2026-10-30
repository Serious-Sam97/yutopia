// Plan 58 phase 10 (docs/plan/58-the-animation.md): what plan 58's animation costs a frame with 20 people
// near, on this machine's CPU — Motion3 over Locomotion, all its layers (the gait, the stepper, the foot
// lock, the gaze, the springs' follow-through, the dark's, life's), each person doing something else
// (walking, jogging, sprinting, stood, the torch, aiming, cold, on the phone, sitting), 60 frames a
// second for 10 s; plan 58 off beside it. Skinning and drawing are the GPU's and the view's, not this.
//   npx tsx e2e/anim-cost.mts [people]
import * as C from "@/world/chars";

await C.loadHero();
const N = Number(process.argv[2] ?? 20);
const dt = 1 / 60;
const kinds = ["walk", "jog", "sprint", "stand", "torch", "aim", "cold", "phone", "sit", "turn"];
function run(v2: boolean): { mean: number; p99: number } {
  const people = Array.from({ length: N }, (_, i) => {
    const m = new C.Motion3(0.1 + i * 0.037);
    m.v2 = v2;
    m.tension = i % 3 === 0 ? 1 : 0;
    return { m, kind: kinds[i % kinds.length] };
  });
  const times: number[] = [];
  for (let f = 0; f < 600; f++) {
    const t = f * dt;
    const t0 = performance.now();
    for (const { m, kind } of people) {
      const speed =
        kind === "walk" || kind === "torch" || kind === "cold" ? 1.5 : kind === "jog" ? 5 : kind === "sprint" ? 8 : 0;
      m.update(dt, {
        dist: speed * dt,
        walking: speed > 0,
        speed,
        sit: kind === "sit",
        typing: kind === "sit",
        speaking: kind === "phone",
        emote: "",
        reduced: false,
        phone: kind === "phone" ? { state: "call", pose: "", ringing: false } : null,
        loco: {
          ahead: speed,
          left: 0,
          crouch: false,
          aim: kind === "aim",
          gun: kind === "aim",
          torch: kind === "torch",
          pitch: 0,
          yaw: kind === "torch" ? 0.6 * Math.sin(t) : 0,
          turn: kind === "turn" ? 1.5 : 0,
          accel: 0,
          up: false,
          verb: null,
          cold: kind === "cold" ? 0.8 : 0,
        },
      });
    }
    times.push(performance.now() - t0);
  }
  const s = times.slice(60).sort((a, b) => a - b);
  return { mean: s.reduce((a, b) => a + b, 0) / s.length, p99: s[Math.floor(s.length * 0.99)] };
}
run(true); // (warmed up)
const on = run(true);
const off = run(false);
console.log(
  `${N} people: plan 58 ${on.mean.toFixed(2)} ms a frame (p99 ${on.p99.toFixed(2)}), off ${off.mean.toFixed(2)} ms (p99 ${off.p99.toFixed(2)}); ${(on.mean / N).toFixed(3)} ms a person`,
);
