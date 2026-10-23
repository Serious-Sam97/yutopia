<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

/*
| The demo people the dev stack and the e2e tests sign in as (local dev only):
| ana@yutopia.test (admin), bia@yutopia.test and cai@yutopia.test (a third, for
| the group call), password = env YUTOPIA_DEMO_PASSWORD
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
        User::updateOrCreate(['email' => 'cai@yutopia.test'], ['name' => 'Cai Demo', 'password' => $password]);
    }
}
