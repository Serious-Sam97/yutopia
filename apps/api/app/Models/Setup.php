<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Setup extends Model
{
    public const MAX = 24; // per person

    protected $fillable = ['user_id', 'name', 'items'];

    protected function casts(): array
    {
        return ['items' => 'array'];
    }
}
