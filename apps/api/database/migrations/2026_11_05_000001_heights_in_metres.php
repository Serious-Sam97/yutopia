<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

// One unit, metres (docs/plan/72-the-3d-core.md, phase 5): how high a thing stands on what it's on
// (`props.z`: a mug on a desk, a TV on a cabinet) was kept in the old item art's px. Here it becomes
// metres, in the world's things and in everyone's saved setups — as shared/migrate.ts does for the
// worlds kept as files.
//
// Only a height that is plainly px moves (over 3: a px height starts at ~11, a surface in metres
// stays under 3), so a thing the world-server already set on its host in metres is left alone, and
// running it twice changes nothing.
return new class extends Migration
{
    private const ART_PX = 39.18765; // 45.25 · cos 30° (shared units.ts ART_PX)

    public function up(): void
    {
        $this->each(fn (float $z) => $z > 3 ? round($z / self::ART_PX, 4) : null);
    }

    public function down(): void
    {
        $this->each(fn (float $z) => $z > 0 && $z <= 3 ? round($z * self::ART_PX, 3) : null);
    }

    /** `$to`: a height's new value, or null to leave it. */
    private function each(callable $to): void
    {
        $prop = function (?array $props) use ($to): ?array {
            if (! is_array($props) || ! isset($props['z']) || ! is_numeric($props['z'])) {
                return null;
            }
            $z = $to((float) $props['z']);
            if ($z === null) {
                return null;
            }
            $props['z'] = $z;

            return $props;
        };
        DB::transaction(function () use ($prop) {
            foreach (DB::table('objects')->whereNotNull('props')->get(['id', 'props']) as $row) {
                $next = $prop(json_decode($row->props, true));
                if ($next !== null) {
                    DB::table('objects')->where('id', $row->id)->update(['props' => json_encode($next)]);
                }
            }
            foreach (DB::table('setups')->get(['id', 'items']) as $row) {
                $items = json_decode($row->items, true);
                if (! is_array($items)) {
                    continue;
                }
                $changed = false;
                foreach ($items as $i => $item) {
                    $next = is_array($item) ? $prop($item['props'] ?? null) : null;
                    if ($next !== null) {
                        $items[$i]['props'] = $next;
                        $changed = true;
                    }
                }
                if ($changed) {
                    DB::table('setups')->where('id', $row->id)->update(['items' => json_encode($items)]);
                }
            }
        });
    }
};
