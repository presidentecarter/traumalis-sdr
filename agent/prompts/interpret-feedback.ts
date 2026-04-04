export function buildDetectFeedbackPrompt(email: {
  from: string;
  subject: string;
  text: string;
}): string {
  return `You are reviewing an email from the SDR agent's owner. Determine if it contains actionable feedback to improve how the agent works.

From: ${email.from}
Subject: ${email.subject}
Body:
${email.text}

Feedback means: instructions to change how the agent responds, what it does, how it writes, what it prioritizes, etc.
NOT feedback: general replies, questions, thank-yous, random conversation.

Respond with ONLY valid JSON:
{
  "is_feedback": true | false,
  "summary": "one sentence describing what the owner wants changed, or empty string if not feedback",
  "target_files": ["agent/working-files/approach.md", "agent/prompts/draft-reply.ts"] // which files likely need changing
}

Only include files from this list in target_files:
- agent/working-files/approach.md
- agent/prompts/classify-email.ts
- agent/prompts/draft-reply.ts
- agent/prompts/system.ts`;
}

export interface FeedbackDetection {
  is_feedback: boolean;
  summary: string;
  target_files: string[];
}

export function parseFeedbackDetection(response: string): FeedbackDetection {
  const match = response.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in feedback detection response');
  return JSON.parse(match[0]) as FeedbackDetection;
}

export function buildApplyFeedbackPrompt(opts: {
  feedbackSummary: string;
  filePath: string;
  currentContent: string;
}): string {
  return `You are improving an AI agent's configuration file based on feedback from its owner.

Owner's feedback: ${opts.feedbackSummary}

File to update: ${opts.filePath}

Current content:
\`\`\`
${opts.currentContent}
\`\`\`

Rewrite this file to incorporate the owner's feedback. Return ONLY the new file content — no explanation, no markdown fences, just the raw file content exactly as it should be written to disk.`;
}
