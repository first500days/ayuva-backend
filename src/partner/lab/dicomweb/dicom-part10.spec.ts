import * as dicomParser from 'dicom-parser';
import { extractFrame, headerOnly, instanceMetadata } from './dicom-part10';

const LE = '1.2.840.10008.1.2.1';
const JPEG = '1.2.840.10008.1.2.4.50';
const STUDY = '1.2.3.4';
const SERIES = '1.2.3.4.5';
const SOP = '1.2.3.4.5.6';

const u16 = (n: number) => {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
};
const u32 = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n);
  return b;
};
const tagBytes = (g: number, e: number) => Buffer.concat([u16(g), u16(e)]);
const even = (b: Buffer, pad: number) =>
  b.length % 2 ? Buffer.concat([b, Buffer.from([pad])]) : b;

/** A short-form explicit VR element. */
const el = (g: number, e: number, vr: string, value: Buffer) => {
  const v = even(value, vr === 'UI' ? 0 : 0x20);
  return Buffer.concat([tagBytes(g, e), Buffer.from(vr), u16(v.length), v]);
};
const text = (g: number, e: number, vr: string, s: string) =>
  el(g, e, vr, Buffer.from(s));

const meta = (syntax: string) => {
  const inner = text(2, 0x10, 'UI', syntax);
  return Buffer.concat([
    Buffer.alloc(128),
    Buffer.from('DICM'),
    el(2, 0, 'UL', u32(inner.length)),
    inner,
  ]);
};

function attributes(rows: number, cols: number, frames: number) {
  return Buffer.concat([
    text(8, 0x18, 'UI', SOP),
    text(8, 0x60, 'CS', 'CT'),
    text(0x10, 0x10, 'PN', 'Doe^Jane'),
    text(0x20, 0x0d, 'UI', STUDY),
    text(0x20, 0x0e, 'UI', SERIES),
    text(0x20, 0x13, 'IS', '7'),
    text(0x28, 0x30, 'DS', '0.5\\0.75'),
    el(0x28, 2, 'US', u16(1)),
    ...(frames > 1 ? [text(0x28, 8, 'IS', String(frames))] : []),
    el(0x28, 0x10, 'US', u16(rows)),
    el(0x28, 0x11, 'US', u16(cols)),
    el(0x28, 0x100, 'US', u16(16)),
  ]);
}

function nativeFile(rows: number, cols: number, frames: number) {
  const pixels = Buffer.alloc(rows * cols * 2 * frames);
  for (let i = 0; i < pixels.length; i++) pixels[i] = i % 251;
  return {
    pixels,
    file: Buffer.concat([
      meta(LE),
      attributes(rows, cols, frames),
      tagBytes(0x7fe0, 0x10),
      Buffer.from('OW'),
      u16(0),
      u32(pixels.length),
      pixels,
    ]),
  };
}

function encapsulatedFile(fragments: Buffer[], botOffsets: number[] = []) {
  const item = (b: Buffer) =>
    Buffer.concat([tagBytes(0xfffe, 0xe000), u32(b.length), b]);
  const bot = Buffer.concat(botOffsets.map(u32));
  return Buffer.concat([
    meta(JPEG),
    attributes(2, 2, fragments.length),
    tagBytes(0x7fe0, 0x10),
    Buffer.from('OB'),
    u16(0),
    u32(0xffffffff),
    item(bot),
    ...fragments.map(item),
    tagBytes(0xfffe, 0xe0dd),
    u32(0),
  ]);
}

