import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../config.ts";

// The key for the media routes (/media/…): who (space, user) and until when,
// signed with the world secret. Handed out on joining (media:key); it goes in
// the path, since <img>, Pixi and hls.js fetch without our headers.
const TTL_MS = 12 * 3600_000;

const sign = (body: string) => createHmac("sha256", config.worldSecret()).update(`media.${body}`).digest("base64url");

export function mediaKey(spaceId: number, userId: number, now = Date.now()): string {
  const body = `${spaceId}.${userId}.${Math.floor((now + TTL_MS) / 1000)}`;
  return `${body}.${sign(body)}`;
}

export function verifyMediaKey(key: string, now = Date.now()): { spaceId: number; userId: number } | null {
  const parts = key.split(".");
  if (parts.length !== 4) return null;
  const [space, user, exp, sig] = parts;
  const body = `${space}.${user}.${exp}`;
  const want = Buffer.from(sign(body));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  if (Number(exp) * 1000 < now) return null;
  const spaceId = Number(space);
  const userId = Number(user);
  return Number.isInteger(spaceId) && Number.isInteger(userId) ? { spaceId, userId } : null;
}
