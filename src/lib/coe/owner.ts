/**
 * The connection settings are for the person who runs the site, not for visitors.
 * Open the site once with ?owner on the end to show them on this device. ?owner=off hides them again.
 */
const KEY = 'pmc:coe:owner';
export function ownerFromUrl() {
  try {
    const v = new URLSearchParams(location.search).get('owner');
    if (v === null) return;
    if (v === 'off' || v === '0') localStorage.removeItem(KEY); else localStorage.setItem(KEY, '1');
  } catch { /* storage blocked */ }
}
export const isOwner = (): boolean => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
