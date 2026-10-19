<?php

use App\Models\Bios;
use App\Models\Game;
use App\Models\Upload;
use App\Models\User;
use App\Services\GameSystems as Sys;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

// The disc console's side of the API (docs/plan/23-disc-console.md): discs
// brought in chunks, served with Range, and the BIOS someone brings.

// an admin and someone else
function discPeople(): array
{
    return [User::factory()->create(['is_admin' => true]), User::factory()->create()];
}

// a disc as dumped: a .cue naming one track, the track a bit over a chunk
function aDisc(int $extra = 1000): array
{
    $bin = str_repeat("\x00\xff", Sys::CHUNK / 2).str_repeat('Y', $extra);

    return ['game.cue' => "FILE \"game.bin\" BINARY\r\n  TRACK 01 MODE2/2352\r\n    INDEX 01 00:00:00\r\n", 'game.bin' => $bin];
}

function putPiece($test, User $who, string $url, int $file, int $n, string $bytes)
{
    return $test->actingAs($who)->call('PUT', "{$url}/{$file}/{$n}", [], [], [], [
        'CONTENT_TYPE' => 'application/octet-stream',
        'HTTP_ACCEPT' => 'application/json',
    ], $bytes);
}

it('brings a disc in chunks: pieces in any order, carried on, put together and checked', function () {
    Storage::fake('local');
    [$owner, $bia] = discPeople();
    $stranger = User::factory()->create();
    $disc = aDisc();
    $base = '/api/games';
    // the tracks first, the .cue after: it comes back with the .cue first (what the core opens)
    $start = $this->actingAs($bia)->postJson("{$base}/uploads", [
        'system' => 'ps1', 'title' => 'Test Card', 'color' => '#4F86C6', 'players' => 2,
        'files' => [['name' => 'game.bin', 'size' => strlen($disc['game.bin'])], ['name' => 'game.cue', 'size' => strlen($disc['game.cue'])]],
    ])->assertCreated();
    $id = $start->json('upload.id');
    expect($start->json('upload.files.0'))->toMatchArray(['name' => 'game.cue', 'chunks' => 1, 'have' => []]);
    expect($start->json('upload.files.1'))->toMatchArray(['name' => 'game.bin', 'chunks' => 2]);
    $url = "{$base}/uploads/{$id}";
    $bin = $disc['game.bin'];

    // a piece the wrong size, someone else's upload
    putPiece($this, $bia, $url, 1, 0, 'short')->assertStatus(422);
    putPiece($this, $owner, $url, 1, 1, substr($bin, Sys::CHUNK))->assertNotFound();
    $this->actingAs($stranger)->getJson($url)->assertNotFound();
    Storage::disk('local')->assertMissing("uploads/{$id}/1.1");
    // the last piece first; the status says what's here (to carry on after a reload)
    putPiece($this, $bia, $url, 1, 1, substr($bin, Sys::CHUNK))->assertOk();
    expect($this->actingAs($bia)->getJson($url)->json('upload.files.1.have'))->toBe([1]);
    // not all here yet
    $this->actingAs($bia)->postJson("{$url}/finish")->assertStatus(422);
    putPiece($this, $bia, $url, 1, 0, substr($bin, 0, Sys::CHUNK))->assertOk();
    putPiece($this, $bia, $url, 0, 0, $disc['game.cue'])->assertOk();
    $game = $this->actingAs($bia)->postJson("{$url}/finish")->assertCreated()->json('game');
    expect($game)->toMatchArray(['system' => 'ps1', 'title' => 'Test Card', 'color' => '#4f86c6', 'players' => 2, 'mine' => true]);
    expect(array_column($game['files'], 'name'))->toBe(['game.cue', 'game.bin']);
    expect($game['sha1'])->toBe(sha1($disc['game.cue'].$bin));
    expect(Upload::count())->toBe(0);

    // everyone plays it: each file by its place, Range to carry on a download
    $gid = (int) substr($game['id'], 2);
    expect($this->actingAs($owner)->get("{$base}/{$gid}/files/0")->assertOk()->streamedContent())->toBe($disc['game.cue']);
    $part = $this->actingAs($owner)->get("{$base}/{$gid}/files/1", ['Range' => 'bytes='.Sys::CHUNK.'-'])->assertStatus(206);
    expect($part->streamedContent())->toBe(substr($bin, Sys::CHUNK));
    expect($part->headers->get('Cache-Control'))->toContain('immutable');
    $this->actingAs($owner)->get("{$base}/{$gid}/rom")->assertOk();
    $this->actingAs($owner)->get("{$base}/{$gid}/files/2")->assertNotFound();
    app('auth')->forgetGuards();
    $this->get("{$base}/{$gid}/files/1", ['Accept' => 'application/json'])->assertUnauthorized();

    // the same disc twice: no
    $again = $this->actingAs($owner)->postJson("{$base}/uploads", [
        'system' => 'ps1', 'title' => 'Again', 'color' => '#000000',
        'files' => [['name' => 'game.cue', 'size' => strlen($disc['game.cue'])], ['name' => 'game.bin', 'size' => strlen($bin)]],
    ])->json('upload.id');
    putPiece($this, $owner, "{$base}/uploads/{$again}", 0, 0, $disc['game.cue']);
    putPiece($this, $owner, "{$base}/uploads/{$again}", 1, 0, substr($bin, 0, Sys::CHUNK));
    putPiece($this, $owner, "{$base}/uploads/{$again}", 1, 1, substr($bin, Sys::CHUNK));
    $this->actingAs($owner)->postJson("{$base}/uploads/{$again}/finish")->assertStatus(422)->assertJsonPath('message', 'That game is already on the shelf.');

    // taken away (by who brought it): the folder goes with it
    $dir = Game::find($gid)->path;
    $this->actingAs($bia)->deleteJson("{$base}/{$gid}")->assertOk();
    expect(Storage::disk('local')->exists($dir))->toBeFalse();
});

