import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../config.ts";

// The key for the media routes (/media/…): who (the user) and until when,
// signed with the world secret. Handed out on joining (media:key); it goes in
// the path, since <img>, Pixi and hls.js fetch without our headers.
const TTL_MS = 12 * 3600_000;

const sign = (body: string) => createHmac("sha256", config.worldSecret()).update(`media.${body}`).digest("base64url");

export function mediaKey(userId: number, now = Date.now()): string {
  const body = `${userId}.${Math.floor((now + TTL_MS) / 1000)}`;
  return `${body}.${sign(body)}`;
}

export function verifyMediaKey(key: string, now = Date.now()): { userId: number } | null {
  const parts = key.split(".");
  if (parts.length !== 3) return null;
  const [user, exp, sig] = parts;
  const body = `${user}.${exp}`;
  const want = Buffer.from(sign(body));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  if (Number(exp) * 1000 < now) return null;
  const userId = Number(user);
  return Number.isInteger(userId) ? { userId } : null;
}
