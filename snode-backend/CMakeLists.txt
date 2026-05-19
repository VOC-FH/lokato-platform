cmake_minimum_required(VERSION 3.18)

project(lokato-snode-backend
    VERSION 0.1.0
    DESCRIPTION "Lokato backend refactored to SNode.C"
    LANGUAGES CXX
)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

find_package(nlohmann_json 3.7.0 REQUIRED)
find_package(snodec 1.0.0 REQUIRED COMPONENTS
    core
    http-server-express
    net-in-stream-legacy
    db-mariadb
    mqtt-client
)

add_executable(lokato-snode
    src/main.cpp
)

target_link_libraries(lokato-snode PRIVATE
    nlohmann_json::nlohmann_json
    snodec::core
    snodec::http-server-express
    snodec::net-in-stream-legacy
    snodec::db-mariadb
    snodec::mqtt-client
)

install(TARGETS lokato-snode RUNTIME DESTINATION bin)
