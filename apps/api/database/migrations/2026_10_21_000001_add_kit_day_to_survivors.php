<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// The lobby's supply locker (docs/plan/30-the-dark.md): a kit a day for anyone —
// the day (São Paulo's, shared dark/nests.ts dayOf) it last gave them one.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('survivors', function (Blueprint $table) {
            $table->unsignedInteger('kit_day')->nullable()->after('issued');
        });
    }

    public function down(): void
    {
        Schema::table('survivors', function (Blueprint $table) {
            $table->dropColumn('kit_day');
        });
    }
};
