import React, { createContext, useContext, useEffect, useState } from 'react';

export type LocaleCode = 'zh-CN' | 'zh-TW' | 'en';
export type ThemeId = 'slate' | 'light' | 'cyberpunk' | 'oled' | 'nord';

export const LOCALE_OPTIONS: { code: LocaleCode; label: string }[] = [
  { code: 'zh-CN', label: '简体中文' },
  { code: 'zh-TW', label: '繁體中文' },
  { code: 'en', label: 'English' },
];

export const THEME_OPTIONS: { id: ThemeId; zhCN: string; zhTW: string; en: string }[] = [
  { id: 'slate', zhCN: '经典深色 (Slate)', zhTW: '經典深色 (Slate)', en: 'Slate Dark' },
  { id: 'light', zhCN: '浅色明亮 (Light)', zhTW: '淺色明亮 (Light)', en: 'Light Mode' },
  { id: 'cyberpunk', zhCN: '赛博朋克 (Cyberpunk)', zhTW: '賽博朋克 (Cyberpunk)', en: 'Cyberpunk Neon' },
  { id: 'oled', zhCN: '纯粹深黑 (OLED Black)', zhTW: '純粹深黑 (OLED Black)', en: 'OLED Pure Black' },
  { id: 'nord', zhCN: '极地冰蓝 (Nord)', zhTW: '極地冰藍 (Nord)', en: 'Nordic Frost' },
];

interface AppPreferencesContextValue {
  locale: LocaleCode;
  setLocale: (loc: LocaleCode) => void;
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
  tr: (zhCN: string, zhTW: string, en: string) => string;
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

  const tr = (zhCN: string, zhTW: string, en: string): string => {
    if (locale === 'zh-TW') return zhTW;
    if (locale === 'en') return en;
    return zhCN;
  };

  return (
    <AppPreferencesContext.Provider
      value={{
        locale,
        setLocale: setLocaleState,
        theme,
        setTheme: setThemeState,
        tr,
      }}
    >
      {children}
    </AppPreferencesContext.Provider>
  );
};

export function useI18n() {
  return useContext(AppPreferencesContext);
}
