/**
 * Theme-safe semantic style tokens that maintain WCAG AA+ contrast in both Light Mode
 * (where `html` does NOT have `.dark`) and all Dark Themes (`slate`, `oled`, `nord`, `cyberpunk`).
 */

export const BADGE_TONES = {
  sky: 'bg-sky-500/15 text-sky-700 border-sky-500/30 dark:text-sky-300',
  emerald:
    'bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:text-emerald-300',
  amber:
    'bg-amber-500/15 text-amber-800 border-amber-500/35 dark:text-amber-300',
  rose: 'bg-rose-500/15 text-rose-700 border-rose-500/35 dark:text-rose-300',
  indigo:
    'bg-indigo-500/15 text-indigo-700 border-indigo-500/35 dark:text-indigo-300',
  purple:
    'bg-purple-500/15 text-purple-700 border-purple-500/35 dark:text-purple-300',
  cyan: 'bg-cyan-500/15 text-cyan-800 border-cyan-500/35 dark:text-cyan-300',
  slate: 'bg-slate-800 text-slate-300 border-slate-700',
} as const;

export const ALERT_TONES = {
  error:
    'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/35 dark:border-rose-800/60 dark:text-rose-200',
  warning:
    'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/35 dark:border-amber-700/50 dark:text-amber-200',
  info: 'bg-sky-50 border-sky-200 text-sky-900 dark:bg-sky-950/35 dark:border-sky-800/50 dark:text-sky-200',
  success:
    'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/30 dark:border-emerald-800/50 dark:text-emerald-200',
  indigo:
    'bg-indigo-50 border-indigo-200 text-indigo-900 dark:bg-indigo-950/30 dark:border-indigo-500/35 dark:text-indigo-200',
} as const;

export const TINT_BUTTON_TONES = {
  sky: 'bg-sky-500/15 hover:bg-sky-500/25 text-sky-700 dark:text-sky-300 border border-sky-500/35',
  emerald:
    'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 border border-emerald-500/35',
  amber:
    'bg-amber-500/15 hover:bg-amber-500/25 text-amber-800 dark:text-amber-300 border border-amber-500/40',
  rose: 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-700 dark:text-rose-300 border border-rose-500/35',
  indigo:
    'bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-700 dark:text-indigo-300 border border-indigo-500/35',
} as const;

export const TEXT_TONES = {
  emerald: 'text-emerald-600 dark:text-emerald-400',
  amber: 'text-amber-600 dark:text-amber-400',
  rose: 'text-rose-600 dark:text-rose-400',
  indigo: 'text-indigo-600 dark:text-indigo-400',
  purple: 'text-purple-600 dark:text-purple-400',
  sky: 'text-sky-600 dark:text-sky-400',
} as const;
