import React from 'react';
import { AlertTriangle, RotateCcw, Inbox } from 'lucide-react';

/** Loading / error / empty states in the app's own visual language. Renders children only when data is ready. */
export function ApiState({ loading, error, data, empty, onRetry, children, rows = 3, label = 'Loading' }) {
  if (error && !data) return <ErrorBox error={error} onRetry={onRetry} />;
  if (loading && !data) return <Skeleton rows={rows} label={label} />;
  if (empty && (data == null || (Array.isArray(data) && data.length === 0))) return <Empty text={empty} />;
  return typeof children === 'function' ? children(data) : children;
}

export function Skeleton({ rows = 3, label = 'Loading' }) {
  return (
    <div role="status" aria-label={label} className="space-y-3 animate-pulse">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="h-16 rounded-lg bg-bg2 border border-line" style={{ opacity: 1 - i * 0.2 }} />)}
      <span className="sr-only">{label}…</span>
    </div>
  );
}

export function ErrorBox({ error, onRetry, compact }) {
  return (
    <div role="alert" className={`rounded-lg border border-critical/50 bg-critical/10 ${compact ? 'p-3' : 'p-5'} flex items-start gap-3`}>
      <AlertTriangle size={20} className="text-critical shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">Data unavailable</div>
        <div className="text-sm text-ink2 mt-0.5 break-words">{error?.message || String(error)}</div>
      </div>
      {onRetry && <button className="btn h-10 px-3 shrink-0" onClick={() => onRetry()}><RotateCcw size={16} />Retry</button>}
    </div>
  );
}

export function Empty({ text }) {
  return <div className="rounded-lg border border-line bg-bg2 p-6 text-ink2 flex items-center gap-3"><Inbox size={20} className="text-ink3" />{text}</div>;
}
