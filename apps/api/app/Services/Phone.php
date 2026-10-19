<?php

namespace App\Services;

use App\Models\Avatar;
use App\Models\Contact;
use App\Models\Message;
use App\Models\Phone as PhoneRow;
use App\Models\Thread;
use App\Models\ThreadMember;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/*
| Yutopia's phone, the API's half (docs/plan/21-cellphone.md): the settings
| someone keeps, their phone book (with where people are right now), threads and
| texts, and the live pushes (through the world-server, see Push). The world's
| own thread, "everyone", holds every account. Vortex is a contact too (his
| thread is yours alone; his lines are curated, in Vortex).
*/
class Phone
{
    public const DEFAULTS = [
        'case' => 'walnut', 'wallpaper' => 'portal', 'lockWallpaper' => 'portal', 'ringtone' => 'citypop',
        'textTone' => 'pop', 'tones' => [], 'theme' => 'dark', 'textSize' => 'normal', 'vibrate' => true,
        'favourites' => [], 'installed' => [],
    ];

    private const CASES = ['walnut', 'cream', 'rust', 'olive', 'graphite', 'brass', 'vortex'];

    private const RINGTONES = ['citypop', 'vortex', 'rewind', 'hifi', 'synthbass', 'arcade', 'bell', 'rotary', 'lofi', 'silent'];

    private const TEXT_TONES = ['pop', 'chime', 'tape', 'blip', 'glass', 'silent'];

    private const WALLPAPERS = ['portal', 'grid', 'golden', 'campus', 'vortex', 'tape', 'aurora', 'night', 'vhs', 'orb', 'dunes', 'static'];

    public function __construct(
        private readonly Presence $presence,
        private readonly Push $pushes,
    ) {}

    // ── settings ────────────────────────────────────────────────────────────
    public function settings(User $user): array
    {
        $row = PhoneRow::where('user_id', $user->id)->first();

        return $this->clean($row?->settings ?? []);
    }

    public function saveSettings(User $user, array $in): array
    {
        $settings = $this->clean($in);
        PhoneRow::updateOrCreate(['user_id' => $user->id], ['settings' => $settings]);

        return $settings;
    }

    // the same rules as shared/phone.ts parsePhoneSettings
    public function clean(array $in): array
    {
        $d = self::DEFAULTS;
        $wp = fn ($v) => is_string($v) && (in_array($v, self::WALLPAPERS, true) || preg_match('/^photo:\d{1,12}$/', $v));
        $tones = [];
        foreach (array_slice((array) ($in['tones'] ?? []), 0, 200, true) as $uid => $tone) {
            if (preg_match('/^\d{1,10}$/', (string) $uid) && in_array($tone, self::RINGTONES, true)) {
                $tones[(string) $uid] = $tone;
            }
        }
        $ids = fn ($v, $max) => array_slice(array_values(array_unique(array_map('intval', array_filter((array) $v, fn ($n) => is_int($n) && $n >= 0)))), 0, $max);

        return [
            'case' => in_array($in['case'] ?? null, self::CASES, true) ? $in['case'] : $d['case'],
            'wallpaper' => $wp($in['wallpaper'] ?? null) ? $in['wallpaper'] : $d['wallpaper'],
            'lockWallpaper' => $wp($in['lockWallpaper'] ?? null) ? $in['lockWallpaper'] : $d['lockWallpaper'],
            'ringtone' => in_array($in['ringtone'] ?? null, self::RINGTONES, true) ? $in['ringtone'] : $d['ringtone'],
            'textTone' => in_array($in['textTone'] ?? null, self::TEXT_TONES, true) ? $in['textTone'] : $d['textTone'],
            'tones' => (object) $tones,
            'theme' => ($in['theme'] ?? null) === 'light' ? 'light' : 'dark',
            'textSize' => in_array($in['textSize'] ?? null, ['small', 'large'], true) ? $in['textSize'] : 'normal',
            'vibrate' => is_bool($in['vibrate'] ?? null) ? $in['vibrate'] : $d['vibrate'],
            'favourites' => $ids($in['favourites'] ?? [], 12),
            'installed' => array_slice(array_values(array_filter((array) ($in['installed'] ?? []), fn ($s) => is_string($s) && preg_match('/^[a-z0-9-]{1,32}$/', $s))), 0, 40),
        ];
    }

