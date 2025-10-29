#include <regex>
#include <string>
#include <array>
#include <vector>
#include <iostream>

#include "src/process.h"
#include "src/model_obj.h"
#if WITH_3RD_PARTY_LIBS
#include "src/preprocess.h"
#endif

#include <emscripten/emscripten.h>

using namespace std;
using namespace coacd;

namespace {

Params make_default_params() {
  Params params;
  params.input_model.clear();
  params.output_name.clear();
  params.remesh_output_name.clear();
  return params;
}

Params g_params = make_default_params();

} // namespace

extern "C" EMSCRIPTEN_KEEPALIVE void coacd_reset_params() {
  g_params = make_default_params();
}

extern "C" EMSCRIPTEN_KEEPALIVE void coacd_set_threshold(double threshold) {
  g_params.threshold = threshold;
}

extern "C" EMSCRIPTEN_KEEPALIVE void coacd_set_preprocess_mode(const char* mode) {
  if (mode) {
    g_params.preprocess_mode = mode;
  }
}

extern "C" EMSCRIPTEN_KEEPALIVE void coacd_set_seed(unsigned int seed) {
  g_params.seed = seed;
}

extern "C" EMSCRIPTEN_KEEPALIVE int coacd_decompose(const char* input_path, const char* output_path) {
  if (!input_path || !output_path) {
    cerr << "[coacd_decompose] missing paths" << endl;
    return -1;
  }

  Params params = g_params;
  params.input_model = string(input_path);
  params.output_name = string(output_path);
  params.remesh_output_name.clear();

  Model m;
  if (!m.LoadOBJ(params.input_model)) {
    cerr << "[coacd_decompose] failed to load OBJ: " << params.input_model << endl;
    return 1;
  }
  vector<double> bbox = m.Normalize();
  array<array<double,3>,3> rot{{{1,0,0},{0,1,0},{0,0,1}}};
  bool use_convex_fallback = false;

#if WITH_3RD_PARTY_LIBS
  if (params.preprocess_mode == "auto") {
    bool is_manifold = IsManifold(m);
    if (!is_manifold) {
      ManifoldPreprocess(params, m);
    }
  } else if (params.preprocess_mode == "on") {
    ManifoldPreprocess(params, m);
  }
#else
  bool is_manifold = IsManifold(m);
  if (!is_manifold) {
    cerr << "[coacd_decompose] mesh is not a 2-manifold; approximating with a single convex hull" << endl;
    use_convex_fallback = true;
  }
  if (params.preprocess_mode == "on") {
    cerr << "[coacd_decompose] preprocess=on requested but unavailable under the WebAssembly build" << endl;
  }
#endif

  vector<Model> parts;
  if (use_convex_fallback) {
    Model convex;
    m.ComputeCH(convex);
    parts.push_back(convex);
  } else {
    parts = Compute(m, params);
  }
  RecoverParts(parts, bbox, rot, params);

  string objName = regex_replace(params.output_name, regex("wrl"), "obj");
  string wrlName = regex_replace(params.output_name, regex("obj"), "wrl");
  SaveVRML(wrlName, parts, params);
  SaveOBJ(objName, parts, params);
  return 0;
}
