<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class GameSave extends Model
{
    protected $fillable = ['game', 'state_path', 'sram_path', 'updated_by'];
}
