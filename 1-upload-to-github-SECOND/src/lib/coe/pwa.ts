/** Install Coe as an app, and let it open offline. */
interface InstallEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }
let deferred: InstallEvent | null = null;
let started = false;
const tell = () => { try { window.dispatchEvent(new CustomEvent('pmc:coe-install-changed')); } catch { /* no window */ } };

export function startPwa() {
  if (started || typeof window === 'undefined') return; started = true;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e as InstallEvent; tell(); });
  window.addEventListener('appinstalled', () => { deferred = null; tell(); });
  // The helper that keeps the app opening offline. Skipped when a test browser is driving the page, so tests never see old files.
  if ('serviceWorker' in navigator && !navigator.webdriver && window.location.protocol === 'https:') {
    window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => { /* the app works without it */ }); });
  }
}
export const isInstalled = () => { try { return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true; } catch { return false; } };
export const canInstallNow = () => !!deferred;
const isApple = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Asks the browser to install Coe. Returns a sentence to show when the person has to do the last step themselves. */
export async function installCoe(): Promise<string> {
  if (isInstalled()) return 'Coe is already installed on this device.';
  if (deferred) {
    const d = deferred; deferred = null; tell();
    try { await d.prompt(); const { outcome } = await d.userChoice; return outcome === 'accepted' ? 'Installing Coe. Look for it with your other apps.' : 'No problem. You can install it any time from the command box.'; } catch { return 'The install box could not be opened. Try your browser\'s menu.'; }
  }
  if (isApple()) return 'On iPhone or iPad: press the Share button, then Add to Home Screen.';
  return 'Open your browser\'s menu and choose Install Coe (or Add to Home screen).';
}
