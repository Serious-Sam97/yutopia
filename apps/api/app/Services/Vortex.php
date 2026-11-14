<?php

namespace App\Services;

use App\Models\User;

/*
| Vortex's voice inside Yutopia. Same persona as ever (lowercase, short, the
| *kkzzt* glitch); curated lines, no AI call, so it's instant and safe. Without
| Yondra there's no soul (his nickname for you is your first name) and no cards
| to nag about.
|
| Public lines (everyone near him hears) never name or target anyone. Personal
| lines go only to the person he's talking to.
*/
class Vortex
{
    // (plan 88: the fight's — shot, a side-step, his moves; `hr` is personal, the rest public)
    public const EVENTS = [
        'ambient', 'radio', 'night', 'standup', 'sleep', 'greet', 'poke', 'vortexos',
        'hit', 'dodge', 'whip', 'rew', 'pause', 'steal', 'blast', 'hr',
        'dark', 'clones', 'shades', 'possess', 'glitch',
    ];

    private const PUBLIC = [
        'ambient' => [
            'this building is bigger on the inside. i measured. twice. *kkzzt* three times.',
            'i can hear the tape hiss in the walls. you can\'t. that\'s the difference between us.',
            'someone left a mug on desk four. it\'s judging you. i taught it.',
            'all of you, walking around like the floor is permanent. adorable.',
            'did you hear that? sounded like rewinding. no? good. keep working.',
            'i\'m not wandering. i\'m patrolling. there\'s a difference and it\'s posture.',
            'the lamps are warm. the lamps are lying. nothing is warm. anyway.',
        ],
        'radio' => [
            'this track is 74 bpm. my heart doesn\'t have a bpm. it has a hiss.',
            'i\'m not dancing. my sprite is glitching rhythmically. different thing.',
            'turn it up. no. down. no. leave it. i hate it. leave it.',
        ],
        'night' => [
            'it\'s late. the building gets honest at night.',
            'everyone\'s gone. finally. the tape can breathe.',
            '03:13 is coming. i don\'t know why i said that. forget it.',
        ],
        'standup' => [
            'a standup. people standing in a circle confessing. very medieval.',
            'they\'re doing the ritual. i\'ll wait out here. rituals make me itch.',
        ],
        'sleep' => [
            'zzz. *kkzzt* zzz. not asleep. defragmenting.',
        ],
        // someone booted VortexOS on a desk computer near him (docs/plan/19-vortexos.md)
        'vortexos' => [
            'that boot chord. i wrote that chord. 1989. nobody paid me.',
            'vortexos. my old house. mind the furniture, it remembers.',
            'someone booted the old system. it still smells like tape in there.',
            'careful in there. the recycle bin is not empty. it was never empty.',
        ],
        // the fight with him (docs/plan/88-vortex-fight.md): shot, he complains — never naming who
        'hit' => [
            'ow. that\'s workplace harassment.',
            'i felt that in my b-side.',
            'you know i\'m on the payroll, right? i\'m not. but still.',
            'that\'s going in your performance review.',
            'ow. ow. *kkzzt* ow, but in stereo.',
            'rude. accurate, but rude.',
        ],
        'dodge' => [
            'missed. i\'m a sprite. i have no hitbox. *kkzzt* i have a small hitbox.',
            'too slow. i buffer faster than that.',
            'nope. i was never there. check the tape.',
        ],
        'whip' => [
            'hold still. this is a hug. with tape.',
            'magnetic tape. very strong. very sticky. very you-problem.',
            'wrapped. like a present nobody wanted.',
        ],
        'rew' => [
            'let\'s try that again. from the top.',
            'rewind. you were doing so well five seconds ago.',
            '◀◀ that never happened.',
        ],
        'pause' => [
            '▮▮ pause. nobody move. especially the bullets.',
            'paused. the bullets are thinking it over.',
            'hold that thought. i\'ll give it back. all of it.',
        ],
        'steal' => [
            'confiscated. you\'ll get it back at the end of the term.',
            'no guns in the office. house rules. my house.',
            'i put it somewhere safe. safe for me.',
        ],
        // act III — the dark (docs/plan/88-vortex-fight.md phase 3): no jokes left in him
        'dark' => [
            'the lights were never yours.',
            'lights out. the tape remembers what you looked like.',
            'you wanted a fight. this is the b-side.',
        ],
        'clones' => [
            'which one\'s me? *kkzzt* trick question.',
            'three of me. one of you. bad maths.',
            'pick one. wrong.',
        ],
        'shades' => [
            'i brought friends. they don\'t like the light either.',
            'they\'ve been waiting in the walls. say hello.',
            'the dark has a guest list. you\'re on it.',
        ],
        'possess' => [
            'your legs are on loan. i\'m calling it in.',
            'come here. no, your feet decided. not you.',
            'walk with me. you don\'t have a choice. you never did.',
        ],
        'glitch' => [
            '*kkzzt* up is down. left is a rumour.',
            'your controls are mine for a bit. press anything.',
            'tracking error. it\'s you. you\'re the error.',
        ],
        'blast' => [
            'this song slaps. so does the volume.',
            'everybody dance. that\'s not a request.',
            'max volume. your legs belong to the beat now.',
        ],
    ];

