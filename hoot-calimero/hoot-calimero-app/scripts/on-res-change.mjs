#!/usr/bin/env node
import { exec } from 'node:child_process';
import { basename } from 'node:path';

const changedPath = process.argv[2];
if (!changedPath) {
  console.error('on-res-change: missing file path argument');
  process.exit(1);
}

const file = basename(changedPath);

function run(command) {
  const child = exec(command, { env: process.env });
  child.stdout?.pipe(process.stdout);
  child.stderr?.pipe(process.stderr);
  child.on('exit', (code) => {
    if (code !== 0) {
      console.error(`Command failed (${code}): ${command}`);
    }
  });
}

if (file === 'abi.json') {
  console.log(`[res watcher] ABI changed: ${changedPath}`);
  run('pnpm run app:generate-client');
} else if (file.endsWith('.wasm')) {
  console.log(`[res watcher] WASM changed: ${changedPath}`);
  run(`pnpm run logic:sync ${JSON.stringify(changedPath)}`);
} else {
  // ignore unrelated files
}