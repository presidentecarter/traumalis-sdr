import { callClaude } from '../lib/claude.js';
import { log } from '../lib/logger.js';
import {
  readFile,
  writeFile,
  setupGitIdentity,
  commitAndPush,
  isRunningInRepo,
  PROTECTED_FILES,
} from '../lib/git.js';
import {
  buildApplyFeedbackPrompt,
} from '../prompts/interpret-feedback.js';
import type { OwnerFeedback } from './parse-feedback.js';

export interface EditResult {
  feedbackSummary: string;
  filesChanged: string[];
  committed: boolean;
  error?: string;
}

export async function applySelfEdits(feedbackItems: OwnerFeedback[]): Promise<EditResult[]> {
  if (!isRunningInRepo()) {
    log('warn', 'self-edit', 'Not running inside a git repo — skipping self-edit');
    return [];
  }

  const results: EditResult[] = [];

  for (const { detection } of feedbackItems) {
    const result: EditResult = {
      feedbackSummary: detection.summary,
      filesChanged: [],
      committed: false,
    };

    try {
      // Filter out any protected files that somehow slipped through
      const editableTargets = detection.target_files.filter((f) => {
        if (PROTECTED_FILES.has(f)) {
          log('warn', 'self-edit', `Skipping protected file: ${f}`);
          return false;
        }
        return true;
      });

      for (const filePath of editableTargets) {
        log('info', 'self-edit', `Applying feedback to ${filePath}`);

        let currentContent: string;
        try {
          currentContent = readFile(filePath);
        } catch {
          log('warn', 'self-edit', `Could not read ${filePath}, skipping`);
          continue;
        }

        const newContent = await callClaude(
          'You are an AI agent improving your own configuration files based on owner feedback. Output only the new file content, nothing else.',
          buildApplyFeedbackPrompt({
            feedbackSummary: detection.summary,
            filePath,
            currentContent,
          }),
          { maxTokens: 2048, temperature: 0.3 }
        );

        writeFile(filePath, newContent);
        result.filesChanged.push(filePath);
      }

      if (result.filesChanged.length > 0) {
        setupGitIdentity();
        const commitMsg = `self-improvement: ${detection.summary} [${new Date().toISOString().split('T')[0]}]`;
        result.committed = commitAndPush(commitMsg);
        log('info', 'self-edit', `Changes committed: ${result.committed}`);
      }
    } catch (err) {
      result.error = String(err);
      log('error', 'self-edit', `Failed to apply feedback`, { error: result.error });
    }

    results.push(result);
  }

  return results;
}
