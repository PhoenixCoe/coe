import type { Metadata } from 'next';
import Plans from '@/coe/Plans';
export const metadata: Metadata = { title: 'Plans', description: 'Free to start, Pro for far more tokens, longer replies, the Coe Deep model and your own AI key.' };
export default function Page() { return <Plans />; }
