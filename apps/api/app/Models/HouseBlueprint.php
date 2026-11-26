<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

// (docs/plan/130-the-house-build.md, phase 12) A person's own house blueprint.
class HouseBlueprint extends Model
{
    public const MAX = 24; // per person

    public const MAX_BYTES = 400000; // its data's JSON (shared blueprints.ts BLUEPRINT_MAX_BYTES)

    protected $fillable = ['user_id', 'name', 'data'];

    protected function casts(): array
    {
        return ['data' => 'array'];
    }
}
