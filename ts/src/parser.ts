import type { MeshInput } from './types.js';

/** Regular expression used to split face tokens ("v/vt/vn"). */
const FACE_TOKEN_SPLIT = /\s+/;

/**
 * Parse a Wavefront OBJ payload into indexed triangle buffers compatible with {@link MeshInput}.
 *
 * Only position vertices and faces are supported; normals, texture coordinates, and materials are ignored.
 */
export function parseOBJ(objSource: string): MeshInput {
  const positions: number[] = [];
  const faces: number[] = [];
  const lines = objSource.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }

    const tokens = line.split(FACE_TOKEN_SPLIT);
    if (tokens.length === 0) {
      continue;
    }

    const tag = tokens[0];
    if (tag === 'v') {
      if (tokens.length < 4) {
        throw new Error(`Malformed vertex definition: "${line}"`);
      }
      for (let i = 1; i <= 3; i += 1) {
        const value = Number(tokens[i]);
        if (!Number.isFinite(value)) {
          throw new Error(`Invalid vertex component "${tokens[i]}" in line: ${line}`);
        }
        positions.push(value);
      }
    } else if (tag === 'f') {
      if (tokens.length < 4) {
        throw new Error(`Malformed face definition: "${line}"`);
      }
      const indices: number[] = [];
      for (let i = 1; i < tokens.length; i += 1) {
        const element = tokens[i];
        const slashIndex = element.indexOf('/');
        const indexToken = slashIndex === -1 ? element : element.slice(0, slashIndex);
        const parsed = Number.parseInt(indexToken, 10);
        if (!Number.isFinite(parsed) || parsed === 0) {
          throw new Error(`Invalid face index "${element}" in line: ${line}`);
        }
        const resolved = parsed > 0 ? parsed - 1 : positions.length / 3 + parsed;
        if (resolved < 0 || resolved >= positions.length / 3) {
          throw new Error(`Face index out of bounds: ${parsed} in line: ${line}`);
        }
        indices.push(resolved);
      }
      const base = indices[0];
      for (let i = 1; i < indices.length - 1; i += 1) {
        faces.push(base, indices[i], indices[i + 1]);
      }
    }
  }

  if (positions.length === 0) {
    throw new Error('OBJ payload does not contain any vertex positions.');
  }
  if (faces.length === 0) {
    throw new Error('OBJ payload does not contain any faces.');
  }

  return {
    positions: new Float64Array(positions),
    indices: new Uint32Array(faces),
  };
}
