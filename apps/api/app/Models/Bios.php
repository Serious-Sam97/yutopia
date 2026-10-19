<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Bios extends Model
{
    protected $table = 'bios';

    protected $fillable = ['uploaded_by', 'system', 'md5', 'file_name', 'path'];

    protected $hidden = ['path'];
}
