import type { Exercise } from '../../music/types';
import { barLengthInQuarters, beatUnitInQuarters } from '../../music/timeSignature';

const COLOR = {
  rightHand: 'var(--df-rh)',
  leftHand: 'var(--df-lh)',
  rightFoot: 'var(--df-rf)',
  leftFoot: 'var(--df-lf)',
} as const;

/** Prévia compacta (SVG) de um padrão de uma linha, posicionada a partir do modelo musical. */
export function MiniPattern({ exercise }: { exercise: Exercise }) {
  const barLen = barLengthInQuarters(exercise.tempoSignature);
  const total = barLen * exercise.totalBars;
  const unit = beatUnitInQuarters(exercise.tempoSignature);
  const W = 300;
  const H = 34;
  const pad = 10;
  const x = (abs: number) => pad + (abs / total) * (W - 2 * pad);
  const beats: number[] = [];
  for (let q = 0; q <= total + 1e-9; q += unit) beats.push(q);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-9 w-full" aria-hidden="true">
      {beats.map((b, i) => (
        <line key={i} x1={x(b)} x2={x(b)} y1={4} y2={H - 4} stroke="var(--df-grid-beat)" strokeWidth={Math.abs(b % barLen) < 1e-9 ? 2 : 1} />
      ))}
      {exercise.events.map((e) => {
        const abs = e.barIndex * barLen + e.beatPosition;
        return (
          <g key={e.id}>
            {e.ornament && e.ornament !== 'none' && <circle cx={x(abs) - 7} cy={H / 2} r={2.2} fill="var(--df-muted)" />}
            <circle
              cx={x(abs)}
              cy={H / 2}
              r={e.accent ? 5.5 : 4}
              fill={e.accent ? COLOR[e.limb] : 'transparent'}
              stroke={COLOR[e.limb]}
              strokeWidth={1.8}
            />
          </g>
        );
      })}
    </svg>
  );
}
