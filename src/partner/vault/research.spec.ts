import { mapResult, researchUrl, searchLiterature } from './research';
import { sniffMime } from './partner-vault.service';

describe('literature search', () => {
  it('adds the filter to the query and pages with a cursor', () => {
    const u = new URL(researchUrl('heart failure', 'cochrane', 'AoE123'));
    expect(u.hostname).toBe('www.ebi.ac.uk');
    expect(u.searchParams.get('query')).toBe(
      '(heart failure) AND JOURNAL:"Cochrane Database Syst Rev"',
    );
    expect(u.searchParams.get('cursorMark')).toBe('AoE123');
    expect(new URL(researchUrl('dapt')).searchParams.get('query')).toBe('dapt');
  });

  it('maps a Europe PMC result to citation fields and links', () => {
    const hit = mapResult({
      id: '43072898',
      source: 'MED',
      pmid: '43072898',
      doi: '10.1016/j.jcin.2026.10.012',
      title: 'A Journey of Risk Scores for <i>Dual</i> Antiplatelet Therapy.',
      authorString: 'Costa F, Valgimigli M.',
      pubYear: '2026',
      isOpenAccess: 'N',
      pageInfo: '3000-3003',
      journalInfo: {
        volume: '19',
        issue: '22',
        journal: {
          title: 'JACC. Cardiovascular interventions',
          isoabbreviation: 'JACC Cardiovasc Interv',
        },
      },
      pubTypeList: { pubType: ['Editorial'] },
      fullTextUrlList: {
        fullTextUrl: [{ availabilityCode: 'S', url: 'https://doi.org/x' }],
      },
    });
    expect(hit).toMatchObject({
      title: 'A Journey of Risk Scores for Dual Antiplatelet Therapy',
      authors: 'Costa F, Valgimigli M',
      journal: 'JACC Cardiovasc Interv',
      volume: '19',
      issue: '22',
      pages: '3000-3003',
      pubTypes: ['editorial'],
      openAccess: false,
    });
    expect(hit.links.pubmed).toBe('https://pubmed.ncbi.nlm.nih.gov/43072898/');
    expect(hit.links.fullText).toBeNull(); // subscription only
  });

  it('retries once when the service is briefly unavailable', async () => {
    let calls = 0;
    const fake = (() => {
      calls++;
      if (calls === 1)
        return Promise.resolve(new Response('busy', { status: 503 }));
      return Promise.resolve(
        new Response(
          JSON.stringify({
            hitCount: 1,
            nextCursorMark: '*',
            resultList: { result: [{ id: '1', title: 'T' }] },
          }),
          { status: 200 },
        ),
      );
    }) as typeof fetch;
    const out = await searchLiterature('x', 'all', undefined, fake);
    expect(calls).toBe(2);
    expect(out.results).toHaveLength(1);
    expect(out.nextCursor).toBeNull();
  });
});

describe('sniffMime', () => {
  it('trusts the bytes, not the name', () => {
    expect(sniffMime(Buffer.from('%PDF-1.7 ...'), 'x.png')).toBe(
      'application/pdf',
    );
    expect(
      sniffMime(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]),
        'a.pdf',
      ),
    ).toBe('image/png');
    expect(
      sniffMime(Buffer.from('MZ\u0090 executable'), 'guideline.pdf'),
    ).toBeNull();
    expect(sniffMime(Buffer.from('# notes'), 'notes.md')).toBe('text/plain');
  });
});
