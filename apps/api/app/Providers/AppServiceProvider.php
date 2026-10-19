<?php

namespace App\Providers;

use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void {}

    public function boot(): void
    {
        // people's own calls; the world-server's internal ones are never throttled
        RateLimiter::for('api', fn (Request $request) => Limit::perMinute(240)->by($request->user()?->id ?: $request->ip()));
        RateLimiter::for('auth', fn (Request $request) => Limit::perMinute(10)->by($request->ip()));

        // the reset link opens the client's page, which posts back to /api/reset-password
        ResetPassword::createUrlUsing(fn (User $user, string $token) => rtrim(config('yutopia.client_url'), '/')
            .'/reset?token='.$token.'&email='.urlencode($user->email));
    }
}
