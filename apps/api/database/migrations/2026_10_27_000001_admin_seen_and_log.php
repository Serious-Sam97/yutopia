<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Run the place (docs/plan/48-the-admin.md): when each person was last in the world, and
// what admins did there and here, kept for 90 days.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->timestamp('seen_at')->nullable();
        });
        Schema::create('admin_actions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('admin_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('admin_name', 120)->default('');
            $table->string('kind', 20);
            // whom or what it was done to: a person (their id and name), a room, a car…
            $table->foreignId('target_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('target', 160)->default('');
            $table->string('detail', 200)->default('');
            $table->timestamp('at')->useCurrent();
            $table->index('at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('admin_actions');
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('seen_at');
        });
    }
};
