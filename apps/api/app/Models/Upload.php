<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUlids;
use Illuminate\Database\Eloquent\Model;

class Upload extends Model
{
    use HasUlids;

    protected $fillable = ['user_id', 'system', 'title', 'color', 'players', 'files', 'bytes'];

    protected function casts(): array
    {
        return ['files' => 'array', 'bytes' => 'integer', 'players' => 'integer'];
    }
}
