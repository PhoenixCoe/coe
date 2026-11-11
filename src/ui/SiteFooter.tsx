'use client';
import Link from 'next/link';
import { CoeStar } from './Mark';
import { PmcMark } from './PmcMark';
import { COE_VERSION } from '@/lib/coe/changelog';

/** The small print: who owns what, where to read more, and the version. One footer for every page and panel, so it says the same thing everywhere. */
export function SiteFooter({ className = '' }: { className?: string }) {
  const year = new Date().getFullYear();
  return (
    <footer className={`sf${className ? ' ' + className : ''}`}>
      <div className="sf-brands">
        <span className="sf-b"><CoeStar size={22} live={false} /><span className="tx" suppressHydrationWarning>© {year} Coe</span></span>
        <span className="sf-b"><PmcMark height={20} /><span className="tx" suppressHydrationWarning>© {year} PMC Studios</span></span>
      </div>
      <p className="tx sf-fine">Coe and Coe Mini are made by PMC Studios. All rights reserved. Coe can be wrong, so check anything important.</p>
      <nav className="d sf-nav" aria-label="About Coe">
        <Link href="/about/">About and credits</Link>
        <Link href="/privacy/">Privacy</Link>
        <Link href="/plans/">Plans</Link>
        <a href="https://pmcstudios.uk">PMC Studios</a>
        <a href="mailto:contact@pmcstudios.uk">Contact</a>
        <span className="sf-v">Version {COE_VERSION}</span>
      </nav>
    </footer>
  );
}
