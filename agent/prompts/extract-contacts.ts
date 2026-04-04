import type { ExaResult } from '../lib/exa.js';

export function buildExtractContactsPrompt(results: ExaResult[], facilityName: string): string {
  const content = results
    .map((r) => `URL: ${r.url}\n${r.highlights?.join('\n') || r.summary || ''}`)
    .join('\n\n---\n\n');

  return `Extract key contacts at "${facilityName}" from the following search results. Focus on decision-makers: CEO, Executive Director, Clinical Director, VP of Business Development, Chief Medical Officer, or similar senior roles.

${content}

Respond with ONLY valid JSON:
{
  "contacts": [
    {
      "name": "Full Name",
      "title": "Job Title",
      "email": "email@example.com or null",
      "phone": "phone number or null",
      "linkedin": "LinkedIn URL or null",
      "bio": "1-2 sentence bio or background if available"
    }
  ]
}

If no contacts are found, return { "contacts": [] }.`;
}

export interface Contact {
  name: string;
  title: string;
  email: string | null;
  phone: string | null;
  linkedin: string | null;
  bio: string | null;
}

export interface ContactsResult {
  contacts: Contact[];
}

export function parseContacts(response: string): ContactsResult {
  const match = response.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in contacts response');
  return JSON.parse(match[0]) as ContactsResult;
}
