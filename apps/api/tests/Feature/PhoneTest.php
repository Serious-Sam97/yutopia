<?php

use App\Http\Middleware\VerifyInternalSignature;
use App\Models\Contact;
use App\Models\Message;
use App\Models\Photo;
use App\Models\User;
use Illuminate\Http\Client\Request as Sent;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;

// Yutopia's phone (docs/plan/21-cellphone.md): settings, threads, texts, photos,
// Vortex, the call log. Live events go to the world-server's /internal/push.

beforeEach(function () {
    config(['yutopia.world_internal' => 'http://world.test']);
    Http::fake(['world.test/*' => Http::response(['ok' => true])]);
});

function phonePeople(): array
{
    $ana = User::factory()->create(['name' => 'Ana Demo']);
    $bia = User::factory()->create(['name' => 'Bia Demo']);
    $caio = User::factory()->create(['name' => 'Caio']);
    $stranger = User::factory()->create();
    // their phone books: Ana has Bia and Caio, Bia has Ana
    foreach ([[$ana, $bia], [$ana, $caio], [$bia, $ana]] as [$a, $b]) {
        Contact::create(['user_id' => $a->id, 'contact_id' => $b->id]);
    }

    return [$ana, $bia, $caio, $stranger];
}

// the live events the world-server was handed for someone, by type
function pushed(int $uid, string $type): array
{
    return Http::recorded()->map(fn ($pair) => $pair[0])
        ->filter(fn (Sent $r) => $r->url() === 'http://world.test/internal/push')
        ->flatMap(fn (Sent $r) => $r->data()['events'])
        ->filter(fn ($e) => $e['uid'] === $uid && $e['event']['type'] === $type)
        ->values()->all();
}

it('keeps phone settings, cleaned', function () {
    [$ana] = phonePeople();
    $this->actingAs($ana)->getJson('/api/phone')->assertOk()->assertJsonPath('settings.case', 'walnut');
    $res = $this->actingAs($ana)->putJson('/api/phone', ['settings' => [
        'case' => 'rust', 'ringtone' => 'vortex', 'wallpaper' => 'photo:12', 'theme' => 'light',
        'tones' => ['5' => 'bell', 'x' => 'bell', '6' => 'nope'], 'favourites' => [3, 3, -1], 'evil' => 'yes',
    ]])->assertOk();
    expect($res->json('settings.case'))->toBe('rust')
        ->and($res->json('settings.wallpaper'))->toBe('photo:12')
        ->and($res->json('settings.tones'))->toBe(['5' => 'bell'])
        ->and($res->json('settings.favourites'))->toBe([3])
        ->and($res->json('settings'))->not->toHaveKey('evil');
    $this->actingAs($ana)->getJson('/api/phone')->assertJsonPath('settings.theme', 'light');
});

it('lists only the people you added, with where they are in the world', function () {
    [$ana, $bia, $caio, $stranger] = phonePeople();
    internalCall($this, 'POST', '/api/internal/presence', ['people' => [['user_id' => $bia->id, 'name' => 'Bia', 'area' => 'lounge', 'area_name' => 'Lounge', 'status' => 'away']]]);
    $list = fn ($u) => collect($this->actingAs($u)->getJson('/api/phone/contacts')->assertOk()->json('contacts'));
    expect($list($ana)->pluck('uid')->all())->toBe([$bia->id, $caio->id]) // online first
        ->and($list($ana)->first())->toMatchArray(['online' => true, 'here' => true, 'area' => 'Lounge', 'status' => 'away'])
        ->and($list($ana)->last())->toMatchArray(['online' => false, 'here' => false, 'status' => 'offline'])
        ->and($list($caio)->all())->toBe([]);

    // Caio looks Ana up by her id and adds her
    $this->actingAs($caio)->getJson("/api/phone/users/{$ana->id}")->assertOk()->assertJsonPath('person.name', 'Ana Demo')->assertJsonPath('added', false);
    $this->actingAs($caio)->getJson('/api/phone/users/999999')->assertNotFound();
    $this->actingAs($caio)->getJson("/api/phone/users/{$caio->id}")->assertNotFound();
    $this->actingAs($caio)->postJson('/api/phone/contacts', ['id' => $ana->id])->assertCreated()->assertJsonPath('contact.uid', $ana->id);
    $this->actingAs($caio)->postJson('/api/phone/contacts', ['id' => $ana->id])->assertCreated(); // twice: still one
    expect($list($caio)->pluck('uid')->all())->toBe([$ana->id]);
    $this->actingAs($caio)->postJson('/api/phone/contacts', ['id' => $stranger->id])->assertCreated();
    $this->actingAs($caio)->deleteJson("/api/phone/contacts/{$stranger->id}")->assertOk();
    expect($list($caio)->pluck('uid')->all())->toBe([$ana->id]);
});