    // ── people ──────────────────────────────────────────────────────────────
    /** My phone book: the people I added (by their user id), with where they are right now. */
    public function contacts(User $user): array
    {
        $ids = Contact::where('user_id', $user->id)->pluck('contact_id');

        return $this->people(User::whereIn('id', $ids)->get(['id', 'name']));
    }

    /** One person as the phone shows them (a lookup by id, or a contact). */
    public function person(User $u): array
    {
        return $this->people(collect([$u]))[0];
    }

    public function isContact(User $user, int $otherId): bool
    {
        return Contact::where('user_id', $user->id)->where('contact_id', $otherId)->exists();
    }

    /** Whom I may text or call: my contacts, and anyone I already have a conversation with. */
    public function reachable(User $user, int $otherId): bool
    {
        if ($this->isContact($user, $otherId)) {
            return true;
        }
        $key = min($user->id, $otherId).':'.max($user->id, $otherId);

        return Thread::where('direct_key', $key)->exists();
    }

    /**
     * Everyone online is in the one world, so "here" is just online; the area is
     * the room they're in (null in booths and focus mode, as the world-server sends it).
     *
     * @param  Collection<int, User>  $users
     */
    private function people(Collection $users): array
    {
        $looks = Avatar::whereIn('user_id', $users->pluck('id'))->pluck('layers', 'user_id');
        $where = $this->presence->byUser();

        return $users->map(function (User $u) use ($looks, $where) {
            $w = $where[$u->id] ?? null;

            return [
                'uid' => $u->id,
                'name' => $u->name,
                'avatar' => json_encode(array_merge(Avatars::DEFAULT, $looks[$u->id] ?? [])),
                'online' => $w !== null,
                'area' => $w['area'] ?? null,
                'status' => $w['status'] ?? 'offline',
                'here' => $w !== null,
            ];
        })->sortBy([['online', 'desc'], ['name', 'asc']])->values()->all();
    }

    // ── threads ─────────────────────────────────────────────────────────────
    public function everyone(): Thread
    {
        return Thread::firstOrCreate(['kind' => 'everyone'], ['name' => config('yutopia.world_name')]);
    }

    public function direct(User $a, int $b): Thread
    {
        $key = min($a->id, $b).':'.max($a->id, $b);

        return DB::transaction(function () use ($a, $b, $key) {
            $t = Thread::firstOrCreate(['direct_key' => $key], ['kind' => 'direct', 'created_by' => $a->id]);
            foreach ([$a->id, $b] as $uid) {
                ThreadMember::firstOrCreate(['thread_id' => $t->id, 'user_id' => $uid]);
            }

            return $t;
        });
    }

    public function vortex(User $user): Thread
    {
        $t = Thread::firstOrCreate(['direct_key' => 'vortex:'.$user->id], ['kind' => 'vortex', 'created_by' => $user->id]);
        ThreadMember::firstOrCreate(['thread_id' => $t->id, 'user_id' => $user->id]);

        return $t;
    }

    /** A group with these people (a call between them reuses the same one). */
    public function group(User $creator, array $uids, ?string $name, bool $byKey = false): Thread
    {
        $all = collect($uids)->push($creator->id)->map(fn ($u) => (int) $u)->unique()->sort()->values();
        $attrs = ['kind' => 'group', 'name' => $name ? mb_substr($name, 0, 60) : null, 'created_by' => $creator->id];
        $t = $byKey
            ? Thread::firstOrCreate(['direct_key' => 'g:'.substr(md5($all->implode(',')), 0, 24)], $attrs)
            : Thread::create($attrs);
        foreach ($all as $uid) {
            ThreadMember::firstOrCreate(['thread_id' => $t->id, 'user_id' => $uid]);
        }

        return $t;
    }

    /** Who is in a thread (user ids): its members, or for "everyone" every account. @return int[] */
    public function inThread(Thread $t): array
    {
        if ($t->kind === 'everyone') {
            return User::pluck('id')->map(fn ($u) => (int) $u)->all();
        }

        return $t->members()->whereNull('left_at')->pluck('user_id')->map(fn ($u) => (int) $u)->all();
    }

    public function canSee(Thread $t, int $uid): bool
    {
        return $t->kind === 'everyone' || $t->members()->where('user_id', $uid)->whereNull('left_at')->exists();
    }

    // (someone new to Yutopia is put in "everyone" when their account is made, with
    // what came before read, see User::booted; a row missing here means the
    // messages since are theirs to read)
    public function member(Thread $t, int $uid): ThreadMember
    {
        return ThreadMember::firstOrCreate(['thread_id' => $t->id, 'user_id' => $uid]);
    }

