import { readDocumentText } from './document-text';

// Reading a real PDF is covered by the upload E2E: pdf.js ships as an ES module,
// which Jest can't load without --experimental-vm-modules.
describe('readDocumentText', () => {
  it('returns nothing for photos and unreadable files, without throwing', async () => {
    expect(
      await readDocumentText(Buffer.from('not an image'), 'image/jpeg'),
    ).toBe('');
    expect(
      await readDocumentText(
        Buffer.from('%PDF-1.4 garbage'),
        'application/pdf',
      ),
    ).toBe('');
  });
});
