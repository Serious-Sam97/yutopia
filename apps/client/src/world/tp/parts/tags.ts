import { EMOTES, type Emote, WANTS, type Want } from "@yutopia/shared";
import { tr } from "@/lib/i18n";
import { emoteUrl } from "../../art/emotes";
import type { Body3, ThirdPersonView } from "../view";
import type { Tag } from "./common";

/** What Tags reads of the ThirdPersonView (plan 72 phase 4: its dependencies, said). */
export type TagsHost = Pick<
  ThirdPersonView,
  "camera" | "eyes" | "hidden" | "level" | "meId" | "mode" | "people3" | "pets3" | "project"
>;

export class Tags {
  constructor(private readonly c: TagsHost) {}

  tagLayer: HTMLDivElement | null = null;

  tagEls = new Map<string, Tag>();

  // Over heads, as in iso: the name tag (status dot, a slash when the mic is
  // off), the emote above it, chat bubbles above that. HTML over the canvas
  // (crisp at any distance), hidden behind standing walls and far away.
  // name tags off while a panel covers the world (they're HTML, above the canvas)
  tagsHidden = false;

  drawTags(bodies: Body3[]) {
    const layer = this.tagLayer;
    if (!layer) return;
    const hide = this.tagsHidden ? "none" : "";
    if (layer.style.display !== hide) layer.style.display = hide;
    const cam = this.c.camera.position;
    const now = performance.now();
    const seen = new Set<string>();
    for (const b of bodies) {
      if (b.shade) continue; // (the shadowed have no names)
      seen.add(b.id);
      // (and in the morning fog, past what it leaves of them: docs/plan/64-the-fog.md F5)
      const fogK = this.c.eyes.fogSeen(b);
      if (fogK < 0.1) this.c.eyes.unseen.add(b.id);
      const dark = this.c.eyes.unseen.has(b.id);
      let t = this.tagEls.get(b.id);
      if (!t) {
        t = makeTag();
        layer.appendChild(t.root);
        this.tagEls.set(b.id, t);
      }
      // (in god mode: building the open world — docs/plan/53-the-god-mode.md)
      const label = b.busy === "god" ? `${b.name} · ${tr("godBuilding")}` : b.name;
      if (t.name.textContent !== label) t.name.textContent = label;
      const dot = b.pet
        ? b.pet.look.color
        : b.npc
          ? "#c4402b"
          : b.status === "dnd"
            ? "#b5562f"
            : b.status === "away"
              ? "#8d877a"
              : "#6e7b3a";
      const muted = !b.mic && !b.npc && !b.bot && !b.pet;
      const dotKey = `${dot}|${muted}`;
      if (t.dotKey !== dotKey) {
        t.dotKey = dotKey;
        t.dot.style.background = dot;
        t.slash.style.display = muted ? "" : "none";
      }
      const emote =
        b.emote && ((EMOTES as readonly string[]).includes(b.emote) || (WANTS as readonly string[]).includes(b.emote))
          ? (b.emote as Emote | Want)
          : "";
      if (t.emoteKey !== emote) {
        t.emoteKey = emote;
        if (emote) t.emote.src = emoteUrl(emote);
      }
      // (out in the dark, unseen: no name, no emote — the bubble still: they're heard)
      const showEmote = emote && !dark ? "" : "none";
      if (t.emote.style.display !== showEmote) t.emote.style.display = showEmote;
      const pill = t.name.parentElement as HTMLElement;
      const showName = dark ? "none" : "";
      if (pill.style.display !== showName) pill.style.display = showName;
      // (fading with them as the fog takes them; a bubble not: they're heard)
      const fade = fogK >= 0.5 ? "" : (Math.max(0, fogK - 0.1) / 0.4).toFixed(2);
      if (pill.style.opacity !== fade) {
        pill.style.opacity = fade;
        t.emote.style.opacity = fade;
      }
      if (t.bubbleUntil && now > t.bubbleUntil) {
        t.bubbleUntil = 0;
        t.bubble.style.display = "none";
      }
      const p3 = this.c.people3.get(b.id);
      const pe = b.pet ? this.c.pets3.get(b.id) : undefined;
      // (a pet's over its back, where it stands: the land's height, a lift's car)
      const h = b.pet
        ? (pe?.model.root.position.y ?? b.z ?? 0) + (pe?.model.height ?? 0.8) + 0.18
        : p3?.ready
          ? p3.tagY()
          : b.npc
            ? 1.6
            : b.a === 2
              ? 1.45
              : 2.0;
      const far = Math.hypot(cam.x - b.x, cam.z - b.y) > 16;
      // (first person: nothing over your own head — the camera is in it)
      const mine = this.c.mode === "first" && b.id === this.c.meId;
      // (someone on a floor below: the floor's between us — no tag through it)
      const below = (b.level ?? this.c.level) !== this.c.level;
      const p = far || mine || below || this.c.hidden(b.x, b.y, h) ? null : this.c.project(b.x, b.y, h);
      t.root.style.display = p ? "" : "none";
      if (p) {
        const bob = emote && !b.reduced ? Math.sin(now / 166) * 2 : 0;
        t.emote.style.transform = `translate(-50%, ${bob}px)`;
        t.root.style.transform = `translate(${p.x}px, ${p.y}px)`;
        t.root.style.zIndex = String(Math.round(10000 - Math.hypot(cam.x - b.x, cam.z - b.y) * 100));
      }
    }
    for (const [id, t] of this.tagEls)
      if (!seen.has(id)) {
        t.root.remove();
        this.tagEls.delete(id);
      }
  }

