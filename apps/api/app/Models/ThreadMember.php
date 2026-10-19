<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ThreadMember extends Model
{
    protected $fillable = ['thread_id', 'user_id', 'last_read_id', 'muted', 'left_at'];

    protected function casts(): array
    {
        return ['muted' => 'boolean', 'left_at' => 'datetime', 'last_read_id' => 'integer'];
    }
}
