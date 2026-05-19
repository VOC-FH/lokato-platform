#include "core/SNodeC.h"
#include "core/socket/State.h"
#include "core/socket/stream/SocketConnection.h"
#include "core/socket/stream/SocketContextFactory.h"
#include "core/timer/Timer.h"
#include "database/mariadb/MariaDBClient.h"
#include "express/legacy/in/WebApp.h"
#include "iot/mqtt/SocketContext.h"
#include "iot/mqtt/Topic.h"
#include "iot/mqtt/client/Mqtt.h"
#include "iot/mqtt/packets/Connack.h"
#include "iot/mqtt/packets/Publish.h"
#include "iot/mqtt/packets/Suback.h"
#include "log/Logger.h"
#include "net/in/stream/legacy/SocketClient.h"

#include <mysql.h>
#include <nlohmann/json.hpp>

#include <algorithm>
#include <chrono>
#include <cstdlib>
#include <ctime>
#include <filesystem>
#include <functional>
#include <iomanip>
#include <list>
#include <map>
#include <memory>
#include <sstream>
#include <string>
#include <utility>
#include <vector>

using json = nlohmann::json;
using WebApp = express::legacy::in::WebApp;

namespace {

std::string envOr(const char* key, const std::string& fallback) {
    const char* value = std::getenv(key);
    return value != nullptr && *value != '\0' ? std::string(value) : fallback;
}

uint16_t envU16(const char* key, uint16_t fallback) {
    const char* value = std::getenv(key);
    if (value == nullptr || *value == '\0') {
        return fallback;
    }
    return static_cast<uint16_t>(std::stoul(value));
}

std::string nowIso() {
    const auto now = std::chrono::system_clock::now();
    const std::time_t t = std::chrono::system_clock::to_time_t(now);
    std::tm tm{};
    gmtime_r(&t, &tm);
    std::ostringstream out;
    out << std::put_time(&tm, "%Y-%m-%dT%H:%M:%SZ");
    return out.str();
}

std::string sqlQuote(const std::string& value) {
    std::string escaped;
    escaped.reserve(value.size() + 2);
    escaped.push_back('\'');
    for (const char c : value) {
        if (c == '\'' || c == '\\') {
            escaped.push_back('\\');
        }
        escaped.push_back(c);
    }
    escaped.push_back('\'');
    return escaped;
}

std::string sqlNullableInt(int value) {
    return value > 0 ? std::to_string(value) : std::string("NULL");
}

int toInt(const char* value, int fallback = 0) {
    if (value == nullptr) {
        return fallback;
    }
    return std::stoi(value);
}

std::string toString(const char* value) {
    return value == nullptr ? std::string{} : std::string(value);
}

bool toBool(const char* value) {
    return value != nullptr && std::string(value) != "0";
}

json parseBody(const std::shared_ptr<express::Request>& req) {
    return json::parse(std::string(req->body.begin(), req->body.end()));
}

void jsonError(const std::shared_ptr<express::Response>& res, int status, const std::string& error, const std::string& message) {
    res->status(status).json({{"error", error}, {"message", message}});
}

struct AppConfig {
    uint16_t httpPort = envU16("LOKATO_HTTP_PORT", 8001);
    std::string frontendDist = envOr("LOKATO_FRONTEND_DIST", "../frontend/dist");
    std::string dbHost = envOr("LOKATO_DB_HOST", "127.0.0.1");
    std::string dbUser = envOr("LOKATO_DB_USER", "admin");
    std::string dbPassword = envOr("LOKATO_DB_PASSWORD", "admin");
    std::string dbName = envOr("LOKATO_DB_DATABASE", "lokato_db");
    uint16_t dbPort = envU16("LOKATO_DB_PORT", 3306);
    std::string dbSocket = envOr("LOKATO_DB_SOCKET", "");
    std::string mqttClientId = envOr("LOKATO_MQTT_CLIENT_ID", "lokato-snode-subscriber");
    std::string mqttTopic = envOr("LOKATO_MQTT_TOPIC_SCAN", "/api/v1/scan");
    uint8_t mqttQos = static_cast<uint8_t>(envU16("LOKATO_MQTT_QOS", 0));
};

class SseHub {
public:
    void add(const std::shared_ptr<express::Response>& res) {
        prune();
        clients.push_back(res);
        send(res, "stream.ready", {{"scope", "dashboard"}, {"connected_at", nowIso()}}, "movement:0;alert:0");
    }

