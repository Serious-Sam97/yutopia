"use client";

import { useEffect } from "react";
import { useLamp } from "@/lib/lamp";
import { usePrefs } from "@/lib/prefs";

// (plan 125) The new UI's look on the desktop, every page: html.lamp-ui turns the old tokens and frames to F's
// (app/lamp.css). Phones keep the old look (F12c).
export function LampRoot() {
  const lamp = useLamp();
  // (the film — grain and darker edges — only when it's asked for: Settings → Graphics, off by default)
  const film = usePrefs().film;
  useEffect(() => {
    document.documentElement.classList.toggle("lamp-ui", lamp);
    document.documentElement.classList.toggle("lamp-film-on", lamp && film);
  }, [lamp, film]);
  return null;
}
