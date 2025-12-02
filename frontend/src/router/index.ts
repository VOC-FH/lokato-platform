import { createRouter, createWebHistory } from "vue-router";

/*
|--------------------------------------------------------------------------
| Haupt-Views (Top-Level)
|--------------------------------------------------------------------------
| Diese Views sind die "großen" Seiten der App:
| - DashboardView  -> öffentliche Live-Ansicht (Benutzer-Frontend)
| - DevView        -> Entwicklertools / Rohdaten-Ansicht
| - AdminView      -> Übersichtsseite für den Adminbereich (Sub-Nav zeigt Unterseiten)
|
| Jede dieser Komponenten muss in src/views/ als .vue-Datei existieren.
*/
import DashboardView from "../views/DashboardView.vue";
import NEWDashboard from "../views/NEWDashboard.vue";
import DevView from "../views/DevView.vue";
import AdminView from "../views/AdminView.vue";

/*
|--------------------------------------------------------------------------
| Admin-Unterseiten
|--------------------------------------------------------------------------
| Diese Views sind einzelne Seiten unter dem Admin-Bereich.
| Der Benutzer (Admin) navigiert von AdminView in diese Unterseiten.
|
| Beispiele:
| - /admin/children  -> CRUD für Kinder
| - /admin/rooms     -> CRUD für Räume
| - /admin/devices   -> CRUD für Geräte
| - /admin/movements -> Movement-Test-Tool (Scan Simulator)
*/

//WICHTIG: Man muss sich die Vue Seite vorher anlegen und hier importieren bevor man eine Route erstellen kann

import ChildrenAdminView from "../views/admin/ChildrenAdminView.vue";
import RoomsAdminView from "../views/admin/RoomsAdminView.vue";
import DevicesAdminView from "../views/admin/DevicesAdminView.vue";
import MovementAdminView from "../views/admin/MovementAdminView.vue";
import AdminDashboardView from "@/views/admin/AdminDashboardView.vue";

/*
|--------------------------------------------------------------------------
| Test-Suite (optional)
|--------------------------------------------------------------------------
| Kleine UI zum Ausführen automatischer API-Tests oder manueller Checks.
| Wird z.B. verwendet, um alle Endpunkte automatisiert zu prüfen.
*/
import APITestView from "../views/APITestView.vue";

/*
|--------------------------------------------------------------------------
| ROUTE DEFINITION
|--------------------------------------------------------------------------
| Jede Route ist ein Objekt mit:
| - path: URL Pfad
| - name: optionaler Name (praktisch für programmatische Navigation)
| - component: component, das gerendert wird, wenn die Route aktiv ist
|
| Hinweis für die Frontend-HTML/CSS-Kollegin:
| - Die Komponenten sind eigenständige Seiten (.vue). Für konsistente UI
|   sollten wir im Layout (z. B. App.vue) Header / Footer / Sidebar
|   einheitlich implementieren. Die Router-View tauscht nur den Inhalt.
*/
const routes = [
  /* ------------------------------------------------------------------
     Root-Redirect
     - Wenn jemand '/' aufruft, schicken wir auf /dashboard.
     - Vorteil: klarer Einstiegspunkt in die App.
  ------------------------------------------------------------------ */
  { path: "/", redirect: "/dashboard" },

  /* ------------------------------------------------------------------
     PUBLIC DASHBOARD
     - Öffentliche Live-Ansicht.
     - Erwartet: Darstellung aller Räume, Kinder, letzte Bewegungen etc.
     - URL: /dashboard
  ------------------------------------------------------------------ */
  {
    path: "/dashboard",
    name: "Dashboard",
    component: DashboardView,
  },

  {
    path: "/newdashboard",
    name: "NEWDashboard",
    component: NEWDashboard,
  },

  /* ------------------------------------------------------------------
     ADMIN HAUPTSEITE
     - AdminView ist die Übersichts-/Landing-Page im Adminbereich.
     - Von hier aus navigiert man zu den spezifizierten Unterseiten.
     - URL: /admin
     - Hinweis: AdminView kann (und sollte) Links/Buttons zu /admin/children, /admin/rooms etc. enthalten.
  ------------------------------------------------------------------ */
  {
    path: "/admin/home",
    name: "AdminHome",
    component: AdminView,
  },

  /* ------------------------------------------------------------------
     ADMIN UNTERSEITEN (CRUD & TOOLS)
     - Jede Route ist eine separate Seite für Bearbeitung / Listen / Formulare.
     - Für das Styling: Tabellen, Formulare und modale Dialoge sind hier die wichtigsten UI-Elemente.
  ------------------------------------------------------------------ */

  // Kinder
  {
    path: "/admin/children",
    name: "AdminChildren",
    component: ChildrenAdminView,
  },

  // Räume
  {
    path: "/admin/rooms",
    name: "AdminRooms",
    component: RoomsAdminView,
  },

  // Geräte
  {
    path: "/admin/devices",
    name: "AdminDevices",
    component: DevicesAdminView,
  },

  // Movements (Scan Simulator)
  {
    path: "/admin/movements",
    name: "AdminMovements",
    component: MovementAdminView,
  },

  {
    path: "/admin/",
    name: "AdminDashboardView",
    component: AdminDashboardView,
  },


  /* ------------------------------------------------------------------
     DEV-ROHDATEN
     - Entwicklungstool für Raw API-Dumps / Debugging
     - URL: /dev
     - Hier werden alle Endpunkte angezeigt — ideal für Entwickler.
  ------------------------------------------------------------------ */
  {
    path: "/dev",
    name: "Dev",
    component: DevView,
  },

  /* ------------------------------------------------------------------
     API TEST SUITE
     - UI für Tests (manuelle oder automatisierte API-Tests)
     - URL: /tests
     - Optional: kann Logs / Test-Output anzeigen
  ------------------------------------------------------------------ */
  {
    path: "/tests",
    name: "APITests",
    component: APITestView,
  },

  /* ------------------------------------------------------------------
     FALLBACK (404-handling)
     - Alle nicht definierten Routen landen beim Dashboard.
     - Alternative wäre: eine eigene 404-View rendern.
  ------------------------------------------------------------------ */
  { path: "/:pathMatch(.*)*", redirect: "/dashboard" },
];

/*
|--------------------------------------------------------------------------
| Router-Instanz
|--------------------------------------------------------------------------
| - createWebHistory nutzt die HTML5 history API (saubere URLs ohne #)
| - import.meta.env.BASE_URL stellt sicher, dass der Router Basis-Pfad
|   korrekt gesetzt ist (z. B. wenn die App in einem Unterverzeichnis liegt).
|
| Hinweis an die Designerin:
| - Wenn ihr auf einer Seite Breadcrumbs, aktive Navigation oder
|   Hervorhebungen für die aktuelle Route braucht, nutzt:
|      $route.name  oder  $route.path
|   z.B. um das aktive Menü-Item zu markieren.
*/
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

export default router;
