const startTime = Date.now();
let budgetMs = 40 * 60 * 1000; // 40 minutes default

export function setBudget(ms: number) {
  budgetMs = ms;
}

export function elapsedMs(): number {
  return Date.now() - startTime;
}

export function remainingMs(): number {
  return Math.max(0, budgetMs - elapsedMs());
}

export function hasTimeFor(estimatedSeconds: number): boolean {
  return remainingMs() > estimatedSeconds * 1000;
}
