<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

// A thing placed in the world (furniture, TVs, consoles…); `props` is its live state.
class WorldObject extends Model
{
    protected $table = 'objects';

    protected $fillable = ['uid', 'kind', 'x', 'y', 'rot', 'ref_id', 'props'];

    protected function casts(): array
    {
        return ['props' => 'array', 'x' => 'integer', 'y' => 'integer', 'rot' => 'integer', 'ref_id' => 'integer'];
    }

    public function toWorld(): array
    {
        return [
            'id' => $this->uid,
            'kind' => $this->kind,
            'x' => $this->x,
            'y' => $this->y,
            'rot' => $this->rot,
            'refId' => $this->ref_id,
            'props' => $this->props ?? (object) [],
        ];
    }
}
