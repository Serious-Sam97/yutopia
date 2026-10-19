<?php

use App\Http\Middleware\EnsureAdmin;
use App\Http\Middleware\VerifyInternalSignature;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->alias([
            'admin' => EnsureAdmin::class,
            'internal' => VerifyInternalSignature::class,
        ]);
        // the world-server's data is kept exactly as sent: a map row of void tiles is
        // all spaces, and trimming it (or turning it into null) breaks the layout
        $raw = fn ($request) => $request->is('api/internal/*');
        $middleware->trimStrings(except: [$raw]);
        $middleware->convertEmptyStringsToNull(except: [$raw]);
        // no login page to send guests to: they get a 401
        $middleware->redirectGuestsTo(fn () => null);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // an API only: errors are always JSON, never an HTML page or a login redirect
        $exceptions->shouldRenderJsonWhen(fn () => true);
    })->create();
