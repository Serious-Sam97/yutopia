<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

class Invite extends Model
{
    protected $fillable = ['code', 'created_by', 'email', 'expires_at'];

    protected function casts(): array
    {
        return ['used_at' => 'datetime', 'expires_at' => 'datetime'];
    }

    public static function make(User $by, ?string $email): self
    {
        return self::create([
            'code' => Str::random(32),
            'created_by' => $by->id,
            'email' => $email ? strtolower($email) : null,
            'expires_at' => now()->addDays(config('yutopia.invite_days')),
        ]);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'used_by');
    }

    public function isOpenFor(?string $email = null): bool
    {
        return $this->used_at === null
            && $this->expires_at->isFuture()
            && ($this->email === null || $email === null || $this->email === strtolower($email));
    }

    public function toPublic(): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'email' => $this->email,
            'url' => rtrim(config('yutopia.client_url'), '/').'/register?invite='.$this->code,
            'usedAt' => $this->used_at?->toIso8601String(),
            'usedBy' => $this->user?->name,
            'expiresAt' => $this->expires_at->toIso8601String(),
        ];
    }
}
