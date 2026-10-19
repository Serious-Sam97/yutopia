<?php

return [
    // Shared with VortexOS's backend: signs its calls to redeem a "sign in with
    // Yutopia" code from a computer in the world. Empty = off.
    'shared_secret' => env('VORTEXOS_SHARED_SECRET'),
];
