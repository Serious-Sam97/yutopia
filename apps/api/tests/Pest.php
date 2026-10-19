<?php

use App\Http\Middleware\VerifyInternalSignature;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

pest()->extend(TestCase::class)
    ->use(RefreshDatabase::class)
    ->beforeEach(function () {
        config([
            'yutopia.world_secret' => 'world-secret-for-tests-0123456789abcdef',
            'yutopia.internal_secret' => 'internal-secret-for-tests-0123456789abc',
            'yutopia.livekit.key' => 'APItest',
            'yutopia.livekit.secret' => 'livekit-secret-for-tests-0123456789abcd',
            'yutopia.world_internal' => null,
            'yutopia.turn.key_id' => null,
        ]);
    })
    ->in('Feature');

// A call from the world-server, signed as it signs them (VerifyInternalSignature).
function internalCall(TestCase $test, string $method, string $uri, array $body = []): TestResponse
{
    $raw = $method === 'GET' || $method === 'DELETE' ? '' : json_encode($body);
    $ts = (string) time();

    return $test->call($method, $uri, [], [], [], [
        'HTTP_X_YUTOPIA_TIMESTAMP' => $ts,
        'HTTP_X_YUTOPIA_SIGNATURE' => VerifyInternalSignature::sign(config('yutopia.internal_secret'), $ts, $method, $uri, $raw),
        'CONTENT_TYPE' => 'application/json',
        'HTTP_ACCEPT' => 'application/json',
    ], $raw);
}
