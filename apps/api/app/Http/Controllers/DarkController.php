<?php

namespace App\Http\Controllers;

use App\Models\Survivor;
use App\Models\User;
use App\Models\World;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

// The dark (docs/plan/30-the-dark.md, phase 2), for the world-server only
// (/api/internal): someone's pockets, vitals and pages, and the Grounds' loot
// (its spots' timers, the night's ammo budget, what lies on the snow).
class DarkController extends Controller
{
    public function survivor(int $userId): JsonResponse
    {
        return response()->json(['survivor' => Survivor::where('user_id', $userId)->first()?->toWorld()]);
    }

    public function saveSurvivor(Request $request, int $userId): JsonResponse
    {
        User::findOrFail($userId);
        $data = $request->validate([
            'inventory' => ['required', 'array'],
            'inventory.weapons' => ['present', 'array', 'max:2'],
            'inventory.pockets' => ['present', 'array', 'max:'.Survivor::POCKETS],
            'vitals' => ['required', 'array'],
            'vitals.hp' => ['required', 'numeric', 'between:0,100'],
            'vitals.wm' => ['required', 'numeric', 'between:0,100'],
            'vitals.bat' => ['required', 'numeric', 'between:0,100'],
            'pages' => ['present', 'array', 'max:'.Survivor::PAGES_MAX],
            'pages.*' => ['string', 'regex:/^[a-z0-9-]{1,32}$/'],
            'issued' => ['sometimes', 'boolean'],
        ]);
        $inventory = [
            'weapons' => $this->weapons($data['inventory']['weapons']),
            'pockets' => $this->pockets($data['inventory']['pockets']),
        ];
        $survivor = Survivor::updateOrCreate(['user_id' => $userId], [
            'inventory' => $inventory,
            'vitals' => ['hp' => (float) $data['vitals']['hp'], 'wm' => (float) $data['vitals']['wm'], 'bat' => (float) $data['vitals']['bat']],
            'pages' => array_values(array_unique($data['pages'])),
            'issued' => (bool) ($data['issued'] ?? false),
        ]);

        return response()->json(['survivor' => $survivor->toWorld()]);
    }

    public function loot(Request $request): JsonResponse
    {
        $request->validate(['loot' => ['present', 'array']]);
        $loot = $request->input('loot');
        abort_if(strlen((string) json_encode($loot)) > 200_000, 422, 'too much loot');
        $world = World::current();
        $world->settings = array_merge($world->settings ?? [], ['loot' => $loot]);
        $world->save();

        return response()->json(['ok' => true]);
    }

    // two slots, a gun or nothing in each; one of a kind; loaded no more than it holds
    private function weapons(array $slots): array
    {
        $out = [];
        $seen = [];
        foreach (array_values($slots) as $i => $w) {
            if ($w === null) {
                $out[] = null;

                continue;
            }
            $id = is_array($w) ? ($w['id'] ?? null) : null;
            $loaded = is_array($w) ? ($w['loaded'] ?? null) : null;
            if (! is_string($id) || ! isset(Survivor::WEAPONS[$id]) || isset($seen[$id])
                || ! is_int($loaded) || $loaded < 0 || $loaded > Survivor::WEAPONS[$id]) {
                throw ValidationException::withMessages(["inventory.weapons.$i" => 'not a weapon we know, or loaded past its capacity']);
            }
            $seen[$id] = true;
            $out[] = ['id' => $id, 'loaded' => $loaded];
        }

        return array_pad($out, 2, null);
    }

    // six pockets, a stack or nothing in each, no stack over its cap
    private function pockets(array $slots): array
    {
        $out = [];
        foreach (array_values($slots) as $i => $s) {
            if ($s === null) {
                $out[] = null;

                continue;
            }
            $id = is_array($s) ? ($s['id'] ?? null) : null;
            $n = is_array($s) ? ($s['n'] ?? null) : null;
            if (! is_string($id) || ! isset(Survivor::STACKS[$id]) || ! is_int($n) || $n < 1 || $n > Survivor::STACKS[$id]) {
                throw ValidationException::withMessages(["inventory.pockets.$i" => 'not an item we know, or more than a pocket holds']);
            }
            $out[] = ['id' => $id, 'n' => $n];
        }

        return array_pad($out, Survivor::POCKETS, null);
    }
}
