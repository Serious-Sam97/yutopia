<?php

use App\Models\User;
use App\Services\Vortex;

// His lines in the fight (docs/plan/88-vortex-fight.md phase 2): shot, a side-step and each move in act II have
// their own pools, public (never naming anyone); HR's is personal — only to the one he sends to reception, by name.

test('the fight has its own lines, public, by event', function () {
    $v = app(Vortex::class);
    foreach (['hit', 'dodge', 'whip', 'rew', 'pause', 'steal', 'blast', 'dark', 'clones', 'shades', 'possess', 'glitch', 'down'] as $event) {
        expect(Vortex::EVENTS)->toContain($event);
        $r = $v->line($event);
        expect($r['line'])->toBeString()->not->toBeEmpty();
        expect($r['personal'])->toBeFalse();
        expect($r['mood'])->toBeIn(['judging', 'malicious', 'possessed', 'smug']);
    }
});

test('HR is personal: only them, by their first name', function () {
    $bia = User::factory()->create(['name' => 'Bia Demo']);
    $r = app(Vortex::class)->line('hr', $bia->id);
    expect($r['personal'])->toBeTrue();
    expect($r['line'])->toContain('bia');
    expect($r['mood'])->toBe('judging');
});

test('the grudge: personal, how many and with what; his chair', function () {
    $bia = User::factory()->create(['name' => 'Bia Demo']);
    $v = app(Vortex::class);
    $seen = [];
    for ($i = 0; $i < 30; $i++) {
        // (his glitch can land anywhere in it)
        $seen[] = str_replace('*kkzzt* ', '', $v->line('grudge', $bia->id, ['n' => 14, 'gun' => 'revolver'])['line']);
    }
    expect(collect($seen)->every(fn ($l) => str_contains($l, 'fourteen times') || str_contains($l, 'the .38')))->toBeTrue();
    $once = collect(range(1, 30))->map(fn () => str_replace('*kkzzt* ', '', $v->line('grudge', $bia->id, ['n' => 1, 'gun' => 'revolver'])['line']));
    expect($once->every(fn ($l) => ! str_contains($l, 'one times')))->toBeTrue();
    $r = $v->line('chair', $bia->id);
    expect($r['personal'])->toBeTrue();
    expect($r['line'])->toContain('bia');
});

test('his memory kept with the world', function () {
    $mem = ['scars' => 2, 'scarredUntil' => 123, 'grudges' => [['uid' => 4, 'name' => 'Bia', 'hits' => 14, 'gun' => 'revolver', 'until' => 456]]];
    internalCall($this, 'PUT', '/api/internal/world/vortex', ['vortex' => $mem])->assertOk();
    expect(internalCall($this, 'GET', '/api/internal/world')->assertOk()->json('vortex'))->toEqual($mem);
});
