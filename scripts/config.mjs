// Writes public/coe-config.json: the same public settings the site already carries (they are meant to be public),
// so Coe Mini can sign in by itself without anyone opening the site first.
import { mkdirSync, writeFileSync } from 'node:fs';
const clean = (v) => String(v ?? '').trim().replace(/\/+$/, '');
mkdirSync('public', { recursive: true });
writeFileSync('public/coe-config.json', JSON.stringify({ sb: clean(process.env.NEXT_PUBLIC_SUPABASE_URL), key: String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim(), server: clean(process.env.NEXT_PUBLIC_COE_SERVER) }));
