<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

// One frame (docs/plan/72-the-3d-core.md, phase 6): a place on a floor other than the home floor
// was that floor's own tiles', its corner at (ox, oy) in the home floor's — the land's, the world's.
// Now every place is the world's: where people last stood and arrive, where pets are, what was
// dropped in the night, moved by their floor's corner (the layout's levels say where each is: the
// layout stays as it was, version 3, for this and phase 11). Things move with the world's
// structure (the world-server's world-v4, structure/fold.ts) — the same corners.
return new class extends Migration
{
    /** @return array<int, array{0: float, 1: float}> a floor's corner by its index (the home floor's 0, 0: none) */
    private function corners(): array
    {
        $world = DB::table('world')->orderBy('id')->first();
        $layout = $world && $world->layout ? json_decode($world->layout, true) : null;
        $out = [];
        $home = $layout['floor'] ?? 0;
        foreach ($layout['levels'] ?? [] as $l) {
            if (($l['index'] ?? null) === $home) {
                continue;
            }
            $ox = (float) ($l['ox'] ?? 0);
            $oy = (float) ($l['oy'] ?? 0);
            if ($ox != 0 || $oy != 0) {
                $out[(int) $l['index']] = [$ox, $oy];
            }
        }

        return $out;
    }

    private function shift(int $sign): void
    {
        foreach ($this->corners() as $level => [$ox, $oy]) {
            $dx = $sign * $ox;
            $dy = $sign * $oy;
            foreach (['last_spots', 'spawns'] as $t) {
                DB::table($t)->where('level', $level)->update(['x' => DB::raw("x + ($dx)"), 'y' => DB::raw("y + ($dy)")]);
            }
            foreach (DB::table('pets')->whereNotNull('place')->get(['id', 'place']) as $p) {
                $place = json_decode($p->place, true);
                if (! is_array($place) || ($place['level'] ?? null) !== $level) {
                    continue;
                }
                $place['x'] += $dx;
                $place['y'] += $dy;
                DB::table('pets')->where('id', $p->id)->update(['place' => json_encode($place)]);
            }
            $world = DB::table('world')->orderBy('id')->first();
            $settings = $world && $world->settings ? json_decode($world->settings, true) : null;
            if (is_array($settings['loot']['drops'] ?? null)) {
                foreach ($settings['loot']['drops'] as &$d) {
                    if (($d['level'] ?? null) === $level) {
                        $d['x'] += $dx;
                        $d['y'] += $dy;
                    }
                }
                unset($d);
                DB::table('world')->where('id', $world->id)->update(['settings' => json_encode($settings)]);
            }
        }
    }

    public function up(): void
    {
        $this->shift(1);
    }

    public function down(): void
    {
        $this->shift(-1);
    }
};
