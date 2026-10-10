"use client";

import type { AvatarLayers } from "@yutopia/shared";

// Yondra's Laravel API, with the same accounts. The token is a normal Sanctum
// token, stored per-origin (Yutopia runs on its own origin).
export const API = process.env.NEXT_PUBLIC_API ?? "http://localhost";
export const YONDRA_APP = process.env.NEXT_PUBLIC_YONDRA_APP ?? "http://localhost:3000";
const KEY = "yutopia:token";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`API ${status}`);
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
  if (res.status === 401) {
    setToken(null);
    if (typeof window !== "undefined" && !location.pathname.startsWith("/login")) {
      location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
    }
  }
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return (await res.json()) as T;
}

export interface SpaceSummary {
  id: number;
  slug: string;
  name: string;
  mapKey: string;
  projectId: number | null;
  color: string | null;
  online: number;
}

export interface Session {
  space: { id: number; name: string; mapKey: string; projectId: number | null; canBuild: boolean };
  user: { id: number; name: string };
  avatar: AvatarLayers;
  worldUrl: string;
  worldToken: string;
  livekitUrl: string;
  livekitToken: string;
  expiresIn: number;
}

export interface BoardSummary {
  id: number;
  name: string;
  type: string;
  sections: { id: number; name: string; count: number }[];
}

export interface YondraCard {
  id: number;
  name: string;
  section_id: number;
  story_points?: number | null;
  archived_at?: string | null;
  is_done?: boolean;
  ticket_number?: number | null;
}

// Yondra's planning poker session (PlanningController::snapshot).
export interface PlanningSnapshot {
  card_id: number;
  board_id: number;
  round: number;
  revealed: boolean;
  facilitator_id: number;
  deck: string;
  hand: string[];
  timer_ends_at: string | null;
  participants: { user_id: number; name: string; has_voted: boolean; value: string | null; is_spectator: boolean }[];
  applied_value: number | null;
  my_value?: string | null;
}

export interface MemberStatus {
  userId: number;
  doing: {
    id: number;
    name: string;
    boardId: number;
    boardName: string;
    section: string | null;
    ticket: string;
    blocked: boolean;
  }[];
}

export const yutopia = {
  login: (email: string, password: string) =>
    api<{ token: string; user: { id: number; name: string } }>("/api/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  exchange: (code: string) =>
    api<{ token: string; user: { id: number; name: string } }>("/api/yutopia/handoff/exchange", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  spaces: () =>
    api<{ spaces: SpaceSummary[]; avatar: AvatarLayers; user: { id: number; name: string } }>("/api/yutopia/spaces"),
  session: (spaceId: number) =>
    api<Session>("/api/yutopia/session", { method: "POST", body: JSON.stringify({ space_id: spaceId }) }),
  saveAvatar: (a: AvatarLayers) =>
    api<{ avatar: AvatarLayers }>("/api/yutopia/avatar", { method: "PUT", body: JSON.stringify(a) }),
  boards: (spaceId: number) => api<{ boards: BoardSummary[] }>(`/api/yutopia/spaces/${spaceId}/boards`),
  status: (spaceId: number) => api<{ status: MemberStatus[] }>(`/api/yutopia/spaces/${spaceId}/status`),
  logout: () => api("/api/logout", { method: "POST" }).catch(() => {}),
  members: (spaceId: number) =>
    api<{ members: { id: number; name: string }[] }>(`/api/yutopia/spaces/${spaceId}/members`),
  board: (boardId: number) =>
    api<{
      id: number;
      name: string;
      type: string;
      sections: { id: number; name: string }[];
      done_section_id?: number | null;
      cards: YondraCard[];
    }>(`/api/boards/${boardId}`),
  planning: (
    boardId: number,
    cardId: number,
    action: "show" | "join" | "vote" | "reveal" | "reset" | "apply" | "leave",
    body?: unknown,
  ) =>
    api<PlanningSnapshot>(`/api/boards/${boardId}/cards/${cardId}/planning${action === "show" ? "" : `/${action}`}`, {
      method: action === "show" ? "GET" : "POST",
      body: body ? JSON.stringify(body) : undefined,
    }),
};
