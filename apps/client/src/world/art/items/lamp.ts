import { INK, type Sketch, te } from "./kit";
import { K, M } from "./pal";

// Floor lamp: walnut base, brass pole, cream drum shade lit from inside, a pull
// chain. Story detail: the cord snaking away over the floor. props.on = false
// turns it off (the shade goes plain cream and nothing glows).
export function lamp(s: Sketch, props: Record<string, unknown>) {
  const on = props.on !== false;

  // cord on the floor (drawn first, under everything)
  s.shape(
    { x: 0.5, y: 0.5, w: 0.5, d: 0.45, z: 0, h: 0.5 },
    (d) => {
      const a = d.m(0.56, 0.56, 0.3);
      const b = d.m(0.86, 0.66, 0.3);
      const c = d.m(0.74, 0.98, 0.3);
      const e = d.m(0.98, 0.94, 0.3);
      d.raw(
        `<path d="M${a.join(" ")} Q${b.join(" ")} ${c.join(" ")} T${e.join(" ")}" stroke="${INK}" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M${a.join(" ")} Q${b.join(" ")} ${c.join(" ")} T${e.join(" ")}" stroke="#4a3a2c" stroke-width=".7" fill="none" stroke-linecap="round"/>`,
      );
    },
    { pad: 3 },
  );
  s.cyl({ x: 0.5, y: 0.5, z: 0, r: 0.17, h: 2.5, mat: M.walnutDark, line: 1.1 });
  s.cyl({ x: 0.5, y: 0.5, z: 2.5, r: 0.07, h: 1.8, mat: M.brass, line: 0.8 });
  s.cyl({ x: 0.5, y: 0.5, z: 4, r: 0.016, h: 52, mat: M.brass, line: 0.7 });
  // pull chain
  s.shape({ x: 0.56, y: 0.5, w: 0.04, d: 0.04, z: 46, h: 9 }, (d) => {
    const [x, y] = d.m(0.58, 0.52, 55);
    d.raw(
      `<path d="M${x} ${y}L${x} ${y + 9}" stroke="${K.brass}" stroke-width=".7" stroke-dasharray="1 .8"/><circle cx="${x}" cy="${y + 10}" r="1.3" fill="${K.brass}" stroke="${INK}" stroke-width=".5"/>`,
    );
  });
  // shade: a drum, lit from inside when on
  s.cyl(
    {
      x: 0.5,
      y: 0.5,
      z: 52,
      r: 0.23,
      r2: 0.16,
      h: 19,
      mat: on ? { c: "#f2c27a", top: "#efdcb8", left: "#f6cf8c", right: "#d99a4c" } : { c: K.cream, top: "#f6eedb" },
      line: 1.2,
      glow: on,
    },
    (d) => {
      // the opening at the top: dark inside, a hint of the bulb
      d.poly("t", te(71, 0.5, 0.5, 0.15), on ? "#7a4a1c" : "#6b5a40");
      if (on) d.poly("t", te(71, 0.5, 0.5, 0.06), K.vfd, { glow: true });
      // fabric seams
      const [l, r] = [d.m(0.34, 0.66, 53), d.m(0.39, 0.61, 70)];
      d.raw(`<path d="M${l.join(" ")}L${r.join(" ")}" stroke="#d7b27a" stroke-width=".6" opacity=".7"/>`, on);
    },
  );

  s.shadowDot(0.5, 0.5, 0.2, 0.42);
}
