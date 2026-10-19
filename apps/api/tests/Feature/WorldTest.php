<?php

use App\Models\Desk;
use App\Models\Game;
use App\Models\Spawn;
use App\Models\User;
use App\Models\World;
use App\Models\WorldObject;
use App\Services\Presence;
use App\Services\Tokens;
use App\Services\Vortex;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

it('saves and validates avatars', function () {
    $ana = User::factory()->create();
    $layers = ['body' => 'regular', 'skin' => '#aa8866', 'hair' => 'curly', 'hairColor' => '#111111', 'top' => 'hoodie', 'topColor' => '#556b2f',
        'bottom' => 'skirt', 'bottomColor' => '#222222', 'accessory' => 'headphones', 'accessoryColor' => '#e8a33d'];

    $this->actingAs($ana)->putJson('/api/avatar', ['skin' => 'red'] + $layers)->assertUnprocessable();
    $this->actingAs($ana)->putJson('/api/avatar', $layers)->assertOk()->assertJsonPath('avatar.hair', 'curly');
    $this->actingAs($ana)->getJson('/api/avatar')->assertJsonPath('avatar.accessory', 'headphones')
        ->assertJsonPath('avatar.style', 'ligne')->assertJsonPath('avatar.gender', 'neutral');
    $this->actingAs($ana)->putJson('/api/avatar', ['gender' => 'other'] + $layers)->assertUnprocessable();
    $this->actingAs($ana)->putJson('/api/avatar', ['gender' => 'feminine'] + $layers)->assertOk()->assertJsonPath('avatar.gender', 'feminine');
    $this->actingAs($ana)->putJson('/api/avatar', ['style' => 'pixel'] + $layers)->assertUnprocessable();
    // City-pop is gone: an old editor still sending it saves Ligne claire
    $this->actingAs($ana)->putJson('/api/avatar', ['style' => 'citypop'] + $layers)->assertOk()->assertJsonPath('avatar.style', 'ligne');
    // glasses, one more thing and shoes: optional slots, defaulted when missing
    $this->actingAs($ana)->getJson('/api/avatar')->assertJsonPath('avatar.shoes', 'sneakers')->assertJsonPath('avatar.eyewear', 'none');
    $more = ['eyewear' => 'sunglasses', 'eyewearColor' => '#2a2420', 'extra' => 'scarf', 'extraColor' => '#b5562f', 'shoes' => 'boots', 'shoesColor' => '#5b3a26'];
    $this->actingAs($ana)->putJson('/api/avatar', $more + $layers)->assertOk()
        ->assertJsonPath('avatar.extra', 'scarf')->assertJsonPath('avatar.shoes', 'boots')->assertJsonPath('avatar.eyewear', 'sunglasses');
    $this->actingAs($ana)->putJson('/api/avatar', ['shoesColor' => 'brown'] + $more + $layers)->assertUnprocessable();
    $this->actingAs($ana)->putJson('/api/avatar', ['beard' => 'goatee', 'hair' => 'crew'] + $more + $layers)->assertOk()
        ->assertJsonPath('avatar.beard', 'goatee')->assertJsonPath('avatar.hair', 'crew');
    $this->actingAs($ana)->putJson('/api/avatar', ['beard' => '<b>'] + $more + $layers)->assertUnprocessable();
    // the world token carries the look
    expect(Tokens::decode($this->actingAs($ana)->postJson('/api/session')->json('worldToken'), config('yutopia.world_secret'))['avatar']['beard'])->toBe('goatee');
});

it('rejects unsigned internal calls', function () {
    $this->getJson('/api/internal/world')->assertUnauthorized();
    $this->withHeaders(['X-Yutopia-Timestamp' => time(), 'X-Yutopia-Signature' => 'nope'])->getJson('/api/internal/world')->assertUnauthorized();
});

it('hands the world-server the one world, created on first ask', function () {
    $res = internalCall($this, 'GET', '/api/internal/world')->assertOk();

    expect($res->json())->toMatchArray(['name' => config('yutopia.world_name'), 'mapKey' => 'studio', 'seeded' => false, 'layout' => null, 'playlists' => [], 'objects' => []])
        ->and(World::count())->toBe(1);
    internalCall($this, 'GET', '/api/internal/world');
    expect(World::count())->toBe(1);
});

