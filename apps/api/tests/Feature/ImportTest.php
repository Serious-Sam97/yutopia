<?php

use App\Models\User;
use App\Models\World;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Testing\PendingCommand;

// yutopia:import against a small Yondra: its yutopia_* tables (as Yondra's
// migrations make them, the columns the import reads) on a second in-memory
// sqlite, and its files in a temp folder.

beforeEach(function () {
    config(['database.connections.yondra' => ['driver' => 'sqlite', 'database' => ':memory:', 'prefix' => '', 'foreign_key_constraints' => false]]);
    DB::purge('yondra');
    $s = Schema::connection('yondra');
    $s->create('users', function (Blueprint $t) {
        $t->id();
        $t->string('name');
        $t->string('email');
        $t->timestamp('email_verified_at')->nullable();
        $t->string('password');
        $t->string('remember_token')->nullable();
        $t->timestamps();
    });
    $s->create('yutopia_spaces', function (Blueprint $t) {
        $t->id();
        $t->unsignedBigInteger('project_id')->nullable();
        $t->string('slug');
        $t->string('name');
        $t->string('map_key')->default('studio');
        $t->json('layout')->nullable();
        $t->json('settings')->nullable();
        $t->timestamp('seeded_at')->nullable();
        $t->timestamps();
    });
    $s->create('yutopia_objects', function (Blueprint $t) {
        $t->id();
        $t->unsignedBigInteger('space_id');
        $t->string('uid');
        $t->string('kind');
        $t->integer('x');
        $t->integer('y');
        $t->integer('rot')->default(0);
        $t->unsignedBigInteger('ref_id')->nullable();
        $t->json('props')->nullable();
        $t->timestamps();
    });
    foreach (['yutopia_avatars' => ['layers'], 'yutopia_phones' => ['settings']] as $name => $json) {
        $s->create($name, function (Blueprint $t) use ($json) {
            $t->id();
            $t->unsignedBigInteger('user_id');
            foreach ($json as $c) {
                $t->json($c);
            }
            $t->timestamps();
        });
    }
    $s->create('yutopia_desks', function (Blueprint $t) {
        $t->id();
        $t->unsignedBigInteger('space_id');
        $t->unsignedBigInteger('user_id');
        $t->string('desk_uid');
        $t->timestamps();
    });
    $s->create('yutopia_spawns', function (Blueprint $t) {
        $t->id();
        $t->unsignedBigInteger('space_id');
        $t->unsignedBigInteger('user_id');
        $t->float('x');
        $t->float('y');
        $t->timestamps();
    });
    $s->create('yutopia_setups', function (Blueprint $t) {
        $t->id();
        $t->unsignedBigInteger('user_id');
        $t->string('name');
        $t->json('items');
        $t->timestamps();
    });
    $s->create('yutopia_games', function (Blueprint $t) {
        $t->id();
        $t->unsignedBigInteger('space_id');
        $t->unsignedBigInteger('uploaded_by')->nullable();
        $t->string('system');
        $t->string('title');
        $t->string('color');
        $t->integer('players')->default(1);
        $t->string('file_name');
        $t->string('path');
        $t->json('files')->nullable();
        $t->unsignedBigInteger('bytes');
        $t->string('sha1');
        $t->timestamps();
    });
    $s->create('yutopia_game_saves', function (Blueprint $t) {
        $t->id();
        $t->unsignedBigInteger('space_id');
        $t->string('game');
        $t->string('state_path')->nullable();
        $t->string('sram_path')->nullable();
        $t->unsignedBigInteger('updated_by')->nullable();
        $t->timestamps();
    });
    $s->create('yutopia_bios', function (Blueprint $t) {
        $t->id();
        $t->unsignedBigInteger('space_id');
        $t->unsignedBigInteger('uploaded_by')->nullable();
        $t->string('system')->default('ps1');
        $t->string('md5');
        $t->string('file_name');
        $t->string('path');
        $t->timestamps();
    });
    $s->create('yutopia_pets', function (Blueprint $t) {
        $t->id();
        $t->unsignedBigInteger('user_id');
        $t->string('species');
        $t->string('name');
        foreach (['look', 'outfit', 'needs', 'tricks'] as $c) {
            $t->json($c);
        }
        foreach (['traits', 'memory', 'bonds'] as $c) {
            $t->json($c)->nullable();
        }
        $t->integer('xp')->default(0);
        $t->boolean('alive')->default(true);
        $t->integer('wins')->default(0);
        $t->integer('losses')->default(0);
        $t->timestamp('born_at');
        $t->timestamp('died_at')->nullable();
        $t->timestamp('seen_at');
        $t->timestamps();
    });
    $s->create('yutopia_contacts', function (Blueprint $t) {
        $t->id();
        $t->unsignedBigInteger('user_id');
        $t->unsignedBigInteger('contact_id');
        $t->timestamps();
    });
    $s->create('yutopia_threads', function (Blueprint $t) {
        $t->id();
        $t->string('kind');
        $t->string('name')->nullable();
        $t->unsignedBigInteger('space_id')->nullable();
        $t->string('direct_key')->nullable();
        $t->unsignedBigInteger('created_by')->nullable();
        $t->timestamp('last_message_at')->nullable();
        $t->timestamps();
    });
    $s->create('yutopia_thread_members', function (Blueprint $t) {
        $t->id();
        $t->unsignedBigInteger('thread_id');
        $t->unsignedBigInteger('user_id');
        $t->unsignedBigInteger('last_read_id')->default(0);
        $t->boolean('muted')->default(false);
        $t->timestamp('left_at')->nullable();
        $t->timestamps();
    });
    $s->create('yutopia_photos', function (Blueprint $t) {
        $t->id();
        $t->unsignedBigInteger('user_id');
        $t->unsignedBigInteger('space_id')->nullable();
        $t->string('path');
        $t->string('kind')->default('photo');
        $t->string('mime')->default('image/jpeg');
        $t->integer('w');
        $t->integer('h');
        $t->integer('secs')->default(0);
        $t->integer('bytes');
        $t->string('filter')->default('none');
        $t->boolean('selfie')->default(false);
        $t->boolean('sent')->default(false);
        $t->string('where')->default('');
        $t->timestamps();
    });
    $s->create('yutopia_messages', function (Blueprint $t) {
        $t->id();
        $t->unsignedBigInteger('thread_id');
        $t->unsignedBigInteger('user_id')->nullable();
        $t->string('kind')->default('text');
        $t->text('body')->nullable();
        $t->unsignedBigInteger('photo_id')->nullable();
        $t->json('meta')->nullable();
        $t->json('reactions')->nullable();
        $t->unsignedBigInteger('reply_to')->nullable();
        $t->timestamps();
    });
    $this->storage = sys_get_temp_dir().'/yondra-'.uniqid();
    Storage::fake('local');
    aYondra($this->storage);
});

