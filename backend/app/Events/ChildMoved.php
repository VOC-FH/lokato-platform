<?php

namespace App\Events;

use App\Models\Child;
use App\Models\Room;
use Carbon\Carbon;
use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Queue\SerializesModels;
use Illuminate\Foundation\Events\Dispatchable;

class ChildMoved implements ShouldBroadcastNow
{
    use Dispatchable, SerializesModels;

    public function __construct(
        public Child $child,
        public ?Room $fromRoom,
        public ?Room $toRoom,
        public Carbon $occurredAt,
    ) {
    }

    public function broadcastOn(): array
    {
        return [new Channel('movements')];
    }

    public function broadcastAs(): string
    {
        return 'ChildMoved';
    }

    public function broadcastWith(): array
    {
        return [
            'child' => [
                'id' => $this->child->id,
                'name' => $this->child->name,
                'photo_url' => $this->child->photo_url,
            ],
            'from_room' => $this->fromRoom ? [
                'id' => $this->fromRoom->id,
                'name' => $this->fromRoom->name,
            ] : null,
            'to_room' => $this->toRoom ? [
                'id' => $this->toRoom->id,
                'name' => $this->toRoom->name,
            ] : null,
            'occurred_at' => $this->occurredAt->toIso8601String(),
        ];
    }
}
