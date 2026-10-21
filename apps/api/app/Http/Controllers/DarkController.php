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
            'inventory.quick' => ['present', 'array', 'max:'.Survivor::QUICK],
            'inventory.pockets' => ['present', 'array', 'max:'.Survivor::POCKETS],
            'vitals' => ['required', 'array'],
            'vitals.hp' => ['required', 'numeric', 'between:0,100'],
            'vitals.wm' => ['required', 'numeric', 'between:0,100'],
            'vitals.bat' => ['required', 'numeric', 'between:0,100'],
            'pages' => ['present', 'array', 'max:'.Survivor::PAGES_MAX],
            'pages.*' => ['string', 'regex:/^[a-z0-9-]{1,32}$/'],
            'issued' => ['sometimes', 'boolean'],
            'kitDay' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:1000000'],
        ]);
        $inventory = [
            'quick' => $this->quick($data['inventory']['quick']),
            'pockets' => $this->pockets($data['inventory']['pockets']),
        ];
        $survivor = Survivor::updateOrCreate(['user_id' => $userId], [
            'inventory' => $inventory,
            'vitals' => ['hp' => (float) $data['vitals']['hp'], 'wm' => (float) $data['vitals']['wm'], 'bat' => (float) $data['vitals']['bat']],
            'pages' => array_values(array_unique($data['pages'])),
            'issued' => (bool) ($data['issued'] ?? false),
            'kit_day' => $data['kitDay'] ?? null,
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

    // four quick slots (keys 1–4), a gun, a stack or nothing in each; a gun one of a kind,
    // loaded no more than it holds; no stack over its cap
    private function quick(array $slots): array
    {
        $out = [];
        $seen = [];
        foreach (array_values($slots) as $i => $it) {
            if ($it === null) {
                $out[] = null;

                continue;
            }
            $id = is_array($it) ? ($it['id'] ?? null) : null;
            if (is_string($id) && isset(Survivor::STACKS[$id])) {
                $out[] = $this->stack($it, "inventory.quick.$i");

                continue;
            }
            $loaded = is_array($it) ? ($it['loaded'] ?? null) : null;
            if (! is_string($id) || ! isset(Survivor::WEAPONS[$id]) || isset($seen[$id])
                || ! is_int($loaded) || $loaded < 0 || $loaded > Survivor::WEAPONS[$id]) {
                throw ValidationException::withMessages(["inventory.quick.$i" => 'not an item we know, or loaded past its capacity']);
            }
            $seen[$id] = true;
            $out[] = ['id' => $id, 'loaded' => $loaded];
        }

        return array_pad($out, Survivor::QUICK, null);
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
            $out[] = $this->stack($s, "inventory.pockets.$i");
        }

        return array_pad($out, Survivor::POCKETS, null);
    }

    // a stack we know, 1 up to its cap
    private function stack(mixed $s, string $key): array
    {
        $id = is_array($s) ? ($s['id'] ?? null) : null;
        $n = is_array($s) ? ($s['n'] ?? null) : null;
        if (! is_string($id) || ! isset(Survivor::STACKS[$id]) || ! is_int($n) || $n < 1 || $n > Survivor::STACKS[$id]) {
            throw ValidationException::withMessages([$key => 'not an item we know, or more than a pocket holds']);
        }

        return ['id' => $id, 'n' => $n];
    }
}