    void broadcast(const std::string& event, const json& payload, const std::string& id = {}) {
        prune();
        for (const auto& weak : clients) {
            if (const auto res = weak.lock()) {
                send(res, event, payload, id);
            }
        }
    }

    void heartbeat() {
        prune();
        for (const auto& weak : clients) {
            if (const auto res = weak.lock(); res && res->isConnected()) {
                res->sendFragment(": heartbeat " + nowIso() + "\n\n");
            }
        }
    }

private:
    static void send(const std::shared_ptr<express::Response>& res, const std::string& event, const json& payload, const std::string& id) {
        std::ostringstream frame;
        if (!id.empty()) {
            frame << "id: " << id << "\n";
        }
        frame << "event: " << event << "\n";
        frame << "data: " << payload.dump() << "\n\n";
        res->sendFragment(frame.str());
    }

    void prune() {
        clients.erase(std::remove_if(clients.begin(), clients.end(), [](const std::weak_ptr<express::Response>& weak) {
                          const auto res = weak.lock();
                          return !res || !res->isConnected();
                      }),
                      clients.end());
    }

    std::vector<std::weak_ptr<express::Response>> clients;
};

class LokatoDatabase {
public:
    using Error = std::function<void(const std::string&, unsigned int)>;

    explicit LokatoDatabase(const AppConfig& config)
        : db(database::mariadb::MariaDBConnectionDetails{.connectionName = "lokato-db",
                                                         .hostname = config.dbHost,
                                                         .username = config.dbUser,
                                                         .password = config.dbPassword,
                                                         .database = config.dbName,
                                                         .port = config.dbPort,
                                                         .socket = config.dbSocket,
                                                         .flags = 0},
             [](const database::mariadb::MariaDBState& state) {
                 if (state.error != 0) {
                     LOG(ERROR) << "MariaDB: " << state.errorMessage << " [" << state.error << "]";
                 } else if (state.connected) {
                     VLOG(1) << "MariaDB connected";
                 } else {
                     VLOG(1) << "MariaDB disconnected";
                 }
             }) {
    }

    void exec(const std::string& sql, const std::function<void()>& ok, const Error& error) {
        db.exec(sql, ok, error);
    }

    void query(const std::string& sql, const std::function<void(MYSQL_ROW)>& row, const Error& error) {
        db.query(sql, row, error);
    }

    database::mariadb::MariaDBClient& raw() {
        return db;
    }

private:
    database::mariadb::MariaDBClient db;
};

class OccupancyService {
public:
    explicit OccupancyService(LokatoDatabase& database)
        : database(database) {
    }

    void rooms(bool includeChildren, const std::function<void(json)>& ok, const LokatoDatabase::Error& error) {
        auto result = std::make_shared<json>(json::array());
        const std::string sql =
            "SELECT r.id,r.name,r.area,r.capacity,r.tolerance,r.is_active,COUNT(cl.child_id) "
            "FROM rooms r LEFT JOIN child_locations cl ON cl.room_id=r.id "
            "GROUP BY r.id,r.name,r.area,r.capacity,r.tolerance,r.is_active ORDER BY r.name";
        database.query(sql, [this, includeChildren, result, ok, error](MYSQL_ROW row) {
            if (row != nullptr) {
                const int currentCount = toInt(row[6]);
                const int capacity = toInt(row[3]);
                const int tolerance = toInt(row[4]);
                json room = {{"id", toInt(row[0])},
                             {"name", toString(row[1])},
                             {"area", row[2] == nullptr ? json(nullptr) : json(toString(row[2]))},
                             {"capacity", capacity},
                             {"tolerance", tolerance},
                             {"is_active", toBool(row[5])},
                             {"current_count", currentCount},
                             {"status", {{"over_capacity", currentCount > capacity + tolerance},
                                          {"within_tolerance", currentCount > capacity && currentCount <= capacity + tolerance}}}};
                if (includeChildren) {
                    room["children"] = json::array();
                }
                result->push_back(room);
                return;
            }
            if (!includeChildren) {
                ok(*result);
                return;
            }
            attachChildren(*result, ok, error);
        }, error);
    }