    /** The threads someone sees: theirs, and "everyone". */
    public function threads(User $user): array
    {
        $this->member($this->everyone(), $user->id);
        $ids = ThreadMember::where('user_id', $user->id)->whereNull('left_at')->pluck('thread_id');
        $threads = Thread::whereIn('id', $ids)->orderByDesc('last_message_at')->limit(100)->get();

        return $threads->map(fn (Thread $t) => $this->shapeThread($t, $user->id))->values()->all();
    }

    public function shapeThread(Thread $t, int $uid): array
    {
        $member = ThreadMember::where('thread_id', $t->id)->where('user_id', $uid)->first();
        $readId = (int) ($member?->last_read_id ?? 0);
        $last = $t->messages()->with('photo')->latest('id')->first();
        $unread = $t->messages()->where('id', '>', $readId)
            ->where(fn ($q) => $q->whereNull('user_id')->orWhere('user_id', '!=', $uid))->count();
        $everyone = $t->kind === 'everyone';
        $members = $everyone ? [] : $t->members()->whereNull('left_at')->where('user_id', '!=', $uid)->pluck('user_id')->map(fn ($u) => (int) $u)->all();
        $read = $everyone ? [] : $t->members()->pluck('last_read_id', 'user_id')->map(fn ($v) => (int) $v)->all();
        $name = match ($t->kind) {
            'everyone' => $t->name ?: config('yutopia.world_name'),
            'group' => $t->name ?: User::whereIn('id', array_slice($members, 0, 3))->pluck('name')->map(fn ($n) => strtok((string) $n, ' '))->implode(', '),
            'vortex' => 'Vortex',
            default => '',
        };

        // who they are (a name and a face for people not in my contacts)
        $looks = Avatar::whereIn('user_id', $members)->pluck('layers', 'user_id');
        $who = User::whereIn('id', $members)->get(['id', 'name'])->mapWithKeys(fn (User $u) => [$u->id => [
            'name' => $u->name,
            'avatar' => json_encode(array_merge(Avatars::DEFAULT, $looks[$u->id] ?? [])),
        ]]);

        return [
            'id' => $t->id,
            'kind' => $t->kind,
            'name' => (string) $name,
            'members' => $members,
            'who' => (object) $who->all(),
            'unread' => min(99, $unread),
            'last' => $last ? $this->shapeMessage($last) : null,
            'muted' => (bool) ($member?->muted ?? false),
            'read' => (object) $read,
        ];
    }

    public function shapeMessage(Message $m): array
    {
        return [
            'id' => $m->id,
            'thread_id' => $m->thread_id,
            'user_id' => $m->user_id,
            'kind' => $m->kind,
            'body' => $m->body,
            'photo' => $m->photo?->toPhone(),
            'meta' => $m->meta,
            'reactions' => (object) ($m->reactions ?? []),
            'reply_to' => $m->reply_to,
            'at' => $m->created_at->getTimestampMs(),
        ];
    }

    // ── texts ───────────────────────────────────────────────────────────────
    /** Write a message into a thread and push it to everyone in it (not the sender). */
    public function post(Thread $t, ?int $from, array $data): Message
    {
        $m = Message::create([
            'thread_id' => $t->id,
            'user_id' => $from,
            'kind' => $data['kind'] ?? 'text',
            'body' => $data['body'] ?? null,
            'photo_id' => $data['photo_id'] ?? null,
            'meta' => $data['meta'] ?? null,
            'reply_to' => $data['reply_to'] ?? null,
        ]);
        $t->forceFill(['last_message_at' => now()])->save();
        if ($from) {
            ThreadMember::where('thread_id', $t->id)->where('user_id', $from)->update(['last_read_id' => $m->id]);
        }
        $m->load('photo');
        $shaped = $this->shapeMessage($m);
        foreach ($this->inThread($t) as $uid) {
            if ($uid === $from && ($data['kind'] ?? 'text') !== 'call') {
                continue;
            }
            $this->push($uid, ['type' => 'message', 'message' => $shaped, 'thread' => $this->shapeThread($t, $uid)]);
        }

        return $m;
    }

    public function push(int $uid, array $payload): void
    {
        $this->pushes->send($uid, $payload);
    }

    public function pushAll(Thread $t, array $payload, ?int $except = null): void
    {
        foreach ($this->inThread($t) as $uid) {
            if ($uid !== $except) {
                $this->push($uid, $payload);
            }
        }
    }
}
