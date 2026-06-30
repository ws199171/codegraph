/** Messages from main thread to worker */
export type ShimmerWorkerMessage =
  | { type: 'update'; phase: string; phaseName: string; percent: number; count: number }
  | { type: 'finish-phase' }
  | { type: 'stop' };

/** Messages from worker to main thread */
export type ShimmerMainMessage =
  | { type: 'stopped' };

/** Messages for the AOSP multi-repo shimmer worker (three-line display) */
export type AospShimmerWorkerMessage =
  | { type: 'update'; repoLine: string; phaseName: string; percent: number; count: number; etaLine: string }
  | { type: 'summary'; lines: string[] }
  | { type: 'resize'; cols: number }
  | { type: 'stop' };

/** Messages from AOSP worker to main thread */
export type AospShimmerMainMessage =
  | { type: 'stopped' };
