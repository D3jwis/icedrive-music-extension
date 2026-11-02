import type { PlayerController } from './player-controller';

const HOST_ID = 'icedrive-music-ext-controls';
const REFRESH_MS = 500;

const ICONS = {
  shuffle:
    '<path d="M10.59 9.17 5.41 4 4 5.41l5.17 5.17zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4zm.33 9.41-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04z"/>',
  prev: '<path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/>',
  next: '<path d="M6 18l8.5-6L6 6zM16 6v12h2V6z"/>',
  repeat: '<path d="M7 7h10v3l4-4-4-4v3H5v6h2zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2z"/>',
};

// Lives in a shadow root so Icedrive's CSS can't touch it and ours can't leak.
const STYLE = `
  :host { all: initial; display: block; }
  .bar {
    display: flex; justify-content: center; align-items: center; gap: 10px;
    padding: 8px 12px 0; font-family: system-ui, sans-serif;
  }
  button {
    position: relative; width: 36px; height: 36px; padding: 0; border: 0; border-radius: 50%;
    background: transparent; color: #c9cfdd; cursor: pointer; display: grid; place-items: center;
  }
  button:hover { background: rgba(255, 255, 255, 0.08); color: #fff; }
  button:focus-visible { outline: 2px solid #17a1a2; outline-offset: 2px; }
  button:disabled { opacity: 0.35; cursor: default; background: transparent; }
  svg { width: 22px; height: 22px; fill: currentColor; }
  .toggle svg { width: 19px; height: 19px; }
  .toggle { color: #7d869c; }
  .toggle[aria-pressed='true'] { color: #17a1a2; }
  .toggle[aria-pressed='true']::after {
    content: ''; position: absolute; bottom: 3px; left: 50%; width: 4px; height: 4px;
    margin-left: -2px; border-radius: 50%; background: currentColor;
  }
  .badge {
    position: absolute; top: 4px; right: 3px; min-width: 12px; height: 12px; border-radius: 6px;
    background: #17a1a2; color: #0d1220; font-size: 9px; font-weight: 700; line-height: 12px; text-align: center;
  }
  .badge[hidden] { display: none; }
`;

const REPEAT_LABELS = { off: 'wyłączone', all: 'cały folder', one: 'jeden utwór' } as const;

function button(id: string, label: string, icon: string, toggle = false): string {
  return `<button id="${id}" type="button" class="${toggle ? 'toggle' : ''}" aria-label="${label}" title="${label}"${
    toggle ? ' aria-pressed="false"' : ''
  }><svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>${id === 'repeat' ? '<span class="badge" hidden>1</span>' : ''}</button>`;
}

/**
 * Adds shuffle / previous / next / repeat buttons under Icedrive's own Plyr
 * player (which already has play, seek and volume). Icedrive rebuilds the
 * player for every song, so a MutationObserver re-attaches the bar.
 */
export function mountInPageControls(player: PlayerController, doc: Document = document): () => void {
  let root: ShadowRoot | null = null;

  const render = () => {
    if (!root?.host.isConnected) return;
    const state = player.getState();
    const q = <T extends HTMLElement>(sel: string) => root!.querySelector<T>(sel)!;
    const shuffle = q('#shuffle');
    shuffle.setAttribute('aria-pressed', String(state.settings.shuffle));
    shuffle.title = `Losowo: ${state.settings.shuffle ? 'włączone' : 'wyłączone'}`;
    const repeat = q('#repeat');
    repeat.setAttribute('aria-pressed', String(state.settings.repeat !== 'off'));
    repeat.title = `Powtarzanie: ${REPEAT_LABELS[state.settings.repeat]}`;
    q('.badge').hidden = state.settings.repeat !== 'one';
    q<HTMLButtonElement>('#next').disabled = !state.hasNext;
  };

  const attach = () => {
    const wrap = doc.querySelector('#preview .content .audio-wrap');
    if (!wrap || wrap.querySelector(`#${HOST_ID}`)) return;
    const host = doc.createElement('div');
    host.id = HOST_ID;
    root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${STYLE}</style><div class="bar" role="toolbar" aria-label="Icedrive Music Player+">${[
      button('shuffle', 'Losowo', ICONS.shuffle, true),
      button('prev', 'Poprzedni', ICONS.prev),
      button('next', 'Następny', ICONS.next),
      button('repeat', 'Powtarzanie', ICONS.repeat, true),
    ].join('')}</div>`;
    root.addEventListener('click', (e) => {
      const id = (e.target as Element).closest('button')?.id;
      if (id === 'shuffle') player.toggleShuffle();
      else if (id === 'prev') player.previous();
      else if (id === 'next') player.next();
      else if (id === 'repeat') player.cycleRepeat();
      render();
    });
    wrap.append(host);
    render();
  };

  const observer = new MutationObserver(attach);
  observer.observe(doc.body, { childList: true, subtree: true });
  attach();
  const timer = setInterval(render, REFRESH_MS);

  return () => {
    observer.disconnect();
    clearInterval(timer);
    doc.getElementById(HOST_ID)?.remove();
  };
}
