<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Thread extends Model
{
    // everyone: the one thread every account is in (was a space's own thread)
    public const KINDS = ['direct', 'group', 'everyone', 'vortex'];

    protected $fillable = ['kind', 'name', 'direct_key', 'created_by', 'last_message_at'];

    protected function casts(): array
    {
        return ['last_message_at' => 'datetime'];
    }

    public function members(): HasMany
    {
        return $this->hasMany(ThreadMember::class);
    }

    public function messages(): HasMany
    {
        return $this->hasMany(Message::class);
    }
}
