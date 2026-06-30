/** Messages from main thread to worker */
export type ShimmerWorkerMessage =
  | { type: 'update'; phase: string; phaseName: string; percent: number; count: number }
  | { type: 'finish-phase' }
  | { type: 'stop' };

/** Messages from worker to main thread */
export type ShimmerMainMessage =
  | { type: 'stopped' };

/** Messages for the AOSP multi-repo shimmer worker (per-worker line display) */
export interface AospWorkerSlot {
  /** Worker index (0-based) */
  id: number;
  /** Short repo name (relative path) */
  repoName: string;
  /** Human-readable phase name (Scanning files / Parsing code / etc.) or empty if idle */
  phaseName: string;
  /** Percent complete (0-100) for progress bar, or -1 if unknown */
  percent: number;
  /** File count (alternative to percent when total unknown) */
  count: number;
}

export type AospShimmerWorkerMessage =
  | { type: 'update'; header: string; etaLine: string; slots: AospWorkerSlot[] }
  | { type: 'summary'; lines: string[] }
  | { type: 'resize'; cols: number }
  | { type: 'stop' };

/** Messages from AOSP worker to main thread */
export type AospShimmerMainMessage =
  | { type: 'stopped' };
