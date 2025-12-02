<?php

namespace App\Services;

use App\Events\RoomCapacityAlerted;
use App\Events\RoomOccupancyUpdated;
use App\Models\Alert;
use App\Models\Room;
use Illuminate\Support\Facades\DB;

class RoomOccupancyService
{
    /**
     * Refresh occupancy and alerts for up to two rooms.
     */
    public function refreshRooms(?Room $fromRoom, ?Room $toRoom): void
    {
        $rooms = collect([$fromRoom, $toRoom])
            ->filter()
            ->unique(fn (Room $room) => $room->id);

        foreach ($rooms as $room) {
            $this->refreshRoom($room);
        }
    }

    /**
     * Refresh occupancy and update alerts for a single room.
     */
    public function refreshRoom(Room $room): void
    {
        $occupancy = $room->childLocations()->count();

        // Broadcast occupancy update.
        event(new RoomOccupancyUpdated($room, $occupancy));

        $this->handleCapacityAlert($room, $occupancy);
    }

    protected function handleCapacityAlert(Room $room, int $occupancy): void
    {
        $threshold = $room->capacity + $room->tolerance;
        $isExceeded = $occupancy > $threshold;

        /** @var Alert|null $activeAlert */
        $activeAlert = Alert::where('room_id', $room->id)
            ->where('type', 'room_capacity')
            ->where('is_active', true)
            ->first();

        if ($isExceeded && !$activeAlert) {
            // Create new alert.
            $alert = Alert::create([
                'room_id' => $room->id,
                'type' => 'room_capacity',
                'level' => 'warning',
                'code' => 'room_capacity_exceeded',
                'message' => sprintf(
                    'Room "%s" has %d children, capacity %d (+%d tolerance) exceeded.',
                    $room->name,
                    $occupancy,
                    $room->capacity,
                    $room->tolerance
                ),
                'is_active' => true,
                'payload' => [
                    'occupancy' => $occupancy,
                    'capacity' => $room->capacity,
                    'tolerance' => $room->tolerance,
                ],
                'triggered_at' => now(),
            ]);

            event(new RoomCapacityAlerted($alert));
        }

        if (!$isExceeded && $activeAlert) {
            // Resolve existing alert.
            DB::transaction(function () use ($activeAlert, $room, $occupancy) {
                $activeAlert->update([
                    'is_active' => false,
                    'resolved_at' => now(),
                    'payload' => array_merge($activeAlert->payload ?? [], [
                        'resolved_occupancy' => $occupancy,
                    ]),
                ]);

                event(new RoomCapacityAlerted($activeAlert));
            });
        }
    }
}
