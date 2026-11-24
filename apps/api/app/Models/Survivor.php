<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

// Someone out on the Grounds after dark (docs/plan/30-the-dark.md): shared/inventory.ts.
class Survivor extends Model
{
    // what one pocket holds, what a gun's loaded with (shared/inventory.ts STACKS, WEAPONS)
    public const STACKS = [
        'r38' => 24, 'shell' => 12, 'r762' => 60, 'r308' => 15, 'cell' => 3,
        'flare' => 3, 'battery' => 2, 'aid' => 2, 'fuse' => 4,
        // (plan 87) the torch: one of a kind, lit only from the left hand
        'torch' => 1,
        'umbrella' => 1,
        // (plan 88) Vortex's tape: a trophy, one a win
        'vxtape' => 99,
        // (plan 93 S6, S7) a snow chain (one a wheel); a wrench, a tow rope: kept, not used up
        'chains' => 4, 'wrench' => 1, 'towrope' => 1,
        // (plan 103 F10a) the skateboards, one a variant (shared/skate/spec.ts BOARD_ITEMS): one to a slot
        'board_vert_classic' => 1, 'board_vert_fish' => 1, 'board_vert_square' => 1,
        'board_street_pop' => 1, 'board_street_slick' => 1, 'board_street_tech' => 1,
        'board_cruiser_classic' => 1, 'board_cruiser_wood' => 1, 'board_cruiser_mini' => 1,
    ];

    // (plan 87) carried one at a time (shared/inventory.ts ONE_OF)
    public const ONE_OF = ['torch'];

    public const WEAPONS = ['revolver' => 6, 'shotgun' => 2, 'ak47' => 30, 'sniper' => 5, 'daybreak' => 3];

    public const POCKETS = 8; // (plan 86: the pack's 8 — a save of 6 read as 8, the rest empty)

    // the quick slots (keys 1–4: a gun or a stack; shared/inventory.ts QUICK)
    public const QUICK = 4;

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
