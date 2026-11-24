<?php

use App\Models\Npc;
use App\Models\User;
use App\Models\World;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

// How the NPCs feel about people (docs/plan/123-npcs-alive.md, F5a/F6a): the world server's alone; kept as sent,
// changed in place; checked; gone with the NPC.
it('keeps the NPCs\' bonds for the world server, changed in place, gone with the NPC', function () {
    World::current();
    $this->getJson('/api/internal/npc-bonds')->assertUnauthorized();
    internalCall($this, 'GET', '/api/internal/npc-bonds')->assertOk()->assertJsonCount(0, 'bonds');
    $at = 1_790_000_000_000;
    Npc::create(['key' => 'npc-dora', 'def' => ['key' => 'npc-dora', 'name' => 'Dora'], 'town' => false, 'position' => 1]);
    Npc::create(['key' => 'npc-ned', 'def' => ['key' => 'npc-ned', 'name' => 'Ned'], 'town' => false, 'position' => 2]);
    internalCall($this, 'PUT', '/api/internal/npc-bonds', ['bonds' => [
        ['npc' => 'npc-dora', 'other' => 'u:12', 'v' => 30, 'n' => 4, 'at' => $at],
        ['npc' => 'npc-dora', 'other' => 'n:npc-ned', 'v' => -25, 'n' => 2, 'at' => $at],
        ['npc' => 'npc-ned', 'other' => 'n:npc-dora', 'v' => -25, 'n' => 2, 'at' => $at],
    ]])->assertOk()->assertJsonPath('kept', 3);
    internalCall($this, 'PUT', '/api/internal/npc-bonds', ['bonds' => [
        ['npc' => 'npc-dora', 'other' => 'u:12', 'v' => 45, 'n' => 5, 'at' => $at + 1000],
    ]])->assertOk();
    $bonds = internalCall($this, 'GET', '/api/internal/npc-bonds')->assertOk()->json('bonds');
    expect(count($bonds))->toBe(3);
    $dora = collect($bonds)->firstWhere('other', 'u:12');
    expect($dora)->toBe(['npc' => 'npc-dora', 'other' => 'u:12', 'v' => 45, 'n' => 5, 'at' => $at + 1000]);
    // (checked: a value out of bounds, someone not a player or an NPC)
    internalCall($this, 'PUT', '/api/internal/npc-bonds', ['bonds' => [['npc' => 'npc-dora', 'other' => 'u:1', 'v' => 400, 'n' => 1, 'at' => 0]]])->assertUnprocessable();
    internalCall($this, 'PUT', '/api/internal/npc-bonds', ['bonds' => [['npc' => 'npc-dora', 'other' => 'x:1', 'v' => 4, 'n' => 1, 'at' => 0]]])->assertUnprocessable();

    // Dora deleted on the cast page: what she felt, and what was felt about her, gone
    config(['yutopia.world_internal' => 'http://world.test']);
    Http::fake(['world.test/*' => Http::response(['ok' => true])]);
    $ana = User::factory()->create(['is_admin' => true]);
    $this->actingAs($ana)->deleteJson('/api/admin/npcs/npc-dora')->assertOk();
    expect(DB::table('npc_bonds')->count())->toBe(0);
    // (a save already on its way when she went: hers not written back)
    internalCall($this, 'PUT', '/api/internal/npc-bonds', ['bonds' => [
        ['npc' => 'npc-dora', 'other' => 'u:12', 'v' => 45, 'n' => 6, 'at' => $at + 2000],
    ]])->assertOk()->assertJsonPath('kept', 0);
    expect(DB::table('npc_bonds')->count())->toBe(0);
});
