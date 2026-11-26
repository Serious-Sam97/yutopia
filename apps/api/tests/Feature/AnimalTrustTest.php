<?php

use App\Models\User;
use App\Models\World;

// The animals' trust (docs/plan/126-animal-life.md, F7c): the world server's alone; a person's rows, changed in place,
// checked; gone with them.
it('keeps a person\'s trust with the animals for the world server', function () {
    World::current();
    $ana = User::factory()->create();
    $bo = User::factory()->create();
    $this->getJson('/api/internal/animal-trust?user='.$ana->id)->assertUnauthorized();
    internalCall($this, 'GET', '/api/internal/animal-trust?user='.$ana->id)->assertOk()->assertJsonCount(0, 'trust');
    internalCall($this, 'PUT', '/api/internal/animal-trust', ['trust' => [
        ['user' => $ana->id, 'id' => 'l-2_-1_3_0#0', 'kind' => 'duck', 'v' => 0.5, 'day' => 20410, 'friend' => false, 'name' => ''],
        ['user' => $bo->id, 'id' => 'pen:paddock:horse#1', 'kind' => 'horse', 'v' => 1, 'day' => 20410, 'friend' => true, 'name' => 'Pepper'],
    ]])->assertOk()->assertJsonPath('kept', 2);
    internalCall($this, 'PUT', '/api/internal/animal-trust', ['trust' => [
        ['user' => $ana->id, 'id' => 'l-2_-1_3_0#0', 'kind' => 'duck', 'v' => 1, 'day' => 20411, 'friend' => true, 'name' => 'Quack'],
    ]])->assertOk();
    $mine = internalCall($this, 'GET', '/api/internal/animal-trust?user='.$ana->id)->assertOk()->json('trust');
    expect($mine)->toEqual([['id' => 'l-2_-1_3_0#0', 'kind' => 'duck', 'v' => 1, 'day' => 20411, 'friend' => true, 'name' => 'Quack']]);
    // checked: trust out of bounds, a bad id
    internalCall($this, 'PUT', '/api/internal/animal-trust', ['trust' => [['user' => $ana->id, 'id' => 'x', 'kind' => 'duck', 'v' => 3, 'day' => 1, 'friend' => false, 'name' => '']]])->assertUnprocessable();
    internalCall($this, 'PUT', '/api/internal/animal-trust', ['trust' => [['user' => $ana->id, 'id' => 'a b', 'kind' => 'duck', 'v' => 0, 'day' => 1, 'friend' => false, 'name' => '']]])->assertUnprocessable();
    // gone with them
    $bo->delete();
    expect(internalCall($this, 'GET', '/api/internal/animal-trust?user='.$bo->id)->json('trust'))->toBe([]);
});
