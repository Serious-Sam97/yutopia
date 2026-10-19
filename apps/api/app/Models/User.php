<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, Notifiable;

    protected $fillable = ['name', 'email', 'password'];

    protected $hidden = ['password', 'remember_token'];

    protected $attributes = ['is_admin' => false];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_admin' => 'boolean',
        ];
    }

    // A new account joins "everyone" with what was said before it counts as read.
    protected static function booted(): void
    {
        static::created(function (User $user) {
            $everyone = Thread::where('kind', 'everyone')->first();
            if ($everyone) {
                ThreadMember::firstOrCreate(
                    ['thread_id' => $everyone->id, 'user_id' => $user->id],
                    ['last_read_id' => (int) $everyone->messages()->max('id')],
                );
            }
        });
    }

    public function avatar(): HasOne
    {
        return $this->hasOne(Avatar::class);
    }

    // YUTOPIA_ADMINS lists the people who run the place; they get the flag when they
    // register or sign in. Taking it away is `php artisan yutopia:admin --revoke`.
    public function promoteIfListed(): void
    {
        if (! $this->is_admin && in_array(strtolower($this->email), config('yutopia.admins'), true)) {
            $this->forceFill(['is_admin' => true])->save();
        }
    }

    // world JWT roles: everyone builds, admins also moderate
    public function roles(): array
    {
        return $this->is_admin ? ['member', 'builder', 'admin'] : ['member', 'builder'];
    }

    public function toPublic(): array
    {
        return ['id' => $this->id, 'name' => $this->name, 'email' => $this->email, 'isAdmin' => $this->is_admin];
    }
}
