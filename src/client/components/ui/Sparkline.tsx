import React, { useId } from 'react';

interface SparklineProps {
  data: number[];
  height?: number;
  className?: string;
}

export const Sparkline: React.FC<SparklineProps> = ({
  data,
  height = 28,
  className = '',
}) => {
  const gradId = useId();
  const width = 140;
  const padY = 3;
  const usableH = height - padY * 2;
  const pointsData = data.length >= 2 ? data : [0, ...data, 0];
  const maxVal = Math.max(...pointsData, 1);

  const coords = pointsData.map((val, idx) => {
    const x = (idx / Math.max(1, pointsData.length - 1)) * width;
    const y = padY + usableH - (Math.max(0, val) / maxVal) * usableH;
    return [x, y] as const;
  });

  const linePath = coords
    .map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ');
  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={`w-full overflow-visible ${className}`}
      style={{ height }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.38" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path
        d={linePath}
        fill="none"
        stroke="#10b981"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};
