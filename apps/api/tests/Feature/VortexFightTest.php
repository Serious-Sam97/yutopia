<?php

use App\Models\User;
use App\Services\Vortex;

// His lines in the fight (docs/plan/88-vortex-fight.md phase 2): shot, a side-step and each move in act II have
// their own pools, public (never naming anyone); HR's is personal — only to the one he sends to reception, by name.

test('the fight has its own lines, public, by event', function () {
    $v = app(Vortex::class);
    foreach (['hit', 'dodge', 'whip', 'rew', 'pause', 'steal', 'blast', 'dark', 'clones', 'shades', 'possess', 'glitch'] as $event) {
        expect(Vortex::EVENTS)->toContain($event);
        $r = $v->line($event);
        expect($r['line'])->toBeString()->not->toBeEmpty();
        expect($r['personal'])->toBeFalse();
        expect($r['mood'])->toBeIn(['judging', 'malicious', 'possessed']);
    }
});

test('HR is personal: only them, by their first name', function () {
    $bia = User::factory()->create(['name' => 'Bia Demo']);
    $r = app(Vortex::class)->line('hr', $bia->id);
    expect($r['personal'])->toBeTrue();
    expect($r['line'])->toContain('bia');
    expect($r['mood'])->toBe('judging');
});
