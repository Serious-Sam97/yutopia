<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Spawn extends Model
{
    protected $fillable = ['user_id', 'x', 'y'];

    protected function casts(): array
    {
        return ['x' => 'float', 'y' => 'float'];
    }
}
