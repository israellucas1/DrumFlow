import type { MusicEvent } from '../music/types';
import { KIT_LAYERS, type DrumKitId } from './soundCatalog';
import { playLayer, playSample } from './voices';

/** Intervalo entre apojaturas (flam/drag) e a nota principal, em segundos. */
export const GRACE_SPACING = 0.03;

export function velocityGain(ev: Pick<MusicEvent, 'velocity' | 'accent'>): number {
  const base = Math.pow(Math.min(Math.max(ev.velocity, 1), 127) / 127, 1.4);
  return Math.min(base * (ev.accent ? 1.25 : 0.95), 1.15);
}

/**
 * Bateria: kits sintetizados (camadas em `soundCatalog`) ou arquivos do usuário.
 * No kit "Meus sons", peças sem arquivo usam o kit acústico.
 */
export class DrumSynth {
  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly noise: AudioBuffer,
  ) {}

  play(ev: MusicEvent, time: number, dest: AudioNode, kit: DrumKitId, sample?: AudioBuffer | null): AudioScheduledSourceNode[] {
    const out: AudioScheduledSourceNode[] = [];
    const g = velocityGain(ev);
    const graces = ev.ornament === 'flam' ? 1 : ev.ornament === 'drag' ? 2 : 0;
    for (let i = graces; i >= 1; i--) out.push(...this.voice(ev, time - i * GRACE_SPACING, g * 0.32, dest, kit, sample));
    out.push(...this.voice(ev, time, g, dest, kit, sample));
    return out;
  }

  private voice(
    ev: MusicEvent,
    time: number,
    gain: number,
    dest: AudioNode,
    kit: DrumKitId,
    sample?: AudioBuffer | null,
  ): AudioScheduledSourceNode[] {
    if (kit === 'custom' && sample) return [playSample(this.ctx, sample, time, gain, dest)];
    const layers = KIT_LAYERS[kit === 'custom' ? 'acoustic' : kit][ev.instrument];
    return layers.map((l) => playLayer(this.ctx, this.noise, l, time, gain, dest));
  }
}
