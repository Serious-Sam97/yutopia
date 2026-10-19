<?php

namespace App\Services;

use App\Http\Middleware\VerifyInternalSignature;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use RuntimeException;

// Signed calls from the API to the world-server (YUTOPIA_WORLD_INTERNAL), signed
// like its calls to us: {ts}.{METHOD}.{path}.{body} with YUTOPIA_INTERNAL_SECRET.
class WorldServer
{
    public function enabled(): bool
    {
        return (string) config('yutopia.world_internal') !== '' && (string) config('yutopia.internal_secret') !== '';
    }

    public function post(string $path, array $data, int $timeout = 3): Response
    {
        if (! $this->enabled()) {
            throw new RuntimeException('The world-server is not configured (YUTOPIA_WORLD_INTERNAL).');
        }
        $body = json_encode($data, JSON_UNESCAPED_SLASHES);
        $ts = (string) time();

        return Http::timeout($timeout)->withBody($body, 'application/json')->withHeaders([
            'X-Yutopia-Timestamp' => $ts,
            'X-Yutopia-Signature' => VerifyInternalSignature::sign((string) config('yutopia.internal_secret'), $ts, 'POST', $path, $body),
        ])->post(rtrim((string) config('yutopia.world_internal'), '/').$path);
    }
}
