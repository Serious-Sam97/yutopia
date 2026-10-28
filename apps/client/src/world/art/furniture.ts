import { CLOTH_COLORS } from "@yutopia/shared";
import type { Box } from "./iso";
import { C, hash2, hex, shade } from "./palette";

// Furniture as box compositions in local tile units at rot 0. Heights are px.
// `custom` draws extra organic bits (leaves, cones) in local screen space for 1x1
// pieces. Wall pieces hang on the wall at local y ∈ [-0.06, 0.06].

export interface Piece {
  boxes: Box[];
  // boxes flagged `back` on seats get a depth bias so a sitter is drawn
  // between seat and backrest
  seat?: boolean;
  flat?: boolean; // drawn on the floor layer (rugs, rings)
}

type Props = Record<string, unknown>;

const leg = (x: number, y: number, h: number, color: number = C.walnutDark, s = 0.08): Box => ({
  x,
  y,
  w: s,
  d: s,
  z: 0,
  h,
  color,
  outline: false,
});

const screen = (color: number = C.phosphor) => ({
  glow: true,
  faces: { s: color, n: color, e: shade(color, 0.7), w: color },
});

export const WALL_H = 128; // iso px (as WALL_Z in art/items/walls.ts)
const DOOR_H = 88; // a doorway's opening (DOOR_Z there)
export const STUB_H = 10;

