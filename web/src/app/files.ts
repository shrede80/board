import { isPhone } from '../lib/device';
import { download } from '../lib/util';
import { toast } from './state';

/**
 * Saving a file the user asked for (UPDATE-4 أ2). On the laptop it is an ordinary download. On the
 * phone it opens the system share sheet (save to Files, WhatsApp…). A share sheet must start from
 * a tap; if the file took long to build and the browser has forgotten the tap, a toast offers a
 * «شارك» button (a fresh tap) instead of failing. Without share support it downloads as before.
 */
export async function saveFile(name: string, blob: Blob, doneMsg: string): Promise<'shared' | 'downloaded' | 'later' | 'cancelled'> {
  const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (!isPhone() || !nav.share || !nav.canShare?.({ files: [file] })) {
    download(name, blob, blob.type);
    toast(doneMsg);
    return 'downloaded';
  }
  try {
    await nav.share({ files: [file], title: name });
    toast(doneMsg);
    return 'shared';
  } catch (e) {
    if ((e as DOMException)?.name === 'AbortError') return 'cancelled'; // the user closed the sheet
    // the tap was forgotten (long build): one more tap shares it
    toast(`${doneMsg}. اضغط «شارك» لحفظه`, {
      ms: 20_000,
      actions: [{ label: 'شارك', testid: 'toast-share', run: () => void nav.share({ files: [file], title: name }).catch(() => download(name, blob, blob.type)) }],
    });
    return 'later';
  }
}
