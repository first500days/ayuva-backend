import { extname } from 'node:path';

const EXT_BY_MIME: Readonly<Record<string, string>> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/webp': 'webp',
};

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'heic', 'webp', 'gif']);

/** What kind of file the code names: an image, any other record, or a partner licence. */
export type SystemFileKind = 'record' | 'credential';

/**
 * Platform name for an uploaded file, e.g. AYUVA-IMG-2FBC.jpg, AYUVA-REC-2FBC.pdf
 * or AYUVA-LIC-2FBC.pdf. Device filenames (IMG-20260830-WA0008.jpg) leak the
 * capture date and the app a photo came through, so storage keys and every
 * screen other than the patient's own vault use this name instead. It is
 * derived from the document id, so the same file always gets the same name.
 */
export function systemFileName(
  id: string,
  mimeType: string | undefined,
  fallbackName?: string,
  kind: SystemFileKind = 'record',
): string {
  const ext = (mimeType && EXT_BY_MIME[mimeType]) ?? extensionOf(fallbackName) ?? 'bin';
  const isImage = mimeType ? mimeType.startsWith('image/') : IMAGE_EXTS.has(ext);
  const code = kind === 'credential' ? 'LIC' : isImage ? 'IMG' : 'REC';
  return `AYUVA-${code}-${id.slice(-4).toUpperCase()}.${ext}`;
}

/** Lower-case extension of a filename, only if it looks like a real one. */
function extensionOf(name?: string): string | undefined {
  const ext = name ? extname(name).slice(1).toLowerCase() : '';
  return /^[a-z0-9]{1,5}$/.test(ext) ? ext : undefined;
}
