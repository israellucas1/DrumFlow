import type { AppSettings, ScrollMode, ThemeId } from '../music/types';
import { clampBpm, DEFAULT_BPM } from '../music/beatMath';
import { getDefaultStore, readJson, writeJson, type KeyValueStore } from './storage';
import { CLICK_SOUND_IDS, DRUM_KIT_IDS, type ClickSoundId, type DrumKitId } from '../audio/soundCatalog';

const KEY = 'drumflow.settings.v1';

export const DEFAULT_SETTINGS: AppSettings = {
  version: 1,
  audio: {
    masterVolume: 0.9,
    metronomeVolume: 0.8,
    metronomeEnabled: true,
    drumVolume: 0.7,
    drumEnabled: true,
    clickSubdivisions: false,
    clickSound: 'classic',
    drumKit: 'acoustic',
    backingVolume: 0.8,
  },
  view: { scrollMode: 'follow', zoom: 140, highlightUpcoming: true, display: 'grid' },
  defaultBpm: DEFAULT_BPM,
  lastBpm: DEFAULT_BPM,
  countInBars: 1,
  theme: 'dark',
  lastExerciseId: null,
  practiceTimerSeconds: null,
  backingTrackId: null,
};

/** Cronômetro: 10 s a 4 h, ou desligado. */
export function sanitizeTimer(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 10 ? Math.min(Math.round(v), 4 * 3600) : null;
}

const unit = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);

export function sanitizeSettings(raw: unknown): AppSettings {
  const d = DEFAULT_SETTINGS;
  if (!raw || typeof raw !== 'object') return structuredClone(d);
  const r = raw as Record<string, any>;
  const a = (r.audio ?? {}) as Record<string, unknown>;
  const v = (r.view ?? {}) as Record<string, unknown>;
  const scroll: ScrollMode = ['fixed', 'follow', 'ahead'].includes(v.scrollMode as string)
    ? (v.scrollMode as ScrollMode)
    : d.view.scrollMode;
  const theme: ThemeId = r.theme === 'light' ? 'light' : 'dark';
  return {
    version: 1,
    audio: {
      masterVolume: unit(a.masterVolume, d.audio.masterVolume),
      metronomeVolume: unit(a.metronomeVolume, d.audio.metronomeVolume),
      metronomeEnabled: bool(a.metronomeEnabled, d.audio.metronomeEnabled),
      drumVolume: unit(a.drumVolume, d.audio.drumVolume),
      drumEnabled: bool(a.drumEnabled, d.audio.drumEnabled),
      clickSubdivisions: bool(a.clickSubdivisions, d.audio.clickSubdivisions),
      clickSound: (CLICK_SOUND_IDS as readonly string[]).includes(a.clickSound as string)
        ? (a.clickSound as ClickSoundId)
        : d.audio.clickSound,
      drumKit: (DRUM_KIT_IDS as readonly string[]).includes(a.drumKit as string) ? (a.drumKit as DrumKitId) : d.audio.drumKit,
      backingVolume: unit(a.backingVolume, d.audio.backingVolume),
    },
    view: {
      scrollMode: scroll,
      zoom: typeof v.zoom === 'number' && Number.isFinite(v.zoom) ? Math.min(320, Math.max(60, v.zoom)) : d.view.zoom,
      highlightUpcoming: bool(v.highlightUpcoming, d.view.highlightUpcoming),
      display: v.display === 'staff' || v.display === 'both' ? v.display : 'grid',
    },
    defaultBpm: clampBpm(typeof r.defaultBpm === 'number' ? r.defaultBpm : d.defaultBpm),
    lastBpm: clampBpm(typeof r.lastBpm === 'number' ? r.lastBpm : d.lastBpm),
    countInBars: typeof r.countInBars === 'number' ? Math.min(4, Math.max(0, Math.round(r.countInBars))) : d.countInBars,
    theme,
    lastExerciseId: typeof r.lastExerciseId === 'string' ? r.lastExerciseId : null,
    practiceTimerSeconds: sanitizeTimer(r.practiceTimerSeconds),
    backingTrackId: typeof r.backingTrackId === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(r.backingTrackId) ? r.backingTrackId : null,
  };
}

export class SettingsRepository {
  constructor(private readonly store: KeyValueStore = getDefaultStore()) {}

  load(): AppSettings {
    const res = readJson(this.store, KEY);
    return sanitizeSettings(res.ok ? res.value : null);
  }

  save(settings: AppSettings): void {
    writeJson(this.store, KEY, settings);
  }
}
