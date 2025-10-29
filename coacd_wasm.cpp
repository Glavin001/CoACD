#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdint>
#include <limits>
#include <stdexcept>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

#include <emscripten/bind.h>
#include <emscripten/val.h>

#include "src/io.h"
#include "src/model_obj.h"
#include "src/process.h"
#if WITH_3RD_PARTY_LIBS
#include "src/preprocess.h"
#endif

using namespace coacd;

namespace
{
    struct MeshBuffers
    {
        std::vector<double> positions;
        std::vector<uint32_t> indices;
    };

    struct DecompositionResult
    {
        std::vector<MeshBuffers> parts;
        std::string obj;
        std::string wrl;
        bool usedConvexFallback;
    };

    Params sanitize_params(const Params &input)
    {
        Params params = input;
        params.input_model.clear();
        params.output_name.clear();
        params.remesh_output_name.clear();
        params.threshold = std::min(std::max(params.threshold, 0.01), 1.0);
        return params;
    }

    std::vector<Model> compute_parts(Model &mesh, Params &params, bool &used_convex_fallback)
    {
        std::vector<Model> parts;

#if WITH_3RD_PARTY_LIBS
        if (params.preprocess_mode == std::string("auto"))
        {
            bool is_manifold = IsManifold(mesh);
            if (!is_manifold)
            {
                ManifoldPreprocess(params, mesh);
            }
        }
        else if (params.preprocess_mode == std::string("on"))
        {
            ManifoldPreprocess(params, mesh);
        }
#else
        if (!IsManifold(mesh))
        {
            used_convex_fallback = true;
        }
        else if (params.preprocess_mode == std::string("on"))
        {
            throw std::runtime_error("Mesh preprocessing is not available in the WebAssembly build (WITH_3RD_PARTY_LIBS=OFF).");
        }
#endif

        if (used_convex_fallback)
        {
            Model convex;
            mesh.ComputeCH(convex);
            parts.push_back(convex);
            return parts;
        }

        parts = Compute(mesh, params);
        return parts;
    }

    MeshBuffers model_to_mesh_buffers(const Model &model)
    {
        MeshBuffers buffers;
        buffers.positions.reserve(model.points.size() * 3);
        buffers.indices.reserve(model.triangles.size() * 3);

        for (const auto &pt : model.points)
        {
            buffers.positions.push_back(pt[0]);
            buffers.positions.push_back(pt[1]);
            buffers.positions.push_back(pt[2]);
        }

        for (const auto &tri : model.triangles)
        {
            if (tri[0] < 0 || tri[1] < 0 || tri[2] < 0)
            {
                throw std::runtime_error("Encountered negative triangle index while serialising convex part.");
            }
            buffers.indices.push_back(static_cast<uint32_t>(tri[0]));
            buffers.indices.push_back(static_cast<uint32_t>(tri[1]));
            buffers.indices.push_back(static_cast<uint32_t>(tri[2]));
        }

        return buffers;
    }

    Model load_buffers_into_model(const std::vector<double> &positions, const std::vector<uint32_t> &indices)
    {
        if (positions.empty())
        {
            throw std::runtime_error("The input mesh does not contain any vertices.");
        }
        if (positions.size() % 3 != 0)
        {
            throw std::runtime_error("Vertex buffer length must be a multiple of 3 (xyz per vertex).");
        }
        if (indices.empty())
        {
            throw std::runtime_error("The input mesh does not contain any triangles.");
        }
        if (indices.size() % 3 != 0)
        {
            throw std::runtime_error("Index buffer length must be a multiple of 3 (triangle indices).");
        }

        const size_t vertex_count = positions.size() / 3;
        std::vector<vec3d> vertices;
        vertices.reserve(vertex_count);
        for (size_t i = 0; i < vertex_count; ++i)
        {
            vec3d v{positions[i * 3 + 0], positions[i * 3 + 1], positions[i * 3 + 2]};
            vertices.push_back(v);
        }

        const size_t face_count = indices.size() / 3;
        std::vector<vec3i> faces;
        faces.reserve(face_count);
        for (size_t i = 0; i < face_count; ++i)
        {
            const uint32_t a = indices[i * 3 + 0];
            const uint32_t b = indices[i * 3 + 1];
            const uint32_t c = indices[i * 3 + 2];
            if (a >= vertex_count || b >= vertex_count || c >= vertex_count)
            {
                throw std::runtime_error("Triangle index out of bounds for provided vertex buffer.");
            }
            vec3i tri{static_cast<int>(a), static_cast<int>(b), static_cast<int>(c)};
            faces.push_back(tri);
        }

        Model mesh;
        mesh.Load(vertices, faces);
        return mesh;
    }