it('furnishes the world once', function () {
    $objects = [
        ['id' => 'wall-a', 'kind' => 'board_wall', 'x' => 3, 'y' => 1],
        ['id' => 'desk-1', 'kind' => 'desk', 'x' => 4, 'y' => 5, 'rot' => 1, 'props' => ['label' => 'A']],
    ];

    $res = internalCall($this, 'POST', '/api/internal/world/seed', ['objects' => $objects])->assertOk();
    expect(collect($res->json('objects'))->pluck('refId', 'id')->all())->toBe(['wall-a' => null, 'desk-1' => null]);

    // seeding again doesn't duplicate or move anything
    internalCall($this, 'POST', '/api/internal/world/seed', ['objects' => [['id' => 'desk-1', 'kind' => 'desk', 'x' => 9, 'y' => 9]]])->assertOk();
    $show = internalCall($this, 'GET', '/api/internal/world')->assertOk();
    expect($show->json('seeded'))->toBeTrue()
        ->and($show->json('objects'))->toHaveCount(2)
        ->and(collect($show->json('objects'))->firstWhere('id', 'desk-1')['x'])->toBe(4);
});

it('keeps a TV\'s and a radio\'s media with their objects', function () {
    $media = ['item' => ['src' => 'yt', 'ref' => 'M7lc1UVf-VE', 'title' => 'A song', 'dur' => 212], 'at' => 1791915000000, 'paused' => false, 'pos' => 0, 'loop' => true, 'queue' => [], 'by' => 'Ana', 'lock' => false];

    internalCall($this, 'PUT', '/api/internal/objects', ['id' => 'tv-1', 'kind' => 'tv_hd', 'x' => 4, 'y' => 1, 'props' => ['media' => $media]])
        ->assertOk()->assertJsonPath('object.props.media.item.title', 'A song');
    internalCall($this, 'PUT', '/api/internal/objects', ['id' => 'radio-1', 'kind' => 'radio', 'x' => 6, 'y' => 3, 'props' => ['radio' => ['source' => 'yt', 'playing' => true, 'media' => $media]]])
        ->assertOk()->assertJsonPath('object.props.radio.media.item.ref', 'M7lc1UVf-VE');
});

it('keeps the playlists played in the world', function () {
    $list = ['list' => 'PLfirst00001', 'title' => 'Lo-fi beats', 'channel' => 'Chill', 'items' => [['src' => 'yt', 'ref' => 'M7lc1UVf-VE', 'title' => 'A song', 'dur' => 212]], 'by' => 'Ana', 'usedAt' => 1791915000000, 'uses' => 1];

    internalCall($this, 'PUT', '/api/internal/world/playlists', ['playlists' => [$list]])->assertOk();
    $show = internalCall($this, 'GET', '/api/internal/world')->assertOk();
    expect($show->json('playlists.0.title'))->toBe('Lo-fi beats')->and($show->json('playlists.0.items.0.ref'))->toBe('M7lc1UVf-VE');
    internalCall($this, 'PUT', '/api/internal/world/playlists', ['playlists' => 'nope'])->assertUnprocessable();
    internalCall($this, 'PUT', '/api/internal/world/playlists', ['playlists' => []])->assertOk();
    expect(internalCall($this, 'GET', '/api/internal/world')->json('playlists'))->toBe([]);
});

it('moves and deletes objects from build mode', function () {
    internalCall($this, 'PUT', '/api/internal/objects', ['id' => 'plant-1', 'kind' => 'plant', 'x' => 2, 'y' => 3])->assertOk();
    internalCall($this, 'PUT', '/api/internal/objects', ['id' => 'plant-1', 'kind' => 'plant', 'x' => 5, 'y' => 3, 'rot' => 2])
        ->assertJsonPath('object.x', 5)->assertJsonPath('object.rot', 2);
    internalCall($this, 'DELETE', '/api/internal/objects/plant-1')->assertOk();

    expect(WorldObject::count())->toBe(0);
});

