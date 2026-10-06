import { describe, expect, it } from 'vitest';
import {
  addEvent,
  changeTimeSignature,
  clearBar,
  copyEvents,
  createBlankExercise,
  duplicateBar,
  duplicateExercise,
  moveEventsBySteps,
  pasteEvents,
  quantizeExercise,
  setSubdivision,
  setTotalBars,
} from '../music/exerciseOps';
import { createHistory, pushHistory, redo, undo } from '../music/history';
import type { Exercise } from '../music/types';

function base(): Exercise {
  let ex = { ...createBlankExercise(), totalBars: 2 };
  ex = addEvent(ex, { barIndex: 0, beatPosition: 0, instrument: 'kick', limb: 'rightFoot', velocity: 100, accent: false }).exercise;
  ex = addEvent(ex, { barIndex: 0, beatPosition: 0, instrument: 'crash', limb: 'rightHand', velocity: 100, accent: true }).exercise;
  ex = addEvent(ex, { barIndex: 0, beatPosition: 1, instrument: 'snare', limb: 'leftHand', velocity: 90, accent: false }).exercise;
  return ex;
}

describe('editor — operações', () => {
  it('aceita notas simultâneas na mesma posição', () => {
    const ex = base();
    expect(ex.events.filter((e) => e.barIndex === 0 && e.beatPosition === 0)).toHaveLength(2);
  });

  it('move por passos atravessando a barra de compasso e preserva o id', () => {
    const ex = base();
    const snare = ex.events.find((e) => e.instrument === 'snare')!;
    const moved = moveEventsBySteps(ex, [snare.id], 12); // +3 semínimas em semicolcheias
    const after = moved.events.find((e) => e.id === snare.id)!;
    expect(after).toMatchObject({ barIndex: 1, beatPosition: 0 });
  });

  it('não move se sair dos limites', () => {
    const ex = base();
    const kick = ex.events.find((e) => e.instrument === 'kick')!;
    expect(moveEventsBySteps(ex, [kick.id], -1)).toBe(ex);
  });

  it('copia e cola em outro compasso com novos ids', () => {
    const ex = base();
    const clip = copyEvents(ex, ex.events.map((e) => e.id))!;
    const { exercise, newIds } = pasteEvents(ex, clip, 1);
    expect(newIds).toHaveLength(3);
    expect(exercise.events.filter((e) => e.barIndex === 1)).toHaveLength(3);
    expect(new Set(exercise.events.map((e) => e.id)).size).toBe(6);
  });

  it('duplica e limpa compassos', () => {
    const dup = duplicateBar(base(), 0);
    expect(dup.totalBars).toBe(3);
    expect(dup.events.filter((e) => e.barIndex === 1)).toHaveLength(3);
    expect(clearBar(dup, 1).events.filter((e) => e.barIndex === 1)).toHaveLength(0);
  });

  it('trocar a subdivisão não desloca notas; quantizar é explícito', () => {
    let ex = base();
    ex = addEvent(ex, { barIndex: 1, beatPosition: 1 / 3, instrument: 'tom1', limb: 'rightHand', velocity: 90, accent: false }).exercise;
    const sub = setSubdivision(ex, 'eighth');
    expect(sub.events.find((e) => e.instrument === 'tom1')!.beatPosition).toBeCloseTo(1 / 3);
    const q = quantizeExercise(sub);
    expect(q.exercise.events.find((e) => e.instrument === 'tom1')!.beatPosition).toBe(0.5);
  });

  it('mudar a fórmula remove apenas notas que não cabem', () => {
    let ex = base();
    ex = addEvent(ex, { barIndex: 0, beatPosition: 3.5, instrument: 'hiHat', limb: 'rightHand', velocity: 90, accent: false }).exercise;
    const r = changeTimeSignature(ex, { numerator: 3, denominator: 4 });
    expect(r.events).toHaveLength(3);
  });

  it('reduzir compassos remove as notas excedentes', () => {
    const b = base();
    const ex = pasteEvents(b, copyEvents(b, b.events.map((e) => e.id))!, 1).exercise;
    expect(ex.events.some((e) => e.barIndex === 1)).toBe(true);
    expect(setTotalBars(ex, 1).events.every((e) => e.barIndex === 0)).toBe(true);
  });

  it('duplicar exercício não altera o original', () => {
    const orig = base();
    const copy = duplicateExercise(orig);
    expect(copy.id).not.toBe(orig.id);
    expect(copy.events.map((e) => e.id)).not.toEqual(orig.events.map((e) => e.id));
    copy.events[0].velocity = 1;
    expect(orig.events[0].velocity).not.toBe(1);
  });
});

describe('histórico', () => {
  it('desfaz e refaz de forma previsível', () => {
    let h = createHistory(1);
    h = pushHistory(h, 2);
    h = pushHistory(h, 3);
    h = undo(h);
    expect(h.present).toBe(2);
    h = redo(h);
    expect(h.present).toBe(3);
    h = undo(undo(h));
    expect(h.present).toBe(1);
    h = pushHistory(h, 9);
    expect(h.future).toHaveLength(0);
    expect(redo(h).present).toBe(9);
  });

  it('agrupa alterações contínuas', () => {
    let h = createHistory(0);
    h = pushHistory(h, 1, { coalesceKey: 'vel', now: 1000 });
    h = pushHistory(h, 2, { coalesceKey: 'vel', now: 1100 });
    h = pushHistory(h, 3, { coalesceKey: 'vel', now: 1200 });
    expect(h.past).toEqual([0]);
    expect(undo(h).present).toBe(0);
  });
});
