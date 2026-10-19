<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;

// Who is in the world right now and where. The world-server pushes a full snapshot
// on every change (and a heartbeat), so the entry simply expires if it dies.
class Presence
{
    private const KEY = 'yutopia:presence';

    private const TTL = 150;

    public function put(array $entries): array
    {
        $snapshot = [
            'people' => array_values(array_map(fn ($e) => [
                'userId' => (int) $e['user_id'],
                'name' => (string) ($e['name'] ?? ''),
                'area' => $e['area'] ?? null,
                'areaName' => $e['area_name'] ?? null,
                'status' => in_array($e['status'] ?? 'online', ['online', 'away', 'dnd'], true) ? $e['status'] : 'online',
            ], $entries)),
            'at' => now()->toIso8601String(),
        ];
        Cache::put(self::KEY, $snapshot, self::TTL);

        return $snapshot;
    }

    public function get(): array
    {
        return Cache::get(self::KEY) ?? ['people' => [], 'at' => null];
    }

    /** @return array<int, array{area: ?string, status: string}> by user id */
    public function byUser(): array
    {
        $out = [];
        foreach ($this->get()['people'] as $p) {
            $out[$p['userId']] = ['area' => $p['areaName'] ?? null, 'status' => $p['status'] ?? 'online'];
        }

        return $out;
    }
}
