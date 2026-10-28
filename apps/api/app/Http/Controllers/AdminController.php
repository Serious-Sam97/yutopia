<?php

namespace App\Http\Controllers;

use App\Models\AdminAction;
use App\Models\Avatar;
use App\Models\User;
use App\Services\Avatars;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

// Run the place (docs/plan/48-the-admin.md): everyone who has an account, an admin's role
// given or taken, and the log of what admins did. Admins only (the `admin` middleware).
class AdminController extends Controller
{
    public function members(Request $request): JsonResponse
    {
        $q = trim((string) $request->query('q', ''));
        $users = User::query()
            ->when($q !== '', fn ($w) => $w->where(fn ($w) => $w
                ->where('name', 'like', "%{$q}%")
                ->orWhere('email', 'like', '%'.strtolower($q).'%')))
            ->orderByRaw('seen_at is null')
            ->orderByDesc('seen_at')
            ->orderBy('name')
            ->limit(500)
            ->get();
        $looks = Avatar::whereIn('user_id', $users->pluck('id'))->pluck('layers', 'user_id');

        return response()->json(['members' => $users->map(fn (User $u) => [
            'id' => $u->id,
            'name' => $u->name,
            'email' => $u->email,
            'admin' => $u->is_admin,
            'seenAt' => $u->seen_at?->toIso8601String(),
            'joinedAt' => $u->created_at?->toIso8601String(),
            'avatar' => json_encode(array_merge(Avatars::DEFAULT, $looks[$u->id] ?? [])),
        ])]);
    }

    // admin on or off: never your own, never the last one (someone must be able to run it)
    public function update(Request $request, User $user): JsonResponse
    {
        $data = $request->validate(['admin' => ['required', 'boolean']]);
        $me = $request->user();
        abort_if($user->is($me), 422, "You can't change your own role.");
        abort_if(! $data['admin'] && $user->is_admin && User::where('is_admin', true)->count() <= 1, 422, 'Someone has to stay an admin.');
        if ($user->is_admin !== $data['admin']) {
            $user->forceFill(['is_admin' => $data['admin']])->save();
            AdminAction::record($me, $data['admin'] ? 'admin' : 'unadmin', $user);
        }

        return response()->json(['admin' => $user->is_admin]);
    }

    public function log(Request $request): JsonResponse
    {
        $kinds = array_filter(explode(',', (string) $request->query('kinds', '')));
        $before = (int) $request->query('before', 0);
        $rows = AdminAction::query()
            ->where('at', '>=', now()->subDays(90))
            ->when($kinds, fn ($w) => $w->whereIn('kind', $kinds))
            ->when($before > 0, fn ($w) => $w->where('id', '<', $before))
            ->orderByDesc('id')
            ->limit(60)
            ->get();

        return response()->json(['log' => $rows->map->toPublic()]);
    }
}