afterEach(function () {
    exec('rm -rf '.escapeshellarg($this->storage));
});

function yput(string $root, string $path, string $bytes): void
{
    @mkdir(dirname("{$root}/{$path}"), 0775, true);
    file_put_contents("{$root}/{$path}", $bytes);
}

// Limiar (space 1) is the world; Spare (2) has a copy of a game and a room of its
// own. Ana (#8) and Bia (#9) used Yutopia; Caio (#12) never did; #20 is the newest account.
function aYondra(string $root): void
{
    $y = DB::connection('yondra');
    $now = now();
    foreach ([[8, 'Ana Demo', 'ANA@yutopia.test'], [9, 'Bia Demo', 'bia@yutopia.test'], [12, 'Caio', 'caio@x.test'], [20, 'Dani', 'dani@x.test']] as [$id, $name, $email]) {
        $y->table('users')->insert(['id' => $id, 'name' => $name, 'email' => $email, 'password' => Hash::make('yondra-pass'), 'created_at' => $now, 'updated_at' => $now]);
    }
    $layout = ['width' => 16, 'height' => 16, 'areas' => [
        ['key' => 'room-ana', 'name' => "Ana's office", 'ownerId' => 8, 'ownerName' => 'Ana Demo'],
        ['key' => 'room-caio', 'name' => "Caio's office", 'ownerId' => 12, 'ownerName' => 'Caio'],
    ]];
    $y->table('yutopia_spaces')->insert([
        ['id' => 1, 'slug' => 'limiar', 'name' => 'Limiar Core', 'layout' => json_encode($layout), 'settings' => json_encode(['playlists' => [['list' => 'PL1']], 'radio' => ['old' => true]]), 'seeded_at' => $now],
        ['id' => 2, 'slug' => 'spare', 'name' => 'Spare', 'layout' => null, 'settings' => null, 'seeded_at' => null],
    ]);
    $y->table('yutopia_objects')->insert([
        ['space_id' => 1, 'uid' => 'desk-1', 'kind' => 'desk', 'x' => 4, 'y' => 5, 'props' => json_encode(['desk' => true, 'ownerId' => 8, 'ownerName' => 'Ana Demo']), 'ref_id' => null],
        ['space_id' => 1, 'uid' => 'desk-2', 'kind' => 'desk', 'x' => 6, 'y' => 5, 'props' => json_encode(['desk' => true, 'ownerId' => 12, 'ownerName' => 'Caio']), 'ref_id' => null],
        ['space_id' => 1, 'uid' => 'wall-1', 'kind' => 'board_wall', 'x' => 3, 'y' => 1, 'props' => null, 'ref_id' => 77],
        ['space_id' => 2, 'uid' => 'plant-x', 'kind' => 'plant', 'x' => 1, 'y' => 1, 'props' => null, 'ref_id' => null],
    ]);
    // (Caio's desk was given to him in build mode — its props — but he never came in)
    $y->table('yutopia_desks')->insert([['space_id' => 1, 'user_id' => 8, 'desk_uid' => 'desk-1'], ['space_id' => 1, 'user_id' => 9, 'desk_uid' => 'desk-9']]);
    $y->table('yutopia_spawns')->insert([['space_id' => 1, 'user_id' => 9, 'x' => 3.5, 'y' => 3.5], ['space_id' => 2, 'user_id' => 8, 'x' => 1.5, 'y' => 1.5]]);
    $y->table('yutopia_avatars')->insert(['user_id' => 8, 'layers' => json_encode(['hair' => 'bun'])]);
    $y->table('yutopia_setups')->insert(['user_id' => 9, 'name' => 'Desk', 'items' => json_encode([['kind' => 'desk', 'dx' => 0, 'dy' => 0, 'rot' => 0]])]);
    $y->table('yutopia_phones')->insert(['user_id' => 8, 'settings' => json_encode(['case' => 'rust'])]);
    $y->table('yutopia_pets')->insert(['id' => 5, 'user_id' => 8, 'species' => 'platypus', 'name' => 'Perry', 'look' => '{}', 'outfit' => '{}', 'needs' => '{}', 'tricks' => '{}', 'bonds' => json_encode(['8' => 40]), 'alive' => 1, 'born_at' => $now, 'seen_at' => $now]);
    $y->table('yutopia_contacts')->insert([['user_id' => 8, 'contact_id' => 9], ['user_id' => 8, 'contact_id' => 12]]);

    // the game room: one cartridge here, the same one and a disc in Spare
    yput($root, 'yutopia/games/1/aaa.nes', 'NES-ROM');
    yput($root, 'yutopia/games/2/aaa.nes', 'NES-ROM');
    yput($root, 'yutopia/games/2/bbb/game.cue', 'FILE "game.bin" BINARY');
    yput($root, 'yutopia/games/2/bbb/game.bin', str_repeat('D', 4096));
    yput($root, 'yutopia/saves/1/u-3/state.bin', 'STATE');
    yput($root, 'yutopia/saves/1/b-ucity/sram.bin', 'SRAM-1');
    yput($root, 'yutopia/saves/2/b-ucity/sram.bin', 'SRAM-2');
    yput($root, 'yutopia/bios/2/scph5501.bin', str_repeat("\x42", 64));
    $y->table('yutopia_games')->insert([
        ['id' => 3, 'space_id' => 1, 'uploaded_by' => 9, 'system' => 'nes', 'title' => 'Pong', 'color' => '#c4402b', 'file_name' => 'pong.nes', 'path' => 'yutopia/games/1/aaa.nes', 'files' => null, 'bytes' => 7, 'sha1' => 'aaa'],
        ['id' => 4, 'space_id' => 2, 'uploaded_by' => null, 'system' => 'nes', 'title' => 'Pong again', 'color' => '#000000', 'file_name' => 'pong.nes', 'path' => 'yutopia/games/2/aaa.nes', 'files' => null, 'bytes' => 7, 'sha1' => 'aaa'],
        ['id' => 6, 'space_id' => 2, 'uploaded_by' => 9, 'system' => 'ps1', 'title' => 'Disc', 'color' => '#4f86c6', 'file_name' => 'game.cue', 'path' => 'yutopia/games/2/bbb', 'files' => json_encode([['name' => 'game.cue', 'bytes' => 22], ['name' => 'game.bin', 'bytes' => 4096]]), 'bytes' => 4118, 'sha1' => 'bbb'],
    ]);
    $y->table('yutopia_game_saves')->insert([
        ['space_id' => 1, 'game' => 'u:3', 'state_path' => 'yutopia/saves/1/u-3/state.bin', 'sram_path' => null, 'updated_by' => 9, 'updated_at' => $now->copy()->subDay()],
        ['space_id' => 1, 'game' => 'b:ucity', 'state_path' => null, 'sram_path' => 'yutopia/saves/1/b-ucity/sram.bin', 'updated_by' => 8, 'updated_at' => $now->copy()->subDay()],
        ['space_id' => 2, 'game' => 'b:ucity', 'state_path' => null, 'sram_path' => 'yutopia/saves/2/b-ucity/sram.bin', 'updated_by' => 9, 'updated_at' => $now],
    ]);
    $y->table('yutopia_bios')->insert(['space_id' => 2, 'uploaded_by' => 9, 'md5' => 'm1', 'file_name' => 'scph5501.bin', 'path' => 'yutopia/bios/2/scph5501.bin']);

    // the phone: Limiar's thread, Spare's, a direct one, Vortex's; a photo
    yput($root, 'yutopia/photos/8/p1.jpg', 'JPEG');
    $y->table('yutopia_photos')->insert(['id' => 11, 'user_id' => 8, 'space_id' => 1, 'path' => 'yutopia/photos/8/p1.jpg', 'w' => 640, 'h' => 480, 'bytes' => 4, 'selfie' => 1, 'sent' => 1, 'where' => 'Lobby', 'created_at' => $now]);
    $y->table('yutopia_threads')->insert([
        ['id' => 1, 'kind' => 'space', 'name' => 'Limiar Core', 'space_id' => 1, 'direct_key' => null, 'created_by' => null],
        ['id' => 2, 'kind' => 'space', 'name' => 'Spare', 'space_id' => 2, 'direct_key' => null, 'created_by' => null],
        ['id' => 3, 'kind' => 'direct', 'name' => null, 'space_id' => null, 'direct_key' => '8:9', 'created_by' => 8],
        ['id' => 4, 'kind' => 'vortex', 'name' => null, 'space_id' => null, 'direct_key' => 'vortex:8', 'created_by' => 8],
    ]);
    $y->table('yutopia_thread_members')->insert([
        ['thread_id' => 1, 'user_id' => 8, 'last_read_id' => 2], ['thread_id' => 2, 'user_id' => 9, 'last_read_id' => 0],
        ['thread_id' => 3, 'user_id' => 8, 'last_read_id' => 4], ['thread_id' => 3, 'user_id' => 9, 'last_read_id' => 3],
        ['thread_id' => 4, 'user_id' => 8, 'last_read_id' => 0],
    ]);
    $y->table('yutopia_messages')->insert([
        ['id' => 1, 'thread_id' => 1, 'user_id' => 8, 'kind' => 'text', 'body' => 'standup in 5', 'photo_id' => null, 'created_at' => $now],
        ['id' => 2, 'thread_id' => 1, 'user_id' => 9, 'kind' => 'text', 'body' => 'coming', 'photo_id' => null, 'created_at' => $now],
        ['id' => 3, 'thread_id' => 3, 'user_id' => 8, 'kind' => 'photo', 'body' => null, 'photo_id' => 11, 'created_at' => $now],
        ['id' => 4, 'thread_id' => 3, 'user_id' => 9, 'kind' => 'text', 'body' => 'nice', 'photo_id' => null, 'created_at' => $now],
        ['id' => 5, 'thread_id' => 4, 'user_id' => null, 'kind' => 'text', 'body' => 'k.', 'photo_id' => null, 'created_at' => $now],
        ['id' => 6, 'thread_id' => 2, 'user_id' => 9, 'kind' => 'text', 'body' => 'spare talk', 'photo_id' => null, 'created_at' => $now],
    ]);
}

