<?php

use App\Models\PerfReport;
use App\Models\User;
use Illuminate\Support\Facades\Artisan;

// How the game runs for each player (docs/plan/39-the-telemetry.md).

function perfRow(int $userId, array $over = []): array
{
    return array_merge([
        'user_id' => $userId,
        'at' => now()->getTimestampMs(),
        'session' => 's-1',
        'version' => '0.1.117',
        'secs' => 30,
        'view' => '3p',
        'quality' => 'high',
        'level' => 4,
        'area' => 'tracking',
        'x' => 17.5,
        'y' => 14.5,
        'fps' => 44.2,
        'frame_med' => 19.1,
        'frame_p95' => 24.6,
        'frame_worst' => 58.0,
        'gap_p95' => 35.0,
        'over33' => 40,
        'over50' => 2,
        'long_tasks' => 0,
        'draws' => 1300,
        'ping_med' => 31,
        'ping_p95' => 60,
        'snaps' => 0,
        'browser' => 'Firefox 145',
        'gpu' => 'Apple M4 Pro',
        'stages' => ['tp.frame' => 17.0, 'logic' => 1.0],
        'machine' => ['os' => 'macOS', 'dpr' => 2, 'cores' => 14],
        'context' => ['hour' => 18.1, 'near' => 0],
    ], $over);
}

it('keeps the world-server\'s batch of reports, known players only, checked', function () {
    $ana = User::factory()->create();
    $post = fn (array $reports) => internalCall($this, 'POST', '/api/internal/perf-reports', ['reports' => $reports]);

    $post([perfRow($ana->id), perfRow($ana->id, ['fps' => 25, 'area' => 'lounge']), perfRow(999999)])
        ->assertOk()->assertJson(['saved' => 2]);
    expect(PerfReport::count())->toBe(2);
    $row = PerfReport::where('area', 'tracking')->first();
    expect($row->version)->toBe('0.1.117');
    expect($row->gpu)->toBe('Apple M4 Pro')
        ->and($row->stages)->toEqual(['tp.frame' => 17.0, 'logic' => 1.0])
        ->and($row->machine['cores'])->toBe(14)
        ->and($row->draws)->toBe(1300);

    $old = perfRow($ana->id);
    unset($old['version']);
    $post([$old])->assertOk()->assertJson(['saved' => 1]);
    expect(PerfReport::where('version', '')->count())->toBe(1);

    // out of range, or too many at once: refused
    $post([perfRow($ana->id, ['fps' => 5000])])->assertStatus(422);
    $post([perfRow($ana->id, ['stages' => ['tp.frame' => 'lots']])])->assertStatus(422);
    $post(array_fill(0, 501, perfRow($ana->id)))->assertStatus(422);
    // not the world-server: refused
    $this->postJson('/api/internal/perf-reports', ['reports' => [perfRow($ana->id)]])->assertStatus(401);
});

it('shows the admins who lags, where, and on what', function () {
    $admin = User::factory()->create(['is_admin' => true, 'name' => 'Sam']);
    $member = User::factory()->create(['name' => 'Ana']);
    $bia = User::factory()->create(['name' => 'Bia']);
    internalCall($this, 'POST', '/api/internal/perf-reports', ['reports' => [
        perfRow($member->id, ['fps' => 40]),
        perfRow($member->id, ['fps' => 20, 'area' => 'lounge', 'session' => 's-2']),
        perfRow($member->id, ['fps' => 22, 'area' => 'lounge', 'session' => 's-2']),
        perfRow($bia->id, ['fps' => 60, 'browser' => 'Chrome 140', 'gpu' => 'Intel UHD 620', 'version' => '0.1.118', 'at' => now()->addMinute()->getTimestampMs()]),
        perfRow($bia->id, ['fps' => 58, 'at' => now()->subDays(10)->getTimestampMs()]),
    ]])->assertOk();

    $this->actingAs($member)->getJson('/api/admin/perf/summary')->assertForbidden();

    $players = $this->actingAs($admin)->getJson('/api/admin/perf/summary?days=7')->assertOk()->json('players');
    expect($players)->toHaveCount(2)
        // slowest first
        ->and($players[0]['name'])->toBe('Ana')
        ->and($players[0]['windows'])->toBe(3)
        ->and($players[0]['sessions'])->toBe(2)
        ->and($players[0]['slowShare'])->toEqual(0.667)
        ->and($players[0]['worstArea'])->toEqual(['level' => 4, 'area' => 'lounge', 'fps' => 21.0])
        ->and($players[1]['gpu'])->toBe('Intel UHD 620')
        // the old window is past 7 days
        ->and($players[1]['windows'])->toBe(1);
    expect($this->actingAs($admin)->getJson('/api/admin/perf/summary?days=30')->json('players.1.windows'))->toBe(2);

    // by version, the newest first
    $versions = $this->actingAs($admin)->getJson('/api/admin/perf/summary')->json('versions');
    expect(collect($versions)->pluck('version')->all())->toBe(['0.1.118', '0.1.117'])
        ->and($versions[0]['players'])->toBe(1)
        ->and($versions[1]['windows'])->toBe(3)
        ->and($players[1]['version'])->toBe('0.1.118');

    $one = $this->actingAs($admin)->getJson("/api/admin/perf/player/{$member->id}")->assertOk()->json();
    expect($one['series'])->toHaveCount(3)
        ->and($one['series'][0]['version'])->toBe('0.1.117')
        ->and($one['areas'][0]['area'])->toBe('lounge')
        ->and($one['stages'])->toEqual(['tp.frame' => 17.0, 'logic' => 1.0])
        ->and($one['machines'])->toHaveCount(1);

    $spots = $this->actingAs($admin)->getJson('/api/admin/perf/spots')->assertOk()->json('spots');
    expect($spots[0]['area'])->toBe('lounge')
        ->and($spots[0]['players'])->toBe(1)
        ->and(collect($spots)->firstWhere('area', 'tracking')['players'])->toBe(2);
});

it('drops reports older than 30 days', function () {
    $ana = User::factory()->create();
    internalCall($this, 'POST', '/api/internal/perf-reports', ['reports' => [
        perfRow($ana->id),
        perfRow($ana->id, ['at' => now()->subDays(31)->getTimestampMs()]),
    ]])->assertOk();
    Artisan::call('yutopia:prune-perf');
    expect(PerfReport::count())->toBe(1);
});
