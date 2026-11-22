import { boundaryOf, parseMultipart } from './multipart-related';

const build = (boundary: string, parts: { type?: string; body: Buffer }[]) =>
  Buffer.concat([
    Buffer.from('preamble ignored\r\n'),
    ...parts.flatMap((p) => [
      Buffer.from(`--${boundary}\r\n${p.type ? `Content-Type: ${p.type}\r\n` : ''}\r\n`),
      p.body,
      Buffer.from('\r\n'),
    ]),
    Buffer.from(`--${boundary}--\r\n`),
  ]);

describe('boundaryOf', () => {
  it('reads a quoted or plain boundary', () => {
    expect(
      boundaryOf('multipart/related; type="application/dicom"; boundary="abc 123"'),
    ).toBe('abc 123');
    expect(boundaryOf('Multipart/Related;boundary=XyZ;type=application/dicom')).toBe(
      'XyZ',
    );
  });

  it('refuses anything else', () => {
    expect(boundaryOf('application/json')).toBeNull();
    expect(boundaryOf('multipart/related')).toBeNull();
    expect(boundaryOf(undefined)).toBeNull();
    expect(boundaryOf(`multipart/related; boundary=${'x'.repeat(300)}`)).toBeNull();
  });
});

describe('parseMultipart', () => {
  it('splits binary parts exactly, keeping bytes that look like line breaks', () => {
    const a = Buffer.from([0, 1, 13, 10, 45, 45, 255, 13, 10]);
    const b = Buffer.from('second');
    const parts = parseMultipart(
      build('B0UND', [
        { type: 'application/dicom', body: a },
        { type: 'application/dicom', body: b },
      ]),
      'B0UND',
    );
    expect(parts).toHaveLength(2);
    expect(parts[0].contentType).toBe('application/dicom');
    expect(parts[0].body.equals(a)).toBe(true);
    expect(parts[1].body.toString()).toBe('second');
  });

  it('copes with a part that has no headers', () => {
    const parts = parseMultipart(build('b', [{ body: Buffer.from('x') }]), 'b');
    expect(parts).toEqual([{ contentType: null, body: Buffer.from('x') }]);
  });

  it('returns nothing for a body without the boundary', () => {
    expect(parseMultipart(Buffer.from('no parts here'), 'b')).toEqual([]);
  });

  it('ignores a part cut off before its closing delimiter', () => {
    const body = Buffer.from('--b\r\n\r\nfirst\r\n--b\r\n\r\ntruncated');
    expect(parseMultipart(body, 'b').map((p) => p.body.toString())).toEqual(['first']);
  });
});