    void roomOccupancy(int roomId, const std::function<void(json)>& ok, const LokatoDatabase::Error& error) {
        auto payload = std::make_shared<json>();
        database.query("SELECT id,name,area,capacity,tolerance FROM rooms WHERE id=" + std::to_string(roomId) + " LIMIT 1",
            [this, roomId, payload, ok, error](MYSQL_ROW row) {
                if (row != nullptr) {
                    (*payload)["room"] = {{"id", toInt(row[0])}, {"name", toString(row[1])}, {"area", row[2] == nullptr ? json(nullptr) : json(toString(row[2]))}, {"capacity", toInt(row[3])}, {"tolerance", toInt(row[4])}};
                    return;
                }
                if (!payload->contains("room")) {
                    ok({{"error", "room_not_found"}});
                    return;
                }
                (*payload)["children"] = json::array();
                database.query("SELECT c.id,c.name,c.photo_url,c.tracker_uid,c.is_active,cl.updated_at FROM child_locations cl JOIN children c ON c.id=cl.child_id WHERE cl.room_id=" + std::to_string(roomId) + " ORDER BY c.name",
                    [payload, ok](MYSQL_ROW childRow) {
                        if (childRow != nullptr) {
                            (*payload)["children"].push_back({{"child_id", toInt(childRow[0])}, {"id", toInt(childRow[0])}, {"name", toString(childRow[1])}, {"photo_url", childRow[2] == nullptr ? json(nullptr) : json(toString(childRow[2]))}, {"tracker_uid", childRow[3] == nullptr ? json(nullptr) : json(toString(childRow[3]))}, {"is_active", toBool(childRow[4])}, {"updated_at", childRow[5] == nullptr ? json(nullptr) : json(toString(childRow[5]))}});
                            return;
                        }
                        (*payload)["current_count"] = (*payload)["children"].size();
                        ok(*payload);
                    }, error);
            }, error);
    }

private:
    void attachChildren(json& rooms, const std::function<void(json)>& ok, const LokatoDatabase::Error& error) {
        auto roomsPtr = std::make_shared<json>(rooms);
        database.query("SELECT cl.room_id,c.id,c.name,c.photo_url,c.tracker_uid,c.is_active,cl.updated_at FROM child_locations cl JOIN children c ON c.id=cl.child_id ORDER BY c.name",
            [roomsPtr, ok](MYSQL_ROW row) {
                if (row != nullptr) {
                    const int roomId = toInt(row[0]);
                    for (auto& room : *roomsPtr) {
                        if (room["id"].get<int>() == roomId) {
                            room["children"].push_back({{"child_id", toInt(row[1])}, {"id", toInt(row[1])}, {"name", toString(row[2])}, {"photo_url", row[3] == nullptr ? json(nullptr) : json(toString(row[3]))}, {"tracker_uid", row[4] == nullptr ? json(nullptr) : json(toString(row[4]))}, {"is_active", toBool(row[5])}, {"updated_at", row[6] == nullptr ? json(nullptr) : json(toString(row[6]))}});
                            break;
                        }
                    }
                    return;
                }
                ok(*roomsPtr);
            }, error);
    }

    LokatoDatabase& database;
};

class ScanIngestService {
public:
    ScanIngestService(LokatoDatabase& database, OccupancyService& occupancy, SseHub& sse)
        : database(database), occupancy(occupancy), sse(sse) {}

