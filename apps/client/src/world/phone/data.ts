"use client";

import type { PhoneSettings } from "@yutopia/shared/phone";
import { API, api, getToken } from "@/lib/api";
import type { Contact, Msg, PhotoRef, Thread } from "./store";

// Yondra keeps everything the phone remembers (YutopiaPhoneController): the
// settings, the team as contacts, threads and texts, photos. Live changes come
// back on the person's private channel (`.phone` events, phone/index.ts).

const P = "/api/yutopia/phone";

// Yondra's shapes → the phone's (times in ms)
interface MsgIn {
  id: number;
  thread_id: number;
  user_id: number | null;
  kind: Msg["kind"];
  body: string | null;
  photo: PhotoIn | null;
  meta: { end?: string; secs?: number; video?: boolean; from?: number } | null;
  reactions: Record<string, number[]> | null;
  reply_to: number | null;
  at: number;
}
interface PhotoIn {
  id: number;
  url: string;
  w: number;
  h: number;
  filter: string;
  where: string;
  at: number;
  selfie: boolean;
  sent?: boolean;
}
interface ThreadIn {
  id: number;
  kind: Thread["kind"];
  name: string;
  members: number[];
  space_id: number | null;
  unread: number;
  last: MsgIn | null;
  muted: boolean;
  read: Record<string, number>;
}

// (Yondra signs the file's path; the origin is its API)
export const photoOf = (p: PhotoIn): PhotoRef => ({ ...p, url: p.url.startsWith("/") ? `${API}${p.url}` : p.url });
export function msgOf(m: MsgIn): Msg {
  return {
    id: m.id,
    thread: m.thread_id,
    from: m.user_id,
    kind: m.kind,
    body: m.body ?? "",
    photo: m.photo ? photoOf(m.photo) : null,
    call:
      m.kind === "call" && m.meta
        ? { end: m.meta.end ?? "answered", secs: m.meta.secs ?? 0, video: !!m.meta.video, from: m.meta.from ?? 0 }
        : null,
    reactions: m.reactions ?? {},
    replyTo: m.reply_to,
    at: m.at,
  };
}
export function threadOf(t: ThreadIn): Thread {
  return {
    id: t.id,
    kind: t.kind,
    name: t.name,
    members: t.members,
    spaceId: t.space_id,
    unread: t.unread,
    last: t.last ? msgOf(t.last) : null,
    muted: t.muted,
    readAt: t.read ?? {},
  };
}

