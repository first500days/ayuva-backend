import { extname } from 'node:path';
import * as dicomParser from 'dicom-parser';

/** What an imaging attachment is, so the viewer knows how to open it. */
export type ImagingKind = 'dicom' | 'ecg' | 'video' | 'slide';

export interface ImagingMeta {
  kind: ImagingKind;
  /** Served Content-Type. */
  mime: string;
  studyUid?: string;
  seriesUid?: string;
  sopUid?: string;
  modality?: string;
  seriesNumber?: number;
  seriesDescription?: string;
  instanceNumber?: number;
}

const startsWith = (b: Buffer, sig: number[], at = 0) =>
  b.length >= at + sig.length && sig.every((v, i) => b[at + i] === v);

/**
 * Classifies an uploaded imaging file by content (not just extension):
 * DICOM (with its study/series/instance identifiers), HL7 aECG or MFER
 * waveforms, MP4/WebM/QuickTime video, or a TIFF/SVS pathology slide.
 * Returns null for anything else.
 */
export function classifyImaging(
  buffer: Buffer,
  originalName: string,
): ImagingMeta | null {
  const ext = extname(originalName).toLowerCase();
  const dicm =
    buffer.length > 132 &&
    buffer.subarray(128, 132).toString('latin1') === 'DICM';
  if (dicm || ext === '.dcm' || ext === '.dicom') {
    return dicm
      ? { kind: 'dicom', mime: 'application/dicom', ...dicomIds(buffer) }
      : null;
  }
  const head = buffer.subarray(0, 4096).toString('latin1');
  if (ext === '.xml' && /AnnotatedECG/.test(head))
    return { kind: 'ecg', mime: 'application/xml' };
  if (['.mwf', '.mfer', '.mfr'].includes(ext))
    return { kind: 'ecg', mime: 'application/octet-stream' };
  // ISO BMFF ('ftyp' at byte 4) or Matroska/WebM (EBML magic).
  if (startsWith(buffer, [0x66, 0x74, 0x79, 0x70], 4))
    return {
      kind: 'video',
      mime: ext === '.mov' ? 'video/quicktime' : 'video/mp4',
    };
  if (startsWith(buffer, [0x1a, 0x45, 0xdf, 0xa3]))
    return { kind: 'video', mime: 'video/webm' };
  // Little/big-endian TIFF (and BigTIFF): pyramidal slides, SVS.
  if (
    ['.svs', '.tif', '.tiff'].includes(ext) &&
    (startsWith(buffer, [0x49, 0x49, 0x2a, 0x00]) ||
      startsWith(buffer, [0x4d, 0x4d, 0x00, 0x2a]) ||
      startsWith(buffer, [0x49, 0x49, 0x2b, 0x00]))
  )
    return { kind: 'slide', mime: 'image/tiff' };
  return null;
}

/** Study/series/instance identifiers from the header (pixel data is not read). */
function dicomIds(buffer: Buffer): Omit<ImagingMeta, 'kind' | 'mime'> {
  try {
    const ds = dicomParser.parseDicom(new Uint8Array(buffer), {
      untilTag: 'x7fe00010',
    });
    const s = (t: string) => ds.string(t)?.trim() || undefined;
    const n = (t: string) => ds.intString(t);
    return {
      studyUid: s('x0020000d'),
      seriesUid: s('x0020000e'),
      sopUid: s('x00080018'),
      modality: s('x00080060'),
      seriesNumber: n('x00200011'),
      seriesDescription: s('x0008103e')?.slice(0, 120),
      instanceNumber: n('x00200013'),
    };
  } catch {
    return {};
  }
}
