import { BUILD_VERSION, publicAssetUrl } from './assetUrl.js';

export function startVersionWatcher() {
  if (!BUILD_VERSION) return;
  let checking = false;
  let reloading = false;

  const check = async () => {
    if (checking || reloading || document.hidden) return;
    checking = true;
    try {
      const response = await fetch(`${publicAssetUrl('version.json', { versioned: false })}?t=${Date.now()}`, {
        cache: 'no-store',
      });
      if (!response.ok) return;
      const info = await response.json();
      if (!info.version || info.version === BUILD_VERSION) return;
      reloading = true;
      const url = new URL(window.location.href);
      url.searchParams.set('garage-version', String(info.version).slice(0, 12));
      window.location.replace(url.toString());
    } catch {
      // A static host can briefly lag while its new branch build becomes visible.
    } finally {
      checking = false;
    }
  };

  window.setTimeout(check, 30_000);
  window.setInterval(check, 5 * 60_000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) check();
  });
}
