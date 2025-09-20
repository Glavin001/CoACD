#include <regex>
#include <string>
#include <array>
#include <vector>
#include <iostream>

#include "src/process.h"
#include "src/model_obj.h"

#include <emscripten/emscripten.h>

using namespace std;
using namespace coacd;

extern "C" EMSCRIPTEN_KEEPALIVE int coacd_decompose(const char* input_path, const char* output_path) {
  if (!input_path || !output_path) {
    cerr << "[coacd_decompose] missing paths" << endl;
    return -1;
  }

  Params params;
  params.input_model = string(input_path);
  params.output_name = string(output_path);
  params.remesh_output_name = "";

  Model m;
  if (!m.LoadOBJ(params.input_model)) {
    cerr << "[coacd_decompose] failed to load OBJ: " << params.input_model << endl;
    return 1;
  }
  vector<double> bbox = m.Normalize();
  array<array<double,3>,3> rot{{{1,0,0},{0,1,0},{0,0,1}}};

  bool is_manifold = IsManifold(m);
  if (!is_manifold) {
    cerr << "[coacd_decompose] input mesh is not a 2-manifold" << endl;
    return 2;
  }

  vector<Model> parts = Compute(m, params);
  RecoverParts(parts, bbox, rot, params);

  string objName = regex_replace(params.output_name, regex("wrl"), "obj");
  string wrlName = regex_replace(params.output_name, regex("obj"), "wrl");
  SaveVRML(wrlName, parts, params);
  SaveOBJ(objName, parts, params);
  return 0;
}
