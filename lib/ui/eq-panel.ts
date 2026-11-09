import type { EqStatus } from '../audio-engine';
import {
  CUSTOM_PRESET,
  EQ_FREQUENCIES,
  EQ_MAX_DB,
  EQ_MIN_DB,
  EQ_PRESETS,
  formatDb,
  formatFrequency,
  type EqSettings,
} from '../equalizer';
import { el, setRangeFill } from './dom';

/**
 * The equalizer panel, built and drawn the same way in Icedrive's player and
 * in the popup / mini player. Only how changes are sent differs, so that is
 * passed in as EqActions.
 */
export interface EqActions {
  setEq(patch: Partial<EqSettings>): void;
  preset(id: string): void;
}

export const EQ_STATUS_TEXT: Record<EqStatus, string> = {
  off: '',
  waiting: 'Starts with the next song you play.',
  checking: 'Connecting…',
  active: 'Active',
  unavailable: "Can't process this song: Icedrive's server doesn't allow it. It plays without EQ.",
};

function bandSlider(doc: Document, key: string, label: string, freqText: string): HTMLElement {
  const input = el(doc, 'input', {
    class: 'range',
    type: 'range',
    min: String(EQ_MIN_DB),
    max: String(EQ_MAX_DB),
    step: '0.5',
    value: '0',
    'aria-label': label,
    'data-band': key,
  });
  // Bands fill from 0 dB (the middle), not from the bottom.
  input.style.setProperty('--from', '50%');
  return el(
    doc,
    'div',
    { class: key === 'preamp' ? 'band preamp' : 'band' },
    el(doc, 'span', { class: 'db', 'data-db': key }, '0'),
    el(doc, 'div', { class: 'slot' }, input),
    el(doc, 'span', { class: 'freq' }, freqText),
  );
}

export function buildEqPanel(doc: Document): HTMLElement {
  const presetSelect = el(doc, 'select', { class: 'select', 'data-eq': 'preset', 'aria-label': 'Equalizer preset' });
  for (const [id, preset] of Object.entries(EQ_PRESETS)) presetSelect.append(el(doc, 'option', { value: id }, preset.label));
  presetSelect.append(el(doc, 'option', { value: CUSTOM_PRESET, disabled: '' }, 'Custom'));

  const bands = el(doc, 'div', { class: 'bands', 'data-eq': 'bands' }, bandSlider(doc, 'preamp', 'Preamp', 'Pre'));
  EQ_FREQUENCIES.forEach((hz, i) => bands.append(bandSlider(doc, String(i), `${formatFrequency(hz)}Hz`, formatFrequency(hz))));

  return el(
    doc,
    'section',
    { class: 'card eq-panel', 'aria-label': 'Equalizer' },
    el(
      doc,
      'div',
      { class: 'eq-head' },
      el(
        doc,
        'label',
        { class: 'switch' },
        el(doc, 'input', { type: 'checkbox', 'data-eq': 'on', 'aria-label': 'Equalizer' }),
        el(doc, 'span', { class: 'switch-text', 'data-short': 'EQ' }, 'Equalizer'),
      ),
      presetSelect,
      el(doc, 'button', { type: 'button', class: 'text-btn', 'data-eq': 'reset', title: 'Set every band to 0 dB' }, 'Reset'),
      el(doc, 'span', { class: 'grow' }),
      el(doc, 'span', { class: 'eq-status', 'data-eq': 'status', role: 'status' }),
    ),
    bands,
  );
}

/** Draws the settings into the panel, leaving alone a slider that's being dragged. */
export function renderEqPanel(
  panel: HTMLElement,
  eq: EqSettings,
  status: EqStatus,
  dragging: HTMLInputElement | null = null,
): void {
  const q = <T extends Element>(sel: string) => panel.querySelector<T>(sel)!;
  q<HTMLInputElement>('[data-eq="on"]').checked = eq.enabled;
  q<HTMLSelectElement>('[data-eq="preset"]').value = eq.preset;
  q('[data-eq="bands"]').classList.toggle('off', !eq.enabled);
  const statusEl = q<HTMLElement>('[data-eq="status"]');
  statusEl.textContent = EQ_STATUS_TEXT[status];
  statusEl.dataset.status = status;
  statusEl.classList.toggle('warn', status === 'unavailable');
  const values: [string, number][] = [['preamp', eq.preamp], ...eq.gains.map((g, i): [string, number] => [String(i), g])];
  for (const [key, value] of values) {
    const input = q<HTMLInputElement>(`input[data-band="${key}"]`);
    if (input !== dragging) input.value = String(value);
    setRangeFill(input);
    q(`[data-db="${key}"]`).textContent = formatDb(Number(input.value));
  }
}

/**
 * Hooks the panel's controls to `actions`. `current` gives the latest
 * settings (to change one band of them); `onDrag` reports which slider is
 * held, so rendering skips it. Events synthesized by page scripts are ignored.
 */
export function wireEqPanel(
  panel: HTMLElement,
  actions: EqActions,
  current: () => EqSettings | null,
  onDrag: (input: HTMLInputElement | null) => void,
): void {
  panel.addEventListener('input', (e) => {
    const input = e.target;
    if (!e.isTrusted || !(input instanceof HTMLInputElement) || !input.dataset.band) return;
    onDrag(input);
    setRangeFill(input);
    panel.querySelector(`[data-db="${input.dataset.band}"]`)!.textContent = formatDb(Number(input.value));
    const value = Number(input.value);
    if (input.dataset.band === 'preamp') {
      actions.setEq({ preamp: value });
    } else {
      const eq = current();
      if (!eq) return;
      const gains = [...eq.gains];
      gains[Number(input.dataset.band)] = value;
      actions.setEq({ gains });
    }
  });
  panel.addEventListener('change', (e) => {
    if (!e.isTrusted) return;
    const target = e.target as HTMLElement;
    if (target instanceof HTMLInputElement && target.dataset.eq === 'on') actions.setEq({ enabled: target.checked });
    else if (target instanceof HTMLSelectElement && target.dataset.eq === 'preset') actions.preset(target.value);
    else if (target instanceof HTMLInputElement && target.dataset.band) onDrag(null);
  });
  panel.addEventListener('click', (e) => {
    if (!e.isTrusted) return;
    if ((e.target as Element).closest('[data-eq="reset"]')) actions.preset('flat');
  });
}
