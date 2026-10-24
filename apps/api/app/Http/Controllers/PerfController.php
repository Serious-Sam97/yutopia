<?php

namespace App\Http\Controllers;

use App\Models\PerfReport;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

// How the game runs for everyone (docs/plan/39-the-telemetry.md), for the admins' page:
// per player, one player in detail, and where in the world it's slow.
class PerfController extends Controller
{
    // the window asked for: the last `days` days (1, 7 or 30)
    private function since(Request $request)
    {
        $days = (int) $request->query('days', 7);

        return now()->subDays(in_array($days, [1, 7, 30], true) ? $days : 7);
    }

    // `fps < 30` counted, portable (SQLite in the tests, Postgres in the world)
    private const SLOW = 'SUM(CASE WHEN fps < 30 THEN 1 ELSE 0 END)';

    public function summary(Request $request): JsonResponse
    {
        $since = $this->since($request);
        $rows = PerfReport::where('at', '>=', $since)
            ->groupBy('user_id')
            ->select('user_id')
            ->selectRaw('COUNT(*) AS windows, SUM(secs) AS secs, COUNT(DISTINCT session) AS sessions')
            ->selectRaw('AVG(fps) AS fps, AVG(frame_p95) AS frame_p95, MAX(frame_worst) AS frame_worst')
            ->selectRaw(self::SLOW.' AS slow, AVG(ping_med) AS ping, SUM(snaps) AS snaps, MAX(at) AS last')
            ->get();
        // each one's slowest place (a floor's room, two windows or more there)
        $areas = PerfReport::where('at', '>=', $since)
            ->groupBy('user_id', 'level', 'area')
            ->havingRaw('COUNT(*) >= 2')
            ->select('user_id', 'level', 'area')
            ->selectRaw('AVG(fps) AS fps, COUNT(*) AS windows')
            ->get()
            ->groupBy('user_id');
        $names = User::whereIn('id', $rows->pluck('user_id'))->pluck('name', 'id');
        $players = $rows->map(function ($r) use ($areas, $names) {
            $last = PerfReport::where('user_id', $r->user_id)->latest('at')->first(['version', 'browser', 'gpu', 'view', 'quality', 'machine']);
            $worst = ($areas[$r->user_id] ?? collect())->sortBy('fps')->first();

            return [
                'userId' => (int) $r->user_id,
                'name' => $names[$r->user_id] ?? '?',
                'windows' => (int) $r->windows,
                'minutes' => round((float) $r->secs / 60, 1),
                'sessions' => (int) $r->sessions,
                'fps' => round((float) $r->fps, 1),
                'frameP95' => round((float) $r->frame_p95, 1),
                'frameWorst' => round((float) $r->frame_worst, 1),
                'slowShare' => $r->windows ? round((int) $r->slow / (int) $r->windows, 3) : 0,
                'ping' => $r->ping !== null ? round((float) $r->ping) : null,
                'snaps' => (int) $r->snaps,
                'last' => $r->last,
                'version' => $last?->version,
                'browser' => $last?->browser,
                'gpu' => $last?->gpu,
                'view' => $last?->view,
                'quality' => $last?->quality,
                'machine' => $last?->machine,
                'worstArea' => $worst ? ['level' => (int) $worst->level, 'area' => $worst->area, 'fps' => round((float) $worst->fps, 1)] : null,
            ];
        })->sortBy('fps')->values();

        // each version of the client against the others (docs/plan/40-the-version.md): did a
        // push make it better or worse
        $versions = PerfReport::where('at', '>=', $since)
            ->groupBy('version')
            ->select('version')
            ->selectRaw('COUNT(*) AS windows, COUNT(DISTINCT user_id) AS players, AVG(fps) AS fps, AVG(frame_p95) AS frame_p95')
            ->selectRaw(self::SLOW.' AS slow, MIN(at) AS first, MAX(at) AS last')
            ->orderByDesc('last')
            ->get()
            ->map(fn ($v) => [
                'version' => $v->version,
                'windows' => (int) $v->windows,
                'players' => (int) $v->players,
                'fps' => round((float) $v->fps, 1),
                'frameP95' => round((float) $v->frame_p95, 1),
                'slowShare' => round((int) $v->slow / max(1, (int) $v->windows), 3),
                'first' => $v->first,
                'last' => $v->last,
            ]);

        return response()->json(['players' => $players, 'versions' => $versions]);
    }

