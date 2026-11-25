import type { ResearchFilter } from './dto/vault.dto';

/**
 * Literature search for the Doctor's Vault through Europe PMC's free REST API
 * (it indexes PubMed/MEDLINE, PMC, Cochrane reviews and guidelines). No
 * licensed feeds (NICE). Search terms leave AYUVA, so the portal warns not to
 * type patient details; they are not logged here.
 */
const EPMC = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search';
const PAGE_SIZE = 10;
// The service is free and its answers vary from under a second to ~20 s.
const TIMEOUT_MS = 25_000;
const CACHE_MS = 5 * 60_000;
const cache = new Map<string, { at: number; value: SearchResult }>();
type SearchResult = {
  hitCount: number;
  nextCursor: string | null;
  results: ResearchHit[];
};

const FILTER_QUERY: Record<ResearchFilter, string> = {
  all: '',
  pubmed: 'SRC:MED',
  cochrane: 'JOURNAL:"Cochrane Database Syst Rev"',
  guidelines: '(PUB_TYPE:"practice guideline" OR PUB_TYPE:"guideline")',
  reviews: 'PUB_TYPE:"review"',
  open: 'OPEN_ACCESS:y',
};

export function researchUrl(
  q: string,
  filter: ResearchFilter = 'all',
  cursor?: string,
): string {
  const extra = FILTER_QUERY[filter];
  const query = extra ? `(${q.trim()}) AND ${extra}` : q.trim();
  const params = new URLSearchParams({
    query,
    format: 'json',
    resultType: 'core',
    pageSize: String(PAGE_SIZE),
    cursorMark: cursor || '*',
  });
  return `${EPMC}?${params.toString()}`;
}

/** The fields of a Europe PMC "core" result this page uses. */
export interface EpmcResult {
  id?: string;
  source?: string;
  pmid?: string;
  pmcid?: string;
  doi?: string;
  title?: string;
  authorString?: string;
  pubYear?: string;
  isOpenAccess?: string;
  abstractText?: string;
  pageInfo?: string;
  journalInfo?: {
    volume?: string;
    issue?: string;
    journal?: {
      title?: string;
      isoabbreviation?: string;
      medlineAbbreviation?: string;
    };
  };
  pubTypeList?: { pubType?: string[] | string };
  fullTextUrlList?: {
    fullTextUrl?: {
      availabilityCode?: string;
      documentStyle?: string;
      url?: string;
    }[];
  };
}

const stripTags = (s: string) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export function mapResult(r: EpmcResult) {
  const journal =
    r.journalInfo?.journal?.isoabbreviation ??
    r.journalInfo?.journal?.medlineAbbreviation ??
    r.journalInfo?.journal?.title ??
    '';
  const types = r.pubTypeList?.pubType;
  const pubTypes = (Array.isArray(types) ? types : types ? [types] : []).map(
    (t) => t.toLowerCase(),
  );
  const free = (r.fullTextUrlList?.fullTextUrl ?? []).find(
    (u) => (u.availabilityCode === 'OA' || u.availabilityCode === 'F') && u.url,
  );
  const abstract = r.abstractText ? stripTags(r.abstractText) : '';
  return {
    id: `${r.source ?? 'MED'}:${r.id ?? r.pmid ?? ''}`,
    title: stripTags(r.title ?? '').replace(/\.$/, ''),
    authors: (r.authorString ?? '').replace(/\.$/, ''),
    journal,
    year: r.pubYear ?? '',
    volume: r.journalInfo?.volume ?? '',
    issue: r.journalInfo?.issue ?? '',
    pages: r.pageInfo ?? '',
    doi: r.doi ?? '',
    pmid: r.pmid ?? '',
    pmcid: r.pmcid ?? '',
    pubTypes,
    openAccess: r.isOpenAccess === 'Y',
    abstract: abstract.length > 1200 ? `${abstract.slice(0, 1200)}…` : abstract,
    links: {
      pubmed: r.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/` : null,
      doi: r.doi ? `https://doi.org/${r.doi}` : null,
      fullText:
        free?.url ??
        (r.pmcid ? `https://europepmc.org/article/PMC/${r.pmcid}` : null),
      europePmc: r.id
        ? `https://europepmc.org/article/${r.source ?? 'MED'}/${r.id}`
        : null,
    },
  };
}
export type ResearchHit = ReturnType<typeof mapResult>;

/**
 * Runs the search (25 s timeout). A 5xx "busy" answer is retried once; a
 * timeout is not, so nobody waits close to a minute. Identical searches are
 * served from memory for 5 minutes.
 */
export async function searchLiterature(
  q: string,
  filter: ResearchFilter = 'all',
  cursor?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SearchResult> {
  const url = researchUrl(q, filter, cursor);
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    let busy = false;
    try {
      const res = await fetchImpl(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'AyuvaPartnerPortal/1.0',
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      busy = res.status >= 500;
      if (!res.ok) throw new Error(`Europe PMC ${res.status}`);
      const body = (await res.json()) as {
        hitCount?: number;
        nextCursorMark?: string;
        resultList?: { result?: EpmcResult[] };
      };
      const results = (body.resultList?.result ?? []).map(mapResult);
      const next = body.nextCursorMark;
      const value = {
        hitCount: body.hitCount ?? 0,
        // The service repeats the cursor on the last page.
        nextCursor:
          next && next !== (cursor || '*') && results.length === PAGE_SIZE
            ? next
            : null,
        results,
      };
      // Drop the oldest entry (Maps iterate in insertion order).
      const oldest = cache.keys().next();
      if (cache.size > 200 && !oldest.done) cache.delete(oldest.value);
      cache.set(url, { at: Date.now(), value });
      return value;
    } catch (err) {
      last = err;
      if (!busy) break;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 800));
    }
  }
  throw last instanceof Error ? last : new Error('Search failed');
}
