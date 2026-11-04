"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

// Each panel loads when it's first opened (they're not needed to walk in, and
// the world page has a size budget).
type P = { objectId: string };
const DoorPanel = dynamic<P>(() => import("./DoorPanel").then((m) => m.DoorPanel), { ssr: false });
const NoticePanel = dynamic<P>(() => import("./LoungePanels").then((m) => m.NoticePanel), { ssr: false });
const RadioPanel = dynamic<P>(() => import("./LoungePanels").then((m) => m.RadioPanel), { ssr: false });
const StandupPanel = dynamic<P>(() => import("./RitualPanels").then((m) => m.StandupPanel), { ssr: false });
const ScreenPanel = dynamic<P>(() => import("./ScreenPanels").then((m) => m.ScreenPanel), { ssr: false });
const WhiteboardPanel = dynamic<P>(() => import("./WhiteboardPanel").then((m) => m.WhiteboardPanel), { ssr: false });
const PianoPanel = dynamic<P>(() => import("./PianoPanel").then((m) => m.PianoPanel), { ssr: false });
const SlotPanel = dynamic<P>(() => import("./SlotPanel").then((m) => m.SlotPanel), { ssr: false });
const PoolPanel = dynamic<P>(() => import("./PoolPanel").then((m) => m.PoolPanel), { ssr: false });
const PongPanel = dynamic<P>(() => import("./PongPanel").then((m) => m.PongPanel), { ssr: false });
const GamePanel = dynamic<P>(() => import("./GamePanel").then((m) => m.GamePanel), { ssr: false });
const MediaPanel = dynamic<P>(() => import("./MediaPanel").then((m) => m.MediaPanel), { ssr: false });
const ComputerPanel = dynamic<P>(() => import("./ComputerPanel").then((m) => m.ComputerPanel), { ssr: false });
// (plan 68 phases 21–25: the small games)
// (plan 70: chess on the board itself — the strip, not a modal)
const ChessStrip = dynamic<P>(() => import("./ChessStrip").then((m) => m.ChessStrip), { ssr: false });
const DartsPanel = dynamic<P>(() => import("./Games68Panels").then((m) => m.DartsPanel), { ssr: false });
const ClawPanel = dynamic<P>(() => import("./Games68Panels").then((m) => m.ClawPanel), { ssr: false });
const TableGamePanel = dynamic<P>(() => import("./Games68Panels").then((m) => m.TableGamePanel), { ssr: false });

// Panels opened from in-world objects (X / click).
export const extraPanels: Partial<Record<string, ComponentType<{ objectId: string }>>> = {
  radio: RadioPanel,
  door: DoorPanel,
  notice: NoticePanel,
  standup: StandupPanel,
  whiteboard: WhiteboardPanel,
  screen: ScreenPanel,
  piano: PianoPanel,
  slotcar: SlotPanel,
  pool: PoolPanel,
  pong: PongPanel,
  console: GamePanel,
  tv: GamePanel,
  games: GamePanel,
  media: MediaPanel,
  computer: ComputerPanel,
  chess: ChessStrip,
  darts: DartsPanel,
  claw: ClawPanel,
  hockey: TableGamePanel,
  foosball: TableGamePanel,
};
