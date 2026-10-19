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

it('grants and revokes admin from the command line', function () {
    $bia = User::factory()->create(['email' => 'bia@yutopia.test']);

    $this->artisan('yutopia:admin', ['email' => 'BIA@yutopia.test'])->assertSuccessful();
    expect($bia->fresh()->is_admin)->toBeTrue();
    $this->artisan('yutopia:admin', ['email' => 'bia@yutopia.test', '--revoke' => true])->assertSuccessful();
    expect($bia->fresh()->is_admin)->toBeFalse();
    $this->artisan('yutopia:admin', ['email' => 'nobody@example.com'])->assertFailed();
});

it('seeds the two demo people, Ana as admin', function () {
    $this->seed(DemoSeeder::class);
    $this->seed(DemoSeeder::class);

    expect(User::count())->toBe(2)
        ->and(User::where('email', 'ana@yutopia.test')->value('is_admin'))->toBeTrue()
        ->and(User::where('email', 'bia@yutopia.test')->value('is_admin'))->toBeFalse();
    $this->postJson('/api/login', ['email' => 'bia@yutopia.test', 'password' => 'yutopia-demo'])->assertOk();
});