it('texts only people in your contacts (or someone already talking to you)', function () {
    [$ana, , $caio, $stranger] = phonePeople();
    $this->actingAs($caio)->postJson('/api/phone/threads', ['members' => [$ana->id]])->assertStatus(422);
    $t = $this->actingAs($ana)->postJson('/api/phone/threads', ['members' => [$caio->id]])->assertOk()->json('thread');
    $back = $this->actingAs($caio)->postJson('/api/phone/threads', ['members' => [$ana->id]])->assertOk()->json('thread');
    expect($back['id'])->toBe($t['id']);
    $this->actingAs($ana)->postJson('/api/phone/threads', ['members' => [$stranger->id]])->assertStatus(422);
});

it('texts someone: one direct thread, live to them, read receipts, unread counts', function () {
    [$ana, $bia, , $stranger] = phonePeople();
    $t = $this->actingAs($ana)->postJson('/api/phone/threads', ['members' => [$bia->id]])->assertOk()->json('thread');
    $again = $this->actingAs($bia)->postJson('/api/phone/threads', ['members' => [$ana->id]])->json('thread');
    expect($again['id'])->toBe($t['id'])->and($t['kind'])->toBe('direct');

    $m = $this->actingAs($ana)->postJson("/api/phone/threads/{$t['id']}/messages", ['body' => 'board walls PR is up'])->assertCreated()->json('message');
    expect(pushed($bia->id, 'message'))->toHaveCount(1)
        ->and(pushed($bia->id, 'message')[0]['event']['message']['body'])->toBe('board walls PR is up')
        ->and(pushed($bia->id, 'message')[0]['event']['thread']['unread'])->toBe(1)
        ->and(pushed($ana->id, 'message'))->toBe([]);

    $mine = collect($this->actingAs($bia)->getJson('/api/phone/threads')->json('threads'))->firstWhere('id', $t['id']);
    expect($mine['unread'])->toBe(1)->and($mine['last']['body'])->toBe('board walls PR is up');

    $this->actingAs($bia)->postJson("/api/phone/threads/{$t['id']}/read", ['upto' => $m['id']])->assertOk();
    expect(pushed($ana->id, 'read'))->toHaveCount(1);
    $mine = collect($this->actingAs($bia)->getJson('/api/phone/threads')->json('threads'))->firstWhere('id', $t['id']);
    expect($mine['unread'])->toBe(0);

    $this->actingAs($bia)->postJson("/api/phone/threads/{$t['id']}/typing")->assertOk();
    expect(pushed($ana->id, 'typing'))->toHaveCount(1);

    // a stranger can't read or write it
    $this->actingAs($stranger)->getJson("/api/phone/threads/{$t['id']}/messages")->assertNotFound();
    $this->actingAs($stranger)->postJson("/api/phone/threads/{$t['id']}/messages", ['body' => 'hi'])->assertNotFound();
});

it('signs the pushes like the world-server signs its own calls', function () {
    [$ana, $bia] = phonePeople();
    $t = $this->actingAs($ana)->postJson('/api/phone/threads', ['members' => [$bia->id]])->json('thread');
    $this->actingAs($ana)->postJson("/api/phone/threads/{$t['id']}/messages", ['body' => 'hi'])->assertCreated();

    Http::assertSent(function (Sent $r) {
        $ts = $r->header('X-Yutopia-Timestamp')[0] ?? '';
        $sig = VerifyInternalSignature::sign(config('yutopia.internal_secret'), $ts, 'POST', '/internal/push', $r->body());

        return $r->url() === 'http://world.test/internal/push' && hash_equals($sig, $r->header('X-Yutopia-Signature')[0] ?? '');
    });
});

