<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

// Someone out on the Grounds after dark (docs/plan/30-the-dark.md): shared/inventory.ts.
class Survivor extends Model
{
    // what one pocket holds, what a gun's loaded with (shared/inventory.ts STACKS, WEAPONS)
    public const STACKS = ['r38' => 24, 'shell' => 12, 'flare' => 3, 'battery' => 2, 'aid' => 2, 'fuse' => 4];

    public const WEAPONS = ['revolver' => 6, 'shotgun' => 2];

    public const POCKETS = 6;

    public const PAGES_MAX = 200;

    protected $fillable = ['user_id', 'inventory', 'vitals', 'pages', 'issued', 'kit_day'];

    protected function casts(): array
    {
        return [
            'inventory' => 'array',
            'vitals' => 'array',
            'pages' => 'array',
            'issued' => 'boolean',
            'kit_day' => 'integer',
        ];
    }

    // As the world-server reads it (apps/world-server api.ts SurvivorRecord).
    public function toWorld(): array
    {
        return [
            'inventory' => $this->inventory,
            'vitals' => $this->vitals,
            'pages' => $this->pages,
            'issued' => $this->issued,
            'kitDay' => $this->kit_day,
        ];
    }
}
