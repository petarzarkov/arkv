import { initSync } from './wasm/arkv_rng.js';
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

// Initialize the WASM module synchronously when this module is first imported.
// Users do not need to call any init function — just `import { Rng } from '@arkv/rng'`.
initSync({ module: decodeBase64(WASM_BASE64) });
