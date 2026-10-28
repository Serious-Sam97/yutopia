"use client";

import { useEffect, useState } from "react";
import { useWorld } from "../ctx";
import { Icon, type IconName } from "../icons";
import { Card, Note, Row, Switch, Tag, useMine, useWords } from "./ui";

// Powers (docs/plan/48-the-admin.md): what an admin can do as themselves, each a switch the
// world server holds (Player.powers, shared admin.ts POWERS) and drops when they leave; healing
// themselves; going anywhere in the building at once.
const W = {
  fly: ["Fly", "Voar"],
  flyS: [
    "No gravity: Space up, C or Ctrl down, running ×3. Double-tap Space to land or take off.",
    "Sem gravidade: Espaço sobe, C ou Ctrl desce, correndo ×3. Dois toques no Espaço pousam ou decolam.",
  ],
  clip: ["Through walls", "Atravessar paredes"],
  clipS: [
    "Walls, furniture and locked doors don't stop you; locked rooms let you in.",
    "Paredes, móveis e portas trancadas não te param; salas trancadas te deixam entrar.",
  ],
  fast: ["Fast", "Rápido"],
  fastS: ["Every pace doubled: walking, running, flying.", "Todo passo em dobro: andando, correndo, voando."],
  hidden: ["Invisible", "Invisível"],
  hiddenS: [
    "Nobody sees you, hears you or finds you in the people list. Other admins see you faded.",
    "Ninguém te vê, te ouve ou te acha na lista de pessoas. Outros admins te veem apagado.",
  ],
  unhurt: ["Unhurt", "Ileso"],
  unhurtS: [
    "The shades and falls don't hurt you; health and breath stay full.",
    "As sombras e as quedas não te machucam; vida e fôlego ficam cheios.",
  ],
  on: ["on", "ligado"],
  landed: ["on · landed", "ligado · pousado"],
  me: ["Me, now", "Eu, agora"],
  heal: ["Heal me", "Me curar"],
  healS: [
    "Health, breath and battery full; up again if you're down.",
    "Vida, fôlego e bateria cheios; de pé se tiver caído.",
  ],
  anywhere: ["Go anywhere", "Ir a qualquer lugar"],
  anywhereS: [
    "A room on any floor, at once. Through walls on, a locked one too.",
    "Uma sala de qualquer andar, na hora. Com atravessar paredes, até uma trancada.",
  ],
  floor: ["Floor {n}", "Andar {n}"],
  ground: ["Ground floor", "Térreo"],
  shapes: ["Physics shapes", "Formas da física"],
  shapesS: [
    "Every solid near you as the physics world holds it, drawn over the 3D view (yours, built from the same data as the server's).",
    "Todo sólido perto de você como o mundo da física o tem, desenhado sobre a vista 3D (o seu, feito dos mesmos dados que o do servidor).",
  ],
  shapesOff: ["The 3D view only.", "Só na vista 3D."],
  bodies: ["{n} bodies of {max} · {mb} MB of Jolt's heap", "{n} corpos de {max} · {mb} MB do heap do Jolt"],
  refused: ["{n} refused", "{n} recusados"],
} as const;

const POWERS: { k: "fly" | "clip" | "fast" | "hidden" | "unhurt"; bit: number; icon: IconName }[] = [
  { k: "fly", bit: 1, icon: "stairs" },
  { k: "clip", bit: 2, icon: "wall" },
  { k: "fast", bit: 4, icon: "follow" },
  { k: "hidden", bit: 8, icon: "camOff" },
  { k: "unhurt", bit: 16, icon: "plus" },
];

