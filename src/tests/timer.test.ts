import { beforeEach, describe, expect, it } from 'vitest';
import { Transport } from '../transport/Transport';
import { addEvent, createBlankExercise } from '../music/exerciseOps';
import type { Exercise } from '../music/types';
import { advance, FakeSink, ManualTimer } from './helpers';

/** 1 compasso 4/4, uma nota por tempo. A 120 BPM: compasso = 2 s. */
function ex(): Exercise {
  let e: Exercise = { ...createBlankExercise(), id: 'timer-ex', subdivision: 'quarter' };
  for (let k = 0; k < 4; k++) {
    e = addEvent(e, { barIndex: 0, beatPosition: k, instrument: 'snare', limb: 'rightHand', velocity: 90, accent: false }).exercise;
  }
  return e;
}

describe('cronômetro de treino', () => {
  let sink: FakeSink;
  let t: Transport;
  const tick = () => t.tick();

  beforeEach(() => {
    sink = new FakeSink();
    t = new Transport(sink, { createTimer: () => new ManualTimer(), lookahead: 0.1, startDelay: 0.05 });
    t.setBpm(120);
    t.load(ex());
  });

  it('não conta a contagem inicial', async () => {
    t.setCountInBars(1); // 2 s de contagem
    t.setPracticeLimit(60);
    await t.play();
    advance(sink, tick, 2);
    expect(t.getPracticeElapsed()).toBe(0);
    advance(sink, tick, 1.05);
    expect(t.getPracticeElapsed()).toBeCloseTo(1, 1);
  });

  it('esgotado o tempo, termina o compasso atual e para', async () => {
    t.setCountInBars(0);
    t.setPracticeLimit(5); // 5 s = 2,5 compassos → deve tocar até o fim do 3º compasso (6 s)
    await t.play();
    advance(sink, tick, 5.1);
    expect(t.getSnapshot().timerExpired).toBe(true);
    expect(t.getSnapshot().state).toBe('playing');
    advance(sink, tick, 2);
    expect(t.getSnapshot().state).toBe('stopped');
    expect(t.getSnapshot().timerFinished).toBe(true);
    const hits = sink.scheduled.filter((s) => s.kind === 'hit');
    expect(hits).toHaveLength(12); // 3 compassos completos
    expect(hits.at(-1)!.time).toBeCloseTo(0.05 + 5.5, 9);
  });

  it('pausas não contam e retomar continua o mesmo treino', async () => {
    t.setCountInBars(0);
    t.setPracticeLimit(60);
    await t.play();
    advance(sink, tick, 3.05);
    t.pause();
    const paused = t.getPracticeElapsed();
    expect(paused).toBeCloseTo(3, 1);
    advance(sink, tick, 10);
    expect(t.getPracticeElapsed()).toBeCloseTo(paused, 6);
    await t.play();
    advance(sink, tick, 2.05);
    expect(t.getPracticeElapsed()).toBeCloseTo(5, 1);
  });

  it('o tempo vale mesmo com o loop desligado no meio', async () => {
    t.setCountInBars(0);
    t.setPracticeLimit(3);
    await t.play();
    advance(sink, tick, 3.1);
    expect(t.getSnapshot().timerExpired).toBe(true);
    t.setLoop(false); // não pode adiar o fim
    advance(sink, tick, 2);
    expect(t.getSnapshot().state).toBe('stopped');
  });

  it('aumentar o tempo depois de esgotado continua tocando', async () => {
    t.setCountInBars(0);
    t.setPracticeLimit(3);
    await t.play();
    advance(sink, tick, 3.1);
    expect(t.getSnapshot().timerExpired).toBe(true);
    t.setPracticeLimit(600);
    advance(sink, tick, 6);
    expect(t.getSnapshot().state).toBe('playing');
    expect(t.getSnapshot().timerExpired).toBe(false);
  });

  it('parar ou reiniciar zera o cronômetro', async () => {
    t.setCountInBars(0);
    t.setPracticeLimit(60);
    await t.play();
    advance(sink, tick, 4);
    await t.restart();
    expect(t.getPracticeElapsed()).toBe(0);
    advance(sink, tick, 1);
    t.stop();
    expect(t.getPracticeElapsed()).toBe(0);
  });

  it('sem cronômetro o loop continua indefinidamente', async () => {
    t.setCountInBars(0);
    await t.play();
    advance(sink, tick, 30);
    expect(t.getSnapshot().state).toBe('playing');
  });
});
