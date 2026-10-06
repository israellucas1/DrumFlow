import { AudioEngine } from '../audio/AudioEngine';
import { AudioScheduler } from '../audio/AudioScheduler';
import { Recorder } from '../audio/Recorder';
import { Transport } from '../transport/Transport';
import { LocalStorageExerciseRepository } from '../storage/ExerciseRepository';
import { HttpRemoteStore, SyncedExerciseRepository } from '../storage/SyncedExerciseRepository';
import { SettingsRepository } from '../storage/SettingsRepository';
import type { AppSettings } from '../music/types';

export interface Services {
  engine: AudioEngine;
  transport: Transport;
  exercises: SyncedExerciseRepository;
  settingsRepo: SettingsRepository;
  initialSettings: AppSettings;
  recorder: Recorder;
}

let services: Services | null = null;

/** Singletons não-React (áudio, transporte, persistência). Criados uma única vez. */
export function getServices(): Services {
  if (services) return services;
  const settingsRepo = new SettingsRepository();
  const initialSettings = settingsRepo.load();
  const engine = new AudioEngine(initialSettings.audio);
  const transport = new Transport(engine, { createTimer: (tick) => new AudioScheduler(tick) });
  transport.setBpm(initialSettings.lastBpm);
  transport.setCountInBars(initialSettings.countInBars);
  transport.setClickSubdivisions(initialSettings.audio.clickSubdivisions);

  // Se o navegador suspender o áudio no meio da reprodução, pausa e avisa.
  engine.subscribe(() => {
    const status = engine.status;
    if (transport.isActive && status !== 'running' && status !== 'idle') {
      transport.interrupt('O áudio foi interrompido pelo navegador. Clique em Retomar para continuar.');
    }
  });

  services = {
    engine,
    transport,
    exercises: new SyncedExerciseRepository(new LocalStorageExerciseRepository(), new HttpRemoteStore()),
    settingsRepo,
    initialSettings,
    recorder: new Recorder(engine, transport),
  };
  // Acesso para depuração no console durante o desenvolvimento.
  if (import.meta.env.DEV) (window as unknown as { __drumflow?: Services }).__drumflow = services;
  return services;
}
