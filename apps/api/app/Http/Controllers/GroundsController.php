<?php

namespace App\Http\Controllers;

use App\Models\GroundDraft;
use App\Models\GroundRevision;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

// God mode's edits to the Grounds (docs/plan/53-the-god-mode.md): everyone in the world fetches
// what's published; an admin keeps drafts by name (plan 55: up to 20, theirs alone) and reads the
// history; the world server, having checked a draft against the shared rules (grounds-edits.ts),
// publishes it as the next revision. The API only keeps them: what an edit may do is the world
// server's to say.
class GroundsController extends Controller
{
    /** A set of edits at most this long as JSON (the grids are base64; the wire gzips them). */
    public const MAX_BYTES = 6_000_000;

    // ── everyone: the edits the world lays ──
    public function published(Request $request): JsonResponse
    {
        $edits = GroundRevision::edits();
        $etag = '"g'.$edits['rev'].'"';
        if ($request->header('If-None-Match') === $etag) {
            return response()->json(null, 304)->setEtag(substr($etag, 1, -1));
        }

        return response()->json(['edits' => $edits])->setEtag(substr($etag, 1, -1));
    }

    // ── admins: my drafts ──
    public function drafts(Request $request): JsonResponse
    {
        $mine = GroundDraft::where('user_id', $request->user()->id)->orderByDesc('updated_at')->orderByDesc('id')->get();

        return response()->json([
            'drafts' => $mine->map->toRow(),
            'max' => GroundDraft::MAX,
            'rev' => GroundRevision::current()?->rev ?? 0,
        ]);
    }

    public function createDraft(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'min:1', 'max:60'],
            'baseRev' => ['required', 'integer', 'min:0'],
            'data' => ['nullable', 'array'],
            'changes' => ['nullable', 'integer', 'min:0'],
        ]);
        $uid = $request->user()->id;
        abort_if(GroundDraft::where('user_id', $uid)->count() >= GroundDraft::MAX, 422, 'You have '.GroundDraft::MAX.' drafts: publish or delete one first.');
        $json = $this->encode($data['data'] ?? ['rev' => $data['baseRev']]);
        $d = GroundDraft::create([
            'user_id' => $uid,
            'name' => trim($data['name']),
            'base_rev' => $data['baseRev'],
            'data' => $json,
            'size' => strlen($json),
            'change_count' => $data['changes'] ?? 0,
        ]);

        return response()->json(['draft' => $d->toRow()], 201);
    }

    public function draft(Request $request, int $id): JsonResponse
    {
        return response()->json(['draft' => $this->mine($request, $id)->toPublic(), 'rev' => GroundRevision::current()?->rev ?? 0]);
    }

    /** Its edits saved (with the revision they're on and how many changes), or renamed. */
    public function putDraft(Request $request, int $id): JsonResponse
    {
        $d = $this->mine($request, $id);
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'min:1', 'max:60'],
            'baseRev' => ['required_with:data', 'integer', 'min:0'],
            'data' => ['sometimes', 'array'],
            'changes' => ['sometimes', 'integer', 'min:0'],
        ]);
        if (isset($data['name'])) {
            $d->name = trim($data['name']);
        }
        if (isset($data['data'])) {
            $json = $this->encode($data['data']);
            $d->fill(['base_rev' => $data['baseRev'], 'data' => $json, 'size' => strlen($json)]);
        }
        if (isset($data['changes'])) {
            $d->change_count = $data['changes'];
        }
        $d->save();

        return response()->json(['draft' => $d->toRow()]);
    }

    public function deleteDraft(Request $request, int $id): JsonResponse
    {
        $this->mine($request, $id)->delete();

        return response()->json(['ok' => true]);
    }

    /** One of mine (someone else's: as if there were none). */
    private function mine(Request $request, int $id): GroundDraft
    {
        return GroundDraft::where('id', $id)->where('user_id', $request->user()->id)->firstOrFail();
    }

    // ── admins: the history ──
    public function revisions(): JsonResponse
    {
        return response()->json(['revisions' => GroundRevision::orderByDesc('rev')->limit(200)->get()->map->toPublic()]);
    }

    public function revision(int $rev): JsonResponse
    {
        $r = GroundRevision::where('rev', $rev)->firstOrFail();

        return response()->json(['revision' => $r->toPublic() + ['data' => $r->data()]]);
    }

    // ── the world server ──
    public function internalDraft(int $id): JsonResponse
    {
        return response()->json(['draft' => GroundDraft::find($id)?->toPublic()]);
    }

    public function internalRevision(int $rev): JsonResponse
    {
        $r = GroundRevision::where('rev', $rev)->firstOrFail();

        return response()->json(['revision' => $r->toPublic() + ['data' => $r->data()]]);
    }

    /** The next revision: a draft published, or an older one rolled back to. The draft that was
     *  published goes (its name kept with the revision); the admin's others stay. */
    public function publish(Request $request): JsonResponse
    {
        $data = $request->validate([
            'adminId' => ['required', 'integer'],
            'data' => ['required', 'array'],
            'note' => ['nullable', 'string', 'max:140'],
            'baseRev' => ['required', 'integer', 'min:0'],
            'rollbackOf' => ['nullable', 'integer', 'min:1'],
            'draftId' => ['nullable', 'integer', 'min:1'],
        ]);
        $admin = User::find($data['adminId']);
        abort_unless($admin?->is_admin, 403, 'Only an admin publishes.');
        $draft = isset($data['draftId']) ? GroundDraft::where('id', $data['draftId'])->where('user_id', $admin->id)->first() : null;
        abort_if(isset($data['draftId']) && ! $draft, 404, 'No such draft of theirs.');
        $json = $this->encode($data['data']);
        $r = DB::transaction(function () use ($data, $admin, $json, $draft) {
            // (the newest row locked: Postgres won't lock an aggregate; the unique index is the backstop)
            $now = (int) (GroundRevision::orderByDesc('rev')->lockForUpdate()->value('rev') ?? 0);
            // (made on what's live, or it would undo someone else's publish)
            abort_unless((int) $data['baseRev'] === (int) $now, 409, "Revision {$now} is live; this was made on {$data['baseRev']}.");
            $r = GroundRevision::create([
                'rev' => $now + 1,
                'data' => $json,
                'size' => strlen($json),
                'note' => mb_substr((string) ($data['note'] ?? ''), 0, 140),
                'user_id' => $admin->id,
                'user_name' => $admin->name,
                'rollback_of' => $data['rollbackOf'] ?? null,
                'draft_name' => $draft?->name,
            ]);
            $draft?->delete();

            return $r;
        });

        return response()->json(['revision' => $r->toPublic()], 201);
    }

    private function encode(array $edits): string
    {
        // (the revision number is the row's, not what's sent)
        unset($edits['rev']);
        $json = json_encode($edits, JSON_UNESCAPED_SLASHES);
        abort_if($json === false || strlen($json) > self::MAX_BYTES, 422, 'The edits are too big (at most '.self::MAX_BYTES.' bytes).');

        return $json;
    }
}
