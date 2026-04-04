import { log } from './logger.js';

const BASE_URL = 'https://api.agentmail.to/v0';

function getHeaders(): Record<string, string> {
  const apiKey = process.env.AGENTMAIL_API_KEY;
  if (!apiKey) throw new Error('AGENTMAIL_API_KEY not set');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const url = `${BASE_URL}${path}`;
  log('debug', 'agentmail', `${method} ${path}`);

  const res = await fetch(url, {
    method,
    headers: getHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AgentMail ${method} ${path} failed ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

// Types
export interface Message {
  id: string;
  thread_id: string;
  inbox_id: string;
  from: string;
  to: string[];
  subject: string;
  text: string;
  html?: string;
  extracted_text?: string;
  extracted_html?: string;
  created_at: string;
  labels?: string[];
}

export interface Thread {
  id: string;
  inbox_id: string;
  subject: string;
  message_count: number;
  last_message_at: string;
  created_at: string;
}

interface ListResponse<T> {
  data: T[];
  page_token?: string;
}

// Inbox
export async function getInbox(inboxId: string) {
  return request<{ id: string; email: string }>('GET', `/inboxes/${inboxId}`);
}

// Messages
export async function listMessages(
  inboxId: string,
  opts: { pageToken?: string; limit?: number } = {}
): Promise<ListResponse<Message>> {
  const params = new URLSearchParams();
  if (opts.pageToken) params.set('page_token', opts.pageToken);
  if (opts.limit) params.set('limit', String(opts.limit));
  const qs = params.toString();
  return request<ListResponse<Message>>('GET', `/inboxes/${inboxId}/messages${qs ? `?${qs}` : ''}`);
}

export async function getMessage(inboxId: string, messageId: string): Promise<Message> {
  return request<Message>('GET', `/inboxes/${inboxId}/messages/${messageId}`);
}

export async function sendMessage(
  inboxId: string,
  message: { to: string[]; subject: string; text: string }
): Promise<Message> {
  // Hard safety constraint: the agent may ONLY send emails to the owner.
  const ownerEmail = process.env.OWNER_EMAIL;
  if (!ownerEmail) throw new Error('OWNER_EMAIL not set');

  const unauthorized = message.to.filter((addr) => addr !== ownerEmail);
  if (unauthorized.length > 0) {
    throw new Error(
      `BLOCKED: attempted to send email to non-owner address(es): ${unauthorized.join(', ')}`
    );
  }

  log('info', 'agentmail', `Sending to owner: ${message.subject}`);
  return request<Message>('POST', `/inboxes/${inboxId}/messages/send`, message);
}

// Threads
export async function listThreads(
  inboxId: string,
  opts: { pageToken?: string; limit?: number } = {}
): Promise<ListResponse<Thread>> {
  const params = new URLSearchParams();
  if (opts.pageToken) params.set('page_token', opts.pageToken);
  if (opts.limit) params.set('limit', String(opts.limit));
  const qs = params.toString();
  return request<ListResponse<Thread>>('GET', `/inboxes/${inboxId}/threads${qs ? `?${qs}` : ''}`);
}

export async function getThread(inboxId: string, threadId: string): Promise<Thread> {
  return request<Thread>('GET', `/inboxes/${inboxId}/threads/${threadId}`);
}

export async function getThreadMessages(
  inboxId: string,
  threadId: string
): Promise<ListResponse<Message>> {
  return request<ListResponse<Message>>(
    'GET',
    `/inboxes/${inboxId}/threads/${threadId}/messages`
  );
}
