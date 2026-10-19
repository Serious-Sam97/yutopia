<?php

namespace App\Services;

use Illuminate\Database\ConnectionInterface;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Throwable;

/*
| The one-off move off Yondra (docs/plan/24-standalone.md §7): reads Yondra's
| yutopia_* tables (the `yondra` connection, read-only) and its files
| (storage/app/private/yutopia), and writes them here as the one world.
|
| plan() reads everything and decides what comes along; it writes nothing (the dry
| run prints it). run() copies the files (checked by size and sha1), then writes
| every row in one transaction, counts them against the plan and rolls back on a
| mismatch. Ids are kept everywhere — messages, games ("u:<id>"), photos, pets'
| bonds, rooms' and desks' owners, VortexOS links all point at them — and the id
| sequences move past them (users: past every Yondra user, so nobody new inherits
| the id of someone who stayed behind).
*/
class YondraImport
{
    // where files go, by Yondra's folder (yutopia/<kind>/<space or person>/…)
    private const SPACED = ['games', 'saves', 'bios'];

    /** @var array{world: int, users: string, games: string, threads: string, storage: ?string} */
    private array $opt;

    private ConnectionInterface $y;

    public function __construct(private readonly WorldServer $worldServer) {}

    /** @param array{world: int, users?: string, games?: string, threads?: string, storage?: ?string} $opt */
    public function plan(array $opt): array
    {
        $this->opt = $opt + ['users' => 'yutopia', 'games' => 'world', 'threads' => 'keep', 'storage' => null];
        $this->y = DB::connection('yondra');
        $world = (int) $this->opt['world'];
        $space = $this->y->table('yutopia_spaces')->where('id', $world)->first();
        if (! $space) {
            throw new RuntimeException("Yondra has no Yutopia space {$world}.");
        }

        $spaces = $this->y->table('yutopia_spaces')->orderBy('id')->get()->map(fn ($s) => [
            'id' => (int) $s->id,
            'name' => $s->name,
            'layout' => $s->layout !== null,
            'objects' => $this->y->table('yutopia_objects')->where('space_id', $s->id)->count(),
            'games' => $this->y->table('yutopia_games')->where('space_id', $s->id)->count(),
            'bios' => $this->y->table('yutopia_bios')->where('space_id', $s->id)->count(),
            'saves' => $this->y->table('yutopia_game_saves')->where('space_id', $s->id)->count(),
            'spawns' => $this->y->table('yutopia_spawns')->where('space_id', $s->id)->count(),
            'desks' => $this->y->table('yutopia_desks')->where('space_id', $s->id)->count(),
            'playlists' => count($this->json($s->settings)['playlists'] ?? []),
            'thread' => $this->y->table('yutopia_messages')
                ->whereIn('thread_id', $this->y->table('yutopia_threads')->where('kind', 'space')->where('space_id', $s->id)->pluck('id'))
                ->count(),
        ])->all();

        // ── who comes along ─────────────────────────────────────────────────
        $allUsers = $this->y->table('users')->orderBy('id')->get(['id', 'name', 'email', 'password', 'email_verified_at', 'remember_token', 'created_at', 'updated_at']);
        $ids = $this->opt['users'] === 'all' ? $allUsers->pluck('id') : $this->usersWithData();
        $users = $allUsers->whereIn('id', $ids->map(fn ($i) => (int) $i)->all())->values();
        $in = $users->pluck('id')->map(fn ($i) => (int) $i)->flip();
        $has = fn ($uid) => $uid !== null && isset($in[(int) $uid]);

        // ── the world ───────────────────────────────────────────────────────
        $layout = $this->json($space->layout);
        $cleared = [];
        foreach ($layout['areas'] ?? [] as $k => $a) {
            if (isset($a['ownerId']) && ! $has($a['ownerId'])) {
                $cleared[] = "room \"{$a['name']}\" (owner #{$a['ownerId']})";
                $layout['areas'][$k]['ownerId'] = null;
                $layout['areas'][$k]['ownerName'] = null;
            }
        }
        $objects = $this->y->table('yutopia_objects')->where('space_id', $world)->orderBy('id')->get()->map(function ($o) use ($has, &$cleared) {
            $props = $this->json($o->props);
            if (isset($props['ownerId']) && ! $has($props['ownerId'])) {
                $cleared[] = "{$o->kind} {$o->uid} (owner #{$props['ownerId']})";
                unset($props['ownerId'], $props['ownerName']);
            }

            return [
                'uid' => $o->uid, 'kind' => $o->kind, 'x' => (int) $o->x, 'y' => (int) $o->y, 'rot' => (int) $o->rot,
                'ref_id' => $o->ref_id, 'props' => $props ? json_encode($props) : null,
                'created_at' => $o->created_at, 'updated_at' => $o->updated_at,
            ];
        })->all();
        $settings = $this->json($space->settings);
        $desks = $this->rows('yutopia_desks', fn ($q) => $q->where('space_id', $world))->filter(fn ($d) => $has($d['user_id']))
            ->map(fn ($d) => $this->only($d, ['user_id', 'desk_uid', 'created_at', 'updated_at']))->values()->all();
        $spawns = $this->rows('yutopia_spawns', fn ($q) => $q->where('space_id', $world))->filter(fn ($d) => $has($d['user_id']))
            ->map(fn ($d) => $this->only($d, ['user_id', 'x', 'y', 'created_at', 'updated_at']))->values()->all();

        // ── the game room ───────────────────────────────────────────────────
        $spaceOrder = fn ($q) => $this->opt['games'] === 'all'
            ? $q->orderByRaw('case when space_id = ? then 0 else 1 end', [$world])->orderBy('id')
            : $q->where('space_id', $world)->orderBy('id');
        $games = $this->rows('yutopia_games', $spaceOrder)->unique('sha1')->values();
        $gameIds = $games->pluck('id')->map(fn ($i) => (int) $i)->flip();
        // (one save per game: the newest, wherever it was played)
        $saves = $this->rows('yutopia_game_saves', fn ($q) => $spaceOrder($q)->reorder()->orderByDesc('updated_at')->orderBy('id'))
            ->filter(fn ($s) => ! str_starts_with($s['game'], 'u:') || isset($gameIds[(int) substr($s['game'], 2)]))
            ->unique('game')->values();
        $bios = $this->rows('yutopia_bios', $spaceOrder)->unique('md5')->values();

        // ── per person ──────────────────────────────────────────────────────
        $mine = fn (string $t, array $cols) => $this->rows($t, fn ($q) => $q->orderBy('id'))
            ->filter(fn ($r) => $has($r['user_id']))->map(fn ($r) => $this->only($r, $cols))->values()->all();
        $avatars = $mine('yutopia_avatars', ['id', 'user_id', 'layers', 'created_at', 'updated_at']);
        $setups = $mine('yutopia_setups', ['id', 'user_id', 'name', 'items', 'created_at', 'updated_at']);
        $pets = $mine('yutopia_pets', ['id', 'user_id', 'species', 'name', 'look', 'outfit', 'needs', 'xp', 'tricks', 'traits', 'memory', 'bonds', 'alive', 'wins', 'losses', 'born_at', 'died_at', 'seen_at', 'created_at', 'updated_at']);
        $phones = $mine('yutopia_phones', ['id', 'user_id', 'settings', 'created_at', 'updated_at']);
        $contacts = collect($mine('yutopia_contacts', ['id', 'user_id', 'contact_id', 'created_at', 'updated_at']))
            ->filter(fn ($c) => $has($c['contact_id']))->values()->all();
        $photos = collect($mine('yutopia_photos', ['id', 'user_id', 'path', 'kind', 'mime', 'w', 'h', 'secs', 'bytes', 'filter', 'selfie', 'sent', 'where', 'created_at', 'updated_at']));
        $photoIds = $photos->pluck('id')->map(fn ($i) => (int) $i)->flip();

        // ── the phone's threads ─────────────────────────────────────────────
        $threads = [];
        $members = [];
        $messages = [];
        foreach ($this->rows('yutopia_threads', fn ($q) => $q->orderBy('id')) as $t) {
            $isWorld = $t['kind'] === 'space' && (int) $t['space_id'] === $world;
            if ($t['kind'] === 'space' && ! $isWorld && $this->opt['threads'] === 'drop') {
                continue;
            }
            $rows = $this->rows('yutopia_thread_members', fn ($q) => $q->where('thread_id', $t['id'])->orderBy('id'))->filter(fn ($m) => $has($m['user_id']));
            if (! $isWorld && $rows->isEmpty()) {
                continue; // nobody of theirs comes along
            }
            $msgs = $this->rows('yutopia_messages', fn ($q) => $q->where('thread_id', $t['id'])->orderBy('id'))
                ->filter(fn ($m) => $m['user_id'] === null || $has($m['user_id']));
            $threads[] = [
                'id' => $t['id'],
                'kind' => $isWorld ? 'everyone' : ($t['kind'] === 'space' ? 'group' : $t['kind']),
                'name' => $isWorld ? null : ($t['kind'] === 'space' ? mb_substr((string) $t['name'], 0, 60) : $t['name']),
                'direct_key' => $t['direct_key'],
                'created_by' => $has($t['created_by']) ? $t['created_by'] : null,
                'last_message_at' => $t['last_message_at'],
                'created_at' => $t['created_at'],
                'updated_at' => $t['updated_at'],
            ];
            foreach ($rows as $m) {
                $members[] = $this->only($m, ['thread_id', 'user_id', 'last_read_id', 'muted', 'left_at', 'created_at', 'updated_at']);
            }
            // everyone in the world's thread: the ones who never opened it, with what came before read
            if ($isWorld) {
                $last = (int) ($msgs->max('id') ?? 0);
                foreach ($users as $u) {
                    if (! $rows->contains(fn ($m) => (int) $m['user_id'] === (int) $u->id)) {
                        $members[] = ['thread_id' => $t['id'], 'user_id' => $u->id, 'last_read_id' => $last, 'muted' => false, 'left_at' => null, 'created_at' => now(), 'updated_at' => now()];
                    }
                }
            }
            foreach ($msgs as $m) {
                $row = $this->only($m, ['id', 'thread_id', 'user_id', 'kind', 'body', 'photo_id', 'meta', 'reactions', 'reply_to', 'created_at', 'updated_at']);
                if ($row['photo_id'] !== null && ! isset($photoIds[(int) $row['photo_id']])) {
                    $row['photo_id'] = null;
                }
                $messages[] = $row;
            }
        }

        // ── files ───────────────────────────────────────────────────────────
        $files = [];
        $move = function (string $path, string $what) use (&$files) {
            $to = $this->target($path);
            $files[] = ['from' => $path, 'to' => $to, 'what' => $what];

            return $to;
        };
        $games = $games->map(fn ($g) => ['path' => $move($g['path'], "game {$g['title']}")] + $g)
            ->map(fn ($g) => $this->only($g, ['id', 'uploaded_by', 'system', 'title', 'color', 'players', 'file_name', 'path', 'files', 'bytes', 'sha1', 'created_at', 'updated_at']))
            ->map(fn ($g) => ['uploaded_by' => $has($g['uploaded_by']) ? $g['uploaded_by'] : null] + $g)->all();
        $saves = $saves->map(function ($s) use ($move, $has) {
            foreach (['state_path', 'sram_path'] as $k) {
                if ($s[$k]) {
                    $s[$k] = $move($s[$k], "save {$s['game']}");
                }
            }

            return ['updated_by' => $has($s['updated_by']) ? $s['updated_by'] : null] + $this->only($s, ['game', 'state_path', 'sram_path', 'updated_by', 'created_at', 'updated_at']);
        })->all();
        $bios = $bios->map(fn ($b) => ['path' => $move($b['path'], "BIOS {$b['file_name']}"), 'uploaded_by' => $has($b['uploaded_by']) ? $b['uploaded_by'] : null]
            + $this->only($b, ['id', 'system', 'md5', 'file_name', 'created_at', 'updated_at']))->all();
        $photos = $photos->map(fn ($p) => ['path' => $move($p['path'], "photo #{$p['id']}")] + $p)->all();
        $this->measure($files);

        return [
            'options' => $this->opt,
            'spaces' => $spaces,
            'world' => [
                'from' => ['id' => (int) $space->id, 'name' => $space->name],
                'map_key' => $space->map_key ?: 'studio',
                'layout' => $layout ?: null,
                'settings' => isset($settings['playlists']) ? ['playlists' => $settings['playlists']] : null,
                'seeded_at' => $space->seeded_at,
            ],
            'yondraUsers' => $allUsers->count(),
            'maxUserId' => (int) ($allUsers->max('id') ?? 0),
            'users' => $users->map(fn ($u) => (array) $u)->all(),
            'objects' => $objects,
            'desks' => $desks,
            'spawns' => $spawns,
            'games' => $games,
            'saves' => $saves,
            'bios' => $bios,
            'avatars' => $avatars,
            'setups' => $setups,
            'pets' => $pets,
            'phones' => $phones,
            'contacts' => $contacts,
            'photos' => $photos,
            'threads' => $threads,
            'members' => $members,
            'messages' => $messages,
            'files' => $files,
            'cleared' => $cleared,
        ];
    }

