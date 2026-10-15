import type { PetFeeling, PetLook, PetOutfit, Species } from "@yutopia/shared/pets";

// A pet as the views draw it (iso engine and the 3D people): what the server
// says about it. The drawing and the little animation its act plays live in
// the pets chunk (art/pets.ts), shared by both views so a trick looks the same.

export interface PetView {
  id: string;
  species: Species;
  look: PetLook;
  outfit: PetOutfit;
  mode: string; // shared PetMode
  act: string; // what it's doing (features/pets.ts), since actAt (server ms)
  actAt: number;
  feeling: PetFeeling;
  level: number;
  mine: boolean;
  hurtAt?: number; // took a hit in a battle (client ms): a red flash
  lookAt?: { x: number; y: number } | null; // its owner (it looks at them)
  carry?: string | null; // a toy in its mouth (shared/held.ts kind)
}

export const PET_HURT_MS = 350;
