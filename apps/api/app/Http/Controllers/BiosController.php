<?php

namespace App\Http\Controllers;

use App\Models\Bios;
use App\Models\User;
use App\Services\GameSystems as Sys;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Symfony\Component\HttpFoundation\Response;

// The disc console's BIOS, brought by someone (docs/plan/23-disc-console.md):
// Yutopia ships none, and the console won't turn on without one. Only known
// retail dumps are taken (a bad one freezes the emulator), kept under the name
// the core looks for. Who brought it, or an admin, takes it away.
class BiosController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return response()->json(['bios' => Bios::oldest('id')->get()->map(fn (Bios $b) => $this->shape($b, $request->user()))]);
    }

    public function store(Request $request): JsonResponse
    {
        $user = $request->user();
        $request->validate(['file' => ['required', 'file', 'max:1024']]);
        $file = $request->file('file');
        abort_unless((int) $file->getSize() === Sys::BIOS_BYTES, 422, 'That isn\'t a BIOS: a console\'s BIOS is 512 KB.');
        $md5 = md5_file($file->getRealPath());
        $known = Sys::bios($md5);
        abort_unless($known, 422, 'That BIOS isn\'t one we know: bring a dump of a retail console (SCPH-1001, 5500, 5501, 5502, 7001, 101…).');
        abort_if(Bios::where('md5', $md5)->exists(), 422, "The world has the {$known[1]} BIOS already.");
        $path = $file->storeAs('bios', $known[0], 'local');
        $bios = Bios::create([
            'uploaded_by' => $user->id,
            'system' => 'ps1',
            'md5' => $md5,
            'file_name' => $known[0],
            'path' => $path,
        ]);

        return response()->json(['bios' => $this->shape($bios, $user)], 201);
    }

    public function file(int $biosId): Response
    {
        $bios = Bios::findOrFail($biosId);
        abort_unless(Storage::disk('local')->exists($bios->path), 404);

        return new BinaryFileResponse(Storage::disk('local')->path($bios->path), 200, [
            'Content-Type' => 'application/octet-stream',
            'Cache-Control' => 'private, max-age=31536000, immutable',
        ]);
    }

    public function destroy(Request $request, int $biosId): JsonResponse
    {
        $user = $request->user();
        $bios = Bios::findOrFail($biosId);
        abort_unless($bios->uploaded_by === $user->id || $user->is_admin, 403, 'Only who brought it (or an admin) can take it away.');
        Storage::disk('local')->delete($bios->path);
        $bios->delete();

        return response()->json(['ok' => true]);
    }

    private function shape(Bios $b, User $user): array
    {
        [, $model, $region, $version] = Sys::bios($b->md5) ?? [null, 'Unknown', '?', '?'];

        return [
            'id' => $b->id,
            'system' => $b->system,
            'fileName' => $b->file_name,
            'model' => $model,
            'region' => $region,
            'version' => $version,
            'md5' => $b->md5,
            'mine' => $b->uploaded_by === $user->id,
        ];
    }
}