    /** The plan as the dry run prints it. @return string[] */
    public function report(array $p): array
    {
        $mb = fn (int $b) => number_format($b / 1048576, 1).' MB';
        $out = ['Yondra → Yutopia import'.($this->opt['storage'] ? '' : ' (no --storage: files not checked)'), '', 'Spaces in Yondra:'];
        foreach ($p['spaces'] as $s) {
            $tag = $s['id'] === $p['world']['from']['id'] ? '← THE WORLD' : ($s['objects'] + $s['games'] + $s['bios'] + $s['thread'] ? '(left behind)' : '(empty)');
            $out[] = sprintf('  #%d %s %s · %s · %d objects · %d games · %d BIOS · %d saves · %d spawns · %d desks · %d playlists · space thread %d messages',
                $s['id'], $s['name'], $tag, $s['layout'] ? 'own map' : 'built-in map', $s['objects'], $s['games'], $s['bios'], $s['saves'], $s['spawns'], $s['desks'], $s['playlists'], $s['thread']);
        }
        $out[] = '';
        $out[] = sprintf('People (--users=%s): %d of %d Yondra accounts, ids kept, passwords kept; ids continue after #%d',
            $p['options']['users'], count($p['users']), $p['yondraUsers'], $p['maxUserId']);
        foreach ($p['users'] as $u) {
            $out[] = "  #{$u['id']} {$u['name']} <{$u['email']}>";
        }
        $out[] = '';
        $out[] = sprintf('The world (from #%d %s): %s map · %d objects · %d desks · %d own arrival points · %d playlists',
            $p['world']['from']['id'], $p['world']['from']['name'], $p['world']['layout'] ? 'its own' : 'the built-in', count($p['objects']), count($p['desks']), count($p['spawns']), count($p['world']['settings']['playlists'] ?? []));
        foreach ($p['cleared'] as $c) {
            $out[] = "  owner cleared (not coming along): {$c}";
        }
        $kinds = collect($p['threads'])->countBy('kind')->map(fn ($n, $k) => "{$n} {$k}")->implode(', ');
        $out[] = sprintf('Game room (--games=%s): %d games · %d saves · %d BIOS', $p['options']['games'], count($p['games']), count($p['saves']), count($p['bios']));
        $out[] = sprintf('Phone: %d phones · %d contacts · threads %s · %d members · %d messages · %d photos/videos',
            count($p['phones']), count($p['contacts']), $kinds ?: 'none', count($p['members']), count($p['messages']), count($p['photos']));
        $out[] = sprintf('Per person: %d avatars · %d setups · %d pets', count($p['avatars']), count($p['setups']), count($p['pets']));
        $bytes = array_sum(array_map(fn ($f) => $f['bytes'] ?? 0, $p['files']));
        $missing = array_filter($p['files'], fn ($f) => ($f['bytes'] ?? null) === null);
        $out[] = sprintf('Files: %d (%s)%s', count($p['files']), $mb($bytes), $this->opt['storage'] ? sprintf(', %d missing', count($missing)) : '');
        foreach ($missing as $f) {
            if ($this->opt['storage']) {
                $out[] = "  missing: {$f['from']} ({$f['what']})";
            }
        }

        return $out;
    }

