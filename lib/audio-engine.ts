import { findAudio } from './icedrive-dom';
import { cloneEq, DEFAULT_EQ, EQ_FREQUENCIES, type EqSettings } from './equalizer';

/**
 * off          equalizer switched off
 * waiting      on, but nothing to process yet (no song open, or audio not ready)
 * checking     on, testing whether this song can be processed
 * active       the song plays through the equalizer
 * unavailable  this song can't be processed (Icedrive's server doesn't allow it)
 */
export type EqStatus = 'off' | 'waiting' | 'checking' | 'active' | 'unavailable';

export interface AudioEngineDeps {
  createContext?: () => AudioContext;
  /** True if `url` may be read by this page (CORS). */
  probeCors?: (url: string) => Promise<boolean>;
  /** How long to wait for audio after reloading it in CORS mode. */
  reloadTimeoutMs?: number;
}

/** Peaking filters are this wide; shelves sit at the two ends. */
const BAND_Q = 1.4;
/** Seconds for gain changes to settle, so moving a slider doesn't click. */
const RAMP_S = 0.03;
const RESUME_TIMEOUT_MS = 500;

const dbToGain = (db: number) => 10 ** (db / 20);

/**
 * Asks for the file the way the <audio> element will after it switches to
 * CORS mode (no cookies), and stops as soon as the headers arrive. Content
 * scripts are subject to the page's CORS rules, so this answers exactly
 * "may the page read this audio?" without touching the real player.
 */
export async function probeCors(url: string): Promise<boolean> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 10_000);
  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit', cache: 'no-store', signal: abort.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
    abort.abort(); // drop the rest of the body
  }
}

/**
 * Sends Icedrive's <audio> through a 10-band equalizer (Web Audio API).
 *
 * Icedrive streams songs from another host (*.icedrive.io) without CORS
 * mode. Web Audio outputs silence for such audio, so before routing a song
 * we check that the host allows CORS, switch the element to
 * crossorigin="anonymous" and reload it at the same position. If the host
 * refuses, the song keeps playing untouched and the status says
 * "unavailable". Nothing is routed while the equalizer is off.
 */
export class AudioEngine {
  private settings: EqSettings = cloneEq(DEFAULT_EQ);
  private ctx: AudioContext | null = null;
  private preamp: GainNode | null = null;
  private filters: BiquadFilterNode[] = [];
  private limiter: DynamicsCompressorNode | null = null;
  private readonly sources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();
  private unavailable = new WeakSet<HTMLMediaElement>();
  private routed: HTMLMediaElement | null = null;
  private checking: HTMLMediaElement | null = null;
  /** CORS verdict per audio host, so each song doesn't need a new probe. */
  private readonly corsByOrigin = new Map<string, boolean>();
  private readonly createContext: () => AudioContext;
  private readonly probe: (url: string) => Promise<boolean>;
  private readonly reloadTimeoutMs: number;

  /** Called after the user changes the equalizer, so the caller can save it. */
  onSettingsChange?: (settings: EqSettings) => void;

  constructor(
    private readonly doc: Document = document,
    deps: AudioEngineDeps = {},
  ) {
    this.createContext = deps.createContext ?? (() => new AudioContext());
    this.probe = deps.probeCors ?? probeCors;
    this.reloadTimeoutMs = deps.reloadTimeoutMs ?? 15_000;
  }

  getSettings(): EqSettings {
    return cloneEq(this.settings);
  }

  /** Applies saved settings (does not call onSettingsChange). */
  setSettings(settings: EqSettings): void {
    const wasEnabled = this.settings.enabled;
    this.settings = cloneEq(settings);
    if (this.settings.enabled && !wasEnabled) {
      // Switching on again retries songs and hosts that were refused before.
      this.corsByOrigin.clear();
      this.unavailable = new WeakSet();
    }
    this.applyCurve();
    this.sync();
  }

  /** A change made by the user. */
  update(settings: EqSettings): void {
    this.setSettings(settings);
    this.onSettingsChange?.(this.getSettings());
  }

  getStatus(): EqStatus {
    if (!this.settings.enabled) return 'off';
    const audio = findAudio(this.doc);
    if (!audio) return 'waiting';
    if (this.unavailable.has(audio)) return 'unavailable';
    if (this.sources.has(audio) && this.ctx?.state === 'running') return 'active';
    if (this.checking === audio) return 'checking';
    return 'waiting';
  }

  /**
   * Routes the current song through the equalizer if it should be. Cheap and
   * safe to call often; the content script calls it on media events and on a timer.
   */
  sync(): void {
    if (this.ctx?.state === 'suspended' && this.routed) void this.ctx.resume().catch(() => {});
    if (!this.settings.enabled) return;
    const audio = findAudio(this.doc);
    if (!audio || this.sources.has(audio) || this.unavailable.has(audio) || this.checking) return;
    this.checking = audio;
    void this.route(audio).finally(() => {
      if (this.checking === audio) this.checking = null;
    });
  }

  /** Listens for new songs and plays, so routing happens as early as possible. */
  watch(): () => void {
    const onMedia = (e: Event) => {
      if (e.target instanceof HTMLMediaElement) this.sync();
    };
    const events = ['loadedmetadata', 'play', 'playing'];
    for (const type of events) this.doc.addEventListener(type, onMedia, true);
    return () => {
      for (const type of events) this.doc.removeEventListener(type, onMedia, true);
    };
  }

