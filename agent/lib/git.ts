import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { log } from './logger.js';

// Files the agent can NEVER edit via feedback — core infrastructure
export const PROTECTED_FILES = new Set([
  'agent/soul.md',
  'agent/main.ts',
  'agent/lib/git.ts',
  'agent/lib/claude.ts',
  'agent/lib/agentmail.ts',
  'agent/lib/timer.ts',
  'agent/lib/logger.ts',
  'api/cron.ts',
  'index.ts',
  'vercel.json',
  'package.json',
]);

// Files the agent can freely edit via owner feedback
export const EDITABLE_FILES = [
  'agent/working-files/approach.md',
  'agent/working-files/search-queries.md',
  'agent/prompts/evaluate-clinic.ts',
  'agent/prompts/extract-contacts.ts',
  'agent/prompts/interpret-feedback.ts',
];

function exec(cmd: string): string {
  return execSync(cmd, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
}

export function isRunningInRepo(): boolean {
  try {
    exec('git rev-parse --git-dir');
    return true;
  } catch {
    return false;
  }
}

export function setupGitIdentity() {
  exec('git config user.email "sdr-agent@traumalis.com"');
  exec('git config user.name "Traumalis SDR Agent"');
  log('info', 'git', 'Git identity configured');
}

export function gitStatus(): string {
  return exec('git status --porcelain').trim();
}

export function readFile(relativePath: string): string {
  return readFileSync(relativePath, 'utf-8');
}

export function writeFile(relativePath: string, content: string) {
  if (PROTECTED_FILES.has(relativePath)) {
    throw new Error(`Cannot edit protected file: ${relativePath}`);
  }
  writeFileSync(relativePath, content, 'utf-8');
  log('info', 'git', `Edited file: ${relativePath}`);
}

export function commitAndPush(message: string): boolean {
  const status = gitStatus();
  if (!status) {
    log('info', 'git', 'No changes to commit');
    return false;
  }

  exec('git add -A');
  exec(`git commit -m "${message.replace(/"/g, '\\"')}"`);
  exec('git push');
  log('info', 'git', `Committed and pushed: ${message}`);
  return true;
}