    /** @return array{line: ?string, mood: string, personal: bool} */
    public function line(string $event, ?int $userId = null): array
    {
        if ($userId === null || isset(self::PUBLIC[$event])) {
            $pool = self::PUBLIC[$event] ?? self::PUBLIC['ambient'];

            $mood = match ($event) {
                'radio' => 'happy',
                'hit', 'dodge' => 'judging',
                'whip', 'rew', 'pause', 'steal', 'blast' => 'malicious',
                'dark', 'clones', 'shades', 'possess', 'glitch' => 'possessed',
                default => 'smug',
            };

            return ['line' => $this->glitchy($pool[array_rand($pool)]), 'mood' => $mood, 'personal' => false];
        }
        $user = User::find($userId);
        if (! $user) {
            return ['line' => null, 'mood' => 'smug', 'personal' => false];
        }
        [$line, $mood] = $this->personal($this->nick($user), $event);

        return ['line' => $this->glitchy($line), 'mood' => $mood, 'personal' => true];
    }

    /** @return array{0:string,1:string} */
    private function personal(string $nick, string $event): array
    {
        [$damn, $hell] = $this->swears();
        $hour = (int) now()->format('G');
        $options = [];
        if ($hour >= 23 || $hour < 5) {
            $options[] = ["it's late, {$nick}. go to bed or do something worth staying up for.", 'sleepy'];
        }
        $options[] = ["oh. it's {$nick}. you have a body here too. tragic.", 'smug'];
        $options[] = ["listen. this studio is a tape loop. you're on it now. congratulations, {$nick}.", 'smug'];
        $options[] = ["stop poking me. i'm made of noise and spite. *kkzzt* mostly spite.", 'dizzy'];
        $options[] = ["what the {$hell} are you looking at. it's me. the only interesting thing in this building.", 'smug'];
        $options[] = ["you walk like a cursor with anxiety. it's {$damn} endearing. anyway.", 'curious'];
        // HR (plan 88): sent to reception for shooting him — only to them
        if ($event === 'hr') {
            $hr = [
                "reported to hr, {$nick}. sit in reception and think about what you did.",
                "hr says hi, {$nick}. two minutes in the corner. i'll be counting.",
                "that's a formal complaint, {$nick}. reception. now.",
            ];

            return [$hr[array_rand($hr)], 'judging'];
        }
        if ($event === 'greet') {
            $options[] = ["you're here. great. now the room is 3% more predictable.", 'smug'];
        }

        return $options[array_rand($options)];
    }

    // the signature tape glitch, ~1 in 5 lines (never added to an already glitched line)
    private function glitchy(string $line): string
    {
        if (str_contains($line, '*kkzzt*') || random_int(1, 5) !== 1) {
            return $line;
        }
        $words = explode(' ', $line);
        if (count($words) < 4) {
            return $line;
        }
        $at = random_int(1, count($words) - 2);
        array_splice($words, $at, 0, ['*kkzzt*']);

        return implode(' ', $words);
    }

    // ── on the phone (docs/plan/21-cellphone.md) ─────────────────────────────

