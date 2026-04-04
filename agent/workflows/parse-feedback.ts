import { listMessages, type Message } from '../lib/agentmail.js';
import { callClaude } from '../lib/claude.js';
import { log } from '../lib/logger.js';
import {
  buildDetectFeedbackPrompt,
  parseFeedbackDetection,
  type FeedbackDetection,
} from '../prompts/interpret-feedback.js';

export interface OwnerFeedback {
  message: Message;
  detection: FeedbackDetection;
}

export async function parseFeedbackFromOwner(
  inboxId: string,
  ownerEmail: string
): Promise<OwnerFeedback[]> {
  log('info', 'parse-feedback', 'Checking for owner feedback');

  const response = await listMessages(inboxId, { limit: 50 });
  // Handle both { data: [...] } and direct array responses from API
  const messages = Array.isArray(response) ? response : response.data || [];
  const ownerMessages = messages.filter((m) => m.from === ownerEmail);

  if (ownerMessages.length === 0) {
    log('info', 'parse-feedback', 'No messages from owner');
    return [];
  }

  log('info', 'parse-feedback', `Found ${ownerMessages.length} messages from owner, checking for feedback`);

  const feedbackItems: OwnerFeedback[] = [];

  for (const message of ownerMessages) {
    const emailText = message.extracted_text || message.text;

    const raw = await callClaude(
      'You are an assistant that determines whether an email contains actionable feedback for an AI agent.',
      buildDetectFeedbackPrompt({
        from: message.from,
        subject: message.subject,
        text: emailText,
      }),
      { maxTokens: 512, temperature: 0.2 }
    );

    const detection = parseFeedbackDetection(raw);

    if (detection.is_feedback) {
      log('info', 'parse-feedback', `Feedback detected: "${detection.summary}"`);
      feedbackItems.push({ message, detection });
    }
  }

  log('info', 'parse-feedback', `${feedbackItems.length} actionable feedback items found`);
  return feedbackItems;
}
