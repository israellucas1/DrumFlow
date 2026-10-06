import { LIMBS } from '../../music/instruments';
import type { Limb } from '../../music/types';

const LIMB_VAR: Record<Limb, string> = {
  rightHand: 'var(--df-rh)',
  leftHand: 'var(--df-lh)',
  rightFoot: 'var(--df-rf)',
  leftFoot: 'var(--df-lf)',
};

/** Legenda permanente: cor + forma + letra (não depende só da cor). */
export function GridLegend({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted ${className}`} aria-label="Legenda da grade">
      {LIMBS.map((l) => (
        <span key={l.id} className="inline-flex items-center gap-1.5">
          <span className="limb-swatch" data-foot={l.isFoot} style={{ ['--c' as string]: LIMB_VAR[l.id] }} aria-hidden="true">
            {l.isFoot ? `P${l.letter}` : l.letter}
          </span>
          {l.label} <span className="text-muted/70">({l.colorName})</span>
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="limb-swatch" style={{ ['--c' as string]: 'var(--df-muted)', background: 'var(--df-muted)' }} aria-hidden="true" />
        Preenchida com &gt; = acento
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full border border-muted" /> Bolinha à esquerda = apojatura (flam/drag)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="limb-swatch" style={{ ['--c' as string]: 'var(--df-muted)', borderStyle: 'dashed' }} aria-hidden="true" />
        Tracejada = fora da grade
      </span>
      <span>Círculo = mão · Quadrado = pé</span>
    </div>
  );
}
