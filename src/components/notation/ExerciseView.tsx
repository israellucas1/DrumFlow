import { LayoutGrid, Music4, Rows2 } from 'lucide-react';
import { useSettings } from '../../app/AppState';
import type { DisplayMode } from '../../music/types';
import { MusicGrid, type MusicGridProps } from '../music-grid/MusicGrid';
import { GridLegend } from '../music-grid/GridLegend';
import { StaffKey, StaffView } from './StaffView';
import { cx } from '../ui/primitives';

const MODES: { id: DisplayMode; label: string; icon: typeof LayoutGrid }[] = [
  { id: 'grid', label: 'Grade', icon: LayoutGrid },
  { id: 'staff', label: 'Partitura', icon: Music4 },
  { id: 'both', label: 'Ambos', icon: Rows2 },
];

/**
 * Exibe o exercício como grade, partitura ou ambos (preferência salva).
 * `gridRequired`: a grade aparece sempre (ex.: no editor, onde se edita por ela).
 */
export function ExerciseView({ gridRequired = false, ...grid }: MusicGridProps & { gridRequired?: boolean }) {
  const { settings, update } = useSettings();
  const mode = settings.view.display;
  const showStaff = mode !== 'grid';
  const showGrid = gridRequired || mode !== 'staff';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Forma de exibição" className="inline-flex rounded-lg border border-line bg-panel-2 p-0.5">
          {MODES.map((m) => (
            <button
              key={m.id}
              role="radio"
              aria-checked={mode === m.id}
              onClick={() => update((s) => ({ ...s, view: { ...s.view, display: m.id } }))}
              className={cx(
                'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors',
                mode === m.id ? 'bg-primary text-primary-fg' : 'text-muted hover:text-fg',
              )}
            >
              <m.icon size={14} aria-hidden="true" />
              {m.label}
            </button>
          ))}
        </div>
        {gridRequired && mode === 'staff' && <span className="text-xs text-muted">A grade continua visível para editar as notas.</span>}
      </div>
      {showStaff && <StaffView exercise={grid.exercise} />}
      {showGrid && <MusicGrid {...grid} />}
      {showGrid && <GridLegend />}
      {showStaff && <StaffKey />}
    </div>
  );
}
