import { defineStore } from "pinia";
import api from "../api/axios";

/*
|--------------------------------------------------------------------------
| Admin Data Store
|--------------------------------------------------------------------------
| Dieser Store verwaltet alle Admin-relevanten Daten:
| - Kinder
| - Räume
| - Geräte
| - Movement-Test-Events
|
| Besonderheiten:
| - Liefert globale Fehler- und Loading-States
| - Reloaded optional Dashboard/Dev-Store (lazy) um zyklische Importe zu vermeiden
| - Alle CRUD-Methoden machen automatische "Soft-Cleanup" bei Payloads
|
| Dieser Store wird vom gesamten Admin-Bereich verwendet.
*/
export const useAdminDataStore = defineStore("adminDataStore", {
  /* =====================================================================
     STATE
     ===================================================================== */
  state: () => ({
    // Tabellen aus dem Backend
    children: [] as any[],
    rooms: [] as any[],
    devices: [] as any[],

    //Möglichst wenig strict Types um Fehler bei backend änderungen zu vermeiden

    // Ergebnis des Movement-Simulators (/scan)
    lastScanResult: null as any,

    // Globale Flags
    loading: false,
    error: null as string | null,
  }),

  /* =====================================================================
     ACTIONS
     ===================================================================== */
  actions: {
    /* -------------------------------------------------------------------
       ERROR HANDLER
       -------------------------------------------------------------------
       Vereinheitlicht alle Fehlermeldungen für bessere Übersicht
    ------------------------------------------------------------------- */
    setError(msg: string, err?: any) {
      this.error = msg;
      console.error("[AdminStore ERROR]", msg, err ?? "");
    },

    /* =====================================================================
       LOADERS
       ===================================================================== */

    /* -------------------------
       Lade alle Kinder
    ------------------------- */
    async loadChildren() {
      try {
        const res = await api.get("/api/v1/admin/children");
        this.children = res.data;
      } catch (err) {
        this.setError("Fehler beim Laden der Admin-Kinder", err);
      }
    },

    //Alle Kinder werden über Admin API geladen

    /* -------------------------
       Lade alle Räume
    ------------------------- */
    async loadRooms() {
      try {
        const res = await api.get("/api/v1/admin/rooms");
        this.rooms = res.data;
      } catch (err) {
        this.setError("Fehler beim Laden der Admin-Räume", err);
      }
    },

    /* -------------------------
       Lade alle Geräte
    ------------------------- */
    async loadDevices() {
      try {
        const res = await api.get("/api/v1/admin/devices");
        this.devices = res.data;
      } catch (err) {
        this.setError("Fehler beim Laden der Admin-Geräte", err);
      }
    },

    /* =====================================================================
       CHILD CRUD
       =====================================================================
       Hinweis:
       - Alle CRUD-Methoden reloaden nach erfolgreicher Änderung
         1) den eigenen Admin-Store
         2) optional Dashboard + Dev (fauler Reload via dynamic import)
    ===================================================================== */

    /* -------------------------
       Neues Kind erstellen
    ------------------------- */
    async createChild(payload: {
      name: string;
      photo_url: string | null;
      tracker_uid: string | null;
      is_active: boolean;
    }) {
      try {
        // Backend verlangt NULL statt "" → sauberer Payload
        const clean = {
          name: payload.name,
          photo_url: payload.photo_url || null,
          tracker_uid: payload.tracker_uid || null,
          is_active: payload.is_active ?? true,
        };

        await api.post("/admin/children", clean);

        // Lokal aktualisieren
        await this.loadChildren();

        /* --------------------------------------------------------------
           Lazy reload Dashboard (optional)
           -------------------------------------------------------------- */
        try {
          const dashMod = await import("./dashboardDataStore");
          const dash = dashMod.useDashboardDataStore();
          if (dash?.fetchAllDashboardData) await dash.fetchAllDashboardData();
        } catch (e) {
          console.warn("[AdminStore] Dashboard Reload fehlgeschlagen", e);
        }

        /* --------------------------------------------------------------
           Lazy reload DevStore (optional)
           -------------------------------------------------------------- */
        try {
          const devMod = await import("./devDataStore");
          const dev = devMod.useDevDataStore();
          if (dev?.fetchAll) await dev.fetchAll();
        } catch (e) {
          console.warn("[AdminStore] Dev Reload fehlgeschlagen", e);
        }

      } catch (err) {
        this.setError("Fehler beim Erstellen eines Kindes", err);
      }
    },

    /* -------------------------
       Kind aktualisieren
       -------------------------
       Besonderheit:
       - Backend akzeptiert kein leeres "", daher werden nur Felder
         gesendet, die auch tatsächlich Werte enthalten.
    ------------------------- */
    async updateChild(id: number, payload: any) {
      try {
        const clean: any = {};

        /*
         * Nur Felder mitschicken, die NICHT leer sind.
         * Das verhindert 422 Errors bei optionalen Feldern.
         */
        if (payload.name && payload.name.trim() !== "") clean.name = payload.name;
        if (payload.photo_url && payload.photo_url.trim() !== "") clean.photo_url = payload.photo_url;
        if (payload.tracker_uid && payload.tracker_uid.trim() !== "") clean.tracker_uid = payload.tracker_uid;
        if (typeof payload.is_active === "boolean") clean.is_active = payload.is_active;

        // Sicherheitsmaßnahme: niemals ID ins Backend schicken
        delete clean.id;

        console.log("PATCH → clean payload:", clean);

        const res = await api.patch(`/admin/children/${id}`, clean);
        console.log("PATCH RESULT:", res.data);

        await this.loadChildren();
      } catch (err) {
        console.error("UPDATE CHILD ERROR:", err);
        this.setError("Fehler beim Aktualisieren eines Kindes", err);
      }
    },

    /* -------------------------
       Kind löschen
    ------------------------- */
    async deleteChild(id: number) {
      try {
        await api.delete(`/admin/children/${id}`);
        await this.loadChildren();

        // Dashboard reload (lazy)
        try {
          const dashMod = await import("./dashboardDataStore");
          const dash = dashMod.useDashboardDataStore();
          if (dash?.fetchAllDashboardData) await dash.fetchAllDashboardData();
        } catch (e) {
          console.warn("[AdminStore] dashboard reload failed", e);
        }

        // Dev reload (lazy)
        try {
          const devMod = await import("./devDataStore");
          const dev = devMod.useDevDataStore();
          if (dev?.fetchAll) await dev.fetchAll();
        } catch (e) {
          console.warn("[AdminStore] dev reload failed", e);
        }

      } catch (err) {
        this.setError("Fehler beim Löschen eines Kindes", err);
      }
    },

    /* =====================================================================
       ROOMS CRUD
       ===================================================================== */

    async createRoom(payload: any) {
      try {
        await api.post("/admin/rooms", payload);
        await this.loadRooms();

        // Dashboard reload (lazy)
        try {
          const dashMod = await import("./dashboardDataStore");
          const dash = dashMod.useDashboardDataStore();
          if (dash?.fetchAllDashboardData) await dash.fetchAllDashboardData();
        } catch (e) { console.warn("[AdminStore] reload dashboard failed", e); }

      } catch (err) {
        this.setError("Fehler beim Erstellen eines Raums", err);
      }
    },

    async updateRoom(id: number, payload: any) {
      try {
        await api.patch(`/admin/rooms/${id}`, payload);
        await this.loadRooms();

        try {
          const dashMod = await import("./dashboardDataStore");
          const dash = dashMod.useDashboardDataStore();
          if (dash?.fetchAllDashboardData) await dash.fetchAllDashboardData();
        } catch (e) { console.warn("[AdminStore] reload dashboard failed", e); }

      } catch (err) {
        this.setError("Fehler beim Aktualisieren eines Raums", err);
      }
    },

    async deleteRoom(id: number) {
      try {
        await api.delete(`/admin/rooms/${id}`);
        await this.loadRooms();

        try {
          const dashMod = await import("./dashboardDataStore");
          const dash = dashMod.useDashboardDataStore();
          if (dash?.fetchAllDashboardData) await dash.fetchAllDashboardData();
        } catch (e) { console.warn("[AdminStore] reload dashboard failed", e); }

      } catch (err) {
        this.setError("Fehler beim Löschen eines Raums", err);
      }
    },

    /* =====================================================================
       DEVICES CRUD
       ===================================================================== */

    async createDevice(payload: any) {
      try {
        await api.post("/admin/devices", payload);
        await this.loadDevices();

        try {
          const dashMod = await import("./dashboardDataStore");
          const dash = dashMod.useDashboardDataStore();
          if (dash?.fetchAllDashboardData) await dash.fetchAllDashboardData();
        } catch (e) { console.warn("[AdminStore] reload dashboard failed", e); }

      } catch (err) {
        this.setError("Fehler beim Erstellen eines Geräts", err);
      }
    },

    async updateDevice(id: number, payload: any) {
      try {
        await api.patch(`/admin/devices/${id}`, payload);
        await this.loadDevices();

        try {
          const dashMod = await import("./dashboardDataStore");
          const dash = dashMod.useDashboardDataStore();
          if (dash?.fetchAllDashboardData) await dash.fetchAllDashboardData();
        } catch (e) { console.warn("[AdminStore] reload dashboard failed", e); }

      } catch (err) {
        this.setError("Fehler beim Aktualisieren eines Geräts", err);
      }
    },

    async deleteDevice(id: number) {
      try {
        await api.delete(`/admin/devices/${id}`);
        await this.loadDevices();

        try {
          const dashMod = await import("./dashboardDataStore");
          const dash = dashMod.useDashboardDataStore();
          if (dash?.fetchAllDashboardData) await dash.fetchAllDashboardData();
        } catch (e) { console.warn("[AdminStore] reload dashboard failed", e); }

      } catch (err) {
        this.setError("Fehler beim Löschen eines Geräts", err);
      }
    },

    /* =====================================================================
       MOVEMENT SIMULATION (/scan)
       ===================================================================== */

    /*
     * Diese Funktion simuliert ein Movement via Device + Tracker.
     * Das wird im Dashboard als Bewegung angezeigt.
     */
    async sendScanEvent(payload: {
      device_key: string;
      tracker_uid: string;
      event_time?: string;
    }) {
      try {
        const res = await api.post("api/v1/scan", payload);
        this.lastScanResult = res.data;

        // Nach Movement: Dashboard refresh (falls Feature vorhanden)
        try {
          const dashMod = await import("./dashboardDataStore");
          const dash = dashMod.useDashboardDataStore();
          if (dash?.fetchLatestMovements) await dash.fetchLatestMovements(5);
        } catch (e) {
          console.warn("[AdminStore] Dashboard nach Scan nicht aktualisierbar", e);
        }

        // Dev reload
        try {
          const devMod = await import("./devDataStore");
          const dev = devMod.useDevDataStore();
          if (dev?.fetchAll) await dev.fetchAll();
        } catch (e) {
          console.warn("[AdminStore] Dev nach Scan nicht aktualisierbar", e);
        }

        return res.data;
      } catch (err) {
        this.setError("Fehler beim Simulieren eines Scan-Events", err);
        throw err;
      }
    },

    /* =====================================================================
       LOAD EVERYTHING (Admin Dashboard)
       ===================================================================== */
    async loadAllAdminData() {
      this.loading = true;
      this.error = null;

      try {
        await Promise.all([
          this.loadChildren(),
          this.loadRooms(),
          this.loadDevices(),
        ]);
      } catch (err) {
        this.setError("Fehler beim Laden der Admin-Daten", err);
      } finally {
        this.loading = false;
      }
    },
  },
});