export const phoneApi = {
  me: () => api<{ settings: PhoneSettings }>(P),
  saveSettings: (settings: PhoneSettings) =>
    api<{ settings: PhoneSettings }>(P, { method: "PUT", body: JSON.stringify({ settings }) }),
  contacts: (spaceId: number) =>
    api<{ contacts: Omit<Contact, "here">[] }>(`${P}/contacts?space=${spaceId}`).then((r) =>
      r.contacts.map((c) => ({ ...c, here: c.spaceId === spaceId })),
    ),
  threads: (spaceId: number) =>
    api<{ threads: ThreadIn[] }>(`${P}/threads?space=${spaceId}`).then((r) => r.threads.map(threadOf)),
  open: (members: number[], name?: string) =>
    api<{ thread: ThreadIn }>(`${P}/threads`, { method: "POST", body: JSON.stringify({ members, name }) }).then((r) =>
      threadOf(r.thread),
    ),
  messages: (thread: number, before?: number) =>
    api<{ messages: MsgIn[]; more: boolean }>(
      `${P}/threads/${thread}/messages${before ? `?before=${before}` : ""}`,
    ).then((r) => ({ messages: r.messages.map(msgOf), more: r.more })),
  send: (thread: number, m: { body?: string; photo_id?: number; reply_to?: number | null }) =>
    api<{ message: MsgIn }>(`${P}/threads/${thread}/messages`, { method: "POST", body: JSON.stringify(m) }).then((r) =>
      msgOf(r.message),
    ),
  read: (thread: number, upto: number) =>
    api(`${P}/threads/${thread}/read`, { method: "POST", body: JSON.stringify({ upto }) }),
  typing: (thread: number) => api(`${P}/threads/${thread}/typing`, { method: "POST", body: "{}" }),
  react: (message: number, e: string) =>
    api<{ reactions: Record<string, number[]> }>(`${P}/messages/${message}/react`, {
      method: "POST",
      body: JSON.stringify({ e }),
    }),
  editThread: (thread: number, patch: { muted?: boolean; name?: string }) =>
    api(`${P}/threads/${thread}`, { method: "PATCH", body: JSON.stringify(patch) }),
  leaveThread: (thread: number) => api(`${P}/threads/${thread}/members/me`, { method: "DELETE" }),
  photos: () => api<{ photos: PhotoIn[] }>(`${P}/photos`).then((r) => r.photos.map(photoOf)),
  calls: () =>
    api<{ calls: { message: MsgIn; peers: number[] }[] }>(`${P}/calls`).then((r) =>
      r.calls.map((c) => ({ message: msgOf(c.message), peers: c.peers })),
    ),
  markSent: (id: number) => api(`${P}/photos/${id}`, { method: "PATCH", body: JSON.stringify({ sent: true }) }),
  deletePhoto: (id: number) => api(`${P}/photos/${id}`, { method: "DELETE" }),
  // multipart: api() forces JSON, so this one is by hand
  async uploadPhoto(blob: Blob, meta: { filter: string; selfie: boolean; where: string; spaceId: number }) {
    const fd = new FormData();
    fd.append("file", blob, "photo.jpg");
    fd.append("filter", meta.filter);
    fd.append("selfie", meta.selfie ? "1" : "0");
    fd.append("where", meta.where.slice(0, 120));
    fd.append("space_id", String(meta.spaceId));
    const token = getToken();
    const res = await fetch(`${API}${P}/photos`, {
      method: "POST",
      headers: { Accept: "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: fd,
    });
    if (!res.ok) throw new Error(`upload ${res.status}`);
    return photoOf(((await res.json()) as { photo: PhotoIn }).photo);
  },
  // Vortex: a text to him (his answer comes back in the thread), a line he said
  // to me in the world (kept in his thread), and a call's line
  vortexText: (text: string) =>
    api<{ message: MsgIn; reply: MsgIn | null }>(`${P}/vortex`, {
      method: "POST",
      body: JSON.stringify({ text }),
    }).then((r) => ({ message: msgOf(r.message), reply: r.reply ? msgOf(r.reply) : null })),
  vortexLine: (text: string) =>
    api<{ message: MsgIn }>(`${P}/vortex/lines`, { method: "POST", body: JSON.stringify({ text }) }).then((r) =>
      msgOf(r.message),
    ),
  vortexCall: (said: string[]) =>
    api<{ line: string; mood: string; hangup: boolean }>(`${P}/vortex/call`, {
      method: "POST",
      body: JSON.stringify({ said }),
    }),
};

// What Yondra pushes on the private channel, already in the phone's shapes.
export type LiveEvent =
  | { type: "message"; message: Msg; thread: Thread | null }
  | { type: "read"; thread: number; uid: number; upto: number }
  | { type: "typing"; thread: number; uid: number }
  | { type: "react"; message: number; thread: number; reactions: Record<string, number[]> }
  | { type: "thread"; thread: Thread };

export function liveOf(e: { type: string } & Record<string, unknown>): LiveEvent | null {
  switch (e.type) {
    case "message":
      return {
        type: "message",
        message: msgOf(e.message as MsgIn),
        thread: e.thread ? threadOf(e.thread as ThreadIn) : null,
      };
    case "read":
      return { type: "read", thread: Number(e.thread), uid: Number(e.uid), upto: Number(e.upto) };
    case "typing":
      return { type: "typing", thread: Number(e.thread), uid: Number(e.uid) };
    case "react":
      return {
        type: "react",
        message: Number(e.message),
        thread: Number(e.thread),
        reactions: (e.reactions ?? {}) as Record<string, number[]>,
      };
    case "thread":
      return { type: "thread", thread: threadOf(e.thread as ThreadIn) };
  }
  return null;
}
