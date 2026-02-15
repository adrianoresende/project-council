export const DEFAULT_LANGUAGE = 'en';
export const LANGUAGE_STORAGE_KEY = 'llm-council-language';

export const AVAILABLE_LANGUAGES = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'es', label: 'Spanish', nativeLabel: 'Español' },
  { code: 'pt', label: 'Portuguese', nativeLabel: 'Português' },
];

const SUPPORTED_LANGUAGE_CODES = new Set(
  AVAILABLE_LANGUAGES.map((language) => language.code)
);

export function normalizeLanguage(value) {
  if (typeof value !== 'string') return DEFAULT_LANGUAGE;
  const normalized = value.trim().toLowerCase();
  if (SUPPORTED_LANGUAGE_CODES.has(normalized)) {
    return normalized;
  }
  return DEFAULT_LANGUAGE;
}

export function detectBrowserLanguage() {
  if (typeof navigator === 'undefined') return DEFAULT_LANGUAGE;
  const [browserLanguage] = String(navigator.language || '')
    .toLowerCase()
    .split('-');
  return normalizeLanguage(browserLanguage);
}

export function getStoredLanguage() {
  if (typeof window === 'undefined') return null;
  try {
    const storedValue = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (!storedValue) return null;
    return normalizeLanguage(storedValue);
  } catch {
    return null;
  }
}

export function getInitialLanguage() {
  return getStoredLanguage() || detectBrowserLanguage();
}
