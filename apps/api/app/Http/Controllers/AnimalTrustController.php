<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

// The animals' trust (docs/plan/126-animal-life.md, F7c), the world server's: a person's when they come, the changed
// rows kept as it goes. A row: the animal's id, its species, the trust (0..1), the day it was last fed by them,
// whether it's their friend, its name.
class AnimalTrustController extends Controller
{
    public const ID = '/^[A-Za-z0-9:_#.-]{1,64}$/';

    public const KIND = '/^[a-z]{2,24}$/';

    public function index(Request $request): JsonResponse
    {
        $user = (int) $request->query('user', 0);
        $rows = DB::table('animal_trust')->where('user_id', $user)->limit(5000)->get(['animal', 'kind', 'v', 'day', 'friend', 'name']);

        return response()->json(['trust' => $rows->map(fn ($r) => [
            'id' => $r->animal,
            'kind' => $r->kind,
            'v' => (float) $r->v,
            'day' => (int) $r->day,
            'friend' => (bool) $r->friend,
            'name' => (string) $r->name,
        ])->values()]);
    }

    public function put(Request $request): JsonResponse
    {
        $data = $request->validate([
            'trust' => ['present', 'array', 'max:500'],
            'trust.*.user' => ['required', 'integer', 'min:1'],
            'trust.*.id' => ['required', 'string', 'regex:'.self::ID],
            'trust.*.kind' => ['required', 'string', 'regex:'.self::KIND],
            'trust.*.v' => ['required', 'numeric', 'between:0,1'],
            'trust.*.day' => ['required', 'integer'],
            'trust.*.friend' => ['required', 'boolean'],
            'trust.*.name' => ['present', 'nullable', 'string', 'max:24'],
        ]);
        $now = now();
        // (someone gone meanwhile: theirs not written)
        $there = DB::table('users')->whereIn('id', array_unique(array_column($data['trust'], 'user')))->pluck('id')->all();
        $rows = [];
        foreach ($data['trust'] as $t) {
            if (! in_array($t['user'], $there)) {
                continue;
            }
            $rows[] = [
                'user_id' => $t['user'],
                'animal' => $t['id'],
                'kind' => $t['kind'],
                'v' => $t['v'],
                'day' => $t['day'],
                'friend' => $t['friend'],
                'name' => (string) ($t['name'] ?? ''),
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }
        if ($rows) {
            DB::table('animal_trust')->upsert($rows, ['user_id', 'animal'], ['kind', 'v', 'day', 'friend', 'name', 'updated_at']);
        }

        return response()->json(['ok' => true, 'kept' => count($rows)]);
    }
}
