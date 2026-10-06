import type { ScrollMode, SubdivisionId, TimeSignature } from '../../music/types';
import { COMMON_TIME_SIGNATURES, formatTimeSignature, parseTimeSignature } from '../../music/timeSignature';
import { SCROLL_MODES, SUBDIVISIONS } from '../../music/instruments';
import { Select } from '../ui/primitives';

export function TimeSignatureSelect({ value, onChange }: { value: TimeSignature; onChange: (ts: TimeSignature) => void }) {
  const current = formatTimeSignature(value);
  const options = COMMON_TIME_SIGNATURES.map(formatTimeSignature);
  if (!options.includes(current)) options.push(current);
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      <span className="font-medium">Compasso</span>
      <Select
        value={current}
        aria-label="Fórmula de compasso"
        onChange={(e) => {
          const ts = parseTimeSignature(e.target.value);
          if (ts) onChange(ts);
        }}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </Select>
    </label>
  );
}

export function SubdivisionSelect({ value, onChange }: { value: SubdivisionId; onChange: (s: SubdivisionId) => void }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      <span className="font-medium">Subdivisão</span>
      <Select value={value} aria-label="Subdivisão da grade" onChange={(e) => onChange(e.target.value as SubdivisionId)}>
        {SUBDIVISIONS.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </Select>
    </label>
  );
}

export function ScrollModeSelect({ value, onChange }: { value: ScrollMode; onChange: (m: ScrollMode) => void }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      <span className="font-medium">Visualização</span>
      <Select value={value} aria-label="Modo de visualização da grade" onChange={(e) => onChange(e.target.value as ScrollMode)}>
        {SCROLL_MODES.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </Select>
    </label>
  );
}
