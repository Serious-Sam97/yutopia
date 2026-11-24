<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// How the world's NPCs feel about people (docs/plan/123-npcs-alive.md, F5a/F6a): a placed NPC's bond with a player
// ("u:<user id>") or another NPC ("n:<key>"), −100…100, how many times they've met, when last — kept by the world server
// as they change (shared npc/mind.ts Bond).
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('npc_bonds', function (Blueprint $table) {
            $table->id();
            $table->string('npc', 40);
            $table->string('other', 48);
            $table->smallInteger('v')->default(0);
            $table->unsignedInteger('n')->default(0);
            $table->timestamp('seen_at')->nullable();
            $table->timestamps();
            $table->unique(['npc', 'other']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('npc_bonds');
    }
};
