/** A minimal valid DICOM Part 10 file, explicit VR little endian, for tests. */
export function dicomFile(o: {
  accession?: string;
  patientName?: string;
  birthDate?: string;
  sop?: string;
  study?: string;
}): Buffer {
  const el = (group: number, element: number, vr: string, value: string) => {
    let v = Buffer.from(value, 'latin1');
    if (v.length % 2) v = Buffer.concat([v, Buffer.from(vr === 'UI' ? '\0' : ' ')]);
    const head = Buffer.alloc(8);
    head.writeUInt16LE(group, 0);
    head.writeUInt16LE(element, 2);
    head.write(vr, 4, 'latin1');
    head.writeUInt16LE(v.length, 6);
    return Buffer.concat([head, v]);
  };
  const meta = Buffer.concat([
    el(0x0002, 0x0010, 'UI', '1.2.840.10008.1.2.1'),
  ]);
  const groupLength = Buffer.alloc(12);
  groupLength.writeUInt16LE(0x0002, 0);
  groupLength.writeUInt16LE(0x0000, 2);
  groupLength.write('UL', 4, 'latin1');
  groupLength.writeUInt16LE(4, 6);
  groupLength.writeUInt32LE(meta.length, 8);
  const body = Buffer.concat([
    el(0x0008, 0x0016, 'UI', '1.2.840.10008.5.1.4.1.1.2'),
    el(0x0008, 0x0018, 'UI', o.sop ?? '1.2.3.4'),
    ...(o.accession !== undefined ? [el(0x0008, 0x0050, 'SH', o.accession)] : []),
    ...(o.patientName !== undefined ? [el(0x0010, 0x0010, 'PN', o.patientName)] : []),
    ...(o.birthDate !== undefined ? [el(0x0010, 0x0030, 'DA', o.birthDate)] : []),
    el(0x0020, 0x000d, 'UI', o.study ?? '1.2.3'),
    el(0x0020, 0x000e, 'UI', '1.2.3.1'),
  ]);
  return Buffer.concat([Buffer.alloc(128), Buffer.from('DICM'), groupLength, meta, body]);
}
