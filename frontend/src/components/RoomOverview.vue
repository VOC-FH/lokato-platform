<template>
    <div class="room-overview">
        <h2 class="title">Rooms</h2>
        <div class="room-grid">
            <div
                v-for="room in roomsWithOccupancy"
                :key="room.id"
                class="room-card"
                :class="{ 'room-card--alert': room.is_over_capacity }"
            >
                <div class="room-card__header">
                    <h3>{{ room.name }}</h3>
                    <span class="room-card__area">{{ room.area }}</span>
                </div>
                <div class="room-card__body">
                    <div class="room-card__occupancy">
                        <span class="room-card__value">
                            {{ room.occupancy }} / {{ room.capacity }} (+{{ room.tolerance }})
                        </span>
                    </div>
                    <div v-if="room.is_over_capacity" class="room-card__alert">
                        Over capacity!
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useRoomStore } from '../stores/roomStore';

const roomStore = useRoomStore();
const roomsWithOccupancy = roomStore.roomsWithOccupancy;

onMounted(async () => {
    await roomStore.loadInitialRooms();
    roomStore.initRealtime();
});
</script>

<style scoped>
.room-overview {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.title {
    font-size: 1.5rem;
    font-weight: 600;
}

.room-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 0.75rem;
}

.room-card {
    border-radius: 0.5rem;
    padding: 0.75rem;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
}

.room-card--alert {
    border-color: #f97373;
    background: #fef2f2;
}

.room-card__header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 0.5rem;
}

.room-card__area {
    font-size: 0.8rem;
    color: #64748b;
}

.room-card__value {
    font-weight: 600;
}

.room-card__alert {
    margin-top: 0.35rem;
    font-size: 0.85rem;
    color: #b91c1c;
    font-weight: 600;
}
</style>
