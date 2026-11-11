'use client';
import Link from 'next/link';
import { PmcMark } from './PmcMark';
import { COE_VERSION } from '@/lib/coe/changelog';

/** The small print, kept short: who made it, three places to go, and the version. One footer for every page and panel, so it says the same thing everywhere. */
export function SiteFooter({ className = '' }: { className?: string }) {
  const year = new Date().getFullYear();
  return (
    <footer className={`sf${className ? ' ' + className : ''}`}>
      <a className="sf-by" href="https://pmcstudios.uk"><PmcMark height={20} /><span className="tx" suppressHydrationWarning>Made by PMC Studios · © {year}</span></a>
      <nav className="d sf-nav" aria-label="About Coe">
        <Link href="/about/">About</Link>
        <Link href="/privacy/">Privacy</Link>
        <a href="mailto:contact@pmcstudios.uk">Contact</a>
        <span className="sf-v">Version {COE_VERSION}</span>
      </nav>
    </footer>
  );
}
