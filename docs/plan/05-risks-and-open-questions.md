# 05 — Risks & Open Questions

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| **Art volume** (iso tiles + 8-dir avatars + furniture) | Biggest schedule risk | Placeholder art through Fita 3; Blender-to-sprite pipeline; limit v1 to one building |
| WebRTC behind corporate NAT/firewalls | Calls fail for some people | TURN (LiveKit's built-in TURN/TLS on 443) before anyone outside the LAN uses it |
| Sanctum cookie across origins | Login doesn't carry over | Same parent domain in prod; stateful domains + CORS in dev; token fallback if needed |
| Embedded board iframe feels "pasted in" | Undercuts the quality pitch | Chrome-less embed layout + postMessage bridge + in-world live wall; native card view later |
| Vortex in meetings gets annoying | People mute/hate him | Speech budget, quiet in private areas/stage, invite-only in meetings |
| Two realtime systems (Reverb + Colyseus) | Ops complexity | Clear ownership table (see 02); Colyseus never touches Yondra data |
| Mobile performance | Bad experience on phones | Reduced-quality mode (no lighting filters, lower res), audio-only mode |

## Open questions (your call)

1. **Domain / hosting** for production (same VPS as Yondra? subdomain `world.` / `yutopia.`?).
2. **Avatar art route:** Blender-rendered sprites (consistent, scalable) or hand-drawn (prettier, slower)?
3. **First map:** is the "Studio Building" concept right, or do you want something else (a city block, a ship, a radio station)?
4. **Screen share + whiteboard:** tldraw (nicer, licence to check for commercial use) or Excalidraw (MIT)?
5. **Git:** separate GitHub repo `yutopia` (like the other two)?
6. **Chat persistence:** ephemeral only, or saved in Laravel and searchable?
