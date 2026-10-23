<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Where each person was when they last left the world: they come back there
// (docs/plan/36-the-ghost.md). Building coords — out on the Grounds they run
// well past the building's, negative too.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('last_spots', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->float('x');
            $table->float('y');
            $table->unsignedTinyInteger('level')->default(0);
            $table->unsignedTinyInteger('d')->default(0); // facing (8 ways)
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('last_spots');
    }
};
