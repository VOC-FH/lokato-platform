<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\DeviceScanRequest;
use App\Models\Child;
use App\Models\ChildLocation;
use App\Models\Device;
use App\Models\MovementLog;
use App\Services\ChildMovementService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class DeviceEventController extends Controller
{
    public function __construct(
        protected ChildMovementService $childMovementService
    ) {
    }

    public function scan(DeviceScanRequest $request): JsonResponse
    {
        $this->childMovementService->handleScanFromDevice(
            deviceKey: $request->get('device_key'),
            trackerUid: $request->get('tracker_uid'),
            eventTimeIsoString: $request->get('event_time'), // can be null
            source: 'scanner'
        );

        return response()->json([
            'status' => 'ok',
        ]);
    }

    public function store(DeviceScanRequest $request): JsonResponse
    {
        $validated = $request->validated();

        return DB::transaction(function () use ($validated) {

            // --- Gerät finden (per device_key) ---
            $device = Device::where('device_key', $validated['device_key'])->first();

            if (! $device) {
                // Logging: unbekanntes Gerät
                Log::channel('scan')->warning('Unknown device_key on scan', [
                    'device_key'  => $validated['device_key'],
                    'tracker_uid' => $validated['tracker_uid'] ?? null,
                    'ip'          => request()->ip(),
                    'time'        => now()->toIso8601String(),
                ]);

                return response()->json([
                    'error'   => 'device_not_found',
                    'message' => 'Das Gerät mit diesem device_key ist unbekannt.',
                ], 404);
            }

            // --- Kind via tracker_uid finden ---
            $child = Child::where('tracker_uid', $validated['tracker_uid'])->first();

            if (! $child) {
                // Logging: unbekanntes Kind / Tag
                Log::channel('scan')->warning('Unknown tracker_uid on scan', [
                    'device_key'  => $device->device_key,
                    'device_id'   => $device->id,
                    'tracker_uid' => $validated['tracker_uid'],
                    'ip'          => request()->ip(),
                    'time'        => now()->toIso8601String(),
                ]);

                return response()->json([
                    'error'   => 'child_not_found',
                    'message' => 'Kein Kind mit diesem Tracker gefunden.',
                ], 404);
            }

            // Zeitpunkt bestimmen
            $occurredAt = isset($validated['event_time'])
                ? Carbon::parse($validated['event_time'])
                : now();

            // aktuellen Standort sperren (Race-Conditions verhindern)
            $currentLocation = ChildLocation::where('child_id', $child->id)
                ->lockForUpdate()
                ->first();

            $fromRoomId = $currentLocation?->room_id;
            $toRoomId   = $device->room_id;

            // Bewegung loggen
            $movement = MovementLog::create([
                'child_id'     => $child->id,
                'from_room_id' => $fromRoomId,
                'to_room_id'   => $toRoomId,
                'device_id'    => $device->id,
                'source'       => 'device',
                'occurred_at'  => $occurredAt,
            ]);

            // aktuellen Standort nur aktualisieren, wenn Event nicht älter ist
            if ($currentLocation === null || $occurredAt->gte($currentLocation->updated_at)) {
                ChildLocation::updateOrCreate(
                    ['child_id' => $child->id],
                    [
                        'room_id'    => $toRoomId,
                        'updated_at' => $occurredAt,
                    ]
                );
            }

            // Gerät als "gesehen" markieren
            $device->last_seen = now();
            $device->save();

            // Logging: erfolgreicher Scan
            Log::channel('scan')->info('Scan processed', [
                'movement_id'  => $movement->id,
                'device_key'   => $device->device_key,
                'device_id'    => $device->id,
                'child_id'     => $child->id,
                'tracker_uid'  => $child->tracker_uid,
                'from_room_id' => $fromRoomId,
                'to_room_id'   => $toRoomId,
                'occurred_at'  => $occurredAt->toIso8601String(),
                'ip'           => request()->ip(),
            ]);

            return response()->json([
                'status'   => 'ok',
                'movement' => [
                    'id'           => $movement->id,
                    'child_id'     => $movement->child_id,
                    'from_room_id' => $movement->from_room_id,
                    'to_room_id'   => $movement->to_room_id,
                    'device_id'    => $movement->device_id,
                    'source'       => $movement->source,
                    'occurred_at'  => $movement->occurred_at->toIso8601String(),
                ],
            ]);
        });
    }
}
