import { beforeEach, describe, expect, it } from 'vitest';
import { Transport } from '../transport/Transport';
import { addEvent, createBlankExercise } from '../music/exerciseOps';
import type { Exercise } from '../music/types';
import { advance, FakeSink, ManualTimer } from './helpers';

class BackingSink extends FakeSink {
  starts: { trackId: string; time: number; offset: number; rate: number }[] = [];
  rates: { time: number; rate: number }[] = [];
  stops = 0;
  startBacking(trackId: string, time: number, offset: number, rate: number) {
    this.starts.push({ trackId, time, offset, rate });
  }
  setBackingRate(time: number, rate: number) {
    this.rates.push({ time, rate });
  }
  stopBacking() {
    this.stops++;
  }
}

function ex(): Exercise {
  let e: Exercise = { ...createBlankExercise(), id: 'bk', subdivision: 'quarter' };
  e = addEvent(e, { barIndex: 0, beatPosition: 0, instrument: 'kick', limb: 'rightFoot', velocity: 90, accent: false }).exercise;
  return e;
}

describe('faixa de acompanhamento', () => {
  let sink: BackingSink;
  let t: Transport;
  beforeEach(() => {
    sink = new BackingSink();
    t = new Transport(sink, { createTimer: () => new ManualTimer(), lookahead: 0.1, startDelay: 0.05 });
    t.setBpm(120);
    t.load(ex());
  });

  it('começa alinhada: o tempo 1 do exercício cai no "início do 1º tempo" da música', async () => {
    t.setCountInBars(0);
    t.setBacking({ trackId: 'm', bpm: 120, offsetSec: 3.5 });
    await t.play();
    expect(sink.starts).toEqual([{ trackId: 'm', time: 0.05, offset: 3.5, rate: 1 }]);
  });

  it('com contagem, a introdução da música toca durante a contagem', async () => {
    t.setCountInBars(1); // 2 s a 120 BPM
    t.setBacking({ trackId: 'm', bpm: 120, offsetSec: 5 });
    await t.play();
    // começa 2 s antes do tempo 1, ou seja, no segundo 3 da música
    expect(sink.starts[0].offset).toBeCloseTo(3, 9);
    expect(sink.starts[0].time).toBeCloseTo(0.05, 9);
  });

  it('se a música começa no tempo 1 (offset 0), espera a contagem terminar', async () => {
    t.setCountInBars(1);
    t.setBacking({ trackId: 'm', bpm: 120, offsetSec: 0 });
    await t.play();
    expect(sink.starts[0].offset).toBe(0);
    expect(sink.starts[0].time).toBeCloseTo(2.05, 9);
  });

  it('BPM diferente do da música muda a velocidade da faixa (e o tom)', async () => {
    t.setCountInBars(0);
    t.setBpm(90);
    t.setBacking({ trackId: 'm', bpm: 120, offsetSec: 0 });
    await t.play();
    expect(sink.starts[0].rate).toBeCloseTo(0.75, 9);
  });

  it('mudar o BPM tocando ajusta a velocidade no mesmo ponto do tempo', async () => {
    t.setCountInBars(0);
    t.setBacking({ trackId: 'm', bpm: 120, offsetSec: 0 });
    await t.play();
    advance(sink, () => t.tick(), 1);
    t.setBpm(60);
    expect(sink.rates).toHaveLength(1);
    expect(sink.rates[0].rate).toBeCloseTo(0.5, 9);
    // o instante da mudança é o mesmo da fronteira do agendamento (sem salto)
    expect(sink.rates[0].time).toBeGreaterThan(sink.currentTime);
  });

  it('retomar continua a música do ponto certo', async () => {
    t.setCountInBars(0);
    t.setBacking({ trackId: 'm', bpm: 120, offsetSec: 2 });
    await t.play();
    advance(sink, () => t.tick(), 3.05); // 6 semínimas
    t.pause();
    advance(sink, () => t.tick(), 5);
    await t.play();
    expect(sink.starts).toHaveLength(2);
    expect(sink.starts[1].offset).toBeCloseTo(2 + 3, 1); // offset + 6 semínimas × 0,5 s
  });

  it('trocar de faixa durante a reprodução para a anterior e inicia a nova', async () => {
    t.setCountInBars(0);
    t.setBacking({ trackId: 'a', bpm: 120, offsetSec: 0 });
    await t.play();
    advance(sink, () => t.tick(), 1);
    t.setBacking({ trackId: 'b', bpm: 100, offsetSec: 1 });
    expect(sink.stops).toBe(1);
    expect(sink.starts.at(-1)!.trackId).toBe('b');
    t.setBacking(null);
    expect(sink.stops).toBe(2);
  });
});
