// Builds Coe as plain static files into /out, ready for GitHub Pages or any static host.
import { rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
rmSync('out', { recursive: true, force: true });
// Coe Mini is not part of the website (it comes from the browser stores). Earlier uploads left copies in public/; remove them so they are not published.
for (const f of ['coe-extension.zip', 'coe-extension-firefox.zip']) rmSync(`public/${f}`, { force: true });
spawnSync('node', ['scripts/fonts.mjs'], { stdio: 'inherit' });
spawnSync('node', ['scripts/config.mjs'], { stdio: 'inherit' });
const r = spawnSync('npx', ['next', 'build'], { stdio: 'inherit', shell: true, env: { ...process.env, STATIC_EXPORT: '1' } });
if (r.status !== 0) process.exitCode = r.status ?? 1; else console.log('\nStatic site written to ./out');
