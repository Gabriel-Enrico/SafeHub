export type AppTheme = 'light' | 'dark';

const storageKey = 'safehub-theme';

export function getSavedTheme(): AppTheme {
  return window.localStorage.getItem(storageKey) === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme: AppTheme) {
  document.documentElement.dataset.theme = theme;
  window.localStorage.setItem(storageKey, theme);

  const favicon = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
  if (favicon) {
    favicon.href = theme === 'dark' ? '/favicon-dark.png?v=2' : '/favicon-light.png?v=2';
    favicon.type = 'image/png';
  }
}
