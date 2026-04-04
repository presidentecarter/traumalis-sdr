import { log } from './lib/logger.js';
import { hasTimeFor, elapsedMs } from './lib/timer.js';
import { runResearch, type Prospect } from './workflows/research.js';
import { parseFeedbackFromOwner, type OwnerFeedback } from './workflows/parse-feedback.js';
import { applySelfEdits, type EditResult } from './workflows/self-edit.js';
import { sendReport } from './workflows/report.js';

type Phase = 'INIT' | 'FEEDBACK' | 'SELF_EDIT' | 'RESEARCH' | 'REPORT' | 'EXIT';

async function main() {
  let phase: Phase = 'INIT';
  let prospects: Prospect[] = [];
  let feedbackItems: OwnerFeedback[] = [];
  let editResults: EditResult[] = [];

  const inboxId = process.env.AGENTMAIL_INBOX_ID;
  const ownerEmail = process.env.OWNER_EMAIL;

  if (!inboxId || !ownerEmail) {
    log('error', 'main', 'Missing required env vars: AGENTMAIL_INBOX_ID, OWNER_EMAIL');
    process.exit(1);
  }

  try {
    log('info', 'main', 'Traumalis SDR Agent starting');
    phase = 'FEEDBACK';

    // FEEDBACK — check for improvement instructions from owner first
    if (hasTimeFor(60)) {
      feedbackItems = await parseFeedbackFromOwner(inboxId, ownerEmail);
    }
    phase = 'SELF_EDIT';

    // SELF_EDIT — apply feedback, edit files, commit to GitHub before doing any work
    if (feedbackItems.length > 0 && hasTimeFor(120)) {
      editResults = await applySelfEdits(feedbackItems);
    }
    phase = 'RESEARCH';

    // RESEARCH — find new clinic prospects using the (now up-to-date) config
    if (hasTimeFor(120)) {
      prospects = await runResearch();
    } else {
      log('warn', 'main', 'Not enough time for research');
    }
    phase = 'REPORT';

    // REPORT — send findings to owner
    if (hasTimeFor(15)) {
      await sendReport(inboxId, ownerEmail, prospects, editResults);
    }

    phase = 'EXIT';
    log('info', 'main', 'Agent completed', {
      prospects: prospects.length,
      feedbackApplied: editResults.filter((e) => e.committed).length,
      elapsedMs: elapsedMs(),
    });
  } catch (err) {
    log('error', 'main', 'Fatal error', { error: String(err), phase });

    if (inboxId && ownerEmail) {
      try {
        const { sendMessage } = await import('./lib/agentmail.js');
        await sendMessage(inboxId, {
          to: [ownerEmail],
          subject: `SDR Agent Error — ${new Date().toISOString().split('T')[0]}`,
          text: `Fatal error during ${phase}:\n\n${String(err)}`,
        });
      } catch {
        log('error', 'main', 'Could not send error report');
      }
    }

    process.exit(1);
  }

  process.exit(0);
}

main();