  private async route(audio: HTMLMediaElement): Promise<void> {
    try {
      const src = audio.currentSrc || audio.src || audio.querySelector('source')?.src || '';
      if (!src) return; // not loaded yet; the next sync tries again
      if (!(await this.ensureRunning())) return; // no user gesture yet; try again on the next play/click
      const cors = await this.corsReady(audio, src);
      if (cors === 'later') return;
      if (cors === 'no') {
        this.unavailable.add(audio);
        return;
      }
      if (findAudio(this.doc) !== audio || this.sources.has(audio)) return;
      const source = this.ctx!.createMediaElementSource(audio);
      source.connect(this.preamp!);
      if (this.routed && this.routed !== audio) this.sources.get(this.routed)?.disconnect();
      this.sources.set(audio, source);
      this.routed = audio;
    } catch (err) {
      console.warn('[Icedrive Music Player+] Equalizer could not attach to this song.', err);
      this.unavailable.add(audio);
    }
  }

  /** Creates the audio graph on first use and makes sure it is running. */
  private async ensureRunning(): Promise<boolean> {
    if (!this.ctx) {
      const ctx = this.createContext();
      this.preamp = ctx.createGain();
      this.filters = EQ_FREQUENCIES.map((frequency, i) => {
        const f = ctx.createBiquadFilter();
        f.type = i === 0 ? 'lowshelf' : i === EQ_FREQUENCIES.length - 1 ? 'highshelf' : 'peaking';
        f.frequency.value = frequency;
        f.Q.value = BAND_Q;
        return f;
      });
      // A limiter at the end catches peaks from boosted bands instead of clipping.
      this.limiter = ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -1;
      this.limiter.knee.value = 0;
      this.limiter.ratio.value = 20;
      this.limiter.attack.value = 0.003;
      this.limiter.release.value = 0.25;
      let node: AudioNode = this.preamp;
      for (const f of this.filters) {
        node.connect(f);
        node = f;
      }
      node.connect(this.limiter);
      this.limiter.connect(ctx.destination);
      this.ctx = ctx;
      this.applyCurve();
    }
    if (this.ctx.state !== 'running') {
      await Promise.race([
        this.ctx.resume().catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, RESUME_TIMEOUT_MS)),
      ]);
    }
    return this.ctx.state === 'running';
  }

  /**
   * "yes" when Web Audio may read this song, "no" when it never will, and
   * "later" when it can't be decided yet.
   */
  private async corsReady(audio: HTMLMediaElement, src: string): Promise<'yes' | 'no' | 'later'> {
    let url: URL;
    try {
      url = new URL(src, this.doc.baseURI);
    } catch {
      return 'no';
    }
    const pageOrigin = this.doc.location?.origin;
    if (url.protocol === 'blob:' || url.protocol === 'data:' || url.origin === pageOrigin) return 'yes';
    if (audio.crossOrigin === 'anonymous') return audio.error ? 'no' : 'yes';
    if (url.protocol !== 'https:') return 'no';

    let allowed = this.corsByOrigin.get(url.origin);
    if (allowed === undefined) {
      allowed = await this.probe(url.href);
      this.corsByOrigin.set(url.origin, allowed);
    }
    if (!allowed) return 'no';
    if (findAudio(this.doc) !== audio) return 'later';
    return (await this.reloadWithCors(audio)) ? 'yes' : 'no';
  }

  /**
   * Switches the element to CORS mode and reloads it where it was. If the
   * reload fails, it goes back to how Icedrive set it up.
   */
  private reloadWithCors(audio: HTMLMediaElement): Promise<boolean> {
    const time = audio.currentTime;
    const resume = !audio.paused || audio.autoplay;
    const restore = () => {
      if (time > 0) audio.currentTime = time;
      if (resume) void audio.play()?.catch(() => {});
    };
    return new Promise((resolve) => {
      const finish = (ok: boolean) => {
        clearTimeout(timer);
        audio.removeEventListener('loadedmetadata', onLoaded);
        audio.removeEventListener('error', onError, true);
        resolve(ok);
      };
      const onLoaded = () => {
        restore();
        finish(true);
      };
      // Capturing also catches errors fired on <source> children.
      const onError = () => {
        audio.removeAttribute('crossorigin');
        audio.addEventListener('loadedmetadata', restore, { once: true });
        audio.load();
        finish(false);
      };
      const timer = setTimeout(() => finish(false), this.reloadTimeoutMs);
      audio.addEventListener('loadedmetadata', onLoaded);
      audio.addEventListener('error', onError, true);
      audio.crossOrigin = 'anonymous';
      audio.load();
    });
  }

  /** Pushes the settings into the audio graph. Off means every stage at 0 dB. */
  private applyCurve(): void {
    const ctx = this.ctx;
    if (!ctx || !this.preamp) return;
    const on = this.settings.enabled;
    const at = ctx.currentTime;
    this.preamp.gain.setTargetAtTime(on ? dbToGain(this.settings.preamp) : 1, at, RAMP_S);
    this.filters.forEach((f, i) => f.gain.setTargetAtTime(on ? (this.settings.gains[i] ?? 0) : 0, at, RAMP_S));
    // Off: a threshold of 0 dBFS leaves normal audio alone.
    if (this.limiter) this.limiter.threshold.value = on ? -1 : 0;
  }
}
