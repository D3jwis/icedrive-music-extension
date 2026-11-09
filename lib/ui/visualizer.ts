/**
 * The spectrum visualizer: segmented bars with small caps that hold the
 * peak and slowly fall, drawn on a <canvas>. Used in the popup, the mini
 * player and under Icedrive's player. Where the levels come from differs
 * (a message to the Icedrive tab, or the audio engine directly), so the
 * caller passes `read`.
 */

/** Storage key of the shared on/off setting. */
export const VISUALIZER_KEY = 'visualizer';

/** On unless switched off; anything odd in storage counts as the default. */
export const readVisualizerSetting = (value: unknown): boolean => value !== false;

/** Bars per pixel of width, so a wider canvas gets more (not fatter) bars. */
const BAR_PITCH_PX = 11;
const MIN_BARS = 12;
const MAX_BARS = 96;
const GAP_PX = 3;
/** Segment height and the gap under it (the "LED" look). */
const SEGMENT_PX = 2;
const SEGMENT_GAP_PX = 1;
/** How fast bars and caps fall, in canvas heights per second. */
const BAR_FALL = 2.4;
const CAP_FALL = 0.5;
/** Caps rest a moment at the top before falling. */
const CAP_HOLD_S = 0.35;
/** Smallest bar, so silence still shows a quiet row. */
const FLOOR = 0.04;

export const barsForWidth = (cssWidth: number) =>
  Math.max(MIN_BARS, Math.min(MAX_BARS, Math.round(cssWidth / BAR_PITCH_PX)));

export interface Visualizer {
  /** Shows bars, or a short "off" note when switched off. */
  setEnabled(on: boolean): void;
  stop(): void;
}

/**
 * Starts drawing into `canvas` on every animation frame. `read(bars)` gives
 * the latest levels (0..1), or null when there is nothing to show.
 */
export function createVisualizer(canvas: HTMLCanvasElement, read: (bars: number) => number[] | null): Visualizer {
  const g = canvas.getContext('2d');
  let enabled = true;
  let frame = 0;
  let last = 0;
  let levels: number[] = [];
  let caps: number[] = [];
  let holds: number[] = [];
  let gradient: CanvasGradient | null = null;
  let gradientFor = '';

  const resize = () => {
    const dpr = canvas.ownerDocument.defaultView?.devicePixelRatio ?? 1;
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return dpr;
  };

  const drawOff = (dpr: number) => {
    if (!g) return;
    g.fillStyle = '#6c7a96';
    g.font = `${11 * dpr}px system-ui, sans-serif`;
    g.textBaseline = 'middle';
    g.fillText('Visualizer off · click to turn on', 0, canvas.height / 2);
  };

  const draw = (now: number) => {
    frame = requestAnimationFrame(draw);
    if (!g || !canvas.isConnected) return;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
    last = now;
    const dpr = resize();
    const { width: w, height: h } = canvas;
    g.clearRect(0, 0, w, h);
    if (!w || !h) return;
    if (!enabled) return drawOff(dpr);

    const n = barsForWidth(canvas.clientWidth);
    if (levels.length !== n) {
      levels = new Array(n).fill(0);
      caps = new Array(n).fill(0);
      holds = new Array(n).fill(0);
    }
    const values = read(n);
    const key = `${h}`;
    if (gradientFor !== key) {
      gradient = g.createLinearGradient(0, h, 0, 0);
      gradient.addColorStop(0, '#0f6aa8');
      gradient.addColorStop(0.55, '#17a1a2');
      gradient.addColorStop(1, '#5ff0f5');
      gradientFor = key;
    }
    const gap = GAP_PX * dpr;
    const barW = (w - gap * (n - 1)) / n;
    const seg = SEGMENT_PX * dpr;
    const step = (SEGMENT_PX + SEGMENT_GAP_PX) * dpr;
    const usable = h - 3 * dpr; // room for the caps
    for (let i = 0; i < n; i++) {
      const target = Math.max(FLOOR, values?.[i] ?? 0);
      levels[i] = Math.max(target, levels[i]! - BAR_FALL * dt);
      if (levels[i]! >= caps[i]!) {
        caps[i] = levels[i]!;
        holds[i] = CAP_HOLD_S;
      } else if ((holds[i]! -= dt) <= 0) {
        caps[i] = Math.max(levels[i]!, caps[i]! - CAP_FALL * dt);
      }
      const x = i * (barW + gap);
      const segments = Math.max(1, Math.round((levels[i]! * usable) / step));
      g.fillStyle = gradient!;
      for (let s = 0; s < segments; s++) g.fillRect(x, h - s * step - seg, barW, seg);
      g.fillStyle = 'rgba(255, 255, 255, 0.85)';
      g.fillRect(x, h - Math.max(1, Math.round((caps[i]! * usable) / step)) * step - 2 * dpr, barW, 1.5 * dpr);
    }
  };
  frame = requestAnimationFrame(draw);

  return {
    setEnabled(on) {
      enabled = on;
    },
    stop() {
      cancelAnimationFrame(frame);
    },
  };
}
