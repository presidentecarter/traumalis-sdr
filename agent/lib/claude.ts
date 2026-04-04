import { log } from './logger.js';

const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';
const MAX_RETRIES = 3;

interface CallOptions {
  maxTokens?: number;
  temperature?: number;
}

interface ApiResponse {
  content: Array<{ type: string; text: string }>;
  usage: { input_tokens: number; output_tokens: number };
}

let totalInputTokens = 0;
let totalOutputTokens = 0;

export function getTokenUsage() {
  return { input: totalInputTokens, output: totalOutputTokens };
}

export async function callClaude(
  system: string,
  user: string,
  opts: CallOptions = {}
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const { maxTokens = 1024, temperature = 0.7 } = opts;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: maxTokens,
          temperature,
          system,
          messages: [{ role: 'user', content: user }],
        }),
      });

      if (res.status === 429 || res.status >= 500) {
        const delay = Math.pow(2, attempt) * 1000;
        log('warn', 'claude', `Retryable error ${res.status}, waiting ${delay}ms`, { attempt });
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Claude API error ${res.status}: ${body}`);
      }

      const data = (await res.json()) as ApiResponse;
      totalInputTokens += data.usage.input_tokens;
      totalOutputTokens += data.usage.output_tokens;

      log('debug', 'claude', 'API call complete', {
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
      });

      const text = data.content.find((c) => c.type === 'text')?.text;
      if (!text) throw new Error('No text in Claude response');
      return text;
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err;
      const delay = Math.pow(2, attempt) * 1000;
      log('warn', 'claude', `Error on attempt ${attempt}, retrying in ${delay}ms`, {
        error: String(err),
      });
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw new Error('Exhausted retries calling Claude');
}
