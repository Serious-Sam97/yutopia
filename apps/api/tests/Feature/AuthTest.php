<?php

use App\Models\Invite;
use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Support\Facades\Notification;

beforeEach(function () {
    config(['yutopia.signup' => 'open', 'yutopia.admins' => []]);
});

it('tells the sign-in page the world name and sign-up mode', function () {
    config(['yutopia.signup' => 'invite', 'yutopia.world_name' => 'Yutopia']);

    $this->getJson('/api/config')->assertOk()->assertExactJson(['worldName' => 'Yutopia', 'signup' => 'invite']);
});

it('registers with open sign-up and returns a working token', function () {
    $res = $this->postJson('/api/register', [
        'name' => 'Cris', 'email' => 'Cris@Example.com', 'password' => 'secret-pass', 'password_confirmation' => 'secret-pass',
    ])->assertCreated()->assertJsonPath('user.email', 'cris@example.com')->assertJsonPath('user.isAdmin', false);

    $this->withToken($res->json('token'))->getJson('/api/me')->assertOk()->assertJsonPath('user.name', 'Cris');
});

it('refuses sign-up when it is closed', function () {
    config(['yutopia.signup' => 'closed']);

    $this->postJson('/api/register', [
        'name' => 'Cris', 'email' => 'cris@example.com', 'password' => 'secret-pass', 'password_confirmation' => 'secret-pass',
    ])->assertForbidden();
    expect(User::count())->toBe(0);
});

it('needs an open invite when sign-up is by invite, and uses it up', function () {
    config(['yutopia.signup' => 'invite']);
    $admin = User::factory()->create(['is_admin' => true]);
    $invite = Invite::make($admin, 'cris@example.com');
    $body = ['name' => 'Cris', 'email' => 'cris@example.com', 'password' => 'secret-pass', 'password_confirmation' => 'secret-pass'];

    $this->postJson('/api/register', $body)->assertUnprocessable()->assertJsonValidationErrors('invite');
    $this->postJson('/api/register', [...$body, 'email' => 'other@example.com', 'invite' => $invite->code])
        ->assertUnprocessable()->assertJsonValidationErrors('invite');
    $this->getJson("/api/invites/{$invite->code}")->assertOk()->assertJsonPath('email', 'cris@example.com');

    $this->postJson('/api/register', [...$body, 'invite' => $invite->code])->assertCreated();
    expect($invite->fresh()->used_by)->toBe(User::where('email', 'cris@example.com')->value('id'));

    $this->getJson("/api/invites/{$invite->code}")->assertNotFound();
    $this->postJson('/api/register', [...$body, 'email' => 'dani@example.com', 'invite' => $invite->code])
        ->assertUnprocessable();
});

it('refuses an expired invite', function () {
    config(['yutopia.signup' => 'invite']);
    $invite = Invite::make(User::factory()->create(['is_admin' => true]), null);
    $invite->forceFill(['expires_at' => now()->subMinute()])->save();

    $this->postJson('/api/register', [
        'name' => 'Cris', 'email' => 'cris@example.com', 'password' => 'secret-pass', 'password_confirmation' => 'secret-pass', 'invite' => $invite->code,
    ])->assertUnprocessable();
});

it('signs in by email and password, case-insensitively', function () {
    User::factory()->create(['email' => 'ana@yutopia.test', 'password' => 'yutopia-demo']);

    $this->postJson('/api/login', ['email' => 'ANA@yutopia.test', 'password' => 'nope'])->assertUnprocessable();
    $this->postJson('/api/login', ['email' => 'ANA@yutopia.test', 'password' => 'yutopia-demo'])
        ->assertOk()->assertJsonStructure(['token', 'user' => ['id', 'name', 'email', 'isAdmin']]);
});

it('promotes the addresses listed in YUTOPIA_ADMINS when they sign in', function () {
    config(['yutopia.admins' => ['ana@yutopia.test']]);
    $ana = User::factory()->create(['email' => 'ana@yutopia.test', 'password' => 'yutopia-demo']);

    $this->postJson('/api/login', ['email' => 'ana@yutopia.test', 'password' => 'yutopia-demo'])->assertJsonPath('user.isAdmin', true);
    expect($ana->fresh()->is_admin)->toBeTrue();
});

it('logs out by deleting only the current token', function () {
    $user = User::factory()->create();
    $a = $user->createToken('a')->plainTextToken;
    $user->createToken('b');

    $this->withToken($a)->postJson('/api/logout')->assertOk();
    expect($user->tokens()->count())->toBe(1);
});

it('keeps signed-out people out with JSON, not a redirect', function () {
    $this->getJson('/api/me')->assertUnauthorized();
    $this->get('/api/me')->assertUnauthorized()->assertHeader('content-type', 'application/json');
});

it('resets a password by email link and ends every session', function () {
    Notification::fake();
    $user = User::factory()->create(['email' => 'bia@yutopia.test']);
    $user->createToken('old');

    $this->postJson('/api/forgot-password', ['email' => 'nobody@example.com'])->assertOk();
    $this->postJson('/api/forgot-password', ['email' => 'BIA@yutopia.test'])->assertOk();

    $token = null;
    Notification::assertSentTo($user, ResetPassword::class, function (ResetPassword $n) use (&$token, $user) {
        $token = $n->token;
        expect($n->toMail($user)->actionUrl)->toStartWith(config('yutopia.client_url').'/reset?token=');

        return true;
    });

    $this->postJson('/api/reset-password', ['token' => $token, 'email' => 'bia@yutopia.test', 'password' => 'new-secret', 'password_confirmation' => 'new-secret'])->assertOk();
    expect($user->tokens()->count())->toBe(0);
    $this->postJson('/api/login', ['email' => 'bia@yutopia.test', 'password' => 'new-secret'])->assertOk();
});