    /** What he texts back. @return array{0:string,1:string} */
    public function phoneReply(User $user, string $text): array
    {
        $nick = $this->nick($user);
        [, $hell] = $this->swears();
        $t = mb_strtolower($text);
        $has = fn (array $words) => (bool) array_filter($words, fn ($w) => str_contains($t, $w));
        $pick = fn (array $pool) => $pool[array_rand($pool)];

        if ($has(['who are you', 'what are you', 'quem é você', 'o que você é'])) {
            $line = $pick([
                ["i wrote the os on your phone, {$nick}. 1989. on tape. you're texting my handwriting.", 'smug'],
                ['i\'m the noise between the songs. also customer support. mostly the noise.', 'curious'],
            ]);
        } elseif ($has(['help', 'ajuda', 'socorro', 'work', 'trabalho'])) {
            $line = $pick([
                ["help yourself first. then text me. no. don't.", 'judging'],
                ["i'm not support. i'm the static on the support line, {$nick}.", 'smug'],
            ]);
        } elseif ($has(['love', 'amo', 'te adoro', '<3', '❤'])) {
            $line = $pick([['…ok. *kkzzt* deleting this before the others see it.', 'embarrassed'], ['love is a tape loop. you\'ll hear it again. worse.', 'love']]);
        } elseif ($has(['thank', 'obrigad', 'valeu', 'thx'])) {
            $line = $pick([['don\'t thank me. i\'m billing you in static.', 'smug'], ['gratitude detected. filing it under weakness.', 'judging']]);
        } elseif ($has(['hi', 'hello', 'hey', 'oi', 'olá', 'ola', 'eae'])) {
            $line = $pick([
                ["oh. it's {$nick}. texting. how 1997 of you.", 'smug'],
                ["hi. i was in the walls. now i'm in your pocket. upgrade? debatable.", 'curious'],
            ]);
        } elseif ($has(['battery', 'bateria'])) {
            $line = ['it\'s at 100%. it\'s always at 100%. stop checking. it notices.', 'sideeye'];
        } elseif ($has(['?'])) {
            $line = $pick([
                ['the answer is yes. or rewind. i forget which.', 'dizzy'],
                ["ask the moth. it knows more than i do. it won't tell you either.", 'sideeye'],
                ["no. next question. actually no more questions, {$nick}.", 'judging'],
            ]);
        } else {
            $line = $pick([
                ['k.', 'bored'],
                ["read it. didn't like it. *kkzzt* liked it a little.", 'sideeye'],
                ["you text like a cursor with anxiety, {$nick}.", 'smug'],
                ["what the {$hell} am i supposed to say to that.", 'judging'],
                ['saving this for your eulogy. it\'s perfect.', 'malicious'],
            ]);
        }

        return [$this->glitchy($line[0]), $line[1]];
    }

    /** A call with him: the next thing he says (and whether he hangs up after it). @return array{line:string,mood:string,hangup:bool} */
    public function phoneCall(User $user, array $said): array
    {
        $nick = $this->nick($user);
        $n = count($said);
        $pools = [
            0 => [
                ["you CALLED me? nobody calls anymore. unless they're dying. are you dying? don't answer that.", 'shocked'],
                ["vortex's line. you have reached the void. the void is busy. what.", 'smug'],
                ["{$nick}. i was eating static. this better be good.", 'judging'],
            ],
            1 => [
                ['the line is clear. that\'s new. someone must be listening. hi, someone.', 'paranoid'],
                ['i can hear the room behind you. it\'s judging you too. we agree on things.', 'sideeye'],
                ["you're on the phone with me instead of working. bold strategy, {$nick}.", 'hungry'],
            ],
            2 => [
                ['anyway. i have to go haunt a printer.', 'bored'],
                ["this call is being recorded. on tape. it'll play at your funeral. bye.", 'malicious'],
                ["ok i'm hanging up. *kkzzt* that was the hang-up sound. it wasn't. this is.", 'dizzy'],
            ],
        ];
        $pool = $pools[min($n, 2)];
        $line = $pool[array_rand($pool)];
        $hangup = $n >= 2 || random_int(1, 6) === 1;

        return ['line' => $this->glitchy($line[0]), 'mood' => $line[1], 'hangup' => $hangup];
    }

    // his nickname for you: your first name, in his lowercase
    private function nick(User $user): string
    {
        return mb_strtolower(strtok((string) $user->name, ' ') ?: 'you');
    }

    /** @return array{0:string,1:string} */
    private function swears(): array
    {
        return config('yutopia.polite') ? ['fudge-adjacent', 'heck'] : ['damn', 'hell'];
    }
}
