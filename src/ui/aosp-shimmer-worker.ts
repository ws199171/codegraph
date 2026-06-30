import { parentPort, workerData } from 'worker_threads';
import { writeSync } from 'fs';
import { getGlyphs } from './glyphs';
import type { AospShimmerWorkerMessage } from './types';

// Write directly to fd 1 (stdout) — bypasses main thread event loop blocking.
// Same technique as shimmer-worker.ts for smooth animation during SQLite ops.
function writeStdout(s: string): void {
  writeSync(1, s);
}

const G = getGlyphs();
const SPINNER_GLYPHS = G.spinner;
const ANIM_INTERVAL = 150;
const FRAMES_PER_GLYPH = 3;
const BAR_WIDTH = 20;

const RST = '\x1b[0m';
const DM = '\x1b[2m';
const GRN = '\x1b[32m';
const RED = '\x1b[31m';
const BOLD = '\x1b[1m';

const startTime: number = workerData.startTime;

function animFrame(): number {
  return Math.floor((Date.now() - startTime) / ANIM_INTERVAL);
}

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function shimmerColor(frame: number): string {
  const t = (Math.sin(frame * 2 * Math.PI / 13) + 1) / 2;
  const r = lerp(160, 251, t);
  const g = lerp(100, 191, t);
  const b = lerp(9, 36, t);
  return `\x1b[38;2;${r};${g};${b}m${BOLD}`;
}

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function renderBar(frame: number, filled: number, empty: number): string {
  if (filled === 0) return `${DM}${G.barEmpty.repeat(empty)}${RST}`;
  const cycleFrames = 24;
  const shimmerPos = ((frame % cycleFrames) / cycleFrames) * (filled + 6) - 3;
  const shimmerWidth = 3;
  let bar = '';
  for (let i = 0; i < filled; i++) {
    const dist = Math.abs(i - shimmerPos);
    const t = Math.max(0, 1 - dist / shimmerWidth);
    const r = lerp(160, 251, t);
    const g = lerp(100, 191, t);
    const b = lerp(9, 36, t);
    bar += `\x1b[38;2;${r};${g};${b}m${BOLD}${G.barFilled}`;
  }
  bar += `${RST}${DM}${G.barEmpty.repeat(empty)}${RST}`;
  return bar;
}

// Mutable state for the three-line display
let currentRepoLine = '';
let currentPhaseName = '';
let lastPhaseName = ''; // Preserved across phase-name clear to avoid display flicker
let currentPercent = -1;
let currentCount = 0;
let currentEtaLine = '';
let terminalCols = 80;
let rendered = false; // Have we rendered at least once?
let renderedLines = 0; // Actual number of lines from last render (for cursor jump)

function render(): void {
  if (!currentRepoLine) return;

  const frame = animFrame();
  const glyphIdx = Math.floor(frame / FRAMES_PER_GLYPH) % SPINNER_GLYPHS.length;
  const glyph = SPINNER_GLYPHS[glyphIdx] ?? SPINNER_GLYPHS[0] ?? '.';
  const color = shimmerColor(frame);

  // Always produce exactly 3 lines — cursor movement depends on it
  const lines: string[] = [];

  // Line 1: repo line (dimmed label + bold repo info, truncated)
  {
    const maxRepoLen = Math.max(terminalCols - 30, 20);
    const truncatedRepo = currentRepoLine.length > maxRepoLen
      ? currentRepoLine.slice(0, maxRepoLen - 3) + '...'
      : currentRepoLine;
    lines.push(`  ${DM}AOSP Init${RST}  ${BOLD}${truncatedRepo}${RST}`);
  }

  // Line 2: phase line (spinner + shimmer bar + percent).
  // Preserve lastPhaseName so the phase line never disappears during repo transitions.
  {
    const phaseName = currentPhaseName || lastPhaseName || 'Initializing...';
    let phasePart: string;
    if (currentPhaseName && currentPercent >= 0) {
      const filled = Math.round(BAR_WIDTH * currentPercent / 100);
      const empty = BAR_WIDTH - filled;
      phasePart = `${phaseName}  ${renderBar(frame, filled, empty)}  ${currentPercent}%`;
    } else if (currentPhaseName && currentCount > 0) {
      phasePart = `${phaseName}  ${formatNumber(currentCount)} files found`;
    } else if (currentPhaseName) {
      phasePart = `${phaseName}...`;
    } else {
      phasePart = `${phaseName}`;
    }
    lines.push(`  ${DM}${G.rail}${RST}  ${color}${glyph}${RST} ${phasePart}`);
  }

  // Line 3: ETA line (dimmed)
  lines.push(`  ${DM}${currentEtaLine || 'Calculating...'}${RST}`);

  // Cursor control — use recorded line count from previous render
  let output = '';
  if (rendered) {
    output = `\x1b[${renderedLines}A`; // Move up by exact number of previously rendered lines
  } else {
    output = '\x1b[?25l';
    rendered = true;
  }

  for (let i = 0; i < 3; i++) {
    output += `\x1b[K${lines[i]}`;
    if (i < 2) output += '\n';
  }
  renderedLines = 3;

  writeStdout(`\r${output}`);
}

function finishWithSummary(lines: string[]): void {
  // Clear the progress display using recorded line count
  if (rendered && renderedLines > 0) {
    writeStdout(`\x1b[${renderedLines}A`);
    for (let i = 0; i < renderedLines; i++) {
      writeStdout('\x1b[K\n');
    }
    writeStdout(`\x1b[${renderedLines}A\r`);
    rendered = false;
    renderedLines = 0;
  }

  // Output summary lines
  for (const line of lines) {
    if (line.startsWith('✅')) {
      writeStdout(`${GRN}${line}${RST}\n`);
    } else if (line.startsWith('❌')) {
      writeStdout(`${RED}${line}${RST}\n`);
    } else {
      writeStdout(`${line}\n`);
    }
  }

  writeStdout('\x1b[?25h');
}

// Render loop — independent of main thread
const tickInterval = setInterval(render, 50);

parentPort!.on('message', (msg: AospShimmerWorkerMessage) => {
  if (msg.type === 'update') {
    currentRepoLine = msg.repoLine || currentRepoLine;
    currentPhaseName = msg.phaseName;
    if (currentPhaseName) lastPhaseName = currentPhaseName;
    currentPercent = msg.percent;
    currentCount = msg.count;
    currentEtaLine = msg.etaLine || currentEtaLine;
  } else if (msg.type === 'summary') {
    clearInterval(tickInterval);
    finishWithSummary(msg.lines);
    parentPort!.postMessage({ type: 'stopped' });
  } else if (msg.type === 'resize') {
    terminalCols = msg.cols;
  } else if (msg.type === 'stop') {
    clearInterval(tickInterval);
    // Clear display and restore cursor using recorded count
    if (rendered && renderedLines > 0) {
      writeStdout(`\x1b[${renderedLines}A`);
      for (let i = 0; i < renderedLines; i++) {
        writeStdout('  \x1b[K\n');
      }
      writeStdout(`\x1b[${renderedLines}A\r`);
    }
    writeStdout('\x1b[?25h');
    parentPort!.postMessage({ type: 'stopped' });
  }
});
