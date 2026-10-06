import { beforeEach, describe, expect, it } from 'vitest';
import { Transport } from '../transport/Transport';
import { TempoMap } from '../transport/tempoMap';
import { addEvent, createBlankExercise } from '../music/exerciseOps';
import type { Exercise } from '../music/types';
import { advance, FakeSink, ManualTimer } from './helpers';

function exerciseWithQuarterNotes(bars = 1): Exercise {
  let ex: Exercise = { ...createBlankExercise(), id: 'ex-test', totalBars: bars, subdivision: 'quarter' };
  for (let b = 0; b < bars; b++) {
    for (let k = 0; k < 4; k++) {
      ex = addEvent(ex, {
        barIndex: b,
        beatPosition: k,
        instrument: 'snare',
        limb: k % 2 ? 'leftHand' : 'rightHand',
        velocity: 90,
        accent: false,
      }).exercise;
    }
  }
  return ex;
}

describe('TempoMap', () => {
  it('é contínuo na mudança de andamento', () => {
    const m = new TempoMap();
    m.reset(10, 0, 60);
    m.changeTempo(4, 120);
    expect(m.timeAt(4)).toBeCloseTo(14);
    expect(m.quarterAt(14)).toBeCloseTo(4);
    expect(m.timeAt(6)).toBeCloseTo(15);
    expect(m.quarterAt(13)).toBeCloseTo(3);
  });
});

