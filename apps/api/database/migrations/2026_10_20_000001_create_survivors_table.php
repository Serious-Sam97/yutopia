<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// The dark (docs/plan/30-the-dark.md, phase 2): what someone carries out on the
// Grounds, their vitals (stamina always comes back: not kept), the story's
// pages they've found, and whether the gatehouse locker gave them their first
// revolver. One row a person, written by the world-server.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('survivors', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->json('inventory');
            $table->json('vitals');
            $table->json('pages');
            $table->boolean('issued')->default(false);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('survivors');
    }
};
