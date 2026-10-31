<?php

namespace App\Http\Controllers;

use App\Models\Avatar;
use App\Models\Setup;
use App\Models\User;
use App\Services\Avatars;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

// People's own things in the world: their look, their saved build-mode setups,
// and who's around to hand a room or a desk to.
class WorldController extends Controller
{
    public function __construct(private readonly Avatars $avatars) {}

    public function showAvatar(Request $request): JsonResponse
    {
        return response()->json(['avatar' => $this->avatars->for($request->user())]);
    }

    public function updateAvatar(Request $request): JsonResponse
    {
        $hex = ['required', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'];
        $slug = ['required', 'string', 'alpha_dash', 'max:24'];
        $layers = $request->validate([
            'body' => $slug, 'skin' => $hex, 'hair' => $slug, 'hairColor' => $hex,
            'top' => $slug, 'topColor' => $hex, 'bottom' => $slug, 'bottomColor' => $hex,
            'accessory' => $slug, 'accessoryColor' => $hex,
            // drawing style: Ligne claire only now — City-pop (from a browser
            // still open on the old editor) is taken and saved as Ligne claire
            'style' => ['sometimes', 'string', 'in:citypop,ligne'],
            // body and face shape only; neutral keeps the original figure
            'gender' => ['sometimes', 'string', 'in:neutral,feminine,masculine'],
            // glasses, one more thing (scarf, earrings…) and shoes have slots of their own
            'eyewear' => ['sometimes', ...$slug], 'eyewearColor' => ['sometimes', ...$hex],
            'extra' => ['sometimes', ...$slug], 'extraColor' => ['sometimes', ...$hex],
            'shoes' => ['sometimes', ...$slug], 'shoesColor' => ['sometimes', ...$hex],
            // facial hair, in the hair's colour
            'beard' => ['sometimes', ...$slug],
            // how they walk (plan 58, 4e): calm, bouncy, heavy
            'gait' => ['sometimes', ...$slug],
            // the wardrobe's second set (docs/plan/60): a layer over the top, each garment's pattern
            // and its second colour, the shoes' second colour
            'outer' => ['sometimes', ...$slug], 'outerColor' => ['sometimes', ...$hex],
            'topPattern' => ['sometimes', ...$slug], 'topColor2' => ['sometimes', ...$hex],
            'bottomPattern' => ['sometimes', ...$slug], 'bottomColor2' => ['sometimes', ...$hex],
            'outerPattern' => ['sometimes', ...$slug], 'outerColor2' => ['sometimes', ...$hex],
            'shoesColor2' => ['sometimes', ...$hex],
        ]);
        $layers['style'] = 'ligne';
        $user = $request->user();
        Avatar::updateOrCreate(['user_id' => $user->id], ['layers' => $layers]);

        return response()->json(['avatar' => $this->avatars->for($user)]);
    }

    // "My setups": groups of things saved in build mode, placed again anywhere.
    // The world checks every placement as usual; this only keeps the list.
    public function setups(Request $request): JsonResponse
    {
        $list = Setup::where('user_id', $request->user()->id)->latest('id')->get(['id', 'name', 'items']);

        return response()->json(['setups' => $list]);
    }

    public function saveSetup(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:40'],
            'items' => ['required', 'array', 'min:1', 'max:40'],
            'items.*.kind' => ['required', 'string', 'alpha_dash', 'max:32'],
            'items.*.dx' => ['required', 'integer', 'between:0,16'],
            'items.*.dy' => ['required', 'integer', 'between:0,16'],
            'items.*.rot' => ['required', 'integer', 'between:0,3'],
            'items.*.props' => ['sometimes', 'nullable', 'array'],
        ]);
        abort_if(strlen(json_encode($data['items'])) > 16000, 422, 'That setup is too big.');
        $user = $request->user();
        abort_if(Setup::where('user_id', $user->id)->count() >= Setup::MAX, 422, 'You have plenty of setups already.');
        $items = array_map(fn (array $i) => [
            'kind' => $i['kind'], 'dx' => $i['dx'], 'dy' => $i['dy'], 'rot' => $i['rot'], 'props' => $i['props'] ?? null,
        ], $data['items']);
        $setup = Setup::create(['user_id' => $user->id, 'name' => trim($data['name']), 'items' => $items]);

        return response()->json(['setup' => $setup->only(['id', 'name', 'items'])], 201);
    }

    public function deleteSetup(Request $request, int $setupId): JsonResponse
    {
        Setup::where('user_id', $request->user()->id)->findOrFail($setupId)->delete();

        return response()->json(['ok' => true]);
    }

    // People who can be given a room or a desk: everyone with an account.
    public function members(): JsonResponse
    {
        $people = User::orderBy('name')->limit(2000)->get(['id', 'name'])->map(fn (User $u) => ['id' => $u->id, 'name' => $u->name]);

        return response()->json(['members' => $people]);
    }
}
