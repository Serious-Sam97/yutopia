<?php

use App\Models\GroundDraft;
use App\Models\GroundRevision;
use App\Models\User;
use App\Services\WorldSnapshot;

// God mode's edits to the Grounds (docs/plan/53-the-god-mode.md): everyone fetches what's
// published, an admin keeps a draft, the world server publishes the next revision.

$hill = ['height' => ['13,-8' => 'AAAA'], 'ways' => ['remove' => ['farm-lane']]];

it('hands everyone the edits published (none yet: revision 0), unchanged ones not again', function () use ($hill) {
    $member = User::factory()->create();
    $this->getJson('/api/world/edits')->assertUnauthorized();
    $this->actingAs($member)->getJson('/api/world/edits')->assertOk()->assertJsonPath('edits', ['rev' => 0]);
    GroundRevision::create(['rev' => 1, 'data' => json_encode($hill), 'size' => 10]);
    $res = $this->actingAs($member)->getJson('/api/world/edits')->assertOk()
        ->assertJsonPath('edits.rev', 1)->assertJsonPath('edits.ways.remove.0', 'farm-lane');
    $this->actingAs($member)->withHeaders(['If-None-Match' => $res->headers->get('ETag')])->getJson('/api/world/edits')->assertStatus(304);
});

it('keeps an admin\'s drafts by name for them alone, 20 at most; a member gets none of it', function () use ($hill) {
    $admin = User::factory()->create(['is_admin' => true]);
    $other = User::factory()->create(['is_admin' => true]);
    $member = User::factory()->create();
    $this->actingAs($member)->getJson('/api/admin/grounds/drafts')->assertForbidden();
    $this->actingAs($member)->postJson('/api/admin/grounds/drafts', ['name' => 'Mine', 'baseRev' => 0])->assertForbidden();
    $this->actingAs($member)->getJson('/api/admin/grounds/revisions')->assertForbidden();
    $this->actingAs($member)->getJson('/api/admin/grounds/revisions/1')->assertForbidden();

    $this->actingAs($admin)->getJson('/api/admin/grounds/drafts')->assertOk()->assertJsonPath('drafts', [])->assertJsonPath('max', 20)->assertJsonPath('rev', 0);
    $bridge = $this->actingAs($admin)->postJson('/api/admin/grounds/drafts', ['name' => ' The new bridge ', 'baseRev' => 0])
        ->assertCreated()->assertJsonPath('draft.name', 'The new bridge')->assertJsonPath('draft.changes', 0)->json('draft.id');
    $pond = $this->actingAs($admin)->postJson('/api/admin/grounds/drafts', ['name' => 'Benches round the pond', 'baseRev' => 0, 'data' => $hill, 'changes' => 2])
        ->assertCreated()->json('draft.id');
    // saved, renamed; the list newest first, without the data
    $this->actingAs($admin)->putJson("/api/admin/grounds/drafts/{$bridge}", ['baseRev' => 0, 'data' => $hill, 'changes' => 2])->assertOk()->assertJsonPath('draft.changes', 2);
    $this->actingAs($admin)->putJson("/api/admin/grounds/drafts/{$pond}", ['name' => 'The pond'])->assertOk()->assertJsonPath('draft.name', 'The pond');
    $list = $this->actingAs($admin)->getJson('/api/admin/grounds/drafts')->assertOk()->json('drafts');
    expect(array_column($list, 'name'))->toBe(['The pond', 'The new bridge'])->and($list[0])->not->toHaveKey('data');
    $this->actingAs($admin)->getJson("/api/admin/grounds/drafts/{$bridge}")->assertOk()->assertJsonPath('draft.data.ways.remove.0', 'farm-lane');
    // someone else's: not there for them; nor named badly, nor too big
    $this->actingAs($other)->getJson("/api/admin/grounds/drafts/{$bridge}")->assertNotFound();
    $this->actingAs($other)->putJson("/api/admin/grounds/drafts/{$bridge}", ['name' => 'Taken'])->assertNotFound();
    $this->actingAs($other)->deleteJson("/api/admin/grounds/drafts/{$bridge}")->assertNotFound();
    $this->actingAs($member)->deleteJson("/api/admin/grounds/drafts/{$bridge}")->assertForbidden();
    $this->actingAs($admin)->postJson('/api/admin/grounds/drafts', ['name' => str_repeat('a', 61), 'baseRev' => 0])->assertUnprocessable();
    $this->actingAs($admin)->putJson("/api/admin/grounds/drafts/{$bridge}", ['baseRev' => 0, 'data' => ['height' => ['0,0' => str_repeat('A', 6_000_001)]]])->assertUnprocessable();
    // 20 at most
    for ($i = 2; $i < 20; $i++) {
        $this->actingAs($admin)->postJson('/api/admin/grounds/drafts', ['name' => "Draft {$i}", 'baseRev' => 0])->assertCreated();
    }
    $this->actingAs($admin)->postJson('/api/admin/grounds/drafts', ['name' => 'One more', 'baseRev' => 0])->assertUnprocessable();
    $this->actingAs($admin)->deleteJson("/api/admin/grounds/drafts/{$pond}")->assertOk();
    expect(GroundDraft::where('user_id', $admin->id)->count())->toBe(19);
});

