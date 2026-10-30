<?php

namespace App\Services;

use App\Models\Avatar;
use App\Models\User;

class Avatars
{
    // what someone looks like before they open the editor
    public const DEFAULT = [
        'body' => 'regular', 'skin' => '#c68a5e', 'hair' => 'short', 'hairColor' => '#3b2a20',
        'top' => 'tee', 'topColor' => '#b5562f', 'bottom' => 'jeans', 'bottomColor' => '#3d4a5c',
        'accessory' => 'none', 'accessoryColor' => '#e8a33d', 'style' => 'ligne', 'gender' => 'neutral',
        'eyewear' => 'none', 'eyewearColor' => '#2a2420', 'extra' => 'none', 'extraColor' => '#e8a33d',
        'shoes' => 'sneakers', 'shoesColor' => '#efe4cc', 'beard' => 'none', 'gait' => 'calm',
    ];

    public function for(User $user): array
    {
        return array_merge(self::DEFAULT, Avatar::where('user_id', $user->id)->first()?->layers ?? []);
    }
}
