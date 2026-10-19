<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Message extends Model
{
    public const MAX_TEXT = 1000; // shared/phone.ts MAX_TEXT

    protected $fillable = ['thread_id', 'user_id', 'kind', 'body', 'photo_id', 'meta', 'reactions', 'reply_to'];

    protected function casts(): array
    {
        return ['meta' => 'array', 'reactions' => 'array'];
    }

    public function photo(): BelongsTo
    {
        return $this->belongsTo(Photo::class);
    }
}