    void ingest(const std::string& deviceKey, const std::string& trackerUid, const std::string& eventTimeIso, const std::string& source,
                const std::function<void(json)>& ok, const std::function<void(int, json)>& fail) {
        auto ctx = std::make_shared<Context>();
        ctx->deviceKey = deviceKey;
        ctx->trackerUid = trackerUid;
        ctx->eventTime = eventTimeIso.empty() ? nowIso() : eventTimeIso;
        ctx->source = source;
        database.query("SELECT id,room_id FROM devices WHERE device_key=" + sqlQuote(deviceKey) + " LIMIT 1", [this, ctx, ok, fail](MYSQL_ROW row) {
            if (row != nullptr) {
                ctx->deviceId = toInt(row[0]);
                ctx->toRoomId = toInt(row[1]);
                return;
            }
            if (ctx->deviceId == 0) {
                fail(404, {{"error", "scan_target_not_found"}, {"message", "Gerät konnte nicht gefunden werden."}});
                return;
            }
            lookupChild(ctx, ok, fail);
        }, [fail](const std::string& msg, unsigned int no) { fail(500, {{"error", "db_error"}, {"message", msg}, {"code", no}}); });
    }

private:
    struct Context {
        std::string deviceKey;
        std::string trackerUid;
        std::string eventTime;
        std::string source;
        int deviceId = 0;
        int childId = 0;
        int fromRoomId = 0;
        int toRoomId = 0;
        int movementId = 0;
    };

    void lookupChild(const std::shared_ptr<Context>& ctx, const std::function<void(json)>& ok, const std::function<void(int, json)>& fail) {
        database.query("SELECT id FROM children WHERE tracker_uid=" + sqlQuote(ctx->trackerUid) + " LIMIT 1", [this, ctx, ok, fail](MYSQL_ROW row) {
            if (row != nullptr) {
                ctx->childId = toInt(row[0]);
                return;
            }
            if (ctx->childId == 0) {
                fail(404, {{"error", "scan_target_not_found"}, {"message", "Kind konnte nicht gefunden werden."}});
                return;
            }
            lookupCurrentLocation(ctx, ok, fail);
        }, [fail](const std::string& msg, unsigned int no) { fail(500, {{"error", "db_error"}, {"message", msg}, {"code", no}}); });
    }

    void lookupCurrentLocation(const std::shared_ptr<Context>& ctx, const std::function<void(json)>& ok, const std::function<void(int, json)>& fail) {
        database.query("SELECT room_id FROM child_locations WHERE child_id=" + std::to_string(ctx->childId) + " LIMIT 1", [this, ctx, ok, fail](MYSQL_ROW row) {
            if (row != nullptr) {
                ctx->fromRoomId = toInt(row[0]);
                return;
            }
            persist(ctx, ok, fail);
        }, [fail](const std::string& msg, unsigned int no) { fail(500, {{"error", "db_error"}, {"message", msg}, {"code", no}}); });
    }

    void persist(const std::shared_ptr<Context>& ctx, const std::function<void(json)>& ok, const std::function<void(int, json)>& fail) {
        const std::string insertMovement = "INSERT INTO movement_log(child_id,from_room_id,to_room_id,device_id,source,occurred_at) VALUES (" +
            std::to_string(ctx->childId) + "," + sqlNullableInt(ctx->fromRoomId) + "," + std::to_string(ctx->toRoomId) + "," + std::to_string(ctx->deviceId) + "," + sqlQuote(ctx->source) + "," + sqlQuote(ctx->eventTime) + ")";
        database.raw()
            .exec("START TRANSACTION", [] {}, [fail](const std::string& msg, unsigned int no) { fail(500, {{"error", "db_error"}, {"message", msg}, {"code", no}}); })
            .exec(insertMovement, [] {}, [fail](const std::string& msg, unsigned int no) { fail(500, {{"error", "db_error"}, {"message", msg}, {"code", no}}); })
            .query("SELECT LAST_INSERT_ID()", [this, ctx, ok, fail](MYSQL_ROW row) {
                if (row != nullptr) {
                    ctx->movementId = toInt(row[0]);
                } else {
                    updateState(ctx, ok, fail);
                }
            }, [fail](const std::string& msg, unsigned int no) { fail(500, {{"error", "db_error"}, {"message", msg}, {"code", no}}); });
    }

