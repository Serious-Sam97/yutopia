<?php

namespace App\Http\Controllers;

use App\Models\AdminAction;
use App\Models\Npc;
use App\Services\Cast;
use App\Services\Vortex;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

// The world's cast (docs/plan/120-god-mode-npcs.md): admins list, make, change and delete NPCs on /admin/npcs; every
// change goes to the world server at once (the town's people live). The world server seeds the town's people once.
class NpcsController extends Controller
{
    public function __construct(private readonly Cast $cast) {}

    // ── admins ──
    public function index(): JsonResponse
    {
        return response()->json(['npcs' => Npc::cast(), 'max' => Npc::MAX, 'seeded' => Npc::seeded()]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate(['npc' => ['required', 'array']]);
        abort_if(Npc::count() >= Npc::MAX, 422, 'The cast has '.Npc::MAX.' people: delete one first.');
        $key = Npc::newKey();
        $def = Npc::clean($data['npc'], $key, false);
        abort_if($def === null, 422, 'An NPC needs a name or a role.');
        $npc = Npc::create(['key' => $key, 'def' => $def, 'town' => false, 'position' => ((int) Npc::max('position')) + 1]);
        AdminAction::record($request->user(), 'npc-new', null, '', $this->label($def));
        $this->cast->changed();

        return response()->json(['npc' => $npc->toDef()], 201);
    }

    public function update(Request $request, string $npcKey): JsonResponse
    {
        $npc = Npc::where('key', $npcKey)->firstOrFail();
        $data = $request->validate(['npc' => ['required', 'array']]);
        $def = Npc::clean($data['npc'], $npc->key, $npc->town, $npc->town ? ($npc->def['behaviour']['type'] ?? null) : null);
        abort_if($def === null, 422, 'An NPC needs a name or a role.');
        $npc->def = $def;
        $npc->save();
        AdminAction::record($request->user(), 'npc', null, '', $this->label($def));
        $this->cast->changed();

        return response()->json(['npc' => $npc->toDef()]);
    }

    public function destroy(Request $request, string $npcKey): JsonResponse
    {
        $npc = Npc::where('key', $npcKey)->firstOrFail();
        $label = $this->label($npc->def ?? []);
        $npc->delete();
        AdminAction::record($request->user(), 'npc-delete', null, $npc->town ? 'the town\'s' : '', $label);
        $this->cast->changed();

        return response()->json(['ok' => true]);
    }

    // ── the world server ──
    /** The town's people, once (the world server's first boot on a cast that was never seeded): kept as sent, Vortex
     *  given his public lines (they're the API's: Vortex::PUBLIC). Seeded already: the cast as it is (409). */
    public function seed(Request $request): JsonResponse
    {
        $data = $request->validate(['npcs' => ['present', 'array', 'max:'.Npc::MAX], 'npcs.*' => ['array']]);
        if (Npc::seeded()) {
            return response()->json(['npcs' => Npc::cast(), 'seeded' => false], 409);
        }
        DB::transaction(function () use ($data) {
            $pos = (int) Npc::max('position');
            foreach ($data['npcs'] as $o) {
                $key = is_string($o['key'] ?? null) ? $o['key'] : '';
                $type = is_string($o['behaviour']['type'] ?? null) ? $o['behaviour']['type'] : null;
                if ($type !== null && ! in_array($type, Npc::TOWN_TYPES, true)) {
                    $type = null;
                }
                $def = Npc::clean($o, $key, true, $type);
                if ($def === null || Npc::where('key', $key)->exists()) {
                    continue;
                }
                if ($def['behaviour']['type'] === 'vortex' && $def['lines'] === []) {
                    $def['lines'] = Vortex::publicLines();
                }
                Npc::create(['key' => $key, 'def' => $def, 'town' => true, 'position' => ++$pos]);
            }
            Npc::markSeeded();
        });

        return response()->json(['npcs' => Npc::cast(), 'seeded' => true], 201);
    }

    private function label(array $def): string
    {
        return trim(($def['name'] ?? '').' '.($def['role']['en'] ?? '')) ?: ($def['key'] ?? '');
    }
}
