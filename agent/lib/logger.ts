type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<Level, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const minLevel: Level = (process.env.LOG_LEVEL as Level) || 'info';

export function log(
  level: Level,
  component: string,
  message: string,
  meta?: Record<string, unknown>
) {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[minLevel]) return;

  const entry = {
    ts: new Date().toISOString(),
    level,
    component,
    message,
    ...meta,
  };
  console.log(JSON.stringify(entry));
}