    /** Copy the files, write the rows, check them. @return array<string, int> what was written */
    public function run(array $p, bool $fresh, callable $say): array
    {
        if (! $this->opt['storage']) {
            throw new RuntimeException('The files need --storage (Yondra\'s storage/app/private).');
        }
        $missing = array_filter($p['files'], fn ($f) => ($f['bytes'] ?? null) === null);
        if ($missing) {
            throw new RuntimeException(count($missing).' files are missing in Yondra\'s storage (see the dry run).');
        }
        if (! $fresh && $this->targetUsed()) {
            throw new RuntimeException('This database already has people or a world: --fresh wipes it first.');
        }

        $say('Copying '.count($p['files']).' files…');
        $this->copyFiles($p['files']);

        $held = $this->hold(true);
        try {
            $say('Writing the rows…');
            $counts = DB::transaction(function () use ($p, $fresh) {
                if ($fresh) {
                    $this->wipe();
                }
                $this->write($p);
                $counts = $this->counts();
                $want = [
                    'users' => count($p['users']), 'objects' => count($p['objects']), 'desks' => count($p['desks']),
                    'spawns' => count($p['spawns']), 'games' => count($p['games']), 'game_saves' => count($p['saves']),
                    'bios' => count($p['bios']), 'avatars' => count($p['avatars']), 'setups' => count($p['setups']),
                    'pets' => count($p['pets']), 'phones' => count($p['phones']), 'contacts' => count($p['contacts']),
                    'photos' => count($p['photos']), 'threads' => count($p['threads']), 'thread_members' => count($p['members']),
                    'messages' => count($p['messages']),
                ];
                foreach ($want as $t => $n) {
                    if ($counts[$t] !== $n) {
                        throw new RuntimeException("{$t}: wrote {$counts[$t]}, expected {$n}. Nothing was kept.");
                    }
                }

                return $counts;
            });
            $this->moveSequences($p['maxUserId']);
        } finally {
            if ($held) {
                $this->hold(false);
            }
        }

        return $counts;
    }

