<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// The building has floors (docs/plan/25-building-floors.md): someone's own
// arrival point is on one of them (null: the home floor, the studio).
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('spawns', function (Blueprint $table) {
            $table->unsignedTinyInteger('level')->nullable()->after('y');
        });
    }

    public function down(): void
    {
        Schema::table('spawns', function (Blueprint $table) {
            $table->dropColumn('level');
        });
    }
};
