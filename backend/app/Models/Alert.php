<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Alert extends Model
{
    protected $fillable = [
        'room_id',
        'type',
        'level',
        'code',
        'message',
        'is_active',
        'payload',
        'triggered_at',
        'resolved_at',
    ];

    protected $casts = [
        'is_active' => 'boolean',
        'payload' => 'array',
        'triggered_at' => 'datetime',
        'resolved_at' => 'datetime',
    ];

    public function room(): BelongsTo
    {
        return $this->belongsTo(Room::class);
    }
}