    // ── reading ─────────────────────────────────────────────────────────────

    // anyone with a Yutopia row of their own (in any space)
    private function usersWithData(): Collection
    {
        $ids = collect();
        foreach ([
            ['yutopia_avatars', 'user_id'], ['yutopia_pets', 'user_id'], ['yutopia_messages', 'user_id'],
            ['yutopia_photos', 'user_id'], ['yutopia_spawns', 'user_id'], ['yutopia_setups', 'user_id'],
            ['yutopia_phones', 'user_id'], ['yutopia_contacts', 'user_id'], ['yutopia_desks', 'user_id'],
            ['yutopia_thread_members', 'user_id'], ['yutopia_games', 'uploaded_by'], ['yutopia_bios', 'uploaded_by'],
        ] as [$t, $c]) {
            $ids = $ids->merge($this->y->table($t)->whereNotNull($c)->distinct()->pluck($c));
        }

        return $ids->map(fn ($i) => (int) $i)->unique()->values();
    }

    private function rows(string $table, callable $scope): Collection
    {
        return $scope($this->y->table($table))->get()->map(fn ($r) => (array) $r);
    }

    private function only(array $row, array $keys): array
    {
        return array_intersect_key($row, array_flip($keys));
    }

    private function json(mixed $v): array
    {
        if (is_array($v)) {
            return $v;
        }

        return is_string($v) && $v !== '' ? (json_decode($v, true) ?? []) : [];
    }

