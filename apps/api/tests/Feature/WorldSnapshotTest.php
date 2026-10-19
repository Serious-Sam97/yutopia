<?php

use App\Models\Desk;
use App\Models\Spawn;
use App\Models\User;
use App\Models\World;
use App\Models\WorldObject;
use App\Services\WorldSnapshot;
use Illuminate\Database\QueryException;
use Illuminate\Http\Client\Request as Sent;
use Illuminate\Support\Facades\Http;
use Symfony\Component\HttpKernel\Exception\HttpException;

function aWorld(): void
{
    World::current()->update(['name' => 'Studio', 'layout' => ['width' => 16, 'height' => 16, 'theme' => 'snow'], 'settings' => ['playlists' => [['list' => 'PL1']]], 'seeded_at' => now()]);
    WorldObject::create(['uid' => 'desk-1', 'kind' => 'desk', 'x' => 4, 'y' => 5, 'rot' => 1, 'props' => ['ownerId' => 1]]);
    WorldObject::create(['uid' => 'plant-1', 'kind' => 'plant', 'x' => 2, 'y' => 3]);
}

it('keeps the world aside and puts it back exactly', function () {
    $ana = User::factory()->create();
    aWorld();
    Desk::create(['user_id' => $ana->id, 'desk_uid' => 'desk-1']);
    $snap = app(WorldSnapshot::class)->export();
    expect($snap)->toMatchArray(['yutopia' => 'world', 'version' => 1, 'name' => 'Studio', 'seeded' => true])
        ->and($snap['objects'])->toHaveCount(2)
        ->and($snap['desks'])->toBe([['userId' => $ana->id, 'desk' => 'desk-1']]);

    // the world changes…
    WorldObject::query()->delete();
    WorldObject::create(['uid' => 'tv-9', 'kind' => 'tv_hd', 'x' => 1, 'y' => 1]);
    World::current()->update(['layout' => null, 'name' => 'Other']);
    Spawn::create(['user_id' => $ana->id, 'x' => 3.5, 'y' => 3.5]);

    // …and comes back (spawns kept unless asked)
    app(WorldSnapshot::class)->import($snap);
    expect(WorldObject::orderBy('id')->pluck('uid')->all())->toBe(['desk-1', 'plant-1'])
        ->and(WorldObject::where('uid', 'desk-1')->first()->props)->toBe(['ownerId' => 1])
        ->and(World::current()->layout['theme'])->toBe('snow')
        ->and(World::current()->settings['playlists'][0]['list'])->toBe('PL1')
        ->and(World::current()->name)->toBe('Studio')
        ->and(Desk::where('user_id', $ana->id)->value('desk_uid'))->toBe('desk-1')
        ->and(Spawn::count())->toBe(1);
    app(WorldSnapshot::class)->import($snap, clearSpawns: true);
    expect(Spawn::count())->toBe(0);
});

it('round-trips through the command line', function () {
    aWorld();
    $file = tempnam(sys_get_temp_dir(), 'world');
    $this->artisan('yutopia:world', ['action' => 'export', 'file' => $file])->assertSuccessful();
    WorldObject::query()->delete();
    $this->artisan('yutopia:world', ['action' => 'import', 'file' => $file])->assertSuccessful();
    expect(WorldObject::count())->toBe(2);
    $this->artisan('yutopia:world', ['action' => 'import', 'file' => '/nope.json'])->assertFailed();
    unlink($file);
});

it('closes the live room first and opens it again after, even when the import fails', function () {
    config(['yutopia.world_internal' => 'http://world.test']);
    Http::fake(['world.test/*' => Http::response(['ok' => true])]);
    aWorld();
    $snap = app(WorldSnapshot::class)->export();

    expect(app(WorldSnapshot::class)->import($snap)['roomClosed'])->toBeTrue();
    $holds = Http::recorded()->map(fn ($p) => [$p[0]->url(), $p[0]->data()['hold'] ?? null])->all();
    expect($holds)->toBe([['http://world.test/internal/hold', true], ['http://world.test/internal/hold', false]]);
    Http::assertSent(fn (Sent $r) => $r->hasHeader('X-Yutopia-Signature'));

    // a broken snapshot: refused before anything is held
    expect(fn () => app(WorldSnapshot::class)->import(['yutopia' => 'nope']))->toThrow(HttpException::class);
    Http::assertSentCount(2);

    // a failing write still lets the room open again
    $bad = $snap;
    $bad['objects'][] = ['id' => 'desk-1', 'kind' => 'desk', 'x' => 0, 'y' => 0]; // a duplicate uid
    expect(fn () => app(WorldSnapshot::class)->import($bad))->toThrow(QueryException::class);
    expect(Http::recorded()->last()[0]->data())->toBe(['hold' => false])
        ->and(WorldObject::count())->toBe(2); // rolled back
});

it('refuses to replace the world when the world-server can\'t close it', function () {
    config(['yutopia.world_internal' => 'http://world.test']);
    Http::fake(['world.test/*' => Http::response('down', 503)]);
    aWorld();

    expect(fn () => app(WorldSnapshot::class)->import(app(WorldSnapshot::class)->export()))
        ->toThrow(HttpException::class);
    expect(WorldObject::count())->toBe(2);
});

it('lets the e2e suite put a fixture back: only when enabled, only admins', function () {
    aWorld();
    $snap = app(WorldSnapshot::class)->export();
    $snap['objects'] = [['id' => 'only-1', 'kind' => 'plant', 'x' => 1, 'y' => 1]];
    $admin = User::factory()->create(['is_admin' => true]);
    Spawn::create(['user_id' => $admin->id, 'x' => 3.5, 'y' => 3.5]);

    $this->actingAs($admin)->postJson('/api/e2e/world', $snap)->assertNotFound();
    config(['yutopia.e2e' => true]);
    $this->actingAs(User::factory()->create())->postJson('/api/e2e/world', $snap)->assertForbidden();
    $this->actingAs($admin)->postJson('/api/e2e/world', $snap)->assertOk()->assertJsonPath('objects', 1);
    expect(WorldObject::pluck('uid')->all())->toBe(['only-1'])
        ->and(Spawn::count())->toBe(0); // everyone arrives at the world's point again
});
