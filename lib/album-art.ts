/** Longest side of the copy sent to the popup; keeps messages small. */
const MAX_SIZE = 320;

let cached: { sourceUrl: string; dataUrl: string | null } | null = null;

/**
 * Turns Icedrive's album art (a blob: URL that only works inside the page)
 * into a downscaled data: URL the popup can display.
 */
export async function artToDataUrl(sourceUrl: string | null): Promise<string | null> {
  if (!sourceUrl) return null;
  if (cached?.sourceUrl === sourceUrl) return cached.dataUrl;
  let dataUrl: string | null = null;
  try {
    const blob = await (await fetch(sourceUrl)).blob();
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, MAX_SIZE / Math.max(bitmap.width, bitmap.height));
    const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const out = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
    dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(out);
    });
  } catch (err) {
    console.warn('[Icedrive Music Player+] Could not read album art', err);
  }
  cached = { sourceUrl, dataUrl };
  return dataUrl;
}
