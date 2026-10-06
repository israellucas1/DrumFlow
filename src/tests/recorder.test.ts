import { describe, expect, it } from 'vitest';
import { assemble, takeOffsetSec } from '../audio/Recorder';

/** AudioBuffer mínimo para testes (sem Web Audio no Node). */
function fakeCtx(sampleRate = 48000) {
  return {
    sampleRate,
    createBuffer(ch: number, length: number, sr: number) {
      const data = Array.from({ length: ch }, () => new Float32Array(length));
      return { numberOfChannels: ch, length, sampleRate: sr, duration: length / sr, getChannelData: (c: number) => data[c] } as unknown as AudioBuffer;
    },
  } as unknown as BaseAudioContext;
}

describe('gravação', () => {
  it('junta os blocos na posição exata do relógio, com silêncio nos buracos', () => {
    const r = assemble(fakeCtx(), [
      { frame: 1000, data: new Float32Array([1, 1]) },
      { frame: 1002, data: new Float32Array([2, 2]) },
      { frame: 1010, data: new Float32Array([3]) },
    ])!;
    expect(r.startFrame).toBe(1000);
    const out = Array.from(r.buffer.getChannelData(0));
    expect(out.length).toBe(11);
    expect(out.slice(0, 4)).toEqual([1, 1, 2, 2]);
    expect(out.slice(4, 10).every((v) => v === 0)).toBe(true);
    expect(out[10]).toBe(3);
  });

  it('nada captado = sem gravação', () => {
    expect(assemble(fakeCtx(), [])).toBeNull();
  });

  it('o tempo 1 cai no ponto certo da gravação, descontando as latências', () => {
    // gravação começou em t=10,0 s (quadro 480000 a 48 kHz); tempo 1 em t=12,0 s;
    // latência de saída 40 ms + entrada 10 ms → o golpe do tempo 1 está em 2,05 s do arquivo
    expect(takeOffsetSec(12, 480000, 48000, 0.04, 0.01)).toBeCloseTo(2.05, 9);
  });
});
