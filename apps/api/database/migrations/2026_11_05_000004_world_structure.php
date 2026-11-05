<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// The world's structure (docs/plan/72-the-3d-core.md, phase 6): walls, slabs, rooms and floors in
// world metres (shared structure/), layout version 4 — the world-server's truth from now on. Made
// from the tile layout by tools/world-v4.mts (the conversion is the shared TypeScript's); `layout`
// is kept as it was then, untouched, until the tile tool goes (phase 11).
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('world', function (Blueprint $table) {
            $table->json('structure')->nullable()->after('layout');
        });
    }

    public function down(): void
    {
        Schema::table('world', function (Blueprint $table) {
            $table->dropColumn('structure');
        });
    }
};
