import { parentPort, workerData } from 'worker_threads';
import { writeSync } from 'fs';
import { getGlyphs } from './glyphs';
import type { AospShimmerWorkerMessage, AospWorkerSlot } from './types';

function writeStdout(s: string): void {
  writeSync(1, s);
}

const G = getGlyphs();
const SPINNER_GLYPHS = G.spinner;
const ANIM_INTERVAL = 150;
const FRAMES_PER_GLYPH = 3;
const BAR_WIDTH = 16;

const RST = '\x1b[0m';
const DM = '\x1b[2m';
const BOLD = '\x1b[1m';

const startTime: number = workerData.startTime;

function animFrame(): number {
  return Math.floor((Date.now() - startTime) / ANIM_INTERVAL);
}

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function shimmerColor(frame: number, offset: number): string {
  const t = (Math.sin((frame + offset * 7) * 2 * Math.PI / 13) + 1) / 2;
  const r = lerp(140, 251, t);
  const g = lerp(90, 191, t);
  const b = lerp(9, 36, t);
  return `\x1b[38;2;${r};${g};${b}m${BOLD}`;
}

function renderBar(frame: number, filled: number, empty: number, _offset: number): string {
  if (filled === 0) return `${DM}${G.barEmpty.repeat(empty)}${RST}`;
  const cycleFrames = 24;
  const shimmerPos = ((frame % cycleFrames) / cycleFrames) * (filled + 6) - 3;
  const shimmerWidth = 3;
  let bar = '';
  for (let i = 0; i < filled; i++) {
    const dist = Math.abs(i - shimmerPos);
    const t = Math.max(0, 1 - dist / shimmerWidth);
    const r = lerp(140, 251, t);
    const g = lerp(90, 191, t);
    const b = lerp(9, 36, t);
    bar += `\x1b[38;2;${r};${g};${b}m${BOLD}${G.barFilled}`;
  }
  bar += `${RST}${DM}${G.barEmpty.repeat(empty)}${RST}`;
  return bar;
}

// ── Mutable state ──
let currentHeader = '';
let currentEta = '';
let currentSlots: AospWorkerSlot[] = [];
let renderedLines = 0;
let rendered = false;

function render(): void {
  if (currentSlots.length === 0) return;

  const frame = animFrame();
  const lines: string[] = [];

  // Header line
  const headerText = currentHeader ? `  ${BOLD}AOSP Init${RST}  ${currentHeader}` : `  ${BOLD}AOSP Init${RST}`;
  const etaText = currentEta ? `  ${DM}${currentEta}${RST}` : '';
  lines.push(`${headerText}${etaText ? '  ' + etaText : ''}`);

  // One line per worker slot
  for (const slot of currentSlots) {
    const glyphIdx = Math.floor((frame + slot.id * 3) / FRAMES_PER_GLYPH) % SPINNER_GLYPHS.length;
    const glyph = SPINNER_GLYPHS[glyphIdx] ?? '.';
    const color = shimmerColor(frame, slot.id);

    // Truncate repo name to fit
    const maxName = 28;
    const repoName = slot.repoName.length > maxName
      ? slot.repoName.slice(0, maxName - 2) + '..'
      : slot.repoName.padEnd(maxName);

    let progress = '';
    if (slot.phaseName && slot.percent >= 0) {
      const filled = Math.round(BAR_WIDTH * slot.percent / 100);
      const empty = BAR_WIDTH - filled;
      progress = ` ${renderBar(frame, filled, empty, slot.id)} ${String(slot.percent).padStart(3)}%`;
    } else if (slot.phaseName && slot.count > 0) {
      progress = ` ${String(slot.count).padStart(5)} files`;
    } else if (slot.phaseName) {
      progress = ` ${slot.phaseName}`;
    }

    const idx = `[${String(slot.id).padStart(3)}]`;
    lines.push(`  ${color}${glyph}${RST} ${idx} ${repoName}${progress}`);
  }

  // Cursor control
  let output = '';
  if (rendered) {
    output = `\x1b[${renderedLines}A\r`;
  } else {
    output = '\x1b[?25l';
    rendered = true;
  }

  for (let i = 0; i < lines.length; i++) {
    output += `\x1b[K${lines[i]}`;
    if (i < lines.length - 1) output += '\n';
  }
  renderedLines = lines.length;

  writeStdout(output);
}

// ── Render loop ──
const tickInterval = setInterval(render, 50);

// ── Message handler ──
parentPort!.on('message', (msg: AospShimmerWorkerMessage) => {
  if (msg.type === 'update') {
    currentHeader = msg.header;
    currentEta = msg.etaLine;
    currentSlots = msg.slots;
  } else if (msg.type === 'summary') {
    clearInterval(tickInterval);
    if (rendered && renderedLines > 0) {
      let clear = '';
      for (let i = 0; i < renderedLines; i++) clear += '\x1b[K\n';
      writeStdout(`\x1b[${renderedLines}A\r${clear}\x1b[${renderedLines}A\r`);
      rendered = false;
      renderedLines = 0;
    }
    for (const line of msg.lines) writeStdout(`${line}\n`);
    writeStdout('\x1b[?25h');
    parentPort!.postMessage({ type: 'stopped' });
  } else if (msg.type === 'resize') {
    // terminalCols = msg.cols; (reserved for future width-aware rendering)
  } else if (msg.type === 'stop') {
    clearInterval(tickInterval);
    if (rendered && renderedLines > 0) {
      let clear = '';
      for (let i = 0; i < renderedLines; i++) clear += '\x1b[K\n';
      writeStdout(`\x1b[${renderedLines}A\r${clear}\x1b[${renderedLines}A\r`);
    }
    writeStdout('\x1b[?25h');
    parentPort!.postMessage({ type: 'stopped' });
  }
});
