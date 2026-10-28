<?php

namespace App\Http\Controllers;

use App\Models\AdminAction;
use App\Models\Game;
use App\Models\LastSpot;
use App\Models\PerfReport;
use App\Models\Pet;
use App\Models\Spawn;
use App\Models\User;
use App\Models\World;
use App\Models\WorldObject;
use App\Services\Presence;
use App\Services\Vortex;
use App\Services\Worlds;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

// The world-server's side door (/api/internal/*, signed: VerifyInternalSignature).
// It loads the world when it starts, writes every edit and live prop back, keeps
// pets, arrival points and desks, and asks Vortex what to say.
class InternalController extends Controller
{
    // (shared admin.ts LOG_KINDS: what the log takes)
    private const LOG_KINDS = ['mute', 'unmute', 'remove', 'unremove', 'lock', 'unlock', 'admin', 'unadmin', 'hour', 'storm', 'notice', 'power', 'spawn', 'clear', 'freeze', 'home', 'bring', 'unseat', 'heal', 'give', 'cars', 'shuttle', 'dark', 'invite'];

    public function __construct(private readonly Worlds $worlds) {}

    public function ping(): JsonResponse
    {
        return response()->json(['ok' => true, 'time' => time()]);
    }

    /** Everyone with an account (their ids): the world server takes down what's left of anyone gone — their
     *  bay's board, their own car (docs/plan/43-the-spot.md). */
    public function members(): JsonResponse
    {
        return response()->json(['ids' => User::orderBy('id')->pluck('id')]);
    }

    public function world(): JsonResponse
    {
        $world = World::current();

        return response()->json([
            'name' => $world->name,
            'mapKey' => $world->map_key,
            'seeded' => $world->seeded_at !== null,
            'layout' => $world->layout,
            'playlists' => $world->settings['playlists'] ?? [],
            'loot' => $world->settings['loot'] ?? null,
            'karts' => $world->settings['karts'] ?? null,
            'objects' => WorldObject::orderBy('id')->get()->map->toWorld(),
        ]);
    }

    public function seed(Request $request): JsonResponse
    {
        $data = $request->validate($this->objectRules('objects.*.'));

        return response()->json(['objects' => $this->worlds->seed($data['objects'])->map->toWorld()]);
    }

    public function upsertObject(Request $request): JsonResponse
    {
        $o = $request->validate($this->objectRules(''));
        $row = WorldObject::updateOrCreate(
            ['uid' => $o['id']],
            ['kind' => $o['kind'], 'x' => $o['x'], 'y' => $o['y'], 'rot' => $o['rot'] ?? 0, 'ref_id' => $o['refId'] ?? null, 'props' => $o['props'] ?? null],
        );

        return response()->json(['object' => $row->toWorld()]);
    }

    public function deleteObject(string $uid): JsonResponse
    {
        WorldObject::where('uid', $uid)->delete();

        return response()->json(['ok' => true]);
    }

    public function desk(Request $request): JsonResponse
    {
        $data = $request->validate([
            'user_id' => ['required', 'integer'],
            'desks' => ['present', 'array'],
            'desks.*' => ['string', 'max:64'],
            'assign' => ['sometimes', 'boolean'],
        ]);

        return response()->json(['desk' => $this->worlds->deskFor((int) $data['user_id'], $data['desks'], (bool) ($data['assign'] ?? true))]);
    }

    // Where this person arrives (null: the world's arrival point).
    // The world-server checks the spot against the map; this only stores it.
    public function spawn(int $userId): JsonResponse
    {
        $row = Spawn::where('user_id', $userId)->first();

        return response()->json(['spawn' => $row ? ['x' => $row->x, 'y' => $row->y, 'level' => $row->level] : null]);
    }

    public function putSpawn(Request $request, int $userId): JsonResponse
    {
        $data = $request->validate([
            'spawn' => ['present', 'nullable', 'array'],
            'spawn.x' => ['required_with:spawn', 'numeric', 'between:0,160'],
            'spawn.y' => ['required_with:spawn', 'numeric', 'between:0,160'],
            // the floor it's on (the building's, see layout); none: the home floor
            'spawn.level' => ['nullable', 'integer', 'between:0,12'],
        ]);
        // (saved every minute someone's in, and as they leave: when they were last seen)
        User::findOrFail($userId)->forceFill(['seen_at' => now()])->saveQuietly();
        if ($data['spawn'] === null) {
            Spawn::where('user_id', $userId)->delete();

            return response()->json(['spawn' => null]);
        }
        $at = [
            'x' => (float) $data['spawn']['x'],
            'y' => (float) $data['spawn']['y'],
            'level' => isset($data['spawn']['level']) ? (int) $data['spawn']['level'] : null,
        ];
        Spawn::updateOrCreate(['user_id' => $userId], $at);

        return response()->json(['spawn' => $at]);
    }