it('assigns each person a stable free desk, and looks one up without handing it out', function () {
    $ana = User::factory()->create();
    $bia = User::factory()->create();
    $cai = User::factory()->create();
    $desks = ['desk-1', 'desk-2'];

    $a = internalCall($this, 'POST', '/api/internal/desk', ['user_id' => $ana->id, 'desks' => $desks])->json('desk');
    $b = internalCall($this, 'POST', '/api/internal/desk', ['user_id' => $bia->id, 'desks' => $desks])->json('desk');
    $again = internalCall($this, 'POST', '/api/internal/desk', ['user_id' => $ana->id, 'desks' => $desks])->json('desk');
    expect([$a, $b, $again])->toBe(['desk-1', 'desk-2', 'desk-1']);

    expect(internalCall($this, 'POST', '/api/internal/desk', ['user_id' => $ana->id, 'desks' => $desks, 'assign' => false])->json('desk'))->toBe('desk-1')
        ->and(internalCall($this, 'POST', '/api/internal/desk', ['user_id' => $cai->id, 'desks' => $desks, 'assign' => false])->json('desk'))->toBeNull()
        ->and(Desk::where('user_id', $cai->id)->exists())->toBeFalse();
});

it('keeps each person\'s own arrival point, and forgets it on reset', function () {
    $ana = User::factory()->create();
    $bia = User::factory()->create();
    $url = fn (User $u) => "/api/internal/spawn/{$u->id}";

    expect(internalCall($this, 'GET', $url($ana))->assertOk()->json('spawn'))->toBeNull();
    internalCall($this, 'PUT', $url($ana), ['spawn' => ['x' => 12.5, 'y' => 7.5]])->assertOk();
    // on a floor of the building
    internalCall($this, 'PUT', $url($ana), ['spawn' => ['x' => 70.5, 'y' => 30.5, 'level' => 0]])->assertOk();
    expect(internalCall($this, 'GET', $url($ana))->json('spawn'))->toEqual(['x' => 70.5, 'y' => 30.5, 'level' => 0]);
    internalCall($this, 'PUT', $url($ana), ['spawn' => ['x' => 14.5, 'y' => 8.5]])->assertOk();

    expect(internalCall($this, 'GET', $url($ana))->json('spawn'))->toEqual(['x' => 14.5, 'y' => 8.5, 'level' => null])
        ->and(internalCall($this, 'GET', $url($bia))->json('spawn'))->toBeNull()
        ->and(Spawn::count())->toBe(1);

    internalCall($this, 'PUT', $url($ana), ['spawn' => ['x' => 500, 'y' => 1]])->assertStatus(422);
    internalCall($this, 'PUT', $url($ana), ['spawn' => null])->assertOk();
    expect(internalCall($this, 'GET', $url($ana))->json('spawn'))->toBeNull();
});

it('keeps who is in the world for the phone', function () {
    $ana = User::factory()->create(['name' => 'Ana']);
    $people = ['people' => [['user_id' => $ana->id, 'name' => 'Ana', 'area' => 'war-room', 'area_name' => 'War Room', 'status' => 'nope']]];

    internalCall($this, 'POST', '/api/internal/presence', $people)->assertOk()
        ->assertJsonPath('people.0.areaName', 'War Room')->assertJsonPath('people.0.status', 'online');
    expect(app(Presence::class)->byUser())->toBe([$ana->id => ['area' => 'War Room', 'status' => 'online']]);
});

