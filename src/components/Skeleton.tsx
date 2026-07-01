// ============================================================
// Skeleton - 加载骨架屏
// ============================================================

import React from 'react';

export const SkeletonBlock: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`skeleton ${className}`} />
);

export const SkeletonCard: React.FC = () => (
  <div className="card space-y-3">
    <SkeletonBlock className="h-4 w-1/3" />
    <SkeletonBlock className="h-3 w-2/3" />
    <SkeletonBlock className="h-3 w-1/2" />
  </div>
);

export const SkeletonRing: React.FC = () => (
  <div className="flex flex-col items-center gap-2">
    <div className="w-[180px] h-[180px] rounded-full skeleton" />
    <SkeletonBlock className="h-4 w-24" />
  </div>
);

export const SkeletonBars: React.FC = () => (
  <div className="space-y-3">
    {[1, 2, 3].map((i) => (
      <div key={i} className="flex items-center gap-2">
        <SkeletonBlock className="h-4 w-4 rounded" />
        <div className="flex-1">
          <SkeletonBlock className="h-2.5 w-full rounded-full" />
        </div>
        <SkeletonBlock className="h-3 w-16" />
      </div>
    ))}
  </div>
);
