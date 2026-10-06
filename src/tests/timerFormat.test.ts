import { describe, expect, it } from 'vitest';
import { formatClock, parseDuration } from '../components/playback-controls/PracticeTimer';
import { sanitizeSettings } from '../storage/SettingsRepository';

describe('cronômetro — formato', () => {
  it('formata o tempo restante', () => {
    expect(formatClock(300)).toBe('5:00');
    expect(formatClock(65.2)).toBe('1:06');
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(3725)).toBe('1:02:05');
  });

  it('interpreta a duração digitada', () => {
    expect(parseDuration('7')).toBe(420);
    expect(parseDuration('2:30')).toBe(150);
    expect(parseDuration('1:05:00')).toBe(3900);
    expect(parseDuration('1,5')).toBe(90);
    expect(parseDuration('abc')).toBeNull();
    expect(parseDuration('0:05')).toBeNull(); // mínimo 10 s
  });

  it('é salvo nas preferências', () => {
    expect(sanitizeSettings({ practiceTimerSeconds: 300 }).practiceTimerSeconds).toBe(300);
    expect(sanitizeSettings({ practiceTimerSeconds: -1 }).practiceTimerSeconds).toBeNull();
    expect(sanitizeSettings({}).practiceTimerSeconds).toBeNull();
  });
});
