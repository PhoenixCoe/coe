'use client';
/** Phones and iPads cannot add browser extensions, so Coe Mini is for computers only (Chrome, Edge and Firefox). Coe on the website does not offer it there. */
import { useEffect, useState } from 'react';

export function onPhoneOrTablet(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod|Android/i.test(ua)) return true;
  return /Macintosh/i.test(ua) && (navigator.maxTouchPoints || 0) > 0;   // an iPad asking for the desktop site (a real Mac has no touch screen)
}

/** True when Coe Mini can be used on this device. It starts true and is checked once the page is up, so the page does not change between server and browser. */
export function useMiniHere(): boolean {
  const [yes, setYes] = useState(true);
  useEffect(() => { setYes(!onPhoneOrTablet()); }, []);
  return yes;
}

