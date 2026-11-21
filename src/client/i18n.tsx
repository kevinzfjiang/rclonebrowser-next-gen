import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type LocaleCode = 'zh-CN' | 'zh-TW' | 'en';
export type ThemeId = 'slate' | 'light' | 'cyberpunk' | 'oled' | 'nord';

export const LOCALE_OPTIONS: { code: LocaleCode; label: string; shortLabel: string }[] = [
  { code: 'zh-CN', label: '简体中文', shortLabel: '简' },
  { code: 'zh-TW', label: '繁體中文', shortLabel: '繁' },
  { code: 'en', label: 'English', shortLabel: 'EN' },
];

export const THEME_OPTIONS: {
  id: ThemeId;
  zhCN: string;
  zhTW: string;
  en: string;
  swatchBg: string;
  swatchAccent: string;
}[] = [
  {
    id: 'slate',
    zhCN: '经典深色',
    zhTW: '經典深色',
    en: 'Slate Dark',
    swatchBg: '#0f172a',
    swatchAccent: '#0ea5e9',
  },
  {
    id: 'light',
    zhCN: '浅色明亮',
    zhTW: '淺色明亮',
    en: 'Light',
    swatchBg: '#f1f5f9',
    swatchAccent: '#0284c7',
  },
  {
    id: 'oled',
    zhCN: '纯粹深黑',
    zhTW: '純粹深黑',
    en: 'OLED Black',
    swatchBg: '#000000',
    swatchAccent: '#38bdf8',
  },
  {
    id: 'nord',
    zhCN: '极地冰蓝',
    zhTW: '極地冰藍',
    en: 'Nordic',
    swatchBg: '#2e3440',
    swatchAccent: '#88c0d0',
  },
  {
    id: 'cyberpunk',
    zhCN: '赛博朋克',
    zhTW: '賽博朋克',
    en: 'Cyberpunk',
    swatchBg: '#16062c',
    swatchAccent: '#f72585',
  },
];

export type TranslateFn = (zhCN: string, zhTW: string, en: string) => string;

interface AppPreferencesContextValue {
  locale: LocaleCode;
  setLocale: (loc: LocaleCode) => void;
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
  tr: TranslateFn;
}

const LOCALE_STORAGE_KEY = 'rclonebrowser_next_locale';
const THEME_STORAGE_KEY = 'rclonebrowser_next_theme';

const AppPreferencesContext = createContext<AppPreferencesContextValue>({
  locale: 'zh-CN',
  setLocale: () => {},
  theme: 'slate',
  setTheme: () => {},
  tr: (zhCN) => zhCN,
});

export const AppPreferencesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<LocaleCode>(() => {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY) as LocaleCode | null;
    if (saved && ['zh-CN', 'zh-TW', 'en'].includes(saved)) return saved;
    const nav = navigator.language.toLowerCase();
    if (nav.includes('tw') || nav.includes('hk') || nav.includes('hant')) return 'zh-TW';
    if (nav.startsWith('en')) return 'en';
    return 'zh-CN';
  });

  const [theme, setThemeState] = useState<ThemeId>(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY) as ThemeId | null;
    if (saved && ['slate', 'light', 'cyberpunk', 'oled', 'nord'].includes(saved)) return saved;
    return 'slate';
  });

  useEffect(() => {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
    }
  }, [theme]);

  const tr = useCallback<TranslateFn>(
    (zhCN: string, zhTW: string, en: string): string => {
      if (locale === 'zh-TW') return zhTW;
      if (locale === 'en') return en;
      return zhCN;
    },
    [locale]
  );

  const value = useMemo(
    () => ({
      locale,
      setLocale: setLocaleState,
      theme,
      setTheme: setThemeState,
      tr,
    }),
    [locale, theme, tr]
  );

  return (
    <AppPreferencesContext.Provider value={value}>
      {children}
    </AppPreferencesContext.Provider>
  );
};

export function useI18n() {
  return useContext(AppPreferencesContext);
}
