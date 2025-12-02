<?php

use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('rooms', function () {
    // For now everything is public.
    return true;
});

Broadcast::channel('movements', function () {
    return true;
});

Broadcast::channel('alerts', function () {
    return true;
});

Broadcast::channel('devices', function () {
    return true;
});

// Later you can add private or presence channels with auth here.
