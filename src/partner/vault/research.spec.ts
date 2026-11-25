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

  it('keeps abstract section headings readable', () => {
    const hit = mapResult({
      abstractText:
        '<h4>Rationale</h4>Diabetes is a risk factor.<h4>Objectives</h4><p>To assess DPP-4 inhibitors.</p>',
    });
    expect(hit.abstract).toBe(
      'Rationale: Diabetes is a risk factor. Objectives: To assess DPP-4 inhibitors.',
    );
  });

  it('falls back to PubMed when Europe PMC is unavailable', async () => {
    const seen: string[] = [];
    const fake: typeof fetch = (input) => {
      const url = input instanceof Request ? input.url : String(input);
      const host = new URL(url).hostname;
      seen.push(host + new URL(url).pathname);
      if (host === 'www.ebi.ac.uk')
        return Promise.resolve(new Response('busy', { status: 503 }));
      if (url.includes('esearch'))
        return Promise.resolve(
          Response.json({
            esearchresult: { count: '507', idlist: ['42813456'] },
          }),
        );
      return Promise.resolve(
        Response.json({
          result: {
            uids: ['42813456'],
            '42813456': {
              uid: '42813456',
              title: 'Systemic azoles for asthma with fungal sensitisation.',
              source: 'Cochrane Database Syst Rev',
              pubdate: '2026 Sep 30',
              volume: '9',
              issue: '9',
              pages: 'CD016394',
              authors: [{ name: 'Fukuda Y' }, { name: 'Homma T' }],
              articleids: [
                { idtype: 'pubmed', value: '42813456' },
                { idtype: 'pmc', value: 'PMC13625169' },
                { idtype: 'doi', value: '10.1002/14651858.CD016394' },
              ],
            },
          },
        }),
      );
    };
    const out = await searchLiterature(
      'asthma fallback',
      'cochrane',
      undefined,
      fake,
    );
    expect(seen[0]).toContain('ebi.ac.uk');
    expect(out.source).toBe('pubmed');
    expect(out.hitCount).toBe(507);
    expect(out.nextCursor).toBe('pm:10');
    expect(out.results[0]).toMatchObject({
      title: 'Systemic azoles for asthma with fungal sensitisation',
      authors: 'Fukuda Y, Homma T',
      journal: 'Cochrane Database Syst Rev',
      year: '2026',
      doi: '10.1002/14651858.CD016394',
      openAccess: true,
    });
    expect(out.results[0].links.fullText).toBe(
      'https://pmc.ncbi.nlm.nih.gov/articles/PMC13625169/',
    );
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
