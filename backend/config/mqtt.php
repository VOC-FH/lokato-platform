<?php

return [
    'host' => env('MQTT_HOST', '127.0.0.1'),
    'port' => env('MQTT_PORT', 1883),
    'username' => env('MQTT_USERNAME', null),
    'password' => env('MQTT_PASSWORD', null),
    'client_id_prefix' => env('MQTT_CLIENT_ID_PREFIX', 'lokato_'),
    'use_tls' => env('MQTT_USE_TLS', false),
];
