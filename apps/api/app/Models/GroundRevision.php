<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

// One publish of god mode's edits to the Grounds (docs/plan/53-the-god-mode.md): the whole set as
// it stood then (shared grounds-edits.ts GroundsEdits), who and why, the draft's name it came
// from. The newest is the world's.
class GroundRevision extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = ['rev', 'data', 'size', 'note', 'user_id', 'user_name', 'rollback_of', 'draft_name'];

    protected function casts(): array
    {
        return ['created_at' => 'datetime', 'rev' => 'integer', 'rollback_of' => 'integer'];
    }

    public static function current(): ?self
    {
        return self::orderByDesc('rev')->first();
    }

    /** The edits as the world lays them (none yet: rev 0, nothing). */
    public static function edits(): array
    {
        $r = self::current();

        return $r ? $r->data() : ['rev' => 0];
    }

    public function data(): array
    {
        return ['rev' => $this->rev] + (json_decode($this->data, true) ?: []);
    }

    public function toPublic(): array
    {
        return [
            'rev' => $this->rev,
            'note' => $this->note,
            'by' => $this->user_name,
            'byId' => $this->user_id,
            'size' => $this->size,
            'rollbackOf' => $this->rollback_of,
            // (published from a draft of this name: docs/plan/55-the-drafts.md)
            'draft' => $this->draft_name,
            'at' => $this->created_at?->toIso8601String(),
        ];
    }
}
