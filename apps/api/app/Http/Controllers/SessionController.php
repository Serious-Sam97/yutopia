<?php

namespace App\Http\Controllers;

use App\Services\Avatars;
use App\Services\Tokens;
use App\Services\Turn;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

// Everything a client needs to step into the world: who it is, the world token for the
// world-server, the LiveKit token for voice/video and the TURN relays.
class SessionController extends Controller
{
    public function __construct(
        private readonly Tokens $tokens,
        private readonly Avatars $avatars,
        private readonly Turn $turn,
    ) {}

    public function __invoke(Request $request): JsonResponse
    {
        $user = $request->user();
        $avatar = $this->avatars->for($user);
        // (in the world now: Run the place's "last seen", kept fresh by the world's spots)
        $user->forceFill(['seen_at' => now()])->saveQuietly();

        return response()->json([
            'world' => ['name' => config('yutopia.world_name'), 'mapKey' => 'studio'],
            'user' => $user->toPublic(),
            'canBuild' => true,
            'avatar' => $avatar,
            'worldUrl' => config('yutopia.world_url'),
            'worldToken' => $this->tokens->world($user, $avatar),
            'livekitUrl' => config('yutopia.livekit.url'),
            'livekitToken' => $this->tokens->livekit($user),
            'iceServers' => $this->turn->iceServers(),
            'expiresIn' => config('yutopia.token_ttl'),
        ]);
    }
}
