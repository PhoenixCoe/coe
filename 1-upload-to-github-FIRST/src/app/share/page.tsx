import type { Metadata } from 'next';
import SharePage from '@/coe/SharePage';
export const metadata: Metadata = { title: 'Shared chat', robots: { index: false, follow: false } };
export default function Page() { return <SharePage />; }
