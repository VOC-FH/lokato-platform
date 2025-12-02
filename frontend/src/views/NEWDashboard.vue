<template>
    <div class="dashboard">
        <section class="dashboard__left">
            <RoomOverview />
        </section>
        <section class="dashboard__right">
            <AlertsPanel />
            <MovementLogPanel />
        </section>
    </div>
</template>

<script setup lang="ts">
import RoomOverview from '../components/RoomOverview.vue';
import MovementLogPanel from '../components/MovementLogPanel.vue';
import AlertsPanel from '../components/AlertsPanel.vue';
</script>

<style scoped>
.dashboard {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 1.5rem;
    padding: 1rem;
    height: 100vh;
    box-sizing: border-box;
}

.dashboard__left,
.dashboard__right {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}
</style>
