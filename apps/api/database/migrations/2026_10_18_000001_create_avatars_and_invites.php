<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // the look someone walks around with (AvatarLayers in @yutopia/shared)
        Schema::create('avatars', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->json('layers');
            $table->timestamps();
        });

        // single-use sign-up links, for YUTOPIA_SIGNUP=invite
        Schema::create('invites', function (Blueprint $table) {
            $table->id();
            $table->string('code', 40)->unique();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            // optional: the link only works for this address
            $table->string('email')->nullable();
            $table->foreignId('used_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('used_at')->nullable();
            $table->timestamp('expires_at');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('invites');
        Schema::dropIfExists('avatars');
    }
};
