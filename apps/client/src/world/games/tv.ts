import { type LocalTrackPublication, Room, Track, VideoPresets } from "livekit-client";

// A game room TV going out (its host's browser): the emulator's picture and
// sound published as a LiveKit participant of its own ("tv-<console id>",
// a token from the world-server), so it never mixes with the host's camera or
// screen. Who may take what is the server's audience: the picture for everyone
// in the space, the sound for whoever's in earshot of the TV.
export class TvStream {
  private room: Room | null = null;
  private video: LocalTrackPublication | null = null;
  private audio: LocalTrackPublication | null = null;
  private audience: { video: string[]; audio: string[] } = { video: [], audio: [] };

  async start(url: string, token: string, canvas: HTMLCanvasElement, sound: MediaStream | null): Promise<boolean> {
    if (!token) return false; // no LiveKit (offline): the host still plays, nobody else sees it
    const room = new Room({ dynacast: true });
    this.room = room;
    try {
      await room.connect(url, token, { autoSubscribe: false });
    } catch (e) {
      console.warn("[tv] connect failed", e);
      this.room = null;
      return false;
    }
    const [vt] = canvas.captureStream(30).getVideoTracks();
    this.video = await room.localParticipant.publishTrack(vt, {
      name: "tv",
      source: Track.Source.Unknown,
      simulcast: true,
      videoEncoding: { maxBitrate: 1_400_000, maxFramerate: 30 },
      videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360],
      degradationPreference: "maintain-framerate",
    });
    const at = sound?.getAudioTracks()[0];
    if (at)
      this.audio = await room.localParticipant.publishTrack(at, {
        name: "tv-sound",
        source: Track.Source.Unknown,
        dtx: false,
        red: false,
      });
    this.apply();
    return true;
  }

  // From the world-server: user ids who may see it, and who may hear it.
  setAudience(video: string[], audio: string[]) {
    this.audience = { video, audio };
    this.apply();
  }

  private apply() {
    const lp = this.room?.localParticipant;
    const v = this.video?.trackSid;
    if (!lp || !v || this.room?.state !== "connected") return;
    const a = this.audio?.trackSid;
    const hear = new Set(this.audience.audio);
    lp.setTrackSubscriptionPermissions(
      false,
      this.audience.video.map((id) => ({
        participantIdentity: id,
        allowAll: false,
        allowedTrackSids: hear.has(id) && a ? [v, a] : [v],
      })),
    );
  }

  get live(): boolean {
    return this.room?.state === "connected" && !!this.video;
  }

  async stop() {
    const room = this.room;
    this.room = null;
    this.video = this.audio = null;
    await room?.disconnect().catch(() => {});
  }
}
