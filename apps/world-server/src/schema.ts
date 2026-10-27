import { ArraySchema, Encoder, MapSchema, Schema, type, view } from "@colyseus/schema";

// The whole world's state for someone joining: the building's five floors and
// everything on them outgrow the default 8 KB buffer (it grows, with a warning,
// patch by patch); start big enough.
Encoder.BUFFER_SIZE = 512 * 1024;

export class Player extends Schema {
  @type("string") sid = "";
  @type("number") uid = 0;
  @type("string") name = "";
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("float32") z = 0; // feet off the floor (on something, in a jump, on the stairs), tiles
  @type("uint8") level = 0; // the floor they're on (shared levels.ts)
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
  @type("boolean") admin = false; // mutes, kicks, locks (everyone builds)
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
  // the phone's flashlight on (the Grounds at night: a beam everyone sees)
  @type("boolean") torch = false;
  // the move (docs/plan/29-the-move.md M7): the gait (shared/move packMv), the facing and the
  // look (a byte each), and the sender's own clock when it moved (ms, for playing it back)
  @type("uint8") mv = 0;
  @type("uint8") yaw = 0;
  @type("int8") pitch = 0;
  @type("uint32") mt = 0;
  // the dark (docs/plan/30-the-dark.md D2): health, stamina, warmth, 0..100, for the team's HUD
  @type("uint8") hp = 100;
  @type("uint8") st = 100;
  @type("uint8") wm = 100;
  // the torch focused (D4): on, aiming, battery left, out on the land — narrow, far, burning
  @type("boolean") focused = false;
  // the weapon in the hand (docs/plan/30-the-dark.md D6): "", "revolver", "shotgun"
  @type("string") gun = "";
  // what the hand's doing with it (docs/plan/32-the-arms.md), for everyone to see: ARM
  @type("uint8") arm = 0;
  // down (D7): since when (server ms; 0: on their feet), and who's getting them up, since when
  @type("float64") downAt = 0;
  @type("string") revBy = "";
  @type("float64") revAt = 0;
  // knocked down by a pool ball (shared/pool-throw.ts KNOCK): since when (server ms; 0: on
  // their feet), and the way the ball was going (they fall away from it), radians
  @type("float64") fellAt = 0;
  @type("float32") fellYaw = 0;
}

// Something dropped (docs/plan/30-the-dark.md, phase 2): anyone on its floor may
// pick it up, for two hours. On the snow or indoors (`level`'s coords).
export class Drop extends Schema {
  @type("string") id = "";
  @type("string") item = ""; // shared inventory.ts ItemId
  @type("uint8") n = 1;
  @type("uint8") loaded = 0; // a weapon's rounds in it
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("float64") at = 0; // when (server ms)
  @type("uint8") level = 0;
}

// A cache in a day's nest (docs/plan/31-the-day.md, features/survival.ts): what one of
// the shadowed carried, lying in the snow among them — its kind (shared dark/nests.ts
// CacheKind) and where (the ground floor's coords). Searched as a loot spot.
export class Cache extends Schema {
  @type("string") id = "";
  @type("string") kind = "";
  @type("float32") x = 0;
  @type("float32") y = 0;
}

// One of the shadowed (docs/plan/30-the-dark.md D5, features/dark.ts): where it
// is (the ground floor's coords; its feet on the land), which way it faces (a
// byte), its state (shared dark/fsm.ts SHADE_STATES) and since when (server ms),
// what's left of its shield. Sent only to whoever is outside near it (StateView).
export class Shadow extends Schema {
  @type("string") id = "";
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("uint8") a = 0;
  @type("uint8") s = 0;
  @type("float64") at = 0;
  @type("uint8") sh = 100;
  @type("uint8") look = 0; // which of the office's people it was (its clothes)
  @type("boolean") k = false; // dissolving because it was shot down (a burst of light)
}

// A flare burning (D6): lit where it landed, on the snow or indoors (`level`), out at
// `until` (server ms).
export class Flare extends Schema {
  @type("string") id = "";
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("float32") z = 0;
  @type("float64") at = 0;
  @type("float64") until = 0;
  @type("uint8") level = 0;
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
  // how high they're drawn (0: on the ground under them; the Kart Park's folk sitting: their seat's)
  @type("float32") z = 0;
  @type("uint8") d = 0;
  @type("uint8") a = 0;
  @type("string") mood = "idle";
  @type("string") say = "";
  @type("float64") sayAt = 0;
  @type("string") area = "";
  // the floor they're on (shared levels.ts); -1: the studio's (Vortex's)
  @type("int8") level = -1;
}

