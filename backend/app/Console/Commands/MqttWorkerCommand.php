<?php

namespace App\Console\Commands;

use App\Services\ChildMovementService;
use App\Services\DeviceStatusService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use PhpMqtt\Client\ConnectionSettings;
use PhpMqtt\Client\Exceptions\ProtocolNotSupportedException;
use PhpMqtt\Client\MqttClient;
use Throwable;

class MqttWorkerCommand extends Command
{
    protected $signature = 'lokato:mqtt-worker';
    protected $description = 'Subscribe to MQTT topics and handle device scan events';

    public function handle(ChildMovementService $childMovementService): int
    {
        $host = config('mqtt.host');
        $port = config('mqtt.port');
        $clientId = config('mqtt.client_id_prefix') . uniqid();
        $username = config('mqtt.username');
        $password = config('mqtt.password');

        $connectionSettings = (new ConnectionSettings())
            ->setUsername($username)
            ->setPassword($password)
            ->setKeepAliveInterval(60);

        try {
            $client = new MqttClient($host, $port, $clientId);
        } catch (ProtocolNotSupportedException $e) {
            Log::error('Creating MQTT Client failed', ['exception' => $e]);

            return self::FAILURE;
        }

        $this->info("Connecting to MQTT broker at {$host}:{$port} ...");

        try {
            $client->connect($connectionSettings, true);
        } catch (Throwable $e) {
            $this->error('MQTT connection failed: ' . $e->getMessage());
            Log::error('MQTT connection failed', ['exception' => $e]);

            return self::FAILURE;
        }

        // Simple global topics
        $scanTopic = 'lokato/scan';
        $statusTopic = 'lokato/status';

        $this->info("Subscribing to {$scanTopic} and {$statusTopic}");

        $client->subscribe($scanTopic, function (string $topic, string $message) use ($childMovementService) {
            $this->handleScanMessage($topic, $message, $childMovementService);
        }, 0);

        $client->subscribe($statusTopic, function (string $topic, string $message) {
            $this->handleStatusMessage($topic, $message);
        }, 0);

        $this->info('MQTT worker is now listening for messages...');

        // This will run indefinitely until the process is stopped.
        $client->loop(true);

        return self::SUCCESS;
    }

    protected function handleScanMessage(string $topic, string $payload, ChildMovementService $childMovementService): void
    {
        // Expected topic: lokato/scan
        if ($topic !== 'lokato/scan') {
            Log::warning('MQTT scan topic did not match expected pattern', [
                'topic' => $topic,
            ]);

            return;
        }

        $data = json_decode($payload, true);

        if (!is_array($data)) {
            Log::warning('Invalid JSON payload received via MQTT (scan)', [
                'topic' => $topic,
                'payload' => $payload,
            ]);

            return;
        }

        if (empty($data['device_key']) || empty($data['tracker_uid'])) {
            Log::warning('Missing device_key or tracker_uid in scan payload', [
                'topic' => $topic,
                'payload' => $payload,
            ]);

            return;
        }

        $deviceKey = $data['device_key'];
        $trackerUid = $data['tracker_uid'];

        // prefer "event_time", optionally accept legacy "timestamp"
        $eventTime = $data['event_time'] ?? $data['timestamp'] ?? null;

        try {
            $childMovementService->handleScanFromDevice(
                deviceKey: $deviceKey,
                trackerUid: $trackerUid,
                eventTimeIsoString: $eventTime,
                source: 'mqtt'
            );
        } catch (Throwable $e) {
            Log::error('Failed to handle MQTT scan', [
                'topic' => $topic,
                'payload' => $payload,
                'exception' => $e,
            ]);
        }
    }

    protected function handleStatusMessage(string $topic, string $payload): void
    {
        // Expected topic: lokato/status
        if ($topic !== 'lokato/status') {
            Log::warning('MQTT status topic did not match expected pattern', [
                'topic' => $topic,
            ]);

            return;
        }

        $data = json_decode($payload, true);

        if (!is_array($data)) {
            Log::warning('Invalid JSON payload received via MQTT (status)', [
                'topic' => $topic,
                'payload' => $payload,
            ]);

            return;
        }

        if (empty($data['device_key']) || empty($data['status'])) {
            Log::warning('Missing device_key or status in status payload', [
                'topic' => $topic,
                'payload' => $payload,
            ]);

            return;
        }

        $deviceKey = $data['device_key'];
        $status = $data['status'];
        $timestamp = $data['event_time'] ?? $data['timestamp'] ?? null;

        app(DeviceStatusService::class)
            ->handleStatusUpdate($deviceKey, $status, $timestamp);
    }
}
