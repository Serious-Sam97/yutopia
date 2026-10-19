<?php

namespace App\Http\Controllers;

use App\Models\Contact;
use App\Models\Message;
use App\Models\Photo;
use App\Models\Thread;
use App\Models\ThreadMember;
use App\Models\User;
use App\Services\Phone;
use App\Services\Vortex;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

// Yutopia's phone (docs/plan/21-cellphone.md): settings, contacts, threads and
// texts (live through the world-server, see Push), the camera's photos, Vortex,
// and the calls the world-server logs.
class PhoneController extends Controller
{
    private const EMOTES = ['wave', 'heart', 'laugh', 'clap', 'fire', 'question', 'coffee', 'tape'];

    public function __construct(private readonly Phone $phone) {}

    public function show(Request $request): JsonResponse
    {
        return response()->json(['settings' => $this->phone->settings($request->user())]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate(['settings' => ['required', 'array']]);

        return response()->json(['settings' => $this->phone->saveSettings($request->user(), $data['settings'])]);
    }

    public function contacts(Request $request): JsonResponse
    {
        return response()->json(['contacts' => $this->phone->contacts($request->user())]);
    }

    // someone by their user id (the one Settings shows), to add them
    public function lookup(Request $request, int $userId): JsonResponse
    {
        $u = User::find($userId);
        abort_unless($u && $u->id !== $request->user()->id, 404);

        return response()->json(['person' => $this->phone->person($u), 'added' => $this->phone->isContact($request->user(), $u->id)]);
    }

    public function addContact(Request $request): JsonResponse
    {
        $user = $request->user();
        $id = (int) $request->validate(['id' => ['required', 'integer', 'min:1']])['id'];
        $other = User::find($id);
        abort_unless($other && $other->id !== $user->id, 404, 'Nobody with that id.');
        abort_if(Contact::where('user_id', $user->id)->count() >= Contact::MAX, 422, 'Your phone book is full.');
        Contact::firstOrCreate(['user_id' => $user->id, 'contact_id' => $other->id]);

        return response()->json(['contact' => $this->phone->person($other)], 201);
    }

    public function removeContact(Request $request, int $userId): JsonResponse
    {
        Contact::where('user_id', $request->user()->id)->where('contact_id', $userId)->delete();

        return response()->json(['ok' => true]);
    }

    // ── threads ─────────────────────────────────────────────────────────────
    public function threads(Request $request): JsonResponse
    {
        return response()->json(['threads' => $this->phone->threads($request->user())]);
    }

    // a thread with these people (a direct one is reused; [0] is Vortex)
    public function open(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'members' => ['required', 'array', 'min:1', 'max:49'],
            'members.*' => ['integer', 'min:0'],
            'name' => ['nullable', 'string', 'max:60'],
        ]);
        $ids = array_values(array_unique(array_diff($data['members'], [$user->id])));
        if ($ids === [0]) {
            $t = $this->phone->vortex($user);
        } else {
            $ids = array_values(array_filter($ids, fn ($u) => $u > 0));
            abort_if($ids === [], 422, 'Nobody to talk to.');
            foreach ($ids as $uid) {
                abort_unless($this->phone->reachable($user, $uid), 422, 'Add them to your contacts first.');
            }
            $t = count($ids) === 1 ? $this->phone->direct($user, $ids[0]) : $this->phone->group($user, $ids, $data['name'] ?? null);
            if ($t->kind === 'group' && $t->wasRecentlyCreated) {
                foreach ($ids as $uid) {
                    $this->phone->push($uid, ['type' => 'thread', 'thread' => $this->phone->shapeThread($t, $uid)]);
                }
            }
        }

