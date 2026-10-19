<?php

use App\Http\Controllers\UploadsController;
use App\Models\Upload;
use App\Models\User;
use App\Services\WorldSnapshot;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

// php artisan yutopia:admin ana@yutopia.test [--revoke]
Artisan::command('yutopia:admin {email} {--revoke}', function (string $email) {
    $user = User::where('email', strtolower($email))->first();
    if (! $user) {
        $this->error("No account for {$email}.");

        return 1;
    }
    $user->forceFill(['is_admin' => ! $this->option('revoke')])->save();
    $this->info($user->is_admin ? "{$user->name} is an admin." : "{$user->name} is no longer an admin.");

    return 0;
})->purpose('Make someone an admin (mutes, kicks, room locks), or take it away');

// Games someone started bringing and never finished: gone after a day without a
// new piece (their chunks with them).
Artisan::command('yutopia:prune-uploads {--hours=24}', function () {
    $stale = Upload::where('updated_at', '<', now()->subHours((int) $this->option('hours')))->get();
    foreach ($stale as $up) {
        UploadsController::drop($up);
    }
    $this->info("Dropped {$stale->count()} unfinished uploads.");

    return 0;
})->purpose('Drop game uploads left unfinished');

Schedule::command('yutopia:prune-uploads')->hourly();

// php artisan yutopia:world export world.json · yutopia:world import world.json [--clear-spawns]
Artisan::command('yutopia:world {action : export | import} {file} {--clear-spawns}', function (WorldSnapshot $snapshots, string $action, string $file) {
    if ($action === 'export') {
        file_put_contents($file, json_encode($snapshots->export(), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
        $this->info("The world is in {$file}.");

        return 0;
    }
    if ($action !== 'import' || ! is_file($file)) {
        $this->error($action === 'import' ? "No file {$file}." : 'export or import.');

        return 1;
    }
    $done = $snapshots->import(json_decode((string) file_get_contents($file), true) ?? [], (bool) $this->option('clear-spawns'));
    $this->info("The world is back from {$file}: {$done['objects']} objects".($done['roomClosed'] ? ' (the live room was closed and reopens on the next join).' : '.'));

    return 0;
})->purpose('Keep the world aside in a file, or put it back from one');
