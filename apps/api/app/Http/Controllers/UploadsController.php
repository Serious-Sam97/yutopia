<?php

namespace App\Http\Controllers;

use App\Models\Game;
use App\Models\Upload;
use App\Models\User;
use App\Services\GameSystems as Sys;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;

// Bringing a game in chunks (docs/plan/23-disc-console.md): a disc is hundreds of
// MB and maybe several files (a .cue and its tracks), more than one request
// carries. Start says what's coming; each file comes in CHUNK-sized pieces, in any
// order, any number of times; the status says which pieces are here (to carry on
// after a dropped connection or a reload); finish puts the files together, checks
// them and puts the game on the shelf.
class UploadsController extends Controller
{
    private const OPEN_MAX = 3; // uploads on their way, per person

    public function start(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'system' => ['required', 'string', 'in:'.implode(',', array_keys(Sys::SYSTEMS))],
            'title' => ['required', 'string', 'max:60'],
            'color' => ['required', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'players' => ['nullable', 'integer', 'min:1', 'max:2'],
            'files' => ['required', 'array', 'min:1', 'max:'.Sys::MAX_FILES],
            'files.*.name' => ['required', 'string', 'max:120'],
            'files.*.size' => ['required', 'integer', 'min:1'],
        ]);
        $files = array_map(fn ($f) => ['name' => $f['name'], 'size' => (int) $f['size']], $data['files']);
        $why = Sys::filesFit($data['system'], $files, $ordered);
        abort_if($why !== null, 422, $why ?? '');
        $bytes = array_sum(array_column($files, 'size'));
        abort_if($this->used($data['system']) + $bytes > $this->quota($data['system']), 422, Sys::isDisc($data['system'])
            ? 'The disc rack is full: remove a disc first.'
            : 'The shelf is full: remove a cartridge first.');
        // at most a few on their way per person: a new one drops the stalest (left behind, most likely)
        $open = Upload::where('user_id', $user->id)->oldest('updated_at')->get();
        foreach ($open->take(max(0, $open->count() - self::OPEN_MAX + 1)) as $old) {
            self::drop($old);
        }

        $up = Upload::create([
            'user_id' => $user->id,
            'system' => $data['system'],
            'title' => trim($data['title']),
            'color' => strtolower($data['color']),
            'players' => min(Sys::SYSTEMS[$data['system']][2], (int) ($data['players'] ?? 1)),
            'files' => $ordered,
            'bytes' => $bytes,
        ]);

