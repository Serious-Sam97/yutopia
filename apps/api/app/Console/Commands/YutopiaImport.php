<?php

namespace App\Console\Commands;

use App\Services\YondraImport;
use Illuminate\Console\Command;
use Throwable;

// The move off Yondra, once (docs/plan/24-standalone.md §7). Reads Yondra through the
// `yondra` connection (YONDRA_DB_*) and its files (--storage), writes the one world here.
class YutopiaImport extends Command
{
    protected $signature = 'yutopia:import
        {--world= : the Yondra space that becomes the world (its id)}
        {--users=yutopia : yutopia (people with any Yutopia data) or all (every Yondra account)}
        {--games=world : world (the chosen space\'s games, saves, BIOS) or all (every space\'s, de-duplicated)}
        {--threads=keep : other spaces\' group chats: keep (as groups) or drop}
        {--storage= : Yondra\'s storage/app/private folder (the one with yutopia/ in it)}
        {--dry-run : print what would come along, write nothing}
        {--fresh : wipe this database\'s people and world first}';

    protected $description = 'Bring Yutopia\'s data over from Yondra (dry run first)';

    public function handle(YondraImport $import): int
    {
        if (! ctype_digit((string) $this->option('world'))) {
            $this->error('--world=<space id> is required (the dry run lists the spaces).');

            return self::FAILURE;
        }
        foreach (['users' => ['yutopia', 'all'], 'games' => ['world', 'all'], 'threads' => ['keep', 'drop']] as $k => $ok) {
            if (! in_array($this->option($k), $ok, true)) {
                $this->error("--{$k} is one of: ".implode(', ', $ok));

                return self::FAILURE;
            }
        }
        try {
            $plan = $import->plan([
                'world' => (int) $this->option('world'),
                'users' => $this->option('users'),
                'games' => $this->option('games'),
                'threads' => $this->option('threads'),
                'storage' => $this->option('storage') ?: null,
            ]);
            foreach ($import->report($plan) as $line) {
                $this->line($line);
            }
            if ($this->option('dry-run')) {
                $this->newLine();
                $this->info('Dry run: nothing written.');

                return self::SUCCESS;
            }
            $this->newLine();
            $counts = $import->run($plan, (bool) $this->option('fresh'), fn (string $m) => $this->info($m));
            $this->info('Done: '.collect($counts)->map(fn ($n, $t) => "{$t} {$n}")->implode(' · '));

            return self::SUCCESS;
        } catch (Throwable $e) {
            $this->error($e->getMessage());

            return self::FAILURE;
        }
    }
}
