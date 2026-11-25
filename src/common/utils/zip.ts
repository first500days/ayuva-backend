import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib';

/**
 * A small ZIP writer and reader (deflate or stored entries, no ZIP64), enough
 * for exports people open on their own computer and import again. Node 22's
 * zlib provides deflate and CRC-32, so no dependency is needed.
 */

export interface ZipEntry {
  name: string;
  data: Buffer;
  date?: Date;
}

function dosTime(d: Date) {
  return (
    (d.getHours() << 11) |
    (d.getMinutes() << 5) |
    Math.floor(d.getSeconds() / 2)
  );
}
function dosDate(d: Date) {
  return (
    ((Math.max(d.getFullYear(), 1980) - 1980) << 9) |
    ((d.getMonth() + 1) << 5) |
    d.getDate()
  );
}

export function buildZip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const deflated = deflateRawSync(e.data);
    // Already-compressed data (PDFs, images) is often smaller stored.
    const store = deflated.length >= e.data.length;
    const body = store ? e.data : deflated;
    const crc = crc32(e.data);
    const d = e.date ?? new Date();
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(store ? 0 : 8, 8);
    local.writeUInt16LE(dosTime(d), 10);
    local.writeUInt16LE(dosDate(d), 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // made by
    central.writeUInt16LE(20, 6); // needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(store ? 0 : 8, 10);
    central.writeUInt16LE(dosTime(d), 12);
    central.writeUInt16LE(dosDate(d), 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(e.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += 30 + name.length + body.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

export class ZipError extends Error {}

/**
 * Reads a ZIP's entries. Refuses archives that would unpack past `maxBytes`
 * or hold more than `maxEntries` files (zip bombs), and entries whose CRC
 * doesn't match.
 */
export function readZip(
  zip: Buffer,
  limits: { maxBytes: number; maxEntries: number },
): ZipEntry[] {
  // The end-of-central-directory record sits within the last 64 KB + 22 bytes.
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65_557); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipError('Not a ZIP file');
  const count = zip.readUInt16LE(eocd + 10);
  if (count > limits.maxEntries)
    throw new ZipError(`More than ${limits.maxEntries} files`);
  let p = zip.readUInt32LE(eocd + 16);
  const out: ZipEntry[] = [];
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(p) !== 0x02014b50)
      throw new ZipError('Damaged ZIP directory');
    const method = zip.readUInt16LE(p + 10);
    const crc = zip.readUInt32LE(p + 16);
    const compressed = zip.readUInt32LE(p + 20);
    const size = zip.readUInt32LE(p + 24);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const localOffset = zip.readUInt32LE(p + 42);
    const name = zip.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue; // folder
    total += size;
    if (total > limits.maxBytes)
      throw new ZipError('The ZIP unpacks to more than the vault allows');
    if (zip.readUInt32LE(localOffset) !== 0x04034b50)
      throw new ZipError('Damaged ZIP entry');
    const start =
      localOffset +
      30 +
      zip.readUInt16LE(localOffset + 26) +
      zip.readUInt16LE(localOffset + 28);
    const raw = zip.subarray(start, start + compressed);
    let data: Buffer;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8)
      data = inflateRawSync(raw, { maxOutputLength: size + 1 });
    else throw new ZipError(`Unsupported compression in ${name}`);
    if (data.length !== size || crc32(data) !== crc)
      throw new ZipError(`${name} is damaged`);
    out.push({ name, data });
  }
  return out;
}