it('gives Vortex public lines that name nobody and personal lines by first name', function () {
    $ana = User::factory()->create(['name' => 'Ana Lima']);

    for ($i = 0; $i < 20; $i++) {
        $res = internalCall($this, 'POST', '/api/internal/vortex', ['event' => 'ambient'])->assertOk();
        expect($res->json('personal'))->toBeFalse()
            ->and($res->json('line'))->toBe(mb_strtolower($res->json('line')))
            ->and($res->json('line'))->not->toContain('Ana');
    }
    // personal lines: in his lowercase too, your name included
    for ($i = 0; $i < 20; $i++) {
        $res = internalCall($this, 'POST', '/api/internal/vortex', ['event' => 'poke', 'user_id' => $ana->id])->assertOk();
        expect($res->json('personal'))->toBeTrue()->and($res->json('line'))->toBe(mb_strtolower($res->json('line')));
    }

    // VortexOS booting near him: public (this used to be refused by the old endpoint)
    internalCall($this, 'POST', '/api/internal/vortex', ['event' => 'vortexos', 'user_id' => $ana->id])->assertOk()->assertJsonPath('personal', false);
    // nobody: no line; an unknown event: refused
    internalCall($this, 'POST', '/api/internal/vortex', ['event' => 'poke', 'user_id' => 999999])->assertOk()->assertJsonPath('line', null);
    internalCall($this, 'POST', '/api/internal/vortex', ['event' => 'dance'])->assertUnprocessable();
});

it('keeps Vortex clean when asked to', function () {
    config(['yutopia.polite' => true]);
    $ana = User::factory()->create(['name' => 'Ana']);
    for ($i = 0; $i < 40; $i++) {
        expect(app(Vortex::class)->line('poke', $ana->id)['line'])->not->toContain('hell')->not->toContain('damn');
    }
});

it('stores a validated map layout and lists who can own rooms', function () {
    $ana = User::factory()->create(['name' => 'Ana']);
    $bia = User::factory()->create(['name' => 'Bia']);
    $row = str_repeat('.', 16);
    $layout = [
        'width' => 16, 'height' => 16,
        'tiles' => array_fill(0, 16, $row),
        'spawn' => ['x' => 8.5, 'y' => 8.5],
        'areas' => [['key' => 'room-ana', 'name' => "Ana's office", 'kind' => 'private', 'x' => 1, 'y' => 1, 'w' => 4, 'h' => 4, 'ownerId' => $ana->id, 'ownerName' => 'Ana']],
    ];
    $put = fn (array $l) => internalCall($this, 'PUT', '/api/internal/world/layout', $l);

    $put($layout)->assertOk();
    expect(World::current()->layout['areas'][0]['ownerId'])->toBe($ana->id);
    internalCall($this, 'GET', '/api/internal/world')->assertJsonPath('layout.width', 16);

    // bad shapes are refused
    $put(['width' => 200] + $layout)->assertUnprocessable();
    $put(['tiles' => array_fill(0, 16, str_repeat('Z', 16))] + $layout)->assertUnprocessable();
    $put(['tiles' => array_fill(0, 15, $row)] + $layout)->assertStatus(422);
    $this->putJson('/api/internal/world/layout', $layout)->assertUnauthorized();

    // map v2: walls on tile edges
    $v2 = ['version' => 2, 'hWalls' => array_fill(0, 17, str_repeat('p', 16)), 'vWalls' => array_fill(0, 16, 'p'.str_repeat('.', 15).'W')] + $layout;
    $put($v2)->assertOk();
    expect(World::current()->layout['hWalls'])->toHaveCount(17);
    $put(['hWalls' => array_fill(0, 16, str_repeat('p', 16))] + $v2)->assertStatus(422);
    $put(['vWalls' => array_fill(0, 16, str_repeat('Z', 17))] + $v2)->assertUnprocessable();
    $put(['tiles' => array_fill(0, 16, '#'.str_repeat('.', 15))] + $v2)->assertStatus(422);
    // two-faced walls: the other face's material where it differs, kept
    $faces = ['hBacks' => array_fill(0, 17, 'b'.str_repeat('.', 15)), 'vBacks' => array_fill(0, 16, str_repeat('.', 16).'k')] + $v2;
    $put($faces)->assertOk();
    expect(World::current()->layout['vBacks'][3])->toBe(str_repeat('.', 16).'k');
    $put(['hBacks' => array_fill(0, 17, 'g'.str_repeat('.', 15))] + $faces)->assertUnprocessable();
    $put(['vBacks' => array_fill(0, 16, '.')] + $faces)->assertStatus(422);
    // themes are gone: an old client's theme is dropped, not stored
    $put(['theme' => 'snow'] + $v2)->assertOk();
    expect(World::current()->layout)->not->toHaveKey('theme');

    // the building: the map is one floor, its others ride along (docs/plan/25)
    $level = fn (int $i, int $w = 20) => [
        'index' => $i, 'name' => "Floor {$i}", 'ox' => -2, 'oy' => 0, 'width' => $w, 'height' => 16,
        'tiles' => array_fill(0, 16, str_repeat('a', 4).str_repeat('_', $w - 4)),
        'hWalls' => array_fill(0, 17, str_repeat('.', $w)), 'vWalls' => array_fill(0, 16, str_repeat('.', $w + 1)),
        'areas' => [['key' => "floor-{$i}", 'name' => "Floor {$i}", 'kind' => 'open', 'x' => 0, 'y' => 0, 'w' => $w, 'h' => 16]],
    ];
    $put(['floor' => 4, 'levels' => [$level(0, 120), $level(1)]] + $v2)->assertOk();
    expect(World::current()->layout['levels'])->toHaveCount(2)
        ->and(World::current()->layout['levels'][0]['width'])->toBe(120)
        ->and(World::current()->layout['levels'][1]['areas'][0]['key'])->toBe('floor-1')
        ->and(World::current()->layout['floor'])->toBe(4);
    $put(['floor' => 4, 'levels' => [$level(1), $level(1)]] + $v2)->assertUnprocessable(); // one number, twice
    $put(['floor' => 1, 'levels' => [$level(1)]] + $v2)->assertStatus(422); // the map's own floor
    $bad = $level(2);
    $bad['tiles'][3] = 'x';
    $put(['floor' => 4, 'levels' => [$bad]] + $v2)->assertStatus(422);

    // the empty space a resize adds (rows ending in void, all-void rows) is kept as sent
    $tiles = array_merge(array_fill(0, 12, str_repeat('.', 12).'    '), array_fill(0, 4, str_repeat(' ', 16)));
    $put(['tiles' => $tiles, 'hWalls' => array_fill(0, 17, str_repeat('.', 16)), 'vWalls' => array_fill(0, 16, str_repeat('.', 17))] + $layout + ['version' => 2])->assertOk();
    expect(World::current()->layout['tiles'])->toBe($tiles);

    $this->actingAs($bia)->getJson('/api/members')
        ->assertOk()->assertJsonPath('members.0.name', 'Ana')->assertJsonPath('members.1.name', 'Bia');
});

