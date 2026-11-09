/** URL of the mini player: the popup page in its own small window. */
export const miniPlayerUrl = () => browser.runtime.getURL('/popup.html?detached=1');

/** Opens the mini player window, or focuses the one already open. */
export async function openMiniPlayer(): Promise<void> {
  const url = miniPlayerUrl();
  const contexts = await browser.runtime.getContexts({ contextTypes: ['TAB'], documentUrls: [url] });
  const existing = contexts.find((c) => c.windowId !== -1);
  if (existing) {
    await browser.windows.update(existing.windowId, { focused: true });
  } else {
    await browser.windows.create({ url, type: 'popup', width: 360, height: 640, focused: true });
  }
}
