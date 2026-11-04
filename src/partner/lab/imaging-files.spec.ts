import { classifyImaging } from './imaging-files';

/** A tiny explicit-VR little-endian DICOM file with study/series/instance tags. */
function dicom(): Buffer {
  const el = (group: number, elem: number, vr: string, value: string) => {
    const v = Buffer.from(value.length % 2 ? `${value}\0` : value, 'latin1');
    const h = Buffer.alloc(8);
    h.writeUInt16LE(group, 0);
    h.writeUInt16LE(elem, 2);
    h.write(vr, 4, 'latin1');
    h.writeUInt16LE(v.length, 6);
    return Buffer.concat([h, v]);
  };
  const ts = el(0x0002, 0x0010, 'UI', '1.2.840.10008.1.2.1');
  const metaLen = Buffer.alloc(12);
  metaLen.writeUInt16LE(0x0002, 0);
  metaLen.writeUInt16LE(0x0000, 2);
  metaLen.write('UL', 4, 'latin1');
  metaLen.writeUInt16LE(4, 6);
  metaLen.writeUInt32LE(ts.length, 8);
  return Buffer.concat([
    Buffer.alloc(128),
    Buffer.from('DICM', 'latin1'),
    metaLen,
    ts,
    el(0x0008, 0x0018, 'UI', '1.2.3.4.5'),
    el(0x0008, 0x0060, 'CS', 'CT'),
    el(0x0008, 0x103e, 'LO', 'Chest 3 mm'),
    el(0x0020, 0x000d, 'UI', '1.2.3'),
    el(0x0020, 0x000e, 'UI', '1.2.3.4'),
    el(0x0020, 0x0011, 'IS', '3'),
    el(0x0020, 0x0013, 'IS', '17'),
  ]);
}

describe('classifyImaging', () => {
  it('reads DICOM identifiers from the header', () => {
    expect(classifyImaging(dicom(), 'IM0001')).toEqual({
      kind: 'dicom',
      mime: 'application/dicom',
      studyUid: '1.2.3',
      seriesUid: '1.2.3.4',
      sopUid: '1.2.3.4.5',
      modality: 'CT',
      seriesNumber: 3,
      seriesDescription: 'Chest 3 mm',
      instanceNumber: 17,
    });
  });

  it('rejects a .dcm that is not DICOM', () => {
    expect(classifyImaging(Buffer.from('hello'), 'x.dcm')).toBeNull();
  });

  it('recognises waveforms, video and slides by content', () => {
    const aecg = Buffer.from(
      '<?xml version="1.0"?><AnnotatedECG xmlns="urn:hl7-org:v3">',
      'latin1',
    );
    expect(classifyImaging(aecg, 'ecg.xml')?.kind).toBe('ecg');
    expect(classifyImaging(Buffer.from([1, 2, 3]), 'holter.mwf')?.kind).toBe(
      'ecg',
    );
    const mp4 = Buffer.concat([
      Buffer.from([0, 0, 0, 24]),
      Buffer.from('ftypisom', 'latin1'),
    ]);
    expect(classifyImaging(mp4, 'loop.mp4')).toEqual({
      kind: 'video',
      mime: 'video/mp4',
    });
    expect(
      classifyImaging(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0]), 'loop.webm')
        ?.mime,
    ).toBe('video/webm');
    expect(
      classifyImaging(
        Buffer.from([0x49, 0x49, 0x2a, 0, 8, 0, 0, 0]),
        'slide.svs',
      )?.kind,
    ).toBe('slide');
  });

  it('rejects other files', () => {
    expect(classifyImaging(Buffer.from('%PDF-1.4'), 'report.pdf')).toBeNull();
    expect(classifyImaging(Buffer.from('<html>'), 'page.xml')).toBeNull();
  });
});
