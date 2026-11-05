<?php

namespace App\Services;

use App\Models\Desk;
use App\Models\GroundRevision;
use App\Models\Spawn;
use App\Models\World;
use App\Models\WorldObject;
use Illuminate\Support\Facades\DB;
use Throwable;

// The world as one JSON document (map, playlists, every object, who has which
// desk), to keep it aside and put it back: `php artisan yutopia:world` and the e2e
// suite's fixtures (apps/client/e2e/worlds). Putting one back closes the live
// room first (the world-server writes what it was still holding, then keeps it
// shut), replaces the data, and lets the room open again from it.
class WorldSnapshot
{
    // 2: metres and radians (docs/plan/72-the-3d-core.md, phase 5): a thing's height on what it's
    // on in metres, its turn as `yaw`; a 1 is brought up to it on import. 3: the building's
    // `structure` with it (phase 6) — an older one without it needs tools/world-v4.mts after.
    public const VERSION = 3;

    public function __construct(private readonly WorldServer $world) {}

    public function export(): array
    {
        $w = World::current();

        return [
            'yutopia' => 'world',
            'version' => self::VERSION,
            'name' => $w->name,
            'mapKey' => $w->map_key,
            'layout' => $w->layout,
            'structure' => $w->structure,
            'settings' => $w->settings,
            'seeded' => $w->seeded_at !== null,
            'objects' => WorldObject::orderBy('id')->get()->map->toWorld()->all(),
            // god mode's edits to the Grounds as published (docs/plan/53-the-god-mode.md)
            'grounds' => GroundRevision::edits(),
            'desks' => Desk::orderBy('id')->get(['user_id', 'desk_uid'])->map(fn (Desk $d) => ['userId' => $d->user_id, 'desk' => $d->desk_uid])->all(),
        ];
    }

    /**
     * Put a snapshot back. `clearSpawns`: everyone arrives at the world's arrival
     * point again (their own spots may not exist on this map).
     */
    public function import(array $snap, bool $clearSpawns = false): array
    {
        $version = (int) ($snap['version'] ?? 0);
        abort_unless(($snap['yutopia'] ?? null) === 'world' && $version >= 1 && $version <= self::VERSION, 422, 'Not a world snapshot.');
        abort_unless(is_array($snap['objects'] ?? null) && count($snap['objects']) <= 5000, 422, 'A snapshot needs its objects (at most 5000).');
        if ($version < 2) {
            $snap['objects'] = array_map(fn (array $o) => self::toV2($o), $snap['objects']);
            if (is_array($snap['layout'] ?? null)) {
                $snap['layout']['version'] = 3; // (shared migrate.ts LAYOUT_VERSION)
            }
        }
        $held = $this->hold(true);
        try {
            DB::transaction(function () use ($snap, $clearSpawns) {
                $w = World::current();
                $w->update([
                    'name' => (string) ($snap['name'] ?? $w->name),
                    'map_key' => (string) ($snap['mapKey'] ?? 'studio'),
                    'layout' => $snap['layout'] ?? null,
                    'structure' => $snap['structure'] ?? null,
                    'settings' => $snap['settings'] ?? null,
                    'seeded_at' => ($snap['seeded'] ?? true) ? now() : null,
                ]);
                WorldObject::query()->delete();
                foreach (array_chunk($snap['objects'], 500) as $chunk) {
                    WorldObject::insert(array_map(fn (array $o) => [
                        'uid' => (string) $o['id'],
                        'kind' => (string) $o['kind'],
                        'x' => (float) $o['x'],
                        'y' => (float) $o['y'],
                        'yaw' => (float) ($o['yaw'] ?? 0),
                        'ref_id' => $o['refId'] ?? null,
                        'props' => empty($o['props']) ? null : json_encode($o['props']),
                        'created_at' => now(),
                        'updated_at' => now(),
                    ], $chunk));
                }
                Desk::query()->delete();
                $users = DB::table('users')->pluck('id')->flip();
                foreach ($snap['desks'] ?? [] as $d) {
                    if (isset($users[(int) $d['userId']])) {
                        Desk::create(['user_id' => (int) $d['userId'], 'desk_uid' => (string) $d['desk']]);
                    }
                }
                if ($clearSpawns) {
                    Spawn::query()->delete();
                }
                // the Grounds' edits as they were: a revision of their own (none in it: left as they are)
                if (is_array($snap['grounds'] ?? null)) {
                    $edits = $snap['grounds'];
                    unset($edits['rev']);
                    $now = GroundRevision::current();
                    $was = $now ? $now->data() : ['rev' => 0];
                    unset($was['rev']);
                    if ($edits != $was) {
                        $json = json_encode($edits ?: new \stdClass, JSON_UNESCAPED_SLASHES);
                        GroundRevision::create(['rev' => ($now->rev ?? 0) + 1, 'data' => $json, 'size' => strlen($json), 'note' => 'From a snapshot']);
                    }
                }
            });
        } finally {
            if ($held) {
                $this->hold(false);
            }
        }

        return ['objects' => count($snap['objects']), 'roomClosed' => $held];
    }

    /** A thing from a version 1 snapshot in today's form, as the 2026_11_05 migrations: its props.z
     *  (how high it stands on what it's on) from the old item art's px into metres (only a plainly
     *  px one: over 3), its `rot` (quarter turns) as `yaw` (radians). */
    public static function toV2(array $o): array
    {
        $z = $o['props']['z'] ?? null;
        if (is_numeric($z) && (float) $z > 3) {
            $o['props']['z'] = round((float) $z / 39.18765, 4);
        }
        if (! isset($o['yaw'])) {
            $o['yaw'] = ((int) ($o['rot'] ?? 0) & 3) * (M_PI / 2);
        }
        unset($o['rot']);

        return $o;
    }

    // (no world-server configured: tests, or the API alone; nothing to close)
    private function hold(bool $on): bool
    {
        if (! $this->world->enabled()) {
            return false;
        }
        try {
            $this->world->post('/internal/hold', ['hold' => $on], 15)->throw();

            return true;
        } catch (Throwable $e) {
            abort_if($on, 503, 'The world-server could not close the world: '.$e->getMessage());

            return false;
        }
    }
}
