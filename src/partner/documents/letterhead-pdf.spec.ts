import { PartnerDocumentsService } from './partner-documents.service';
import { parseJpeg } from '../../common/pdf/simple-pdf';
import type { ProviderDocument } from '../../core/providers/schemas/provider.schema';

// A 2x1 baseline JPEG (SOI, APP0, SOF0 3 components, EOI) - enough for the header parser.
const TINY_JPEG = Buffer.from(
  'ffd8ffe000104a46494600010100000100010000' +
    'ffc0001108000100020301110002110103110100' +
    'ffd9',
  'hex',
);

const docs = new PartnerDocumentsService(
  {} as never,
  {} as never,
  {} as never,
  {} as never,
);

const provider = (letterhead?: object) =>
  ({
    id: 'p1',
    name: 'Orange Labs',
    phone: '+91 80 0000 0000',
    locations: [{ label: 'Main', address: '12 MG Road' }],
    ...(letterhead && { letterhead }),
  }) as unknown as ProviderDocument;

describe('letterhead', () => {
  it('reads JPEG size and components, and rejects anything else', () => {
    expect(parseJpeg(TINY_JPEG)).toMatchObject({
      width: 2,
      height: 1,
      components: 3,
    });
    expect(parseJpeg(Buffer.from('not an image'))).toBeNull();
  });

  it('keeps the Ayuva band when the organisation has not set a letterhead', () => {
    const text = docs.letterheadSamplePdf(provider()).toString('latin1');
    expect(text).toContain('(Orange Labs)');
    expect(text).not.toContain('/Subtype /Image');
  });

  it('prints the custom header lines and footer note', () => {
    const text = docs
      .letterheadSamplePdf(
        provider({
          displayName: 'Orange Labs & Diagnostics',
          tagline: 'NABL accredited',
          registrationLine: 'Reg. no. KA/1234',
          footerNote: 'Open 24x7',
          accentColor: '#cc5500',
        }),
      )
      .toString('latin1');
    expect(text).toContain('(Orange Labs & Diagnostics)');
    expect(text).toContain('(NABL accredited)');
    expect(text).toContain('(Reg. no. KA/1234)');
    expect(text).toContain('(Open 24x7)');
    expect(text).toContain('(12 MG Road)');
  });

  it('embeds the logo as an image object', () => {
    const logo = parseJpeg(TINY_JPEG)!;
    const text = docs
      .letterheadSamplePdf(provider({ displayName: 'Orange Labs' }), { logo })
      .toString('latin1');
    expect(text).toContain('/Subtype /Image');
    expect(text).toContain('/Filter /DCTDecode');
    expect(text).toMatch(/\/XObject << \/Im1 \d+ 0 R >>/);
  });
});
