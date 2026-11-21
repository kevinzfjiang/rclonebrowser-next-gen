import React from 'react';
import { StorageQuota } from '../../../shared/types';
import { useI18n } from '../../i18n';
import { formatBytes } from '../../utils/format';

interface QuotaBarProps {
  quota: StorageQuota;
  compact?: boolean;
}

export const QuotaBar: React.FC<QuotaBarProps> = ({ quota, compact = false }) => {
  const { tr } = useI18n();
  if (!quota.supported || (quota.used === undefined && quota.free === undefined)) {
    return null;
  }

  const total =
    quota.total && quota.total > 0
      ? quota.total
      : quota.used !== undefined && quota.free !== undefined
        ? quota.used + quota.free
        : 0;
  const used = quota.used ?? (total > 0 && quota.free !== undefined ? Math.max(0, total - quota.free) : 0);
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;

  const barColor =
    pct >= 90 ? 'bg-rose-500' : pct >= 75 ? 'bg-amber-500' : 'bg-emerald-500';
  const pctColor =
    pct >= 90
      ? 'text-rose-600 dark:text-rose-400'
      : pct >= 75
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-emerald-600 dark:text-emerald-400';

  if (compact) {
    return (
      <div
        className="flex items-center gap-2 px-2 py-1 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-400 shrink-0"
        title={
          total > 0
            ? `${tr('已用', '已用', 'Used')} ${formatBytes(used, 1)} / ${formatBytes(total, 1)} (${pct}%)`
            : `${tr('已用', '已用', 'Used')} ${formatBytes(used, 1)}`
        }
      >
        {total > 0 && (
          <div className="w-12 h-1.5 rounded-full bg-slate-800 overflow-hidden shrink-0">
            <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
          </div>
        )}
        <span className="font-mono whitespace-nowrap">
          {formatBytes(used, 1)}
          {total > 0 ? <span className="text-slate-500">/{formatBytes(total, 1)}</span> : null}
        </span>
      </div>
    );
  }

  return (
    <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg px-3 py-2 space-y-1.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="text-slate-300 font-mono text-[11px]">
          {tr('已用', '已用', 'Used')}: <strong>{formatBytes(used, 1)}</strong>
          {total > 0 ? ` / ${formatBytes(total, 1)}` : ''}
        </span>
        {total > 0 ? (
          <span className={`font-mono font-semibold text-[11px] ${pctColor}`}>{pct}%</span>
        ) : quota.free !== undefined ? (
          <span className="text-emerald-600 dark:text-emerald-400 font-mono text-[11px]">
            {tr('可用', '可用', 'Free')}: {formatBytes(quota.free, 1)}
          </span>
        ) : null}
      </div>
      {total > 0 && (
        <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${barColor}`}
            style={{ width: `${Math.max(pct > 0 ? 2 : 0, pct)}%` }}
          />
        </div>
      )}
    </div>
  );
};
