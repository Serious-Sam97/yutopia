<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Phone extends Model
{
    protected $fillable = ['user_id', 'settings'];

    protected function casts(): array
    {
        return ['settings' => 'array'];
    }
}
