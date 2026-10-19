// ============================================================================
// Platform: Commercial MikroTik Network & HotSpot Card Management System
// File: scripts/patch-prisma-wasm.js
// Purpose: Automatically patch Prisma Client WASM loader for Node 26 / Termux
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';

const wasmFile = path.resolve('node_modules/.prisma/client/wasm.js');
if (fs.existsSync(wasmFile)) {
  let content = fs.readFileSync(wasmFile, 'utf8');
  if (content.includes("import('#wasm-engine-loader')")) {
    content = content.replace(
      /getQueryEngineWasmModule: async \(\) => {[\s\S]*?return engine[\s\S]*?}/,
      `getQueryEngineWasmModule: async () => {
    const fs = require('fs');
    const path = require('path');
    const wasmPath = path.join(__dirname, 'query_engine_bg.wasm');
    const bytes = fs.readFileSync(wasmPath);
    return new WebAssembly.Module(bytes);
  }`
    );
    fs.writeFileSync(wasmFile, content, 'utf8');
    console.log('[Prisma Patch] Successfully applied WASM loader patch for Node 26 / Termux.');
  }
}
