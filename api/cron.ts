import { Sandbox } from '@vercel/sandbox';
import ms from 'ms';

const REPO_PATH = '/vercel/sandbox/repo';

export default async function handler(request: any) {
  const rawHeaders = request.headers as any;
  const userAgent = (typeof rawHeaders.get === 'function'
    ? rawHeaders.get('user-agent')
    : rawHeaders['user-agent']) || '';
  if (!userAgent.includes('vercel-cron') && process.env.NODE_ENV === 'production') {
    return new Response('Unauthorized', { status: 401 });
  }

  const githubToken = process.env.GITHUB_TOKEN;
  const githubRepo = process.env.GITHUB_REPO; // e.g. "presidentecarters-projects/traumalis-sdr"

  if (!githubToken || !githubRepo) {
    return new Response(
      JSON.stringify({ ok: false, error: 'GITHUB_TOKEN and GITHUB_REPO must be set' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const sandbox = await Sandbox.create({
      runtime: 'node22',
      timeout: ms('40m'),
      resources: { vcpus: 2 },
    });

    console.log(`Sandbox created: ${sandbox.sandboxId}`);

    // Install git and tsx
    const setup = await sandbox.runCommand({
      cmd: 'npm',
      args: ['install', '-g', 'tsx'],
      sudo: true,
    });

    if (setup.exitCode !== 0) {
      await sandbox.stop();
      return new Response(JSON.stringify({ ok: false, error: 'tsx install failed' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Clone the repo (token embedded in URL for auth)
    const cloneUrl = `https://${githubToken}@github.com/${githubRepo}.git`;
    const clone = await sandbox.runCommand({
      cmd: 'git',
      args: ['clone', cloneUrl, REPO_PATH],
    });

    if (clone.exitCode !== 0) {
      await sandbox.stop();
      return new Response(JSON.stringify({ ok: false, error: 'git clone failed' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    console.log(`Repo cloned to ${REPO_PATH}`);

    // Install project deps inside the cloned repo
    await sandbox.runCommand({
      cmd: 'pnpm',
      args: ['install', '--frozen-lockfile'],
      cwd: REPO_PATH,
    });

    // Fire-and-forget: start the agent
    sandbox.runCommand({
      cmd: 'tsx',
      args: ['agent/main.ts'],
      cwd: REPO_PATH,
      env: {
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
        AGENTMAIL_API_KEY: process.env.AGENTMAIL_API_KEY || '',
        OWNER_EMAIL: process.env.OWNER_EMAIL || '',
        AGENTMAIL_INBOX_ID: process.env.AGENTMAIL_INBOX_ID || '',
        // Git identity for self-commits
        GITHUB_TOKEN: githubToken,
        GITHUB_REPO: githubRepo,
      },
    });

    return new Response(
      JSON.stringify({ ok: true, sandboxId: sandbox.sandboxId, message: 'Agent started' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Cron handler error:', err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
