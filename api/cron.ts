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
  const githubRepo = process.env.GITHUB_REPO;

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

    // Fire-and-forget: install tsx, clone repo, install deps, run agent
    const script = [
      'npm install -g tsx',
      `git clone https://$GITHUB_TOKEN@github.com/$GITHUB_REPO.git ${REPO_PATH}`,
      `cd ${REPO_PATH} && pnpm install --frozen-lockfile`,
      `cd ${REPO_PATH} && tsx agent/main.ts`,
    ].join(' && ');

    sandbox.runCommand({
      cmd: 'bash',
      args: ['-c', script],
      env: {
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
        AGENTMAIL_API_KEY: process.env.AGENTMAIL_API_KEY || '',
        OWNER_EMAIL: process.env.OWNER_EMAIL || '',
        AGENTMAIL_INBOX_ID: process.env.AGENTMAIL_INBOX_ID || '',
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
