import { type AvatarLayers, parseAvatar } from "@yutopia/shared";
import { jwtVerify } from "jose";
import { config } from "./config.ts";

export interface WorldClaims {
  userId: number;
  name: string;
  avatar: AvatarLayers;
  roles: string[]; // member, builder (everyone), admin (moderation), bot
}

// Verifies the short-lived world token minted by Yutopia's API (apps/api Tokens::world).
export async function verifyWorldToken(token: string): Promise<WorldClaims> {
  const { payload } = await jwtVerify(token, new TextEncoder().encode(config.worldSecret()), {
    audience: "yutopia-world",
    issuer: "yutopia",
    algorithms: ["HS256"],
  });
  return {
    userId: Number(payload.sub),
    name: String(payload.name ?? "Someone"),
    avatar: parseAvatar(payload.avatar),
    roles: Array.isArray(payload.roles) ? payload.roles.map(String) : [],
  };
}
