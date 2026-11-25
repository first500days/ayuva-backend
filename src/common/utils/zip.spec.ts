import { buildZip, readZip, ZipError } from './zip';

describe('zip', () => {
  const limits = { maxBytes: 10_000_000, maxEntries: 100 };

  it('round-trips text and binary entries', () => {
    const text = Buffer.from(
      '# Note\n\nDAPT for 6 months — then review.\n'.repeat(50),
      'utf8',
    );
    const binary = Buffer.from(
      Array.from({ length: 4096 }, (_, i) => (i * 7919) % 256),
    );
    const zip = buildZip([
      { name: 'notes/dapt.md', data: text },
      { name: 'files/guideline.pdf', data: binary },
    ]);
    const back = readZip(zip, limits);
    expect(back.map((e) => e.name)).toEqual([
      'notes/dapt.md',
      'files/guideline.pdf',
    ]);
    expect(back[0].data.equals(text)).toBe(true);
    expect(back[1].data.equals(binary)).toBe(true);
    // Text compresses; the random-looking bytes are stored.
    expect(zip.length).toBeLessThan(text.length + binary.length);
  });

  it('refuses archives that unpack past the limit', () => {
    const zip = buildZip([
      { name: 'big.txt', data: Buffer.alloc(2_000_000, 65) },
    ]);
    expect(() => readZip(zip, { maxBytes: 1_000_000, maxEntries: 10 })).toThrow(
      ZipError,
    );
  });

  it('refuses something that is not a ZIP', () => {
    expect(() =>
      readZip(Buffer.from('hello world, not a zip at all'), limits),
    ).toThrow('Not a ZIP file');
  });

  it('detects a damaged entry', () => {
    const zip = buildZip([
      {
        name: 'a.txt',
        data: Buffer.from('stored text that will not compress'),
      },
    ]);
    const broken = Buffer.from(zip);
    broken[40] ^= 0xff; // inside the first entry's data
    expect(() => readZip(broken, limits)).toThrow(ZipError);
  });
});
