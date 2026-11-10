import assert from 'node:assert/strict';
import test from 'node:test';
import { createBulkJob, recordExtracted, assignUniqueMarkdownNames } from '../src/lib/bulk.js';
import { FREE_DAILY_BULK_LIMIT, BUYOUT_CHECKOUT_ENABLED, BUYOUT_STUB_CODE } from '../src/lib/constants.js';
import { blockedBulkCopy, buyoutPlaceholder, historyListState, quotaLabel } from '../src/lib/copy.js';
import { describeLicense, isValidBuyoutCode } from '../src/lib/license.js';
import { markdownFilename } from '../src/lib/filename.js';
import { evaluateBulkAccess, nextUsage } from '../src/lib/quota.js';

test('free bulk allows 3 tasks and blocks the 4th until the next local day', () => {
  assert.equal(FREE_DAILY_BULK_LIMIT, 3);
  let usage = null;
  const today = '2026-11-10';
  for (let i = 0; i < 3; i += 1) {
    const gate = evaluateBulkAccess({ usage, today, licensed: false });
    assert.equal(gate.allowed, true);
    assert.equal(gate.remaining, 3 - i);
    usage = nextUsage(usage, today);
  }
  const blocked = evaluateBulkAccess({ usage, today, licensed: false });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.equal(quotaLabel(blocked), '今日剩余批量次数：0');
  const tomorrow = evaluateBulkAccess({ usage, today: '2026-11-11', licensed: false });
  assert.equal(tomorrow.allowed, true);
  assert.equal(tomorrow.remaining, 3);
});

test('valid stub removes the cap and invalid or empty codes stay on the free tier', () => {
  const usage = { date: '2026-11-10', count: 3 };
  const licensed = evaluateBulkAccess({ usage, today: '2026-11-10', licensed: true });
  assert.equal(licensed.allowed, true);
  assert.equal(quotaLabel(licensed), '本地买断已生效，批量不限次');
  assert.equal(isValidBuyoutCode('ace-local-0001'), true);
  assert.equal(isValidBuyoutCode(BUYOUT_STUB_CODE), true);
  assert.equal(isValidBuyoutCode('ACE-LOCAL-0002'), false);
  assert.equal(isValidBuyoutCode(''), false);
  assert.equal(describeLicense('ACE-LOCAL-0002').active, false);
  assert.match(describeLicense('ACE-LOCAL-0002').message, /免费档/);
  assert.equal(describeLicense('').active, false);
  assert.equal(describeLicense(' ace-local-0001 ').active, true);
  const blocked = evaluateBulkAccess({
    usage,
    today: '2026-11-10',
    licensed: isValidBuyoutCode('nope'),
  });
  assert.equal(blocked.allowed, false);
});

test('cap copy points at Xiaohongshu and has no buyout link', () => {
  assert.equal(BUYOUT_CHECKOUT_ENABLED, false);
  const buyout = buyoutPlaceholder();
  assert.equal(buyout.href, null);
  assert.equal(buyout.label, '一次性买断（即将上线）');
  const copy = blockedBulkCopy();
  assert.equal(copy.ctaLabel, '有问题请联系我');
  assert.equal(copy.handle, '珊哥爱读书');
  assert.equal(copy.buyoutHref, null);
  assert.match(copy.ctaHref, /^https:\/\/www\.xiaohongshu\.com\/search_result\?keyword=/);
  assert.match(copy.title, /上限 3 次/);
});

test('bulk job needs two visible chats and walks them in order', () => {
  assert.equal(createBulkJob({ platform: 'grok', queue: [{ url: 'https://grok.com/c/a' }] }).ok, false);
  const created = createBulkJob({
    platform: 'gemini',
    queue: [
      { id: 'a', title: '甲', url: 'https://gemini.google.com/app/aaaaaaaa' },
      { id: 'b', title: '乙', url: 'https://gemini.google.com/app/bbbbbbbb' },
    ],
  });
  assert.equal(created.ok, true);
  const mid = recordExtracted(created.job, { filename: 'gemini-甲.md', markdown: '# 甲\n' });
  assert.equal(mid.done, false);
  assert.equal(mid.index, 1);
  const done = recordExtracted(mid, { filename: 'gemini-甲.md', markdown: '# 乙\n' });
  assert.equal(done.done, true);
  const named = assignUniqueMarkdownNames(done.files);
  assert.deepEqual(
    named.map((file) => file.filename),
    ['gemini-甲.md', 'gemini-甲-2.md'],
  );
});

test('empty visible history tells the user to open a chat page', () => {
  const grok = historyListState([], 'grok');
  assert.equal(grok.empty, true);
  assert.match(grok.message, /未找到对话列表，请在 grok.com 对话页打开/);
  assert.match(grok.message, /No conversation list found\. Open a grok.com chat\./);
  const gemini = historyListState([], 'gemini');
  assert.match(gemini.message, /gemini\.google\.com/);
  assert.match(gemini.message, /No conversation list found/);
});

test('filenames drop path characters', () => {
  assert.equal(markdownFilename('grok', 'a/b:c', ''), 'grok-a b c.md');
  assert.equal(markdownFilename('gemini', '', ''), 'gemini-未命名.md');
});
