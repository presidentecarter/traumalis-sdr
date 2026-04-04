import type { ExaResult } from '../lib/exa.js';

export function buildEvaluateClinicPrompt(result: ExaResult): string {
  return `Evaluate whether this search result describes a good sales prospect for Traumalis — a company that sells technology to mental health and behavioral health treatment centers.

Title: ${result.title}
URL: ${result.url}
Published: ${result.publishedDate || 'unknown'}
Summary: ${result.summary || 'none'}
Highlights:
${result.highlights?.join('\n') || 'none'}

Evaluate on these criteria:
- Is this about a NEW clinic opening, expanding, or being established in the US?
- Is it FOR-PROFIT / PRIVATE (not a nonprofit, not government-run, not a community health center)?
- Does it seem "innovative" — new approaches, premium care, technology, evidence-based treatment, upscale facilities?
- Is it a mental health, behavioral health, trauma, or addiction treatment center?

Respond with ONLY valid JSON:
{
  "is_prospect": true | false,
  "facility_name": "Name of the facility",
  "location": "City, State",
  "is_nonprofit": true | false,
  "is_innovative": true | false,
  "is_new_or_expanding": true | false,
  "reason": "one sentence explaining your decision",
  "website_url": "the facility's own website if you can infer it, or null"
}`;
}

export interface ClinicEvaluation {
  is_prospect: boolean;
  facility_name: string;
  location: string;
  is_nonprofit: boolean;
  is_innovative: boolean;
  is_new_or_expanding: boolean;
  reason: string;
  website_url: string | null;
}

export function parseClinicEvaluation(response: string): ClinicEvaluation {
  const match = response.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in clinic evaluation response');
  return JSON.parse(match[0]) as ClinicEvaluation;
}
