<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

// One of the world's cast (docs/plan/120-god-mode-npcs.md): a person the world has, kept as shared npc/cast.ts's
// NpcDef. `clean()` is parseNpc's rules in PHP — the world server and the page clean again with the shared one; this
// keeps what's stored to its shape and its limits, whatever was sent.
class Npc extends Model
{
    /** The whole cast at most. */
    public const MAX = 500;

    public const LIMITS = ['name' => 40, 'role' => 40, 'line' => 140, 'lines' => 120, 'notes' => 1000];

    public const TYPES = ['stand', 'wander', 'route', 'counter', 'sit'];

    public const TOWN_TYPES = [
        'guard-rounds', 'kart-control', 'kart-mechanic', 'kart-cocoa', 'kart-visitor', 'vortex',
        'strike-quartermaster', 'strike-instructor', 'strike-cook', 'strike-keeper', 'strike-officer', 'strike-recruit',
    ];

    /** Anyone's line moments (plan 123: what's done with them too — shared npc/cast.ts LINE_WHEN). */
    public const LINE_WHEN = [
        'ambient', 'greet', 'answer', 'joke', 'laugh', 'compliment', 'day', 'job', 'chat', 'order', 'served', 'refuse',
        'thanks',
    ];

    /** Who they are (plan 123: shared npc/mind.ts), 0…1 each. */
    public const TRAITS = ['outgoing', 'active', 'neat', 'cheerful'];

    /** Vortex's public moments (Vortex::PUBLIC's keys). */
    public const VORTEX_WHEN = [
        'ambient', 'radio', 'night', 'standup', 'sleep', 'vortexos', 'hit', 'dodge', 'whip', 'rew', 'pause', 'steal',
        'blast', 'dark', 'clones', 'shades', 'possess', 'glitch', 'down',
    ];

    /** A look's slots (shared avatar.ts AvatarLayers): a colour is #rrggbb, an option a plain slug. */
    public const LOOK = [
        'body', 'skin', 'hair', 'hairColor', 'top', 'topColor', 'bottom', 'bottomColor', 'accessory', 'accessoryColor',
        'style', 'gender', 'eyewear', 'eyewearColor', 'extra', 'extraColor', 'shoes', 'shoesColor', 'beard', 'gait',
        'stance', 'outer', 'outerColor', 'topPattern', 'topColor2', 'bottomPattern', 'bottomColor2', 'outerPattern',
        'outerColor2', 'shoesColor2',
        // the face and age on the new body (plan 131): 24 numbers −9…9, or '' (from their name)
        'face',
    ];

    public const KEY = '/^[a-z0-9][a-z0-9-]{0,39}$/';

    protected $fillable = ['key', 'def', 'town', 'position'];

    protected function casts(): array
    {
        return ['def' => 'array', 'town' => 'boolean', 'position' => 'integer'];
    }

    /** The whole cast, in the list's order, as NpcDefs. @return list<array> */
    public static function cast(): array
    {
        return self::orderBy('position')->orderBy('id')->get()->map->toDef()->all();
    }

    /** Whether the town's people have been put in (once). */
    public static function seeded(): bool
    {
        return ! empty(World::current()->settings['npcsSeeded'] ?? null);
    }

    public static function markSeeded(): void
    {
        $w = World::current();
        $w->settings = array_merge($w->settings ?? [], ['npcsSeeded' => now()->toIso8601String()]);
        $w->save();
    }

    public static function newKey(): string
    {
        do {
            $key = 'npc-'.Str::lower(Str::random(8));
        } while (! preg_match(self::KEY, $key) || self::where('key', $key)->exists());

        return $key;
    }

    public function toDef(): array
    {
        $def = $this->def ?? [];
        // (a look with nothing set is an object — {} — not PHP's empty array: the shared parseAvatar's to fill in)
        if (array_key_exists('look', $def) && $def['look'] === []) {
            $def['look'] = (object) [];
        }

        return array_merge($def, [
            'key' => $this->key,
            'town' => $this->town,
            'made' => $this->created_at?->toIso8601String(),
            'changed' => $this->updated_at?->toIso8601String(),
        ]);
    }

