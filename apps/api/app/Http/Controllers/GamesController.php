<?php

namespace App\Http\Controllers;

use App\Models\Game;
use App\Models\GameSave;
use App\Services\GameSystems as Sys;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\Response;

// The game room: the cartridges people bring to the world (ROMs they own —
// Yutopia never ships commercial games; the built-in, openly licensed ones are
// served by the client) and the saves of every game played there. Only the person
// about to run a game downloads its ROM (everyone else watches the TV). Discs
// (hundreds of MB, maybe several files) come in chunks through UploadsController;
// here they're listed, served (with Range, so a download can carry on) and taken
// away like cartridges. Who brought it, or an admin, takes it away.
class GamesController extends Controller
{
    private const STATE_MAX = 8 * 1024 * 1024;

    private const SRAM_MAX = 1024 * 1024;

    private const GAME_KEY = '/^(b:[a-z0-9-]{1,32}|u:\d{1,10})$/';

    public function index(Request $request): JsonResponse
    {
        return response()->json(['games' => Game::latest('id')->get()->map->shapeFor($request->user())]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'file' => ['required', 'file', 'max:8192'],
            'system' => ['required', 'string', 'in:'.implode(',', array_diff(array_keys(Sys::SYSTEMS), Sys::DISCS))],
            'title' => ['required', 'string', 'max:60'],
            'color' => ['required', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'players' => ['nullable', 'integer', 'min:1', 'max:2'],
        ]);
        [$exts, $max, $ports] = Sys::SYSTEMS[$data['system']];
        $file = $request->file('file');
        $name = $file->getClientOriginalName();
        $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
        $bytes = (int) $file->getSize();
        abort_unless(in_array($ext, $exts, true), 422, 'That file isn\'t a cartridge for this console.');
        abort_if($bytes <= 0 || $bytes > $max, 422, 'That cartridge is too big for this console.');
        $used = (int) Game::whereNotIn('system', Sys::DISCS)->sum('bytes');
        abort_if($used + $bytes > Sys::CARTRIDGE_QUOTA, 422, 'The shelf is full: remove a cartridge first.');
        $sha1 = sha1_file($file->getRealPath());
        abort_if(Game::where('sha1', $sha1)->exists(), 422, 'That cartridge is already on the shelf.');
        $path = $file->storeAs('games', "{$sha1}.{$ext}", 'local');

        $game = Game::create([
            'uploaded_by' => $user->id,
            'system' => $data['system'],
            'title' => trim($data['title']),
            'color' => strtolower($data['color']),
            'players' => min($ports, (int) ($data['players'] ?? 1)),
            'file_name' => mb_substr($name, 0, 120),
            'path' => $path,
            'bytes' => $bytes,
            'sha1' => $sha1,
        ]);

        return response()->json(['game' => $game->shapeFor($user)], 201);
    }

    public function destroy(Request $request, int $gameId): JsonResponse
    {
        $user = $request->user();
        $game = Game::findOrFail($gameId);
        abort_unless($game->uploaded_by === $user->id || $user->is_admin, 403, 'Only who brought it (or an admin) can take it away.');
        $game->files ? Storage::disk('local')->deleteDirectory($game->path) : Storage::disk('local')->delete($game->path);
        $save = GameSave::where('game', "u:{$game->id}")->first();
        if ($save) {
            Storage::disk('local')->delete(array_filter([$save->state_path, $save->sram_path]));
            $save->delete();
        }
        $game->delete();

        return response()->json(['ok' => true]);
    }

    // A game's file (for a disc in several files, the one the core opens).
    public function rom(int $gameId): Response
    {
        return $this->file($gameId, 0);
    }

    // One of a game's files, by its place in `files` (Range works: a big one
    // can carry on where it stopped). Never changes: cached for good.
    public function file(int $gameId, int $index): Response
    {
        $game = Game::findOrFail($gameId);
        $path = $game->files ? ($game->files[$index]['name'] ?? null) : ($index === 0 ? '' : null);
        abort_if($path === null, 404);
        $path = $game->files ? "{$game->path}/{$path}" : $game->path;
        abort_unless(Storage::disk('local')->exists($path), 404);

        return new BinaryFileResponse(Storage::disk('local')->path($path), 200, [
            'Content-Type' => 'application/octet-stream',
            'Cache-Control' => 'private, max-age=31536000, immutable',
        ]);
    }

    // Where a game left off: which saves there are.
    public function saveInfo(string $game): JsonResponse
    {
        $save = $this->saveRow($game);

        return response()->json([
            'state' => (bool) $save?->state_path,
            'sram' => (bool) $save?->sram_path,
            'updatedAt' => $save?->updated_at?->toIso8601String(),
        ]);
    }

    public function saveFile(string $game, string $kind): Response
    {
        $save = $this->saveRow($game);
        $path = $kind === 'state' ? $save?->state_path : $save?->sram_path;
        abort_unless($path && Storage::disk('local')->exists($path), 404);

        return Storage::disk('local')->response($path, "{$kind}.bin", [
            'Content-Type' => 'application/octet-stream',
            'Cache-Control' => 'no-store',
        ]);
    }

    public function putSave(Request $request, string $game): JsonResponse
    {
        $this->checkGameKey($game);
        $request->validate([
            'state' => ['nullable', 'file', 'max:'.(self::STATE_MAX / 1024)],
            'sram' => ['nullable', 'file', 'max:'.(self::SRAM_MAX / 1024)],
        ]);
        abort_unless($request->hasFile('state') || $request->hasFile('sram'), 422, 'Nothing to save.');
        $dir = 'saves/'.str_replace(':', '-', $game);
        $save = GameSave::firstOrNew(['game' => $game]);
        foreach (['state', 'sram'] as $kind) {
            if ($request->hasFile($kind)) {
                $save->{"{$kind}_path"} = $request->file($kind)->storeAs($dir, "{$kind}.bin", 'local');
            }
        }
        $save->updated_by = $request->user()->id;
        $save->save();

        return response()->json(['ok' => true, 'updatedAt' => $save->updated_at->toIso8601String()]);
    }

    private function saveRow(string $game): ?GameSave
    {
        $this->checkGameKey($game);

        return GameSave::where('game', $game)->first();
    }

    private function checkGameKey(string $game): void
    {
        abort_unless(preg_match(self::GAME_KEY, $game) === 1, 404);
        if (str_starts_with($game, 'u:')) {
            abort_unless(Game::whereKey((int) substr($game, 2))->exists(), 404);
        }
    }
}
