<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Contact extends Model
{
    public const MAX = 500;

    protected $fillable = ['user_id', 'contact_id'];
}
