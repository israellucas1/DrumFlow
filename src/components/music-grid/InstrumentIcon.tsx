import type { InstrumentKind } from '../../music/instruments';

/** Pictogramas simples por tipo de peça (prato, tambor, bumbo, pedal). */
export function InstrumentIcon({ kind, className }: { kind: InstrumentKind; className?: string }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const };
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden="true" className={className}>
      {kind === 'cymbal' && (
        <g {...common}>
          <ellipse cx="12" cy="9" rx="9" ry="2.6" />
          <path d="M12 6.4v-1.6M12 11.6V20" />
        </g>
      )}
      {kind === 'drum' && (
        <g {...common}>
          <ellipse cx="12" cy="7.5" rx="8" ry="2.6" />
          <path d="M4 7.5v8c0 1.4 3.6 2.6 8 2.6s8-1.2 8-2.6v-8" />
        </g>
      )}
      {kind === 'kick' && (
        <g {...common}>
          <circle cx="12" cy="12" r="8" />
          <circle cx="12" cy="12" r="3" />
        </g>
      )}
      {kind === 'pedal' && (
        <g {...common}>
          <path d="M6 19h12M8 19l3-12h3l1 12" />
          <ellipse cx="12" cy="5" rx="6" ry="1.6" />
        </g>
      )}
    </svg>
  );
}
