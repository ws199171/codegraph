import { describe, it, expect } from 'vitest';
import type { InitProgress } from '../../src/federation/types';
import { computeETA } from '../../src/federation/repo-initializer';
import { formatETA, createAospProgress } from '../../src/ui/shimmer-progress';

describe('InitProgress type extension', () => {
  it('accepts new optional fields: repoPhase, repoCurrent, repoTotal, estimatedRemainingMs', () => {
    const progress: InitProgress = {
      completed: 1,
      total: 10,
      repoPhase: 'scanning',
      repoCurrent: 5,
      repoTotal: 100,
      estimatedRemainingMs: 60000,
    };
    expect(progress.repoPhase).toBe('scanning');
    expect(progress.repoCurrent).toBe(5);
    expect(progress.repoTotal).toBe(100);
    expect(progress.estimatedRemainingMs).toBe(60000);
  });

  it('remains backward-compatible without new fields', () => {
    const progress: InitProgress = {
      completed: 1,
      total: 10,
    };
    expect(progress.repoPhase).toBeUndefined();
    expect(progress.estimatedRemainingMs).toBeUndefined();
  });
});

describe('computeETA', () => {
  it('returns undefined when no successful durations', () => {
    expect(computeETA([], 10, 4)).toBeUndefined();
  });

  it('returns undefined when nothing remaining', () => {
    expect(computeETA([5000], 0, 4)).toBeUndefined();
  });

  it('computes ETA from single duration: avg * remaining / concurrency', () => {
    // 5000ms per repo, 10 remaining, 2 workers → 5000 * 10 / 2 = 25000
    expect(computeETA([5000], 10, 2)).toBe(25000);
  });

  it('uses only last 10 durations (sliding window)', () => {
    // 15 durations: first 5 are 100000ms (should be excluded), last 10 are 2000ms
    const durations = [
      ...Array(5).fill(100000),
      ...Array(10).fill(2000),
    ];
    // avg of last 10 = 2000, 20 remaining, 4 workers → 2000 * 20 / 4 = 10000
    expect(computeETA(durations, 20, 4)).toBe(10000);
  });

  it('handles fewer than 10 durations (uses all)', () => {
    // 3 durations: 3000, 5000, 4000 → avg = 4000, 6 remaining, 2 workers → 4000 * 6 / 2 = 12000
    expect(computeETA([3000, 5000, 4000], 6, 2)).toBe(12000);
  });

  it('treats concurrency 0 as 1 to avoid division by zero', () => {
    expect(computeETA([5000], 10, 0)).toBe(50000);
  });

  it('rounds to integer milliseconds', () => {
    // 3000 + 4000 = 7000, avg = 3500, 3 remaining, 7 workers → 3500 * 3 / 7 = 1500
    expect(computeETA([3000, 4000], 3, 7)).toBe(1500);
  });
});

describe('formatETA', () => {
  it('returns "Calculating ETA..." when undefined', () => {
    expect(formatETA(undefined)).toBe('Calculating ETA...');
  });

  it('formats seconds when < 60s', () => {
    expect(formatETA(30000)).toBe('ETA: ~30s remaining');
  });

  it('formats minutes when < 60min', () => {
    expect(formatETA(120000)).toBe('ETA: ~2 min remaining');
  });

  it('formats hours and minutes when >= 60min', () => {
    // 90 min = 5400000 ms → ~1h 30m
    expect(formatETA(5400000)).toBe('ETA: ~1h 30m remaining');
  });

  it('rounds seconds', () => {
    // 25500ms → ~26s (rounded)
    expect(formatETA(25500)).toBe('ETA: ~26s remaining');
  });
});

describe('createAospProgress', () => {
  it('returns object with onProgress, onSummary, and stop methods', () => {
    const progress = createAospProgress();
    expect(typeof progress.onProgress).toBe('function');
    expect(typeof progress.onSummary).toBe('function');
    expect(typeof progress.stop).toBe('function');
  });

  it('onProgress does not throw with full context', () => {
    const progress = createAospProgress();
    expect(() => {
      progress.onProgress({
        completed: 45,
        total: 1206,
        currentRepo: 'frameworks/base',
        repoPhase: 'parsing',
        repoCurrent: 500,
        repoTotal: 1000,
        estimatedRemainingMs: 1380000,
      });
    }).not.toThrow();
  });

  it('onProgress does not throw with minimal context', () => {
    const progress = createAospProgress();
    expect(() => {
      progress.onProgress({
        completed: 0,
        total: 10,
      });
    }).not.toThrow();
  });

  it('onSummary does not throw', () => {
    const progress = createAospProgress();
    expect(() => {
      progress.onSummary(['✅ 1200 repos indexed', '❌ 6 repos failed']);
    }).not.toThrow();
  });

  it('stop resolves and cleans up', async () => {
    const progress = createAospProgress();
    await expect(progress.stop()).resolves.toBeUndefined();
  });
});
