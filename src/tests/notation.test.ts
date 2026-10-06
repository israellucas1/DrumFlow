import { describe, expect, it } from 'vitest';
import { engrave, beatGroups, STAFF_POSITION, TPQ } from '../music/notation';
import { RUDIMENTS } from '../data/rudiments';
import { DEMO_EXERCISES } from '../data/exampleExercises';
import { GOSPEL_CHOPS } from '../data/gospelChops';
import { DRILLS } from '../study/drills';
import { addEvent, createBlankExercise } from '../music/exerciseOps';
import type { Exercise } from '../music/types';

const rud = (id: string) => RUDIMENTS.find((r) => r.id === id)!;

/** Soma das durações reais de notas+pausas de cada voz deve fechar o compasso. */
function voiceTicks(ex: Exercise) {
  const e = engrave(ex);
  return e.bars.map((bar) =>
    e.voices.map((v) => {
      const items = [...bar.notes.filter((n) => n.voice === v), ...bar.rests.filter((r) => r.voice === v)].sort((a, b) => a.tick - b.tick);
      return items.map((i) => i.tick);
    }),
  );
}

describe('partitura', () => {
  it('posições padrão da bateria na pauta', () => {
    expect(STAFF_POSITION.snare.step).toBe(5);
    expect(STAFF_POSITION.kick.step).toBe(1);
    expect(STAFF_POSITION.hiHat.head).toBe('x');
    expect(STAFF_POSITION.crash.step).toBe(10);
  });

  it('singles em semicolcheias: 4 grupos de 4 semicolcheias ligadas, sem pausas', () => {
    const e = engrave(rud('lib-single-stroke-roll'));
    const bar = e.bars[0];
    expect(e.voices).toEqual(['up']);
    expect(bar.notes).toHaveLength(16);
    expect(bar.notes.every((n) => n.beams === 2 && n.dots === 0)).toBe(true);
    expect(bar.rests).toHaveLength(0);
    expect(bar.groups.map((g) => g.beamed.length)).toEqual([4, 4, 4, 4]);
    expect(bar.groups.every((g) => g.tuplet === null)).toBe(true);
  });

  it('tercinas recebem o número 3 e viram colcheias escritas', () => {
    const bar = engrave(rud('lib-double-paradiddle')).bars[0];
    expect(bar.groups.every((g) => g.tuplet === 3)).toBe(true);
    expect(bar.notes.every((n) => n.beams === 1)).toBe(true);
  });

  it('sextinas recebem o número 6 e viram semicolcheias escritas', () => {
    const bar = engrave(GOSPEL_CHOPS.find((g) => g.id === 'lib-gospel-rlrlkk')!).bars[0];
    const up = bar.groups.filter((g) => g.voice === 'up');
    expect(up.every((g) => g.tuplet === 6)).toBe(true);
    expect(bar.notes.filter((n) => n.voice === 'up').every((n) => n.beams === 2)).toBe(true);
  });

  it('groove: mãos para cima, pés para baixo, com pausas onde o pé não toca', () => {
    const e = engrave(DEMO_EXERCISES.find((d) => d.id === 'demo-rock-groove')!);
    expect(e.voices).toEqual(['up', 'down']);
    const bar = e.bars[0];
    const kicks = bar.notes.filter((n) => n.voice === 'down');
    // bumbo no 1 (semínima), no 3 e "e" do 3 (duas colcheias)
    expect(kicks.map((k) => [k.tick, k.beams])).toEqual([
      [0, 0],
      [96, 1],
      [120, 1],
    ]);
    // tempos 2 e 4 sem bumbo: pausas de semínima
    expect(bar.rests.filter((r) => r.voice === 'down').map((r) => [r.tick, r.beams])).toEqual([
      [48, 0],
      [144, 0],
    ]);
    // chimbal + caixa no mesmo instante = um acorde com duas cabeças
    const beat2 = bar.notes.find((n) => n.voice === 'up' && n.tick === 48)!;
    expect(beat2.heads.map((h) => h.instrument).sort()).toEqual(['hiHat', 'snare']);
  });

  it('nota no contratempo ganha pausa antes', () => {
    let ex: Exercise = { ...createBlankExercise(), subdivision: 'eighth' };
    ex = addEvent(ex, { barIndex: 0, beatPosition: 0.5, instrument: 'snare', limb: 'leftHand', velocity: 90, accent: false }).exercise;
    const bar = engrave(ex).bars[0];
    expect(bar.rests.find((r) => r.tick === 0)).toMatchObject({ beams: 1 });
    expect(bar.notes[0]).toMatchObject({ tick: 24, beams: 1 });
  });

  it('6/8 agrupa em semínimas pontuadas (3 colcheias)', () => {
    const six = DEMO_EXERCISES.find((d) => d.id === 'demo-six-eight')!;
    expect(beatGroups(six)).toEqual([72, 72]);
    const bar = engrave(six).bars[0];
    expect(bar.groups.filter((g) => g.voice === 'up').map((g) => g.beamed.length)).toEqual([3, 3]);
  });

  it('acentos, ghost notes e apojaturas são preservados', () => {
    const para = engrave(rud('lib-paradiddle')).bars[0];
    expect(para.notes.filter((n) => n.heads.some((h) => h.accent))).toHaveLength(4);
    expect(engrave(rud('lib-flam')).bars[0].notes.every((n) => n.heads[0].ornament === 'flam')).toBe(true);
    const ghosts = engrave(GOSPEL_CHOPS.find((g) => g.id === 'lib-gospel-ghost-groove')!).bars[0].notes.filter((n) => n.heads.some((h) => h.ghost));
    expect(ghosts.length).toBe(4);
  });

  it('todos os exercícios do app geram partitura sem buracos nem sobreposição', () => {
    for (const ex of [...RUDIMENTS, ...DEMO_EXERCISES, ...GOSPEL_CHOPS, ...DRILLS.map((d) => d.pattern)]) {
      for (const bar of voiceTicks(ex)) {
        for (const ticks of bar) {
          // posições estritamente crescentes (nada ocupando o mesmo lugar na mesma voz)
          for (let i = 1; i < ticks.length; i++) expect(ticks[i], ex.id).toBeGreaterThan(ticks[i - 1]);
          if (ticks.length) expect(ticks[0], ex.id).toBe(0);
          for (const t of ticks) expect(t, ex.id).toBeLessThan(Math.round(4 * TPQ * 4));
        }
      }
    }
  });
});