it('publishes for the world server: an admin\'s draft, on what\'s live, the next revision by its name, that draft gone', function () use ($hill) {
    $admin = User::factory()->create(['is_admin' => true, 'name' => 'Ana']);
    $member = User::factory()->create();
    $bridge = GroundDraft::create(['user_id' => $admin->id, 'name' => 'The new bridge', 'base_rev' => 0, 'data' => json_encode($hill), 'size' => 1]);
    $pond = GroundDraft::create(['user_id' => $admin->id, 'name' => 'The pond', 'base_rev' => 0, 'data' => '{}', 'size' => 2]);
    $theirs = GroundDraft::create(['user_id' => $member->id, 'name' => 'Not hers', 'base_rev' => 0, 'data' => '{}', 'size' => 2]);
    // not signed; not an admin's; not on what's live; someone else's draft
    $this->postJson('/api/internal/grounds/revisions', ['adminId' => $admin->id, 'data' => $hill, 'baseRev' => 0])->assertUnauthorized();
    internalCall($this, 'POST', '/api/internal/grounds/revisions', ['adminId' => $member->id, 'data' => $hill, 'baseRev' => 0])->assertForbidden();
    internalCall($this, 'POST', '/api/internal/grounds/revisions', ['adminId' => $admin->id, 'data' => $hill, 'baseRev' => 3])->assertStatus(409);
    internalCall($this, 'POST', '/api/internal/grounds/revisions', ['adminId' => $admin->id, 'data' => $hill, 'baseRev' => 0, 'draftId' => $theirs->id])->assertNotFound();
    // the draft, as the world server read it
    internalCall($this, 'GET', "/api/internal/grounds/drafts/{$bridge->id}")->assertOk()
        ->assertJsonPath('draft.data.height.13,-8', 'AAAA')->assertJsonPath('draft.userId', $admin->id)->assertJsonPath('draft.name', 'The new bridge');

    internalCall($this, 'POST', '/api/internal/grounds/revisions', ['adminId' => $admin->id, 'data' => $hill + ['rev' => 99], 'note' => 'A bridge', 'baseRev' => 0, 'draftId' => $bridge->id])
        ->assertCreated()->assertJsonPath('revision.rev', 1)->assertJsonPath('revision.by', 'Ana')->assertJsonPath('revision.note', 'A bridge')
        ->assertJsonPath('revision.draft', 'The new bridge');
    expect(GroundDraft::where('user_id', $admin->id)->pluck('name')->all())->toBe(['The pond']);
    internalCall($this, 'GET', '/api/internal/world')->assertOk()->assertJsonPath('edits.rev', 1)->assertJsonPath('edits.height.13,-8', 'AAAA');
    // rolled back to nothing: revision 2, an empty set
    internalCall($this, 'POST', '/api/internal/grounds/revisions', ['adminId' => $admin->id, 'data' => ['rev' => 0], 'note' => 'Roll back to 0', 'baseRev' => 1, 'rollbackOf' => 1])
        ->assertCreated()->assertJsonPath('revision.rev', 2)->assertJsonPath('revision.draft', null);
    $this->actingAs($admin)->getJson('/api/admin/grounds/revisions')->assertOk()
        ->assertJsonPath('revisions.0.rev', 2)->assertJsonPath('revisions.0.rollbackOf', 1)->assertJsonPath('revisions.1.note', 'A bridge');
    $this->actingAs($admin)->getJson('/api/admin/grounds/revisions/1')->assertOk()->assertJsonPath('revision.data.ways.remove.0', 'farm-lane');
    internalCall($this, 'GET', '/api/internal/grounds/revisions/1')->assertOk()->assertJsonPath('revision.data.rev', 1);
    $this->actingAs($member)->getJson('/api/world/edits')->assertJsonPath('edits', ['rev' => 2]);
});

it('keeps the edits in a world snapshot, and puts them back as a revision of their own', function () use ($hill) {
    GroundRevision::create(['rev' => 1, 'data' => json_encode($hill), 'size' => 10]);
    $snap = app(WorldSnapshot::class)->export();
    expect($snap['grounds']['rev'])->toBe(1)->and($snap['grounds']['ways']['remove'])->toBe(['farm-lane']);
    GroundRevision::create(['rev' => 2, 'data' => '{}', 'size' => 2]);
    app(WorldSnapshot::class)->import($snap);
    expect(GroundRevision::current()->rev)->toBe(3)->and(GroundRevision::edits()['ways']['remove'])->toBe(['farm-lane']);
    // the same again: nothing new
    app(WorldSnapshot::class)->import($snap);
    expect(GroundRevision::current()->rev)->toBe(3);
});
