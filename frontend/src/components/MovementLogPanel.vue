<template>
    <div class="movement-log">
        <h2 class="title">Last Movements</h2>
        <ul class="movement-list">
            <li v-for="entry in entries" :key="entry.id" class="movement-item">
                <div class="movement-item__line">
                    <span class="movement-item__child">{{ entry.child_name }}</span>
                    <span class="movement-item__direction">
                        {{ entry.from_room_name ?? '–' }} → {{ entry.to_room_name ?? '–' }}
                    </span>
                </div>
                <div class="movement-item__meta">
                    <span>{{ formatTime(entry.occurred_at) }}</span>
                    <span class="movement-item__source">{{ entry.source }}</span>
                </div>
            </li>
        </ul>
    </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useMovementLogStore } from '../stores/movementLogStore';

const movementLogStore = useMovementLogStore();
const entries = movementLogStore.entries;

function formatTime(iso: string): string {
    const date = new Date(iso);

    return date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
    });
}

onMounted(async () => {
    await movementLogStore.loadInitialLog();
    movementLogStore.initRealtime();
});
</script>

<style scoped>
.movement-log {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

.title {
    font-size: 1.25rem;
    font-weight: 600;
}

.movement-list {
    list-style: none;
    padding: 0;
    margin: 0;
    max-height: 320px;
    overflow-y: auto;
}

.movement-item {
    padding: 0.5rem 0;
    border-bottom: 1px solid #e2e8f0;
}

.movement-item__line {
    display: flex;
    justify-content: space-between;
    font-size: 0.95rem;
}

.movement-item__child {
    font-weight: 600;
}

.movement-item__meta {
    display: flex;
    justify-content: space-between;
    font-size: 0.8rem;
    color: #64748b;
}

.movement-item__source {
    text-transform: uppercase;
}
</style>