it('keeps my build setups: save, list, delete — mine only, checked', function () {
    $ana = User::factory()->create();
    $bea = User::factory()->create();
    $desk = ['name' => 'My desk', 'items' => [
        ['kind' => 'desk', 'dx' => 0, 'dy' => 0, 'rot' => 0, 'props' => ['variant' => 2]],
        ['kind' => 'tabletop', 'dx' => 0, 'dy' => 0, 'rot' => 0, 'props' => ['d' => 'monitor', 'c' => [1, 1]]],
        ['kind' => 'chair', 'dx' => 0, 'dy' => 1, 'rot' => 2],
    ]];
    $id = $this->actingAs($ana)->postJson('/api/setups', $desk)->assertCreated()->assertJsonPath('setup.name', 'My desk')->json('setup.id');
    $this->actingAs($ana)->getJson('/api/setups')->assertOk()
        ->assertJsonCount(1, 'setups')->assertJsonPath('setups.0.items.1.props.d', 'monitor')->assertJsonPath('setups.0.items.2.props', null);
    $this->actingAs($bea)->getJson('/api/setups')->assertJsonCount(0, 'setups');
    $this->actingAs($bea)->deleteJson("/api/setups/{$id}")->assertNotFound();
    $this->actingAs($ana)->postJson('/api/setups', ['name' => 'x', 'items' => []])->assertUnprocessable();
    $this->actingAs($ana)->postJson('/api/setups', ['name' => 'x', 'items' => [['kind' => 'desk', 'dx' => -1, 'dy' => 0, 'rot' => 0]]])->assertUnprocessable();
    $this->actingAs($ana)->postJson('/api/setups', ['name' => 'x', 'items' => [['kind' => 'desk', 'dx' => 0, 'dy' => 0, 'rot' => 4]]])->assertUnprocessable();
    $this->actingAs($ana)->postJson('/api/setups', ['name' => 'x', 'items' => [['kind' => '<b>', 'dx' => 0, 'dy' => 0, 'rot' => 0]]])->assertUnprocessable();
    $this->actingAs($ana)->deleteJson("/api/setups/{$id}")->assertOk();
    $this->actingAs($ana)->getJson('/api/setups')->assertJsonCount(0, 'setups');
});

