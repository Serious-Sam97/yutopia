<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\URL;

class Photo extends Model
{
    public const QUOTA = 300; // shared/phone.ts PHOTO_QUOTA

    // how long a photo's link works (the phone fetches fresh ones with every list)
    public const LINK_DAYS = 7;

    protected $fillable = ['user_id', 'path', 'w', 'h', 'bytes', 'filter', 'selfie', 'sent', 'where', 'kind', 'mime', 'secs'];

    protected function casts(): array
    {
        return ['selfie' => 'boolean', 'sent' => 'boolean', 'w' => 'integer', 'h' => 'integer', 'secs' => 'integer'];
    }

    public function url(): string
    {
        // relative (signed:relative): the phone puts the API's origin in front.
        // The expiry is rounded to the day so the same photo keeps one URL (the
        // browser's cache) for a while.
        $until = now()->startOfDay()->addDays(self::LINK_DAYS);

        return URL::temporarySignedRoute('photo', $until, ['photo' => $this->id], absolute: false);
    }

    // as the phone reads it (times in ms)
    public function toPhone(): array
    {
        return [
            'id' => $this->id,
            'url' => $this->url(),
            'w' => $this->w,
            'h' => $this->h,
            'filter' => $this->filter,
            'where' => $this->where,
            'at' => $this->created_at->getTimestampMs(),
            'selfie' => $this->selfie,
            'sent' => $this->sent,
            'kind' => $this->kind ?? 'photo',
            'secs' => (int) ($this->secs ?? 0),
            'user_id' => $this->user_id,
        ];
    }
}