    /**
     * An NPC as sent, to its shape (shared parseNpc): null if it can't be one. `town` and a town NPC's type are the
     * stored one's, never what was sent.
     */
    public static function clean(array $o, string $key, bool $town, ?string $keptType = null): ?array
    {
        if (! preg_match(self::KEY, $key)) {
            return null;
        }
        $b = is_array($o['behaviour'] ?? null) ? $o['behaviour'] : [];
        $sent = is_string($b['type'] ?? null) ? $b['type'] : '';
        $type = $town && $keptType !== null ? $keptType
            : ($town ? (in_array($sent, [...self::TOWN_TYPES, ...self::TYPES], true) ? $sent : 'stand')
                : (in_array($sent, self::TYPES, true) ? $sent : 'stand'));
        $pace = $b['pace'] ?? null;
        $pace = $pace === null || $pace === '' || ! is_numeric($pace) ? null : max(0.5, min(1.5, round(((float) $pace) * 20) / 20));
        $hour = fn ($v, $or) => is_numeric($v) ? max(0, min(24, round(((float) $v) * 2) / 2)) : $or;
        $one = fn ($v, array $list, string $or) => is_string($v) && in_array($v, $list, true) ? $v : $or;

        $when = $type === 'vortex' ? self::VORTEX_WHEN : self::LINE_WHEN;
        $lines = [];
        foreach (is_array($o['lines'] ?? null) ? $o['lines'] : [] as $l) {
            if (count($lines) >= self::LIMITS['lines']) {
                break;
            }
            if (! is_array($l)) {
                continue;
            }
            $en = self::str($l['en'] ?? null, self::LIMITS['line']);
            $pt = self::str($l['pt'] ?? null, self::LIMITS['line']);
            if ($en === '' && $pt === '') {
                continue;
            }
            $lines[] = ['when' => $one($l['when'] ?? null, $when, 'ambient'), 'en' => $en !== '' ? $en : $pt, 'pt' => $en !== '' ? $pt : ''];
        }
        $name = self::str($o['name'] ?? null, self::LIMITS['name']);
        $r = is_array($o['role'] ?? null) ? $o['role'] : [];
        $ren = self::str($r['en'] ?? null, self::LIMITS['role']);
        $rpt = self::str($r['pt'] ?? null, self::LIMITS['role']);
        if ($name === '' && $ren === '' && $rpt === '') {
            return null;
        }
        $look = null;
        if ($type !== 'vortex') {
            $look = [];
            $sentLook = is_array($o['look'] ?? null) ? $o['look'] : [];
            foreach (self::LOOK as $k) {
                $v = $sentLook[$k] ?? null;
                if (! is_string($v)) {
                    continue;
                }
                if ($k === 'face') {
                    if (preg_match('/^(-?[0-9](,-?[0-9]){23})?$/', $v)) {
                        $look[$k] = $v;
                    }

                    continue;
                }
                $colour = $k === 'skin' || str_contains($k, 'Color');
                if ($colour ? preg_match('/^#[0-9a-f]{6}$/i', $v) : preg_match('/^[a-z0-9_-]{1,24}$/i', $v)) {
                    $look[$k] = $v;
                }
            }
        }

        return [
            'key' => $key,
            'name' => $name,
            'role' => ['en' => $ren !== '' ? $ren : $rpt, 'pt' => $ren !== '' ? $rpt : ''],
            'look' => $look,
            'voice' => $one($o['voice'] ?? null, ['man', 'woman'], ($look['gender'] ?? '') === 'feminine' ? 'woman' : 'man'),
            'lines' => $lines,
            'notes' => self::str($o['notes'] ?? null, self::LIMITS['notes']),
            'behaviour' => [
                'type' => $type,
                'hours' => $one($b['hours'] ?? null, ['always', 'day', 'night', 'shift'], 'always'),
                'from' => $hour($b['from'] ?? null, 8),
                'to' => $hour($b['to'] ?? null, 18),
                'pace' => $pace,
                'talk' => $one($b['talk'] ?? null, ['never', 'rarely', 'sometimes', 'often'], 'sometimes'),
                'greet' => ($b['greet'] ?? false) === true,
                'answer' => ($b['answer'] ?? false) === true,
                'shots' => $one($b['shots'] ?? null, ['ignore', 'duck', 'flee'], 'ignore'),
                'traits' => self::traits($b['traits'] ?? null),
            ],
            'town' => $town,
        ];
    }

    /** Traits as sent: each 0…1 in tenths (one not a number: 0.5); none a number: null — from their key. */
    private static function traits(mixed $v): ?array
    {
        if (! is_array($v)) {
            return null;
        }
        $out = [];
        $any = false;
        foreach (self::TRAITS as $k) {
            $n = $v[$k] ?? null;
            if ((is_int($n) || is_float($n)) && is_finite((float) $n)) {
                $any = true;
                $out[$k] = max(0, min(1, round(((float) $n) * 10) / 10));
            } else {
                $out[$k] = 0.5;
            }
        }

        return $any ? $out : null;
    }

    // (control characters out: spaces; trimmed; at most this many characters)
    private static function str(mixed $v, int $max): string
    {
        if (! is_string($v)) {
            return '';
        }

        return mb_substr(trim((string) preg_replace('/[\x00-\x1f\x7f]/u', ' ', $v)), 0, $max);
    }
}
