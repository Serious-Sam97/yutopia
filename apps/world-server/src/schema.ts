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
  @type("string") held = ""; // what they carry (shared/held.ts), "" for nothing
  @type("float64") heldAt = 0; // when they took it (server ms): its sips follow from this
  @type("string") busy = ""; // using something (shared USES): the body shows it
  // with someone (shared/actions.ts SOCIAL, or "take" for the one handed a
  // drink): what, when (server ms) and with whom (their session id)
  @type("string") act = "";
  @type("float64") actAt = 0;
  @type("string") actWith = "";
  @type("boolean") focus = false; // heads down at their desk: headphones on
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
  // what it plays: the lo-fi stations, or YouTube (media: shared MediaState as JSON)
  @type("string") source = "lofi";
  @type("string") media = "";
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

// A slot-car track's race (features/slotcar.ts), one per track object. The
// racers drive their own cars and report them; everyone watches.
export class SlotCar extends Schema {
  @type("string") sid = "";
  @type("number") uid = 0;
  @type("string") name = "";
  @type("float32") s = 0; // progress on the centre line since the start
  @type("float32") v = 0;
  @type("float32") off = 0; // seconds since it flew off (0: on the track)
  @type("float32") ov = 0; // the speed it flew off at
  @type("uint8") lap = 0; // laps done
  @type("float32") last = 0; // the last lap's time (s)
  @type("float32") best = 0; // the best lap (s), 0 for none yet
  @type("uint8") place = 0; // 1.. once finished
  @type("float32") time = 0; // the race time when they finished (s)
  @type("uint16") offs = 0; // how many times it flew off this race
}

export class SlotRace extends Schema {
  // lobby (taking lanes) → countdown (lights 1..5) → race → done (results) → lobby
  @type("string") phase = "lobby";
  @type("uint8") lights = 0;
  @type("uint8") laps = 5;
  @type("string") by = ""; // who started it
  @type({ map: SlotCar }) cars = new MapSchema<SlotCar>(); // lane ("0".."3") → car
}

// A console that's on (features/games.ts), by its object id. Whoever turned
// it on runs the game and streams the TV; ports are who holds which pad.
export class GameConsole extends Schema {
  @type("string") game = ""; // the cartridge (b:… / u:…)
  @type("string") title = "";
  @type("string") system = "";
  @type("string") host = ""; // session id streaming it ("" while nobody does: paused)
  @type("string") hostName = "";
  @type("string") p1 = ""; // session ids at the pads
  @type("string") p2 = "";
  @type("string") p1Name = "";
  @type("string") p2Name = "";
  @type("boolean") live = false; // the TV's picture is going out
  @type("uint8") resumes = 0; // carried on after its host went: load the last save state
  @type("float64") since = 0;
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
  @type({ map: "string" }) holds = new MapSchema<string>(); // object id → "uid|name" of the builder holding it
  @type({ map: SlotRace }) slots = new MapSchema<SlotRace>(); // slot-car track id → its race
  @type({ map: GameConsole }) consoles = new MapSchema<GameConsole>(); // console id → what it's playing
}
