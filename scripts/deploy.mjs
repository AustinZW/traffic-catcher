// Deploy script — build everything and prepare for server deployment
// This sets shared package main to dist/ so Node.js can resolve it at runtime
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const sharedPkgPath = join(root, 'packages', 'shared', 'package.json');

const pkg = JSON.parse(readFileSync(sharedPkgPath, 'utf-8'));

function run(cmd, cwd = root) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit' });
}

try {
  // 1. Build shared
  run('npx tsc', join(root, 'packages', 'shared'));

  // 2. Build server
  pkg.main = './dist/index.js';
  writeFileSync(sharedPkgPath, JSON.stringify(pkg, null, 2) + '\n');
  run('npx prisma generate', join(root, 'server'));
  run('npx tsc', join(root, 'server'));

  // 3. Build client
  run('npx vite build', join(root, 'client'));

  // Keep main pointing to dist for deployment
  console.log('\n✅ Deploy build complete.');
  console.log('\nCopy these to the server:');
  console.log('  server/dist/');
  console.log('  server/node_modules/');
  console.log('  server/.env');
  console.log('  server/package.json');
  console.log('  packages/shared/dist/');
  console.log('  packages/shared/package.json');
  console.log('  client/dist/');
} catch (e) {
  // Restore on failure
  try {
    pkg.main = './src/index.ts';
    writeFileSync(sharedPkgPath, JSON.stringify(pkg, null, 2) + '\n');
  } catch {}
  process.exit(1);
}
