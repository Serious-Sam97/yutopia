<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

// A thing placed in the world (furniture, TVs, consoles…); `props` is its live state. Where it
// stands in metres and how it's turned in radians (`yaw`: docs/plan/72-the-3d-core.md, phase 5).
class WorldObject extends Model
{
    protected $table = 'objects';

    protected $fillable = ['uid', 'kind', 'x', 'y', 'yaw', 'ref_id', 'props'];

    protected function casts(): array
    {
        return ['props' => 'array', 'x' => 'float', 'y' => 'float', 'yaw' => 'float', 'ref_id' => 'integer'];
    }

    public function toWorld(): array
    {
        return [
            'id' => $this->uid,
            'kind' => $this->kind,
            'x' => $this->x,
            'y' => $this->y,
            'yaw' => $this->yaw,
            'refId' => $this->ref_id,
            'props' => $this->props ?? (object) [],
        ];
    }
}
