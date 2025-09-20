#include <iostream>
#include <fstream>
#include <sstream>
#include <string>
#include <time.h>

#if WITH_3RD_PARTY_LIBS
  #include "src/preprocess.h"
#endif
#include "src/process.h"
#include "src/logger.h"

using namespace std;
using namespace coacd;

int main(int argc, char *argv[])
{
  Params params;

  // Model files
  string input_model;
  params.seed = (unsigned)time(NULL);

  std::cout << "[DEBUG] Entering main" << std::endl;
  std::cout << "argc: " << argc << std::endl;
  for (int i = 0; i < argc; ++i)
    std::cout << "argv[" << i << "]: " << argv[i] << std::endl;

  // args
  for (int i = 0; i < argc; ++i)
  {
    if (i < argc)
    {
      if (strcmp(argv[i], "-i") == 0 || strcmp(argv[i], "--input") == 0)
      {
        params.input_model = argv[i + 1];
      }
      if (strcmp(argv[i], "-o") == 0 || strcmp(argv[i], "--output") == 0)
      {
        params.output_name = argv[i + 1];
      }
      if (strcmp(argv[i], "-ro") == 0 || strcmp(argv[i], "--remesh-output") == 0)
      {
        params.remesh_output_name = argv[i + 1];
      }
      if (strcmp(argv[i], "-k") == 0)
      {
        sscanf(argv[i + 1], "%le", &params.rv_k);
      }
      if (strcmp(argv[i], "-t") == 0 || strcmp(argv[i], "--threshold") == 0)
      {
        sscanf(argv[i + 1], "%le", &params.threshold);
      }
      if (strcmp(argv[i], "-r") == 0 || strcmp(argv[i], "--resolution") == 0)
      {
        sscanf(argv[i + 1], "%u", &params.resolution);
      }
      if (strcmp(argv[i], "-c") == 0 || strcmp(argv[i], "--max-convex-hull") == 0)
      {
        sscanf(argv[i + 1], "%u", &params.max_convex_hull);
      }
      if (strcmp(argv[i], "-nm") == 0 || strcmp(argv[i], "--no-merge") == 0)
      {
        params.merge = false;
      }
      if (strcmp(argv[i], "-d") == 0 || strcmp(argv[i], "--decimate") == 0)
      {
        params.decimate = true;
      }
      if (strcmp(argv[i], "-dt") == 0 || strcmp(argv[i], "--max-ch-vertex") == 0)
      {
        sscanf(argv[i + 1], "%d", &params.max_ch_vertex);
      }
      if (strcmp(argv[i], "-ex") == 0 || strcmp(argv[i], "--extrude") == 0)
      {
        params.extrude = true;
      }
      if (strcmp(argv[i], "-em") == 0 || strcmp(argv[i], "--extrude-margin") == 0)
      {
        sscanf(argv[i + 1], "%le", &params.extrude_margin);
      }
      if (strcmp(argv[i], "--pca") == 0)
      {
        params.pca = true;
      }
      if (strcmp(argv[i], "-pm") == 0 || strcmp(argv[i], "--preprocess-mode") == 0)
      {
        params.preprocess_mode = argv[i + 1];
      }
      if (strcmp(argv[i], "-am") == 0 || strcmp(argv[i], "--approximate-mode") == 0)
      {
        params.apx_mode = argv[i + 1];
      }
      if (strcmp(argv[i], "-pr") == 0 || strcmp(argv[i], "--prep-resolution") == 0)
      {
        sscanf(argv[i + 1], "%d", &params.prep_resolution);
      }
      if (strcmp(argv[i], "-s") == 0 || strcmp(argv[i], "--seed") == 0)
      {
        sscanf(argv[i + 1], "%u", &params.seed);
      }
      if (strcmp(argv[i], "-mi") == 0 || strcmp(argv[i], "--mcts-iteration") == 0)
      {
        sscanf(argv[i + 1], "%d", &params.mcts_iteration);
      }
      if (strcmp(argv[i], "-md") == 0 || strcmp(argv[i], "--mcts-depth") == 0)
      {
        sscanf(argv[i + 1], "%d", &params.mcts_max_depth);
      }
      if (strcmp(argv[i], "-mn") == 0 || strcmp(argv[i], "--mcts-node") == 0)
      {
        sscanf(argv[i + 1], "%d", &params.mcts_nodes);
      }
      if (strcmp(argv[i], "-dt") == 0 || strcmp(argv[i], "--dualmc-threshold") == 0)
      {
        sscanf(argv[i + 1], "%le", &params.dmc_thres);
      }
    }
  }

  std::cout << "Parsed input_model: "
            << (params.input_model.empty() ? "<none>" : params.input_model)
            << std::endl;
  std::cout << "Parsed output_name: "
            << (params.output_name.empty() ? "<none>" : params.output_name)
            << std::endl;

  std::ifstream input_check(params.input_model.c_str());
  if (!input_check.good())
    std::cout << "[DEBUG] Unable to open input file: " << params.input_model << std::endl;
  else
    std::cout << "[DEBUG] Input file opened successfully" << std::endl;
  input_check.close();

  string ext;
  if (params.input_model.length() > 4)
  {
    ext = params.input_model.substr(params.input_model.length() - 4);
    if (ext != ".obj")
    {
      logger::critical("Input must be OBJ format!");
      exit(0);
    }
  }
  else
  {
    logger::critical("Input Filename Error!");
    exit(0);
  }

  if (params.output_name.length() > 4)
    ext = params.output_name.substr(params.output_name.length() - 4);
  else
  {
    logger::critical("Output Filename Error! You can set the output filename as either .OBJ or .WRL!");
    exit(0);
  }
  if (ext != ".obj" && ext != ".wrl")
  {
    logger::critical("Output Filename must be .OBJ or .WRL format!");
    exit(0);
  }

  if (params.threshold < 0.01)
    logger::warn("Threshold t exceeds the lower bound and is automatically set as 0.01!");
  else if (params.threshold > 1)
    logger::warn("Threshold t exceeds the higher bound and is automatically set as 1!");
  params.threshold = min(max(params.threshold, 0.01), 1.0);

  Model m;
  array<array<double, 3>, 3> rot;

  std::cout << "[DEBUG] Calling SaveConfig" << std::endl;
  SaveConfig(params);
  std::cout << "[DEBUG] Returned from SaveConfig" << std::endl;

  std::cout << "[DEBUG] About to LoadOBJ: " << params.input_model << std::endl;
  bool load_ok = m.LoadOBJ(params.input_model);
  std::cout << "[DEBUG] LoadOBJ result: " << load_ok
            << ", points=" << m.points.size()
            << ", triangles=" << m.triangles.size() << std::endl;

  std::cout << "[DEBUG] Normalizing mesh" << std::endl;
  vector<double> bbox = m.Normalize();
  std::cout << "[DEBUG] Normalize completed" << std::endl;
  // m.SaveOBJ("normalized.obj");

  #if WITH_3RD_PARTY_LIBS
    if (params.preprocess_mode == "auto")
    {
      bool is_manifold = IsManifold(m);
      logger::info("Mesh Manifoldness: {}", is_manifold);
      if (!is_manifold)
        ManifoldPreprocess(params, m);
    }
    else if (params.preprocess_mode == "on")
      ManifoldPreprocess(params, m);
#else
    bool is_manifold = IsManifold(m);
    logger::info("Mesh Manifoldness: {}", is_manifold);
    if (!is_manifold)
    {
      logger::critical("The mesh is not a 2-manifold! Please enable WITH_3RD_PARTY_LIBS during compilation, or use third-party libraries to preprocess the mesh.");
      exit(0);
    }

#endif

  std::cout << "[DEBUG] Saving remesh output: " << params.remesh_output_name << std::endl;
  m.SaveOBJ(params.remesh_output_name);
  std::cout << "[DEBUG] Remesh output saved" << std::endl;

  if (params.pca)
  {
    std::cout << "[DEBUG] Performing PCA" << std::endl;
    rot = m.PCA();
    std::cout << "[DEBUG] PCA completed" << std::endl;
  }

  std::cout << "[DEBUG] Starting Compute" << std::endl;
  vector<Model> parts = Compute(m, params);
  std::cout << "[DEBUG] Compute finished, parts count: " << parts.size() << std::endl;

  std::cout << "[DEBUG] Recovering parts" << std::endl;
  RecoverParts(parts, bbox, rot, params);
  std::cout << "[DEBUG] RecoverParts finished" << std::endl;

  string objName = regex_replace(params.output_name, regex("wrl"), "obj");
  string wrlName = regex_replace(params.output_name, regex("obj"), "wrl");
  std::cout << "[DEBUG] Output names -> OBJ: " << objName << ", WRL: " << wrlName << std::endl;

  std::cout << "[DEBUG] Calling SaveVRML" << std::endl;
  SaveVRML(wrlName, parts, params);
  std::cout << "[DEBUG] Calling SaveOBJ" << std::endl;
  SaveOBJ(objName, parts, params);
  std::cout << "[DEBUG] Finished writing output files" << std::endl;

  return 0;
}