describe('stored DICOM files', () => {
  describe('headerOnly', () => {
    it('stops before Pixel Data, and the viewer can still read every attribute', () => {
      const { file, pixels } = nativeFile(2, 3, 1);
      const header = headerOnly(file);
      expect(header.length).toBe(file.length - pixels.length - 12);
      const ds = dicomParser.parseDicom(new Uint8Array(header));
      expect(ds.string('x00080018')).toBe(SOP);
      expect(ds.uint16('x00280010')).toBe(2);
      expect(ds.elements.x7fe00010).toBeUndefined();
    });

    it('leaves a file with no pixels alone', () => {
      const file = Buffer.concat([meta(LE), text(8, 0x18, 'UI', SOP)]);
      expect(headerOnly(file)).toBe(file);
    });
  });

  describe('extractFrame', () => {
    it('cuts single frames out of uncompressed pixels', () => {
      const { file, pixels } = nativeFile(2, 2, 3);
      const size = 2 * 2 * 2;
      for (const n of [1, 2, 3]) {
        const frame = extractFrame(file, n)!;
        expect(frame.contentType).toBe('application/octet-stream');
        expect(frame.transferSyntax).toBe(LE);
        expect(
          Buffer.compare(frame.data, pixels.subarray(size * (n - 1), size * n)),
        ).toBe(0);
      }
    });

    it('refuses frame numbers outside the file', () => {
      const { file } = nativeFile(2, 2, 2);
      expect(extractFrame(file, 0)).toBeNull();
      expect(extractFrame(file, 3)).toBeNull();
      expect(extractFrame(file, 1.5)).toBeNull();
    });

    it('returns one fragment per frame when there is no offset table', () => {
      const a = Buffer.from([0xff, 0xd8, 1, 2]);
      const b = Buffer.from([0xff, 0xd8, 3, 4, 5, 6]);
      const file = encapsulatedFile([a, b]);
      const second = extractFrame(file, 2)!;
      expect(second.contentType).toBe('image/jpeg');
      expect(second.transferSyntax).toBe(JPEG);
      expect(second.data.equals(b)).toBe(true);
      expect(extractFrame(file, 1)!.data.equals(a)).toBe(true);
    });

    it('uses the offset table when the file has one', () => {
      const a = Buffer.from([0xff, 0xd8, 1, 2]);
      const b = Buffer.from([0xff, 0xd8, 3, 4]);
      // Each offset is measured to the frame's item tag: 4 data bytes + an 8-byte item header.
      const file = encapsulatedFile([a, b], [0, a.length + 8]);
      expect(extractFrame(file, 2)!.data.equals(b)).toBe(true);
    });

    it('joins every fragment of a single compressed image', () => {
      const a = Buffer.from([1, 2]);
      const b = Buffer.from([3, 4]);
      const item = (x: Buffer) =>
        Buffer.concat([tagBytes(0xfffe, 0xe000), u32(x.length), x]);
      const file = Buffer.concat([
        meta(JPEG),
        attributes(2, 2, 1),
        tagBytes(0x7fe0, 0x10),
        Buffer.from('OB'),
        u16(0),
        u32(0xffffffff),
        item(Buffer.alloc(0)),
        item(a),
        item(b),
        tagBytes(0xfffe, 0xe0dd),
        u32(0),
      ]);
      expect(extractFrame(file, 1)!.data.equals(Buffer.concat([a, b]))).toBe(
        true,
      );
    });

    it('has nothing to return for a file with no pixels', () => {
      const file = Buffer.concat([meta(LE), text(8, 0x18, 'UI', SOP)]);
      expect(extractFrame(file, 1)).toBeNull();
    });
  });

  describe('instanceMetadata', () => {
    const json = instanceMetadata(nativeFile(4, 5, 1).file);

    it('keys attributes by tag and types them', () => {
      expect(json['00080018']).toEqual({ vr: 'UI', Value: [SOP] });
      expect(json['00080060']).toEqual({ vr: 'CS', Value: ['CT'] });
      expect(json['00280010']).toEqual({ vr: 'US', Value: [4] });
      expect(json['00280011']).toEqual({ vr: 'US', Value: [5] });
    });

    it('writes numbers and person names the DICOM JSON way', () => {
      expect(json['00200013']).toEqual({ vr: 'IS', Value: [7] });
      expect(json['00280030']).toEqual({ vr: 'DS', Value: [0.5, 0.75] });
      expect(json['00100010']).toEqual({
        vr: 'PN',
        Value: [{ Alphabetic: 'Doe^Jane' }],
      });
    });

    it('leaves out file meta and pixel data', () => {
      expect(json['00020010']).toBeUndefined();
      expect(json['7FE00010']).toBeUndefined();
    });
  });
});
