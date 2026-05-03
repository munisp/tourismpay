/**
 * useLocale Hook — React hook for i18n locale management.
 */
import { useState, useCallback } from "react";
import { type Locale, setLocale as setI18nLocale, getLocale, t, SUPPORTED_LOCALES } from "../i18n";

export function useLocale() {
  const [locale, _setLocale] = useState<Locale>(getLocale());

  const changeLocale = useCallback((newLocale: Locale) => {
    setI18nLocale(newLocale);
    _setLocale(newLocale);
  }, []);

  return { locale, setLocale: changeLocale, t, SUPPORTED_LOCALES };
}
