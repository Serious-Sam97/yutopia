"use client";

import type { ComponentType } from "react";
import { ArcadePanel } from "./ArcadePanel";
import { DoorPanel } from "./DoorPanel";
import { NoticePanel, RadioPanel } from "./LoungePanels";
import { PokerPanel, StandupPanel } from "./RitualPanels";
import { ScreenPanel, TerminalPanel } from "./ScreenPanels";
import { WhiteboardPanel } from "./WhiteboardPanel";

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
};
