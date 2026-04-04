import { log } from './logger.js';

const BASE_URL = 'https://api.exa.ai';

function getHeaders(): Record<string, string> {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) throw new Error('EXA_API_KEY not set');
  return {
    'x-api-key': apiKey,
    'content-type': 'application/json',
  };
}

async function post<T>(path: string, body: unknown): Promise<T> {
  log('debug', 'exa', `POST ${path}`);
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Exa ${path} failed ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export interface ExaResult {
  id: string;
  title: string;
  url: string;
  publishedDate?: string;
  author?: string;
  text?: string;
  highlights?: string[];
  summary?: string;
}

interface SearchResponse {
  results: ExaResult[];
}

// Search for news about new clinic openings
export async function searchClinics(query: string, numResults = 10): Promise<ExaResult[]> {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const response = await post<SearchResponse>('/search', {
    query,
    numResults,
    type: 'auto',
    category: 'news',
    startPublishedDate: sixMonthsAgo.toISOString(),
    contents: {
      highlights: { maxCharacters: 3000 },
      summary: { maxLength: 400 },
    },
  });

  log('info', 'exa', `Search "${query}" returned ${response.results.length} results`);
  return response.results;
}

// Get full page content for a list of URLs
export async function getPageContents(urls: string[]): Promise<ExaResult[]> {
  const response = await post<SearchResponse>('/contents', {
    urls,
    text: { maxCharacters: 6000 },
    maxAgeHours: 24,
  });
  return response.results;
}

// Search for key people at a facility using Exa's people index
export async function searchContacts(facilityName: string, location: string): Promise<ExaResult[]> {
  const allResults: ExaResult[] = [];

  // People index — finds LinkedIn profiles, bios, team pages
  const peopleResponse = await post<SearchResponse>('/search', {
    query: `${facilityName} ${location} clinical director executive director CEO`,
    numResults: 8,
    type: 'auto',
    category: 'people',
    contents: {
      highlights: { maxCharacters: 2000 },
    },
  });
  allResults.push(...peopleResponse.results);

  // Company search — finds the facility's own site, about/team pages
  const companyResponse = await post<SearchResponse>('/search', {
    query: `${facilityName} ${location} leadership team staff`,
    numResults: 5,
    type: 'auto',
    contents: {
      highlights: { maxCharacters: 2000 },
    },
  });
  allResults.push(...companyResponse.results);

  // Deduplicate by URL
  const seen = new Set<string>();
  return allResults.filter((r) => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });
}
