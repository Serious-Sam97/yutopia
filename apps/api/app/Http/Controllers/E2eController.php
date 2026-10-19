<?php

namespace App\Http\Controllers;

use App\Services\WorldSnapshot;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

// The e2e suite (apps/client/e2e) puts the world back to one of its fixtures
// before the specs that need it. Only with YUTOPIA_E2E=1 (local stacks), only admins.
class E2eController extends Controller
{
    public function world(Request $request, WorldSnapshot $snapshots): JsonResponse
    {
        abort_unless(config('yutopia.e2e'), 404);
        abort_unless($request->user()?->is_admin, 403);

        return response()->json($snapshots->import($request->json()->all(), clearSpawns: true));
    }
}