it('keeps a text when the world-server is down', function () {
    Http::fake(['world.test/*' => Http::response('down', 503)]);
    [$ana, $bia] = phonePeople();
    $t = $this->actingAs($ana)->postJson('/api/phone/threads', ['members' => [$bia->id]])->json('thread');

    $this->actingAs($ana)->postJson("/api/phone/threads/{$t['id']}/messages", ['body' => 'still here'])->assertCreated();
    expect(Message::where('body', 'still here')->exists())->toBeTrue();
});

it('has one thread for everyone, and earlier messages read as read for newcomers', function () {
    [$ana, $bia, , $stranger] = phonePeople();
    $st = collect($this->actingAs($ana)->getJson('/api/phone/threads')->json('threads'))->firstWhere('kind', 'everyone');
    expect($st['name'])->toBe(config('yutopia.world_name'))->and($st['members'])->toBe([]);
    $this->actingAs($ana)->postJson("/api/phone/threads/{$st['id']}/messages", ['body' => 'standup in 5!'])->assertCreated();
    // everyone with an account gets it live (the world-server drops the ones offline)
    expect(pushed($bia->id, 'message'))->toHaveCount(1)->and(pushed($stranger->id, 'message'))->toHaveCount(1);
    // Bia opens her phone: it's in her list, unread
    $mine = collect($this->actingAs($bia)->getJson('/api/phone/threads')->json('threads'))->firstWhere('kind', 'everyone');
    expect($mine['id'])->toBe($st['id'])->and($mine['unread'])->toBe(1);
    // someone who signs up later doesn't inherit the backlog as unread
    $late = User::factory()->create();
    $theirs = collect($this->actingAs($late)->getJson('/api/phone/threads')->json('threads'))->firstWhere('kind', 'everyone');
    expect($theirs['unread'])->toBe(0);
    $this->actingAs($late)->getJson("/api/phone/threads/{$st['id']}/messages")->assertOk()->assertJsonCount(1, 'messages');
});

it('reacts with the drawn emotes, toggling', function () {
    [$ana, $bia] = phonePeople();
    $t = $this->actingAs($ana)->postJson('/api/phone/threads', ['members' => [$bia->id]])->json('thread');
    $m = $this->actingAs($ana)->postJson("/api/phone/threads/{$t['id']}/messages", ['body' => 'hi'])->json('message');
    $this->actingAs($bia)->postJson("/api/phone/messages/{$m['id']}/react", ['e' => 'heart'])->assertJsonPath('reactions.heart', [$bia->id]);
    expect(pushed($ana->id, 'react'))->toHaveCount(1);
    $this->actingAs($bia)->postJson("/api/phone/messages/{$m['id']}/react", ['e' => 'heart'])->assertJsonPath('reactions', []);
    $this->actingAs($bia)->postJson("/api/phone/messages/{$m['id']}/react", ['e' => 'poop'])->assertStatus(422);
});

it('makes groups and logs calls from the world-server', function () {
    [$ana, $bia, $caio] = phonePeople();
    $g = $this->actingAs($ana)->postJson('/api/phone/threads', ['members' => [$bia->id, $caio->id], 'name' => 'Board walls crew'])->json('thread');
    expect($g['kind'])->toBe('group')->and($g['members'])->toHaveCount(2)
        ->and(pushed($bia->id, 'thread'))->toHaveCount(1);

    internalCall($this, 'POST', '/api/internal/phone/calls', ['from' => $ana->id, 'to' => [$bia->id], 'end' => 'missed', 'secs' => 0, 'video' => false, 'answered' => []])->assertOk();
    $this->call('POST', '/api/internal/phone/calls', [], [], [], ['CONTENT_TYPE' => 'application/json'], '{}')->assertStatus(401);
    $calls = $this->actingAs($bia)->getJson('/api/phone/calls')->assertOk()->json('calls');
    expect($calls)->toHaveCount(1)
        ->and($calls[0]['message']['meta']['end'])->toBe('missed')
        ->and($calls[0]['peers'])->toBe([$ana->id]);
    // the missed call is unread for Bia, not for Ana; the caller's phone hears of it too
    $t = collect($this->actingAs($bia)->getJson('/api/phone/threads')->json('threads'))->firstWhere('kind', 'direct');
    expect($t['unread'])->toBe(1)->and(pushed($ana->id, 'message'))->toHaveCount(1);
});

