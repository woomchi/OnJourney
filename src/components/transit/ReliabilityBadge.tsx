import React from 'react';
import { clsx } from 'clsx';

export interface ReliabilityBadgeProps {
  reliability: number;
  className?: string;
}

export const ReliabilityBadge: React.FC<ReliabilityBadgeProps> = ({
  reliability,
  className,
}) => {
  let badgeColor = 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
  let dotColor = 'bg-emerald-500';
  let label = '실시간';

  if (reliability >= 0.85) {
    badgeColor = 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
    dotColor = 'bg-emerald-500';
    label = '높음 (실시간)';
  } else if (reliability >= 0.6) {
    badgeColor = 'bg-amber-500/10 text-amber-600 border-amber-500/20';
    dotColor = 'bg-amber-500';
    label = '보통';
  } else {
    badgeColor = 'bg-rose-500/10 text-rose-600 border-rose-500/20';
    dotColor = 'bg-rose-500';
    label = '캐시/오래됨';
  }

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full border',
        badgeColor,
        className
      )}
    >
      <span className={clsx('w-1.5 h-1.5 rounded-full animate-pulse', dotColor)} />
      {label}
    </span>
  );
};
