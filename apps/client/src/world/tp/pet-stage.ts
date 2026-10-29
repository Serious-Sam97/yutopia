import { DEFAULT_OUTFIT, type PetLook, type PetOutfit, type Species } from "@yutopia/shared/pets";
import type * as THREE_NS from "three";
import type { Face3, PoseKind } from "../art/pets3d";

// Pets for a still (docs/plan/51-the-pet.md, phase 0): the game's own models
// (art/pets3d.ts) on the Grounds or in a car's seat, posed. (A lost pet's "?"
// is the HUD's, as its wants are: laid over the still by pet-shots.spec.ts.) Used by the Grounds' stills (grounds-shots.ts: a shot's
// `pets`, a car's `pets`).

type THREE = typeof THREE_NS;
type Pets3 = typeof import("../art/pets");

export interface PetIn {
  species: Species;
  name: string;
  look?: Partial<PetLook>;
  outfit?: Partial<PetOutfit>;
  pose: PoseKind;
  face?: Face3;
  t?: number; // through the pose's cycle
  look3?: number; // the head turned (radians, + to its left)
  /** on the Grounds: where, which way it faces (a point it looks towards), how high it stands */
  x?: number;
  z?: number;
  y?: number;
  to?: [number, number];
  /** in a car: the seat (shared car SEATS_OF), turned from facing ahead (radians, + to the left), nudged (car-local m) */
  seat?: number;
  turn?: number;
  at?: [number, number, number];
  scale?: number; // drawn this much smaller (in a seat: SEAT_SCALE, as the seated people)
  lost?: boolean; // lost: the HUD's "?" over its head
}

const COATS: Partial<Record<Species, PetLook>> = {
  dog: { color: "#d9a349", mark: "none", markColor: "#efe4cc", breed: "golden" } as PetLook,
};

/** A pet's look, its species' defaults filled in. */
function lookOf(p: PetIn): PetLook {
  return {
    color: "#c68a5e",
    mark: "none",
    markColor: "#efe4cc",
    breed: "",
    ...COATS[p.species],
    ...p.look,
  } as PetLook;
}

/** How big a pet is in a seat: as the people are drawn a touch smaller there (car/stage.ts SEATED),
 *  more so for pets, or a capybara fills the back seat. */
export const SEAT_SCALE = 0.72;

export interface StagedPet {
  p: PetIn;
  model: InstanceType<Pets3["PetModel"]>;
  holder: THREE_NS.Group;
  /** over its head, in the world (for the name tag laid over the still) */
  head(out: THREE_NS.Vector3): THREE_NS.Vector3;
}

/** Pets into the scene (or a car's body: `parent`, at its seat's hip `hip`), posed. */
export function stagePets(
  T3: THREE,
  P: Pets3,
  scene: THREE_NS.Object3D,
  list: { p: PetIn; parent?: THREE_NS.Object3D; hip?: THREE_NS.Vector3 }[],
  o: { patch?: (m: THREE_NS.Material) => void } = {},
): { pets: StagedPet[]; pose(): void; dispose(): void } {
  const pets: StagedPet[] = [];
  for (const { p, parent, hip } of list) {
    const model = new P.PetModel(
      p.species,
      lookOf(p),
      { ...DEFAULT_OUTFIT, ...p.outfit },
      (c, oo) => {
        // (toon-ramped and rim-lit already)
        const m = P.petMaterial(c, oo);
        o.patch?.(m);
        return m;
      },
      p.name,
    );
    // (posing sets the model's own root: placed and turned by a holder round it)
    const root = new T3.Group();
    root.add(model.root);
    if (parent && hip) {
      // in a seat: on its cushion, facing the car's nose (−x), turned as asked
      const [ax, ay, az] = p.at ?? [0, 0, 0];
      root.position.set(hip.x + ax, hip.y - 0.06 + ay, hip.z + az);
      root.rotation.y = Math.PI + (p.turn ?? 0);
      root.scale.setScalar(p.scale ?? SEAT_SCALE);
      parent.add(root);
    } else {
      const x = p.x ?? 0;
      const z = p.z ?? 0;
      root.position.set(x, p.y ?? 0, z);
      const [tx, tz] = p.to ?? [x + 1, z];
      root.rotation.y = -Math.atan2(tz - z, tx - x);
      root.scale.setScalar(p.scale ?? 1);
      scene.add(root);
    }
    pets.push({
      p,
      model,
      holder: root,
      head: (out) => {
        root.updateMatrixWorld(true);
        // (its head, wherever the pose put it: the model's own, private, read for a still)
        const head = (model as unknown as { head?: THREE_NS.Object3D }).head;
        if (!head) return root.localToWorld(out.set(0, model.height + 0.25, 0));
        head.getWorldPosition(out);
        out.y += 0.32 * root.scale.y;
        return out;
      },
    });
  }
  return {
    pets,
    pose() {
      for (const { p, model } of pets) {
        // settled: a few frames of its pose (the ears and tail lag, the blend from the last)
        for (let i = 0; i < 40; i++) {
          model.pose(
            { kind: p.pose, t: p.t ?? 0.3, face: p.face ?? "open", look: p.look3 ?? 0, carry: null },
            1 / 60,
            1000 + i * 16,
          );
        }
      }
    },
    dispose() {
      for (const { model, holder } of pets) {
        holder.removeFromParent();
        model.dispose();
      }
    },
  };
}
