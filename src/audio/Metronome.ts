import type { ClickKind } from '../music/types';
import { CLICK_LAYERS, type ClickSoundId } from './soundCatalog';
import { playLayer, playSample } from './voices';

const SAMPLE_GAIN: Record<ClickKind, number> = { downbeat: 1, beat: 0.8, subdivision: 0.5 };

/**
 * Agenda um clique num instante absoluto do relógio de áudio. Com o som "Meus sons",
 * usa o arquivo do usuário para esse tipo de clique (ou cai no clássico se não houver).
 * Retorna as fontes criadas para que o motor possa interrompê-las ao pausar.
 */
export function scheduleClick(
  ctx: BaseAudioContext,
  destination: AudioNode,
  time: number,
  kind: ClickKind,
  sound: ClickSoundId,
  noise: AudioBuffer,
  sample?: AudioBuffer | null,
): AudioScheduledSourceNode[] {
  if (sound === 'custom' && sample) return [playSample(ctx, sample, time, SAMPLE_GAIN[kind], destination)];
  const layers = CLICK_LAYERS[sound === 'custom' ? 'classic' : sound][kind];
  return layers.map((l) => playLayer(ctx, noise, l, time, 1, destination));
}
