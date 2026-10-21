import { getLocales } from 'expo-localization';
import { useCallback, useMemo } from 'react';
import { useStore } from 'zustand';
import { useServices } from '@/services/context';
import { resolveLocale, translate, type Locale, type Params, type TKey } from './translate';

/** The interface language: the listener's choice in settings, else the first supported device language. */
export function useLocale(): Locale {
  const chosen = useStore(useServices().settings, (s) => s.locale);
  return useMemo(
    () => (chosen === 'system' ? resolveLocale(getLocales().map((l) => l.languageTag)) : chosen),
    [chosen],
  );
}

/** `t(key, params)` bound to the current interface language. */
export function useT(): (key: TKey, params?: Params) => string {
  const locale = useLocale();
  return useCallback((key, params) => translate(locale, key, params), [locale]);
}
