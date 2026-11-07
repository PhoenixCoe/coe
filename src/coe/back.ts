'use client';
/** Lets the phone's Back button (and the browser's) close the window that is on top, one at a time. */
import { useEffect, useRef } from 'react';

interface Layer { close: () => void; popped: boolean }
const stack: Layer[] = [];
let ignore = 0, hooked = false;
function onPop() {
  if (ignore > 0) { ignore--; return; }
  const top = stack[stack.length - 1];
  if (top) { top.popped = true; top.close(); }
}
export function useBackClose(onClose: () => void) {
  const ref = useRef(onClose); ref.current = onClose;
  useEffect(() => {
    const layer: Layer = { close: () => ref.current(), popped: false };
    stack.push(layer);
    try { window.history.pushState({ coeLayer: 1 }, ''); } catch { /* no history */ }
    if (!hooked) { hooked = true; window.addEventListener('popstate', onPop); }
    return () => {
      const i = stack.indexOf(layer); if (i >= 0) stack.splice(i, 1);
      if (!layer.popped) { try { ignore++; window.history.back(); } catch { ignore--; } }
    };
  }, []);
}
