<?php

return [
    // the one world everybody walks in
    'world_name' => env('YUTOPIA_WORLD_NAME', 'Yutopia'),
    // Shared with the world-server: it verifies the short-lived world tokens we mint.
    'world_secret' => env('YUTOPIA_WORLD_SECRET'),
    // Signs world-server ↔ API internal calls (both ways).
    'internal_secret' => env('YUTOPIA_INTERNAL_SECRET'),
    'world_url' => env('YUTOPIA_WORLD_URL', 'ws://localhost:2567'),
    // how the API reaches the world-server itself (live phone events → /internal/push); empty = off
    'world_internal' => env('YUTOPIA_WORLD_INTERNAL'),
    'client_url' => env('YUTOPIA_CLIENT_URL', 'http://localhost:3100'),
    'token_ttl' => (int) env('YUTOPIA_TOKEN_TTL', 600),
    // Vortex keeps it clean (heck, not hell)
    'polite' => (bool) env('YUTOPIA_POLITE', false),

    // the game room: the discs the world keeps (bytes; cartridges have their own 128 MB)
    'disc_quota' => (int) env('YUTOPIA_DISC_QUOTA', 10 * 1024 * 1024 * 1024),
    // one more BIOS (by MD5) the disc console takes, for tests and the dev stack
    // only — never set in production
    'test_bios_md5' => env('YUTOPIA_TEST_BIOS_MD5'),

    // seed the demo people (ana@ / bia@yutopia.test, a known password): local dev only
    'demo' => (bool) env('YUTOPIA_DEMO', false),

    // the e2e suite may put the world back to a fixture (POST /api/e2e/world, admins);
    // local dev and test stacks only — never in production
    'e2e' => (bool) env('YUTOPIA_E2E', false),

    // open: anyone can register · invite: only with a link an admin made · closed: nobody
    'signup' => env('YUTOPIA_SIGNUP', 'invite'),
    'invite_days' => (int) env('YUTOPIA_INVITE_DAYS', 14),
    // these addresses become admins when they register or sign in (comma-separated)
    'admins' => array_values(array_filter(array_map(
        fn (string $e) => strtolower(trim($e)),
        explode(',', (string) env('YUTOPIA_ADMINS', '')),
    ))),

    'livekit' => [
        'url' => env('LIVEKIT_URL', 'ws://localhost:7880'),
        'key' => env('LIVEKIT_API_KEY'),
        'secret' => env('LIVEKIT_API_SECRET'),
    ],

    // Cloudflare TURN (Realtime → TURN): relays media when browsers can't reach LiveKit directly.
    'turn' => [
        'key_id' => env('CLOUDFLARE_TURN_KEY_ID'),
        'api_token' => env('CLOUDFLARE_TURN_API_TOKEN'),
        'ttl' => (int) env('CLOUDFLARE_TURN_TTL', 86400),
    ],
];
