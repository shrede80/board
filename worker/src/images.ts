import { MAX_UPLOAD_BYTES } from '../../shared/schema';
import { BadRequest, OWNER_ID } from './rows';

const ALLOWED = new Set(['image/webp', 'image/jpeg', 'image/png', 'image/gif', 'image/avif']);
const THUMB_MAX = 2 * 1024 * 1024;

export const fullKey = (id: string) => `img/${id}`;
export const thumbKey = (id: string) => `img/${id}_t`;

/**
 * Upload = multipart form: `file` (the browser-compressed WebP, ≤ 2400px), `thumb` (480px WebP),
 * `width`, `height`. Type and size are checked here too, not only in the browser.
 */
export async function uploadImage(db: D1Database, bucket: R2Bucket, form: FormData): Promise<{ id: string; width: number; height: number }> {
  const file = form.get('file');
  const thumb = form.get('thumb');
  if (!(file instanceof File)) throw new BadRequest('file required');
  if (!ALLOWED.has(file.type)) throw new BadRequest('unsupported image type');
  if (file.size > MAX_UPLOAD_BYTES || file.size === 0) throw new BadRequest('image too large');
  if (thumb !== null && (!(thumb instanceof File) || !ALLOWED.has(thumb.type) || thumb.size > THUMB_MAX)) throw new BadRequest('bad thumbnail');
  const width = Math.max(0, Math.round(Number(form.get('width')) || 0));
  const height = Math.max(0, Math.round(Number(form.get('height')) || 0));
  if (!(await looksLikeImage(file))) throw new BadRequest('not an image');

  const id = `img-${crypto.randomUUID()}`;
  await bucket.put(fullKey(id), file.stream(), { httpMetadata: { contentType: file.type } });
  if (thumb instanceof File) await bucket.put(thumbKey(id), thumb.stream(), { httpMetadata: { contentType: thumb.type } });
  await db
    .prepare('INSERT INTO images (id, owner_id, r2_key, thumb_key, width, height, bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, OWNER_ID, fullKey(id), thumb instanceof File ? thumbKey(id) : null, width, height, file.size, Date.now())
    .run();
  return { id, width, height };
}

/** Magic-byte check so a renamed non-image can't be stored and served as one. */
async function looksLikeImage(f: File): Promise<boolean> {
  const h = new Uint8Array(await f.slice(0, 16).arrayBuffer());
  const s = (a: number, b: number) => String.fromCharCode(...h.slice(a, b));
  return (
    (s(0, 4) === 'RIFF' && s(8, 12) === 'WEBP') ||
    (h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff) ||
    (h[0] === 0x89 && s(1, 4) === 'PNG') ||
    s(0, 3) === 'GIF' ||
    s(4, 12).startsWith('ftypavi')
  );
}

export async function serveImage(bucket: R2Bucket, id: string, thumb: boolean): Promise<Response> {
  let obj = await bucket.get(thumb ? thumbKey(id) : fullKey(id));
  if (!obj && thumb) obj = await bucket.get(fullKey(id));
  if (!obj) return new Response('not found', { status: 404 });
  return new Response(obj.body, {
    headers: {
      'Content-Type': obj.httpMetadata?.contentType ?? 'image/webp',
      // Images never change after upload.
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