export class Standup extends Schema {
  @type("boolean") active = false;
  @type(["number"]) order = new ArraySchema<number>();
  @type("uint8") turn = 0;
  @type("float64") turnStartedAt = 0;
  @type("uint16") turnSeconds = 90;
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

// A pool ball out of a game (features/pballs.ts, shared/pool-throw.ts): thrown or shot from the
// cue, flying, then lying on the floor (anyone may pick it up) till it goes back on its table.
// Everyone draws its flight from the launch; when it stops, where and how it lies.
export class PoolBallOut extends Schema {
  @type("uint8") n = 0; // which ball (0 the cue ball … 15)
  @type("uint8") level = 0;
  @type("string") table = ""; // the table it came off ("": the cue fired it — it goes)
  @type("string") by = ""; // who sent it (session id)
  @type("float32") x0 = 0;
  @type("float32") y0 = 0;
  @type("float32") z0 = 0;
  @type("float32") vx = 0;
  @type("float32") vy = 0;
  @type("float32") vz = 0;
  @type("float32") t1 = -1; // s into the flight it stopped (−1: still going)
  @type("float32") x1 = 0; // where it stopped
  @type("float32") y1 = 0;
  @type("float32") z1 = 0;
  @type("float32") rx = 0; // where it lies
  @type("float32") ry = 0;
  @type("float32") rz = 0;
  @type("string") hit = ""; // whom it knocked down
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
// what it's doing, its needs and growth. The record lives in the API; this is
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
  @type("uint8") floor = 0; // the floor of the building it's on (its owner's, shared levels.ts)
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

// What drives on the Grounds (docs/plan/27, phase 6; shared grounds.ts VISITOR,
// SHUTTLE): where it is in the building's coords, its heading, its speed.
export class Vehicle extends Schema {
  @type("string") id = "";
  @type("string") kind = ""; // "visitor" | "shuttle"
  @type("float32") x = 0;
  @type("float32") z = 0;
  @type("float32") a = 0; // heading (radians, atan2 of z, x)
  @type("float32") v = 0; // tiles a second (backing: below 0)
  @type("boolean") shown = false;
  @type("string") stop = ""; // at a stop (the shuttle): which
  @type("float64") honkAt = 0; // when it last honked (server ms)
  @type("uint8") riders = 0;
  // a car someone drives (docs/plan/28-the-car.md; kind "sedan" | "offroad" | "pickup"): its centre of
  // gravity's height, its turn, velocity and yaw rate, the road wheels, the engine, the gear,
  // the lamps and switches (shared car/net.ts CAR_FLAGS), the most a tyre slides; the seats'
  // people ("sid|sid|sid|sid": the driver first); the parked object it came from; its colour
  @type("float32") y = 0;
  @type("float32") qx = 0;
  @type("float32") qy = 0;
  @type("float32") qz = 0;
  @type("float32") qw = 1;
  @type("float32") vx = 0;
  @type("float32") vy = 0;
  @type("float32") vz = 0;
  @type("float32") wy = 0;
  @type("float32") steer = 0;
  @type("uint16") rpm = 0;
  @type("int8") gear = 0;
  @type("uint32") fl = 0;
  @type("float32") slip = 0;
  @type("string") seats = "|||";
  @type("string") obj = "";
  @type("uint8") colour = 0;
  @type("uint32") seq = 0;
  @type("float64") at = 0; // when this state came in (server ms)
  // what it carries from drive to drive (saved on its object): the tank (0..1), the dirt on it
  // (0..1), its dents ("front,rear,left,right", each 0..1); being filled at a pump
  @type("float32") fuel = 0.7;
  @type("float32") grime = 0;
  @type("string") dmg = "";
  @type("boolean") filling = false;
  // its role (shared car/homes.ts): "police" (a light bar, a siren), "taxi" (a roof sign), "rental"
  @type("string") role = "";
  // someone's own (docs/plan/43-the-spot.md): its plate
  @type("string") plate = "";
}

// The Kart Park (docs/plan/46-the-karts.md, features/karts.ts): its karts (a slot "0".."7" → who's in
// it, where it is as its driver last said, its race), what's flying, the crates.
export class KartSlot extends Schema {
  @type("string") sid = ""; // its driver ("" a Vortex)
  @type("string") name = "";
  @type("string") vortex = ""; // his level, when it's Vortex's
  @type("uint8") colour = 0; // shared kart/net.ts KART_COLOURS
  @type("boolean") ready = false;
  // where it is (its driver's last report; the server's own for Vortex)
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("float32") z = 0;
  @type("float32") a = 0;
  @type("float32") vx = 0;
  @type("float32") vz = 0;
  @type("float32") steer = 0;
  @type("int8") drift = 0;
  @type("uint8") tier = 0;
  @type("boolean") boost = false;
  @type("boolean") air = false;
  @type("boolean") trick = false; // flipping off the jump
  @type("float32") rev = 0; // on the grid: its engine's revs (0..1; minus: flooded — shared gridRevs)
  @type("uint32") seq = 0;
  // the race: laps done, the next checkpoint, its place, when it finished (race ms; 0 not yet), its best lap
  @type("uint8") lap = 0;
  @type("uint8") next = 1;
  @type("uint8") place = 0;
  @type("float64") done = 0;
  @type("float64") best = 0;
  @type("uint16") score = 0; // a battle's smashes
  // what it holds (shared kart/items.ts), how many, rolling till (server ms)
  @type("string") item = "";
  @type("uint8") itemN = 0;
  @type("float64") rolling = 0;
  // spun out / smashed till, the umbrella up till, ploughing till, blinking (nobody can hit it) till
  @type("float64") spinTo = 0;
  @type("float64") smashTo = 0;
  @type("float64") shieldTo = 0;
  @type("float64") ploughTo = 0;
  @type("float64") blinkTo = 0;
}
export class KartShot extends Schema {
  @type("string") kind = ""; // snowball, staple, ice, fax, blast, drone
  @type("string") by = ""; // the slot that threw it
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("float32") z = 0;
  @type("float32") vx = 0;
  @type("float32") vz = 0;
  @type("float32") a = 0;
  @type("float64") at = 0; // server ms
  // (server only) how far back to look for what it hits: the thrower's view, ms
  lag = 0;
}
export class KartPark extends Schema {
  // lobby (free laps) → lights → race → done (results) → lobby
  @type("string") phase = "lobby";
  @type("string") mode = "gp"; // gp · battle
  @type("uint8") laps = 3;
  @type("boolean") fill = true; // Vortex karts fill the grid
  @type("string") level = "medium";
  @type("float64") goAt = 0; // the lights go out (server ms)
  @type("float64") startAt = 0; // lights on (server ms)
  @type("float64") endAt = 0; // a battle's end; the results' end
  @type("float64") autoAt = 0; // the lobby: someone's ready, it starts on its own then (0: no one is)
  @type({ map: KartSlot }) karts = new MapSchema<KartSlot>();
  @type({ map: KartShot }) shots = new MapSchema<KartShot>();
  @type("string") crates = ""; // a char a crate: "1" there, "0" taken (the circuit's 16, then the bowl's 10)
  @type("string") results = ""; // the last race's (JSON)
  @type("string") record = ""; // the park's record (JSON: best lap, the last races, wins)
  @type("string") seats = ""; // the seats taken (shared kartSeats' indices, comma-separated: features/park-life.ts)
  @type("string") layout = "eight"; // the layout raced (shared KART_LAYOUTS: docs/plan/47-the-track-changer.md)
  @type("boolean") reverse = false; // …the other way round
  // the change's show (shared KART_SHOW): on, and how far the ploughs are (0..1)
  @type("boolean") showing = false;
  @type("float32") show = 0;
}

export class WorldState extends Schema {
  @type("string") name = "";
  @type("string") mapKey = "studio";
  // the map itself (the world's layout): tiles rows, rooms as JSON, arrival point
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
  // the building (shared levels.ts): the floor the map above is, and the others (LevelDef[], JSON)
  @type("uint8") floor = 0;
  @type("string") levels = "[]";
  // the weather over the Grounds (shared weather.ts): 0 calm … 1 a blizzard, and
  // where the wind blows from (radians)
  @type("float32") storm = 0;
  @type("float32") wind = 0;
  // the world's hour, 0..24: São Paulo's (shared clock.ts) unless an admin set one
  @type("float32") hour = 12;
  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: WorldObject }) objects = new MapSchema<WorldObject>();
  @type({ map: Npc }) npcs = new MapSchema<Npc>();
  @type({ map: Vehicle }) vehicles = new MapSchema<Vehicle>();
  @type(Standup) standup = new Standup();
  @type({ map: "string" }) boothGuests = new MapSchema<string>();
  @type({ map: "string" }) locks = new MapSchema<string>(); // area → who locked it
  @type({ map: "string" }) holds = new MapSchema<string>(); // object id → "uid|name" of the builder holding it
  @type({ map: SlotRace }) slots = new MapSchema<SlotRace>(); // slot-car track id → its race
  @type({ map: PoolTable }) pool = new MapSchema<PoolTable>(); // pool table id → its game
  @type({ map: PongTable }) pong = new MapSchema<PongTable>(); // ping-pong table id → its match
  @type({ map: GameConsole }) consoles = new MapSchema<GameConsole>(); // console id → what it's playing
  @type({ map: Computer }) computers = new MapSchema<Computer>(); // computer id → who's at it
  @type({ map: Pet }) pets = new MapSchema<Pet>(); // pet id → the pet (while its owner is here)
  @type({ map: Drop }) drops = new MapSchema<Drop>(); // things dropped on the snow (features/survival.ts)
  @type({ map: Cache }) caches = new MapSchema<Cache>(); // the day's nests' caches (features/survival.ts)
  // the shadowed: each client sees only those near it outside (features/dark.ts: client.view)
  @view() @type({ map: Shadow }) shadows = new MapSchema<Shadow>();
  @type({ map: Flare }) flares = new MapSchema<Flare>(); // flares burning (features/arms.ts)
  @type({ map: PetBattle }) battles = new MapSchema<PetBattle>();
  @type({ map: Toy }) toys = new MapSchema<Toy>();
  @type({ map: PoolBallOut }) pballs = new MapSchema<PoolBallOut>(); // pool balls out of a game (features/pballs.ts)
  @type("string") playlists = "[]"; // YouTube playlists played here (shared/media.ts SavedPlaylist[], JSON)
  @type({ map: "float64" }) ploughed = new MapSchema<number>(); // plough cell → when a blade last cleared it (shared car/world.ts)
  @type({ map: KartPark }) karts = new MapSchema<KartPark>(); // "park" → the Kart Park (features/karts.ts)
}