it('checks a disc\'s files: what makes a disc, a .cue that names its tracks, the rack\'s room', function () {
    Storage::fake('local');
    [, $bia] = discPeople();
    $start = fn (array $files, string $system = 'ps1') => $this->actingAs($bia)->postJson('/api/games/uploads', [
        'system' => $system, 'title' => 'X', 'color' => '#000000', 'files' => $files,
    ]);
    $start([['name' => 'game.bin', 'size' => 10]])->assertStatus(422)->assertJsonPath('message', 'A .bin needs its .cue (or bring the disc as .chd).');
    $start([['name' => 'a.cue', 'size' => 10], ['name' => 'b.cue', 'size' => 10], ['name' => 'a.bin', 'size' => 10]])->assertStatus(422);
    $start([['name' => 'a.chd', 'size' => 10], ['name' => 'b.chd', 'size' => 10]])->assertStatus(422);
    $start([['name' => 'game.exe', 'size' => 10]])->assertStatus(422);
    $start([['name' => '../etc.chd', 'size' => 10]])->assertStatus(422);
    $start([['name' => 'huge.chd', 'size' => 901 * 1024 * 1024]])->assertStatus(422)->assertJsonPath('message', 'That disc is too big.');
    $start([['name' => 'two.nes', 'size' => 10], ['name' => 'more.nes', 'size' => 10]], 'nes')->assertStatus(422);
    config(['yutopia.disc_quota' => 100 * 1024 * 1024]);
    $start([['name' => 'big.chd', 'size' => 101 * 1024 * 1024]])->assertStatus(422)->assertJsonPath('message', 'The disc rack is full: remove a disc first.');
    config(['yutopia.disc_quota' => 10 * 1024 * 1024 * 1024]);

    // a .cue naming a track that didn't come: refused at the end, nothing kept
    $cue = "FILE \"other.bin\" BINARY\r\n  TRACK 01 MODE2/2352\r\n";
    $id = $start([['name' => 'game.cue', 'size' => strlen($cue)], ['name' => 'game.bin', 'size' => 2352]])->assertCreated()->json('upload.id');
    $url = "/api/games/uploads/{$id}";
    putPiece($this, $bia, $url, 0, 0, $cue)->assertOk();
    putPiece($this, $bia, $url, 1, 0, str_repeat('x', 2352))->assertOk();
    $this->actingAs($bia)->postJson("{$url}/finish")->assertStatus(422)
        ->assertJsonPath('message', 'The .cue names tracks that didn\'t come: other.bin');
    expect(Upload::count())->toBe(0)->and(Storage::disk('local')->allFiles())->toBe([]);

    // a .chd that isn't one
    $id = $start([['name' => 'fake.chd', 'size' => 16]])->json('upload.id');
    putPiece($this, $bia, "/api/games/uploads/{$id}", 0, 0, str_repeat('n', 16))->assertOk();
    $this->actingAs($bia)->postJson("/api/games/uploads/{$id}/finish")->assertStatus(422);
    // a real-looking one goes on the rack, as one file
    $chd = 'MComprHD'.str_repeat("\x01", 100);
    $id = $start([['name' => 'card.chd', 'size' => strlen($chd)]])->json('upload.id');
    putPiece($this, $bia, "/api/games/uploads/{$id}", 0, 0, $chd)->assertOk();
    $game = $this->actingAs($bia)->postJson("/api/games/uploads/{$id}/finish")->assertCreated()->json('game');
    expect($game['files'])->toBe([['name' => 'card.chd', 'bytes' => strlen($chd)]]);
    // and discs don't count against the cartridges (nor go up the one-request way)
    $this->actingAs($bia)->post('/api/games', [
        'file' => UploadedFile::fake()->createWithContent('x.chd', $chd), 'system' => 'ps1', 'title' => 'X', 'color' => '#000000',
    ], ['Accept' => 'application/json'])->assertStatus(422);
});

