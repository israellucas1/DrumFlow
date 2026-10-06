import type { ReactNode } from 'react';
import type { Rating, StepStatus } from '../../study/types';
import { cx } from '../ui/primitives';

export function ProgressBar({ value, label, className }: { value: number; label: string; className?: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className={cx('h-2 w-full overflow-hidden rounded-full bg-panel-2', className)} role="progressbar" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-lh transition-[width] duration-300" style={{ width: `${pct}%` }} />
    </div>
  );
}

export const STEP_STATUS: Record<StepStatus, { label: string; tone: string }> = {
  pending: { label: 'A fazer', tone: 'text-muted' },
  active: { label: 'Agora', tone: 'text-lh' },
  done: { label: 'Concluído', tone: 'text-fg' },
  incomplete: { label: 'Incompleto', tone: 'text-rh' },
  skipped: { label: 'Pulado', tone: 'text-rh' },
};

export const RATING_SHORT: Record<Rating, string> = { good: 'Limpo', ok: 'Ok', hard: 'Difícil' };

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="tabular mt-1 text-xl font-semibold">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

export function clock(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Linha de evolução simples (SVG) para listas curtas de números. */
export function Sparkline({ values, max, label }: { values: number[]; max?: number; label: string }) {
  if (values.length < 2) return <span className="text-xs text-muted">—</span>;
  const W = 120;
  const H = 28;
  const hi = max ?? Math.max(...values);
  const lo = Math.min(...values, hi - 1);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * (W - 4) + 2},${H - 2 - ((v - lo) / (hi - lo || 1)) * (H - 4)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-7 w-28" role="img" aria-label={label}>
      <polyline points={pts} fill="none" stroke="var(--df-lh)" strokeWidth={2} strokeLinejoin="round" />
    </svg>
  );
}