  // A chat bubble over someone's head (as the iso engine's `say`).
  say(id: string, text: string, ms = 6000) {
    const t = this.tagEls.get(id);
    if (!t) return;
    t.bubble.textContent = text.length > 140 ? `${text.slice(0, 137)}…` : text;
    t.bubble.style.display = "";
    t.bubbleUntil = performance.now() + ms;
  }
}

// The iso look: a dark pill in Share Tech Mono, the paper bubble with a walnut
// edge, the emote's own drawing.
function makeTag(): Tag {
  const root = document.createElement("div");
  root.style.cssText = "position:absolute;left:0;top:0;width:0;height:0;will-change:transform";
  const stack = document.createElement("div");
  stack.style.cssText =
    "position:absolute;left:0;bottom:0;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:3px";
  const bubble = document.createElement("div");
  bubble.style.cssText =
    "display:none;max-width:196px;padding:5px 8px;border-radius:8px;background:rgba(247,240,222,.96);border:1px solid rgba(91,58,38,.6);color:#2a1a12;font:12px/15px Inter,ui-sans-serif,system-ui,sans-serif;text-align:left;white-space:normal;overflow-wrap:anywhere;width:max-content;position:relative;margin-bottom:4px";
  const emote = document.createElement("img");
  emote.alt = "";
  emote.style.cssText = "display:none;width:34px;height:34px;position:relative;left:50%";
  const pill = document.createElement("div");
  pill.style.cssText =
    "display:flex;align-items:center;gap:6px;height:18px;padding:0 9px 0 7px;border-radius:9px;background:rgba(30,23,18,.78);color:#efe4cc;font:12px/18px 'Share Tech Mono',ui-monospace,monospace;letter-spacing:.3px;white-space:nowrap";
  const dot = document.createElement("span");
  dot.style.cssText = "position:relative;width:6.4px;height:6.4px;border-radius:50%;flex:none";
  const slash = document.createElement("span");
  slash.style.cssText =
    "display:none;position:absolute;left:50%;top:50%;width:8.5px;height:1.4px;background:#efe4cc;transform:translate(-50%,-50%) rotate(45deg)";
  dot.appendChild(slash);
  const name = document.createElement("span");
  pill.append(dot, name);
  stack.append(bubble, emote, pill);
  root.appendChild(stack);
  return { root, name, dot, slash, emote, bubble, dotKey: "", emoteKey: "", bubbleUntil: 0 };
}
