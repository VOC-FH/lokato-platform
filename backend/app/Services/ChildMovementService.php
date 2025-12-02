<?php

namespace App\Services;

use App\Events\ChildMoved;
use App\Models\Child;
use App\Models\ChildLocation;
use App\Models\Device;
use App\Models\MovementLog;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use RuntimeException;

class ChildMovementService
{
    public function __construct(
        protected RoomOccupancyService $roomOccupancyService,
    ) {
    }

    /**
     * Handle a scan from a device (HTTP or MQTT).
     */
    public function handleScanFromDevice(
        string $deviceKey,
        string $trackerUid,
        ?string $eventTimeIsoString = null,
        string $source = 'mqtt'
    ): void {
        $device = Device::where('device_key', $deviceKey)->first();

        if (!$device) {
            Log::warning('Device not found for scan', ['device_key' => $deviceKey]);

            return;
        }

        $child = Child::where('tracker_uid', $trackerUid)->first();

        if (!$child) {
            Log::warning('Child not found for tracker', ['tracker_uid' => $trackerUid]);

            return;
        }

        $occurredAt = $eventTimeIsoString
            ? Carbon::parse($eventTimeIsoString)
            : now();

        DB::transaction(function () use ($device, $child, $occurredAt, $source) {
            /** @var ChildLocation|null $currentLocation */
            $currentLocation = ChildLocation::where('child_id', $child->id)->first();

            $fromRoom = $currentLocation?->room;
            $toRoom = $device->room;

            if (!$toRoom) {
                throw new RuntimeException('Device is not linked to a room.');
            }

            ChildLocation::updateOrCreate(
                ['child_id' => $child->id],
                [
                    'room_id' => $toRoom->id,
                    'updated_at' => $occurredAt,
                ]
            );

            MovementLog::create([
                'child_id' => $child->id,
                'from_room_id' => $fromRoom?->id,
                'to_room_id' => $toRoom->id,
                'device_id' => $device->id,
                'source' => $source,
                'occurred_at' => $occurredAt,
            ]);

            $device->forceFill([
                'last_seen' => $occurredAt,
            ])->save();

            event(new ChildMoved($child, $fromRoom, $toRoom, $occurredAt));

            $this->roomOccupancyService->refreshRooms($fromRoom, $toRoom);
        });
    }
}
