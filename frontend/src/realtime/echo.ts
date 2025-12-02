// src/realtime/echo.ts
import Echo from 'laravel-echo';
import { WaveConnector } from 'laravel-wave';

declare global {
    interface Window {
        Echo: Echo;
    }
}

export const echo = new Echo({
    broadcaster: WaveConnector,
    endpoint: '/wave',
    namespace: 'App\\Events',
    // Optional: add auth headers if you use authenticated channels
    // csrfToken: document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? undefined,
});

if (typeof window !== 'undefined') {
    window.Echo = echo;
}
