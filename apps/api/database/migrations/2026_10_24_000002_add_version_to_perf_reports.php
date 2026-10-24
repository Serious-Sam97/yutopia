<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// The client's build each report came from (docs/plan/40-the-version.md): 0.1.<commits>.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('perf_reports', function (Blueprint $table) {
            $table->string('version', 40)->default('')->after('session');
            $table->index(['version', 'at']);
        });
    }

    public function down(): void
    {
        Schema::table('perf_reports', function (Blueprint $table) {
            $table->dropIndex(['version', 'at']);
            $table->dropColumn('version');
        });
    }
};
