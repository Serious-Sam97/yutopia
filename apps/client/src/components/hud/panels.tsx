"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";

// Each panel loads when it's first opened (they're not needed to walk in, and
// the world page has a size budget).
type P = { objectId: string };
const ArcadePanel = dynamic<P>(() => import("./ArcadePanel").then((m) => m.ArcadePanel), { ssr: false });
const DoorPanel = dynamic<P>(() => import("./DoorPanel").then((m) => m.DoorPanel), { ssr: false });
const NoticePanel = dynamic<P>(() => import("./LoungePanels").then((m) => m.NoticePanel), { ssr: false });
const RadioPanel = dynamic<P>(() => import("./LoungePanels").then((m) => m.RadioPanel), { ssr: false });
const PokerPanel = dynamic<P>(() => import("./RitualPanels").then((m) => m.PokerPanel), { ssr: false });
const StandupPanel = dynamic<P>(() => import("./RitualPanels").then((m) => m.StandupPanel), { ssr: false });
const ScreenPanel = dynamic<P>(() => import("./ScreenPanels").then((m) => m.ScreenPanel), { ssr: false });
const TerminalPanel = dynamic<P>(() => import("./ScreenPanels").then((m) => m.TerminalPanel), { ssr: false });
const WhiteboardPanel = dynamic<P>(() => import("./WhiteboardPanel").then((m) => m.WhiteboardPanel), { ssr: false });
const PianoPanel = dynamic<P>(() => import("./PianoPanel").then((m) => m.PianoPanel), { ssr: false });
const SlotPanel = dynamic<P>(() => import("./SlotPanel").then((m) => m.SlotPanel), { ssr: false });
const GamePanel = dynamic<P>(() => import("./GamePanel").then((m) => m.GamePanel), { ssr: false });
const MediaPanel = dynamic<P>(() => import("./MediaPanel").then((m) => m.MediaPanel), { ssr: false });
const ComputerPanel = dynamic<P>(() => import("./ComputerPanel").then((m) => m.ComputerPanel), { ssr: false });

// Panels opened from in-world objects (X / click). Board walls use BoardPanel.
export const extraPanels: Partial<Record<string, ComponentType<{ objectId: string }>>> = {
  radio: RadioPanel,
  door: DoorPanel,
  notice: NoticePanel,
  standup: StandupPanel,
  poker: PokerPanel,
  whiteboard: WhiteboardPanel,
  arcade: ArcadePanel,
  screen: ScreenPanel,
  terminal: TerminalPanel,
  piano: PianoPanel,
  slotcar: SlotPanel,
  console: GamePanel,
  tv: GamePanel,
  games: GamePanel,
  media: MediaPanel,
  computer: ComputerPanel,
};
