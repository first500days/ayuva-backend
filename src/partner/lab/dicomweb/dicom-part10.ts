import * as dicomParser from 'dicom-parser';
import type { DataSet, Element } from 'dicom-parser';

/**
 * Reads stored DICOM (Part 10) files for the DICOMweb endpoints: the header on
 * its own, one frame of pixels, and the header as DICOM JSON (PS3.18 Annex F).
 */

const PIXEL_DATA = 'x7fe00010';
const IMPLICIT_LE = '1.2.840.10008.1.2';

function asBytes(buffer: Buffer): Uint8Array {
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

const parseHeader = (buffer: Buffer) =>
  dicomParser.parseDicom(asBytes(buffer), { untilTag: PIXEL_DATA });

/** The file up to, and not including, Pixel Data. */
export function headerOnly(buffer: Buffer): Buffer {
  const pixel = parseHeader(buffer).elements[PIXEL_DATA];
  if (!pixel) return buffer;
  // The element header is 12 bytes in explicit VR, 8 in implicit.
  for (const back of [12, 8]) {
    const at = pixel.dataOffset - back;
    if (
      at >= 0 &&
      buffer[at] === 0xe0 &&
      buffer[at + 1] === 0x7f &&
      buffer[at + 2] === 0x10 &&
      buffer[at + 3] === 0x00
    )
      return buffer.subarray(0, at);
  }
  return buffer.subarray(0, Math.max(0, pixel.dataOffset - 12));
}

export interface PixelFrame {
  data: Buffer;
  transferSyntax: string;
  contentType: string;
}

const COMPRESSED_TYPE: [RegExp, string][] = [
  [/^1\.2\.840\.10008\.1\.2\.4\.(50|51|57|70)$/, 'image/jpeg'],
  [/^1\.2\.840\.10008\.1\.2\.4\.(80|81)$/, 'image/jls'],
  [/^1\.2\.840\.10008\.1\.2\.4\.(90|91)$/, 'image/jp2'],
];

function contentTypeFor(syntax: string): string {
  return (
    COMPRESSED_TYPE.find(([re]) => re.test(syntax))?.[1] ??
    'application/octet-stream'
  );
}

function encapsulatedFrame(
  ds: DataSet,
  pixel: Element,
  index: number,
  total: number,
): Uint8Array {
  if (pixel.basicOffsetTable?.length)
    return dicomParser.readEncapsulatedImageFrame(ds, pixel, index);
  const fragments = pixel.fragments?.length ?? 0;
  if (total === 1)
    return dicomParser.readEncapsulatedPixelDataFromFragments(
      ds,
      pixel,
      0,
      fragments,
    );
  // No offset table: one fragment per frame is the usual layout.
  if (fragments === total)
    return dicomParser.readEncapsulatedPixelDataFromFragments(
      ds,
      pixel,
      index,
      1,
    );
  return dicomParser.readEncapsulatedImageFrame(
    ds,
    pixel,
    index,
    dicomParser.createJPEGBasicOffsetTable(ds, pixel),
  );
}

/** Frame numbers start at 1, as in DICOMweb. Null when there's no such frame. */
export function extractFrame(
  buffer: Buffer,
  frameNumber: number,
): PixelFrame | null {
  const ds = dicomParser.parseDicom(asBytes(buffer));
  const pixel = ds.elements[PIXEL_DATA];
  if (!pixel) return null;
  const total = Math.max(1, ds.intString('x00280008') ?? 1);
  if (!Number.isInteger(frameNumber) || frameNumber < 1 || frameNumber > total)
    return null;
  const transferSyntax = ds.string('x00020010') ?? IMPLICIT_LE;
  if (pixel.encapsulatedPixelData) {
    const frame = encapsulatedFrame(ds, pixel, frameNumber - 1, total);
    return {
      data: Buffer.from(frame),
      transferSyntax,
      contentType: contentTypeFor(transferSyntax),
    };
  }
  const bits = ds.uint16('x00280100') ?? 0;
  // Single-bit frames aren't byte-aligned, so a frame can't be cut out by length.
  if (bits < 8) return null;
  const frameLength =
    (ds.uint16('x00280010') ?? 0) *
    (ds.uint16('x00280011') ?? 0) *
    (ds.uint16('x00280002') ?? 1) *
    (bits / 8);
  const start = pixel.dataOffset + frameLength * (frameNumber - 1);
  if (!frameLength || start + frameLength > buffer.length) return null;
  return {
    data: buffer.subarray(start, start + frameLength),
    transferSyntax,
    contentType: 'application/octet-stream',
  };
}

export type DicomJson = Record<string, { vr: string; Value?: unknown[] }>;

const TEXT_VRS = new Set([
  'AE',
  'AS',
  'CS',
  'DA',
  'DT',
  'LO',
  'LT',
  'SH',
  'ST',
  'TM',
  'UC',
  'UI',
  'UR',
  'UT',
]);

/** The attributes a viewer needs, for implicit-VR files that don't state their types. */
const IMPLICIT_VR: Record<string, string> = {
  x00080016: 'UI',
  x00080018: 'UI',
  x00080020: 'DA',
  x00080030: 'TM',
  x00080050: 'SH',
  x00080060: 'CS',
  x0008103e: 'LO',
  x00100010: 'PN',
  x00100020: 'LO',
  x00180050: 'DS',
  x0020000d: 'UI',
  x0020000e: 'UI',
  x00200011: 'IS',
  x00200013: 'IS',
  x00200032: 'DS',
  x00200037: 'DS',
  x00280002: 'US',
  x00280004: 'CS',
  x00280006: 'US',
  x00280008: 'IS',
  x00280010: 'US',
  x00280011: 'US',
  x00280030: 'DS',
  x00280100: 'US',
  x00280101: 'US',
  x00280102: 'US',
  x00280103: 'US',
  x00281050: 'DS',
  x00281051: 'DS',
  x00281052: 'DS',
  x00281053: 'DS',
};

const NUMERIC_READERS: Record<string, { read: keyof DataSet; size: number }> = {
  US: { read: 'uint16', size: 2 },
  SS: { read: 'int16', size: 2 },
  UL: { read: 'uint32', size: 4 },
  SL: { read: 'int32', size: 4 },
  FL: { read: 'float', size: 4 },
  FD: { read: 'double', size: 8 },
};

function valuesOf(
  ds: DataSet,
  tag: string,
  vr: string,
  length: number,
): unknown[] | undefined {
  if (TEXT_VRS.has(vr)) {
    const text = ds.string(tag);
    return text ? text.split('\\').map((s) => s.trim()) : undefined;
  }
  if (vr === 'PN') {
    const text = ds.string(tag);
    return text
      ? text.split('\\').map((Alphabetic) => ({ Alphabetic }))
      : undefined;
  }
  if (vr === 'IS' || vr === 'DS') {
    const text = ds.string(tag);
    return text
      ? text
          .split('\\')
          .map((s) => Number(s.trim()))
          .filter(Number.isFinite)
      : undefined;
  }
  const numeric = NUMERIC_READERS[vr];
  if (!numeric) return undefined;
  const read = ds[numeric.read] as (
    this: DataSet,
    tag: string,
    index: number,
  ) => number;
  return Array.from({ length: Math.floor(length / numeric.size) }, (_, i) =>
    read.call(ds, tag, i),
  );
}

/** Header attributes as DICOM JSON. Binary values are left out rather than inlined. */
export function toDicomJson(ds: DataSet): DicomJson {
  const out: DicomJson = {};
  for (const [tag, el] of Object.entries(ds.elements)) {
    // File meta, group lengths and pixel data don't belong in the metadata.
    if (tag.startsWith('x0002') || tag.endsWith('0000') || tag === PIXEL_DATA)
      continue;
    const key = tag.slice(1).toUpperCase();
    if (el.items) {
      out[key] = {
        vr: 'SQ',
        Value: el.items.flatMap((i) =>
          i.dataSet ? [toDicomJson(i.dataSet)] : [],
        ),
      };
      continue;
    }
    const vr = el.vr ?? IMPLICIT_VR[tag];
    if (!vr) continue;
    const Value = valuesOf(ds, tag, vr, el.length);
    if (Value?.length) out[key] = { vr, Value };
    else if (TEXT_VRS.has(vr) || vr === 'PN') out[key] = { vr };
  }
  return out;
}

export function instanceMetadata(buffer: Buffer): DicomJson {
  return toDicomJson(parseHeader(buffer));
}
