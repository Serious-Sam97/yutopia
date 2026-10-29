<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// God mode (docs/plan/53-the-god-mode.md): the Grounds' edits as published, every revision kept
// (a roll back is a revision of its own), and each admin's draft, theirs till they publish it.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ground_revisions', function (Blueprint $table) {
            $table->id();
            $table->unsignedInteger('rev')->unique();
            // shared grounds-edits.ts GroundsEdits, as JSON
            $table->longText('data');
            $table->unsignedInteger('size')->default(0);
            $table->string('note', 140)->default('');
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('user_name', 120)->default('');
            $table->unsignedInteger('rollback_of')->nullable();
            $table->timestamp('created_at')->useCurrent();
        });
        Schema::create('ground_drafts', function (Blueprint $table) {
            $table->foreignId('user_id')->primary()->constrained('users')->cascadeOnDelete();
            // the revision it was made on
            $table->unsignedInteger('base_rev')->default(0);
            $table->longText('data');
            $table->unsignedInteger('size')->default(0);
            $table->timestamp('updated_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ground_drafts');
        Schema::dropIfExists('ground_revisions');
    }
};
