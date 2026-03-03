import initWasm from './wasm/arkv_rng.js';
import { WASM_BASE64 } from './wasm/inline.js';

function decodeBase64(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(b64, 'base64');
  }
  const binString = atob(b64);
  return Uint8Array.from(
    binString,
    m => m.codePointAt(0) ?? 0,
  );
}

let isInitialized = false;

/**
 * Must be called once before creating any Rng instance.
 * Safe to call multiple times (idempotent).
 */
export async function initArkvRng(): Promise<void> {
  if (!isInitialized) {
    const wasmBytes = decodeBase64(WASM_BASE64);
    await initWasm({ module_or_path: wasmBytes });
    isInitialized = true;
  }
}

export function checkInit(): void {
  if (!isInitialized) {
    throw new Error(
      'You must await initArkvRng() before creating an @arkv/rng Rng instance.',
    );
  }
}
