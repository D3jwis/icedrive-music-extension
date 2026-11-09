import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine } from '../lib/audio-engine';
import { applyPreset, DEFAULT_EQ } from '../lib/equalizer';
import { PlayerController } from '../lib/player-controller';

const fixture = readFileSync(join(__dirname, 'fixtures/player.html'), 'utf8');

const param = (value = 0) => ({ value, setTargetAtTime: vi.fn(function (this: { value: number }, v: number) { this.value = v; }) });
const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });

/** Just enough of an AudioContext to see what the engine builds and routes. */
function fakeContext(state: AudioContextState = 'running') {
  const ctx = {
    state,
    currentTime: 0,
    destination: node(),
    resume: vi.fn(async () => {
      ctx.state = 'running';
    }),
    createGain: () => ({ ...node(), gain: param(1) }),
    createBiquadFilter: () => ({ ...node(), type: '', frequency: param(), Q: param(), gain: param() }),
    createDynamicsCompressor: () => ({ ...node(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }),
    createMediaElementSource: vi.fn((el: HTMLMediaElement) => ({ ...node(), el })),
    sampleRate: 48_000,
    createAnalyser: () => ({
      ...node(),
      fftSize: 2048,
      smoothingTimeConstant: 0,
      minDecibels: 0,
      maxDecibels: 0,
      frequencyBinCount: 1024,
      // Loud bass, silent treble.
      getByteFrequencyData: (data: Uint8Array) => data.forEach((_, i) => (data[i] = i < 10 ? 255 : 0)),
    }),
  };
  return ctx;
}

function audio() {
  return document.querySelector('audio') as HTMLAudioElement;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  document.body.innerHTML = fixture;
  // happy-dom doesn't load media; currentSrc comes from the <source> child.
  Object.defineProperty(audio(), 'currentSrc', { value: 'https://ice-eu-1.icedrive.io/download?p=x', configurable: true });
  audio().load = vi.fn(() => setTimeout(() => audio().dispatchEvent(new Event('loadedmetadata')), 0));
});

describe('AudioEngine', () => {
  it('does nothing while the equalizer is off', async () => {
    const createContext = vi.fn(() => fakeContext() as unknown as AudioContext);
    const engine = new AudioEngine(document, { createContext, probeCors: async () => true });
    engine.sync();
    await flush();
    expect(createContext).not.toHaveBeenCalled();
    expect(engine.getStatus()).toBe('off');
  });

  it('switches a CORS-enabled song to crossorigin mode and routes it', async () => {
    const ctx = fakeContext();
    const probeCors = vi.fn(async () => true);
    const engine = new AudioEngine(document, { createContext: () => ctx as unknown as AudioContext, probeCors });
    engine.setSettings(applyPreset({ ...DEFAULT_EQ, enabled: true }, 'rock'));
    await vi.waitFor(() => expect(engine.getStatus()).toBe('active'));
    expect(probeCors).toHaveBeenCalledWith('https://ice-eu-1.icedrive.io/download?p=x');
    expect(audio().crossOrigin).toBe('anonymous');
    expect(ctx.createMediaElementSource).toHaveBeenCalledWith(audio());
  });

  it('leaves the song alone when the host refuses CORS', async () => {
    const ctx = fakeContext();
    const engine = new AudioEngine(document, { createContext: () => ctx as unknown as AudioContext, probeCors: async () => false });
    engine.setSettings({ ...DEFAULT_EQ, enabled: true });
    await vi.waitFor(() => expect(engine.getStatus()).toBe('unavailable'));
    expect(audio().crossOrigin).toBeNull();
    expect(audio().load).not.toHaveBeenCalled();
    expect(ctx.createMediaElementSource).not.toHaveBeenCalled();
  });

  it('goes back to normal playback if the CORS reload fails', async () => {
    const ctx = fakeContext();
    audio().load = vi.fn(() => {
      if (audio().crossOrigin) setTimeout(() => audio().querySelector('source')!.dispatchEvent(new Event('error')), 0);
    });
    const engine = new AudioEngine(document, { createContext: () => ctx as unknown as AudioContext, probeCors: async () => true });
    engine.setSettings({ ...DEFAULT_EQ, enabled: true });
    await vi.waitFor(() => expect(engine.getStatus()).toBe('unavailable'));
    expect(audio().hasAttribute('crossorigin')).toBe(false);
    expect(audio().load).toHaveBeenCalledTimes(2);
    expect(ctx.createMediaElementSource).not.toHaveBeenCalled();
  });

  it('routes for the visualizer with the equalizer off, and reports the spectrum', async () => {
    const ctx = fakeContext();
    const engine = new AudioEngine(document, { createContext: () => ctx as unknown as AudioContext, probeCors: async () => true });
    expect(engine.getSpectrum(8)).toBeNull();
    engine.setAnalysing(true);
    await vi.waitFor(() => expect(ctx.createMediaElementSource).toHaveBeenCalledWith(audio()));
    expect(engine.getStatus()).toBe('off'); // the equalizer itself stays off
    const spectrum = engine.getSpectrum(8)!;
    expect(spectrum).toHaveLength(8);
    expect(spectrum[0]).toBe(1);
    expect(spectrum[7]).toBe(0);
  });

  it('waits for a user gesture instead of routing into a suspended context', async () => {
    const ctx = fakeContext('suspended');
    ctx.resume = vi.fn(async () => {}); // the browser refuses
    const engine = new AudioEngine(document, { createContext: () => ctx as unknown as AudioContext, probeCors: async () => true });
    engine.setSettings({ ...DEFAULT_EQ, enabled: true });
    await new Promise((r) => setTimeout(r, 600));
    expect(engine.getStatus()).toBe('waiting');
    expect(ctx.createMediaElementSource).not.toHaveBeenCalled();
  });
});

describe('volume and equalizer through the controller', () => {
  it('sets volume and mute on the audio element', () => {
    const player = new PlayerController(document);
    audio().muted = true;
    player.handle({ type: 'setVolume', volume: 0.3 });
    expect(audio().volume).toBeCloseTo(0.3);
    expect(audio().muted).toBe(false);
    player.handle({ type: 'toggleMute' });
    expect(player.getState()).toMatchObject({ muted: true });
  });

  it('sets the playback speed on the audio element', () => {
    const player = new PlayerController(document);
    expect(player.handle({ type: 'setSpeed', speed: 1.5 })).toMatchObject({ speed: 1.5 });
    expect(audio().playbackRate).toBe(1.5);
  });

  it('marks the preset custom when a band is moved and saves changes', () => {
    const engine = new AudioEngine(document, { createContext: () => fakeContext() as unknown as AudioContext, probeCors: async () => false });
    const saved = vi.fn();
    engine.onSettingsChange = saved;
    const player = new PlayerController(document, Math.random, engine);
    player.handle({ type: 'eqPreset', preset: 'pop' });
    expect(player.getState().eq.preset).toBe('pop');
    player.handle({ type: 'setEq', eq: { gains: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0] } });
    expect(player.getState().eq).toMatchObject({ preset: 'custom', gains: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
    expect(saved).toHaveBeenCalledTimes(2);
  });
});
