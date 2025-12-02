import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Room } from '../api/client';
import { fetchRooms } from '../api/client';
import { echo } from '../realtime/echo';

export interface RoomOccupancy {
    roomId: number;
    occupancy: number;
    threshold: number;
}

export const useRoomStore = defineStore('rooms', () => {
    const rooms = ref<Room[]>([]);
    const occupancyByRoomId = ref<Record<number, RoomOccupancy>>({});

    const roomsWithOccupancy = computed(() => {
        return rooms.value.map((room) => {
            const occupancy = occupancyByRoomId.value[room.id]?.occupancy ?? room.current_occupancy ?? 0;
            const threshold = occupancyByRoomId.value[room.id]?.threshold ?? room.capacity + room.tolerance;

            return {
                ...room,
                occupancy,
                threshold,
                is_over_capacity: occupancy > threshold,
            };
        });
    });

    async function loadInitialRooms(): Promise<void> {
        const result = await fetchRooms();
        rooms.value = result;

        // Optional: pre-fill occupancy from API
        for (const room of result) {
            if (typeof room.current_occupancy === 'number') {
                occupancyByRoomId.value[room.id] = {
                    roomId: room.id,
                    occupancy: room.current_occupancy,
                    threshold: room.capacity + room.tolerance,
                };
            }
        }
    }

    function initRealtime(): void {
        echo.channel('rooms').listen('.RoomOccupancyUpdated', (event: any) => {
            const room = event.room;
            const occupancy = event.occupancy as number;
            const threshold = event.threshold as number;

            occupancyByRoomId.value[room.id] = {
                roomId: room.id,
                occupancy,
                threshold,
            };

            const existing = rooms.value.find((r) => r.id === room.id);
            if (existing) {
                Object.assign(existing, room);
            } else {
                rooms.value.push(room);
            }
        });
    }

    return {
        rooms,
        roomsWithOccupancy,
        loadInitialRooms,
        initRealtime,
    };
});
