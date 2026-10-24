<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// How the game runs for each player (docs/plan/39-the-telemetry.md): one row per player per
// ~30 s of play, from their own browser through the world-server. Kept 30 days
// (yutopia:prune-perf).
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('perf_reports', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('session', 40); // one page load
            $table->timestamp('at'); // when the window ended (the world-server's clock)
            $table->float('secs');
            $table->string('view', 8); // iso / 3p / 1p
            $table->string('quality', 8);
            $table->smallInteger('level')->default(0);
            $table->string('area', 40)->default('');
            $table->float('x')->default(0);
            $table->float('y')->default(0);
            $table->float('fps');
            $table->float('frame_med');
            $table->float('frame_p95');
            $table->float('frame_worst');
            $table->float('gap_p95');
            $table->unsignedInteger('over33')->default(0); // frames slower than 33 ms
            $table->unsignedInteger('over50')->default(0);
            $table->unsignedInteger('long_tasks')->default(0);
            $table->unsignedInteger('draws')->nullable();
            $table->float('ping_med')->nullable();
            $table->float('ping_p95')->nullable();
            $table->unsignedInteger('snaps')->default(0); // the server put them back
            $table->string('browser', 60)->default('');
            $table->string('gpu', 120)->default('');
            $table->json('stages'); // stage → ms a frame
            $table->json('machine');
            $table->json('context'); // the rest: hour, people near, in a car, hidden, long worst…
            $table->timestamps();
            $table->index(['user_id', 'at']);
            $table->index('at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('perf_reports');
    }
};
