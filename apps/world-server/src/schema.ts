import { ArraySchema, MapSchema, Schema, type } from "@colyseus/schema";

export class Player extends Schema {
  @type("string") sid = "";
  @type("number") uid = 0;
  @type("string") name = "";
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("uint8") d = 0;
  @type("uint8") a = 0;
  @type("string") area = "";
  @type("string") status = "online";
  @type("string") avatar = "{}";
  @type("string") emote = "";
  @type("float64") emoteAt = 0;
  @type("boolean") mic = false;
  @type("boolean") cam = false;
  @type("boolean") screen = false;
  @type("boolean") speaking = false;
  @type("string") desk = "";
  @type("boolean") builder = false;
  @type("boolean") bot = false;
  @type("boolean") muted = false; // by an owner: LiveKit publish permission revoked
}

export class WorldObject extends Schema {
  @type("string") id = "";
  @type("string") kind = "";
  @type("int16") x = 0;
  @type("int16") y = 0;
  @type("uint8") rot = 0;
  @type("number") refId = 0;
  @type("string") props = "{}";
}

export class Npc extends Schema {
  @type("string") id = "";
  @type("string") kind = "";
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("uint8") d = 0;
  @type("uint8") a = 0;
  @type("string") mood = "idle";
  @type("string") say = "";
  @type("float64") sayAt = 0;
  @type("string") area = "";
}

export class Radio extends Schema {
  @type("boolean") playing = false;
  @type("uint8") station = 0;
  @type("float64") startedAt = 0;
  @type("string") by = "";
}

export class Standup extends Schema {
  @type("boolean") active = false;
  @type(["number"]) order = new ArraySchema<number>();
  @type("uint8") turn = 0;
  @type("float64") turnStartedAt = 0;
  @type("uint16") turnSeconds = 90;
  @type("string") by = "";
}

// The card on the poker table. Votes live in Yondra's planning session.
export class Poker extends Schema {
  @type("boolean") open = false;
  @type("number") cardId = 0;
  @type("number") boardId = 0;
  @type("string") title = "";
  @type("string") by = "";
}

export class SpaceState extends Schema {
  @type("number") spaceId = 0;
  @type("string") name = "";
  @type("string") mapKey = "studio";
  @type("number") projectId = 0;
  // the map itself (per-space layout): tiles rows, rooms as JSON, arrival point
  @type("uint16") width = 0;
  @type("uint16") height = 0;
  @type(["string"]) tiles = new ArraySchema<string>();
  // walls on tile edges (map v2): north edges per row, west edges per row
  @type(["string"]) hWalls = new ArraySchema<string>();
  @type(["string"]) vWalls = new ArraySchema<string>();
  @type("string") areas = "[]";
  @type("float32") spawnX = 0;
  @type("float32") spawnY = 0;
  @type("uint32") mapVersion = 0;
  @type("string") theme = "clouds"; // what surrounds the studio
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: WorldObject }) objects = new MapSchema<WorldObject>();
  @type({ map: Npc }) npcs = new MapSchema<Npc>();
  @type(Radio) radio = new Radio();
  @type(Standup) standup = new Standup();
  @type(Poker) poker = new Poker();
  @type({ map: "string" }) boothGuests = new MapSchema<string>();
  @type({ map: "string" }) locks = new MapSchema<string>(); // area → who locked it
}