describe('Transport', () => {
  let sink: FakeSink;
  let timer: ManualTimer;
  let transport: Transport;

  beforeEach(() => {
    sink = new FakeSink();
    timer = new ManualTimer();
    transport = new Transport(sink, { createTimer: () => timer, lookahead: 0.1, startDelay: 0.05 });
    transport.setBpm(120);
  });

  const tick = () => transport.tick();

  it('não toca antes de uma ação explícita', () => {
    transport.load(exerciseWithQuarterNotes());
    advance(sink, tick, 2);
    expect(sink.scheduled).toHaveLength(0);
    expect(transport.getSnapshot().state).toBe('stopped');
  });

  it('informa erro quando o navegador bloqueia o áudio', async () => {
    transport.load(exerciseWithQuarterNotes());
    sink.failStart = true;
    await transport.play();
    expect(transport.getSnapshot().state).toBe('stopped');
    expect(transport.getSnapshot().error).toBeTruthy();
  });

  it('faz a contagem inicial e só então começa o exercício', async () => {
    transport.load(exerciseWithQuarterNotes());
    transport.setCountInBars(1);
    await transport.play();
    expect(transport.getSnapshot().state).toBe('countIn');
    advance(sink, tick, 1.9);
    const hitsDuringCountIn = sink.scheduled.filter((s) => s.kind === 'hit' && s.time < 2.05 - 1e-9);
    expect(hitsDuringCountIn).toHaveLength(0);
    const clicks = sink.scheduled.filter((s) => s.kind === 'click').slice(0, 4);
    // 120 BPM → 0,5 s por tempo; início em t0 = 0,05
    expect(clicks.map((c) => c.time)).toEqual([0.05, 0.55, 1.05, 1.55].map((t) => expect.closeTo(t, 9)));
    expect(clicks[0].click).toBe('downbeat');
    advance(sink, tick, 0.3);
    expect(transport.getSnapshot().state).toBe('playing');
    const firstHit = sink.scheduled.find((s) => s.kind === 'hit')!;
    expect(firstHit.time).toBeCloseTo(2.05, 9);
  });

  it('agenda cada evento exatamente uma vez e sem deriva ao longo do loop', async () => {
    const ex = exerciseWithQuarterNotes(2);
    transport.load(ex);
    transport.setCountInBars(0);
    await transport.play();
    advance(sink, tick, 40, 0.017); // passo irregular de propósito
    const hits = sink.scheduled.filter((s) => s.kind === 'hit');
    const times = hits.map((h) => h.time);
    expect(new Set(times.map((t) => t.toFixed(9))).size).toBe(times.length);
    // Cada nota deve cair exatamente em t0 + n × 0,5 s (sem acúmulo de erro)
    times.forEach((t, n) => expect(t).toBeCloseTo(0.05 + n * 0.5, 9));
    expect(hits.length).toBeGreaterThanOrEqual(79);
    const downbeats = sink.scheduled.filter((s) => s.click === 'downbeat').map((s) => s.time);
    downbeats.forEach((t, n) => expect(t).toBeCloseTo(0.05 + n * 2, 9));
  });

  it('pausa sem deixar cliques tocando e retoma sem duplicar', async () => {
    transport.load(exerciseWithQuarterNotes());
    transport.setCountInBars(0);
    await transport.play();
    advance(sink, tick, 1.3);
    transport.pause();
    expect(transport.getSnapshot().state).toBe('paused');
    const pausedPos = transport.getPosition();
    expect(pausedPos.localQuarter).toBeCloseTo((1.3 - 0.05) * 2, 6);
    advance(sink, tick, 5); // nada deve ser agendado enquanto pausado
    const countBefore = sink.scheduled.length;
    advance(sink, tick, 1);
    expect(sink.scheduled.length).toBe(countBefore);

    await transport.play();
    expect(transport.getSnapshot().state).toBe('playing');
    advance(sink, tick, 3);
    const audibleHits = sink.audible().filter((s) => s.kind === 'hit');
    // Sequência musical tocada: posições 0,1,2 antes da pausa e 3,0,1,... depois
    const beats = audibleHits.map((h) => h.event!.beatPosition);
    expect(beats.slice(0, 6)).toEqual([0, 1, 2, 3, 0, 1]);
    // Nenhum som agendado na sessão 1 depois do instante da pausa
    expect(sink.audible().filter((s) => s.session === 1 && s.time > 1.3)).toHaveLength(0);
  });

  it('para e reinicia a partir da contagem', async () => {
    transport.load(exerciseWithQuarterNotes());
    transport.setCountInBars(1);
    await transport.play();
    advance(sink, tick, 3);
    transport.stop();
    expect(transport.getSnapshot().state).toBe('stopped');
    expect(transport.getPosition().localQuarter).toBe(0);
    await transport.restart();
    expect(transport.getSnapshot().state).toBe('countIn');
    expect(transport.getPosition(sink.currentTime + 0.05).linearQuarter).toBeCloseTo(-4, 6);
  });

  it('altera o BPM numa fronteira sem duplicar nem criar intervalos absurdos', async () => {
    transport.load(exerciseWithQuarterNotes());
    transport.setCountInBars(0);
    await transport.play();
    advance(sink, tick, 2.02);
    transport.setBpm(60);
    advance(sink, tick, 8);
    const times = sink.scheduled.filter((s) => s.kind === 'hit').map((s) => s.time);
    const gaps = times.slice(1).map((t, i) => t - times[i]);
    for (const g of gaps) {
      expect(g).toBeGreaterThanOrEqual(0.5 - 1e-9);
      expect(g).toBeLessThanOrEqual(1 + 1e-9);
    }
    expect(gaps.at(-1)).toBeCloseTo(1, 9);
    expect(new Set(times.map((t) => t.toFixed(9))).size).toBe(times.length);
    // A posição visual nunca volta para trás
    let last = -Infinity;
    for (let t = 0; t < 10; t += 0.01) {
      const q = transport.getPosition(t).linearQuarter;
      expect(q).toBeGreaterThanOrEqual(last - 1e-9);
      last = q;
    }
  });

  it('sem loop, termina ao fim do exercício', async () => {
    transport.load(exerciseWithQuarterNotes());
    transport.setCountInBars(0);
    transport.setLoop(false);
    await transport.play();
    advance(sink, tick, 5);
    expect(transport.getSnapshot().state).toBe('stopped');
    expect(sink.scheduled.filter((s) => s.kind === 'hit')).toHaveLength(4);
  });

  it('calcula a posição a partir do relógio, mesmo após perda de frames', async () => {
    transport.load(exerciseWithQuarterNotes(2));
    transport.setCountInBars(0);
    await transport.play();
    advance(sink, tick, 0.5);
    // O "frame" seguinte acontece muito depois (aba ocupada): a posição salta para o lugar certo
    const p = transport.getPosition(0.05 + 5.25 * 0.5);
    expect(p.localQuarter).toBeCloseTo(5.25, 9);
    expect(p.barIndex).toBe(1);
    expect(p.beatInBar).toBe(1);
  });

  it('aplica edições durante a reprodução preservando a posição', async () => {
    let ex = exerciseWithQuarterNotes(2);
    transport.load(ex);
    transport.setCountInBars(0);
    await transport.play();
    advance(sink, tick, 2.6); // ~5 semínimas
    ex = { ...ex, events: ex.events.filter((e) => !(e.barIndex === 1 && e.beatPosition === 3)) };
    transport.load(ex);
    expect(transport.getSnapshot().state).toBe('playing');
    advance(sink, tick, 3);
    const hits = sink.scheduled.filter((s) => s.kind === 'hit').map((h) => `${h.event!.barIndex}:${h.event!.beatPosition}`);
    expect(hits).toContain('1:2');
    expect(hits).not.toContain('1:3');
    expect(new Set(sink.scheduled.map((s) => `${s.kind}${s.time.toFixed(9)}${s.click ?? ''}`)).size).toBe(
      sink.scheduled.length,
    );
  });

  it('trocar de exercício interrompe a reprodução', async () => {
    transport.load(exerciseWithQuarterNotes());
    await transport.play();
    transport.load({ ...exerciseWithQuarterNotes(), id: 'outro' });
    expect(transport.getSnapshot().state).toBe('stopped');
  });
});
