import { describe, expect, it } from 'vitest';
import { formatRelativeTime } from './relativeTime';

describe('formatRelativeTime', () => {
  const now = Date.UTC(2026, 5, 30, 12, 0, 0);

  it('returns "just now" for sub-minute deltas', () => {
    expect(formatRelativeTime(now - 30 * 1000, now)).toBe('just now');
    expect(formatRelativeTime(now, now)).toBe('just now');
  });

  it('formats minutes', () => {
    expect(formatRelativeTime(now - 5 * 60 * 1000, now)).toBe('5m');
    expect(formatRelativeTime(now - 59 * 60 * 1000, now)).toBe('59m');
  });

  it('formats hours', () => {
    expect(formatRelativeTime(now - 2 * 60 * 60 * 1000, now)).toBe('2h');
    expect(formatRelativeTime(now - 23 * 60 * 60 * 1000, now)).toBe('23h');
  });

  it('formats days', () => {
    expect(formatRelativeTime(now - 1 * 24 * 60 * 60 * 1000, now)).toBe('1d');
    expect(formatRelativeTime(now - 29 * 24 * 60 * 60 * 1000, now)).toBe('29d');
  });

  it('formats months', () => {
    expect(formatRelativeTime(now - 3 * 30 * 24 * 60 * 60 * 1000, now)).toBe('3mo');
  });

  it('formats years', () => {
    expect(formatRelativeTime(now - 400 * 24 * 60 * 60 * 1000, now)).toBe('1y');
  });

  it('defaults `now` to Date.now() when omitted', () => {
    expect(formatRelativeTime(Date.now())).toBe('just now');
  });
});
