export const DEFAULT_UPDATE_BASE_URL = 'https://static.aionui.com/releases';
export const UPDATE_BASE_URL_ENV = 'AIONUI_UPDATE_BASE_URL';
export const UPDATE_BASE_URL_CONFIG_KEY = 'update.baseUrl' as const;

export const normalizeUpdateBaseUrl = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      return null;
    }
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
};
