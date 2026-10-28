<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

// One thing an admin did (docs/plan/48-the-admin.md): the world server's moderation and
// powers, and the API's own (roles, invites). Kept 90 days.
class AdminAction extends Model
{
    public $timestamps = false;

    protected $fillable = ['admin_id', 'admin_name', 'kind', 'target_id', 'target', 'detail', 'at'];

    protected function casts(): array
    {
        return ['at' => 'datetime'];
    }

    public static function record(?User $admin, string $kind, ?User $target = null, string $detail = '', string $what = ''): self
    {
        // (older than 90 days: let go)
        self::where('at', '<', now()->subDays(90))->delete();

        return self::create([
            'admin_id' => $admin?->id,
            'admin_name' => $admin?->name ?? '',
            'kind' => $kind,
            'target_id' => $target?->id,
            'target' => mb_substr($target?->name ?? $what, 0, 160),
            'detail' => mb_substr($detail, 0, 200),
            'at' => now(),
        ]);
    }

    public function toPublic(): array
    {
        return [
            'id' => $this->id,
            'adminId' => $this->admin_id,
            'admin' => $this->admin_name,
            'kind' => $this->kind,
            'targetId' => $this->target_id,
            'target' => $this->target,
            'detail' => $this->detail,
            'at' => $this->at->toIso8601String(),
        ];
    }
}
