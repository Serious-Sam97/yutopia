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
            // (plan 87) the left hand: a stack or nothing — never a gun; an old save has none
            'inventory.hand' => ['sometimes', 'nullable', 'array'],
            // (plan 125) where each thing lies in the case, by slot; the stash at home
            'inventory.place' => ['sometimes', 'array', 'max:'.(Survivor::POCKETS + Survivor::QUICK + 1)],
            'inventory.stash' => ['sometimes', 'array', 'max:'.Survivor::STASH_HOLD],
            'vitals' => ['required', 'array'],
            'vitals.hp' => ['required', 'numeric', 'between:0,100'],
            'vitals.wm' => ['required', 'numeric', 'between:0,100'],
            'vitals.bat' => ['required', 'numeric', 'between:0,100'],
            'pages' => ['present', 'array', 'max:'.Survivor::PAGES_MAX],
            'pages.*' => ['string', 'regex:/^[a-z0-9-]{1,32}$/'],
            'issued' => ['sometimes', 'boolean'],
            'kitDay' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:1000000'],
        ]);
        // (a gun one of a kind, the quick slots and the pockets together — plan 85)
        $seen = [];
        $inventory = [
            'hand' => $this->hand($data['inventory']['hand'] ?? null, $seen),
            'quick' => $this->quick($data['inventory']['quick'], $seen),
            'pockets' => $this->pockets($data['inventory']['pockets'], $seen),
            'place' => $this->place($data['inventory']['place'] ?? []),
            'stash' => $this->stash($data['inventory']['stash'] ?? []),
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

    // four quick slots (keys 1–4), a gun, a stack or nothing in each; no stack over its cap
    private function quick(array $slots, array &$seen): array
    {
        $out = [];
        foreach (array_values($slots) as $i => $it) {
            $out[] = $it === null ? null : $this->item($it, "inventory.quick.$i", $seen);
        }

        return array_pad($out, Survivor::QUICK, null);
    }

    // eight pockets — the pack: a stack, a gun carried but not equipped (plan 85), or nothing in each
    private function pockets(array $slots, array &$seen): array
    {
        $out = [];
        foreach (array_values($slots) as $i => $s) {
            $out[] = $s === null ? null : $this->item($s, "inventory.pockets.$i", $seen);
        }

        return array_pad($out, Survivor::POCKETS, null);
    }

    // (plan 125) where things lie in the case: slot => [x, y, turned], inside the case — the world-server keeps them
    // from overlapping (shared placeSlot); here only what can't be a place is left out
    private function place(array $place): array|object
    {
        $out = [];
        $slots = Survivor::POCKETS + Survivor::QUICK + 1;
        foreach ($place as $slot => $p) {
            if (! is_numeric($slot) || (int) $slot < 0 || (int) $slot >= $slots || ! is_array($p) || count($p) < 3) {
                continue;
            }
            [$x, $y, $r] = array_values($p);
            if (! is_int($x) || ! is_int($y) || $x < 0 || $y < 0 || $x >= Survivor::CASE_W || $y >= Survivor::CASE_H) {
                continue;
            }
            $out[(string) (int) $slot] = [$x, $y, $r ? 1 : 0];
        }

        // (an empty one stays an object in the JSON, as the world-server writes it)
        return $out === [] ? (object) [] : $out;
    }

    // (plan 125 F17a) the stash at home: what didn't fit in the case — stacks and guns, as anywhere else
    private function stash(array $stash): array
    {
        $out = [];
        foreach (array_values($stash) as $i => $it) {
            if ($it === null) {
                continue;
            }
            // (its own count of kinds: a gun at home and one carried may both be there)
            $seen = [];
            $out[] = $this->item($it, "inventory.stash.$i", $seen);
        }

        return $out;
    }

    // (plan 87) the left hand: a stack (the torch, a flare, a first aid…) or nothing — a gun takes both hands
    private function hand(mixed $it, array &$seen): ?array
    {
        if ($it === null) {
            return null;
        }
        $id = is_array($it) ? ($it['id'] ?? null) : null;
        if (! is_string($id) || ! isset(Survivor::STACKS[$id])) {
            throw ValidationException::withMessages(['inventory.hand' => 'the left hand holds no gun, nor anything we don\'t know']);
        }

        return $this->item($it, 'inventory.hand', $seen);
    }

    // a stack (no more than its cap), or a gun — one of a kind (`seen`: the ones so far), loaded no more than it holds
    private function item(mixed $it, string $key, array &$seen): array
    {
        $id = is_array($it) ? ($it['id'] ?? null) : null;
        if (is_string($id) && isset(Survivor::STACKS[$id])) {
            // (plan 87: the torch one of a kind too)
            if (in_array($id, Survivor::ONE_OF, true)) {
                if (isset($seen[$id])) {
                    throw ValidationException::withMessages([$key => 'a second of its kind']);
                }
                $seen[$id] = true;
            }

            return $this->stack($it, $key);
        }
        $loaded = is_array($it) ? ($it['loaded'] ?? null) : null;
        if (! is_string($id) || ! isset(Survivor::WEAPONS[$id]) || isset($seen[$id])
            || ! is_int($loaded) || $loaded < 0 || $loaded > Survivor::WEAPONS[$id]) {
            throw ValidationException::withMessages([$key => 'not an item we know, a second of its kind, or loaded past its capacity']);
        }
        $seen[$id] = true;

        return ['id' => $id, 'loaded' => $loaded];
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
