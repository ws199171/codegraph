import { Worker } from 'worker_threads';
import * as path from 'path';

const PHASE_NAMES: Record<string, string> = {
  scanning: 'Scanning files',
  parsing: 'Parsing code',
  storing: 'Storing data',
  resolving: 'Resolving refs',
};

export interface IndexProgress {
  phase: string;
  current: number;
  total: number;
}

export interface ShimmerProgress {
  onProgress: (progress: IndexProgress) => void;
  stop: () => Promise<void>;
}

export function createShimmerProgress(): ShimmerProgress {
  let lastPhase = '';

  const workerPath = path.join(__dirname, 'shimmer-worker.js');
  const worker = new Worker(workerPath, {
    workerData: { startTime: Date.now() },
  });

  return {
    onProgress(progress: IndexProgress) {
      const phaseName = PHASE_NAMES[progress.phase] || progress.phase;

      if (progress.phase !== lastPhase && lastPhase) {
        worker.postMessage({ type: 'finish-phase' });
      }
      lastPhase = progress.phase;

      let percent = -1;
      let count = 0;
      if (progress.total > 0) {
        percent = Math.round((progress.current / progress.total) * 100);
      } else if (progress.current > 0) {
        count = progress.current;
      }

      worker.postMessage({
        type: 'update',
        phase: progress.phase,
        phaseName,
        percent,
        count,
      });
    },

    stop() {
      return new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          worker.terminate().then(() => resolve());
        }, 2000);

        worker.on('message', (msg: { type: string }) => {
          if (msg.type === 'stopped') {
            clearTimeout(timeout);
            worker.terminate().then(() => resolve());
          }
        });

        worker.postMessage({ type: 'stop' });
      });
    },
  };
}

// =============================================================================
// AOSP Multi-Repo Progress (three-line display)
// =============================================================================

export interface AospProgressContext {
  completed: number;
  total: number;
  currentRepo?: string;
  repoPhase?: string;
  repoCurrent?: number;
  repoTotal?: number;
  estimatedRemainingMs?: number;
}

export interface AospShimmerProgress {
  onProgress: (ctx: AospProgressContext) => void;
  onSummary: (lines: string[]) => void;
  stop: () => Promise<void>;
}

/** Format ETA milliseconds into a human-readable string */
export function formatETA(ms: number | undefined): string {
  if (ms === undefined) return 'Calculating ETA...';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `ETA: ~${seconds}s remaining`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `ETA: ~${minutes} min remaining`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  return `ETA: ~${hours}h ${remMin}m remaining`;
}

export function createAospProgress(): AospShimmerProgress {
  let worker: Worker | null = null;
  let stopped = false;

  try {
    const workerPath = path.join(__dirname, 'aosp-shimmer-worker.js');
    worker = new Worker(workerPath, {
      workerData: { startTime: Date.now() },
    });
  } catch {
    // Worker spawn failed — return no-op fallback (design: graceful degradation)
    return {
      onProgress() {},
      onSummary() {},
      stop: async () => {},
    };
  }

  // Forward terminal resize events to worker
  const resizeHandler = (): void => {
    if (worker && !stopped) {
      worker.postMessage({ type: 'resize', cols: process.stdout.columns || 80 });
    }
  };
  process.on('SIGWINCH', resizeHandler);

  return {
    onProgress(ctx: AospProgressContext) {
      if (!worker || stopped) return;
      const phaseName = PHASE_NAMES[ctx.repoPhase || ''] || ctx.repoPhase || '';

      // Format repo line: [ 45 / 1206 ]  frameworks/base
      const repoLine = `[ ${formatNum(ctx.completed)} / ${formatNum(ctx.total)} ]${ctx.currentRepo ? '  ' + ctx.currentRepo : ''}`;

      // Compute percent and count for the worker to render the animated bar
      let percent = -1;
      let count = 0;
      if (ctx.repoTotal && ctx.repoTotal > 0) {
        percent = Math.round(((ctx.repoCurrent || 0) / ctx.repoTotal) * 100);
      } else if (ctx.repoCurrent && ctx.repoCurrent > 0) {
        count = ctx.repoCurrent;
      }

      // Format ETA line
      const etaLine = formatETA(ctx.estimatedRemainingMs);

      try {
        worker.postMessage({ type: 'update', repoLine, phaseName, percent, count, etaLine });
      } catch {
        // Worker may have terminated — silently ignore
      }
    },

    onSummary(lines: string[]) {
      if (!worker || stopped) return;
      try {
        worker.postMessage({ type: 'summary', lines });
      } catch {
        // Worker may have terminated — silently ignore
      }
    },

    stop() {
      stopped = true;
      process.off('SIGWINCH', resizeHandler);
      return new Promise<void>((resolve) => {
        if (!worker) { resolve(); return; }
        const timeout = setTimeout(() => {
          worker!.terminate().then(() => resolve());
        }, 2000);

        worker.on('message', (msg: { type: string }) => {
          if (msg.type === 'stopped') {
            clearTimeout(timeout);
            worker!.terminate().then(() => resolve());
          }
        });

        try {
          worker.postMessage({ type: 'stop' });
        } catch {
          clearTimeout(timeout);
          resolve();
        }
      });
    },
  };
}

function formatNum(n: number): string {
  return n.toLocaleString();
}
