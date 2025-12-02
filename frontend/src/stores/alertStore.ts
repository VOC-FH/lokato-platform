import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { Alert } from '../api/client';
import { fetchActiveAlerts } from '../api/client';
import { echo } from '../realtime/echo';

export const useAlertStore = defineStore('alerts', () => {
    const alerts = ref<Alert[]>([]);

    const activeAlerts = computed(() => alerts.value.filter((a) => a.is_active));

    async function loadInitialAlerts(): Promise<void> {
        alerts.value = await fetchActiveAlerts();
    }

    function upsertAlert(incoming: Alert): void {
        const index = alerts.value.findIndex((a) => a.id === incoming.id);

        if (index >= 0) {
            alerts.value[index] = incoming;
        } else {
            alerts.value.push(incoming);
        }
    }

    function initRealtime(): void {
        echo.channel('alerts').listen('.RoomCapacityAlerted', (event: Alert) => {
            upsertAlert(event);
        });
    }

    return {
        alerts,
        activeAlerts,
        loadInitialAlerts,
        initRealtime,
    };
});