        return response()->json(['upload' => $this->shape($up)], 201);
    }

    // which pieces are here
    public function show(Request $request, string $uploadId): JsonResponse
    {
        return response()->json(['upload' => $this->shape($this->mine($request, $uploadId))]);
    }

    // one piece: the body is the bytes, exactly CHUNK long (the last of a file: what's left)
    public function chunk(Request $request, string $uploadId, int $file, int $n): JsonResponse
    {
        $up = $this->mine($request, $uploadId);
        $f = $up->files[$file] ?? null;
        abort_unless($f && $n >= 0 && $n < $this->chunks($f['size']), 404);
        $want = min(Sys::CHUNK, $f['size'] - $n * Sys::CHUNK);
        $body = $request->getContent();
        abort_unless(strlen($body) === $want, 422, "That piece should be {$want} bytes.");
        Storage::disk('local')->put($this->piece($up, $file, $n), $body);
        $up->touch();

        return response()->json(['ok' => true]);
    }

    // all the pieces here: the files put together, checked, the game on the shelf
    public function finish(Request $request, string $uploadId): JsonResponse
    {
        $up = $this->mine($request, $uploadId);
        $lock = Cache::lock("yutopia-upload-{$up->id}", 600);
        abort_unless($lock->get(), 409, 'It\'s being put together already.');
        try {
            return $this->assemble($up, $request->user());
        } finally {
            $lock->release();
        }
    }

    public function cancel(Request $request, string $uploadId): JsonResponse
    {
        self::drop($this->mine($request, $uploadId));

        return response()->json(['ok' => true]);
    }

    // An upload and its pieces, gone (also the hourly clean-up of stale ones).
    public static function drop(Upload $up): void
    {
        Storage::disk('local')->deleteDirectory("uploads/{$up->id}");
        $up->delete();
    }

    private function assemble(Upload $up, User $user): JsonResponse
    {
        $disk = Storage::disk('local');
        foreach ($up->files as $i => $f) {
            for ($n = 0; $n < $this->chunks($f['size']); $n++) {
                abort_unless($disk->exists($this->piece($up, $i, $n)), 422, "{$f['name']} isn't all here yet.");
            }
        }
        // the files, whole, in a folder of their own; the hash runs over all of them in order
        $work = "uploads/{$up->id}/whole";
        $disk->makeDirectory($work);
        $sha = hash_init('sha1');
        foreach ($up->files as $i => $f) {
            $out = fopen($disk->path("{$work}/{$f['name']}"), 'wb');
            for ($n = 0; $n < $this->chunks($f['size']); $n++) {
                $in = fopen($disk->path($this->piece($up, $i, $n)), 'rb');
                hash_update_stream($sha, $in);
                rewind($in);
                stream_copy_to_stream($in, $out);
                fclose($in);
                $disk->delete($this->piece($up, $i, $n));
            }
            fclose($out);
            if (filesize($disk->path("{$work}/{$f['name']}")) !== $f['size']) {
                self::drop($up);
                abort(422, "{$f['name']} didn't come out the right size: bring it again.");
            }
        }
        $sha1 = hash_final($sha);
        $why = Sys::isDisc($up->system) ? Sys::checkDisc($disk->path($work), $up->files) : null;
        $dupe = Game::where('sha1', $sha1)->exists();
        if ($why !== null || $dupe) {
            self::drop($up);
            abort(422, $why ?? 'That game is already on the shelf.');
        }

        // one file: next to the other cartridges; several: a folder
        $several = count($up->files) > 1;
        $main = $up->files[0]['name'];
        $path = $several ? "games/{$sha1}" : "games/{$sha1}.".Sys::ext($main);
        $disk->delete($path);
        $disk->deleteDirectory($path);
        $several ? $disk->move($work, $path) : $disk->move("{$work}/{$main}", $path);
        $game = Game::create([
            'uploaded_by' => $user->id,
            'system' => $up->system,
            'title' => $up->title,
            'color' => $up->color,
            'players' => $up->players,
            'file_name' => mb_substr($main, 0, 120),
            'path' => $path,
            'files' => $several ? array_map(fn ($f) => ['name' => $f['name'], 'bytes' => $f['size']], $up->files) : null,
            'bytes' => $up->bytes,
            'sha1' => $sha1,
        ]);
        self::drop($up);

        return response()->json(['game' => $game->shapeFor($user)], 201);
    }

    private function shape(Upload $up): array
    {
        $here = collect(Storage::disk('local')->files("uploads/{$up->id}"))->map(fn ($p) => basename($p))->flip();

        return [
            'id' => $up->id,
            'system' => $up->system,
            'title' => $up->title,
            'chunk' => Sys::CHUNK,
            'files' => array_map(fn ($i, $f) => [
                'name' => $f['name'],
                'size' => $f['size'],
                'chunks' => $this->chunks($f['size']),
                'have' => array_values(array_filter(range(0, $this->chunks($f['size']) - 1), fn ($n) => $here->has("{$i}.{$n}"))),
            ], array_keys($up->files), $up->files),
        ];
    }

    private function chunks(int $size): int
    {
        return (int) ceil($size / Sys::CHUNK);
    }

    private function piece(Upload $up, int $file, int $n): string
    {
        return "uploads/{$up->id}/{$file}.{$n}";
    }

    // what the world keeps of that kind already (games, and uploads on their way)
    private function used(string $system): int
    {
        $discs = Sys::DISCS;
        $kind = fn ($q) => Sys::isDisc($system) ? $q->whereIn('system', $discs) : $q->whereNotIn('system', $discs);

        return (int) $kind(Game::query())->sum('bytes') + (int) $kind(Upload::query())->sum('bytes');
    }

    private function quota(string $system): int
    {
        return Sys::isDisc($system) ? Sys::discQuota() : Sys::CARTRIDGE_QUOTA;
    }

    private function mine(Request $request, string $uploadId): Upload
    {
        $up = Upload::where('user_id', $request->user()->id)->find($uploadId);
        abort_unless($up, 404);

        return $up;
    }
}
