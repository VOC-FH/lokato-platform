# Lokato SNode.C Backend

This directory contains the first SNode.C-based replacement for the previous Laravel backend.

The goal is to move the Lokato runtime to a native SNode.C application that provides:

- REST API compatible with the existing Vue frontend
- SSE/EventSource streams for live dashboard updates
- MQTT scan ingestion using SNode.C MQTT APIs
- MariaDB/MySQL access through SNode.C database APIs
- static serving of the built Vue frontend from `frontend/dist`

The Laravel backend is intentionally not used by this process.

## Current state

Implemented in `src/main.cpp`:

- `GET /api/health`
- `GET /api/v1/rooms`
- `GET /api/v1/rooms?include_children=true`
- `GET /api/v1/rooms/:room/occupancy`
- `POST /api/v1/scan`
- `GET /api/v1/movement-log`
- `GET /api/v1/admin/summary`
- `POST /api/v1/children/:child/checkout`
- `GET /api/stream/dashboard`
- `GET /api/stream/room/:room`
- catch-all static frontend serving
- MQTT client subscription to `/api/v1/scan`
- central C++ `ScanIngestService`
- central C++ `OccupancyService`
- simple in-process `SseHub`

The important domain behavior mirrors the Laravel `ScanIngestService`:

```text
device_key  -> devices.device_key -> devices.room_id
tracker_uid -> children.tracker_uid -> children.id
child_locations stores current state
movement_log stores history
```

## Build

SNode.C must be installed with at least these components available through `find_package(snodec ...)`:

- `core`
- `http-server-express`
- `net-in-stream-legacy`
- `db-mariadb`
- `mqtt-client`

Build:

```bash
cd snode-backend
cmake -S . -B build
cmake --build build -j
```

## Frontend build

The SNode.C application serves the built Vue frontend statically.

```bash
cd ../frontend
npm install
npm run build
```

Default frontend path used by the backend:

```text
../frontend/dist
```

Override with:

```bash
export LOKATO_FRONTEND_DIST=/absolute/path/to/frontend/dist
```

## Runtime configuration

Environment variables:

| Variable | Default | Meaning |
|---|---:|---|
| `LOKATO_HTTP_PORT` | `8001` | HTTP port for REST/SSE/static frontend |
| `LOKATO_FRONTEND_DIST` | `../frontend/dist` | built Vue frontend directory |
| `LOKATO_DB_HOST` | `127.0.0.1` | MariaDB/MySQL host |
| `LOKATO_DB_PORT` | `3306` | MariaDB/MySQL port |
| `LOKATO_DB_DATABASE` | `lokato_db` | database name |
| `LOKATO_DB_USER` | `admin` | database user |
| `LOKATO_DB_PASSWORD` | `admin` | database password |
| `LOKATO_DB_SOCKET` | empty | optional MariaDB socket path |
| `LOKATO_MQTT_CLIENT_ID` | `lokato-snode-subscriber` | MQTT client id |
| `LOKATO_MQTT_TOPIC_SCAN` | `/api/v1/scan` | scan topic |
| `LOKATO_MQTT_QOS` | `0` | scan topic QoS |

Run example:

```bash
cd snode-backend
LOKATO_FRONTEND_DIST=../frontend/dist ./build/lokato-snode
```

## Database

The first implementation expects the existing Lokato schema created by the previous Laravel migrations/seeds:

- `children`
- `rooms`
- `devices`
- `child_locations`
- `movement_log`
- optionally `alerts`

A later step should add SNode.C-owned schema initialization/migration logic so Laravel is no longer needed even for database preparation.

## MQTT

For the transition phase, an external broker may still run on port `1883`.

The intended final architecture is:

```text
Lokato SNode.C backend
  -> MQTT client/subscriber for scan events

MQTTSuite MQTTBroker
  -> replaces Mosquitto conceptually
```

The MQTT scan payload is compatible with the previous Laravel subscriber:

```json
{
  "device_key": "RaspberryChild02",
  "tracker_uid": "0X000017570D02640950B9462C",
  "event_time": "2026-01-26T12:00:00+00:00"
}
```

## Known gaps / next hardening steps

This is the first migration commit and still needs a compile/test pass against the local SNode.C installation.

Known incomplete areas:

- full admin CRUD endpoints for children, rooms and devices
- pickup/parent-specific REST endpoints
- proper authentication/authorization
- SNode.C-owned schema migrations/seeding
- robust transaction rollback on DB errors
- room-specific persistent SSE client registry; currently room SSE sends an initial snapshot, dashboard SSE receives live broadcasts
- MQTT remote host configurability needs verification against the exact installed SNode.C socket config API
- replacement of root scripts that still start Laravel/Vite preview
- deletion of the old Laravel backend after feature parity is verified

## Target runtime

```text
lokato-snode
  ├── static Vue frontend from frontend/dist
  ├── REST API under /api/v1
  ├── SSE under /api/stream
  ├── MQTT scan subscriber
  ├── MariaDB/MySQL access
  └── event-driven dashboard broadcasts
```

For parent/pickup devices, the planned frontend flow should stay REST-only and should not open long-lived SSE connections.
