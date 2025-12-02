<template>
    <div class="alerts-panel">
        <h2 class="title">Alerts</h2>
        <div v-if="activeAlerts.length === 0" class="empty">
            No active alerts.
        </div>
        <ul v-else class="alert-list">
            <li v-for="alert in activeAlerts" :key="alert.id" class="alert-item">
                <div class="alert-item__header">
                    <span class="alert-item__room">{{ alert.room.name }}</span>
                    <span class="alert-item__level">{{ alert.level }}</span>
                </div>
                <div class="alert-item__message">
                    {{ alert.message }}
                </div>
                <div class="alert-item__time">
                    {{ formatTime(alert.triggered_at) }}
                </div>
            </li>
        </ul>
    </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useAlertStore } from '../stores/alertStore';

const alertStore = useAlertStore();
const activeAlerts = alertStore.activeAlerts;

function formatTime(iso: string | null): string {
    if (!iso) return '';
    const date = new Date(iso);

    return date.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
    });
}

onMounted(async () => {
    await alertStore.loadInitialAlerts();
    alertStore.initRealtime();
});
</script>

<style scoped>
.alerts-panel {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

.title {
    font-size: 1.25rem;
    font-weight: 600;
}

.empty {
    font-size: 0.9rem;
    color: #64748b;
}

.alert-list {
    list-style: none;
    padding: 0;
    margin: 0;
}

.alert-item {
    border-radius: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: #fef2f2;
    border: 1px solid #fecaca;
    margin-bottom: 0.5rem;
}

.alert-item__header {
    display: flex;
    justify-content: space-between;
    font-size: 0.9rem;
    margin-bottom: 0.25rem;
}

.alert-item__room {
    font-weight: 600;
}

.alert-item__level {
    text-transform: uppercase;
    font-size: 0.75rem;
}

.alert-item__message {
    font-size: 0.9rem;
    margin-bottom: 0.25rem;
}

.alert-item__time {
    font-size: 0.75rem;
    color: #64748b;
}
</style>