    void updateState(const std::shared_ptr<Context>& ctx, const std::function<void(json)>& ok, const std::function<void(int, json)>& fail) {
        const std::string upsertLocation = "INSERT INTO child_locations(child_id,room_id,updated_at) VALUES (" + std::to_string(ctx->childId) + "," + std::to_string(ctx->toRoomId) + "," + sqlQuote(ctx->eventTime) + ") ON DUPLICATE KEY UPDATE room_id=IF(VALUES(updated_at) >= updated_at, VALUES(room_id), room_id), updated_at=GREATEST(updated_at, VALUES(updated_at))";
        database.raw()
            .exec(upsertLocation, [] {}, [fail](const std::string& msg, unsigned int no) { fail(500, {{"error", "db_error"}, {"message", msg}, {"code", no}}); })
            .exec("UPDATE children SET is_active=1 WHERE id=" + std::to_string(ctx->childId), [] {}, [fail](const std::string& msg, unsigned int no) { fail(500, {{"error", "db_error"}, {"message", msg}, {"code", no}}); })
            .exec("UPDATE devices SET last_seen=NOW() WHERE id=" + std::to_string(ctx->deviceId), [] {}, [fail](const std::string& msg, unsigned int no) { fail(500, {{"error", "db_error"}, {"message", msg}, {"code", no}}); })
            .exec("COMMIT", [this, ctx, ok]() {
                const json movement = {{"id", ctx->movementId}, {"child_id", ctx->childId}, {"from_room_id", ctx->fromRoomId == 0 ? json(nullptr) : json(ctx->fromRoomId)}, {"to_room_id", ctx->toRoomId}, {"device_id", ctx->deviceId}, {"source", ctx->source}, {"occurred_at", ctx->eventTime}};
                sse.broadcast("child.moved", movement, "movement:" + std::to_string(ctx->movementId) + ";alert:0");
                occupancy.roomOccupancy(ctx->toRoomId, [this, ctx](json payload) {
                    payload["room_id"] = ctx->toRoomId;
                    if (payload.contains("room") && payload["room"].contains("name")) payload["room_name"] = payload["room"]["name"];
                    sse.broadcast("room.occupancy.updated", payload, "movement:" + std::to_string(ctx->movementId) + ";alert:0");
                }, [](const std::string&, unsigned int) {});
                ok({{"status", "ok"}, {"movement", movement}});
            }, [fail](const std::string& msg, unsigned int no) { fail(500, {{"error", "db_error"}, {"message", msg}, {"code", no}}); });
    }

    LokatoDatabase& database;
    OccupancyService& occupancy;
    SseHub& sse;
};

ScanIngestService* globalScanIngestService = nullptr;
AppConfig* globalConfig = nullptr;

class LokatoMqtt final : public iot::mqtt::client::Mqtt {
public:
    explicit LokatoMqtt(const std::string& connectionName)
        : iot::mqtt::client::Mqtt(connectionName, globalConfig != nullptr ? globalConfig->mqttClientId : "lokato-snode-subscriber", 30, "") {}

private:
    void onConnected() override {
        sendConnect(true, "", "", 0, false, "", "");
    }

    void onConnack(const iot::mqtt::packets::Connack& connack) override {
        if (connack.getReturnCode() == 0 && globalConfig != nullptr) {
            sendSubscribe(std::list<iot::mqtt::Topic>{iot::mqtt::Topic(globalConfig->mqttTopic, globalConfig->mqttQos)});
            VLOG(1) << "Lokato MQTT subscribed to " << globalConfig->mqttTopic;
        }
    }

    void onSuback(const iot::mqtt::packets::Suback&) override {
        VLOG(1) << "Lokato MQTT subscription acknowledged";
    }

