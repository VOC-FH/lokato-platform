<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class DeviceScanRequest extends FormRequest
{
    public function authorize(): bool
    {
        // optional: IP-Whitelist o.Ä.
        return true;
    }

    public function rules(): array
    {
        return [
            'device_key' => ['required', 'string', 'exists:devices,device_key'],
            'tracker_uid' => ['required', 'string', 'exists:children,tracker_uid'],
            'event_time' => ['nullable', 'date'],
        ];
    }
}
