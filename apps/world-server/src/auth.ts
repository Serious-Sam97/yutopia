import { type AvatarLayers, parseAvatar } from "@yutopia/shared";
import { jwtVerify } from "jose";
import { config } from "./config.ts";

export interface WorldClaims {
  userId: number;
  name: string;
  avatar: AvatarLayers;
  spaceId: number;
  projectId: number | null;
  roles: string[];
}

// Verifies the short-lived world token minted by Laravel (YutopiaTokens::world).
export async function verifyWorldToken(token: string): Promise<WorldClaims> {
  const { payload } = await jwtVerify(token, new TextEncoder().encode(config.worldSecret()), {
    audience: "yutopia-world",
    issuer: "yondra",
    algorithms: ["HS256"],
  });
  return {
    userId: Number(payload.sub),
    name: String(payload.name ?? "Someone"),
    avatar: parseAvatar(payload.avatar),
    spaceId: Number(payload.space_id),
    projectId: payload.project_id == null ? null : Number(payload.project_id),
    roles: Array.isArray(payload.roles) ? payload.roles.map(String) : [],
  };
}
