import { createContext, useContext, useMemo, useState, useEffect } from 'react';
import { translations } from './translations';
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  getInitialLanguage,
  normalizeLanguage,
} from './language';

const I18nContext = createContext(null);

function resolveKeyPath(target, keyPath) {
  return keyPath
    .split('.')
    .reduce((value, key) => (value && key in value ? value[key] : undefined), target);
}

function interpolate(template, values = {}) {
  if (typeof template !== 'string') return template;
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => {
    if (!(key in values)) return '';
    return String(values[key]);
  });
}

export function I18nProvider({ children }) {
  const [language, setLanguageState] = useState(() => getInitialLanguage());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // Ignore storage errors for environments where localStorage is unavailable.
    }
  }, [language]);

  const setLanguage = (nextLanguage) => {
    setLanguageState(normalizeLanguage(nextLanguage));
  };

  const value = useMemo(() => {
    const localeStrings = translations[language] || translations[DEFAULT_LANGUAGE];
    const fallbackStrings = translations[DEFAULT_LANGUAGE];

    const t = (keyPath, values) => {
      const localized = resolveKeyPath(localeStrings, keyPath);
      const fallback = resolveKeyPath(fallbackStrings, keyPath);
      const template =
        typeof localized === 'string'
          ? localized
          : typeof fallback === 'string'
            ? fallback
            : keyPath;
      return interpolate(template, values);
    };

    return {
      language,
      setLanguage,
      t,
    };
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider.');
  }
  return context;
}
