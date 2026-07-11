const ENV = import.meta.env ?? {};

export const BUILD_VERSION = ENV.VITE_ASSET_VERSION || '';
const BASE_URL = ENV.BASE_URL || '/';

export function publicAssetUrl(path, { versioned = true } = {}) {
  const cleanPath = path.replace(/^\/+/, '');
  const base = BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`;
  const url = `${base}${cleanPath}`;
  if (!versioned || !BUILD_VERSION) return url;
  return `${url}${url.includes('?') ? '&' : '?'}v=${encodeURIComponent(BUILD_VERSION)}`;
}
