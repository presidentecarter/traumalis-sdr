import { sendMessage } from '../lib/agentmail.js';
import { getTokenUsage } from '../lib/claude.js';
import { log } from '../lib/logger.js';
import { elapsedMs } from '../lib/timer.js';
import type { Prospect } from './research.js';
import type { EditResult } from './self-edit.js';

function formatContact(c: { name: string; title: string; email: string | null; phone: string | null; linkedin: string | null; bio: string | null }): string {
  const lines = [`  ${c.name} — ${c.title}`];
  if (c.email) lines.push(`  Email: ${c.email}`);
  if (c.phone) lines.push(`  Phone: ${c.phone}`);
  if (c.linkedin) lines.push(`  LinkedIn: ${c.linkedin}`);
  if (c.bio) lines.push(`  Bio: ${c.bio}`);
  return lines.join('\n');
}

export async function sendReport(
  inboxId: string,
  ownerEmail: string,
  prospects: Prospect[],
  editResults: EditResult[] = []
): Promise<void> {
  const tokens = getTokenUsage();
  const elapsed = Math.round(elapsedMs() / 1000);
  const committed = editResults.filter((e) => e.committed);

  const lines: string[] = [
    `Traumalis SDR Research Report`,
    `==============================`,
    ``,
    `Run time: ${elapsed}s`,
    `Prospects found: ${prospects.length}`,
    `Tokens used: ${tokens.input} in / ${tokens.output} out`,
    ``,
  ];

  if (prospects.length > 0) {
    lines.push(`====== PROSPECTS ======`);
    lines.push('');

    for (let i = 0; i < prospects.length; i++) {
      const { evaluation: e, contacts, sourceUrl } = prospects[i];

      lines.push(`${i + 1}. ${e.facility_name}`);
      lines.push(`   Location: ${e.location}`);
      lines.push(`   Why: ${e.reason}`);
      lines.push(`   Innovative: ${e.is_innovative ? 'Yes' : 'No'}`);
      if (e.website_url) lines.push(`   Website: ${e.website_url}`);
      lines.push(`   Source: ${sourceUrl}`);

      if (contacts.length > 0) {
        lines.push(`   Contacts (${contacts.length}):`);
        for (const c of contacts) {
          lines.push(formatContact(c));
        }
      } else {
        lines.push(`   Contacts: none found`);
      }

      lines.push('');
    }
  } else {
    lines.push(`No prospects found in this run.`);
    lines.push('');
  }

  if (editResults.length > 0) {
    lines.push(`====== SELF-IMPROVEMENTS ======`);
    for (const e of editResults) {
      if (e.committed) {
        lines.push(`✓ ${e.feedbackSummary}`);
        lines.push(`  Files: ${e.filesChanged.join(', ')}`);
      } else if (e.error) {
        lines.push(`✗ Failed: ${e.feedbackSummary} — ${e.error}`);
      }
    }
    if (committed.length > 0) {
      lines.push('');
      lines.push(`Changes committed to GitHub. Next run uses updated files.`);
    }
    lines.push('');
  }

  lines.push(`Reply to this email with feedback and I'll apply it in the next run.`);

  await sendMessage(inboxId, {
    to: [ownerEmail],
    subject: `SDR Research — ${new Date().toISOString().split('T')[0]} (${prospects.length} prospects)`,
    text: lines.join('\n'),
  });

  log('info', 'report', `Report sent — ${prospects.length} prospects`);
}
