<?php

namespace App\Services;

use App\Models\Desk;
use App\Models\World;
use App\Models\WorldObject;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class Worlds
{
    // First join furnishes the world with the map's default furniture.
    // Idempotent: a furnished world is left alone.
    public function seed(array $objects): Collection
    {
        return DB::transaction(function () use ($objects) {
            $world = World::current();
            if ($world->seeded_at === null) {
                foreach ($objects as $o) {
                    WorldObject::updateOrCreate(
                        ['uid' => $o['id']],
                        ['kind' => $o['kind'], 'x' => $o['x'], 'y' => $o['y'], 'rot' => $o['rot'] ?? 0, 'ref_id' => $o['refId'] ?? null, 'props' => $o['props'] ?? null],
                    );
                }
                $world->update(['seeded_at' => now()]);
            }

            return WorldObject::orderBy('id')->get();
        });
    }

    public function deskFor(int $userId, array $deskUids, bool $assign = true): ?string
    {
        return DB::transaction(function () use ($userId, $deskUids, $assign) {
            $mine = Desk::where('user_id', $userId)->first();
            if ($mine && in_array($mine->desk_uid, $deskUids, true)) {
                return $mine->desk_uid;
            }
            // just looking it up (people arrive at the arrival point): no new desk
            if (! $assign) {
                return null;
            }
            $taken = Desk::pluck('desk_uid')->all();
            $free = array_values(array_diff($deskUids, $taken));
            if ($free === []) {
                return null;
            }
            Desk::updateOrCreate(['user_id' => $userId], ['desk_uid' => $free[0]]);

            return $free[0];
        });
    }
}