    void onPublish(const iot::mqtt::packets::Publish& publish) override {
        if (globalScanIngestService == nullptr) {
            LOG(ERROR) << "MQTT scan ignored: ScanIngestService not initialized";
            return;
        }
        try {
            const json payload = json::parse(publish.getMessage());
            globalScanIngestService->ingest(payload.value("device_key", ""), payload.value("tracker_uid", ""), payload.value("event_time", ""), "mqtt_scanner",
                                            [](json result) { VLOG(1) << "MQTT scan ingested: " << result.dump(); },
                                            [](int status, json error) { LOG(ERROR) << "MQTT scan failed " << status << ": " << error.dump(); });
        } catch (const std::exception& e) {
            LOG(ERROR) << "Invalid MQTT JSON payload: " << e.what();
        }
    }
};

class LokatoMqttSocketContextFactory final : public core::socket::stream::SocketContextFactory {
private:
    core::socket::stream::SocketContext* create(core::socket::stream::SocketConnection* socketConnection) final {
        return new iot::mqtt::SocketContext(socketConnection, new LokatoMqtt(socketConnection->getConnectionName()));
    }
};

void registerRoutes(const WebApp& app, const AppConfig& config, OccupancyService& occupancy, ScanIngestService& scans, LokatoDatabase& database, SseHub& sse) {
    app.get("/api/health", [] APPLICATION(req, res) {
        res->json({{"status", "ok"}, {"server", "lokato-snode"}, {"now", nowIso()}});
    });

    app.get("/api/v1/rooms", [&occupancy] APPLICATION(req, res) {
        occupancy.rooms(req->queries["include_children"] == "true" || req->queries["include_children"] == "1", [res](json payload) { res->json(payload); }, [res](const std::string& msg, unsigned int no) { jsonError(res, 500, "db_error", msg + " [" + std::to_string(no) + "]"); });
    });

    app.get("/api/v1/rooms/:room/occupancy", [&occupancy] APPLICATION(req, res) {
        occupancy.roomOccupancy(std::stoi(req->params["room"]), [res](json payload) { payload.contains("error") ? res->status(404).json(payload) : res->json(payload); }, [res](const std::string& msg, unsigned int no) { jsonError(res, 500, "db_error", msg + " [" + std::to_string(no) + "]"); });
    });

    app.post("/api/v1/scan", [&scans] APPLICATION(req, res) {
        try {
            const json payload = parseBody(req);
            scans.ingest(payload.value("device_key", ""), payload.value("tracker_uid", ""), payload.value("event_time", ""), "device", [res](json result) { res->json(result); }, [res](int status, json error) { res->status(status).json(error); });
        } catch (const std::exception& e) {
            jsonError(res, 422, "invalid_json", e.what());
        }
    });

    app.get("/api/v1/movement-log", [&database] APPLICATION(req, res) {
        const int perPage = req->queries.contains("per_page") ? std::min(200, std::max(1, std::stoi(req->queries["per_page"]))) : 50;
        auto data = std::make_shared<json>(json::array());
        database.query("SELECT ml.id,ml.child_id,c.name,fr.id,fr.name,tr.id,tr.name,d.id,d.name,ml.source,ml.occurred_at FROM movement_log ml JOIN children c ON c.id=ml.child_id LEFT JOIN rooms fr ON fr.id=ml.from_room_id LEFT JOIN rooms tr ON tr.id=ml.to_room_id LEFT JOIN devices d ON d.id=ml.device_id ORDER BY ml.occurred_at DESC, ml.id DESC LIMIT " + std::to_string(perPage),
            [data, res](MYSQL_ROW row) {
                if (row != nullptr) {
                    data->push_back({{"id", toInt(row[0])}, {"child", {{"id", toInt(row[1])}, {"name", toString(row[2])}}}, {"from_room", row[3] == nullptr ? json(nullptr) : json({{"id", toInt(row[3])}, {"name", toString(row[4])}})}, {"to_room", row[5] == nullptr ? json(nullptr) : json({{"id", toInt(row[5])}, {"name", toString(row[6])}})}, {"device", row[7] == nullptr ? json(nullptr) : json({{"id", toInt(row[7])}, {"name", toString(row[8])}})}, {"source", toString(row[9])}, {"occurred_at", toString(row[10])}});
                    return;
                }
                res->json({{"data", *data}, {"per_page", data->size()}});
            }, [res](const std::string& msg, unsigned int no) { jsonError(res, 500, "db_error", msg + " [" + std::to_string(no) + "]"); });
    });

    app.get("/api/v1/admin/summary", [&database] APPLICATION(req, res) {
        auto result = std::make_shared<json>(json::object());
        database.raw()
            .query("SELECT COUNT(*) FROM children", [result](MYSQL_ROW row) { if (row != nullptr) (*result)["children_count"] = toInt(row[0]); }, [](const std::string&, unsigned int) {})
            .query("SELECT COUNT(*) FROM rooms", [result](MYSQL_ROW row) { if (row != nullptr) (*result)["rooms_count"] = toInt(row[0]); }, [](const std::string&, unsigned int) {})
            .query("SELECT COUNT(*) FROM devices", [result, res](MYSQL_ROW row) { if (row != nullptr) (*result)["devices_count"] = toInt(row[0]); if (row == nullptr) res->json(*result); }, [res](const std::string& msg, unsigned int no) { jsonError(res, 500, "db_error", msg + " [" + std::to_string(no) + "]"); });
    });

    app.post("/api/v1/children/:child/checkout", [&database, &sse, &occupancy] APPLICATION(req, res) {
        const int childId = std::stoi(req->params["child"]);
        auto fromRoom = std::make_shared<int>(0);
        database.raw()
            .query("SELECT room_id FROM child_locations WHERE child_id=" + std::to_string(childId) + " LIMIT 1", [fromRoom](MYSQL_ROW row) { if (row != nullptr) *fromRoom = toInt(row[0]); }, [](const std::string&, unsigned int) {})
            .exec("DELETE FROM child_locations WHERE child_id=" + std::to_string(childId), [] {}, [](const std::string&, unsigned int) {})
            .exec("UPDATE children SET is_active=0 WHERE id=" + std::to_string(childId), [] {}, [](const std::string&, unsigned int) {})
            .exec("INSERT INTO movement_log(child_id,from_room_id,to_room_id,device_id,source,occurred_at) VALUES (" + std::to_string(childId) + "," + sqlNullableInt(*fromRoom) + ",NULL,NULL,'manual',NOW())", [] {}, [](const std::string&, unsigned int) {})
            .query("SELECT LAST_INSERT_ID()", [fromRoom, childId, res, &sse, &occupancy](MYSQL_ROW row) {
                if (row != nullptr) {
                    const int movementId = toInt(row[0]);
                    json movement = {{"id", movementId}, {"child_id", childId}, {"from_room_id", *fromRoom}, {"to_room_id", nullptr}, {"source", "manual"}, {"occurred_at", nowIso()}};
                    sse.broadcast("child.moved", movement, "movement:" + std::to_string(movementId) + ";alert:0");
                    if (*fromRoom > 0) {
                        occupancy.roomOccupancy(*fromRoom, [&sse, movementId, fromRoom](json payload) { payload["room_id"] = *fromRoom; sse.broadcast("room.occupancy.updated", payload, "movement:" + std::to_string(movementId) + ";alert:0"); }, [](const std::string&, unsigned int) {});
                    }
                    res->json({{"child_id", childId}, {"from_room_id", *fromRoom}, {"to_room_id", nullptr}, {"occurred_at", nowIso()}});
                }
            }, [res](const std::string& msg, unsigned int no) { jsonError(res, 500, "db_error", msg + " [" + std::to_string(no) + "]"); });
    });

    app.get("/api/stream/dashboard", [&sse] APPLICATION(req, res) {
        res->set("Content-Type", "text/event-stream");
        res->set("Cache-Control", "no-cache, no-transform");
        res->set("Connection", "keep-alive");
        res->set("X-Accel-Buffering", "no");
        res->set("Transfer-Encoding", "chunked");
        res->sendHeader();
        sse.add(res);
    });

    app.get("/api/stream/room/:room", [&occupancy] APPLICATION(req, res) {
        const int roomId = std::stoi(req->params["room"]);
        res->set("Content-Type", "text/event-stream");
        res->set("Cache-Control", "no-cache, no-transform");
        res->set("Connection", "keep-alive");
        res->set("X-Accel-Buffering", "no");
        res->set("Transfer-Encoding", "chunked");
        res->sendHeader();
        occupancy.roomOccupancy(roomId, [res, roomId](json payload) {
            payload["room_id"] = roomId;
            if (payload.contains("room") && payload["room"].contains("name")) payload["room_name"] = payload["room"]["name"];
            std::ostringstream frame;
            frame << "event: room.occupancy.updated\n" << "data: " << payload.dump() << "\n\n";
            res->sendFragment(frame.str());
        }, [res](const std::string& msg, unsigned int no) {
            std::ostringstream frame;
            frame << "event: stream.error\n" << "data: " << json({{"error", msg}, {"code", no}}).dump() << "\n\n";
            res->sendFragment(frame.str());
        });
    });

    app.get("/:rest(.*)", [&config] APPLICATION(req, res) {
        std::string rel = req->path == "/" ? "/index.html" : req->path;
        if (rel.find("..") != std::string::npos) {
            rel = "/index.html";
        }
        std::filesystem::path file = std::filesystem::path(config.frontendDist) / rel.substr(1);
        if (!std::filesystem::exists(file) || std::filesystem::is_directory(file)) {
            file = std::filesystem::path(config.frontendDist) / "index.html";
        }
        res->sendFile(file.string(), [res](int err) {
            if (err != 0) {
                res->status(404).send("Lokato frontend not built. Run npm run build in frontend/.");
            }
        });
    });
}

} // namespace

