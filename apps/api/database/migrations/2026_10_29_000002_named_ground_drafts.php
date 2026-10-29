<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

// God mode's drafts with names (docs/plan/55-the-drafts.md): an admin keeps several (up to 20),
// each its own row with a name; today's one each becomes "Draft". A revision keeps the name of
// the draft it was published from.
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ground_drafts_named', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->string('name', 60);
            // the revision it was made on
            $table->unsignedInteger('base_rev')->default(0);
            $table->longText('data');
            $table->unsignedInteger('size')->default(0);
            // what it changes against what it was made on (the client's count: the list's)
            $table->unsignedInteger('change_count')->default(0);
            $table->timestamps();
            $table->index(['user_id', 'updated_at']);
        });
        foreach (DB::table('ground_drafts')->get() as $d) {
            DB::table('ground_drafts_named')->insert([
                'user_id' => $d->user_id,
                'name' => 'Draft',
                'base_rev' => $d->base_rev,
                'data' => $d->data,
                'size' => $d->size,
                'created_at' => $d->updated_at,
                'updated_at' => $d->updated_at,
            ]);
        }
        Schema::drop('ground_drafts');
        Schema::rename('ground_drafts_named', 'ground_drafts');
        Schema::table('ground_revisions', function (Blueprint $table) {
            $table->string('draft_name', 60)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('ground_revisions', function (Blueprint $table) {
            $table->dropColumn('draft_name');
        });
        Schema::create('ground_drafts_one', function (Blueprint $table) {
            $table->foreignId('user_id')->primary()->constrained('users')->cascadeOnDelete();
            $table->unsignedInteger('base_rev')->default(0);
            $table->longText('data');
            $table->unsignedInteger('size')->default(0);
            $table->timestamp('updated_at')->useCurrent();
        });
        // (each admin's newest kept)
        foreach (DB::table('ground_drafts')->orderBy('updated_at')->get() as $d) {
            DB::table('ground_drafts_one')->updateOrInsert(
                ['user_id' => $d->user_id],
                ['base_rev' => $d->base_rev, 'data' => $d->data, 'size' => $d->size, 'updated_at' => $d->updated_at],
            );
        }
        Schema::drop('ground_drafts');
        Schema::rename('ground_drafts_one', 'ground_drafts');
    }
};
