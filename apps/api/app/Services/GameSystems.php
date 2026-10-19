<?php

namespace App\Services;

// The consoles of Yutopia's game room, the API's side: what each takes, how big,
// how many play; the disc console's rules for a disc in several files; and the
// BIOS dumps it accepts. The same table as yutopia/packages/shared/src/games.ts.
final class GameSystems
{
    // [extensions, max bytes, players]
    public const SYSTEMS = [
        '2600' => [['a26', 'bin'], 64 * 1024, 2],
        'nes' => [['nes'], 1024 * 1024, 2],
        'snes' => [['sfc', 'smc'], 8 * 1024 * 1024, 2],
        'md' => [['md', 'gen', 'bin', 'smd'], 8 * 1024 * 1024, 2],
        'gb' => [['gb', 'gbc'], 8 * 1024 * 1024, 1],
        'ps1' => [['chd', 'pbp', 'cue', 'bin', 'iso'], 900 * 1024 * 1024, 2],
    ];

    // consoles that play discs: their own (bigger) quota, uploads in chunks
    public const DISCS = ['ps1'];

    public const CARTRIDGE_QUOTA = 128 * 1024 * 1024; // for the whole world

    public const CHUNK = 8 * 1024 * 1024; // an upload's pieces

    public const MAX_FILES = 64; // a disc's .cue and its tracks

    public const BIOS_BYTES = 512 * 1024;

    // The retail dumps the disc console takes, by MD5 (as listed in libretro's
    // PCSX ReARMed and Beetle PSX docs) → [the name it's kept under, model,
    // region, version]. PCSX ReARMed takes any of them whatever the disc's
    // region; it looks for these names first, then anything "scph*".
    public const BIOS = [
        '6e3735ff4c7dc899ee98981385f6f3d0' => ['scph101.bin', 'SCPH-101', 'NTSC-U', '4.4'],
        '1e68c231d0896b7eadcad1d7d8e76129' => ['scph7001.bin', 'SCPH-7001', 'NTSC-U', '4.1'],
        '490f666e1afb15b7362b406ed1cea246' => ['scph5501.bin', 'SCPH-5501', 'NTSC-U', '3.0'],
        '924e392ed05558ffdb115408c263dccf' => ['scph1001.bin', 'SCPH-1001', 'NTSC-U', '2.0'],
        '8dd7d5296a650fac7319bce665a6a53c' => ['scph5500.bin', 'SCPH-5500', 'NTSC-J', '3.0'],
        '32736f17079d0b2b7024407c39bd3050' => ['scph5502.bin', 'SCPH-5502', 'PAL', '3.0'],
        'c53ca5908936d412331790f4426c6c33' => ['scphpsp.bin', 'PSP (PS1 mode)', 'any', '6.60'],
    ];

    // A BIOS by its MD5: [name, model, region, version], or null. Tests and the
    // dev stack can name one more (YUTOPIA_TEST_BIOS_MD5; never in production):
    // nobody can ship a real one with them.
    public static function bios(string $md5): ?array
    {
        $test = config('yutopia.test_bios_md5');
        if ($test && hash_equals((string) $test, $md5)) {
            return ['scphtest.bin', 'Test BIOS', 'dev', '0'];
        }

        return self::BIOS[$md5] ?? null;
    }

    public static function isDisc(string $system): bool
    {
        return in_array($system, self::DISCS, true);
    }

    public static function discQuota(): int
    {
        return (int) config('yutopia.disc_quota');
    }

    public static function ext(string $name): string
    {
        return strtolower(pathinfo($name, PATHINFO_EXTENSION));
    }

    // A game's files, by name and size, for one console: null when they make a
    // game, else why not. A cartridge is one file; a disc is one .chd / .pbp /
    // .iso, or a .cue with its .bin tracks. Returns the files in order (what the
    // core opens first) through $ordered.
    public static function filesFit(string $system, array $files, ?array &$ordered = null): ?string
    {
        [$exts, $max] = self::SYSTEMS[$system];
        $names = [];
        $total = 0;
        foreach ($files as $f) {
            $name = (string) ($f['name'] ?? '');
            if (preg_match('/^(?!\.)[\w .()\[\]&\'+,!-]{1,120}$/u', $name) !== 1) {
                return "That file name won't do: {$name}";
            }
            if (isset($names[strtolower($name)])) {
                return "{$name} is there twice.";
            }
            $names[strtolower($name)] = true;
            if (! in_array(self::ext($name), $exts, true)) {
                return self::isDisc($system) ? "{$name} isn't part of a disc." : "{$name} isn't a cartridge for this console.";
            }
            $size = (int) ($f['size'] ?? 0);
            if ($size <= 0) {
                return "{$name} is empty.";
            }
            $total += $size;
        }
        if ($total > $max) {
            return self::isDisc($system) ? 'That disc is too big.' : 'That cartridge is too big for this console.';
        }
        if (! self::isDisc($system)) {
            $ordered = $files;

            return count($files) === 1 ? null : 'A cartridge is one file.';
        }
        $cues = array_values(array_filter($files, fn ($f) => self::ext($f['name']) === 'cue'));
        if ($cues) {
            if (count($cues) > 1) {
                return 'One disc at a time: one .cue.';
            }
            $tracks = array_values(array_filter($files, fn ($f) => self::ext($f['name']) === 'bin'));
            if (count($tracks) !== count($files) - 1 || ! $tracks) {
                return 'A .cue comes with its .bin tracks (and nothing else).';
            }
            if ($cues[0]['size'] > 64 * 1024) {
                return 'That .cue is too big to be one.';
            }
            $ordered = [$cues[0], ...$tracks];

            return null;
        }
        if (count($files) !== 1) {
            return 'A disc in several files needs its .cue.';
        }
        if (self::ext($files[0]['name']) === 'bin') {
            return 'A .bin needs its .cue (or bring the disc as .chd).';
        }
        $ordered = $files;

        return null;
    }

    // A finished disc's files, on disk, are what they say: a .cue names exactly
    // the tracks that came with it, a .chd / .pbp starts as one does, an .iso is
    // whole sectors.
    public static function checkDisc(string $dir, array $files): ?string
    {
        $main = $files[0]['name'];
        $path = "{$dir}/{$main}";
        $ext = self::ext($main);
        if ($ext === 'cue') {
            preg_match_all('/^\s*FILE\s+(?:"([^"]+)"|(\S+))\s+\S+/mi', (string) file_get_contents($path), $m, PREG_SET_ORDER);
            $named = array_map(fn ($x) => $x[1] !== '' ? $x[1] : $x[2], $m);
            $tracks = array_map(fn ($f) => $f['name'], array_slice($files, 1));
            $missing = array_diff($named, $tracks);
            if (! $named || $missing) {
                return $named ? 'The .cue names tracks that didn\'t come: '.implode(', ', $missing) : 'That .cue names no tracks.';
            }
            $extra = array_diff($tracks, $named);

            return $extra ? 'The .cue doesn\'t name: '.implode(', ', $extra) : null;
        }
        $head = (string) file_get_contents($path, false, null, 0, 8);
        if ($ext === 'chd' && $head !== 'MComprHD') {
            return "{$main} isn't a CHD.";
        }
        if ($ext === 'pbp' && substr($head, 0, 4) !== "\0PBP") {
            return "{$main} isn't a PBP.";
        }
        if ($ext === 'iso' && filesize($path) % 2048 !== 0 && filesize($path) % 2352 !== 0) {
            return "{$main} isn't a whole disc image.";
        }

        return null;
    }
}
