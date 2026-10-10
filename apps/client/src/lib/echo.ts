"use client";

import Echo from "laravel-echo";
import Pusher from "pusher-js";
import { API, getToken } from "./api";

// Same Reverb as Yondra: board.{id} events keep the walls live.
let echo: Echo<"reverb"> | null = null;

export function getEcho(): Echo<"reverb"> | null {
  if (echo) return echo;
  if (!process.env.NEXT_PUBLIC_REVERB_APP_KEY) return null;
  (window as Window & { Pusher?: typeof Pusher }).Pusher = Pusher;
  echo = new Echo({
    broadcaster: "reverb",
    key: process.env.NEXT_PUBLIC_REVERB_APP_KEY,
    wsHost: process.env.NEXT_PUBLIC_REVERB_HOST ?? "localhost",
    wsPort: Number(process.env.NEXT_PUBLIC_REVERB_PORT ?? 8080),
    wssPort: Number(process.env.NEXT_PUBLIC_REVERB_PORT ?? 8080),
    forceTLS: (process.env.NEXT_PUBLIC_REVERB_SCHEME ?? "http") === "https",
    enabledTransports: ["ws", "wss"],
    authEndpoint: `${API}/api/broadcasting/auth`,
    auth: { headers: { Authorization: `Bearer ${getToken() ?? ""}`, Accept: "application/json" } },
  });
  return echo;
}

export function disconnectEcho() {
  echo?.disconnect();
  echo = null;
}
