cmake_minimum_required(VERSION 3.24)
project(CoACD LANGUAGES C CXX)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

list(APPEND CMAKE_MODULE_PATH "${CMAKE_CURRENT_LIST_DIR}/cmake")

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

option(WITH_3RD_PARTY_LIBS "Include 3rd party libraries" ON)

if(WITH_3RD_PARTY_LIBS)
    add_compile_definitions(WITH_3RD_PARTY_LIBS=1)
else()
    add_definitions(-DDISABLE_SPDLOG)
    add_compile_definitions(WITH_3RD_PARTY_LIBS=0)
endif()

# --- Compiler-specific flags
if(MSVC)
    # For Microsoft Visual Studio (Windows)
    add_compile_options("/bigobj")
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} /W0 /D_USE_MATH_DEFINES")
    set(CMAKE_SHARED_LIBRARY_PREFIX "lib")
else()
    # For non-MSVC (Linux, macOS, etc.)
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -Wall -fpermissive -D_USE_MATH_DEFINES")
    if(APPLE)
        # macOS: add -fPIC
        set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -fPIC")
    elseif(UNIX)
        # Linux/Unix: add -fPIC and disable -Werror=stringop-overflow
        set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -fPIC -Wno-error=stringop-overflow")
    endif()
endif()

if(EMSCRIPTEN)
    set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -Wno-unknown-warning-option -Wno-error=unknown-warning-option")
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -Wno-unknown-warning-option -Wno-error=unknown-warning-option")
endif()

set(CMAKE_CXX_FLAGS_DEBUG "${CMAKE_CXX_FLAGS}")
set(CMAKE_CXX_FLAGS_RELEASE "${CMAKE_CXX_FLAGS} -O3")

if ("${CMAKE_CXX_COMPILER_ID}" STREQUAL "GNU")
    set(CMAKE_CXX_FLAGS_DEBUG "${CMAKE_CXX_FLAGS_DEBUG} -fsanitize=address")
    set(CMAKE_CXX_FLAGS_RELEASE "${CMAKE_CXX_FLAGS_RELEASE} -Wno-int-in-bool-context -Wsign-compare")
    set(CMAKE_LINKER_FLAGS_DEBUG "${CMAKE_LINKER_FLAGS_DEBUG} -fsanitize=address")
endif()

if(WITH_3RD_PARTY_LIBS)
    include(zlib)
    include(boost)
    include(openvdb)
    include(spdlog)
endif()

file(GLOB_RECURSE COACD_SRC "src/*.cc" "src/*.cpp")
if(NOT WITH_3RD_PARTY_LIBS)
    # Exclude files that match the pattern "preprocess*"
    list(FILTER COACD_SRC EXCLUDE REGEX ".*preprocess.*")
endif()

add_library(coacd STATIC ${COACD_SRC})
target_include_directories(coacd PUBLIC public)
target_include_directories(coacd PRIVATE 3rd/cdt/CDT)

if(WITH_3RD_PARTY_LIBS)
    target_link_libraries(coacd PRIVATE openvdb_static spdlog::spdlog)
endif()

if(NOT EMSCRIPTEN)
    find_package(OpenMP)
    if (OpenMP_CXX_FOUND AND WITH_3RD_PARTY_LIBS)
        target_link_libraries(coacd PUBLIC OpenMP::OpenMP_CXX)
    endif()

    find_package(Threads)
    target_link_libraries(coacd PRIVATE Threads::Threads)
endif()
set_target_properties(coacd PROPERTIES POSITION_INDEPENDENT_CODE TRUE)

if(WITH_3RD_PARTY_LIBS)
    add_library(_coacd SHARED "public/coacd.cpp")
    target_link_libraries(_coacd PRIVATE coacd spdlog::spdlog openvdb_static)
endif()

if(EMSCRIPTEN)
    add_executable(coacd_wasm coacd_wasm.cpp)
    set(CMAKE_EXECUTABLE_SUFFIX ".js")
    set_target_properties(coacd_wasm PROPERTIES OUTPUT_NAME coacd)
    target_link_libraries(coacd_wasm coacd)
    target_link_options(coacd_wasm PRIVATE
        "-sENVIRONMENT=node"
        "-sALLOW_MEMORY_GROWTH=1"
        "-sFORCE_FILESYSTEM=1"
        "-lnodefs.js"
        "-sSINGLE_FILE=1"
        "-sMODULARIZE=1"
        "-sEXPORT_ES6=0"
        "-sASSERTIONS=2"
        "-sSTACK_OVERFLOW_CHECK=2"
        "-sEXIT_RUNTIME=1"
        "-sEXPORTED_FUNCTIONS=['_coacd_decompose','_coacd_reset_params','_coacd_set_threshold','_coacd_set_preprocess_mode','_coacd_set_seed']"
        "-sEXPORTED_RUNTIME_METHODS=['cwrap','ccall','FS','NODEFS']"
        "--no-entry")
else()
    add_executable(main main.cpp)
    if(WITH_3RD_PARTY_LIBS)
        target_link_libraries(main coacd spdlog::spdlog openvdb_static)
    else()
        target_link_libraries(main coacd)
    endif()
endif()
