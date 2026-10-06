/**
 * Blocos de síntese compartilhados pelo metrônomo e pela bateria.
 * Uma "camada" é um oscilador ou um ruído filtrado com envelope curto; um som é
 * uma lista de camadas tocadas juntas. Samples (arquivos do usuário) também passam por aqui.
 */

export type Layer =
  | { type: 'tone'; wave: OscillatorType; from: number; to?: number; glide?: number; peak: number; decay: number }
  | { type: 'noise'; filter: BiquadFilterType; freq: number; q?: number; peak: number; decay: number };

export function createNoiseBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  // Ruído pseudoaleatório determinístico (LCG) — o mesmo a cada sessão.
  let seed = 1234567;
  for (let i = 0; i < length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    data[i] = (seed / 0xffffffff) * 2 - 1;
  }
  return buffer;
}

function envelope(ctx: BaseAudioContext, t: number, peak: number, decay: number): GainNode {
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + 0.0015);
  env.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  return env;
}

export function playLayer(
  ctx: BaseAudioContext,
  noise: AudioBuffer,
  layer: Layer,
  time: number,
  gain: number,
  dest: AudioNode,
): AudioScheduledSourceNode {
  const t = Math.max(time, ctx.currentTime);
  const env = envelope(ctx, t, layer.peak * gain, layer.decay);
  if (layer.type === 'tone') {
    const osc = ctx.createOscillator();
    osc.type = layer.wave;
    osc.frequency.setValueAtTime(layer.from, t);
    if (layer.to && layer.to !== layer.from) {
      osc.frequency.exponentialRampToValueAtTime(layer.to, t + (layer.glide ?? layer.decay * 0.5));
    }
    osc.connect(env).connect(dest);
    osc.start(t);
    osc.stop(t + layer.decay + 0.03);
    osc.addEventListener('ended', () => env.disconnect());
    return osc;
  }
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const filter = ctx.createBiquadFilter();
  filter.type = layer.filter;
  filter.frequency.setValueAtTime(layer.freq, t);
  if (layer.q) filter.Q.setValueAtTime(layer.q, t);
  src.connect(filter).connect(env).connect(dest);
  src.start(t);
  src.stop(t + Math.min(layer.decay + 0.03, noise.duration - 0.01));
  src.addEventListener('ended', () => {
    filter.disconnect();
    env.disconnect();
  });
  return src;
}

/** Toca um arquivo de áudio carregado pelo usuário. */
export function playSample(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  time: number,
  gain: number,
  dest: AudioNode,
): AudioScheduledSourceNode {
  const t = Math.max(time, ctx.currentTime);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  src.connect(g).connect(dest);
  src.start(t);
  src.addEventListener('ended', () => g.disconnect());
  return src;
}
