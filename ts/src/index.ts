import { parseOBJ } from './parser.js';
import type {
  CoACD,
  CoACDEmscriptenModule,
  CoACDParameters,
  CreateCoACDOptions,
  DecompositionResult,
  MeshInput,
  MeshPart,
  ModuleFactory,
  RawDecompositionResult,
  RawMeshBuffers,
  RawParams,
} from './types.js';

/** Resolve auxiliary files relative to the published `wasm` folder. */
function defaultLocateFile(path: string): string {
  return new URL(`../wasm/${path}`, import.meta.url).toString();
}

function mapRawParamsToPublic(raw: RawParams): CoACDParameters {
  return {
    threshold: raw.threshold,
    resolution: raw.resolution,
    seed: raw.seed,
    rvK: raw.rv_k,
    preprocessMode: raw.preprocess_mode as CoACDParameters['preprocessMode'],
    prepResolution: raw.prep_resolution,
    pca: raw.pca,
    merge: raw.merge,
    maxConvexHulls: raw.max_convex_hull,
    dmcThreshold: raw.dmc_thres,
    approximationMode: raw.apx_mode as CoACDParameters['approximationMode'],
    decimate: raw.decimate,
    maxConvexHullVertices: raw.max_ch_vertex,
    extrude: raw.extrude,
    extrudeMargin: raw.extrude_margin,
    mctsIteration: raw.mcts_iteration,
    mctsMaxDepth: raw.mcts_max_depth,
    mctsNodes: raw.mcts_nodes,
  };
}

function applyOverrides(base: RawParams, overrides: Partial<CoACDParameters>): RawParams {
  const next: RawParams = { ...base };
  if (overrides.threshold !== undefined) next.threshold = overrides.threshold;
  if (overrides.resolution !== undefined) next.resolution = overrides.resolution;
  if (overrides.seed !== undefined) next.seed = overrides.seed;
  if (overrides.rvK !== undefined) next.rv_k = overrides.rvK;
  if (overrides.preprocessMode !== undefined) next.preprocess_mode = overrides.preprocessMode;
  if (overrides.prepResolution !== undefined) next.prep_resolution = overrides.prepResolution;
  if (overrides.pca !== undefined) next.pca = overrides.pca;
  if (overrides.merge !== undefined) next.merge = overrides.merge;
  if (overrides.maxConvexHulls !== undefined) next.max_convex_hull = overrides.maxConvexHulls;
  if (overrides.dmcThreshold !== undefined) next.dmc_thres = overrides.dmcThreshold;
  if (overrides.approximationMode !== undefined) next.apx_mode = overrides.approximationMode;
  if (overrides.decimate !== undefined) next.decimate = overrides.decimate;
  if (overrides.maxConvexHullVertices !== undefined) next.max_ch_vertex = overrides.maxConvexHullVertices;
  if (overrides.extrude !== undefined) next.extrude = overrides.extrude;
  if (overrides.extrudeMargin !== undefined) next.extrude_margin = overrides.extrudeMargin;
  if (overrides.mctsIteration !== undefined) next.mcts_iteration = overrides.mctsIteration;
  if (overrides.mctsMaxDepth !== undefined) next.mcts_max_depth = overrides.mctsMaxDepth;
  if (overrides.mctsNodes !== undefined) next.mcts_nodes = overrides.mctsNodes;
  return next;
}

function isArrayBufferView(value: unknown): value is ArrayBufferView {
  return typeof value === 'object' && value !== null && ArrayBuffer.isView(value as ArrayBufferView);
}

function ensureFloat64Array(source: Iterable<number> | Float64Array): Float64Array {
  if (source instanceof Float64Array) {
    return source;
  }
  if (isArrayBufferView(source)) {
    const view = source;
    return new Float64Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
  }
  return Float64Array.from(source);
}

function ensureUint32Array(source: Iterable<number> | Uint32Array): Uint32Array {
  if (source instanceof Uint32Array) {
    return source;
  }
  if (isArrayBufferView(source)) {
    const view = source;
    return new Uint32Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
  }
  return Uint32Array.from(source);
}

function normalisePart(raw: RawMeshBuffers): MeshPart {
  const positions = ensureFloat64Array(raw.positions);
  const indices = ensureUint32Array(raw.indices);
  return {
    positions,
    indices,
    vertexCount: positions.length / 3,
    triangleCount: indices.length / 3,
  };
}

function collectRawParts(rawParts: RawDecompositionResult['parts']): RawMeshBuffers[] {
  if (Array.isArray(rawParts)) {
    return rawParts;
  }
  if (typeof rawParts === 'object' && rawParts !== null && typeof (rawParts as { size?: () => number }).size === 'function') {
    const vectorLike = rawParts as unknown as { size(): number; get(index: number): RawMeshBuffers; delete?(): void };
    const size = vectorLike.size();
    const parts: RawMeshBuffers[] = [];
    for (let i = 0; i < size; i += 1) {
      parts.push(vectorLike.get(i));
    }
    vectorLike.delete?.();
    return parts;
  }
  throw new TypeError('Unexpected WASM payload for convex parts.');
}

function mapResult(raw: RawDecompositionResult): DecompositionResult {
  const parts = collectRawParts(raw.parts).map(normalisePart);
  return {
    parts,
    obj: raw.obj,
    wrl: raw.wrl,
    usedConvexFallback: raw.usedConvexFallback,
  };
}

class WasmCoACD implements CoACD {
  constructor(private readonly module: CoACDEmscriptenModule) {}

  parameters(overrides?: Partial<CoACDParameters>): CoACDParameters {
    const defaults = mapRawParamsToPublic(this.module.makeDefaultParams());
    return overrides ? { ...defaults, ...overrides } : defaults;
  }

  async decompose(input: MeshInput, overrides: Partial<CoACDParameters> = {}): Promise<DecompositionResult> {
    const params = applyOverrides(this.module.makeDefaultParams(), overrides);
    const positions = ensureFloat64Array(input.positions);
    const indices = ensureUint32Array(input.indices);
    const raw = this.module.decomposeMesh(Array.from(positions), Array.from(indices), params);
    try {
      return mapResult(raw);
    } finally {
      this.module.destroy?.(raw);
    }
  }

  async decomposeFromObj(objSource: string, overrides: Partial<CoACDParameters> = {}): Promise<DecompositionResult> {
    const mesh = parseOBJ(objSource);
    return this.decompose(mesh, overrides);
  }
}

async function loadModule(options: CreateCoACDOptions | undefined): Promise<CoACDEmscriptenModule> {
  const locateFile = options?.locateFile ?? defaultLocateFile;
  // @ts-expect-error The generated WebAssembly factory is emitted alongside the build artefacts and does not have
  // explicit TypeScript metadata at compile time. The runtime shape is compatible with `ModuleFactory`.
  const moduleImport = await import('../wasm/coacd-wasm.mjs');
  const factory: ModuleFactory =
    options?.module ?? (moduleImport as unknown as { default: ModuleFactory }).default;
  const instance = await factory({ locateFile });
  return instance;
}

/**
 * Initialise the CoACD WebAssembly module and expose a high-level TypeScript API.
 */
export async function createCoACD(options?: CreateCoACDOptions): Promise<CoACD> {
  const module = await loadModule(options);
  return new WasmCoACD(module);
}

export type {
  CoACD,
  CoACDParameters,
  CreateCoACDOptions,
  DecompositionResult,
  MeshInput,
  MeshPart,
} from './types.js';

export { parseOBJ } from './parser.js';