export function piece(kind: string, props: Props, id = ""): Piece {
  // the Grounds' things: their drawings only (no boxes while they load)
  if (kind.startsWith("gr_")) return { boxes: [] };
  switch (kind) {
    case "desk":
      return {
        boxes: [
          { x: 0.04, y: 0.1, w: 0.5, d: 0.8, z: 0, h: 20, color: C.walnut }, // drawer unit
          { x: 0.1, y: 0.86, w: 0.38, d: 0.02, z: 13, h: 1, color: C.walnutDark, outline: false },
          { x: 0.1, y: 0.86, w: 0.38, d: 0.02, z: 6, h: 1, color: C.walnutDark, outline: false },
          leg(1.86, 0.12, 20),
          leg(1.86, 0.8, 20),
          { x: 0, y: 0.05, w: 2, d: 0.9, z: 20, h: 4, color: C.teak, top: 0xa06c43 },
        ],
      };
    case "chair":
      return {
        seat: true,
        boxes: [
          { x: 0.42, y: 0.42, w: 0.16, d: 0.16, z: 2, h: 8, color: C.graphite, outline: false },
          { x: 0.22, y: 0.22, w: 0.56, d: 0.56, z: 0, h: 2, color: C.graphite, outline: false },
          { x: 0.2, y: 0.22, w: 0.6, d: 0.58, z: 10, h: 4, color: C.rust, top: 0xc0633a },
          { x: 0.2, y: 0.12, w: 0.6, d: 0.12, z: 14, h: 20, color: C.rust, top: 0xc0633a, bias: 1 },
        ],
      };
    case "armchair":
      return {
        seat: true,
        boxes: [
          { x: 0.08, y: 0.12, w: 0.84, d: 0.8, z: 0, h: 10, color: C.olive },
          { x: 0.22, y: 0.3, w: 0.56, d: 0.6, z: 10, h: 5, color: 0x7f8c47 },
          { x: 0.08, y: 0.12, w: 0.84, d: 0.2, z: 10, h: 20, color: C.olive, bias: 1 },
          { x: 0.08, y: 0.3, w: 0.14, d: 0.62, z: 10, h: 9, color: C.oliveDark },
          { x: 0.78, y: 0.3, w: 0.14, d: 0.62, z: 10, h: 9, color: C.oliveDark },
        ],
      };
    case "bench":
      return {
        seat: true,
        boxes: [
          leg(0.15, 0.32, 9),
          leg(0.15, 0.6, 9),
          leg(2.77, 0.32, 9),
          leg(2.77, 0.6, 9),
          { x: 0.05, y: 0.28, w: 2.9, d: 0.44, z: 9, h: 3, color: C.teak, top: 0xa06c43 },
        ],
      };
    case "sofa":
      return {
        seat: true,
        boxes: [
          { x: 0.02, y: 0.12, w: 2.96, d: 0.82, z: 0, h: 11, color: C.rustDark },
          { x: 0.26, y: 0.38, w: 0.82, d: 0.54, z: 11, h: 5, color: C.rust },
          { x: 1.1, y: 0.38, w: 0.82, d: 0.54, z: 11, h: 5, color: C.rust },
          { x: 1.94, y: 0.38, w: 0.8, d: 0.54, z: 11, h: 5, color: C.rust },
          { x: 0.02, y: 0.12, w: 2.96, d: 0.26, z: 11, h: 19, color: C.rustDark, bias: 1 },
          { x: 0.02, y: 0.38, w: 0.24, d: 0.56, z: 11, h: 10, color: shade(C.rustDark, 0.9) },
          { x: 2.74, y: 0.38, w: 0.24, d: 0.56, z: 11, h: 10, color: shade(C.rustDark, 0.9) },
        ],
      };
    case "meeting_table":
      return {
        boxes: [
          { x: 0.6, y: 0.5, w: 0.3, d: 1, z: 0, h: 20, color: C.walnutDark },
          { x: 5.1, y: 0.5, w: 0.3, d: 1, z: 0, h: 20, color: C.walnutDark },
          { x: 0, y: 0, w: 6, d: 2, z: 20, h: 5, color: C.walnut, top: 0x6c4630 },
          // VFD strip down the middle — the poker display
          { x: 1.2, y: 0.9, w: 3.6, d: 0.2, z: 25, h: 0.6, color: C.graphite, top: C.graphite, outline: false },
          {
            x: 1.3,
            y: 0.97,
            w: 3.4,
            d: 0.06,
            z: 25.6,
            h: 0.3,
            color: C.amber,
            top: C.amber,
            glow: true,
            outline: false,
          },
        ],
      };
    case "coffee_table":
      return {
        boxes: [
          leg(0.1, 0.15, 10),
          leg(0.1, 0.77, 10),
          leg(1.82, 0.15, 10),
          leg(1.82, 0.77, 10),
          { x: 0.04, y: 0.1, w: 1.92, d: 0.8, z: 10, h: 3, color: C.teak, top: 0xa06c43 },
        ],
      };
    case "plant":
      return {
        boxes: [
          { x: 0.28, y: 0.28, w: 0.44, d: 0.44, z: 0, h: 14, color: C.terracotta },
          { x: 0.3, y: 0.3, w: 0.4, d: 0.4, z: 14, h: 0.5, color: 0x3a2a1c, outline: false },
        ],
      };
    case "lamp":
      return {
        boxes: [{ x: 0.32, y: 0.32, w: 0.36, d: 0.36, z: 0, h: 3, color: C.walnutDark }],
      };
    case "rug":
      return {
        flat: true,
        boxes: [
          { x: 0, y: 0, w: 4, d: 3, z: 0.5, h: 0, color: C.olive, outline: false },
          { x: 0.18, y: 0.18, w: 3.64, d: 2.64, z: 0.6, h: 0, color: C.rust, outline: false },
          { x: 0.36, y: 0.36, w: 3.28, d: 2.28, z: 0.7, h: 0, color: C.amberSoft, outline: false },
          { x: 0.5, y: 0.5, w: 3, d: 2, z: 0.8, h: 0, color: C.rustDark, outline: false },
          { x: 0.7, y: 1.35, w: 2.6, d: 0.3, z: 0.9, h: 0, color: C.cream, outline: false },
        ],
      };
    case "standup_mat":
      return { flat: true, boxes: [] };
    case "arcade":
      return {
        boxes: [
          { x: 0.14, y: 0.18, w: 0.72, d: 0.64, z: 0, h: 54, color: C.walnutDark, faces: { e: C.rust, w: C.rust } },
          { x: 0.14, y: 0.78, w: 0.72, d: 0.16, z: 20, h: 6, color: C.graphite },
          { x: 0.24, y: 0.82, w: 0.52, d: 0.02, z: 30, h: 16, color: C.screenOff, ...screen(0x9aa67e) },
          { x: 0.18, y: 0.8, w: 0.64, d: 0.04, z: 48, h: 6, color: C.amber, ...screen(C.amber) },
          { x: 0.3, y: 0.86, w: 0.05, d: 0.05, z: 26, h: 3, color: C.red, outline: false },
          { x: 0.5, y: 0.86, w: 0.05, d: 0.05, z: 26, h: 3, color: C.amber, outline: false },
        ],
      };
    // (things on surfaces are drawn around the middle of a tile, standing on
    // z 0; they're raised to their surface and shifted to their spot)
    case "radio":
      return {
        boxes: [
          { x: 0.12, y: 0.3, w: 0.76, d: 0.4, z: 0, h: 15, color: C.aluminium },
          { x: 0.18, y: 0.7, w: 0.2, d: 0.02, z: 2, h: 10, color: C.graphite, outline: false },
          { x: 0.62, y: 0.7, w: 0.2, d: 0.02, z: 2, h: 10, color: C.graphite, outline: false },
          { x: 0.42, y: 0.7, w: 0.16, d: 0.02, z: 8, h: 4, color: C.amber, ...screen(C.amber), outline: false },
          { x: 0.2, y: 0.42, w: 0.02, d: 0.02, z: 15, h: 12, color: C.alumDark, outline: false },
        ],
      };
    case "side_table":
      return {
        boxes: [
          leg(0.22, 0.22, 11),
          leg(0.7, 0.22, 11),
          leg(0.22, 0.7, 11),
          leg(0.7, 0.7, 11),
          { x: 0.18, y: 0.18, w: 0.64, d: 0.64, z: 11, h: 3, color: C.walnut },
        ],
      };
    case "cupboard":
      return {
        boxes: [
          { x: 0.08, y: 0.14, w: 0.84, d: 0.72, z: 0, h: 24, color: C.cream, faces: { s: C.creamDark } },
          { x: 0.04, y: 0.1, w: 0.92, d: 0.8, z: 24, h: 2, color: C.walnut },
        ],
      };
    case "tabletop":
      return { boxes: [{ x: 0.4, y: 0.4, w: 0.2, d: 0.2, z: 0, h: 5, color: C.cream, outline: false }] };
    case "tape_shelf": {
      const seed = hashId(id);
      const boxes: Box[] = [{ x: 0, y: 0.2, w: 2, d: 0.6, z: 0, h: 46, color: C.walnut }];
      for (const z of [6, 19, 32]) {
        let x = 0.1;
        let i = 0;
        while (x < 1.86) {
          const w = 0.07;
          const col = hex(CLOTH_COLORS[Math.floor(hash2(i, z, seed * 1000) * CLOTH_COLORS.length)]);
          boxes.push({ x, y: 0.78, w, d: 0.03, z, h: 9, color: col, outline: false });
          x += w + 0.015 + (hash2(i, z + 1, seed) > 0.85 ? 0.08 : 0);
          i++;
        }
      }
      return { boxes };
    }
    case "coffee_machine":
      return {
        boxes: [
          { x: 0.22, y: 0.24, w: 0.56, d: 0.44, z: 0, h: 20, color: C.aluminium },
          { x: 0.36, y: 0.68, w: 0.1, d: 0.02, z: 14, h: 3, color: C.amber, ...screen(C.amber), outline: false },
          { x: 0.44, y: 0.68, w: 0.12, d: 0.12, z: 0, h: 5, color: C.paper, top: C.walnutDark, outline: false },
        ],
      };
    case "reception":
      return {
        boxes: [
          { x: 0, y: 0.2, w: 3, d: 0.72, z: 0, h: 26, color: C.walnut },
          { x: 0.02, y: 0.92, w: 2.96, d: 0.02, z: 6, h: 3, color: C.rust, outline: false },
          { x: 0.02, y: 0.92, w: 2.96, d: 0.02, z: 10, h: 3, color: C.amberSoft, outline: false },
          { x: 0.02, y: 0.92, w: 2.96, d: 0.02, z: 14, h: 3, color: C.olive, outline: false },
          { x: -0.04, y: 0.16, w: 3.08, d: 0.82, z: 26, h: 3, color: C.cream },
        ],
      };
    case "mic_stand":
      return {
        boxes: [{ x: 0.36, y: 0.36, w: 0.28, d: 0.28, z: 0, h: 2, color: C.graphite }],
      };
    case "mixing_desk": {
      const boxes: Box[] = [
        { x: 0, y: 0.15, w: 3, d: 0.8, z: 0, h: 18, color: C.graphite },
        { x: 0, y: 0.15, w: 3, d: 0.26, z: 18, h: 16, color: C.ink },
      ];
      for (let i = 0; i < 14; i++) {
        boxes.push({ x: 0.12 + i * 0.2, y: 0.5, w: 0.05, d: 0.3, z: 18, h: 1, color: C.alumDark, outline: false });
        boxes.push({
          x: 0.1 + i * 0.2,
          y: 0.5 + hash2(i, 1) * 0.22,
          w: 0.09,
          d: 0.06,
          z: 19,
          h: 2,
          color: C.cream,
          outline: false,
        });
        boxes.push({
          x: 0.1 + i * 0.2,
          y: 0.41,
          w: 0.1,
          d: 0.01,
          z: 22 + (i % 3) * 3,
          h: 2,
          color: i % 5 === 4 ? C.red : C.amber,
          glow: true,
          outline: false,
        });
      }
      return { boxes };
    }
    case "speaker_cab":
      return {
        boxes: [{ x: 0.1, y: 0.2, w: 0.8, d: 0.62, z: 0, h: 46, color: C.graphite, faces: { s: 0x24221f } }],
      };
    case "server_rack": {
      const boxes: Box[] = [
        { x: 0.1, y: 0.12, w: 0.8, d: 0.76, z: 0, h: 66, color: C.graphite, faces: { s: 0x1e1d1a } },
      ];
      for (let r = 0; r < 8; r++)
        boxes.push({ x: 0.18, y: 0.88, w: 0.64, d: 0.01, z: 6 + r * 7.4, h: 5, color: 0x2f2d29, outline: false });
      for (let r = 0; r < 8; r++)
        for (let i = 0; i < 3; i++)
          if (hash2(r, i, hashId(id) * 50) > 0.35)
            boxes.push({
              x: 0.22 + i * 0.07,
              y: 0.89,
              w: 0.035,
              d: 0.01,
              z: 7.5 + r * 7.4,
              h: 2,
              color: hash2(i, r) > 0.7 ? C.amber : C.red,
              glow: true,
              outline: false,
            });
      return { boxes };
    }
    case "crt_terminal":
      return {
        boxes: [
          { x: 0.05, y: 0.15, w: 0.9, d: 0.75, z: 0, h: 20, color: C.walnutDark },
          { x: 0.18, y: 0.25, w: 0.64, d: 0.55, z: 20, h: 26, color: C.creamDark },
          { x: 0.26, y: 0.8, w: 0.48, d: 0.02, z: 25, h: 16, color: C.screenOff, ...screen(C.amber) },
          { x: 0.2, y: 0.82, w: 0.6, d: 0.1, z: 20, h: 2, color: C.cream, outline: false },
        ],
      };
    case "door": {
      // rot 0: the wall runs along x and faces +y. The panel sits flush with the
      // wall's visible face so it reads from the camera; the lintel is full depth.
      const state = String(props.state ?? "open");
      const shut = (state === "closed" || state === "locked") && !props.passing;
      const boxes: Box[] = [
        { x: 0, y: 0, w: 0.07, d: 1, z: 0, h: DOOR_H, color: C.walnutDark, outline: false },
        { x: 0.93, y: 0, w: 0.07, d: 1, z: 0, h: DOOR_H, color: C.walnutDark, outline: false },
        {
          x: 0,
          y: 0,
          w: 1,
          d: 1,
          z: DOOR_H,
          h: WALL_H - DOOR_H,
          color: C.cream,
          faces: { s: C.cream, e: shade(C.cream, 0.88) },
          outline: false,
        },
        { x: -0.02, y: -0.02, w: 1.04, d: 1.04, z: WALL_H, h: 3, color: C.walnutDark, top: C.walnut },
      ];
      if (shut) {
        boxes.push({ x: 0.07, y: 0.86, w: 0.86, d: 0.1, z: 0, h: DOOR_H, color: C.walnut, faces: { s: 0x6e4a31 } });
        boxes.push({
          x: 0.16,
          y: 0.96,
          w: 0.68,
          d: 0.01,
          z: 46,
          h: 34,
          color: 0x5e3d28,
          faces: { s: 0x5e3d28 },
          outline: false,
        });
        boxes.push({
          x: 0.16,
          y: 0.96,
          w: 0.68,
          d: 0.01,
          z: 10,
          h: 30,
          color: 0x5e3d28,
          faces: { s: 0x5e3d28 },
          outline: false,
        });
        boxes.push({
          x: 0.74,
          y: 0.96,
          w: 0.08,
          d: 0.06,
          z: 34,
          h: 4,
          color: C.amberSoft,
          top: C.amber,
          faces: { s: C.amber },
          outline: false,
        });
        if (state === "locked") {
          boxes.push({
            x: 0.72,
            y: 0.97,
            w: 0.12,
            d: 0.01,
            z: 24,
            h: 7,
            color: C.red,
            faces: { s: C.red },
            glow: true,
            outline: false,
          });
        }
      } else {
        // swung open into the room, against the frame
        boxes.push({ x: 0.07, y: 0.08, w: 0.09, d: 0.82, z: 0, h: 72, color: C.walnut, faces: { e: 0x6e4a31 } });
      }
      return { boxes };
    }
    case "board_wall":
    case "screen_wall": {
      const w = kind === "board_wall" ? 3 : 4;
      const z0 = kind === "board_wall" ? 22 : 16;
      const z1 = kind === "board_wall" ? 72 : 78;
      return {
        boxes: [
          { x: 0.06, y: -0.06, w: w - 0.12, d: 0.1, z: z0, h: z1 - z0, color: C.walnut },
          {
            x: 0.14,
            y: 0.04,
            w: w - 0.28,
            d: 0.02,
            z: z0 + 5,
            h: z1 - z0 - 10,
            color: 0x1a1714,
            glow: true,
            outline: false,
          },
          ...(kind === "screen_wall"
            ? [{ x: 1.6, y: -0.02, w: 0.8, d: 0.12, z: z0 - 6, h: 6, color: C.graphite, outline: false } as Box]
            : []),
        ],
      };
    }
    case "whiteboard":
      return {
        boxes: [
          { x: 0.08, y: -0.04, w: 1.84, d: 0.08, z: 24, h: 40, color: C.aluminium },
          { x: 0.14, y: 0.04, w: 1.72, d: 0.02, z: 27, h: 34, color: C.paper, faces: { s: 0xfbf8ef }, outline: false },
          { x: 0.2, y: 0.04, w: 1.6, d: 0.1, z: 22, h: 2, color: C.alumDark, outline: false },
        ],
      };
    case "notice_board": {
      const seed = hashId(id);
      const boxes: Box[] = [
        { x: 0.08, y: -0.04, w: 1.84, d: 0.08, z: 28, h: 34, color: C.walnut },
        { x: 0.14, y: 0.04, w: 1.72, d: 0.02, z: 31, h: 28, color: 0xc49a6c, outline: false },
      ];
      for (let i = 0; i < 6; i++) {
        const x = 0.2 + hash2(i, 1, seed) * 1.3;
        const z = 34 + hash2(i, 2, seed) * 16;
        boxes.push({
          x,
          y: 0.06,
          w: 0.22,
          d: 0.01,
          z,
          h: 9,
          color: [C.paper, C.amberSoft, C.cream][i % 3],
          outline: false,
        });
        boxes.push({ x: x + 0.09, y: 0.07, w: 0.04, d: 0.01, z: z + 8, h: 2, color: C.red, outline: false });
      }
      return { boxes };
    }
    case "acoustic_panel": {
      const boxes: Box[] = [{ x: 0.14, y: -0.04, w: 0.72, d: 0.08, z: 22, h: 46, color: C.felt }];
      for (let r = 0; r < 4; r++)
        for (let c = 0; c < 2; c++)
          boxes.push({
            x: 0.2 + c * 0.32,
            y: 0.04,
            w: 0.28,
            d: 0.02,
            z: 25 + r * 10.5,
            h: 9,
            color: (r + c) % 2 ? C.feltLight : shade(C.felt, 0.85),
            outline: false,
          });
      return { boxes };
    }
    // (quick stand-ins while the drawings load)
    case "bookcase":
      return { boxes: [{ x: 0.04, y: 0.22, w: 1.92, d: 0.58, z: 0, h: 62, color: C.walnut }] };
    case "partition":
      return { boxes: [{ x: 0.06, y: 0.46, w: 1.88, d: 0.08, z: 2.5, h: 42, color: C.olive }] };
    case "counter":
      return {
        boxes: [
          { x: 0.02, y: 0.1, w: 1.96, d: 0.8, z: 0, h: 24, color: C.cream },
          { x: 0, y: 0.06, w: 2, d: 0.88, z: 24, h: 2, color: C.alumDark },
        ],
      };
    case "beanbag":
      return { boxes: [{ x: 0.14, y: 0.14, w: 0.72, d: 0.72, z: 0, h: 13, color: C.rust }] };
    case "water_cooler":
      return {
        boxes: [
          { x: 0.26, y: 0.28, w: 0.48, d: 0.44, z: 0, h: 30, color: C.cream },
          { x: 0.32, y: 0.32, w: 0.36, d: 0.36, z: 30, h: 20, color: 0x8fc0ea },
        ],
      };
    case "vending":
      return { boxes: [{ x: 0.1, y: 0.16, w: 0.8, d: 0.7, z: 0, h: 62, color: C.slate }] };
    case "piano":
      return {
        boxes: [
          { x: 0.06, y: 0.08, w: 1.88, d: 0.5, z: 0, h: 44, color: C.walnut },
          { x: 0.06, y: 0.58, w: 1.88, d: 0.26, z: 14, h: 6, color: C.walnut },
        ],
      };
    case "crt_tv":
      return {
        boxes: [
          { x: 0.06, y: 0.1, w: 1.88, d: 0.8, z: 0, h: 13, color: C.walnut },
          { x: 0.3, y: 0.16, w: 1.4, d: 0.62, z: 13, h: 34, color: C.teak },
        ],
      };
    // more screens (art/items/screens.ts): wall pieces sit on the wall's face
    case "tv_wall":
      return { boxes: [{ x: 0.16, y: 0.02, w: 0.7, d: 0.3, z: 50, h: 28, color: C.graphite }] };
    case "tv_hd":
      return { boxes: [{ x: 0.12, y: -0.03, w: 2.76, d: 0.1, z: 25, h: 56, color: C.graphite }] };
    case "projector_screen":
      return { boxes: [{ x: 0.12, y: 0.03, w: 2.76, d: 0.02, z: 21, h: 60, color: 0xe9e5da }] };
    case "tv_giant":
      return { boxes: [{ x: 0.3, y: -0.03, w: 4.4, d: 0.1, z: 24, h: 94, color: C.graphite }] };
    case "cinema_screen":
      return {
        boxes: [
          { x: 0.48, y: -0.04, w: 5.04, d: 0.08, z: 12, h: 106, color: 0x151310 },
          { x: 0.68, y: 0.04, w: 4.64, d: 0.02, z: 18, h: 94, color: 0xe9e5da },
        ],
      };
    case "projector":
      return { boxes: [{ x: 0.3, y: 0.34, w: 0.42, d: 0.32, z: 0, h: 7, color: C.graphite }] };
    case "tv_console":
      return { boxes: [{ x: 0.06, y: 0.14, w: 1.88, d: 0.72, z: 0, h: 46, color: C.walnut }] };
    case "tv_portable":
      return { boxes: [{ x: 0.24, y: 0.36, w: 0.52, d: 0.32, z: 0, h: 15, color: C.graphite }] };
    case "console_2600":
    case "console_nes":
    case "console_snes":
    case "console_md":
    case "console_gb":
      return { boxes: [{ x: 0.2, y: 0.3, w: 0.6, d: 0.42, z: 0, h: 5, color: C.graphite }] };
    case "cart_shelf":
      return { boxes: [{ x: 0.06, y: 0.24, w: 1.88, d: 0.54, z: 0, h: 30, color: C.walnut }] };
    case "slot_track":
      return {
        boxes: [
          leg(0.12, 0.12, 19),
          leg(3.8, 0.12, 19),
          leg(0.12, 2.8, 19),
          leg(3.8, 2.8, 19),
          { x: 0, y: 0, w: 4, d: 3, z: 19, h: 4, color: C.walnut, top: 0x5f7a3a },
        ],
      };
    case "pool_table":
      return {
        boxes: [
          leg(0.5, 0.22, 15),
          leg(3.42, 0.22, 15),
          leg(0.5, 1.7, 15),
          leg(3.42, 1.7, 15),
          { x: 0.23, y: 0, w: 3.54, d: 2, z: 15, h: 12, color: C.walnut, top: 0x2f6a4c },
        ],
      };
    case "pingpong_table":
      return {
        boxes: [
          leg(0.6, 0.25, 22, C.graphite, 0.07),
          leg(3.34, 0.25, 22, C.graphite, 0.07),
          leg(0.6, 1.68, 22, C.graphite, 0.07),
          leg(3.34, 1.68, 22, C.graphite, 0.07),
          { x: 0.27, y: 0.04, w: 3.46, d: 1.92, z: 22, h: 2, color: 0x1f4f86, top: 0x1f4f86 },
        ],
      };
    case "turntable":
      return { boxes: [{ x: 0.14, y: 0.18, w: 0.72, d: 0.64, z: 0, h: 5, color: C.walnut }] };
    case "clock":
      return { boxes: [{ x: 0.32, y: -0.03, w: 0.36, d: 0.06, z: 44, h: 16, color: C.cream }] };
    case "neon":
      return { boxes: [{ x: 0.2, y: -0.025, w: 1.6, d: 0.05, z: 36, h: 28, color: C.ink }] };
    case "poster": {
      const art = String(props.art ?? "tape");
      const boxes: Box[] = [{ x: 0.12, y: -0.03, w: 0.76, d: 0.06, z: 30, h: 36, color: C.ink }];
      const band = (z: number, h: number, color: number) =>
        boxes.push({ x: 0.17, y: 0.03, w: 0.66, d: 0.01, z, h, color, outline: false });
      if (art === "vu") {
        band(33, 30, C.cream);
        for (let i = 0; i < 6; i++)
          boxes.push({
            x: 0.22 + i * 0.1,
            y: 0.04,
            w: 0.06,
            d: 0.01,
            z: 36,
            h: 6 + i * 3.5,
            color: i > 3 ? C.rust : C.olive,
            outline: false,
          });
      } else if (art === "yondra") {
        band(33, 30, C.walnutDark);
        band(41, 3, C.rust);
        band(45, 3, C.amberSoft);
        band(49, 3, C.olive);
        band(53, 3, C.cream);
      } else {
        band(33, 30, C.amberSoft);
        boxes.push({ x: 0.24, y: 0.04, w: 0.52, d: 0.01, z: 40, h: 16, color: C.ink, outline: false });
        boxes.push({ x: 0.3, y: 0.05, w: 0.12, d: 0.01, z: 45, h: 6, color: C.cream, outline: false });
        boxes.push({ x: 0.58, y: 0.05, w: 0.12, d: 0.01, z: 45, h: 6, color: C.cream, outline: false });
      }
      return { boxes };
    }
    case "column":
      return {
        boxes: [
          { x: 0.18, y: 0.18, w: 0.64, d: 0.64, z: 0, h: 6, color: C.walnut },
          { x: 0.26, y: 0.26, w: 0.48, d: 0.48, z: 6, h: 72, color: C.cream },
          { x: 0.18, y: 0.18, w: 0.64, d: 0.64, z: 78, h: 6, color: C.walnutDark, top: C.walnut },
        ],
      };
    default:
      return { boxes: [{ x: 0.2, y: 0.2, w: 0.6, d: 0.6, z: 0, h: 16, color: C.rust }] };
  }
}

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}
