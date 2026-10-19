<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // the demo people have a known password: only where YUTOPIA_DEMO=1 (local dev)
        if (config('yutopia.demo')) {
            $this->call(DemoSeeder::class);
        }
    }
}
