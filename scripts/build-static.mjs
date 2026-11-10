// Builds Coe as plain static files into /out, ready for GitHub Pages or any static host.
import { rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
rmSync('out', { recursive: true, force: true });
spawnSync('node', ['scripts/fonts.mjs'], { stdio: 'inherit' });
spawnSync('node', ['scripts/config.mjs'], { stdio: 'inherit' });
const r = spawnSync('npx', ['next', 'build'], { stdio: 'inherit', shell: true, env: { ...process.env, STATIC_EXPORT: '1' } });
if (r.status !== 0) process.exitCode = r.status ?? 1; else console.log('\nStatic site written to ./out');
