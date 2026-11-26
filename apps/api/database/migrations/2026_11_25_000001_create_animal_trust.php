<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// The animals' trust (docs/plan/126-animal-life.md, F7c): a person's with each animal they've fed — the animal's id (its
// land group and its number: the same every time the land makes it), its species, how far it trusts them (0..1), the
// world's day it was last fed by them, whether it's their friend now and its name — kept by the world server.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('animal_trust', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('animal', 64);
            $table->string('kind', 24);
            $table->float('v')->default(0);
            $table->integer('day')->default(0);
            $table->boolean('friend')->default(false);
            $table->string('name', 24)->default('');
            $table->timestamps();
            $table->unique(['user_id', 'animal']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('animal_trust');
    }
};
