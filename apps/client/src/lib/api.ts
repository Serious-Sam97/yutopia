"use client";

import type { AvatarLayers } from "@yutopia/shared";

// Yutopia's own API (apps/api). In production it answers under /api on the
// client's own origin; on the dev stack at :8100. The token is a Sanctum token,
// stored per origin.
export const API = process.env.NEXT_PUBLIC_API ?? "http://localhost:8100";
const KEY = "yutopia:token";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`API ${status}`);
  }

  // Laravel's validation / abort message, if there is one
  get message(): string {
    try {
      const j = JSON.parse(this.body) as { message?: string; errors?: Record<string, string[]> };
      return Object.values(j.errors ?? {})[0]?.[0] ?? j.message ?? `API ${this.status}`;
    } catch {
      return `API ${this.status}`;
    }
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(KEY, token);
    else localStorage.removeItem(KEY);
  } catch {}
}

// pages that work signed out (a 401 there doesn't send you to sign in)
const OPEN_PAGES = ["/login", "/register", "/forgot", "/reset"];

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (res.status === 401 && token) {
    setToken(null);
    if (typeof window !== "undefined" && !OPEN_PAGES.some((p) => location.pathname.startsWith(p))) {
      location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
    }
  }
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return (await res.json()) as T;
}

export interface Me {
  id: number;
  name: string;
  email: string;
  isAdmin: boolean;
}

export interface Session {
  world: { name: string; mapKey: string };
  user: Me;
  canBuild: boolean; // everyone, in the one world
  avatar: AvatarLayers;
  worldUrl: string;
  worldToken: string;
  livekitUrl: string;
  livekitToken: string;
  iceServers?: RTCIceServer[]; // Cloudflare TURN relay; empty = connect directly
  expiresIn: number;
}

export type Signup = "open" | "invite" | "closed";

export interface Invite {
  id: number;
  code: string;
  email: string | null;
  url: string;
  usedAt: string | null;
  usedBy: string | null; // who signed up with it
  expiresAt: string;
}

// "My setups": a group of things saved in build mode, placed again anywhere
// (offsets from the group's corner; things on a desk keep their cell).
export interface SetupItem {
  kind: string;
  dx: number;
  dy: number;
  rot: number;
  props?: Record<string, unknown> | null;
}
export interface Setup {
  id: number;
  name: string;
  items: SetupItem[];
}

const post = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

export const yutopia = {
  config: () => api<{ worldName: string; signup: Signup }>("/api/config"),
  login: (email: string, password: string) => api<{ token: string; user: Me }>("/api/login", post({ email, password })),
  register: (b: { name: string; email: string; password: string; password_confirmation: string; invite?: string }) =>
    api<{ token: string; user: Me }>("/api/register", post(b)),
  invite: (code: string) =>
    api<{ email: string | null; by: string | null }>(`/api/invites/${encodeURIComponent(code)}`),
  forgot: (email: string) => api<{ message: string }>("/api/forgot-password", post({ email })),
  reset: (b: { token: string; email: string; password: string; password_confirmation: string }) =>
    api<{ message: string }>("/api/reset-password", post(b)),
  me: () => api<{ user: Me }>("/api/me"),
  logout: () => api("/api/logout", { method: "POST" }).catch(() => {}),
  session: () => api<Session>("/api/session", { method: "POST" }),
  avatar: () => api<{ avatar: AvatarLayers }>("/api/avatar"),
  saveAvatar: (a: AvatarLayers) =>
    api<{ avatar: AvatarLayers }>("/api/avatar", { method: "PUT", body: JSON.stringify(a) }),
  setups: () => api<{ setups: Setup[] }>("/api/setups"),
  saveSetup: (name: string, items: SetupItem[]) => api<{ setup: Setup }>("/api/setups", post({ name, items })),
  deleteSetup: (id: number) => api(`/api/setups/${id}`, { method: "DELETE" }),
  // everyone with an account (to hand a room or a desk to)
  members: () => api<{ members: { id: number; name: string }[] }>("/api/members"),
  // admins: single-use sign-up links
  invites: () => api<{ invites: Invite[]; signup: "invite" | "open" | "closed" }>("/api/admin/invites"),
  makeInvite: (email: string | null) => api<{ invite: Invite }>("/api/admin/invites", post({ email })),
  dropInvite: (id: number) => api(`/api/admin/invites/${id}`, { method: "DELETE" }),
};
