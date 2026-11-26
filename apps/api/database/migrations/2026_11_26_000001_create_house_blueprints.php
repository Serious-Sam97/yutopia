<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// A person's house blueprints (docs/plan/130-the-house-build.md, phase 12 — F12b: their own saves only): a lot's
// house as it stood (shared blueprints.ts BlueprintData), named, built again on their lot by the world server.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('house_blueprints', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name', 40);
            $table->json('data');
            $table->timestamps();
            $table->index('user_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('house_blueprints');
    }
};
