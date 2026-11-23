<?php

namespace App\Services;

use App\Models\Npc;
use Illuminate\Support\Facades\Log;
use Throwable;

// The cast as it is now, handed to the world server after an admin changed it (docs/plan/120-god-mode-npcs.md): the
// town's people take it on live (POST /internal/cast, signed). Once the response is out, once a request however many
// changes it made. The world server down: it reads the cast when its room next opens.
class Cast
{
    public function __construct(private readonly WorldServer $world) {}

    private bool $hooked = false;

    public function changed(): void
    {
        if ($this->hooked) {
            return;
        }
        $this->hooked = true;
        app()->terminating(fn () => $this->flush());
    }

    public function flush(): void
    {
        $this->hooked = false;
        if (! $this->world->enabled()) {
            return;
        }
        try {
            $this->world->post('/internal/cast', ['npcs' => Npc::cast()])->throw();
        } catch (Throwable $e) {
            Log::warning('[cast] the world server didn\'t take the cast: '.$e->getMessage());
        }
    }
}
