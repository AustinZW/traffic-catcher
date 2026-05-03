// Build script — handles the shared package main swap so tsc can resolve imports
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const sharedPkgPath = join(root, 'packages', 'shared', 'package.json');

const pkg = JSON.parse(readFileSync(sharedPkgPath, 'utf-8'));
const originalMain = pkg.main;

function run(cmd, cwd = root) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit' });
}

try {
  // 1. Build shared package (generates dist/ with .js + .d.ts)
  run('npx tsc', join(root, 'packages', 'shared'));

  // 2. Point main to compiled JS for server tsc build
  pkg.main = './dist/index.js';
  writeFileSync(sharedPkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log('  [shared package.json main → ./dist/index.js]');

  // 3. Build server
  run('npx prisma generate', join(root, 'server'));
  run('npx tsc', join(root, 'server'));

  // 4. Restore shared main for dev
  pkg.main = originalMain;
  writeFileSync(sharedPkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log('  [shared package.json main restored]');

  // 5. Build client
  run('npx vite build', join(root, 'client'));

  console.log('\n✅ Build complete.');
  console.log('  server/dist/  — Node.js backend');
  console.log('  client/dist/  — static frontend');
} catch (e) {
  // Restore on failure
  try {
    pkg.main = originalMain;
    writeFileSync(sharedPkgPath, JSON.stringify(pkg, null, 2) + '\n');
    console.log('  [shared package.json main restored after error]');
  } catch {}
  process.exit(1);
}
