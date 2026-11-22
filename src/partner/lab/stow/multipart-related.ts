/**
 * Splits a multipart/related body (DICOMweb STOW-RS, PS3.18 §10.5) into its
 * parts. Works on bytes throughout: DICOM files are binary.
 */

export interface MultipartPart {
  contentType: string | null;
  body: Buffer;
}

/** The boundary from a Content-Type header, or null if there isn't one. */
export function boundaryOf(contentType: string | undefined): string | null {
  if (!contentType || !/^\s*multipart\/related\b/i.test(contentType)) return null;
  const m = /;\s*boundary\s*=\s*(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
  const b = (m?.[1] ?? m?.[2] ?? '').trim();
  return b && b.length <= 200 ? b : null;
}

const CRLF = Buffer.from('\r\n');
const HEADER_END = Buffer.from('\r\n\r\n');

export function parseMultipart(body: Buffer, boundary: string): MultipartPart[] {
  const delimiter = Buffer.from(`--${boundary}`);
  const parts: MultipartPart[] = [];
  let at = body.indexOf(delimiter);
  while (at !== -1) {
    let start = at + delimiter.length;
    // "--" right after a delimiter closes the body.
    if (body[start] === 0x2d && body[start + 1] === 0x2d) break;
    if (body.subarray(start, start + 2).equals(CRLF)) start += 2;
    const next = body.indexOf(delimiter, start);
    if (next === -1) break;
    // The CRLF before the next delimiter belongs to the delimiter, not the part.
    let end = next;
    if (end >= 2 && body[end - 2] === 0x0d && body[end - 1] === 0x0a) end -= 2;
    const part = body.subarray(start, end);
    // A part with no headers starts straight away with the blank line.
    const bare = part.subarray(0, 2).equals(CRLF);
    const split = bare ? -1 : part.indexOf(HEADER_END);
    const headers = split === -1 ? '' : part.subarray(0, split).toString('latin1');
    const content = bare
      ? part.subarray(2)
      : split === -1
        ? part
        : part.subarray(split + HEADER_END.length);
    const type = /^content-type\s*:\s*(.+)$/im.exec(headers)?.[1]?.trim() ?? null;
    // A view into the request body, not a copy: studies are large.
    parts.push({ contentType: type, body: content });
    at = next;
  }
  return parts;
}
