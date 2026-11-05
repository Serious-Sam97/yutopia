<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// People's facing as a yaw (docs/plan/72-the-3d-core.md, phase 5): where someone last stood keeps
// which way they faced as the wire's byte (256 a turn: shared move yawToByte), not one of the 8 iso
// screen ways `d` — the same angles: d 0 was 45° (32), each next way 45° on, 7 was 0°.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('last_spots', function (Blueprint $table) {
            $table->unsignedTinyInteger('yaw')->default(0)->after('level');
        });
        DB::table('last_spots')->update(['yaw' => DB::raw('((d + 1) % 8) * 32')]);
        Schema::table('last_spots', function (Blueprint $table) {
            $table->dropColumn('d');
        });
    }

    public function down(): void
    {
        Schema::table('last_spots', function (Blueprint $table) {
            $table->unsignedTinyInteger('d')->default(0)->after('level');
        });
        DB::table('last_spots')->update(['d' => DB::raw('(((yaw + 16) / 32) + 7) % 8')]);
        Schema::table('last_spots', function (Blueprint $table) {
            $table->dropColumn('yaw');
        });
    }
};
