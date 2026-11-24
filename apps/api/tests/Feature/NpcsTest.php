<?php

use App\Models\AdminAction;
use App\Models\Npc;
use App\Models\User;
use App\Models\World;
use App\Services\Vortex;
use Illuminate\Http\Client\Request as Sent;
use Illuminate\Support\Facades\Http;

// The world's cast (docs/plan/120-god-mode-npcs.md): admins make, change and delete NPCs; the world server seeds the
// town's people once and takes every change live.

function townSeed(): array
{
    return [
        ['key' => 'guard', 'name' => '', 'role' => ['en' => 'Night guard', 'pt' => 'Vigia'], 'look' => ['gait' => 'heavy', 'top' => 'jacket'], 'behaviour' => ['type' => 'guard-rounds'], 'town' => true],
        ['key' => 'vortex', 'name' => 'VORTEX', 'role' => ['en' => '', 'pt' => ''], 'look' => null, 'behaviour' => ['type' => 'vortex'], 'lines' => [], 'town' => true],
        ['key' => 'folk-rosa', 'name' => 'Rosa', 'role' => ['en' => 'Race control', 'pt' => 'Direção de prova'], 'look' => ['gender' => 'feminine', 'skin' => '#a8693f'], 'lines' => [['when' => 'ambient', 'en' => 'Karts are on the rack.', 'pt' => '']], 'behaviour' => ['type' => 'kart-control'], 'town' => true],
    ];
}

it('seeds the town\'s people once, Vortex with his public lines; never again, a deleted one staying deleted', function () {
    World::current();
    $this->postJson('/api/internal/npcs/seed', ['npcs' => townSeed()])->assertUnauthorized();
    internalCall($this, 'GET', '/api/internal/world')->assertOk()->assertJsonPath('npcs', null);

    $cast = internalCall($this, 'POST', '/api/internal/npcs/seed', ['npcs' => townSeed()])->assertCreated()->json('npcs');
    expect(array_column($cast, 'key'))->toBe(['guard', 'vortex', 'folk-rosa'])
        ->and(array_column($cast, 'town'))->toBe([true, true, true])
        ->and($cast[0]['behaviour']['type'])->toBe('guard-rounds')
        ->and($cast[1]['look'])->toBeNull()
        ->and(count($cast[1]['lines']))->toBe(count(Vortex::publicLines()))
        ->and($cast[1]['lines'][0]['when'])->toBe('ambient')
        ->and($cast[2]['role'])->toBe(['en' => 'Race control', 'pt' => 'Direção de prova']);
    internalCall($this, 'GET', '/api/internal/world')->assertOk()->assertJsonCount(3, 'npcs')->assertJsonPath('npcs.2.name', 'Rosa');

    Npc::where('key', 'folk-rosa')->delete();
    internalCall($this, 'POST', '/api/internal/npcs/seed', ['npcs' => townSeed()])->assertOk()->assertJsonPath('seeded', false)->assertJsonCount(2, 'npcs');
    expect(Npc::where('key', 'folk-rosa')->exists())->toBeFalse();
});

