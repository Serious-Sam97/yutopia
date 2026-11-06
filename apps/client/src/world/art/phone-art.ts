import { CASES, isCase } from "@yutopia/shared/phone";

// The phone's case colours (shared/phone.ts CASES): the 3D phone in the hand (tp/person3d.ts, its
// screen chars/props.ts phoneScreen). (Its flat drawing went with the paper people: docs/plan/72,
// phase 12.)

// a case's colours: [body, highlight, shadow]
export const phoneColors = (id: string | undefined) => CASES[isCase(id) ? id : "walnut"];
