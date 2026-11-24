<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

// The NPCs' bonds (docs/plan/123-npcs-alive.md, F5a/F6a), the world server's: all of them when its room opens, the
// changed ones kept as it goes. A bond: an NPC's key, the other ("u:<user id>" a player, "n:<key>" an NPC), its
// value (−100…100), times met, when last (ms).
class NpcBondsController extends Controller
{
    public const MAX = 50_000;

    public const KEY = '/^[a-z0-9][a-z0-9-]{0,39}$/';

    public const OTHER = '/^(u:\d{1,12}|n:[a-z0-9][a-z0-9-]{0,39})$/';

    public function index(): JsonResponse
    {
        $rows = DB::table('npc_bonds')->orderByDesc('seen_at')->limit(self::MAX)->get(['npc', 'other', 'v', 'n', 'seen_at']);

        return response()->json(['bonds' => $rows->map(fn ($r) => [
            'npc' => $r->npc,
            'other' => $r->other,
            'v' => (int) $r->v,
            'n' => (int) $r->n,
            'at' => $r->seen_at ? Carbon::parse($r->seen_at)->getTimestampMs() : 0,
        ])->values()]);
    }

    public function put(Request $request): JsonResponse
    {
        $data = $request->validate([
            'bonds' => ['present', 'array', 'max:500'],
            'bonds.*.npc' => ['required', 'string', 'regex:'.self::KEY],
            'bonds.*.other' => ['required', 'string', 'regex:'.self::OTHER],
            'bonds.*.v' => ['required', 'integer', 'between:-100,100'],
            'bonds.*.n' => ['required', 'integer', 'min:0'],
            'bonds.*.at' => ['required', 'integer', 'min:0'],
        ]);
        $now = now();
        // (an NPC deleted meanwhile — a save already on its way —: theirs not written back)
        $there = DB::table('npcs')->whereIn('key', array_unique(array_column($data['bonds'], 'npc')))->pluck('key')->all();
        $data['bonds'] = array_values(array_filter($data['bonds'], fn ($b) => in_array($b['npc'], $there, true)));
        $rows = array_map(fn ($b) => [
            'npc' => $b['npc'],
            'other' => $b['other'],
            'v' => $b['v'],
            'n' => min($b['n'], 4_000_000_000),
            'seen_at' => Carbon::createFromTimestampMs($b['at']),
            'created_at' => $now,
            'updated_at' => $now,
        ], $data['bonds']);
        if ($rows) {
            DB::table('npc_bonds')->upsert($rows, ['npc', 'other'], ['v', 'n', 'seen_at', 'updated_at']);
        }

        return response()->json(['ok' => true, 'kept' => count($rows)]);
    }
}
