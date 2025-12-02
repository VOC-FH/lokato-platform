<?php

namespace App\Events;

use App\Models\Room;
use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Queue\SerializesModels;
use Illuminate\Foundation\Events\Dispatchable;

class RoomOccupancyUpdated implements ShouldBroadcastNow
{
    use Dispatchable, SerializesModels;

    public function __construct(
        public Room $room,
        public int $occupancy,
    ) {
    }

    public function broadcastOn(): array
    {
        return [new Channel('rooms')];
    }

    public function broadcastAs(): string
    {
        return 'RoomOccupancyUpdated';
    }

    public function broadcastWith(): array
    {
        return [
            'room' => [
                'id' => $this->room->id,
                'name' => $this->room->name,
                'area' => $this->room->area,
                'capacity' => $this->room->capacity,
                'tolerance' => $this->room->tolerance,
            ],
            'occupancy' => $this->occupancy,
            'threshold' => $this->room->capacity + $this->room->tolerance,
        ];
    }
}
