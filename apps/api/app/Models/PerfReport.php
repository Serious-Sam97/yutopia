<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

// How the game ran for someone over ~30 s of play (docs/plan/39-the-telemetry.md).
class PerfReport extends Model
{
    protected $guarded = ['id'];

    protected function casts(): array
    {
        return [
            'at' => 'datetime',
            'secs' => 'float',
            'level' => 'integer',
            'x' => 'float',
            'y' => 'float',
            'fps' => 'float',
            'frame_med' => 'float',
            'frame_p95' => 'float',
            'frame_worst' => 'float',
            'gap_p95' => 'float',
            'over33' => 'integer',
            'over50' => 'integer',
            'long_tasks' => 'integer',
            'draws' => 'integer',
            'ping_med' => 'float',
            'ping_p95' => 'float',
            'snaps' => 'integer',
            'stages' => 'array',
            'machine' => 'array',
            'context' => 'array',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