it('keeps photos: upload, list, a signed file that expires, quota, delete removes the file', function () {
    Storage::fake('local');
    [$ana, $bia] = phonePeople();
    $p = $this->actingAs($ana)->post('/api/phone/photos', ['file' => UploadedFile::fake()->image('photo.jpg', 1200, 800), 'filter' => 'film', 'selfie' => '1', 'where' => 'Open office'], ['Accept' => 'application/json'])
        ->assertCreated()->json('photo');
    expect($p['w'])->toBe(1200)->and($p['selfie'])->toBeTrue()->and($p['url'])->toStartWith('/api/photos/')->and($p['url'])->toContain('expires=');
    Storage::disk('local')->assertExists(Photo::find($p['id'])->path);
    expect(Photo::find($p['id'])->path)->toStartWith("photos/{$ana->id}/");
    $this->get($p['url'])->assertOk();
    $this->get('/api/photos/'.$p['id'])->assertForbidden();
    $this->travel(Photo::LINK_DAYS + 1)->days();
    $this->get($p['url'])->assertForbidden();
    $this->travelBack();
    expect($this->actingAs($bia)->getJson('/api/phone/photos')->json('photos'))->toBe([]);

    // sending it in a thread
    $t = $this->actingAs($ana)->postJson('/api/phone/threads', ['members' => [$bia->id]])->json('thread');
    $this->actingAs($ana)->postJson("/api/phone/threads/{$t['id']}/messages", ['photo_id' => $p['id']])->assertCreated()->assertJsonPath('message.kind', 'photo');
    $this->actingAs($bia)->postJson("/api/phone/threads/{$t['id']}/messages", ['photo_id' => $p['id']])->assertStatus(422);

    // Bia keeps it: a copy in her own gallery
    $kept = $this->actingAs($bia)->postJson("/api/phone/photos/{$p['id']}/keep")->assertCreated()->json('photo');
    expect($kept['id'])->not->toBe($p['id'])->and($kept['user_id'])->toBe($bia->id)
        ->and(Photo::find($kept['id'])->path)->toStartWith("photos/{$bia->id}/");
    $other = $this->actingAs($ana)->post('/api/phone/photos', ['file' => UploadedFile::fake()->image('b.jpg', 400, 300), 'filter' => 'none', 'selfie' => '0'], ['Accept' => 'application/json'])->json('photo');
    $this->actingAs($bia)->postJson("/api/phone/photos/{$other['id']}/keep")->assertNotFound(); // never sent to her

    // a video
    $v = $this->actingAs($ana)->post('/api/phone/photos', ['file' => UploadedFile::fake()->create('clip.webm', 600, 'video/webm'), 'kind' => 'video', 'filter' => 'film', 'selfie' => '0', 'w' => 1280, 'h' => 720, 'secs' => 12], ['Accept' => 'application/json'])
        ->assertCreated()->json('photo');
    expect($v['kind'])->toBe('video')->and($v['secs'])->toBe(12);
    $this->get($v['url'])->assertOk()->assertHeader('Content-Type', 'video/webm');

    $path = Photo::find($p['id'])->path;
    $this->actingAs($bia)->deleteJson("/api/phone/photos/{$p['id']}")->assertNotFound();
    $this->actingAs($ana)->deleteJson("/api/phone/photos/{$p['id']}")->assertOk();
    Storage::disk('local')->assertMissing($path);
});

it('texts Vortex: he answers in character, and keeps what he says in the world', function () {
    [$ana] = phonePeople();
    $r = $this->actingAs($ana)->postJson('/api/phone/vortex', ['text' => 'who are you?'])->assertOk();
    expect($r->json('message.user_id'))->toBe($ana->id)
        ->and($r->json('reply.user_id'))->toBeNull()
        ->and(strlen($r->json('reply.body')))->toBeGreaterThan(3);
    $this->actingAs($ana)->postJson('/api/phone/vortex/lines', ['text' => 'stop poking me.'])->assertOk();
    expect(Message::whereNull('user_id')->count())->toBe(2);
    $call = $this->actingAs($ana)->postJson('/api/phone/vortex/call', ['said' => []])->assertOk();
    expect($call->json('line'))->toBeString()->and($call->json('hangup'))->toBeBool();
    $this->actingAs($ana)->postJson('/api/phone/vortex/call', ['said' => ['a', 'b']])->assertOk()->assertJsonPath('hangup', true);
});
