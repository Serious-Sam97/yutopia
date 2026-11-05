"use client";

import { Component, type ReactNode } from "react";
import { reportError } from "@/lib/crash";

// A bug in one part of the HUD never takes the rest — or the world — down
// (docs/plan/72-the-3d-core.md, phase 1): that part is left out, reported, and tried again a
// moment later (a few times; then it stays out until a reload). A chunk that didn't load
// offers the reload (lib/crash.ts).
const TRIES = 3;
const AGAIN_MS = 2000;

export class Guard extends Component<{ name: string; children?: ReactNode }, { broke: boolean }> {
  state = { broke: false };
  private tries = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  static getDerivedStateFromError() {
    return { broke: true };
  }

  componentDidCatch(e: unknown) {
    reportError(`hud:${this.props.name}`, e);
    this.tries++;
    if (this.tries > TRIES) return;
    this.timer = setTimeout(() => this.setState({ broke: false }), AGAIN_MS);
  }

  componentWillUnmount() {
    if (this.timer) clearTimeout(this.timer);
  }

  render() {
    return this.state.broke ? null : this.props.children;
  }
}
