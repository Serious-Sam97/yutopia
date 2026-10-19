<?php

namespace App\Services;

use Illuminate\Support\Facades\Log;
use Throwable;

// Live phone events (a text, a read, typing…) for people who are online: everyone
// online is connected to the world-server, so the API hands them over there
// (POST /internal/push, signed like the world-server's own calls) and it sends each
// one to that person's client. Events are gathered during a request and sent in one
// call once the response is out; people offline pick them up on their next fetch.
class Push
{
    public function __construct(private readonly WorldServer $world) {}

    /** @var list<array{uid: int, event: array}> */
    private array $queue = [];

    private bool $hooked = false;

    public function send(int $uid, array $event): void
    {
        $this->queue[] = ['uid' => $uid, 'event' => $event];
        if (! $this->hooked) {
            $this->hooked = true;
            app()->terminating(fn () => $this->flush());
        }
    }

    public function flush(): void
    {
        $events = $this->queue;
        $this->queue = [];
        $this->hooked = false;
        if ($events === [] || ! $this->world->enabled()) {
            return;
        }
        foreach (array_chunk($events, 200) as $chunk) {
            try {
                $this->world->post('/internal/push', ['events' => $chunk])->throw();
            } catch (Throwable $e) {
                Log::warning('Yutopia push failed', ['error' => $e->getMessage(), 'events' => count($chunk)]);
            }
        }
    }
}
