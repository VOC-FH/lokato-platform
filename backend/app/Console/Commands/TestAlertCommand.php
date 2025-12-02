<?php

namespace App\Console\Commands;

use App\Events\RoomCapacityAlerted;
use App\Models\Alert;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

class TestAlertCommand extends Command
{
    /**
     * php artisan alerts:test-dummy
     */
    protected $signature = 'alerts:test-dummy';

    protected $description = 'Dispatcht ein RoomCapacityAlerted Event mit einem Dummy-Alert.';

    public function handle(): int
    {
        // Dummy Alert-Model (wird NICHT gespeichert)
        $alert = new Alert();

        // Falls dein Alert eine ID braucht (für Frontend-Logik), kannst du hier irgendwas setzen
        $alert->id = 999999;

        $alert->type = 'room_capacity';
        $alert->level = 'warning'; // z.B. info / warning / critical
        $alert->code = 'ROOM_CAPACITY_WARNING';
        $alert->message = 'Der Raum "Test-Raum" ist zu 85% ausgelastet.';
        $alert->is_active = true;
        $alert->payload = [
            'room_id'            => 1,
            'room_name'          => 'Test-Raum',
            'current_occupancy'  => 17,
            'max_capacity'       => 20,
            'percentage'         => 85,
        ];
        $alert->triggered_at = Carbon::now();
        $alert->resolved_at = null;

        // Dummy-Room-Relation setzen, damit $this->alert->room im Event funktioniert
        $room = new \stdClass();
        $room->id = 1;
        $room->name = 'Test-Raum';

        // Eloquent erlaubt beliebige Werte als Relation
        $alert->setRelation('room', $room);

        // Event dispatchen
        RoomCapacityAlerted::dispatch($alert);

        $this->info('Dummy RoomCapacityAlerted wurde dispatched.');

        return Command::SUCCESS;
    }
}
