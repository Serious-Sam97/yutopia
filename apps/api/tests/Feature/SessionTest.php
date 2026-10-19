<?php

use App\Http\Middleware\VerifyInternalSignature;
use App\Models\Avatar;
use App\Models\User;
use App\Services\Tokens;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

beforeEach(function () {
    config([
        'yutopia.world_secret' => 'world-secret',
        'yutopia.internal_secret' => 'internal-secret',
        'yutopia.livekit.key' => 'APIdevkey',
        'yutopia.livekit.secret' => 'livekit-secret',
    ]);
});

it('mints a world token for the one world: everyone builds', function () {
    $bia = User::factory()->create(['name' => 'Bia']);
    Avatar::create(['user_id' => $bia->id, 'layers' => ['hair' => 'bun']]);

    $res = $this->actingAs($bia)->postJson('/api/session')->assertOk()
        ->assertJsonPath('world.name', config('yutopia.world_name'))
        ->assertJsonPath('canBuild', true)
        ->assertJsonPath('avatar.hair', 'bun')
        ->assertJsonPath('avatar.top', 'tee');

    $claims = Tokens::decode($res->json('worldToken'), 'world-secret');
    expect($claims)->toMatchArray(['iss' => 'yutopia', 'aud' => 'yutopia-world', 'sub' => (string) $bia->id, 'name' => 'Bia', 'roles' => ['member', 'builder']])
        ->and($claims)->not->toHaveKeys(['space_id', 'project_id'])
        ->and($claims['avatar']['hair'])->toBe('bun')
        ->and($claims['exp'] - $claims['iat'])->toBe(config('yutopia.token_ttl'));
    expect(Tokens::decode($res->json('worldToken'), 'another-secret'))->toBeNull();
});

it('adds the admin role for admins', function () {
    $ana = User::factory()->create(['is_admin' => true]);

    $token = $this->actingAs($ana)->postJson('/api/session')->json('worldToken');
    expect(Tokens::decode($token, 'world-secret')['roles'])->toBe(['member', 'builder', 'admin']);
});

it('mints a LiveKit token for the world room', function () {
    $user = User::factory()->create();

    $claims = Tokens::decode($this->actingAs($user)->postJson('/api/session')->json('livekitToken'), 'livekit-secret');
    expect($claims['iss'])->toBe('APIdevkey')
        ->and($claims['sub'])->toBe((string) $user->id)
        ->and($claims['video'])->toMatchArray(['room' => 'world', 'roomJoin' => true, 'canPublish' => true, 'canSubscribe' => true]);
});

it('hands out Cloudflare TURN relays without the port-53 URLs, cached', function () {
    config(['yutopia.turn.key_id' => 'k', 'yutopia.turn.api_token' => 't']);
    Cache::flush();
    Http::fake(['rtc.live.cloudflare.com/*' => Http::response(['iceServers' => [
        ['urls' => ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'], 'username' => 'u', 'credential' => 'c'],
        ['urls' => ['turn:turn.cloudflare.com:53?transport=udp']],
    ]])]);
    $user = User::factory()->create();

    $this->actingAs($user)->postJson('/api/session')->assertJsonPath('iceServers', [
        ['urls' => ['stun:stun.cloudflare.com:3478'], 'username' => 'u', 'credential' => 'c'],
    ]);
    $this->actingAs($user)->postJson('/api/session');
    Http::assertSentCount(1);
});

it('needs a signed-in person', function () {
    $this->postJson('/api/session')->assertUnauthorized();
});

it('lets the world-server in only with a fresh signature over method, path and body', function () {
    $sign = fn (string $method, string $uri, string $body = '', ?int $ts = null) => [
        'X-Yutopia-Timestamp' => (string) ($ts ?? time()),
        'X-Yutopia-Signature' => VerifyInternalSignature::sign('internal-secret', (string) ($ts ?? time()), $method, $uri, $body),
    ];

    // the world-server sends GETs with no body at all
    // (withHeaders() would stick to every later request of the test)
    $ping = fn (array $headers = []) => $this->call('GET', '/api/internal/ping', server: collect(['Accept' => 'application/json', ...$headers])
        ->mapWithKeys(fn ($v, $k) => ['HTTP_'.strtoupper(str_replace('-', '_', $k)) => $v])->all());

    $ping($sign('GET', '/api/internal/ping'))->assertOk()->assertJsonPath('ok', true);
    $ping()->assertUnauthorized();
    $ping($sign('GET', '/api/internal/other'))->assertUnauthorized();
    $ping($sign('POST', '/api/internal/ping'))->assertUnauthorized();
    $ping($sign('GET', '/api/internal/ping', '{"x":1}'))->assertUnauthorized();
    $ping($sign('GET', '/api/internal/ping', '', time() - 400))->assertUnauthorized();
    $ping(['X-Yutopia-Timestamp' => 'soon', 'X-Yutopia-Signature' => 'x'])->assertUnauthorized();

    config(['yutopia.internal_secret' => '']);
    $ping($sign('GET', '/api/internal/ping'))->assertUnauthorized();
});
