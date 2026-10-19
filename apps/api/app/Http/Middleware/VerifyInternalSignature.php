<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

// The world-server's calls (/api/internal/*): HMAC-SHA256 with YUTOPIA_INTERNAL_SECRET
// over "{ts}.{METHOD}.{path?query}.{raw body}", sent as X-Yutopia-Timestamp and
// X-Yutopia-Signature (hex). Method and path are signed too, so a captured call can't
// be replayed against another route; a timestamp more than 5 minutes off is refused.
class VerifyInternalSignature
{
    public const SKEW = 300;

    public function handle(Request $request, Closure $next): Response
    {
        $secret = (string) config('yutopia.internal_secret');
        $ts = (string) $request->header('X-Yutopia-Timestamp', '');
        $sig = (string) $request->header('X-Yutopia-Signature', '');
        abort_if($secret === '' || ! ctype_digit($ts) || abs(time() - (int) $ts) > self::SKEW, 401);
        abort_unless(hash_equals(self::sign($secret, $ts, $request->method(), $request->getRequestUri(), $request->getContent()), $sig), 401);

        return $next($request);
    }

    public static function sign(string $secret, string $ts, string $method, string $uri, string $body): string
    {
        return hash_hmac('sha256', $ts.'.'.strtoupper($method).'.'.$uri.'.'.$body, $secret);
    }
}