export function Powers() {
  const w = useWorld();
  const t = useWords(W);
  const { powers, flying } = useMine(w);
  return (
    <>
      <div className="card py-1">
        {POWERS.map((p, i) => {
          const on = (powers & p.bit) !== 0;
          return (
            <Row
              key={p.k}
              first={i === 0}
              title={
                <span className="flex items-center gap-2.5">
                  <span style={{ color: on ? "var(--amber)" : "var(--cream-dim)" }}>
                    <Icon name={p.icon} size={18} />
                  </span>
                  {t(p.k)}
                  {on && <Tag tone="lamp">{p.k === "fly" && !flying ? t("landed") : t("on")}</Tag>}
                </span>
              }
              sub={t(`${p.k}S`)}
            >
              <Switch on={on} label={t(p.k)} onFlip={() => w?.send("mod:power", { power: p.k, on: !on })} />
            </Row>
          );
        })}
      </div>
      <Card label={t("me")}>
        <div className="flex items-center gap-3 flex-wrap">
          <button type="button" className="deck-btn" onClick={() => w?.send("mod:heal", {})}>
            <Icon name="plus" size={15} />
            {t("heal")}
          </button>
          <Note>{t("healS")}</Note>
        </div>
      </Card>
      <Shapes />
      <Anywhere />
    </>
  );
}

// the physics world's shapes over the 3D view (docs/plan/50-the-volume.md: tp/physics3d.ts)
function Shapes() {
  const w = useWorld();
  const t = useWords(W);
  const tp = w?.tp ?? null;
  const [on, setOn] = useState(!!tp?.physicsShown);
  const [counts, setCounts] = useState<{ bodies: number; maxBodies: number; heap: number; refused: number } | null>(
    null,
  );
  useEffect(() => {
    if (!on) return setCounts(null);
    const id = setInterval(() => setCounts(tp?.physicsShown?.counts() ?? null), 1000);
    return () => clearInterval(id);
  }, [on, tp]);
  return (
    <Card label={t("shapes")}>
      <div className="flex items-center gap-3">
        <Switch
          on={on}
          label={t("shapes")}
          onFlip={() => {
            tp?.physicsDebug(!on);
            setOn(!on);
          }}
        />
        <Note>{tp ? t("shapesS") : t("shapesOff")}</Note>
      </div>
      {counts && (
        <div className="flex gap-2 flex-wrap mt-2.5">
          <Tag>
            {t("bodies", {
              n: counts.bodies,
              max: counts.maxBodies,
              mb: (counts.heap / 1048576).toFixed(1),
            })}
          </Tag>
          {counts.refused > 0 && <Tag tone="bad">{t("refused", { n: counts.refused })}</Tag>}
        </div>
      )}
    </Card>
  );
}

// the building's rooms, floor by floor (read off the map: no shared code in this chunk)
function Anywhere() {
  const w = useWorld();
  const t = useWords(W);
  const [floor, setFloor] = useState<number | null>(null);
  const b = w?.building;
  if (!b) return null;
  const home = b.floor ?? 0;
  const floors = [
    { index: home, name: b.name, areas: b.areas },
    ...(b.levels ?? []).map((l) => ({ index: l.index, name: l.name, areas: l.areas ?? [] })),
  ].sort((a, c) => a.index - c.index);
  const at = floors.find((f) => f.index === (floor ?? w?.level ?? home)) ?? floors[0];
  return (
    <Card label={t("anywhere")}>
      <Note>{t("anywhereS")}</Note>
      <div className="flex gap-1.5 flex-wrap mt-2.5">
        {floors.map((f) => (
          <button
            key={f.index}
            type="button"
            className="chip"
            aria-pressed={f.index === at.index}
            onClick={() => setFloor(f.index)}
          >
            {f.index === 0 ? t("ground") : t("floor", { n: f.index })}
          </button>
        ))}
      </div>
      <div className="flex gap-2 flex-wrap mt-3">
        {at.areas
          .filter((a) => a.name)
          .map((a) => (
            <button
              key={a.key}
              type="button"
              className="ghost-btn flex items-center gap-1.5"
              onClick={() => w?.send("teleport", { to: { x: a.x + a.w / 2, y: a.y + a.h / 2, level: at.index } })}
            >
              <Icon name="pin" size={13} />
              {a.name}
            </button>
          ))}
      </div>
    </Card>
  );
}
