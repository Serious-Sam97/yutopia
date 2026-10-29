<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

// An admin's draft of god mode's edits (docs/plan/53-the-god-mode.md, named in plan 55): the whole
// set as they want it, made on revision `base_rev`, by its name; nobody else sees it till they
// publish it. An admin keeps up to MAX.
class GroundDraft extends Model
{
    public const MAX = 20;

    protected $fillable = ['user_id', 'name', 'base_rev', 'data', 'size', 'change_count'];

    protected function casts(): array
    {
        return ['created_at' => 'datetime', 'updated_at' => 'datetime', 'base_rev' => 'integer', 'change_count' => 'integer'];
    }

    /** For the list: no data. */
    public function toRow(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'baseRev' => $this->base_rev,
            'size' => $this->size,
            'changes' => $this->change_count,
            'createdAt' => $this->created_at?->toIso8601String(),
            'updatedAt' => $this->updated_at?->toIso8601String(),
        ];
    }

    public function toPublic(): array
    {
        return $this->toRow() + [
            'userId' => $this->user_id,
            'data' => json_decode($this->data, true) ?: ['rev' => 0],
        ];
    }
}
