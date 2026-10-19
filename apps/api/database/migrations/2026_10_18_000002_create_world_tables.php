<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// The one world and everything in it (was Yondra's yutopia_* tables, one set per
// space; docs/plan/24-standalone.md §4).
return new class extends Migration
{
    public function up(): void
    {
        // one row: the map (null = the built-in Studio), the playlists, whether it was furnished
        Schema::create('world', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('map_key')->default('studio');
            $table->json('layout')->nullable();
            $table->json('settings')->nullable();
            $table->timestamp('seeded_at')->nullable();
            $table->timestamps();
        });

        Schema::create('objects', function (Blueprint $table) {
            $table->id();
            $table->string('uid', 64)->unique();
            $table->string('kind', 40);
            $table->integer('x');
            $table->integer('y');
            $table->unsignedTinyInteger('rot')->default(0);
            // what it shows from elsewhere (imported board walls keep their Yondra board id
            // for the per-office integration later; nothing reads it now)
            $table->unsignedBigInteger('ref_id')->nullable();
            $table->json('props')->nullable();
            $table->timestamps();
        });

        Schema::create('desks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('desk_uid', 64)->unique();
            $table->timestamps();
        });

        // where someone arrives (null row: the world's arrival point)
        Schema::create('spawns', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->float('x');
            $table->float('y');
            $table->timestamps();
        });

        // "my setups": groups of things saved in build mode
        Schema::create('setups', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name', 40);
            $table->json('items');
            $table->timestamps();
            $table->index('user_id');
        });

        // shared/pets.ts PetRecord; the world-server owns them
        Schema::create('pets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('species', 16);
            $table->string('name', 20);
            $table->json('look');
            $table->json('outfit');
            $table->json('needs');
            $table->unsignedInteger('xp')->default(0);
            $table->json('tricks');
            $table->json('traits')->nullable();
            $table->json('memory')->nullable();
            $table->json('bonds')->nullable(); // by user id
            $table->boolean('alive')->default(true);
            $table->unsignedInteger('wins')->default(0);
            $table->unsignedInteger('losses')->default(0);
            $table->timestamp('born_at');
            $table->timestamp('died_at')->nullable();
            $table->timestamp('seen_at');
            $table->timestamps();
            $table->index('user_id');
        });

        // ── the game room ───────────────────────────────────────────────────
        Schema::create('games', function (Blueprint $table) {
            $table->id();
            $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('system', 8);
            $table->string('title', 60);
            $table->string('color', 7);
            $table->unsignedTinyInteger('players')->default(1);
            $table->string('file_name', 120);
            $table->string('path');
            // a game in several files: [{name, bytes}], the first one is what the core opens
            $table->json('files')->nullable();
            $table->unsignedBigInteger('bytes');
            $table->char('sha1', 40)->unique();
            $table->timestamps();
        });

        Schema::create('game_saves', function (Blueprint $table) {
            $table->id();
            $table->string('game', 40)->unique(); // "b:<slug>" built-in, "u:<id>" uploaded
            $table->string('state_path')->nullable();
            $table->string('sram_path')->nullable();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        // an upload on its way: what it will be, which files; the chunks are on disk
        Schema::create('uploads', function (Blueprint $table) {
            $table->ulid('id')->primary();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('system', 8);
            $table->string('title', 60);
            $table->string('color', 7);
            $table->unsignedTinyInteger('players')->default(1);
            $table->json('files');
            $table->unsignedBigInteger('bytes');
            $table->timestamps();
            $table->index('user_id');
        });

        Schema::create('bios', function (Blueprint $table) {
            $table->id();
            $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('system', 8)->default('ps1');
            $table->char('md5', 32)->unique();
            $table->string('file_name', 40); // the name the core looks for (scph5501.bin…)
            $table->string('path');
            $table->timestamps();
        });

        // ── the phone ───────────────────────────────────────────────────────
        Schema::create('phones', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->json('settings');
            $table->timestamps();
        });

        Schema::create('contacts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('contact_id')->constrained('users')->cascadeOnDelete();
            $table->timestamps();
            $table->unique(['user_id', 'contact_id']);
        });

        Schema::create('threads', function (Blueprint $table) {
            $table->id();
            $table->string('kind', 10); // direct | group | everyone | vortex
            $table->string('name', 60)->nullable();
            $table->string('direct_key', 40)->nullable()->unique(); // "a:b" (a < b), "vortex:a", "g:<md5>"
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('last_message_at')->nullable();
            $table->timestamps();
            $table->index('kind');
        });

        Schema::create('thread_members', function (Blueprint $table) {
            $table->id();
            $table->foreignId('thread_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('last_read_id')->default(0);
            $table->boolean('muted')->default(false);
            $table->timestamp('left_at')->nullable();
            $table->timestamps();
            $table->unique(['thread_id', 'user_id']);
            $table->index('user_id');
        });

        Schema::create('photos', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('path');
            $table->string('kind', 5)->default('photo'); // photo | video
            $table->string('mime', 40)->default('image/jpeg');
            $table->unsignedSmallInteger('w');
            $table->unsignedSmallInteger('h');
            $table->unsignedSmallInteger('secs')->default(0); // a video's length
            $table->unsignedInteger('bytes');
            $table->string('filter', 10)->default('none');
            $table->boolean('selfie')->default(false);
            $table->boolean('sent')->default(false);
            $table->string('where', 120)->default('');
            $table->timestamps();
            $table->index(['user_id', 'id']);
        });

        Schema::create('messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('thread_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete(); // null: Vortex
            $table->string('kind', 8)->default('text'); // text | photo | call | system
            $table->text('body')->nullable();
            $table->foreignId('photo_id')->nullable()->constrained()->nullOnDelete();
            $table->json('meta')->nullable(); // call: end, secs, video, from
            $table->json('reactions')->nullable(); // emote → user ids
            $table->unsignedBigInteger('reply_to')->nullable();
            $table->timestamps();
            $table->index(['thread_id', 'id']);
        });
    }

    public function down(): void
    {
        foreach (['messages', 'photos', 'thread_members', 'threads', 'contacts', 'phones', 'bios', 'uploads', 'game_saves', 'games', 'pets', 'setups', 'spawns', 'desks', 'objects', 'world'] as $t) {
            Schema::dropIfExists($t);
        }
    }
};
