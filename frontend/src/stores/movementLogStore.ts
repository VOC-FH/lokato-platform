import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { MovementLogEntry } from '../api/client';
import { fetchMovementLog } from '../api/client';
import { echo } from '../realtime/echo';

export const useMovementLogStore = defineStore('movementLog', () => {
    const entries = ref<MovementLogEntry[]>([]);
    const maxEntries = 50;

    async function loadInitialLog(): Promise<void> {
        const result = await fetchMovementLog({ limit: maxEntries });
        entries.value = result;
    }

    function initRealtime(): void {
        echo.channel('movements').listen('.ChildMoved', (event: any) => {
            const entry: MovementLogEntry = {
                id: event.id ?? Date.now(),
                child_id: event.child.id,
                child_name: event.child.name,
                from_room_id: event.from_room?.id ?? null,
                from_room_name: event.from_room?.name ?? null,
                to_room_id: event.to_room?.id ?? null,
                to_room_name: event.to_room?.name ?? null,
                occurred_at: event.occurred_at,
                source: 'mqtt',
            };

            entries.value.unshift(entry);

            if (entries.value.length > maxEntries) {
                entries.value = entries.value.slice(0, maxEntries);
            }
        });
    }

    return {
        entries,
        loadInitialLog,
        initRealtime,
    };
});