        return response()->json(['thread' => $this->phone->shapeThread($t, $user->id)]);
    }

    public function messages(Request $request, int $threadId): JsonResponse
    {
        $user = $request->user();
        $t = $this->visible($threadId, $user);
        $q = $t->messages()->with('photo')->orderByDesc('id');
        if ($before = $request->integer('before')) {
            $q->where('id', '<', $before);
        }
        $rows = $q->limit(51)->get();

        return response()->json([
            'messages' => $rows->take(50)->reverse()->values()->map(fn ($m) => $this->phone->shapeMessage($m)),
            'more' => $rows->count() > 50,
        ]);
    }

    public function send(Request $request, int $threadId): JsonResponse
    {
        $user = $request->user();
        $t = $this->visible($threadId, $user);
        abort_if($t->kind === 'vortex', 422, 'Text Vortex through /vortex.');
        $data = $request->validate([
            'body' => ['nullable', 'string', 'max:'.Message::MAX_TEXT],
            'photo_id' => ['nullable', 'integer'],
            'reply_to' => ['nullable', 'integer'],
        ]);
        $body = trim((string) ($data['body'] ?? ''));
        $photo = isset($data['photo_id']) ? Photo::where('id', $data['photo_id'])->where('user_id', $user->id)->first() : null;
        abort_if($body === '' && ! $photo, 422, 'Empty message.');
        $reply = isset($data['reply_to']) && $t->messages()->where('id', $data['reply_to'])->exists() ? (int) $data['reply_to'] : null;
        if ($t->kind === 'everyone') {
            $this->phone->member($t, $user->id);
        }
        $m = $this->phone->post($t, $user->id, [
            'kind' => $photo ? 'photo' : 'text',
            'body' => $body !== '' ? $body : null,
            'photo_id' => $photo?->id,
            'reply_to' => $reply,
        ]);
        if ($photo && ! $photo->sent) {
            $photo->update(['sent' => true]);
        }

        return response()->json(['message' => $this->phone->shapeMessage($m)], 201);
    }

    public function read(Request $request, int $threadId): JsonResponse
    {
        $user = $request->user();
        $t = $this->visible($threadId, $user);
        $upto = min((int) $request->validate(['upto' => ['required', 'integer', 'min:0']])['upto'], (int) $t->messages()->max('id'));
        $member = $this->phone->member($t, $user->id);
        if ($upto > $member->last_read_id) {
            $member->update(['last_read_id' => $upto]);
            if ($t->kind !== 'everyone') {
                $this->phone->pushAll($t, ['type' => 'read', 'thread' => $t->id, 'uid' => $user->id, 'upto' => $upto], $user->id);
            }
        }

        return response()->json(['ok' => true]);
    }

    public function typing(Request $request, int $threadId): JsonResponse
    {
        $user = $request->user();
        $t = $this->visible($threadId, $user);
        if ($t->kind === 'direct' || $t->kind === 'group') {
            $this->phone->pushAll($t, ['type' => 'typing', 'thread' => $t->id, 'uid' => $user->id], $user->id);
        }

        return response()->json(['ok' => true]);
    }

    public function editThread(Request $request, int $threadId): JsonResponse
    {
        $user = $request->user();
        $t = $this->visible($threadId, $user);
        $data = $request->validate(['muted' => ['sometimes', 'boolean'], 'name' => ['sometimes', 'string', 'max:60']]);
        if (array_key_exists('muted', $data)) {
            $this->phone->member($t, $user->id)->update(['muted' => $data['muted']]);
        }
        if (isset($data['name']) && $t->kind === 'group') {
            $t->update(['name' => $data['name']]);
            foreach ($this->phone->inThread($t) as $uid) {
                $this->phone->push($uid, ['type' => 'thread', 'thread' => $this->phone->shapeThread($t, $uid)]);
            }
        }

        return response()->json(['thread' => $this->phone->shapeThread($t, $user->id)]);
    }

    public function leave(Request $request, int $threadId): JsonResponse
    {
        $user = $request->user();
        $t = $this->visible($threadId, $user);
        abort_unless($t->kind === 'group', 422, 'Only groups can be left.');
        ThreadMember::where('thread_id', $t->id)->where('user_id', $user->id)->update(['left_at' => now()]);

        return response()->json(['ok' => true]);
    }

    public function react(Request $request, int $messageId): JsonResponse
    {
        $user = $request->user();
        $e = $request->validate(['e' => ['required', 'string', 'in:'.implode(',', self::EMOTES)]])['e'];
        $m = Message::findOrFail($messageId);
        $t = $this->visible($m->thread_id, $user);
        $r = $m->reactions ?? [];
        $who = $r[$e] ?? [];
        $who = in_array($user->id, $who, true) ? array_values(array_diff($who, [$user->id])) : [...$who, $user->id];
        if ($who === []) {
            unset($r[$e]);
        } else {
            $r[$e] = $who;
        }
        $m->update(['reactions' => $r]);
        $this->phone->pushAll($t, ['type' => 'react', 'message' => $m->id, 'thread' => $t->id, 'reactions' => (object) $r], $user->id);

        return response()->json(['reactions' => (object) $r]);
    }

    // Recents: the calls in my threads, newest first
    public function calls(Request $request): JsonResponse
    {
        $user = $request->user();
        $threads = ThreadMember::where('user_id', $user->id)->whereNull('left_at')->pluck('thread_id');
        $rows = Message::whereIn('thread_id', $threads)->where('kind', 'call')->latest('id')->limit(60)->get();
        $peers = ThreadMember::whereIn('thread_id', $rows->pluck('thread_id')->unique())
            ->where('user_id', '!=', $user->id)->get()->groupBy('thread_id');

        return response()->json(['calls' => $rows->map(fn ($m) => [
            'message' => $this->phone->shapeMessage($m),
            'peers' => ($peers[$m->thread_id] ?? collect())->pluck('user_id')->map(fn ($u) => (int) $u)->values(),
        ])]);
    }

    // ── photos ──────────────────────────────────────────────────────────────
    public function photos(Request $request): JsonResponse
    {
        $rows = Photo::where('user_id', $request->user()->id)->latest('id')->limit(Photo::QUOTA)->get();

        return response()->json(['photos' => $rows->map->toPhone()]);
    }

    public function upload(Request $request): JsonResponse
    {
        $user = $request->user();
        $video = $request->input('kind') === 'video';
        $data = $request->validate([
            'file' => $video
                ? ['required', 'file', 'mimetypes:video/webm,video/mp4,audio/webm', 'max:20480']
                : ['required', 'file', 'mimes:jpg,jpeg', 'max:4096'],
            'kind' => ['nullable', 'string', 'in:photo,video'],
            'filter' => ['required', 'string', 'in:none,film,vhs,bw,polaroid'],
            'selfie' => ['required', 'boolean'],
            'where' => ['nullable', 'string', 'max:120'],
            'w' => [$video ? 'required' : 'nullable', 'integer', 'min:16', 'max:2400'],
            'h' => [$video ? 'required' : 'nullable', 'integer', 'min:16', 'max:2400'],
            'secs' => [$video ? 'required' : 'nullable', 'integer', 'min:0', 'max:60'],
        ]);
        abort_if(Photo::where('user_id', $user->id)->count() >= Photo::QUOTA, 422, 'Your gallery is full — delete a few first.');
        $file = $request->file('file');
        if ($video) {
            $size = [(int) $data['w'], (int) $data['h']];
            $mime = str_contains((string) $file->getMimeType(), 'mp4') ? 'video/mp4' : 'video/webm';
        } else {
            $size = @getimagesize($file->getRealPath()) ?: [0, 0];
            abort_if($size[0] < 16 || $size[1] < 16 || max($size[0], $size[1]) > 2400, 422, 'Not a photo from the phone.');
            $mime = 'image/jpeg';
        }
        $ext = $mime === 'video/mp4' ? 'mp4' : ($video ? 'webm' : 'jpg');
        $path = $file->storeAs('photos/'.$user->id, Str::uuid().'.'.$ext, 'local');
        $photo = Photo::create([
            'user_id' => $user->id,
            'path' => $path,
            'w' => $size[0],
            'h' => $size[1],
            'bytes' => $file->getSize(),
            'filter' => $data['filter'],
            'selfie' => (bool) $data['selfie'],
            'where' => (string) ($data['where'] ?? ''),
            'kind' => $video ? 'video' : 'photo',
            'mime' => $mime,
            'secs' => (int) ($data['secs'] ?? 0),
        ]);

        return response()->json(['photo' => $photo->toPhone()], 201);
    }

    // a photo (or video) someone sent me: a copy of my own in my Gallery
    public function keep(Request $request, int $photoId): JsonResponse
    {
        $user = $request->user();
        $src = Photo::findOrFail($photoId);
        if ($src->user_id === $user->id) {
            return response()->json(['photo' => $src->toPhone()]);
        }
        $seen = Message::where('photo_id', $src->id)->pluck('thread_id')->unique()
            ->contains(fn ($tid) => ($t = Thread::find($tid)) && $this->phone->canSee($t, $user->id));
        abort_unless($seen, 404);
        abort_if(Photo::where('user_id', $user->id)->count() >= Photo::QUOTA, 422, 'Your gallery is full — delete a few first.');
        $disk = Storage::disk('local');
        abort_unless($disk->exists($src->path), 404);
        $path = 'photos/'.$user->id.'/'.Str::uuid().'.'.pathinfo($src->path, PATHINFO_EXTENSION);
        $disk->copy($src->path, $path);
        $copy = $src->replicate(['sent']);
        $copy->fill(['user_id' => $user->id, 'path' => $path, 'sent' => false])->save();

        return response()->json(['photo' => $copy->toPhone()], 201);
    }

    public function editPhoto(Request $request, int $photoId): JsonResponse
    {
        $photo = Photo::where('id', $photoId)->where('user_id', $request->user()->id)->firstOrFail();
        $data = $request->validate(['sent' => ['sometimes', 'boolean']]);
        $photo->update($data);

        return response()->json(['photo' => $photo->toPhone()]);
    }

    public function deletePhoto(Request $request, int $photoId): JsonResponse
    {
        $photo = Photo::where('id', $photoId)->where('user_id', $request->user()->id)->firstOrFail();
        Storage::disk('local')->delete($photo->path);
        $photo->delete();

        return response()->json(['ok' => true]);
    }

    // the file (signed URL, no token: it's an <img src>)
    public function photoFile(int $photo): Response
    {
        $p = Photo::findOrFail($photo);
        $disk = Storage::disk('local');
        abort_unless($disk->exists($p->path), 404);

        return $disk->response($p->path, null, ['Content-Type' => $p->mime ?: 'image/jpeg', 'Cache-Control' => 'private, max-age=604800', 'Accept-Ranges' => 'bytes']);
    }

    // ── Vortex ──────────────────────────────────────────────────────────────
    public function vortexText(Request $request, Vortex $vortex): JsonResponse
    {
        $user = $request->user();
        $text = trim((string) $request->validate(['text' => ['required', 'string', 'max:'.Message::MAX_TEXT]])['text']);
        $t = $this->phone->vortex($user);
        $mine = $this->phone->post($t, $user->id, ['body' => $text]);
        [$line] = $vortex->phoneReply($user, $text);
        $reply = Message::create(['thread_id' => $t->id, 'user_id' => null, 'kind' => 'text', 'body' => $line]);
        $t->forceFill(['last_message_at' => now()])->save();

        return response()->json(['message' => $this->phone->shapeMessage($mine), 'reply' => $this->phone->shapeMessage($reply)]);
    }

    // something he said to me in the world, kept in his thread
    public function vortexLine(Request $request): JsonResponse
    {
        $user = $request->user();
        $text = (string) $request->validate(['text' => ['required', 'string', 'max:400']])['text'];
        $t = $this->phone->vortex($user);
        $m = Message::create(['thread_id' => $t->id, 'user_id' => null, 'kind' => 'text', 'body' => $text]);
        $t->forceFill(['last_message_at' => now()])->save();

        return response()->json(['message' => $this->phone->shapeMessage($m)]);
    }

    public function vortexCall(Request $request, Vortex $vortex): JsonResponse
    {
        $said = $request->validate(['said' => ['present', 'array', 'max:8'], 'said.*' => ['string', 'max:400']])['said'];

        return response()->json($vortex->phoneCall($request->user(), $said));
    }

    // ── from the world-server (signed): a call that ended ───────────────────
    public function callLog(Request $request): JsonResponse
    {
        $data = $request->validate([
            'from' => ['required', 'integer'],
            'to' => ['required', 'array', 'min:1', 'max:8'],
            'to.*' => ['integer'],
            'end' => ['required', 'string', 'in:answered,missed,declined,busy,cancelled,unreachable'],
            'secs' => ['required', 'integer', 'min:0'],
            'video' => ['required', 'boolean'],
            'answered' => ['present', 'array'],
        ]);
        $from = User::findOrFail($data['from']);
        $to = array_values(array_filter(array_unique($data['to']), fn ($u) => $u !== $from->id && User::whereKey($u)->exists()));
        if ($to === []) {
            return response()->json(['ok' => false]);
        }
        $t = count($to) === 1 ? $this->phone->direct($from, $to[0]) : $this->phone->group($from, $to, null, true);
        $m = $this->phone->post($t, $from->id, [
            'kind' => 'call',
            'meta' => ['end' => $data['end'], 'secs' => $data['secs'], 'video' => $data['video'], 'from' => $from->id],
        ]);

        return response()->json(['message' => $this->phone->shapeMessage($m)]);
    }

    private function visible(int $threadId, User $user): Thread
    {
        $t = Thread::find($threadId);
        abort_unless($t && $this->phone->canSee($t, $user->id), 404);

        return $t;
    }
}
