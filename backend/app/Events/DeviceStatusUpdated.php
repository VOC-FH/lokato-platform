<?php

namespace App\Events;

use App\Models\Device;
use Carbon\Carbon;
use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Queue\SerializesModels;
use Illuminate\Foundation\Events\Dispatchable;

class DeviceStatusUpdated implements ShouldBroadcastNow
{
    use Dispatchable, SerializesModels;

    public function __construct(
        public Device $device,
        public string $status,
        public Carbon $occurredAt,
    ) {
    }

    public function broadcastOn(): array
    {
        return [new Channel('devices')];
    }

    public function broadcastAs(): string
    {
        return 'DeviceStatusUpdated';
    }

    public function broadcastWith(): array
    {
        return [
            'device' => [
                'id' => $this->device->id,
                'name' => $this->device->name,
                'device_key' => $this->device->device_key,
                'room_id' => $this->device->room_id,
            ],
            'status' => $this->status,
            'occurred_at' => $this->occurredAt->toIso8601String(),
        ];
    }
}