function import(array $options = []): PendingCommand
{
    return test()->artisan('yutopia:import', ['--world' => 1, '--storage' => test()->storage] + $options);
}

it('prints what would come along and writes nothing on a dry run', function () {
    import(['--dry-run' => true])
        ->expectsOutputToContain('#1 Limiar Core ← THE WORLD')
        ->expectsOutputToContain('#2 Spare (left behind)')
        ->expectsOutputToContain('2 of 4 Yondra accounts, ids kept, passwords kept; ids continue after #20')
        ->expectsOutputToContain("owner cleared (not coming along): room \"Caio's office\" (owner #12)")
        ->expectsOutputToContain('Files: 4')
        ->expectsOutputToContain('Dry run: nothing written.')
        ->assertSuccessful();
    expect(User::count())->toBe(0)->and(DB::table('objects')->count())->toBe(0);
    Storage::disk('local')->assertMissing('games/aaa.nes');
});

it('brings the world, the people, the game room and the phone over, ids kept', function () {
    config(['yutopia.admins' => ['ana@yutopia.test']]);
    import()->assertSuccessful();

    // people: the two who used Yutopia, same ids and passwords; Ana an admin (YUTOPIA_ADMINS)
    expect(User::orderBy('id')->pluck('email', 'id')->all())->toBe([8 => 'ana@yutopia.test', 9 => 'bia@yutopia.test']);
    $this->postJson('/api/login', ['email' => 'bia@yutopia.test', 'password' => 'yondra-pass'])->assertOk();
    expect(User::find(8)->is_admin)->toBeTrue()->and(User::find(9)->is_admin)->toBeFalse();

    // the world: Limiar's map and things; Caio's room and desk lose their owner
    $w = World::current();
    expect($w->name)->toBe(config('yutopia.world_name'))
        ->and($w->settings)->toBe(['playlists' => [['list' => 'PL1']]])
        ->and($w->layout['areas'][0]['ownerId'])->toBe(8)
        ->and($w->layout['areas'][1]['ownerId'])->toBeNull()
        ->and(DB::table('objects')->orderBy('uid')->pluck('uid')->all())->toBe(['desk-1', 'desk-2', 'wall-1']);
    expect(json_decode(DB::table('objects')->where('uid', 'desk-2')->value('props'), true))->toBe(['desk' => true])
        ->and((int) DB::table('objects')->where('uid', 'wall-1')->value('ref_id'))->toBe(77)
        ->and(DB::table('desks')->orderBy('user_id')->pluck('desk_uid', 'user_id')->all())->toBe([8 => 'desk-1', 9 => 'desk-9'])
        ->and(DB::table('spawns')->pluck('user_id')->all())->toBe([9]); // Spare's arrival point stays behind

    // the game room: Limiar's cartridge (id kept), its saves; Spare's left behind; files moved without the space
    expect(DB::table('games')->pluck('path', 'id')->all())->toBe([3 => 'games/aaa.nes'])
        ->and(DB::table('game_saves')->orderBy('game')->pluck('sram_path', 'game')->all())->toBe(['b:ucity' => 'saves/b-ucity/sram.bin', 'u:3' => null])
        ->and(DB::table('bios')->count())->toBe(0);
    expect(Storage::disk('local')->get('games/aaa.nes'))->toBe('NES-ROM')
        ->and(Storage::disk('local')->get('saves/b-ucity/sram.bin'))->toBe('SRAM-1')
        ->and(Storage::disk('local')->get('photos/8/p1.jpg'))->toBe('JPEG');

    // per person
    expect(DB::table('avatars')->where('user_id', 8)->value('layers'))->toContain('bun')
        ->and(DB::table('pets')->where('id', 5)->value('name'))->toBe('Perry')
        ->and(DB::table('contacts')->count())->toBe(1); // Ana → Caio stays behind

    // the phone: Limiar's thread is everyone's (Bia joins it with what was said read),
    // Spare's a group, the direct and Vortex threads as they were
    expect(DB::table('threads')->orderBy('id')->pluck('kind', 'id')->all())->toBe([1 => 'everyone', 2 => 'group', 3 => 'direct', 4 => 'vortex'])
        ->and(DB::table('thread_members')->where('thread_id', 1)->pluck('last_read_id', 'user_id')->all())->toBe([8 => 2, 9 => 2])
        ->and(DB::table('messages')->where('id', 3)->value('photo_id'))->toBe(11)
        ->and(DB::table('messages')->where('id', 5)->value('user_id'))->toBeNull()
        ->and(DB::table('photos')->where('id', 11)->value('path'))->toBe('photos/8/p1.jpg')
        ->and((bool) DB::table('photos')->where('id', 11)->value('selfie'))->toBeTrue();
    // and the phone reads it
    $this->actingAs(User::find(9))->getJson('/api/phone/threads')->assertOk()->assertJsonCount(3, 'threads');
    $this->actingAs(User::find(8))->getJson('/api/phone/threads/3/messages')->assertOk()
        ->assertJsonPath('messages.0.photo.kind', 'photo')->assertJsonPath('messages.1.body', 'nice');

    // a new account never takes the id of someone who stayed behind
    expect(User::factory()->create()->id)->toBe(21);
});

