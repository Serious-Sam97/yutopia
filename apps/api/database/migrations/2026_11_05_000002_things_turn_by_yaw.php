<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// Turns as angles, floats end to end (docs/plan/72-the-3d-core.md, phase 5): a thing's `rot` (a
// quarter turn, 0..3) becomes its `yaw` (radians: π/2 a quarter, the same way round), and where it
// stands (x, y) a float — still whole tiles and quarter turns until the build tool frees them
// (phase 11). Everyone's saved setups likewise (their items' `rot` → `yaw`).
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('objects', function (Blueprint $table) {
            $table->double('yaw')->default(0)->after('y');
        });
        DB::table('objects')->update(['yaw' => DB::raw('rot * '.(M_PI / 2))]);
        Schema::table('objects', function (Blueprint $table) {
            $table->dropColumn('rot');
            $table->double('x')->change();
            $table->double('y')->change();
        });
        $this->setups(function (array $i): array {
            $i['yaw'] = ((int) ($i['rot'] ?? 0) & 3) * (M_PI / 2);
            unset($i['rot']);

            return $i;
        });
        // the world's layout marked as today's form (shared migrate.ts LAYOUT_VERSION): the world-server
        // refuses one older than this rather than reading it wrong
        $this->layoutVersion(3);
    }

    public function down(): void
    {
        Schema::table('objects', function (Blueprint $table) {
            $table->unsignedTinyInteger('rot')->default(0)->after('y');
        });
        DB::table('objects')->update(['rot' => DB::raw('(((round(yaw / '.(M_PI / 2).')::int % 4) + 4) % 4)')]);
        Schema::table('objects', function (Blueprint $table) {
            $table->dropColumn('yaw');
            $table->integer('x')->change();
            $table->integer('y')->change();
        });
        $this->setups(function (array $i): array {
            $i['rot'] = ((((int) round(($i['yaw'] ?? 0) / (M_PI / 2))) % 4) + 4) % 4;
            unset($i['yaw']);

            return $i;
        });
        $this->layoutVersion(2);
    }

    private function layoutVersion(int $v): void
    {
        foreach (DB::table('world')->whereNotNull('layout')->get(['id', 'layout']) as $row) {
            $layout = json_decode($row->layout, true);
            if (is_array($layout)) {
                $layout['version'] = $v;
                DB::table('world')->where('id', $row->id)->update(['layout' => json_encode($layout)]);
            }
        }
    }

    private function setups(callable $item): void
    {
        foreach (DB::table('setups')->get(['id', 'items']) as $row) {
            $items = json_decode($row->items, true);
            if (! is_array($items)) {
                continue;
            }
            DB::table('setups')->where('id', $row->id)->update([
                'items' => json_encode(array_map(fn ($i) => is_array($i) ? $item($i) : $i, $items)),
            ]);
        }
    }
};
