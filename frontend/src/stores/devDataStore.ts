import { defineStore } from "pinia";
import api from "../api/axios";

/*
|--------------------------------------------------------------------------
| DevDataStore
|--------------------------------------------------------------------------
| Dieser Store dient ausschließlich zu **Test- und Entwicklungszwecken**.
|
| Ziel:
|   - Alle Public-Endpunkte laden
|   - Alle Admin-Endpunkte laden
|   - Paginiertes Movement Log testen
|   - Beispiel-IDs abrufen (Child #1, Room #1, Device #1)
|
| NICHT für das Live-Dashboard gedacht – nur Dev-Werkzeug!
*/
export const useDevDataStore = defineStore("devDataStore", {
  state: () => ({

    /*
    |--------------------------------------------------------------------------
    | PUBLIC API (Lesend, ohne Admin)
    |--------------------------------------------------------------------------
    */
    public: {
      /*
       * /children – Liste aller öffentlichen Kinder
       */
      children: null as null | Array<{
        id: number;
        name: string;
        photo_url: string | null;
        tracker_uid: string | null;
        is_active: boolean;
        location: string | null;
      }>,

      /*
       * /children/{id} – Beispiel: Child #1
       */
      child: null as null | {
        id: number;
        name: string;
        photo_url: string | null;
        tracker_uid: string | null;
        is_active: boolean;
        location: string | null;
      },

      /*
       * /rooms – Liste aller Räume aus der öffentlichen API
       */
      rooms: null as null | Array<{
        id: number;
        name: string;
        area: string | null;
        capacity: number;
        tolerance: number;
        is_active: boolean;
        current_count: number;
        status: {
          over_capacity: boolean;
          within_tolerance: boolean;
        };
      }>,

      /*
       * /rooms/{id}/occupancy – Beispiel: Room #1
       * Belegt mit Kinderliste für diesen Raum.
       */
      roomOccupancy: null as null | {
        room: {
          id: number;
          name: string;
          area: string | null;
          capacity: number;
          tolerance: number;
        };
        current_count: number;
        children: Array<{
          id: number;
          name: string;
          photo_url: string | null;
          tracker_uid: string | null;
          is_active: boolean;
          location: string | null;
        }>;
      },
    },

    /*
    |--------------------------------------------------------------------------
    | MOVEMENT LOG (Öffentlich)
    |--------------------------------------------------------------------------
    | movement.all     = Vollständiges Movement Log (paginiert)
    | movement.byChild = Movement Log für Child #1
    */
    movement: {
      all: null as any,
      byChild: null as any,
    },

    /*
    |--------------------------------------------------------------------------
    | ADMIN API (privat) – Vollzugriff
    |--------------------------------------------------------------------------
    | Dient dem Backend & Frontend-Entwickler zum Testen, ob alle Admin-Routen
    | korrekt funktionieren.
    */
    admin: {
      children: null as null | any[],
      child: null as any,
      rooms: null as null | any[],
      room: null as any,
      devices: null as null | any[],
      device: null as any,
    },

    /*
    |--------------------------------------------------------------------------
    | LOAD STATE / ERROR
    |--------------------------------------------------------------------------
    */
    loading: false as boolean,
    error: null as string | null,
  }),

  actions: {
    /*
    |--------------------------------------------------------------------------
    | fetchAll()
    |--------------------------------------------------------------------------
    | Die wichtigste Funktion dieses Stores.
    |
    | Sie macht einen großen "Rundumschlag":
    |   - Lädt ALLE Public Daten
    |   - Lädt ALLE Admin Daten
    |   - Ruft Beispiel-Endpunkte für ID=1 ab:
    |       /children/1
    |       /rooms/1/occupancy
    |       /children/1/movement-log
    |       /admin/children/1
    |       /admin/rooms/1
    |       /admin/devices/1
    |
    | fetchAll() wird im DevView verwendet.
    */
    async fetchAll() {
      this.loading = true;
      this.error = null;

      try {
        /*
        |--------------------------------------------------------------------------
         | MASSEN REQUEST (parallel via Promise.all)
         |--------------------------------------------------------------------------
         | Vorteil:
         |   → Sehr schnell
         |   → Alle Daten werden synchronisiert geladen
         |
         | Nachteil:
         |   → Wenn EIN Request hart failt: alles Fehler
         |
         | Für Dev-Modus ist das OK.
         */
        const [
          // PUBLIC
          childrenRes,
          roomsRes,
          movementRes,

          // ADMIN – LISTS
          adminChildrenRes,
          adminRoomsRes,
          adminDevicesRes,

          // PUBLIC – DETAIL
          child1Res,
          room1OccRes,
          child1MovRes,

          // ADMIN – DETAIL
          adminChild1Res,
          adminRoom1Res,
          adminDevice1Res,
        ] = await Promise.all([

          /* Public API */
          api.get("/api/v1/children"),
          api.get("/api/v1/rooms"),
          api.get("/api/v1/movement-log"),

          /* Admin: Listen */
          api.get("/api/v1/admin/children"),
          api.get("/api/v1/admin/rooms"),
          api.get("/api/v1/admin/devices"),

          /* Public: Detail-API für Beispiel-ID=1 */
          api.get("/api/v1/children/1"),
          api.get("/api/v1/rooms/1/occupancy"),
          api.get("/api/v1/children/1/movement-log"),

          /* Admin: Detail-API Beispiel-ID=1 */
          api.get("/api/v1/admin/children/1"),
          api.get("/api/v1/admin/rooms/1"),
          api.get("/api/v1/admin/devices/1"),
        ]);

        /*
        |--------------------------------------------------------------------------
        | PUBLIC speichern
        |--------------------------------------------------------------------------
        */
        this.public.children = childrenRes.data;
        this.public.child = child1Res.data;
        this.public.rooms = roomsRes.data;
        this.public.roomOccupancy = room1OccRes.data;

        /*
        |--------------------------------------------------------------------------
        | MOVEMENT LOG speichern
        |--------------------------------------------------------------------------
        */
        this.movement.all = movementRes.data;
        this.movement.byChild = child1MovRes.data;

        /*
        |--------------------------------------------------------------------------
        | ADMIN speichern
        |--------------------------------------------------------------------------
        */
        this.admin.children = adminChildrenRes.data;
        this.admin.child = adminChild1Res.data;
        this.admin.rooms = adminRoomsRes.data;
        this.admin.room = adminRoom1Res.data;
        this.admin.devices = adminDevicesRes.data;
        this.admin.device = adminDevice1Res.data;

      } catch (err) {
        /*
         |----------------------------------------------------------------------
         | Fehlerbehandlung
         |----------------------------------------------------------------------
         */
        this.error =
          err instanceof Error ? err.message : "Unknown error during /dev fetch";
      } finally {
        this.loading = false;
      }
    },
  },
});
