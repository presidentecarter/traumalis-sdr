import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { searchClinics, getPageContents, searchContacts } from '../lib/exa.js';
import { callClaude } from '../lib/claude.js';
import { log } from '../lib/logger.js';
import { hasTimeFor } from '../lib/timer.js';
import {
  buildEvaluateClinicPrompt,
  parseClinicEvaluation,
  type ClinicEvaluation,
} from '../prompts/evaluate-clinic.js';
import {
  buildExtractContactsPrompt,
  parseContacts,
  type Contact,
} from '../prompts/extract-contacts.js';
import type { ExaResult } from '../lib/exa.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface Prospect {
  sourceUrl: string;
  evaluation: ClinicEvaluation;
  contacts: Contact[];
}

function loadSeenUrls(): Set<string> {
  const seenPath = resolve(__dirname, '..', 'working-files', 'prospects-seen.json');
  try {
    const data = JSON.parse(readFileSync(seenPath, 'utf-8')) as { urls: string[] };
    return new Set(data.urls);
  } catch {
    return new Set();
  }
}

function saveSeenUrls(seen: Set<string>) {
  const seenPath = resolve(__dirname, '..', 'working-files', 'prospects-seen.json');
  writeFileSync(seenPath, JSON.stringify({ urls: [...seen] }, null, 2));
}

function loadSearchQueries(): string[] {
  const queriesPath = resolve(__dirname, '..', 'working-files', 'search-queries.md');
  const content = readFileSync(queriesPath, 'utf-8');

  // Extract lines under "## Active Queries"
  const activeSection = content.split('## Active Queries')[1]?.split('##')[0] || '';
  return activeSection
    .split('\n')
    .map((l) => l.replace(/^-\s*/, '').trim())
    .filter((l) => l.length > 0);
}

async function deduplicateResults(results: ExaResult[]): Promise<ExaResult[]> {
  const seen = new Set<string>();
  return results.filter((r) => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });
}

async function evaluateResult(result: ExaResult): Promise<ClinicEvaluation | null> {
  try {
    const response = await callClaude(
      'You are evaluating search results to find good sales prospects for a mental health technology company.',
      buildEvaluateClinicPrompt(result),
      { maxTokens: 512, temperature: 0.2 }
    );
    return parseClinicEvaluation(response);
  } catch (err) {
    log('warn', 'research', `Failed to evaluate ${result.url}`, { error: String(err) });
    return null;
  }
}

async function enrichWithContacts(
  evaluation: ClinicEvaluation,
  sourceUrl: string
): Promise<Prospect> {
  const prospect: Prospect = { sourceUrl, evaluation, contacts: [] };

  try {
    // Search for contacts using Exa
    const contactResults = await searchContacts(evaluation.facility_name, evaluation.location);

    // Also fetch the facility's own website if we have it
    const urlsToFetch = contactResults.map((r) => r.url);
    if (evaluation.website_url && !urlsToFetch.includes(evaluation.website_url)) {
      urlsToFetch.push(evaluation.website_url);
    }

    // Get page contents for the contact pages
    const contents = urlsToFetch.length > 0 ? await getPageContents(urlsToFetch.slice(0, 5)) : [];

    // Extract contacts with Claude
    if (contents.length > 0) {
      const response = await callClaude(
        'You are extracting contact information for sales research.',
        buildExtractContactsPrompt(contents, evaluation.facility_name),
        { maxTokens: 1024, temperature: 0.2 }
      );
      const result = parseContacts(response);
      prospect.contacts = result.contacts;
    }
  } catch (err) {
    log('warn', 'research', `Failed to find contacts for ${evaluation.facility_name}`, {
      error: String(err),
    });
  }

  return prospect;
}

export async function runResearch(): Promise<Prospect[]> {
  const queries = loadSearchQueries();
  const seenUrls = loadSeenUrls();
  log('info', 'research', `Running ${queries.length} search queries (${seenUrls.size} URLs already seen)`);

  // Step 1: Search
  const allResults: ExaResult[] = [];
  for (const query of queries) {
    if (!hasTimeFor(30)) {
      log('warn', 'research', 'Low on time, stopping search phase early');
      break;
    }
    try {
      const results = await searchClinics(query, 8);
      allResults.push(...results);
    } catch (err) {
      log('warn', 'research', `Search failed for query: ${query}`, { error: String(err) });
    }
  }

  const unique = await deduplicateResults(allResults);
  const unseen = unique.filter((r) => !seenUrls.has(r.url));
  log('info', 'research', `${unique.length} unique results, ${unseen.length} not yet seen`);

  // Step 2: Evaluate each unseen result
  const prospects: Prospect[] = [];
  for (const result of unseen) {
    if (!hasTimeFor(60)) {
      log('warn', 'research', 'Low on time, stopping evaluation phase early');
      break;
    }

    const evaluation = await evaluateResult(result);
    if (!evaluation || !evaluation.is_prospect) continue;
    if (evaluation.is_nonprofit) continue;

    log('info', 'research', `Prospect found: ${evaluation.facility_name} — ${evaluation.location}`);

    // Step 3: Enrich with contacts
    if (hasTimeFor(90)) {
      const prospect = await enrichWithContacts(evaluation, result.url);
      prospects.push(prospect);
    } else {
      prospects.push({ sourceUrl: result.url, evaluation, contacts: [] });
    }
  }

  // Persist all evaluated URLs so we don't re-process them next run
  for (const result of unseen) seenUrls.add(result.url);
  saveSeenUrls(seenUrls);

  log('info', 'research', `Research complete: ${prospects.length} prospects found`);
  return prospects;
}
