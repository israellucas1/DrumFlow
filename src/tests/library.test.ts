import { describe, expect, it } from 'vitest';
import { RUDIMENTS } from '../data/rudiments';
import { DEMO_EXERCISES } from '../data/exampleExercises';
import { LocalStorageExerciseRepository } from '../storage/ExerciseRepository';
import { MemoryStore } from '../storage/storage';
import { sanitizeSettings } from '../storage/SettingsRepository';
import { sanitizeExercise } from '../music/validation';
import { barLengthInQuarters } from '../music/timeSignature';
import { isOnGrid } from '../music/beatMath';
import { duplicateExercise } from '../music/exerciseOps';

const handSeq = (id: string) =>
  RUDIMENTS.find((r) => r.id === id)!
    .events.map((e) => (e.limb === 'rightHand' ? 'R' : 'L'))
    .join('');

describe('biblioteca de rudimentos', () => {
  it('tem os 10 rudimentos pedidos', () => {
    expect(RUDIMENTS.map((r) => r.name)).toEqual([
      'Single Stroke Roll',
      'Double Stroke Roll',
      'Paradiddle',
      'Double Paradiddle',
      'Paradiddle-diddle',
      'Flam',
      'Drag',
      'Five Stroke Roll',
      'Six Stroke Roll',
      'Seven Stroke Roll',
    ]);
  });

  it('as mãos correspondem ao rudimento', () => {
    expect(handSeq('lib-single-stroke-roll')).toBe('RLRLRLRLRLRLRLRL');
    expect(handSeq('lib-double-stroke-roll')).toBe('RRLLRRLLRRLLRRLL');
    expect(handSeq('lib-paradiddle')).toBe('RLRRLRLLRLRRLRLL');
    expect(handSeq('lib-double-paradiddle')).toBe('RLRLRRLRLRLL');
    expect(handSeq('lib-paradiddle-diddle')).toBe('RLRRLLRLRRLL');
    expect(handSeq('lib-five-stroke-roll')).toBe('RRLLRLLRRL');
    expect(handSeq('lib-six-stroke-roll')).toBe('RLLRRLRLLRRL');
    expect(handSeq('lib-seven-stroke-roll')).toBe('LLRRLLRRRLLRRL');
  });

  it('todas as notas estão dentro do compasso e na grade do exercício', () => {
    for (const ex of [...RUDIMENTS, ...DEMO_EXERCISES]) {
      const barLen = barLengthInQuarters(ex.tempoSignature);
      for (const e of ex.events) {
        expect(e.beatPosition).toBeLessThan(barLen);
        expect(e.barIndex).toBeLessThan(ex.totalBars);
        expect(isOnGrid(e.beatPosition, ex.subdivision)).toBe(true);
      }
      expect(new Set(ex.events.map((e) => e.id)).size).toBe(ex.events.length);
    }
  });

  it('acentos do paradiddle na primeira nota de cada grupo', () => {
    const p = RUDIMENTS.find((r) => r.id === 'lib-paradiddle')!;
    expect(p.events.filter((e) => e.accent).map((e) => e.beatPosition)).toEqual([0, 1, 2, 3]);
  });

  it('flam e drag usam apojaturas', () => {
    expect(RUDIMENTS.find((r) => r.id === 'lib-flam')!.events.every((e) => e.ornament === 'flam')).toBe(true);
    expect(RUDIMENTS.find((r) => r.id === 'lib-drag')!.events.every((e) => e.ornament === 'drag')).toBe(true);
  });
});

describe('persistência', () => {
  it('semeia exemplos na primeira execução e salva/recupera', () => {
    const store = new MemoryStore();
    const repo = new LocalStorageExerciseRepository(store);
    expect(repo.list()).toHaveLength(DEMO_EXERCISES.length);
    const mine = duplicateExercise(RUDIMENTS[0], 'Meu');
    repo.save(mine);
    const again = new LocalStorageExerciseRepository(store);
    expect(again.get(mine.id)?.name).toBe('Meu');
    expect(again.get(mine.id)?.events).toHaveLength(16);
  });

  it('restaurar exemplos não apaga exercícios do usuário', () => {
    const store = new MemoryStore();
    const repo = new LocalStorageExerciseRepository(store);
    const mine = repo.save(duplicateExercise(RUDIMENTS[2], 'Meu paradiddle'));
    for (const d of DEMO_EXERCISES) repo.remove(d.id);
    repo.restoreDemos();
    expect(repo.get(mine.id)).not.toBeNull();
    expect(repo.list()).toHaveLength(DEMO_EXERCISES.length + 1);
  });

  it('não quebra com dados corrompidos', () => {
    const store = new MemoryStore();
    store.setItem('drumflow.exercises.v1', '{isto não é json');
    const repo = new LocalStorageExerciseRepository(store);
    expect(repo.list()).toEqual([]);
    expect(repo.recoveredFromCorruption).toBe(true);
  });

  it('descarta eventos inválidos e corrige campos', () => {
    const ex = sanitizeExercise({
      id: 'x',
      name: '',
      bpm: 999,
      totalBars: 1,
      tempoSignature: { numerator: 4, denominator: 5 },
      events: [
        { id: 'a', barIndex: 0, beatPosition: 1, instrument: 'snare', limb: 'leftHand', velocity: 500 },
        { id: 'b', barIndex: 3, beatPosition: 1, instrument: 'snare', limb: 'leftHand' },
        { id: 'c', barIndex: 0, beatPosition: 1, instrument: 'cowbell', limb: 'leftHand' },
      ],
    })!;
    expect(ex.bpm).toBe(240);
    expect(ex.name).toBe('Sem nome');
    expect(ex.tempoSignature).toEqual({ numerator: 4, denominator: 4 });
    expect(ex.events.map((e) => e.id)).toEqual(['a']);
    expect(ex.events[0].velocity).toBe(127);
  });

  it('configurações inválidas voltam ao padrão', () => {
    const s = sanitizeSettings({ lastBpm: 10, audio: { metronomeVolume: 7 }, view: { scrollMode: 'x' } });
    expect(s.lastBpm).toBe(40);
    expect(s.audio.metronomeVolume).toBe(1);
    expect(s.view.scrollMode).toBe('follow');
  });
});
