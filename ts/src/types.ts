/** @internal Raw parameter shape emitted by the Embind bindings. */
export interface RawParams {
  input_model: string;
  output_name: string;
  remesh_output_name: string;
  mcts_nodes: number;
  threshold: number;
  resolution: number;
  seed: number;
  rv_k: number;
  preprocess_mode: string;
  prep_resolution: number;
  pca: boolean;
  merge: boolean;
  max_convex_hull: number;
  dmc_thres: number;
  apx_mode: string;
  decimate: boolean;
  max_ch_vertex: number;
  extrude: boolean;
  extrude_margin: number;
  mcts_iteration: number;
  mcts_max_depth: number;
}

/** @internal Raw mesh buffers returned by the Embind bindings. */
export interface RawMeshBuffers {
  positions: number[] | Float64Array;
  indices: number[] | Uint32Array;
}

/** @internal Raw decomposition payload returned by the Embind bindings. */
export interface RawDecompositionResult {
  parts: RawMeshBuffers[];
  obj: string;
  wrl: string;
  usedConvexFallback: boolean;
}

/** Shape of the instantiated WebAssembly module used by the higher level bindings. */
export interface CoACDEmscriptenModule {
  makeDefaultParams(): RawParams;
  decomposeMesh(
    positions: number[] | Float64Array,
    indices: number[] | Uint32Array,
    params: RawParams
  ): RawDecompositionResult;
  destroy?<T>(handle: T): void;
}

/** Factory returned by the generated WebAssembly module. */
export type ModuleFactory = (
  config?: {
    locateFile?: (path: string) => string;
  }
) => Promise<CoACDEmscriptenModule> | CoACDEmscriptenModule;

/**
 * Normalised parameter bag used by the public TypeScript API. All fields are optional when passed as overrides.
 */
export interface CoACDParameters {
  /** Target Hausdorff error threshold in the range [0.01, 1]. */
  threshold: number;
  /** Number of sample points to evaluate the Hausdorff error. */
  resolution: number;
  /** RNG seed used for deterministic sampling. */
  seed: number;
  /** Scaling factor applied during cost evaluation. */
  rvK: number;
  /** Preprocessing policy for non-manifold meshes. */
  preprocessMode: 'auto' | 'on' | 'off';
  /** Resolution used by the dual contouring preprocess. */
  prepResolution: number;
  /** Whether to align the mesh with its principal components prior to decomposition. */
  pca: boolean;
  /** Whether to merge adjacent convex hulls during the post-process stage. */
  merge: boolean;
  /** Maximum number of convex hulls to emit; -1 disables the limit. */
  maxConvexHulls: number;
  /** Dual marching cubes threshold used during preprocessing. */
  dmcThreshold: number;
  /** Approximation mode for generating candidate convex hulls. */
  approximationMode: 'ch' | 'box';
  /** Enable mesh decimation of convex hull outputs. */
  decimate: boolean;
  /** Maximum vertex count allowed per convex hull when decimation is enabled. */
  maxConvexHullVertices: number;
  /** Enable extrusion along overlapping faces to reduce cracks. */
  extrude: boolean;
  /** Extrusion margin applied when {@link extrude} is true. */
  extrudeMargin: number;
  /** Number of MCTS iterations used while searching for split planes. */
  mctsIteration: number;
  /** Maximum depth of the MCTS tree. */
  mctsMaxDepth: number;
  /** Number of candidate planes evaluated per iteration. */
  mctsNodes: number;
}

/** Geometry buffers accepted by the high level API. */
export interface MeshInput {
  /** Flattened vertex buffer (XYZ triplets). */
  positions: Iterable<number> | Float64Array;
  /** Triangle indices referencing {@link positions}. */
  indices: Iterable<number> | Uint32Array;
}

/** Convex mesh emitted by the decomposition. */
export interface MeshPart {
  /** Vertex buffer expressed as 64-bit floats. */
  positions: Float64Array;
  /** Triangle index buffer expressed as 32-bit unsigned integers. */
  indices: Uint32Array;
  /** Number of vertices contained within {@link positions}. */
  vertexCount: number;
  /** Number of triangles contained within {@link indices}. */
  triangleCount: number;
}

/** High-level result returned by {@link CoACD.decompose}. */
export interface DecompositionResult {
  /** Convex meshes produced by the decomposition. */
  parts: readonly MeshPart[];
  /** Concatenated OBJ payload containing all convex parts. */
  obj: string;
  /** VRML scene description including randomised materials per part. */
  wrl: string;
  /** Indicates whether the algorithm fell back to a single convex hull approximation. */
  usedConvexFallback: boolean;
}

/** Public surface of the WebAssembly powered CoACD bindings. */
export interface CoACD {
  /** Current default parameters (optionally merged with overrides). */
  parameters(overrides?: Partial<CoACDParameters>): CoACDParameters;
  /** Run the decomposition using raw geometry buffers. */
  decompose(input: MeshInput, overrides?: Partial<CoACDParameters>): Promise<DecompositionResult>;
  /** Convenience wrapper accepting an OBJ payload. */
  decomposeFromObj(objSource: string, overrides?: Partial<CoACDParameters>): Promise<DecompositionResult>;
}

/** Configuration bag accepted by {@link createCoACD}. */
export interface CreateCoACDOptions {
  /** Custom module factory (useful when bundling or loading the files from a CDN). */
  module?: ModuleFactory;
  /** Override how the WebAssembly loader resolves auxiliary files such as the `.wasm` binary. */
  locateFile?: (path: string) => string;
}
