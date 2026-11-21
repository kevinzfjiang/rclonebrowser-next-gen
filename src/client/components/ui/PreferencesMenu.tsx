import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Globe, Palette } from 'lucide-react';
import { LOCALE_OPTIONS, THEME_OPTIONS, useI18n } from '../../i18n';

interface PreferencesMenuProps {
  align?: 'left' | 'right';
}

export const PreferencesMenu: React.FC<PreferencesMenuProps> = ({ align = 'right' }) => {
  const { locale, setLocale, theme, setTheme, tr } = useI18n();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentTheme = THEME_OPTIONS.find((t) => t.id === theme) || THEME_OPTIONS[0];
  const currentLocale = LOCALE_OPTIONS.find((l) => l.code === locale) || LOCALE_OPTIONS[0];

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        title={tr('外观主题与界面语言', '外觀主題與介面語言', 'Appearance & Language')}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-950 border transition-colors ${
          open
            ? 'border-sky-500 text-sky-400'
            : 'border-slate-800 text-slate-200 hover:border-sky-500/50'
        }`}
      >
        <span
          className="w-3 h-3 rounded-full border border-slate-500/60 shrink-0"
          style={{
            background: `linear-gradient(135deg, ${currentTheme.swatchBg} 50%, ${currentTheme.swatchAccent} 50%)`,
          }}
        />
        <span className="hidden sm:inline font-mono text-[11px]">{currentLocale.shortLabel}</span>
        <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute top-full mt-1.5 w-60 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl p-3 space-y-3 z-50 animate-modal-in ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {/* Theme section */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-1">
              <Palette className="w-3 h-3 text-sky-400" />
              <span>{tr('界面主题风格', '介面主題風格', 'UI Theme')}</span>
            </div>
            <div className="space-y-1">
              {THEME_OPTIONS.map((opt) => {
                const active = opt.id === theme;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    onClick={() => setTheme(opt.id)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                      active
                        ? 'bg-sky-500/15 text-sky-600 dark:text-sky-300 font-semibold border border-sky-500/35'
                        : 'text-slate-300 hover:bg-slate-800/80 border border-transparent'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="w-4 h-4 rounded-full border border-slate-600/70 shrink-0 shadow-inner"
                        style={{
                          background: `linear-gradient(135deg, ${opt.swatchBg} 52%, ${opt.swatchAccent} 52%)`,
                        }}
                      />
                      <span>{tr(opt.zhCN, opt.zhTW, opt.en)}</span>
                    </span>
                    {active && <Check className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t border-slate-800" />

          {/* Language section */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-1">
              <Globe className="w-3 h-3 text-emerald-500 dark:text-emerald-400" />
              <span>{tr('界面语言', '介面語言', 'Language')}</span>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {LOCALE_OPTIONS.map((opt) => {
                const active = opt.code === locale;
                return (
                  <button
                    key={opt.code}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    onClick={() => setLocale(opt.code)}
                    className={`px-2 py-1.5 rounded-lg text-[11px] font-medium text-center transition-colors ${
                      active
                        ? 'bg-sky-600 text-white shadow-sm'
                        : 'bg-slate-950/70 text-slate-300 hover:bg-slate-800 border border-slate-800'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