int main(int argc, char* argv[]) {
    core::SNodeC::init(argc, argv);

    AppConfig config;
    globalConfig = &config;

    LokatoDatabase database(config);
    SseHub sse;
    OccupancyService occupancy(database);
    ScanIngestService scans(database, occupancy, sse);
    globalScanIngestService = &scans;

    const WebApp app("lokato-snode");
    app.getConfig()->setReuseAddress();
    registerRoutes(app, config, occupancy, scans, database, sse);

    app.listen(config.httpPort, [](const WebApp::SocketAddress& socketAddress, const core::socket::State& state) {
        switch (state) {
            case core::socket::State::OK: VLOG(1) << "lokato-snode HTTP listening on " << socketAddress.toString(); break;
            case core::socket::State::DISABLED: VLOG(1) << "lokato-snode HTTP disabled"; break;
            case core::socket::State::ERROR: LOG(ERROR) << "lokato-snode HTTP " << socketAddress.toString() << ": " << state.what(); break;
            case core::socket::State::FATAL: LOG(FATAL) << "lokato-snode HTTP " << socketAddress.toString() << ": " << state.what(); break;
        }
    });

    using MqttClient = net::in::stream::legacy::SocketClient<LokatoMqttSocketContextFactory>;
    MqttClient mqttClient = core::socket::stream::Client<MqttClient>("lokato-mqtt", [](MqttClient::Config* cfg) {
        cfg->Remote::setPort(1883);
        cfg->setDisableNagleAlgorithm();
        cfg->setRetry();
        cfg->setRetryBase(1);
        cfg->setReconnect();
    });
    mqttClient.connect([](const MqttClient::SocketAddress& socketAddress, const core::socket::State& state) {
        switch (state) {
            case core::socket::State::OK: VLOG(1) << "lokato MQTT connected to " << socketAddress.toString(); break;
            case core::socket::State::DISABLED: VLOG(1) << "lokato MQTT disabled"; break;
            case core::socket::State::ERROR: LOG(ERROR) << "lokato MQTT " << socketAddress.toString() << ": " << state.what(); break;
            case core::socket::State::FATAL: LOG(FATAL) << "lokato MQTT " << socketAddress.toString() << ": " << state.what(); break;
        }
    });

    auto heartbeat = core::timer::Timer::intervalTimer([&sse](const std::function<void()>&) { sse.heartbeat(); }, 15);
    (void)heartbeat;

    return core::SNodeC::start();
}