it('keeps the world\'s cartridges: upload, list, play, take away — checked', function () {
    Storage::fake('local');
    $bia = User::factory()->create();
    $cai = User::factory()->create();
    $admin = User::factory()->create(['is_admin' => true]);
    $rom = fn (string $name, int $kb) => UploadedFile::fake()->createWithContent($name, str_repeat("\x4e", $kb * 1024));

    $res = $this->actingAs($bia)->post('/api/games', ['file' => $rom('pong.nes', 24), 'system' => 'nes', 'title' => 'Pong', 'color' => '#C4402B', 'players' => 2])->assertCreated();
    $id = (int) substr($res->json('game.id'), 2);
    expect($res->json('game'))->toMatchArray(['system' => 'nes', 'title' => 'Pong', 'color' => '#c4402b', 'players' => 2, 'builtIn' => false, 'mine' => true]);
    Storage::disk('local')->assertExists('games/'.$res->json('game.sha1').'.nes');

    // wrong console, too big, the same one twice, signed out
    $this->actingAs($bia)->post('/api/games', ['file' => $rom('pong.sfc', 24), 'system' => 'nes', 'title' => 'X', 'color' => '#000000'])->assertStatus(422);
    $this->actingAs($bia)->post('/api/games', ['file' => $rom('big.a26', 65), 'system' => '2600', 'title' => 'X', 'color' => '#000000'])->assertStatus(422);
    $this->actingAs($bia)->post('/api/games', ['file' => $rom('again.nes', 24), 'system' => 'nes', 'title' => 'Again', 'color' => '#000000'])->assertStatus(422);
    app('auth')->forgetGuards();
    $this->getJson('/api/games')->assertUnauthorized();

    // everyone sees it and can play it
    expect($this->actingAs($cai)->getJson('/api/games')->json('games.0'))->toMatchArray(['id' => "u:{$id}", 'mine' => false]);
    $this->actingAs($cai)->get("/api/games/{$id}/rom")->assertOk();
    internalCall($this, 'GET', "/api/internal/games/{$id}")->assertOk()->assertJsonPath('game.title', 'Pong');

    // someone who didn't bring it can't take it away; an admin can
    $this->actingAs($cai)->deleteJson("/api/games/{$id}")->assertForbidden();
    $this->actingAs($admin)->deleteJson("/api/games/{$id}")->assertOk();
    expect(Game::count())->toBe(0);
});

it('keeps where a game left off: a save state and a battery save', function () {
    Storage::fake('local');
    $ana = User::factory()->create();
    $blob = fn (string $name, string $data) => UploadedFile::fake()->createWithContent($name, $data);

    expect($this->actingAs($ana)->getJson('/api/saves/b:ucity')->json())->toMatchArray(['state' => false, 'sram' => false]);
    $this->actingAs($ana)->post('/api/saves/b:ucity', ['state' => $blob('state.bin', 'STATE-1')])->assertOk();
    $this->actingAs($ana)->post('/api/saves/b:ucity', ['sram' => $blob('sram.bin', 'SRAM')])->assertOk();
    expect($this->actingAs($ana)->getJson('/api/saves/b:ucity')->json())->toMatchArray(['state' => true, 'sram' => true]);
    expect($this->actingAs($ana)->get('/api/saves/b:ucity/state')->streamedContent())->toBe('STATE-1');
    expect($this->actingAs($ana)->get('/api/saves/b:ucity/sram')->streamedContent())->toBe('SRAM');
    Storage::disk('local')->assertExists('saves/b-ucity/state.bin');
    // odd keys and unknown uploads aren't save buckets
    $this->actingAs($ana)->getJson('/api/saves/..%2Fetc')->assertNotFound();
    $this->actingAs($ana)->post('/api/saves/u:999', ['state' => $blob('state.bin', 'X')])->assertNotFound();
    $this->actingAs($ana)->post('/api/saves/b:ucity', [])->assertStatus(422);
});

