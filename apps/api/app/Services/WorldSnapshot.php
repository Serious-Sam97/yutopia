<?php

namespace App\Services;

use App\Models\Desk;
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
    public const VERSION = 1;

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
            'settings' => $w->settings,
            'seeded' => $w->seeded_at !== null,
            'objects' => WorldObject::orderBy('id')->get()->map->toWorld()->all(),
            'desks' => Desk::orderBy('id')->get(['user_id', 'desk_uid'])->map(fn (Desk $d) => ['userId' => $d->user_id, 'desk' => $d->desk_uid])->all(),
        ];
    }

    /**
     * Put a snapshot back. `clearSpawns`: everyone arrives at the world's arrival
     * point again (their own spots may not exist on this map).
     */
    public function import(array $snap, bool $clearSpawns = false): array
    {
        abort_unless(($snap['yutopia'] ?? null) === 'world' && (int) ($snap['version'] ?? 0) === self::VERSION, 422, 'Not a world snapshot.');
        abort_unless(is_array($snap['objects'] ?? null) && count($snap['objects']) <= 5000, 422, 'A snapshot needs its objects (at most 5000).');
        $held = $this->hold(true);
        try {
            DB::transaction(function () use ($snap, $clearSpawns) {
                $w = World::current();
                $w->update([
                    'name' => (string) ($snap['name'] ?? $w->name),
                    'map_key' => (string) ($snap['mapKey'] ?? 'studio'),
                    'layout' => $snap['layout'] ?? null,
                    'settings' => $snap['settings'] ?? null,
                    'seeded_at' => ($snap['seeded'] ?? true) ? now() : null,
                ]);
                WorldObject::query()->delete();
                foreach (array_chunk($snap['objects'], 500) as $chunk) {
                    WorldObject::insert(array_map(fn (array $o) => [
                        'uid' => (string) $o['id'],
                        'kind' => (string) $o['kind'],
                        'x' => (int) $o['x'],
                        'y' => (int) $o['y'],
                        'rot' => (int) ($o['rot'] ?? 0),
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
            });
        } finally {
            if ($held) {
                $this->hold(false);
            }
        }

        return ['objects' => count($snap['objects']), 'roomClosed' => $held];
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
