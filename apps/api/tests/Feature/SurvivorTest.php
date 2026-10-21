<?php

use App\Models\Survivor;
use App\Models\User;

// The dark (docs/plan/30-the-dark.md, phase 2): someone's pockets, vitals and
// pages, saved by the world-server and read back when they come in again.

function pockets(array $over = []): array
{
    return array_replace_recursive([
        'inventory' => [
            'weapons' => [['id' => 'revolver', 'loaded' => 4], null],
            'pockets' => [['id' => 'r38', 'n' => 9], ['id' => 'flare', 'n' => 1], null, ['id' => 'aid', 'n' => 2], null, null],
        ],
        'vitals' => ['hp' => 62.5, 'wm' => 40, 'bat' => 81],
        'pages' => ['boathouse-1'],
        'issued' => true,
    ], $over);
}

it('keeps someone\'s pockets: saved, then read back as they were (a restart loses nothing)', function () {
    $ana = User::factory()->create();
    internalCall($this, 'GET', "/api/internal/survivors/{$ana->id}")->assertOk()->assertJsonPath('survivor', null);

    internalCall($this, 'PUT', "/api/internal/survivors/{$ana->id}", pockets())->assertOk();
    // (what a fresh world-server reads when she comes back in)
    $back = internalCall($this, 'GET', "/api/internal/survivors/{$ana->id}")->assertOk()->json('survivor');
    expect($back['inventory']['weapons'])->toBe([['id' => 'revolver', 'loaded' => 4], null]);
    expect($back['inventory']['pockets'][0])->toBe(['id' => 'r38', 'n' => 9]);
    expect($back['inventory']['pockets'][3])->toBe(['id' => 'aid', 'n' => 2]);
    expect($back['inventory']['pockets'][5])->toBeNull();
    expect($back['vitals'])->toEqual(['hp' => 62.5, 'wm' => 40, 'bat' => 81]);
    expect($back['pages'])->toBe(['boathouse-1']);
    expect($back['issued'])->toBeTrue();

    // saved again: one row, the new pockets
    internalCall($this, 'PUT', "/api/internal/survivors/{$ana->id}", pockets(['inventory' => ['pockets' => [0 => ['id' => 'r38', 'n' => 24]]]]))->assertOk();
    expect(Survivor::count())->toBe(1);
    expect(internalCall($this, 'GET', "/api/internal/survivors/{$ana->id}")->json('survivor.inventory.pockets.0.n'))->toBe(24);
});

it('refuses what nobody could carry', function () {
    $ana = User::factory()->create();
    $put = fn (array $body) => internalCall($this, 'PUT', "/api/internal/survivors/{$ana->id}", $body);
    $put(pockets(['inventory' => ['pockets' => [0 => ['id' => 'laser', 'n' => 1]]]]))->assertUnprocessable();
    $put(pockets(['inventory' => ['pockets' => [0 => ['id' => 'r38', 'n' => 25]]]]))->assertUnprocessable();
    $put(pockets(['inventory' => ['pockets' => [0 => ['id' => 'r38', 'n' => 0]]]]))->assertUnprocessable();
    $put(pockets(['inventory' => ['weapons' => [0 => ['id' => 'shotgun', 'loaded' => 3]]]]))->assertUnprocessable();
    $put(pockets(['inventory' => ['weapons' => [1 => ['id' => 'revolver', 'loaded' => 1]]]]))->assertUnprocessable(); // two revolvers
    $put(pockets(['vitals' => ['hp' => 101]]))->assertUnprocessable();
    $put(pockets(['pages' => ['<script>']]))->assertUnprocessable();
    $seven = pockets();
    $seven['inventory']['pockets'] = array_fill(0, 7, null);
    $put($seven)->assertUnprocessable();
    internalCall($this, 'PUT', '/api/internal/survivors/999999', pockets())->assertNotFound();
    expect(Survivor::count())->toBe(0);
});

it('is the world-server\'s only, and goes with the person', function () {
    $ana = User::factory()->create();
    $this->getJson("/api/internal/survivors/{$ana->id}")->assertUnauthorized();
    $this->putJson("/api/internal/survivors/{$ana->id}", pockets())->assertUnauthorized();
    internalCall($this, 'PUT', "/api/internal/survivors/{$ana->id}", pockets())->assertOk();
    $ana->delete();
    expect(Survivor::count())->toBe(0);
});

it('keeps the Grounds\' loot in the world', function () {
    $loot = ['spots' => ['house-w0' => ['until' => 1760000000000]], 'night' => 20381, 'people' => [3], 'spent' => ['r38' => 6, 'shell' => 0],
        'drops' => [['id' => 'd1', 'item' => 'revolver', 'n' => 1, 'loaded' => 6, 'x' => -170, 'y' => -350, 'at' => 1760000000000]]];
    internalCall($this, 'PUT', '/api/internal/world/loot', ['loot' => $loot])->assertOk();
    $back = internalCall($this, 'GET', '/api/internal/world')->assertOk()->json('loot');
    expect($back['spots']['house-w0']['until'])->toBe(1760000000000);
    expect($back['drops'][0]['item'])->toBe('revolver');
    internalCall($this, 'PUT', '/api/internal/world/loot', ['loot' => 'nope'])->assertUnprocessable();
    $this->putJson('/api/internal/world/loot', ['loot' => $loot])->assertUnauthorized();
});

it('keeps the day the lobby\'s locker last gave its kit', function () {
    $ana = User::factory()->create();
    $put = fn (array $body) => internalCall($this, 'PUT', "/api/internal/survivors/{$ana->id}", $body);
    $put(pockets())->assertOk();
    expect(internalCall($this, 'GET', "/api/internal/survivors/{$ana->id}")->json('survivor.kitDay'))->toBeNull();
    $put(pockets(['kitDay' => 20382]))->assertOk();
    expect(internalCall($this, 'GET', "/api/internal/survivors/{$ana->id}")->json('survivor.kitDay'))->toBe(20382);
    $put(pockets(['kitDay' => -1]))->assertUnprocessable();
    $put(pockets(['kitDay' => 'x']))->assertUnprocessable();
    $put(pockets(['kitDay' => null]))->assertOk();
    expect(internalCall($this, 'GET', "/api/internal/survivors/{$ana->id}")->json('survivor.kitDay'))->toBeNull();
});
