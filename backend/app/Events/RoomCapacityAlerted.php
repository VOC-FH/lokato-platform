<?php

namespace App\Events;

use App\Models\Alert;
use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Queue\SerializesModels;
use Illuminate\Foundation\Events\Dispatchable;

class RoomCapacityAlerted implements ShouldBroadcastNow
{
    use Dispatchable, SerializesModels;

    public function __construct(
        public Alert $alert,
    ) {
    }

    public function broadcastOn(): array
    {
        return [new Channel('alerts')];
    }

    public function broadcastAs(): string
    {
        return 'RoomCapacityAlerted';
    }

    public function broadcastWith(): array
    {
        $room = $this->alert->room;

        return [
            'id' => $this->alert->id,
            'room' => [
                'id' => $room->id,
                'name' => $room->name,
            ],
            'type' => $this->alert->type,
            'level' => $this->alert->level,
            'code' => $this->alert->code,
            'message' => $this->alert->message,
            'is_active' => $this->alert->is_active,
            'payload' => $this->alert->payload,
            'triggered_at' => $this->alert->triggered_at?->toIso8601String(),
            'resolved_at' => $this->alert->resolved_at?->toIso8601String(),
        ];
    }
}