    public function player(Request $request, User $user): JsonResponse
    {
        $since = $this->since($request);
        $q = fn () => PerfReport::where('user_id', $user->id)->where('at', '>=', $since);
        $series = $q()->latest('at')->limit(3000)->get([
            'at', 'secs', 'fps', 'frame_med', 'frame_p95', 'frame_worst', 'ping_med', 'view', 'quality',
            'level', 'area', 'draws', 'snaps', 'stages', 'session', 'version',
        ])->reverse()->values();
        $areas = $q()->groupBy('level', 'area')
            ->select('level', 'area')
            ->selectRaw('COUNT(*) AS windows, AVG(fps) AS fps, AVG(frame_p95) AS frame_p95, MAX(frame_worst) AS frame_worst, AVG(draws) AS draws')
            ->selectRaw(self::SLOW.' AS slow')
            ->orderBy('fps')
            ->get()
            ->map(fn ($a) => [
                'level' => (int) $a->level,
                'area' => $a->area,
                'windows' => (int) $a->windows,
                'fps' => round((float) $a->fps, 1),
                'frameP95' => round((float) $a->frame_p95, 1),
                'frameWorst' => round((float) $a->frame_worst, 1),
                'draws' => $a->draws !== null ? (int) round((float) $a->draws) : null,
                'slowShare' => round((int) $a->slow / max(1, (int) $a->windows), 3),
            ]);
        // what a frame costs them, stage by stage (the average of the windows' averages)
        $sum = [];
        $n = [];
        foreach ($series as $r) {
            foreach ($r->stages ?? [] as $k => $v) {
                $sum[$k] = ($sum[$k] ?? 0) + (float) $v;
                $n[$k] = ($n[$k] ?? 0) + 1;
            }
        }
        $stages = [];
        foreach ($sum as $k => $v) {
            $stages[$k] = round($v / $n[$k], 2);
        }
        arsort($stages);
        $machines = $q()->groupBy('browser', 'gpu')->select('browser', 'gpu')->selectRaw('COUNT(*) AS windows, MAX(at) AS last')->get();
        $last = $q()->latest('at')->first(['machine']);

        return response()->json([
            'user' => ['id' => $user->id, 'name' => $user->name],
            'series' => $series->map(fn ($r) => [
                'at' => $r->at,
                'fps' => round($r->fps, 1),
                'frameMed' => round($r->frame_med, 1),
                'frameP95' => round($r->frame_p95, 1),
                'frameWorst' => round($r->frame_worst, 1),
                'ping' => $r->ping_med !== null ? round($r->ping_med) : null,
                'view' => $r->view,
                'quality' => $r->quality,
                'level' => $r->level,
                'area' => $r->area,
                'draws' => $r->draws,
                'snaps' => $r->snaps,
                'session' => $r->session,
                'version' => $r->version,
            ]),
            'areas' => $areas,
            'stages' => $stages,
            'machines' => $machines,
            'machine' => $last?->machine,
        ]);
    }

    public function spots(Request $request): JsonResponse
    {
        $since = $this->since($request);
        $spots = PerfReport::where('at', '>=', $since)
            ->groupBy('level', 'area')
            ->select('level', 'area')
            ->selectRaw('COUNT(*) AS windows, COUNT(DISTINCT user_id) AS players, AVG(fps) AS fps, AVG(frame_p95) AS frame_p95, AVG(draws) AS draws')
            ->selectRaw(self::SLOW.' AS slow')
            ->orderBy('fps')
            ->get()
            ->map(fn ($s) => [
                'level' => (int) $s->level,
                'area' => $s->area,
                'windows' => (int) $s->windows,
                'players' => (int) $s->players,
                'fps' => round((float) $s->fps, 1),
                'frameP95' => round((float) $s->frame_p95, 1),
                'draws' => $s->draws !== null ? (int) round((float) $s->draws) : null,
                'slowShare' => round((int) $s->slow / max(1, (int) $s->windows), 3),
            ]);

        return response()->json(['spots' => $spots]);
    }
}
