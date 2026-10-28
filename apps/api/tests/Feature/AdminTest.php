<?php

use App\Models\Invite;
use App\Models\User;
use Database\Seeders\DemoSeeder;

it('lets only admins make, list and drop invites', function () {
    $admin = User::factory()->create(['is_admin' => true]);
    $member = User::factory()->create();

    $this->actingAs($member)->postJson('/api/admin/invites')->assertForbidden();

    $made = $this->actingAs($admin)->postJson('/api/admin/invites', ['email' => 'Cris@Example.com'])
        ->assertCreated()->assertJsonPath('invite.email', 'cris@example.com')->json('invite');
    expect($made['url'])->toBe(config('yutopia.client_url').'/register?invite='.$made['code']);

    $this->actingAs($admin)->getJson('/api/admin/invites')->assertOk()->assertJsonCount(1, 'invites');
    $this->actingAs($admin)->deleteJson("/api/admin/invites/{$made['id']}")->assertOk();
    expect(Invite::count())->toBe(0);
});

it('keeps a used invite on record', function () {
    $admin = User::factory()->create(['is_admin' => true]);
    $invite = Invite::make($admin, null);
    $invite->forceFill(['used_by' => $admin->id, 'used_at' => now()])->save();

    $this->actingAs($admin)->deleteJson("/api/admin/invites/{$invite->id}")->assertUnprocessable();
});

it('says who used an invite, and how people sign up', function () {
    $admin = User::factory()->create(['is_admin' => true, 'name' => 'Ana']);
    $teo = User::factory()->create(['name' => 'Teo']);
    Invite::make($admin, null)->forceFill(['used_by' => $teo->id, 'used_at' => now()])->save();
    Invite::make($admin, null);

    $this->actingAs($admin)->getJson('/api/admin/invites')->assertOk()
        ->assertJsonPath('signup', config('yutopia.signup'))
        ->assertJsonPath('invites.0.usedBy', null)
        ->assertJsonPath('invites.1.usedBy', 'Teo');
});

it('grants and revokes admin from the command line', function () {
    $bia = User::factory()->create(['email' => 'bia@yutopia.test']);

    $this->artisan('yutopia:admin', ['email' => 'BIA@yutopia.test'])->assertSuccessful();
    expect($bia->fresh()->is_admin)->toBeTrue();
    $this->artisan('yutopia:admin', ['email' => 'bia@yutopia.test', '--revoke' => true])->assertSuccessful();
    expect($bia->fresh()->is_admin)->toBeFalse();
    $this->artisan('yutopia:admin', ['email' => 'nobody@example.com'])->assertFailed();
});

it('seeds the three demo people, Ana as admin', function () {
    $this->seed(DemoSeeder::class);
    $this->seed(DemoSeeder::class);

    expect(User::count())->toBe(3)
        ->and(User::where('email', 'ana@yutopia.test')->value('is_admin'))->toBeTrue()
        ->and(User::where('email', 'bia@yutopia.test')->value('is_admin'))->toBeFalse()
        ->and(User::where('email', 'cai@yutopia.test')->value('is_admin'))->toBeFalse();
    $this->postJson('/api/login', ['email' => 'bia@yutopia.test', 'password' => 'yutopia-demo'])->assertOk();
});

// Run the place (docs/plan/48-the-admin.md)

it('lists everyone for admins only, last seen first, by name or email', function () {
    $admin = User::factory()->create(['is_admin' => true, 'name' => 'Ana']);
    $bia = User::factory()->create(['name' => 'Bia', 'email' => 'bia@example.com']);
    $bia->forceFill(['seen_at' => now()->subHour()])->save();
    User::factory()->create(['name' => 'Teo']);

    $this->actingAs($bia)->getJson('/api/admin/members')->assertForbidden();
    $all = $this->actingAs($admin)->getJson('/api/admin/members')->assertOk()->json('members');
    expect(array_column($all, 'name'))->toBe(['Bia', 'Ana', 'Teo'])
        ->and($all[0]['seenAt'])->not->toBeNull()
        ->and($all[1]['admin'])->toBeTrue();
    $this->actingAs($admin)->getJson('/api/admin/members?q=BIA@EX')->assertOk()->assertJsonCount(1, 'members');
});

it('gives and takes the admin role, never your own, never the last', function () {
    $ana = User::factory()->create(['is_admin' => true]);
    $bia = User::factory()->create();

    $this->actingAs($bia)->patchJson("/api/admin/members/{$ana->id}", ['admin' => false])->assertForbidden();
    $this->actingAs($ana)->patchJson("/api/admin/members/{$ana->id}", ['admin' => false])->assertUnprocessable();
    $this->actingAs($ana)->patchJson("/api/admin/members/{$bia->id}", ['admin' => true])->assertOk()->assertJsonPath('admin', true);
    expect($bia->fresh()->is_admin)->toBeTrue();
    // two now: Bia may take Ana's, then Ana is the last and keeps hers
    $bia = $bia->fresh();
    $this->actingAs($bia)->patchJson("/api/admin/members/{$ana->id}", ['admin' => false])->assertOk();
    $this->actingAs($ana->fresh())->patchJson("/api/admin/members/{$bia->id}", ['admin' => false])->assertForbidden();
    $this->actingAs($bia)->patchJson("/api/admin/members/{$bia->id}", ['admin' => false])->assertUnprocessable();

    $log = $this->actingAs($bia)->getJson('/api/admin/log')->assertOk()->json('log');
    expect(array_column($log, 'kind'))->toBe(['unadmin', 'admin']);
});

it('keeps what admins did in the world, for admins to read', function () {
    $ana = User::factory()->create(['is_admin' => true, 'name' => 'Ana']);
    $bia = User::factory()->create(['name' => 'Bia']);

    internalCall($this, 'POST', '/api/internal/admin-log', ['adminId' => $ana->id, 'kind' => 'mute', 'targetId' => $bia->id])->assertCreated();
    internalCall($this, 'POST', '/api/internal/admin-log', ['adminId' => $ana->id, 'kind' => 'lock', 'target' => 'War room'])->assertCreated();
    internalCall($this, 'POST', '/api/internal/admin-log', ['adminId' => $ana->id, 'kind' => 'nonsense'])->assertUnprocessable();
    $this->postJson('/api/internal/admin-log', ['adminId' => $ana->id, 'kind' => 'mute'])->assertUnauthorized();

    $this->actingAs($bia)->getJson('/api/admin/log')->assertForbidden();
    $log = $this->actingAs($ana)->getJson('/api/admin/log')->assertOk()->json('log');
    expect($log[0])->toMatchArray(['admin' => 'Ana', 'kind' => 'lock', 'target' => 'War room'])
        ->and($log[1])->toMatchArray(['kind' => 'mute', 'target' => 'Bia', 'targetId' => $bia->id]);
    $this->actingAs($ana)->getJson('/api/admin/log?kinds=mute')->assertOk()->assertJsonCount(1, 'log');
});

it('marks someone seen when they enter the world', function () {
    $bia = User::factory()->create();
    expect($bia->seen_at)->toBeNull();
    $this->actingAs($bia)->postJson('/api/session')->assertOk();
    expect($bia->fresh()->seen_at)->not->toBeNull();
});
