import { Logger } from '@nestjs/common';
import { getDocumentProxy } from 'unpdf';

const logger = new Logger('DocumentText');

// Letterhead, dates and test names sit on the first pages; reading more only costs time.
const MAX_PAGES = 3;
const MAX_CHARS = 20_000;
const MAX_BYTES = 15 * 1024 * 1024;
const TIMEOUT_MS = 5_000;

/**
 * The text a document already carries: a PDF's text layer, first pages only.
 * Scanned PDFs and photos have none — reading those needs OCR, which arrives
 * with the AI gateway. Never throws: an unreadable file just yields "".
 */
export async function readDocumentText(
  buffer: Buffer,
  mimeType: string,
): Promise<string> {
  if (mimeType !== 'application/pdf' || buffer.length > MAX_BYTES) return '';
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      readPdfText(buffer),
      new Promise<string>((resolve) => {
        timer = setTimeout(() => resolve(''), TIMEOUT_MS);
      }),
    ]);
  } catch (err) {
    logger.debug(`No text layer read: ${(err as Error).message}`);
    return '';
  } finally {
    clearTimeout(timer);
  }
}

async function readPdfText(buffer: Buffer): Promise<string> {
  // A copy: pdf.js takes ownership of (detaches) the array it is given. The
  // bundled pdf.js (v5) has no eval-based font path (CVE-2024-4367 is fixed).
  const doc = await getDocumentProxy(new Uint8Array(buffer));
  try {
    const parts: string[] = [];
    for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES); n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      parts.push(
        content.items
          .map((item) =>
            'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '',
          )
          .join(''),
      );
    }
    return parts.join('\n').slice(0, MAX_CHARS);
  } finally {
    await doc.cleanup();
  }
}
