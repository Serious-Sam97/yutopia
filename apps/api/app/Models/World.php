<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

// The one world everybody walks in (a single row).
class World extends Model
{
    protected $table = 'world';

    protected $fillable = ['name', 'map_key', 'layout', 'settings', 'seeded_at'];

    protected function casts(): array
    {
        return ['settings' => 'array', 'layout' => 'array', 'seeded_at' => 'datetime'];
    }

    public static function current(): self
    {
        return self::query()->orderBy('id')->first()
            ?? self::create(['name' => config('yutopia.world_name'), 'map_key' => 'studio']);
    }
}
