<?php

namespace App\Http\Controllers;

use App\Models\AdminAction;
use App\Models\Invite;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

// Admins hand out single-use sign-up links (YUTOPIA_SIGNUP=invite).
class InviteController extends Controller
{
    public function index(): JsonResponse
    {
        // (and how people sign up here: by invite, open to anyone, or closed)
        return response()->json([
            'invites' => Invite::with('user:id,name')->latest('id')->limit(200)->get()->map->toPublic(),
            'signup' => config('yutopia.signup'),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => ['nullable', 'email', 'max:255']]);

        $invite = Invite::make($request->user(), $data['email'] ?? null);
        AdminAction::record($request->user(), 'invite', null, $invite->email ? "for {$invite->email}" : 'for anyone');

        return response()->json(['invite' => $invite->toPublic()], 201);
    }

    public function destroy(Invite $invite): JsonResponse
    {
        abort_if($invite->used_at !== null, 422, 'This invite was already used.');
        $invite->delete();

        return response()->json(['ok' => true]);
    }
}
