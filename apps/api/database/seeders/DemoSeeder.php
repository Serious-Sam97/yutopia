<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

/*
| The two demo people the dev stack and the e2e tests sign in as (local dev only):
| ana@yutopia.test (admin) and bia@yutopia.test, password = env YUTOPIA_DEMO_PASSWORD
| (default "yutopia-demo"). Safe to run again.
*/
class DemoSeeder extends Seeder
{
    public function run(): void
    {
        $password = Hash::make(env('YUTOPIA_DEMO_PASSWORD', 'yutopia-demo'));
        $ana = User::updateOrCreate(['email' => 'ana@yutopia.test'], ['name' => 'Ana Demo', 'password' => $password]);
        $ana->forceFill(['is_admin' => true])->save();
        User::updateOrCreate(['email' => 'bia@yutopia.test'], ['name' => 'Bia Demo', 'password' => $password]);
    }
}
