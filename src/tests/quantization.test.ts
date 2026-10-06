import { describe, expect, it } from 'vitest';
import { countOffGridEvents, quantizeEvents } from '../music/quantization';
import type { MusicEvent } from '../music/types';

const ev = (id: string, barIndex: number, beatPosition: number, velocity = 90, instrument: MusicEvent['instrument'] = 'snare'): MusicEvent => ({
  id,
  barIndex,
  beatPosition,
  instrument,
  limb: 'rightHand',
  velocity,
  accent: false,
});
const ts = { numerator: 4, denominator: 4 };

describe('quantização', () => {
  it('arredonda para a subdivisão mais próxima e mantém ids', () => {
    const r = quantizeEvents([ev('a', 0, 1 / 3), ev('b', 0, 0.75)], ts, 'sixteenth', 1);
    expect(r.events.find((e) => e.id === 'a')!.beatPosition).toBe(0.25);
    expect(r.events.find((e) => e.id === 'b')!.beatPosition).toBe(0.75);
    expect(r.moved).toBe(1);
  });

  it('passa para o compasso seguinte quando necessário', () => {
    const r = quantizeEvents([ev('a', 0, 3.9)], ts, 'eighth', 2);
    expect(r.events[0]).toMatchObject({ barIndex: 1, beatPosition: 0 });
  });

  it('no último compasso arredonda para baixo', () => {
    const r = quantizeEvents([ev('a', 0, 3.9)], ts, 'eighth', 1);
    expect(r.events[0]).toMatchObject({ barIndex: 0, beatPosition: 3.5 });
  });

  it('mescla colisões do mesmo instrumento mantendo a mais forte', () => {
    const r = quantizeEvents([ev('a', 0, 0.9, 60), ev('b', 0, 1, 110), ev('c', 0, 1, 80, 'kick')], ts, 'quarter', 1);
    expect(r.merged).toBe(1);
    expect(r.events.map((e) => e.id).sort()).toEqual(['b', 'c']);
  });

  it('conta notas fora da grade', () => {
    expect(countOffGridEvents([ev('a', 0, 1 / 3), ev('b', 0, 0.5)], 'sixteenth')).toBe(1);
    expect(countOffGridEvents([ev('a', 0, 1 / 3), ev('b', 0, 0.5)], 'triplet')).toBe(1);
  });
});
