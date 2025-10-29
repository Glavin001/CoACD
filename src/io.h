#pragma once
#include <algorithm>
#include <assert.h>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <stdio.h>
#include <string.h>
#include <string>
#include <vector>
#include <cstdlib>
#include <time.h>
#include <assert.h>
#include <algorithm>
#include <set>
#include <map>
#include <unordered_map>
#include <ostream>

#include "shape.h"
#include "model_obj.h"

using std::cout;
using std::endl;
using std::ios;
using std::to_string;

namespace coacd
{

    //////////////// IO ////////////////
    void SaveMesh(const string &filename, Model &mesh);
    void SaveConfig(Params params);
    void SaveOBJ(const string &filename, vector<Model> parts, Params &params);
    void SaveOBJs(const string &foldername, const string &filename, vector<Model> parts, Params &params);
    bool WriteVRML(std::ostream &fout, Model mesh, const Material &material);
    void SaveVRML(const string &fileName, vector<Model>& meshes, Params &params);
    std::string ExportOBJString(const vector<Model> &parts, Params &params);
    std::string ExportVRMLString(const vector<Model> &meshes, Params &params);
}
