<?php


namespace App\Services;

use App\Events\DeviceStatusUpdated;
use App\Models\Device;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;

class DeviceStatusService
{
    public function handleStatusUpdate(string $deviceKey, string $status, ?string $timestamp = null): void
    {
        $device = Device::where('device_key', $deviceKey)->first();

        if (!$device) {
            Log::warning('Device not found for status update', ['device_key' => $deviceKey]);

            return;
        }

        $seenAt = $timestamp ? Carbon::parse($timestamp) : now();

        $device->forceFill([
            'last_seen' => $seenAt,
        ])->save();

        event(new DeviceStatusUpdated($device, $status, $seenAt));
    }
}
