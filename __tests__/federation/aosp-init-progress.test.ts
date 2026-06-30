import { describe, it, expect } from 'vitest';
import type { InitProgress } from '../../src/federation/types';

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
