import { defineStore } from "pinia";
import api from "../api/axios";

/*
|--------------------------------------------------------------------------
| DashboardDataStore
|--------------------------------------------------------------------------
| Dieser Store verwaltet alle Daten, die das öffentliche Dashboard benötigt:
|
|  - Liste aller Räume (GET /rooms)
|  - Aktuelle Belegung (Occupancy) je Raum (GET /rooms/{id}/occupancy)
|  - Die letzten Bewegungen (Movement Log – GET /movement-log)
|
| Der Store verwendet **nur Public API Endpoints**, keine Admin-Routen.
|
| Aufgerufen wird fetchAllDashboardData() z. B. in DashboardView.vue,
| normalerweise im onMounted().
*/
export const useDashboardDataStore = defineStore("dashboardDataStore", {
  state: () => ({
    /*
    |--------------------------------------------------------------------------
    | STATE
    |--------------------------------------------------------------------------
    */

    /*
     * rooms
     * Liste aller Räume aus GET /rooms
     * Beispiel einer Raumstruktur:
     * {
     *   id: 1,
     *   name: "Turnsaal",
     *   capacity: 30,
     *   tolerance: 5,
     *   status: { over_capacity: false, within_tolerance: true },
     *   current_count: 12
     * }
     */
    rooms: null as null | any[],

    /*
     * occupancy
     * Belegung aller Räume, gemapped nach Raum-ID:
     *
     * occupancy[raumId] = {
     *   room: {...},
     *   current_count: 3,
     *   children: [
     *     { id: 4, name: "Anna", tracker_uid: "...", ... }
     *   ]
     * }
     *
     * Warum Map? → schnell, direkt und unkompliziert im Template nutzbar
     */
    occupancy: {} as Record<number, any>,

    /*
     * latestMovements
     * Letzte 5 Bewegungen aus GET /movement-log
     * Die API ist paginiert und liefert:
     *
     * {
     *   current_page: 1,
     *   data: [ {...}, {...}, ... ],
     *   total: ...
     * }
     *
     * Wir extracten nur data.slice(0,5)
     */
    latestMovements: [] as any[],

    /*
     * loading
     * true → Dashboard lädt gerade Daten
     * false → Daten fertig geladen
     */
    loading: false as boolean,

    /*
     * error
     * Falls während des Fetchens etwas schiefgeht,
     * landet die Fehlermeldung hier.
     */
    error: null as string | null,
  }),

  actions: {
    /*
    |--------------------------------------------------------------------------
    | fetchAllDashboardData()
    |--------------------------------------------------------------------------
    | Lädt ALLE notwendigen Dashboarddaten in der richtigen Reihenfolge:
    |
    |   (1) Räume
    |   (2) Occupancy für jeden Raum
    |   (3) Movement Log (letzte 5 Einträge)
    |
    | Wird normalerweise bei Dashboard-Start ausgeführt.
    */
    async fetchAllDashboardData() {
      this.loading = true;
      this.error = null;

      try {
        /*
        ----------------------------------------------------------------------
        1) Räume laden
        GET /rooms
        ----------------------------------------------------------------------
        */
        const roomsRes = await api.get("/api/v1/rooms");
        this.rooms = roomsRes.data; // volle Liste der Räume

        /*
        ----------------------------------------------------------------------
        2) Occupancy für jeden Raum laden
        GET /rooms/{id}/occupancy
        Wir benutzen bewusst keine parallelen Promises,
        um Fehler je Raum einzeln abzufangen.
        ----------------------------------------------------------------------
        */
        const occMap: Record<number, any> = {};

        for (const room of roomsRes.data) {
          try {
            const occRes = await api.get(`/api/v1/rooms/${room.id}/occupancy`);

            // speichern der aktuellen Raumbelegung unter seiner ID
            occMap[room.id] = occRes.data;
          } catch (innerErr) {
            /*
             * Falls ein Raum keine Occupancy liefert
             * (z. B. Serverfehler, Raum inaktiv, etc.)
             * fällt nicht das gesamte Dashboard aus.
             */
            console.warn(
              `⚠ Fehler beim Laden der Occupancy für Raum ${room.id}`,
              innerErr
            );
          }
        }

        this.occupancy = occMap;

        /*
        ----------------------------------------------------------------------
        3) Movement Log (letzte 5)
        GET /movement-log
        Die API ist paginiert → wir nutzen nur data.slice(0,5)
        ----------------------------------------------------------------------
        */
        const movRes = await api.get("/api/v1/movement-log");

        /*
         * Hier extrahieren wir nur die Einträge (movRes.data.data).
         * Wenn die API leer ist → [].
         */
        this.latestMovements = movRes.data?.data?.slice(0, 5) || [];

      } catch (err) {
        /*
         * Falls ein Fehler in irgendeinem der API-Requests fliegt,
         * wird er hier gesammelt und im Dashboard angezeigt.
         */
        this.error =
          err instanceof Error
            ? err.message
            : "Unbekannter Fehler im Dashboard-Store";
      } finally {
        /*
         * Loading-Flag wieder zurücksetzen
         */
        this.loading = false;
      }
    },
  },
});
