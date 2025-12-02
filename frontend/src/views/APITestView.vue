<template>
  <div class="test-view">

    <h1>API Test Suite</h1>
    <p class="subtitle">
      Diese Seite testet alle Admin / Public / Movement APIs – ohne Console.
    </p>

    <!-- BUTTONS -->
    <div class="btn-row">
      <button @click="runTest('children')">👶 Test Admin – Kinder</button>
      <button @click="runTest('rooms')">🏠 Test Admin – Räume</button>
      <button @click="runTest('devices')">📟 Test Admin – Geräte</button>
      <button @click="runTest('scan')">📡 Test Movement / Scan</button>
      <button @click="runTest('public')">🌍 Test Public API</button>
      <button class="danger" @click="runTest('all')">🔥 Test Alles</button>
    </div>

    <!-- OUTPUT LOG -->
    <div class="output-box">
      <h3>Test Output</h3>
      <pre>{{ format(logs) }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import api from "../api/axios";

const logs = ref<any[]>([]);

// Helper
function add(step: string, data: any, success = true) {
  logs.value.push({
    step,
    success,
    timestamp: new Date().toISOString(),
    ...data,
  });
}

function format(data: unknown) {
  return JSON.stringify(data, null, 2);
}

async function safe(step: string, fn: () => Promise<any>) {
  try {
    const res = await fn();
    add(step, { response: res.data }, true);
    return res.data;
  } catch (err: any) {
    add(step, {
      error: err.response?.data || err.message,
      status: err.response?.status,
    }, false);
    return null;
  }
}

async function runTest(type: string) {
  logs.value = []; // clear

  /* ---------------------------------------------------------
     ADMIN CHILDREN
  --------------------------------------------------------- */
  if (type === "children" || type === "all") {
    const created = await safe("Admin Child Create", () =>
      api.post("/admin/children", {
        name: "Test Kind UI",
        photo_url: null,
        tracker_uid: "UI-" + Math.floor(Math.random() * 9999),
        is_active: true,
      })
    );

    if (created?.id) {
      await safe("Admin Child Update", () =>
        api.patch(`/admin/children/${created.id}`, { name: "UI Updated" })
      );

      await safe("Admin Child Delete", () =>
        api.delete(`/admin/children/${created.id}`)
      );
    }
  }

  /* ---------------------------------------------------------
     ADMIN ROOMS
  --------------------------------------------------------- */
  if (type === "rooms" || type === "all") {
    const room = await safe("Admin Room Create", () =>
      api.post("/admin/rooms", {
        name: "UI Test Room",
        area: "EG",
        capacity: 10,
        tolerance: 2,
        is_active: true,
      })
    );

    if (room?.id) {
      await safe("Admin Room Update", () =>
        api.patch(`/admin/rooms/${room.id}`, { capacity: 20 })
      );

      await safe("Admin Room Delete", () =>
        api.delete(`/admin/rooms/${room.id}`)
      );
    }
  }

  /* ---------------------------------------------------------
     ADMIN DEVICES
  --------------------------------------------------------- */
  if (type === "devices" || type === "all") {
    // Need a room first
    const room = await safe("DeviceTest Room Create", () =>
      api.post("/admin/rooms", {
        name: "DeviceTest UI Room",
        area: "EG",
        capacity: 5,
        tolerance: 1,
        is_active: true,
      })
    );

    const device = await safe("Admin Device Create", () =>
      api.post("/admin/devices", {
        name: "UI Test Device",
        room_id: room?.id,
        device_key: "UI-DEVICE-" + Math.floor(Math.random() * 9999),
      })
    );

    if (device?.id) {
      await safe("Admin Device Update", () =>
        api.patch(`/admin/devices/${device.id}`, {
          name: "UI Updated Device",
        })
      );

      await safe("Admin Device Delete", () =>
        api.delete(`/admin/devices/${device.id}`)
      );
    }
  }

  /* ---------------------------------------------------------
     SCAN TEST
  --------------------------------------------------------- */
  if (type === "scan" || type === "all") {
    await safe("Scan Movement Event", () =>
      api.post("api/v1/scan", {
        device_key: "RaspberryChild01", // dies muss existieren!
        tracker_uid: "TAG-0001",
        event_time: new Date().toISOString(),
      })
    );
  }

  /* ---------------------------------------------------------
     PUBLIC API
  --------------------------------------------------------- */
  if (type === "public" || type === "all") {
    await safe("Public: Children", () => api.get("/api/v1/children"));
    await safe("Public: Rooms", () => api.get("/api/v1/rooms"));
    await safe("Public: Movement Log", () => api.get("/api/v1/movement-log"));
  }
}
</script>

<style scoped>
.test-view {
  padding: 20px;
  max-width: 900px;
  margin: auto;
}

.subtitle {
  color: #888;
  margin-bottom: 20px;
}

.btn-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

button {
  padding: 10px 16px;
  border: none;
  background: #3e7bfa;
  color: white;
  border-radius: 6px;
  cursor: pointer;
}

button:hover {
  background: #2f63d1;
}

button.danger {
  background: #cc3030;
}

.output-box {
  margin-top: 30px;
  background: #111;
  color: #0f0;
  padding: 20px;
  border-radius: 8px;
  max-height: 500px;
  overflow-y: auto;
}
</style>