    // Where someone was when they last left (null: never been in): they come back there.
    public function lastSpot(int $userId): JsonResponse
    {
        $row = LastSpot::where('user_id', $userId)->first();

        return response()->json(['spot' => $row ? $row->only(['x', 'y', 'level', 'd']) : null]);
    }

    // Where people are, from the world-server: as each leaves, and everyone now and
    // then (a server that stops without goodbyes loses no more than that).
    public function putLastSpots(Request $request): JsonResponse
    {
        $data = $request->validate([
            'spots' => ['present', 'array', 'max:600'],
            'spots.*.user_id' => ['required', 'integer'],
            'spots.*.x' => ['required', 'numeric', 'between:-2000,2000'],
            'spots.*.y' => ['required', 'numeric', 'between:-2000,2000'],
            'spots.*.level' => ['required', 'integer', 'between:0,12'],
            'spots.*.d' => ['required', 'integer', 'between:0,7'],
        ]);
        $known = User::whereIn('id', array_column($data['spots'], 'user_id'))->pluck('id')->flip();
        $now = Carbon::now();
        $rows = [];
        foreach ($data['spots'] as $s) {
            if (! isset($known[$s['user_id']])) {
                continue;
            }
            $rows[] = [
                'user_id' => (int) $s['user_id'],
                'x' => (float) $s['x'],
                'y' => (float) $s['y'],
                'level' => (int) $s['level'],
                'd' => (int) $s['d'],
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }
        LastSpot::upsert($rows, ['user_id'], ['x', 'y', 'level', 'd', 'updated_at']);

        return response()->json(['saved' => count($rows)]);
    }

    // How the game ran for the players (docs/plan/39-the-telemetry.md): the world-server's
    // batch, a minute of reports at a time (each player's own window, its snaps added).
    public function perfReports(Request $request): JsonResponse
    {
        $data = $request->validate([
            'reports' => ['present', 'array', 'max:500'],
            'reports.*.user_id' => ['required', 'integer'],
            'reports.*.at' => ['required', 'integer', 'min:0'],
            'reports.*.session' => ['required', 'string', 'max:40'],
            'reports.*.version' => ['nullable', 'string', 'max:40'],
            'reports.*.secs' => ['required', 'numeric', 'between:0,600'],
            'reports.*.view' => ['required', 'string', 'max:8'],
            'reports.*.quality' => ['required', 'string', 'max:8'],
            'reports.*.level' => ['required', 'integer', 'between:-5,20'],
            'reports.*.area' => ['present', 'string', 'max:40'],
            'reports.*.x' => ['required', 'numeric', 'between:-3000,3000'],
            'reports.*.y' => ['required', 'numeric', 'between:-3000,3000'],
            'reports.*.fps' => ['required', 'numeric', 'between:0,1000'],
            'reports.*.frame_med' => ['required', 'numeric', 'between:0,60000'],
            'reports.*.frame_p95' => ['required', 'numeric', 'between:0,60000'],
            'reports.*.frame_worst' => ['required', 'numeric', 'between:0,60000'],
            'reports.*.gap_p95' => ['required', 'numeric', 'between:0,60000'],
            'reports.*.over33' => ['required', 'integer', 'between:0,1000000'],
            'reports.*.over50' => ['required', 'integer', 'between:0,1000000'],
            'reports.*.long_tasks' => ['required', 'integer', 'between:0,1000000'],
            'reports.*.draws' => ['nullable', 'integer', 'between:0,1000000'],
            'reports.*.ping_med' => ['nullable', 'numeric', 'between:0,60000'],
            'reports.*.ping_p95' => ['nullable', 'numeric', 'between:0,60000'],
            'reports.*.snaps' => ['required', 'integer', 'between:0,1000000'],
            'reports.*.browser' => ['present', 'string', 'max:60'],
            'reports.*.gpu' => ['present', 'string', 'max:120'],
            'reports.*.stages' => ['present', 'array', 'max:20'],
            'reports.*.stages.*' => ['numeric', 'between:0,60000'],
            'reports.*.machine' => ['present', 'array', 'max:20'],
            'reports.*.context' => ['present', 'array', 'max:30'],
        ]);
        $known = User::whereIn('id', array_column($data['reports'], 'user_id'))->pluck('id')->flip();
        $now = Carbon::now();
        $rows = [];
        foreach ($data['reports'] as $r) {
            if (! isset($known[$r['user_id']])) {
                continue;
            }
            $rows[] = [
                'user_id' => (int) $r['user_id'],
                'session' => $r['session'],
                'version' => $r['version'] ?? '',
                'at' => Carbon::createFromTimestampMs((int) $r['at']),
                'secs' => (float) $r['secs'],
                'view' => $r['view'],
                'quality' => $r['quality'],
                'level' => (int) $r['level'],
                'area' => $r['area'],
                'x' => (float) $r['x'],
                'y' => (float) $r['y'],
                'fps' => (float) $r['fps'],
                'frame_med' => (float) $r['frame_med'],
                'frame_p95' => (float) $r['frame_p95'],
                'frame_worst' => (float) $r['frame_worst'],
                'gap_p95' => (float) $r['gap_p95'],
                'over33' => (int) $r['over33'],
                'over50' => (int) $r['over50'],
                'long_tasks' => (int) $r['long_tasks'],
                'draws' => isset($r['draws']) ? (int) $r['draws'] : null,
                'ping_med' => isset($r['ping_med']) ? (float) $r['ping_med'] : null,
                'ping_p95' => isset($r['ping_p95']) ? (float) $r['ping_p95'] : null,
                'snaps' => (int) $r['snaps'],
                'browser' => $r['browser'],
                'gpu' => $r['gpu'],
                'stages' => json_encode((object) $r['stages']),
                'machine' => json_encode((object) $r['machine']),
                'context' => json_encode((object) $r['context']),
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }
        foreach (array_chunk($rows, 100) as $chunk) {
            PerfReport::insert($chunk);
        }

        return response()->json(['saved' => count($rows)]);
    }

    // A cartridge someone uploaded, for the world-server to check one put in a console.
    public function game(int $gameId): JsonResponse
    {
        $game = Game::findOrFail($gameId);

        return response()->json(['game' => [
            'id' => "u:{$game->id}",
            'system' => $game->system,
            'title' => $game->title,
            'color' => $game->color,
            'players' => $game->players,
        ]]);
    }

    // who's in the world and where (the phone's contacts read it)
    public function presence(Request $request, Presence $presence): JsonResponse
    {
        $data = $request->validate([
            'people' => ['present', 'array', 'max:500'],
            'people.*.user_id' => ['required', 'integer'],
            'people.*.name' => ['nullable', 'string', 'max:120'],
            'people.*.area' => ['nullable', 'string', 'max:64'],
            'people.*.area_name' => ['nullable', 'string', 'max:120'],
            'people.*.status' => ['nullable', 'string', 'max:16'],
        ]);

        return response()->json($presence->put($data['people']));
    }

    // Someone edited the map (walls, floors, rooms, size). The world-server has
    // already applied the shared rules; this is the storage-side shape check.
    // Map v2 keeps walls on tile edges (hWalls: height + 1 rows of width chars,
    // vWalls: height rows of width + 1); v1 layouts had "#" wall tiles.
    public function layout(Request $request): JsonResponse
    {
        $data = $request->validate([
            'version' => ['nullable', 'integer', 'in:2'],
            'width' => ['required', 'integer', 'between:16,96'],
            'height' => ['required', 'integer', 'between:16,96'],
            'tiles' => ['required', 'array'],
            'tiles.*' => ['string', 'regex:/^[#\\ .,_:~xac]*$/'],
            'hWalls' => ['nullable', 'array', 'required_with:vWalls'],
            'hWalls.*' => ['string', 'regex:/^[.pwfbkgPWFBKh]*$/'],
            'vWalls' => ['nullable', 'array', 'required_with:hWalls'],
            'vWalls.*' => ['string', 'regex:/^[.pwfbkgPWFBKh]*$/'],
            // the walls' other faces where their material differs ("." = as the front)
            'hBacks' => ['nullable', 'array', 'required_with:vBacks'],
            'hBacks.*' => ['string', 'regex:/^[.pwfbk]*$/'],
            'vBacks' => ['nullable', 'array', 'required_with:hBacks'],
            'vBacks.*' => ['string', 'regex:/^[.pwfbk]*$/'],
            'spawn' => ['required', 'array'],
            'spawn.x' => ['required', 'numeric', 'min:0'],
            'spawn.y' => ['required', 'numeric', 'min:0'],
            'areas' => ['present', 'array', 'max:200'],
            'areas.*.key' => ['required', 'string', 'max:64'],
            'areas.*.name' => ['required', 'string', 'max:60'],
            'areas.*.kind' => ['required', 'string', 'in:open,private,booth,stage,standup'],
            'areas.*.x' => ['required', 'integer', 'min:0'],
            'areas.*.y' => ['required', 'integer', 'min:0'],
            'areas.*.w' => ['required', 'integer', 'min:1'],
            'areas.*.h' => ['required', 'integer', 'min:1'],
            'areas.*.priority' => ['nullable', 'integer'],
            'areas.*.ownerId' => ['nullable', 'integer'],
            'areas.*.ownerName' => ['nullable', 'string', 'max:120'],
            'areas.*.dressing' => ['nullable', 'string', 'in:tidy,lived,busy'],
            'areas.*.dressOff' => ['nullable', 'array'],
            // the building (docs/plan/25-building-floors.md): the floor this map is,
            // and the others, each a map of its own placed by its corner (ox, oy)
            'floor' => ['nullable', 'integer', 'between:0,12'],
            'core' => ['nullable', 'array'],
            'core.x' => ['required_with:core', 'integer', 'between:0,160'],
            'core.y' => ['required_with:core', 'integer', 'between:0,160'],
            'levels' => ['nullable', 'array', 'max:12'],
            'levels.*.index' => ['required', 'integer', 'between:0,12', 'distinct'],
            'levels.*.name' => ['required', 'string', 'max:60'],
            'levels.*.ox' => ['required', 'integer', 'between:-400,400'],
            'levels.*.oy' => ['required', 'integer', 'between:-400,400'],
            'levels.*.outdoor' => ['nullable', 'boolean'],
            'levels.*.width' => ['required', 'integer', 'between:16,160'],
            'levels.*.height' => ['required', 'integer', 'between:16,160'],
            'levels.*.tiles' => ['required', 'array'],
            'levels.*.tiles.*' => ['string', 'regex:/^[\\ .,_:~xac]*$/'],
            'levels.*.hWalls' => ['required', 'array'],
            'levels.*.hWalls.*' => ['string', 'regex:/^[.pwfbkgPWFBKh]*$/'],
            'levels.*.vWalls' => ['required', 'array'],
            'levels.*.vWalls.*' => ['string', 'regex:/^[.pwfbkgPWFBKh]*$/'],
            'levels.*.hBacks' => ['nullable', 'array'],
            'levels.*.hBacks.*' => ['string', 'regex:/^[.pwfbk]*$/'],
            'levels.*.vBacks' => ['nullable', 'array'],
            'levels.*.vBacks.*' => ['string', 'regex:/^[.pwfbk]*$/'],
            'levels.*.spawn' => ['nullable', 'array'],
            'levels.*.spawn.x' => ['required_with:levels.*.spawn', 'numeric'],
            'levels.*.spawn.y' => ['required_with:levels.*.spawn', 'numeric'],
            'levels.*.areas' => ['present', 'array', 'max:200'],
            'levels.*.areas.*' => ['array'],
        ]);
        abort_unless(count($data['tiles']) === $data['height'], 422, 'tiles must have one row per height');
        foreach ($data['tiles'] as $row) {
            abort_unless(strlen($row) === $data['width'], 422, 'every row must be width long');
        }
        if (isset($data['hWalls'])) {
            abort_unless(count($data['hWalls']) === $data['height'] + 1, 422, 'hWalls must have height + 1 rows');
            abort_unless(count($data['vWalls']) === $data['height'], 422, 'vWalls must have one row per height');
            foreach ($data['hWalls'] as $row) {
                abort_unless(strlen($row) === $data['width'], 422, 'every hWalls row must be width long');
            }
            foreach ($data['vWalls'] as $row) {
                abort_unless(strlen($row) === $data['width'] + 1, 422, 'every vWalls row must be width + 1 long');
            }
            foreach ($data['tiles'] as $row) {
                abort_if(str_contains($row, '#'), 422, 'v2 layouts keep walls on edges, not tiles');
            }
        }
        foreach ($data['levels'] ?? [] as $i => $level) {
            abort_if(($data['floor'] ?? 0) === $level['index'], 422, "floor {$level['index']} is the map itself");
            abort_unless(count($level['tiles']) === $level['height'], 422, "levels.{$i}: tiles must have one row per height");
            foreach ($level['tiles'] as $row) {
                abort_unless(strlen($row) === $level['width'], 422, "levels.{$i}: every row must be width long");
            }
            abort_unless(count($level['hWalls']) === $level['height'] + 1, 422, "levels.{$i}: hWalls must have height + 1 rows");
            abort_unless(count($level['vWalls']) === $level['height'], 422, "levels.{$i}: vWalls must have one row per height");
            foreach ($level['hWalls'] as $row) {
                abort_unless(strlen($row) === $level['width'], 422, "levels.{$i}: every hWalls row must be width long");
            }
            foreach ($level['vWalls'] as $row) {
                abort_unless(strlen($row) === $level['width'] + 1, 422, "levels.{$i}: every vWalls row must be width + 1 long");
            }
        }
        if (isset($data['hBacks'])) {
            abort_unless(isset($data['hWalls']), 422, 'back faces need v2 walls');
            abort_unless(count($data['hBacks']) === count($data['hWalls']), 422, 'hBacks must match hWalls');
            abort_unless(count($data['vBacks']) === count($data['vWalls']), 422, 'vBacks must match vWalls');
            foreach ($data['hBacks'] as $i => $row) {
                abort_unless(strlen($row) === strlen($data['hWalls'][$i]), 422, 'every hBacks row must match its hWalls row');
            }
            foreach ($data['vBacks'] as $i => $row) {
                abort_unless(strlen($row) === strlen($data['vWalls'][$i]), 422, 'every vBacks row must match its vWalls row');
            }
        }
        World::current()->update(['layout' => $data]);

        return response()->json(['ok' => true]);
    }

    public function vortex(Request $request, Vortex $vortex): JsonResponse
    {
        $data = $request->validate([
            'event' => ['required', 'string', 'in:'.implode(',', Vortex::EVENTS)],
            'user_id' => ['nullable', 'integer'],
        ]);

        return response()->json($vortex->line($data['event'], $data['user_id'] ?? null));
    }

    // The YouTube playlists played in the world (the remotes' quick list), kept
    // as the world-server sends them (it checks and caps them, shared/media.ts).
    public function playlists(Request $request): JsonResponse
    {
        $request->validate(['playlists' => ['present', 'array', 'max:50']]); // 30 + 20 pinned
        $playlists = $request->input('playlists');
        abort_if(strlen((string) json_encode($playlists)) > 400_000, 422, 'too many playlists');
        $world = World::current();
        $world->settings = array_merge($world->settings ?? [], ['playlists' => $playlists]);
        $world->save();

        return response()->json(['ok' => true]);
    }

    // The Kart Park's record (docs/plan/46-the-karts.md): its best lap, the last ten races' top
    // three, wins by name — kept as the world-server sends it (it's the one that counts them).
    public function karts(Request $request): JsonResponse
    {
        $request->validate([
            'record' => ['present', 'array'],
            'record.best' => ['nullable', 'array'],
            'record.best.t' => ['required_with:record.best', 'integer', 'min:1'],
            'record.best.name' => ['required_with:record.best', 'string', 'max:120'],
            'record.last' => ['present', 'array', 'max:10'],
            'record.wins' => ['present', 'array', 'max:500'],
        ]);
        $record = $request->input('record');
        abort_if(strlen((string) json_encode($record)) > 40_000, 422, 'record too big');
        $world = World::current();
        $world->settings = array_merge($world->settings ?? [], ['karts' => $record]);
        $world->save();

        return response()->json(['ok' => true]);
    }

    // ── pets (shared/pets.ts PetRecord) ────────────────────────────────────
    public function pets(int $userId): JsonResponse
    {
        return response()->json(['pets' => Pet::where('user_id', $userId)->orderBy('id')->get()->map->toWorld()]);
    }

    public function createPet(Request $request, int $userId): JsonResponse
    {
        $data = $request->validate($this->petRules(true));
        User::findOrFail($userId);
        abort_if(Pet::where('user_id', $userId)->count() >= Pet::MAX_PER_USER, 422, 'too many pets');
        $pet = Pet::create($this->petColumns($data) + ['user_id' => $userId]);

        return response()->json(['pet' => $pet->toWorld()], 201);
    }

    public function savePet(Request $request, int $userId, int $petId): JsonResponse
    {
        $pet = Pet::where('user_id', $userId)->findOrFail($petId);
        $data = $request->validate($this->petRules(false));
        $pet->fill($this->petColumns($data))->save();

        return response()->json(['pet' => $pet->fresh()->toWorld()]);
    }

    public function deletePet(int $userId, int $petId): JsonResponse
    {
        Pet::where('user_id', $userId)->where('id', $petId)->delete();

        return response()->json(['ok' => true]);
    }

    private function petRules(bool $new): array
    {
        $req = $new ? 'required' : 'sometimes';

        return [
            'species' => [$req, 'string', 'in:dog,cat,rabbit,platypus,capybara,parrot'],
            'name' => [$req, 'string', 'max:20'],
            'look' => [$req, 'array'],
            'outfit' => [$req, 'array'],
            'needs' => [$req, 'array'],
            'needs.food' => ['required_with:needs', 'numeric', 'between:0,100'],
            'needs.water' => ['required_with:needs', 'numeric', 'between:0,100'],
            'needs.energy' => ['required_with:needs', 'numeric', 'between:0,100'],
            'needs.fun' => ['required_with:needs', 'numeric', 'between:0,100'],
            'needs.health' => ['required_with:needs', 'numeric', 'between:0,100'],
            'xp' => [$req, 'integer', 'between:0,100000000'],
            'tricks' => [$new ? 'present' : 'sometimes', 'array', 'max:20'],
            // its mind (shared/mind.ts): traits 0..1, a small memory, bonds by user id
            'traits' => ['sometimes', 'nullable', 'array', 'max:12'],
            'traits.*' => ['numeric', 'between:0,1'],
            'memory' => ['sometimes', 'nullable', 'array', 'max:8'],
            'bonds' => ['sometimes', 'nullable', 'array', 'max:200'],
            'bonds.*' => ['numeric', 'between:0,100'],
            'alive' => [$req, 'boolean'],
            'wins' => [$req, 'integer', 'min:0'],
            'losses' => [$req, 'integer', 'min:0'],
            'bornAt' => [$req, 'integer'],
            'diedAt' => ['sometimes', 'nullable', 'integer'],
            'seenAt' => [$req, 'integer'],
        ];
    }

    private function petColumns(array $d): array
    {
        $ms = fn (?int $v) => $v === null ? null : Carbon::createFromTimestampMs($v);
        $out = [];
        foreach (['species', 'name', 'look', 'outfit', 'needs', 'xp', 'tricks', 'traits', 'memory', 'bonds', 'alive', 'wins', 'losses'] as $k) {
            if (array_key_exists($k, $d)) {
                $out[$k] = $d[$k];
            }
        }
        foreach (['bornAt' => 'born_at', 'diedAt' => 'died_at', 'seenAt' => 'seen_at'] as $in => $col) {
            if (array_key_exists($in, $d)) {
                $out[$col] = $ms($d[$in]);
            }
        }

        return $out;
    }

    private function objectRules(string $p): array
    {
        $rules = [
            $p.'id' => ['required', 'string', 'max:64'],
            $p.'kind' => ['required', 'string', 'max:40'],
            // (out on the Grounds round the ground floor too: a car left on the lawn — docs/plan/28)
            $p.'x' => ['required', 'integer', 'between:-2000,2000'],
            $p.'y' => ['required', 'integer', 'between:-2000,2000'],
            $p.'rot' => ['nullable', 'integer', 'between:0,3'],
            $p.'refId' => ['nullable', 'integer'],
            $p.'props' => ['nullable', 'array'],
        ];

        return $p === '' ? $rules : ['objects' => ['present', 'array', 'max:2000']] + $rules;
    }

    // what an admin did in the world (docs/plan/48-the-admin.md): the world server tells us
    public function adminLog(Request $request): JsonResponse
    {
        $data = $request->validate([
            'adminId' => ['required', 'integer'],
            'kind' => ['required', 'string', Rule::in(self::LOG_KINDS)],
            'targetId' => ['nullable', 'integer'],
            'target' => ['nullable', 'string', 'max:160'],
            'detail' => ['nullable', 'string', 'max:200'],
        ]);
        $target = isset($data['targetId']) ? User::find($data['targetId']) : null;
        AdminAction::record(User::find($data['adminId']), $data['kind'], $target, $data['detail'] ?? '', $data['target'] ?? '');

        return response()->json(['ok' => true], 201);
    }
}
