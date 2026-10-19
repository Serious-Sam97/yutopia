import { RoomServiceClient } from "livekit-server-sdk";
import { config } from "./config.ts";

// Who hears whom is decided here (see WorldRoom.hearingPass) and enforced by
// LiveKit through each publisher's track permissions. The server API is only
// used to drop a person's media connection when they really leave.
const client =
  config.livekit.url && config.livekit.key && config.livekit.secret
    ? new RoomServiceClient(config.livekit.url, config.livekit.key, config.livekit.secret)
    : null;

export const livekitEnabled = client !== null;

export async function setCanPublish(room: string, identity: string, can: boolean): Promise<void> {
  if (!client) return;
  await client
    .updateParticipant(room, identity, { permission: { canPublish: can, canSubscribe: true, canPublishData: true } })
    .catch((e) => console.warn("[livekit] permission", (e as Error).message));
}

export async function removeParticipant(room: string, identity: string): Promise<void> {
  if (!client) return;
  await client.removeParticipant(room, identity).catch(() => {});
}
