import type { CSSProperties } from 'react';

type SkeletonBlockProps = {
  width?: string | number;
  height?: string | number;
  className?: string;
};

export function SkeletonBlock({
  width = '100%',
  height = 14,
  className = '',
}: SkeletonBlockProps) {
  return (
    <span
      aria-hidden="true"
      className={`skeleton-block${className ? ` ${className}` : ''}`}
      style={{ width, height } as CSSProperties}
    />
  );
}

export function TableSkeleton({
  rows = 5,
  columns = 5,
  label = 'Carregando registros',
}: {
  rows?: number;
  columns?: number;
  label?: string;
}) {
  const gridColumns = `repeat(${columns}, minmax(0, 1fr))`;
  return (
    <div aria-label={label} className="skeleton-table" role="status">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="skeleton-table-row skeleton-table-header" style={{ gridTemplateColumns: gridColumns }}>
        {Array.from({ length: columns }, (_, index) => (
          <SkeletonBlock height={12} key={index} width={index === 0 ? '54%' : '62%'} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div aria-hidden="true" className="skeleton-table-row" key={row} style={{ gridTemplateColumns: gridColumns }}>
          {Array.from({ length: columns }, (_, column) => (
            <SkeletonBlock
              height={column === 0 ? 16 : 13}
              key={column}
              width={`${45 + ((row * 13 + column * 17) % 40)}%`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ListSkeleton({
  rows = 4,
  label = 'Carregando conteúdo',
}: {
  rows?: number;
  label?: string;
}) {
  return (
    <div aria-label={label} className="skeleton-list" role="status">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <div aria-hidden="true" className="skeleton-list-item" key={index}>
          <SkeletonBlock className="skeleton-avatar" height={38} width={38} />
          <span className="skeleton-list-copy">
            <SkeletonBlock height={14} width={`${45 + (index % 3) * 12}%`} />
            <SkeletonBlock height={11} width={`${34 + (index % 4) * 9}%`} />
          </span>
          <SkeletonBlock className="skeleton-list-action" height={28} width={64} />
        </div>
      ))}
    </div>
  );
}

export function KanbanSkeleton({
  columns = 5,
  label = 'Carregando quadro',
}: {
  columns?: number;
  label?: string;
}) {
  return (
    <div
      aria-label={label}
      className="skeleton-kanban"
      role="status"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(170px, 1fr))` }}
    >
      <span className="sr-only">{label}</span>
      {Array.from({ length: columns }, (_, column) => (
        <section aria-hidden="true" className="skeleton-kanban-column" key={column}>
          <SkeletonBlock height={14} width="48%" />
          {Array.from({ length: 3 }, (_, card) => (
            <div className="skeleton-kanban-card" key={card}>
              <SkeletonBlock height={13} width={`${52 + card * 8}%`} />
              <SkeletonBlock height={11} width="78%" />
              <SkeletonBlock height={11} width="44%" />
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

export function InlineLoading({ label }: { label: string }) {
  return (
    <div aria-label={label} className="loading-state" role="status">
      <span aria-hidden="true" className="loading-dot" />
      <span>{label}</span>
    </div>
  );
}