it('brings every space\'s games when asked, the same cartridge once, the newest save', function () {
    import(['--games' => 'all', '--users' => 'all', '--threads' => 'drop'])->assertSuccessful();

    expect(DB::table('games')->orderBy('id')->pluck('path', 'id')->all())->toBe([3 => 'games/aaa.nes', 6 => 'games/bbb'])
        ->and(DB::table('game_saves')->where('game', 'b:ucity')->value('sram_path'))->toBe('saves/b-ucity/sram.bin')
        ->and(Storage::disk('local')->get('saves/b-ucity/sram.bin'))->toBe('SRAM-2') // Spare's is newer
        ->and(Storage::disk('local')->get('games/bbb/game.bin'))->toBe(str_repeat('D', 4096))
        ->and(DB::table('bios')->value('path'))->toBe('bios/scph5501.bin')
        ->and(User::count())->toBe(4)
        ->and(DB::table('threads')->where('kind', 'group')->count())->toBe(0); // Spare's chat dropped
});

it('refuses a used database without --fresh, and a missing file', function () {
    User::factory()->create();
    import()->expectsOutputToContain('--fresh wipes it first')->assertFailed();
    import(['--fresh' => true])->assertSuccessful();
    expect(User::count())->toBe(2);

    unlink($this->storage.'/yutopia/photos/8/p1.jpg');
    import(['--fresh' => true])->expectsOutputToContain('1 files are missing')->assertFailed();
    expect(User::count())->toBe(2); // left as it was
});

it('needs a world that exists', function () {
    $this->artisan('yutopia:import', ['--world' => 99, '--dry-run' => true])->expectsOutputToContain('no Yutopia space 99')->assertFailed();
    $this->artisan('yutopia:import', ['--dry-run' => true])->expectsOutputToContain('--world=<space id> is required')->assertFailed();
});