it('drops an upload: by hand, or when it\'s left unfinished for a day', function () {
    Storage::fake('local');
    [, $bia] = discPeople();
    $start = fn () => $this->actingAs($bia)->postJson('/api/games/uploads', [
        'system' => 'ps1', 'title' => 'X', 'color' => '#000000', 'files' => [['name' => 'a.chd', 'size' => 20]],
    ])->json('upload.id');
    $a = $start();
    putPiece($this, $bia, "/api/games/uploads/{$a}", 0, 0, str_repeat('a', 20))->assertOk();
    $this->actingAs($bia)->deleteJson("/api/games/uploads/{$a}")->assertOk();
    expect(Storage::disk('local')->allFiles())->toBe([]);
    $b = $start();
    putPiece($this, $bia, "/api/games/uploads/{$b}", 0, 0, str_repeat('b', 20))->assertOk();
    Upload::whereKey($b)->update(['updated_at' => now()->subHours(25)]);
    $this->artisan('yutopia:prune-uploads')->assertSuccessful();
    expect(Upload::count())->toBe(0)->and(Storage::disk('local')->allFiles())->toBe([]);
    // a few on their way at most: a new one drops the stalest
    $ids = [$start(), $start(), $start()];
    Upload::whereKey($ids[0])->update(['updated_at' => now()->subMinutes(5)]);
    $start();
    expect(Upload::count())->toBe(3)->and(Upload::find($ids[0]))->toBeNull();
});

it('keeps the world\'s BIOS: known dumps only, under the name the core looks for', function () {
    Storage::fake('local');
    [$owner, $bia] = discPeople();
    $stranger = User::factory()->create();
    $url = '/api/bios';
    $dump = str_repeat("\x42", Sys::BIOS_BYTES);
    config(['yutopia.test_bios_md5' => md5($dump)]);
    $file = fn (string $bytes) => UploadedFile::fake()->createWithContent('my bios.bin', $bytes);

    // not 512 KB; 512 KB of something we don't know
    $this->actingAs($bia)->post($url, ['file' => $file('tiny')], ['Accept' => 'application/json'])->assertStatus(422);
    $this->actingAs($bia)->post($url, ['file' => $file(str_repeat('?', Sys::BIOS_BYTES))], ['Accept' => 'application/json'])
        ->assertStatus(422)->assertJsonPath('message', fn ($m) => str_contains($m, 'isn\'t one we know'));
    // one we know: its model, kept as the core's name for it
    $bios = $this->actingAs($bia)->post($url, ['file' => $file($dump)], ['Accept' => 'application/json'])->assertCreated()->json('bios');
    expect($bios)->toMatchArray(['model' => 'Test BIOS', 'fileName' => 'scphtest.bin', 'mine' => true]);
    expect(Storage::disk('local')->exists('bios/scphtest.bin'))->toBeTrue();
    $this->actingAs($bia)->post($url, ['file' => $file($dump)], ['Accept' => 'application/json'])->assertStatus(422);
    // everyone gets it
    expect($this->actingAs($stranger)->getJson($url)->json('bios.0'))->toMatchArray(['model' => 'Test BIOS', 'mine' => false]);
    expect($this->actingAs($stranger)->get("{$url}/{$bios['id']}/file")->assertOk()->streamedContent())->toBe($dump);
    // the real table: every entry a core name, a model, a region
    foreach (Sys::BIOS as $md5 => [$name, $model]) {
        expect($md5)->toMatch('/^[0-9a-f]{32}$/')->and($name)->toStartWith('scph')->and($model)->not->toBeEmpty();
    }
    // only who brought it, or an admin, takes it away
    $this->actingAs($stranger)->deleteJson("{$url}/{$bios['id']}")->assertForbidden();
    $this->actingAs($owner)->deleteJson("{$url}/{$bios['id']}")->assertOk();
    expect(Bios::count())->toBe(0);
});

it('keeps the pieces\' rate limits apart: a disc\'s many pieces don\'t use up the rest', function () {
    Storage::fake('local');
    [, $bia] = discPeople();
    $base = '/api/games/uploads';
    $id = $this->actingAs($bia)->postJson($base, [
        'system' => 'ps1', 'title' => 'X', 'color' => '#000000', 'files' => [['name' => 'a.chd', 'size' => 8]],
    ])->json('upload.id');
    // more pieces than the 20-a-minute routes, and the global 120-a-minute API
    // ceiling, allow (a 900 MB disc is ~110): those still answer after
    for ($i = 0; $i < 130; $i++) {
        putPiece($this, $bia, "{$base}/{$id}", 0, 0, 'MComprHD')->assertOk();
    }
    $this->actingAs($bia)->postJson("{$base}/{$id}/finish")->assertCreated();
    $this->actingAs($bia)->getJson('/api/games')->assertOk();
});
