import { BUYOUT_CHECKOUT_ENABLED, FREE_DAILY_BULK_LIMIT } from './constants.js';

export const CONTACT_CTA_LABEL = '有问题请联系我';
export const CONTACT_HANDLE = '珊哥爱读书';
export const CONTACT_URL =
  'https://www.xiaohongshu.com/search_result?keyword=' + encodeURIComponent(CONTACT_HANDLE);
export const BUYOUT_PLACEHOLDER_LABEL = '一次性买断（即将上线）';
export function emptyHistoryMessage(platform) {
  if (platform === 'grok') {
    return '未找到对话列表，请在 grok.com 对话页打开。No conversation list found. Open a grok.com chat.';
  }
  if (platform === 'gemini') {
    return '未找到对话列表，请在 gemini.google.com 对话页打开。No conversation list found. Open a gemini.google.com chat.';
  }
  return '未找到对话列表，请在 grok.com 或 gemini.google.com 的对话页打开。No conversation list found. Open a chat on grok.com or gemini.google.com.';
}
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

export function historyListState(items, platform) {
  if (!items || items.length === 0) {
    return { empty: true, message: emptyHistoryMessage(platform) };
  }
  return { empty: false, message: '' };
}
