import React from 'react';

export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`animate-pulse bg-gray-200 dark:bg-slate-800 rounded-lg ${className}`} />
);

export const CardSkeleton = () => (
  <div className="rounded-2xl border border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
    <div className="flex justify-between items-start">
      <div className="space-y-3 flex-1">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-3 w-40" />
      </div>
      <Skeleton className="h-12 w-12 rounded-full" />
    </div>
  </div>
);

export const ListSkeleton = ({ rows = 5 }: { rows?: number }) => (
  <div className="space-y-4 animate-pulse">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 dark:border-slate-800 last:border-none">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
    ))}
  </div>
);

export const TableSkeleton = ({ cols = 5, rows = 5 }: { cols?: number; rows?: number }) => (
  <div className="w-full overflow-hidden rounded-2xl border border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm animate-pulse">
    <table className="w-full border-collapse">
      <thead>
        <tr className="border-b border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-900/50">
          {Array.from({ length: cols }).map((_, i) => (
            <th key={i} className="px-6 py-4 text-left">
              <Skeleton className="h-4 w-20 bg-gray-200 dark:bg-slate-800" />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }).map((_, r) => (
          <tr key={r} className="border-b border-gray-50 dark:border-slate-800 last:border-0 hover:bg-gray-50/50 dark:hover:bg-slate-800/50">
            {Array.from({ length: cols }).map((_, c) => (
              <td key={c} className="px-6 py-4">
                {c === 1 ? (
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-full bg-gray-200 dark:bg-slate-800 shrink-0" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-32 bg-gray-200 dark:bg-slate-800" />
                      <Skeleton className="h-3 w-24 bg-gray-200 dark:bg-slate-800" />
                    </div>
                  </div>
                ) : (
                  <Skeleton className={`h-4 w-16 bg-gray-200 dark:bg-slate-800 ${c === 0 ? 'w-10' : ''}`} />
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const ClienteProfileSkeleton = () => (
  <div className="space-y-6 pb-12 animate-pulse">
    {/* Header Card Skeleton */}
    <div className="rounded-2xl border border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
      <div className="flex flex-col md:flex-row gap-6 items-start">
        <Skeleton className="h-24 w-24 rounded-full bg-gray-200 dark:bg-slate-800 shrink-0" />
        <div className="flex-1 space-y-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-64 bg-gray-200 dark:bg-slate-800" />
            <Skeleton className="h-6 w-20 rounded-full bg-gray-200 dark:bg-slate-800" />
          </div>
          <div className="flex flex-wrap gap-4">
            <Skeleton className="h-4 w-32 bg-gray-200 dark:bg-slate-800" />
            <Skeleton className="h-4 w-40 bg-gray-200 dark:bg-slate-800" />
            <Skeleton className="h-4 w-36 bg-gray-200 dark:bg-slate-800" />
          </div>
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-28 bg-gray-200 dark:bg-slate-800" />
          <Skeleton className="h-9 w-28 bg-gray-200 dark:bg-slate-800" />
          <Skeleton className="h-9 w-28 bg-gray-200 dark:bg-slate-800" />
        </div>
      </div>
    </div>

    {/* Tabs Skeleton */}
    <div className="border-b border-gray-200 dark:border-slate-800 px-4">
      <div className="flex gap-4 py-2">
        <Skeleton className="h-8 w-24 bg-gray-200 dark:bg-slate-800" />
        <Skeleton className="h-8 w-24 bg-gray-200 dark:bg-slate-800" />
        <Skeleton className="h-8 w-24 bg-gray-200 dark:bg-slate-800" />
        <Skeleton className="h-8 w-24 bg-gray-200 dark:bg-slate-800" />
      </div>
    </div>

    {/* Content Area Skeleton */}
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <div className="rounded-2xl border border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-4">
          <Skeleton className="h-6 w-48 bg-gray-200 dark:bg-slate-800" />
          <Skeleton className="h-4 w-full bg-gray-200 dark:bg-slate-800" />
          <Skeleton className="h-4 w-full bg-gray-200 dark:bg-slate-800" />
          <Skeleton className="h-4 w-2/3 bg-gray-200 dark:bg-slate-800" />
        </div>
      </div>
      <div className="space-y-6">
        <div className="rounded-2xl border border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-4">
          <Skeleton className="h-6 w-32 bg-gray-200 dark:bg-slate-800" />
          <Skeleton className="h-4 w-full bg-gray-200 dark:bg-slate-800" />
          <Skeleton className="h-4 w-full bg-gray-200 dark:bg-slate-800" />
        </div>
      </div>
    </div>
  </div>
);
