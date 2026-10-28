// The admins' calls to the API (docs/plan/39-the-telemetry.md, 48-the-admin.md): what the
// admin perf endpoints answer (apps/api PerfController). Here, not in lib/api: the world
// page carries lib/api, and only the admin panel and /admin/perf load this.
import { api } from "./api";

export interface PerfPlayer {
  userId: number;
  name: string;
  windows: number;
  minutes: number;
  sessions: number;
  fps: number;
  frameP95: number;
  frameWorst: number;
  slowShare: number;
  ping: number | null;
  snaps: number;
  last: string;
  version: string | null;
  browser: string | null;
  gpu: string | null;
  view: string | null;
  quality: string | null;
  machine: Record<string, unknown> | null;
  worstArea: { level: number; area: string; fps: number } | null;
}
export interface PerfArea {
  level: number;
  area: string;
  windows: number;
  fps: number;
  frameP95: number;
  frameWorst?: number;
  draws: number | null;
  slowShare: number;
  players?: number;
}
export type PerfSpot = PerfArea & { players: number };
export interface PerfVersion {
  version: string;
  windows: number;
  players: number;
  fps: number;
  frameP95: number;
  slowShare: number;
  first: string;
  last: string;
}
export interface PerfDetail {
  user: { id: number; name: string };
  series: {
    at: string;
    fps: number;
    frameMed: number;
    frameP95: number;
    frameWorst: number;
    ping: number | null;
    view: string;
    quality: string;
    level: number;
    area: string;
    draws: number | null;
    snaps: number;
    session: string;
    version: string;
  }[];
  areas: PerfArea[];
  stages: Record<string, number>;
  machines: { browser: string; gpu: string; windows: number; last: string }[];
  machine: Record<string, unknown> | null;
}

export const perf = {
  summary: (days: number) =>
    api<{ players: PerfPlayer[]; versions: PerfVersion[] }>(`/api/admin/perf/summary?days=${days}`),
  player: (id: number, days: number) => api<PerfDetail>(`/api/admin/perf/player/${id}?days=${days}`),
  spots: (days: number) => api<{ spots: PerfSpot[] }>(`/api/admin/perf/spots?days=${days}`),
};

// Run the place (docs/plan/48-the-admin.md): everyone with an account, a role, the log
export interface Member {
  id: number;
  name: string;
  email: string;
  admin: boolean;
  seenAt: string | null;
  joinedAt: string | null;
  avatar: string;
}
export interface LogRow {
  id: number;
  adminId: number | null;
  admin: string;
  kind: string;
  targetId: number | null;
  target: string;
  detail: string;
  at: string;
}
export const admin = {
  members: (q = "") => api<{ members: Member[] }>(`/api/admin/members${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  setAdmin: (id: number, on: boolean) =>
    api<{ admin: boolean }>(`/api/admin/members/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ admin: on }),
    }),
  log: (kinds: string[] = [], before = 0) =>
    api<{ log: LogRow[] }>(
      `/api/admin/log?${new URLSearchParams({ ...(kinds.length ? { kinds: kinds.join(",") } : {}), ...(before ? { before: String(before) } : {}) })}`,
    ),
};