    // yutopia/games/<space>/<sha1>.sfc → games/<sha1>.sfc · yutopia/photos/<uid>/x.jpg → photos/<uid>/x.jpg
    private function target(string $path): string
    {
        $parts = explode('/', $path);
        if (($parts[0] ?? '') !== 'yutopia' || count($parts) < 3) {
            throw new RuntimeException("Unexpected Yondra file path: {$path}");
        }
        array_shift($parts);
        if (in_array($parts[0], self::SPACED, true)) {
            array_splice($parts, 1, 1);
        }

        return implode('/', $parts);
    }

    private function source(string $path): string
    {
        return rtrim((string) $this->opt['storage'], '/').'/'.$path;
    }

    // the size of what each file entry is (a disc in several files: its folder)
    private function measure(array &$files): void
    {
        foreach ($files as &$f) {
            $f['bytes'] = null;
            if (! $this->opt['storage']) {
                continue;
            }
            $src = $this->source($f['from']);
            if (is_file($src)) {
                $f['bytes'] = filesize($src);
            } elseif (is_dir($src)) {
                $f['bytes'] = array_sum(array_map('filesize', $this->filesIn($src)));
            }
        }
    }

    /** @return string[] */
    private function filesIn(string $dir): array
    {
        $out = [];
        foreach (new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS)) as $f) {
            $out[] = $f->getPathname();
        }
        sort($out);

        return $out;
    }

    // ── writing ─────────────────────────────────────────────────────────────

    private function copyFiles(array $files): void
    {
        $disk = Storage::disk('local');
        foreach ($files as $f) {
            $src = $this->source($f['from']);
            $pairs = is_dir($src)
                ? array_map(fn ($s) => [$s, $f['to'].'/'.substr($s, strlen(rtrim($src, '/')) + 1)], $this->filesIn($src))
                : [[$src, $f['to']]];
            foreach ($pairs as [$from, $to]) {
                $dest = $disk->path($to);
                if (! is_dir(dirname($dest))) {
                    mkdir(dirname($dest), 0775, true);
                }
                if (! is_file($dest) || filesize($dest) !== filesize($from) || sha1_file($dest) !== sha1_file($from)) {
                    if (! copy($from, $dest)) {
                        throw new RuntimeException("Couldn't copy {$from}.");
                    }
                }
                if (filesize($dest) !== filesize($from) || sha1_file($dest) !== sha1_file($from)) {
                    throw new RuntimeException("{$to} didn't come out the same as {$from}.");
                }
            }
        }
    }

    private function write(array $p): void
    {
        foreach ($p['users'] as $u) {
            DB::table('users')->insert([
                'id' => $u['id'], 'name' => $u['name'], 'email' => mb_strtolower($u['email']), 'password' => $u['password'],
                'email_verified_at' => $u['email_verified_at'], 'remember_token' => null, 'is_admin' => false,
                'created_at' => $u['created_at'], 'updated_at' => $u['updated_at'],
            ]);
        }
        foreach (array_map('strtolower', config('yutopia.admins')) as $email) {
            DB::table('users')->where('email', $email)->update(['is_admin' => true]);
        }
        DB::table('world')->delete(); // (an empty one the world-server asked for meanwhile)
        DB::table('world')->insert([
            'name' => config('yutopia.world_name'),
            'map_key' => $p['world']['map_key'],
            'layout' => $p['world']['layout'] ? json_encode($p['world']['layout']) : null,
            'settings' => $p['world']['settings'] ? json_encode($p['world']['settings']) : null,
            'seeded_at' => $p['world']['seeded_at'] ?? now(),
            'created_at' => now(), 'updated_at' => now(),
        ]);
        foreach ([
            'objects' => $p['objects'], 'desks' => $p['desks'], 'spawns' => $p['spawns'], 'games' => $p['games'],
            'game_saves' => $p['saves'], 'bios' => $p['bios'], 'avatars' => $p['avatars'], 'setups' => $p['setups'],
            'pets' => $p['pets'], 'phones' => $p['phones'], 'contacts' => $p['contacts'], 'photos' => $p['photos'],
            'threads' => $p['threads'], 'thread_members' => $p['members'], 'messages' => $p['messages'],
        ] as $table => $rows) {
            foreach (array_chunk($rows, 200) as $chunk) {
                DB::table($table)->insert(array_map(fn ($r) => $this->bools($table, $r), $chunk));
            }
        }
    }

    // (Yondra's sqlite keeps booleans as 0/1; Postgres wants true/false)
    private function bools(string $table, array $r): array
    {
        $cols = ['pets' => ['alive'], 'photos' => ['selfie', 'sent'], 'thread_members' => ['muted']][$table] ?? [];
        foreach ($cols as $c) {
            if (array_key_exists($c, $r) && $r[$c] !== null) {
                $r[$c] = (bool) $r[$c];
            }
        }

        return $r;
    }

    private const TABLES = ['messages', 'thread_members', 'threads', 'photos', 'contacts', 'phones', 'pets', 'setups', 'avatars', 'bios', 'game_saves', 'uploads', 'games', 'spawns', 'desks', 'objects', 'world', 'invites', 'personal_access_tokens', 'password_reset_tokens', 'users'];

    private function wipe(): void
    {
        foreach (self::TABLES as $t) {
            DB::table($t)->delete();
        }
    }

    private function targetUsed(): bool
    {
        return DB::table('users')->exists() || DB::table('objects')->exists() || DB::table('messages')->exists();
    }

    /** @return array<string, int> */
    private function counts(): array
    {
        $out = [];
        foreach (array_diff(self::TABLES, ['invites', 'personal_access_tokens', 'password_reset_tokens', 'uploads', 'world']) as $t) {
            $out[$t] = DB::table($t)->count();
        }

        return $out;
    }

    // the next id of every table past what came in (users: past every Yondra user)
    private function moveSequences(int $maxUser): void
    {
        $driver = DB::connection()->getDriverName();
        foreach (['users', 'objects', 'desks', 'spawns', 'games', 'game_saves', 'bios', 'avatars', 'setups', 'pets', 'phones', 'contacts', 'photos', 'threads', 'thread_members', 'messages', 'world'] as $t) {
            $max = (int) DB::table($t)->max('id');
            if ($t === 'users') {
                $max = max($max, $maxUser);
            }
            if ($max < 1) {
                continue;
            }
            if ($driver === 'pgsql') {
                DB::statement("select setval(pg_get_serial_sequence('{$t}', 'id'), {$max})");
            } elseif ($driver === 'sqlite') {
                DB::table('sqlite_sequence')->updateOrInsert(['name' => $t], ['seq' => $max]);
            }
        }
    }

    // the live room (if any) closes while the world is written, as for a snapshot
    private function hold(bool $on): bool
    {
        if (! $this->worldServer->enabled()) {
            return false;
        }
        try {
            $this->worldServer->post('/internal/hold', ['hold' => $on], 15)->throw();

            return true;
        } catch (Throwable $e) {
            if ($on) {
                throw new RuntimeException('The world-server could not close the world: '.$e->getMessage());
            }

            return false;
        }
    }
}
