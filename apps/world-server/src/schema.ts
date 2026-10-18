import { ArraySchema, MapSchema, Schema, type } from "@colyseus/schema";

export class Player extends Schema {
  @type("string") sid = "";
  @type("number") uid = 0;
  @type("string") name = "";
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("float32") z = 0; // feet off the floor (on something, or in a jump), tiles
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
  // the phone (shared/phone.ts): what it's doing in their hand, ringing (heard
  // near them, in their ringtone), the case everyone sees, the last photo's flash
  @type("string") phone = "";
  @type("boolean") ringing = false;
  @type("string") tone = "citypop";
  @type("string") phoneCase = "walnut";
  @type("float64") shotAt = 0;
  @type("string") phonePose = ""; // posing for a photo (shared PHOTO_POSES)
  @type("boolean") recording = false; // its camera recording a video
  // a jump (shared/jump.ts): which, and when it started (server ms)
  @type("string") jump = "";
  @type("float64") jumpAt = 0;
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
  @type("string") diff = "medium"; // free / medium / hard (shared/slotcar.ts)
  @type("string") by = ""; // who started it
  @type({ map: SlotCar }) cars = new MapSchema<SlotCar>(); // lane ("0".."3") → car
}

// A pool table's game (features/pool.ts), one per table object. Two seats (a
// person, or Vortex at a level); the game itself (shared/pool-game.ts) and the
// last shot travel as JSON — they change once a shot, everyone replays the shot
// from `before` with the same physics and eases to `game`'s layout.
export class PoolSeat extends Schema {
  @type("string") sid = "";
  @type("number") uid = 0;
  @type("string") name = "";
  @type("string") vortex = ""; // his level, when it's Vortex in this seat
}

export class PoolTable extends Schema {
  @type("string") phase = "lobby"; // lobby → play → done (the result up) → lobby / play again
  @type({ map: PoolSeat }) seats = new MapSchema<PoolSeat>(); // "0" / "1"
  @type("string") game = ""; // PoolGame (JSON)
  @type("string") before = ""; // the balls before the last shot (JSON)
  @type("string") shot = ""; // the last shot: { angle, power, spinX, spinY, called, seat } (JSON)
  @type("uint16") shotNo = 0;
  @type("float64") shotAt = 0; // server ms
  @type("float64") until = 0; // server ms: the last shot's balls are still rolling till then
  @type("string") result = ""; // what the last shot meant (JSON: foul, potted, outcome, assigned…)
  @type("string") aim = ""; // the shooter's cue as they aim (JSON, ~10 a second)
  @type("float64") turnAt = 0; // server ms: when this turn began (the shot clock)
  @type("uint8") clock = 0; // the shot clock: 0 (off) / 30 / 60 s
  @type("string") guide = "short"; // the guideline: long / short / pro
  @type("uint8") breaker = 0; // who breaks the next game
  @type("string") by = "";
}

// A ping-pong table's match (features/pong.ts). The ball's flight is one event
// (when, where, how) the server and every client run through the same physics
// (shared/pong.ts); a new one each serve and hit. Each player's racket streams
// in for the others to see (and the referee to check hits against).
export class PongSeat extends Schema {
  @type("string") sid = "";
  @type("number") uid = 0;
  @type("string") name = "";
  @type("string") vortex = ""; // his level, when it's Vortex at this end
}

export class PongTable extends Schema {
  @type("string") phase = "lobby"; // lobby → play → done
  @type({ map: PongSeat }) seats = new MapSchema<PongSeat>(); // "0" (−x end) / "1" (+x end)
  @type("string") score = ""; // PongScore (JSON)
  @type("string") rally = ""; // Rally (JSON)
  @type("string") flight = ""; // the ball's flight now: PongFlight (JSON), "" = in the server's hand
  @type("uint16") seq = 0; // a new flight, a new number
  @type("string") point = ""; // the last point: { no, winner, why } (JSON)
  @type("uint16") pointNo = 0;
  @type("float64") wait = 0; // server ms: no serve before this (after a point)
  @type("string") r0 = ""; // the rackets as they move (JSON: x y z nx ny nz vx vy vz t)
  @type("string") r1 = "";
  @type("string") cpu = ""; // Vortex's next hit: { seq, t, x, y, z, whiff } (JSON)
  @type("uint8") to = 11;
  @type("uint8") bestOf = 1;
  @type("uint8") first = 0; // who serves first next match
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
  @type("boolean") a1 = false; // a pad in its analog mode (the disc console's: its red LED)
  @type("boolean") a2 = false;
  @type("boolean") live = false; // the TV's picture is going out
  @type("uint8") resumes = 0; // carried on after its host went: load the last save state
  @type("float64") since = 0;
}

// A computer someone is at (features/computer.ts, shared/computer.ts), by its
// object id: who, and what its VortexOS shows (others draw it on the glass).
export class Computer extends Schema {
  @type("string") sid = "";
  @type("number") uid = 0;
  @type("string") name = "";
  @type("string") phase = "boot";
  @type("string") era = "";
  @type("string") app = "";
  @type("string") user = "";
  @type("float64") since = 0;
}