    DecompositionResult decompose_mesh(const emscripten::val &positions_val,
                                       const emscripten::val &indices_val,
                                       const Params &raw_params)
    {
        std::vector<double> positions = emscripten::vecFromJSArray<double>(positions_val);
        std::vector<uint32_t> indices = emscripten::vecFromJSArray<uint32_t>(indices_val);
        Model mesh = load_buffers_into_model(positions, indices);

        Params params = sanitize_params(raw_params);
        std::array<std::array<double, 3>, 3> rot{{{1.0, 0.0, 0.0}, {0.0, 1.0, 0.0}, {0.0, 0.0, 1.0}}};

        std::vector<double> bbox = mesh.Normalize();
        if (params.pca)
        {
            rot = mesh.PCA();
        }

        bool used_convex_fallback = false;
        auto parts = compute_parts(mesh, params, used_convex_fallback);
        RecoverParts(parts, bbox, rot, params);

        DecompositionResult result;
        result.usedConvexFallback = used_convex_fallback;
        result.parts.reserve(parts.size());
        for (const auto &part : parts)
        {
            result.parts.push_back(model_to_mesh_buffers(part));
        }
        result.obj = ExportOBJString(parts, params);
        result.wrl = ExportVRMLString(parts, params);
        return result;
    }

    Params make_default_params()
    {
        Params params;
        params.input_model.clear();
        params.output_name.clear();
        params.remesh_output_name.clear();
        return params;
    }

} // namespace

EMSCRIPTEN_BINDINGS(coacd_bindings)
{
    emscripten::value_object<MeshBuffers>("MeshBuffers")
        .field("positions", &MeshBuffers::positions)
        .field("indices", &MeshBuffers::indices);

    emscripten::value_object<DecompositionResult>("DecompositionResult")
        .field("parts", &DecompositionResult::parts)
        .field("obj", &DecompositionResult::obj)
        .field("wrl", &DecompositionResult::wrl)
        .field("usedConvexFallback", &DecompositionResult::usedConvexFallback);

    emscripten::value_object<Params>("Params")
        .field("input_model", &Params::input_model)
        .field("output_name", &Params::output_name)
        .field("remesh_output_name", &Params::remesh_output_name)
        .field("mcts_nodes", &Params::mcts_nodes)
        .field("threshold", &Params::threshold)
        .field("resolution", &Params::resolution)
        .field("seed", &Params::seed)
        .field("rv_k", &Params::rv_k)
        .field("preprocess_mode", &Params::preprocess_mode)
        .field("prep_resolution", &Params::prep_resolution)
        .field("pca", &Params::pca)
        .field("merge", &Params::merge)
        .field("max_convex_hull", &Params::max_convex_hull)
        .field("dmc_thres", &Params::dmc_thres)
        .field("apx_mode", &Params::apx_mode)
        .field("decimate", &Params::decimate)
        .field("max_ch_vertex", &Params::max_ch_vertex)
        .field("extrude", &Params::extrude)
        .field("extrude_margin", &Params::extrude_margin)
        .field("mcts_iteration", &Params::mcts_iteration)
        .field("mcts_max_depth", &Params::mcts_max_depth);

    emscripten::function("makeDefaultParams", &make_default_params);
    emscripten::function("decomposeMesh", &decompose_mesh);

    emscripten::register_vector<double>("VectorDouble");
    emscripten::register_vector<uint32_t>("VectorUint32");
    emscripten::register_vector<MeshBuffers>("VectorMeshBuffers");
}
