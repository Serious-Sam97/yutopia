<?php

namespace App\Http\Controllers;

use App\Models\Invite;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

// Admins hand out single-use sign-up links (YUTOPIA_SIGNUP=invite).
class InviteController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(['invites' => Invite::latest('id')->limit(200)->get()->map->toPublic()]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => ['nullable', 'email', 'max:255']]);

        return response()->json(['invite' => Invite::make($request->user(), $data['email'] ?? null)->toPublic()], 201);
    }

    public function destroy(Invite $invite): JsonResponse
    {
        abort_if($invite->used_at !== null, 422, 'This invite was already used.');
        $invite->delete();

        return response()->json(['ok' => true]);
    }
}