// Someone's pet (features/pets.ts, rules in shared/pets.ts): where it is and
// what it's doing, its needs and growth. The record lives in Yondra; this is
// what everyone in the room sees.
export class Pet extends Schema {
  @type("string") id = ""; // the record's id
  @type("number") uid = 0; // its owner
  @type("string") sid = ""; // the owner's session
  @type("string") owner = ""; // the owner's name
  @type("string") name = "";
  @type("string") species = "dog";
  @type("string") look = "{}"; // shared PetLook (JSON)
  @type("string") outfit = "{}"; // shared PetOutfit (JSON)
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("uint8") d = 0;
  @type("uint8") a = 0; // ANIM: idle / walk / sit (asleep)
  @type("string") mode = "follow"; // shared PetMode
  // what it's doing right now ("" for nothing): eat, drink, pet, play:<toy>,
  // trick:<trick>, lesson:<trick>, attack, special, defend, rest, hurt, ko,
  // sleep; since when (server ms); a spot it runs to (fetch, a laser dot)
  @type("string") act = "";
  @type("float64") actAt = 0;
  @type("float32") actX = 0;
  @type("float32") actY = 0;
  @type("string") say = ""; // a sound: <mood> (shared PetMood), heard near it
  @type("float64") sayAt = 0;
  @type("uint8") food = 100;
  @type("uint8") water = 100;
  @type("uint8") energy = 100;
  @type("uint8") fun = 100;
  @type("uint8") health = 100;
  @type("uint32") xp = 0;
  @type("uint8") level = 1;
  @type("string") tricks = "{}"; // trick → progress 0..100 (JSON)
  @type("boolean") alive = true;
  @type("uint16") wins = 0;
  @type("uint16") losses = 0;
  @type("string") battle = ""; // the battle it's in
  @type("string") carry = ""; // a toy in its mouth (shared/held.ts kind)
  // its mind (shared/mind.ts): what it wants right now (a WANT icon over its
  // head, since when), who it is and who it's close to (JSON, for the panel)
  @type("string") want = "";
  @type("float64") wantAt = 0;
  @type("string") traits = "{}";
  @type("string") bonds = "{}";
}

// A battle between two pets (shared/pets.ts): each owner picks a move, the
// round plays out, until a KO or the last round.
export class PetBattle extends Schema {
  @type("string") id = "";
  @type("string") a = ""; // pet ids
  @type("string") b = "";
  @type("string") sidA = ""; // their owners
  @type("string") sidB = "";
  @type("int16") hpA = 0;
  @type("int16") hpB = 0;
  @type("int16") maxA = 0;
  @type("int16") maxB = 0;
  @type("string") moveA = ""; // picked this round ("" while thinking)
  @type("string") moveB = "";
  @type("uint8") round = 1;
  @type("string") phase = "pick"; // pick → anim → pick … → done
  @type("float64") until = 0; // when the phase ends on its own (server ms)
  @type("string") log = "[]"; // the last round's events (shared BattleEvent[], JSON)
  @type("string") winner = ""; // a / b / draw
}

// A toy out in the world (features/pets.ts, shared/pets.ts): flying, on the
// floor, or in a pet's mouth. (In a hand it's the player's `held`.)
export class Toy extends Schema {
  @type("string") id = "";
  @type("string") kind = ""; // shared/held.ts kind
  @type("string") state = "floor"; // flying | floor | mouth
  @type("string") by = ""; // the session that threw it (whose pets fetch it)
  @type("string") holder = ""; // the pet carrying it
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("float32") fromX = 0;
  @type("float32") fromY = 0;
  @type("float64") at = 0;
  @type("uint16") dur = 0;
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
  // their other faces' materials where they differ (shared map.ts: two faces); empty = none
  @type(["string"]) hBacks = new ArraySchema<string>();
  @type(["string"]) vBacks = new ArraySchema<string>();
  @type("string") areas = "[]";
  @type("float32") spawnX = 0;
  @type("float32") spawnY = 0;
  @type("uint32") mapVersion = 0;
  @type("string") theme = "clouds"; // what surrounds the studio
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: WorldObject }) objects = new MapSchema<WorldObject>();
  @type({ map: Npc }) npcs = new MapSchema<Npc>();
  @type(Standup) standup = new Standup();
  @type(Poker) poker = new Poker();
  @type({ map: "string" }) boothGuests = new MapSchema<string>();
  @type({ map: "string" }) locks = new MapSchema<string>(); // area → who locked it
  @type({ map: "string" }) holds = new MapSchema<string>(); // object id → "uid|name" of the builder holding it
  @type({ map: SlotRace }) slots = new MapSchema<SlotRace>(); // slot-car track id → its race
  @type({ map: PoolTable }) pool = new MapSchema<PoolTable>(); // pool table id → its game
  @type({ map: PongTable }) pong = new MapSchema<PongTable>(); // ping-pong table id → its match
  @type({ map: GameConsole }) consoles = new MapSchema<GameConsole>(); // console id → what it's playing
  @type({ map: Computer }) computers = new MapSchema<Computer>(); // computer id → who's at it
  @type({ map: Pet }) pets = new MapSchema<Pet>(); // pet id → the pet (while its owner is here)
  @type({ map: PetBattle }) battles = new MapSchema<PetBattle>();
  @type({ map: Toy }) toys = new MapSchema<Toy>();
  @type("string") playlists = "[]"; // YouTube playlists played here (shared/media.ts SavedPlaylist[], JSON)
}
