import { describe, expect, it } from 'vitest';
import { GOSPEL_CHOPS } from '../data/gospelChops';
import { LIBRARY } from '../data/rudiments';
import { barLengthInQuarters } from '../music/timeSignature';
import { isOnGrid } from '../music/beatMath';
import { INSTRUMENT_IDS } from '../music/types';
import { CLICK_LAYERS, CLICK_SOUND_IDS, DRUM_KIT_IDS, KIT_LAYERS } from '../audio/soundCatalog';
import { sanitizeSettings } from '../storage/SettingsRepository';

const byId = (id: string) => GOSPEL_CHOPS.find((e) => e.id === `lib-gospel-${id}`)!;
/** Sequência tocada (R/L/K), em ordem de tempo, ignorando o groove. */
const played = (id: string, from = 0) =>
  byId(id)
    .events.filter((e) => e.barIndex * 4 + e.beatPosition >= from && !['hiHat', 'crash'].includes(e.instrument))
    .sort((a, b) => a.barIndex - b.barIndex || a.beatPosition - b.beatPosition)
    .map((e) => (e.instrument === 'kick' ? 'K' : e.limb === 'rightHand' ? 'R' : 'L'))
    .join('');

describe('gospel chops', () => {
  it('estão na biblioteca, com ids únicos', () => {
    expect(GOSPEL_CHOPS.length).toBeGreaterThanOrEqual(10);
    expect(LIBRARY.filter((e) => e.category === 'gospel')).toHaveLength(GOSPEL_CHOPS.length);
    expect(new Set(LIBRARY.map((e) => e.id)).size).toBe(LIBRARY.length);
  });

  it('as notas tocadas correspondem à sequência de cada chop', () => {
    expect(played('rlk')).toBe('RLK'.repeat(8));
    expect(played('rlrlkk')).toBe('RLRLKK'.repeat(4));
    expect(played('rlrrkk')).toBe('RLRRKK'.repeat(4));
    expect(played('lrlrkk')).toBe('LRLRKK'.repeat(4));
    expect(played('rlk-toms')).toBe('RLK'.repeat(8));
    expect(played('rlkk')).toBe('RLKK'.repeat(4));
    expect(played('rllk')).toBe('RLLK'.repeat(4));
    expect(played('rlrlkk-toms', 4)).toBe('RLRLKK'.repeat(4));
    expect(played('groove-chop', 3)).toBe('RLRLKK');
  });

  it('descem pelos tons no chop em 4 grupos', () => {
    const toms = byId('rlrlkk-toms').events.filter((e) => e.barIndex === 1 && e.instrument !== 'kick');
    expect([...new Set(toms.map((e) => e.instrument))]).toEqual(['snare', 'tom1', 'tom2', 'floorTom']);
    expect(byId('rlk-toms').events.filter((e) => e.limb === 'rightHand').every((e) => e.instrument === 'floorTom')).toBe(true);
  });

  it('a sequência exibida usa D/E/P e não deixa letras R/L/K', () => {
    for (const ex of GOSPEL_CHOPS) expect(ex.sticking).not.toMatch(/[RLK]/);
    expect(byId('rlrlkk').sticking).toBe('DEDEPP DEDEPP DEDEPP DEDEPP');
    expect(byId('rlrlkk-toms').sticking).toContain('groove');
  });

  it('todas as notas estão dentro do compasso e na grade', () => {
    for (const ex of GOSPEL_CHOPS) {
      const barLen = barLengthInQuarters(ex.tempoSignature);
      for (const e of ex.events) {
        expect(e.beatPosition).toBeLessThan(barLen);
        expect(e.barIndex).toBeLessThan(ex.totalBars);
        expect(isOnGrid(e.beatPosition, ex.subdivision)).toBe(true);
      }
      // nenhum instrumento duas vezes no mesmo instante
      const keys = ex.events.map((e) => `${e.instrument}@${e.barIndex}:${e.beatPosition.toFixed(4)}`);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

describe('catálogo de sons', () => {
  it('todo kit sintetizado tem som para as 9 peças', () => {
    for (const kit of DRUM_KIT_IDS.filter((k) => k !== 'custom')) {
      for (const inst of INSTRUMENT_IDS) expect(KIT_LAYERS[kit as Exclude<typeof kit, 'custom'>][inst].length).toBeGreaterThan(0);
    }
  });

  it('todo som de metrônomo diferencia 1º tempo, tempos e subdivisões', () => {
    for (const s of CLICK_SOUND_IDS.filter((x) => x !== 'custom')) {
      const v = CLICK_LAYERS[s as Exclude<typeof s, 'custom'>];
      const peak = (k: keyof typeof v) => Math.max(...v[k].map((l) => l.peak));
      expect(peak('downbeat')).toBeGreaterThan(peak('beat'));
      expect(peak('beat')).toBeGreaterThan(peak('subdivision'));
    }
  });

  it('a escolha de som é salva e valores inválidos voltam ao padrão', () => {
    expect(sanitizeSettings({ audio: { clickSound: 'cowbell', drumKit: 'electronic' } }).audio).toMatchObject({
      clickSound: 'cowbell',
      drumKit: 'electronic',
    });
    expect(sanitizeSettings({ audio: { clickSound: 'xyz', drumKit: 1 } }).audio).toMatchObject({
      clickSound: 'classic',
      drumKit: 'acoustic',
    });
  });
});
