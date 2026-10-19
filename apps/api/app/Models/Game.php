<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Game extends Model
{
    protected $fillable = ['uploaded_by', 'system', 'title', 'color', 'players', 'file_name', 'path', 'files', 'bytes', 'sha1'];

    protected $hidden = ['path'];

    protected function casts(): array
    {
        return ['files' => 'array', 'bytes' => 'integer', 'players' => 'integer'];
    }

    public function shapeFor(User $user): array
    {
        return [
            'id' => "u:{$this->id}",
            'system' => $this->system,
            'title' => $this->title,
            'color' => $this->color,
            'players' => $this->players,
            'bytes' => $this->bytes,
            'sha1' => $this->sha1,
            // the files the core gets, in order (a cartridge: its one file)
            'files' => $this->files ?? [['name' => $this->file_name, 'bytes' => $this->bytes]],
            'builtIn' => false,
            'mine' => $this->uploaded_by === $user->id,
        ];
    }
}
