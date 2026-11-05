import type { Page } from "@playwright/test";
import { DEFAULT_AVATAR } from "@yutopia/shared";

// The API as the smoke e2e needs it (playwright.ci.config.ts): who I am, my look, and a session
// into the smoke's own offline world-server with a dev token (the server takes `dev:` tokens
// offline). Everything else answers empty. No LiveKit: voice is left off.
export const API = process.env.NEXT_PUBLIC_API ?? "http://localhost:8100";
export const WORLD_URL = `ws://localhost:${process.env.SMOKE_WORLD_PORT ?? 2681}`;

export interface Who {
  id: number;
  name: string;
  roles?: string; // the dev token's (member,builder,admin)
}

export async function fakeApi(page: Page, who: Who) {
  const user = { id: who.id, name: who.name, email: `${who.name.toLowerCase()}@yutopia.test`, isAdmin: false };
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  };
  await page.route(`${API}/**`, (route) => {
    if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const json = (body: unknown) => route.fulfill({ status: 200, json: body, headers: cors });
    const path = new URL(route.request().url()).pathname;
    switch (path) {
      case "/api/config":
        return json({ worldName: "Smoke", signup: "closed" });
      case "/api/me":
        return json({ user });
      case "/api/avatar":
        return json({ avatar: DEFAULT_AVATAR });
      case "/api/session":
        return json({
          world: { name: "Smoke", mapKey: "studio" },
          user,
          canBuild: true,
          avatar: DEFAULT_AVATAR,
          worldUrl: WORLD_URL,
          worldToken: `dev:${who.id}:${who.name}:${who.roles ?? "member,builder"}`,
          livekitUrl: "",
          livekitToken: "",
          iceServers: [],
          expiresIn: 3600,
        });
      default:
        return json({});
    }
  });
  await page.addInitScript(() => {
    localStorage.setItem("yutopia:token", "smoke");
    // (Low: CI's browser draws in software)
    localStorage.setItem("yutopia:prefs", JSON.stringify({ quality: "low" }));
  });
}
