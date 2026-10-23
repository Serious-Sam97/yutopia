<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

// Where someone was when they last left the world (docs/plan/36-the-ghost.md).
class LastSpot extends Model
{
    protected $fillable = ['user_id', 'x', 'y', 'level', 'd'];

    protected function casts(): array
    {
        return ['x' => 'float', 'y' => 'float', 'level' => 'integer', 'd' => 'integer'];
    }
}
