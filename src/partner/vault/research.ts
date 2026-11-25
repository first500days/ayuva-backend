import type { ResearchFilter } from './dto/vault.dto';

/**
 * Literature search for the Doctor's Vault through Europe PMC's free REST API
 * (it indexes PubMed/MEDLINE, PMC, Cochrane reviews and guidelines). No
 * licensed feeds (NICE). Search terms leave AYUVA, so the portal warns not to
 * type patient details; they are not logged here.
 */
const EPMC = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search';
const PAGE_SIZE = 10;
// Europe PMC is free and its answers vary from under a second to timing out;
// after 12 s the search falls back to PubMed's own E-utilities.
const EPMC_TIMEOUT_MS = 12_000;
const PUBMED_TIMEOUT_MS = 10_000;
const NCBI = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const CACHE_MS = 5 * 60_000;
const cache = new Map<string, { at: number; value: SearchResult }>();
export type SearchResult = {
  hitCount: number;
  nextCursor: string | null;
  results: ResearchHit[];
  /** Which service answered: PubMed listings have no abstracts. */
  source: 'europepmc' | 'pubmed';
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

/** Abstract HTML to text: section headings become "Rationale: …", other tags a space. */
const stripTags = (s: string) =>
  s
    .replace(/<\/h\d>/gi, ': ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([:.,;])/g, '$1')
    .replace(/::/g, ':')
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

const PUBMED_FILTER: Record<ResearchFilter, string> = {
  all: '',
  pubmed: '',
  cochrane: '"Cochrane Database Syst Rev"[Journal]',
  guidelines: '(guideline[pt] OR practice guideline[pt])',
  reviews: 'review[pt]',
  open: 'free full text[sb]',
};

/** The fields of a PubMed esummary record this page uses. */
interface PubmedSummary {
  uid?: string;
  title?: string;
  source?: string;
  pubdate?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  pubtype?: string[];
  authors?: { name?: string }[];
  articleids?: { idtype?: string; value?: string }[];
}

export function mapPubmed(r: PubmedSummary): ResearchHit {
  const id = (t: string) =>
    r.articleids?.find((a) => a.idtype === t)?.value ?? '';
  const pmcid = id('pmc');
  const doi = id('doi');
  const pmid = r.uid ?? id('pubmed');
  return {
    id: `MED:${pmid}`,
    title: stripTags(r.title ?? '').replace(/\.$/, ''),
    authors: (r.authors ?? [])
      .map((a) => a.name)
      .filter(Boolean)
      .join(', '),
    journal: r.source ?? '',
    year: (r.pubdate ?? '').slice(0, 4),
    volume: r.volume ?? '',
    issue: r.issue ?? '',
    pages: r.pages ?? '',
    doi,
    pmid,
    pmcid,
    pubTypes: (r.pubtype ?? []).map((t) => t.toLowerCase()),
    openAccess: !!pmcid,
    abstract: '',
    links: {
      pubmed: pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : null,
      doi: doi ? `https://doi.org/${doi}` : null,
      fullText: pmcid
        ? `https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/`
        : null,
      europePmc: null,
    },
  };
}

async function getJson<T>(
  fetchImpl: typeof fetch,
  url: string,
  timeoutMs: number,
): Promise<T> {
  const res = await fetchImpl(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'AyuvaPartnerPortal/1.0',
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${new URL(url).hostname} ${res.status}`);
  return (await res.json()) as T;
}

async function searchEuropePmc(
  q: string,
  filter: ResearchFilter,
  cursor: string | undefined,
  fetchImpl: typeof fetch,
): Promise<SearchResult> {
  const body = await getJson<{
    hitCount?: number;
    nextCursorMark?: string;
    resultList?: { result?: EpmcResult[] };
  }>(fetchImpl, researchUrl(q, filter, cursor), EPMC_TIMEOUT_MS);
  const results = (body.resultList?.result ?? []).map(mapResult);
  const next = body.nextCursorMark;
  return {
    hitCount: body.hitCount ?? 0,
    // The service repeats the cursor on the last page.
    nextCursor:
      next && next !== (cursor || '*') && results.length === PAGE_SIZE
        ? next
        : null,
    results,
    source: 'europepmc',
  };
}

/** PubMed's E-utilities: search, then summaries (no abstracts). Cursors are "pm:<offset>". */
async function searchPubmed(
  q: string,
  filter: ResearchFilter,
  cursor: string | undefined,
  fetchImpl: typeof fetch,
): Promise<SearchResult> {
  const start = cursor?.startsWith('pm:') ? Number(cursor.slice(3)) || 0 : 0;
  const term = PUBMED_FILTER[filter]
    ? `(${q.trim()}) AND ${PUBMED_FILTER[filter]}`
    : q.trim();
  const common = {
    db: 'pubmed',
    retmode: 'json',
    tool: 'ayuva-partner-portal',
  };
  const found = await getJson<{
    esearchresult?: { count?: string; idlist?: string[] };
  }>(
    fetchImpl,
    `${NCBI}/esearch.fcgi?${new URLSearchParams({ ...common, term, retmax: String(PAGE_SIZE), retstart: String(start), sort: 'relevance' }).toString()}`,
    PUBMED_TIMEOUT_MS,
  );
  const ids = found.esearchresult?.idlist ?? [];
  const count = Number(found.esearchresult?.count ?? 0);
  let results: ResearchHit[] = [];
  if (ids.length) {
    const sum = await getJson<{
      result?: Record<string, PubmedSummary> & { uids?: string[] };
    }>(
      fetchImpl,
      `${NCBI}/esummary.fcgi?${new URLSearchParams({ ...common, id: ids.join(',') }).toString()}`,
      PUBMED_TIMEOUT_MS,
    );
    results = ids
      .map((id) => sum.result?.[id])
      .filter((r): r is PubmedSummary => !!r)
      .map(mapPubmed);
  }
  return {
    hitCount: count,
    nextCursor: start + PAGE_SIZE < count ? `pm:${start + PAGE_SIZE}` : null,
    results,
    source: 'pubmed',
  };
}

/**
 * Europe PMC first (abstracts, Cochrane, guidelines); if it fails or takes
 * longer than 12 s, PubMed's E-utilities answer instead. Identical searches
 * are served from memory for 5 minutes.
 */
export async function searchLiterature(
  q: string,
  filter: ResearchFilter = 'all',
  cursor?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SearchResult> {
  const key = `${filter}|${cursor ?? ''}|${q.trim().toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  let value: SearchResult;
  if (cursor?.startsWith('pm:'))
    value = await searchPubmed(q, filter, cursor, fetchImpl);
  else {
    try {
      value = await searchEuropePmc(q, filter, cursor, fetchImpl);
    } catch {
      // A later page of a Europe PMC search can't continue in PubMed; start there afresh.
      value = await searchPubmed(q, filter, undefined, fetchImpl);
    }
  }
  // Drop the oldest entry (Maps iterate in insertion order).
  const oldest = cache.keys().next();
  if (cache.size > 200 && !oldest.done) cache.delete(oldest.value);
  cache.set(key, { at: Date.now(), value });
  return value;
}
