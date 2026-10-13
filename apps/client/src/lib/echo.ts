"use client";

import type Echo from "laravel-echo";
import { API, getToken } from "./api";

// Same Reverb as Yondra: board.{id} events keep the walls live. The socket
// client (pusher + echo) loads on first use, so it stays out of the page.
let echo: Echo<"reverb"> | null = null;
let loading: Promise<Echo<"reverb"> | null> | null = null;

export function getEcho(): Promise<Echo<"reverb"> | null> {
  if (echo) return Promise.resolve(echo);
  if (!process.env.NEXT_PUBLIC_REVERB_APP_KEY) return Promise.resolve(null);
  loading ??= Promise.all([import("laravel-echo"), import("pusher-js")])
    .then(([{ default: EchoClient }, { default: Pusher }]) => {
      (window as Window & { Pusher?: typeof Pusher }).Pusher = Pusher;
      echo = new EchoClient({
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
    })
    .catch((e) => {
      console.warn("[echo] load failed", e);
      return null;
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

// The connection if it's already up (for leaving channels on the way out).
export function currentEcho(): Echo<"reverb"> | null {
  return echo;
}

export function disconnectEcho() {
  echo?.disconnect();
  echo = null;
}
