import { FREE_DAILY_BULK_LIMIT } from './constants.js';

export function todayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function usageCount(usage, today) {
  if (!usage || usage.date !== today) return 0;
  const count = Number(usage.count);
  if (!Number.isFinite(count) || count <= 0) return 0;
  return Math.floor(count);
}

/**
 * @param {{ usage?: {date: string, count: number}|null, today: string, licensed: boolean, limit?: number }} input
 */
export function evaluateBulkAccess(input) {
  const today = input.today;
  const limit = input.limit ?? FREE_DAILY_BULK_LIMIT;
  const count = usageCount(input.usage, today);
  if (input.licensed) {
    return { allowed: true, remaining: null, licensed: true, count };
  }
  const remaining = Math.max(0, limit - count);
  return { allowed: remaining > 0, remaining, licensed: false, count };
}

export function nextUsage(usage, today) {
  return { date: today, count: usageCount(usage, today) + 1 };
}
