<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// The world's cast (docs/plan/120-god-mode-npcs.md): every NPC, by its key, as the admins' page made it (shared
// npc/cast.ts NpcDef, as JSON). Empty till the world server seeds it once with the town's people (then the world's
// settings say so, and it's never seeded again: a town NPC deleted stays deleted).
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('npcs', function (Blueprint $table) {
            $table->id();
            $table->string('key', 40)->unique();
            $table->text('def');
            // moved from code (the town's): their type is their own
            $table->boolean('town')->default(false);
            // the list's order
            $table->unsignedInteger('position')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('npcs');
    }
};
