<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // Where a pet is in the world (docs/plan/51-the-pet.md): it stays when its owner leaves, and the
    // world-server puts it back there after a restart. shared/pets.ts PetPlace; null: nowhere yet.
    public function up(): void
    {
        Schema::table('pets', function (Blueprint $table) {
            $table->json('place')->nullable()->after('bonds');
        });
    }

    public function down(): void
    {
        Schema::table('pets', function (Blueprint $table) {
            $table->dropColumn('place');
        });
    }
};
