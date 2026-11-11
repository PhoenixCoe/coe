import type { Metadata } from 'next';
import Plans from '@/coe/Plans';
export const metadata: Metadata = { title: 'Plans', description: 'Free to start. Pro gets you more tokens, longer replies, Coe Deep and your own AI key.' };
export default function Page() { return <Plans />; }
