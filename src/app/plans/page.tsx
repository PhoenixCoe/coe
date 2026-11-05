import type { Metadata } from 'next';
import Plans from '@/coe/Plans';
export const metadata: Metadata = { title: 'Plans', description: 'Free to start, Pro for more messages, longer replies and the Coe Deep model.' };
export default function Page() { return <Plans />; }
