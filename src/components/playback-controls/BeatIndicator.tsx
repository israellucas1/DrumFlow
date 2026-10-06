import { useEffect, useRef } from 'react';
import type { Exercise } from '../../music/types';
import { useServices } from '../../app/AppState';

/**
 * Pontos de tempo do compasso + "Compasso N · tempo M", atualizados por
 * requestAnimationFrame a partir do relógio de áudio (sem re-render do React).
 */
export function BeatIndicator({ exercise }: { exercise: Exercise }) {
  const { transport } = useServices();
  const dotsRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const beats = exercise.tempoSignature.numerator;

  useEffect(() => {
    const dots = Array.from(dotsRef.current?.children ?? []) as HTMLElement[];
    const text = textRef.current;
    let last = '';
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const snap = transport.getSnapshot();
      const pos = snap.exerciseId === exercise.id ? transport.getPosition() : null;
      const live = pos && pos.state !== 'stopped';
      const key = live ? `${pos.state}|${pos.isCountIn}|${pos.barIndex}|${pos.beatInBar}|${pos.countInBeatsRemaining}` : 'idle';
      if (key === last) return;
      last = key;
      dots.forEach((d, i) => {
        const on = !!live && i === pos.beatInBar;
        d.dataset.on = String(on);
        d.dataset.count = String(!!pos?.isCountIn);
      });
      if (text) {
        if (!live) text.textContent = `${exercise.totalBars} compasso${exercise.totalBars > 1 ? 's' : ''}`;
        else if (pos.isCountIn) text.textContent = `Contagem · ${pos.countInBeatsRemaining}`;
        else text.textContent = `Compasso ${pos.barIndex + 1} · tempo ${pos.beatInBar + 1}`;
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [transport, exercise.id, exercise.totalBars, beats]);

  return (
    <div className="flex items-center gap-3" aria-hidden="true">
      <div ref={dotsRef} className="flex items-center gap-1.5">
        {Array.from({ length: beats }, (_, i) => (
          <span
            key={i}
            className={`block rounded-full bg-line transition-colors data-[on=true]:bg-primary data-[count=true]:data-[on=true]:bg-lh ${
              i === 0 ? 'h-3.5 w-3.5' : 'h-2.5 w-2.5'
            }`}
          />
        ))}
      </div>
      <span ref={textRef} className="tabular min-w-[150px] text-xs text-muted" />
    </div>
  );
}
