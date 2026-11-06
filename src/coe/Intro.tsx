'use client';
/** Once per visit: five colour panels cover the page, the name drops in, then the panels rise away one after another. Skipped for people who ask for less motion. */
import { useEffect, useState } from 'react';

const KEY = 'pmc:coe:intro-played';
function wanted(): boolean {
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    if (navigator.webdriver && !/[?&]intro\b/.test(location.search)) return false;     // automated checks go straight to the page
    if (sessionStorage.getItem(KEY) === '1') return false;
    sessionStorage.setItem(KEY, '1');
  } catch { return false; }
  return true;
}

export function Intro() {
  const [on, setOn] = useState(wanted);
  useEffect(() => { if (!on) return; const t = window.setTimeout(() => setOn(false), 2100); return () => window.clearTimeout(t); }, [on]);
  if (!on) return null;
  return (
    <div className="in" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => <i key={i} className={`in-p in-p${i}`} style={{ animationDelay: `${0.95 + i * 0.09}s` }} />)}
      <b className="in-word d">{'COE'.split('').map((l, i) => <span key={i} style={{ animationDelay: `${0.12 + i * 0.1}s` }}>{l}</span>)}</b>
    </div>
  );
}
