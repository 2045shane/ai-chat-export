import { BUYOUT_CHECKOUT_ENABLED, FREE_DAILY_BULK_LIMIT } from './constants.js';

export const CONTACT_CTA_LABEL = '有问题请联系我';
export const CONTACT_HANDLE = '珊哥爱读书';
export const CONTACT_URL =
  'https://www.xiaohongshu.com/search_result?keyword=' + encodeURIComponent(CONTACT_HANDLE);
export const BUYOUT_PLACEHOLDER_LABEL = '一次性买断（即将上线）';
export const EMPTY_HISTORY_MESSAGE = '当前页面没有可见的历史对话';
export const NEED_TWO_MESSAGE = '请至少勾选 2 条可见对话';

export function buyoutPlaceholder() {
  if (BUYOUT_CHECKOUT_ENABLED) {
    throw new Error('BUYOUT_CHECKOUT_ENABLED must stay false');
  }
  return { label: BUYOUT_PLACEHOLDER_LABEL, href: null };
}

export function blockedBulkCopy() {
  const buyout = buyoutPlaceholder();
  return {
    title: `今日批量次数已用完（上限 ${FREE_DAILY_BULK_LIMIT} 次）`,
    ctaLabel: CONTACT_CTA_LABEL,
    ctaHref: CONTACT_URL,
    handle: CONTACT_HANDLE,
    buyout: buyout.label,
    buyoutHref: buyout.href,
  };
}

export function quotaLabel(gate) {
  if (gate.licensed) return '本地买断已生效，批量不限次';
  return `今日剩余批量次数：${gate.remaining}`;
}

export function historyListState(items) {
  if (!items || items.length === 0) {
    return { empty: true, message: EMPTY_HISTORY_MESSAGE };
  }
  return { empty: false, message: '' };
}