it('keeps someone\'s pets for the world-server: create, read, update, delete, at most three', function () {
    $ana = User::factory()->create();
    $url = "/api/internal/pets/{$ana->id}";
    expect(internalCall($this, 'GET', $url)->assertOk()->json('pets'))->toBe([]);
    $rec = fn (string $name) => [
        'species' => 'platypus', 'name' => $name, 'look' => ['color' => '#5b3a26', 'mark' => 'socks', 'markColor' => '#efe4cc'],
        'outfit' => ['hat' => 'none', 'hatColor' => '#c4402b', 'collar' => 'none', 'collarColor' => '#c4402b', 'coat' => 'none', 'coatColor' => '#6e7b3a'],
        'needs' => ['food' => 100, 'water' => 100, 'energy' => 100, 'fun' => 100, 'health' => 100],
        'xp' => 0, 'tricks' => [], 'alive' => true, 'wins' => 0, 'losses' => 0, 'bornAt' => 1760000000000, 'diedAt' => null, 'seenAt' => 1760000000000,
    ];
    $created = internalCall($this, 'POST', $url, $rec('Perry'))->assertCreated()->json('pet');
    expect($created['name'])->toBe('Perry')->and($created['seenAt'])->toBe(1760000000000)->and($created['tricks'])->toBe([])
        ->and($created['traits'])->toBeNull()->and($created['bonds'])->toBe([]);
    internalCall($this, 'PUT', "$url/{$created['id']}", ['xp' => 120, 'tricks' => ['sit' => 100], 'needs' => ['food' => 40, 'water' => 50, 'energy' => 60, 'fun' => 70, 'health' => 90], 'seenAt' => 1760000100000,
        'traits' => ['energy' => 0.7, 'independence' => 0.2, 'courage' => 0.5, 'greed' => 0.6, 'curiosity' => 0.5, 'affection' => 0.8, 'obedience' => 0.9],
        'memory' => ['toys' => ['ball' => 3], 'spots' => [], 'bowls' => [], 'grudge' => []], 'bonds' => [(string) $ana->id => 42.5]])->assertOk();
    $pets = internalCall($this, 'GET', $url)->json('pets');
    expect($pets)->toHaveCount(1)->and($pets[0]['xp'])->toBe(120)->and($pets[0]['tricks'])->toBe(['sit' => 100])->and($pets[0]['needs']['food'])->toBe(40)
        ->and($pets[0]['traits']['obedience'])->toBe(0.9)->and($pets[0]['memory']['toys'])->toBe(['ball' => 3])->and($pets[0]['bonds'][(string) $ana->id])->toBe(42.5);
    internalCall($this, 'PUT', "$url/{$created['id']}", ['traits' => ['energy' => 3]])->assertStatus(422);
    internalCall($this, 'POST', $url, $rec('Two'))->assertCreated();
    internalCall($this, 'POST', $url, $rec('Three'))->assertCreated();
    internalCall($this, 'POST', $url, $rec('Four'))->assertStatus(422);
    internalCall($this, 'POST', '/api/internal/pets/'.User::factory()->create()->id, ['species' => 'dragon'] + $rec('X'))->assertStatus(422);
    internalCall($this, 'PUT', '/api/internal/pets/'.User::factory()->create()->id."/{$created['id']}", ['xp' => 1])->assertNotFound();
    internalCall($this, 'DELETE', "$url/{$created['id']}")->assertOk();
    expect(internalCall($this, 'GET', $url)->json('pets'))->toHaveCount(2);
    $this->getJson($url)->assertStatus(401);
});
