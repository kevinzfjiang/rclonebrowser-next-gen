import React from 'react';
import { AlertTriangle, HelpCircle, Loader2, Trash2, X } from 'lucide-react';
import { useI18n } from '../../i18n';
import { ALERT_TONES, TINT_BUTTON_TONES } from '../../utils/themeStyles';
import { Modal } from './Modal';

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  details?: string[];
  tone?: 'danger' | 'warning' | 'info';
  confirmLabel?: string;
  cancelLabel?: string;
  secondaryLabel?: string;
  onSecondary?: () => void;
  onConfirm: () => void;
  onClose: () => void;
  loading?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  details,
  tone = 'warning',
  confirmLabel,
  cancelLabel,
  secondaryLabel,
  onSecondary,
  onConfirm,
  onClose,
  loading = false,
}) => {
  const { tr } = useI18n();

  const iconBox =
    tone === 'danger'
      ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
      : tone === 'warning'
        ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
        : 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30';

  const confirmBtn =
    tone === 'danger'
      ? 'bg-rose-600 hover:bg-rose-500 text-white'
      : tone === 'warning'
        ? 'bg-amber-600 hover:bg-amber-500 text-white'
        : 'bg-sky-600 hover:bg-sky-500 text-white';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      closeDisabled={loading}
      maxWidthClass="max-w-md"
      zIndexClass="z-[60]"
      ariaLabel={title}
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/60">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`p-2 rounded-xl shrink-0 ${iconBox}`}>
            {tone === 'danger' ? (
              <Trash2 className="w-4 h-4" />
            ) : tone === 'warning' ? (
              <AlertTriangle className="w-4 h-4" />
            ) : (
              <HelpCircle className="w-4 h-4" />
            )}
          </div>
          <h3 className="text-sm font-bold text-slate-100 truncate">{title}</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          aria-label={tr('关闭', '關閉', 'Close')}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 disabled:opacity-40"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-5 space-y-3 text-xs text-slate-300 leading-relaxed overflow-y-auto">
        <div>{message}</div>

        {details && details.length > 0 && (
          <div
            className={`rounded-xl border p-2.5 max-h-36 overflow-y-auto font-mono text-[11px] space-y-1 ${
              tone === 'danger'
                ? ALERT_TONES.error
                : tone === 'warning'
                  ? ALERT_TONES.warning
                  : ALERT_TONES.info
            }`}
          >
            {details.slice(0, 12).map((item, idx) => (
              <div key={idx} className="truncate">
                {item}
              </div>
            ))}
            {details.length > 12 && (
              <div className="opacity-75 pt-0.5">
                {tr(
                  `... 以及另外 ${details.length - 12} 个项目`,
                  `... 以及另外 ${details.length - 12} 個項目`,
                  `... and ${details.length - 12} more item(s)`
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-800 bg-slate-950/60">
        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors disabled:opacity-50"
        >
          {cancelLabel || tr('取消', '取消', 'Cancel')}
        </button>

        {secondaryLabel && onSecondary && (
          <button
            type="button"
            onClick={onSecondary}
            disabled={loading}
            className={`px-3.5 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${TINT_BUTTON_TONES.indigo}`}
          >
            {secondaryLabel}
          </button>
        )}

        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors shadow disabled:opacity-50 ${confirmBtn}`}
        >
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          <span>{confirmLabel || tr('确认', '確認', 'Confirm')}</span>
        </button>
      </div>
    </Modal>
  );
};
