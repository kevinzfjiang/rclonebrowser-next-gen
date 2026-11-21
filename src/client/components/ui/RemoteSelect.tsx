import React from 'react';
import { RemoteInfo } from '../../../shared/types';
import { useI18n } from '../../i18n';
import { formatRemoteOptionLabel } from '../../utils/format';

interface RemoteSelectProps {
  remotes: RemoteInfo[];
  value: string;
  onChange: (remoteName: string) => void;
  className?: string;
  ariaLabel?: string;
}

export const RemoteSelect: React.FC<RemoteSelectProps> = ({
  remotes,
  value,
  onChange,
  className = '',
  ariaLabel,
}) => {
  const { tr } = useI18n();
  const hasCurrent = remotes.some((r) => r.name === value);

  return (
    <select
      value={value}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
      className={`bg-slate-950 border border-slate-700/80 hover:border-sky-500/60 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-100 focus:outline-none focus:border-sky-500 transition-colors cursor-pointer ${className}`}
    >
      {!hasCurrent && value && <option value={value}>{value}</option>}
      {remotes.map((r) => (
        <option key={r.name} value={r.name}>
          {formatRemoteOptionLabel(r, tr)}
        </option>
      ))}
    </select>
  );
};