it('lets admins alone list, make, change and delete NPCs, the cast handed to the world server each time', function () {
    config(['yutopia.world_internal' => 'http://world.test']);
    Http::fake(['world.test/*' => Http::response(['ok' => true])]);
    World::current();
    internalCall($this, 'POST', '/api/internal/npcs/seed', ['npcs' => townSeed()])->assertCreated();
    $admin = User::factory()->create(['is_admin' => true, 'name' => 'Ana']);
    $member = User::factory()->create();

    $this->actingAs($member)->getJson('/api/admin/npcs')->assertForbidden();
    $this->actingAs($member)->postJson('/api/admin/npcs', ['npc' => ['name' => 'X']])->assertForbidden();
    $this->actingAs($member)->putJson('/api/admin/npcs/guard', ['npc' => ['name' => 'X']])->assertForbidden();
    $this->actingAs($member)->deleteJson('/api/admin/npcs/guard')->assertForbidden();

    $this->actingAs($admin)->getJson('/api/admin/npcs')->assertOk()->assertJsonCount(3, 'npcs')->assertJsonPath('seeded', true)->assertJsonPath('max', 500);

    // made: a key of its own, never a town one nor a town type, whatever was sent; cleaned
    $made = $this->actingAs($admin)->postJson('/api/admin/npcs', ['npc' => [
        'key' => 'guard', 'town' => true, 'name' => "  Dora\n the baker ", 'role' => ['pt' => 'Padeira'],
        'look' => ['skin' => 'red', 'hair' => 'bun', 'evil' => 'x', 'topColor' => '#AABBCC'],
        'lines' => [['when' => 'greet', 'en' => 'Fresh bread!', 'pt' => 'Pão fresquinho!'], ['when' => 'hit', 'en' => 'x'], ['en' => '', 'pt' => '']],
        'behaviour' => ['type' => 'guard-rounds', 'hours' => 'shift', 'from' => 5.2, 'to' => 13, 'pace' => 4, 'talk' => 'often', 'greet' => true, 'shots' => 'flee'],
        'notes' => str_repeat('n', 1200),
    ]])->assertCreated()->json('npc');
    expect($made['key'])->toMatch('/^npc-[a-z0-9]{8}$/')
        ->and($made['town'])->toBeFalse()
        ->and($made['name'])->toBe('Dora  the baker')
        ->and($made['role'])->toBe(['en' => 'Padeira', 'pt' => ''])
        ->and($made['look'])->toBe(['hair' => 'bun', 'topColor' => '#AABBCC'])
        ->and($made['voice'])->toBe('man')
        ->and($made['lines'])->toBe([['when' => 'greet', 'en' => 'Fresh bread!', 'pt' => 'Pão fresquinho!'], ['when' => 'ambient', 'en' => 'x', 'pt' => '']])
        ->and($made['behaviour'])->toBe(['type' => 'stand', 'hours' => 'shift', 'from' => 5, 'to' => 13, 'pace' => 1.5, 'talk' => 'often', 'greet' => true, 'answer' => false, 'shots' => 'flee', 'traits' => null])
        ->and(mb_strlen($made['notes']))->toBe(1000);
    $this->actingAs($admin)->postJson('/api/admin/npcs', ['npc' => ['name' => ' ', 'role' => ['en' => '']]])->assertUnprocessable();
    // (no look sent — a copy of Vortex —: an object, {}, for the shared parseAvatar to fill; never PHP's [])
    $plain = $this->actingAs($admin)->postJson('/api/admin/npcs', ['npc' => ['name' => 'Plain', 'look' => null]])->assertCreated();
    expect($plain->getContent())->toContain('"look":{}');
    $this->actingAs($admin)->deleteJson('/api/admin/npcs/'.$plain->json('npc.key'))->assertOk();
    $this->actingAs($admin)->postJson('/api/admin/npcs', [])->assertUnprocessable();

    // changed: a town NPC keeps their type and stays the town's; someone made can take any of the types
    $this->actingAs($admin)->putJson('/api/admin/npcs/folk-rosa', ['npc' => ['name' => 'Rosa', 'role' => ['en' => 'Race control'], 'look' => ['top' => 'hoodie'], 'behaviour' => ['type' => 'wander', 'talk' => 'rarely'], 'town' => false]])
        ->assertOk()->assertJsonPath('npc.behaviour.type', 'kart-control')->assertJsonPath('npc.behaviour.talk', 'rarely')
        ->assertJsonPath('npc.town', true)->assertJsonPath('npc.look.top', 'hoodie');
    $this->actingAs($admin)->putJson("/api/admin/npcs/{$made['key']}", ['npc' => ['name' => 'Dora', 'behaviour' => ['type' => 'counter']]])
        ->assertOk()->assertJsonPath('npc.behaviour.type', 'counter');
    $this->actingAs($admin)->putJson('/api/admin/npcs/nobody', ['npc' => ['name' => 'X']])->assertNotFound();

    // deleted: a town one too, gone for good
    $this->actingAs($admin)->deleteJson('/api/admin/npcs/guard')->assertOk();
    $this->actingAs($admin)->deleteJson('/api/admin/npcs/guard')->assertNotFound();
    expect(array_column($this->actingAs($admin)->getJson('/api/admin/npcs')->json('npcs'), 'key'))->toBe(['vortex', 'folk-rosa', $made['key']]);

    // the log says who did what; the world server was handed the whole cast, signed
    expect(AdminAction::pluck('kind')->all())->toBe(['npc-new', 'npc-new', 'npc-delete', 'npc', 'npc', 'npc-delete']);
    $sent = Http::recorded()->map(fn ($p) => $p[0])->filter(fn (Sent $r) => $r->url() === 'http://world.test/internal/cast')->values();
    expect($sent->count())->toBeGreaterThan(0);
    expect(array_column($sent->last()->data()['npcs'], 'key'))->toBe(['vortex', 'folk-rosa', $made['key']]);
    Http::assertSent(fn (Sent $r) => $r->hasHeader('X-Yutopia-Signature'));
    // (each push says when the cast was read)
    expect($sent->last()->data()['at'])->toBeInt()->toBeGreaterThan(0);
});

it('has Vortex say the cast\'s lines once seeded, by moment; none if he was deleted', function () {
    World::current();
    // (not seeded: his own)
    $line = app(Vortex::class)->line('hit');
    expect($line['line'])->toBeString()->and($line['personal'])->toBeFalse();

    internalCall($this, 'POST', '/api/internal/npcs/seed', ['npcs' => townSeed()])->assertCreated();
    $v = Npc::where('key', 'vortex')->first();
    $v->def = array_merge($v->def, ['lines' => [
        ['when' => 'hit', 'en' => 'ow, in english', 'pt' => 'ai, em português'],
        ['when' => 'ambient', 'en' => 'just the hiss', 'pt' => ''],
    ]]);
    $v->save();
    $hit = app(Vortex::class)->line('hit');
    expect(str_replace(' *kkzzt*', '', $hit['line']))->toBe("ow, in english\x1fai, em português")->and($hit['mood'])->toBe('judging');
    // (a moment with no lines of its own: his ambient ones)
    expect(str_replace(' *kkzzt*', '', app(Vortex::class)->line('radio')['line']))->toBe('just the hiss');
    $v->delete();
    expect(app(Vortex::class)->line('hit')['line'])->toBeNull();
});

// plan 123: who they are (traits, 0…1 in tenths) and the lines for what's done with them
it('keeps an NPC\'s traits and the new line moments', function () {
    $ana = User::factory()->create(['is_admin' => true]);
    $made = $this->actingAs($ana)->postJson('/api/admin/npcs', ['npc' => [
        'key' => 'npc-traits', 'name' => 'Tess',
        'behaviour' => ['traits' => ['outgoing' => 0.83, 'cheerful' => 2, 'neat' => 'x']],
        'lines' => [['when' => 'joke', 'en' => 'Knock knock', 'pt' => 'Toc toc'], ['when' => 'nope', 'en' => 'Hi', 'pt' => '']],
    ]])->assertCreated()->json('npc');
    expect($made['behaviour']['traits'])->toBe(['outgoing' => 0.8, 'active' => 0.5, 'neat' => 0.5, 'cheerful' => 1])
        ->and($made['lines'][0]['when'])->toBe('joke')
        ->and($made['lines'][1]['when'])->toBe('ambient');
});
