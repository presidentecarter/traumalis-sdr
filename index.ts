import { config } from 'dotenv';
config({ path: '.env.local' });

import { Sandbox } from '@vercel/sandbox';
import ms from 'ms';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface BundledFile {
  path: string;
  content: string;
}

function collectFiles(dir: string, base: string): BundledFile[] {
  const files: BundledFile[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...collectFiles(fullPath, base));
    } else {
      files.push({ path: relative(base, fullPath), content: readFileSync(fullPath, 'utf-8') });
    }
  }
  return files;
}

async function main() {
  const agentDir = join(__dirname, 'agent');
  const agentFiles = collectFiles(agentDir, agentDir);
  console.log(`Collected ${agentFiles.length} agent files`);

  console.log('Creating sandbox...');
  const sandbox = await Sandbox.create({
    runtime: 'node22',
    timeout: ms('40m'),
    resources: { vcpus: 2 },
  });
  console.log(`Sandbox: ${sandbox.sandboxId}`);

  try {
    // Write agent files
    console.log('Installing agent directions')
    await sandbox.writeFiles(
      agentFiles.map((f) => ({
        path: `/vercel/sandbox/agent/${f.path}`,
        content: Buffer.from(f.content),
      }))
    );
    console.log('agent directions written')

    // Install tsx
    console.log('Installing tsx...');
    const installResult = await sandbox.runCommand({
      cmd: 'npm',
      args: ['install', '-g', 'tsx'],
      env: { NPM_CONFIG_UPDATE_NOTIFIER: 'false'},
      stderr: process.stderr,
      stdout: process.stdout,
      sudo: true,
    });
    if (installResult.exitCode !== 0) throw new Error('tsx install failed');

    // Run the agent — in local dev mode git commits are skipped (not in a repo)
    console.log('\n--- Agent Starting ---\n');
    const result = await sandbox.runCommand({
      cmd: 'tsx',
      args: ['agent/main.ts'],
      env: {
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
        AGENTMAIL_API_KEY: process.env.AGENTMAIL_API_KEY || '',
        OWNER_EMAIL: process.env.OWNER_EMAIL || '',
        AGENTMAIL_INBOX_ID: process.env.AGENTMAIL_INBOX_ID || '',
        EXA_API_KEY: process.env.EXA_API_KEY || '',
        LOG_LEVEL: 'debug',
      },
      stderr: process.stderr,
      stdout: process.stdout,
    });

    console.log(`\n--- Agent Finished (exit: ${result.exitCode}) ---`);
  } finally {
    await sandbox.stop();
    console.log('Sandbox stopped');
  }
}

main().catch(console.error);
